# Step 3 - LLM Service and Prompt Template System

This is the tactical workboard for Step 3 in [v1_overarching_plan.md](../../agent_plans/v1_overarching_plan.md). The goal is to replace placeholder LLM surfaces with deterministic model routing, prompt-template factories, and provider-streaming adapters that Step 4-6 route work can consume without rework.

Step 3 is done when the repo has:

1. A deterministic model router in `backend/src/services/llm.ts` keyed by `callType`, `tier`, and `mode`.
2. A complete prompt-template factory surface for `context`, `tech_stack`, `constraint`, `action`, `output_format`, `edge_case`, and `bind`.
3. Mode-aware token-budget behavior and mode-aware prompt-instruction behavior.
4. Streaming adapter abstractions for Groq and Anthropic, with deterministic error mapping.
5. Retry and backoff behavior for transient provider failures.
6. Unit tests for the route matrix, prompt determinism, and adapter retry/error behavior.
7. No Step 4-6 route implementation leakage (`/segment`, `/enhance`, `/bind` production behavior remains in those steps).

## How To Vibe Code Step 3 In VS Code

Use GitHub Copilot Chat like a small production team, not like a single giant chatbot.

### Recommended session layout

Use 3 chat sessions, but only 2 should be active at the same time.

1. Plan session: one session, local Plan agent, read-only.
2. Build session: one session, local Agent, edit and run tools.
3. Review session: one session, local Ask agent, read-only audit and debugging.

For Step 3, do not run more than one editing agent on the service/prompt cluster at once. Router and prompt assembly are tightly coupled, so parallel writers create avoidable drift.

If you want the simplest possible setup, use only 2 sessions:

1. Plan or Ask for analysis.
2. Agent for implementation.

Add the Review session only when the first service slice is complete and you need a clean diff audit.

### Which Copilot mode to use for each phase

1. Plan agent: build the Step 3 taskboard, lock scope, and sequence dependencies.
2. Ask agent: inspect current placeholder surfaces and validate source-of-truth alignment.
3. Agent: implement router, prompt factories, adapters, and tests.

For a first-time vibe coder, keep permissions conservative.

1. Use Default Approvals while router and provider abstraction behavior are still changing.
2. Use Bypass Approvals only for mechanical edits after test behavior is stable.
3. Avoid Autopilot on Step 3 unless the slice is tiny and file scope is narrow.

### Prompt pattern that works best

Use short prompts with five parts:

1. Goal.
2. Context.
3. Allowed files.
4. Constraints.
5. Exit condition.

Good prompts are specific enough that the agent can finish without guessing. Bad prompts ask for all Step 3 behavior in one shot.

Example planning prompt:

```text
Read [docs/ARCHITECTURE.md](../../ARCHITECTURE.md), [docs/BACKEND_API.md](../../BACKEND_API.md), [docs/LLM_ROUTING.md](../../LLM_ROUTING.md), [docs/CLAUSE_PIPELINE.md](../../CLAUSE_PIPELINE.md), and [docs/agent_plans/v1_step_by_step/v1_step_2.md](./v1_step_2.md).

Create a Step 3 taskboard only.

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
Implement only Step 3.3 and Step 3.4.

Allowed files:
- backend/src/services/llm.ts
- backend/src/services/prompts/**
- backend/src/__tests__/**

Constraints:
- keep changes minimal
- do not change unrelated route logic
- add tests for model-selection and prompt-template determinism
- stop when this slice is complete

If a design choice is ambiguous, pick the smallest safe option and explain the tradeoff.
```

Example review prompt:

```text
Review #changes against the Step 3 acceptance criteria.

Find:
- model-router matrix gaps
- prompt-template determinism drift
- provider-adapter failure handling gaps
- scope leakage into Step 4-6 routes
- test gaps

Do not edit files.
```

### Best-practice rules to follow every time

1. Start a fresh session when moving from planning to implementation.
2. Fork a session if you want to compare two route-matrix drafts without polluting the build thread.
3. Keep one active builder session per service cluster.
4. Use `#codebase` when you want broad repository reasoning.
5. Use `#changes` when you want a diff audit.
6. Use `#problems` when you want deterministic error fixes.
7. Use checkpoints before risky service-refactor edits.
8. Save reusable prompts only after one successful end-to-end service-layer pass.
9. Keep always-on instructions concise and avoid duplicate rules.

### What not to do

1. Do not combine planning, implementation, and review in one giant prompt.
2. Do not keep more than 3 active sessions for Step 3.
3. Do not let two builder sessions edit `backend/src/services/llm.ts` or the prompt factory folder simultaneously.
4. Do not implement Step 4-6 production route behavior while doing Step 3 service work.
5. Do not skip matrix tests for `callType x tier x mode` routing behavior.

## Step 3 Taskboard

### 3.0 Readiness and dependency lock

Goal: ensure Step 2 assumptions are stable before Step 3 service work lands.

- [ ] Confirm Step 2 middleware behavior is stable and tier context is verified server-side.
- [ ] Confirm `/segment`, `/enhance`, and `/bind` remain protected and mount with the required middleware order.
- [ ] Confirm required provider/env surfaces are documented for Groq, Anthropic, and BYOK paths.
- [ ] Confirm current route handlers are placeholder-safe and Step 3 will focus on service-layer implementation.
- [ ] Confirm runtime implementation file surface is explicit before editing begins.

Copilot session:

- Plan agent first.
- Ask agent if route wiring or env assumptions look stale.

Prompt:

```text
Validate Step 3 readiness against current backend wiring and Step 2 outcomes.

Report only:
- what is ready
- what is missing
- what can cause model-routing drift
- what runtime prerequisites are still unlocked

Do not edit files.
```

Done when:

1. Preconditions are explicit.
2. Route and tier-context assumptions are verified.
3. Step 3 starts from confirmed Step 2 behavior.

### 3.1 Lock scope and source of truth

Goal: make Step 3 boundaries explicit before coding.

- [ ] Read architecture, backend API, LLM routing, clause pipeline, and Step 3 planning blueprint docs.
- [ ] Extract exact Step 3 deliverables from the overarching plan.
- [ ] Lock explicit out-of-scope boundaries for Step 4-6 route behavior.
- [ ] Record file-level ownership for services, prompts, and tests.

Copilot session:

- Plan agent first.
- Ask agent with `#codebase` only for repository-specific ambiguity.

Prompt:

```text
You are planning Step 3 only.

Return a file-level taskboard for model routing, prompt templates, and provider adapters.
Do not include Step 4-6 route implementation.
Do not edit files.
```

Done when:

1. Scope is clear in one paragraph.
2. File ownership is explicit.
3. Out-of-scope constraints are explicit.

### 3.2 Set up the Step 3 workflow surface

Goal: keep service-layer work repeatable and low-noise.

- [ ] Confirm always-on instruction surfaces are still concise and non-conflicting.
- [ ] Decide whether reusable Step 3 prompts should be added for router/template slices.
- [ ] Keep skill loading minimal: scope guard, llm-router-and-model-selection, system-prompt-assembly, and verification gate.
- [ ] Preserve source-of-truth references in prompts to avoid drift.
- [ ] Document runtime-deferred route implementation files so Step 3 does not absorb Step 4-6 behavior.

Copilot session:

- Ask agent for workspace instruction audit.
- Plan agent only if prompt surfaces need updates.

Prompt:

```text
Inspect current workflow instructions and suggest the smallest prompt set needed for Step 3.

Focus on model-router and prompt-assembly safety constraints.
Keep Step 4-6 route behavior out of scope.
```

Done when:

1. Reusable prompt strategy is clear.
2. Instruction overlap is controlled.
3. Step 3 prompts can be executed without re-explaining architecture rules.
4. Route-level behavior changes remain deferred to Steps 4-6.

Runtime-deferred route implementation files for Step 3:

1. `backend/src/routes/segment.ts` production classification behavior (Step 4).
2. `backend/src/routes/enhance.ts` production streaming expansion behavior (Step 5).
3. `backend/src/routes/bind.ts` production binding and history-write behavior (Step 6).

### 3.3 Implement deterministic model router (`callType x tier x mode`)

Goal: make model selection deterministic and testable before route handlers consume it.

- [ ] Define explicit route key and model config types in `backend/src/services/llm.ts`.
- [ ] Implement `selectModel` matrix for `segment`, `enhance`, and `bind` using `tier` and `mode`.
- [ ] Keep `/segment` pinned to the cheapest fast classifier path.
- [ ] Keep free-tier generation routes on Groq-only paths.
- [ ] Keep pro-tier routing mode-sensitive (`efficiency` vs `balanced`/`detailed`).
- [ ] Keep BYOK routing explicit and deterministic without changing the request/response shape.
- [ ] Keep `selectModel` pure by accepting optional resolved `byokConfig` input (`preferredProvider`, `preferredModel`) instead of DB/network calls or payload-hint inference.
- [ ] Add explicit handling for unknown/unsupported route keys.
- [ ] Add route-matrix tests that cover all supported combinations and key negative paths.

Copilot session:

- Agent session.
- Keep scope on router code and router tests only.

Prompt:

```text
Implement Step 3.3 deterministic model routing.

Allowed files:
- backend/src/services/llm.ts
- backend/src/__tests__/** (new router tests allowed)
- shared/contracts/** (only if router-relevant type refinements are necessary)

Requirements:
- route key includes callType + tier + mode
- /segment always resolves to the fast low-cost classifier path
- free tier generation routes resolve to Groq-only models
- pro tier routes are mode-aware
- BYOK route is explicit and deterministic without changing the request/response shape
- `selectModel` remains pure and accepts optional resolved `byokConfig` input (`preferredProvider`, `preferredModel`)
- no DB/network calls or payload-hint inference inside `selectModel`
- unknown combinations map to deterministic safe behavior
- no network calls or provider-client logic inside pure model-selection function

Stop when route-matrix behavior is deterministic and test-covered.
```

Done when:

1. All supported route keys map to one deterministic `ModelConfig`.
2. Free-tier routes never resolve to forbidden provider/model paths.
3. Mode token budgets are explicit and test-covered.
4. Router behavior is side-effect free.

### 3.4 Build prompt-template factory surface

Goal: make prompt assembly deterministic and goal-type aware before route integration.

- [ ] Create one prompt factory per goal type: `context`, `tech_stack`, `constraint`, `action`, `output_format`, `edge_case`.
- [ ] Create a bind prompt factory that enforces canonical order and dedup/coherence expectations.
- [ ] Add mode-specific instruction blocks for `efficiency`, `balanced`, and `detailed`.
- [ ] Add sibling-context serialization rules with explicit formatting and length bounds.
- [ ] Keep prompt factories pure and deterministic.
- [ ] Add deterministic unit tests for each goal type and mode combination.

Copilot session:

- Agent session.
- Keep scope on `backend/src/services/prompts/**` and tests.

Prompt:

```text
Implement Step 3.4 prompt-template factories.

Allowed files:
- backend/src/services/prompts/**
- backend/src/__tests__/** (new prompt-template tests allowed)
- shared/contracts/** (only if template typing needs alignment)

Requirements:
- one factory per goal_type and one bind factory
- deterministic mode-specific instruction variants
- sibling-context injection only when siblings are present
- bind template includes canonical slot order and redundancy-reduction intent
- keep templates pure and provider-agnostic

Stop when prompt outputs are deterministic and test-covered.
```

Done when:

1. Every goal type has a tested template factory.
2. Every mode has deterministic output-instruction variants.
3. Bind template enforces canonical ordering contract.
4. Prompt assembly stays provider-agnostic.

### 3.5 Implement provider streaming adapter abstractions

Goal: normalize provider-specific streaming behavior behind one backend service boundary.

- [ ] Add Groq streaming adapter surface with normalized token/error emission.
- [ ] Add Anthropic streaming adapter surface with normalized token/error emission.
- [ ] Define one adapter interface that Step 5 and Step 6 route handlers can reuse.
- [ ] Require adapters to emit structured stream events via async iterable output, not raw SSE strings.
- [ ] Add deterministic mapping from provider errors to backend-safe error codes/messages.
- [ ] Add retry/backoff behavior for transient provider failures: timeout, connection reset, HTTP 429, HTTP 502, HTTP 503, and HTTP 504 with bounded exponential backoff.
- [ ] Keep BYOK path explicitly separated from managed provider credentials.
- [ ] Keep SSE envelope compatibility with `token | done | error` contracts.

Copilot session:

- Agent session.
- Ask session only for retry/backoff strategy sanity checks.

Prompt:

```text
Implement Step 3.5 provider streaming adapter abstractions.

Allowed files:
- backend/src/services/llm.ts
- backend/src/services/** (new provider adapter modules allowed)
- backend/src/lib/sse.ts (only if adapter helpers require shared normalization)
- backend/src/__tests__/**

Requirements:
- Groq and Anthropic adapters normalize streaming into shared token/error semantics
- adapters emit object events through async iterable output; they do not emit raw SSE strings
- deterministic error mapping and retry/backoff for transient failures
- bounded exponential backoff with a 3-attempt cap, 100ms initial delay, doubling on each retry, and a 5s max delay cap
- retry only on request timeout, connection reset, HTTP 429, HTTP 502, HTTP 503, and HTTP 504
- do not retry HTTP 400, 401, 403, 404, or 500
- keep provider keys and network calls backend-only
- do not implement Step 5 /enhance route orchestration yet
- do not implement Step 6 /bind route orchestration yet

Stop when adapters are deterministic, testable, and route-ready.
```

Done when:

1. Provider adapters expose one normalized streaming interface.
2. Retry/backoff behavior is explicit and deterministic for transient failures.
3. Error mapping is consistent across providers.
4. No Step 5-6 route behavior is implemented in this slice.

### 3.6 Add service-layer integration helpers for Step 4-6 handoff

Goal: expose stable helper APIs that later route steps can consume without rewrites.

- [ ] Add explicit service entrypoints for selecting models by route context.
- [ ] Add explicit service entrypoints for enhance-template assembly and bind-template assembly.
- [ ] Ensure bind helper contract expects canonical ordering semantics.
- [ ] Keep route handlers thin and unchanged except for compile-safe wiring.
- [ ] For route files, allow only imports, route registration, and typed signatures. Do not add request validation, prompt assembly, provider calls, error mapping, retry logic, or business logic in `/segment`, `/enhance`, or `/bind`.
- [ ] Keep production route behavior deferred to Step 4-6 implementation slices.

Copilot session:

- Agent session.
- Scope stays in service layer and thin route-facing interfaces.

Prompt:

```text
Implement Step 3.6 service-layer handoff helpers.

Allowed files:
- backend/src/services/**
- backend/src/routes/** only for minimal compile-safe wiring if needed
- backend/src/__tests__/**

Requirements:
- expose stable helper APIs for Step 4-6 routes
- preserve canonical bind-order expectations in helper contracts
- route files may only receive compile-safe wiring: imports, route registration, and typed signatures
- do not add request validation, prompt assembly, provider calls, error mapping, retry logic, or business logic to /segment, /enhance, or /bind
- do not implement full /segment, /enhance, or /bind production behavior in this step

Stop when service-layer contracts are stable and tested.
```

Done when:

1. Step 4-6 route work has stable service-layer entrypoints.
2. Canonical bind-order semantics are explicit at the service contract level.
3. Route-level behavior remains deferred to the correct steps.

### 3.7 Add matrix, determinism, and resilience tests

Goal: prove Step 3 service behavior before route implementation starts.

- [ ] Add tests for full `callType x tier x mode` route matrix.
- [ ] Add tests for unsupported route-key behavior.
- [ ] Add tests for prompt determinism by goal type and mode.
- [ ] Add tests for sibling-context injection behavior.
- [ ] Add tests for provider adapter retry/backoff behavior.
- [ ] Add tests for normalized provider error mapping.
- [ ] Cover retryable provider failures separately for Groq and Anthropic: timeout, connection reset, HTTP 429, HTTP 502, HTTP 503, and HTTP 504.
- [ ] Cover non-retryable provider failures separately for Groq and Anthropic: HTTP 400, 401, 403, 404, and 500.
- [ ] Cover retry exhaustion with deterministic mocks.
- [ ] Keep tests network-isolated and deterministic (no live provider dependency).

Copilot session:

- Review session first, then Agent for edits.

Prompt:

```text
Expand Step 3 tests for model routing, prompt assembly, and provider adapter resilience.

Cover:
- route-matrix determinism
- unsupported route-key behavior
- prompt-factory determinism by goal_type and mode
- sibling-context injection behavior
- provider adapter retry/backoff and error normalization
- retryable provider failures: timeout, connection reset, HTTP 429, HTTP 502, HTTP 503, and HTTP 504
- non-retryable provider failures: HTTP 400, 401, 403, 404, and 500
- retry exhaustion with deterministic mocks

Do not add Step 4-6 route behavior assertions.
```

Done when:

1. Route matrix behavior is locked.
2. Prompt assembly is deterministic and regression-resistant.
3. Provider failure behavior is deterministic and test-covered.

### 3.8 Final review and handoff

Goal: ensure Step 3 service work is complete and Step 4 can start without service churn.

- [ ] Review diff against Step 3 acceptance criteria.
- [ ] Confirm no Step 4-6 route implementation behavior landed early.
- [ ] Confirm router, prompts, and adapters stay backend-only and provider-safe.
- [ ] Confirm test coverage maps to all Step 3 deliverables.
- [ ] Update progress logs and note deferred route concerns for Step 4-6.

Copilot session:

- Review session (read-only Ask or Agent).

Prompt:

```text
Review Step 3 work against the taskboard.

Find:
- router matrix gaps
- prompt-template drift
- provider adapter failure-path gaps
- missing tests
- step-boundary violations into Step 4-6 routes

Do not edit files.
```

Done when:

1. The Step 3 taskboard is reflected in service-layer code and tests.
2. Step 4 can begin without reopening router/template decisions.
3. Out-of-scope route behavior remains deferred.

## Step 3 Quality Bar

Treat Step 3 as production service work, not temporary scaffolding.

1. Every routing decision has one deterministic model result.
2. Every prompt template is deterministic and mode-complete.
3. Every provider adapter has explicit transient-failure handling.
4. Every service-layer contract is route-ready and test-backed.
5. Every step boundary with Step 4-6 is preserved.

## Step 3 Exit Criteria

Do not start Step 4 until all of these are true:

1. Step 3 taskboard is complete.
2. `selectModel` matrix is deterministic and test-covered.
3. Prompt factories exist for all goal types and bind assembly.
4. Provider streaming adapters exist for Groq and Anthropic with normalized error handling.
5. Retry/backoff behavior is explicit and tested.
6. No Step 4-6 production route behavior was implemented early.

## Short Version You Can Remember

1. Lock scope before touching service code.
2. Build and test deterministic model routing first.
3. Build and test deterministic prompt factories next.
4. Normalize provider streaming through one adapter interface.
5. Add retry/error resilience tests.
6. Hand off to Step 4 only after service contracts are stable.