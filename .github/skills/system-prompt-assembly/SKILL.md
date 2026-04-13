---
name: system-prompt-assembly
description: "Use when implementing Step 3 prompt template factories, sibling-context injection, and canonical bind prompt assembly for backend expansion routes."
user-invocable: false
---

# System Prompt Assembly

## When to Use

Use this skill when implementing prompt assembly behavior for backend expansion and bind flows, including:

- goal-type prompt factory functions
- mode-specific instruction injection
- sibling-context synthesis for `/enhance`
- canonical bind prompt construction for `/bind`
- deterministic prompt assembly tests

## When Not to Use

Do not use this skill for:

- model provider selection logic
- rate-limit/tier middleware behavior
- extension runtime state handling
- MV3 process-boundary concerns

## Files and Surfaces

Primary files:

- `backend/src/services/prompts/`
- `backend/src/routes/enhance.ts`
- `backend/src/routes/bind.ts`
- `backend/src/lib/sse.ts`
- `shared/contracts/sse.ts`

Primary docs:

- `docs/LLM_ROUTING.md`
- `docs/CLAUSE_PIPELINE.md`
- `docs/BACKEND_API.md`

## Deliverables

- one prompt-factory surface per `goal_type`
- mode-aware instruction blocks with deterministic output-shape intent
- sibling-context injection that is explicit and bounded
- canonical bind prompt that enforces slot order and dedup intent
- prompt assembly tests independent of live provider calls

## Core Invariants

1. Prompt factories are deterministic pure functions.
2. `goal_type` controls semantic framing of the instruction set.
3. Mode controls verbosity and token-shape intent.
4. `/enhance` injects sibling context only when present.
5. `/bind` enforces canonical slot ordering regardless of client order.
6. SSE event envelope remains `token | done | error`.

## Implementation Procedure

1. Define prompt-factory API surface and per-goal template files.
2. Create mode instruction blocks for all supported modes.
3. Add sibling-context serializer with explicit length and formatting guards.
4. Add bind prompt factory that includes canonical order and dedup requirements.
5. Keep route handlers thin by delegating all prompt text composition to service layer.
6. Add deterministic tests for prompt outputs by goal and mode.
7. Validate no provider-specific API logic leaks into prompt factories.

## Assembly Rules

- Use one clear instruction hierarchy: role, task, constraints, output shape.
- Keep formatting instructions explicit for each mode.
- Keep sibling-context blocks clearly demarcated.
- Ensure bind prompt asks for coherence and redundancy reduction.

## Verification Checklist

- every `goal_type` has a tested prompt-factory implementation
- every mode produces deterministic instruction variants
- sibling-context injection is present only when expected
- bind prompt includes canonical-slot ordering contract
- SSE route output still conforms to shared stream envelope types

## References

- [Prompt assembly checklist](references/PROMPT_ASSEMBLY_CHECKLIST.md)
- `docs/LLM_ROUTING.md`
- `docs/CLAUSE_PIPELINE.md`
