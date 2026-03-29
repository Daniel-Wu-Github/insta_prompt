# Backend API

> Bun + Hono API server. All LLM calls are proxied through here.

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

### POST `/enhance`
Expand a single classified section. Returns SSE stream.

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

---

### POST `/segment`
Classify raw text segments into sections with goal_type, canonical_order, and confidence.

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
    { "id": "s1", "text": "build a dark mode toggle", "goal_type": "action", "canonical_order": 4, "confidence": 0.95, "depends_on": [] },
    { "id": "s2", "text": "use react", "goal_type": "tech_stack", "canonical_order": 2, "confidence": 0.98, "depends_on": [] },
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

---

### POST `/auth/token`
Issue or refresh a JWT. Called by the extension after Supabase login.

---

### GET `/projects`
Return the authenticated user's project list. Used by popup project selector. (v2)

---

### POST `/projects/:id/context`
Accept chunked file content + embedding for a project's repo context. (v2)

---

## Middleware Stack

```
Every request →
  1. CORS headers (allow extension origin)
  2. Auth middleware — verify Supabase JWT, extract user_id + tier
  3. Rate limit middleware — Redis INCR on rate:daily:{user_id}, TTL 24h
  4. Tier middleware — enforce model routing rules (free → Groq only)
  5. Route handler
```

```typescript
// backend/src/middleware/auth.ts
export const authMiddleware = async (c: Context, next: Next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return c.json({ error: 'Unauthorized' }, 401);

  c.set('userId', data.user.id);
  c.set('tier', data.user.user_metadata.tier ?? 'free');
  await next();
};
```

---

## Rate Limits

| Tier | Daily Limit | Models Available |
|---|---|---|
| Free | 30 enhancements/day | Groq Llama only |
| Pro | Unlimited | Haiku + Sonnet + Groq |
| BYOK | Unlimited | Any (user's key) |

Redis key: `rate:daily:{user_id}` — INCR on each call, TTL set to end of UTC day.

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
│   │   ├── llm.ts            # LLM client + model router
│   │   ├── prompts/          # System prompt templates per goal_type + mode
│   │   │   ├── action.ts
│   │   │   ├── constraint.ts
│   │   │   ├── tech_stack.ts
│   │   │   └── ...
│   │   ├── context.ts        # Project context retrieval (v2)
│   │   └── history.ts        # Write to enhancement_history table
│   └── middleware/
│       ├── auth.ts
│       ├── ratelimit.ts
│       └── tier.ts
├── package.json
└── tsconfig.json
```