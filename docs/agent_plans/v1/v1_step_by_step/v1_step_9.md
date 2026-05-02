# Step 9 - Underline + Preview Rendering Layer

This is the tactical workboard for Step 9 in [v1_overarching_plan.md](../v1_overarching_plan.md). The goal is to turn the Step 8 draft-underlining base into confidence-aware rendering and hover preview surfaces while preserving Step 10 acceptance boundaries and Step 11 commit boundaries.

Step 9 is done when the repo has:

1. Mirror overlay rendering that stays aligned with textarea and contenteditable geometry.
2. Stable underline styling for `goal_type`, confidence, and stale/ready preview states.
3. Hover preview popovers or cards that surface loading, ready, and stale content.
4. Validation or tests that cover geometry sync, visual state mapping, hover lifecycle, and safe rendering.
5. No Step 10 acceptance graph or Step 11 bind/commit behavior leakage.

## Step 9 Taskboard

### 9.0 Readiness and dependency lock

Goal: ensure Step 8 draft underlines and Step 10/11 boundaries stay stable before the rendering layer lands.

- [ ] Confirm Step 8 input discovery, idempotent attachment, debounce, and draft underline rendering are still the base for Step 9.
- [ ] Confirm the current shared state contract (`TabStatus`, `SectionStatus`, `Section`, `TabState`) still matches the intended preview lifecycle.
- [ ] Confirm the target-site matrix includes textarea and contenteditable apps, including rerender-heavy apps like Notion and Linear.
- [ ] Confirm confidence styling, stale preview treatment, and hover preview states are covered by the source docs and remain the only Step 9 active behaviors.
- [ ] Confirm Step 10 acceptance and dirty-state graph behavior, and Step 11 bind and commit behavior, remain deferred.

Done when:

1. Preconditions are explicit.
2. Step 9 starts from locked Step 8 assumptions.
3. Deferred behaviors are named.

### 9.1 Lock scope and source of truth

Goal: make the rendering boundary explicit before implementation starts.

- [ ] Read [Architecture](../../../ARCHITECTURE.md), [Clause Pipeline](../../../CLAUSE_PIPELINE.md), [Data Models](../../../DATA_MODELS.md), [Extension](../../../EXTENSION.md), [UX Flow](../../../UX_FLOW.md), the [overarching plan](../v1_overarching_plan.md), and the [Step 8 taskboard](./v1_step_8.md) plus the [Step 8 planning blueprint](./v1_step_8_planning.md).
- [ ] Extract the exact Step 9 deliverables from the overarching plan and UX flow.
- [ ] Record the current implementation snapshot from `extension/src/content/index.ts`.
- [ ] Lock explicit out-of-scope boundaries for acceptance, dirty-state mutation logic, and final commit behavior.
- [ ] Record file ownership for overlay rendering, palette mapping, hover previews, and stale-state visuals.

Done when:

1. Scope is clear in one paragraph.
2. File ownership is explicit.
3. Out-of-scope constraints are explicit.

### 9.2 Confirm implementation surface and deferments

Goal: keep Step 9 focused on rendering and preview UI only.

- [ ] Confirm runtime changes stay inside `extension/src/content/index.ts` unless a small shared contract refinement is required.
- [ ] Confirm no backend route, SSE, or transport changes are needed for Step 9.
- [ ] Confirm no acceptance queue, dirty-state invalidation logic, or commit logic lands in Step 9.
- [ ] Confirm validation focuses on geometry sync, confidence/stale styling, preview state transitions, and safe hover rendering.

Allowed files for this slice:

1. `extension/src/content/index.ts`
2. `shared/contracts/domain.ts` only if rendering-state typing needs a refinement.

Done when:

1. File touch surface is narrow.
2. Step 10 and Step 11 behavior remain deferred.
3. Step 9 execution can start without scope ambiguity.

### 9.3 Implement overlay geometry sync and mirror rendering

Goal: keep visual overlays aligned with the source input across typing, scrolling, and rerenders.

- [ ] Add or refine mirror overlay geometry sync for textarea and contenteditable targets.
- [ ] **CRITICAL Mirror Sync:** To keep the overlay aligned, the script MUST extract and apply the exact `window.getComputedStyle(element)` properties from the host input to the overlay, specifically typography, padding, borders, line-height, letter-spacing, and white-space.
- [ ] **CRITICAL Scroll Sync:** You MUST attach a scroll event listener to the host input element. Whenever the host scrolls, you must immediately sync the overlay's `scrollTop` and `scrollLeft` properties so the underlines move with the text.
- [ ] Keep overlay positioning tied to the source input scroll and resize lifecycle.
- [ ] Preserve the non-mutating render path for all underline output.
- [ ] Keep overlay DOM isolated from the host input tree.

Allowed files for this slice:

1. `extension/src/content/index.ts`
2. `shared/contracts/domain.ts` only if a geometry or state helper type is needed.

Done when:

1. Geometry remains aligned.
2. Overlay rendering does not mutate host text nodes.
3. Scroll and resize updates stay stable.

### 9.4 Map `goal_type`, confidence, and stale state to visual treatment

Goal: encode classification and preview confidence in a stable palette and underline style.

- [ ] Map each `goal_type` to a stable color palette.
- [ ] Render solid underlines for high-confidence sections and dashed underlines for low-confidence sections.
- [ ] Render stale sections distinctly, including muted previews and warning treatment.
- [ ] Keep visual treatment deterministic across rerenders and reattachments.
- [ ] Do not change canonical order in the rendering layer; styling must not imply sequence changes.

Allowed files for this slice:

1. `extension/src/content/index.ts`
2. `shared/contracts/domain.ts` only if the visual-state enum needs refinement.

Done when:

1. Visual semantics are stable.
2. Confidence and stale states are legible.
3. The same section renders the same way across refreshes.

### 9.5 Implement hover preview popovers and preview lifecycle

Goal: surface expansion previews without committing anything into the text box.

- [ ] Add hover-triggered preview popovers for underlined clauses.
- [ ] **CRITICAL CSS Isolation:** The hover popover MUST be isolated from the host page's CSS. Mount it inside a Shadow DOM attached to `document.body`, or use aggressive CSS resets such as `all: initial`, and position it with fixed coordinates from `getBoundingClientRect()` for the hovered underline.
- [ ] Model preview states for loading, ready, and stale content.
- [ ] Keep hover content text-only and safe to render.
- [ ] Avoid stealing focus from the active editor or interfering with selection.
- [ ] Ensure preview dismissal is deterministic on blur, scroll, escape, or target rerender.
- [ ] Keep hover surfaces separated from ghost text and final commit behavior.

Allowed files for this slice:

1. `extension/src/content/index.ts`
2. `shared/contracts/domain.ts` only if preview-state typing needs refinement.

Done when:

1. Hover previews appear and disappear predictably.
2. Loading, ready, and stale states are visible.
3. Preview UI remains non-destructive.

### 9.6 Add the Step 9 validation matrix

Goal: prove geometry, style, and hover behavior.

- [ ] Add deterministic validation for overlay alignment on scroll, resize, and rerender paths.
- [ ] Add deterministic validation that computed-style mirroring includes typography, padding, borders, line-height, letter-spacing, and white-space.
- [ ] Add deterministic validation that host scroll events immediately update the overlay's scroll offset.
- [ ] Add deterministic validation for confidence-to-style mapping and stale treatment.
- [ ] Add deterministic validation for hover preview lifecycles and dismissal behavior.
- [ ] Add deterministic validation that hover popovers are isolated from host CSS bleed and are not clipped by host stacking or overflow contexts.
- [ ] Add deterministic validation that safe rendering does not mutate host text nodes or introduce unsafe HTML.
- [ ] Keep validation isolated from live backend calls.

Allowed files for this slice:

1. `extension/src/content/index.ts`
2. `shared/contracts/domain.ts`
3. `extension/src/content/__tests__/instrumentation.test.ts` if coverage needs to expand in place.
4. `extension/package.json` only if a real extension test script must be added.

Done when:

1. Rendering behavior is regression-resistant.
2. Hover preview state is deterministic.
3. Safe-render constraints are covered.

### 9.7 Final review and handoff

Goal: ensure Step 9 is complete and Step 10 can begin without reopening visual decisions.

- [ ] Review the diff against Step 9 acceptance criteria.
- [ ] Confirm no Step 10 acceptance queue or Step 11 bind and commit behavior landed early.
- [ ] Confirm geometry, style, and hover behavior are covered by validation.
- [ ] Update progress logs and note deferred Step 10/11 concerns.

Done when:

1. Step 9 taskboard is reflected in code and validation.
2. Step 10 can begin without reopening rendering decisions.
3. Out-of-scope behavior remains deferred.

## Step 9 Quality Bar

Treat Step 9 as production rendering work, not temporary scaffolding.

1. Underlines stay aligned while typing, scrolling, and rerendering.
2. Confidence and stale states remain legible and stable.
3. Hover previews render safely and dismiss cleanly.
4. Overlay DOM stays isolated from the host input tree.
5. Step 10 acceptance graph and Step 11 commit behavior remain untouched.

## Step 9 Exit Criteria

Do not start Step 10 until all of these are true:

1. Step 9 taskboard is complete.
2. Overlay alignment is deterministic on happy and rerender paths.
3. Confidence styling and hover previews are working.
4. Step 9 validation passes.
5. No Step 10+ acceptance or Step 11 commit behavior was implemented early.

## Short Version You Can Remember

1. Step 9 owns overlay alignment and preview rendering.
2. Step 9 maps `goal_type`, confidence, and stale state to visuals.
3. Step 9 shows hover previews only.
4. Step 10 and Step 11 remain separate and deferred.