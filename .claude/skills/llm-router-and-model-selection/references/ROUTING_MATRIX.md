# Routing Matrix

Reference matrix for Step 3 router implementation.

## Route Key

- `callType`: `segment | enhance | bind`
- `tier`: `free | pro | byok`
- `mode`: `efficiency | balanced | detailed`

## Expected Routing

| callType | free | pro efficiency | pro balanced | pro detailed | byok |
|---|---|---|---|---|---|
| segment | Groq fast classifier | Groq fast classifier | Groq fast classifier | Groq fast classifier | user-configured fast path |
| enhance | Groq generation path | Anthropic Haiku path | Anthropic Sonnet path | Anthropic Sonnet path | user-configured model |
| bind | Groq generation path | Anthropic Haiku path | Anthropic Sonnet path | Anthropic Sonnet path | user-configured model |

## Token Budgets

- `efficiency`: small budget
- `balanced`: medium budget
- `detailed`: large budget

Define exact constants in one place and test them directly.

## Failure Strategy

If a route key is unsupported:

1. return deterministic error result from router helper, or
2. return explicit safe default with documented reason

Do not silently coerce unknown tiers or modes.
