# Step 5 - Implement `/enhance` Route (SSE)

This is the tactical workboard for Step 5 in [v1_overarching_plan.md](../../agent_plans/v1_overarching_plan.md). The goal is to replace placeholder `/enhance` behavior with production streaming expansion orchestration while preserving Step 6 (`/bind`) and Step 7 (extension bridge) boundaries.

Step 5 is done when the repo has:

1. A production `/enhance` route that streams section expansions over the unified SSE envelope.
2. Deterministic model selection for `/enhance` via `callType + tier + mode` routing.
3. Goal-type prompt assembly with mode-aware behavior and sibling-context injection.
4. Route-level SSE serialization that preserves `token | done | error` event semantics.
5. Abort-safe cleanup on client disconnect/cancel, including provider/network resource release.
6. Deterministic provider error mapping into non-leaky SSE `error` events.
7. Request metadata capture for usage/observability without blocking stream delivery.
8. Tests for completion, cancel, provider-error mapping, and validation boundaries.
9. No Step 6 `/bind` orchestration leakage and no Step 7 extension stream-bridge leakage.

## Step 5 Taskboard

### 5.0 Readiness and dependency lock

Goal: ensure Step 3 and Step 4 contracts are stable before Step 5 route work lands.

- [ ] Confirm Step 3 router, prompt-template, and provider-adapter contracts are stable for `/enhance` handoff.
- [ ] Confirm Step 4 `/segment` output shape (`id`, `text`, `goal_type`) remains compatible with `enhanceRequestSchema` section/sibling inputs.
- [ ] Confirm protected middleware order (`auth -> ratelimit -> tier`) still guards `/enhance`.
- [ ] Confirm current `/enhance` route behavior is deterministic placeholder logic and safe to replace.
- [ ] Confirm shared stream-event contract remains `token | done | error`.

Done when:

1. Preconditions are explicit.
2. `/enhance` route assumptions are verified.
3. Step 5 starts from locked Step 3 and Step 4 behavior.

### 5.1 Lock scope and source of truth

Goal: make Step 5 boundaries explicit before coding.

- [ ] Read architecture, backend API, clause pipeline, LLM routing, UX flow, and Step 5 slice in the overarching plan.
- [ ] Extract exact Step 5 deliverables from the overarching plan.
- [ ] Lock explicit out-of-scope boundaries for Step 6 `/bind` orchestration and Step 7 extension stream bridge.
- [ ] Record file-level ownership for route orchestration, SSE transport, and Step 5 test coverage.

Done when:

1. Scope is clear in one paragraph.
2. File ownership is explicit.
3. Out-of-scope constraints are explicit.

### 5.2 Confirm implementation surface and deferments

Goal: keep Step 5 focused on `/enhance` backend streaming behavior only.

- [ ] Confirm Step 5 runtime changes are limited to `/enhance` orchestration and SSE transport surfaces.
- [ ] Confirm `/bind` business logic and history-write completion semantics remain deferred to Step 6.
- [ ] Confirm extension background/content stream forwarding behavior remains deferred to Step 7.
- [ ] Confirm Step 5 tests focus on `/enhance` validation, stream semantics, and abort behavior.

Runtime-deferred implementation files for Step 5:

1. `backend/src/services/routeHandlers.ts` bind-handler production behavior (Step 6) beyond compile-safe touch points.
2. `backend/src/routes/bind.ts` production orchestration behavior (Step 6).
3. `extension/src/background/index.ts` stream-bridge orchestration (Step 7).
4. `extension/src/content/index.ts` token consumption/preview-state transitions (Step 7).
5. Extension popup/account UX surfaces (Step 12).

Done when:

1. File touch surface is explicit and narrow.
2. Deferred Step 6 and Step 7 behavior is explicit.
3. Step 5 execution can start without scope ambiguity.

### 5.3 Implement `/enhance` request validation and service handoff

Goal: replace placeholder expansion assembly with production route-to-service orchestration.

- [ ] Keep existing JSON parse and `enhanceRequestSchema` validation flow in `enhanceRouteHandler`.
- [ ] Resolve project context via `fetchProjectContext(project_id)` while preserving `project_id: null` behavior.
- [ ] Resolve model via `selectModel({ callType: "enhance", tier, mode, byokConfig })`.
- [ ] Build prompt via Step 3 prompt assembly (`prepareEnhanceServiceHandoff` or equivalent) using section goal type, section text, mode, and siblings.
- [ ] Select provider streaming adapter based on resolved model provider.
- [ ] Pass request abort signal into provider stream request for cancellation propagation.
- [ ] Keep auth/rate/tier assumptions unchanged and middleware-driven.

Allowed files for this slice:

- `backend/src/services/routeHandlers.ts`
- `backend/src/services/llm.ts` (only if handoff export wiring needs refinement)
- `backend/src/services/context.ts` (only if context lookup behavior needs tightening)
- `backend/src/services/providers/**` (only if adapter selection helper extraction is required)
- `backend/src/lib/schemas.ts` (only if enhance request constraints are tightened)

Done when:

1. `/enhance` no longer emits placeholder text.
2. Model and prompt handoff is deterministic and typed.
3. Request contract shape is unchanged.

### 5.4 Stream provider events through the unified SSE envelope

Goal: convert normalized provider object events into HTTP SSE frames at the route boundary.

- [ ] Map provider `token` events to shared `StreamEvent` token frames in-order.
- [ ] Emit one terminal `done` frame on successful completion.
- [ ] Map provider error events to deterministic SSE `error` frames without leaking provider internals.
- [ ] Keep SSE serialization in route/lib transport surfaces; use the shared SSE framing helper or exact `data: ...\n\n` framing, and never write raw JSON chunks to the response body.
- [ ] Preserve required SSE headers (`Content-Type`, `Cache-Control`, `Connection`).
- [ ] Finalize response status and headers before the first SSE frame is written; once streaming starts, HTTP status is immutable.
- [ ] Add or extend SSE utility support for async iterable sources where needed.

Allowed files for this slice:

- `backend/src/services/routeHandlers.ts`
- `backend/src/lib/sse.ts`
- `shared/contracts/sse.ts` (only if envelope typing refinement is needed)

Done when:

1. Client receives ordered token frames and one terminal event.
2. SSE envelope matches source-of-truth docs.
3. Response status is committed before streaming begins and does not change mid-stream.
4. Adapter and transport boundaries remain intact.

### 5.5 Implement abort and disconnect cleanup

Goal: release provider/network resources promptly on cancel/disconnect.

- [ ] Propagate request abort/disconnect into provider stream cancellation.
- [ ] Use `c.req.raw.signal` (Hono's request abort signal) for abort propagation; do not use `c.signal` or `req.signal`.
- [ ] Ensure cancelled streams stop token emission promptly.
- [ ] Ensure cleanup executes on success, error, and abort paths.
- [ ] Guard against double-terminal event emission after abort or error.
- [ ] Keep cancel behavior deterministic for Step 7 bridge integration.

Allowed files for this slice:

- `backend/src/services/routeHandlers.ts`
- `backend/src/lib/sse.ts`
- `backend/src/services/providers/http.ts` (only if abort propagation helper tightening is required)

Done when:

1. Abort releases resources and ends streaming promptly.
2. Abort propagation uses the Hono request signal surface, not a hallucinated alias.
3. Terminal-event handling is idempotent.
4. No stale stream state remains after completion or cancellation.

### 5.6 Capture enhance request metadata for usage/observability

Goal: collect Step 5 metadata without blocking stream output.

- [ ] Capture request metadata (`userId`, `tier`, `mode`, `goal_type`, `provider`, `model`, request timestamp/id) for start/finish/error paths.
- [ ] Keep metadata capture non-blocking relative to token streaming.
- [ ] Ensure metadata-capture failures do not break stream contract behavior.
- [ ] Keep final prompt history-write completion semantics deferred to Step 6 bind flow.

Allowed files for this slice:

- `backend/src/services/routeHandlers.ts`
- `backend/src/services/history.ts` (or a new usage helper surface)
- `backend/src/lib/errors.ts` or `backend/src/lib/http.ts` (only if shared envelope helpers are needed)

Done when:

1. Metadata capture behavior is explicit and deterministic.
2. Stream behavior remains stable even when logging fails.
3. Step 6 history-write boundary is preserved.

### 5.7 Add Step 5 test matrix

Goal: prove `/enhance` behavior across validation, completion, cancel, and provider-failure paths.

- [ ] Add tests for malformed JSON and request-schema validation failures.
- [ ] Add tests for successful token stream completion and terminal `done` semantics.
- [ ] Add tests for provider error mapping into SSE `error` events.
- [ ] Add tests for client-abort/cancel behavior and cleanup guarantees.
- [ ] Add tests that `/enhance` route uses mode-aware model selection and goal-type prompt assembly handoff.
- [ ] Add tests for `project_id: null` behavior and sibling-context pass-through.
- [ ] Keep tests network-isolated with deterministic adapter stubs/mocks.

Done when:

1. `/enhance` stream contract behavior is regression-resistant.
2. Cancel and error paths are deterministic and test-covered.
3. Step boundary with Step 6 and Step 7 remains intact.

### 5.8 Final review and handoff

Goal: ensure Step 5 is complete and Step 6 can begin without reopening `/enhance` decisions.

- [ ] Review diff against Step 5 acceptance criteria.
- [ ] Confirm `/enhance` stream contract across happy and degraded paths.
- [ ] Confirm no Step 6 `/bind` behavior landed early.
- [ ] Confirm no Step 7 extension stream-bridge behavior landed early.
- [ ] Confirm tests cover validation, completion, cancel, and provider error mapping.
- [ ] Update progress logs and note deferred Step 6 concerns.

Done when:

1. Step 5 taskboard is reflected in code and tests.
2. Step 6 can start without reopening `/enhance` route/stream design decisions.
3. Out-of-scope behavior remains deferred.

## Step 5 Quality Bar

Treat Step 5 as production streaming route work, not temporary scaffolding.

1. Every valid `/enhance` request returns deterministic SSE envelope events.
2. Model and prompt assembly are deterministic by `callType`, `tier`, `mode`, and `goal_type`.
3. Token ordering is preserved and terminal-event behavior is explicit.
4. Abort/disconnect cleanup reliably releases provider/network resources.
5. Provider failures map to deterministic non-leaky SSE error behavior.
6. Step 6 and Step 7 boundaries remain preserved.

## Step 5 Exit Criteria

Do not start Step 6 until all of these are true:

1. Step 5 taskboard is complete.
2. `/enhance` streams ordered token events and one terminal event.
3. Abort/cancel paths release provider/network resources promptly.
4. Provider failures map to deterministic SSE error events without internal-leak behavior.
5. Metadata capture for usage/observability is active and non-blocking.
6. Step 5 validation/completion/cancel/error-mapping tests pass.
7. No Step 6 `/bind` or Step 7 extension bridge behavior was implemented early.

## Short Version You Can Remember

1. Lock Step 5 scope before touching stream code.
2. Replace placeholder `/enhance` behavior with routed model+prompt streaming orchestration.
3. Serialize provider events into deterministic `token | done | error` SSE frames.
4. Make abort/disconnect cleanup deterministic and idempotent.
5. Add stream-focused tests for completion, cancel, and provider errors.
6. Hand off to Step 6 only after Step 5 boundaries are clean.