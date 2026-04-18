# Step 5 Planning Blueprint (/enhance Route SSE Expansion)

This document records the completed design and planning outputs for Step 5.
It is aligned with:

- `docs/ARCHITECTURE.md`
- `docs/BACKEND_API.md`
- `docs/CLAUSE_PIPELINE.md`
- `docs/LLM_ROUTING.md`
- `docs/UX_FLOW.md`
- `docs/agent_plans/v1_overarching_plan.md`
- `docs/agent_plans/v1_step_by_step/v1_step_4.md`
- `docs/agent_plans/v1_step_by_step/v1_step_5.md`

## 5.1 Scope Lock and Source of Truth

### Phase 5 decision lock matrix

The following decisions are now locked for implementation and must not be re-opened in Step 5 execution unless a source-of-truth doc changes first.

| Decision area | Locked choice (Phase 5) | Why this is locked now | Downstream dependency |
|---|---|---|---|
| `/enhance` transport contract | `/enhance` remains `POST` + `text/event-stream`, emitting ordered `token` events and one terminal event (`done` or `error`) in the shared envelope. | Background bridge and content preview flows depend on deterministic stream framing. | 5.4 stream serialization, 5.7 stream contract tests |
| Router path invariant | `/enhance` always resolves model config through `selectModel({ callType: "enhance", tier, mode, byokConfig })`; no route-level provider policy branching. | Keeps routing policy centralized in Step 3 service surfaces and avoids drift. | 5.3 handoff wiring, 5.7 routing assertions |
| Prompt-assembly invariant | `/enhance` prompt text is built via Step 3 prompt factories; route handlers do not inline prompt templates. | Preserves deterministic prompt behavior and prevents route-level duplication. | 5.3 service handoff, 5.7 prompt-handoff tests |
| Sibling-context policy | Sibling context injection is explicit and bounded per Step 3 serializer rules; absent siblings produce no injected sibling block. | Prevents prompt growth drift and preserves deterministic template behavior. | 5.3 handoff assembly, 5.7 sibling tests |
| SSE boundary rule | Provider adapters emit object events only; SSE string framing remains route/lib transport responsibility. | Keeps provider abstraction clean and transport behavior testable. | 5.4 SSE utility integration |
| Abort/cleanup policy | Client disconnect/cancel must propagate abort to provider requests and release stream/network resources promptly. | Step 7 bridge and UX cancel semantics require deterministic backend cleanup. | 5.5 abort handling, 5.7 cancel tests |
| Error mapping policy | Provider-specific failures map to deterministic non-leaky SSE `error` events; no raw provider payload leakage to clients. | Keeps client envelope stable and protects internal provider details. | 5.4 error framing, 5.7 error-path tests |
| Metadata policy | Step 5 captures request/stream metadata for usage/observability in a non-blocking path; metadata failures must not break stream delivery. | Improves diagnosability while preserving streaming UX reliability. | 5.6 metadata capture, Step 13 observability hardening |
| Step boundary rule | Step 5 implements `/enhance` backend orchestration only; Step 6 `/bind` production behavior and Step 7 extension bridge behavior remain deferred. | Preserves sequencing and avoids integration churn. | 5.8 handoff, Step 6 and Step 7 readiness |

### Step 5 scope in one paragraph

Step 5 replaces placeholder `/enhance` behavior with production SSE expansion orchestration while preserving Step 2 middleware guarantees, Step 3 service-layer contracts (router, prompt templates, provider adapters), and Step 4 section-shape compatibility. The route must validate inputs, resolve model and prompt handoff deterministically, stream provider events through the shared SSE envelope, enforce abort-safe cleanup, and map provider failures into deterministic non-leaky terminal behavior. This phase must not absorb Step 6 bind/history completion behavior or Step 7 extension streaming-bridge implementation.

### Step 5 deliverables extracted from the overarching plan

1. Streaming expansion endpoint using unified SSE envelope.
2. Goal-type-specific expansion quality with mode token budgets.
3. Abort-safe handling on client disconnect.
4. Route-through router/model-selection contract from Step 3.
5. Sibling-context and mode-rule prompt injection.
6. Tests for stream completion, cancel, and provider error mapping.

### Runtime-deferred implementation surface for this planning pass

The following runtime files are intentionally deferred until Phase F execution slices:

1. `backend/src/services/routeHandlers.ts` (`enhanceRouteHandler` production behavior)
2. `backend/src/lib/sse.ts` (if async-iterable stream framing support is expanded)
3. `backend/src/services/context.ts` (only if context lookup behavior is tightened)
4. `backend/src/services/history.ts` (only if Step 5 metadata capture helper is expanded)
5. `backend/src/services/providers/**` (only if abort/error integration helpers are required)
6. `backend/src/lib/schemas.ts` (only if enhance bounds/shape tightening is required)
7. `backend/src/__tests__/` Step 5 test expansions for stream completion/cancel/error behavior

Planning rule:

1. Do not modify runtime behavior files during this docs/planning pass.
2. Implement runtime work in Phase F slice order.
3. Treat runtime edits in this phase as scope creep.

### Source-of-truth file map

| Concern | Source of truth | Why this is canonical |
|---|---|---|
| `/enhance` contract and protected middleware assumptions | `docs/BACKEND_API.md` + `docs/ARCHITECTURE.md` | Defines endpoint shape, middleware path, and proxy-only boundaries. |
| Stream envelope semantics and transport role | `docs/BACKEND_API.md` + `docs/LLM_ROUTING.md` | Locks `token | done | error` envelope and adapter-vs-route boundary. |
| Clause expansion semantics and sibling-context behavior | `docs/CLAUSE_PIPELINE.md` + `docs/LLM_ROUTING.md` | Defines goal-type expansion intent and sibling-context usage. |
| UX-level stream expectations and cancel behavior | `docs/UX_FLOW.md` | Defines stream and cancellation expectations consumed by extension layers. |
| Shared request/event contracts | `shared/contracts/api.ts`, `shared/contracts/sse.ts`, `backend/src/lib/schemas.ts` | Keeps runtime validation and transport typing aligned. |
| Existing orchestration surface | `backend/src/services/routeHandlers.ts`, `backend/src/routes/enhance.ts` | Defines implementation target for placeholder replacement. |
| Step-level acceptance criteria | `docs/agent_plans/v1_step_by_step/v1_step_5.md` | Defines execution checklist and done criteria. |

### Step 5 out of scope

1. No Step 6 `/bind` production orchestration changes.
2. No Step 6 enhancement-history success-write finalization semantics.
3. No Step 7 extension background/content stream bridge implementation.
4. No Step 8+ content UX instrumentation and acceptance-state behavior changes.
5. No Step 2 middleware policy changes (auth/rate/tier semantics stay as-is).

## 5.2 Planning Surface and Documentation Boundary

### Numbering convention

1. Taskboard execution numbering (`5.x`) lives in `docs/agent_plans/v1_step_by_step/v1_step_5.md`.
2. This planning blueprint uses decision labels (`D1..D8`) plus file-level slices for dependency mapping.
3. If numbering appears to overlap, treat the taskboard as execution order and this blueprint as decision lock.

### Planning-only rule for this pass

1. This file is the scope-lock and contract-alignment reference for Step 5.
2. Session choreography and approval preferences are intentionally excluded.
3. Execution workflow details live in the Step 5 taskboard and repository-wide agent instructions.

### Documentation consistency targets

1. Keep `/enhance` contract language aligned across planning, taskboard, and source-of-truth docs.
2. Keep requirements at contract level (`what must be true`), not implementation micro-details (`how to write each line`).
3. Keep Step 6/7 deferments explicit so Step 5 execution does not absorb downstream behavior.

## Design Decisions for Step 5 Execution

### Decision D1: `/enhance` remains SSE-first with one deterministic terminal outcome

Rationale:

1. Expansion quality benefits from token streaming latency characteristics.
2. Extension preview UX depends on ordered token delivery.
3. A single terminal outcome prevents dangling stream state.

Planning rule:

1. Keep `/enhance` response type as `text/event-stream`.
2. Emit ordered `token` events.
3. End each stream with one deterministic terminal event (`done` or `error`).

### Decision D2: `/enhance` routing and budgets must stay on Step 3 service contracts

Rationale:

1. Routing policy ownership belongs to `services/llm.ts`.
2. Mode budgets are already locked in shared router semantics.
3. Route-level model branching would duplicate policy and drift.

Planning rule:

1. Resolve model only through `selectModel` with `callType: "enhance"`.
2. Respect tier and mode semantics from Step 3 surfaces.
3. Keep BYOK handling as injected config, not route-local policy logic.

### Decision D3: Prompt assembly remains factory-driven and goal-type aware

Rationale:

1. Goal-type specialization is already encapsulated in prompt factories.
2. Deterministic prompt tests rely on centralized assembly logic.
3. Route handlers should orchestrate, not author prompt text.

Planning rule:

1. Use `prepareEnhanceServiceHandoff` or equivalent service assembly entrypoint.
2. Keep route files free of inline prompt-template literals.
3. Inject sibling context only through shared serializer rules.

### Decision D4: SSE serialization stays at route/lib transport boundary

Rationale:

1. Provider adapters intentionally emit object events, not SSE strings.
2. Route boundary owns HTTP stream framing and headers.
3. Shared framing utility avoids per-route divergence.

Planning rule:

1. Convert provider object events to `StreamEvent` envelope at route/lib boundary.
2. Preserve required SSE headers and framing syntax.
3. Keep adapters provider-focused and transport-agnostic.

### Decision D5: Abort and disconnect cleanup are first-class correctness requirements

Rationale:

1. Without abort propagation, providers keep generating tokens after client cancel.
2. Resource leaks degrade reliability under concurrent usage.
3. Step 7 bridge relies on deterministic cancel semantics.

Planning rule:

1. Pass request abort signal into provider stream request path.
2. Stop token forwarding immediately after abort.
3. Ensure cleanup runs for success, error, and abort paths.

### Decision D6: Provider failures map to deterministic non-leaky SSE errors

Rationale:

1. Provider payloads are heterogeneous and not client-stable.
2. Client stream consumers require one stable error envelope.
3. Error leakage can expose unnecessary internal details.

Planning rule:

1. Map provider failures to deterministic SSE `error` event shape.
2. Do not leak raw provider payloads or stack traces.
3. Keep terminal-event behavior idempotent.

### Decision D7: Metadata capture must be non-blocking and Step 6-safe

Rationale:

1. Stream UX should not wait on observability writes.
2. Step 6 owns final bind-history completion semantics.
3. Step 5 still needs enough metadata for diagnosis and usage tracking.

Planning rule:

1. Capture request/stream metadata in non-blocking flow.
2. Do not fail stream delivery when metadata capture fails.
3. Defer final prompt-history success-write completion behavior to Step 6.

### Decision D8: Step boundary is strict (`/enhance` backend orchestration only)

Rationale:

1. Step sequence intentionally separates expansion and bind concerns.
2. Extension transport concerns are intentionally deferred to Step 7.
3. Scope bleed increases rework and test churn.

Planning rule:

1. Implement only `/enhance` production behavior in this step.
2. Keep `/bind` behavior unchanged.
3. Keep extension bridge behavior unchanged.

## File-Level Plan for Remaining Step 5 Slices

### 5.3 Route contract hardening and service handoff wiring

- `backend/src/services/routeHandlers.ts`
- `backend/src/lib/schemas.ts` (only if enhance request bounds tighten)
- `backend/src/services/context.ts` (only if context lookup behavior is tightened)
- `backend/src/services/llm.ts` (only for handoff import/export wiring)

Dependencies: Step 3 router/template contracts and Step 4 section-shape compatibility.

Execution order constraint:

1. Preserve existing JSON parse and schema-validation flow.
2. Resolve model/prompt handoff through service-layer surfaces.
3. Keep middleware assumptions untouched.

### 5.4 Stream conversion and SSE framing

- `backend/src/services/routeHandlers.ts`
- `backend/src/lib/sse.ts`
- `shared/contracts/sse.ts` (if envelope typing refinement is needed)

Dependencies: 5.3 handoff wiring complete.

Execution order constraint:

1. Consume provider object events.
2. Serialize as deterministic `token | done | error` SSE events.
3. Keep terminal behavior explicit and singular.

### 5.5 Abort propagation and resource cleanup

- `backend/src/services/routeHandlers.ts`
- `backend/src/lib/sse.ts` (if stream utility cleanup hooks are needed)
- `backend/src/services/providers/http.ts` (only if abort plumbing requires tightening)

Dependencies: 5.4 stream framing behavior.

Execution order constraint:

1. Propagate request abort signal through provider request path.
2. Stop forwarding events on cancellation.
3. Ensure cleanup across success/error/abort paths.

### 5.6 Metadata capture and observability hooks

- `backend/src/services/routeHandlers.ts`
- `backend/src/services/history.ts` (or new usage helper surface)
- `backend/src/lib/http.ts` and/or `backend/src/lib/errors.ts` (only if shared helper extraction is required)

Dependencies: 5.3-5.5 runtime behavior complete.

Execution order constraint:

1. Capture route metadata for start/finish/error.
2. Keep metadata writes non-blocking.
3. Preserve Step 6 history-write boundary.

### 5.7 Test matrix expansion

- `backend/src/__tests__/` Step 5 stream route tests (new/expanded)
- `backend/src/__tests__/routes.validation.test.ts` (if validation envelopes are extended)
- `backend/src/__tests__/stress-tests.test.ts` (if concurrent stream/cancel checks are added)

Dependencies: 5.3-5.6 runtime behavior complete.

Test boundary rule:

1. Cover malformed JSON and schema validation failures.
2. Cover happy-path token stream completion (`done` terminal semantics).
3. Cover provider error mapping into SSE `error` terminal behavior.
4. Cover client-abort/cancel cleanup behavior.
5. Cover model/prompt handoff integration assertions for mode and goal type.
6. Keep network calls mocked/stubbed for deterministic CI behavior.

### 5.8 Final review and handoff

- `docs/agent_plans/v1_step_by_step/v1_step_5.md` (checkbox status)
- `logging/progress_log.md`

Dependencies: all prior Step 5 slices complete and verified.

## Risk Register and Mitigations

1. Risk: stream emits multiple terminal outcomes causing client state ambiguity.
   Mitigation: explicit terminal guard with idempotent completion handling.
2. Risk: abort does not propagate, leaving provider requests running.
   Mitigation: signal propagation from request to provider request and cleanup checks.
3. Risk: route-level provider policy drift.
   Mitigation: model resolution through `selectModel` only.
4. Risk: prompt assembly divergence from factory contract.
   Mitigation: service-handoff helper and deterministic prompt tests.
5. Risk: provider error leakage to client envelope.
   Mitigation: normalized error mapping and envelope-only error emission.
6. Risk: metadata capture blocks stream performance.
   Mitigation: non-blocking capture path with failure isolation.
7. Risk: Step 5 scope bleeds into Step 6 or Step 7.
   Mitigation: explicit deferred file list and slice stop conditions.

## Phase E - Consistency Gate Before Implementation Handoff

Goal: verify planning and source-of-truth surfaces are aligned before Step 5 runtime implementation begins.

Required checks:

1. Cross-doc consistency check across:
   - `docs/agent_plans/v1_step_by_step/v1_step_5.md`
   - `docs/agent_plans/v1_step_by_step/v1_step_5_planning.md`
   - `docs/BACKEND_API.md`
   - `docs/CLAUSE_PIPELINE.md`
   - `docs/LLM_ROUTING.md`
2. Confirm Step 5 docs do not require Step 6 bind behavior or Step 7 extension bridge implementation.
3. Confirm stream envelope and adapter-boundary language is consistent across docs.
4. Confirm abort and error-terminal semantics are explicit.

Phase E pass criteria:

1. `/enhance` stream boundaries are explicit and non-conflicting.
2. Step 5 docs preserve Step 6 and Step 7 separation.
3. Runtime handoff sequence is complete and deterministic.

## Phase F - Implementation Handoff Sequence

Goal: define execution order after planning lock, without implementing runtime behavior in this planning pass.

Slice sequence:

1. Slice 1: route validation and model/prompt handoff integration.
2. Slice 2: provider-event to SSE envelope conversion.
3. Slice 3: abort/disconnect cleanup and terminal idempotency.
4. Slice 4: metadata capture and observability hooks.
5. Slice 5: test matrix expansion for validation/completion/cancel/error behavior.
6. Slice 6: final criteria audit and progress-log update.

Slice stop conditions (for execution pass):

1. Slice 1 stop: `/enhance` handoff is deterministic and schema-safe.
2. Slice 2 stop: stream emits ordered tokens and one terminal event.
3. Slice 3 stop: abort reliably cancels provider/network resources.
4. Slice 4 stop: metadata capture is non-blocking and failure-isolated.
5. Slice 5 stop: Step 5 stream behavior is covered by deterministic tests.
6. Slice 6 stop: Step 5 acceptance criteria map cleanly to code/tests with no Step 6/7 bleed.

Stop condition for this planning pass:

1. Do not implement backend runtime behavior here.
2. End after planning/docs consistency and handoff order are complete.
3. Runtime implementation begins only in a dedicated execution pass that follows this slice order.

## Planning Completion Status

Step 5 planning/design tasks are complete when:

1. Scope and out-of-scope boundaries are explicit.
2. File map and dependency order are explicit.
3. Stream, abort, and error-envelope decisions are locked.
4. Test boundaries and handoff stop conditions are explicit.

Status: Planning complete; runtime execution remains deferred to Phase F slices.