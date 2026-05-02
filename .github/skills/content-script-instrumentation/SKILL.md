---
name: content-script-instrumentation
description: "Use when implementing Step 8 textarea/contenteditable instrumentation, duplicate-listener prevention after rerenders, MutationObserver re-attach, and stale-request debounce/abort cancellation."
user-invocable: false
---

# Content Script Instrumentation

## When to Use

Use this skill when implementing or modifying Step 8 content instrumentation behavior, including:

- textarea and contenteditable discovery
- idempotent listener attachment markers
- MutationObserver re-attach logic for dynamic editors
- debounce and `AbortController` cancellation for stale requests
- early state-machine bootstrap from typing into segmentation flow

## When Not to Use

Do not use this skill for:

- background worker port/session persistence logic
- visual rendering of underlines and hover cards
- hotkey bind/commit behavior
- backend route or SSE transport implementation

## Files and Surfaces

Primary files:

- `extension/src/content/index.ts`
- `shared/contracts/domain.ts`
- `docs/EXTENSION.md`
- `docs/UX_FLOW.md`

## Deliverables

- deterministic input discovery and attach behavior
- observer-based re-attach resilience for dynamic DOM apps
- stale-call cancellation via debounce and abort controls
- explicit transition hooks into the clause pipeline state machine

## Core Invariants

1. Instrumentation is idempotent and never double-attaches handlers.
2. Input attachment survives common SPA re-render and node replacement paths.
3. New input changes cancel stale in-flight work before starting new work.
4. Instrumentation logic does not perform privileged background-only operations.
5. Host text nodes MUST NOT be mutated with `<span>` wrappers to render draft states; use the CSS Custom Highlights API (`CSS.highlights`) or an invisible overlay instead.
6. Safe text extraction from contenteditable MUST preserve block-level newlines (for example, converting `<br>` and `<div>` to `\n`) and MUST NOT rely on `.textContent`.
7. MutationObserver callbacks MUST explicitly ignore mutations caused by the extension (for example, adding `data-insta-instrumented` attributes) to prevent infinite browser crash loops.

## Implementation Procedure

1. Build input discovery selectors for textarea and contenteditable targets, and choose a render path that uses CSS Custom Highlights (`CSS.highlights`) or an invisible overlay instead of span wrappers.
2. Add attachment marker strategy to prevent duplicate listeners.
3. Register MutationObserver with bounded scope and deterministic teardown.
4. On relevant mutations, re-run discovery and attach only where missing; explicitly ignore extension-caused mutations such as `data-insta-instrumented` markers.
5. Safely extract contenteditable text while preserving block-level newlines (for example, converting `<br>` and `<div>` to `\n`) instead of using `.textContent`.
6. Use debounce windows for segment-trigger scheduling.
6. Pair each scheduled request with `AbortController` for stale cancellation.
7. Emit consistent hooks/events for downstream preview and acceptance layers.

## Verification Checklist

- no duplicate listeners after repeated re-render cycles
- observer disconnect/reobserve behavior is bounded and leak-safe
- stale calls are aborted before newer requests run
- instrumentation remains stable on Notion/Linear-like editor churn
- state transition hooks remain deterministic for repeated typing bursts

## References

- [Instrumentation flow and guards](references/INSTRUMENTATION_FLOW.md)
- `docs/EXTENSION.md`
- `docs/UX_FLOW.md`
