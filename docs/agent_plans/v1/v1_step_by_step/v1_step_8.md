# Step 8 - Content Script Input Instrumentation

This is the tactical workboard for Step 8 in [v1_overarching_plan.md](../../agent_plans/v1_overarching_plan.md). The goal is to add live input discovery, idempotent listener attachment, MutationObserver re-attach behavior, and draft syntactic segmentation while preserving Step 9+ rendering and Step 11 commit boundaries.

Step 8 is done when the repo has:

1. A content-script instrumentation layer that detects textarea and contenteditable inputs in supported sites.
2. Idempotent attachment behavior so rerenders do not create duplicate listeners.
3. Debounce plus AbortController cancellation so stale semantic work is suppressed when the user keeps typing.
4. A deterministic syntactic split pass that can render immediate draft underlines without any provider call.
5. MutationObserver-based reattachment that restores instrumentation when dynamic apps rerender their input nodes.
6. Validation or tests that cover discovery, duplicate-listener prevention, debounce cancellation, syntactic split output, and rerender recovery.
7. No Step 9 overlay rendering, Step 10 acceptance graph, or Step 11 bind/commit behavior leakage.

## Step 8 Taskboard

### 8.0 Readiness and dependency lock

Goal: ensure Step 7 transport and Step 9+ boundaries stay stable before content instrumentation work lands.

- [ ] Confirm Step 7 Port transport still provides a stable content-script bridge and that Step 8 will reuse it without changing background transport ownership.
- [ ] Confirm the current shared state contract (`TabStatus`, `SectionStatus`, `Section`, `TabState`) still matches the intended pipeline scaffold.
- [ ] Confirm the target-site matrix includes textarea and contenteditable apps, including rerender-heavy apps like Notion and Linear.
- [ ] Confirm syntactic split, debounce, and MutationObserver re-attach behavior are covered by the source docs and remain the only Step 8 active behaviors.
- [ ] Confirm Step 9 overlay rendering, Step 10 acceptance and dirty-state graph, and Step 11 bind and commit behavior remain deferred.

Done when:

1. Preconditions are explicit.
2. Step 8 starts from locked Step 7 transport assumptions.
3. Deferred behaviors are named.

### 8.1 Lock scope and source of truth

Goal: make the content-script instrumentation boundary explicit before implementation.

- [ ] Read architecture, clause pipeline, data models, extension, UX flow, the overarching plan, and the Step 7 taskboard.
- [ ] Extract the exact Step 8 deliverables from the overarching plan.
- [ ] Record the current implementation snapshot from `extension/src/content/index.ts`.
- [ ] Lock explicit out-of-scope boundaries for overlay, acceptance, and commit behavior.
- [ ] Record file ownership for input discovery, listener attachment, debounce, syntactic split, and reattachment.

Done when:

1. Scope is clear in one paragraph.
2. File ownership is explicit.
3. Out-of-scope constraints are explicit.

### 8.2 Confirm implementation surface and deferments

Goal: keep Step 8 focused on instrumentation and pipeline scaffolding only.

- [ ] Confirm runtime changes stay inside `extension/src/content/index.ts` unless a small shared contract refinement is required.
- [ ] Confirm no background transport, backend route, or SSE changes are needed for Step 8.
- [ ] Confirm no overlay rendering, acceptance, or commit logic lands in Step 8.
- [ ] Confirm validation focuses on attachment idempotency, debounce cancellation, syntactic split, and MutationObserver re-attach behavior.

Runtime-deferred implementation files for Step 8:

1. `extension/src/content/index.ts`
2. `shared/contracts/domain.ts` only if a state or attachment refinement is proven necessary.

Done when:

1. File touch surface is narrow.
2. Step 9 to Step 11 behavior remains deferred.
3. Step 8 execution can start without scope ambiguity.

### 8.3 Implement input discovery and idempotent listener attachment

Goal: detect live textarea and contenteditable targets and attach exactly one listener bundle per target.

- [ ] Add active-input discovery for textarea and contenteditable elements.
- [ ] Use a durable per-element attachment marker to prevent duplicate listeners.
- [ ] Ensure attachment is rerun safely after rerenders without stacking handlers.
- [ ] Keep instrumentation local to the content script.

Allowed files for this slice:

- `extension/src/content/index.ts`
- `shared/contracts/domain.ts` only if an attachment-state type is needed.

Done when:

1. Active inputs are detected consistently.
2. Duplicate listeners are prevented.
3. Repeated scans are idempotent.

### 8.4 Implement the pipeline state scaffold and stale-work cancellation

Goal: wire the content-side state machine around input and classification events.

- [ ] Define the Step 8 state transitions needed for `TYPING`, `SEGMENTING`, and `PREVIEWING` entry points.
- [ ] Add debounce timers that delay semantic work instead of firing on every keystroke.
- [ ] Cancel stale work with AbortController when newer input arrives.
- [ ] Keep state transitions deterministic and serializable.

Allowed files for this slice:

- `extension/src/content/index.ts`
- `shared/contracts/domain.ts` only if the state enum or serializable tab state needs a refinement.

Done when:

1. The state machine can represent the active input lifecycle.
2. Debounce and abort behavior suppress stale work.
3. State remains serializable and minimal.

### 8.5 Implement the syntactic split pass and draft underline handoff

Goal: produce immediate, zero-API draft segmentation for the active input.

- [ ] Add a deterministic syntactic split pass for clauses and clause-like segments.
- [ ] Render draft underlines immediately from the split result.
- [ ] Keep the split logic free of provider calls and network dependency.
- [ ] Ensure the split output can feed the later semantic pass without changing the raw text.

Allowed files for this slice:

- `extension/src/content/index.ts`
- `docs/CLAUSE_PIPELINE.md` only if a clarifying note is needed.

Done when:

1. Draft segmentation appears immediately.
2. No network call is needed for the draft pass.
3. The split output remains compatible with later semantic expansion.

### 8.6 Implement MutationObserver reattach and rerender resilience

Goal: keep instrumentation alive in rerender-heavy apps.

- [ ] Add MutationObserver-based reattachment for dynamic DOM replacement.
- [ ] Re-scan only when the target subtree changes in a way that can affect input ownership.
- [ ] Preserve attachment idempotency across rerenders.
- [ ] Keep observer behavior narrow so it does not become a second state source.

Allowed files for this slice:

- `extension/src/content/index.ts`
- `shared/contracts/domain.ts` only if an observer or attachment state refinement is needed.

Done when:

1. Rerendered inputs are re-instrumented.
2. Duplicate listeners do not accumulate.
3. MutationObserver remains a reattach mechanism, not a state authority.

### 8.7 Add the Step 8 validation matrix

Goal: prove input instrumentation, debounce, and reattach behavior.

- [ ] Add deterministic validation for textarea and contenteditable discovery.
- [ ] Add deterministic validation for duplicate-listener prevention after rerenders.
- [ ] Add deterministic validation for debounce cancellation and stale-request aborts.
- [ ] Add deterministic validation for syntactic split output on representative clause shapes.
- [ ] Add deterministic validation for MutationObserver re-attach behavior in rerender-heavy apps.
- [ ] Keep validation isolated from live backend calls.

Allowed files for this slice:

- `extension/src/content/index.ts`
- `shared/contracts/domain.ts`
- `extension/package.json` only if a real extension test script must be added.

Done when:

1. Instrumentation behavior is regression-resistant.
2. Stale-work cancellation is deterministic.
3. Rerender resilience is covered.

### 8.8 Final review and handoff

Goal: ensure Step 8 is complete and Step 9 can begin without reopening input-instrumentation decisions.

- [ ] Review the diff against Step 8 acceptance criteria.
- [ ] Confirm no Step 9 overlay rendering or Step 10 and Step 11 acceptance and commit behavior landed early.
- [ ] Confirm discovery, attachment, debounce, split, and reattach behavior are covered by validation.
- [ ] Update progress logs and note deferred Step 9 concerns.

Done when:

1. Step 8 taskboard is reflected in code and validation.
2. Step 9 can begin without reopening content-instrumentation decisions.
3. Out-of-scope behavior remains deferred.

## Step 8 Quality Bar

Treat Step 8 as production input-instrumentation work, not temporary scaffolding.

1. Every supported active input is detected and instrumented exactly once.
2. Typing produces instant draft segmentation without waiting on network work.
3. Debounce and abort behavior suppress stale semantic calls.
4. MutationObserver recovery restores instrumentation after rerenders.
5. Step 9 overlay rendering, Step 10 acceptance, and Step 11 commit behavior remain untouched.

## Step 8 Exit Criteria

Do not start Step 9 until all of these are true:

1. Step 8 taskboard is complete.
2. Input discovery and idempotent attachment are deterministic on happy and rerender paths.
3. Debounce cancellation is immediate and reproducible.
4. Syntactic split rendering works before any later visual layer is added.
5. Step 8 validation passes.
6. No Step 9+ overlay, acceptance, or commit behavior was implemented early.

## Short Version You Can Remember

1. Step 8 owns live input discovery and idempotent attachment.
2. Step 8 adds instant syntactic draft underlines and stale-work cancellation.
3. Step 8 uses MutationObserver only to recover instrumentation after rerenders.
4. Step 8 does not render overlays, accept sections, or commit final text.
5. Step 9, Step 10, and Step 11 remain separate and deferred.