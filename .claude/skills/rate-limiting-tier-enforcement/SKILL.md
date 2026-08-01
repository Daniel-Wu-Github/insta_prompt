---
name: rate-limiting-tier-enforcement
description: "Use when implementing Redis-backed daily quotas, tier gate behavior, and public endpoint abuse controls for Step 2 backend routes."
user-invocable: false
---

# Rate Limiting and Tier Enforcement

## When to Use

Use this skill when a task touches Step 2 enforcement behavior in backend routes or middleware, including:

- per-user daily limits for protected LLM routes
- tier-based request eligibility checks
- dedicated abuse controls for public auth endpoints
- deterministic 429, 403, and 503 response behavior
- rate-limit header consistency

## When Not to Use

Do not use this skill for:

- model-selection table logic in `services/llm.ts`
- goal-type prompt template construction
- extension content-script UI behavior
- Supabase auth/session contract changes that do not affect Step 2 enforcement

## Files and Surfaces

Primary files:

- `backend/src/middleware/ratelimit.ts`
- `backend/src/middleware/tier.ts`
- `backend/src/routes/auth.ts`
- `backend/src/index.ts`
- `backend/src/types.ts`
- `backend/src/__tests__/`

Primary docs:

- `docs/BACKEND_API.md`
- `docs/ARCHITECTURE.md`
- `docs/agent_plans/v1_step_by_step/v1_step_2.md`
- `docs/agent_plans/v1_step_by_step/v1_step_2_planning.md`

## Deliverables

- deterministic free-tier daily cap enforcement on protected LLM routes
- deterministic tier-forbidden responses with clear error codes
- dedicated IP-based abuse protection for `/auth/token`
- stable `X-RateLimit-*` headers on enforcement paths
- deterministic behavior on Redis unavailability
- integration and stress coverage for boundary and concurrency conditions

## Core Invariants

1. Protected route order remains `auth -> ratelimit -> tier -> route`.
2. Free-tier cap uses Redis key `rate:daily:{userId}`.
3. Daily key TTL resets at next UTC midnight, not rolling 24 hours.
4. Tier values come only from verified auth context, never client input.
5. `/auth/token` is public and receives its own IP-based limiter.
6. Redis failures must not silently bypass enforcement.
7. Error envelopes are deterministic and machine-readable.

## Implementation Procedure

1. Confirm middleware surface and route scope before coding.
2. Implement rate-limit helper logic with explicit key/TTL behavior and deterministic return types.
3. Apply free-tier checks only to Step 2 protected LLM routes (`/segment`, `/enhance`, `/bind`).
4. Emit stable `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.
5. Implement tier checks as a separate gate after rate limiting.
6. Add explicit public-endpoint limiter in `/auth/token` flow using trusted proxy IP extraction.
7. Add boundary tests for request counts around the cap and concurrency bursts.
8. Add Redis failure-path tests for deterministic `503 RATE_LIMIT_UNAVAILABLE` behavior.

## Response Rules

- Quota exceeded: `429` with `error.code = RATE_LIMIT_EXCEEDED`.
- Tier violation: `403` with `error.code = TIER_FORBIDDEN`.
- Rate service unavailable: `503` with `error.code = RATE_LIMIT_UNAVAILABLE`.
- Missing/invalid auth stays owned by auth middleware (`401`).

## Verification Checklist

- protected routes still preserve middleware ordering
- `/auth/token` remains outside auth middleware and has IP limiting
- cap behavior is deterministic at 29 -> 30 -> 31 checks
- response envelopes and headers are stable across success and failure
- Redis-unavailable behavior is deterministic and tested
- no Step 3 model-routing logic was introduced

## References

- [Rate limit matrix](references/RATE_LIMIT_MATRIX.md)
- `docs/BACKEND_API.md`
- `docs/ARCHITECTURE.md`
- `docs/agent_plans/v1_step_by_step/v1_step_2_planning.md`
