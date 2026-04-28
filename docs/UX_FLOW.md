# UX Flow

> The complete interaction model for PromptCompiler's clause-segmentation UX.

Status note:

- Current runtime is mixed: Step 7 background bridge is active, while full content-script UX instrumentation remains staged after Step 7.
- The interaction sequence below is the target Step 5+ UX flow.

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
   → Confidence shown via underline weight (solid vs dashed)
        ↓
5. Parallel expansion calls fire (POST /enhance × N sections)
   → Expansions stream in behind the scenes into hover previews
        ↓
6. User hovers any underlined clause → popover shows expanded preview
        ↓
7. User presses Tab to accept the oldest unaccepted / selected clause
   → Section text greys out in place (NOT replaced yet)
   → Next unaccepted clause is auto-focused
        ↓
8. User repeats Tab for remaining sections (or skips with Shift+Tab)
        ↓
9. User presses Cmd+Enter → binding pass fires (POST /bind)
   → All accepted expansions sent in canonical order
   → Final assembled prompt streams back
        ↓
10. User presses Enter → original text replaced with compiled prompt
    → Ghost text cleared, state reset
```

---

## Hotkey Map

| Key | Action |
|---|---|
| `Tab` | Accept oldest unaccepted section (grey it out) |
| `Shift+Tab` | Skip / deselect current section |
| `Cmd+Enter` | Trigger binding pass (assemble all accepted sections) |
| `Esc` | Dismiss ghost text / cancel pending enhancement |
| Hover | Show expansion preview popover for any underlined clause |

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

### Underline Confidence
- **Solid underline** — high confidence segmentation (≥0.85)
- **Dashed underline** — low confidence (< 0.85), user may want to adjust before accepting

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
                              ↑
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

### Fallback: Floating Panel
Triggered when:
- Ghost text positioning fails (e.g. CSP blocks inline style injection)
- Target element is inside a Shadow DOM we can't measure
- User explicitly switches to panel mode in popup settings

The panel appears as a 320px card anchored to the bottom-right of the target input, showing all sections with their expansion previews in a scrollable list.

---

## Canonical Ordering

The user types clauses in any order. PromptCompiler remaps them to the canonical slot order that LLMs respond best to:

```
[context] → [tech_stack] → [constraint] → [action] → [output_format] → [edge_case]
```

The underlines show **where text sits in the original input**. The binding pass assembles in **canonical order** regardless. The user never needs to think about this — it happens silently.

---

## Binding Pass

When the user presses `Cmd+Enter`, a single LLM call receives all accepted expansions **in canonical order** and produces one coherent prompt:

- Removes redundancy between sections
- Ensures tonal consistency
- Adds transitions between sections
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