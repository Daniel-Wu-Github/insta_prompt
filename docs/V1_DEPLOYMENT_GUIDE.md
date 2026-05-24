# PromptCompiler V1 — Deployment Guide

This guide walks you through deploying PromptCompiler V1 to a hosted environment so you can debug the extension without booting local servers. It is derived from the exact files present in this repository at the time of writing.

> **Reality check.** This repository does **not** yet contain a `Dockerfile`, `fly.toml`, `vercel.json`, or a packaged Supabase project link. The instructions below tell you which files to create and what to put in them. Audit notes after every major step call out where the implementation deviates from a true production-ready state.

---

## 0. Prerequisites

You will need:

| Tool / Service | Why | Notes |
|---|---|---|
| [Bun](https://bun.sh) ≥ 1.1 | Backend runtime (`backend/package.json` → `bun run --hot src/index.ts`) | Local builds only |
| [Node.js](https://nodejs.org) ≥ 20 | Extension build (WXT/Vite) | Required by `wxt build` |
| [Supabase CLI](https://supabase.com/docs/guides/cli) | DB push, migrations, auth | `npm i -g supabase` |
| Supabase project | Auth + Postgres + RLS | Free tier OK |
| [Upstash Redis](https://upstash.com) | Daily/burst rate limiting (`backend/src/services/rateLimit.ts`) | Free tier OK |
| [Groq](https://console.groq.com) API key | Free-tier LLM (`llama-3.3-70b-versatile` per `services/llm.ts`) | Required |
| [Anthropic](https://console.anthropic.com) API key | Pro-tier LLM (Haiku/Sonnet) | Optional for free-only test |
| [Fly.io](https://fly.io) account | Hosting Bun backend | `flyctl` CLI |
| Chrome / Edge | Loading the extension | MV3-compatible |

---

## 1. Deploy the Supabase Project

The repository ships three SQL migrations in `supabase/migrations/`:

- `0001_step1_profiles_and_history.sql` — `profiles`, `enhancement_history`, `handle_new_user` trigger, `vector` extension.
- `0002_step1_projects_and_context.sql` — `projects`, `context_chunks` (v2-ready).
- `0003_step1_rls.sql` — RLS policies for all four tables.

### 1a. Create the project

1. Open the Supabase dashboard → **New Project**. Pick a region close to your Fly.io region.
2. Save the **Project Ref** (looks like `xxxxxx`), **Project URL** (`https://<ref>.supabase.co`), **anon key**, and **service-role key**.
3. In the dashboard, enable the `vector` extension under **Database → Extensions** (`0001_step1_profiles_and_history.sql` also issues `create extension if not exists vector;`).

### 1b. Push migrations

```bash
cd <repo-root>
supabase login
supabase link --project-ref <your-ref>
supabase db push        # applies everything in supabase/migrations/
```

### 1c. Verify RLS + trigger

```bash
supabase db remote query "select tablename, rowsecurity from pg_tables where schemaname='public';"
# Expect rowsecurity = t for profiles, enhancement_history, projects, context_chunks.

supabase db remote query "select tgname from pg_trigger where tgname='on_auth_user_created';"
# Expect one row.
```

> **Audit deviation.** `verifyBearerToken` in `backend/src/services/supabase.ts:71` uses the **service-role key** (`SUPABASE_SERVICE_KEY`) to call `supabase.auth.getUser(token)` and to read the `profiles` table directly. RLS therefore does not gate the backend's own reads. This is fine for server-side code but means the JWT verification path *requires* the service-role key in the backend env — there is no fallback to the anon key.

### 1d. Configure Supabase Auth

V1 does not currently provision a login UI inside the extension or the `web/` dashboard. To exercise the flow you must, manually, either:

1. Create a test user via the Supabase dashboard (Auth → Users → **Invite user**), or
2. Use `supabase auth sign-up` from the CLI, or
3. Call the Supabase auth REST API directly to mint an `access_token`.

Once you have an access token, you can paste it into `chrome.storage.local` from the extension popup DevTools (see §4d).

> **Audit deviation.** The extension never calls `/auth/token`; there is no GitHub OAuth or email/password flow in the popup. The content script falls back to a hard-coded JWT (`BRIDGE_FALLBACK_JWT = "promptcompiler-dev-jwt"` in `extension/src/content/index.ts:13`) when no JWT is in storage. That fallback will be rejected by `authMiddleware` in production. You must populate storage manually or build a login UI before any real request will pass auth.

---

## 2. Provision Upstash Redis

1. Create an Upstash Redis database. Pick the same region as Fly.io.
2. Copy the **REST URL** (`UPSTASH_REDIS_URL`) and **REST Token** (`UPSTASH_REDIS_TOKEN`).
3. `backend/src/services/rateLimit.ts` will pick `@upstash/redis` first; if those vars are absent and `REDIS_URL` is present, it falls back to `ioredis` (suitable for local Docker — see `docker-compose.yml`).

Rate limits applied (`backend/src/services/rateLimit.ts` constants):
- `FREE_DAILY_LIMIT = 30` LLM calls/day on free tier
- `AUTH_TOKEN_IP_LIMIT = 20` per 60s window on `/auth/token`
- `DEFAULT_PROTECTED_BURST_LIMIT = 60` per 10s for `/segment`, `/enhance`, `/bind`

---

## 3. Deploy the Hono/Bun Backend (Fly.io)

The repo does **not** include a `Dockerfile` or `fly.toml`. Create them now.

### 3a. Add `backend/Dockerfile`

```dockerfile
FROM oven/bun:1.1-alpine
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
```

### 3b. Add `backend/fly.toml`

```toml
app = "promptcompiler-backend"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

  [[http_service.checks]]
    interval = "30s"
    timeout = "5s"
    grace_period = "10s"
    method = "GET"
    path = "/health"
```

### 3c. Required environment (from `backend/.env.example`)

| Key | Source | Notes |
|---|---|---|
| `SUPABASE_URL` | Supabase project | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase project | Service-role JWT |
| `GROQ_API_KEY` | Groq console | Required for free tier + segmentation |
| `ANTHROPIC_API_KEY` | Anthropic console | Required for pro tier |
| `UPSTASH_REDIS_URL` | Upstash | REST URL |
| `UPSTASH_REDIS_TOKEN` | Upstash | REST token |
| `REDIS_URL` | local fallback only | optional; skipped on Fly |
| `JWT_SECRET` | random | Currently unused at runtime but listed in `.env.example` |
| `PORT` | runtime | Default `3000` |

> **Audit deviation.** `backend/src/index.ts:17-28` prints every secret prefix to stdout at boot ("BOOTSTRAP ENV CHECK"). Strip these `console.log` lines before deploying or you will leak key prefixes into Fly logs / log aggregators.

### 3d. Deploy

```bash
cd backend
flyctl launch --no-deploy --copy-config        # accept fly.toml
flyctl secrets set \
  SUPABASE_URL=...  SUPABASE_SERVICE_KEY=... \
  GROQ_API_KEY=...  ANTHROPIC_API_KEY=... \
  UPSTASH_REDIS_URL=...  UPSTASH_REDIS_TOKEN=... \
  JWT_SECRET=<random>
flyctl deploy
```

### 3e. Smoke test

```bash
curl https://promptcompiler-backend.fly.dev/health
# {"ok":true,"status":"ok"}

curl https://promptcompiler-backend.fly.dev/smoke
# {"status":"ok","routes":["segment","enhance","bind"],"ts":...}
```

### 3f. CORS / cross-origin

The extension's background SW issues `fetch()` calls with `Authorization: Bearer ...` from a chrome-extension:// origin. Hono is currently mounted without any `cors()` middleware, so the response carries no `Access-Control-Allow-*` headers. Fortunately, MV3 service workers do **not** trigger CORS for requests originating from the SW *as long as* the URL is listed in `host_permissions`. Today the extension uses `"<all_urls>"`, which covers it.

> **Audit deviation.** If you later restrict `host_permissions` to the backend host, add the host to `wxt.config.ts` (`host_permissions: ["https://promptcompiler-backend.fly.dev/*"]`) **and** keep it as a `host_permission`, not a `content_script` match. The current `<all_urls>` is permissive enough to scare Chrome Web Store reviewers.

---

## 4. Build and Load the Chrome Extension

### 4a. Point the extension at the deployed backend

Two files hard-code `http://localhost:3000`:

- `extension/src/background/index.ts:2` — `const BACKEND_BASE_URL = "http://localhost:3000";`
- `extension/src/popup/hooks/useAccountStatus.ts:6` — same constant.

Replace both with your Fly URL **or** introduce a build-time env (`import.meta.env.VITE_API_BASE_URL`). The `extension/.env.example` already declares `VITE_API_BASE_URL=http://localhost:3000`, but no code currently reads it.

> **Audit deviation.** `VITE_API_BASE_URL` is defined in `.env.example` but never referenced. Wire it through both files before packaging, or your production build will still talk to `localhost:3000`.

### 4b. Build the extension

```bash
cd extension
npm install                # or bun install
npm run build              # wxt build → .output/chrome-mv3/
```

WXT writes the production-ready MV3 bundle to `extension/.output/chrome-mv3/`. The generated manifest will inherit `permissions: ["storage","alarms"]` and `host_permissions: ["<all_urls>"]` from `wxt.config.ts`.

### 4c. Load unpacked in Chrome

1. Open `chrome://extensions/`, enable **Developer mode**.
2. Click **Load unpacked**, choose `extension/.output/chrome-mv3/`.
3. Confirm the **PromptCompiler** card appears with a service-worker link → click "service worker" to open the SW DevTools console.

### 4d. Seed an auth token (until a login UI ships)

The content script and popup both look for a JWT in `chrome.storage.local` (popup) and `chrome.storage.session` / `chrome.storage.local` (content script). Until a login flow exists you must inject one manually:

1. Mint an access token via Supabase (dashboard → Auth → user → "Generate access token", or `supabase auth sign-in`).
2. Open the extension's service-worker DevTools (`chrome://extensions/ → service worker`).
3. Run:

   ```js
   chrome.storage.local.set({
     "promptcompiler.settings": {
       mode: "balanced",
       projectId: null,
       token: "<paste access token>"
     }
   });
   ```

4. Reload any host tab — the content script will pick up the JWT on its next `resolveBridgeContext()` call (`extension/src/content/index.ts:248`).

### 4e. Verify end-to-end

In the SW DevTools, watch for `[SW] dispatching SEGMENT requestId=...` after typing into any textarea. In the Fly logs (`flyctl logs -a promptcompiler-backend`), look for `=== 🧠 GROQ SEMANTIC ANALYSIS ===` blocks.

> **Audit deviation.** Even if `/segment` succeeds end-to-end, the content script **drops the response**. The bridge handler at `extension/src/content/index.ts:1974` only reacts to `type === "token" | "done" | "error"` *and* requires `state.activeBindRequestId === requestId`. The SW emits the SEGMENT response as `{type: "segment", requestId, data: ...}`, so the model classification never updates the UI. The underlines you see come exclusively from the client-side keyword classifier in `splitTextIntoDraftSegments`. Treat hover previews as placeholder copy ("`<goal_type> preview: <text>`") — they are not LLM-generated.

---

## 5. Optional: Deploy the `web/` Dashboard (Vercel)

The `web/` directory is scaffolded but not feature-complete. If you want it hosted:

1. `cd web && npm install`
2. Create `web/vercel.json`:

   ```json
   {
     "framework": "vite",
     "buildCommand": "npm run build",
     "outputDirectory": "dist",
     "env": {
       "VITE_API_BASE_URL": "https://promptcompiler-backend.fly.dev",
       "VITE_SUPABASE_URL": "<your supabase url>",
       "VITE_SUPABASE_ANON_KEY": "<your anon key>"
     }
   }
   ```

3. `vercel --prod` (after `vercel login`).

> **Audit deviation.** No code in `web/` currently consumes those env vars in a way that ships a working login form. Treat this section as scaffold-only.

---

## 6. Post-deploy debugging checklist

| Symptom | Where to look | Likely cause |
|---|---|---|
| Underlines render but nothing reaches Fly | SW DevTools console | JWT missing → message validated, fetch returns 401, content script silently drops the `error` (no `activeBindRequestId`). Seed `chrome.storage.local` per §4d. |
| `Cmd+Enter` shows "Bind failed" panel | Ghost panel body | Auth or rate-limit error from `/bind`. Check Fly logs for the matching `X-Request-ID`. |
| Hover previews say "preview: ..." literally | content script `getDraftHoverPreviewBodyText` | Expected — `/enhance` is never called from the client. |
| Tab key navigates away from input | Host site stole the event | Confirm `event.preventDefault()` ran (only fires when `activeInputState.element === event.currentTarget`). On Notion/Slack you may need to focus the input twice. |
| SW restarts kill in-flight streams | Fly logs show abort | `chrome.alarms` keepalive runs every minute (`KEEPALIVE_PERIOD_MINUTES = 1`); the SW may still be evicted between alarms. Streams are not resumed; only the orphaned-state error is replayed. |
| 401 from `/account/status` | Network panel | Same JWT path as above. Popup falls back to `FALLBACK_STATE` and shows the upgrade CTA hidden. |

---

## 7. Quick "is everything wired?" probe

After the backend is deployed and storage is seeded:

```bash
# 1. Health
curl -sS https://<host>/health

# 2. Segment (use a real Supabase access token here)
curl -sS https://<host>/segment \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"segments":["build a dark mode toggle"],"mode":"balanced"}'

# 3. Enhance (SSE)
curl -N https://<host>/enhance \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"section":{"id":"s1","text":"build a dark mode toggle","goal_type":"action"},"siblings":[],"mode":"balanced","project_id":null}'

# 4. Bind (SSE)
curl -N https://<host>/bind \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"sections":[{"canonical_order":4,"goal_type":"action","expansion":"build a dark mode toggle"}],"mode":"balanced"}'
```

If all four return 200 + sensible bodies and Fly logs show the Groq/Anthropic adapter firing, the backend half of V1 is production-shaped.

---

## 8. Summary of deviations to fix before calling V1 "shipped"

These are not deployment blockers but they will surface during real use:

1. **No login UI** — JWT must be injected by hand into `chrome.storage.local`.
2. **`/enhance` is never called from the client** — hover previews and per-section expansions are placeholder copy.
3. **`/segment` responses are dropped client-side** — UI uses local keyword classifier only.
4. **Backend logs leak secret prefixes** on every boot (`backend/src/index.ts:17-28`).
5. **`VITE_API_BASE_URL` env var is declared but not consumed** — backend URL is hard-coded in two files.
6. **Stale-state graph regresses on every keystroke** — `scheduleDebouncedExtraction` resets `acceptedSegmentIndices` after debounce fires, so accepted clauses do not survive further typing (`extension/src/content/index.ts:1832`).
7. **Goal-type colors disagree with `UX_FLOW.md`** — UX_FLOW lists Purple/Teal/Coral/Blue/Amber/Gray; `GOAL_TYPE_PALETTE` ships green/teal/amber/etc. Pick one source of truth.
8. **No ghost text at caret** — only the floating fallback panel is implemented.
9. **Manifest uses `<all_urls>` host_permissions** — fine for testing, will draw Chrome Web Store scrutiny.
