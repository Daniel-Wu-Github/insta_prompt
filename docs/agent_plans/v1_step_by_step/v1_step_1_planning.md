# Step 1 Planning Blueprint (Data Layer and Auth Foundation)

This document records the completed design and planning outputs for Step 1.
It is aligned with:

- `docs/ARCHITECTURE.md`
- `docs/BACKEND_API.md`
- `docs/DATA_MODELS.md`
- `docs/EXTENSION.md`
- `docs/LLM_ROUTING.md`
- `docs/agent_plans/v1_steps_summary/STEP_0_SUMMARY.md`
- `docs/agent_plans/v1_overarching_plan.md`
- `docs/agent_plans/v1_step_by_step/v1_step_1.md`

## 1.1 Scope Lock and Source of Truth

### Phase 1 decision lock matrix

The following decisions are now locked for implementation and must not be re-opened in later Step 1 slices unless a source-of-truth doc changes first.

| Decision area | Locked choice (Phase 1) | Why this is locked now | Downstream dependency |
|---|---|---|---|
| Profile identity model | `public.profiles.id` maps directly to `auth.users.id`; Step 1 does not introduce a duplicate `profiles.user_id` identity column. | Prevents dual-identity drift across migrations, auth middleware, and RLS ownership checks. | 1.4 migrations, 1.5 auth middleware, 1.7 ownership tests |
| Tier source of truth | `tier` is derived from verified Supabase-backed profile state only; no request header can set or override tier. | Removes client-controlled privilege escalation risk before Step 2 enforcement work begins. | 1.5 auth middleware wiring, 1.6 `/auth/token`, 1.7 auth tests |
| `/auth/token` contract | Route is public, request must include non-empty `refresh_token`, and response shape is fixed to `token`, `token_type`, `expires_in`, `refresh_token`, `user_id`, `tier`. | Keeps extension session handoff deterministic and prevents contract drift. | 1.6 route implementation, shared contract validation, extension background storage |
| Vector and trigger prerequisites | The migration provisioning `context_chunks` MUST include `CREATE EXTENSION IF NOT EXISTS vector;` before the table definition; profile bootstrap trigger must insert `NEW.id` into `public.profiles.id` with explicit `tier = 'free'`, and the trigger function must be `SECURITY DEFINER`. | Prevents migration-order failures and missing profile bootstrap behavior. | 1.4 SQL migrations, 1.7 schema smoke assertions |
| RLS posture | Every user-owned table must ship with explicit ownership policies for read/write paths, including `WITH CHECK` protections for writes. | Ensures durable access controls even if future backend filters regress. | 1.4 RLS migration, 1.7 auth and ownership tests |

### Step 1 scope in one paragraph

Step 1 turns the Step 0 scaffold into a trustworthy identity and persistence foundation: provision the Supabase schema and RLS policies for user profiles, enhancement history, and v2-ready project/context tables; add the database trigger that auto-creates `profiles` rows when new `auth.users` rows appear; replace placeholder auth handling with server-side JWT verification that resolves the authenticated user and tier from Supabase; define the `/auth/token` refresh-and-validation exchange used by the extension after login; and lock the auth test matrix against a real local Supabase harness so later tier and rate-limiting work can rely on truthful user context. This phase must keep all provider calls behind the backend, preserve the MV3 extension boundary, and avoid starting the later routing or UX steps.

### Review feedback resolved

The Step 1 planning surface now explicitly covers the four gaps called out in review:

1. New Supabase users get a `profiles` row automatically via an `auth.users` trigger.
2. `context_chunks` migration setup requires `vector` before the table is created.
3. `/auth/token` is defined as a Supabase session refresh proxy, not a custom JWT issuer.
4. Auth and RLS tests are planned against a real local Supabase harness, not only mocked clients.

### Step 1 deliverables extracted from the overarching plan

1. SQL migrations for `profiles`, `enhancement_history`, `projects`, and `context_chunks`.
2. A trigger on `auth.users` that creates a default `profiles` row on signup.
3. RLS policies for all user-owned records.
4. Backend auth middleware that verifies JWTs and attaches `userId` and `tier`.
5. A precise `/auth/token` refresh contract for the extension session handoff.
6. A local Supabase test harness for real auth and RLS coverage.
7. Integration tests for unauthorized, expired token, and valid token paths.
8. Shared auth contract updates if the token exchange shape needs new typed responses.

### Source-of-truth file map

| Concern | Source of truth | Why this is canonical |
|---|---|---|
| Core architecture and proxy-only boundary | `docs/ARCHITECTURE.md` + `.github/copilot-instructions.md` | Defines the backend-first auth model and cross-layer invariants. |
| Persistent model shape and ownership rules | `docs/DATA_MODELS.md` | Defines `profiles`, `enhancement_history`, `projects`, `context_chunks`, and the vector prerequisite. |
| Backend auth endpoint and middleware order | `docs/BACKEND_API.md` | Defines `/auth/token`, verified auth headers, and request order. |
| Extension token storage boundary | `docs/EXTENSION.md` | Defines `chrome.storage.session` ownership and background-worker privilege. |
| Shared request/response contracts | `shared/contracts/**` | Keeps auth and data shapes reusable across backend and extension surfaces. |
| Step-level acceptance criteria | `docs/agent_plans/v1_step_by_step/v1_step_1.md` | Defines done criteria for this phase. |
| Step-wide sequencing intent | `docs/agent_plans/v1_overarching_plan.md` | Defines dependency order against later steps. |
| Current bootstrap baseline | `docs/agent_plans/v1_steps_summary/STEP_0_SUMMARY.md` | Captures what Step 0 intentionally left behind. |

### Step 1 out of scope

1. No Step 2 rate-limiting or tier-enforcement logic beyond populating tier from verified auth context.
2. No LLM routing, model-selection, or SSE changes.
3. No extension UX, ghost text, underline, or commit-pipeline work.
4. No GitHub OAuth repo ingestion or context retrieval implementation.
5. No direct provider calls or BYOK UX changes.
6. No schema behavior that conflicts with the v2-ready table shape or RLS rules.

## 1.2 Copilot Workflow Surface Plan

### Numbering convention

1. Taskboard execution numbering (`1.x`) lives in `docs/agent_plans/v1_step_by_step/v1_step_1.md`.
2. This planning blueprint uses decision labels (`D1..D9`) plus file-level slice labels for dependency mapping.
3. If numbering appears to overlap, treat the taskboard as execution order and this blueprint as locked design constraints.

### Always-on instruction surfaces (confirmed)

1. `.github/copilot-instructions.md`
2. `.github/skills/SKILL_MAP.md`
3. `.github/skills/*/SKILL.md` (loaded per task classification)

### Reusable prompt surfaces (recommended)

1. `.github/prompts/step1-plan-review.prompt.md` for design/planning and review-only passes.
2. `.github/prompts/step1-build-slice.prompt.md` for narrow implementation slices (1.3-1.7).

### One-off prompt rule

Keep one-off prompts in chat when they are highly specific to one migration file or a temporary auth investigation. Promote to `.github/prompts/` only after the pattern repeats.

### Session and approval strategy for Step 1

1. Planning and review sessions are read-only by default.
2. One editing session per file cluster, especially for migrations and auth middleware.
3. Default approvals while schema and token flow are still changing.
4. Bypass approvals only for mechanical, low-risk edits once SQL and typecheck checks are stable.

## Design Decisions for Step 1.3 and 1.4

### Decision D1: Supabase migrations live at `supabase/migrations/`

Rationale:

1. Supabase CLI compatibility keeps schema history portable and reviewable.
2. The migration history stays outside backend runtime code, which reduces ownership drift.
3. A single root-level migration surface makes the v2-ready schema easier to audit.
4. The first migration must enable the `vector` extension before `context_chunks` is created, and must include the `AFTER INSERT` trigger on `auth.users` to auto-create `profiles` rows.

Planned files:

- `supabase/migrations/0001_step1_profiles_and_history.sql` — provisions `profiles` table, creates `AFTER INSERT` trigger on `auth.users` to seed new profiles with `tier = 'free'`, provisions `enhancement_history` table, and enables the `vector` extension.
- `supabase/migrations/0002_step1_projects_and_context.sql` — provisions `projects` and `context_chunks` tables (safe to create now that `vector` is enabled).
- `supabase/migrations/0003_step1_rls.sql` — all RLS policies for user-owned tables.
- `supabase/config.toml` — local Supabase CLI harness configuration.

Planning rule:

1. The migration provisioning `context_chunks` MUST include `CREATE EXTENSION IF NOT EXISTS vector;` before the table definition.
2. The vector extension statement belongs in the earliest Step 1 migration that can run before any `context_chunks` DDL.
3. The migration sequence must remain deterministic under local reset workflows.

### Decision D2: `profiles` is the canonical app-metadata row

Rationale:

1. `auth.users` remains the identity provider, not the application metadata store.
2. `profiles` is the single place to keep tier and BYOK-adjacent metadata.
3. User-owned tables should foreign-key to `profiles.id`, not to client-provided IDs.

Planning rule:

1. `tier` must be derived from verified Supabase state, never from request headers.
2. Backend middleware may cache `tier` in Hono context after verification, but it must not trust unverified client input.
3. The `context_chunks` migration must enable `vector` before creating the table.
4. Phase 1 schema lock: `profiles` uses `id uuid primary key references auth.users(id)` as the canonical identity and does not add a duplicate `user_id` identity column.

### Decision D3: Auth verification happens server-side and is the only source of truth for user context

Rationale:

1. Protected routes need a trustworthy `userId` before any storage or policy check runs.
2. The extension should treat the backend as the sole authority for authenticated API access.
3. Step 2 tier enforcement depends on Step 1 providing correct context first.

Planning rule:

1. `backend/src/middleware/auth.ts` should verify the bearer token with Supabase before setting `userId`.
2. The middleware must attach `tier` from Supabase-backed profile data, not from a header override.
3. Any placeholder dev-token behavior must be removed before Step 1 is considered complete.
4. Missing, invalid, or expired bearer tokens must map to the same deterministic unauthorized response envelope.

### Decision D4: `/auth/token` stays a backend contract for the extension session handoff

Rationale:

1. The extension needs a stable refresh or exchange route after Supabase login.
2. The response should remain simple enough for `chrome.storage.session` persistence.
3. The route boundary must be validated before later extension work consumes it.

Planning rule:

1. The extension background worker owns token storage.
2. Content scripts never read or store auth tokens directly.
3. The backend `/auth/token` route is a Supabase session refresh proxy, not a custom JWT issuer.
4. The response shape must stay consistent across backend and extension use.

### Decision D5: RLS is mandatory for every user-owned persistence table

Rationale:

1. Server-side verification is necessary but not sufficient for durable access control.
2. RLS keeps profile, project, and history access aligned with the docs.
3. The data model should remain safe even if a later code path forgets a server-side ownership check.

Planning rule:

1. Each owned table gets an explicit policy.
2. Backend helpers may still filter by owner in code, but the database remains authoritative.
3. No client-supplied `user_id` or `project_id` is ever treated as authoritative without a server lookup.
4. Write paths (`INSERT` and `UPDATE`) must include explicit ownership checks (for example, `WITH CHECK`) so clients cannot write cross-user rows.
5. `context_chunks` ownership must be enforced through the owning `projects.user_id` relationship.

### Decision D6: New Supabase users must receive a `profiles` row automatically

Rationale:

1. `auth.users` is owned by Supabase Auth, so profile creation must be automatic and idempotent.
2. Tier checks, foreign keys, and profile-based lookups break if first-time users have no `profiles` row.
3. A database trigger keeps the bootstrap behavior close to the data model instead of scattering it across app code.

Planning rule:

1. The profiles migration must create an `AFTER INSERT` trigger on `auth.users`.
2. The trigger function must insert `NEW.id` into `public.profiles.id` and set `tier = 'free'` explicitly in the insert statement.
3. The trigger function must be created as `SECURITY DEFINER` so the bootstrap insert can run safely under RLS constraints during signup.
4. The trigger function should write an explicit `created_at` value at insert time for deterministic bootstrap behavior.
5. Migration SQL must be re-run safe in local reset workflows with explicit trigger/function idempotency semantics.
6. The migration should use deterministic trigger/function recreation semantics (for example, `CREATE OR REPLACE FUNCTION ...`, `DROP TRIGGER IF EXISTS ... ON auth.users`, then `CREATE TRIGGER ...`) so re-applies do not fail unpredictably.

### Decision D7: Step 1 tests use a real local Supabase instance, not only mocks

Rationale:

1. RLS cannot be validated without a real Postgres instance running the policies.
2. JWT verification and profile bootstrap need the Supabase runtime to be meaningful.
3. Mock-only client tests are still useful for pure helpers, but they do not satisfy Step 1's data guarantees.

Planning rule:

1. The Step 1 workflow **must** initialize and run the local Supabase harness: `npx supabase init` (if not already done) and `npx supabase start` to begin the Docker-backed Postgres and Auth service.
2. Integration tests **must** target the local Supabase database for auth and RLS assertions; no auth/RLS coverage comes from mocks.
3. Client mocks are allowed only for isolated unit tests of pure helpers that do not touch the database or make auth calls.

### Decision D8: `/auth/token` is a Supabase refresh-and-validation proxy

Rationale:

1. The endpoint should clarify whether it refreshes a session or issues custom credentials.
2. The backend should not mint a new app-specific JWT when Supabase already owns identity.
3. A refresh proxy is the smallest contract that still gives the extension a stable handoff point.

Planning rule:

1. The route is public and accepts a required, non-empty Supabase `refresh_token` in the request body.
2. The route **must** call `supabase.auth.refreshSession()` server-side to obtain a refreshed access token (not a custom JWT or equivalent workaround).
3. The refreshed access token is verified with `supabase.auth.getUser()` before any response is returned to ensure the token is valid and the user profile exists.
4. The response shape is fixed to `token`, `token_type`, `expires_in`, `refresh_token`, `user_id`, and `tier`.
5. If Supabase rotates the refresh token, the response returns the rotated `refresh_token`; otherwise `refresh_token` may be `null`.
6. The route does not become a custom auth issuer and does not mint any non-Supabase credentials.
7. Phase D must mark this endpoint in `docs/BACKEND_API.md` with `[TODO: Step 2 IP-based Rate Limit]` so Step 2 explicitly protects the public surface.

### Decision D9: `projects` and `context_chunks` are provisioned now but remain dormant in v1

Rationale:

1. The v2-ready schema should exist before later context work starts.
2. Empty tables are cheaper than production migrations after the feature is live.
3. The presence of these tables should not imply GitHub OAuth or vector retrieval is already implemented.

Planning rule:

1. Step 1 only provisions the tables and policies.
2. Step 1 does not build repo ingestion or retrieval logic.
3. Later steps may wire these tables into context-aware flows without schema churn.

## File-Level Plan for Remaining Step 1 Slices

### 1.3 Shared auth contracts and backend validation

- `shared/contracts/api.ts`
- `shared/contracts/domain.ts` if the auth flow needs a shared profile or session type
- `backend/src/lib/schemas.ts`
- `backend/src/lib/validation.ts`
- `backend/src/lib/http.ts`

Dependencies: Step 0 contracts stay frozen while the token exchange shape is finalized.

### 1.4 Database migrations and RLS

- `supabase/migrations/0001_step1_profiles_and_history.sql`
- `supabase/migrations/0002_step1_projects_and_context.sql`
- `supabase/migrations/0003_step1_rls.sql`
- `supabase/config.toml` for the local Supabase CLI harness

Dependencies: the data model decisions above must be locked before any SQL is written.

### 1.5 Backend auth verification and middleware wiring

- `backend/src/services/supabase.ts` (new)
- `backend/src/services/auth.ts` (new)
- `backend/src/middleware/auth.ts`
- `backend/src/middleware/tier.ts`
- `backend/src/types.ts`
- `backend/src/index.ts` only if context wiring needs a small adjustment

Dependencies: migration shape and auth contract decisions must be stable first.

Execution order constraint:

1. Implement and validate `backend/src/services/supabase.ts` before changing `backend/src/middleware/auth.ts`.
2. Update `backend/src/middleware/tier.ts` only after verified auth context is available from auth middleware.
3. Keep route-mount ordering validation in `backend/src/index.ts` as the final check in this slice.

### 1.6 `/auth/token` exchange and session handoff

- `backend/src/routes/auth.ts`
- `shared/contracts/api.ts`
- `backend/src/lib/validation.ts`
- `backend/src/services/supabase.ts` (reuse shared refresh-session and verification helpers)

Dependencies: the auth route must agree with the token shape and the verified user context.

Execution order constraint:

1. Finish the `backend/src/services/supabase.ts` refresh and verification helpers in 1.5 before implementing `/auth/token` response handling.
2. Lock shared request/response contract updates before wiring route responses.

### 1.7 Auth test matrix and ownership checks

- `backend/src/__tests__/auth.integration.test.ts` (new)
- `backend/src/__tests__/routes.validation.test.ts` (update placeholder auth assertions)
- `backend/src/__tests__/stress-tests.test.ts` (update if middleware behavior changes under real auth)
- `supabase/migrations/**` smoke assertions against the local Supabase harness
- `backend/src/__tests__/setup.ts` or equivalent local harness bootstrap if needed

Dependencies: middleware, route, and schema choices must be in place before tests can stabilize.

Test boundary rule:

1. Integration coverage (required): JWT verification paths, `/auth/token` refresh paths, trigger bootstrap behavior, and RLS ownership/cross-user isolation against local Supabase.
2. Unit coverage (optional): pure helper behavior that does not call Supabase auth APIs and does not claim RLS/database guarantees.
3. Mocked tests must not be used to claim auth or RLS coverage for Step 1 acceptance.

### 1.8 Final review and handoff

- `docs/agent_plans/v1_step_by_step/v1_step_1.md` (checkboxes)
- `logging/progress_log.md`

Dependencies: all prior Step 1 slices complete and verified.

## Risk Register and Mitigations

1. Risk: placeholder header-based tier logic survives and overrides verified auth context.
   Mitigation: remove tier trust from request headers before Step 1 is considered complete.
2. Risk: schema drift appears between the docs and the migration files.
   Mitigation: keep the SQL files as the canonical source and cross-check them against `docs/DATA_MODELS.md`.
3. Risk: RLS blocks required server writes or leaks user-owned rows.
   Mitigation: author explicit policies per table and verify ownership behavior in tests.
4. Risk: `/auth/token` response shape diverges from extension storage assumptions.
   Mitigation: enforce one shared contract and validate both request and response boundaries.
5. Risk: Step 2 depends on trustworthy tier data but Step 1 leaves the placeholder path intact.
   Mitigation: route all tier lookups through verified Supabase profile data now, even if enforcement comes later.
6. Risk: scope creep introduces Step 2 or Step 3+ behavior during Step 1 execution.
   Mitigation: enforce a per-slice scope gate that blocks rate-limit enforcement, model-routing logic, and extension UX behavior changes until their planned steps.

## Phase E - Consistency Gate Before Implementation Handoff

Goal: verify the planning and source-of-truth surfaces are aligned before any Step 1 runtime implementation begins.

Required checks:

1. Run a cross-doc consistency check across:
   - `docs/agent_plans/v1_step_by_step/v1_step_1.md`
   - `docs/agent_plans/v1_step_by_step/v1_step_1_planning.md`
   - `docs/BACKEND_API.md`
   - `docs/DATA_MODELS.md`
   - `shared/contracts/api.ts`
2. Confirm no document implies Step 2 enforcement implementation inside Step 1.
3. Confirm critical Step 1 items are aligned across checklist, prompt text, and done criteria.
4. Publish one final implementation order and stop condition set per slice.

Phase E pass criteria:

1. Profile identity, trigger behavior, and tier source are described consistently.
2. `/auth/token` contract wording is consistent across planning and source-of-truth docs.
3. Scope notes keep Step 2 and Step 3+ implementation out of Step 1.

### Phase E execution result (documentation and contract pass)

Cross-doc check outcome:

1. Checked `v1_step_1.md`, `v1_step_1_planning.md`, `BACKEND_API.md`, `DATA_MODELS.md`, and `shared/contracts/api.ts` for Step 1 consistency.
2. Confirmed no Step 2 enforcement implementation or Step 3+ routing implementation is requested inside Step 1 scope docs.
3. Confirmed checklist, prompt text, and done-criteria alignment is present for Step 1 critical items in sections 1.3 to 1.7 of `v1_step_1.md`.

Consistency resolution applied:

1. `shared/contracts/api.ts` now types `AuthTokenRequest.refresh_token` as required, matching Step 1 docs.
2. Trigger hardening language now explicitly requires a `SECURITY DEFINER` trigger function for profile bootstrap behavior.

Phase E gate status:

1. Documentation consistency: pass.
2. Contract consistency: pass.
3. Runtime-handoff readiness: pass for Step 1 documentation and contract baseline.

## Phase F - Implementation Handoff Sequence

Goal: define the execution order after docs are fixed, without performing implementation in this planning pass.

Slice sequence:

1. Slice 1: local harness preflight and environment wiring.
2. Slice 2: migration files and trigger.
3. Slice 3: Supabase service layer.
4. Slice 4: auth middleware replacement.
5. Slice 5: tier middleware cleanup.
6. Slice 6: token route replacement.
7. Slice 7: auth and RLS integration tests against local Supabase.
8. Slice 8: final Step 1 criteria review only.

Slice stop conditions (for execution pass):

1. Slice 1 stop: local Supabase harness prerequisites verified, service status captured, and no schema or middleware behavior changes landed.
2. Slice 2 stop: migrations apply cleanly, `vector` ordering and profile trigger behavior verified, and all ownership/RLS SQL is explicit.
3. Slice 3 stop: Supabase service helpers exist with deterministic error handling; no route or middleware behavior changed yet.
4. Slice 4 stop: auth middleware no longer uses placeholder identity paths; unauthorized envelope is deterministic across missing/invalid/expired tokens.
5. Slice 5 stop: tier trust is removed from request headers and sourced only from verified auth context; no Step 2 enforcement logic added.
6. Slice 6 stop: `/auth/token` uses refresh-session plus token verification path, request validation fails fast for missing/empty refresh token, and no custom credential issuance exists.
7. Slice 7 stop: integration coverage proves auth, trigger bootstrap, and RLS ownership/cross-user isolation on local Supabase; mock-only auth/RLS claims are excluded.
8. Slice 8 stop: Step 1 acceptance criteria reviewed against actual diffs, residual risks documented, and no Step 2 or Step 3+ implementation behavior introduced.

Stop condition for this planning pass:

1. Do not implement runtime backend, extension, web, or migration behavior here.
2. End after planning/docs consistency and handoff order are complete.
3. Runtime implementation begins only in a dedicated execution pass that follows the above slice order.

## Planning Completion Status

Step 1 planning/design tasks are complete when:

1. Scope and out-of-scope are explicit.
2. File map and dependency order are explicit.
3. Workflow surfaces are classified into always-on vs reusable prompt vs one-off.
4. Auth and data design choices are locked for implementation.

Status: Complete for 1.1 and 1.2.