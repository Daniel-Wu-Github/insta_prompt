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

## Step 9 Manual Testing Guide (Underline + Preview Rendering Layer)

Use this guide to validate Step 9 overlay geometry, confidence-aware underline styling, and hover preview behavior with the extension loaded against real pages. It aligns with the Step 9 taskboard in [v1_step_9.md](v1_step_by_step/v1_step_9.md) and the UX Flow doc.

Current main-branch note: geometry sync (scroll alignment, resize cleanup) and goal_type/confidence underline styling are active. The known open issue is long-line wrapping leaving stale underline spans — confirm this is resolved before marking Step 9 complete. Acceptance, dirty-state, bind, and commit remain deferred to Steps 10 and 11.

### What This Covers

1. Extension dev bundle load and Shadow DOM isolation confirmation.
2. Mirror overlay geometry sync for textarea and contenteditable across scroll, resize, and long-line wrapping.
3. goal_type color palette and confidence-level underline style (solid vs dashed) correctness.
4. Hover preview popover lifecycle: loading, ready, stale, and dismissal states.
5. Non-destructive render invariant: host text nodes are never mutated.
6. Step 9 visual behavior on high-rerender sites (Notion, Linear pattern).
7. Optional rainy day drills for geometry edge cases and host CSS bleed.

### Terminal Setup

1. Terminal A: `cd extension && npm run dev` — keep this running throughout.
2. Terminal B: `cd backend && bun run dev` — backend must be live for segment and enhance calls to resolve underline state.

### Test 9.1 - Preflight

How to run: confirm the dev bundle is built and the backend is live before loading the extension.

```bash
# Terminal A
cd extension && npm run dev

# Terminal B — separate terminal
cd backend && bun run dev
```

Sunny day expected:

1. WXT dev build completes with no TypeScript errors.
2. Backend starts on its default port and logs its ready line.
3. No port conflicts.

Rainy day expected:

1. WXT build TypeScript error means a content script regression — fix before proceeding.
2. Backend port conflict: kill the stale process and rerun.

### Test 9.2 - Load the Extension Dev Bundle

How to run: load the unpacked extension from the WXT output directory in Chrome.

1. Open Chrome on the host system.
2. Navigate to `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select `extension/.output/chrome-mv3-dev`.
6. Verify the PromptCompiler extension appears with no error badge.
7. Open DevTools on a test page and confirm no uncaught errors in the console on load.

Sunny day expected:

1. Extension loads with no error badge.
2. No uncaught errors in the page console on extension load.
3. No `chrome.runtime.lastError` entries in the background service worker console.

Rainy day expected:

1. Error badge on the extension icon means a background SW crash — open the SW DevTools via "Inspect views" and read the stack.
2. Uncaught content script error on load means an instrumentation regression — read the page console.

### Test 9.3 - Verify Source-Level Invariants Manually

How to run: open a page with a textarea (e.g., `https://example.com`) and paste the inspector fixture in the page console.

```javascript
// Inspect the overlay and shadow root created for a textarea fixture
const ta = document.createElement("textarea");
ta.id = "step9-invariants";
ta.rows = 4;
ta.cols = 50;
ta.value = "Build a dark mode toggle using React and TypeScript. No external libraries.";
document.body.appendChild(ta);
ta.focus();
ta.dispatchEvent(new Event("input", { bubbles: true }));

setTimeout(() => {
  // 1. Host text node must not be mutated
  console.log("host value unchanged", ta.value === "Build a dark mode toggle using React and TypeScript. No external libraries.");

  // 2. No span wrappers injected into the textarea
  console.log("no span children in host", ta.querySelectorAll("span").length === 0);

  // 3. Overlay or shadow root should exist as a sibling, not inside the host
  const siblings = [...document.querySelectorAll("[data-insta-overlay], [data-insta-shadow]")];
  console.log("overlay exists outside host", siblings.length > 0);

  // 4. Shadow DOM must be closed to page scripts if present
  const shadowHost = document.querySelector("[data-insta-shadow-host]");
  if (shadowHost) {
    console.log("shadow root mode", shadowHost.shadowRoot ? "open (check isolation)" : "closed or cross-origin");
  }
}, 800);
```

Sunny day expected:

1. `host value unchanged` logs `true`.
2. `no span children in host` logs `true`.
3. `overlay exists outside host` logs `true`.
4. Shadow root is present and isolated from the host page's CSS.

Rainy day expected:

1. `host value unchanged` logs `false` means the content script is mutating the textarea value during instrumentation — critical regression.
2. Span children found inside the host means underline DOM was injected into the active input tree — critical DOM-safety regression.
3. No overlay found means underline rendering is not activating — check the debounce timer and segment response path.

### Test 9.4 - Geometry Sync: Scroll, Resize, and Long-Line Wrapping

How to run: use a textarea with forced multi-line content and stress geometry sync paths.

1. On `https://example.com`, open the console and paste:

```javascript
const ta = document.createElement("textarea");
ta.id = "step9-geometry";
ta.style.width = "300px";
ta.style.height = "80px";
ta.style.overflow = "auto";
ta.value = "Build a dark mode toggle using React and TypeScript. No external libraries. Return a JSON object with the component code as a string field named source.";
document.body.appendChild(ta);
ta.focus();
ta.dispatchEvent(new Event("input", { bubbles: true }));
```

2. Wait ~1 second for underlines to render.
3. **Scroll test:** Click inside the textarea and scroll it down. The underlines must scroll in sync — no floating orphan lines above the visible text.
4. **Resize test:** Drag the textarea resize handle to make it taller, then shorter. After each resize, all underline spans must snap to the correct new geometry — no ghost lines outside the textarea boundary.
5. **Long-line test:** Type a new long sentence that wraps to a third line. Confirm the underline for that clause follows the wrap — it must not paint as a single unbroken horizontal line across the full width.
6. **Shrink-to-empty test:** Clear the textarea value. All underline overlays must be removed with no orphans remaining.

Sunny day expected:

1. Underlines scroll perfectly in sync with textarea text — no detachment on scroll.
2. Resize event triggers geometry recalculation — no orphan spans outside the textarea boundary after resize.
3. Long-line clause underlines follow the text wrap geometry correctly, not as a single flat line.
4. Clearing the textarea leaves zero underline nodes in the DOM.

Rainy day expected:

1. Underlines detach on scroll: `scrollTop` sync is not wired or is being applied to the wrong element — inspect the scroll listener in `index.ts`.
2. Ghost lines after resize: `ResizeObserver` callback is not fully clearing stale spans before repainting — check the stale-node cleanup path.
3. Long-line underline renders as a flat horizontal bar: the span geometry calculation is using the clause bounding rect width instead of following line-break geometry — this is the known open issue; confirm it is resolved.
4. Orphan overlays after clear: the input observer is not calling the cleanup path when `value` becomes empty.

### Test 9.5 - goal_type Color Palette and Confidence Underline Style

How to run: trigger a real segment call and inspect the rendered underlines.

1. Open a page where the extension is active and has a logged-in user token (or use a dev bypass if auth is not yet wired end-to-end).
2. In a textarea type: `Build a dark mode toggle using React and TypeScript. No external libraries. Return a JSON object.`
3. Wait for the segment call to resolve (~600ms idle after last keystroke).
4. Inspect the overlay DOM in DevTools and confirm each underline span has:
   - A `data-goal-type` attribute matching the expected classification (action / tech_stack / constraint / output_format / context / edge_case).
   - A CSS class or inline style that maps to the correct palette color.
   - A solid border-bottom for spans where the segment confidence is ≥ 0.85.
   - A dashed border-bottom for spans where the segment confidence is < 0.85.

Sunny day expected:

1. Each clause span has a `data-goal-type` attribute with a valid classification value.
2. Color palette matches the table in [UX_FLOW.md](../../../UX_FLOW.md): purple for action, teal for tech_stack, coral for constraint, blue for output_format, amber for context, gray for edge_case.
3. High-confidence clauses render with a solid underline.
4. Low-confidence clauses render with a dashed underline.
5. Palette is stable across re-renders — the same clause does not flicker between colors.

Rainy day expected:

1. All underlines are the same color: goal_type is not reaching the render function — check that the SEGMENT response is being forwarded from the SW to the content script correctly.
2. Dashed/solid distinction is absent: confidence threshold logic is missing or the threshold constant is wrong.
3. Color flickers on rerender: the render function is not using stable keys — check that clause identity is pinned to the segment result, not recreated on every input event.

### Test 9.6 - Hover Preview Popover Lifecycle

How to run: after underlines are rendered (see Test 9.5), hover over each underlined clause.

1. Hover the mouse over a high-confidence (solid) underlined clause.
   - If the enhancement for that clause has not yet resolved, the popover must show a loading state (spinner or "Expanding…" text).
   - Once the enhancement resolves, the popover must update to show the expanded preview text.
2. Move the mouse to a different underlined clause. The first popover must dismiss; the new one must appear.
3. Without moving the mouse, scroll the page. The popover must dismiss on scroll.
4. Hover a clause and press Escape. The popover must dismiss.
5. Hover a clause and click somewhere outside it. The popover must dismiss.
6. Check that the popover does not clip to the page's overflow boundary — it must render above or below the underline as fixed-position or with correct viewport coordinates.
7. Check that the popover CSS is isolated from the host page — font, color, and z-index must not be overridden by the page stylesheet.
8. Hover the mouse over a low-confidence (dashed) underlined clause and confirm the popover shows the stale or low-confidence treatment (e.g., muted text, a note about uncertainty).

Sunny day expected:

1. Loading state appears immediately on hover if enhancement is pending.
2. Ready state (full preview text) appears after enhancement resolves, without requiring a second hover.
3. Popover dismisses correctly on: mouse leave, scroll, Escape, click-outside.
4. Popover is rendered via Shadow DOM or `all: initial` CSS reset — host page styles do not bleed in.
5. Popover is positioned using `getBoundingClientRect()` coordinates — it does not clip to the page's overflow or stacking context.
6. Low-confidence clauses show a visually distinct state in the popover (not identical to a high-confidence ready state).

Rainy day expected:

1. Popover appears but disappears immediately: the mouse-leave event is firing on the overlay span before the popover has time to render — add a small debounce or pointer-events guard.
2. Popover does not dismiss on scroll: the scroll listener for dismissal is not registered or was detached.
3. Host page CSS bleeds into the popover (wrong font, color, or z-index): the shadow DOM or CSS reset is incomplete.
4. Popover is clipped by the page's overflow: the popover is not using `position: fixed` or is not mounted to `document.body` — fix the mount point.

### Test 9.7 (Optional) - Rainy Day Geometry and CSS Bleed Drills

How to run: stress-test geometry and isolation on a rerender-heavy page.

1. Open `https://linear.app` or `https://notion.so` (or equivalent SPA with frequent DOM rerenders).
2. Focus a text input that the extension instruments.
3. Type a multi-clause prompt and wait for underlines to render.
4. Navigate away within the SPA (without a full page reload) and come back to the same input.
5. Confirm underlines reattach correctly with no orphan overlays from the previous navigation state.
6. Open the browser's computed styles panel and inspect the popover element — confirm no properties are inherited from the page root.
7. Resize the browser window while the textarea is focused and underlines are visible. Confirm geometry recalculates correctly.

Rainy drill expected:

1. Orphan overlays after SPA navigation means the `MutationObserver` teardown path for removed inputs is not executing.
2. CSS inheritance in the popover means the shadow DOM attachment point or the `all: initial` reset is incomplete.
3. Geometry breaks on window resize means the `ResizeObserver` is not watching the overlay container in addition to the host input.

## Step 9 Personal Notes

Use this section to log your own observations while running the guide:
- Date:
- Sunny path result:
- Rainy path result:
- Bugs found:

## Step 10 Manual Testing Guide (Section Acceptance and Dirty-State Graph)

Use this guide to validate Step 10 Tab/Shift+Tab acceptance flow, dirty-state stale propagation, and the bind-gate invariant. It aligns with the Step 10 taskboard in [v1_step_10.md](v1_step_by_step/v1_step_10.md) and the UX Flow doc. This guide assumes Step 9 geometry and hover rendering are verified and stable.

Current main-branch note: acceptance queue, dirty-state graph, and bind gate are implemented at this step. Bind streaming and commit remain deferred to Step 11. No text replacement in the host input occurs during Step 10.

### What This Covers

1. Tab accepts the oldest unaccepted section — visual-only grey-out, no DOM rewrite.
2. Shift+Tab skips or deselects the currently focused section.
3. Upstream edit after acceptance marks downstream sections as stale.
4. The bind action is gated: Cmd+Enter must not fire while any accepted section is stale.
5. Section accept/skip state is visually legible: accepted (grey), skipped, stale (muted + warning), ready.
6. State is consistent across rapid Tab presses and after content script reattach.

### Terminal Setup

1. Terminal A: `cd extension && npm run dev` — keep running.
2. Terminal B: `cd backend && bun run dev` — segment and enhance must resolve so sections have acceptance-eligible state.

### Test 10.1 - Preflight

How to run: confirm Step 9 test matrix passed and no regressions exist before starting Step 10.

1. Verify the Step 9 geometry sync and hover tests pass (run Test 9.4 and 9.6 quickly if uncertain).
2. Confirm the extension dev bundle has been rebuilt after any Step 10 implementation changes.
3. Confirm backend is running and `/segment` returns valid classifications.

Sunny day expected:

1. No orphan overlays from Step 9 on a fresh test page.
2. Underlines render and hover previews appear correctly.
3. Backend responds to `/segment` and `/enhance` within expected latency.

Rainy day expected:

1. If Step 9 geometry is broken, fix it before adding Step 10 acceptance state — layering acceptance on top of broken geometry creates spaghetti.

### Test 10.2 - Load Extension and Prepare Fixture

How to run: create a test fixture in the page console with a multi-clause prompt and wait for underlines.

```javascript
const ta = document.createElement("textarea");
ta.id = "step10-fixture";
ta.style.width = "400px";
ta.style.height = "120px";
ta.value = "Build a dark mode toggle using React and TypeScript. No external libraries. Return a JSON object with a source field.";
document.body.appendChild(ta);
ta.focus();
ta.dispatchEvent(new Event("input", { bubbles: true }));
console.log("fixture ready — wait ~1.5s for segment + enhance to resolve, then start Tab acceptance");
```

Wait approximately 1.5 seconds after the last input event before starting Tab tests.

### Test 10.3 - Verify Source-Level Invariants

How to run: after underlines are rendered, inspect the section state in the console before touching Tab.

```javascript
// Query the acceptance state exposed by the content script (adjust selector to match implementation)
const spans = document.querySelectorAll("[data-insta-section]");
console.log("total sections detected", spans.length);
spans.forEach((s, i) => {
  console.log(`section ${i}`, {
    goalType: s.getAttribute("data-goal-type"),
    state: s.getAttribute("data-section-state"),
    confidence: s.getAttribute("data-confidence"),
  });
});
```

Sunny day expected:

1. `total sections detected` matches the number of distinct clauses segmented.
2. All sections start in `ready` or `loading` state — none start as `accepted` or `stale`.
3. Each section has a `data-goal-type` and `data-confidence` attribute.

Rainy day expected:

1. Zero sections detected: the data attribute is not being set — check that the rendering layer from Step 9 is writing the section attributes.
2. Sections already accepted before any Tab press: state initialization is wrong — acceptance queue must start empty.

### Test 10.4 - Tab Accept Flow (Sunny Path)

How to run: with the fixture from Test 10.2 loaded and underlines rendered, press Tab repeatedly.

1. Press Tab once while the textarea has focus.
   - The oldest unaccepted clause must become visually accepted (grey-out, opacity reduction, or similar muted treatment).
   - The next unaccepted clause must become the focused candidate.
   - The host textarea text must NOT change — the value must remain byte-for-byte identical to what was typed.
2. Press Tab again for the next clause. Repeat until all clauses are accepted.
3. After all clauses are accepted, pressing Tab must have no effect (or cycle to a no-op state).

```javascript
// After accepting all sections, confirm host value is unchanged
const ta = document.getElementById("step10-fixture");
const expected = "Build a dark mode toggle using React and TypeScript. No external libraries. Return a JSON object with a source field.";
console.log("host value unchanged after Tab accepts", ta.value === expected);
```

Sunny day expected:

1. Each Tab press accepts exactly one clause in oldest-first order.
2. Accepted clauses render with a distinct visual state (grey or muted).
3. Focus highlight moves to the next unaccepted clause automatically.
4. Host textarea value is byte-for-byte identical before and after all Tab presses.

Rainy day expected:

1. Tab changes the textarea value: the content script is calling `ta.value = ...` during acceptance — critical DOM regression; acceptance must be visual-only until Step 11 commit.
2. Wrong clause accepts first: the queue ordering is not anchored to segment order — fix the queue sort.
3. Tab skips a clause: the oldest-unaccepted lookup is off by one.
4. Focus highlight disappears after first Tab: focus tracking is not advancing to the next candidate.

### Test 10.5 - Shift+Tab Skip and Re-accept

How to run: after accepting one clause, use Shift+Tab to skip it and then re-accept.

1. Press Tab to accept the first clause (it should grey out).
2. Press Shift+Tab. The first clause must revert to its pre-accept visual state (not grey, not stale — back to ready).
3. Press Tab again. The first clause must accept again.
4. Press Tab twice more to accept the remaining clauses.
5. Confirm all three clauses are in the accepted state.

Sunny day expected:

1. Shift+Tab reverts the most-recently accepted clause to ready state.
2. Tab after Shift+Tab re-accepts the same clause correctly.
3. The skip/re-accept cycle can repeat without accumulating stale state or orphaned UI elements.

Rainy day expected:

1. Shift+Tab deselects the wrong clause: the undo pointer is not tracking the most-recently accepted item.
2. Shift+Tab on the first clause (nothing to undo) throws an error or crashes: add a guard for empty undo stack.
3. After Shift+Tab and re-Tab, the clause is double-counted in the acceptance queue.

### Test 10.6 - Upstream Edit Triggers Stale Propagation

How to run: accept the first clause, then edit the textarea before the second clause is accepted.

1. Press Tab once to accept clause 1 (grey out).
2. Click the textarea and prepend "Actually, " to the text (simulating an upstream edit to clause 1's content area).
3. Dispatch an input event:

```javascript
const ta = document.getElementById("step10-fixture");
ta.value = "Actually, " + ta.value;
ta.dispatchEvent(new Event("input", { bubbles: true }));
```

4. Observe: clause 1's acceptance state must turn stale (distinct visual warning — not the same as the normal accepted grey).
5. Any clauses downstream that were also accepted must also turn stale.
6. The Cmd+Enter bind action must now be blocked (either the keyboard shortcut does nothing or a visual indicator shows the gate is closed).

Sunny day expected:

1. Upstream edit immediately marks the affected accepted clause as stale.
2. Downstream accepted clauses are also marked stale.
3. Cmd+Enter does nothing while stale accepted sections exist.
4. Stale sections have a visually distinct treatment (e.g., warning orange border, strikethrough, or explicit stale label).

Rainy day expected:

1. Stale propagation does not fire: the input event listener for dirty-state detection is not connected — check the event wiring.
2. Only the edited clause turns stale but downstream accepted clauses do not: the dependency graph is not traversing downstream links.
3. Cmd+Enter still fires while stale accepted sections exist: the bind gate invariant is not enforced.

### Test 10.7 - Bind Gate: Cmd+Enter Blocked on Stale State

How to run: confirm the bind shortcut is properly gated before Step 11 is implemented.

1. Accept all clauses (Tab × N).
2. Edit the textarea to make one clause stale (as in Test 10.6).
3. Press Cmd+Enter.
4. Confirm: no `/bind` request is made (check the Network tab), no ghost text appears, no state change occurs.
5. Re-expand the stale clause (trigger a re-enhance cycle) to restore it to ready state.
6. Accept it again with Tab.
7. Press Cmd+Enter again.
8. In Step 10, this must still be a no-op (bind is Step 11) — but confirm no error is thrown and no unintended state mutation occurs.

Sunny day expected:

1. Cmd+Enter while stale sections exist produces zero network requests and zero console errors.
2. After re-accepting stale sections, Cmd+Enter produces zero network requests (Step 11 not yet implemented) and no errors.
3. No ghost text or overlay mutation occurs.

Rainy day expected:

1. A `/bind` network request fires from Step 10: Step 11 behavior has leaked in — scope boundary violation.
2. Cmd+Enter throws a JavaScript error: the key handler is missing a guard for the not-yet-implemented bind path.

### Test 10.8 (Optional) - Rapid Tab and State Consistency Drill

How to run: stress the acceptance queue with rapid Tab presses.

1. Load the Test 10.2 fixture.
2. Wait for underlines, then press Tab 10 times rapidly (faster than the UI can redraw).
3. Observe: the accepted count must match the number of actual clauses — no clause should be double-counted or skipped due to race conditions.
4. Reload the extension (via `chrome://extensions`) and reload the test page.
5. Confirm the acceptance state resets cleanly — no orphaned state from before the reload.

Rainy drill expected:

1. Rapid Tab causes an accepted count higher than the clause count: the queue is not guarded against duplicate events — add a processing lock or debounce.
2. State persists across extension reload: `chrome.storage.session` is not being cleared on SW restart — check the session recovery init path.

## Step 10 Personal Notes

Use this section to log your own observations while running the guide:
- Date:
- Sunny path result:
- Rainy path result:
- Bugs found:

## Step 11 Manual Testing Guide (Bind + Commit UX)

Use this guide to validate Step 11 Cmd+Enter bind triggering, SSE ghost text streaming, Enter commit into the host input, and Esc cancel behavior. It aligns with the Step 11 taskboard in [v1_step_11.md](v1_step_by_step/v1_step_11.md) and the UX Flow doc. This guide assumes Step 10 acceptance and dirty-state tests are passing.

Current main-branch note: `/bind` backend route and background SW BIND verb dispatch are active from Steps 6 and 7. Step 11 wires the content script keyboard triggers to the SW bridge, streams the response into ghost text, and commits on Enter. Esc must abort the stream and restore pre-bind state.

### What This Covers

1. Cmd+Enter fires `/bind` only when accepted sections exist and none are stale.
2. Accepted sections are sent to `/bind` in canonical goal_type order.
3. Ghost text streams into the textarea or contenteditable as SSE tokens arrive.
4. Enter commits the ghost text into the host input (textarea value or contenteditable text content).
5. Esc aborts the stream, clears ghost text, and returns to the pre-bind acceptance state.
6. Post-commit state reset: overlays, ghost text, and section state all clear.
7. Error path: backend bind error surfaces a user-visible message without corrupting the host input.

### Terminal Setup

1. Terminal A: `cd extension && npm run dev`.
2. Terminal B: `cd backend && bun run dev` — `/bind` must be live and authenticated.
3. Terminal C: tail backend logs for bind request IDs and SSE event tracing: `cd backend && bun run dev 2>&1 | tee /tmp/backend.log`.

### Test 11.1 - Preflight

How to run: confirm Step 10 acceptance tests pass and the backend `/bind` route is healthy.

```bash
# Terminal C — quick bind smoke probe (replace TOKEN with a valid dev token)
curl -s -N \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sections":[{"goal_type":"action","text":"Build a dark mode toggle","expansion":"Build a comprehensive dark mode toggle component"}],"mode":"balanced"}' \
  http://localhost:PORT/bind
```

Sunny day expected:

1. The curl returns an SSE stream with `data:` lines containing the assembled prompt tokens.
2. Stream terminates with a `data: [DONE]` line.
3. No `401` or `429` errors.

Rainy day expected:

1. `401 Unauthorized`: dev token is expired or missing — re-mint from `/auth/token`.
2. `422 Unprocessable`: section payload is malformed — check the bind route's input validation schema.

### Test 11.2 - Cmd+Enter Bind Trigger (Sunny Path)

How to run: use the Test 10.2 fixture, accept all clauses, then press Cmd+Enter.

1. Create the textarea fixture and wait for underlines.
2. Press Tab to accept all clauses.
3. Confirm no stale sections exist.
4. Press Cmd+Enter (or the configured bind hotkey).
5. Check the Network tab: a POST to `/bind` must fire within ~100ms of the keypress.
6. Confirm the bind request body contains the accepted sections in canonical order (context → tech_stack → constraints → action → output_format → edge_cases).
7. Confirm the request includes the current mode (efficiency / balanced / detailed) from `chrome.storage.sync`.

Sunny day expected:

1. Network tab shows exactly one POST to `/bind` per Cmd+Enter press.
2. Request body sections match the canonical order from [CLAUSE_PIPELINE.md](../../../CLAUSE_PIPELINE.md).
3. Mode field in the request matches what is stored in `chrome.storage.sync`.
4. No duplicate bind requests fire if Cmd+Enter is pressed rapidly.

Rainy day expected:

1. No network request fires: the Cmd+Enter handler is not wired or the bind gate is blocking incorrectly — check that stale state is clean.
2. Sections arrive out of canonical order: the bind payload is using segment arrival order instead of the canonical sort — fix the pre-bind sort step.
3. Duplicate bind requests fire on rapid Cmd+Enter: add a processing lock on the bind trigger.

### Test 11.3 - Ghost Text Streams During Bind

How to run: after pressing Cmd+Enter (Test 11.2), observe the ghost text rendering.

1. After Cmd+Enter fires the bind request, watch the textarea or contenteditable.
2. Ghost text must appear below or after the original text (visually distinct — not merged into the host input value).
3. Tokens must stream in progressively as each SSE `data:` line arrives — not all-at-once after stream close.
4. The original textarea value must remain unchanged during streaming.
5. Ghost text must be visually distinct from the real input text (e.g., muted color, italic, or separate overlay track).

```javascript
// During streaming — confirm host value is not modified
const ta = document.getElementById("step10-fixture");
const original = "Build a dark mode toggle using React and TypeScript. No external libraries. Return a JSON object with a source field.";
console.log("host value unchanged during stream", ta.value === original);
```

Sunny day expected:

1. Ghost text appears token by token as SSE data arrives.
2. The host textarea value is byte-for-byte identical to the original during streaming.
3. Ghost text is visually distinct — clearly not part of the user's original input.
4. Ghost text rendering does not cause the textarea to scroll unexpectedly or steal focus.

Rainy day expected:

1. Ghost text replaces the host value during streaming: `ta.value` is being mutated before Enter commit — Step 11 commit must be gated to the Enter keypress, not triggered by SSE arrival.
2. Ghost text appears all at once after stream close: the SSE token handler is batching instead of rendering incrementally — check the `onmessage` handler.
3. No ghost text appears at all: the SW-to-content-script forward path for bind SSE is not implemented or is silently failing.

### Test 11.4 - Enter Commits Ghost Text Into Textarea

How to run: after ghost text has finished streaming, press Enter to commit.

1. After the bind stream completes (ghost text is fully rendered), press Enter.
2. Confirm the host textarea value is replaced with the ghost text content.
3. Confirm the ghost text overlay is removed.
4. Confirm all section overlays (underlines) are removed.
5. Confirm the section state is reset — no leftover `data-insta-*` attributes.
6. Confirm the textarea can be typed into normally after commit (no locked state).

```javascript
// After Enter commit
const ta = document.getElementById("step10-fixture");
console.log("textarea value after commit", ta.value);
console.log("overlay nodes remaining", document.querySelectorAll("[data-insta-overlay]").length);
console.log("section nodes remaining", document.querySelectorAll("[data-insta-section]").length);
```

Sunny day expected:

1. `ta.value` contains the assembled prompt from the bind stream, not the original user input.
2. Zero overlay or section nodes remain in the DOM.
3. Typing into the textarea after commit works normally — no focus lock, no input handler regression.
4. A new input event in the now-committed textarea begins the segmentation cycle fresh (new underlines appear after the debounce).

Rainy day expected:

1. `ta.value` is still the original text after Enter: the commit step is not writing the ghost text to the textarea value — check the commit handler.
2. `ta.value` is partially written: stream content was committed mid-token — ensure commit reads the fully accumulated ghost text buffer, not a snapshot.
3. Overlay nodes remain after commit: the cleanup path is not firing — check that the commit handler calls the full teardown function.
4. Typing after commit produces no underlines: the instrumentation was torn down on commit but the `MutationObserver` is not reattaching for the now-new input.

### Test 11.5 - Enter Commits Ghost Text Into contenteditable

How to run: repeat Test 11.4 on a contenteditable fixture.

```javascript
const editor = document.createElement("div");
editor.id = "step11-ce";
editor.setAttribute("contenteditable", "true");
editor.style.width = "400px";
editor.style.minHeight = "80px";
editor.style.border = "1px solid #ccc";
editor.innerText = "Build a dark mode toggle using React and TypeScript. No external libraries.";
document.body.appendChild(editor);
editor.focus();
editor.dispatchEvent(new Event("input", { bubbles: true }));
```

After accepting all sections and completing the bind stream, press Enter.

Sunny day expected:

1. The contenteditable's `innerText` (or `textContent`) is replaced with the assembled prompt.
2. No HTML tags are injected into the contenteditable — the commit must use `textContent` assignment or an equivalent safe text-only path.
3. All overlays and section state reset correctly.
4. The contenteditable remains editable after commit.

Rainy day expected:

1. The commit injects HTML into the contenteditable (`innerHTML` assignment): this is an XSS surface — the commit path must use `textContent` only.
2. The cursor is positioned incorrectly after commit (e.g., at the start instead of the end): set cursor position explicitly with a `Range` after commit.
3. The contenteditable's `input` event does not fire after the programmatic commit: dispatch a synthetic input event to trigger re-instrumentation.

### Test 11.6 - Esc Cancels Bind Stream

How to run: press Cmd+Enter to start the bind stream, then immediately press Esc.

1. Press Cmd+Enter. The bind request begins streaming.
2. Within the first second of streaming (before ghost text fully renders), press Esc.
3. Confirm: the stream is aborted (check the Network tab — the request shows `canceled`).
4. Confirm: ghost text is cleared immediately.
5. Confirm: the original textarea value is unchanged.
6. Confirm: accepted section state is restored (sections are still in their accepted state, ready for a new Cmd+Enter attempt).

Sunny day expected:

1. The network request shows `canceled` in DevTools within ~100ms of Esc.
2. Ghost text disappears immediately on Esc.
3. The host textarea value is byte-for-byte identical to the pre-bind value.
4. Accepted sections are still visually accepted (grey) — user does not need to re-accept.
5. Pressing Cmd+Enter again after Esc starts a new bind stream successfully.

Rainy day expected:

1. Stream is not aborted: the `AbortController` is not wired to the Esc handler — check the cancel path in the SW BIND handler and the `CANCEL` verb forward.
2. Ghost text persists after Esc: the ghost text clear function is not called in the Esc handler.
3. Accepted sections reset to unaccepted after Esc: Esc must not wipe acceptance state — only cancel the in-flight stream.
4. A second Cmd+Enter after Esc fails: the abort signal was not recreated before the next bind attempt — ensure a fresh `AbortController` is constructed per bind call.

### Test 11.7 (Optional) - Backend Error During Bind Stream

How to run: trigger a bind request with a token that causes a backend error (e.g., a malformed payload or an expired token).

1. Temporarily replace the auth token with an invalid one, or inject a bind request with no sections.
2. Press Cmd+Enter.
3. Observe the error path: ghost text must not appear, the original value must be unchanged, and a user-visible error state must surface (console warning at minimum; ideally a brief inline notice).

Rainy drill expected:

1. Backend returns `401` or `422`: the error is surfaced to the user without mutating the host input.
2. SSE stream closes with an error event: the content script handles the error event gracefully — no uncaught promise rejection.
3. After the error, pressing Cmd+Enter again with a valid token works correctly — no locked bind state.

## Step 11 Personal Notes

Use this section to log your own observations while running the guide:
- Date:
- Sunny path result:
- Rainy path result:
- Bugs found:

## Step 12 Manual Testing Guide (Popup and Account UX)

Use this guide to validate Step 12 popup mode toggle, account tier display, usage indicator, and upgrade CTA behavior. It aligns with the Step 12 taskboard in [v1_step_12.md](v1_step_by_step/v1_step_12.md).

Current main-branch note: mode selection (efficiency / balanced / detailed) must persist in `chrome.storage.sync` and be forwarded in outbound segment, enhance, and bind payloads. Tier and usage data is retrieved from the backend or inferred from cached counters. Upgrade CTA appears when the free-tier daily limit is reached.

### What This Covers

1. Popup renders and mode toggle buttons function.
2. Mode selection persists in `chrome.storage.sync` across popup open/close cycles.
3. Selected mode is forwarded correctly in outbound SEGMENT, ENHANCE, and BIND payloads.
4. Tier label and daily usage indicator display correct values.
5. Upgrade CTA appears for free-tier users at limit and is hidden for pro users.
6. Popup does not interfere with content script state on the active tab.

### Terminal Setup

1. Terminal A: `cd extension && npm run dev` — popup is served from the WXT dev bundle.
2. Terminal B: `cd backend && bun run dev` — tier and usage data retrieved from backend.

### Test 12.1 - Preflight

How to run: confirm the popup loads with no errors.

1. Click the PromptCompiler extension icon in the Chrome toolbar.
2. The popup must render without a blank screen or console error.
3. Open the popup's DevTools (right-click inside popup → Inspect) and confirm no uncaught errors.

Sunny day expected:

1. Popup renders the mode toggle and account section on first open.
2. No console errors in popup DevTools.
3. Popup shows a loading state while fetching tier/usage data, then resolves to the actual values.

Rainy day expected:

1. Blank popup: the popup entry point is not built or has a runtime error — check the WXT build output.
2. Popup opens but shows infinite loading: the tier/usage fetch is not resolving — check that the backend is running and the auth token in storage is valid.

### Test 12.2 - Mode Toggle Behavior and Storage Persistence

How to run: click each mode toggle and confirm the selection persists.

1. Open the popup. Note the currently selected mode.
2. Click Efficiency. Close the popup.
3. Reopen the popup. Confirm Efficiency is still selected.
4. Click Detailed. Close the popup.
5. Reopen the popup. Confirm Detailed is still selected.
6. Inspect `chrome.storage.sync` from the background SW DevTools:

```javascript
chrome.storage.sync.get("mode", (data) => console.log("stored mode", data));
```

Sunny day expected:

1. Mode selection updates `chrome.storage.sync` immediately on click.
2. Selection persists across popup close/reopen.
3. `chrome.storage.sync.get("mode")` returns the most recently selected mode string.
4. No mode-change event is dispatched unless the mode actually changes (no spurious writes).

Rainy day expected:

1. Selection resets on popup reopen: the popup is reading from `chrome.storage.local` instead of `sync`, or is not reading from storage at all on mount.
2. Mode stored but not forwarded in payloads: inspect an ENHANCE or BIND request in the Network tab — confirm the mode field is present.
3. Mode flickers on popup open: the storage read is async and the UI is rendering a stale default before the read resolves — add a loading guard.

### Test 12.3 - Mode Forwarded in Outbound Payloads

How to run: select Detailed mode, then trigger a segment + enhance + bind cycle and inspect payloads.

1. In the popup, select Detailed.
2. On a test page with the fixture from Test 10.2, type a prompt and wait for underlines.
3. Accept all sections and press Cmd+Enter.
4. Open DevTools → Network and inspect the `/segment`, `/enhance`, and `/bind` requests.
5. Confirm each request body includes `"mode": "detailed"`.

Sunny day expected:

1. All three outbound requests carry the correct mode value.
2. Switching mode in the popup to Efficiency and repeating the cycle produces `"mode": "efficiency"` in all requests.
3. Mode value is read from `chrome.storage.sync` at request time, not cached at extension load.

Rainy day expected:

1. Mode field is missing from one of the requests: that route's payload assembly is not reading the stored mode.
2. Mode is stale (shows previous selection): the request is using a closure-captured value — ensure the mode is read fresh from storage immediately before each request.

### Test 12.4 - Tier Display and Usage Indicator

How to run: confirm the popup shows the correct tier and usage data for the logged-in user.

1. Open the popup while logged in as a free-tier user.
2. Confirm the popup shows "Free" or equivalent tier label.
3. Confirm a usage indicator (e.g., "3 / 10 today") is displayed.
4. Log in as a pro user (or simulate pro tier in dev) and confirm the tier label updates to "Pro".

Sunny day expected:

1. Free-tier users see the free label and a usage counter with current / limit values.
2. Pro users see the pro label with no hard usage cap displayed (or "Unlimited").
3. Usage counter reflects the actual daily enhance count from the backend.

Rainy day expected:

1. Usage shows `0 / 0` or `NaN`: the counter fetch is failing silently — check the backend call and fallback state.
2. Tier always shows "Free" even for pro users: the tier field is not being read from the auth token or backend response.

### Test 12.5 - Upgrade CTA Behavior

How to run: simulate a free-tier user at their daily limit.

1. In dev, set the user's usage counter to the free-tier daily limit in the local Supabase `usage_daily` table.
2. Open the popup. Confirm the upgrade CTA is visible (e.g., "Upgrade to Pro" button or banner).
3. Click the upgrade CTA. Confirm it opens the correct upgrade URL or flow.
4. For a pro user, confirm the CTA is hidden.

Sunny day expected:

1. Upgrade CTA appears when `enhance_count >= free_tier_daily_limit`.
2. CTA is hidden for pro users regardless of usage count.
3. CTA click opens the correct destination without errors.

Rainy day expected:

1. CTA does not appear at limit: the limit check is comparing the wrong field or using a stale count.
2. CTA appears for pro users: the tier check precondition is missing before the limit check.

### Test 12.6 (Optional) - Popup Does Not Interfere With Content Script

How to run: open the popup while a bind stream is in progress on a test page.

1. Start a bind stream (Cmd+Enter with accepted sections).
2. While ghost text is streaming, open the popup and change the mode.
3. Confirm the in-progress stream is not aborted and ghost text continues rendering.
4. Confirm Enter still commits the ghost text correctly after closing the popup.

Rainy drill expected:

1. Opening the popup aborts the bind stream: the SW is handling the popup's storage read as a tab state change — isolate popup storage reads from per-tab stream state.
2. Mode change mid-stream retroactively changes the streamed output: the stream is using the live mode value instead of the value captured at bind trigger time.

## Step 12 Personal Notes

Use this section to log your own observations while running the guide:
- Date:
- Sunny path result:
- Rainy path result:
- Bugs found:

## Step 13 Manual Testing Guide (Hardening, Security, and Observability)

Use this guide to validate Step 13 message boundary validation, HTML injection safety, request ID traceability, and backend health/smoke endpoints. It aligns with the Step 13 taskboard in [v1_step_13.md](v1_step_by_step/v1_step_13.md).

Current main-branch note: all prior steps are assumed stable. Step 13 adds validation and observability without changing UX behavior. No new user-visible features are introduced.

### What This Covers

1. Content script → SW boundary rejects malformed or unexpected message shapes.
2. Popover and ghost text rendering is injection-safe (no HTML execution from LLM output or user input).
3. Request IDs are present in logs and can be used to trace a request across extension and backend.
4. Backend health endpoint returns a valid response.
5. Backend smoke endpoint validates core routing (segment → enhance → bind) without hitting real LLM providers.
6. Structured error logging surfaces actionable context for provider errors and stream aborts.

### Terminal Setup

1. Terminal A: `cd extension && npm run dev`.
2. Terminal B: `cd backend && bun run dev 2>&1 | tee /tmp/backend-step13.log` — tail logs during tracing tests.

### Test 13.1 - SW Boundary Message Validation

How to run: send malformed messages from the page console to the extension's SW port and confirm rejection.

```javascript
// Get the port to the SW (adjust to match the extension's port name)
const port = chrome.runtime.connect({ name: "insta-prompt" });

// Test 1: missing verb
port.postMessage({ payload: { text: "hello" } });

// Test 2: unknown verb
port.postMessage({ verb: "UNKNOWN_VERB", payload: {} });

// Test 3: malformed payload (missing required fields)
port.postMessage({ verb: "SEGMENT", payload: {} });

// Test 4: oversized payload (if a size limit is enforced)
port.postMessage({ verb: "SEGMENT", payload: { text: "x".repeat(100_000) } });
```

Sunny day expected:

1. Each malformed message produces a SW log entry indicating rejection (e.g., `[SW] invalid message shape: missing verb`).
2. No privileged action (no API call) is triggered by any malformed message.
3. The port remains open — rejection does not crash the SW or disconnect the port.
4. The content script receives a structured error response (or no response) for each invalid message.

Rainy day expected:

1. A malformed message triggers an API call: the SW is not validating before dispatching — add a Zod or manual shape-check guard at the message router entry point.
2. Malformed message crashes the SW (port disconnects): unhandled error in the message handler — add a try/catch with structured logging.

### Test 13.2 - HTML Injection Safety in Popovers and Ghost Text

How to run: inject an LLM-style response containing HTML tags and confirm they are rendered as text, not executed.

```javascript
// Simulate an enhancement response with an XSS payload
// Inject this into the content script state as if it arrived from the SW
// (adjust to match the actual API used to set section preview text)
const xssPayload = '<img src=x onerror="alert(\'XSS\')" /><b>Bold text</b><script>console.log("injected")</script>';

// Manually trigger a popover render with the XSS payload as preview content
// (exact invocation depends on the content script's exposed render API)
```

After injecting, verify in the DOM:

1. Open the popover for the affected clause.
2. Inspect the popover element in DevTools.
3. Confirm the popover's DOM shows the raw text string, not a rendered `<img>`, `<b>`, or `<script>` element.
4. Confirm no `alert()` fires and no console.log "injected" message appears.

Sunny day expected:

1. The XSS payload is rendered as visible text characters (e.g., `<img src=x ...>` shown as a string).
2. No DOM elements are created from the payload.
3. No alert fires and no script executes.
4. Ghost text commit path handles the same payload safely — the committed textarea value contains the raw text, not rendered HTML.

Rainy day expected:

1. `<b>Bold text</b>` renders as bold in the popover: `innerHTML` is being used instead of `textContent` — replace with `textContent` assignment throughout the render path.
2. Alert fires: an `onerror` handler executed — a DOM element was created from the payload, confirming `innerHTML` use.
3. Script executes in the commit path: `ta.value = innerHTML_string` is being used — ensure commit uses `textContent` or safe string assignment.

### Test 13.3 - Request ID Traceability

How to run: trigger a full segment → enhance → bind cycle and trace the request ID through extension and backend logs.

1. Trigger a bind cycle (accept all sections, press Cmd+Enter).
2. In the extension background SW DevTools console, search for the request ID logged at bind initiation.
3. In the backend log (`/tmp/backend-step13.log`), search for the same request ID.
4. Confirm the request ID is present in:
   - The SW log at the time the BIND message is sent.
   - The backend log for the `/bind` route handler entry.
   - The backend log for the SSE stream close or error event.

Sunny day expected:

1. The same request ID appears in both the SW console and the backend log.
2. The ID format is consistent (UUID or similar — not auto-incrementing integers that repeat across tabs).
3. Per-tab isolation: two simultaneous bind calls from different tabs produce different request IDs.

Rainy day expected:

1. Request ID is missing from backend logs: the extension is not forwarding it in request headers — add `X-Request-ID` to outbound fetch headers.
2. Request ID is present in the extension but not in the backend log: the backend is not reading the `X-Request-ID` header — wire it into the log context.
3. Same request ID reused across calls: the ID generator is using a counter, not a UUID — switch to `crypto.randomUUID()`.

### Test 13.4 - Health and Smoke Endpoints

How to run: probe the backend health and smoke endpoints directly with curl.

```bash
# Health endpoint
curl -s http://localhost:PORT/health | jq .

# Smoke endpoint (no auth, no LLM call — validates routing only)
curl -s http://localhost:PORT/smoke | jq .
```

Sunny day expected:

1. `/health` returns `{ "status": "ok" }` with HTTP 200 within 100ms.
2. `/smoke` returns a payload confirming segment, enhance, and bind route registration (e.g., `{ "routes": ["segment", "enhance", "bind"], "status": "ok" }`).
3. Neither endpoint requires auth headers.
4. Neither endpoint triggers an LLM provider call.

Rainy day expected:

1. `/health` returns 404: the route is not registered — add it to the Hono router.
2. `/smoke` triggers a real LLM call: the smoke handler is using the production route handler instead of a stub — isolate the smoke test path.
3. `/health` returns 200 but response is empty: add the status JSON body.

### Test 13.5 (Optional) - Provider Error and Stream Abort Logging

How to run: trigger a bind request that fails mid-stream by shutting down the backend after the stream starts.

1. Start a bind stream (Cmd+Enter with accepted sections).
2. While the ghost text is streaming, kill the backend process (`Ctrl+C` in Terminal B).
3. Observe the extension behavior: the stream should detect the disconnect, surface an error state (no ghost text commit), and log a structured error entry.
4. In the SW DevTools console, confirm a log entry with at minimum: request ID, error type (`STREAM_ABORT`), and timestamp.

Rainy drill expected:

1. Extension commits partial ghost text after the stream abort: the commit is triggered on stream close instead of on Enter — the commit handler must be gated to the Enter keypress.
2. No error logged in the SW console: the `fetch` error event is not caught — add a `.catch` handler on the SSE fetch and forward a structured error log.

## Step 13 Personal Notes

Use this section to log your own observations while running the guide:
- Date:
- Sunny path result:
- Rainy path result:
- Bugs found:

## Step 14 Manual Testing Guide (Test Matrix and Launch Readiness)

Use this guide to run the full backend and extension test suites, complete target-site smoke testing across the supported site matrix, and validate the Chrome Web Store submission checklist. It aligns with the Step 14 taskboard in [v1_step_14.md](v1_step_by_step/v1_step_14.md).

Current main-branch note: this is the final gate before Chrome Web Store submission. All prior step tests must have passed at least once before running the Step 14 matrix. No new feature implementation occurs in Step 14 — only validation and submission prep.

### What This Covers

1. Backend test suite: auth, rate limit, tier routing, and SSE contract conformance.
2. Extension test suite: instrumentation, acceptance, bind, and commit unit tests.
3. Target site smoke: ChatGPT, Claude.ai, Linear, Notion, and GitHub confirm the happy path works on live pages.
4. Performance and memory baseline: no memory leaks after a full multi-tab session.
5. Chrome Web Store submission checklist: manifest, permissions, privacy policy, screenshots, and store listing.

### Terminal Setup

1. Terminal A: repo root for Supabase / Docker setup.
2. Terminal B: `cd backend` for test runs.
3. Terminal C: `cd extension` for extension tests.
4. Terminal D: Chrome with the production (not dev) extension bundle loaded.

### Test 14.1 - Preflight

How to run: confirm all services are running and test dependencies are installed.

```bash
# Terminal A
docker compose up -d redis
npx supabase start
npx supabase db reset --yes --no-seed

# Terminal B
cd backend && bun install

# Terminal C
cd extension && npm install
```

Sunny day expected:

1. Redis and Supabase start with no errors.
2. All dependencies install cleanly.

### Test 14.2 - Backend Test Suite

How to run: run the backend test matrix from Terminal B.

```bash
cd backend && bun test
```

Specific suites that must pass:

1. Auth failure and success paths (401, 200).
2. Rate limit boundary (429 at limit, 200 below).
3. Tier routing matrix (free → Groq, pro → Claude).
4. SSE contract conformance: segment returns JSON, enhance and bind return valid SSE envelopes with `data: [DONE]` termination.
5. Burst limiter and abuse telemetry trigger at correct thresholds.

Sunny day expected:

1. All tests pass with zero failures.
2. No skipped tests unless explicitly marked as optional infrastructure-dependent tests.
3. Test output includes timing — no individual test exceeds 5 seconds (a sign of an unawaited async or real provider call in tests).

Rainy day expected:

1. Tier routing test fails: the `X-Tier` header or Supabase tier lookup is returning the wrong value — check the middleware order and tier resolution logic.
2. SSE test fails with missing `[DONE]`: the route handler closes the stream without the terminal event — add the terminal write to the stream close path.
3. Tests run against a live provider: a test is not using the stub adapter — check that the test environment sets `LLM_ADAPTER=stub`.

### Test 14.3 - Extension Test Suite

How to run: run the extension unit test matrix from Terminal C.

```bash
cd extension && npm test
```

Specific areas that must have coverage:

1. Input discovery and idempotent attachment (Step 8 regression).
2. Segment debounce and cancel (Step 8).
3. Overlay geometry sync (Step 9).
4. Section state machine: initial → accepted → stale → ready transitions (Step 10).
5. Bind trigger guards: gate on stale state, canonical order sort (Step 11).
6. Commit path: textarea value assignment and contenteditable textContent assignment (Step 11).
7. SW message shape validation (Step 13).

Sunny day expected:

1. All tests pass with zero failures.
2. No test touches the real DOM of a live page — all DOM tests use jsdom or a fixture.
3. Coverage report shows ≥ 80% branch coverage on `index.ts` acceptance and commit paths.

Rainy day expected:

1. A test fails after a refactor: do not skip it — fix the implementation or the test, not both simultaneously.
2. Coverage is below 80% on critical paths: add branch tests for the stale-guard and canonical-sort paths specifically.

### Test 14.4 - Target Site Smoke Tests

How to run: load the production extension bundle and manually test the happy path on each target site. Use the production bundle (`npm run build` in the extension directory, then load `extension/.output/chrome-mv3`).

For each site, perform:

1. Navigate to a page with a textarea or contenteditable input.
2. Click into the input and type: `Build a dark mode toggle using React and TypeScript. No external libraries. Return a JSON object.`
3. Wait for underlines to appear (~600ms after typing stops).
4. Hover a clause and confirm the popover shows a preview.
5. Press Tab to accept all clauses.
6. Press Cmd+Enter. Confirm ghost text streams in.
7. Press Enter. Confirm the host input value is replaced with the compiled prompt.

Target site matrix:

| Site | Input Type | Known Quirks |
|---|---|---|
| `chat.openai.com` | contenteditable (ProseMirror) | Heavy rerender on every keystroke; mutation observer must survive |
| `claude.ai` | contenteditable | Shadow DOM on the page; confirm extension shadow root does not conflict |
| `linear.app` | contenteditable | SPA navigation between issues; confirm reattach on route change |
| `notion.so` | contenteditable (block editor) | Virtualized blocks; underlines must not appear on non-focused blocks |
| `github.com` | textarea (PR body, issue body) | Standard textarea; simplest case; should be a baseline |

Sunny day expected:

1. All five sites complete the happy path with no console errors.
2. Underlines appear and stay aligned through typing on all sites.
3. Commit replaces the correct input's value on all sites.
4. No page functionality is broken after the extension is active (e.g., Notion block creation, Linear issue save, GitHub file preview).

Rainy day expected:

1. Underlines do not appear on claude.ai: the page's own shadow DOM is interfering — confirm the extension's shadow root is mounted to `document.body`, not inside the page's shadow tree.
2. Reattach fails on Linear after SPA navigation: the `MutationObserver` is not watching `document.body` for newly added inputs — confirm the observer scope.
3. Commit replaces the wrong input on Notion: the active input tracking is not pinned to the last-focused element — fix the focus tracking pointer.
4. GitHub textarea value is not replaced: the textarea commit path is using `dispatchEvent(new InputEvent(...))` but GitHub's React is not picking it up — add a native input setter via `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, value)` before dispatching the event.

### Test 14.5 - Chrome Web Store Submission Checklist

Run through each item and mark done before submitting:

```
[ ] manifest.json version incremented from last submission.
[ ] manifest.json permissions list matches the minimum required (no over-requested permissions).
[ ] host_permissions uses the minimal pattern (specific hostnames, not <all_urls> unless justified).
[ ] Content Security Policy in manifest does not include 'unsafe-eval' or 'unsafe-inline'.
[ ] Privacy policy URL is live and accurately describes data collection (auth tokens, usage metrics).
[ ] Store listing screenshots are current (at least 3, at 1280x800 or 640x400).
[ ] Store listing short description is under 132 characters.
[ ] Store listing long description explains the compiler metaphor, clause types, and hotkey map.
[ ] Extension icon set is complete: 16px, 32px, 48px, 128px PNGs with no transparency bleed.
[ ] Production bundle has been loaded unpacked and passes Tests 14.4 (target site smoke) in its final form.
[ ] No console errors in the production bundle on any target site.
[ ] All debug logging is gated behind a DEV flag and is not present in the production bundle.
[ ] Supabase RLS is confirmed active (not disabled) on the production instance.
[ ] Redis rate limit keys are using production Redis, not the local dev instance.
```

### Test 14.6 (Optional) - Memory and Performance Baseline

How to run: use Chrome's Memory panel to confirm no memory leak after a multi-tab session.

1. Open three tabs on different target sites and interact with the extension on each.
2. On each tab: type a prompt, accept clauses, bind, and commit.
3. Open Chrome DevTools → Memory → take a heap snapshot.
4. Repeat the cycle on all three tabs.
5. Take a second heap snapshot.
6. Compare the two snapshots: retained size for PromptCompiler-owned objects must not grow between snapshots.

Sunny day expected:

1. Heap snapshot delta for content script objects is near zero after two full cycles.
2. No `EventListener`-attached DOM nodes appear in the retained set that are not currently instrumented inputs.
3. Background SW memory is stable across tab open/close cycles.

Rainy day expected:

1. Retained size grows per cycle: the `EventListener` cleanup path is not removing listeners on commit or on element removal — audit all `addEventListener` calls for matching `removeEventListener`.
2. SW memory grows across tabs: per-tab `chrome.storage.session` state is not being cleaned up after commit — add explicit session key deletion on the commit confirmation message.

## Step 14 Personal Notes

Use this section to log your own observations while running the guide:
- Date:
- Sunny path result:
- Rainy path result:
- Bugs found:
