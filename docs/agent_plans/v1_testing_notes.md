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

## Step 1 Manual Testing Guide (Data Layer and Auth Foundation)

Use this guide to validate Step 1 end-to-end with real local Supabase services.

### What This Covers

1. Local Supabase harness health.
2. Step 1 migrations and required schema invariants.
3. Auth and token behavior checks (sunny and rainy paths).
4. RLS ownership isolation checks through integration tests.

### Terminal Setup

1. Terminal A: repo root for Supabase commands.
2. Terminal B: backend folder for env export and test runs.

### Step 1 - Preflight

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

### Step 1 - Start and Reset Local Supabase

How to run: execute in Terminal A. This gives you a clean local state and reapplies Step 1 migrations.

```bash
cd /root/insta_prompt
npx supabase start
npx supabase db reset --yes --no-seed
```

Sunny day expected:

1. Supabase starts and prints local URLs.
2. Reset applies migrations `0001_step1_profiles_and_history.sql`, `0002_step1_projects_and_context.sql`, and `0003_step1_rls.sql`.
3. Notices like trigger missing on first apply or vector already exists are acceptable.

Rainy day expected:

1. If Docker is not running, start fails.
2. If Supabase containers are stale, status commands can fail with container health errors.
3. Recovery command sequence:

```bash
cd /root/insta_prompt
npx supabase stop
npx supabase start
npx supabase db reset --yes --no-seed
```

### Step 1 - Export Local Env Vars For Integration Tests

How to run: execute in Terminal B before `bun test`. Repeat this in every new shell session.

```bash
cd /root/insta_prompt/backend
set -a
STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')"
eval "$STATUS_ENV"
export SUPABASE_URL="$API_URL"
export SUPABASE_SERVICE_KEY="$SERVICE_ROLE_KEY"
set +a
env | grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_KEY|ANON_KEY|JWT_SECRET)='
```

OR USE ONE LINER:

```bash
cd /root/insta_prompt/backend && set -a && STATUS_ENV="$(cd .. && npx supabase status -o env | grep -E '^[A-Z_]+=')" && eval "$STATUS_ENV" && export SUPABASE_URL="$API_URL" SUPABASE_SERVICE_KEY="$SERVICE_ROLE_KEY" && set +a && env | grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_KEY|ANON_KEY|JWT_SECRET)='
```

Sunny day expected:

1. Env print shows non-empty values for `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANON_KEY`, and `JWT_SECRET`.
2. No command errors during `status`/`eval`.

Rainy day expected:

1. If Supabase is not running, `npx supabase status -o env` can fail with container errors.
2. Recovery: start Supabase first, then rerun this export block.

### Step 1 - Verify Schema Invariants Manually

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

### Step 1 - Run Auth and RLS Test Matrix

How to run: execute in Terminal B after env export.

```bash
cd /root/insta_prompt/backend
bun test
```

Sunny day expected:

1. Suite passes with `17 pass` and `0 fail`.
2. Integration tests confirm:
	- profile bootstrap trigger creates a `free` profile row.
	- protected routes return deterministic 401 for missing/invalid/expired tokens.
	- valid Supabase JWT can access protected route.
	- `/auth/token` rejects malformed JSON, missing refresh token, and invalid refresh token.
	- `/auth/token` success path returns verified token context.
	- cross-user RLS isolation works for `profiles` and `enhancement_history`.

Rainy day expected:

1. If integration test says it is skipped, env vars are missing from the shell.
2. If test run errors before execution, local Supabase is likely down.
3. If RLS/auth assertions fail, run DB reset and rerun tests.

### Step 1 - Studio Bootstrap Verification

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

### Step 1 - Manual cURL Check for /auth/token

How to run: start the backend server and make a raw HTTP request to verify request validation works end-to-end.

**Terminal B1** (start the server):

```bash
cd /root/insta_prompt/backend
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
4. No attempt is made to call Supabase (validation fails fast before network calls).

Rainy day expected:

1. Backend server fails to start (missing dependencies, broken TypeScript, etc.).
2. cURL fails to connect (server not running on port 3000).
3. cURL succeeds but server returns 200 (validation not enforced, or placeholder route exists).
4. Recovery: 
   - If server won't start: run `cd backend && npm install` then `bun run src/index.ts`
   - If cURL fails: ensure Terminal B1 is still running the server with no errors
   - If validation is missing: check `backend/src/routes/auth.ts` and `backend/src/lib/validation.ts` for refresh_token schema

### Optional Rainy Day Drill

How to run: this intentionally creates a failure mode so you can practice recovery.

```bash
cd /root/insta_prompt
npx supabase stop
```

Then rerun the env export block in Terminal B.

Rainy drill expected:

1. `npx supabase status -o env` fails while Supabase is stopped.
2. Recovery:

```bash
cd /root/insta_prompt
npx supabase start
```

Then rerun env export and `bun test`.

## Step 1 Personal Notes

Use this section to log your own observations while running the guide:
- Date: 2026-04-12
- Sunny path result: All steps passed (preflight, Supabase reset, env export, schema checks, bun test, Studio verification, cURL validation)
- Rainy path result: Did not run since none encountered.
- Bugs found: None