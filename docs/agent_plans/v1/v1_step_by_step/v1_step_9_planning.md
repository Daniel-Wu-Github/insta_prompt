# Step 9 Planning Blueprint (Underline + Preview Rendering Layer)

This document records the planned design and scope locks for Step 9.
It is aligned with:

- [Architecture](../../../ARCHITECTURE.md)
- [Clause Pipeline](../../../CLAUSE_PIPELINE.md)
- [Data Models](../../../DATA_MODELS.md)
- [Extension](../../../EXTENSION.md)
- [UX Flow](../../../UX_FLOW.md)
- [v1 overarching plan](../v1_overarching_plan.md)
- [v1 Step 8 taskboard](./v1_step_8.md)
- [v1 Step 8 planning blueprint](./v1_step_8_planning.md)

Step 9 is the content-script rendering layer: it turns Step 8 draft segmentation into stable visual semantics, adds hover preview affordances, and keeps the tab pipeline non-destructive while the user inspects sections. The final commit remains Step 11.

## 9.1 Scope Lock and Source of Truth

### Phase 9 decision lock matrix

The following decisions are locked for Step 9 and must not be reopened unless a source-of-truth doc changes first.

| Decision area | Locked choice (Phase 9) | Why this is locked now | Downstream dependency |
|---|---|---|---|
| Rendering owner | The content script owns underline alignment, overlay positioning, and hover preview DOM. | DOM interaction belongs in the content script under MV3 boundaries, not in the background worker. | 9.3 geometry, 9.5 hover |
| Geometry sync contract | Overlay position tracks source input geometry, scroll, and resize, and never mutates host text nodes. | Visual layers must stay aligned without perturbing selection or cursor behavior. | 9.3 alignment, 9.6 validation |
| Visual semantics contract | `goal_type` maps to a stable palette, confidence maps to solid vs dashed underlines, and stale state maps to muted/warning visuals. | Users need predictable visual semantics that match the UX flow. | 9.4 style mapping |
| Preview lifecycle contract | Hover preview states are `loading`, `ready`, and `stale`; preview rendering is text-only and safe. | Hover card semantics must be predictable and safe. | 9.5 lifecycle |
| State contract | Step 9 renders from existing section metadata instead of inventing a parallel lifecycle. | Shared contracts already define `SectionStatus` and `TabStatus`. | 9.4 and 9.5 state handling |
| Step boundary rule | Step 9 implements overlay rendering, confidence/stale styling, and hover previews only; Step 10 acceptance and Step 11 bind and commit remain deferred. | Preserves the Step 9 / Step 10 / Step 11 split. | 9.2 deferments, 9.7 handoff |

### Step 9 scope in one paragraph

Step 9 extends the Step 8 draft-underline base into a production rendering layer. It must keep underlines aligned with the source input, encode confidence and `goal_type` with stable colors and stroke styles, surface hover previews for classified clauses, and stay non-destructive while the user is still inspecting sections. It must not add acceptance behavior, dirty-state mutation logic, or final prompt replacement.

### Deliverables extracted from the overarching plan

1. Mirror overlay rendering for partial underlines in textarea.
2. Confidence-aware underline styles.
3. Hover preview popovers with stream-progress states.

### Current implementation snapshot and runtime-deferred surface

Current implementation state:

1. `extension/src/content/index.ts` already discovers inputs, attaches once, debounces stale work, renders draft underlines, and keeps the draft overlay synchronized with scroll and resize.
2. No hover preview popovers exist yet.
3. No stable `goal_type` palette or confidence/stale visual mapping exists yet.
4. No preview-state model for `loading`, `ready`, or `stale` exists yet.
5. No acceptance or commit logic belongs to this step.

Runtime-deferred implementation surface for this planning pass:

1. `extension/src/content/index.ts`
2. `shared/contracts/domain.ts` only if a minimal rendering-state refinement is proven necessary.

Planning rule:

1. Do not add acceptance logic, dirty-state propagation, or commit logic during Step 9.
2. Keep the content script render-only except for the existing input and hover interactions.
3. Treat any request to rewrite DOM text before Step 11 as scope creep.

### Source-of-truth file map

| Concern | Source of truth | Why this is canonical |
|---|---|---|
| Visual semantics and hover preview expectations | [UX Flow](../../../UX_FLOW.md) | Defines colored underlines, hover previews, ghost-text fallback, and state transitions. |
| Draft segmentation, confidence encoding, and preview timing | [Clause Pipeline](../../../CLAUSE_PIPELINE.md) | Defines the zero-cost syntactic split, confidence thresholds, and preview lifecycle. |
| Content-script responsibilities and MV3 boundaries | [Architecture](../../../ARCHITECTURE.md) + [Extension](../../../EXTENSION.md) | Defines what the content script may own and what must stay in the background worker. |
| Shared preview and tab state vocabulary | [Data Models](../../../DATA_MODELS.md) + `../../../../shared/contracts/domain.ts` | Defines the storage and enum surfaces Step 9 must not duplicate. |
| Step 9 deliverables and downstream step split | [v1 overarching plan](../v1_overarching_plan.md) | Defines the Step 9 checklist and the Step 10/11 boundaries. |
| Step 8 handoff context | [v1 Step 8 taskboard](./v1_step_8.md) + [v1 Step 8 planning blueprint](./v1_step_8_planning.md) | Confirms the draft-underlining base Step 9 builds on. |

### Step 9 out of scope

1. No Tab / Shift+Tab acceptance queue or dirty-state graph.
2. No Cmd+Enter / Enter / Esc commit flow.
3. No backend route, SSE, or provider changes.
4. No popup, account, or usage UX changes.
5. No direct DOM replacement of the final prompt before the explicit commit step.

## 9.2 Planning Surface and Documentation Boundary

### Numbering convention

1. Taskboard execution numbering (`9.x`) lives in `./v1_step_9.md`.
2. This planning blueprint uses decision labels (`D1..D7`) plus file-level slices for dependency mapping.
3. If numbering appears to overlap with the conceptual pipeline labels in `../../../CLAUSE_PIPELINE.md`, treat this blueprint as the phase lock and the pipeline doc as the broader end-to-end flow.

### Current implementation vs target state

1. Current implementation: the content script already renders draft underlines and keeps the overlay synchronized with input geometry.
2. Target Step 9 state: the content script adds stable visual semantics and hover preview surfaces for classified clauses.
3. Target Step 9 state does not include acceptance flow, dirty-state propagation, or final commit behavior.

### Planning-only rule for this pass

1. This file is the scope-lock and contract-alignment reference for Step 9.
2. Session choreography and approval preferences are intentionally excluded.
3. Execution workflow details live in the Step 9 taskboard and repository-wide agent instructions.

### Documentation consistency targets

1. Keep rendering-language aligned across planning, taskboard, and source-of-truth docs.
2. Keep requirements at contract level (`what must be true`), not line-level implementation instructions.
3. Keep Step 10 and Step 11 deferments explicit so Step 9 does not absorb later acceptance or commit behavior.

## Design Decisions for Step 9 Execution

### Decision D1: The content script owns the rendering layer

Rationale:

1. DOM ownership belongs in the content script under MV3 boundaries.
2. The background worker already owns privileged transport and should not be turned into a renderer.
3. Overlay alignment and hover interactions need direct access to the page DOM.

Planning rule:

1. Keep rendering work in `extension/src/content/index.ts`.
2. Restrict hover and underline surfaces to supported live input elements.
3. Do not add page-wide rendering behavior outside the content script.

### Decision D2: Overlay rendering must stay non-mutating and geometry-synced

Rationale:

1. Users need visually accurate underlines without destabilizing the editor.
2. Cursor and selection stability depend on not wrapping or replacing live text nodes.
3. Scroll and resize changes must not desynchronize the overlay from the source input.

Planning rule:

1. Keep overlay positioning tied to the source input geometry.
2. Render underline visuals without mutating host text nodes.
3. Keep the overlay DOM isolated from the host input tree.

### Decision D3: `goal_type`, confidence, and stale state drive visual semantics

Rationale:

1. Users learn the clause vocabulary through stable visual cues.
2. Confidence encodes how much trust to place in a segmentation result.
3. Stale state needs a distinct visual treatment so preview content does not imply freshness.

Planning rule:

1. Map `goal_type` to a stable color palette.
2. Map confidence to solid versus dashed underline treatment.
3. Map stale state to muted or warning-oriented visuals and cleared previews.
4. Do not let visual treatment change canonical clause order.

### Decision D4: Hover previews remain local, serializable, and text-only

Rationale:

1. Hover previews are a view layer, not a second source of truth.
2. Preview content should not steal focus or require DOM rewriting.
3. Safe rendering avoids HTML injection and layout instability.

Planning rule:

1. Keep preview state local to the content script.
2. Surface only `loading`, `ready`, and `stale` preview states.
3. Keep hover content text-only and safe to render.
4. Dismiss previews deterministically on blur, scroll, escape, or rerender.

### Decision D5: Preview state should follow existing section metadata

Rationale:

1. Shared contracts already define the section and tab vocabulary.
2. Step 9 should not invent a parallel lifecycle just for rendering.
3. Existing status values are sufficient to drive a view model for hover surfaces.

Planning rule:

1. Derive hover and underline visuals from the canonical section metadata.
2. Reuse the shared `SectionStatus` and `TabStatus` meanings instead of inventing a second state model.
3. Add shared typing only if the rendering layer proves a minimal refinement is necessary.

### Decision D6: Safe render behavior is a hard requirement

Rationale:

1. Unsafe HTML in hover cards or overlays would create security and UX regressions.
2. Focus stealing would break the non-destructive compile flow.
3. Rendering code should remain deterministic enough for small, stable tests.

Planning rule:

1. Use safe text rendering for hover content.
2. Avoid focus theft, selection mutation, or host DOM replacement.
3. Keep validation focused on geometry, style, and hover lifecycle.

### Decision D7: Step 9 is strictly rendering plus hover previews

Rationale:

1. Step 10 owns acceptance and dirty-state behavior.
2. Step 11 owns bind and final commit behavior.
3. Keeping Step 9 narrow prevents visual work from swallowing lifecycle logic.

Planning rule:

1. Implement only overlay alignment, visual styling, and hover preview behavior in this step.
2. Keep acceptance, dirty-state mutation, and commit behavior unchanged.
3. Keep the final DOM replacement deferred until the explicit commit step.

## File-Level Plan for Remaining Step 9 Slices

### 9.3 Add overlay alignment and mirror rendering

- `extension/src/content/index.ts`
- `shared/contracts/domain.ts` only if a geometry or state helper type is required.

Dependencies: Step 8 input instrumentation and draft segmentation are complete.

Execution order constraint:

1. Derive geometry from the active input.
2. Keep the overlay aligned across scroll and resize.
3. Preserve the non-mutating render path.

### 9.4 Add visual semantics for `goal_type`, confidence, and stale state

- `extension/src/content/index.ts`
- `shared/contracts/domain.ts` only if the visual-state enum needs refinement.

Dependencies: 9.3 overlay alignment complete.

Execution order constraint:

1. Define the stable palette first.
2. Map confidence to underline weight or dash pattern.
3. Map stale state to muted or warning visuals without changing clause order.

### 9.5 Add hover preview lifecycle and safe rendering

- `extension/src/content/index.ts`
- `shared/contracts/domain.ts` only if preview-state typing needs refinement.

Dependencies: 9.3 geometry and 9.4 visual semantics complete.

Execution order constraint:

1. Show preview content on hover.
2. Keep preview state limited to loading, ready, and stale.
3. Dismiss preview surfaces deterministically.

### 9.6 Add the Step 9 validation matrix

- `extension/src/content/index.ts`
- `shared/contracts/domain.ts`
- `extension/src/content/__tests__/instrumentation.test.ts` if coverage needs to expand in place.
- `extension/package.json` only if a real extension test script must be added.

Dependencies: 9.3 through 9.5 complete.

Execution order constraint:

1. Prove overlay alignment on the happy path and rerender path.
2. Prove style mapping and stale visuals.
3. Prove hover preview lifecycle and safe render behavior.

### 9.7 Final review and handoff

- `extension/src/content/index.ts`
- `./v1_step_9.md`

Dependencies: 9.6 validation complete.

Execution order constraint:

1. Verify Step 9 boundaries against the diff.
2. Confirm Step 10 acceptance and Step 11 commit behavior remain deferred.
3. Capture any residual risks before handing off to Step 10.

## Step 9 Quality Bar

Treat Step 9 as production rendering work, not temporary scaffolding.

1. Every supported active input shows aligned underlines while typing and scrolling.
2. Confidence and stale states are visibly distinct and deterministic.
3. Hover previews appear safely, stay readable, and dismiss cleanly.
4. Overlay DOM remains isolated from the host input tree.
5. Step 10 acceptance and Step 11 commit behavior remain untouched.

## Step 9 Exit Criteria

Do not start Step 10 until all of these are true:

1. Step 9 taskboard is complete.
2. Overlay alignment and style mapping are deterministic on happy and rerender paths.
3. Hover preview behavior is reproducible.
4. Step 9 validation passes.
5. No Step 10+ acceptance or Step 11 commit behavior was implemented early.

## Short Version You Can Remember

1. Step 9 owns overlay alignment and preview rendering.
2. Step 9 maps `goal_type`, confidence, and stale state to visuals.
3. Step 9 shows hover previews only.
4. Step 10 and Step 11 remain separate and deferred.