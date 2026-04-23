# PromptCompiler V1 Overarching Implementation Plan

This is the end-to-end execution plan for shipping PromptCompiler V1 from the current scaffold state to a launchable Chrome extension + backend.

## Outcome Definition (V1 Done)

V1 is complete when all of the following are true:

1. The extension works on supported sites (excluding Google Docs/canvas) with the full non-destructive compile flow.
2. Backend routes `/segment`, `/enhance`, and `/bind` are live with auth, tier enforcement, and rate limiting.
3. Free tier routes to Groq only; pro tier routes to pro models per mode; no direct provider calls from extension.
4. Tab/Shift+Tab/Cmd+Enter/Enter/Esc hotkeys work with correct state transitions.
5. Prompt binding respects canonical order: context -> tech_stack -> constraints -> action -> output_format -> edge_cases.
6. No inline DOM replacement occurs before final commit.
7. Auth + usage + enhancement history are persisted and auditable.

## Non-Negotiable Guardrails

1. Proxy-only architecture: extension never calls third-party LLM APIs directly.
2. MV3 process boundaries stay strict:
	- Content script: DOM + UX only.
	- Background service worker: network + storage orchestration.
3. Dirty-state propagation must invalidate downstream accepted/ready sections.
4. Debounce + abort behavior must prevent stale streaming UI.
5. Tier middleware must remain in request path for every LLM route.

## Sequencing Strategy

Build in vertical slices, but in this order:

1. Contracts + schema + middleware
2. LLM orchestration + SSE plumbing
3. Extension background transport
4. Content UX pipeline
5. Acceptance/binding/commit loop
6. Popup/account polish + release hardening

This order minimizes integration thrash and keeps every stage testable.

## Step-by-Step Plan

## Step 0 - Project Bootstrap and Working Agreements

Deliverables:

1. Finalized API contracts and TypeScript shared types for section shapes, goal types, status states, and SSE envelope.
2. Environment setup templates for backend and extension.
3. Runbook for local startup and smoke test procedure.

Implementation checklist:

1. Define shared domain types (`GoalType`, `Section`, `TabState`, `Mode`, SSE message variants).
2. Add strict runtime validation for API input/output (Zod or equivalent).
3. Add local `.env.example` files with required keys.
4. Confirm package scripts for backend, extension, and web launch in parallel.

Done when:

1. All route handlers consume validated, typed payloads.
2. A new contributor can run all apps from docs only.

## Step 1 - Data Layer and Auth Foundation

Deliverables:

1. Supabase schema for profiles + enhancement history (v1 required), projects/context_chunks (v2-ready).
2. RLS policies for user-owned records.
3. Auth middleware that verifies JWT and attaches `userId` and `tier`.

Implementation checklist:

1. Create SQL migrations for:
	- `profiles`
	- `enhancement_history`
	- `projects` (v2-ready)
	- `context_chunks` + vector extension (v2-ready)
2. Implement backend auth middleware using Supabase server-side verification.
3. Implement `/auth/token` contract for extension token refresh flow.
4. Add integration tests for unauthorized, expired token, and valid token paths.

Done when:

1. Protected routes reject missing/invalid tokens with 401.
2. Valid token requests expose user tier in context.

## Step 2 - Rate Limiting and Tier Enforcement

Deliverables:

1. Redis-backed daily rate limits by user.
2. Tier middleware enforcing free/pro/byok model access.
3. Unified error envelope for rate/tier failures.

Implementation checklist:

1. Add `rate:daily:{userId}` atomic increment + TTL-to-midnight.
2. Enforce free cap (30/day) before route handlers execute.
3. Add tier gate that blocks unsupported models per tier.
4. Ensure middleware ordering: auth -> ratelimit -> tier -> route.

Done when:

1. Free users hit deterministic 429 after cap.
2. Tier violations produce deterministic 403.

## Step 3 - LLM Service and Prompt Template System

Deliverables:

1. `llm.ts` router that selects provider/model by `{callType, tier, mode}`.
2. Prompt template modules for each `goal_type` plus bind prompt.
3. Streaming adapter abstraction for Groq and Anthropic.

Implementation checklist:

1. Build model-selection table from docs and unit-test it.
2. Implement prompt factories:
	- context
	- tech_stack
	- constraint
	- action
	- output_format
	- edge_case
	- bind
3. Add sibling context injection for `/enhance`.
4. Add retry/backoff for transient provider errors.

Done when:

1. Router always returns valid provider config.
2. Templates are deterministic and mode-aware.

## Step 4 - Implement `/segment` Route (JSON)

Deliverables:

1. Fast semantic classification endpoint.
2. Canonical ordering + confidence + dependency output.
3. Merge-safe IDs for client state tracking.

Implementation checklist:

1. Validate incoming `segments` and `mode`.
2. Call low-cost model for classification.
3. Normalize output to allowed taxonomy.
4. Return sections with stable IDs and canonical slots.
5. Add tests for malformed, ambiguous, and minimal segment sets.

Done when:

1. Output schema is always valid.
2. Latency stays in low tens of milliseconds on warm path.

## Step 5 - Implement `/enhance` Route (SSE)

Deliverables:

1. Streaming expansion endpoint using unified SSE envelope.
2. Goal-type-specific expansion quality with mode token budgets.
3. Abort-safe handling on client disconnect.

Implementation checklist:

1. Build SSE writer utility for `token`, `done`, `error` events.
2. Route request through tier/model router.
3. Inject sibling context and mode rules into prompts.
4. Capture request metadata for usage metrics.
5. Add tests for stream completion, cancel, and provider error mapping.

Done when:

1. Client receives token stream in order and a terminal event.
2. Abort releases provider/network resources.

## Step 6 - Implement `/bind` Route (SSE)

Deliverables:

1. Final assembly endpoint that binds accepted sections.
2. Canonical ordering enforcement server-side (never trust client order).
3. History write on successful completion.
4. Per-account abuse telemetry and short-window burst-limiter guardrails before provider budget consumption.

Implementation checklist:

1. Sort sections by canonical order in handler.
2. Build bind prompt with mode-specific formatting instruction.
3. Add short-window burst checks and abuse telemetry capture ahead of provider calls.
4. Stream bound prompt tokens as SSE.
5. On success, write row to `enhancement_history`.
6. Add test for duplicate/redundant sections reduction behavior.
7. Add test coverage for burst-limiter and abuse-telemetry guardrails.

Done when:

1. Output is single coherent prompt block.
2. Canonical order is guaranteed regardless of request ordering.
3. Burst-limiter and abuse-telemetry guardrails are part of the Step 6 contract.

## Step 7 - Background Service Worker Core

Deliverables:

1. Port-based streaming bridge between content script and backend.
2. Per-tab state persistence in `chrome.storage.session`.
3. Keepalive alarm strategy compatible with Chrome >=120 behavior.

Implementation checklist:

1. Add `runtime.onConnect` handler for stream channels.
2. Implement `ENHANCE`, `BIND`, `SEGMENT`, and `CANCEL` message verbs.
3. Parse SSE chunks and forward normalized events to content script.
4. Store/recover tab state from session storage to survive worker restarts.
5. Add alarm registration check on startup; recreate if missing.

Done when:

1. Stream survives normal MV3 lifecycle interruptions.
2. Requests can be cancelled immediately from content script.

## Step 8 - Content Script Input Instrumentation

Deliverables:

1. Robust attachment to textarea and contenteditable inputs.
2. MutationObserver re-attach logic for dynamic apps.
3. Pipeline state machine scaffold.

Implementation checklist:

1. Implement input discovery + idempotent listener attachment marker.
2. Add `IDLE -> TYPING -> SEGMENTING -> PREVIEWING -> ACCEPTING -> BINDING -> BINDING_COMPLETE` state transitions.
3. Add debounce and AbortController cancellation for stale calls.
4. Build syntactic split pass for instant underline draft.

Done when:

1. Typing shows immediate draft segmentation.
2. Re-renders in Notion-like apps do not lose instrumentation.

## Step 9 - Underline + Preview Rendering Layer

Deliverables:

1. Mirror overlay rendering for partial underlines in textarea.
2. Confidence-aware underline styles.
3. Hover preview popovers with stream-progress states.

Implementation checklist:

1. Implement mirror div CSS sync with source input.
2. Map goal_type to stable color palette.
3. Render dashed underlines for low-confidence sections and stale sections.
4. Add hover card with loading, ready, and stale statuses.

Done when:

1. Clause visuals stay aligned while typing/scrolling.
2. User can inspect section expansions without committing changes.

## Step 10 - Section Acceptance and Dirty-State Graph

Deliverables:

1. Tab/Shift+Tab acceptance flow.
2. Dependency-aware stale invalidation.
3. Visual distinction for accepted vs stale vs ready.

Implementation checklist:

1. Implement section queue/focus model.
2. On Tab: mark accepted (visual only, no DOM rewrite).
3. On upstream edit: mark downstream `depends_on` sections stale.
4. Disable bind action until all stale accepted sections are re-expanded.

Done when:

1. Non-destructive UX is preserved.
2. Stale logic prevents inconsistent final binds.

## Step 11 - Bind + Commit UX

Deliverables:

1. Cmd+Enter triggers `/bind` with accepted sections.
2. Enter commits final prompt into active input.
3. Esc cancels pending streams and resets overlays.

Implementation checklist:

1. Implement key handling with strict state guards.
2. Stream bound output into ghost text preview.
3. Commit using input-type-specific APIs (textarea vs contenteditable).
4. Clear transient state and overlays post-commit.

Done when:

1. Final commit is single explicit user action.
2. No accidental overwrites happen before Enter commit.

## Step 12 - Popup and Account UX

Deliverables:

1. Mode toggle (efficiency/balanced/detailed) stored in `chrome.storage.sync`.
2. Account tier + daily usage indicator.
3. Upgrade CTA behavior for free-tier limit reached.

Implementation checklist:

1. Build popup state hook for sync storage and cached user data.
2. Display usage retrieved from backend (or inferred counters).
3. Wire selected mode into outbound route payloads.

Done when:

1. Mode changes persist across sessions/devices.
2. User can see limit state before workflow breaks.

## Step 13 - Hardening, Security, and Observability

Deliverables:

1. Structured logging for route latency, provider errors, and stream aborts.
2. Message payload validation on SW boundary.
3. Basic abuse protections and safe render guarantees.

Implementation checklist:

1. Validate all messages from content script before privileged actions.
2. Ensure no HTML injection in popovers/ghost text.
3. Add request IDs for traceability across extension <-> backend.
4. Add health and smoke endpoints.

Done when:

1. Common failure modes are diagnosable from logs.
2. Untrusted content paths cannot trigger arbitrary fetches.

## Step 14 - Test Matrix and Launch Readiness

Deliverables:

1. Unit and integration suites for backend routing and model selection.
2. Extension E2E smoke tests on target sites.
3. Release checklist for Chrome Web Store submission.

Implementation checklist:

1. Backend tests:
	- auth failure/success
	- rate limit boundaries
	- tier routing matrix
	- SSE contract conformance
2. Extension tests:
	- debounce abort behavior
	- stale invalidation propagation
	- hotkey transitions
	- commit correctness
3. Manual matrix: Claude, ChatGPT, GitHub issues, Notion, Linear, Slack web.
4. Package and verify MV3 permissions are minimal and justified.

Done when:

1. Critical path passes on all supported target sites.
2. No P0/P1 bugs remain in triage.

## Suggested Execution Cadence (Vibe Coding)

Use this rhythm repeatedly:

1. Pick one vertical slice from the steps above.
2. Implement the minimum complete behavior.
3. Add tests immediately for that slice.
4. Run a manual smoke test in extension + backend together.
5. Log what broke before moving forward.

Keep slices small enough to ship in 0.5-1 day each.

## Critical Milestones

1. M1: Backend contracts + middleware + `/segment` done.
2. M2: `/enhance` and `/bind` SSE stable with history writes.
3. M3: End-to-end extension flow works on one target site.
4. M4: Multi-site compatibility + dirty-state correctness.
5. M5: Rate limits, popup account UX, release packaging.

## First 10 Tasks to Start Tomorrow

1. Create shared TypeScript domain types for sections and SSE envelopes.
2. Implement auth middleware and wire it into backend app entry.
3. Implement ratelimit middleware with Redis TTL-to-midnight logic.
4. Implement tier middleware and route guards.
5. Build `/segment` route with schema validation and tests.
6. Implement LLM model router and unit test matrix.
7. Build SSE utility and wire `/enhance` route.
8. Build `/bind` route with canonical sorting and history write.
9. Implement SW port transport + cancel handling.
10. Implement content script debounce + syntactic split + draft underlines.

---

If you follow these steps in order, you will preserve the architecture invariants and get to a production-ready V1 without rework-heavy detours.
