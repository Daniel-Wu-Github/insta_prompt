---
name: hotkey-bind-commit-ux
description: "Use when implementing Step 11 hotkey guards, bind-trigger flow, ghost preview behavior, and final commit/reset semantics."
user-invocable: false
---

# Hotkey Bind Commit UX

## When to Use

Use this skill when implementing or modifying Step 11 interaction behavior, including:

- `Tab`, `Shift+Tab`, `Cmd+Enter`, `Enter`, and `Esc` key handling
- bind trigger preconditions and stale-blocking guards
- ghost preview progression from bind stream to final commit
- commit and reset behavior across textarea and contenteditable targets

## When Not to Use

Do not use this skill for:

- stream transport parsing and backend event framing
- canonical clause ordering rules
- background session persistence internals
- input discovery and observer attachment logic

## Files and Surfaces

Primary files:

- `extension/src/content/index.ts`
- `shared/contracts/domain.ts`
- `docs/UX_FLOW.md`
- `docs/CLAUSE_PIPELINE.md`

## Deliverables

- deterministic keybinding behavior with explicit state guards
- bind action gating that blocks invalid/stale acceptance states
- reliable commit semantics for both textarea and contenteditable
- cancel/reset behavior that fully clears transient workflow state

## Core Invariants

1. Workflow remains non-destructive until explicit final commit.
2. `Cmd+Enter` only binds when guard conditions are satisfied.
3. `Enter` commit path is deterministic and input-type aware.
4. `Esc` aborts pending transient behavior and clears temporary UI state.
5. Every keyboard event listener MUST check `event.isComposing` before handling hotkeys so IME input for Chinese, Japanese, and Korean users is never broken.
6. Hotkey interception MUST explicitly manage `event.preventDefault()` and `event.stopPropagation()` so host shortcuts in apps like Notion or Gmail do not fire in parallel.

## Implementation Procedure

1. Define key handling table by current tab/section state, and make every keyboard listener exit early when `event.isComposing` is true.
2. Implement stale-aware guard checks before bind trigger.
3. When a hotkey is intercepted, call `event.preventDefault()` and `event.stopPropagation()` before routing the extension action so host shortcuts do not compete.
4. Route bind output into preview state until explicit commit event.
5. Implement commit path for textarea with input event dispatch.
6. Implement commit path for contenteditable with safe text replacement semantics.
7. Implement cancel/reset path that clears active stream, preview, and queue focus.
8. Add transition tests for repeated key sequences, IME composition, and interruption paths.

## Verification Checklist

- key actions map correctly across `ACCEPTING`, `BINDING`, and `BINDING_COMPLETE`
- bind is blocked while accepted sections are stale
- commit updates the correct target element type reliably
- cancel/reset path leaves no stale preview or pending request state
- no source-text replacement occurs before explicit commit action

## References

- [Hotkey guard matrix](references/HOTKEY_GUARD_MATRIX.md)
- `docs/UX_FLOW.md`
- `docs/CLAUSE_PIPELINE.md`
