---
name: dom-memory-management
description: "Use when attaching event listeners, observers, or overlay nodes in the content script to prevent memory leaks, ghost DOM nodes, and dangling references across typing sessions, page navigations, and extension reloads."
user-invocable: false
---

# DOM Memory Management

## When to Use

Use this skill whenever the content script:

- attaches `addEventListener` to a host input, window, document, or overlay element
- creates a `MutationObserver`, `ResizeObserver`, or `IntersectionObserver`
- creates DOM nodes for overlays, spans, or popovers
- implements a teardown, reset, or cleanup path
- handles content script unload, element removal, or extension disable

This skill is mandatory for any code path that creates or removes DOM state. The pending-improvements log shows `index.ts` as the highest-frequency error location — the majority of those errors trace to incomplete cleanup paths.

## When Not to Use

Do not use this skill for:

- backend route handlers or SSE transport logic
- section state machine transitions (use `clause-state-management`)
- hotkey event wiring (use `hotkey-bind-commit-ux`)

## Files and Surfaces

Primary files:

- `extension/src/content/index.ts` — all listener and observer registration
- Any overlay or popover creation utility in the content script

---

## Core Rules

### Rule 1: Every `addEventListener` Needs a Paired `removeEventListener`

Store a reference to the exact function instance that was added. Anonymous inline functions cannot be removed.

```typescript
// CORRECT
const onScroll = () => syncOverlay(el);
el.addEventListener('scroll', onScroll);
cleanup.push(() => el.removeEventListener('scroll', onScroll));

// WRONG — cannot be removed
el.addEventListener('scroll', () => syncOverlay(el));
```

### Rule 2: Every Observer Must Call `.disconnect()` in Cleanup

```typescript
const ro = new ResizeObserver(onResize);
ro.observe(el);
cleanup.push(() => ro.disconnect());

const mo = new MutationObserver(onMutation);
mo.observe(document.body, { childList: true, subtree: true });
cleanup.push(() => mo.disconnect());
```

Do not rely on GC to disconnect observers. An observer holding a reference to a DOM element prevents that element from being garbage-collected.

### Rule 3: Use a Cleanup Registry Per Instrumented Element

For each instrumented input, maintain an explicit cleanup function array. Call it all at once on teardown.

```typescript
const cleanupMap = new Map<Element, Array<() => void>>();

function instrument(el: HTMLElement) {
  const fns: Array<() => void> = [];

  const onInput = debounce(() => handleInput(el), 400);
  el.addEventListener('input', onInput);
  fns.push(() => el.removeEventListener('input', onInput));

  const ro = new ResizeObserver(() => syncGeometry(el));
  ro.observe(el);
  fns.push(() => ro.disconnect());

  cleanupMap.set(el, fns);
}

function teardown(el: HTMLElement) {
  cleanupMap.get(el)?.forEach(fn => fn());
  cleanupMap.delete(el);
}
```

### Rule 4: Track All Overlay Nodes in a Registry

Never create an overlay node without immediately registering it for teardown. Orphaned overlay nodes are the primary cause of "ghost underline" bugs.

```typescript
const overlayRegistry = new Map<Element, HTMLElement>(); // host → overlay

function createOverlay(host: HTMLElement): HTMLElement {
  const overlay = document.createElement('div');
  overlay.setAttribute('data-insta-overlay', '');
  document.body.appendChild(overlay);
  overlayRegistry.set(host, overlay);
  return overlay;
}

function removeOverlay(host: HTMLElement) {
  const overlay = overlayRegistry.get(host);
  if (overlay) {
    overlay.remove();
    overlayRegistry.delete(host);
  }
}
```

### Rule 5: Use `WeakRef` for Host Element References in Long-Lived Callbacks

If a callback is registered on `window` or `document` and references a host input element, use `WeakRef` to avoid preventing GC of the host.

```typescript
const ref = new WeakRef(hostElement);
window.addEventListener('scroll', () => {
  const el = ref.deref();
  if (!el) return; // element was GC'd — skip
  syncOverlay(el);
}, { passive: true });
```

### Rule 6: Detect Element Removal and Tear Down Automatically

The `MutationObserver` watching `document.body` for new inputs must also detect input removal and call teardown.

```typescript
const bodyObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.removedNodes) {
      if (node instanceof HTMLElement) {
        // Teardown any instrumented descendant that was removed
        cleanupMap.forEach((_, el) => {
          if (node === el || node.contains(el)) teardown(el);
        });
      }
    }
  }
});
bodyObserver.observe(document.body, { childList: true, subtree: true });
```

### Rule 7: Full Teardown on Commit and Reset

After a successful commit (Enter) or a user-initiated reset (Esc with no stream), call the full teardown function — do not leave overlay nodes or listeners alive.

```typescript
function resetAll(host: HTMLElement) {
  removeOverlay(host);    // remove DOM node
  teardown(host);         // remove all listeners and observers
  sectionState.clear();   // clear in-memory state
}
```

### Rule 8: Content Script Unload Teardown

If the content script exposes a cleanup hook (WXT lifecycle or `chrome.runtime.onMessage` for unload signals), call the full teardown for all registered inputs.

```typescript
// WXT lifecycle or equivalent
export default defineContentScript({
  main() {
    // ... instrument inputs
    return () => {
      // Called on content script unload
      cleanupMap.forEach((_, el) => teardown(el));
      bodyObserver.disconnect();
    };
  }
});
```

---

## Debugging Memory Leaks

Use the Chrome DevTools Memory panel:

1. Take a heap snapshot before a full accept → bind → commit cycle.
2. Complete the cycle. Take a second snapshot.
3. Filter by `data-insta-*` in the retained objects list.
4. If retained count is non-zero after teardown, the cleanup path has a gap.

The `Event Listeners` tab in the Elements panel will also show any `scroll`, `resize`, or `input` listeners still attached to removed or committed inputs.

---

## Deliverables

- Every `addEventListener` has a matching `removeEventListener` in the cleanup path
- Every observer has `.disconnect()` in the cleanup path
- All overlay nodes are registered in an overlay registry and removed on teardown
- Element removal is detected via `MutationObserver` and triggers automatic teardown
- Commit and reset call the full teardown function
- No retained `data-insta-*` DOM nodes after a full cycle in heap snapshots
