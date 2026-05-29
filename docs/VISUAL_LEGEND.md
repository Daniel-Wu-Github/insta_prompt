# Visual Legend — Colors & States (Ground Truth)

This document is the **single source of truth** for every color, underline style, opacity, and
visual state used in the PromptCompiler content-script overlay and hover popover. The in-product
legend (top-right of the hover popover) is a compact derivative of this table.

When you change a color token, an opacity, or a state-to-style mapping in
`extension/src/content/index.ts`, **update this document in the same change** and verify it still
matches `docs/UX_FLOW.md` (Clause Colors / Underline Confidence) and the `ui-design-system` skill.

> Source of truth in code: `GOAL_TYPE_PALETTE`, `DRAFT_*_OPACITY`, `DRAFT_HIGH_CONFIDENCE_THRESHOLD`,
> and `applyAcceptanceVisualsToSpan` in `extension/src/content/index.ts`.

---

## 1. Clause Colors (goal_type → underline color)

Listed in canonical bind order (`context → tech_stack → constraint → action → output_format → edge_case`).

| Goal Type | Name | Color (in-code `rgb`) | Hex | CSS token |
|---|---|---|---|---|
| `context` | Amber | `rgb(217 119 6)` | `#d97706` | `--insta-goal-type-context-color` |
| `tech_stack` | Teal | `rgb(15 118 110)` | `#0f766e` | `--insta-goal-type-tech-stack-color` |
| `constraint` | Coral | `rgb(244 63 94)` | `#f43f5e` | `--insta-goal-type-constraint-color` |
| `action` | Purple | `rgb(124 58 237)` | `#7c3aed` | `--insta-goal-type-action-color` |
| `output_format` | Blue | `rgb(29 78 216)` | `#1d4ed8` | `--insta-goal-type-output-format-color` |
| `edge_case` | Gray | `rgb(107 114 128)` | `#6b7280` | `--insta-goal-type-edge-case-color` |

> Note: the `ui-design-system` skill lists slightly different shades for some tokens
> (e.g. `constraint #e11d48`, `output_format #2563eb`). The values above are what the **code
> actually renders**. If you reconcile them, change code + skill + this doc together.

---

## 2. Underline Style (confidence → stroke)

Threshold: `DRAFT_HIGH_CONFIDENCE_THRESHOLD = 0.85`.

| Condition | Style | Thickness |
|---|---|---|
| Confidence ≥ 0.85 (high) | solid underline, full color | `2px` |
| Confidence < 0.85 (low) | dashed underline, full color | `1.5px` |

Underline offset is `2px`; `text-decoration-skip-ink: none` so descenders do not break the line.

---

## 3. Segment / Overlay States (opacity + treatment)

| State | What it means | Opacity | Underline treatment |
|---|---|---|---|
| **Active (unaccepted)** | Live, segmented, not yet accepted | `1.0` | goal-type color, solid/dashed by confidence |
| **Focused** | Current keyboard focus (Tab navigation) | `1.0` | as above + `1px` solid outline in goal-type color |
| **Accepted** | User accepted this clause (Tab) | `0.4` | goal-type color, solid `2px` |
| **Accepted + Stale** | Accepted, then upstream text changed | `0.3` | **amber** `rgb(217 119 6)`, dashed `2px` |
| **Stale (overlay)** | Whole overlay outdated — input blurred, or **paused** | `0.45` | greyed via host opacity; accepted spans go amber-dashed |
| **Paused** | User toggled "Paused" in the popup | `0.45` | same as Stale overlay — underlines grey out, no new dispatch |

Opacity constants in code: `DRAFT_ACCEPTED_OPACITY = 0.4`, `DRAFT_ACCEPTED_STALE_OPACITY = 0.3`,
`DRAFT_STALE_OPACITY = 0.45`.

### Pause vs Stale

Pause reuses the **stale** visual language deliberately: when the user pauses, the existing overlay
is marked stale (greyed to `0.45`) rather than removed, so the user can still see what was detected
but understands enhancements are not live. Typing after un-pausing re-segments and restores full
opacity. (Signed-out, by contrast, **removes** the overlay entirely — it is not greyed.)

---

## 4. Hover Popover States (status header color)

The hover popover shows a status word in the top-left; its color encodes the preview lifecycle.

| Status | Label | Header color (`rgb`) | Meaning |
|---|---|---|---|
| `loading` | Loading | `rgb(125 211 252)` (sky) | Enhancement preview is streaming/queued |
| `ready` | Ready | `rgb(134 239 172)` (green) | Enhanced preview is available |
| `stale` | Stale | `rgb(248 113 113)` (red) | Preview is outdated because the text changed |

The popover legend (top-right, opposite the status) shows the six goal-type swatches in canonical
order plus a final **Stale** swatch (grey `rgb(156 163 175)`, dashed) representing the
stale/paused treatment.

---

## 5. Where each value lives

| Concern | Code location |
|---|---|
| Goal-type colors | `GOAL_TYPE_PALETTE` |
| Canonical order | `CANONICAL_ORDER_BY_GOAL_TYPE` |
| Confidence threshold | `DRAFT_HIGH_CONFIDENCE_THRESHOLD` |
| Opacities | `DRAFT_ACCEPTED_OPACITY`, `DRAFT_ACCEPTED_STALE_OPACITY`, `DRAFT_STALE_OPACITY` |
| Span styling | `applyAcceptanceVisualsToSpan`, `renderDraftOverlaySegments` |
| Overlay freshness | `applyDraftOverlayFreshness` |
| Popover status colors | shadow-root `<style>` in `createDraftHoverPopoverShell` |
| Popover legend | `buildDraftHoverLegend`, `GOAL_TYPE_LEGEND_LABEL` |

Related: `docs/UX_FLOW.md` (§ Clause Colors, § Section States), `.github/skills/ui-design-system/SKILL.md`.
