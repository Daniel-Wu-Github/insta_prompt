# UX Flow

> The complete interaction model for PromptCompiler's clause-segmentation UX.

Status note (updated 2026-08-02): the "Step" staging language below is historical — full
content-script UX instrumentation is shipped, not staged. See `human/06_FABLE_PASS_REPORT.md`
for what was finished in the pass that closed this gap.

---

## Core Concept: The Prompt Compiler

PromptCompiler treats your casual input as **source code** that gets compiled into a structured prompt. The process is visible and controllable — you can see each clause being classified, preview its expansion, and accept or skip sections individually before a final assembly pass.

The key design principle: **nothing is replaced in the text box until you explicitly commit**. The compilation is non-destructive until `Enter` after the binding preview.

---

## Full Interaction Flow

```
1. User types naturally into any textarea or contenteditable
        ↓
2. Syntactic split fires instantly (regex, no API)
   → Colored underlines appear on detected clauses
        ↓
3. 200ms idle → subtle "thinking" animation begins
        ↓
4. 600ms idle → semantic classification call fires (POST /segment)
   → Underlines update with goal_type colors
        ↓
5. Parallel expansion calls fire (POST /enhance × N sections)
   → Expansions stream in behind the scenes into hover previews
        ↓
6. User hovers any underlined clause → popover shows expanded preview
        ↓
7. User presses Tab to enter review mode / cycle focus to the next clause
   (Shift+Tab cycles backward) — Tab itself does NOT accept anything
        ↓
8. User presses Enter while a clause is focused → that clause is accepted
   → Section text greys out in place (NOT replaced yet)
   → Backspace/Delete while an accepted clause is focused un-accepts it
        ↓
9. User repeats Tab/Enter for remaining sections
        ↓
10. User presses Cmd+Enter → binding pass fires (POST /bind)
    → ALL sections sent in canonical order — accepted ones rewritten/merged/
      polished, unaccepted ones kept near-verbatim (Option E, non-destructive)
    → Final assembled prompt streams back as ghost text
        ↓
11. User presses Enter (ghost stream complete) → original text replaced with
    compiled prompt → ghost text cleared, state reset
```

---

## Hotkey Map

| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Enter review mode / cycle focus forward or backward through clauses (does not accept) |
| `Enter` (clause focused, no bind ready) | Accept the focused clause |
| `Backspace` / `Delete` (accepted clause focused) | Un-accept the focused clause |
| `Cmd+Enter` / `Ctrl+Enter` | Trigger binding pass (assembles ALL clauses — accepted ones rewritten, unaccepted ones near-verbatim) |
| `Enter` (bind stream complete) | Commit the bound ghost text into the input |
| `Esc` | Cancel active bind stream / exit review focus / dismiss ghost text |
| Hover | Show expansion preview popover for any underlined clause |

The content script's own on-screen keymap HUD states this identically:
`"Tab to review · Enter to accept · ⌫ to un-accept · ⌘/Ctrl+Enter to bind · Esc to exit"`.

---

## Keymap HUD and First-Run Coach Mark

While any underlines exist, a small persistent shadow-isolated HUD docks bottom-right
showing the current keymap (`"Tab to review · Enter to accept · ⌫ to un-accept ·
⌘/Ctrl+Enter to bind · Esc to exit"`) — created when segment rendering starts, removed on
`clearDraftRendering`. A one-time coach mark shows on first use, gated on
`chrome.storage.local` key `promptcompiler.onboarding.seen`.

---

## Clause Colors

Each `goal_type` gets a consistent color. Users learn the vocabulary naturally over time.

| Color | Goal Type | Example |
|---|---|---|
| Purple | `action` | "build a dark mode toggle" |
| Teal | `tech_stack` | "use React, TypeScript" |
| Coral | `constraint` | "no external libraries" |
| Blue | `output_format` | "return a JSON object" |
| Amber | `context` | "this is for a SaaS dashboard" |
| Gray | `edge_case` | "handle the empty state" |

### Underline States

Confidence was removed (DECISION-1); the clause-type color is constant per section. The
underline treatment instead reflects the section's lifecycle **state**:

- **Solid (clause color)** — ready, or accepted (greyed in place after Tab, not yet committed)
- **Solid (gray `--pc-color-stale`, reduced opacity)** — stale / accepted-stale: an upstream
  edit invalidated it and re-expansion is required before it can be bound
- **Animated affordance** — streaming during the bind / ghost-text pass

---

## The Three Modes

Controlled via the popup toggle. Affects token budget and model routing.

| Mode | Token Budget | Behavior |
|---|---|---|
| **Efficiency** | ~150 out | Sharpens prompt, removes ambiguity, stays concise. One paragraph. |
| **Balanced** | ~500 out | Adds context, constraints, output format. Structured with short sections. |
| **Detailed** | ~1000 out | Deeply structured prompt with explicit constraints, success criteria, and edge-case guidance. |

---

## Section States

Each clause section moves through these states independently:

```
idle → streaming → ready → accepted → stale
                     ↑         ↓ (Backspace/Delete while focused)
                     └─────────┘
                    user edits upstream text → downstream sections marked stale
                    stale sections show dashed underline + warning icon
                    must re-expand before binding pass can run
```

### Dirty State Rule
If the user edits the raw text of section A, all sections that `depends_on` section A are marked **stale**. Their underlines turn dashed and their expansion previews are cleared. They must be re-expanded (automatic on next debounce) before `Cmd+Enter` is available.

---

## Ghost Text vs Floating Panel

### Primary: Ghost Text
Rendered as a `position: fixed` overlay div positioned at the caret using the mirror-clone technique. Streams tokens in real time. Styled to match the target element's font exactly. `pointer-events: none` so clicks pass through.

### Fallback: Floating Panel — **not implemented**
This fallback mode (triggered by CSP/positioning failure, unmeasurable Shadow DOM, or a
popup toggle) does not exist in the current content script — no code path matches this
description as of 2026-08-02. Kept here as a design note in case it's revisited; do not
assume it's built.

---

## Canonical Ordering

The user types clauses in any order. PromptCompiler remaps them to the canonical slot order that LLMs respond best to:

```
[context] → [tech_stack] → [constraint] → [action] → [output_format] → [edge_case]
```

The underlines show **where text sits in the original input**. The binding pass assembles in **canonical order** regardless. The user never needs to think about this — it happens silently.

---

## Binding Pass

When the user presses `Cmd+Enter`, a single LLM call receives **all** sections — accepted
and unaccepted — **in canonical order** (Option E, non-destructive bind) and produces one
coherent prompt:

- Removes redundancy between accepted sections
- Ensures tonal consistency across accepted sections
- Adds transitions between sections
- Preserves unaccepted sections near-verbatim, in canonical position
- Returns a single structured markdown/XML block

The binding pass output streams in as ghost text. The user reviews it, then presses `Enter` to commit.

---

## Sites That Work

Target compatibility matrix (post Step 5 implementation):

| Site | Input Type | Status |
|---|---|---|
| Claude.ai | contenteditable | ✅ Full support |
| ChatGPT | contenteditable | ✅ Full support |
| Cursor (web) | contenteditable | ✅ Full support |
| GitHub (issues/PRs) | contenteditable | ✅ Full support |
| Notion | contenteditable (Lexical) | ✅ Needs MutationObserver re-attach |
| Linear | contenteditable (ProseMirror) | ✅ Full support |
| Slack Web | contenteditable (Lexical) | ✅ Needs testing |
| Google Docs | Canvas | ❌ Not possible (v1) |
| VS Code (desktop) | Custom — handled by VS Code extension | — |