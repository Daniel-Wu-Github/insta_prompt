# Step 2 - Rate Limiting and Tier Enforcement

This is the tactical workboard for Step 2 in [v1_overarching_plan.md](../../agent_plans/v1_overarching_plan.md). The goal is to convert Step 1 auth context into enforceable limits and access gates that Step 3-5 can build on safely.

Step 2 is done when the repo has:

1. Redis-backed daily quota enforcement for free-tier usage on protected LLM routes.
2. Deterministic `429` behavior at the free-tier cap boundary (30/day).
3. Deterministic tier enforcement with `403` responses for explicitly unsupported access.
4. Dedicated IP-based abuse protection on public `/auth/token`.
5. Stable rate-limit headers and unified error envelopes with protected/public header policy split.
6. Middleware-order tests that prove `auth -> ratelimit -> tier` remains intact.
7. No Step 3 model-router implementation leakage.

## How To Vibe Code Step 2 In VS Code

Use GitHub Copilot Chat like a small production team, not like a single giant chatbot.

### Recommended session layout

Use 3 chat sessions, but only 2 should be active at the same time.

1. Plan session: one session, local Plan agent, read-only.
2. Build session: one session, local Agent, edit and run tools.
3. Review session: one session, local Ask agent, read-only audit and debugging.

For Step 2, do not run more than one editing agent on the middleware and test cluster at once. Quota and tier behavior are cross-cutting and easy to desynchronize.

If you want the simplest possible setup, use only 2 sessions:

1. Plan or Ask for analysis.
2. Agent for implementation.

Add the Review session only when the first enforcement slice is complete and you need a clean diff audit.

### Which Copilot mode to use for each phase

1. Plan agent: build the Step 2 taskboard, lock scope, and sequence dependencies.
2. Ask agent: inspect current middleware behavior and validate route-level assumptions.
3. Agent: implement middleware, route guards, and tests.

For a first-time vibe coder, keep permissions conservative.

1. Use Default Approvals while quota and tier behavior are still changing.
2. Use Bypass Approvals only for mechanical edits after test behavior is stable.
3. Avoid Autopilot on Step 2 unless the slice is tiny and file scope is narrow.

### Prompt pattern that works best

Use short prompts with five parts:

1. Goal.
2. Context.
3. Allowed files.
4. Constraints.
5. Exit condition.

Good prompts are specific enough that the agent can finish without guessing. Bad prompts ask for all Step 2 behavior in one shot.

Example planning prompt:

```text
Read [docs/ARCHITECTURE.md](../../ARCHITECTURE.md), [docs/BACKEND_API.md](../../BACKEND_API.md), [docs/LLM_ROUTING.md](../../LLM_ROUTING.md), and [docs/agent_plans/v1_step_by_step/v1_step_1.md](./v1_step_1.md).

Create a Step 2 taskboard only.

Output format:
- task
- files touched
- dependencies
- acceptance criteria
- risk

Do not edit files.
```

Example build prompt:

```text
Implement only Step 2.3 and Step 2.4.

Allowed files:
- backend/src/middleware/**
- backend/src/services/**
- backend/src/routes/auth.ts
- backend/src/index.ts
- backend/src/__tests__/**

Constraints:
- keep changes minimal
- do not change unrelated route logic
- add tests for new 429/403 behavior
- stop when this slice is complete

If a design choice is ambiguous, pick the smallest safe option and explain the tradeoff.
```

Example review prompt:

```text
Review #changes against the Step 2 acceptance criteria.

Find:
- rate-limit boundary bugs
- tier gate bypasses
- middleware ordering drift
- public /auth/token abuse gaps
- test gaps

Do not edit files.
```

### Best-practice rules to follow every time

1. Start a fresh session when moving from planning to implementation.
2. Fork a session if you want to compare fixed-window vs sliding-window strategy without polluting the build thread.
3. Keep one active builder session per middleware cluster.
4. Use `#codebase` when you want broad repository reasoning.
5. Use `#changes` when you want a diff audit.
6. Use `#problems` when you want deterministic error fixes.
7. Use checkpoints before risky middleware-order edits.
8. Save reusable prompts only after one successful end-to-end run.
9. Keep always-on instructions concise and avoid duplicate rules.

### What not to do

1. Do not combine planning, implementation, and review in one giant prompt.
2. Do not keep more than 3 active sessions for Step 2.
3. Do not let two builder sessions edit `ratelimit.ts` or `tier.ts` simultaneously.
4. Do not implement Step 3 model routing while doing Step 2 enforcement.
5. Do not skip boundary tests on 29 -> 30 -> 31 quota transitions.

## Step 2 Taskboard

### 2.0 Readiness and dependency lock

Goal: ensure Step 1 assumptions are stable before enforcement code lands.

- [ ] Confirm Step 1 auth middleware is the sole source of verified `userId` and `tier` context.
- [ ] Confirm protected routes still mount `auth -> ratelimit -> tier` in `backend/src/index.ts`.
- [ ] Confirm public `/auth/token` still bypasses auth middleware and remains explicitly public.
- [ ] Confirm free-tier cap target remains 30/day in docs and acceptance criteria.
- [ ] Confirm Step 2 Redis runtime and library contract is explicit (`@upstash/redis` + local Redis test runtime strategy).
- [ ] Confirm runtime implementation file surface is deferred until Step 2 execution pass (not this docs/planning pass).

Copilot session:

- Plan agent first.
- Ask agent if route wiring assumptions look stale.

Prompt:

```text
Validate Step 2 readiness against current middleware and route wiring.

Report only:
- what is ready
- what is missing
- what can cause enforcement drift
- what runtime prerequisites are still unlocked

Do not edit files.
```

Done when:

1. Preconditions are explicit.
2. Route wiring assumptions are verified.
3. Step 2 scope starts from confirmed Step 1 behavior.
4. Runtime prerequisites and deferred implementation surfaces are explicit.

### 2.1 Lock scope and source of truth

Goal: make Step 2 boundaries explicit before coding.

- [ ] Read architecture, backend API, LLM routing, and Step 2 planning blueprint docs.
- [ ] Extract exact Step 2 deliverables from the overarching plan.
- [ ] Lock explicit out-of-scope boundaries for Step 3-5.
- [ ] Record file-level ownership for middleware, routes, and tests.

Copilot session:

- Plan agent first.
- Ask agent with `#codebase` only for repository-specific ambiguity.

Prompt:

```text
You are planning Step 2 only.

Return a file-level taskboard for rate limiting and tier enforcement.
Do not include Step 3 model router implementation.
Do not edit files.
```

Done when:

1. Scope is clear in one paragraph.
2. File ownership is explicit.
3. Out-of-scope constraints are explicit.

### 2.2 Set up the Step 2 workflow surface

Goal: keep enforcement work repeatable and low-noise.

- [ ] Confirm always-on instruction surfaces are still concise and non-conflicting.
- [ ] Decide whether reusable Step 2 prompts should be added for enforcement slices.
- [ ] Keep skill loading minimal: scope guard + docs cohesion + verification.
- [ ] Preserve source-of-truth references in prompts to avoid drift.
- [ ] Document runtime-deferred implementation files so planning edits do not drift into backend code.

Copilot session:

- Ask agent for workspace instruction audit.
- Plan agent only if prompt surfaces need updates.

Prompt:

```text
Inspect current workflow instructions and suggest the smallest prompt set needed for Step 2.

Focus on minimizing repetition and keeping middleware safety constraints explicit.
```

Done when:

1. Reusable prompt strategy is clear.
2. Instruction overlap is controlled.
3. Step 2 prompts can be executed without re-explaining architecture rules.
4. Runtime file changes remain explicitly deferred to the execution pass.

Runtime-deferred implementation files for this docs/planning pass:

1. `backend/src/middleware/ratelimit.ts`
2. `backend/src/middleware/tier.ts`
3. `backend/src/routes/auth.ts`
4. `backend/src/index.ts` (only if middleware wiring changes are needed)
5. `backend/src/services/rateLimit.ts` (new)
6. `backend/src/__tests__/ratelimit.integration.test.ts` (new) and related Step 2 test expansions
7. `backend/package.json` (Redis client dependency lock)

### 2.3 Implement protected-route daily free quota (Redis)

Goal: enforce free-tier daily limits before route handlers execute.

- [ ] Implement Redis-backed counter increment for authenticated users.
- [ ] Use key `rate:daily:{userId}` with TTL to next UTC midnight.
- [ ] Apply cap only to `/segment`, `/enhance`, and `/bind` in Step 2.
- [ ] Return deterministic `429` with `RATE_LIMIT_EXCEEDED` when cap is exceeded.
- [ ] Emit deterministic `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.
- [ ] Use `@upstash/redis` for Step 2 Redis integration.
- [ ] Wrap Redis calls in `try/catch`; return deterministic `503` (`RATE_LIMIT_UNAVAILABLE`) for thrown network/DNS/timeout errors and explicit Redis client failures.

Copilot session:

- Agent session.
- Keep scope on rate limit middleware and supporting service helper only.

Prompt:

```text
Implement Step 2.3 rate limiting for protected LLM routes.

Allowed files:
- backend/src/middleware/ratelimit.ts
- backend/src/services/** (new helper allowed)
- backend/src/types.ts (only if context/types updates are needed)

Requirements:
- Use `@upstash/redis`
- Redis-backed user counter using key rate:daily:{userId}
- TTL to next UTC midnight
- Enforce free-tier cap of 30/day on /segment, /enhance, /bind
- Return deterministic 429 envelope with RATE_LIMIT_EXCEEDED
- Emit X-RateLimit-* headers
- Wrap Redis calls in try/catch and return deterministic 503 RATE_LIMIT_UNAVAILABLE on thrown/network Redis failures
- Do not implement Step 3 model routing

Stop when middleware behavior is complete and testable.
```

Done when:

1. Free-tier boundary is deterministic at 30/day.
2. Non-free tiers are not blocked by this free cap.
3. Headers and envelopes are stable.
4. Redis failure behavior is explicit for both client-returned errors and thrown exceptions.

### 2.4 Add IP-based rate protection for public `/auth/token`

Goal: protect the public refresh endpoint without adding auth middleware.

- [ ] Add dedicated IP-based limiter for `/auth/token` requests.
- [ ] Keep `/auth/token` outside protected auth stack.
- [ ] Emit deterministic `429` envelope and retry-oriented headers for over-limit IPs.
- [ ] Keep refresh-token validation behavior unchanged for under-limit requests.
- [ ] Ensure `/auth/token` limiter keys are separate from user daily counters.
- [ ] Extract IP from trusted proxy headers (`fly-client-ip`, fallback first entry of `x-forwarded-for`); never use raw socket IP as primary source.
- [ ] Do not emit `X-RateLimit-*` headers on successful `200` `/auth/token` responses.

Copilot session:

- Agent session.
- Scope limited to auth route and shared rate helper.

Prompt:

```text
Implement Step 2.4 IP-based rate limiting for POST /auth/token.

Allowed files:
- backend/src/routes/auth.ts
- backend/src/services/** (shared limiter helper reuse allowed)
- backend/src/index.ts (only if middleware wiring is needed)

Requirements:
- /auth/token remains public (no auth middleware)
- dedicated IP-based limit and deterministic 429 response
- IP extraction uses trusted proxy headers (prefer fly-client-ip; fallback x-forwarded-for first hop)
- Do not emit X-RateLimit-* headers on successful 200 responses for /auth/token
- Emit retry-oriented headers (for example Retry-After) on 429 responses
- no changes to refresh-session contract shape
- no custom JWT behavior

Stop when /auth/token has explicit abuse protection and tests can target it.
```

Done when:

1. Public endpoint abuse path is controlled.
2. Refresh flow remains contract-compatible.
3. Limit behavior is deterministic and observable.
4. IP extraction and public-header behavior are explicit and testable.

### 2.5 Implement tier eligibility middleware (deterministic 403)

Goal: enforce tier trust boundaries and explicit route policy before Step 3 model routing starts.

- [ ] Read tier from verified auth context only (`c.get("tier")`).
- [ ] Keep missing-tier context as deterministic `401` (`UNAUTHORIZED`).
- [ ] Return deterministic `403` (`TIER_FORBIDDEN`) for unrecognized tier values or explicitly disallowed route-policy combinations.
- [ ] Keep `/segment`, `/enhance`, `/bind`, and `/projects` available to recognized tiers in Step 2 unless an endpoint is explicitly marked gated by policy.
- [ ] Do not infer provider/model policy from request payload fields.
- [ ] Avoid any provider/model router implementation in this slice.
- [ ] Keep middleware behavior stable across `/segment`, `/enhance`, `/bind`, and `/projects` according to the explicit Step 2 policy map.

Copilot session:

- Agent session.
- Ask session only for policy matrix sanity checks.

Prompt:

```text
Implement Step 2.5 tier middleware enforcement.

Allowed files:
- backend/src/middleware/tier.ts
- backend/src/types.ts (if needed)
- backend/src/index.ts (only for policy wiring)

Requirements:
- tier source is verified auth context only
- deterministic 401 when context is missing
- deterministic 403 TIER_FORBIDDEN on unrecognized tier values or explicit route-policy violations
- Step 2 default policy keeps /segment, /enhance, /bind, and /projects open to recognized tiers unless explicitly gated
- do not add or require payload model/provider selection checks in Step 2
- no Step 3 model selection logic

Stop after tier gate behavior is deterministic and testable.
```

Done when:

1. Tier trust boundary is preserved.
2. Policy failures are deterministic and do not depend on Step 3 model-routing fields.
3. Step boundary with Step 3 remains intact.

### 2.6 Reconcile middleware ordering and route scope

Goal: verify final route wiring before test hardening.

- [ ] Confirm protected routes still mount `auth -> ratelimit -> tier` in `backend/src/index.ts`.
- [ ] Confirm `/auth/token` public limiter is wired and isolated.
- [ ] Confirm `/projects` behavior matches Step 2 scope decision.
- [ ] Confirm `/projects` behavior matches the explicit Step 2 default policy map.
- [ ] Confirm no protected route bypasses enforcement middleware.
- [ ] Confirm Step 2 route-policy matrix does not rely on request payload model/provider hints.

Copilot session:

- Ask or Agent depending on whether edits are still needed.

Prompt:

```text
Audit route wiring for Step 2 middleware invariants.

Find and fix only:
- missing middleware on protected routes
- incorrect middleware order
- accidental auth middleware on /auth/token

Do not implement unrelated route logic.
```

Done when:

1. Middleware order is consistent.
2. Public endpoint behavior is intentional.
3. Scope decisions match runtime wiring.

### 2.7 Add boundary, concurrency, and policy tests

Goal: prove enforcement behavior under realistic load and edge conditions.

- [ ] Add tests for free-tier quota boundary (29, 30, 31).
- [ ] Add tests for deterministic 429 envelopes and headers.
- [ ] Add tests for tier-forbidden 403 paths.
- [ ] Add tests for `/auth/token` over-limit IP behavior.
- [ ] Add stress tests for concurrent protected requests near quota boundary.
- [ ] Add tests for Redis failure path returning deterministic 503.
- [ ] Add tests for trusted proxy IP extraction precedence (`fly-client-ip` over `x-forwarded-for` fallback).
- [ ] Add tests that successful `/auth/token` responses do not leak `X-RateLimit-*` headers while `429` responses emit retry headers.
- [ ] Add tests for thrown Redis exceptions mapping to deterministic `503`.

Copilot session:

- Review session first, then Agent for edits.

Prompt:

```text
Expand Step 2 tests for rate and tier enforcement.

Cover:
- free-tier daily boundary transitions
- deterministic 429/403/503 envelopes
- /auth/token public limiter behavior
- trusted proxy IP extraction behavior
- /auth/token header policy split (no X-RateLimit-* on 200; retry headers on 429)
- middleware order assumptions under stress

Do not add Step 3 route-quality assertions.
```

Done when:

1. Boundary behavior is locked.
2. Concurrency behavior is deterministic.
3. Public and protected enforcement paths are both covered.

### 2.8 Final review and handoff

Goal: ensure Step 2 is complete and Step 3 can start without rework.

- [ ] Review diff against Step 2 acceptance criteria.
- [ ] Confirm no Step 3-5 implementation behavior landed early.
- [ ] Confirm rate and tier errors are deterministic and documented in tests.
- [ ] Confirm deferred runtime file surfaces from planning are implemented only in the Step 2 execution pass.
- [ ] Update progress logs and note deferred Step 3 concerns.

Copilot session:

- Review session (read-only Ask or Agent).

Prompt:

```text
Review Step 2 work against the taskboard.

Find:
- quota edge-case regressions
- tier bypass risks
- middleware-order drift
- missing tests
- step-boundary violations

Do not edit files.
```

Done when:

1. The Step 2 taskboard is reflected in code and tests.
2. Step 3 can begin without reopening enforcement questions.
3. Out-of-scope behavior remains deferred.

## Step 2 Quality Bar

Treat Step 2 as production work, not temporary scaffolding.

1. Every enforcement decision has a deterministic error path.
2. Every protected route has explicit middleware order.
3. Every public endpoint with abuse risk has an explicit guard.
4. Public limiter IP extraction trusts proxy headers and avoids raw socket-IP assumptions.
5. Every limit boundary is test-covered.
6. Every phase boundary is preserved.

## Step 2 Exit Criteria

Do not start Step 3 until all of these are true:

1. Step 2 taskboard is complete.
2. Free-tier cap is enforced with deterministic 429 behavior.
3. Tier violations are enforced with deterministic 403 behavior.
4. Public `/auth/token` has explicit IP-based abuse protection.
5. `/auth/token` uses trusted proxy-header IP extraction and header behavior does not leak success-path thresholds.
6. Middleware-order and boundary tests pass.
7. No Step 3 model-router behavior was implemented early.

## Short Version You Can Remember

1. Lock scope before touching middleware.
2. Enforce free cap with Redis and deterministic headers.
3. Protect `/auth/token` separately from authenticated routes.
4. Enforce tier via verified context only.
5. Prove boundary behavior with concurrency-aware tests.
6. Hand off to Step 3 only after scope and tests are clean.