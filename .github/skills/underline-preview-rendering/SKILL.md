---
name: underline-preview-rendering
description: "Use when implementing Step 9 mirror overlay underlines, confidence/stale visual states, and hover preview lifecycle behavior."
user-invocable: false
---

# Underline Preview Rendering

## When to Use

Use this skill when implementing or modifying Step 9 rendering behavior, including:

- mirror overlay alignment with source input
- goal-type and confidence visual styling
- stale/ready/accepted visual differentiation
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
- clear handling of low-confidence and stale clause visuals

## Core Invariants

1. Rendering derives from section state and confidence; it does not redefine state semantics.
2. Overlay alignment MUST perfectly track the host using `window.getComputedStyle`, `ResizeObserver`, and `scroll` event listeners.
3. The mirror overlay MUST be strictly `pointer-events: none` to prevent stealing focus or clicks from the host input.
4. Preview content is rendered as text-safe content, not unsafe HTML, and MUST be isolated from host CSS using Shadow DOM or aggressive CSS resets (e.g., `all: initial`).
5. Stale and low-confidence signals remain visually distinct and consistent.

## Implementation Procedure

1. Build mirror overlay synchronization: you MUST extract and copy `font-family`, `font-size`, `line-height`, `padding`, `border-width`, and `white-space` from the host input via `getComputedStyle`.
2. Map `goal_type` to stable color tokens.
3. Map confidence and stale status to underline style tokens.
4. Implement preview card lifecycle states: loading, ready, stale, error.
5. Recompute geometry: you MUST wire a `scroll` listener to sync `scrollTop`/`scrollLeft`, and a `ResizeObserver` to sync dimensions.
6. Add fallback rendering behavior when precise caret anchoring is unavailable.

## Verification Checklist

- underlines remain aligned during typing and scrolling
- low-confidence and stale styles match contract consistently
- hover previews show correct lifecycle state for each section
- rendering path avoids unsafe HTML insertion
- fallback mode remains readable and non-blocking

## References

- [Rendering state map](references/RENDERING_STATE_MAP.md)
- `docs/UX_FLOW.md`
- `docs/CLAUSE_PIPELINE.md`
