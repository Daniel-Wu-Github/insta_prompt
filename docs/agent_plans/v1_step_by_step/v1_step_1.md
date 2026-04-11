# Step 1 - Data Layer and Auth Foundation

This is the tactical workboard for Step 1 in [v1_overarching_plan.md](../../agent_plans/v1_overarching_plan.md). The goal is to turn the Step 0 scaffold into a trustworthy identity and persistence layer that later routing, tier, and extension flows can rely on.

## 1.0 Resolve Review Feedback

Goal: make the data/auth mechanics explicit before the implementation slices start.

- [ ] Add the `auth.users` trigger that seeds `public.profiles` with `tier = 'free'`.
- [ ] Enable `vector` before creating `context_chunks`.
- [ ] Define `/auth/token` as a Supabase refresh-session proxy with a typed response contract.
- [ ] Run auth and RLS tests against a real local Supabase harness.

Copilot session:

- Plan agent first.
- Ask agent if you need a narrow check on the local Supabase harness shape.

Prompt:

```text
Resolve the Step 1 review feedback before implementation.

Make the profile bootstrap, vector setup, auth-token flow, and local Supabase test path explicit in the step docs.

Do not edit unrelated files.
```

Done when:

1. The Step 1 docs explicitly state how new users get profiles.
2. The Step 1 docs explicitly state how `vector` is enabled.
3. The Step 1 docs explicitly state what `/auth/token` does.
4. The Step 1 docs explicitly state how auth/RLS tests run locally.

Step 1 is done when the repo has:

1. Supabase schema and RLS for `profiles`, `enhancement_history`, `projects`, and `context_chunks`.
2. An `auth.users` trigger that creates a default `profiles` row on signup.
3. A local Supabase harness that can run the database, auth, and RLS checks from the repo.
4. Auth middleware that verifies JWTs and attaches `userId` and `tier` from Supabase-backed state.
5. A validated `/auth/token` refresh-session exchange that the extension can store in session storage.
6. Integration tests for missing, expired, and valid auth paths.
7. Enough auth-context truth for Step 2 rate limiting and tier enforcement to build on without rework.

## How To Vibe Code Step 1 In VS Code

Use GitHub Copilot Chat like a small production team, not like a single giant chatbot.

### Recommended session layout

Use 3 chat sessions, but only 2 should be active at the same time.

1. Plan session: one session, local Plan agent, read-only.
2. Build session: one session, local Agent, edit and run tools.
3. Review session: one session, local Ask agent, read-only audit and debugging.

For Step 1, do not run more than one editing agent on the same migration or middleware cluster at once. The schema and auth work are tightly coupled, so parallel writers create avoidable merge churn.

If you want the simplest possible setup, use only 2 sessions:

1. Plan or Ask for analysis.
2. Agent for implementation.

Add the Review session only when the first slice is complete and you need a clean audit of the diff.

### Which Copilot mode to use for each phase

1. Plan agent: create the taskboard, sequence the schema and auth work, identify risks, and define done criteria.
2. Ask agent: inspect the codebase, locate placeholder auth behavior, explain dependencies, and answer narrow questions.
3. Agent: make the actual file changes, run checks, and fix errors.

For a first-time vibe coder, keep permissions conservative.

1. Use Default Approvals while the schema and auth flow are still changing.
2. Use Bypass Approvals only for mechanical edits after the tests are stable.
3. Avoid Autopilot on Step 1 unless the slice is tiny and the file list is extremely narrow.

### Prompt pattern that works best

Use short prompts with five parts:

1. Goal.
2. Context.
3. Allowed files.
4. Constraints.
5. Exit condition.

Good prompts are specific enough that the agent can finish without guessing. Bad prompts ask for the whole step in one shot.

Example planning prompt:

```text
Read [docs/ARCHITECTURE.md](../../ARCHITECTURE.md), [docs/BACKEND_API.md](../../BACKEND_API.md), [docs/DATA_MODELS.md](../../DATA_MODELS.md), [docs/EXTENSION.md](../../EXTENSION.md), [docs/LLM_ROUTING.md](../../LLM_ROUTING.md), and [docs/STEP_0_SUMMARY.md](../../STEP_0_SUMMARY.md).

Create a Step 1 taskboard only.

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
Implement only Step 1.3 and Step 1.4.

Allowed files:
- supabase/migrations/**
- backend/src/middleware/**
- backend/src/services/**
- backend/src/lib/** only if validation or response helpers must change

Constraints:
- keep the changes minimal
- do not change unrelated code
- add tests for the new auth and schema behavior
- stop when this slice is complete

If a design choice is ambiguous, pick the smallest safe option and explain the tradeoff.
```

Example review prompt:

```text
Review #changes against the Step 1 acceptance criteria.

Find:
- missing migrations
- auth-context mismatches
- RLS gaps
- contract mismatches
- test gaps

Do not edit files.
```

### Best-practice rules to follow every time

1. Start a fresh session when changing from planning to implementation.
2. Fork a session if you want to explore an alternate schema or token flow without losing the original branch.
3. Keep one active builder session per file cluster.
4. Use `#codebase` when you want the agent to reason over the repo.
5. Use `#changes` when you want the agent to review the diff.
6. Use `#problems` when you want the agent to fix errors.
7. Use checkpoints before risky edits so you can roll back quickly.
8. Save a prompt as a reusable `.prompt.md` file only after the workflow stabilizes.
9. Keep always-on repo instructions short and high-signal; do not duplicate them in every prompt.

### What not to do

1. Do not ask one agent to design, implement, review, and debug the same slice in one prompt.
2. Do not keep more than 3 live sessions for Step 1.
3. Do not let two agent sessions edit the same migration or auth middleware file at the same time.
4. Do not start with implementation before the taskboard is stable.
5. Do not use giant prompts with open-ended scope.

## Step 1 Taskboard

### 1.1 Lock scope and source of truth

Goal: make Step 1 unambiguous before writing SQL or auth code.

- [ ] Read the architecture, backend API, data model, extension, LLM routing, and Step 0 summary docs.
- [ ] Extract the exact Step 1 deliverables from the overarching plan.
- [ ] Decide which files are the source of truth for schema, auth, and token exchange.
- [ ] Write down what Step 1 will not do.

Copilot session:

- Plan agent first.
- If you need repo-specific answers, use Ask with `#codebase`.

Prompt:

```text
You are planning Step 1 only.

Read the repo docs and return a taskboard for Step 1 with file-level scope, dependencies, and done criteria.

Do not suggest Step 2 work.
Do not edit files.
```

Done when:

1. You can state the Step 1 scope in one paragraph.
2. You have a clear file map for the auth and data work.
3. You know which pieces are out of scope for this step.

### 1.2 Set up the Step 1 workflow surface

Goal: keep schema and auth work isolated and repeatable.

- [ ] Confirm the existing always-on instruction surface is still the right place for repo-wide rules.
- [ ] Decide whether any reusable Step 1 prompt files are needed.
- [ ] Make sure the step is aligned with the current repository instructions and architecture guardrails.
- [ ] Keep the instructions concise enough that Copilot can follow them without noise.

Copilot session:

- Ask agent for a workspace audit.
- Plan agent if you need to rewrite the workflow for clarity.

Prompt:

```text
Inspect the current workspace instruction surfaces and tell me how to keep Step 1 prompts short, reusable, and aligned with the repo rules.

Focus on the best way to use Copilot Chat, prompt files, and custom instructions for this repo.
```

Done when:

1. You know which instructions are always-on.
2. You know which prompts are one-off and which should become reusable.
3. You are not duplicating the same rule in multiple places.

### 1.3 Define the persistence schema and RLS

Goal: make ownership rules real before auth middleware depends on them.

- [ ] Create SQL migrations for `profiles`, `enhancement_history`, `projects`, and `context_chunks`.
- [ ] **Mandatory:** The migration provisioning `context_chunks` MUST include `CREATE EXTENSION IF NOT EXISTS vector;` before the table definition.
- [ ] **Mandatory:** Add an `AFTER INSERT` trigger on `auth.users` that auto-creates a `public.profiles` row with `tier = 'free'` for every new user.
- [ ] **Mandatory:** The trigger function called by the `auth.users` trigger must be created with `SECURITY DEFINER` so profile bootstrap inserts are not blocked by RLS during signup.
- [ ] Lock the canonical `profiles` identity shape: `profiles.id` maps directly to `auth.users.id` and Step 1 does not add a duplicate `profiles.user_id` identity column.
- [ ] Add RLS policies for user-owned tables.
- [ ] Lock the canonical `tier` and ownership fields.
- [ ] **Prerequisite:** Confirm Docker and Docker Compose are installed and running before starting the local Supabase harness.
- [ ] **Mandatory:** Initialize the local Supabase harness with `npx supabase init` (if not already initialized) and start it with `npx supabase start` to provide a real Postgres + Auth runtime for testing.
- [ ] **Mandatory:** Run `npx supabase status` and capture local service endpoints and credentials needed by backend test harness configuration.
- [ ] Verify the expected repo artifacts exist and are tracked for this slice: `supabase/config.toml` and `supabase/migrations/**`.
- [ ] Verify migrations apply cleanly against the running local Supabase instance.

Copilot session:

- Agent session.
- Keep it focused on migrations and policies only.

Prompt:

```text
Create the Step 1 database migrations and RLS policies.

Use the docs as the source of truth for the table shapes and ownership rules.

Mandatory requirements:
- Create supabase/migrations/0001_step1_profiles_and_history.sql that:
  * Enables the vector extension with CREATE EXTENSION IF NOT EXISTS vector;
  * Creates the profiles table with canonical identity mapping to auth.users.id and tier metadata fields aligned to docs/DATA_MODELS.md
  * Creates an AFTER INSERT trigger on auth.users that auto-inserts a new profiles row with tier='free'
  * Creates the trigger function as SECURITY DEFINER with deterministic recreation semantics for local reset workflows
  * Creates the enhancement_history table
- Create supabase/migrations/0002_step1_projects_and_context.sql that creates projects and context_chunks tables
- The migration provisioning context_chunks MUST include CREATE EXTENSION IF NOT EXISTS vector; before the table definition
- Create supabase/migrations/0003_step1_rls.sql with RLS policies for all user-owned tables
- Keep migrations minimal and explicit; preserve the v2-ready schema intent
- Do not add feature logic or GitHub OAuth scaffolding yet
- Do not use placeholder auth or mock behavior

Verification:
- Confirm Docker prerequisites before starting Supabase (`docker --version` and `docker compose --version`)
- Run migrations against a real local Supabase instance started with `npx supabase start`
- Confirm `npx supabase status` reports healthy local services before running migration checks
- Confirm the vector extension is available
- Confirm the trigger fires by simulating a new auth.users insert and checking that profiles auto-creates
- Confirm the profile bootstrap trigger function is created as SECURITY DEFINER

Stop after the persistence layer is complete and verified.
```

Done when:

1. Every Step 1 table has a named migration.
2. The profile bootstrap trigger exists, defaults new rows to `tier = 'free'`, and uses a `SECURITY DEFINER` trigger function.
3. Vector extension is explicitly enabled in the first migration.
4. Ownership rules are explicit in SQL.
5. The schema is verified against a real running local Supabase instance.
6. Local harness prerequisites and repo artifacts are validated (`supabase/config.toml`, `supabase/migrations/**`, and service status).
7. The schema matches the docs and the v2-ready intent.

### 1.4 Implement server-side auth verification

Goal: replace placeholder auth with Supabase-backed identity.

- [ ] Replace the `dev-user` placeholder behavior in `backend/src/middleware/auth.ts`.
- [ ] Resolve `userId` and `tier` from verified Supabase state.
- [ ] Require one deterministic unauthorized response shape for missing, invalid, and expired bearer tokens.
- [ ] Keep auth failures deterministic and non-leaky.
- [ ] Update any context types or helpers that assume dev-only auth.

Copilot session:

- Agent session.
- Ask session only if you need help deciding the smallest safe auth helper shape.

Prompt:

```text
Implement the Step 1 auth middleware using Supabase verification.

I want one consistent unauthorized behavior for missing, invalid, or expired tokens.
Keep the implementation minimal and compatible with the future Step 2 middleware.
Do not hardcode user IDs and do not trust client tier headers in this middleware.

Do not build any LLM or rate-limiting logic yet.
```

Done when:

1. Missing, invalid, and expired auth all return the same 401 shape every time.
2. Verified requests expose `userId` and `tier` in context.
3. The middleware no longer trusts client-supplied tier headers.

### 1.5 Implement `/auth/token` and shared auth contracts

Goal: define the token exchange the extension will consume.

- [ ] Finalize request and response shapes in shared contracts.
- [ ] Require a non-empty `refresh_token` request field and fail fast on missing or empty values before any Supabase call.
- [ ] Update `backend/src/routes/auth.ts` to **call `supabase.auth.refreshSession()` server-side** to refresh the access token (not create a custom JWT).
- [ ] Verify the refreshed token with `supabase.auth.getUser()` before returning any response.
- [ ] Validate malformed request bodies before any auth calls.
- [ ] Keep the response stable enough for `chrome.storage.session` persistence.

Copilot session:

- Agent session.
- Keep the scope limited to the token exchange contract and response validation.

Prompt:

```text
Implement the Step 1 /auth/token route and any needed shared auth contracts.

Implementation requirements:
- POST /auth/token requires a non-empty refresh token in the request body
- Call supabase.auth.refreshSession() server-side to obtain a new access token
- Verify the new access token by calling supabase.auth.getUser()
- Return only the verified access token plus app context (user_id, tier) in the response
- Do NOT issue custom JWTs or create alternative credential formats
- Validate request payloads before making any Supabase calls
- If refresh_token is missing or empty, return 400 and do not attempt any fallback credential path
- Treat this as a Supabase session refresh proxy, not a custom auth issuer

Keep the token exchange shape explicit, validated, and compatible with extension session storage.
Do not touch unrelated backend routes.

Stop when the token handoff is complete and the response shape is ready for extension storage.
```

Done when:

1. The request and response shapes are stable and documented in code.
2. Invalid payloads, including missing or empty refresh_token, fail before any Supabase calls happen.
3. The /auth/token route explicitly uses `supabase.auth.refreshSession()` and verifies with `supabase.auth.getUser()`.
4. The token flow is ready for the extension background worker to consume and stores the verified tier context.
5. No custom JWT or non-Supabase credential format is issued.

### 1.6 Reconcile middleware and service helpers

Goal: make the rest of the backend trust the same auth context.

- [ ] Stop any middleware from trusting request headers for tier or ownership.
- [ ] Remove any `x-user-tier` request-header trust path and source tier only from verified auth context.
- [ ] Introduce Supabase helper functions if the middleware needs them.
- [ ] Keep rate limiting and tier enforcement behavior deferred to Step 2.
- [ ] Confirm protected routes still mount in the correct order.

Copilot session:

- Ask or Agent, depending on whether you are still reasoning or already editing.

Prompt:

```text
Check the auth-adjacent middleware and helper layers for Step 1.

Find any remaining placeholder assumptions about user identity, tier, or ownership.
Remove any remaining `x-user-tier` trust path and preserve Step 2 enforcement boundaries.
Do not add Step 2 enforcement logic yet.
```

Done when:

1. Tier and ownership come from verified context, not request headers.
2. Any new helper code stays small and backend-only.
3. Middleware ordering still matches the architecture docs.
4. Protected route behavior no longer depends on `x-user-tier` header input.

### 1.7 Add integration and ownership tests

Goal: prove the auth and data foundation is real.

- [ ] Cover missing Authorization, invalid JWT, expired JWT, and valid JWT cases.
- [ ] Cover `/auth/token` missing-refresh-token, malformed-body, invalid-refresh-token, and success paths.
- [ ] Cover RLS and ownership assumptions for profile and history rows with cross-user isolation checks.
- [ ] Verify profile bootstrap trigger behavior with a real local Supabase-authenticated user creation path.
- [ ] Update existing route tests to remove dev-token assumptions.
- [ ] Run the auth/RLS integration suite against the local Supabase harness.
- [ ] Keep client mocks only for isolated helper tests that do not claim database coverage.

Copilot session:

- Review session with Ask or a read-only Agent setup.

Prompt:

```text
Review the Step 1 auth and schema work against the taskboard.

Tell me what is missing, what is risky, and what should be fixed before Step 2 starts.
Do not make edits unless I explicitly ask for them.
```

Done when:

1. Unauthorized and expired-token failures are covered.
2. Auth success paths verify the expected user context.
3. `/auth/token` validation and success paths are covered with deterministic expectations.
4. RLS and ownership behavior are testable from the repo against a real local Supabase instance.
5. Cross-user isolation and profile bootstrap behavior are verified in integration coverage.

### 1.8 Final review and handoff

Goal: make sure Step 1 is safe to build on before Step 2 starts.

- [ ] Review the diff against the Step 1 acceptance criteria.
- [ ] Check for contract mismatches and auth-context drift.
- [ ] Confirm the schema and tests line up with the docs.
- [ ] Confirm no Step 2 or Step 3+ implementation behavior landed early (except explicit scope notes/TODO markers).
- [ ] Log the result and any follow-up needed before Step 2.

Copilot session:

- Review session with Ask or a read-only Agent setup.

Prompt:

```text
Review the Step 1 work against the taskboard.

Find missing migrations, auth-context drift, contract mismatches, and RLS gaps.
Do not edit files.
```

Done when:

1. The Step 1 board is reflected in the files.
2. The auth foundation is repeatable.
3. No Step 2 or Step 3+ behavior was implemented prematurely.
4. You are ready to move on without reopening the same questions.

## Step 1 Quality Bar

Treat Step 1 as production work, not throwaway scaffolding.

1. Every ownership boundary gets a schema or policy.
2. Every auth decision is server-side and observable.
3. Every token exchange has a stop condition.
4. Every slice ends with a verification check.
5. Every decision that matters is written down.

## Step 1 Exit Criteria

Do not start Step 2 until all of these are true:

1. The Step 1 taskboard is complete.
2. The Supabase schema and RLS are in place.
3. The auth middleware is verified and attaches `userId` and `tier`.
4. The `/auth/token` contract exists and is tested.
5. You can explain the auth flow in under a minute.

## Short Version You Can Remember

1. Use Plan to break the auth and schema work down.
2. Use Ask to inspect and verify the current placeholders.
3. Use Agent to edit one slice at a time.
4. Keep only 2 or 3 sessions alive.
5. Keep prompts narrow and file-specific.
6. Trust Supabase, not headers.
7. Verify after every slice.
8. Save the reusable prompt only after it works.