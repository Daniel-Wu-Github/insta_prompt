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

1. `/enhance` requires `project_id` in the request payload; use `project_id: null` when no project context exists.
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
export SUPABASE_SERVICE_KEY="$SERVICE_ROLE_KEY"
export REDIS_URL="redis://127.0.0.1:6379"
set +a
env | grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_KEY|ANON_KEY|JWT_SECRET|REDIS_URL)='
```

OR USE ONE LINER:

```bash
cd /root/insta_prompt/backend && set -a && STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')" && [ -n "$STATUS_ENV" ] && eval "$STATUS_ENV" && export SUPABASE_URL="$API_URL" SUPABASE_SERVICE_KEY="$SERVICE_ROLE_KEY" REDIS_URL="redis://127.0.0.1:6379" && set +a && env | grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_KEY|ANON_KEY|JWT_SECRET|REDIS_URL)='
```

Sunny day expected:

1. Env print shows non-empty values for `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANON_KEY`, `JWT_SECRET`, and `REDIS_URL`.
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
export SUPABASE_SERVICE_KEY="$SERVICE_ROLE_KEY"
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
export SUPABASE_SERVICE_KEY="$SERVICE_ROLE_KEY"
export REDIS_URL="redis://127.0.0.1:6379"
set +a
env | grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_KEY|ANON_KEY|JWT_SECRET|REDIS_URL)='
```

OR USE ONE LINER:

```bash
cd /root/insta_prompt/backend && set -a && STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')" && eval "$STATUS_ENV" && export SUPABASE_URL="$API_URL" SUPABASE_SERVICE_KEY="$SERVICE_ROLE_KEY" REDIS_URL="redis://127.0.0.1:6379" && set +a && env | grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_KEY|ANON_KEY|JWT_SECRET|REDIS_URL)='
```

Sunny day expected:

1. Env print shows non-empty values for `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANON_KEY`, `JWT_SECRET`, and `REDIS_URL`.
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
export SUPABASE_SERVICE_KEY="$SERVICE_ROLE_KEY"
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

AUTH_LINES="$(bun -e 'import { createClient } from "@supabase/supabase-js"; const url = process.env.SUPABASE_URL ?? process.env.API_URL; const anon = process.env.ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.PUBLISHABLE_KEY; if (!url || !anon) throw new Error("Missing URL or anon key"); const supabase = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } }); const email = `step2-manual-${Date.now()}@example.com`; const passphrase = `Aa1-${Date.now()}-z`; const signUp = await supabase.auth.signUp({ email, password: passphrase }); if (signUp.error || !signUp.data.user) throw signUp.error ?? new Error("signup failed"); let session = signUp.data.session; if (!session) { const signIn = await supabase.auth.signInWithPassword({ email, password: passphrase }); if (signIn.error || !signIn.data.session) throw signIn.error ?? new Error("signin failed"); session = signIn.data.session; } console.log(session.access_token); console.log(session.refresh_token); console.log(signUp.data.user.id);')"
AUTH_JWT="$(printf '%s\n' "$AUTH_LINES" | sed -n '1p')"
REFRESH_JWT="$(printf '%s\n' "$AUTH_LINES" | sed -n '2p')"
AUTH_USER_ID="$(printf '%s\n' "$AUTH_LINES" | sed -n '3p')"

for i in $(seq 1 30); do
	code=$(curl -s -o /tmp/step2_segment_$i.json -w "%{http_code}" \
		-X POST http://localhost:3000/segment \
		-H "Authorization: Bearer $AUTH_JWT" \
		-H "Content-Type: application/json" \
		-d '{"segments":["build feature"],"mode":"balanced"}')
	echo "segment_request_$i=$code"
done

docker exec promptcompiler-redis redis-cli TTL "rate:daily:$AUTH_USER_ID"

curl -i -X POST http://localhost:3000/segment \
	-H "Authorization: Bearer $AUTH_JWT" \
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
		-H "Authorization: Bearer $AUTH_JWT" \
		-H "Content-Type: application/json" \
		-d '{"segments":["build feature"],"mode":"balanced"}'
done

for i in $(seq 1 5); do
	curl -s -o /tmp/step2_segment_race_$i.json -w "burst_$i=%{http_code}\n" \
		-X POST http://localhost:3000/segment \
		-H "Authorization: Bearer $AUTH_JWT" \
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

How to run: reuse `REFRESH_JWT` from Terminal C2, then validate both success path and burst-throttle path.

```bash
curl -i -X POST http://localhost:3000/auth/token \
	-H "Content-Type: application/json" \
	-H "fly-client-ip: 198.51.100.200" \
	-d "{\"refresh_token\":\"$REFRESH_JWT\"}"

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
	-H "Authorization: Bearer $AUTH_JWT" \
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
