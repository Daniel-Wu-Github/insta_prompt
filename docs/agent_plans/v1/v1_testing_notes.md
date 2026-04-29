# V1 Testing Notes

## Extension Popup In WSL

WXT can build the extension dev bundle, but when the repo is running in WSL it will not open a browser automatically.

To open the popup manually:

1. Run `cd extension && npm run dev`.
2. Open Chrome or Edge on the host system.
3. Go to `chrome://extensions`.
4. Turn on Developer mode.
5. Click Load unpacked.
6. Select the built extension folder: `extension/.output/chrome-mv3-dev`.
7. Pin the PromptCompiler extension if needed, then click its toolbar icon to open the popup.

Do not use `http://localhost:3001` as the popup URL. That address is the WXT dev server, not the popup itself.

## Step 0 Bind Stream Caveat

The bind stream currently splits on words and preserves trailing spaces by design in the stub. That is fine for Step 0, but it is not final production formatting.

Current runtime notes for manual Step 0 probes on main:

1. `/enhance` accepts nullable `project_id`; use `project_id: null` when no project context exists.
2. Protected route probes (`/segment`, `/enhance`, `/bind`) run through the active middleware stack, so authenticated free-tier calls include `X-RateLimit-*` headers.

## Step 1 Manual Testing Guide (Data Layer and Auth Foundation)

Use this guide to validate Step 1 end-to-end with real local Supabase services.

Current main-branch note: Step 1 auth and protected-route checks run through the shared rate-limit layer, so keep local Redis running and export `REDIS_URL` during Step 1 verification.

### What This Covers

1. Local Supabase harness health.
2. Step 1 migrations and required schema invariants.
3. Auth and token behavior checks (sunny and rainy paths).
4. RLS ownership isolation checks through integration tests.

### Terminal Setup

1. Terminal A: repo root for Supabase commands.
2. Terminal B: backend folder for env export and test runs.

### Test 1.1 - Preflight

How to run: run from the repo root before touching Supabase or backend tests.

```bash
cd /root/insta_prompt
docker --version
docker compose version
bun --version
npx supabase --version
```

Sunny day expected:

1. All commands print a version.
2. No command-not-found errors.

Rainy day expected:

1. Missing Docker or Bun causes command-not-found or version errors.
2. Fix by installing the missing dependency, then rerun preflight.

### Test 1.2 - Start and Reset Local Supabase

How to run: execute in Terminal A. This gives you a clean local state, healthy Redis, and reapplies Step 1 migrations.

```bash
cd /root/insta_prompt
docker compose up -d redis
docker compose ps redis
npx supabase start
npx supabase db reset --yes --no-seed
```

Sunny day expected:

1. `docker compose ps redis` shows `redis` as Up (healthy).
2. Supabase starts and prints local URLs.
3. Reset applies migrations `0001_step1_profiles_and_history.sql`, `0002_step1_projects_and_context.sql`, and `0003_step1_rls.sql`.
4. Notices like trigger missing on first apply or vector already exists are acceptable.

Rainy day expected:

1. If Docker is not running, Redis and Supabase start fail.
2. If Supabase containers are stale, status/reset commands can fail with container health errors.
3. If Redis is down, current-branch Step 1 auth checks can return `503` instead of expected auth/validation envelopes.
4. Recovery command sequence:

```bash
cd /root/insta_prompt
docker compose up -d redis
npx supabase stop
npx supabase start
npx supabase db reset --yes --no-seed
```

### Test 1.3 - Export Local Env Vars For Integration Tests

How to run: execute in Terminal B before `bun test`. Repeat this in every new shell session.

```bash
cd /root/insta_prompt/backend
set -a
STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')"
if [ -z "$STATUS_ENV" ]; then
	echo "Supabase env export failed. Start Supabase and rerun this block." >&2
	return 1 2>/dev/null || exit 1
fi
eval "$STATUS_ENV"
export SUPABASE_URL="$API_URL"
export REDIS_URL="redis://127.0.0.1:6379"
set +a
env | grep -E '^(SUPABASE_URL|REDIS_URL)='
```

OR USE ONE LINER:

```bash
cd /root/insta_prompt/backend && set -a && STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')" && [ -n "$STATUS_ENV" ] && eval "$STATUS_ENV" && export SUPABASE_URL="$API_URL" REDIS_URL="redis://127.0.0.1:6379" && set +a && env | grep -E '^(SUPABASE_URL|REDIS_URL)='
```

Before running this block, source your local helper outside the repo so any additional Supabase values are already available to the shell.

Sunny day expected:

1. Env print shows non-empty values for `SUPABASE_URL` and `REDIS_URL`.
2. No command errors during `status`/`eval`, and the guard does not trigger.

Rainy day expected:

1. If Supabase is not running, `npx supabase status -o env` fails with container-health errors and the block exits before `eval`/export.
2. If Redis is down, env export can still succeed but Step 1 auth/protected-route checks can return `503`.
3. Recovery: start Supabase and Redis first, then rerun this export block.

### Test 1.4 - Verify Schema Invariants Manually

How to run: execute in Terminal A after reset.

```bash
cd /root/insta_prompt
npx supabase db query "select extname from pg_extension where extname = 'vector';" -o table --agent=no
npx supabase db query "select proname, prosecdef from pg_proc where proname = 'handle_new_user';" -o table --agent=no
npx supabase db query "select tgname from pg_trigger where tgname = 'on_auth_user_created';" -o table --agent=no
npx supabase db query "select tablename, count(*) as policy_count from pg_policies where schemaname = 'public' and tablename in ('profiles','enhancement_history','projects','context_chunks') group by tablename order by tablename;" -o table --agent=no
```

Sunny day expected:

1. `vector` extension row exists.
2. `handle_new_user` exists with `prosecdef = true`.
3. Trigger `on_auth_user_created` exists.
4. RLS policy counts are:
	- `profiles`: 3
	- `enhancement_history`: 4
	- `projects`: 4
	- `context_chunks`: 4

Rainy day expected:

1. Missing trigger/function/extension rows indicate migration drift or partial reset.
2. Wrong policy counts indicate RLS migration drift.
3. Recovery: rerun `npx supabase db reset --yes --no-seed` and repeat checks.

### Test 1.5 - Run Auth and RLS Test Matrix

How to run: execute in Terminal B after env export.

```bash
cd /root/insta_prompt/backend
REQUIRE_INTEGRATION_ENV=1 bun test src/__tests__/auth.integration.test.ts src/__tests__/routes.validation.test.ts
```

Sunny day expected:

1. Targeted Step 1 suites pass with `0 fail` (exact pass count may change as tests are added).
2. Integration tests confirm:
	- profile bootstrap trigger creates a `free` profile row.
	- protected routes return deterministic 401 for missing/invalid/expired tokens.
	- valid Supabase JWT can access protected route.
	- `/auth/token` rejects malformed JSON, missing refresh token, and invalid refresh token.
	- `/auth/token` success path returns verified token context.
	- cross-user RLS isolation works for `profiles` and `enhancement_history`.

Rainy day expected:

1. If integration env vars are missing from the shell, the run fails fast with an explicit missing-env error (no silent skip).
2. If expected auth/validation envelopes are replaced by `503`, Redis is down or `REDIS_URL` is missing.
3. If test run errors before execution, local Supabase is likely down.
4. If RLS/auth assertions fail, run DB reset, ensure Redis is up, rerun env export, then rerun this matrix.

### Test 1.6 - Studio Bootstrap Verification

How to run: manual verification that the auth.users trigger actually fires in real Supabase.

1. Open http://127.0.0.1:54323 (Supabase Studio) in your browser.
2. Click **Auth** in the left sidebar, then **Users**.
3. Click **Add User**.
4. Enter email (e.g., `verify-test@example.com`) and a password; click **Create User**.
5. Navigate to **SQL Editor** or **Table Editor**.
6. Open the `profiles` table.
7. Verify a new row exists with the same `id` as the user you created and `tier` set to `'free'`.

Sunny day expected:

1. New row appears in `profiles` table immediately after user creation.
2. `id` matches the Supabase user ID.
3. `tier` is explicitly `'free'`.
4. `created_at` is populated with the current timestamp.

Rainy day expected:

1. No new row appears in `profiles` (trigger failed to fire).
2. Row exists but `tier` is NULL or not `'free'`.
3. Recovery: run `npx supabase db reset --yes --no-seed` to reapply the trigger, then try again.

### Test 1.7 - Manual cURL Check for /auth/token

How to run: start the backend server and make a raw HTTP request to verify request validation works end-to-end.

**Terminal B1** (start the server):

```bash
cd /root/insta_prompt/backend
set -a
STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')"
if [ -z "$STATUS_ENV" ]; then
	echo "Supabase env export failed. Start Supabase and rerun this block." >&2
	return 1 2>/dev/null || exit 1
fi
eval "$STATUS_ENV"
export SUPABASE_URL="$API_URL"
export REDIS_URL="redis://127.0.0.1:6379"
set +a
bun run src/index.ts
```

Wait for output like `Server listening on http://0.0.0.0:3000` (or check the configured PORT).

**Terminal B2** (in a new terminal, test the endpoint):

```bash
curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": ""}'
```

Sunny day expected:

1. Server starts without errors and listens on port 3000.
2. cURL returns a 400 Bad Request response.
3. Response body includes error details indicating validation failure (missing or empty `refresh_token`).
4. The route checks IP quota first, then validation fails before any Supabase refresh call.

Rainy day expected:

1. Backend server fails to start (missing dependencies, broken TypeScript, etc.).
2. cURL fails to connect (server not running on port 3000).
3. If Redis is unavailable, cURL can return `503` (or timeout in current fail-slow Redis retry behavior) before validation.
4. cURL succeeds but server returns 200 (validation not enforced, or placeholder route exists).
5. Recovery: 
   - If server won't start: run `cd backend && npm install` then `bun run src/index.ts`
   - If cURL fails: ensure Terminal B1 is still running the server with no errors
	- If Redis is down: run `cd /root/insta_prompt && docker compose up -d redis`
	- If validation is missing: check `backend/src/routes/auth.ts` and `backend/src/lib/validation.ts` for refresh_token schema

### Test 1.8 (Optional) - Rainy Day Drill

How to run: this intentionally creates a failure mode so you can practice recovery.

```bash
cd /root/insta_prompt
npx supabase stop
```

Then rerun the env export block in Terminal B.

Rainy drill expected:

1. `npx supabase status -o env` fails while Supabase is stopped.
2. Env export guard stops the block before `eval`/export on failure.
3. Recovery:

```bash
cd /root/insta_prompt
npx supabase start
docker compose up -d redis
```

Then rerun env export and:

```bash
cd /root/insta_prompt/backend
bun test src/__tests__/auth.integration.test.ts src/__tests__/routes.validation.test.ts
```

## Step 1 Personal Notes

Use this section to log your own observations while running the guide:
- Date: 2026-04-15
- Sunny path result: Passed with Redis up and `REDIS_URL` exported (preflight, reset, env export, schema checks, auth matrix, cURL validation).
- Rainy path result: Supabase stop drill reproduced expected env-export failure and recovery path.
- Bugs found: Step 1 auth/protected-route checks are currently coupled to local Redis availability on main.

## Step 2 Manual Testing Guide (Rate Limiting and Tier Enforcement)

Use this guide to validate Step 2 end-to-end with real local Supabase and Redis services.

### What This Covers

1. Local Supabase + Redis harness health.
2. Step 2 middleware and route-wiring enforcement invariants.
3. Protected-route free-tier quota boundary checks (sunny and rainy paths).
4. Public `/auth/token` IP abuse-protection checks (sunny and rainy paths).
5. Deterministic `429`/`403`/`503` envelope, header behavior, and fast-fail Redis outage handling through integration tests.

### Terminal Setup

1. Terminal A: repo root for Docker Compose and Supabase commands.
2. Terminal B: backend folder for env export and test runs.
3. Terminal C: backend folder for manual server and cURL checks.

### Test 2.1 - Preflight

How to run: run from repo root before touching Redis, Supabase, or backend tests.

```bash
cd /root/insta_prompt
docker --version
docker compose version
bun --version
npx supabase --version
```

Sunny day expected:

1. All commands print a version.
2. No command-not-found errors.

Rainy day expected:

1. Missing Docker, Bun, or the Supabase CLI causes command-not-found or version errors.
2. Fix the missing dependency, then rerun preflight.

### Test 2.2 - Start Redis and Reset Local Supabase

How to run: execute in Terminal A. This gives you a clean Supabase state and healthy local Redis.

```bash
cd /root/insta_prompt
docker compose up -d redis
docker compose ps redis
npx supabase start
npx supabase db reset --yes --no-seed
```

Sunny day expected:

1. `docker compose ps redis` shows the `redis` service as Up (healthy).
2. Supabase starts and prints local URLs.
3. Reset reapplies migrations `0001_step1_profiles_and_history.sql`, `0002_step1_projects_and_context.sql`, and `0003_step1_rls.sql`.
4. Notices like trigger missing on first apply or vector already exists are acceptable.

Rainy day expected:

1. If Docker is not running, Redis and Supabase start fail.
2. If Supabase containers are stale, status/reset commands can fail with container health errors.
3. Recovery command sequence:

```bash
cd /root/insta_prompt
docker compose down
docker compose up -d redis
npx supabase stop
npx supabase start
npx supabase db reset --yes --no-seed
```

### Test 2.3 - Export Local Env Vars For Integration Tests

How to run: execute in Terminal B before `bun test`. Repeat this in every new shell session.

```bash
cd /root/insta_prompt/backend
set -a
STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')"
eval "$STATUS_ENV"
export SUPABASE_URL="$API_URL"
export REDIS_URL="redis://127.0.0.1:6379"
set +a
env | grep -E '^(SUPABASE_URL|REDIS_URL)='
```

OR USE ONE LINER:

```bash
cd /root/insta_prompt/backend && set -a && STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')" && eval "$STATUS_ENV" && export SUPABASE_URL="$API_URL" REDIS_URL="redis://127.0.0.1:6379" && set +a && env | grep -E '^(SUPABASE_URL|REDIS_URL)='
```

Sunny day expected:

1. Env print shows non-empty values for `SUPABASE_URL` and `REDIS_URL`.
2. No command errors during `status`/`eval`.

Rainy day expected:

1. If Supabase is not running, `npx supabase status -o env` can fail with container errors.
2. If Redis is down, env export can still succeed but Step 2 integration tests will fail or return `503` envelopes.
3. Recovery: start Supabase and Redis first, then rerun this export block.

### Test 2.4 - Verify Enforcement Invariants Manually

How to run: execute in Terminal A after setup/reset.

```bash
cd /root/insta_prompt
docker exec promptcompiler-redis redis-cli ping
grep -e "FREE_DAILY_LIMIT" -e "AUTH_TOKEN_IP_LIMIT" -e "rate:daily:" -e "rate:auth-token-ip:" backend/src/services/rateLimit.ts
grep -e "authMiddleware, rateLimitMiddleware, tierMiddleware" backend/src/index.ts
grep -e 'PROTECTED_ROUTE_PREFIXES = \["/segment", "/enhance", "/bind", "/projects"\]' backend/src/index.ts
grep -e "fly-client-ip" -e "x-forwarded-for" -e "Retry-After" backend/src/routes/auth.ts
```

Sunny day expected:

1. Redis ping returns `PONG`.
2. `rateLimit.ts` shows free-tier limit `30`, `/auth/token` IP limit `20`, and both Redis key prefixes.
3. `index.ts` shows protected route middleware order as auth -> ratelimit -> tier.
4. `index.ts` route prefixes include `/segment`, `/enhance`, `/bind`, and `/projects`.
5. `auth.ts` shows trusted proxy IP extraction (`fly-client-ip`, fallback `x-forwarded-for`) and `Retry-After` on throttled responses.

Rainy day expected:

1. Redis ping fails if the container is down.
2. Missing constants or middleware-order lines indicate implementation drift.
3. Recovery: restart Redis/Supabase and rerun this check block.

### Test 2.5 - Run Rate/Tier/Auth-Token Test Matrix

How to run: execute in Terminal B after env export.

```bash
cd /root/insta_prompt/backend
npm run test:integration
bun test
```

Sunny day expected:

1. Step 2 suite pass summary reports `0 fail` (exact pass count may change as tests are added).
2. Integration tests confirm:
	- free-tier protected-route boundary is deterministic at requests `29 -> 30 -> 31`.
	- concurrent near-boundary protected requests stay deterministic.
	- strict gated policy returns deterministic `403` `TIER_FORBIDDEN`.
	- successful `/auth/token` responses do not include `X-RateLimit-*` headers.
	- over-limit `/auth/token` IP bursts return deterministic `429` with `Retry-After`.
	- Redis failure path returns deterministic `503` `RATE_LIMIT_UNAVAILABLE`.
	- hanging Redis quota calls on both protected routes and `/auth/token` return deterministic `503` within a bounded window.
3. A `Rate limit Redis call failed ... forced redis failure` log line is expected during the intentional Redis-failure integration test.

Rainy day expected:

1. If integration env vars are missing from the shell, `npm run test:integration` fails fast with an explicit missing-env error (no silent skip).
2. If rate-limit integration fails early, Redis is likely down or `REDIS_URL` is missing/incorrect.
3. If envelope/header assertions fail, Step 2 middleware behavior may have drifted.
4. Recovery: restore Redis + Supabase, rerun env export, then rerun `bun test`.

### Test 2.6 - Manual cURL Check for Protected `/segment` Daily Free-Tier Cap

How to run: start backend server, mint a disposable free-tier user token, send repeated protected-route calls, and check the Redis TTL after request 30.

**Terminal C1** (start the server):

```bash
cd /root/insta_prompt/backend
set -a
STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')"
eval "$STATUS_ENV"
export SUPABASE_URL="$API_URL"
export REDIS_URL="redis://127.0.0.1:6379"
set +a
bun run src/index.ts
```

Wait for output like `Started development server: http://localhost:3000`.

**Terminal C2** (in a new terminal, run the manual boundary check):

```bash
cd /root/insta_prompt/backend
set -a
STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')"
eval "$STATUS_ENV"
export SUPABASE_URL="$API_URL"
set +a

Before running the curl loop, export `LOCAL_ACCESS_VALUE`, `LOCAL_REFRESH_VALUE`, and `LOCAL_USER_ID` from a local helper or a shell session outside the repo. The token-minting one-liner is intentionally left out of the checked-in guide so secrets stay local.

for i in $(seq 1 30); do
	code=$(curl -s -o /tmp/step2_segment_$i.json -w "%{http_code}" \
		-X POST http://localhost:3000/segment \
		-H "Authorization: Bearer $LOCAL_ACCESS_VALUE" \
		-H "Content-Type: application/json" \
		-d '{"segments":["build feature"],"mode":"balanced"}')
	echo "segment_request_$i=$code"
done

docker exec promptcompiler-redis redis-cli TTL "rate:daily:$LOCAL_USER_ID"

curl -i -X POST http://localhost:3000/segment \
	-H "Authorization: Bearer $LOCAL_ACCESS_VALUE" \
	-H "Content-Type: application/json" \
	-d '{"segments":["build feature"],"mode":"balanced"}'
```

Sunny day expected:

1. Requests `1..30` return `200`.
2. The Redis TTL command returns a positive integer that roughly matches the seconds until the next UTC midnight.
3. Request `31` returns `429`.
4. The throttled response body includes `RATE_LIMIT_EXCEEDED`.
5. Throttled response headers include `X-RateLimit-Limit: 30`, `X-RateLimit-Remaining: 0`, and a future epoch in `X-RateLimit-Reset`.

Rainy day expected:

1. `401` from the first request indicates missing/invalid bearer token setup.
2. `503` indicates Redis is unavailable.
3. A negative TTL value such as `-1` or `-2` indicates the key expiration is wrong or missing.
4. `200` beyond request `31` indicates quota bypass or middleware wiring drift.
5. Recovery:
	 - Ensure Terminal C1 is still running with `REDIS_URL` set
	 - Rerun env export and token mint commands in Terminal C2
	 - Check `backend/src/index.ts`, `backend/src/middleware/ratelimit.ts`, and `backend/src/services/rateLimit.ts`

### Test 2.7 (Optional) - Race Condition Check for Atomic Quota Increments

How to run: rerun the token mint block above to create a fresh free-tier user, warm the user to request 29, then fire a small burst of concurrent requests.

```bash
for i in $(seq 1 29); do
	curl -s -o /tmp/step2_segment_race_warm_$i.json -w "warmup_$i=%{http_code}\n" \
		-X POST http://localhost:3000/segment \
		-H "Authorization: Bearer $LOCAL_ACCESS_VALUE" \
		-H "Content-Type: application/json" \
		-d '{"segments":["build feature"],"mode":"balanced"}'
done

for i in $(seq 1 5); do
	curl -s -o /tmp/step2_segment_race_$i.json -w "burst_$i=%{http_code}\n" \
		-X POST http://localhost:3000/segment \
		-H "Authorization: Bearer $LOCAL_ACCESS_VALUE" \
		-H "Content-Type: application/json" \
		-d '{"segments":["build feature"],"mode":"balanced"}' &
done
wait
```

Sunny day expected:

1. The warm-up requests `1..29` return `200`.
2. The concurrent burst produces exactly one `200` and four `429` responses.
3. More than one `200` in the burst indicates the rate-limit increment is not atomic.

### Test 2.8 - Manual cURL Check for Public `/auth/token` IP Limiter and Header Policy

How to run: reuse `LOCAL_REFRESH_VALUE` from Terminal C2, then validate both success path and burst-throttle path.

```bash
curl -i -X POST http://localhost:3000/auth/token \
	-H "Content-Type: application/json" \
	-H "fly-client-ip: 198.51.100.200" \
	-d "{\"refresh_token\":\"$LOCAL_REFRESH_VALUE\"}"

for i in $(seq 1 21); do
	code=$(curl -s -o /tmp/step2_auth_burst_$i.json -w "%{http_code}" \
		-X POST http://localhost:3000/auth/token \
		-H "Content-Type: application/json" \
		-H "fly-client-ip: 198.51.100.201" \
		-d '{"refresh_token":"not-a-real-refresh-token"}')
	echo "auth_token_burst_$i=$code"
done

curl -i -X POST http://localhost:3000/auth/token \
	-H "Content-Type: application/json" \
	-H "fly-client-ip: 198.51.100.201" \
	-d '{"refresh_token":"not-a-real-refresh-token"}'
```

Sunny day expected:

1. The first request returns `200` and does not include `X-RateLimit-*` headers.
2. Burst requests `1..20` return `401` (invalid refresh token) for the same IP.
3. Burst request `21` returns `429` for the same IP.
4. The throttled response includes `Retry-After` and `RATE_LIMIT_EXCEEDED`.
5. The throttled `/auth/token` response does not include `X-RateLimit-*` headers.

Rainy day expected:

1. If success-path `200` includes `X-RateLimit-*`, header policy drift exists.
2. If request `21` is not `429`, IP throttle behavior is missing or regressed.
3. If all requests return `503`, Redis is unavailable.
4. Recovery:
	 - Restart Redis and rerun the same burst test
	 - Re-check trusted IP extraction and throttle handling in `backend/src/routes/auth.ts`
	 - Re-check limiter logic in `backend/src/services/rateLimit.ts`

### Test 2.9 (Optional) - Rainy Day Drill

How to run: intentionally stop Redis to validate deterministic unavailable behavior.

```bash
cd /root/insta_prompt
docker compose stop redis
```

Then (from Terminal C2) run one protected route request and one `/auth/token` request:

```bash
curl -i -m 10 -X POST http://localhost:3000/segment \
	-H "Authorization: Bearer $LOCAL_ACCESS_VALUE" \
	-H "Content-Type: application/json" \
	-d '{"segments":["build feature"],"mode":"balanced"}'

curl -i -m 10 -X POST http://localhost:3000/auth/token \
	-H "Content-Type: application/json" \
	-H "fly-client-ip: 198.51.100.250" \
	-d '{"refresh_token":"not-a-real-refresh-token"}'
```

Rainy drill expected:

1. Both routes return deterministic `503` with `RATE_LIMIT_UNAVAILABLE` while Redis is stopped.
2. Both responses fail fast rather than hanging (with default settings, usually within about 5 seconds).
3. If either cURL command hits timeout (`curl: (28)`), treat that as a regression.
4. Recovery:

```bash
cd /root/insta_prompt
docker compose up -d redis
```

Then rerun env export and `bun test`.

## Step 2 Personal Notes

Use this section to log your own observations while running the guide:
- Date: 2026-04-15
- Sunny path result: Passed end-to-end (preflight, Redis + Supabase setup/reset, env export, invariant checks, `bun test`, manual `/segment` boundary + TTL, optional race burst, manual `/auth/token` limiter).
- Rainy path result: Passed stop-Redis drill; both `/segment` and `/auth/token` returned fast deterministic `503 RATE_LIMIT_UNAVAILABLE` with no cURL timeout.
- Bugs found: None

## Step 3 Manual Testing Guide (LLM Service and Prompt Template System)

Use this guide to validate Step 3 service-layer behavior end-to-end with deterministic local tests and CLI probes.

### What This Covers

1. Backend Step 3 preflight for deterministic local testing.
2. Model-router matrix, BYOK injection, and mode-token invariants.
3. Prompt-factory, sibling-context, and canonical bind-order invariants.
4. Provider adapter retry/backoff, object-shaped stream events, and normalized-error invariants.
5. Step 3 unit matrix for router, prompt factories, provider adapters, and handoff helpers.
6. Manual CLI probes for sunny and rainy Step 3 service behavior.
7. Route-leakage guards that keep Step 4-6 business logic out of `backend/src/routes/*.ts`.

### Terminal Setup

1. Terminal A: backend folder for source checks and Step 3 unit tests.
2. Terminal B: backend folder for optional CLI probes and rainy-day drills.

### Test 3.1 - Preflight

How to run: run from the backend folder before Step 3 checks.

```bash
cd /root/insta_prompt/backend
bun --version
node --version
npm --version
```

Sunny day expected:

1. All commands print a version.
2. No command-not-found errors.

Rainy day expected:

1. Missing Bun/Node/npm causes command-not-found or version errors.
2. Fix missing dependencies, then rerun preflight.

### Test 3.2 - Verify Router, Mode-Budget, and Route-Leakage Invariants Manually

How to run: execute from repo root and confirm the deterministic route matrix constants plus thin route wrappers.

```bash
cd /root/insta_prompt
grep -e "MODE_TOKEN_BUDGETS" -e "efficiency: 150" -e "balanced: 500" -e "detailed: 1000" backend/src/services/llm.ts
grep -e "SEGMENT_CLASSIFIER_MODEL" -e "llama-3.1-8b-instant" backend/src/services/llm.ts
grep -e "FREE_GENERATION_MODEL" -e "llama-3.3-70b-versatile" backend/src/services/llm.ts
grep -e "PRO_GENERATION_MODELS" -e "claude-haiku-4-5-20251001" -e "claude-sonnet-4-6" backend/src/services/llm.ts
grep -e "resolveByokProvider" -e "resolveByokModel" -e "byok-config-missing" backend/src/services/llm.ts
if grep -n -E 'readJsonBody|parseWithSchema|streamFromEvents|fetchProjectContext|selectModel|prepareEnhanceServiceHandoff|prepareBindServiceHandoff' backend/src/routes/segment.ts backend/src/routes/enhance.ts backend/src/routes/bind.ts; then
	echo "Route leakage found"
else
	echo "Route files stay thin"
fi
```

Sunny day expected:

1. Mode token budgets are explicitly `150 / 500 / 1000`.
2. Segment model is pinned to Groq `llama-3.1-8b-instant`.
3. Free generation model is Groq `llama-3.3-70b-versatile`.
4. Pro generation models include Anthropic `claude-haiku-4-5-20251001` and `claude-sonnet-4-6`.
5. BYOK resolver helpers and deterministic missing-config fallback are present.
6. Route leakage trap prints `Route files stay thin` and no route wrapper contains business-logic keywords.

Rainy day expected:

1. Missing constants or model IDs indicate router drift.
2. If the leakage trap prints matches, route business logic leaked too early into `backend/src/routes/*.ts`; move it back into services and rerun Test 3.5.
3. Recovery: re-check `backend/src/services/llm.ts` against `backend/src/__tests__/llm.router.test.ts` and rerun Test 3.5.

### Test 3.3 - Verify Prompt Factory and Canonical Bind Invariants Manually

How to run: execute from repo root and confirm prompt-factory coverage and canonical bind behavior.

```bash
cd /root/insta_prompt
grep -e "goalPromptFactories" -e "context:" -e "tech_stack:" -e "constraint:" -e "action:" -e "output_format:" -e "edge_case:" backend/src/services/prompts/index.ts
grep -e "CANONICAL_BIND_SLOT_ORDER" -e "context" -e "tech_stack" -e "constraint" -e "action" -e "output_format" -e "edge_case" backend/src/services/prompts/bind.ts
grep -e "SIBLING_CONTEXT_LIMITS" -e "MAX_SIBLINGS: 5" -e "MAX_TEXT_CHARS_PER_SIBLING: 180" -e "MAX_TOTAL_SERIALIZED_CHARS: 700" backend/src/services/prompts/siblings.ts
```

Sunny day expected:

1. All six goal-type factories are present in `goalPromptFactories`.
2. Bind module encodes canonical order `context -> tech_stack -> constraint -> action -> output_format -> edge_case`.
3. Sibling-context limits show deterministic caps (`5`, `180`, `700`).

Rainy day expected:

1. Missing goal-type factory or canonical order entry indicates prompt-surface drift.
2. Missing sibling caps indicates unbounded prompt-growth risk.
3. Recovery: align `backend/src/services/prompts/**` with `backend/src/__tests__/prompt.factories.test.ts` and rerun Test 3.5.

### Test 3.4 - Verify Provider Adapter Retry and Error Invariants Manually

How to run: execute from repo root and confirm shared retry policy and normalized error mapping.

```bash
cd /root/insta_prompt
grep -e "maxAttempts: 3" -e "initialDelayMs: 100" -e "backoffMultiplier: 2" -e "maxDelayMs: 5000" backend/src/services/providers/retry.ts
grep -e "DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 30_000" -e "retryWithBackoff" backend/src/services/providers/http.ts
grep -e "PROVIDER_RATE_LIMITED" -e "PROVIDER_BAD_GATEWAY" -e "PROVIDER_UNAVAILABLE" -e "PROVIDER_GATEWAY_TIMEOUT" -e "PROVIDER_BAD_REQUEST" -e "PROVIDER_UNAUTHORIZED" -e "PROVIDER_FORBIDDEN" -e "PROVIDER_NOT_FOUND" -e "PROVIDER_INTERNAL_ERROR" backend/src/services/providers/errors.ts
```

Sunny day expected:

1. Retry policy is `3` attempts with `100ms` initial delay and exponential backoff capped at `5000ms`.
2. Provider request timeout default is `30000ms`.
3. Retryable and non-retryable normalized error codes are both explicitly mapped.

Rainy day expected:

1. Missing retry constants or error-code mappings indicates adapter-policy drift.
2. Recovery: align `backend/src/services/providers/**` with `backend/src/__tests__/provider.adapters.test.ts` and rerun Test 3.5.

### Test 3.5 - Run Step 3 Unit Test Matrix

How to run: execute from backend folder. This matrix is network-isolated and does not require live provider calls.

```bash
cd /root/insta_prompt/backend
bun test src/__tests__/llm.router.test.ts src/__tests__/prompt.factories.test.ts src/__tests__/provider.adapters.test.ts src/__tests__/llm.handoff.test.ts
```

Sunny day expected:

1. Step 3 suite reports `0 fail` (current baseline on main: `30 pass`, `0 fail`).
2. Router tests confirm deterministic `callType x tier x mode` selection and BYOK fallback behavior.
3. Prompt tests confirm deterministic goal templates, sibling-context behavior, and canonical bind ordering.
4. Provider tests confirm normalized `token | done | error` events, transient retry behavior, and deterministic error mapping.
5. Handoff tests confirm deterministic enhance/bind helper assembly.

Rainy day expected:

1. Any failing suite indicates Step 3 contract drift.
2. Recovery: fix the failing service area first, then rerun this matrix before proceeding to manual probes.

### Test 3.6 - Manual CLI Probe for Step 3 Handoff Helpers

How to run: execute from backend folder to manually verify router and handoff outputs. This also proves the router honors an injected BYOK config object instead of inferring BYOK state from the database.

```bash
cd /root/insta_prompt/backend
bun -e 'import { selectModel, prepareEnhanceServiceHandoff, prepareBindServiceHandoff } from "./src/services/llm.ts"; const segmentModel = selectModel({ callType: "segment", tier: "pro", mode: "detailed" }); const byok = selectModel({ callType: "enhance", tier: "byok", mode: "detailed", byokConfig: { preferredProvider: "openai", preferredModel: "gpt-4o" } }); const enhance = prepareEnhanceServiceHandoff({ route: { callType: "enhance", tier: "pro", mode: "efficiency" }, template: { goalType: "action", sectionText: "Build keyboard-accessible dark mode toggle.", mode: "efficiency", siblings: [{ id: "s2", goal_type: "tech_stack", text: "Use React and TypeScript." }] } }); const bind = prepareBindServiceHandoff({ route: { callType: "bind", tier: "free", mode: "balanced" }, template: { mode: "balanced", sections: [{ canonical_order: 6, goal_type: "edge_case", expansion: "Handle empty state." }, { canonical_order: 1, goal_type: "context", expansion: "Internal admin dashboard." }] } }); console.log("segment_model", JSON.stringify(segmentModel)); console.log("byok_model", JSON.stringify(byok)); console.log("enhance_model", JSON.stringify(enhance.model)); console.log("enhance_has_goal", enhance.prompt.includes("Goal type: action")); console.log("bind_order", bind.canonicalSections.map((s) => s.goal_type).join(",")); console.log("bind_has_canonical_line", bind.prompt.includes("Canonical slot order (must be enforced exactly):"));'
```

Sunny day expected:

1. `segment_model` prints Groq `llama-3.1-8b-instant` with `maxTokens: 500`.
2. `byok_model` prints OpenAI `gpt-4o` with `maxTokens: 1000`, proving the injected BYOK config is honored.
3. `enhance_model` prints Anthropic `claude-haiku-4-5-20251001` with `maxTokens: 150`.
4. `enhance_has_goal` prints `true`.
5. `bind_order` prints `context,edge_case`.
6. `bind_has_canonical_line` prints `true`.

Rainy day expected:

1. Import/runtime failures indicate service-export or typing drift.
2. A missing or mismatched `byok_model` output means the router is not honoring injected BYOK preferences.
3. Output mismatches in the other values indicate router or handoff assembly drift.
4. Recovery: run Test 3.5, then inspect `backend/src/services/llm.ts` and `backend/src/services/prompts/**`.

### Test 3.7 (Optional) - Adapter Object Shape and Failure Drills

How to run: execute from backend folder to validate deterministic adapter output shape and failure behavior without live provider traffic.

1. Sunny-day object-shape drill:

```bash
cd /root/insta_prompt/backend
bun -e 'import { createGroqStreamingAdapter } from "./src/services/providers/index.ts"; const body = `data: {"choices":[{"delta":{"content":"Hello"}}]}

data: [DONE]

`; const adapter = createGroqStreamingAdapter({ fetchFn: async () => new Response(body, { headers: { "Content-Type": "text/event-stream" } }), sleepFn: async () => {} }); for await (const event of adapter.stream({ model: "llama-3.3-70b-versatile", userPrompt: "hello", maxTokens: 32, apiKey: "test-key" })) { console.log("is_object", typeof event === "object" && event !== null); console.log("has_type", "type" in event); if (event.type === "done") break; }'
```

Sunny day expected:

1. `is_object` prints `true` for each yielded event.
2. `has_type` prints `true` for each yielded event.
3. If either check prints `false`, the adapter is not yielding JavaScript objects and Step 5 transport will break.

2. Missing-key drill:

```bash
cd /root/insta_prompt/backend
bun -e 'import { createGroqStreamingAdapter } from "./src/services/providers/index.ts"; const adapter = createGroqStreamingAdapter(); const stream = adapter.stream({ model: "llama-3.3-70b-versatile", userPrompt: "hello", maxTokens: 32, apiKey: "" }); for await (const event of stream) { console.log(JSON.stringify(event)); break; }'
```

3. Retry-exhaustion drill:

```bash
cd /root/insta_prompt/backend
bun -e 'import { createAnthropicStreamingAdapter } from "./src/services/providers/index.ts"; let calls = 0; const adapter = createAnthropicStreamingAdapter({ fetchFn: async () => { calls += 1; return new Response(JSON.stringify({ error: { message: "forced-503" } }), { status: 503, headers: { "Content-Type": "application/json" } }); }, sleepFn: async () => {} }); let finalEvent = null; for await (const event of adapter.stream({ model: "claude-sonnet-4-6", userPrompt: "hello", maxTokens: 16, apiKey: "test-key" })) { finalEvent = event; } console.log("attempts", calls); console.log("final", JSON.stringify(finalEvent));'
```

Sunny day expected:

1. Missing-key drill emits one error event with `code: PROVIDER_KEY_MISSING` and `retryable: false`.
2. Retry-exhaustion drill prints `attempts 3`.
3. Retry-exhaustion final event is `PROVIDER_UNAVAILABLE` with `retryable: true` and `status: 503`.

Rainy day expected:

1. More/less than three attempts indicates retry-policy drift.
2. Missing or mismatched error fields indicates normalization drift.
3. Recovery: inspect `backend/src/services/providers/retry.ts`, `backend/src/services/providers/http.ts`, and `backend/src/services/providers/errors.ts`, then rerun Tests 3.4 and 3.5.

## Step 3 Personal Notes

Use this section to log your own observations while running the guide:
- Date: 2026-04-16
- Sunny path result: Step 3 unit matrix passed with 30 pass, 0 fail.
- Rainy path result: Groq missing-key returned PROVIDER_KEY_MISSING; Groq malformed stream returned PROVIDER_INVALID_RESPONSE; Anthropic forced 503 retried exactly 3 times and returned PROVIDER_UNAVAILABLE with status 503; BYOK missing config returned the safe fallback provider user / model byok-config-missing.
- Bugs found: None.

## Step 4 Manual Testing Guide (JSON Segment Classification)

Use this guide to validate Step 4 `/segment` classification behavior end-to-end with local Supabase and Redis services. It aligns with [BACKEND_API.md](../BACKEND_API.md), [CLAUSE_PIPELINE.md](../CLAUSE_PIPELINE.md), and the Step 4 taskboard [v1_step_4.md](v1_step_by_step/v1_step_4.md).

Current main-branch note: `/segment` still runs through auth, rate limit, and tier middleware before the classifier, so keep Redis running during live route checks.

### What This Covers

1. Local Supabase and Redis harness health.
2. `/segment` request validation and JSON-only transport.
3. Canonical goal-type normalization, stable IDs, confidence clamping, and dependency sanitization.
4. Deterministic fallback behavior for malformed or unavailable provider output.
5. Step 4 unit and route test matrix.
6. Manual cURL checks for both valid and rainy-path requests.
7. Route-leakage guards that keep Step 4 logic out of `backend/src/routes/*.ts`.

### Terminal Setup

1. Terminal A: repo root for Supabase and invariant checks.
2. Terminal B: backend folder for env export and test runs.
3. Terminal C: backend folder for the manual backend server and cURL probes.

### Test 4.1 - Preflight

How to run: run from the repo root before touching Supabase, Redis, or backend tests.

```bash
cd /root/insta_prompt
docker --version
docker compose version
bun --version
npx supabase --version
```

Sunny day expected:

1. All commands print a version.
2. No command-not-found errors.

Rainy day expected:

1. Missing Docker, Bun, or the Supabase CLI causes command-not-found or version errors.
2. Fix the missing dependency, then rerun preflight.

### Test 4.2 - Start and Reset Local Services

How to run: execute in Terminal A. This gives you a clean Supabase state and healthy local Redis.

```bash
cd /root/insta_prompt
docker compose up -d redis
docker compose ps redis
npx supabase start
npx supabase db reset --yes --no-seed
```

Sunny day expected:

1. `docker compose ps redis` shows `redis` as Up (healthy).
2. Supabase starts and prints local URLs.
3. Reset reapplies the local migrations needed for auth and protected routes.
4. Notices like trigger missing on first apply or vector already exists are acceptable.

Rainy day expected:

1. If Docker is not running, Redis and Supabase start fail.
2. If Supabase containers are stale, status/reset commands can fail with container health errors.
3. If Redis is down, protected `/segment` checks can return `503` instead of the expected auth/validation envelopes.
4. Recovery command sequence:

```bash
cd /root/insta_prompt
docker compose down
docker compose up -d redis
npx supabase stop
npx supabase start
npx supabase db reset --yes --no-seed
```

### Test 4.3 - Export Local Env Vars For Integration Tests

How to run: execute in Terminal B before `bun test`. Repeat this in every new shell session.

```bash
cd /root/insta_prompt/backend
set -a
STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')"
if [ -z "$STATUS_ENV" ]; then
	echo "Supabase env export failed. Start Supabase and rerun this block." >&2
	return 1 2>/dev/null || exit 1
fi
eval "$STATUS_ENV"
export SUPABASE_URL="$API_URL"
export REDIS_URL="redis://127.0.0.1:6379"
set +a
env | grep -E '^(SUPABASE_URL|REDIS_URL)='
```

Optional: export a local provider credential in this shell if you want to exercise the live classifier path instead of the deterministic fallback path.

Sunny day expected:

1. Env print shows non-empty values for `SUPABASE_URL` and `REDIS_URL`.
2. No command errors during `status`, `eval`, or export.

Rainy day expected:

1. If Supabase is not running, `npx supabase status -o env` fails with container-health errors and the block exits before `eval` or export.
2. If Redis is down, live `/segment` checks can return `503`.
3. If the local provider credential is missing, the live classifier path may fall back, but the response contract should still stay valid.

### Test 4.4 - Verify Invariants Manually

How to run: execute from repo root and confirm the deterministic Step 4 route and schema surfaces.

```bash
cd /root/insta_prompt
grep -e "GOAL_TYPE_VALUES" -e "context" -e "tech_stack" -e "constraint" -e "action" -e "output_format" -e "edge_case" shared/contracts/domain.ts
grep -e "segmentRequestSchema" -e "segmentResponseSchema" backend/src/lib/schemas.ts
grep -e "SEGMENT_CLASSIFIER_MODEL" -e "canonicalSlotForGoalType" backend/src/services/llm.ts
grep -e "GOAL_TYPE_NORMALIZATION_MAP" -e "deriveStableSectionId" -e "normalizeConfidence" -e "sanitizeDependencies" -e "createDeterministicSegmentFallbackIntermediate" backend/src/services/segment.ts
grep -e "segmentRouteHandler" -e "normalizeSegmentClassificationIntermediate" -e "classifySegmentsFromStreamingAdapter" backend/src/services/routeHandlers.ts
grep -e "auth -> ratelimit -> tier" -e 'PROTECTED_ROUTE_PREFIXES = ["/segment", "/enhance", "/bind", "/projects"]' backend/src/index.ts
if grep -n -E 'readJsonBody|parseWithSchema|classifySegmentsFromStreamingAdapter|normalizeSegmentClassificationIntermediate|selectModel' backend/src/routes/segment.ts; then
	echo "Route leakage found"
else
	echo "Route files stay thin"
fi
```

Sunny day expected:

1. The goal-type list matches the six canonical values.
2. Segment request and response schemas are present.
3. The segment classifier model stays pinned and the canonical-slot helper is present.
4. Normalization helpers and fallback helpers are present in the segment service.
5. `/segment` is still inside the protected middleware stack.
6. The route wrapper stays thin.

Rainy day expected:

1. Missing canonical values, schemas, or helpers indicates contract drift.
2. If route wrappers contain parsing, classification, or model-selection logic, Step 4 behavior has leaked out of the service layer.

### Test 4.5 - Run the Test Matrix

How to run: execute from the backend folder. This matrix is network-isolated and does not require a live Groq key.

```bash
cd /root/insta_prompt/backend
bun test src/__tests__/segment.service.test.ts src/__tests__/segment.route.test.ts src/__tests__/routes.validation.test.ts src/__tests__/stress-tests.test.ts
```

Sunny day expected:

1. Step 4 suites report `0 fail`.
2. Segment service tests confirm taxonomy normalization, stable IDs, dependency sanitization, and deterministic fallback intermediates.
3. Segment route tests confirm malformed JSON handling, whitespace-only segment rejection, normalized schema-valid output, fallback 200s, and warm-path determinism.
4. Validation and stress tests confirm the protected-route auth ordering still rejects before payload validation.

Rainy day expected:

1. Any failing suite indicates Step 4 contract drift.
2. Recovery: fix the failing service area first, then rerun this matrix before proceeding to manual cURL checks.

### Test 4.6 - Manual End-to-End Check for `/segment`

How to run: start the backend server and make one valid request plus one rainy-path validation request.

Keep this check contract-based: a live Groq key should produce classified output, but missing or invalid provider credentials must still fall back to schema-valid JSON rather than failing the route.

**Terminal C1** (start the server):

```bash
cd /root/insta_prompt/backend
set -a
STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')"
if [ -z "$STATUS_ENV" ]; then
	echo "Supabase env export failed. Start Supabase and rerun this block." >&2
	return 1 2>/dev/null || exit 1
fi
eval "$STATUS_ENV"
export SUPABASE_URL="$API_URL"
export REDIS_URL="redis://127.0.0.1:6379"
set +a
bun run src/index.ts
```

Wait for output like `Server listening on http://0.0.0.0:3000` or the configured port.

**Terminal C2** (in a new terminal, mint a disposable auth token and call `/segment`):

```bash
cd /root/insta_prompt/backend
set -a
STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')"
if [ -z "$STATUS_ENV" ]; then
	echo "Supabase env export failed. Start Supabase and rerun this block." >&2
	return 1 2>/dev/null || exit 1
fi
eval "$STATUS_ENV"
export SUPABASE_URL="$API_URL"
set +a

Before running the curl probes, export `LOCAL_ACCESS_VALUE` from a local helper or a shell session outside the repo. The minting one-liner is intentionally omitted here so the checked-in guide does not carry secret-bearing commands.

curl -i -X POST http://localhost:3000/segment \
	-H "Authorization: Bearer $LOCAL_ACCESS_VALUE" \
	-H "Content-Type: application/json" \
	-d '{"segments":["build a dark mode toggle","use react","ship to vercel"],"mode":"balanced"}'

curl -i -X POST http://localhost:3000/segment \
	-H "Authorization: Bearer $LOCAL_ACCESS_VALUE" \
	-H "Content-Type: application/json" \
	-d '{"segments":["fix bug", "fix bug"],"mode":"balanced"}'

curl -i -X POST http://localhost:3000/segment \
	-H "Authorization: Bearer $LOCAL_ACCESS_VALUE" \
	-H "Content-Type: application/json" \
	-d '{"segments":["   ","\n\t"],"mode":"balanced"}'
```

Sunny day expected:

1. The valid request returns `200`.
2. The response body is JSON with a `sections` array.
3. Every section has `id`, `text`, `goal_type`, `canonical_order`, `confidence`, and `depends_on`.
4. If a section has dependencies, the `depends_on` array MUST contain the hashed string ids of the parent sections. It MUST NOT contain raw integer indices such as `[0]`, which would prove the translation step failed.
5. The duplicate segment request MUST return two distinct, stable string ids, proving occurrence_count hashing is working, and neither id should be a raw array index.
6. Every `goal_type` stays within the six canonical values from `shared/contracts/domain.ts`.
7. Every `canonical_order` stays between `1` and `6`.
8. Every `confidence` stays between `0` and `1`.
9. If the local provider credential is present and valid, the live classifier path should still return the same contract shape.

Rainy day expected:

1. The whitespace-only request returns `400` with `VALIDATION_ERROR`.
2. The validation message is `segments must include at least one non-empty string`.
3. If the valid request returns `500`, schema validation failed and Step 4 output normalization regressed.
4. If the valid request returns `503`, Redis is unavailable and the shared middleware stack needs recovery.
5. If the valid request returns malformed JSON, `/segment` transport is broken.

### Test 4.7 (Optional) - Rainy Day Drill

How to run: intentionally stop Redis to validate the deterministic unavailable behavior.

```bash
cd /root/insta_prompt
docker compose stop redis
```

Then rerun one protected `/segment` request from Terminal C2:

```bash
curl -i -m 10 -X POST http://localhost:3000/segment \
	-H "Authorization: Bearer $LOCAL_ACCESS_VALUE" \
	-H "Content-Type: application/json" \
	-d '{"segments":["build feature"],"mode":"balanced"}'
```

Rainy drill expected:

1. The request returns deterministic `503` with `RATE_LIMIT_UNAVAILABLE` while Redis is stopped.
2. The response fails fast rather than hanging.
3. Recovery:

```bash
cd /root/insta_prompt
docker compose up -d redis
```

Then rerun env export and the Step 4 test matrix.

Provider fallback drill:

How to run: keep Supabase and Redis up, but force the classifier to fail by injecting a garbage local provider credential in Terminal C1.

```bash
cd /root/insta_prompt/backend
export LOCAL_PROVIDER_VALUE="force_fallback_invalid_value"
bun run src/index.ts
```

Then rerun the valid `/segment` request from Terminal C2.

Fallback contract expected:

1. The request returns `200 OK`.
2. Every section deterministically equals `goal_type: "context"`, `confidence: 0.1`, and `depends_on: []`.
3. The response stays schema-valid and does not expose provider errors.

## Step 4 Personal Notes

Use this section to log your own observations while running the guide:
- Date: 2026-04-17
- Sunny path result:
- Rainy path result:
- Bugs found:

## Step 5 Manual Testing Guide (`/enhance` SSE Expansion)

Use this guide to validate Step 5 `/enhance` streaming behavior end-to-end with local Supabase and Redis services. It aligns with the Step 5 taskboard in [v1_step_5.md](v1_step_by_step/v1_step_5.md), plus the Step 3 router/prompt contracts used by the enhance handoff.

Current main-branch note: `/enhance` remains a protected route (`auth -> ratelimit -> tier`) and commits streaming headers before the first SSE frame, so keep Redis healthy for live route checks and treat mid-stream failures as SSE `error` events (not HTTP status flips).

### What This Covers

1. Local Supabase and Redis harness health for protected `/enhance` checks.
2. `/enhance` request validation and SSE envelope behavior.
3. Deterministic model + prompt handoff wiring (`callType: "enhance"`, mode-aware budget, goal-type prompt templates, sibling context).
4. Ordered token streaming, single terminal-event semantics, and deterministic provider-error mapping.
5. Abort/disconnect behavior and metadata capture hooks.
6. Step 5 test matrix plus manual sunny/rainy cURL checks.

### Terminal Setup

1. Terminal A: repo root for Supabase/Redis setup and invariant checks.
2. Terminal B: backend folder for env export and test runs.
3. Terminal C: backend folder for manual server and cURL stream probes.

### Test 5.1 - Preflight

How to run: run from the repo root before touching Supabase, Redis, or backend tests.

```bash
cd /root/insta_prompt
docker --version
docker compose version
bun --version
npx supabase --version
```

Sunny day expected:

1. All commands print a version.
2. No command-not-found errors.

Rainy day expected:

1. Missing Docker, Bun, or the Supabase CLI causes command-not-found or version errors.
2. Fix the missing dependency, then rerun preflight.

### Test 5.2 - Start and Reset Local Services

How to run: execute in Terminal A. This gives you a clean Supabase state and healthy local Redis.

```bash
cd /root/insta_prompt
docker compose up -d redis
docker compose ps redis
npx supabase start
npx supabase db reset --yes --no-seed
```

Sunny day expected:

1. `docker compose ps redis` shows `redis` as Up (healthy).
2. Supabase starts and prints local URLs.
3. Reset reapplies local migrations required for auth and protected-route checks.

Rainy day expected:

1. If Docker is not running, Redis and Supabase start fail.
2. If Supabase containers are stale, status/reset commands can fail with container-health errors.
3. Recovery command sequence:

```bash
cd /root/insta_prompt
docker compose down
docker compose up -d redis
npx supabase stop
npx supabase start
npx supabase db reset --yes --no-seed
```

### Test 5.3 - Export Local Env Vars For Integration and Manual Checks

How to run: execute in Terminal B before test runs and manual probes. Repeat this in every new shell session.

```bash
cd /root/insta_prompt/backend
set -a
STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')"
if [ -z "$STATUS_ENV" ]; then
	echo "Supabase env export failed. Start Supabase and rerun this block." >&2
	return 1 2>/dev/null || exit 1
fi
eval "$STATUS_ENV"
export SUPABASE_URL="$API_URL"
export REDIS_URL="redis://127.0.0.1:6379"
set +a
env | grep -E '^(SUPABASE_URL|REDIS_URL)='
```

Optional: export the local provider credential in this shell if you want the live sunny-path stream. Leaving it unset is useful for the deterministic missing-credential rainy-path check.

Sunny day expected:

1. Env print shows non-empty values for `SUPABASE_URL` and `REDIS_URL`.
2. No command errors during `status`, `eval`, or export.

Rainy day expected:

1. If Supabase is not running, `npx supabase status -o env` fails and the block exits before `eval`.
2. If Redis is down, env export can still succeed but protected `/enhance` checks can return `503` before streaming starts.

### Test 5.4 - Verify Step 5 Invariants Manually

How to run: execute from repo root and confirm Step 5 routing, handoff, SSE, abort, and metadata surfaces.

```bash
cd /root/insta_prompt
grep -e 'PROTECTED_ROUTE_PREFIXES = ["/segment", "/enhance", "/bind", "/projects"]' -e "auth -> ratelimit -> tier" backend/src/index.ts
grep -e "enhanceRequestSchema" -e "sectionInputSchema" -e "project_id" backend/src/lib/schemas.ts
grep -e "fetchProjectContext" -e 'callType: "enhance"' -e "prepareEnhanceServiceHandoff" -e "streamSSE" -e "c.req.raw.signal" backend/src/services/routeHandlers.ts
grep -e "toDeterministicEnhanceErrorMessage" -e "PROVIDER_ABORTED" -e 'type: "token"' -e 'type: "done"' -e 'type: "error"' backend/src/services/routeHandlers.ts
grep -e "captureEnhanceStreamMetadata" -e "[observability][enhance_stream]" backend/src/services/history.ts
if grep -n -E 'readJsonBody|parseWithSchema|selectModel|prepareEnhanceServiceHandoff|streamSSE' backend/src/routes/enhance.ts; then
	echo "Route leakage found"
else
	echo "Route files stay thin"
fi
```

Sunny day expected:

1. Protected-route prefixes include `/enhance` and middleware-order comment shows `auth -> ratelimit -> tier`.
2. `enhanceRequestSchema` includes typed `section`, `siblings`, `mode`, and nullable `project_id`.
3. `enhanceRouteHandler` resolves context, selects model via `callType: "enhance"`, assembles prompt via handoff helper, and streams via `streamSSE`.
4. Abort propagation uses `c.req.raw.signal` and terminal-event logic includes deterministic `token | done | error` SSE envelope handling.
5. Metadata helper exists and logs `[observability][enhance_stream]` events.
6. Route leakage trap prints `Route files stay thin`.

Rainy day expected:

1. Missing helper/constants indicate Step 5 contract drift.
2. If route leakage trap prints matches, business logic leaked from service layer into `backend/src/routes/enhance.ts`.

### Test 5.5 - Run Step 5 Test Matrix

How to run: execute from backend folder. This matrix is network-isolated and validates streaming completion, mapped errors, abort behavior, and validation boundaries.

```bash
cd /root/insta_prompt/backend
bun test src/__tests__/enhance.route.test.ts src/__tests__/routes.validation.test.ts src/__tests__/llm.handoff.test.ts
```

Sunny day expected:

1. Step 5 matrix reports `0 fail` (current baseline on main: `12 pass`, `0 fail`).
2. `enhance.route` confirms:
	- validation failures return deterministic `400` JSON envelopes.
	- token events stream in order and end with exactly one `done` on success.
	- upstream parse failures map to exactly one SSE `error` event while HTTP status remains `200`.
	- abort path stops stream progression without unhandled failure.
3. `routes.validation` confirms `/enhance` unauthorized envelopes stay deterministic.
4. `llm.handoff` confirms goal-type and mode-aware prompt assembly remains deterministic.

Rainy day expected:

1. Any failing suite indicates Step 5 behavior drift.
2. Recovery: fix the failing area first (`routeHandlers`, schema validation, or handoff assembly), then rerun this matrix before manual cURL probes.

### Test 5.6 - Manual End-to-End Check for `/enhance` SSE

How to run: start backend server, or reuse the existing backend on port 3000 if one is already running, then run one sunny-path probe and two rainy-path probes (validation and missing provider key).

**Terminal C1** (start the server):

```bash
cd /root/insta_prompt/backend
set -a
STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')"
if [ -z "$STATUS_ENV" ]; then
	echo "Supabase env export failed. Start Supabase and rerun this block." >&2
	return 1 2>/dev/null || exit 1
fi
eval "$STATUS_ENV"
export SUPABASE_URL="$API_URL"
export REDIS_URL="redis://127.0.0.1:6379"
set +a
bun run src/index.ts
```

Wait for output like `Server listening on http://0.0.0.0:3000` or equivalent.

If port 3000 is already in use, stop the existing backend or reuse it for the probes; starting a second Bun server will fail with `EADDRINUSE`.

**Terminal C2** (new shell for cURL probes):

```bash
cd /root/insta_prompt/backend
set -a
STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')"
if [ -z "$STATUS_ENV" ]; then
	echo "Supabase env export failed. Start Supabase and rerun this block." >&2
	return 1 2>/dev/null || exit 1
fi
eval "$STATUS_ENV"
export SUPABASE_URL="$API_URL"
set +a

Before running these probes, export `LOCAL_ACCESS_VALUE` from a local helper or shell session outside this repo so the checked-in guide does not contain secret-bearing token mint commands.

curl -i -N -X POST http://localhost:3000/enhance \
	-H "Authorization: Bearer $LOCAL_ACCESS_VALUE" \
	-H "Content-Type: application/json" \
	-d '{"section":{"id":"s1","text":"Build a keyboard-accessible dark mode toggle.","goal_type":"action"},"siblings":[{"id":"s2","text":"Use React and TypeScript.","goal_type":"tech_stack"}],"mode":"balanced","project_id":null}'

curl -i -X POST http://localhost:3000/enhance \
	-H "Authorization: Bearer $LOCAL_ACCESS_VALUE" \
	-H "Content-Type: application/json" \
	-d '{"section":{"id":"s1"},"siblings":[],"mode":"balanced","project_id":null}'

curl -i -N -X POST http://localhost:3000/enhance \
	-H "Authorization: Bearer $LOCAL_ACCESS_VALUE" \
	-H "Content-Type: application/json" \
	-d '{"section":{"id":"s1","text":"Build dark mode.","goal_type":"action"},"siblings":[],"mode":"balanced","project_id":null}'
```

Sunny day expected (first request, with valid provider key available to server):

1. HTTP status is `200` and `Content-Type` is `text/event-stream`.
2. Stream includes one or more `data: {"type":"token","data":"..."}` frames.
3. Stream ends with exactly one `data: {"type":"done"}` frame.
4. Terminal C1 logs metadata start/done events via `[observability][enhance_stream]`.

Rainy day expected:

1. Invalid payload request returns `400` JSON with `VALIDATION_ERROR`.
2. If provider key is missing/unset, stream still returns HTTP `200` but emits one deterministic SSE `error` frame (for Groq path: `Groq: API key is missing.`) and no `done` frame.
3. If Redis is down, protected `/enhance` requests can return deterministic `503 RATE_LIMIT_UNAVAILABLE` before stream start.
4. If request starts streaming and then upstream fails, status remains `200` and failure arrives as an SSE `error` frame.

### Test 5.7 (Optional) - Abort/Disconnect Drill

How to run: start a stream request and cancel it after first token.

1. In Terminal C2, run the first streaming `/enhance` command from Test 5.6.
2. After at least one token frame appears, press `Ctrl+C` in Terminal C2.
3. Immediately run a health check to confirm the backend is still healthy:

```bash
curl -i http://localhost:3000/health
```

Abort drill expected:

1. Stream cancels quickly after disconnect.
2. Backend remains healthy (`/health` returns `200`).
3. Terminal C1 logs an abort metadata event (`"event":"abort"`) and does not crash.
4. No duplicate terminal SSE event should be observed after cancellation.

### Test 5.8 (Optional) - Redis Outage Drill for Protected `/enhance`

How to run: intentionally stop Redis, then call `/enhance` once.

```bash
cd /root/insta_prompt
docker compose stop redis
```

Then in Terminal C2:

```bash
curl -i -m 10 -X POST http://localhost:3000/enhance \
	-H "Authorization: Bearer $LOCAL_ACCESS_VALUE" \
	-H "Content-Type: application/json" \
	-d '{"section":{"id":"s1","text":"Build dark mode.","goal_type":"action"},"siblings":[],"mode":"balanced","project_id":null}'
```

Rainy drill expected:

1. Request returns deterministic `503` with `RATE_LIMIT_UNAVAILABLE`.
2. Response fails fast rather than hanging.
3. Recovery:

```bash
cd /root/insta_prompt
docker compose up -d redis
```

Then rerun env export and Test 5.5.

## Step 5 Personal Notes

Use this section to log your own observations while running the guide:
- Date: 2026-04-18
- Sunny path result:
- Rainy path result:
- Bugs found:

## Step 6 Manual Testing Guide (`/bind` SSE Final Assembly + History Persistence)

Use this guide to validate Step 6 `/bind` streaming and persistence behavior end-to-end with local Supabase and Redis services. It aligns with the Step 6 taskboard in [v1_step_6.md](v1_step_by_step/v1_step_6.md), plus Step 3 router/prompt contracts and Step 5 SSE transport rules.

Current main-branch note: `/bind` remains a protected route (`auth -> ratelimit -> tier`), canonicalizes bind sections server-side from goal type, and attempts one successful `enhancement_history` write before terminal `done`; protected LLM routes also need a short-window per-account burst guard and abuse telemetry path before provider budget consumption, so Step 6.5 is the guardrail slice that complements the bind stream and persistence flow.

### What This Covers

1. Local Supabase and Redis harness health for protected `/bind` checks.
2. `/bind` request validation and SSE envelope behavior.
3. Canonical bind ordering and service-layer handoff invariants.
4. Burst limiter and abuse telemetry guardrails on protected LLM routes.
5. Successful history-write payload semantics and deterministic persistence-failure mapping.
6. Abort/disconnect behavior and protected-route Redis outage behavior.
7. Step 6 test matrix plus manual cURL and DB probes.

### Terminal Setup

1. Terminal A: repo root for Supabase/Redis setup and DB verification queries.
2. Terminal B: backend folder for env export and test runs.
3. Terminal C: backend folder for manual backend server and cURL stream probes.

### Test 6.1 - Preflight

How to run: run from the repo root before touching Supabase, Redis, or backend tests.

```bash
cd /root/insta_prompt
docker --version
docker compose version
bun --version
npx supabase --version
```

Sunny day expected:

1. All commands print a version.
2. No command-not-found errors.

Rainy day expected:

1. Missing Docker, Bun, or the Supabase CLI causes command-not-found or version errors.
2. Fix the missing dependency, then rerun preflight.

### Test 6.2 - Start and Reset Local Services

How to run: execute in Terminal A. This gives you a clean Supabase state and healthy local Redis.

```bash
cd /root/insta_prompt
docker compose up -d redis
docker compose ps redis
npx supabase start
npx supabase db reset --yes --no-seed
```

Sunny day expected:

1. `docker compose ps redis` shows `redis` as Up (healthy).
2. Supabase starts and prints local URLs.
3. Reset reapplies local migrations required for auth, protected routes, and `enhancement_history` writes.

Rainy day expected:

1. If Docker is not running, Redis and Supabase start fail.
2. If Supabase containers are stale, status/reset commands can fail with container-health errors.
3. Recovery command sequence:

```bash
cd /root/insta_prompt
docker compose down
docker compose up -d redis
npx supabase stop
npx supabase start
npx supabase db reset --yes --no-seed
```

### Test 6.3 - Export Local Env Vars For Integration and Manual Checks

How to run: execute in Terminal B before test runs and manual probes. Repeat this in every new shell session.

```bash
cd /root/insta_prompt/backend
set -a
STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')"
if [ -z "$STATUS_ENV" ]; then
	echo "Supabase env export failed. Start Supabase and rerun this block." >&2
	return 1 2>/dev/null || exit 1
fi
eval "$STATUS_ENV"
export SUPABASE_URL="$API_URL"
export REDIS_URL="redis://127.0.0.1:6379"
set +a
env | grep -E '^(SUPABASE_URL|REDIS_URL)='
if [ -n "${SERVICE_CREDENTIAL:-}" ]; then
	echo "Service credential present for bind history writes"
else
	echo "Service credential missing; bind completion will stream an error before done"
fi
```

Optional: export the local provider credential in the shell where you run the backend if you want the live sunny-path stream for Test 6.7. Leave it unset only when you are intentionally exercising the deterministic missing-credential rainy-path check.

Sunny day expected:

1. Env print shows non-empty values for `SUPABASE_URL` and `REDIS_URL`.
2. Service role key availability check reports present.
3. No command errors during `status`, `eval`, or export.

Rainy day expected:

1. If Supabase is not running, `npx supabase status -o env` fails and the block exits before `eval`.
2. If Redis is down, env export can still succeed but protected `/bind` checks can return `503` before stream start.
3. If service role key is missing, successful generation cannot persist history and `/bind` should emit deterministic stream `error` (`Bind history persistence failed.`) with no terminal `done`.

### Test 6.4 - Verify Step 6 Invariants Manually

How to run: execute from repo root and confirm Step 6 routing, canonical bind assembly, SSE terminal semantics, and persistence wiring.

```bash
cd /root/insta_prompt
grep -e 'PROTECTED_ROUTE_PREFIXES = ["/segment", "/enhance", "/bind", "/projects"]' -e "auth -> ratelimit -> tier" backend/src/index.ts
grep -e "bindRequestSchema" -e "canonical_order" -e "goal_type" -e "expansion" backend/src/lib/schemas.ts
grep -e "canonicalizeBindSections" -e 'callType: "bind"' -e "prepareBindServiceHandoff" -e "recordEnhancementHistory" -e "streamSSE" -e "c.req.raw.signal" backend/src/services/routeHandlers.ts
grep -e "JSON.stringify(parsed.data.sections)" -e "sectionCount = parsed.data.sections.length" -e "modelUsed =" backend/src/services/routeHandlers.ts
grep -e "CANONICAL_BIND_SLOT_ORDER" -e "canonicalizeBindSections" -e "Canonical slot order (must be enforced exactly):" backend/src/services/prompts/bind.ts
grep -e "Bind history persistence failed." -e 'type: "token"' -e 'type: "done"' -e 'type: "error"' backend/src/services/routeHandlers.ts
if grep -n -E 'readJsonBody|parseWithSchema|canonicalizeBindSections|prepareBindServiceHandoff|recordEnhancementHistory|streamSSE' backend/src/routes/bind.ts; then
	echo "Route leakage found"
else
	echo "Route files stay thin"
fi
```

Sunny day expected:

1. Protected-route prefixes include `/bind` and middleware-order comment shows `auth -> ratelimit -> tier`.
2. `bindRequestSchema` enforces `sections[]` shape with bounded `canonical_order`, valid `goal_type`, and non-empty `expansion`.
3. `bindRouteHandler` canonicalizes sections, resolves bind handoff via `callType: "bind"`, streams via `streamSSE`, and wires `recordEnhancementHistory`.
4. Raw history payload is derived from `JSON.stringify(parsed.data.sections)`, and `sectionCount` is derived from validated input length.
5. Bind prompt service surface encodes canonical slot order and central canonicalization helpers.
6. Route leakage trap prints `Route files stay thin`.

Rainy day expected:

1. Missing helper/constants indicate Step 6 contract drift.
2. If route leakage trap prints matches, business logic leaked into `backend/src/routes/bind.ts`.

### Test 6.5 - Verify Abuse Telemetry and Burst-Limiter Guardrails Manually

How to run: once the Step 6.5 guardrail slice is implemented, execute from repo root and confirm the limiter sits ahead of provider work and that telemetry is deterministic.

```bash
cd /root/insta_prompt
grep -e "burst" -e "abuse" backend/src/services/rateLimit.ts backend/src/middleware/ratelimit.ts backend/src/services/history.ts backend/src/index.ts docs/agent_plans/v1_step_by_step/v1_step_6.md docs/agent_plans/v1_step_by_step/v1_step_6_planning.md docs/agent_plans/v1_overarching_plan.md
grep -e "FREE_DAILY_LIMIT" -e "AUTH_TOKEN_IP_LIMIT" -e "rate:daily:" -e "rate:auth-token-ip:" backend/src/services/rateLimit.ts
grep -e "burst" -e "abuse" backend/src/__tests__/rateLimit.service.test.ts backend/src/__tests__/ratelimit.integration.test.ts
```

Sunny day expected:

1. Burst checks execute before provider calls on `/segment`, `/enhance`, and `/bind`.
2. Exceeding the burst threshold returns deterministic `429` without contacting the provider.
3. Abuse telemetry is recorded with deterministic fields and no secret leakage.
4. The existing daily free-tier and `/auth/token` IP limit behavior stays unchanged.

Rainy day expected:

1. Missing burst-limit logic or telemetry hooks indicates the Step 6.5 slice is not wired.
2. Redis outages remain deterministic and should still return `503 RATE_LIMIT_UNAVAILABLE`.
3. If telemetry persistence fails but enforcement changes, observability was coupled incorrectly to request gating.
4. Recovery: align the rate-limit service, middleware, and tests with Step 6.5 requirements, then rerun the Step 6 matrix.

### Test 6.6 - Run Step 6 Test Matrix

How to run: execute from backend folder. This matrix is network-isolated and validates bind validation, canonical order, stream semantics, abort behavior, and persistence behavior.

```bash
cd /root/insta_prompt/backend
bun test src/__tests__/bind.route.test.ts src/__tests__/stress-tests.test.ts src/__tests__/llm.handoff.test.ts
```

Sunny day expected:

1. Step 6 matrix reports `0 fail` (current baseline on main: `13 pass`, `0 fail`).
2. `bind.route` confirms:
	- invalid payloads return deterministic `400` JSON `VALIDATION_ERROR` envelopes.
	- out-of-order sections still produce canonical bind prompt ordering.
	- token events stream in order, end with exactly one `done` on success, and write history exactly once.
	- persistence failures emit exactly one stream `error` (`Bind history persistence failed.`) and no `done`.
	- abort path stops stream progression and avoids history writes.
3. `llm.handoff` confirms canonical bind ordering and deterministic bind handoff assembly.
4. `stress-tests` confirms deterministic unauthorized envelope behavior for `/bind` under invalid auth.

Rainy day expected:

1. Any failing suite indicates Step 6 bind contract drift.
2. Recovery: fix the failing area first (`routeHandlers`, bind prompt assembly, or persistence wiring), then rerun this matrix before manual cURL probes.

### Test 6.7 - Manual End-to-End Check for `/bind` SSE and Success Persistence

How to run: start backend server, then run one sunny-path stream probe plus one validation probe. Confirm successful completion writes exactly one new `enhancement_history` row.

Sunny-path Test 6.7 requires the local provider credential and a service credential to be available in the backend shell before Terminal C1 starts. If either credential is missing, treat the run as the rainy path instead of a bind implementation failure.

**Terminal C1** (start the server):

```bash
cd /root/insta_prompt/backend
set -a
STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')"
if [ -z "$STATUS_ENV" ]; then
	echo "Supabase env export failed. Start Supabase and rerun this block." >&2
	return 1 2>/dev/null || exit 1
fi
eval "$STATUS_ENV"
export SUPABASE_URL="$API_URL"
export REDIS_URL="redis://127.0.0.1:6379"
set +a
bun run src/index.ts
```

Wait for output like `Server listening on http://0.0.0.0:3000` (or equivalent).

If port 3000 is already in use, stop the existing backend or reuse it for the probes; starting a second Bun server will fail with `EADDRINUSE`.

**Terminal C2** (new shell for cURL probes and DB checks):

```bash
cd /root/insta_prompt/backend
set -a
STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')"
if [ -z "$STATUS_ENV" ]; then
	echo "Supabase env export failed. Start Supabase and rerun this block." >&2
	return 1 2>/dev/null || exit 1
fi
eval "$STATUS_ENV"
export SUPABASE_URL="$API_URL"
set +a
```

If you do not already have `LOCAL_ACCESS_VALUE` and `LOCAL_REFRESH_VALUE` in this shell, mint a disposable session here so the probe stays self-contained.

```bash
cd /root/insta_prompt/backend
AUTH_EXPORTS="$(bun -e 'import { createClient } from "@supabase/supabase-js"; import { randomUUID } from "node:crypto"; const supabaseUrl = process.env.SUPABASE_URL ?? process.env.API_URL; const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.ANON_KEY ?? process.env.PUBLISHABLE_KEY; if (!supabaseUrl || !anonKey) { throw new Error("Missing SUPABASE_URL or anon key"); } const authClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } }); const email = `step6.${randomUUID()}@example.com`; const passphrase = `Aa1-${randomUUID()}-z`; const signUp = await authClient.auth.signUp({ email, password: passphrase }); if (signUp.error || !signUp.data.user) { throw new Error(`Failed to sign up integration user: ${signUp.error?.message ?? "unknown"}`); } let session = signUp.data.session; if (!session) { const signIn = await authClient.auth.signInWithPassword({ email, password: passphrase }); if (signIn.error || !signIn.data.session) { throw new Error(`Failed to sign in integration user: ${signIn.error?.message ?? "unknown"}`); } session = signIn.data.session; } if (!session.access_token || !session.refresh_token) { throw new Error("Integration user session is missing access or refresh token"); } console.log(`export LOCAL_ACCESS_VALUE=${JSON.stringify(session.access_token)}`); console.log(`export LOCAL_REFRESH_VALUE=${JSON.stringify(session.refresh_token)}`); console.log(`export LOCAL_USER_ID=${JSON.stringify(signUp.data.user.id)}`);')"
eval "$AUTH_EXPORTS"
env | grep -E '^(LOCAL_ACCESS_VALUE|LOCAL_REFRESH_VALUE|LOCAL_USER_ID)='
```

Canonicalization sanity probe: verify the bind handoff sorts the sections before the provider call.

```bash
bun -e 'import { prepareBindServiceHandoff } from "./src/services/llm.ts"; const handoff = prepareBindServiceHandoff({ route: { callType: "bind", tier: "free", mode: "balanced" }, template: { mode: "balanced", sections: [{ canonical_order: 6, goal_type: "edge_case", expansion: "Handle empty states and duplicate submissions." }, { canonical_order: 2, goal_type: "tech_stack", expansion: "Use React 18 with TypeScript." }, { canonical_order: 4, goal_type: "action", expansion: "Implement a keyboard-accessible dark mode toggle." }] } }); console.log("canonical_order", handoff.canonicalSections.map((section) => section.canonical_order).join(",")); console.log("goal_types", handoff.canonicalSections.map((section) => section.goal_type).join(",")); console.log("prompt_preview", handoff.prompt.split("\n").slice(0, 12).join("\n"));'

cd ..
npx supabase db query "select count(*) as history_count from enhancement_history;" -o table --agent=no
cd backend

curl -i -N -X POST http://localhost:3000/bind \
	-H "Authorization: Bearer $LOCAL_ACCESS_VALUE" \
	-H "Content-Type: application/json" \
	-d '{"sections":[{"canonical_order":6,"goal_type":"edge_case","expansion":"Handle empty states and duplicate submissions."},{"canonical_order":2,"goal_type":"tech_stack","expansion":"Use React 18 with TypeScript."},{"canonical_order":4,"goal_type":"action","expansion":"Implement a keyboard-accessible dark mode toggle."}],"mode":"balanced"}'

curl -i -X POST http://localhost:3000/bind \
	-H "Authorization: Bearer $LOCAL_ACCESS_VALUE" \
	-H "Content-Type: application/json" \
	-d '{"sections":[],"mode":"balanced"}'

cd ..
npx supabase db query "select raw_input, left(final_prompt, 100) as prompt_preview, json_typeof(raw_input::json) as raw_input_type, mode, model_used, section_count, project_id from enhancement_history order by created_at desc limit 1;" -o table --agent=no
```

Sunny day expected, assuming the local provider credential is set and a service credential is available:

1. Streaming request returns HTTP `200` with `Content-Type: text/event-stream`.
2. Stream includes one or more `data: {"type":"token","data":"..."}` frames and ends with exactly one `data: {"type":"done"}` frame.
3. Validation probe returns `400` JSON with `VALIDATION_ERROR`.
4. `enhancement_history` count increases by exactly 1 after the successful stream.
5. The canonicalization probe prints `canonical_order 2,4,6` and `goal_types tech_stack,action,edge_case`, proving the server sorted the bind sections before the provider call.
6. The latest history row shows the exact submitted `raw_input` JSON string, `raw_input_type = array`, `mode = balanced`, `section_count = 3`, and `project_id = null`.
7. The latest row's `prompt_preview` contains real generated text and is not empty or a literal `undefined`/`null` string.

Rainy day expected:

1. If the provider credential is missing, the valid bind request returns `200` with the deterministic SSE error `Groq: provider credential is missing.` and no `done`; that is the expected rainy-path provider gate.
2. `401` from both requests indicates missing/invalid bearer token setup.
3. `503` indicates Redis is unavailable before streaming starts.
4. If stream emits `error` (`Bind history persistence failed.`) and no `done`, persistence dependencies failed (for example missing service role key or DB write failure); history count should not increase.
5. If stream emits `done` but history count does not increase, bind-success persistence regressed.
6. If the canonicalization probe prints any order other than `2,4,6`, the bind handoff sort path regressed before the LLM call.

### Test 6.8 (Optional) - Abort/Disconnect Drill for `/bind`

How to run: start a streaming bind request and cancel it after tokens begin.

1. In Terminal C2, run the streaming `/bind` cURL command from Test 6.7.
2. After at least one token frame appears, press `Ctrl+C` in Terminal C2.
3. Immediately verify backend health:

```bash
curl -i http://localhost:3000/health
```

4. Verify no new success-history row was written for the aborted request:

```bash
cd /root/insta_prompt
npx supabase db query "select count(*) as history_count from enhancement_history;" -o table --agent=no
```

Abort drill expected:

1. Stream cancels quickly after disconnect.
2. Backend remains healthy (`/health` returns `200`).
3. Aborted bind does not produce terminal `done` and does not add a success-history row.

### Test 6.9 (Optional) - Rainy Day Drills (Missing Provider Key and Redis Outage)

How to run (drill A, missing provider key): restart server without Groq key and probe `/bind` once.

**Terminal C1**:

```bash
cd /root/insta_prompt/backend
unset PROVIDER_CREDENTIAL
set -a
STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')"
eval "$STATUS_ENV"
export SUPABASE_URL="$API_URL"
export REDIS_URL="redis://127.0.0.1:6379"
set +a
bun run src/index.ts
```

**Terminal C2**:

```bash
curl -i -N -X POST http://localhost:3000/bind \
	-H "Authorization: Bearer $LOCAL_ACCESS_VALUE" \
	-H "Content-Type: application/json" \
	-d '{"sections":[{"canonical_order":4,"goal_type":"action","expansion":"Implement dark mode toggle."}],"mode":"balanced"}'
```

Drill A expected:

1. Response status stays `200` (SSE started).
2. Stream emits one deterministic `error` frame (`Groq: API key is missing.`) and no `done` frame.
3. No new success-history row is written.

How to run (drill B, Redis outage): intentionally stop Redis, then call `/bind` once.

```bash
cd /root/insta_prompt
docker compose stop redis
```

Then in Terminal C2:

```bash
curl -i -m 10 -X POST http://localhost:3000/bind \
	-H "Authorization: Bearer $LOCAL_ACCESS_VALUE" \
	-H "Content-Type: application/json" \
	-d '{"sections":[{"canonical_order":4,"goal_type":"action","expansion":"Implement dark mode toggle."}],"mode":"balanced"}'
```

Drill B expected:

1. Request returns deterministic `503` with `RATE_LIMIT_UNAVAILABLE`.
2. Response fails fast rather than hanging.
3. Recovery:

```bash
cd /root/insta_prompt
docker compose up -d redis
```

Then rerun env export and Test 6.6.

## Step 6 Personal Notes

Use this section to log your own observations while running the guide:
- Date: 2026-04-19
- Sunny path result:
- Rainy path result:
- Bugs found:

## Step 7 Manual Testing Guide (Background Service Worker Core)

Use this guide to validate Step 7 background transport, session recovery, and keepalive behavior end-to-end with local Supabase and Redis services. It aligns with the Step 7 taskboard in [v1_step_7.md](v1_step_by_step/v1_step_7.md), plus Step 3 router/prompt contracts and Step 5/6 SSE transport rules.

Current main-branch note: the background worker already owns the `insta_prompt_bridge` Port, `SEGMENT` returns one JSON response, `ENHANCE` and `BIND` stream SSE through the worker, `chrome.storage.session` stores tab-scoped recovery state, and the keepalive alarm self-heals on startup. The content script is still bootstrap-level, so the browser-console probes below use the content-script execution context to inject bridge messages.

### What This Covers

1. Local Supabase and Redis harness health for protected bridge probes.
2. Extension dev build loading and bridge startup.
3. Port connect/disconnect behavior plus `SEGMENT` single-response routing.
4. `ENHANCE` / `BIND` SSE forwarding, `CANCEL`, and session-state cleanup.
5. Worker restart recovery and keepalive self-registration.
6. Step 7 test matrix plus manual browser-console probes.

### Terminal Setup

1. Terminal A: repo root for Supabase/Redis setup and route checks.
2. Terminal B: backend folder for env export, token minting, and backend tests.
3. Terminal C: extension folder for the WXT dev bundle.
4. Browser A: a supported page tab where the content script can open the bridge port.
5. Browser B: `chrome://extensions` plus the extension service worker DevTools.

### Test 7.1 - Preflight

How to run: run from the repo root before touching Supabase, Redis, or the extension build.

```bash
cd /root/insta_prompt
docker --version
docker compose version
bun --version
npx supabase --version
cd extension
node --version
npm --version
```

Sunny day expected:

1. All commands print a version.
2. No command-not-found errors.

Rainy day expected:

1. Missing Docker, Bun, Node.js, or the Supabase CLI causes command-not-found or version errors.
2. Fix the missing dependency, then rerun preflight.

### Test 7.2 - Start and Reset Local Services

How to run: execute in Terminal A. This gives you a clean Supabase state and healthy local Redis for protected route checks.

```bash
cd /root/insta_prompt
docker compose up -d redis
docker compose ps redis
npx supabase start
npx supabase db reset --yes --no-seed
```

Sunny day expected:

1. `docker compose ps redis` shows `redis` as Up (healthy).
2. Supabase starts and prints local URLs.
3. Reset reapplies the local migrations required for auth, protected routes, and history writes.

Rainy day expected:

1. If Docker is not running, Redis and Supabase start fail.
2. If Supabase containers are stale, status/reset commands can fail with container-health errors.
3. Recovery command sequence:

```bash
cd /root/insta_prompt
docker compose down
docker compose up -d redis
npx supabase stop
npx supabase start
npx supabase db reset --yes --no-seed
```

### Test 7.3 - Export Local Env Vars and Mint a Disposable Access Token

How to run: execute in Terminal B before the backend tests and browser-console probes. Repeat the env-export block in every new shell session.

```bash
cd /root/insta_prompt/backend
set -a
STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')"
if [ -z "$STATUS_ENV" ]; then
	echo "Supabase env export failed. Start Supabase and rerun this block." >&2
	return 1 2>/dev/null || exit 1
fi
eval "$STATUS_ENV"
export SUPABASE_URL="$API_URL"
export REDIS_URL="redis://127.0.0.1:6379"
set +a
env | grep -E '^(SUPABASE_URL|REDIS_URL)='
```

If you do not already have a disposable access token in this shell, reuse the exact token-mint block from Test 6.7 earlier in this file and keep `LOCAL_ACCESS_VALUE` available for the browser-console probes below.

Sunny day expected:

1. Env print shows non-empty values for `SUPABASE_URL` and `REDIS_URL`.
2. The disposable access-token block produces `LOCAL_ACCESS_VALUE` and `LOCAL_REFRESH_VALUE` when you run it.
3. No command errors during `status`, `eval`, or export.

Rainy day expected:

1. If Supabase is not running, `npx supabase status -o env` fails and the block exits before `eval`.
2. If Redis is down, env export can still succeed but protected bridge probes can return `503` before streaming starts.
3. If the token-mint block fails, stop and fix local Supabase auth before trying the browser probes.

### Test 7.4 - Verify Step 7 Invariants Manually

How to run: execute from repo root and confirm the bridge, storage, and keepalive surfaces are present.

```bash
cd /root/insta_prompt
grep -e 'BRIDGE_PORT_NAME = "insta_prompt_bridge"' -e 'BRIDGE_VERBS = \["SEGMENT", "ENHANCE", "BIND", "CANCEL"\]' -e 'chrome.storage.session' -e 'chrome.alarms' -e 'Accepted bridge port connection' -e 'Received bridge verb' -e 'Bridge port disconnected' -e 'Keepalive alarm tick' extension/src/background/index.ts
grep -e 'chrome.runtime.connect({ name: BRIDGE_PORT_NAME })' -e 'PromptCompiler bridge message' -e 'PromptCompiler bridge disconnected' extension/src/content/index.ts
grep -e 'segmentRequestSchema' -e 'enhanceRequestSchema' -e 'bindRequestSchema' backend/src/lib/schemas.ts
```

Sunny day expected:

1. The background worker owns the bridge port name and verb set.
2. The background worker uses `chrome.storage.session` and `chrome.alarms` for recovery and keepalive.
3. The content script stays bootstrap-level and only opens the bridge port plus logs messages.
4. The request schemas still accept the current `/segment`, `/enhance`, and `/bind` body shapes.

Rainy day expected:

1. Missing bridge or storage matches indicate the Step 7 surface drifted.
2. Unexpected content-script fetch or routing logic would be a scope leak and should be deferred.

### Test 7.5 - Run Step 7 Test Matrix

How to run: execute the backend and extension validation matrix before doing browser probes.

```bash
cd /root/insta_prompt/backend
bun test src/__tests__/routes.validation.test.ts src/__tests__/segment.route.test.ts src/__tests__/enhance.route.test.ts src/__tests__/bind.route.test.ts src/__tests__/llm.router.test.ts src/__tests__/prompt.factories.test.ts
cd /root/insta_prompt/extension
npm run typecheck
npm run build
```

Sunny day expected:

1. The backend test matrix passes with `0 fail`.
2. Extension typecheck and build both complete successfully.
3. No Step 8+ content instrumentation or Step 11 commit behavior is needed for this step.

Rainy day expected:

1. Backend failures indicate a contract drift in Step 3, Step 5, or Step 6 dependencies.
2. Extension build or typecheck failures indicate the bridge or content-script surface regressed.
3. Fix the failing slice and rerun the same matrix before browser probes.

### Test 7.6 - Load the Extension and Verify Port Connect / Disconnect / Keepalive

How to run: execute the WXT dev build in Terminal C, then load the unpacked dev bundle in Chrome or Edge.

```bash
cd /root/insta_prompt/extension
npm run dev
```

Then open the browser on the host system and do the following:

1. Go to `chrome://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select `extension/.output/chrome-mv3-dev`.
5. Pin the PromptCompiler extension if needed.
6. Open any supported page tab, such as `https://example.com`, so the content script connects.
7. Open DevTools on that page and keep the console visible.
8. Open the extension service worker DevTools from `chrome://extensions` and keep that console visible too.
9. Reload the page once.

Sunny day expected:

1. The service worker console logs `Accepted bridge port connection` when the tab loads.
2. Reloading the tab logs `Bridge port disconnected` and then a new `Accepted bridge port connection`.
3. `await chrome.alarms.get("keepalive")` in the service worker console returns the keepalive alarm with `periodInMinutes: 1`.
4. If you leave the worker open long enough, `Keepalive alarm tick` appears on the alarm cadence.

Rainy day expected:

1. If the extension is not loaded, no bridge logs appear and the content script never connects.
2. If `keepalive` is missing after startup, restart the worker and rerun the alarm check before moving on.

### Test 7.7 - Manual SEGMENT Bridge Probe

How to run: Open your browser DevTools on any supported webpage (like example.com). Crucial: Change the Javascript execution context dropdown from top to the PromptCompiler extension. Paste the following Promise-based script into the console, ensuring you replace "YOUR_JWT_HERE" with your LOCAL_ACCESS_VALUE.

Note: bridgePort.postMessage() intentionally returns undefined. We must wait for the onMessage listener to catch the response asynchronously.

```JavaScript
(async () => {
	console.log("Starting SEGMENT probe...");
	const bridgePort = chrome.runtime.connect({ name: "insta_prompt_bridge" });
  
	const responsePromise = new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error("Timeout: No response after 10 seconds")), 10000);
    
		bridgePort.onMessage.addListener((msg) => {
			clearTimeout(timeout);
			resolve(msg);
		});
    
		bridgePort.onDisconnect.addListener(() => {
			clearTimeout(timeout);
			reject(new Error("Port disconnected before response"));
		});
	});

	const requestId = crypto.randomUUID();
	bridgePort.postMessage({
		verb: "SEGMENT",
		jwt: "YOUR_JWT_HERE", 
		requestId,
		payload: {
			segments: ["build a keyboard-accessible dark mode toggle"],
			mode: "balanced"
		}
	});

	try {
		const response = await responsePromise;
		console.log("✅ Received bridge response:", response);
		return response; // Expand [[PromiseResult]] to view the sections!
	} catch (err) {
		console.error("❌ Probe failed:", err);
		return { error: err.message };
	} finally {
		bridgePort.disconnect();
	}
})();
```
Sunny day expected:

The background service worker console logs Received bridge verb with SEGMENT.

The page console script resolves the Promise successfully and logs the segment response.

Expanding [[PromiseResult]] in the console reveals data.sections as a non-empty array with accurate goal_type classifications.

No token frames are emitted for SEGMENT.

In the service worker console, await chrome.storage.session.get(null) shows a promptcompiler.tabState. key while the request is active, which clears after the response finishes.

Rainy day expected:

A missing or invalid token returns one error message with the backend 401 envelope. (If this happens, verify SUPABASE_SERVICE_KEY is correctly exported in the backend terminal).

A response of "HTTP 404" means the Vite/WXT dev server grabbed port 3000 instead of the Hono backend.

Redis outage returns deterministic 503 RATE_LIMIT_UNAVAILABLE before any backend work.

### Test 7.8 - Manual ENHANCE / BIND Streaming, CANCEL, and Cleanup

How to run: Ensure your DevTools context is still set to the PromptCompiler extension. Because these routes stream data, the test script collects multiple token frames and resolves only when it receives done or error.

ENHANCE Probe

```JavaScript
(async () => {
	console.log("Starting ENHANCE stream probe...");
	const bridgePort = chrome.runtime.connect({ name: "insta_prompt_bridge" });
	const tokens = [];
  
	const streamPromise = new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error("Timeout: Stream stalled")), 20000);
		bridgePort.onMessage.addListener((msg) => {
			if (msg.type === "token") {
				tokens.push(msg.data.text);
				console.log("Received token chunk...");
			}
			if (msg.type === "done" || msg.type === "error") {
				clearTimeout(timeout);
				resolve({ finalMessage: msg, assembledText: tokens.join("") });
			}
		});
	});

	bridgePort.postMessage({
		verb: "ENHANCE",
		jwt: "YOUR_JWT_HERE",
		requestId: crypto.randomUUID(),
		section: { id: "s1", text: "Build a keyboard-accessible dark mode toggle.", goal_type: "action" },
		siblings: [{ id: "s2", text: "Use React and TypeScript.", goal_type: "tech_stack" }],
		mode: "balanced",
		project_id: null,
	});

	try {
		const result = await streamPromise;
		console.log("✅ ENHANCE stream complete!", result);
		return result; 
	} catch (err) {
		console.error("❌ Probe failed:", err);
	} finally {
		bridgePort.disconnect();
	}
})();
```
Sunny day expected (ENHANCE & BIND):

The background console logs Received bridge verb with ENHANCE or BIND.

The page console logs multiple "Received token chunk..." lines as the stream arrives.

The stream resolves with exactly one done event.

Expanding [[PromiseResult]] shows the smoothly joined string in assembledText.

await chrome.storage.session.get(null) shows the tab-state key while active and clears after completion.

BIND Probe

```JavaScript
(async () => {
	console.log("Starting BIND stream probe...");
	const bridgePort = chrome.runtime.connect({ name: "insta_prompt_bridge" });
	const tokens = [];
  
	const streamPromise = new Promise((resolve) => {
		bridgePort.onMessage.addListener((msg) => {
			if (msg.type === "token") tokens.push(msg.data.text);
			if (msg.type === "done" || msg.type === "error") resolve({ finalMessage: msg, assembledText: tokens.join("") });
		});
	});

	bridgePort.postMessage({
		verb: "BIND",
		jwt: "YOUR_JWT_HERE",
		requestId: crypto.randomUUID(),
		sections: [
				{ canonical_order: 4, goal_type: "action", expansion: "Implement a keyboard-accessible dark mode toggle." },
				{ canonical_order: 2, goal_type: "tech_stack", expansion: "Use React 18 with TypeScript." },
		],
		mode: "balanced",
	});

	const result = await streamPromise;
	console.log("✅ BIND stream complete!", result);
	bridgePort.disconnect();
	return result;
})();
```
CANCEL Probe

How to run: This script triggers a long, detailed ENHANCE generation and uses setTimeout to fire a CANCEL verb exactly 1 second later to abort the stream mid-flight.

```JavaScript
(async () => {
	console.log("Starting CANCEL interrupt probe...");
	const bridgePort = chrome.runtime.connect({ name: "insta_prompt_bridge" });
	const reqId = crypto.randomUUID();
	let tokenCount = 0;

	const promise = new Promise((resolve) => {
		bridgePort.onMessage.addListener((msg) => {
			if (msg.type === "token") tokenCount++;
			if (msg.type === "done" || msg.type === "error") resolve(msg);
		});
	});

	// Start a verbose stream to guarantee it takes longer than 1 second
	bridgePort.postMessage({
		verb: "ENHANCE",
		jwt: "YOUR_JWT_HERE",
		requestId: reqId,
		section: { id: "s1", text: "Write a highly detailed, 500-word explanation about keyboard-accessible dark mode toggles with ARIA attributes and CSS variables.", goal_type: "action" },
		siblings: [],
		mode: "detailed",
		project_id: null
	});

	// Interrupt the stream
	setTimeout(() => {
		console.log(`Sending CANCEL... (collected ${tokenCount} tokens so far)`);
		bridgePort.postMessage({ verb: "CANCEL", jwt: "YOUR_JWT_HERE", requestId: reqId });
	}, 1000);

	const result = await promise;
	console.log(`✅ Stream successfully aborted after ${tokenCount} tokens. Final message:`, result);
	bridgePort.disconnect();
	return { tokenCount, finalMessage: result };
})();
```
Sunny day expected (CANCEL):

The background console logs Received bridge verb { verb: 'CANCEL' }.

The page console receives exactly one terminal done matching the aborted request ID immediately after the cancellation.

No second terminal event or late error appears after the cancel.

The tab-state key safely clears from chrome.storage.session after the abort path runs.

Rainy day expected (CANCEL):

If the stream ends naturally before the 1-second timeout fires, the cancel will act as a no-op. (If this happens, increase the prompt complexity or lower the timeout).

If the LLM provider key is missing in the backend environment, the request should immediately return a deterministic provider error instead of a stream.

### Test 7.9 (Optional) - Restart-Recovery Drill

How to run: start an `ENHANCE` or `BIND` stream from Test 7.8, then terminate the worker without closing the tab.

1. Keep the page tab open while the stream is active.
2. Open `chrome://extensions` and terminate the PromptCompiler service worker, or use the DevTools terminate button for the worker.
3. Reload the page so the content script reconnects.
4. In the service worker console, inspect `await chrome.storage.session.get(null)`.

Sunny day expected:

1. The next connection logs `Accepted bridge port connection` again.
2. The worker emits `Recovered tab state was cleared after a worker restart.` with `recovery: "orphaned_tab"` exactly once.
3. The stale tab-state entry is cleared from `chrome.storage.session` after recovery.

Rainy day expected:

1. If the request had already completed before termination, rerun with a longer detailed prompt.
2. If the recovery message never appears after the worker restart and page reload, the session-state recovery path regressed.

### Test 7.10 (Optional) - Rainy Day Drill for Missing Token, Redis Outage, and Malformed Bridge Messages

How to run: intentionally break one input at a time and confirm the worker fails deterministically.

1. Replace `jwt` with a known-invalid token and resend the `SEGMENT` probe.
2. Stop Redis with `docker compose stop redis`, then resend the `ENHANCE` probe.
3. Send a malformed bridge message such as `bridgePort.postMessage({ verb: "ENHANCE", jwt: "<token>" })` with no request body.

Rainy drill expected:

1. Invalid JWTs produce deterministic `401` bridge errors.
2. Redis outage produces deterministic `503 RATE_LIMIT_UNAVAILABLE` before streaming starts.
3. Malformed bridge messages are rejected without crashing the worker, and the service worker console logs `Ignoring malformed bridge message`.

Recovery:

1. Restart Redis with `docker compose up -d redis`.
2. Refresh the page tab to restore the content-script connection.
3. Rerun the Step 7.7 and Step 7.8 probes.

## Step 7 Personal Notes

Use this section to log your own observations while running the guide:
- Date: 2026-04-23
- Sunny path result:
- Rainy path result:
- Bugs found:

## Step 8 Manual Testing Guide (Content Script Input Instrumentation)

Use this guide to validate Step 8 content-script instrumentation end-to-end in the browser. It aligns with [v1_step_8.md](v1_step_by_step/v1_step_8.md).

Current main-branch note: Step 8 is browser-local. No Supabase, Redis, or backend server setup is required. The only runtime dependency is the extension dev bundle plus a supported browser page.

### What This Covers

1. Live discovery of textarea and contenteditable inputs.
2. Idempotent listener attachment with `data-insta-instrumented`.
3. Contenteditable extraction that preserves block-level newlines.
4. Debounce plus AbortController cancellation for stale typing work.
5. Draft underline rendering through CSS Custom Highlights or a `pointer-events: none` overlay, without mutating the active input subtree.
6. MutationObserver reattachment that ignores extension-originated marker churn.
7. The Vitest/JSDOM matrix that uses fake timers and dynamic DOM mutation to prove the Step 8 behavior.
8. No Step 9 overlay or ghost text, Step 10 acceptance graph, or Step 11 commit behavior.

### Terminal Setup

1. Terminal A: `/root/insta_prompt/extension` for preflight, dev server, and test runs.
2. Browser A: `chrome://extensions` plus a supported page tab such as `https://example.com`.
3. Browser B: the page DevTools console if you want to inspect logs and run the manual fixture snippet.

No backend terminal is required because Step 8 does not call Supabase, Redis, or any backend route.

### Test 8.1 - Preflight

How to run: run from the extension folder before loading the browser bundle or tests.

```bash
cd /root/insta_prompt/extension
bun --version
node --version
npm --version
```

Sunny day expected:

1. All commands print a version.
2. No command-not-found errors.

Rainy day expected:

1. Missing Bun, Node, or npm causes command-not-found or version errors.
2. Recovery: install the missing dependency, then rerun preflight.
3. If the extension package dependencies are missing, run `bun install` in `extension/` and rerun the checks.

### Test 8.2 - Load the Extension Dev Bundle

How to run: start the WXT dev server, then load or reload the unpacked extension in the browser.

**Terminal A**

```bash
cd /root/insta_prompt/extension
bun run dev
```

Wait for the dev server to finish building `extension/.output/chrome-mv3-dev`.

Then in the browser:

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked, or Reload if the extension is already loaded.
4. Select `extension/.output/chrome-mv3-dev`.
5. Pin the PromptCompiler extension if needed.
6. Open `https://example.com` or another page where you can open DevTools.

Sunny day expected:

1. The unpacked dev bundle loads without browser errors.
2. Reloading the page produces content-script activity in the page console.
3. The page remains usable and no prompt text is rewritten before an explicit commit step.

Rainy day expected:

1. If the extension fails to load, rerun `bun run dev` and reload the unpacked bundle.
2. If no content-script logs appear on page load, the wrong directory was loaded or the page was not refreshed.

### Test 8.3 - Verify Source-Level Invariants Manually

How to run: execute from repo root and confirm the content-script surface matches the Step 8 contract.

```bash
cd /root/insta_prompt
grep -n -E 'data-insta-instrumented|AbortController|clearTimeout|MutationObserver|attributeFilter' extension/src/content/index.ts
grep -n -E 'extractContenteditableText|BLOCK_LEVEL_TAGS|tagName === "BR"|contenteditable' extension/src/content/index.ts
grep -n -E 'CSS.highlights|Highlight|pointerEvents = "none"|renderHighlightedDraftOverlay|renderFallbackDraftaOverlay' extension/src/content/index.ts
grep -n 'innerHTML' extension/src/content/index.ts
grep -n -C 2 'document.createElement("span")' extension/src/content/index.ts
grep -n -E 'useFakeTimers|advanceTimersByTimeAsync|MutationObserver|data-insta-instrumented' extension/src/content/__tests__/instrumentation.test.ts
```

Sunny day expected:

1. The content script shows a durable marker, a debounce timer clear path, and AbortController cancellation.
2. The extraction path handles `BR` and block-level elements explicitly.
3. Draft rendering is backed by CSS Custom Highlights first and a non-interactive overlay fallback second.
4. There are no `innerHTML` mutations on the active input path.
5. Any `document.createElement("span")` match is confined to `renderFallbackDraftOverlay`; it must not appear in the active input discovery or extraction path.
6. The test file uses fake timers plus a MutationObserver harness.

Rainy day expected:

1. Missing marker, abort, or attribute-filter lines indicate the instrumentation contract drifted.
2. Any `innerHTML` mutation outside the overlay fallback is a DOM-safety regression.
3. If the test file no longer uses fake timers or the MutationObserver shim, the debounce or reattach proof is no longer deterministic.

### Test 8.4 - Run the Test Matrix

How to run: execute from the extension folder. This matrix is isolated from backend calls.

```bash
cd /root/insta_prompt/extension
bun run test
bun run typecheck
```

Current baseline on main: `3 pass, 0 fail`.

Sunny day expected:

1. The Vitest suite passes with zero failures.
2. The discovery/idempotency test confirms the marker prevents duplicate listener bundles.
3. The debounce test confirms stale work is aborted and contenteditable newlines are preserved.
4. The MutationObserver test confirms dynamically added inputs are reattached and marker churn does not duplicate listeners.
5. TypeScript typecheck passes with no errors.

Rainy day expected:

1. Any failing test points to a Step 8 instrumentation regression.
2. If debounce or newline assertions fail, inspect `extension/src/content/index.ts` first.
3. If the MutationObserver test fails, inspect the marker guard and attribute-filter path first.
4. Recovery: fix the failing slice, rerun `bun run test`, then rerun `bun run typecheck`.

### Test 8.5 - Manual End-to-End Check for Discovery, Debounce, and Reattach

How to run: use a supported page tab after the extension is loaded, then append a textarea and a contenteditable fixture from the page console.

1. Open `https://example.com` or another page where you can open DevTools.
2. Open the page console, paste the fixture below, and press Enter.
3. Watch the console for `Found valid input:` logs, then wait for the debounced extraction logs.

```javascript
const textarea = document.createElement("textarea");
textarea.id = "step8-textarea";
textarea.value = "alpha";
document.body.appendChild(textarea);

const editor = document.createElement("div");
editor.id = "step8-editor";
editor.setAttribute("contenteditable", "true");
editor.innerHTML = "<div>First clause</div><div>Second clause<br>Third clause</div>";
document.body.appendChild(editor);

const editorHtmlBefore = editor.innerHTML;

setTimeout(() => {
	textarea.value = "alpha. beta";
	textarea.dispatchEvent(new Event("input", { bubbles: true }));
	textarea.value = "alpha. beta? gamma";
	textarea.dispatchEvent(new Event("input", { bubbles: true }));

	editor.dispatchEvent(new Event("input", { bubbles: true }));

	setTimeout(() => {
		textarea.setAttribute("data-insta-instrumented", "pending");
		textarea.setAttribute("data-insta-instrumented", "true");
	}, 50);

	setTimeout(() => {
		console.log("step8 textarea markers", textarea.getAttribute("data-insta-instrumented"));
		console.log("step8 editor span count", editor.querySelectorAll("span").length);
		console.log("step8 editor html unchanged", editor.innerHTML === editorHtmlBefore);
	}, 1000);
}, 0);
```

Sunny day expected:

1. The page console shows exactly one `Found valid input:` log for the textarea and one for the contenteditable fixture.
2. The rapid textarea input only produces one debounced extraction log after the final event.
3. The contenteditable extraction log preserves block-level newlines, so the logged text reads like three lines rather than a flat block.
4. Changing the marker attribute does not produce a second registration log or duplicate listeners.
5. `editor.querySelectorAll("span").length` stays `0`, and `editor.innerHTML === editorHtmlBefore` stays `true`, proving the active text subtree was not rewritten.
6. If `CSS.highlights` is supported in the browser, the draft underlines come from the custom highlight path; otherwise, the overlay fallback is still non-interactive and outside the active input subtree.
7. No Step 9 acceptance UI or Step 11 commit behavior should appear while typing.

Rainy day expected:

1. No `Found valid input:` logs means the extension was not loaded on the page or the page was not refreshed after loading.
2. Duplicate registration logs after marker churn indicate the observer guard regressed.
3. More than one debounced extraction log for the rapid textarea burst indicates stale typing work is not being cancelled correctly.
4. `editor.innerHTML` changing or span wrappers appearing in the editor indicates a DOM-safety regression.

### Test 8.6 (Optional) - Rainy Day Drill

How to run: intentionally stress the observer and debounce paths from the page console.

1. Run the fixture from Test 8.5 again.
2. After the first `Found valid input:` log appears, append another textarea dynamically:

```javascript
const lateTextarea = document.createElement("textarea");
lateTextarea.id = "step8-late-textarea";
lateTextarea.value = "late input";
document.body.appendChild(lateTextarea);
```

3. Change `data-insta-instrumented` on the late textarea and confirm the console does not show a duplicate registration log.
4. Rapid-fire three `input` events at the late textarea and confirm only one debounced extraction log appears after 400ms.

Rainy drill expected:

1. The late textarea is instrumented once, not repeatedly.
2. The marker churn does not trigger a reattach loop.
3. The rapid inputs produce one debounced extraction log, not three.
4. Recovery: reload the page, reload the extension if necessary, and rerun the Step 8 test matrix.

## Step 8 Personal Notes

Use this section to log your own observations while running the guide:
- Date:
- Sunny path result:
- Rainy path result:
- Bugs found:
