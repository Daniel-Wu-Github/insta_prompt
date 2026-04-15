# Integration Audit: Steps 0-2

## Outcome
Step 0, Step 1, and Step 2 are mostly integrated correctly, but not flawless yet. One substantive runtime risk remains in the daily quota expiry path, and there are multiple documentation mismatches that could mislead implementation and testing.

## Findings

### High

1. Free-tier daily quota can become permanently sticky after a partial Redis failure.
Evidence: [backend/src/services/rateLimit.ts](../../../backend/src/services/rateLimit.ts#L224), [backend/src/services/rateLimit.ts](../../../backend/src/services/rateLimit.ts#L225), [backend/src/services/rateLimit.ts](../../../backend/src/services/rateLimit.ts#L259), [backend/src/__tests__/ratelimit.integration.test.ts](../../../backend/src/__tests__/ratelimit.integration.test.ts#L350).
Why this matters: daily quota expiry is only set when `used === 1`; if `incr` succeeds but `expireat` fails once, the key can persist without expiry and never self-heal. The auth-token quota path has TTL repair logic, but the daily quota path does not.

2. Core API docs and pipeline docs currently disagree with runtime contracts in ways that can cause client-side 400s.
Evidence: [docs/CLAUSE_PIPELINE.md](../../CLAUSE_PIPELINE.md#L168), [backend/src/lib/schemas.ts](../../../backend/src/lib/schemas.ts#L54), [shared/contracts/api.ts](../../../shared/contracts/api.ts#L16), [docs/CLAUSE_PIPELINE.md](../../CLAUSE_PIPELINE.md#L97), [docs/CLAUSE_PIPELINE.md](../../CLAUSE_PIPELINE.md#L212), [docs/CLAUSE_PIPELINE.md](../../CLAUSE_PIPELINE.md#L265), [backend/src/routes/segment.ts](../../../backend/src/routes/segment.ts#L7), [shared/contracts/domain.ts](../../../shared/contracts/domain.ts#L37).
Why this matters: the docs show `project_context` while runtime expects `project_id`; docs show canonical-order examples that conflict with the implemented action order; and docs state `COMMITTED` while the runtime contract uses `BINDING_COMPLETE`.

### Medium

3. Backend API docs still mark auth-token IP limiting as TODO even though it is implemented.
Evidence: [docs/BACKEND_API.md](../../BACKEND_API.md#L114), [backend/src/routes/auth.ts](../../../backend/src/routes/auth.ts#L33), [backend/src/routes/auth.ts](../../../backend/src/routes/auth.ts#L47).
Why this matters: this creates planning churn and incorrect readiness assessment for Step 2.

4. Rate-limit reset semantics are inconsistent across docs.
Evidence: [docs/ARCHITECTURE.md](../../ARCHITECTURE.md#L129), [docs/BACKEND_API.md](../../BACKEND_API.md#L161), [docs/BACKEND_API.md](../../BACKEND_API.md#L196), [backend/src/services/rateLimit.ts](../../../backend/src/services/rateLimit.ts#L220), [backend/src/services/rateLimit.ts](../../../backend/src/services/rateLimit.ts#L225).
Why this matters: some docs say TTL 24h, others say reset at UTC day boundary; runtime uses UTC midnight.

5. Extension docs are out of sync with current implementation.
Evidence: [docs/EXTENSION.md](../../EXTENSION.md#L33), [docs/EXTENSION.md](../../EXTENSION.md#L313), [extension/src/popup/hooks/useSettings.ts](../../../extension/src/popup/hooks/useSettings.ts#L22), [extension/src/popup/hooks/useSettings.ts](../../../extension/src/popup/hooks/useSettings.ts#L36), [docs/EXTENSION.md](../../EXTENSION.md#L49), [extension/manifest.json](../../../extension/manifest.json#L6).
Why this matters: docs claim sync storage and `activeTab` permission, but runtime uses local storage and does not request `activeTab`.

6. Backend startup behavior is ambiguous in docs vs entrypoint.
Evidence: [backend/package.json](../../../backend/package.json#L6), [backend/src/index.ts](../../../backend/src/index.ts#L45), [docs/agent_plans/v1_testing_notes.md](../../v1_testing_notes.md#L242).
Why this matters: docs assume explicit server startup output, while code relies on implicit runtime behavior from the exported app only. This is fragile for onboarding and rainy-day debugging.

7. Integration confidence can be overstated because key integration suites skip when env is missing.
Evidence: [backend/src/__tests__/auth.integration.test.ts](../../../backend/src/__tests__/auth.integration.test.ts#L239), [backend/src/__tests__/auth.integration.test.ts](../../../backend/src/__tests__/auth.integration.test.ts#L241), [backend/src/__tests__/ratelimit.integration.test.ts](../../../backend/src/__tests__/ratelimit.integration.test.ts#L189), [backend/src/__tests__/ratelimit.integration.test.ts](../../../backend/src/__tests__/ratelimit.integration.test.ts#L191).
Why this matters: CI/local runs can appear green without actually exercising sunny or rainy integration paths.

### Low

8. Step workboards are ambiguous about completion state.
Evidence: [docs/agent_plans/v1_step_by_step/v1_step_1.md](../../v1_step_by_step/v1_step_1.md#L9), [docs/agent_plans/v1_step_by_step/v1_step_2.md](../../v1_step_by_step/v1_step_2.md#L246), [supabase/migrations/0001_step1_profiles_and_history.sql](../../../supabase/migrations/0001_step1_profiles_and_history.sql#L26), [backend/src/middleware/ratelimit.ts](../../../backend/src/middleware/ratelimit.ts#L5), [backend/src/middleware/tier.ts](../../../backend/src/middleware/tier.ts#L11).
Why this matters: unchecked boxes for already-landed behavior make the docs harder to trust.

9. README version drift.
Evidence: [README.md](../../../README.md#L68), [README.md](../../../README.md#L74), [extension/package.json](../../../extension/package.json#L14), [web/package.json](../../../web/package.json#L13).
Why this matters: minor, but it contributes to documentation trust erosion.

## What Is Working Well

1. Protected route middleware composition is aligned with Step 2 intent.
Evidence: [backend/src/index.ts](../../../backend/src/index.ts#L23), [backend/src/index.ts](../../../backend/src/index.ts#L25), [backend/src/middleware/ratelimit.ts](../../../backend/src/middleware/ratelimit.ts#L5), [backend/src/middleware/auth.ts](../../../backend/src/middleware/auth.ts#L38), [backend/src/middleware/auth.ts](../../../backend/src/middleware/auth.ts#L39).

2. Sunny and rainy auth/rate-limit behavior has meaningful test coverage when integration env is present.
Evidence: [backend/src/__tests__/auth.integration.test.ts](../../../backend/src/__tests__/auth.integration.test.ts#L275), [backend/src/__tests__/auth.integration.test.ts](../../../backend/src/__tests__/auth.integration.test.ts#L338), [backend/src/__tests__/ratelimit.integration.test.ts](../../../backend/src/__tests__/ratelimit.integration.test.ts#L246), [backend/src/__tests__/ratelimit.integration.test.ts](../../../backend/src/__tests__/ratelimit.integration.test.ts#L350), [backend/src/__tests__/ratelimit.integration.test.ts](../../../backend/src/__tests__/ratelimit.integration.test.ts#L403).

3. Static diagnostics were clean for backend/shared during review.

## Open Questions / Assumptions

1. Is the intended source-of-truth style for docs current runtime state or target architecture state? Right now several docs mix both without explicit labeling.
2. Should auth-token IP limiting fail closed when proxy headers are missing, or should unknown-client-ip behavior be relaxed for local or dev proxies?
3. Should the step workboards remain historical taskboards, or be kept synced as current status artifacts?

## Verification Performed

1. Reviewed middleware, routes, services, shared contracts, migrations, and tests across backend and shared surfaces.
2. Cross-checked Step 0, Step 1, and Step 2 docs against architecture docs and testing notes.
3. Ran workspace diagnostics queries for backend and shared contracts; no immediate compile or lint diagnostics were reported.
4. Did not execute runtime tests in this pass, so behavior assertions come from static code and test inspection.

## Residual Risk And Next Steps

1. Fix the daily quota TTL self-heal gap in [backend/src/services/rateLimit.ts](../../../backend/src/services/rateLimit.ts#L224) and add a regression test that simulates `incr` success plus `expireat` failure.
2. Reconcile contract docs first in [docs/CLAUSE_PIPELINE.md](../../CLAUSE_PIPELINE.md#L168), [docs/UX_FLOW.md](../../UX_FLOW.md#L11), [docs/BACKEND_API.md](../../BACKEND_API.md#L114), and [docs/EXTENSION.md](../../EXTENSION.md#L33).
3. Add explicit doc labels such as Current Implementation and Target State to reduce ambiguity.
4. If needed, follow up with a direct patch pass to apply the code and documentation fixes in one reviewable change set.
