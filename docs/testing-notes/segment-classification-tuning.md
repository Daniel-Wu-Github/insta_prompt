# Segment Classification Tuning — Investigation Log

Opened: 2026-05-29  
Trigger: Live session testing showed entire prompts classified as `action` regardless of content.

---

## Architecture Summary

Classification pipeline:

```
content script (client-side pre-segmentation)
  → splits text on punctuation (. , ; : ! ?)
  → sends array of strings to backend /segment

backend /segment route
  → classifySegmentsFromStreamingAdapter()
  → calls Groq llama-3.1-8b-instant (maxTokens: 500)
  → parses JSON response
  → normalizeGoalType() maps raw labels → canonical 6 types
  → fallback if parsing fails: goal_type = "context", confidence = 0.1
  → fallback if normalization unknown: goal_type = "action" ← PROBLEM
```

**Files:**
- `backend/src/services/segment.ts` — full pipeline
- `backend/src/services/llm.ts` line 88 — model config (`llama-3.1-8b-instant`)
- `backend/src/services/segment.ts` line 93 — `createSegmentClassificationPrompt()`

---

## Observed Failure Mode

Test prompt:
> I'm building a REST API for a mobile app using Node.js and Express. The API should be lightweight and respond in under 200ms. Generate the complete route handler for user authentication including JWT token issuance. Return a JSON response with the token, user ID, and expiration time. Handle the case where the user's account is locked after three failed login attempts.

**Expected segmentation:** 6 clauses, one per type (context, tech_stack, constraint, action, output_format, edge_case).

**Actual result:** All clauses classified as `action`. Single continuous purple underline across the entire prompt.

**Observed pattern over multiple sessions:**
- `action` — by far the most common result
- `output_format` — occasionally appears for "Return..." phrasing
- `edge_case` — rare, only appears for obvious "Handle the case..." phrasing
- `context`, `tech_stack`, `constraint` — never observed in live testing

---

## Root Cause Analysis

### Root Cause 1 — System prompt gives zero semantic guidance

Current system prompt (line 96 of `segment.ts`):
```
"You are a strict JSON classifier for PromptCompiler /segment. Output JSON only with no markdown, no prose, and no code fences."
```

This tells the model everything about output format and nothing about the 6 classification categories. A zero-shot classifier with no type definitions will use its own intuition about what "goal_type" labels make sense — which tends toward generic task-oriented labels like "task", "generate", "create", "build".

### Root Cause 2 — User prompt explicitly allows free-form labels

Current user prompt line (line 104):
```
"- goal_type can be any classifier label; normalization is handled server-side later."
```

This is actively harmful. It instructs the model NOT to use canonical labels, then expects server-side normalization to recover. The normalization map (`GOAL_TYPE_NORMALIZATION_MAP` in segment.ts line 176) has ~25 aliases, but misses common LLM outputs like "generate", "create", "build", "write", "implement", "specify", "describe", "define".

### Root Cause 3 — Unknown label fallback is "action"

`GOAL_TYPE_FALLBACK = "action"` (line 17). Any label the normalization map doesn't recognize falls to "action". Combined with RC2 above, this means the model's free-form labels flood into "action".

### Root Cause 4 — Model is undersized for zero-shot multi-label classification

`llama-3.1-8b-instant` is a strong fast model but zero-shot classification of subtle semantic distinctions (e.g., "constraint" vs. "context" vs. "tech_stack") is unreliable without definitions and examples. With proper prompting, an 8B model can handle this well — but it needs the guidance.

### Root Cause 5 — Client-side pre-segmentation is purely syntactic

The content script splits on `. , ; : ! ?` — this ignores semantic structure entirely. A sentence like "I'm building a REST API for a mobile app using Node.js and Express" is ONE sentence with two semantic roles (context + tech_stack) but produces ONE segment because there's no punctuation break between them.

This is a harder problem than RC1-4 — it requires either:
- Better splitting heuristics (split on coordinating phrases like "using X" after a noun)
- Or moving segmentation entirely to the backend and asking the model to both split AND classify

---

## Severity Assessment

**High** — this is not a cosmetic issue. The entire hover-and-accept UX depends on correct type classification. If everything is "action," then:
- The color coding is meaningless (one color for everything)
- The canonical reordering on bind has nothing to reorder
- The enhanced text quality suffers because the enhancement system prompt is tailored per type

This is NOT in scope for Phase 3 (rendering/popover/bind feedback). It is a standalone tuning session.

---

## Proposed Fix — Prompt Rewrite

**Scope:** `backend/src/services/segment.ts` — `createSegmentClassificationPrompt()` function only.

### System prompt rewrite

Replace the current empty system prompt with one that:
1. Defines all 6 goal types with 1-sentence definitions
2. Gives one concrete example phrase per type
3. Explicitly restricts output to the 6 canonical labels (not free-form)

Draft:
```
You are a strict JSON classifier for PromptCompiler. Classify each prompt segment into exactly one of these six goal_type values:

- context: Background, situation, project description, or "I am building X for Y" framing.
  Example: "I'm building a REST API for a mobile app"

- tech_stack: Specific technologies, languages, frameworks, libraries, or platforms.
  Example: "using Node.js and Express"

- constraint: Requirements, limits, non-negotiables, performance targets, or "must/should/cannot" rules.
  Example: "must respond in under 200ms" / "no external dependencies"

- action: The core task, instruction, or what to generate/write/create/explain.
  Example: "Write a function that..." / "Generate the route handler for..."

- output_format: How the output should be structured, formatted, or delivered.
  Example: "Return a JSON response with..." / "Format as a markdown table"

- edge_case: Exception handling, error cases, boundary conditions, or "handle the case where..."
  Example: "Handle the case where the user's account is locked"

Rules:
- Use ONLY these exact six values for goal_type. Never invent new labels.
- confidence is a float 0.0–1.0 (1.0 = very certain).
- Output JSON only. No markdown, no prose, no code fences.
```

### User prompt change

Change: `"- goal_type can be any classifier label; normalization is handled server-side later."`
To: `"- goal_type MUST be exactly one of: context, tech_stack, constraint, action, output_format, edge_case"`

### maxTokens

Current: 500. With few-shot examples added to the system prompt, the OUTPUT token count is unchanged (~50 per section). The system prompt is larger but that's input tokens. Keep at 500.

---

## Proposed Fix — Client-Side Segmentation

**Harder problem.** The syntactic splitter (split on `.` `,` etc.) needs to be enhanced or replaced.

**Option A — Improved heuristic (low effort, partial improvement):**
- Keep punctuation splitting
- Add a "compound clause" heuristic: if a segment > 12 words contains a tech keyword ("using X", "with X", "on X") after the main clause, split at that phrase boundary

**Option B — LLM-based splitting (higher effort, much better):**
- Move splitting to the backend: ask the LLM to BOTH split AND classify in one pass
- Prompt: "Split this prompt into semantic sections, then classify each"
- Tradeoff: one more LLM call, higher latency

**Option C — Hybrid (recommended path):**
- Keep syntactic splitting as-is for the Phase 3 milestone
- Fix the classification prompt (Root Causes 1-3) first — this alone will likely unblock context/constraint/tech_stack
- Revisit LLM-based splitting in a separate session once classification is clean

---

## Test Cases for Validation

When the prompt is rewritten, validate against these inputs. All should produce the indicated types:

| Input segment | Expected type |
|---|---|
| "I'm building a personal finance tracker for a side project" | context |
| "using Python with pandas and sqlite3" | tech_stack |
| "must run locally without any cloud dependencies" | constraint |
| "process transactions in under 5 seconds" | constraint |
| "Write a function that categorizes monthly expenses" | action |
| "Return the results as a markdown table" | output_format |
| "Handle cases where some months have no transactions" | edge_case |
| "I'm a senior dev working on a TypeScript monorepo" | context |
| "using Next.js App Router and Prisma" | tech_stack |
| "no third-party auth libraries allowed" | constraint |
| "Explain how middleware chaining works" | action |
| "Show output as a numbered list" | output_format |
| "Handle the case where the database is unreachable" | edge_case |

---

## Work Required

| Task | Effort | File |
|---|---|---|
| Rewrite `createSegmentClassificationPrompt()` — system prompt + type restriction | 1 session | `backend/src/services/segment.ts` |
| Expand `GOAL_TYPE_NORMALIZATION_MAP` with missed aliases | Small add-on | `backend/src/services/segment.ts` |
| Add few-shot examples to user prompt | 1 session | `backend/src/services/segment.ts` |
| Run validation test cases manually | Testing | — |
| Consider upgrading classifier model for better accuracy | Research | `backend/src/services/llm.ts` |
| LLM-based splitting (Option B above) | Future session | content + backend |

---

## Not In Scope for Phase 3

Phase 3 addresses rendering, popover UX, and bind feedback only. Classification quality is a separate workstream that should follow Phase 3.
