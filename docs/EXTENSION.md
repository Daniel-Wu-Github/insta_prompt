# Chrome Extension

> MV3 process boundaries plus current implementation status.

---

## Current Status (Step 0-2)

The extension is currently a bootstrap surface, not the full clause UX runtime.

- Manifest permissions: `storage`, `alarms`
- Manifest host permissions: `<all_urls>`
- Background service worker: keepalive alarm (`0.4` minutes / `24s`) only
- Content script: bootstrap registration and debug log
- Popup: React UI for mode/project controls and account CTA
- Popup settings storage: `chrome.storage.local` key `promptcompiler.settings`

Current extension files:

- `extension/src/background/index.ts`
- `extension/src/content/index.ts`
- `extension/src/popup/App.tsx`
- `extension/src/popup/hooks/useSettings.ts`

---

## Current Manifest Snapshot

```json
{
  "manifest_version": 3,
  "name": "PromptCompiler",
  "description": "Step 0 bootstrap extension surface for PromptCompiler.",
  "version": "0.1.0",
  "permissions": ["storage", "alarms"],
  "host_permissions": ["<all_urls>"]
}
```

---

## MV3 Process Boundaries (Required Architecture)

These boundaries are architectural invariants even while features are staged:

```
Content Script (per tab)
  - DOM detection, overlays, hotkeys
  - Never owns provider credentials
  - Communicates via runtime messaging/storage

Background Service Worker (shared)
  - Owns backend API calls and streaming proxy behavior
  - Owns auth/session handoff and per-tab orchestration state
  - Handles MV3 lifecycle and keepalive concerns

Popup (ephemeral UI)
  - Owns user-facing settings and account controls
  - Reads/writes extension settings storage
```

No direct provider calls from content script or popup are allowed.

---

## Target Runtime (Step 5+)

Planned Step 5+ behavior:

- Content script detects active text inputs and manages underlines/ghost text/hotkeys.
- Background service worker proxies `/segment`, `/enhance`, and `/bind` through backend APIs.
- Background streams SSE token events to content script over runtime ports.
- Tab and section state follows shared contracts (`TabStatus`, `SectionStatus`) from `shared/contracts/domain.ts`.
- `/auth/token` session exchange remains backend-mediated; extension stores only app-consumable session state.

Target storage split:

- Popup settings: `chrome.storage.local` (current) unless a future migration to sync is explicitly approved.
- Runtime tab/session state: `chrome.storage.session` (planned).

---

## Build and Run

```bash
cd extension
npm install
npm run dev
```

For WSL/manual popup loading details, use the guide in `docs/agent_plans/v1_testing_notes.md`.

---

## Source Of Truth Links

- `docs/ARCHITECTURE.md`
- `docs/UX_FLOW.md`
- `docs/CLAUSE_PIPELINE.md`
- `docs/BACKEND_API.md`