---
name: underline-preview-rendering
description: "Use when implementing Step 9 mirror overlay underlines, section visual states (ready/accepted/stale/streaming/error), and hover preview lifecycle behavior."
user-invocable: false
---

# Underline Preview Rendering

## When to Use

Use this skill when implementing or modifying Step 9 rendering behavior, including:

- mirror overlay alignment with source input
- clause-type color and section-state visual styling
- stale/ready/accepted/streaming visual differentiation
- hover preview card states for loading, ready, and stale content

## When Not to Use

Do not use this skill for:

- input discovery and MutationObserver attachment logic
- background port orchestration and stream parsing
- hotkey guards and final commit semantics
- canonical ordering policy definitions

## Files and Surfaces

Primary files:

- `extension/src/content/index.ts`
- `docs/UX_FLOW.md`
- `docs/CLAUSE_PIPELINE.md`

## Deliverables

- stable visual mapping from clause state to underline/popup presentation
- deterministic overlay positioning behavior under scroll/resize/input changes
- safe preview rendering that avoids HTML injection paths
- clear handling of stale, accepted, and streaming clause visuals

## Core Invariants

1. Rendering derives from section state; it does not redefine state semantics. (Confidence was removed — DECISION-1 — so there is no confidence-driven styling.)
2. Overlay alignment MUST perfectly track the host using `window.getComputedStyle`, `getBoundingClientRect`, `ResizeObserver`, `scroll` event listeners, and a `border-box` box model.
3. The mirror overlay MUST be strictly `pointer-events: none` to prevent stealing focus or clicks from the host input.
4. Preview content is rendered as text-safe content, not unsafe HTML, and MUST be isolated from host CSS using Shadow DOM or aggressive CSS resets (e.g., `all: initial`).
5. Stale, accepted, and streaming signals remain visually distinct and consistent.

## Implementation Procedure

1. Build mirror overlay synchronization: use `getComputedStyle` to copy `font-family`, `font-size`, `line-height`, `letter-spacing`, `word-spacing`, `white-space`, `word-break`, `overflow-wrap`, `padding-*`, and `border-*-width`; force `box-sizing: border-box`; propagate word-spacing through both the shell and inner text layers; set overlay `width`/`height` from `getBoundingClientRect()`; and set `color` plus `-webkit-text-fill-color` to `transparent`.
2. Map `goal_type` to stable color tokens.
3. Map section state (ready/accepted/stale/accepted-stale/streaming/error) to underline style tokens.
4. Implement preview card lifecycle states: loading, ready, stale, error.
5. Recompute geometry: you MUST wire a `scroll` listener to sync `scrollTop`/`scrollLeft`, and a `ResizeObserver` to sync dimensions.
6. Add fallback rendering behavior when precise caret anchoring is unavailable.

## Verification Checklist

- underlines remain aligned during typing and scrolling
- section-state styles (stale/accepted/streaming) match contract consistently
- hover previews show correct lifecycle state for each section
- rendering path avoids unsafe HTML insertion
- fallback mode remains readable and non-blocking

## References

- [Rendering state map](references/RENDERING_STATE_MAP.md)
- `docs/UX_FLOW.md`
- `docs/CLAUSE_PIPELINE.md`
