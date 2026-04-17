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

## How To Vibe Code Step 4 In VS Code

Use GitHub Copilot Chat like a small production team, not like a single giant chatbot.

### Recommended session layout

Use 3 chat sessions, but only 2 should be active at the same time.

1. Plan session: one session, local Plan agent, read-only.
2. Build session: one session, local Agent, edit and run tools.
3. Review session: one session, local Ask agent, read-only audit and debugging.

For Step 4, do not run more than one editing agent on the segment-classification cluster at once. Stable-ID and dependency normalization logic are cross-cutting and easy to desynchronize.

If you want the simplest possible setup, use only 2 sessions:

1. Plan or Ask for analysis.
2. Agent for implementation.

Add the Review session only when the first `/segment` slice is complete and you need a clean diff audit.

### Which Copilot mode to use for each phase

1. Plan agent: build the Step 4 taskboard, lock scope, and sequence dependencies.
2. Ask agent: inspect current placeholder route behavior and source-of-truth alignment.
3. Agent: implement classification orchestration, normalization, fallback logic, and tests.

For a first-time vibe coder, keep permissions conservative.

1. Use Default Approvals while normalization and fallback behavior are still changing.
2. Use Bypass Approvals only for mechanical edits after test behavior is stable.
3. Avoid Autopilot on Step 4 unless the slice is tiny and file scope is narrow.

### Prompt pattern that works best

Use short prompts with five parts:

1. Goal.
2. Context.
3. Allowed files.
4. Constraints.
5. Exit condition.

Good prompts are specific enough that the agent can finish without guessing. Bad prompts ask for all Step 4 behavior in one shot.

Example planning prompt:

```text
Read [docs/ARCHITECTURE.md](../../ARCHITECTURE.md), [docs/BACKEND_API.md](../../BACKEND_API.md), [docs/CLAUSE_PIPELINE.md](../../CLAUSE_PIPELINE.md), [docs/LLM_ROUTING.md](../../LLM_ROUTING.md), and [docs/agent_plans/v1_step_by_step/v1_step_3.md](./v1_step_3.md).

Create a Step 4 taskboard only.

Output format:
- task
- files touched
- dependencies
- acceptance criteria
- risk

Do not edit files.
```

Example build prompt:

```text
Implement only Step 4.3 and Step 4.4.

Allowed files:
- backend/src/services/routeHandlers.ts
- backend/src/services/segment.ts (new helper allowed)
- backend/src/services/prompts/segment.ts (new helper allowed)
- backend/src/__tests__/**

Constraints:
- keep changes minimal
- do not change /enhance or /bind behavior
- keep /segment output schema-valid and canonical
- stop when this slice is complete

If a design choice is ambiguous, pick the smallest safe option and explain the tradeoff.
```

Example review prompt:

```text
Review #changes against the Step 4 acceptance criteria.

Find:
- taxonomy normalization gaps
- stable-id regressions
- dependency graph safety bugs
- fallback behavior drift
- scope leakage into Step 5-6 routes
- test gaps

Do not edit files.
```

### Best-practice rules to follow every time

1. Start a fresh session when moving from planning to implementation.
2. Fork a session if you want to compare two normalization strategies without polluting the build thread.
3. Keep one active builder session per segment-classification cluster.
4. Use `#codebase` when you want broad repository reasoning.
5. Use `#changes` when you want a diff audit.
6. Use `#problems` when you want deterministic error fixes.
7. Use checkpoints before risky route-handler refactors.
8. Save reusable prompts only after one successful end-to-end Step 4 run.
9. Keep always-on instructions concise and avoid duplicate rules.

### What not to do

1. Do not combine planning, implementation, and review in one giant prompt.
2. Do not keep more than 3 active sessions for Step 4.
3. Do not let two builder sessions edit `segment` route surfaces simultaneously.
4. Do not implement Step 5-6 route business behavior while doing Step 4.
5. Do not skip tests for malformed/ambiguous/minimal inputs.

## Step 4 Taskboard

### 4.0 Readiness and dependency lock

Goal: ensure Step 3 service contracts and Step 2 middleware assumptions are stable before `/segment` production behavior lands.

- [ ] Confirm `auth -> ratelimit -> tier` middleware order is still enforced for `/segment`.
- [ ] Confirm Step 3 `selectModel` behavior for `callType: segment` is stable.
- [ ] Confirm current `/segment` behavior is still deterministic placeholder logic and safe to replace.
- [ ] Confirm shared schema surfaces (`segmentRequestSchema`, `segmentResponseSchema`) are current.
- [ ] Confirm runtime file ownership and deferred Step 5-6 boundaries are explicit.

Copilot session:

- Plan agent first.
- Ask agent if route or schema assumptions look stale.

Prompt:

```text
Validate Step 4 readiness against current middleware, schema, and Step 3 service surfaces.

Report only:
- what is ready
- what is missing
- what can cause /segment drift
- what runtime prerequisites are still unlocked

Do not edit files.
```

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

Copilot session:

- Plan agent first.
- Ask agent with `#codebase` only for repository-specific ambiguity.

Prompt:

```text
You are planning Step 4 only.

Return a file-level taskboard for /segment production classification.
Do not include /enhance or /bind route orchestration.
Do not edit files.
```

Done when:

1. Scope is clear in one paragraph.
2. File ownership is explicit.
3. Out-of-scope constraints are explicit.

### 4.2 Set up the Step 4 workflow surface

Goal: keep classification work repeatable and low-noise.

- [ ] Confirm always-on instruction surfaces are concise and non-conflicting.
- [ ] Decide whether reusable Step 4 prompts should be added for segment slices.
- [ ] Keep skill loading minimal: scope guard, canonical-clause-ordering, and verification gate.
- [ ] Preserve source-of-truth references in prompts to avoid taxonomy/canonical-order drift.
- [ ] Document runtime-deferred route files so Step 4 does not absorb Step 5-6 behavior.

Copilot session:

- Ask agent for workspace instruction audit.
- Plan agent only if prompt surfaces need updates.

Prompt:

```text
Inspect current workflow instructions and suggest the smallest prompt set needed for Step 4.

Focus on /segment classification safety constraints.
Keep /enhance and /bind orchestration out of scope.
```

Done when:

1. Reusable prompt strategy is clear.
2. Instruction overlap is controlled.
3. Step 4 prompts can execute without re-explaining architecture rules.
4. Step 5-6 route behavior remains deferred.

Runtime-deferred route implementation files for Step 4:

1. `backend/src/routes/enhance.ts` production orchestration behavior (Step 5).
2. `backend/src/routes/bind.ts` production orchestration/history behavior (Step 6).
3. Step 5/6 streaming transport behavior in `backend/src/lib/sse.ts` beyond `/segment` needs.

### 4.3 Implement `/segment` classification orchestration

Goal: replace placeholder classification with production route-level orchestration.

- [ ] Keep existing request-parse and schema-validation flow in `segmentRouteHandler`.
- [ ] Normalize incoming segment text before provider call (trim/whitespace safety).
- [ ] Resolve model config via `selectModel({ callType: "segment", tier, mode })`.
- [ ] Add deterministic classification prompt/instruction assembly for segment batches.
- [ ] Invoke provider completion path and parse structured JSON output.
- [ ] Keep `/segment` response transport as JSON only (no SSE).

Copilot session:

- Agent session.
- Keep scope on route handler + segment helper files only.

Prompt:

```text
Implement Step 4.3 /segment classification orchestration.

Allowed files:
- backend/src/services/routeHandlers.ts
- backend/src/services/segment.ts (new helper allowed)
- backend/src/services/prompts/segment.ts (new helper allowed)
- backend/src/services/providers/** (only if non-stream classification helper is needed)

Requirements:
- preserve request validation semantics
- route model selection through selectModel(callType=segment)
- parse provider output into typed intermediate objects
- keep /segment response JSON (no SSE)
- do not change /enhance or /bind behavior

Stop when /segment has production classification orchestration and remains compile-safe.
```

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

Copilot session:

- Agent session.
- Ask session only for canonical-order sanity checks.

Prompt:

```text
Implement Step 4.4 normalization for /segment outputs.

Allowed files:
- backend/src/services/segment.ts
- backend/src/services/routeHandlers.ts
- backend/src/lib/schemas.ts (if output constraints need tightening)
- shared/contracts/** (only if canonical-map typing must be centralized)

Requirements:
- only allowed goal_type values in final output
- canonical_order derived from shared canonical map
- deterministic stable IDs for unchanged segment text
- confidence bounded to [0,1] with fallback defaults
- depends_on sanitized to valid non-cyclic references
- final response schema validation before return

Stop when normalized output is deterministic and schema-valid.
```

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

Copilot session:

- Agent session.
- Review session for fallback-path audit.

Prompt:

```text
Implement Step 4.5 deterministic fallback behavior for /segment.

Allowed files:
- backend/src/services/segment.ts
- backend/src/services/routeHandlers.ts
- backend/src/lib/http.ts or backend/src/lib/errors.ts (only if shared helpers are needed)

Requirements:
- provider and parse failures degrade to deterministic schema-valid fallback output
- fallback keeps canonical fields and stable IDs
- malformed requests still return validation envelopes
- do not modify /enhance or /bind behavior

Stop when fallback behavior is deterministic and testable.
```

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

Copilot session:

- Review session first, then Agent for edits.

Prompt:

```text
Expand Step 4 tests for /segment classification behavior.

Cover:
- malformed payload handling
- minimal and ambiguous segment sets
- taxonomy normalization and canonical-order derivation
- confidence bounds and default behavior
- stable ID behavior for unchanged and duplicate-text segments
- dependency graph sanitization
- fallback behavior when provider output is invalid or unavailable

Do not add Step 5-6 route behavior assertions.
```

Done when:

1. `/segment` contract behavior is regression-resistant.
2. Normalization and fallback logic are fully test-covered.
3. Step boundary with Step 5-6 remains intact.

### 4.7 Add latency and determinism checks

Goal: verify Step 4 still meets the fast-classification expectation on warm path.

- [ ] Add deterministic warm-path latency assertions using mocked provider responses.
- [ ] Verify `/segment` processing overhead (excluding network) stays in low tens of milliseconds.
- [ ] Verify repeated identical requests produce deterministic output shape and stable IDs.
- [ ] Keep latency checks isolated from external provider/network variability.

Copilot session:

- Agent session with focused benchmarking/tests.

Prompt:

```text
Implement Step 4.7 latency and determinism checks for /segment.

Allowed files:
- backend/src/__tests__/**
- backend/src/services/segment.ts (only if deterministic timing hooks are needed)

Requirements:
- use deterministic mocks/stubs (no live provider dependency)
- validate warm-path processing remains low-latency
- validate repeated identical inputs produce deterministic outputs

Stop when latency and determinism checks are reliable in CI.
```

Done when:

1. Step 4 latency expectations are test-anchored.
2. Determinism guarantees are explicit and measurable.
3. Tests remain stable and network-isolated.

### 4.8 Final review and handoff

Goal: ensure Step 4 is complete and Step 5 can begin without reopening classification decisions.

- [ ] Review diff against Step 4 acceptance criteria.
- [ ] Confirm `/segment` output schema validity across happy and degraded paths.
- [ ] Confirm no Step 5-6 route behavior landed early.
- [ ] Confirm tests cover taxonomy, canonical order, IDs, dependencies, and fallback behavior.
- [ ] Update progress logs and note deferred Step 5 concerns.

Copilot session:

- Review session (read-only Ask or Agent).

Prompt:

```text
Review Step 4 work against the taskboard.

Find:
- classification contract regressions
- canonical-order drift
- ID/dependency safety bugs
- fallback determinism gaps
- missing tests
- scope leakage into Step 5-6 routes

Do not edit files.
```

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
6. Warm-path latency checks pass with deterministic harness.
7. No Step 5-6 route behavior was implemented early.

## Short Version You Can Remember

1. Lock Step 4 scope before touching route code.
2. Replace placeholder `/segment` logic with routed production classification.
3. Normalize output into canonical taxonomy/ordering with stable IDs.
4. Sanitize dependencies and confidence deterministically.
5. Add deterministic fallback and broad test coverage.
6. Hand off to Step 5 only after latency and contract checks are clean.