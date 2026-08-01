# Rate Limit Matrix

This reference defines enforcement targets and expected behavior for Step 2.

## Route Matrix

| Route Group | Path | Identifier | Limit Class | Failure Code | Notes |
|---|---|---|---|---|---|
| Protected LLM | `/segment` | `userId` | Tier-based daily | `RATE_LIMIT_EXCEEDED` | Enforced after auth |
| Protected LLM | `/enhance` | `userId` | Tier-based daily | `RATE_LIMIT_EXCEEDED` | Enforced after auth |
| Protected LLM | `/bind` | `userId` | Tier-based daily | `RATE_LIMIT_EXCEEDED` | Enforced after auth |
| Public Auth | `/auth/token` | client IP | Public abuse limiter | `RATE_LIMIT_EXCEEDED` | Must stay outside auth middleware |

## Redis Key Rules

- Per-user daily key: `rate:daily:{userId}`
- Public auth key: `rate:auth-token-ip:{clientIp}`
- Window reset: next UTC midnight for daily keys

## Header Contract

Include these headers where quota checks run:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

If quota is exceeded, include `Retry-After` with deterministic value.

## IP Extraction Priority

1. `fly-client-ip`
2. first token of `x-forwarded-for`
3. request socket or framework fallback

Only trust forwarded headers in known proxy environments.

## Failure Contract

- Quota exceeded: `429` + `RATE_LIMIT_EXCEEDED`
- Tier forbidden: `403` + `TIER_FORBIDDEN`
- Rate infrastructure unavailable: `503` + `RATE_LIMIT_UNAVAILABLE`

## Boundary Test Set

Mandatory assertions:

1. Count 29 is allowed for free tier.
2. Count 30 behavior matches documented cap boundary.
3. Count 31 is rejected with deterministic 429 envelope.
4. Concurrent near-cap requests remain deterministic.
5. Redis client failure returns deterministic 503 envelope.
