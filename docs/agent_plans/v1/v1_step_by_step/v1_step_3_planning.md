# Step 3 Planning Blueprint (LLM Service and Prompt Template System)

This document records the completed design and planning outputs for Step 3.
It is aligned with:

- `docs/ARCHITECTURE.md`
- `docs/BACKEND_API.md`
- `docs/LLM_ROUTING.md`
- `docs/CLAUSE_PIPELINE.md`
- `docs/UX_FLOW.md`
- `docs/agent_plans/v1_overarching_plan.md`
- `docs/agent_plans/v1_step_by_step/v1_step_2.md`
- `docs/agent_plans/v1_step_by_step/v1_step_3.md`

## 3.1 Scope Lock and Source of Truth

### Phase 3 decision lock matrix

The following decisions are now locked for implementation and must not be re-opened in Step 3 execution unless a source-of-truth doc changes first.

| Decision area | Locked choice (Phase 3) | Why this is locked now | Downstream dependency |
|---|---|---|---|
| Routing key contract | Model selection key is `{callType, tier, mode}` and resolves through one deterministic router table in `backend/src/services/llm.ts`. | Prevents route-specific ad hoc branching and keeps Step 4-6 integration deterministic. | 3.3 router implementation, 3.7 matrix tests |
| Segment model invariant | `/segment` always routes to the cheapest fast classifier path regardless of mode and tier. | Segment is classification-only and must remain cost/latency optimized. | 3.3 routing matrix, Step 4 `/segment` integration |
| Tier/provider routing guard | Free generation routes are Groq-only, pro routes are mode-sensitive Anthropic paths, and BYOK routes use user-owned credentials and user-configured provider/model settings without changing the route contract. | Preserves Step 2 tier assumptions and prevents unauthorized paid-model drift. | 3.3 router matrix, 3.7 policy tests |
| BYOK route contract | BYOK keeps the same request/response envelopes as managed tiers; only credential source and selected provider/model differ. | Prevents accidental endpoint or payload drift while leaving routing deterministic. | 3.3–3.6 handoff helpers, 3.7 contract tests |
| Mode token-budget policy | Token budgets are mode-bound (`efficiency`, `balanced`, `detailed`) and are not tier-bound. | Keeps verbosity control deterministic and decoupled from tier entitlement. | 3.3 budget helper, 3.4 templates, 3.7 tests |
| Prompt-factory contract | Prompt templates are pure deterministic factories per goal type plus bind; route handlers do not inline prompt text. | Prevents route-level duplication and keeps deterministic prompt quality checks possible. | 3.4 prompt modules, 3.6 handoff helpers |
| Sibling-context policy | `/enhance` prompt assembly injects sibling context only when present, with explicit formatting and bounded size semantics. | Preserves quality gains without unbounded prompt growth or hidden context leakage. | 3.4 template serializer, Step 5 route orchestration |
| Bind canonical-order contract | Bind prompt assembly always enforces canonical slot order and redundancy-reduction intent before final output formatting. | Maintains non-destructive compile semantics and prevents order drift from client payloads. | 3.4 bind template, Step 6 bind behavior |
| Provider adapter normalization | Groq and Anthropic stream adapters normalize to shared SSE semantics (`token`, `done`, `error`) with deterministic error mapping. | Keeps Step 5-6 streaming routes provider-agnostic and testable. | 3.5 adapter layer, Step 5/6 route wiring |
| Docs-first boundary for this pass | Planning/docs updates are completed first; Step 3 runtime implementation follows in execution slices after consistency gate. | Prevents hidden scope creep while locking router/template intent. | Phase E consistency gate, Phase F handoff |

### Step 3 scope in one paragraph

Step 3 replaces placeholder LLM service surfaces with deterministic routing and assembly primitives: implement the provider/model router in `llm.ts`, implement prompt-template factories for every supported `goal_type` plus bind assembly, define provider streaming adapters for Groq and Anthropic, and add transient-failure retry/backoff behavior with deterministic error mapping. This phase must preserve proxy-only architecture, maintain Step 2 tier assumptions, and keep production route behavior for `/segment`, `/enhance`, and `/bind` deferred to Steps 4-6 so that service-layer contracts harden first.

### Step 3 deliverables extracted from the overarching plan

1. `llm.ts` router that selects provider and model by `{callType, tier, mode}`.
2. Prompt template modules for each goal type plus bind prompt.
3. Streaming adapter abstractions for Groq and Anthropic.
4. Sibling-context injection support for enhance prompt assembly.
5. Retry and backoff behavior for transient provider errors.
6. Unit tests for router matrix and prompt determinism.

### Runtime-deferred implementation surface for this planning pass

The following route behavior files are intentionally deferred to Step 4-6 execution slices:

1. `backend/src/routes/segment.ts` (Step 4 production classification behavior)
2. `backend/src/routes/enhance.ts` (Step 5 production streaming orchestration)
3. `backend/src/routes/bind.ts` (Step 6 production bind orchestration and history write)

Planning rule:

1. Do not implement route-level business behavior in this planning pass.
2. Implement Step 3 service-layer contracts first, then wire routes in the designated steps.
3. Treat early Step 4-6 route implementation edits as scope creep.

### Source-of-truth file map

| Concern | Source of truth | Why this is canonical |
|---|---|---|
| Router matrix and provider/tier/mode policy | `docs/LLM_ROUTING.md` | Defines canonical provider/model intent by call type, tier, and mode. |
| Route contract and middleware context assumptions | `docs/BACKEND_API.md` | Defines protected route behavior and Step boundary expectations. |
| Clause semantics, sibling context, and bind assembly intent | `docs/CLAUSE_PIPELINE.md` | Defines clause lifecycle and canonical bind order behavior. |
| Architecture and proxy-only boundaries | `docs/ARCHITECTURE.md` + `.github/copilot-instructions.md` | Enforces backend-only provider access and process boundaries. |
| Shared domain/type surfaces | `shared/contracts/**`, `backend/src/types.ts` | Keeps tier/mode/goal-type contract reuse deterministic. |
| Step-level acceptance criteria | `docs/agent_plans/v1_step_by_step/v1_step_3.md` | Defines executable checklist and done criteria for Step 3. |

### Step 3 out of scope

1. No Step 4 `/segment` production classification output behavior in route handlers.
2. No Step 5 `/enhance` route streaming orchestration or abort handling implementation.
3. No Step 6 `/bind` route production orchestration or history persistence.
4. No extension-side streaming bridge, state machine, or UX behavior changes.
5. No new tier enforcement or rate-limit behavior changes already owned by Step 2.

## 3.2 Copilot Workflow Surface Plan

### Numbering convention

1. Taskboard execution numbering (`3.x`) lives in `docs/agent_plans/v1_step_by_step/v1_step_3.md`.
2. This planning blueprint uses decision labels (`D1..D8`) and file-level slices for dependency mapping.
3. If numbering appears to overlap, treat the taskboard as execution order and this blueprint as design lock.

### Always-on instruction surfaces (confirmed)

1. `.github/copilot-instructions.md`
2. `.github/skills/SKILL_MAP.md`
3. `.github/skills/*/SKILL.md` (loaded per task classification)

### Reusable prompt surfaces (recommended)

1. `.github/prompts/step3-plan-review.prompt.md` for planning and review-only passes.
2. `.github/prompts/step3-build-slice.prompt.md` for narrow implementation slices (3.3-3.7).

### One-off prompt rule

Keep one-off prompts in chat when they are tied to a single adapter issue or temporary routing experiment. Promote to `.github/prompts/` only after the pattern repeats.

### Session and approval strategy for Step 3

1. Planning and review sessions are read-only by default.
2. One editing session per service cluster (`llm.ts`, prompts, adapters, tests).
3. Default approvals while router and adapter contracts are still changing.
4. Bypass approvals only for mechanical edits after matrix tests stabilize.

## Design Decisions for Step 3 Execution

### Decision D1: Router matrix lives in one deterministic service surface

Rationale:

1. One route-matrix surface prevents drift across routes.
2. Deterministic pure routing functions are easier to test exhaustively.
3. Step 4-6 route handlers can consume one stable contract.

Planning rule:

1. Implement router logic in `backend/src/services/llm.ts`.
2. Keep `selectModel` side-effect free.
3. Unknown combinations must return deterministic failure behavior.
4. Keep routing key semantics anchored to `{callType, tier, mode}` while allowing optional resolved BYOK config input (`preferredProvider`, `preferredModel`) to be passed into `selectModel`.
5. `selectModel` must not perform DB/network calls or payload-hint inference; missing BYOK config maps to deterministic safe failure behavior.

### Decision D2: Segment path remains fixed to low-cost classifier model

Rationale:

1. Segment quality requirements are structural, not generative depth.
2. Cost and latency budgets depend on keeping segment cheap.
3. This invariant stabilizes Step 4 performance expectations.

Planning rule:

1. `callType = segment` ignores tier/mode for model-family selection.
2. Segment route model id must stay aligned with `docs/LLM_ROUTING.md`.
3. Tests lock this invariant against regressions.

### Decision D3: Mode controls token-budget semantics

Rationale:

1. Mode must shape verbosity and output size consistently.
2. Token budget logic reused across providers needs one helper.
3. Tier checks are already handled in Step 2 and should not be duplicated.

Planning rule:

1. Maintain explicit token budgets for all three modes.
2. Route matrix and prompt templates consume the same mode semantics.
3. Any mode-budget changes must update tests and docs together.

### Decision D4: Prompt-template modules are goal-type-scoped pure factories

Rationale:

1. Goal-type-specific semantics need isolated prompt logic.
2. Route handlers should not assemble prompt text directly.
3. Pure factories enable deterministic snapshot-like assertions.

Planning rule:

1. Implement template modules under `backend/src/services/prompts/`.
2. Include `context`, `tech_stack`, `constraint`, `action`, `output_format`, `edge_case`, and `bind`.
3. Factories accept typed inputs and return deterministic strings.

### Decision D5: Sibling-context injection is explicit and bounded

Rationale:

1. Sibling context improves local coherence for `enhance` expansions.
2. Unbounded sibling serialization increases token/cost risk.
3. Explicit formatting keeps prompts debuggable.

Planning rule:

1. Inject sibling block only when siblings exist.
2. Keep sibling serialization in one helper to avoid drift.
3. Apply deterministic formatting rules and bounded inclusion behavior.

### Decision D6: Bind assembly template enforces canonical order and dedup intent

Rationale:

1. Canonical order guarantees coherent final assembly.
2. Dedup intent reduces repeated constraints across sections.
3. Step 6 route logic depends on bind-template stability.

Planning rule:

1. Bind template explicitly states canonical order contract.
2. Bind template includes redundancy-reduction and coherence instructions.
3. Mode-specific output-shape instruction remains deterministic.

### Decision D7: Provider adapters normalize stream and error semantics

Rationale:

1. Route handlers need one provider-agnostic interface.
2. Shared SSE envelope must remain stable across providers.
3. Deterministic error mapping improves recoverability and testability.

Planning rule:

1. Groq and Anthropic adapters emit normalized token/error events as structured objects through an async iterable interface.
2. Adapter contract maps provider-specific errors to backend-safe error envelopes.
3. Keep envelope compatibility with `token | done | error` contract.
4. Adapters do not emit raw SSE strings; SSE string serialization remains at Step 5/6 route boundaries.

### Decision D8: Retry/backoff behavior targets transient failures only

Rationale:

1. Retrying non-retryable failures wastes tokens and latency budget.
2. Explicit retry policy reduces hidden adapter complexity.
3. Tests can deterministically validate retry strategy boundaries.

Planning rule:

1. Retry only on request timeout, connection reset, HTTP 429, HTTP 502, HTTP 503, and HTTP 504.
2. Use bounded exponential backoff with a 3-attempt cap, 100ms initial delay, doubling on each retry, and a 5s max delay cap.
3. Do not retry HTTP 400, 401, 403, 404, or 500; fail fast with normalized mapping.
4. Apply the same policy across Groq and Anthropic adapters unless a later source-of-truth doc changes it.

## File-Level Plan for Remaining Step 3 Slices

### 3.3 Deterministic router matrix and mode budgets

- `backend/src/services/llm.ts`
- `shared/contracts/domain.ts` (only if routing-type refinement is required)
- `backend/src/__tests__/**` (router matrix tests)

Dependencies: Step 2 tier context assumptions and routing policy docs must be stable.

Execution order constraint:

1. Lock route-key, optional resolved BYOK config input, and model-config types first.
2. Implement route matrix next.
3. Add mode-budget helper and negative-path handling.
4. Add exhaustive matrix tests before moving forward.

### 3.4 Prompt factories and sibling-context helpers

- `backend/src/services/prompts/**`
- `backend/src/services/llm.ts` (only if export wiring is needed)
- `backend/src/__tests__/**` (prompt determinism tests)

Dependencies: 3.3 route-matrix contract and mode semantics.

Execution order constraint:

1. Implement per-goal template modules first.
2. Implement bind template and sibling serializer next.
3. Add deterministic tests for goal type and mode combinations.

### 3.5 Provider streaming adapter abstraction

- `backend/src/services/llm.ts`
- `backend/src/services/**` (provider adapter modules)
- `backend/src/lib/sse.ts` (only if shared normalization helper is required)
- `backend/src/__tests__/**` (adapter behavior tests)

Dependencies: 3.3 routing contract and 3.4 template assembly contract.

Execution order constraint:

1. Define provider-agnostic adapter interface first.
2. Implement Groq and Anthropic adapters against that interface.
3. Add deterministic error mapping and retry/backoff.
4. Keep adapter output object-based via async iterable; do not emit raw SSE strings from adapters.
5. Add resilience tests for retryable and non-retryable paths.

### 3.6 Step 4-6 service handoff helpers

- `backend/src/services/llm.ts`
- `backend/src/services/prompts/**`
- `backend/src/routes/**` only for minimal compile-safe wiring stubs

Dependencies: 3.3-3.5 complete.

Execution order constraint:

1. Expose stable service entrypoints for route consumers.
2. Keep route handlers thin and free of embedded template logic.
3. Preserve Step boundary by deferring production route behavior.
4. Route-file edits are compile-safe only: imports, route registration, and typed signatures. Do not add request validation, prompt assembly, provider calls, error mapping, retry logic, or business logic to `/segment`, `/enhance`, or `/bind` in this step.

### 3.7 Test matrix and resilience hardening

- `backend/src/__tests__/**` (new or expanded)
- `backend/src/services/llm.ts`
- `backend/src/services/prompts/**`

Dependencies: 3.3-3.6 complete.

Test boundary rule:

1. Cover full `callType x tier x mode` matrix and unsupported combinations.
2. Cover prompt determinism and sibling-context injection behavior.
3. Cover adapter retry/backoff and normalized error mapping.
4. Cover retryable provider failures separately for Groq and Anthropic: timeout, connection reset, HTTP 429, HTTP 502, HTTP 503, and HTTP 504.
5. Cover non-retryable provider failures separately for Groq and Anthropic: HTTP 400, 401, 403, 404, and 500.
6. Cover retry exhaustion with deterministic mocks only.
7. Keep tests deterministic and network-isolated (no live provider dependency).

### 3.8 Final review and handoff

- `docs/agent_plans/v1_step_by_step/v1_step_3.md` (checkbox status)
- `logging/progress_log.md`

Dependencies: all prior Step 3 slices complete and verified.

## Risk Register and Mitigations

1. Risk: route matrix drifts from `docs/LLM_ROUTING.md`.
   Mitigation: one centralized router table plus exhaustive matrix tests.
2. Risk: prompt-template behavior diverges by route due inline prompt text.
   Mitigation: enforce service-only template factories and keep route handlers thin.
3. Risk: sibling-context injection causes token-budget blowups.
   Mitigation: bounded serializer rules and mode-budget tests.
4. Risk: provider adapter behavior leaks provider-specific semantics into routes.
   Mitigation: normalized adapter interface and shared error mapping contract.
5. Risk: retry policy loops on non-retryable failures.
   Mitigation: explicit retryable classification and bounded attempts.
6. Risk: Step 3 scope drifts into Step 4-6 route implementation.
   Mitigation: explicit deferred file list and slice stop conditions.

## Phase E - Consistency Gate Before Implementation Handoff

Goal: verify planning and source-of-truth surfaces are aligned before Step 3 runtime implementation begins.

Required checks:

1. Cross-doc consistency check across:
   - `docs/agent_plans/v1_step_by_step/v1_step_3.md`
   - `docs/agent_plans/v1_step_by_step/v1_step_3_planning.md`
   - `docs/LLM_ROUTING.md`
   - `docs/BACKEND_API.md`
   - `docs/CLAUSE_PIPELINE.md`
2. Confirm Step 3 docs do not require Step 4-6 route implementation in this phase.
3. Confirm router matrix, prompt goals, and adapter expectations are consistent across docs.
4. Confirm deferred route implementation surface is explicit.

Phase E pass criteria:

1. Service-layer boundaries are explicit and non-conflicting.
2. Step 3 docs preserve Step 4-6 route implementation separation.
3. Runtime handoff sequence is complete and deterministic.

## Phase F - Implementation Handoff Sequence

Goal: define execution order after planning lock, without implementing runtime behavior in this planning pass.

Slice sequence:

1. Slice 1: router matrix and mode-budget helper implementation.
2. Slice 2: prompt-template factory modules and sibling serializer.
3. Slice 3: provider adapters and normalized stream/error contract.
4. Slice 4: retry/backoff policy integration and resilience checks.
5. Slice 5: service entrypoint handoff for Step 4-6 route consumers.
6. Slice 6: deterministic matrix and resilience test expansion.
7. Slice 7: final criteria audit and progress log update.

Slice stop conditions (for execution pass):

1. Slice 1 stop: every supported route key resolves deterministically and unsupported keys fail deterministically.
2. Slice 2 stop: every goal type and mode has deterministic prompt output tests.
3. Slice 3 stop: provider adapters emit normalized stream/error semantics.
4. Slice 4 stop: retry/backoff behavior is explicit, bounded, and test-backed.
5. Slice 5 stop: stable helper contracts are exposed without implementing Step 4-6 route behavior.
6. Slice 6 stop: matrix, prompt, and adapter resilience coverage passes deterministically.
7. Slice 7 stop: Step 3 acceptance criteria map cleanly to code and tests with no Step 4-6 bleed.

Stop condition for this planning pass:

1. Do not implement backend runtime behavior here.
2. End after planning/docs consistency and handoff order are complete.
3. Runtime implementation begins only in a dedicated execution pass that follows this slice order.

## Planning Completion Status

Step 3 planning/design tasks are complete when:

1. Scope and out-of-scope are explicit.
2. File map and dependency order are explicit.
3. Routing, prompt, and adapter decisions are locked.
4. Test boundaries and handoff stop conditions are explicit.

Status: Complete for 3.1 and 3.2.