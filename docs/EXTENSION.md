# Chrome Extension

> MV3 deep-dive: process model, content script, background service worker, state machine.

---

## Process Model (Manifest V3)

Three completely isolated JS environments. They cannot share memory — all communication goes through `chrome.runtime` message passing or `chrome.storage`.

```
CONTENT SCRIPT (per tab)
  - Reads/writes page DOM
  - Detects textarea / contenteditable inputs
  - Renders ghost text overlay + underlines
  - Handles Tab / Cmd+Enter / Esc hotkeys
  - CANNOT make cross-origin fetch (blocked by page CSP)
  ↕  chrome.runtime.connect() → Port (for streaming)
  ↕  chrome.runtime.sendMessage() (for one-shot messages)

BACKGROUND SERVICE WORKER (one shared instance)
  - Makes all fetch calls to the PromptCompiler API
  - Streams SSE responses back to content script via Port
  - Manages per-tab clause state in chrome.storage.session
  - Holds JWT in chrome.storage.session
  - Wakes on chrome.alarms keepalive every 24s (avoids 30s kill)

POPUP (spawns on icon click, dies on close)
  - React + Vite bundle
  - Mode toggle: Efficiency / Balanced / Detailed
  - Project selector (v2)
  - Account status + upgrade CTA
  - Reads/writes settings via chrome.storage.sync
```

---

## Manifest

```json
{
  "manifest_version": 3,
  "name": "PromptCompiler",
  "version": "1.0.0",
  "description": "Compile vibe-coding notes into structured AI prompts",
  "permissions": [
    "storage",
    "alarms",
    "activeTab"
  ],
  "host_permissions": [
    "https://api.promptcompiler.dev/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content_script.js"],
    "run_at": "document_idle"
  }],
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icons/icon48.png"
  }
}
```

`host_permissions` is what allows the service worker to call the API. Without it, even the SW is blocked.

---

## Content Script

### Input Detection

```typescript
// Attach to all textareas and contenteditables, including dynamically added ones
const observer = new MutationObserver(() => attachToInputs());
observer.observe(document.body, { subtree: true, childList: true });

function attachToInputs() {
  const inputs = [
    ...document.querySelectorAll('textarea'),
    ...document.querySelectorAll('[contenteditable="true"]'),
    ...document.querySelectorAll('[contenteditable="plaintext-only"]'),
  ];
  inputs.forEach(el => {
    if ((el as any).__pc_attached) return;
    (el as any).__pc_attached = true;
    el.addEventListener('input', handleInput);
    el.addEventListener('keydown', handleHotkey);
    el.addEventListener('focus', handleFocus);
    el.addEventListener('blur', handleBlur);
  });
}
```

The `__pc_attached` flag prevents double-attaching when React/Angular re-renders the same element.

### Ghost Text Rendering

Ghost text is a `position: fixed` overlay div placed at the caret position. It never touches the textarea value — it floats on top.

```typescript
// Create once, reposition on every input event
const ghostEl = document.createElement('div');
ghostEl.id = 'pc-ghost-overlay';
Object.assign(ghostEl.style, {
  position: 'fixed',
  pointerEvents: 'none',
  zIndex: '2147483647',
  color: 'rgba(128, 128, 128, 0.55)',
  whiteSpace: 'pre-wrap',
  fontFamily: 'inherit',
  fontSize: 'inherit',
  lineHeight: 'inherit',
});
document.body.appendChild(ghostEl);
```

For textarea caret position, use the `textarea-caret-position` library (npm package). For contenteditable, use `window.getSelection().getRangeAt(0).getBoundingClientRect()`.

### Underline Rendering (Mirror Overlay Technique)

You cannot style partial text inside a `<textarea>`. The solution: a mirror `<div>` positioned pixel-perfectly behind the textarea (with matching CSS) containing `<mark>` spans for each clause.

```typescript
function createMirrorEl(targetEl: HTMLTextAreaElement): HTMLDivElement {
  const mirror = document.createElement('div');
  const styles = window.getComputedStyle(targetEl);
  // Copy all relevant CSS to mirror
  ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing',
   'padding','borderWidth','width','height','overflowY','wordWrap',
   'whiteSpace','boxSizing'].forEach(prop => {
    mirror.style[prop as any] = styles[prop as any];
  });
  Object.assign(mirror.style, {
    position: 'absolute',
    top: '0', left: '0',
    pointerEvents: 'none',
    color: 'transparent',       // hide the text, show only underlines
    background: 'transparent',
    zIndex: '2147483646',
  });
  return mirror;
}

function renderUnderlines(sections: Section[]) {
  // Build HTML: each section wrapped in a colored <mark> span
  const html = sections.map(s =>
    `<mark style="
      background: transparent;
      text-decoration: underline;
      text-decoration-color: ${GOAL_TYPE_COLORS[s.goalType]};
      text-decoration-thickness: ${s.confidence >= 0.85 ? '2px' : '1px'};
      text-decoration-style: ${s.confidence >= 0.85 ? 'solid' : 'dashed'};
    ">${s.text}</mark>`
  ).join('');
  mirrorEl.innerHTML = html;
}
```

### Hotkey Handler

```typescript
function handleHotkey(e: KeyboardEvent) {
  const state = getCurrentTabState();

  // Tab — accept oldest unaccepted section
  if (e.key === 'Tab' && !e.shiftKey && state.status === 'PREVIEWING') {
    e.preventDefault();
    acceptNextSection();
    return;
  }

  // Shift+Tab — skip current section
  if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault();
    skipCurrentSection();
    return;
  }

  // Cmd+Enter — trigger binding pass
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    if (state.status === 'ACCEPTING' && state.acceptedSections.length > 0) {
      e.preventDefault();
      triggerBindingPass();
    }
    return;
  }

  // Enter — commit bound prompt to DOM
  if (e.key === 'Enter' && state.status === 'BINDING_COMPLETE') {
    e.preventDefault();
    commitToDom(state.boundPrompt);
    return;
  }

  // Esc — dismiss
  if (e.key === 'Escape') {
    dismissAll();
    return;
  }
}
```

---

## Background Service Worker

### Keepalive (Critical — MV3)

Chrome kills the SW after ~30s idle. Use alarms to wake it periodically:

```typescript
// On install
chrome.alarms.create('keepalive', { periodInMinutes: 0.4 }); // every 24s
chrome.alarms.onAlarm.addListener(() => { /* no-op wake */ });
```

### Streaming Proxy

Content scripts open a long-lived Port to stream tokens back in real time:

```typescript
const activeRequests = new Map<number, AbortController>();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'pc-stream') return;

  port.onMessage.addListener(async (msg: PortMessage) => {
    if (msg.type === 'ENHANCE') {
      const ctrl = new AbortController();
      activeRequests.set(msg.tabId, ctrl);

      try {
        const token = await getStoredToken();
        const res = await fetch('https://api.promptcompiler.dev/enhance', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(msg.payload),
          signal: ctrl.signal,
        });

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) { port.postMessage({ type: 'DONE', tabId: msg.tabId }); break; }
          port.postMessage({ type: 'TOKEN', data: decoder.decode(value), tabId: msg.tabId });
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') port.postMessage({ type: 'ERROR', tabId: msg.tabId });
      } finally {
        activeRequests.delete(msg.tabId);
      }
    }

    if (msg.type === 'CANCEL') {
      activeRequests.get(msg.tabId)?.abort();
    }
  });
});
```

### State Storage Schema

All state lives in `chrome.storage.session` (survives navigation, cleared on browser close):

```typescript
interface TabState {
  tabId: number;
  status: 'IDLE' | 'TYPING' | 'SEGMENTING' | 'PREVIEWING' | 'ACCEPTING' | 'BINDING' | 'BINDING_COMPLETE';
  rawText: string;
  sections: Section[];
  acceptedIds: string[];
  boundPrompt: string | null;
}

interface Section {
  id: string;
  text: string;
  goalType: GoalType;
  canonicalOrder: number;
  confidence: number;
  dependsOn: string[];
  expansion: string;
  status: 'idle' | 'streaming' | 'ready' | 'accepted' | 'stale';
  color: string;
}
```

---

## Popup (React)

Built with React 18 + Vite via WXT's popup entry point.

```
popup/
├── App.tsx
├── components/
│   ├── ModeToggle.tsx      # Efficiency / Balanced / Detailed pills
│   ├── ProjectSelector.tsx # Dropdown for active project (v2)
│   ├── AccountStatus.tsx   # Tier badge + daily usage meter
│   └── UpgradeCTA.tsx      # Show when free tier hits limit
└── hooks/
    └── useSettings.ts      # chrome.storage.sync r/w
```

Settings written to `chrome.storage.sync` so they persist across devices.

---

## Build Setup (WXT)

```bash
cd extension
bun install
bun run dev    # Opens Chrome with extension hot-reloaded
bun run build  # Production bundle → .output/chrome-mv3/
```

```typescript
// wxt.config.ts
import { defineConfig } from 'wxt';
export default defineConfig({
  extensionEntrypoints: {
    background: './src/background/index.ts',
    'content-scripts/main': './src/content/index.ts',
    popup: './src/popup/index.html',
  },
  vite: () => ({
    // Vite config for popup React build
  }),
});
```

---

## Known Problem Sites

| Site | Problem | Status |
|---|---|---|
| Google Docs | Canvas rendering — no DOM text | ❌ Skip v1 |
| Notion | React re-renders clobber attached listeners | ✅ Fix: MutationObserver re-attach |
| Shadow DOM inputs | `querySelector` can't pierce | ⚠️ Fallback to floating panel |
| CSP-strict enterprise apps | Inline style injection blocked | ⚠️ Fallback to floating panel |
| ChatGPT | Shadow DOM on input but pierced in content scripts | ✅ Works |