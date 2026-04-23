# Step 6 Planning Blueprint (/bind Route SSE Final Assembly + History Write)

This document records the completed design and planning outputs for Step 6.
It is aligned with:

- `docs/ARCHITECTURE.md`
- `docs/BACKEND_API.md`
- `docs/CLAUSE_PIPELINE.md`
- `docs/DATA_MODELS.md`
- `docs/LLM_ROUTING.md`
- `docs/UX_FLOW.md`
- `docs/agent_plans/v1_overarching_plan.md`
- `docs/agent_plans/v1_step_by_step/v1_step_5.md`
- `docs/agent_plans/v1_step_by_step/v1_step_6.md`

## 6.1 Scope Lock and Source of Truth

### Phase 6 decision lock matrix

The following decisions are now locked for implementation and must not be re-opened in Step 6 execution unless a source-of-truth doc changes first.

| Decision area | Locked choice (Phase 6) | Why this is locked now | Downstream dependency |
|---|---|---|---|
| `/bind` transport contract | `/bind` remains `POST` + `text/event-stream`, emitting ordered `token` events and one terminal event (`done` or `error`) in the shared envelope. | Background bridge and bind-preview flows depend on deterministic stream framing. | 6.6 stream serialization, 6.8 stream contract tests |
| Router path invariant | `/bind` always resolves model config through `selectModel({ callType: "bind", tier, mode, byokConfig })`; no route-level provider policy branching. | Keeps routing policy centralized in Step 3 service surfaces and avoids drift. | 6.3 handoff wiring, 6.8 routing assertions |
| Prompt-assembly invariant | `/bind` prompt text is built via Step 3 bind prompt assembly (`prepareBindServiceHandoff`); route handlers do not inline bind templates. | Preserves deterministic prompt behavior and keeps canonical-order logic centralized. | 6.4 bind assembly, 6.8 prompt-handoff tests |
| Canonical-order invariant | Server canonicalizes and sorts sections from `goal_type` slot mapping (`context -> tech_stack -> constraint -> action -> output_format -> edge_case`) and never trusts client order. | Final bind quality and cross-layer consistency depend on one canonical order source. | 6.4 canonicalization checks, 6.8 out-of-order input tests |
| Abuse-guardrail invariant | Protected LLM routes apply short-window per-account burst checks and emit abuse telemetry signals before provider calls. | Limits account-level high-frequency exploitation and preserves forensic visibility without consuming provider budget first. | 6.5 limiter/telemetry slice, 6.8 abuse-path tests |
| SSE boundary rule | Provider adapters emit object events only; SSE string framing remains route/lib transport responsibility. | Keeps provider abstraction clean and transport behavior testable. | 6.6 SSE utility integration |
| Terminal/idempotency rule | Stream emits exactly one terminal outcome; no duplicate `done` or mixed terminal events after abort/error. | Prevents dangling bind states in downstream consumers. | 6.6 terminal guards, 6.8 terminal-event tests |
| Persistence-write coupling | On successful bind completion, exactly one `enhancement_history` write is attempted before the terminal `done` event is finalized. | Step 6 explicitly owns successful bind history persistence and auditability. | 6.7 history write wiring, 6.8 persistence-path tests |
| History payload policy | History writes record deterministic `raw_input`, `final_prompt`, `mode`, `model_used`, and `section_count`; `project_id` remains nullable. | Current bind request shape does not include explicit raw-input/project payload fields, but DB schema still requires non-null `raw_input`. | 6.7 payload shaping, residual-risk tracking |
| Error/abort policy | Provider/persistence failures map to deterministic non-leaky SSE `error` events; abort/error paths do not create success history rows. | Ensures contract-safe failures while preserving data integrity semantics. | 6.6 error mapping, 6.7 write gating, 6.8 failure-path tests |
| Step boundary rule | Step 6 implements `/bind` backend orchestration and successful persistence only; Step 7 extension bridge and Step 8+ UX/commit behavior remain deferred. | Preserves sequence and avoids integration churn. | 6.9 handoff, Step 7+ readiness |

### Step 6 scope in one paragraph

Step 6 replaces placeholder `/bind` behavior with production SSE final-assembly orchestration while preserving Step 2 middleware guarantees, Step 3 service-layer contracts (router, bind prompt assembly, provider adapters), and Step 5 stream-envelope semantics. The route must validate bind inputs, canonicalize sections server-side, resolve model and bind prompt handoff deterministically, stream provider output through the shared SSE envelope, and persist one successful `enhancement_history` record on successful completion. This phase must not absorb Step 7 extension stream-bridge behavior or Step 8+ content state/commit behavior.

### Step 6 deliverables extracted from the overarching plan

1. Final assembly endpoint that binds accepted expanded sections.
2. Server-side canonical ordering enforcement (never trust client order).
3. Bind prompt assembly with mode-specific formatting instructions.
4. Streaming bind output over the unified SSE envelope.
5. Successful completion write to `enhancement_history`.
6. Per-account burst-limiter and abuse telemetry guardrails before provider calls.
7. Tests for completion, cancel, provider-error mapping, persistence behavior, duplicate/redundant section handling, and abuse guardrails.

### Runtime-deferred implementation surface for this planning pass

The following runtime files are intentionally deferred until Phase F execution slices:

1. `backend/src/services/routeHandlers.ts` (`bindRouteHandler` production behavior)
2. `backend/src/services/history.ts` (history persistence implementation)
3. `backend/src/services/rateLimit.ts` and `backend/src/middleware/ratelimit.ts` (burst-limiter and abuse-telemetry implementation)
4. `backend/src/services/supabase.ts` (shared client/export wiring only if required)
5. `backend/src/lib/sse.ts` (only if stream framing helpers are expanded)
6. `backend/src/services/providers/**` (only if bind adapter selection or abort plumbing needs tightening)
7. `backend/src/lib/schemas.ts` and `shared/contracts/api.ts` (only if bind request constraints change)
8. `backend/src/__tests__/` Step 6 test expansions for bind stream/persistence/abuse behavior

Planning rule:

1. Do not modify runtime behavior files during this docs/planning pass.
2. Implement runtime work in Phase F slice order.
3. Treat runtime edits in this phase as scope creep.

### Source-of-truth file map

| Concern | Source of truth | Why this is canonical |
|---|---|---|
| `/bind` route contract and protected middleware assumptions | `docs/BACKEND_API.md` + `docs/ARCHITECTURE.md` | Defines endpoint shape, middleware path, and proxy-only boundaries. |
| Bind semantics and canonical ordering expectations | `docs/CLAUSE_PIPELINE.md` + `docs/UX_FLOW.md` | Defines canonical-order bind behavior consumed by extension flows. |
| Model and provider routing behavior for bind calls | `docs/LLM_ROUTING.md` | Locks call-type/tier/mode routing behavior. |
| Bind persistence schema requirements | `docs/DATA_MODELS.md` | Defines required `enhancement_history` write shape. |
| Protected-route burst guardrails | `docs/BACKEND_API.md` + `docs/ARCHITECTURE.md` | Defines the route/middleware boundary for deterministic burst-throttle and abuse-telemetry enforcement. |
| Shared request/event contracts | `shared/contracts/api.ts`, `shared/contracts/sse.ts`, `backend/src/lib/schemas.ts` | Keeps runtime validation and transport typing aligned. |
| Existing orchestration and persistence surfaces | `backend/src/services/routeHandlers.ts`, `backend/src/services/history.ts`, `backend/src/routes/bind.ts` | Defines implementation target for placeholder replacement. |
| Step-level acceptance criteria | `docs/agent_plans/v1_step_by_step/v1_step_6.md` | Defines execution checklist and done criteria. |

### Step 6 out of scope

1. No Step 7 extension background/content stream-bridge implementation.
2. No Step 8-11 content instrumentation, acceptance queue, hotkey wiring, or commit behavior changes.
3. No Step 12 popup/account UX changes.
4. No Step 13 broad observability/security hardening beyond minimal Step 6 needs.
5. No Step 2 auth/rate/tier policy changes.
6. No v2 project-context ingestion/retrieval behavior changes.

## 6.2 Planning Surface and Documentation Boundary

### Numbering convention

1. Taskboard execution numbering (`6.x`) lives in `docs/agent_plans/v1_step_by_step/v1_step_6.md`.
2. This planning blueprint uses decision labels (`D1..D9`) plus file-level slices for dependency mapping.
3. If numbering appears to overlap, treat the taskboard as execution order and this blueprint as decision lock.

### Planning-only rule for this pass

1. This file is the scope-lock and contract-alignment reference for Step 6.
2. Session choreography and approval preferences are intentionally excluded.
3. Execution workflow details live in the Step 6 taskboard and repository-wide agent instructions.

### Documentation consistency targets

1. Keep `/bind` contract language aligned across planning, taskboard, and source-of-truth docs.
2. Keep requirements at contract level (`what must be true`), not line-level implementation instructions.
3. Keep Step 7+ deferments explicit so Step 6 execution does not absorb downstream behavior.

## Design Decisions for Step 6 Execution

### Decision D1: `/bind` remains SSE-first with one deterministic terminal outcome

Rationale:

1. Bind output is user-visible review content and benefits from streaming latency characteristics.
2. Extension preview UX expects tokenized ghost-text updates.
3. One terminal outcome prevents dangling bind state.

Planning rule:

1. Keep `/bind` response type as `text/event-stream`.
2. Emit ordered `token` events.
3. End each stream with one deterministic terminal event (`done` or `error`).

### Decision D2: Bind routing and token budgets remain on Step 3 router contracts

Rationale:

1. Routing policy ownership belongs to `services/llm.ts`.
2. Tier and mode behavior must stay centralized to avoid route-level drift.
3. BYOK behavior remains config-injected, not route-local policy logic.

Planning rule:

1. Resolve model only through `selectModel` with `callType: "bind"`.
2. Respect tier/mode semantics from Step 3 surfaces.
3. Keep BYOK handling as injected config, not bind-route branching logic.

### Decision D3: Canonical sorting and bind prompt assembly remain service-driven

Rationale:

1. Canonical bind ordering is already encoded in shared prompt/assembly surfaces.
2. Route handlers should orchestrate transport and persistence, not author bind template text.
3. Keeping canonicalization in one place prevents hidden alternate order maps.

Planning rule:

1. Use `prepareBindServiceHandoff` or equivalent service entrypoint.
2. Keep route files free of inline bind-template literals.
3. Ensure canonical section order comes from goal-type map, not request order.

### Decision D4: SSE serialization stays at route/lib transport boundary

Rationale:

1. Provider adapters intentionally emit object events, not SSE strings.
2. Route boundary owns HTTP stream framing and headers.
3. Shared framing utility avoids per-route divergence.

Planning rule:

1. Convert provider object events to shared `StreamEvent` envelope at route/lib boundary.
2. Serialize through shared SSE framing helper or exact `data: ...\n\n` framing.
3. Do not emit raw provider payload frames directly to clients.

### Decision D5: Terminal-event handling must be idempotent and abort-safe

Rationale:

1. Bind cancellation must stop streaming and avoid duplicate terminal events.
2. Multiple terminal frames can corrupt client bind state.
3. Step 7 bridge depends on deterministic cancellation semantics.

Planning rule:

1. Pass `c.req.raw.signal` through provider stream request path.
2. Stop forwarding token events immediately after abort.
3. Guard terminal emission so only one terminal outcome can be sent.
4. Before emitting terminal `done` or `error` after asynchronous post-generation work (including history writes), check `c.req.raw.signal.aborted` and return without writing if aborted.

### Decision D6: Successful bind persistence is coupled to successful stream completion

Rationale:

1. Step 6 explicitly requires history persistence on successful completion.
2. Persisting before final terminal success keeps audit state and user-visible success aligned.
3. Post-`done` write failures are harder to surface deterministically.

Planning rule:

1. Build the final prompt buffer while token events stream.
2. Attempt one history write before emitting terminal `done`.
3. If persistence fails before terminal success, emit deterministic SSE `error` and do not emit `done`.

### Decision D7: History payload shaping stays compatible with current bind request contract

Rationale:

1. Current bind request shape does not include explicit `raw_input` or `project_id` fields.
2. `enhancement_history.raw_input` is required by schema.
3. Step 6 should avoid forcing extension payload migration unless source-of-truth docs are updated.

Planning rule:

1. Derive deterministic `raw_input` by JSON serializing the validated client-provided bind sections array, preserving per-section structure (`canonical_order`, `goal_type`, `expansion`) and array order.
2. Do not collapse sections into one flattened concatenated string when deriving `raw_input`.
3. Keep `project_id` nullable (`null`) unless a contract update is explicitly approved.
4. Persist `mode`, `model_used`, and `section_count` deterministically.

### Decision D8: Abort/error paths never create success history rows

Rationale:

1. Successful history rows should represent completed successful binds only.
2. Abort/error persistence in the success table pollutes analytics and audit signals.
3. Failure telemetry belongs to observability surfaces, not success history rows.

Planning rule:

1. Only write success history when terminal outcome is `done`.
2. Skip success-write path for abort and provider/persistence errors.
3. Keep error payloads deterministic and non-leaky.

### Decision D9: Step boundary is strict (`/bind` backend orchestration + success persistence only)

Rationale:

1. Step sequence intentionally separates backend bind completion from extension transport and UX steps.
2. Scope bleed into Step 7+ increases integration churn.
3. Existing step cadence depends on strict handoff boundaries.

Planning rule:

1. Implement only `/bind` production backend behavior in this step.
2. Keep Step 7 extension bridge behavior unchanged.
3. Keep Step 8+ UX/hotkey/commit behavior unchanged.

## File-Level Plan for Remaining Step 6 Slices

### 6.3 Route validation and bind service-handoff wiring

- `backend/src/services/routeHandlers.ts`
- `backend/src/lib/schemas.ts` (only if bind request bounds tighten)
- `backend/src/services/llm.ts` (only for handoff export/import wiring)

Dependencies: Step 3 router/prompt surfaces and Step 5 streaming contract behavior.

Execution order constraint:

1. Preserve existing JSON parse and schema-validation flow.
2. Resolve model/prompt handoff via `prepareBindServiceHandoff`.
3. Keep middleware assumptions untouched.

### 6.4 Canonicalization and bind prompt assembly enforcement

- `backend/src/services/routeHandlers.ts`
- `backend/src/services/prompts/bind.ts` (only if bind-template directives need tightening)
- `backend/src/services/llm.ts` (only if canonical handoff surface needs refinement)

Dependencies: 6.3 handoff wiring complete.

Execution order constraint:

1. Canonicalize sections from goal-type mapping.
2. Ensure out-of-order client input yields deterministic canonical prompt assembly.
3. Keep canonical ordering source centralized (no alternate route-local map).

### 6.5 Short-window burst limiter and abuse telemetry guardrails

- `backend/src/services/rateLimit.ts`
- `backend/src/middleware/ratelimit.ts`
- `backend/src/services/history.ts` (or a dedicated abuse telemetry service if introduced)
- `backend/src/__tests__/ratelimit.integration.test.ts`
- `backend/src/__tests__/rateLimit.service.test.ts`
- `supabase/migrations/**` (only if a dedicated abuse-signal table/columns are explicitly approved)

Dependencies: Step 2 rate-limit semantics and 6.3-6.4 route/prompt wiring.

Execution order constraint:

1. Apply burst checks before provider calls on protected LLM routes.
2. Persist deterministic abuse telemetry without leaking provider or secret data.
3. Keep enforcement deterministic even if telemetry persistence fails.

### 6.6 Provider-event to SSE envelope streaming for bind

- `backend/src/services/routeHandlers.ts`
- `backend/src/lib/sse.ts`
- `backend/src/services/providers/**` (only if adapter lifecycle hooks need tightening)

Dependencies: 6.3-6.5 complete.

Execution order constraint:

1. Consume provider object events.
2. Serialize deterministic `token | done | error` SSE events.
3. Enforce single terminal outcome and abort-safe cleanup.

### 6.7 Successful enhancement-history persistence wiring

- `backend/src/services/routeHandlers.ts`
- `backend/src/services/history.ts`
- `backend/src/services/supabase.ts` (only if shared client/export support is required)

Dependencies: 6.6 stream behavior complete.

Execution order constraint:

1. Accumulate final bind output while streaming token events.
2. On success path, write exactly one `enhancement_history` row before terminal `done`.
3. Keep write failures deterministic and stream-safe (`error` terminal if `done` not yet sent).
4. Read `userId` strictly from middleware-populated Hono context (`c.get("userId")`); do not decode JWT in-route or re-run Supabase auth verification inside `bindRouteHandler`.
5. Derive `raw_input` using structured JSON serialization of validated bind sections; preserve section boundaries and order.

### 6.8 Test matrix expansion

- `backend/src/__tests__/bind.route.test.ts` (new)
- `backend/src/__tests__/routes.validation.test.ts` (if bind validation envelopes are expanded)
- `backend/src/__tests__/llm.handoff.test.ts` (if bind handoff assertions are expanded)
- `backend/src/__tests__/stress-tests.test.ts` (if bind cancel/stream stress checks are added)

Dependencies: 6.3-6.7 runtime behavior complete.

Test boundary rule:

1. Cover malformed JSON and bind-schema validation failures.
2. Cover out-of-order section input producing canonical bind behavior.
3. Cover happy-path token stream completion with one terminal `done`.
4. Cover provider error mapping into deterministic SSE `error` behavior.
5. Cover client-abort cleanup behavior.
6. Cover successful history write invocation exactly once.
7. Cover history-write failure behavior (`error` terminal, no `done`).
8. Cover duplicate/redundant section handling expectations in canonical bind assembly.
9. Keep tests network-isolated with deterministic adapter stubs/mocks.

### 6.9 Final review and handoff

- `docs/agent_plans/v1_step_by_step/v1_step_6.md` (checkbox status)
- `logging/progress_log.md`

Dependencies: all prior Step 6 slices complete and verified.

## Risk Register and Mitigations

1. Risk: client-provided section order is trusted accidentally.
   Mitigation: canonicalize server-side from goal-type mapping before bind prompt assembly.
2. Risk: stream emits duplicate or conflicting terminal events.
   Mitigation: terminal idempotency guard and explicit abort/error completion paths.
3. Risk: provider failures leak internals to clients.
   Mitigation: deterministic non-leaky SSE error mapping.
4. Risk: successful binds do not persist history reliably.
   Mitigation: gate terminal `done` behind successful write attempt.
5. Risk: persistence failures break stream semantics unpredictably.
   Mitigation: deterministic `error` terminal mapping before `done` is sent.
6. Risk: Step 6 scope bleeds into Step 7+ extension/UX behavior.
   Mitigation: explicit deferred file list and slice stop conditions.
7. Risk: raw-input history payload semantics are ambiguous under current request contract.
   Mitigation: lock deterministic derivation policy and document contract-extension follow-up if needed.

## Phase E - Consistency Gate Before Implementation Handoff

Goal: verify planning and source-of-truth surfaces are aligned before Step 6 runtime implementation begins.

Required checks:

1. Cross-doc consistency check across:
   - `docs/agent_plans/v1_step_by_step/v1_step_6.md`
   - `docs/agent_plans/v1_step_by_step/v1_step_6_planning.md`
   - `docs/BACKEND_API.md`
   - `docs/CLAUSE_PIPELINE.md`
   - `docs/LLM_ROUTING.md`
   - `docs/DATA_MODELS.md`
2. Confirm Step 6 docs do not require Step 7+ extension/UX implementation.
3. Confirm canonical-order language is consistent across bind docs.
4. Confirm success-write semantics are explicit for `enhancement_history`.

Phase E pass criteria:

1. `/bind` stream and persistence boundaries are explicit and non-conflicting.
2. Step 6 docs preserve Step 7+ separation.
3. Runtime handoff sequence is complete and deterministic.

## Phase F - Implementation Handoff Sequence

Goal: define execution order after planning lock, without implementing runtime behavior in this planning pass.

Slice sequence:

1. Slice 1: bind validation and model/prompt handoff integration.
2. Slice 2: canonical bind section ordering enforcement in route handoff.
3. Slice 3: short-window burst-limiter and abuse-telemetry guardrails.
4. Slice 4: provider-event to SSE envelope streaming with terminal guards.
5. Slice 5: successful enhancement-history write integration.
6. Slice 6: test matrix expansion for validation/completion/cancel/error/persistence/abuse behavior.
7. Slice 7: final criteria audit and progress-log update.

Slice stop conditions (for execution pass):

1. Slice 1 stop: `/bind` handoff is deterministic and schema-safe.
2. Slice 2 stop: canonical order is guaranteed server-side regardless of request ordering.
3. Slice 3 stop: burst-throttle enforcement and abuse telemetry are deterministic before provider calls.
4. Slice 4 stop: stream emits ordered tokens and exactly one terminal event.
5. Slice 5 stop: successful bind completion writes one deterministic history row.
6. Slice 6 stop: Step 6 bind behavior is covered by deterministic tests.
7. Slice 7 stop: Step 6 acceptance criteria map cleanly to code/tests with no Step 7+ bleed.

Stop condition for this planning pass:

1. Do not implement backend runtime behavior here.
2. End after planning/docs consistency and handoff order are complete.
3. Runtime implementation begins only in a dedicated execution pass that follows this slice order.

## Planning Completion Status

Step 6 planning/design tasks are complete when:

1. Scope and out-of-scope boundaries are explicit.
2. File map and dependency order are explicit.
3. Stream, canonical-order, and persistence decisions are locked.
4. Test boundaries and handoff stop conditions are explicit.

Status: Planning complete; runtime execution remains deferred to Phase F slices.