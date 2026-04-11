# Step 1 Planning Blueprint (Data Layer and Auth Foundation)

This document records the completed design and planning outputs for Step 1.
It is aligned with:

- `docs/ARCHITECTURE.md`
- `docs/BACKEND_API.md`
- `docs/DATA_MODELS.md`
- `docs/EXTENSION.md`
- `docs/LLM_ROUTING.md`
- `docs/STEP_0_SUMMARY.md`
- `docs/agent_plans/v1_overarching_plan.md`
- `docs/agent_plans/v1_step_by_step/v1_step_1.md`

## 1.1 Scope Lock and Source of Truth

### Step 1 scope in one paragraph

Step 1 turns the Step 0 scaffold into a trustworthy identity and persistence foundation: provision the Supabase schema and RLS policies for user profiles, enhancement history, and v2-ready project/context tables; add the database trigger that auto-creates `profiles` rows when new `auth.users` rows appear; replace placeholder auth handling with server-side JWT verification that resolves the authenticated user and tier from Supabase; define the `/auth/token` refresh-and-validation exchange used by the extension after login; and lock the auth test matrix against a real local Supabase harness so later tier and rate-limiting work can rely on truthful user context. This phase must keep all provider calls behind the backend, preserve the MV3 extension boundary, and avoid starting the later routing or UX steps.

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
| Current bootstrap baseline | `docs/STEP_0_SUMMARY.md` | Captures what Step 0 intentionally left behind. |

### Step 1 out of scope

1. No Step 2 rate-limiting or tier-enforcement logic beyond populating tier from verified auth context.
2. No LLM routing, model-selection, or SSE changes.
3. No extension UX, ghost text, underline, or commit-pipeline work.
4. No GitHub OAuth repo ingestion or context retrieval implementation.
5. No direct provider calls or BYOK UX changes.
6. No schema behavior that conflicts with the v2-ready table shape or RLS rules.

## 1.2 Copilot Workflow Surface Plan

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
4. The first migration must enable `vector` before `context_chunks` is created.

Planned files:

- `supabase/migrations/0001_step1_profiles_and_history.sql`
- `supabase/migrations/0002_step1_projects_and_context.sql`
- `supabase/migrations/0003_step1_rls.sql`
- `supabase/config.toml` for the local Supabase CLI harness

### Decision D2: `profiles` is the canonical app-metadata row

Rationale:

1. `auth.users` remains the identity provider, not the application metadata store.
2. `profiles` is the single place to keep tier and BYOK-adjacent metadata.
3. User-owned tables should foreign-key to `profiles.id`, not to client-provided IDs.

Planning rule:

1. `tier` must be derived from verified Supabase state, never from request headers.
2. Backend middleware may cache `tier` in Hono context after verification, but it must not trust unverified client input.
3. The `context_chunks` migration must enable `vector` before creating the table.

### Decision D3: Auth verification happens server-side and is the only source of truth for user context

Rationale:

1. Protected routes need a trustworthy `userId` before any storage or policy check runs.
2. The extension should treat the backend as the sole authority for authenticated API access.
3. Step 2 tier enforcement depends on Step 1 providing correct context first.

Planning rule:

1. `backend/src/middleware/auth.ts` should verify the bearer token with Supabase before setting `userId`.
2. The middleware must attach `tier` from Supabase-backed profile data, not from a header override.
3. Any placeholder dev-token behavior must be removed before Step 1 is considered complete.

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

### Decision D6: New Supabase users must receive a `profiles` row automatically

Rationale:

1. `auth.users` is owned by Supabase Auth, so profile creation must be automatic and idempotent.
2. Tier checks, foreign keys, and profile-based lookups break if first-time users have no `profiles` row.
3. A database trigger keeps the bootstrap behavior close to the data model instead of scattering it across app code.

Planning rule:

1. The profiles migration must create an `AFTER INSERT` trigger on `auth.users`.
2. The trigger function must insert into `public.profiles` with `tier = 'free'` by default.
3. The trigger must be safe to re-run in local migration resets.

### Decision D7: Step 1 tests use a real local Supabase instance, not only mocks

Rationale:

1. RLS cannot be validated without a real Postgres instance running the policies.
2. JWT verification and profile bootstrap need the Supabase runtime to be meaningful.
3. Mock-only client tests are still useful for pure helpers, but they do not satisfy Step 1's data guarantees.

Planning rule:

1. The Step 1 workflow must explicitly run `npx supabase init` and `npx supabase start` for the local harness.
2. Integration tests must target the local Supabase database for auth and RLS assertions.
3. Client mocks are allowed only for isolated unit tests that do not claim database-level coverage.

### Decision D8: `/auth/token` is a Supabase refresh-and-validation proxy

Rationale:

1. The endpoint should clarify whether it refreshes a session or issues custom credentials.
2. The backend should not mint a new app-specific JWT when Supabase already owns identity.
3. A refresh proxy is the smallest contract that still gives the extension a stable handoff point.

Planning rule:

1. The route accepts a Supabase refresh token and uses `supabase.auth.refreshSession()` or equivalent server-side refresh logic.
2. The refreshed access token is verified with `supabase.auth.getUser()` before any response is returned.
3. The response includes the verified token plus app context needed by the extension session.
4. The route does not become a custom auth issuer.

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

### 1.6 `/auth/token` exchange and session handoff

- `backend/src/routes/auth.ts`
- `shared/contracts/api.ts`
- `backend/src/lib/validation.ts`
- `backend/src/services/supabase.ts` if the route needs shared refresh-session helpers

Dependencies: the auth route must agree with the token shape and the verified user context.

### 1.7 Auth test matrix and ownership checks

- `backend/src/__tests__/auth.integration.test.ts` (new)
- `backend/src/__tests__/routes.validation.test.ts` (update placeholder auth assertions)
- `backend/src/__tests__/stress-tests.test.ts` (update if middleware behavior changes under real auth)
- `supabase/migrations/**` smoke assertions against the local Supabase harness
- `backend/src/__tests__/setup.ts` or equivalent local harness bootstrap if needed

Dependencies: middleware, route, and schema choices must be in place before tests can stabilize.

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

## Planning Completion Status

Step 1 planning/design tasks are complete when:

1. Scope and out-of-scope are explicit.
2. File map and dependency order are explicit.
3. Workflow surfaces are classified into always-on vs reusable prompt vs one-off.
4. Auth and data design choices are locked for implementation.

Status: Complete for 1.1 and 1.2.