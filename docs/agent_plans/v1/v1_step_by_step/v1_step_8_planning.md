# Step 8 Planning Blueprint (Content Script Input Instrumentation)

This document records the planned design and scope locks for Step 8.
It is aligned with:

- `docs/ARCHITECTURE.md`
- `docs/CLAUSE_PIPELINE.md`
- `docs/DATA_MODELS.md`
- `docs/EXTENSION.md`
- `docs/UX_FLOW.md`
- `docs/agent_plans/v1_overarching_plan.md`
- `docs/agent_plans/v1_step_by_step/v1_step_7.md`
- `docs/agent_plans/v1_step_by_step/v1_step_8.md`

Step 8 is the content-script side of the pipeline: it discovers live inputs, attaches instrumentation idempotently, renders instant draft segmentation, and keeps the tab pipeline state moving without touching final DOM commit behavior. The final commit remains Step 11.

## 8.1 Scope Lock and Source of Truth

### Phase 8 decision lock matrix

The following decisions are locked for Step 8 and must not be reopened unless a source-of-truth doc changes first.

| Decision area | Locked choice (Phase 8) | Why this is locked now | Downstream dependency |
|---|---|---|---|
| Input discovery owner | The content script owns active-input discovery for textarea and contenteditable elements. | DOM interaction belongs in the content script, not in the background worker, and Step 8 is the first content-side instrumentation slice. | 8.3 attachment, 8.6 re-attach |
| Text extraction contract | Text extraction must handle textarea and contenteditable safely: textarea uses `.value`; contenteditable preserves block/newline semantics without reflow-heavy extraction paths. | Clause splitting and semantic payload generation require consistent text shape across host editors. | 8.3 extraction, 8.4 state updates |
| Attachment idempotency | Each target element gets one instrumentation marker and duplicate listeners are prevented across rerenders. | Dynamic apps rerender often and repeated listeners would break deterministic typing behavior. | 8.3 attachment, 8.6 observer recovery |
| Pipeline state scaffold | The content script owns the Step 8 pipeline state scaffold and serializes only the minimal state needed for input lifecycle transitions. | Step 8 needs a stable local state model without absorbing acceptance or commit behavior. | 8.4 state transitions, 8.7 validation |
| Debounce and cancellation | New input cancels stale semantic work with debounce plus AbortController. | The preview pipeline must not lag behind the user’s current text. | 8.4 cancellation, 8.7 validation |
| Syntactic split contract | Instant syntactic split drives immediate draft underlines without API calls and without mutating host text nodes. | Users need immediate visual feedback before any semantic call is made, and cursor stability requires non-mutating underline rendering. | 8.5 split pass, 8.7 validation |
| MutationObserver role | MutationObserver is only a reattachment mechanism, must ignore extension-originated mutations, and must not become a second source of truth. | Rerender-heavy sites must remain instrumented without duplicate ownership or self-trigger mutation loops. | 8.6 observer recovery |
| Step boundary rule | Step 8 implements input discovery, listener attachment, draft segmentation, debounce, and state scaffolding only; Step 9 overlay rendering and Step 10/11 acceptance/commit behavior remain deferred. | Preserves the Step 8 / Step 9 / Step 10 / Step 11 split and prevents scope bleed. | 8.2 deferments, 8.8 handoff |

### Step 8 scope in one paragraph

Step 8 extends the content script from a passive bridge endpoint into the active input-instrumentation layer. It must detect supported input surfaces, attach exactly one listener bundle per target, immediately render syntactic draft underlines, debounce semantic classification work, and reattach cleanly when apps rerender their input nodes. It must not render overlays, accept sections, or commit any final prompt text.

### Deliverables extracted from the overarching plan

1. Robust attachment to textarea and contenteditable inputs.
2. MutationObserver re-attach logic for dynamic apps.
3. Pipeline state machine scaffold.
4. Debounce and AbortController cancellation for stale calls.
5. Syntactic split pass for instant underline draft.

### Current implementation snapshot and runtime-deferred surface

Current implementation state:

1. `extension/src/content/index.ts` opens the background Port and logs bridge traffic only.
2. No durable input discovery exists yet.
3. No idempotent listener attachment exists yet.
4. No MutationObserver recovery logic exists yet.
5. No syntactic split or debounce pipeline exists yet.

Runtime-deferred implementation surface for this planning pass:

1. `extension/src/content/index.ts`
2. `shared/contracts/domain.ts` only if a minimal state or attachment refinement is proven necessary.

Planning rule:

1. Do not add overlay rendering, acceptance logic, or commit logic during Step 8.
2. Keep the content script fetch-free except for the existing Step 7 bridge behavior.
3. Treat any request to rewrite DOM text before Step 11 as scope creep.

### Source-of-truth file map

| Concern | Source of truth | Why this is canonical |
|---|---|---|
| Content-script responsibilities and MV3 boundaries | `docs/ARCHITECTURE.md` + `docs/EXTENSION.md` | Defines what the content script may own and what must stay in the background worker. |
| Draft segmentation, debounce, and pipeline timing | `docs/CLAUSE_PIPELINE.md` | Defines the zero-cost syntactic split, debounce timing, and state progression. |
| User-facing state transitions and dirty-state behavior | `docs/UX_FLOW.md` | Defines how input lifecycle state should evolve from typing through previewing. |
| Step 8 deliverables and downstream step split | `docs/agent_plans/v1_overarching_plan.md` | Defines the Step 8 checklist and the Step 9/10/11 boundaries. |
| Background transport dependency | `docs/agent_plans/v1_step_by_step/v1_step_7.md` | Confirms the Port bridge already exists and should be reused without changing transport ownership. |
| Shared canonical tab and section enums | `shared/contracts/domain.ts` | Defines `TabStatus`, `SectionStatus`, and `GoalType` without inventing parallel state. |
| Step-level acceptance criteria | `docs/agent_plans/v1_step_by_step/v1_step_8.md` | Defines the execution checklist and done criteria for this phase. |

### Step 8 out of scope

1. No mirror overlay, ghost text, or hover preview rendering.
2. No Tab / Shift+Tab acceptance queue or dirty-state graph.
3. No Cmd+Enter / Enter / Esc bind and commit flow.
4. No backend route, SSE, or provider changes.
5. No popup, account, or usage UX changes.
6. No direct DOM replacement of the final prompt before the explicit commit step.

## 8.2 Planning Surface and Documentation Boundary

### Numbering convention

1. Taskboard execution numbering (`8.x`) lives in `docs/agent_plans/v1_step_by_step/v1_step_8.md`.
2. This planning blueprint uses decision labels (`D1..D7`) plus file-level slices for dependency mapping.
3. If numbering appears to overlap with the conceptual pipeline labels in `docs/CLAUSE_PIPELINE.md`, treat this blueprint as the phase lock and the pipeline doc as the broader end-to-end flow.

### Current implementation vs target state

1. Current implementation: the content script only opens the bridge Port and reports messages.
2. Target Step 8 state: the content script discovers live inputs, attaches listeners idempotently, debounces stale work, and emits syntactic draft segmentation.
3. Target Step 8 state does not include final prompt replacement, acceptance flow, or commit behavior.

### Planning-only rule for this pass

1. This file is the scope-lock and contract-alignment reference for Step 8.
2. Session choreography and approval preferences are intentionally excluded.
3. Execution workflow details live in the Step 8 taskboard and repository-wide agent instructions.

### Documentation consistency targets

1. Keep content-instrumentation language aligned across planning, taskboard, and source-of-truth docs.
2. Keep requirements at contract level (`what must be true`), not line-level implementation instructions.
3. Keep Step 9, Step 10, and Step 11 deferments explicit so Step 8 does not absorb later visual or commit behavior.

## Design Decisions for Step 8 Execution

### Decision D1: The content script owns active-input discovery

Rationale:

1. DOM ownership belongs in the content script under MV3 boundaries.
2. The background worker already owns privileged transport and should not be turned into a DOM scanner.
3. Input discovery needs direct access to textarea and contenteditable elements in the page context.

Planning rule:

1. Keep input discovery in `extension/src/content/index.ts`.
2. Restrict discovery to supported live input surfaces.
3. Do not add page-wide DOM mutation behavior outside the content script.
4. Extract textarea text from `.value`.
5. Extract contenteditable text with newline-preserving logic that respects block boundaries, without relying on reflow-heavy extraction paths.

### Decision D2: Listener attachment must be idempotent

Rationale:

1. Rerender-heavy apps can replace nodes without changing user intent.
2. Duplicate listeners would cause repeated segmentation and stale state churn.
3. A stable attachment marker keeps reattachment safe and cheap.

Planning rule:

1. Mark each instrumented target once.
2. Reuse the same attachment path when the same element is revisited.
3. Reject duplicate handler registration even when MutationObserver fires multiple times.

### Decision D3: The pipeline state scaffold stays local and serializable

Rationale:

1. Step 8 needs a tab-local lifecycle model before later steps add preview, acceptance, and commit behavior.
2. Shared state must remain serializable because the extension architecture already uses storage and messaging boundaries.
3. Local state makes debounce and cancellation deterministic.

Planning rule:

1. Keep the Step 8 state machine inside the content script.
2. Serialize only minimal tab state needed for input lifecycle transitions.
3. Reuse the canonical `TabStatus` and `SectionStatus` meanings instead of inventing a parallel lifecycle.

### Decision D4: Syntactic split is instant and deterministic

Rationale:

1. Users need immediate feedback while typing, even before any model call returns.
2. A deterministic split pass gives the UI a draft shape without waiting on the network.
3. The split output becomes the scaffold for later semantic classification.

Planning rule:

1. Render syntactic underlines immediately on input changes.
2. Keep the split logic free of provider calls.
3. Do not mutate the underlying text while rendering the draft pass.
4. Underline rendering must use non-mutating techniques (CSS Custom Highlight API where supported, or a non-interactive overlay layer).
5. Do not wrap active user text nodes in inline markup for underline rendering.

### Decision D5: Debounce and AbortController are the only stale-work controls

Rationale:

1. Typing should not trigger a request on every keystroke.
2. Stale in-flight work must be cancelled as soon as newer text arrives.
3. The content script needs one canonical stale-work policy, not multiple timing hacks.

Planning rule:

1. Use debounce to delay semantic work.
2. Abort any in-flight semantic work when newer input arrives.
3. Treat debounce and abort as a pair, not as separate optional mechanisms.

### Decision D6: MutationObserver reattachment is recovery, not ownership

Rationale:

1. Dynamic apps frequently replace input nodes during rerenders.
2. The observer must restore instrumentation without becoming the source of truth for the pipeline.
3. Recovery logic should stay narrow so it remains predictable and testable.

Planning rule:

1. Use MutationObserver only to detect when reattachment is required.
2. Re-scan and reattach with the same idempotent path used on initial discovery.
3. Ignore extension-originated mutations so observer callbacks do not recurse on marker writes.
4. React only to relevant newly added nodes.
5. Pause or disconnect around extension-owned DOM updates when needed to prevent self-trigger loops.
6. Do not let the observer create a second, hidden state machine.

### Decision D7: Step 8 is strictly instrumentation plus draft segmentation

Rationale:

1. Step 9 owns overlays and preview rendering.
2. Step 10 owns acceptance and dirty-state behavior.
3. Step 11 owns bind and final commit behavior.

Planning rule:

1. Implement only discovery, attachment, state scaffolding, debounce, split, and reattach behavior in this step.
2. Keep overlay, acceptance, and commit behavior unchanged.
3. Keep the final DOM replacement deferred until the explicit commit step.

## File-Level Plan for Remaining Step 8 Slices

### 8.3 Discover active inputs and attach instrumentation

- `extension/src/content/index.ts`
- `shared/contracts/domain.ts` (only if a minimal attachment-state refinement is required)

Dependencies: Step 7 Port bridge and the existing canonical tab/section contracts.

Execution order constraint:

1. Scan for supported live inputs.
2. Attach one listener bundle per target.
3. Keep the attachment path idempotent across rescans.
4. Normalize text extraction by input type so contenteditable extraction preserves newline semantics.

### 8.4 Build the pipeline state scaffold and stale-work cancellation

- `extension/src/content/index.ts`
- `shared/contracts/domain.ts` (only if the state enum or serializable tab state needs a refinement)

Dependencies: 8.3 discovery and attachment complete.

Execution order constraint:

1. Define the local pipeline state transitions needed for Step 8.
2. Add debounce timers for semantic work.
3. Cancel stale requests with AbortController on newer input.

### 8.5 Add the syntactic split pass and draft underline handoff

- `extension/src/content/index.ts`

Dependencies: 8.3 input discovery and 8.4 debounce flow complete.

Execution order constraint:

1. Split the raw text deterministically.
2. Render draft underlines immediately with non-mutating highlight mechanics.
3. Keep the split output compatible with later semantic work.

### 8.6 Add MutationObserver reattachment and duplicate-listener protection

- `extension/src/content/index.ts`
- `shared/contracts/domain.ts` (only if an observer or attachment state refinement is needed)

Dependencies: 8.3 listener attachment and 8.4 state scaffold complete.

Execution order constraint:

1. Observe rerender-heavy input containers.
2. Reattach through the same idempotent path.
3. Ignore extension-originated mutation records and process only relevant added-node changes.
4. Preserve single ownership of each target element.

### 8.7 Add the Step 8 validation matrix

- `extension/src/content/index.ts`
- `shared/contracts/domain.ts`
- `extension/package.json` (only if a real extension test script must be added)

Dependencies: 8.3 through 8.6 complete.

Execution order constraint:

1. Prove discovery and attachment behavior.
2. Prove debounce cancellation and stale-work suppression.
3. Prove MutationObserver recovery on rerender-heavy inputs.

### 8.8 Final review and handoff

- `extension/src/content/index.ts`
- `docs/agent_plans/v1_step_by_step/v1_step_8.md`

Dependencies: 8.7 validation complete.

Execution order constraint:

1. Verify Step 8 boundaries against the diff.
2. Confirm Step 9 overlay rendering and Step 10/11 behavior remain deferred.
3. Capture any residual risks before handing off to Step 9.

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