# Backend API

> Bun + Hono API server. All LLM calls are proxied through here.

Step scope note:

- Step 1 locks auth/session foundations (`/auth/token` contract + auth context population).
- Step 2 adds rate-limit and tier-enforcement behavior.
- Step 3+ provides routing/prompt/provider service-layer contracts used by Step 4-6 route handlers.

Current implementation snapshot (main, Step 0-7):

- `/segment` validates input, classifies through provider-backed intermediate output, and normalizes taxonomy/canonical order/dependencies with deterministic fallback behavior.
- `/enhance` validates payloads, resolves mode/tier model routing, builds prompt handoff, and streams provider output through the shared SSE envelope.
- `/bind` canonicalizes server-side section order, streams provider output through shared SSE semantics, and writes exactly one successful `enhancement_history` row on successful completion.
- Step 7 background transport bridge is active in the extension service worker; content script UX instrumentation remains a separate Step 8+ concern.

---

## Stack

| Component | Tech |
|---|---|
| Runtime | Bun |
| Framework | Hono |
| Language | TypeScript |
| Auth | Supabase JWT (verified server-side) |
| Cache / Rate limits | Upstash Redis |
| Deploy | Fly.io (global regions) |

---

## Endpoints

### Endpoint Step Map

| Method | Path | Step | Notes |
|---|---|---|---|
| POST | `/auth/token` | Step 1 | Public refresh-session proxy; no custom JWT issuer |
| POST | `/segment` | Step 4 | Production classifier behavior is active |
| POST | `/enhance` | Step 5 | Production model routing and prompt expansion are active |
| POST | `/bind` | Step 6 | Production bind orchestration and history persistence are active |
| GET | `/projects` | v2-ready | Schema and contracts may exist before full v2 behavior |
| POST | `/projects/:id/context` | v2-ready | Schema and contracts may exist before full v2 behavior |

BYOK does not introduce alternate request or response shapes for `/segment`, `/enhance`, or `/bind`. The same endpoint contracts apply across free, pro, and BYOK; only the backend provider/model source selected after auth, rate-limit, and tier checks changes.

Step 3 service boundary contract: route handlers pass resolved BYOK preferences into the pure model-router surface and serialize SSE at the transport boundary. Provider adapters emit normalized object events and do not emit raw SSE strings directly.

Current runtime note: BYOK preference injection into production `/enhance` and `/bind` handlers is not fully wired yet; route contracts remain stable and tier checks still apply.

### POST `/enhance`
Expand a single classified section. Returns SSE stream.

Current runtime behavior: validates request shape, routes model selection via tier/mode, injects sibling context, and streams provider tokens through the shared SSE envelope.

**Request**
```json
{
  "section": {
    "id": "s1",
    "text": "build a dark mode toggle",
    "goal_type": "action"
  },
  "siblings": [
    { "id": "s2", "text": "use react", "goal_type": "tech_stack" }
  ],
  "mode": "balanced",
  "project_id": null
}
```

`project_id` is nullable. Use `null` when no project context is available.

**Response** — `text/event-stream`
```
data: {"type":"token","data":"Implement a fully "}
data: {"type":"token","data":"functional dark/light "}
data: {"type":"done"}
```

Streaming rule: the response status and headers are committed when the first SSE frame is written. After streaming begins, HTTP status is immutable; mid-stream provider failures must be represented only as SSE `error` events followed by a graceful stream close.

---

### POST `/segment`
Classify raw text segments into sections with goal_type, canonical_order, and confidence.

Current runtime behavior: provider-backed classification plus deterministic normalization.

Step 4 contract note: endpoint transport and JSON shape remain stable while classifier internals normalize to allowed taxonomy and canonical slots.
Backend normalization responsibilities: emit only `context`, `tech_stack`, `constraint`, `action`, `output_format`, `edge_case`, and derive `canonical_order` from normalized `goal_type`.

**Request**
```json
{
  "segments": ["build a dark mode toggle", "use react", "deploy to vercel"],
  "mode": "balanced"
}
```

**Response**
```json
{
  "sections": [
    { "id": "s1", "text": "build a dark mode toggle", "goal_type": "action", "canonical_order": 4, "confidence": 0.93, "depends_on": [] },
    { "id": "s2", "text": "use react", "goal_type": "tech_stack", "canonical_order": 2, "confidence": 0.97, "depends_on": [] },
    { "id": "s3", "text": "deploy to vercel", "goal_type": "output_format", "canonical_order": 5, "confidence": 0.82, "depends_on": ["s1"] }
  ]
}
```

---

### POST `/bind`
Assemble all accepted expanded sections into one coherent prompt. Returns SSE stream.

**Request**
```json
{
  "sections": [
    { "canonical_order": 2, "goal_type": "tech_stack", "expansion": "React 18 with TypeScript..." },
    { "canonical_order": 4, "goal_type": "action", "expansion": "Implement a dark/light mode toggle..." }
  ],
  "mode": "balanced"
}
```

**Response** — `text/event-stream` (same SSE format as `/enhance`)

The same streaming-status rule applies here: finalize status and headers before the first frame is written, and keep mid-stream failures in the SSE envelope instead of switching to a new HTTP response.

---

### POST `/auth/token`
Refresh a Supabase session and return the verified token plus app context. Called by the extension after Supabase login.

Route class: public endpoint (no Authorization header required).

**Request**
```json
{
  "refresh_token": "<supabase refresh token>"
}
```

**Response**
```json
{
  "token": "<supabase access token>",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "<rotated refresh token or null>",
  "user_id": "<supabase user id>",
  "tier": "free"
}
```

**Behavior**
- Require a non-empty `refresh_token` request field; return `400` for missing/empty values before any Supabase call.
- Apply a Step 2 IP limiter (`20 requests / 60 seconds`) keyed by trusted proxy IP (`fly-client-ip`, fallback `x-forwarded-for`).
- Return `429` with `Retry-After` when the IP limiter is exceeded.
- Keep successful and throttled `/auth/token` responses free of `X-RateLimit-*` headers.
- Use `supabase.auth.refreshSession()` server-side to refresh the Supabase session.
- Verify the refreshed access token with `supabase.auth.getUser()` before returning a response.
- Rely on the `auth.users` trigger to create the `profiles` row on first signup.
- Return only Supabase-derived credentials and app context needed by the extension background worker.
- Do not mint custom JWTs or alternate credential formats.

---

### GET `/projects`
Return the authenticated user's project list. Used by popup project selector. (v2)

---

### POST `/projects/:id/context`
Accept chunked file content + embedding for a project's repo context. (v2)

---

## Middleware Stack

```
Every protected request (not `/auth/token`) →
  1. CORS headers (allow extension origin)
  2. Auth middleware — verify Supabase JWT, extract user_id + tier (Step 1 context population)
  3. Rate limit middleware — Redis INCR on rate:daily:{user_id}, reset at next UTC midnight with missing-TTL self-heal (Step 2 enforcement)
  4. Tier middleware — enforce tier eligibility policy from verified auth context (401/403); model routing remains in Step 3
  5. Route handler
```

`/auth/token` remains outside the protected middleware chain because the refresh token in the request body is the credential for that exchange.

For Step 2 IP-based abuse controls on `/auth/token`, extract client IP from trusted proxy headers (`fly-client-ip`, fallback `x-forwarded-for`) rather than raw socket IP.

Auth context source of truth:

- `authMiddleware` validates `Authorization: Bearer <token>` and verifies the token against Supabase.
- On success, middleware sets `userId` and `tier` in request context for downstream middlewares.
- Unauthorized requests return deterministic `401` envelopes.

---

## Rate Limits

| Tier | Daily Limit | Models Available |
|---|---|---|
| Free | 30 enhancements/day | Groq Llama only |
| Pro | Unlimited | Haiku + Sonnet + Groq |
| BYOK | Unlimited | Any (user's key) |

Redis keys:

- `rate:daily:{user_id}` — free-tier protected-route quota, reset to next UTC midnight.
- `rate:auth-token-ip:{encoded_ip}` — public `/auth/token` IP quota, `20` requests per `60` seconds.
- `rate:burst:{user_id}` — short-window per-account burst guard for protected LLM routes.

---

## Environment Variables

```env
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# LLM providers
ANTHROPIC_API_KEY=
GROQ_API_KEY=

# Redis
# local/dev (preferred when set)
REDIS_URL=

# hosted
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=

# App
PORT=3000
JWT_SECRET=
```

---

## Folder Structure

```
backend/
├── src/
│   ├── index.ts              # Hono app entry, middleware registration
│   ├── routes/
│   │   ├── enhance.ts        # POST /enhance
│   │   ├── segment.ts        # POST /segment
│   │   ├── bind.ts           # POST /bind
│   │   ├── auth.ts           # POST /auth/token
│   │   └── projects.ts       # GET/POST /projects (v2)
│   ├── services/
│   │   ├── context.ts        # Project context lookup helper (`project_id` nullable)
│   │   ├── history.ts        # Enhancement history helpers (v2-ready)
│   │   ├── llm.ts            # LLM router/adapter surface (Step 3+)
│   │   ├── rateLimit.ts      # Redis quota primitives (daily + auth-token IP + burst)
│   │   └── supabase.ts       # Supabase auth/session verification
│   └── middleware/
│       ├── auth.ts
│       ├── ratelimit.ts
│       └── tier.ts
├── package.json
└── tsconfig.json
```