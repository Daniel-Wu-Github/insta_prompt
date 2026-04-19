# Backend API

> Bun + Hono API server. All LLM calls are proxied through here.

Step scope note:

- Step 1 locks auth/session foundations (`/auth/token` contract + auth context population).
- Step 2 adds rate-limit and tier-enforcement behavior.
- Step 3+ implements full `/segment`, `/enhance`, and `/bind` model-routing behavior.

Current implementation snapshot (main, Step 0-2):

- `/segment`, `/enhance`, and `/bind` currently keep deterministic placeholder business behavior after validation and middleware checks.
- `/segment` maps each input segment to `goal_type = action`, `canonical_order = 4`, and `confidence = 0.5`.
- `/enhance` and `/bind` currently stream tokenized placeholder output in the standard SSE envelope.

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
| POST | `/segment` | Step 3+ | Production classifier behavior lands after Step 1 foundations |
| POST | `/enhance` | Step 3+ | Production model routing and prompt expansion lands after Step 1 foundations |
| POST | `/bind` | Step 3+ | Production bind orchestration lands after Step 1 foundations |
| GET | `/projects` | v2-ready | Schema and contracts may exist before full v2 behavior |
| POST | `/projects/:id/context` | v2-ready | Schema and contracts may exist before full v2 behavior |

BYOK does not introduce alternate request or response shapes for `/segment`, `/enhance`, or `/bind`. The same endpoint contracts apply across free, pro, and BYOK; only the backend provider/model source selected after auth, rate-limit, and tier checks changes.

Step 3 service boundary contract: route handlers pass resolved BYOK preferences into the pure model-router surface and serialize SSE at the transport boundary. Provider adapters emit normalized object events and do not emit raw SSE strings directly.

### POST `/enhance`
Expand a single classified section. Returns SSE stream.

Current Step 0-2 behavior: validates the request and streams a deterministic placeholder expansion.

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

Current Step 0-2 behavior: deterministic placeholder classifier.

Step 4 contract note: endpoint transport and JSON shape stay the same while placeholder classifier internals are replaced.
Backend normalization responsibilities in Step 4: emit only `context`, `tech_stack`, `constraint`, `action`, `output_format`, `edge_case`, and derive `canonical_order` from normalized `goal_type`.

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
    { "id": "s1", "text": "build a dark mode toggle", "goal_type": "action", "canonical_order": 4, "confidence": 0.5, "depends_on": [] },
    { "id": "s2", "text": "use react", "goal_type": "action", "canonical_order": 4, "confidence": 0.5, "depends_on": [] },
    { "id": "s3", "text": "deploy to vercel", "goal_type": "action", "canonical_order": 4, "confidence": 0.5, "depends_on": [] }
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
│   │   ├── context.ts        # Project context lookup (v2-ready placeholder)
│   │   ├── history.ts        # Enhancement history helpers (v2-ready)
│   │   ├── llm.ts            # LLM router/adapter surface (Step 3+)
│   │   ├── rateLimit.ts      # Redis quota primitives (daily + auth-token IP)
│   │   └── supabase.ts       # Supabase auth/session verification
│   └── middleware/
│       ├── auth.ts
│       ├── ratelimit.ts
│       └── tier.ts
├── package.json
└── tsconfig.json
```