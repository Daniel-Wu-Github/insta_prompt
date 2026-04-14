# Step 2 Planning Blueprint (Rate Limiting and Tier Enforcement)

This document records the completed design and planning outputs for Step 2.
It is aligned with:

- `docs/ARCHITECTURE.md`
- `docs/BACKEND_API.md`
- `docs/LLM_ROUTING.md`
- `docs/CLAUSE_PIPELINE.md`
- `docs/agent_plans/v1_overarching_plan.md`
- `docs/agent_plans/v1_step_by_step/v1_step_1.md`
- `docs/agent_plans/v1_step_by_step/v1_step_2.md`

## 2.1 Scope Lock and Source of Truth

### Phase 2 decision lock matrix

The following decisions are now locked for implementation and must not be re-opened in Step 2 execution unless a source-of-truth doc changes first.

| Decision area | Locked choice (Phase 2) | Why this is locked now | Downstream dependency |
|---|---|---|---|
| Daily quota key and reset semantics | Protected LLM routes use Redis counter `rate:daily:{userId}` with TTL set to next UTC midnight at first increment. | Keeps free-tier quotas deterministic and auditable for every user-day. | 2.3 rate middleware, 2.7 quota boundary tests |
| Quota scope | Free daily cap applies to `/segment`, `/enhance`, and `/bind`. It does not apply to `/projects` in Step 2. | Prevents accidental throttling of non-LLM routes while preserving the Step 2 free-tier contract. | 2.3 middleware route targeting, 2.6 wiring review |
| Public endpoint protection | `/auth/token` remains outside auth middleware and receives dedicated IP-based rate limiting using trusted proxy headers (`fly-client-ip`, fallback `x-forwarded-for`). | Public refresh endpoints are abuse-prone and backend runs behind reverse proxy infrastructure, so raw socket IP is not trustworthy. | 2.4 route guard, 2.7 public endpoint tests |
| Middleware order invariant | Protected routes keep strict ordering: auth -> ratelimit -> tier -> route handler. | Tier and quota enforcement must consume verified auth context and execute before route logic. | 2.6 route wiring checks, 2.7 ordering tests |
| Tier source of truth and trust boundary | Tier always comes from verified auth context set by Step 1 middleware; headers/body cannot override it. | Prevents privilege escalation and keeps Step 3 routing assumptions valid. | 2.5 tier middleware, 2.7 negative tests |
| Tier gate behavior in Step 2 | Tier middleware validates recognized tier values and route-policy eligibility, while `/segment`, `/enhance`, and `/bind` remain available to recognized tiers in Step 2. | Preserves phase boundaries and avoids Step 3 model-router leakage while still shipping deterministic access control. | 2.5 tier policy surface, 2.8 scope audit |
| Redis failure behavior | Redis connectivity failures return deterministic `503` (`RATE_LIMIT_UNAVAILABLE`) rather than silently bypassing limits. | Avoids abuse windows and keeps enforcement behavior explicit under infra faults. | 2.3 middleware error path, 2.7 resilience tests |
| Error envelope and headers | 429 and 403 responses use stable error codes; protected LLM routes emit deterministic `X-RateLimit-*` headers while `/auth/token` emits retry headers only on 429 responses. | Keeps extension and backend tests stable, debuggable, and avoids leaking abuse thresholds on public success responses. | 2.3/2.4 response design, 2.7 assertions |
| Docs-first boundary for this pass | Planning/docs updates are completed first; backend/runtime edits are deferred to Phase F execution slices. | Prevents accidental scope creep into runtime code before planning lock and consistency checks complete. | Phase E consistency gate, Phase F handoff execution |

### Step 2 scope in one paragraph

Step 2 converts the Step 1 auth foundation into enforceable access controls: implement Redis-backed daily request limits for free-tier usage on protected LLM routes, add dedicated abuse protection for the public `/auth/token` endpoint, enforce tier eligibility in middleware without trusting any client-supplied tier hints, and standardize rate/tier failure envelopes so later Step 3-5 orchestration can rely on deterministic pre-handler behavior. This phase must preserve proxy-only architecture, middleware order invariants, and strict step boundaries by deferring model-router and prompt-template implementation to Step 3+. In this docs-first planning pass, runtime file edits remain deferred until the Phase F execution pass.

### Step 2 deliverables extracted from the overarching plan

1. Redis-backed daily rate limits keyed by authenticated user.
2. Free-tier deterministic cap of 30 requests/day on protected LLM routes.
3. Tier middleware that enforces free/pro/byok access constraints with deterministic 403 responses.
4. Public `/auth/token` IP-based rate protection.
5. Unified error envelopes for rate-limit and tier failures.
6. Middleware-order verification for auth -> ratelimit -> tier on protected routes.
7. Integration tests for quota boundaries, tier violations, and public endpoint protection.

### Runtime-deferred implementation surface for this planning pass

The following runtime files are intentionally deferred until Phase F execution slices:

1. `backend/src/middleware/ratelimit.ts`
2. `backend/src/middleware/tier.ts`
3. `backend/src/routes/auth.ts`
4. `backend/src/index.ts` (only if middleware wiring changes are needed)
5. `backend/src/services/rateLimit.ts` (new)
6. `backend/src/__tests__/ratelimit.integration.test.ts` (new) and related Step 2 test expansions
7. `backend/package.json` (Redis client dependency lock)

Planning rule:

1. Do not modify runtime behavior files during this docs/planning pass.
2. Use Phase F slice ordering to implement deferred runtime work.
3. Treat any runtime file edits in this phase as scope creep.

### Source-of-truth file map

| Concern | Source of truth | Why this is canonical |
|---|---|---|
| Middleware order and route protection boundaries | `docs/BACKEND_API.md` + `docs/ARCHITECTURE.md` | Defines protected-route pipeline and `/auth/token` public handling. |
| Tier-to-model policy intent | `docs/LLM_ROUTING.md` | Defines free/pro/byok routing expectations Step 2 must enforce pre-router. |
| Step sequencing and phase boundaries | `docs/agent_plans/v1_overarching_plan.md` | Prevents Step 2 from absorbing Step 3-5 implementation. |
| Runtime implementation surface | `backend/src/index.ts`, `backend/src/middleware/ratelimit.ts`, `backend/src/middleware/tier.ts`, `backend/src/routes/auth.ts` | Defines where enforcement behavior must land. |
| Shared tier/type contract | `shared/contracts/domain.ts`, `backend/src/types.ts` | Keeps tier and context typing consistent across middleware and handlers. |
| Step-level acceptance criteria | `docs/agent_plans/v1_step_by_step/v1_step_2.md` | Defines done criteria and execution checklist for this phase. |

### Step 2 out of scope

1. No Step 3 model-selection table implementation in `services/llm.ts`.
2. No Step 4 classification quality or taxonomy changes in `/segment` beyond enforcement wrappers.
3. No Step 5 streaming orchestration, token-budget tuning, or provider retry/backoff behavior.
4. No extension content-script, background-worker, or popup UX changes.
5. No schema migration changes unless strictly required for enforcement telemetry.

## 2.2 Copilot Workflow Surface Plan

### Numbering convention

1. Taskboard execution numbering (`2.x`) lives in `docs/agent_plans/v1_step_by_step/v1_step_2.md`.
2. This planning blueprint uses decision labels (`D1..D8`) plus file-level slices for dependency mapping.
3. If numbering appears to overlap, treat the taskboard as execution order and this blueprint as locked design constraints.

### Always-on instruction surfaces (confirmed)

1. `.github/copilot-instructions.md`
2. `.github/skills/SKILL_MAP.md`
3. `.github/skills/*/SKILL.md` (loaded per task classification)

### Reusable prompt surfaces (recommended)

1. `.github/prompts/step2-plan-review.prompt.md` for planning and review-only passes.
2. `.github/prompts/step2-build-slice.prompt.md` for narrow implementation slices (2.3-2.7).

### One-off prompt rule

Keep one-off prompts in chat when they are tied to a single middleware path or a temporary Redis investigation. Promote to `.github/prompts/` only after the pattern repeats.

### Session and approval strategy for Step 2

1. Planning and review sessions are read-only by default.
2. One editing session per file cluster, especially for middleware and tests.
3. Default approvals while quota behavior and failure envelopes are still changing.
4. Bypass approvals only for mechanical edits after test suites stabilize.

## Design Decisions for Step 2 Execution

### Decision D1: Daily free-tier quota uses user-scoped Redis counters with UTC-day reset

Rationale:

1. Step 2 needs deterministic and cheap counters for every protected request.
2. UTC-midnight reset keeps behavior predictable across regions and test harnesses.
3. User-scoped keys align with Step 1 verified `userId` context and avoid header trust.

Planning rule:

1. Counter key format is `rate:daily:{userId}`.
2. First increment of the UTC day sets expiry to the next UTC midnight.
3. Requests above quota return deterministic `429` without entering route handlers.

### Decision D2: Protected LLM-route quota and public-token quota are separate controls

Rationale:

1. `/auth/token` is public and does not have authenticated `userId` context.
2. Auth refresh abuse profile differs from authenticated LLM endpoint abuse.
3. Keeping controls separate prevents mixed keys and ambiguous debugging.

Planning rule:

1. Protected LLM quota applies to `/segment`, `/enhance`, `/bind` after auth passes.
2. `/auth/token` gets a separate IP-based limit policy in Step 2.
3. IP extraction for `/auth/token` must use trusted proxy headers (`fly-client-ip`, fallback first hop from `x-forwarded-for`) rather than raw socket IP.
4. `/auth/token` limiter keys are separate from authenticated user daily quota keys.
5. `/projects` remains outside free daily LLM quota in Step 2.

### Decision D3: Middleware order is preserved and explicitly test-locked

Rationale:

1. Rate and tier logic rely on verified user context from auth middleware.
2. Reordering silently creates policy bypass risk.
3. Later steps assume this sequence when adding LLM routing behavior.

Planning rule:

1. Protected route stack remains: auth -> ratelimit -> tier.
2. `/auth/token` remains outside auth stack and uses dedicated public limiter.
3. Stress tests must prove auth rejects before quota/tier checks when auth fails.

### Decision D4: Tier middleware enforces eligibility, not model selection implementation

Rationale:

1. Step 2 must enforce access boundaries while Step 3 owns concrete model routing.
2. Coupling middleware to provider clients now would cause phase bleed.
3. Tier guard should remain deterministic and inexpensive.

Planning rule:

1. Tier comes only from verified auth context (`c.get("tier")`).
2. Missing tier context returns deterministic `401` (`UNAUTHORIZED`).
3. Unrecognized tier values or explicit route-policy violations return deterministic `403` (`TIER_FORBIDDEN`).
4. In Step 2, recognized tiers (`free`, `pro`, `byok`) are allowed on `/segment`, `/enhance`, `/bind`, and `/projects` unless an endpoint is explicitly marked gated; do not derive policy from payload model/provider hints.
5. Concrete provider/model selection remains in Step 3 `services/llm.ts`.

### Decision D5: Error envelopes for rate and tier failures are deterministic and typed

Rationale:

1. Extension and backend tests need stable machine-readable error codes.
2. Deterministic envelopes reduce regression noise in stress and integration suites.
3. Shared error patterns simplify Step 3-5 mapping of upstream failures.

Planning rule:

1. Rate-limit exceedance uses `429` with `error.code = "RATE_LIMIT_EXCEEDED"`.
2. Tier violations use `403` with `error.code = "TIER_FORBIDDEN"`.
3. Redis infra failures use `503` with `error.code = "RATE_LIMIT_UNAVAILABLE"`.

### Decision D6: Rate headers are emitted consistently for protected requests

Rationale:

1. Headers make quota behavior debuggable without opening Redis.
2. Clients can display remaining quota without extra endpoints.
3. Consistency prevents route-specific confusion in load tests.

Planning rule:

1. Emit `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` on protected LLM responses where quota check runs.
2. On 429 responses, headers reflect the exhausted state.
3. Do not emit `X-RateLimit-*` headers on successful `/auth/token` 200 responses.
4. `/auth/token` 429 responses emit retry-oriented headers (for example `Retry-After`).
5. Header semantics are validated in integration tests.

### Decision D7: Redis outages fail closed with explicit 503 responses

Rationale:

1. Silent fail-open behavior can remove all abuse controls at once.
2. Explicit 503 makes incidents diagnosable and reversible.
3. This keeps policy integrity stronger than temporary convenience.

Planning rule:

1. Redis failures do not bypass quota checks.
2. Redis operations are wrapped in `try/catch` so thrown network/DNS/timeout exceptions map to deterministic `503` envelopes.
3. Middleware returns deterministic 503 envelope and logs cause.
4. Tests cover both thrown exceptions and controlled Redis client failure behavior.

### Decision D8: Step 2 tests must cover concurrency, boundaries, and policy drift

Rationale:

1. Quota logic fails most often at boundary and race conditions.
2. Tier policy drift can happen when routes are added without gate updates.
3. Middleware order regressions are easy to introduce during route refactors.

Planning rule:

1. Add boundary tests for counts 29 -> 30 -> 31.
2. Add concurrent request tests that ensure deterministic quota and envelope behavior.
3. Add route-coverage checks to prevent new protected routes from skipping middleware stack.

## File-Level Plan for Remaining Step 2 Slices

### 2.3 Rate-limit service and middleware core

- `backend/src/middleware/ratelimit.ts`
- `backend/src/services/rateLimit.ts` (new)
- `backend/src/types.ts`
- `backend/package.json`
- `backend/src/lib/errors.ts` and/or `backend/src/lib/http.ts` (only if shared envelope helpers are added)

Dependencies: Step 1 auth context must already provide verified `userId` and `tier`.

Execution order constraint:

1. Lock Redis client contract (`@upstash/redis`) and local Redis test runtime strategy before middleware coding.
2. Build the rate service abstraction first.
3. Wire middleware next with deterministic headers/envelopes.
4. Keep route wiring changes for 2.6 verification pass.

### 2.4 Public `/auth/token` rate protection

- `backend/src/routes/auth.ts`
- `backend/src/services/rateLimit.ts`
- `backend/src/index.ts` (if a dedicated public middleware is introduced)

Dependencies: 2.3 service helpers and failure envelope conventions.

Execution order constraint:

1. Define trusted proxy IP extraction and keying rules first.
2. Apply route-level limit before `refreshAndVerifySession` call.
3. Keep `/auth/token` outside auth middleware chain.
4. Keep `/auth/token` success responses free of `X-RateLimit-*` headers; use retry headers on 429 only.

### 2.5 Tier middleware enforcement

- `backend/src/middleware/tier.ts`
- `backend/src/types.ts`
- `backend/src/lib/schemas.ts` (only if a route-policy discriminator is needed)

Dependencies: 2.3 and 2.4 envelope conventions.

Execution order constraint:

1. Implement deterministic 401/403 split without altering auth middleware.
2. Keep tier source as verified context only and use explicit route-policy matrix checks.
3. Keep `/segment`, `/enhance`, `/bind`, and `/projects` available to recognized tiers in Step 2 unless explicitly gated.
4. Do not implement Step 3 model-router behavior in this slice.

### 2.6 Middleware wiring and route-scope verification

- `backend/src/index.ts`
- `backend/src/routes/*.ts` only where protected/public boundaries are enforced

Dependencies: 2.3-2.5 complete.

Execution order constraint:

1. Verify protected routes keep auth -> ratelimit -> tier ordering.
2. Verify `/auth/token` public path has dedicated limiter only.
3. Confirm `/projects` quota behavior matches Step 2 scope decision.

### 2.7 Test matrix expansion

- `backend/src/__tests__/routes.validation.test.ts`
- `backend/src/__tests__/stress-tests.test.ts`
- `backend/src/__tests__/auth.integration.test.ts`
- `backend/src/__tests__/ratelimit.integration.test.ts` (new)

Dependencies: runtime behavior in 2.3-2.6 complete.

Test boundary rule:

1. CRITICAL: Add a local Redis container to docker-compose.yml to provide a real Redis runtime for integration tests, and run the test suite against that instance rather than a mocked client.
1. Integration coverage required: quota boundary and tier-forbidden behavior.
2. Stress coverage required: concurrent limit checks and deterministic envelopes.
3. Public endpoint coverage required: `/auth/token` IP throttling, trusted proxy IP extraction, and retry/header expectations.
4. Redis outage coverage required: thrown exception path plus explicit client failure path both map to deterministic 503 responses.

### 2.8 Final review and handoff

- `docs/agent_plans/v1_step_by_step/v1_step_2.md` (checkbox status)
- `logging/progress_log.md`

Dependencies: all prior Step 2 slices complete and verified.

## Risk Register and Mitigations

1. Risk: Redis outage disables quota checks or causes undefined behavior.
   Mitigation: fail closed with explicit `RATE_LIMIT_UNAVAILABLE` and test this path.
2. Risk: Middleware order drifts during route refactors.
   Mitigation: enforce route-order assertions in stress tests and review checklist.
3. Risk: `/auth/token` remains abusable because it bypasses auth stack.
   Mitigation: dedicated IP limiter with deterministic 429 behavior and trusted proxy-header IP extraction.
4. Risk: Tier checks accidentally trust request headers/body.
   Mitigation: tier middleware consumes only `c.get("tier")` from auth middleware.
5. Risk: Step 2 work leaks into Step 3 router implementation.
   Mitigation: explicit stop condition forbidding provider/model implementation changes.
6. Risk: Quota headers are inconsistent and break client messaging.
   Mitigation: single helper for rate headers, explicit `/auth/token` success-header suppression, and header assertions in tests.

## Phase E - Consistency Gate Before Implementation Handoff

Goal: verify planning and source-of-truth surfaces are aligned before Step 2 runtime implementation begins.

Required checks:

1. Cross-doc consistency check across:
   - `docs/agent_plans/v1_step_by_step/v1_step_2.md`
   - `docs/agent_plans/v1_step_by_step/v1_step_2_planning.md`
   - `docs/BACKEND_API.md`
   - `docs/LLM_ROUTING.md`
2. Confirm no Step 3 model-router implementation is requested in Step 2 docs.
3. Confirm `/auth/token` public-limit requirement appears in checklist, prompts, and done criteria.
4. Confirm free cap, tier gate, and middleware order language are consistent.
5. Confirm runtime-deferred implementation file surface is explicit and unchanged in this docs/planning pass.

Phase E pass criteria:

1. Enforcement boundaries are explicit and non-conflicting.
2. Step 2 docs preserve Step 3-5 implementation separation.
3. Runtime handoff sequence is complete and deterministic.
4. Deferred runtime files are clearly mapped for Phase F execution.

## Phase F - Implementation Handoff Sequence

Goal: define execution order after planning lock, without implementing runtime behavior in this planning pass.

Slice sequence:

1. Slice 1: rate-limit service abstraction, Redis dependency lock, and header/error contract.
2. Slice 2: protected-route free quota middleware.
3. Slice 3: `/auth/token` public IP-based limiter with trusted proxy IP extraction and retry-header policy.
4. Slice 4: tier middleware deterministic 401/403 enforcement with explicit Step 2 route-policy matrix.
5. Slice 5: route wiring and middleware order verification.
6. Slice 6: test matrix expansion (boundary, concurrency, public endpoint).
7. Slice 7: final criteria audit and progress log update.

Slice stop conditions (for execution pass):

1. Slice 1 stop: rate helper returns deterministic `limit`, `remaining`, `reset`, and failure states.
2. Slice 2 stop: free-tier requests deterministically hit 429 after cap on protected LLM routes.
3. Slice 3 stop: `/auth/token` rejects over-limit IP bursts with deterministic 429 using trusted proxy-header IP extraction.
4. Slice 4 stop: unsupported tier-policy paths return deterministic 403 without touching Step 3 router.
5. Slice 5 stop: middleware order validated in `index.ts` and no protected route bypasses enforcement.
6. Slice 6 stop: tests cover quota boundaries, concurrent checks, and public endpoint limits.
7. Slice 7 stop: Step 2 acceptance criteria map cleanly to code and tests with no Step 3 bleed.

Stop condition for this planning pass:

1. Do not implement backend runtime behavior here.
2. End after planning/docs consistency and handoff order are complete.
3. Runtime implementation begins only in a dedicated execution pass that follows this slice order.
4. Runtime-deferred files remain unchanged until Phase F begins.

## Planning Completion Status

Step 2 planning/design tasks are complete when:

1. Scope and out-of-scope are explicit.
2. File map and dependency order are explicit.
3. Middleware and enforcement decisions are locked.
4. Test boundaries and handoff stop conditions are explicit.

Status: Complete for 2.1 and 2.2.