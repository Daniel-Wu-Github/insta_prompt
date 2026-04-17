# Step 4 Planning Blueprint (/segment Route JSON Classification)

This document records the completed design and planning outputs for Step 4.
It is aligned with:

- `docs/ARCHITECTURE.md`
- `docs/BACKEND_API.md`
- `docs/CLAUSE_PIPELINE.md`
- `docs/LLM_ROUTING.md`
- `docs/UX_FLOW.md`
- `docs/agent_plans/v1_overarching_plan.md`
- `docs/agent_plans/v1_step_by_step/v1_step_3.md`
- `docs/agent_plans/v1_step_by_step/v1_step_4.md`

## 4.1 Scope Lock and Source of Truth

### Phase 4 decision lock matrix

The following decisions are now locked for implementation and must not be re-opened in Step 4 execution unless a source-of-truth doc changes first.

| Decision area | Locked choice (Phase 4) | Why this is locked now | Downstream dependency |
|---|---|---|---|
| `/segment` response contract | `/segment` returns `sections[]` with `id`, `text`, `goal_type`, `canonical_order`, `confidence`, and `depends_on` in one deterministic JSON shape. | Extension state transitions and Step 5 expansion fan-out depend on this exact contract. | 4.3 route implementation, 4.7 contract tests |
| Segment model route invariant | Classification always routes through `selectModel({ callType: "segment", ... })` and remains pinned to the fast Groq classifier path. | Segment is latency-sensitive classification, not high-token generation. | 4.4 classification service integration |
| Goal taxonomy normalization | Only allowed taxonomy values are emitted: `context`, `tech_stack`, `constraint`, `action`, `output_format`, `edge_case`. Unknown labels are normalized to safe defaults. | Prevents schema drift and invalid UI color/state mapping. | 4.5 normalization helpers, 4.7 malformed-output tests |
| Canonical slot derivation | `canonical_order` is always derived from `goal_type` via one shared canonical map; model-provided slot numbers are never trusted. | Keeps server/client ordering consistent and prevents alternate hidden maps. | 4.5 canonicalization logic, 4.7 ordering tests |
| Stable ID policy | Section IDs are deterministic and merge-safe for unchanged inputs across adjacent calls; ID generation does not depend on provider output order. | Content script uses IDs for section tracking, dirty-state invalidation, and preview mapping. | 4.5 ID utility, Step 8+ extension state reliability |
| Dependency graph policy | `depends_on` references only valid section IDs in the same response, with self-dependencies and cycles removed. | Prevents stale-state propagation bugs and invalid dependency graphs in UX flow. | 4.5 dependency sanitizer, 4.7 dependency tests |
| Confidence policy | Confidence is normalized to `[0,1]`; missing/invalid values fall back deterministically to low-confidence defaults. | Underline semantics (`solid` vs `dashed`) rely on stable confidence ranges. | 4.5 confidence normalization, Step 9 underline rendering |
| Failure behavior | Provider/parse failures degrade to deterministic fallback classification responses (schema-valid) instead of undefined payloads. | Maintains non-blocking UX and keeps `/segment` contract stable under transient faults. | 4.6 fallback handling, 4.7 resilience tests |
| Docs-first boundary for this pass | Planning/docs updates are completed first; Step 4 runtime implementation follows in execution slices after consistency gate. | Prevents route-behavior scope creep before decisions and tests are locked. | Phase E consistency gate, Phase F handoff |

### Step 4 scope in one paragraph

Step 4 replaces placeholder `/segment` behavior with production semantic classification while preserving existing middleware guarantees from Steps 1-2 and service-layer contracts from Step 3. The route must validate and normalize incoming segments, classify each segment to allowed `goal_type` values, derive canonical ordering from taxonomy, emit merge-safe stable IDs and dependency links, and return schema-valid JSON under both normal and degraded provider conditions. This phase must not absorb Step 5 SSE expansion orchestration or Step 6 bind/history behavior.

### Step 4 deliverables extracted from the overarching plan

1. Fast semantic classification endpoint at `POST /segment`.
2. Canonical ordering, confidence, and dependency output per section.
3. Merge-safe section IDs for client state tracking.
4. Tests for malformed, ambiguous, and minimal segment sets.
5. Deterministic schema-valid output behavior across success and fallback paths.

### Runtime-deferred implementation surface for this planning pass

The following runtime files are intentionally deferred until Phase F execution slices:

1. `backend/src/services/routeHandlers.ts` (`segmentRouteHandler` production behavior)
2. `backend/src/services/segment.ts` (new, if classification/normalization helpers are extracted)
3. `backend/src/services/prompts/segment.ts` (new, if segment-classification prompt factory is extracted)
4. `backend/src/services/providers/**` (only if a non-stream completion helper is added)
5. `backend/src/lib/schemas.ts` (only if segment bounds/shape tightening is required)
6. `backend/src/__tests__/segment.route.test.ts` (new)
7. `backend/src/__tests__/routes.validation.test.ts` and `backend/src/__tests__/stress-tests.test.ts` (Step 4-specific expansions)

Planning rule:

1. Do not modify runtime behavior files during this docs/planning pass.
2. Implement runtime work in Phase F slice order.
3. Treat runtime edits in this phase as scope creep.

### Source-of-truth file map

| Concern | Source of truth | Why this is canonical |
|---|---|---|
| `/segment` route contract and protected middleware assumptions | `docs/BACKEND_API.md` + `docs/ARCHITECTURE.md` | Defines endpoint shape and request path invariants. |
| Goal taxonomy and confidence semantics | `docs/CLAUSE_PIPELINE.md` + `docs/UX_FLOW.md` | Defines goal types and confidence thresholds consumed by UX. |
| Segment model selection policy | `docs/LLM_ROUTING.md` | Pins `/segment` to low-cost classifier model path. |
| Shared type surfaces | `shared/contracts/domain.ts`, `shared/contracts/api.ts`, `backend/src/lib/schemas.ts` | Keeps route payloads and runtime validation aligned. |
| Existing route orchestration surface | `backend/src/services/routeHandlers.ts`, `backend/src/routes/segment.ts` | Defines current implementation target for replacement. |
| Step-level acceptance criteria | `docs/agent_plans/v1_step_by_step/v1_step_4.md` | Defines execution checklist and done criteria. |

### Step 4 out of scope

1. No Step 5 `/enhance` SSE orchestration changes.
2. No Step 6 `/bind` streaming/history write behavior changes.
3. No extension-side merge/min-length UI behavior changes owned by later steps.
4. No Step 2 rate-limit or tier policy changes.
5. No v2 project context retrieval behavior changes.

## 4.2 Copilot Workflow Surface Plan

### Numbering convention

1. Taskboard execution numbering (`4.x`) lives in `docs/agent_plans/v1_step_by_step/v1_step_4.md`.
2. This planning blueprint uses decision labels (`D1..D8`) and file-level slices for dependency mapping.
3. If numbering appears to overlap, treat the taskboard as execution order and this blueprint as design lock.

### Always-on instruction surfaces (confirmed)

1. `.github/copilot-instructions.md`
2. `.github/skills/SKILL_MAP.md`
3. `.github/skills/*/SKILL.md` (loaded per task classification)

### Reusable prompt surfaces (recommended)

1. `.github/prompts/step4-plan-review.prompt.md` for planning/review-only passes.
2. `.github/prompts/step4-build-slice.prompt.md` for narrow implementation slices (4.3-4.7).

### One-off prompt rule

Keep one-off prompts in chat when they are tied to a single classification parser edge case or a temporary latency experiment. Promote to `.github/prompts/` only after the pattern repeats.

### Session and approval strategy for Step 4

1. Planning and review sessions are read-only by default.
2. One editing session per classification cluster (`routeHandlers`, new segment helper module, tests).
3. Default approvals while classification normalization behavior is still changing.
4. Bypass approvals only for mechanical edits after test matrix stabilizes.

## Design Decisions for Step 4 Execution

### Decision D1: `/segment` remains a JSON classifier route, not an SSE stream

Rationale:

1. Segment is a fast classification pre-pass in the pipeline.
2. Extension debounce flow assumes one JSON response for classification state update.
3. Streaming complexity belongs to `/enhance` and `/bind` in Steps 5-6.

Planning rule:

1. Keep `POST /segment` response type as JSON.
2. Return deterministic section arrays in one payload.
3. Do not add SSE transport to `/segment` in Step 4.

### Decision D2: Segment classification uses Step 3 router contract

Rationale:

1. Routing policy must stay centralized in `services/llm.ts`.
2. Segment call-type already has a pinned fast model invariant.
3. Route-level provider branching would reintroduce policy drift.

Planning rule:

1. Resolve segment model via `selectModel({ callType: "segment", tier, mode })`.
2. Keep `/segment` mode and tier independent for model-family selection.
3. Keep provider selection backend-only and proxy-safe.

### Decision D3: Canonical ordering is always derived from normalized `goal_type`

Rationale:

1. Canonical order must remain globally consistent across backend and extension.
2. Model outputs can be noisy and must not define ordering semantics.
3. Bind and acceptance flows depend on stable slot mapping.

Planning rule:

1. Normalize model labels to allowed `goal_type` taxonomy first.
2. Derive `canonical_order` from shared canonical map only.
3. Reject or correct impossible slot values before response validation.

### Decision D4: IDs must be deterministic and merge-safe

Rationale:

1. Section IDs drive stale-state and acceptance mapping in downstream UX.
2. Provider output reordering must not reshuffle stable identifiers.
3. Placeholder index-only IDs are too brittle for incremental edits.

Planning rule:

1. Generate IDs from normalized segment text with deterministic tie-break handling for duplicates.
2. Keep ID generation independent from provider-returned ordering metadata.
3. Preserve stable IDs for unchanged segment text across adjacent calls.

### Decision D5: Dependency references are sanitized server-side

Rationale:

1. `depends_on` drives stale invalidation and must never reference invalid IDs.
2. Model output can include out-of-range or circular dependencies.
3. Sanitization at route boundary prevents client graph corruption.

Planning rule:

1. Keep only dependencies that reference existing IDs in the same payload.
2. Remove self-dependencies and duplicates.
3. Drop or break cycles deterministically.

### Decision D6: Confidence is normalized and bounded

Rationale:

1. UX confidence styling depends on stable confidence ranges.
2. Model output can omit or mis-shape confidence values.
3. Deterministic fallback confidence avoids rendering regressions.

Planning rule:

1. Clamp confidence to `[0, 1]`.
2. Use deterministic fallback confidence on missing/invalid values.
3. Keep threshold interpretation (`< 0.85` dashed) in extension/UI layers.

### Decision D7: Degraded provider paths still return schema-valid classification

Rationale:

1. Segment route sits in the typing loop and should not fail open with undefined payloads.
2. Temporary provider faults should not break the full UX loop.
3. Deterministic fallback preserves contract and keeps pipeline moving.

Planning rule:

1. Provider parse/network failures map to fallback classifier output where possible.
2. Every successful response path re-validates against `segmentResponseSchema`.
3. Only malformed request payloads return validation errors.

### Decision D8: Step boundary is strict (`/segment` only)

Rationale:

1. Step 4 must harden classification before expansion/bind orchestration work.
2. Scope bleed into Step 5/6 increases integration churn.
3. Existing sequencing in overarching plan is intentional.

Planning rule:

1. Implement only `/segment` production behavior in this step.
2. Keep `/enhance` and `/bind` route business logic unchanged.
3. Defer extension/UI merge behavior to designated later steps.

## File-Level Plan for Remaining Step 4 Slices

### 4.3 Route contract hardening and input normalization

- `backend/src/services/routeHandlers.ts`
- `backend/src/lib/schemas.ts` (only if request bounds are tightened)
- `shared/contracts/api.ts` (only if explicit typing refinements are required)

Dependencies: Step 3 service-layer contracts and Step 2 middleware path must remain stable.

Execution order constraint:

1. Preserve existing JSON parse and schema-parse flow.
2. Add any segment pre-normalization (trim/empty filtering/bounds) before classifier call.
3. Keep response schema validation at route boundary.

### 4.4 Classification service integration (provider call path)

- `backend/src/services/routeHandlers.ts`
- `backend/src/services/segment.ts` (new helper surface)
- `backend/src/services/llm.ts` (only for import wiring, not routing-policy changes)
- `backend/src/services/providers/**` (only if non-stream completion helper is required)

Dependencies: 4.3 request-normalization behavior.

Execution order constraint:

1. Resolve model config through existing router (`callType: segment`).
2. Build a deterministic classification prompt contract for segment batches.
3. Parse provider output into typed intermediate shape before normalization.
4. Keep provider network calls inside backend service boundaries only.

### 4.5 Canonicalization, stable IDs, and dependency sanitization

- `backend/src/services/segment.ts` (new helper surface)
- `backend/src/services/routeHandlers.ts`
- `backend/src/lib/schemas.ts` (if output helper typing requires tightening)

Dependencies: 4.4 provider output parsing.

Execution order constraint:

1. Normalize labels into allowed taxonomy.
2. Derive `canonical_order` from shared canonical map.
3. Generate deterministic merge-safe IDs.
4. Sanitize dependencies and confidence.
5. Re-validate final output with `segmentResponseSchema`.

### 4.6 Deterministic fallback and error shaping

- `backend/src/services/segment.ts`
- `backend/src/services/routeHandlers.ts`
- `backend/src/lib/errors.ts` and/or `backend/src/lib/http.ts` (only if shared fallback/error helpers are extracted)

Dependencies: 4.4-4.5 normalization pipeline.

Execution order constraint:

1. Define fallback classifier behavior for provider timeout/invalid-response paths.
2. Ensure fallback output keeps IDs, canonical slots, and schema validity deterministic.
3. Avoid leaking provider internals in response payloads.

### 4.7 Test matrix expansion and latency checks

- `backend/src/__tests__/segment.route.test.ts` (new)
- `backend/src/__tests__/routes.validation.test.ts`
- `backend/src/__tests__/stress-tests.test.ts`

Dependencies: 4.3-4.6 runtime behavior complete.

Test boundary rule:

1. Cover malformed request and validation-error envelopes.
2. Cover minimal and ambiguous segment sets.
3. Cover normalization of unknown/invalid model labels.
4. Cover canonical-order derivation and confidence clamping.
5. Cover ID stability for unchanged segment text and duplicate-text tie breaks.
6. Cover dependency sanitization (unknown IDs, self refs, cycles).
7. Cover degraded fallback path with deterministic schema-valid output.
8. Add a deterministic warm-path latency assertion using mocks/stubs to keep classification processing in low tens of milliseconds.

### 4.8 Final review and handoff

- `docs/agent_plans/v1_step_by_step/v1_step_4.md` (checkbox status)
- `logging/progress_log.md`

Dependencies: all prior Step 4 slices complete and verified.

## Risk Register and Mitigations

1. Risk: model output is non-JSON or structurally invalid.
   Mitigation: strict parse + normalization + deterministic fallback output.
2. Risk: taxonomy drift introduces unsupported `goal_type` values.
   Mitigation: explicit normalization map and response-schema re-validation.
3. Risk: ID instability causes client stale-state mismatches.
   Mitigation: deterministic ID utility and regression tests for unchanged inputs.
4. Risk: malformed dependencies break dirty-state graph.
   Mitigation: dependency sanitizer that removes invalid/self/cyclic references.
5. Risk: latency regresses from route-local heavy processing.
   Mitigation: bounded normalization logic and warm-path latency guard tests.
6. Risk: Step 4 work leaks into Step 5/6 route behavior.
   Mitigation: explicit deferred scope and slice stop conditions.

## Phase E - Consistency Gate Before Implementation Handoff

Goal: verify planning and source-of-truth surfaces are aligned before Step 4 runtime implementation begins.

Required checks:

1. Cross-doc consistency check across:
   - `docs/agent_plans/v1_step_by_step/v1_step_4.md`
   - `docs/agent_plans/v1_step_by_step/v1_step_4_planning.md`
   - `docs/BACKEND_API.md`
   - `docs/CLAUSE_PIPELINE.md`
   - `docs/LLM_ROUTING.md`
2. Confirm Step 4 docs do not require Step 5-6 route behavior implementation.
3. Confirm canonical slot and taxonomy language is consistent across docs.
4. Confirm fallback and schema-validity guarantees are explicit.

Phase E pass criteria:

1. Classification boundaries are explicit and non-conflicting.
2. Step 4 docs preserve Step 5-6 separation.
3. Runtime handoff sequence is complete and deterministic.

## Phase F - Implementation Handoff Sequence

Goal: define execution order after planning lock, without implementing runtime behavior in this planning pass.

Slice sequence:

1. Slice 1: route input normalization and contract hardening.
2. Slice 2: provider classification call integration on `/segment`.
3. Slice 3: canonicalization, stable ID generation, confidence/dependency normalization.
4. Slice 4: deterministic fallback behavior and error shaping.
5. Slice 5: test matrix expansion (validation, ambiguity, normalization, fallback).
6. Slice 6: latency and determinism checks.
7. Slice 7: final criteria audit and progress-log update.

Slice stop conditions (for execution pass):

1. Slice 1 stop: request handling is deterministic and schema-validated.
2. Slice 2 stop: segment provider classification is wired through router policy.
3. Slice 3 stop: response output is canonical, stable-ID-safe, and schema-valid.
4. Slice 4 stop: provider faults return deterministic fallback classification output.
5. Slice 5 stop: Step 4 behavior is covered by contract and edge-case tests.
6. Slice 6 stop: warm-path latency assertions pass with deterministic test harness.
7. Slice 7 stop: Step 4 acceptance criteria map cleanly to code and tests with no Step 5/6 bleed.

Stop condition for this planning pass:

1. Do not implement backend runtime behavior here.
2. End after planning/docs consistency and handoff order are complete.
3. Runtime implementation begins only in a dedicated execution pass that follows this slice order.

## Planning Completion Status

Step 4 planning/design tasks are complete when:

1. Scope and out-of-scope are explicit.
2. File map and dependency order are explicit.
3. Classification normalization decisions are locked.
4. Test boundaries and handoff stop conditions are explicit.

Status: Complete for 4.1 and 4.2.