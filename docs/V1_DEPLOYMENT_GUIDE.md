# PromptCompiler V1 — Free-Tier Deployment Guide

This guide deploys the current repo with free or free-tier services only:

| Surface | Service | Notes |
|---|---|---|
| Auth, database, RLS, pgvector | Supabase free project | Required |
| Rate limiting | Upstash Redis free plan | Required |
| Backend API | Fly.io free-tier app | Required for testing |
| Web dashboard shell | Vercel free plan | Optional but included |
| Extension build | Chrome MV3 unpacked extension | Local install, no host cost |

The repository now includes the missing deployment config files:

- `backend/Dockerfile`
- `backend/fly.toml`
- `web/vercel.json`

You still need to create secrets in the service dashboards and place them in local `.env` files before building.

---

## 0. What you need

- Node.js 20+
- Bun 1.1+
- Supabase CLI
- Fly CLI (`flyctl`)
- Chrome or Edge
- A Git repo pushed to a remote

Recommended local files to create from the examples:

```bash
cp backend/.env.example backend/.env
cp web/.env.example web/.env.local
cp extension/.env.example extension/.env.local
```

Do **not** commit the filled-in `.env` files.

---

## 1. Create the free services

### 1.1 Supabase

1. Go to https://supabase.com/dashboard and create a new project.
2. Save these values from **Project Settings → API**:
   - Project URL
   - anon key
   - service_role key
3. In **Database → Extensions**, enable `vector`.
4. In **Auth → Providers**, make sure email/password auth is enabled.

### 1.2 Upstash Redis

1. Go to https://console.upstash.com/ and create a Redis database.
2. Pick the closest free region to your backend host.
3. Copy:
   - REST URL
   - REST token

### 1.3 Fly.io

1. Go to https://fly.io/ or install `flyctl` locally.
2. Create an app named `promptcompiler-backend` or pick another name and update `backend/fly.toml`.
3. Keep the free-tier constraints in mind: this guide assumes a small single-instance test app.

### 1.4 Vercel

1. Go to https://vercel.com/new.
2. Import the repo.
3. Set the root directory to `web/`.
4. Use the checked-in `web/vercel.json`.

---

## 2. Configure local env files

### 2.1 Backend

Edit `backend/.env`:

```env
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_KEY=<service-role-key>
GROQ_API_KEY=<groq-key>
UPSTASH_REDIS_URL=<upstash-rest-url>
UPSTASH_REDIS_TOKEN=<upstash-rest-token>
JWT_SECRET=<long-random-string>
PORT=3000
```

Leave `ANTHROPIC_API_KEY` unset for free-tier-only testing.

### 2.2 Extension

Edit `extension/.env.local`:

```env
VITE_API_BASE_URL=https://<your-fly-app>.fly.dev
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_ENABLE_DEBUG_OVERLAY=false
```

### 2.3 Web

The current `web/` app is only a shell, so it does not need runtime env vars yet. The `web/vercel.json` file only defines the build/output behavior.

---

## 3. Push Supabase migrations

Run from the repo root:

```bash
supabase login
supabase link --project-ref <your-ref>
supabase db push
```

Then verify the base schema:

```bash
supabase db remote query "select tablename, rowsecurity from pg_tables where schemaname='public';"
supabase db remote query "select tgname from pg_trigger where tgname='on_auth_user_created';"
```

Expected:

- `profiles`, `enhancement_history`, `projects`, and `context_chunks` exist.
- `on_auth_user_created` exists.
- RLS is enabled on the public tables.

---

## 4. Deploy the backend on Fly

The backend deploy files already exist:

- `backend/Dockerfile`
- `backend/fly.toml`

### 4.1 First-time app setup

```bash
cd backend
flyctl launch --no-deploy --copy-config
```

If Fly suggests a different app name, either accept it and update `fly.toml`, or keep `promptcompiler-backend`.

### 4.2 Set secrets

```bash
flyctl secrets set \
  SUPABASE_URL=https://<your-project>.supabase.co \
  SUPABASE_SERVICE_KEY=<service-role-key> \
  GROQ_API_KEY=<groq-key> \
  UPSTASH_REDIS_URL=<upstash-rest-url> \
  UPSTASH_REDIS_TOKEN=<upstash-rest-token> \
  JWT_SECRET=<long-random-string>
```

### 4.3 Deploy

```bash
flyctl deploy
```

### 4.4 Smoke the backend

```bash
curl https://<your-fly-app>.fly.dev/health
curl https://<your-fly-app>.fly.dev/smoke
```

Expected:

- `/health` returns `{"ok":true,"status":"ok"}`
- `/smoke` returns `{"status":"ok","routes":["segment","enhance","bind"],...}`

---

## 5. Deploy the web shell on Vercel

The web app is a lightweight landing shell, not the core workflow surface.

### 5.1 Build locally

```bash
cd web
npm install
npm run build
```

### 5.2 Vercel dashboard steps

1. Open the imported project.
2. Confirm the root directory is `web/`.
3. Confirm the build command is `npm run build`.
4. Confirm the output directory is `dist`.
5. Deploy.

The checked-in `web/vercel.json` already matches those settings.

---

## 6. Build and load the Chrome extension

### 6.1 Build

```bash
cd extension
npm install
npm run build
```

This produces `extension/.output/chrome-mv3/`.

### 6.2 Load unpacked

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `extension/.output/chrome-mv3/`.
5. Pin the extension if needed.

### 6.3 Sign in

Use the popup login form:

1. Open the extension popup.
2. Enter the Supabase-auth user email and password.
3. Click **Sign in**.

The popup now handles refresh/session state; you do **not** need to inject tokens manually for the normal test path.

---

## 7. End-to-end smoke test

### 7.1 Auth and account status

1. Open the extension popup.
2. Sign in.
3. Confirm the tier and usage fields render.
4. Close and reopen the popup to confirm storage persistence.

### 7.2 Segment → enhance → bind

1. Open any page with a textarea.
2. Type a multi-sentence prompt.
3. Confirm segments appear.
4. Accept at least one segment.
5. Hover for preview.
6. Use `Cmd/Ctrl+Enter` to bind.
7. Press `Enter` to commit once binding finishes.

### 7.3 Backend observability

Watch the backend logs for:

- `/health` and `/smoke` readiness
- `/segment`, `/enhance`, `/bind` request handling
- bind-history warnings, if persistence is unavailable

---

## 8. What this guide does not cover

- Pro-tier Anthropic deployment
- GitHub OAuth / v2 context service
- Local Docker-based Supabase replicas
- Any future steps beyond the current v1 step-by-step docs

---

## 9. Testing-guide answer

The v1 step-by-step guide in `docs/agent_plans/v1/v1_step_by_step/` stops at **Step 9**. It does **not** cover every possible path for all features and functions.

If you want full-path coverage, you need a separate Step 10+ guide for acceptance, bind/commit, and recovery flows, plus explicit sunny/rainy matrices for the popup and backend relay paths.
