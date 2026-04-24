# Step 4 - Implement `/segment` Route (JSON)

This is the tactical workboard for Step 4 in [v1_overarching_plan.md](../../agent_plans/v1_overarching_plan.md). The goal is to replace placeholder `/segment` behavior with a production semantic classifier that emits canonical, schema-valid sections without leaking Step 5-6 behavior into this phase.

Step 4 is done when the repo has:

1. A fast semantic `/segment` classifier route that returns deterministic JSON sections.
2. Allowed `goal_type` taxonomy output with canonical slot derivation.
3. Stable merge-safe section IDs for client-side state tracking.
4. Deterministic confidence and dependency normalization.
5. Deterministic fallback behavior when provider output is malformed/unavailable.
6. Tests for malformed, ambiguous, and minimal segment sets.
7. No Step 5 `/enhance` SSE orchestration or Step 6 `/bind` route behavior leakage.

## Step 4 Taskboard

### 4.0 Readiness and dependency lock

Goal: ensure Step 3 service contracts and Step 2 middleware assumptions are stable before `/segment` production behavior lands.

- [ ] Confirm `auth -> ratelimit -> tier` middleware order is still enforced for `/segment`.
- [ ] Confirm Step 3 `selectModel` behavior for `callType: segment` is stable.
- [ ] Confirm current `/segment` behavior is still deterministic placeholder logic and safe to replace.
- [ ] Confirm shared schema surfaces (`segmentRequestSchema`, `segmentResponseSchema`) are current.
- [ ] Confirm runtime file ownership and deferred Step 5-6 boundaries are explicit.

Done when:

1. Preconditions are explicit.
2. `/segment` route assumptions are verified.
3. Step 4 starts from confirmed Step 2 and Step 3 behavior.

### 4.1 Lock scope and source of truth

Goal: make Step 4 boundaries explicit before coding.

- [ ] Read architecture, backend API, clause pipeline, UX flow, LLM routing, and Step 4 planning blueprint docs.
- [ ] Extract exact Step 4 deliverables from the overarching plan.
- [ ] Lock explicit out-of-scope boundaries for Step 5-6 route behavior.
- [ ] Record file-level ownership for route handlers, segment helpers, and tests.

Done when:

1. Scope is clear in one paragraph.
2. File ownership is explicit.
3. Out-of-scope constraints are explicit.

### 4.2 Confirm implementation surface and deferments

Goal: keep Step 4 focused on classifier route behavior and contract alignment.

- [ ] Confirm only `/segment` implementation surfaces are in scope for Step 4 runtime changes.
- [ ] Confirm Step 5/6 route orchestration and transport behaviors remain deferred.
- [ ] Confirm test surfaces are scoped to Step 4 classifier behavior only.

Runtime-deferred route implementation files for Step 4:

1. `backend/src/routes/enhance.ts` production orchestration behavior (Step 5).
2. `backend/src/routes/bind.ts` production orchestration/history behavior (Step 6).
3. Step 5/6 streaming transport behavior in `backend/src/lib/sse.ts` beyond `/segment` needs.

Done when:

1. File touch surface is explicit and narrow.
2. Deferred Step 5/6 behavior is explicit.
3. Taskboard scope is implementation-ready.

### 4.3 Implement `/segment` classification orchestration

Goal: replace placeholder classification with production route-level orchestration.

- [ ] Keep existing request-parse and schema-validation flow in `segmentRouteHandler`.
- [ ] Normalize incoming segment text before provider call (trim/whitespace safety).
- [ ] Resolve model config via `selectModel({ callType: "segment", tier, mode })`.
- [ ] Add deterministic classification prompt/instruction assembly for segment batches.
- [ ] Invoke provider completion path and parse structured JSON output.
- [ ] Keep `/segment` response transport as JSON only (no SSE).

Allowed files for this slice:

- `backend/src/services/routeHandlers.ts`
- `backend/src/services/segment.ts` (new helper allowed)
- `backend/src/services/prompts/segment.ts` (new helper allowed)
- `backend/src/services/providers/**` (only if non-stream classification helper is needed)

Done when:

1. `/segment` uses the Step 3 router contract for model selection.
2. Provider output is parsed into deterministic intermediate structure.
3. Route still returns JSON in the existing endpoint contract shape.

### 4.4 Normalize taxonomy, canonical slots, IDs, and dependencies

Goal: produce deterministic section objects that are safe for downstream UX and bind flow.

- [ ] Normalize provider labels into allowed `goal_type` taxonomy.
- [ ] Derive `canonical_order` from shared canonical map (not provider slot fields).
- [ ] Generate deterministic merge-safe IDs for each section.
- [ ] Clamp and normalize confidence values to `[0,1]` with deterministic fallback.
- [ ] Sanitize `depends_on` to valid in-response IDs only.
- [ ] Remove self-dependencies, duplicates, and cycle-causing edges.
- [ ] Re-validate final payload against `segmentResponseSchema` before return.

Allowed files for this slice:

- `backend/src/services/segment.ts`
- `backend/src/services/routeHandlers.ts`
- `backend/src/lib/schemas.ts` (if output constraints need tightening)
- `shared/contracts/**` (only if canonical-map typing must be centralized)

Done when:

1. Every section field is contract-safe and deterministic.
2. Canonical ordering is derived server-side from normalized taxonomy.
3. ID and dependency behavior is safe for downstream state machines.

### 4.5 Add deterministic fallback behavior

Goal: keep `/segment` usable under provider/parse failures without breaking contract shape.

- [ ] Add deterministic fallback classifier behavior for provider timeout/network/invalid JSON paths.
- [ ] Ensure fallback sections still include canonical slot mapping and stable IDs.
- [ ] Ensure fallback confidence values are explicit and bounded.
- [ ] Keep malformed request behavior unchanged (validation errors stay deterministic).
- [ ] Keep provider internals out of client-facing response envelopes.

Allowed files for this slice:

- `backend/src/services/segment.ts`
- `backend/src/services/routeHandlers.ts`
- `backend/src/lib/http.ts` or `backend/src/lib/errors.ts` (only if shared helpers are needed)

Done when:

1. Transient provider failures do not break `/segment` contract shape.
2. Fallback output remains canonical and schema-valid.
3. Error and fallback behavior is deterministic.

### 4.6 Add Step 4 test matrix

Goal: prove `/segment` behavior across valid, malformed, ambiguous, and degraded paths.

- [ ] Add or expand tests for malformed request payloads and deterministic envelopes.
- [ ] Add tests for minimal segment sets.
- [ ] Add tests for ambiguous segments and unknown model labels.
- [ ] Add tests that canonical slots derive from normalized `goal_type` values.
- [ ] Add tests for confidence clamping behavior.
- [ ] Add tests for stable-ID determinism on unchanged inputs and duplicate-text tie breaks.
- [ ] Add tests for dependency sanitization (`unknown`, `self`, `cycle`).
- [ ] Add tests for deterministic fallback output under provider/parse failures.

Done when:

1. `/segment` contract behavior is regression-resistant.
2. Normalization and fallback logic are fully test-covered.
3. Step boundary with Step 5-6 remains intact.

### 4.7 Add determinism and processing-overhead checks

Goal: guard Step 4 classifier determinism and catch local processing regressions with network-isolated tests.

- [ ] Add deterministic mock/stub checks for warm-path route-local processing overhead.
- [ ] Verify repeated identical requests produce deterministic output shape and stable IDs.
- [ ] Keep checks isolated from external provider/network variability.
- [ ] Document this check as a regression guard, not a production latency SLA.

Done when:

1. Determinism guarantees are explicit and measurable.
2. Processing-overhead regression checks are test-anchored with deterministic harnesses.
3. Checks are CI-stable and network-isolated.

### 4.8 Final review and handoff

Goal: ensure Step 4 is complete and Step 5 can begin without reopening classifier decisions.

- [ ] Review diff against Step 4 acceptance criteria.
- [ ] Confirm `/segment` output schema validity across happy and degraded paths.
- [ ] Confirm no Step 5-6 route behavior landed early.
- [ ] Confirm tests cover taxonomy, canonical order, IDs, dependencies, and fallback behavior.
- [ ] Update progress logs and note deferred Step 5 concerns.

Done when:

1. The Step 4 taskboard is reflected in code and tests.
2. Step 5 can start without reopening `/segment` design decisions.
3. Out-of-scope behavior remains deferred.

## Step 4 Quality Bar

Treat Step 4 as production route work, not temporary scaffolding.

1. Every `/segment` response is schema-valid.
2. Every section uses allowed taxonomy and canonical slot mapping.
3. Every section ID is deterministic and merge-safe.
4. Every dependency reference is valid and sanitized.
5. Every fallback path is deterministic and contract-safe.
6. Every Step 5-6 boundary is preserved.

## Step 4 Exit Criteria

Do not start Step 5 until all of these are true:

1. Step 4 taskboard is complete.
2. `/segment` produces canonical, confidence-scored sections with dependencies.
3. Stable merge-safe IDs are emitted for client state tracking.
4. Malformed/ambiguous/minimal input tests pass.
5. Fallback behavior preserves schema validity under provider faults.
6. Determinism and processing-overhead regression checks pass with deterministic harness.
7. No Step 5-6 route behavior was implemented early.

## Short Version You Can Remember

1. Lock Step 4 scope before touching route code.
2. Replace placeholder `/segment` logic with routed production classification.
3. Normalize output into canonical taxonomy/ordering with stable IDs.
4. Sanitize dependencies and confidence deterministically.
5. Add deterministic fallback and broad test coverage.
6. Hand off to Step 5 only after determinism and regression checks are clean.
