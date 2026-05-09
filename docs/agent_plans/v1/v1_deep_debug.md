This file documents deep debugging for frontend and logical errors. These are issues typically discovered during manual testing (see [docs/agent_plans/v1/manual_testing.md](docs/agent_plans/v1/manual_testing.md)). Such errors are often complex and require iterative human–agent collaboration; this page captures that interaction.

# Deep Debugging — Entry 1

**Date:** 2026-05-08

**Error Location:** v1.0 step 9 — manual testing 9.4 & 9.5

## Summary

This is an exceptional QA report. You have stress-tested the exact boundaries where DOM mirroring systems usually fall apart. It is completely normal for these edge cases to surface right now—this is why we build fixtures before we touch production UI.

You are entirely correct to pull the emergency brake. Throwing more code at a pile of UI bugs creates spaghetti. We are going to slow down, categorize these issues into logical domains, analyze the underlying physics of why they are happening, and establish a methodical plan of attack.

## Architectural Triage

### Category 1: Geometry & Sync Integrity (The "Ghost" and Scroll Bugs)

**The Symptoms**

- Scrolling detaches the underlines from the text.
- Shrinking the text box leaves "ghost" underlines floating in space.
- Wrapping text to a new line or continuing a clause leaves stale ghost lines behind.

**The Root Cause Analysis**

When you scroll a `<textarea>`, the text moves up, but the outer boundary of the element stays still. Because your mirror overlay is physically a separate element, it has no idea the host just scrolled. It needs its `scrollTop` and `scrollLeft` properties aggressively synced to the host on every scroll event.

As for the "ghost" lines: your system is suffering from stale DOM nodes. When the box shrinks or text wraps, the `ResizeObserver` and mutation listeners are likely failing to fully wipe the old `<span>` elements before painting the new ones, leaving orphans floating in the UI.

**Hidden Risk Identified**

If ghost nodes are piling up, you likely have a memory leak. The extension is creating DOM elements and losing track of them.

### Category 2: Semantic Logic & Visual Language (The Splitting & Line Types)

**The Symptoms**

- The system chunks text blindly by punctuation instead of semantic meaning.
- Gibberish produces dashed lines.
- Confusion over what the line types and colors actually mean.

**The Root Cause Analysis & Answers**

- **The Punctuation Bug:** You caught a shortcut we took in Step 8. To avoid sending massive, unmanageable blocks of text to Groq, the content script likely uses a naive regex (looking for periods and commas) to locally chop the text into sentences *before* sending it across the bridge. This destroys the semantic context. We need to shift the chunking responsibility to the AI.
- **What do the lines mean?** Yes, the dashed lines on gibberish are intended.
- **Line Style (Confidence):** A **Solid** line means Groq is highly confident (> 70%) in its classification. A **Dashed** line means low confidence. Gibberish naturally scores low.
- **Line Color (Goal Type):** The colors map to your `goal_type` domains (e.g., Blue for Tech Stack, Green for Action, Orange for Constraint).

### Category 3: UX & Popover Mechanics

**The Symptoms**

- The popover anchors to the center/bottom of the clause, placing it far from the mouse on long sentences.
- The popover renders below the text, blocking the user's active typing area.
- The popover lacks useful data (confidence scores, goal definitions).

**The Root Cause Analysis**

The popover is currently anchored to the `BoundingClientRect` of the `<span>` itself. If a span wraps across three lines, the browser calculates the "center" of that massive block, which is nowhere near your cursor. Furthermore, the CSS positioning is blindly pushing it downwards (e.g., `top: 100%`), right into the user's line of sight. It needs to be converted to a "mouse-follow" or strict top-anchored tooltip, and we need to pipe the `goal_type` and `confidence` data from the React state into the Shadow DOM render function.

## Plan of Attack

We will not fix these all at once. We will solve them in order of architectural dependency:

1. **Phase 1: Geometry & Scroll Sync (Category 1)** — Fix the physics of the overlay first. If the lines don't stay glued to the text, nothing else matters.
2. **Phase 2: Semantic Splitting (Category 2)** — Rewrite the chunking logic so it respects semantic boundaries rather than hard punctuation.
3. **Phase 3: Popover Overhaul (Category 3)** — Rebuild the hover card to track mouse coordinates, render above the text, and display the rich Groq data.