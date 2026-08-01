---
name: target-site-compat
description: "Use when the content script instruments, commits into, or reattaches on a specific target site — ChatGPT (ProseMirror), Claude.ai, Linear (SPA), Notion (virtualized blocks), or GitHub — to apply site-specific input type detection, native value setter patterns, SPA reattach, and cursor positioning rules."
user-invocable: false
---

# Target Site Compatibility

## When to Use

Use this skill when:

- implementing or debugging commit behavior on any target site in the supported matrix
- handling SPA navigation reattach (popstate, route change, DOM replacement)
- writing to React-controlled inputs (ChatGPT, Linear)
- dealing with ProseMirror or block-based editors (Claude.ai, Notion)
- cursor positioning after programmatic value commit
- detecting and skipping cross-origin iframes or shadow-DOM-hosted inputs

## When Not to Use

Do not use this skill for:

- generic textarea instrumentation without site-specific concerns
- overlay geometry or underline styling
- backend SSE or message transport

## Files and Surfaces

Primary files:

- `extension/src/content/index.ts` — input detection, commit, and reattach paths

Primary docs:

- Step 14 testing guide — target site matrix with known quirks per site

---

## Target Site Matrix

| Site | Input type | Key quirk |
|---|---|---|
| `chat.openai.com` | contenteditable (ProseMirror) | React-controlled; native value setter required |
| `claude.ai` | contenteditable | Page has its own Shadow DOM; extension shadow root must mount to `document.body` |
| `linear.app` | contenteditable | SPA with React Router; input is re-created on route change |
| `notion.so` | contenteditable (block editor) | Virtualized; only the focused block is live in the DOM |
| `github.com` | `<textarea>` | Standard; no framework control; simplest commit path |

---

## Commit Path Rules by Input Type

### Standard `<textarea>` (GitHub, simple forms)

```typescript
function commitToTextarea(el: HTMLTextAreaElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  placeCursorAtEnd(el);
}
```

### React-Controlled `<textarea>` or `contenteditable` (ChatGPT, Linear)

React overrides the native `value` setter with its own. You must use the native property descriptor to bypass React's synthetic layer.

```typescript
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype,
    'value'
  )?.set;
  nativeSetter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
```

For React-controlled contenteditable (ProseMirror at ChatGPT):

```typescript
function commitToProseMirror(el: HTMLElement, value: string) {
  el.focus();
  // Select all existing content and replace
  document.execCommand('selectAll');
  document.execCommand('insertText', false, value);
  // Fallback if execCommand is deprecated
  // Use el.textContent = value then dispatch input event
}
```

### `contenteditable` (Claude.ai, non-ProseMirror)

```typescript
function commitToContentEditable(el: HTMLElement, value: string) {
  el.textContent = value; // NEVER innerHTML
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  placeCursorAtEnd(el);
}
```

Never use `el.innerHTML = value`. This is an XSS surface and will also inject HTML formatting into the editor.

---

## Cursor Positioning After Commit

Always move the cursor to the end of the committed text. Failure to do so leaves the cursor at position 0 on many editors, confusing the user.

```typescript
function placeCursorAtEnd(el: HTMLElement | HTMLTextAreaElement) {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    el.setSelectionRange(el.value.length, el.value.length);
    return;
  }
  // contenteditable
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false); // collapse to end
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}
```

---

## SPA Navigation Reattach

Linear and other SPA apps replace inputs on route changes without a full page reload. The content script must detect this and reattach.

```typescript
// Watch for popstate (History API navigation)
window.addEventListener('popstate', () => scheduleRediscovery());

// Watch for programmatic navigation (pushState/replaceState)
const originalPushState = history.pushState.bind(history);
history.pushState = (...args) => {
  originalPushState(...args);
  scheduleRediscovery();
};

// Also detect input removal → insertion via existing MutationObserver
// (handled by dom-memory-management skill's bodyObserver)
```

`scheduleRediscovery` should debounce by ~200ms to let the SPA finish rendering the new route before scanning for inputs.

---

## Virtualized Editors (Notion)

Notion's block editor only renders the currently focused block in the DOM. Do not instrument non-focused blocks — they may be detached placeholders.

```typescript
function isLiveNotionBlock(el: HTMLElement): boolean {
  // Notion marks the active editor block with a specific attribute
  // Adjust selector to match current Notion DOM structure
  return el.closest('[data-block-id]') !== null &&
         el.getAttribute('contenteditable') === 'true';
}
```

Also: Notion re-creates the contenteditable element when switching between blocks. The MutationObserver reattach path (from `dom-memory-management`) handles this automatically — ensure teardown on removal fires correctly.

---

## Cross-Origin Frame Detection

Do not instrument inputs inside cross-origin iframes. The content script cannot safely access the page context, and attempting to do so will throw security errors.

```typescript
function isCrossOriginFrame(): boolean {
  try {
    return window.self !== window.top && window.top?.location.href !== window.location.href;
  } catch {
    return true; // Security error means cross-origin
  }
}

if (isCrossOriginFrame()) {
  // Skip all instrumentation
  return;
}
```

---

## Claude.ai Shadow DOM Coexistence

Claude.ai mounts its own Shadow DOM for the composer. The extension's shadow root must also be mounted to `document.body` — never inside Claude.ai's shadow tree.

Verify on load that the extension's shadow host is a direct child of `document.body`, not nested inside another shadow root.

---

## Deliverables

- Commit uses the correct path per input type (native setter for React, textContent for contenteditable)
- Cursor placed at end of committed text after every commit
- SPA navigation triggers rediscovery with ~200ms debounce
- Cross-origin frames are detected and skipped
- Notion instrumentation limited to the currently focused live block
- Extension shadow root mounts to `document.body` even on pages that use their own Shadow DOM
