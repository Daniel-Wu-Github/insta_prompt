# Clause Pipeline

> The 8-step process that transforms raw user input into a fully structured AI prompt.

Status note:

- Step 0-2 currently provides deterministic placeholder backend behavior with stable request/response contracts.
- Step 3+ introduces semantic classification and production model-routing behavior.

---

## Overview

The clause pipeline is the intellectual core of PromptCompiler. It runs partially on the client (steps 1-2, 4, 6, 8) and partially on the backend (steps 3, 5, 7). Client-side steps are instant. In Step 0-2, backend steps return placeholders; in Step 3+, backend steps involve production LLM orchestration.

```
User types → [1] Syntactic split → [2] Debounce gate
          → [3] Semantic classification → [4] Merge + filter
          → [5] Parallel expansion → [6] User accepts (Tab)
          → [7] Binding pass (Cmd+Enter) → [8] DOM commit (Enter)
```

---

## Step 1 — Syntactic Split
**Location:** Content script | **Cost:** Zero | **Latency:** Instant

Regex + grammar rules detect clause boundaries without any API call. Provides a draft segmentation that renders underlines immediately while the semantic pass loads.

Split triggers on:
- Commas between independent clauses: `"build X, deploy to Y"`
- Coordinating conjunctions: `and / but / also / then / or`
- Semicolons
- Sentence-ending periods followed by capital letters

```typescript
// Rough split logic
function syntacticSplit(text: string): string[] {
  return text
    .split(/,\s*(?=[a-z])|;\s*|\band\b|\bbut\b|\balso\b|\bthen\b/i)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}
```

**Output:** Array of raw text strings (draft segments, no metadata yet).

---

## Step 2 — Debounce Gate
**Location:** Content script | **Cost:** Zero | **Latency:** 0–600ms

Controls when backend calls fire to avoid hammering the API on every keystroke.

- **0ms:** Syntactic split + underline render
- **200ms idle:** "Thinking" animation begins (subtle pulse on underlines)
- **600ms idle:** Semantic classification call fires
- **New keystroke:** AbortController cancels any in-flight request

```typescript
let debounceTimer: ReturnType<typeof setTimeout>;
let abortController: AbortController | null = null;

function handleInput(text: string) {
  renderSyntacticUnderlines(text); // instant

  clearTimeout(debounceTimer);
  abortController?.abort();

  setTimeout(() => showThinkingAnimation(), 200);

  debounceTimer = setTimeout(() => {
    abortController = new AbortController();
    fireSegmentCall(text, abortController.signal);
  }, 600);
}
```

---

## Step 3 — Semantic Classification (POST /segment)
**Location:** Backend | **Cost/latency:** placeholder in Step 0-2, model-based in Step 3+

Current Step 0-2 behavior: request validation plus deterministic placeholder classification.

Target Step 3+ behavior: send draft segments to a small, fast model that returns structured JSON classifying each clause.

### Request
```json
{
  "segments": ["build a dark mode toggle", "use react", "deploy to vercel"],
  "mode": "balanced"
}
```

### Response
```json
{
  "sections": [
    {
      "id": "s1",
      "text": "build a dark mode toggle",
      "goal_type": "action",
      "canonical_order": 4,
      "confidence": 0.95,
      "depends_on": []
    },
    {
      "id": "s2",
      "text": "use react",
      "goal_type": "tech_stack",
      "canonical_order": 2,
      "confidence": 0.98,
      "depends_on": []
    },
    {
      "id": "s3",
      "text": "deploy to vercel",
      "goal_type": "output_format",
      "canonical_order": 5,
      "confidence": 0.82,
      "depends_on": ["s1"]
    }
  ]
}
```

### goal_type taxonomy

| Type | Description | Canonical Slot |
|---|---|---|
| `context` | Background info, project summary | 1 |
| `tech_stack` | Languages, frameworks, tools | 2 |
| `constraint` | Rules, restrictions, "no X" | 3 |
| `action` | The main task to perform | 4 |
| `output_format` | Shape of desired output | 5 |
| `edge_case` | Corner cases to handle | 6 |

---

## Step 4 — Merge + Minimum Length Check
**Location:** Content script | **Cost:** Zero | **Latency:** Instant

Cleans up the classified sections before expansion.

**Merging rule:** Adjacent sections sharing the same `goal_type` are merged into one.

```
["use react", "use typescript"] (both tech_stack) → ["use react, use typescript"]
```

**Minimum length:** Fragments under ~6 words are absorbed into their nearest neighbor unless they have a different `goal_type`.

**Confidence encoding:** Sections with `confidence < 0.85` get a dashed underline instead of solid.

---

## Step 5 — Parallel Expansion (POST /enhance × N)
**Location:** Backend → LLM (model depends on tier/mode) | **Latency:** ~300–800ms streaming

Each section is expanded independently in parallel. Expansions stream back in real time, populating hover previews before the user even looks at them.

Current Step 0-2 behavior: request validation plus deterministic placeholder streaming output.

### Request (per section)
```json
{
  "section": {
    "id": "s1",
    "text": "build a dark mode toggle",
    "goal_type": "action"
  },
  "siblings": [
    { "id": "s2", "text": "use react", "goal_type": "tech_stack" }
  ],
  "mode": "balanced",
  "project_id": null
}
```

Sibling context from `depends_on` references is always injected so expansions are coherent with each other.

### Token budgets by mode

| Mode | Max Output Tokens | Typical Output |
|---|---|---|
| Efficiency | 150 | 1 tight paragraph |
| Balanced | 300 | Structured with 2-3 sections |
| Detailed | 600 | Full XML/markdown block with edge cases |

---

## Step 6 — User Accepts Sections (Tab)
**Location:** Content script + Background SW state | **Cost:** Zero

The user presses `Tab` to accept the oldest unaccepted (or currently focused) section.

**Critical rule: text is NOT replaced in the DOM at this step.** Accepted sections are only greyed out visually. The original text remains intact until the final commit in step 8.

This prevents the dirty-state cascade — if the user edits section 1 after accepting section 3, section 3 is marked stale but no DOM surgery has occurred.

### Section state after Tab press
```typescript
section.status = 'accepted';
section.element.style.opacity = '0.4'; // grey out visually
section.element.style.textDecoration = 'underline dotted'; // change underline style
```

---

## Step 7 — Binding Pass (POST /bind)
**Location:** Backend → Claude Sonnet or Groq | **Latency:** ~500ms–2s streaming

Triggered by `Cmd+Enter`. All accepted expansions are sent in **canonical order** (by `canonical_order` field, not the order the user accepted them) to a single LLM call.

Current Step 0-2 behavior: deterministic assembly that sorts by `canonical_order` and joins section expansions.

### Request
```json
{
  "sections": [
    { "canonical_order": 2, "goal_type": "tech_stack", "expansion": "React 18 with TypeScript..." },
    { "canonical_order": 4, "goal_type": "action", "expansion": "Implement a dark/light mode toggle..." },
    { "canonical_order": 5, "goal_type": "output_format", "expansion": "Deploy configuration for Vercel..." }
  ],
  "mode": "balanced"
}
```

### What the binding pass does
- Removes redundancy between expanded sections
- Ensures tonal and structural consistency
- Adds transitions and logical flow
- Returns a single coherent prompt as a streaming response

The bound prompt streams back as ghost text. User reviews, then presses `Enter` to commit.

---

## Step 8 — DOM Commit (Enter)
**Location:** Content script | **Cost:** Zero | **Latency:** Instant

The original text in the textarea/contenteditable is replaced with the final bound prompt.

```typescript
// For textarea
function commitToTextarea(el: HTMLTextAreaElement, prompt: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )!.set;
  nativeInputValueSetter!.call(el, prompt);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// For contenteditable
function commitToContentEditable(el: HTMLElement, prompt: string) {
  el.focus();
  document.execCommand('selectAll', false, undefined);
  document.execCommand('insertText', false, prompt);
}
```

Ghost text is cleared. State is reset to `IDLE` for the current tab. Enhancement history is written to Supabase.

---

## Pipeline State Summary

```
IDLE         No active input detected
TYPING       Input detected, syntactic underlines rendered
SEGMENTING   Debounce fired, /segment call in flight
PREVIEWING   Sections classified, expansions streaming in background
ACCEPTING    User is tabbing through sections
BINDING      Cmd+Enter pressed, /bind in flight
BINDING_COMPLETE Bind output is ready; Enter will commit and reset state to IDLE
```

Any edit to the raw text while in ACCEPTING or BINDING resets to TYPING and re-triggers the pipeline from step 2.