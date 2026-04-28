# Chrome Extension

> MV3 process boundaries plus current implementation status.

---

## Current Status (Step 0-7 Mixed)

The extension is currently split between an active Step 7 background bridge and a bootstrap-level content UX layer.

- Manifest permissions: `storage`, `alarms`
- Manifest host permissions: `<all_urls>`
- Background service worker: Port bridge (`SEGMENT`, `ENHANCE`, `BIND`, `CANCEL`), SSE forwarding, keepalive alarm self-heal, and tab-state recovery/clear behavior via `chrome.storage.session`
- Content script: bootstrap registration and bridge logging (full instrumentation deferred to Step 8+)
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
  "description": "PromptCompiler extension surface (manifest text may lag behind runtime step status).",
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

## Target Runtime (Step 8+)

Planned Step 8+ behavior:

- Content script detects active text inputs and manages underlines/ghost text/hotkeys.
- Background service worker already proxies `/segment`, `/enhance`, and `/bind` through backend APIs.
- Background already streams SSE token events to content script over runtime ports.
- Tab and section state follows shared contracts (`TabStatus`, `SectionStatus`) from `shared/contracts/domain.ts`.
- `/auth/token` session exchange remains backend-mediated; extension stores only app-consumable session state.

Target storage split:

- Popup settings: `chrome.storage.local` (current) unless a future migration to sync is explicitly approved.
- Runtime tab/session state: `chrome.storage.session` (active in background worker).

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