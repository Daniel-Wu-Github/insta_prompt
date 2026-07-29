---
name: llm-router-and-model-selection
description: "Use when implementing Step 3 model routing for callType, tier, and mode across Groq, Anthropic, and BYOK paths."
user-invocable: false
---

# LLM Router and Model Selection

## When to Use

Use this skill when implementing or changing backend model-selection behavior, including:

- `selectModel` routing tables
- callType and tier branching
- mode-based token budgets
- provider and model ID mapping
- deterministic fallback behavior for unsupported route keys

## When Not to Use

Do not use this skill for:

- prompt text template authoring
- section state management in extension UI
- SSE forwarding/abort mechanics
- rate-limit middleware behavior

## Files and Surfaces

Primary files:

- `backend/src/services/llm.ts`
- `shared/contracts/domain.ts`
- `backend/src/__tests__/`

Primary docs:

- `docs/LLM_ROUTING.md`
- `docs/BACKEND_API.md`
- `docs/ARCHITECTURE.md`

## Deliverables

- deterministic route key model for `callType x tier x mode`
- explicit provider and model IDs for each supported path
- explicit max-token budgets by mode
- stable fallback behavior on unknown route combinations
- route-matrix unit tests with full coverage of supported combinations

## Core Invariants

1. `segment` must route to the cheap fast classification model path.
2. Free tier must never route to paid-provider-only models.
3. Tier gating is orthogonal to prompt construction.
4. Mode controls output budget semantics, not tier semantics.
5. Routing logic must be deterministic and side-effect free.
6. Extension never performs direct provider API calls.

## Implementation Procedure

1. Define `RouteKey` and `ModelConfig` types with explicit union constraints.
2. Build routing matrix from source-of-truth docs before coding branches.
3. Implement `modeTokens` helper with explicit values for all modes.
4. Implement `selectModel` using deterministic branching and no network side effects.
5. Add explicit unknown-route handling strategy (error or safe default).
6. Add full matrix unit tests, including unsupported combinations.
7. Validate route decisions against tier constraints from Step 2 enforcement assumptions.

## Routing Rules

- `segment` routes to fast classifier regardless of mode.
- Free tier uses Groq-only path for generation routes.
- Pro tier uses mode-sensitive premium routing.
- BYOK routes through user-configured provider/model path.

## Verification Checklist

- all supported route keys resolve to one deterministic `ModelConfig`
- free tier never resolves to forbidden provider/model paths
- token budgets are mode-complete and tested
- route behavior is documented and matches source-of-truth docs
- no prompt-text or SSE behavior leaked into router implementation

## References

- [Routing matrix](references/ROUTING_MATRIX.md)
- `docs/LLM_ROUTING.md`
- `docs/ARCHITECTURE.md`
