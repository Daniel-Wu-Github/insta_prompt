# Chrome Extension

> MV3 process boundaries plus current implementation status.

---

## Current Status (fully instrumented — updated 2026-08-02)

The "Step" staging language below (`Target Runtime (Step 8+)`) describes the original
build sequence and is now historical — every stage it once deferred is implemented and
shipped as of the 2026-07-07 "fable pass" (see `human/06_FABLE_PASS_REPORT.md`).

- Manifest permissions: `storage`, `alarms`
- Manifest host permissions: `<all_urls>` (deliberate — universal textarea assistant, no
  fixed target-site list; see `extension/wxt.config.ts` for the rationale comment)
- Background service worker: port bridge (`SEGMENT`, `ENHANCE`, `BIND`, `CANCEL`), SSE
  forwarding, keepalive alarm self-heal, tab-state recovery/clear via `chrome.storage.session`
- Content script (`extension/src/content/index.ts`, ~3800 lines): full instrumentation —
  textarea/contenteditable/text-input detection, debounced segmentation, hybrid underline
  rendering (CSS Custom Highlights where supported, shadow-wrapped overlay mirror as
  fallback — see `docs/CLAUSE_PIPELINE.md` Step 4), hover preview popover, Tab-cycle
  review + Enter-to-accept + Backspace/Delete-to-un-accept, Cmd+Enter bind + ghost-text
  streaming + Enter-to-commit (non-destructive, Option E — unaccepted clauses ride the
  bind payload near-verbatim), Esc cancel/reset, persistent keymap HUD, one-time coach
  mark, client-side error capture (buffered, no delivery transport wired yet)
- Popup: React UI — mode toggle, account status/usage, model-override toggle, upgrade
  CTA, clause-ordering toggle, pause toggle, project selector, and a prompt history +
  template library panel (search/copy/delete/pin, backed by `chrome.storage.local` key
  `promptcompiler.history`, purely client-side — no backend history API)
- Popup settings storage: `chrome.storage.local` key `promptcompiler.settings`

Current extension files:

- `extension/src/background/index.ts`
- `extension/src/content/index.ts`
- `extension/src/popup/App.tsx`
- `extension/src/popup/hooks/{useSettings,useAccountStatus,useClauseOrdering,useModelOverride,usePause,usePromptHistory}.ts`
- `extension/src/popup/components/{AccountStatus,ClauseOrderingToggle,HistoryPanel,LoadingSpinner,ModelOverrideToggle,ModeToggle,PauseToggle,ProjectSelector,UpgradeCTA}.tsx`
- `extension/src/lib/prompt-history.ts`
- `extension/src/test/chrome-mock.ts` (shared vitest `chrome.*` mock — extend this, never hand-roll `vi.stubGlobal("chrome", ...)` in a new test)

---

## Current Manifest Snapshot

Source of truth: `extension/wxt.config.ts`.

```json
{
  "manifest_version": 3,
  "name": "PromptCompiler",
  "description": "AI prompt compiler: classify, expand, and assemble rough ideas into polished prompts — directly in any text field.",
  "permissions": ["storage", "alarms"],
  "host_permissions": ["<all_urls>"],
  "web_accessible_resources": [
    { "resources": ["fonts/InterVariable.woff2"], "matches": ["<all_urls>"] }
  ]
}
```

The bundled Inter Variable font is served as a web-accessible resource because it's
fetched from host-page context (the shadow roots the content script injects).

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

## Target Runtime — now shipped (was "Step 8+")

All of the following is implemented, not planned:

- Content script detects active text inputs and manages underlines/ghost text/hotkeys.
- Background service worker proxies `/segment`, `/enhance`, and `/bind` through backend APIs.
- Background streams SSE token events to content script over runtime ports.
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

For WSL/manual popup loading details, use the guide in `docs/testing-notes/v1_testing_notes.md`.

---

## Source Of Truth Links

- `docs/ARCHITECTURE.md`
- `docs/UX_FLOW.md`
- `docs/CLAUSE_PIPELINE.md`
- `docs/BACKEND_API.md`