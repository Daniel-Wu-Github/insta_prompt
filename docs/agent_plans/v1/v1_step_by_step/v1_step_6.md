# Step 6 - Implement `/bind` Route (SSE)

This is the tactical workboard for Step 6 in [v1_overarching_plan.md](../../agent_plans/v1_overarching_plan.md). The goal is to replace placeholder `/bind` behavior with production final-assembly streaming orchestration and successful history persistence, while preserving Step 7+ extension and UX boundaries.

Step 6 is done when the repo has:

1. A production `/bind` route that streams final prompt assembly over the unified SSE envelope.
2. Deterministic model selection for `/bind` via `callType + tier + mode` routing.
3. Server-side canonical ordering enforcement independent of client-provided ordering.
4. Bind prompt assembly through Step 3 service-layer factories (`prepareBindServiceHandoff`), not route-local template literals.
5. Route-level SSE serialization that preserves `token | done | error` semantics with one terminal outcome.
6. Abort-safe and error-safe stream cleanup behavior.
7. Exactly one successful `enhancement_history` write on successful bind completion.
8. Per-account abuse telemetry and short-window burst-limiter guardrails before provider budget consumption.
9. Tests for validation, canonical ordering, completion, cancel, provider-error mapping, persistence success/failure behavior, duplicate/redundant section handling, and burst/abuse guardrail behavior.
10. No Step 7 extension bridge behavior or Step 8+ UX/commit behavior leakage.

## Step 6 Taskboard

### 6.0 Readiness and dependency lock

Goal: ensure Step 3 and Step 5 contracts are stable before Step 6 bind route work lands.

- [ ] Confirm Step 3 router and bind-prompt handoff contracts are stable for `/bind`.
- [ ] Confirm Step 5 SSE envelope semantics (`token | done | error`) are stable and reusable for `/bind`.
- [ ] Confirm protected middleware order (`auth -> ratelimit -> tier`) still guards `/bind`.
- [ ] Confirm current `/bind` behavior remains deterministic placeholder logic and is safe to replace.
- [ ] Confirm `enhancement_history` schema requirements for successful bind persistence.

Done when:

1. Preconditions are explicit.
2. `/bind` route assumptions are verified.
3. Step 6 starts from locked Step 3 and Step 5 behavior.

### 6.1 Lock scope and source of truth

Goal: make Step 6 boundaries explicit before coding.

- [ ] Read architecture, backend API, clause pipeline, data models, LLM routing, UX flow, and Step 6 slice in the overarching plan.
- [ ] Extract exact Step 6 deliverables from the overarching plan.
- [ ] Lock explicit out-of-scope boundaries for Step 7+ extension/UX behavior.
- [ ] Record file-level ownership for bind orchestration, SSE transport, and history persistence.

Done when:

1. Scope is clear in one paragraph.
2. File ownership is explicit.
3. Out-of-scope constraints are explicit.

### 6.2 Confirm implementation surface and deferments

Goal: keep Step 6 focused on `/bind` backend streaming and successful persistence behavior only.

- [ ] Confirm Step 6 runtime changes are limited to bind orchestration, SSE transport, and successful history-write surfaces.
- [ ] Confirm Step 7 extension stream-bridge behavior remains deferred.
- [ ] Confirm Step 8+ content state/acceptance/hotkey/commit behavior remains deferred.
- [ ] Confirm Step 6 tests focus on `/bind` validation, canonical order, stream semantics, and persistence behavior.

Runtime-deferred implementation files for Step 6:

1. `extension/src/background/index.ts` stream-bridge orchestration (Step 7).
2. `extension/src/content/index.ts` bind token consumption and UI-state transitions (Step 7+).
3. Step 8-11 content UX state machine, acceptance queue, and commit behavior surfaces.
4. Step 12 popup/account UX surfaces.

Done when:

1. File touch surface is explicit and narrow.
2. Deferred Step 7+ behavior is explicit.
3. Step 6 execution can start without scope ambiguity.

### 6.3 Implement `/bind` request validation and service handoff

Goal: replace placeholder bind assembly with production route-to-service orchestration.

- [ ] Keep existing JSON parse and `bindRequestSchema` validation flow in `bindRouteHandler`.
- [ ] Resolve model via `selectModel({ callType: "bind", tier, mode, byokConfig })`.
- [ ] Build bind prompt via Step 3 prompt assembly (`prepareBindServiceHandoff` or equivalent) using mode and accepted sections.
- [ ] Keep auth/rate/tier assumptions unchanged and middleware-driven.

Allowed files for this slice:

- `backend/src/services/routeHandlers.ts`
- `backend/src/services/llm.ts` (only if handoff export wiring needs refinement)
- `backend/src/lib/schemas.ts` (only if bind request constraints are tightened)
- `shared/contracts/api.ts` (only if bind request contract changes are explicitly approved)

Done when:

1. `/bind` no longer emits placeholder text assembled locally in route code.
2. Model and bind-prompt handoff is deterministic and typed.
3. Request contract shape remains source-of-truth aligned.

### 6.4 Enforce canonical ordering server-side before bind generation

Goal: guarantee canonical assembly regardless of request ordering.

- [ ] Canonicalize and sort bind sections server-side from goal-type slot mapping.
- [ ] Ensure route behavior does not trust client ordering or client slot numbers for final assembly.
- [ ] Ensure canonical ordering source remains centralized and consistent with bind prompt factory expectations.
- [ ] Ensure duplicate/redundant section handling expectations remain explicit in bind-prompt handoff behavior.

Allowed files for this slice:

- `backend/src/services/routeHandlers.ts`
- `backend/src/services/prompts/bind.ts` (only if canonical/dedup directives need tightening)
- `backend/src/services/llm.ts` (only if canonical handoff contract needs refinement)

Done when:

1. Canonical order is guaranteed server-side regardless of request ordering.
2. Bind handoff uses one canonical-order source.
3. Duplicate/redundant content handling intent is explicit and deterministic.

### 6.5 Add per-account abuse telemetry and burst limiter guardrails

Goal: throttle suspicious high-frequency protected-route traffic and persist deterministic abuse signals before provider budgets are consumed.

- [ ] Add a short-window per-account burst limiter for protected LLM routes (`/segment`, `/enhance`, `/bind`) in the shared rate-limit service.
- [ ] Keep the existing free-tier daily quota behavior and envelope semantics unchanged.
- [ ] Emit deterministic abuse-signal records when burst thresholds are exceeded (or repeatedly approached) without leaking provider or secret data.
- [ ] Keep abuse-signal persistence non-blocking; request enforcement must stay deterministic even if telemetry write fails.
- [ ] Keep route and middleware responsibilities thin: shared limiter logic in services, route decisions in middleware.
- [ ] Add deterministic tests for burst-boundary behavior and telemetry-trigger paths.

Allowed files for this slice:

- `backend/src/services/rateLimit.ts`
- `backend/src/middleware/ratelimit.ts`
- `backend/src/services/history.ts` (or a dedicated abuse telemetry service if introduced)
- `backend/src/__tests__/ratelimit.integration.test.ts`
- `backend/src/__tests__/rateLimit.service.test.ts`
- `supabase/migrations/**` (only if a dedicated abuse-signal table/columns are explicitly approved)
- `docs/BACKEND_API.md` (only if deterministic envelope/code contract changes are approved)

Done when:

1. Burst-limiter checks execute before provider call paths on protected LLM routes.
2. Abuse signals are persisted with deterministic fields and no secret leakage.
3. Burst-throttle responses are deterministic (`429`) and Redis-unavailable behavior remains deterministic (`503 RATE_LIMIT_UNAVAILABLE`).
4. Existing Step 2 daily-quota behavior and tier semantics remain intact.

### 6.6 Stream bind provider events through the unified SSE envelope

Goal: convert provider stream events into deterministic bind SSE output.

- [ ] Map provider token events to shared `StreamEvent` token frames in-order.
- [ ] Emit one terminal `done` frame on successful completion.
- [ ] Map provider errors to deterministic SSE `error` frames without leaking provider internals.
- [ ] Keep SSE serialization in route/lib transport surfaces; use shared framing helpers or exact `data: ...\n\n` framing.
- [ ] Preserve required SSE headers and keep status immutable after streaming starts.
- [ ] Guard against duplicate or mixed terminal outcomes.
- [ ] Before emitting terminal `done` or `error` after asynchronous post-generation work (including persistence), check `c.req.raw.signal.aborted` and return without writing if aborted.

Allowed files for this slice:

- `backend/src/services/routeHandlers.ts`
- `backend/src/lib/sse.ts`
- `shared/contracts/sse.ts` (only if envelope typing refinement is needed)
- `backend/src/services/providers/**` (only if adapter lifecycle hooks need tightening)

Done when:

1. Client receives ordered token frames and exactly one terminal event.
2. SSE envelope matches source-of-truth docs.
3. Terminal behavior is deterministic and idempotent.

### 6.7 Persist successful bind completion to enhancement history

Goal: write one deterministic success record for each successful bind stream completion.

- [ ] Implement `recordEnhancementHistory` persistence wiring for successful bind completion.
- [ ] Capture deterministic history payload fields: `userId`, derived `rawInput`, `finalPrompt`, `mode`, `modelUsed`, and `section_count`.
- [ ] Derive `rawInput` by JSON serializing the validated client-provided bind sections array, preserving per-section structure (`canonical_order`, `goal_type`, `expansion`) and array order.
- [ ] Do not flatten `rawInput` into one concatenated text block.
- [ ] Keep `project_id` nullable unless a contract update is explicitly approved.
- [ ] Attempt exactly one write per successful bind completion before emitting terminal `done`.
- [ ] Ensure abort/error paths do not create success history rows.
- [ ] Ensure write failures map to deterministic stream-safe `error` behavior when `done` has not yet been emitted.
- [ ] Extract `userId` strictly from middleware-populated Hono context (`c.get("userId")`); do not decode JWT manually or re-run Supabase auth verification inside the bind route.

Allowed files for this slice:

- `backend/src/services/routeHandlers.ts`
- `backend/src/services/history.ts`
- `backend/src/services/supabase.ts` (only if shared client/export support is needed)

Done when:

1. Successful binds produce exactly one successful history write attempt.
2. Abort/error binds produce zero success rows.
3. Persistence behavior is deterministic and stream-safe.
4. `rawInput` preserves structured section boundaries and ordering for history/audit replay.

### 6.8 Add Step 6 test matrix

Goal: prove `/bind` behavior across validation, canonicalization, streaming, and persistence paths.

- [ ] Add tests for malformed JSON and bind-schema validation failures.
- [ ] Add tests for out-of-order section inputs producing canonical bind behavior.
- [ ] Add tests for successful token stream completion and terminal `done` semantics.
- [ ] Add tests for provider error mapping into SSE `error` events.
- [ ] Add tests for client-abort/cancel behavior and cleanup guarantees.
- [ ] Add tests for successful history-write invocation exactly once on successful binds.
- [ ] Add tests for history-write failure mapping and terminal behavior.
- [ ] Add tests for duplicate/redundant section handling expectations in bind output assembly.
- [ ] Keep tests network-isolated with deterministic adapter stubs/mocks.

Done when:

1. `/bind` stream and persistence behavior is regression-resistant.
2. Canonical-order and persistence semantics are deterministic and test-covered.
3. Step boundary with Step 7+ remains intact.

### 6.9 Final review and handoff

Goal: ensure Step 6 is complete and Step 7 can begin without reopening bind decisions.

- [ ] Review diff against Step 6 acceptance criteria.
- [ ] Confirm `/bind` stream contract across happy and degraded paths.
- [ ] Confirm successful history-write behavior on bind completion.
- [ ] Confirm no Step 7+ extension/UX behavior landed early.
- [ ] Confirm tests cover validation, canonical order, completion, cancel, provider-error mapping, and persistence behavior.
- [ ] Update progress logs and note deferred Step 7 concerns.

Done when:

1. Step 6 taskboard is reflected in code and tests.
2. Step 7 can start without reopening `/bind` route design decisions.
3. Out-of-scope behavior remains deferred.

## Step 6 Quality Bar

Treat Step 6 as production bind-route and persistence work, not temporary scaffolding.

1. Every valid `/bind` request returns deterministic SSE envelope events.
2. Canonical bind ordering is enforced server-side regardless of request ordering.
3. Model and bind prompt assembly are deterministic by `callType`, `tier`, and `mode`.
4. Token ordering is preserved and terminal-event behavior is explicit.
5. Burst-limiter and abuse-telemetry guardrails execute before provider budget consumption.
6. Successful bind completion triggers exactly one deterministic success-write attempt.
7. Abort/error paths never emit success rows.
8. Step 7+ boundaries remain preserved.

## Step 6 Exit Criteria

Do not start Step 7 until all of these are true:

1. Step 6 taskboard is complete.
2. `/bind` streams ordered token events and one terminal event.
3. Canonical order is guaranteed server-side regardless of request ordering.
4. Burst-limiter and abuse-telemetry guardrails are present and deterministic.
5. Successful bind completion writes one deterministic history row.
6. Abort/error paths do not create success history rows.
7. Step 6 validation/canonical/stream/persistence/abuse tests pass.
8. No Step 7+ extension or UX behavior was implemented early.

## Short Version You Can Remember

1. Lock Step 6 scope before touching bind code.
2. Replace placeholder `/bind` behavior with routed model+prompt streaming orchestration.
3. Enforce canonical ordering server-side before final assembly.
4. Add short-window burst-limiter and abuse-telemetry guardrails before provider calls.
5. Serialize provider output into deterministic `token | done | error` SSE frames.
6. Persist one successful history row for each successful bind completion.
7. Add bind-focused tests for canonical order, stream behavior, persistence semantics, and abuse guardrails.
8. Hand off to Step 7 only after Step 6 boundaries are clean.