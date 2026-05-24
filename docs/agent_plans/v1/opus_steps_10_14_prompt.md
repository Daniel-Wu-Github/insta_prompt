# PromptCompiler — Steps 10–14 Implementation Pass

## Who You Are and What You Are Doing

You are implementing Steps 10 through 14 of PromptCompiler, a Chrome MV3 extension that treats user text as source code and compiles it into a structured prompt through a clause segmentation → classify → expand → accept → bind → commit pipeline.

Working directory: `/home/seed/projects/insta_prompt`

Steps 1–9 are done. The backend, background service worker, and content script rendering layer are all active. You are implementing the acceptance UX, bind trigger, commit, popup, hardening, and launch readiness — in one focused pass that produces a working happy-path state for each step, structured for controlled debugging afterward.

**Delivery model:** Working state with guardrails, not perfection. Each step must be correct on the happy path and not violate architecture invariants. Edge cases are surfaced through the testing guide, not implemented speculatively. Do not add features, fallbacks, or abstractions beyond what the step explicitly requires.

---

## Mandatory Pre-Work — Do This Before Touching Any File

### 1. Check Pending Improvements

Read `.claude/pending-improvements.md`. Address any items flagged there before starting implementation.

### 2. Read the Skill Map

Read `.github/skills/SKILL_MAP.md`. This is the central source of truth for skill loading. Do not skip this step.

### 3. Load Skills for This Task

Load these skills before planning or editing anything. Read each SKILL.md file fully:

**For Steps 10–11 (acceptance, bind, commit):**
- `.github/skills/clause-state-management/SKILL.md`
- `.github/skills/hotkey-bind-commit-ux/SKILL.md`
- `.github/skills/underline-preview-rendering/SKILL.md`
- `.github/skills/dom-memory-management/SKILL.md`
- `.github/skills/ui-design-system/SKILL.md`
- `.github/skills/target-site-compat/SKILL.md`
- `.github/skills/canonical-clause-ordering/SKILL.md`
- `.github/skills/typescript-safety/SKILL.md`

**For Step 12 (popup):**
- `.github/skills/extension-popup-ux/SKILL.md`
- `.github/skills/mv3-extension-boundaries/SKILL.md`

**For Step 13 (hardening):**
- `.github/skills/typescript-safety/SKILL.md`
- `.github/skills/ui-design-system/SKILL.md` (injection safety rules)

**For Step 14 (test matrix):**
- `.github/skills/manual-testing-guides/SKILL.md`

**Always:**
- `.github/skills/scope-creep-guard/SKILL.md`
- `.github/skills/verification-gate/SKILL.md`

### 4. Read the Source of Truth Docs

Read these before planning implementation for any step:

- `docs/UX_FLOW.md` — the complete hotkey map, section states, acceptance flow
- `docs/CLAUSE_PIPELINE.md` — canonical clause ordering and section contracts
- `docs/ARCHITECTURE.md` — MV3 process boundaries, proxy model, storage scopes
- `docs/EXTENSION.md` — content script, background SW, popup isolation rules
- `docs/BACKEND_API.md` — `/bind` route contract, SSE envelope format
- `docs/DATA_MODELS.md` — shared type contracts

### 5. Read the Taskboard for Each Step

Before implementing each step, read its taskboard:

- `docs/agent_plans/v1/v1_step_by_step/v1_step_9.md` — review what Step 9 deferred (acceptance, bind, commit)
- `docs/agent_plans/v1/v1_overarching_plan.md` — read Steps 10–14 deliverables and checklists

### 6. Read the Current State of Key Files

Read these fully before touching them:

- `extension/src/content/index.ts` (1457 lines) — the content script
- `extension/src/background/index.ts` (665 lines) — the background SW
- `extension/src/popup/App.tsx` and `extension/src/popup/hooks/useSettings.ts`
- `shared/contracts/` — all files

---

## Current State Snapshot (as of this prompt)

**Content script** (`extension/src/content/index.ts`):
- Working: input discovery, idempotent attachment, debounce/abort, draft underline overlay with goal_type colors and confidence styling, scroll sync, resize observer, hover popover for previews
- Missing (your job): Tab/Shift+Tab acceptance state, Cmd+Enter bind trigger, ghost text streaming, Enter commit to textarea/contenteditable, full Esc reset (currently only dismisses hover preview)
- `handleSourceKeyDownEvent` at line ~1233 currently only handles `Escape` to clear hover preview — this is your extension point for Steps 10–11
- `ActiveInputState` has no acceptance-related fields — you need to add them
- `draftSegments: DraftSegment[]` is populated after segmentation — this is your source for the acceptance queue

**Background SW** (`extension/src/background/index.ts`):
- Working: SEGMENT, ENHANCE, BIND, CANCEL verb dispatch; per-tab SSE relay; session persistence; keepalive
- BIND verb is wired and operational — the content script just needs to send it

**Popup** (`extension/src/popup/`):
- Component structure exists: `ModeToggle`, `AccountStatus`, `ProjectSelector`, `UpgradeCTA`
- `useSettings` hook uses `chrome.storage.local` — must be migrated to `chrome.storage.sync`
- `AccountStatus` is hardcoded with static props (tier, usage, limit) — needs to fetch from backend
- Upgrade CTA gating is not implemented

**Backend routes** `/segment`, `/enhance`, `/bind`, `/health`: `/segment`, `/enhance`, `/bind` are active. `/health` exists. `/smoke` does not exist yet.

---

## Architecture Guardrails — Never Violate These

1. **Proxy-only LLM:** The content script never calls backend routes directly. All API calls go through the background SW via `chrome.runtime.Port`.
2. **No DOM replacement before commit:** Acceptance (Tab) must be visual-only — grey out the span, do not write to `textarea.value` or `element.textContent` until Enter commit.
3. **Canonical bind order:** Accepted sections sent in the BIND message must be sorted by canonical clause order (context → tech_stack → constraint → action → output_format → edge_case) before dispatch.
4. **textContent only for user content:** Ghost text and popover previews must use `textContent`, never `innerHTML`.
5. **Shadow DOM isolation:** All content script UI (overlays, popovers, ghost text panel) must mount inside a shadow root attached to `document.body`, never inside the host input tree.
6. **Storage scope:** Mode lives in `chrome.storage.sync`. Per-tab stream state lives in `chrome.storage.session`. Settings that persist across devices use `sync`; transient tab state uses `session`.
7. **Bind gate:** `Cmd+Enter` must be a no-op if no sections are accepted, or if any accepted section is stale. Never fire a BIND message in those states.
8. **Commit is irreversible:** After Enter commits, call the full teardown function — remove all overlay nodes, disconnect all observers, remove all listeners, clear section state. Do not leave any `data-insta-*` nodes in the DOM.

---

## Step Execution Plan

Work through each step in order. Do not start a step until the previous step's TypeScript compiles cleanly. After implementing each step, run:

```bash
cd extension && npx tsc --noEmit --skipLibCheck
```

Fix all TypeScript errors before proceeding to the next step.

---

### Step 10 — Section Acceptance and Dirty-State Graph

**Goal:** Tab/Shift+Tab acceptance queue with visual-only grey-out, upstream-edit stale propagation, and Cmd+Enter bind gate.

**Files to touch:**
- `extension/src/content/index.ts` only
- `shared/contracts/domain.ts` only if a type refinement is strictly needed

**What to implement:**

1. **Extend `ActiveInputState`** with acceptance fields:
   - `acceptedSegmentIndices: Set<number>` — which segments are accepted
   - `focusedSegmentIndex: number | undefined` — which segment is the current Tab target
   - `hasStaleAccepted: boolean` — true if any accepted segment's source text has changed since acceptance

2. **Extend `handleSourceKeyDownEvent`** to handle:
   - `Tab` (not Shift): accept the oldest unaccepted segment. Mark it accepted (visual: grey opacity on its span, add `data-accepted` attribute). Advance focus to the next unaccepted segment. Guard: `event.preventDefault()`, check `!event.isComposing`.
   - `Shift+Tab`: deselect the most-recently accepted segment. Revert it to ready visual state. Move focus back.
   - `Cmd+Enter` (Mac: `metaKey + Enter`; Windows: `ctrlKey + Enter`): fire BIND only if `acceptedSegmentIndices.size > 0 && !hasStaleAccepted`. Otherwise no-op. Guard: `event.preventDefault()`.

3. **Stale propagation:** When a new input event fires on an element that already has accepted segments, mark `hasStaleAccepted = true` and re-render accepted segments with a stale visual (muted opacity, different color class). Clear `acceptedSegmentIndices` and reset `focusedSegmentIndex` when a new segmentation response arrives (the user has re-typed enough to get new classifications).

4. **Accepted visual state:** In `renderDraftOverlaySegments`, check `acceptedSegmentIndices.has(index)` and apply an additional CSS class or inline style for accepted segments (e.g., reduced opacity `0.4`, no underline animation, a checkmark or solid treatment). Stale-accepted gets a distinct visual (amber or grey with strikethrough treatment).

5. **Bind gate enforcement:** In the `Cmd+Enter` handler, check preconditions before sending. Log a console.warn explaining why it was blocked if the gate fires.

**Acceptance order rule:** The queue is oldest-first (lowest array index). `focusedSegmentIndex` starts at `0` after segmentation and advances with each Tab press.

**Do not implement in Step 10:** ghost text, BIND message dispatch, Enter commit, Esc stream cancel.

---

### Step 11 — Bind + Commit UX

**Goal:** Cmd+Enter sends BIND to the SW, ghost text streams in, Enter commits to the host input, Esc cancels and resets.

**Files to touch:**
- `extension/src/content/index.ts` only

**What to implement:**

1. **BIND message dispatch (Cmd+Enter handler, after gate passes):**
   - Collect accepted segments from `activeInputState.acceptedSegmentIndices`.
   - Sort by canonical order: `context(0) → tech_stack(1) → constraint(2) → action(3) → output_format(4) → edge_case(5)`.
   - Resolve mode and JWT via the existing `resolveBridgeContext()` function.
   - Send via `bridgePort.postMessage({ verb: 'BIND', requestId: crypto.randomUUID(), tabId: ..., payload: { sections, mode, jwt } })`.
   - Store the active requestId so Esc can cancel it.

2. **Ghost text panel:**
   - Create a shadow-DOM panel (similar to hover preview shell) positioned via `position: fixed` below the host input using `getBoundingClientRect()`.
   - Append streamed tokens to the panel's body element via `textContent` concatenation (never innerHTML).
   - The panel must be visually distinct from the host input: use `--pc-color-stale` tones, italic style, a "Compiling..." label that becomes "Press Enter to commit" when the stream completes.
   - Add the ghost panel's host element to the existing overlay registry so teardown removes it.

3. **Incoming BIND stream handling:**
   - The background SW already forwards SSE tokens as `{ type: 'token', data: string }` and `{ type: 'done' }` messages on the port.
   - In `bridgePort.onMessage.addListener`, handle BIND stream events: append tokens to the ghost panel buffer; on `done`, flip the ghost panel to "ready to commit" state.
   - Store the accumulated ghost text in a module-level variable: `let pendingGhostText: string = ''`.

4. **Enter commit:**
   - In `handleSourceKeyDownEvent`, handle `Enter` when `pendingGhostText.length > 0`.
   - `event.preventDefault()`.
   - Commit using the correct path per input type:
     - **Standard textarea:** Use the native value setter pattern (see `target-site-compat` skill) then dispatch a synthetic `input` event.
     - **contenteditable:** `element.textContent = pendingGhostText` then dispatch `new InputEvent('input', { bubbles: true })`.
   - After commit: call `clearActiveInputWork(activeInputState)`, remove ghost panel, reset `pendingGhostText = ''`, reset `acceptedSegmentIndices`, reset `hasStaleAccepted`.

5. **Esc cancel:**
   - Extend the existing Esc handler: if `pendingGhostText` is accumulating (stream in progress), send `{ verb: 'CANCEL', requestId: activeBindRequestId }` via bridgePort.
   - Clear the ghost panel content. Reset `pendingGhostText = ''`. Do NOT reset `acceptedSegmentIndices` — user should be able to retry Cmd+Enter.
   - If no stream is in progress, Esc falls through to existing hover-dismiss behavior.

**Ghost text must never be committed automatically.** It only commits on an explicit Enter keypress when the stream is in a `done` state. Partial stream content is never committed.

---

### Step 12 — Popup and Account UX

**Goal:** Fix storage scope, wire real account tier + usage fetch, enforce upgrade CTA gating.

**Files to touch:**
- `extension/src/popup/hooks/useSettings.ts`
- `extension/src/popup/App.tsx`
- `extension/src/popup/components/AccountStatus.tsx`
- `extension/src/popup/components/UpgradeCTA.tsx`

**What to implement:**

1. **Migrate storage from `local` to `sync`:**
   In `useSettings.ts`, replace all `chrome.storage.local` calls with `chrome.storage.sync`. Mode selection must sync across browser profiles.

2. **Fix write order:**
   Currently `persist()` optimistically updates local state then writes to storage. Reverse this: write to storage first, update state in the callback. This prevents stale-default flashes.

3. **Wire `AccountStatus` to real data:**
   Add a `useAccountStatus` hook (in `extension/src/popup/hooks/useAccountStatus.ts`) that:
   - Reads the JWT from `chrome.storage.local` (same key the content script uses: `promptcompiler.settings`)
   - Calls `GET /account/status` on the backend (add this route if it doesn't exist, returning `{ tier, enhanceCount, dailyLimit }`)
   - Returns `{ tier, usage: { count, limit }, isLoading, error }`
   - On error: returns `{ tier: 'free', usage: null, isLoading: false, error: true }` — never throws

4. **Wire `UpgradeCTA` gating:**
   Show the upgrade CTA only when: `tier === 'free' && usage !== null && usage.count >= usage.limit`. Hide it for all other states (loading, pro, byok, error).

5. **Mode forwarded in outbound requests:**
   The background SW's `resolveBridgeContext` must read mode from `chrome.storage.sync` (not `chrome.storage.local`). Update the storage key lookup in `extension/src/background/index.ts` to match.

6. **Keep the popup lean:** Do not add new UI components or styling libraries beyond what already exists. The existing inline styles are acceptable for Step 12. The `ui-design-system` skill's Tailwind/Radix recommendation is a future improvement — do not add new dependencies in this pass.

---

### Step 13 — Hardening, Security, and Observability

**Goal:** Message validation at SW boundary, injection safety audit, request ID tracing, health/smoke endpoints.

**Files to touch:**
- `extension/src/background/index.ts` — message validation, request IDs
- `backend/src/index.ts` or router — `/smoke` endpoint
- `extension/src/content/index.ts` — injection safety audit only (no new features)

**What to implement:**

1. **SW boundary message validation:**
   In `extension/src/background/index.ts`, the `port.onMessage` handler currently has `isBridgeVerb` and `isPlainObject` guards. Harden these:
   - Add a `validateBridgeMessage(raw: unknown)` function that checks: verb is a known BridgeVerb, payload is a plain object, required fields are present (text for SEGMENT, sectionId for ENHANCE, sections array for BIND).
   - If validation fails: log `[SW] rejected message: <reason>` and return without dispatching. Do not throw.
   - Add sender ID verification: in `chrome.runtime.onConnect`, verify `port.sender?.id === chrome.runtime.id` and disconnect immediately if not.

2. **Request ID tracing:**
   - Generate a `requestId` (use `crypto.randomUUID()`) for each SEGMENT, ENHANCE, and BIND dispatch in the SW.
   - Log `[SW] dispatching ${verb} requestId=${requestId}` at dispatch time.
   - Include the requestId in the backend fetch headers as `X-Request-ID: ${requestId}`.
   - In the backend, read `X-Request-ID` from the request header and include it in any error log entries for that request.

3. **Injection safety audit in content script:**
   Grep `extension/src/content/index.ts` for any `.innerHTML` assignment. Verify every instance is either setting your own structural markup (not user/LLM content) or replace it with `textContent`. Fix any instance where user content, segment text, or enhancement preview text is set via `innerHTML`.

4. **`/smoke` backend endpoint:**
   Add a `GET /smoke` handler that: requires no auth, calls no LLM, returns `{ status: 'ok', routes: ['segment', 'enhance', 'bind'], ts: Date.now() }` with HTTP 200. This is a routing-registration validator only.

5. **`/health` verification:**
   Confirm `/health` already exists and returns `{ status: 'ok' }`. If it doesn't, add it.

---

### Step 14 — Test Matrix and Launch Readiness

**Goal:** Backend test suite coverage for critical paths, extension unit tests for state machine and commit paths, Chrome Web Store submission checklist.

**Files to touch:**
- `backend/src/__tests__/` — add or expand test files
- `extension/src/content/__tests__/` — add unit tests for acceptance and commit logic
- `docs/agent_plans/v1/v1_testing_notes.md` — the manual testing guide for Steps 9–14 is already written; do not rewrite it, only add a Step 14 launch checklist section if it is missing

**What to implement:**

**Backend tests (add to existing test files or create new ones):**
1. Auth failure (no token → 401) and success (valid token → 200) for `/segment`, `/enhance`, `/bind`.
2. Rate limit boundary: free-tier user at `dailyLimit` gets 429; below limit gets 200.
3. Tier routing: free-tier request routes to Groq path; pro-tier request routes to Claude path. Use stub adapters — no real LLM calls in tests.
4. SSE contract: `/enhance` and `/bind` responses include at least one `data:` line and a terminal `data: [DONE]` line.
5. `/health` returns 200 with `{ status: 'ok' }`.
6. `/smoke` returns 200 with expected payload.

**Extension unit tests (add to or create `extension/src/content/__tests__/`):**
1. Acceptance queue: after segmentation returns 3 segments, Tab 3 times → all 3 are in `acceptedSegmentIndices`.
2. Stale propagation: accept 2 segments, fire an input event → `hasStaleAccepted === true`.
3. Bind gate: `Cmd+Enter` handler is a no-op when `acceptedSegmentIndices.size === 0` (no API call sent).
4. Bind gate: `Cmd+Enter` handler is a no-op when `hasStaleAccepted === true`.
5. Canonical sort: a `sortByCanonicalOrder` utility function, given sections in random goal_type order, returns them in the canonical sequence.
6. Commit (textarea): after a mock BIND stream completes and Enter is pressed, `textarea.value` equals the accumulated ghost text.
7. Commit (contenteditable): same as above but `element.textContent` is used, not `innerHTML`.

**Chrome Web Store checklist:**
Append the following checklist to `docs/agent_plans/v1/v1_testing_notes.md` under a `## Step 14 Launch Checklist` section if it is not already there. Each item must be checkable by the developer before submission:

```
[ ] manifest.json version incremented
[ ] Permissions list is minimal — no over-broad host_permissions
[ ] No 'unsafe-eval' or 'unsafe-inline' in content_security_policy
[ ] Privacy policy URL is live
[ ] Store listing screenshots current (3+ at 1280x800)
[ ] Short description under 132 characters
[ ] All four icon sizes present: 16px, 32px, 48px, 128px
[ ] Production bundle tested with Tests 14.4 target-site smoke
[ ] No console errors in production bundle on any target site
[ ] All debug console.log calls gated behind a DEV flag
[ ] Supabase RLS confirmed active on production instance
[ ] Redis rate limit keys use production Redis URL
```

---

## Scope Boundaries — What Must Not Happen

- Do not implement v2 features (GitHub OAuth, context retrieval, pgvector).
- Do not add new npm dependencies unless strictly necessary for a Step 12–13 requirement (and even then, check if native APIs suffice).
- Do not rewrite Step 9 rendering. Extend it minimally for acceptance visual state.
- Do not change the `/segment`, `/enhance`, or `/bind` backend route behavior. Step 13 adds validation and observability only.
- Do not add a UI design system overhaul in Step 12 — the existing inline styles are acceptable for now.
- Do not add speculative error handling or fallbacks for scenarios that cannot happen given the current architecture.

---

## Verification Protocol

After each step:
1. Run `cd extension && npx tsc --noEmit --skipLibCheck`. Zero errors required before proceeding.
2. Run `cd backend && bun test`. No new test failures.
3. Do a changed-file audit: every edited file maps to the declared step objective. If a file change does not map, remove it.

After all five steps:
1. Run `bash scripts/implicit-skill-smoke-test.sh` from the repo root. All tests must pass.
2. Run `cd extension && npm test` if tests exist.

---

## Delivery Contract

Final response must follow this order:

### 1. Outcome
One paragraph: what is working after this pass and what is deferred.

### 2. Changes Made
Per step, list every file touched and what was added or changed. Be specific (function names, line ranges, new types added).

### 3. TypeScript Verification
Paste the output of the final `tsc --noEmit --skipLibCheck` run for the extension and backend packages.

### 4. Test Results
Paste the output of `bun test` (backend) and `npm test` (extension) if either exists.

### 5. Smoke Test
Paste the final line of `bash scripts/implicit-skill-smoke-test.sh`.

### 6. Deviations and Ambiguities
List any place you had to make a judgment call, deviate from a skill rule, or leave something partially implemented.

### 7. Residual Risks and Next Steps
Name the edge cases that are not yet handled and correspond to tests in the Step 9–14 testing guide. Explicitly list which test numbers in `docs/agent_plans/v1/v1_testing_notes.md` are your primary validation targets for the next manual testing session.

---

## Final Note on Style

This codebase uses a compiler metaphor throughout — the code, docs, and naming should reflect that. When naming new functions or types, prefer: `accept`, `bind`, `commit`, `ghost`, `clause`, `segment`, `canonical` over generic names like `handle`, `process`, `update`, `manage`. Consistency with the existing vocabulary in `index.ts` is required.
