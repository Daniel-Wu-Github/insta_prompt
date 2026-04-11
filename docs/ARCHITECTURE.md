# Architecture

> Full system architecture for PromptCompiler.

---

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│  CLIENT LAYER                                            │
│  Chrome Extension  │  VS Code Extension  │  Web Dashboard│
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS + SSE streaming
┌────────────────────▼────────────────────────────────────┐
│  API GATEWAY  (Bun + Hono)                               │
│  Auth middleware · Rate limiting · Mode routing          │
└──────────┬──────────────────────────┬───────────────────┘
           │                          │
┌──────────▼──────────┐  ┌────────────▼────────────────┐
│  LLM SERVICE        │  │  CONTEXT SERVICE (v2)        │
│  Groq / Anthropic   │  │  GitHub OAuth · pgvector     │
│  Prompt assembler   │  │  Repo chunking + retrieval   │
└──────────┬──────────┘  └─────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────┐
│  PERSISTENCE                                             │
│  PostgreSQL (Supabase) · Redis (Upstash) · pgvector (v2) │
└─────────────────────────────────────────────────────────┘
```

---

## Key Architectural Decisions

### 1. Proxy Model (not BYOK-first)
All LLM calls go through the PromptCompiler backend — the extension never calls Anthropic/Groq/OpenAI directly. This enables:
- Rate limiting and tier enforcement
- Key hiding (user never sees the API key)
- Free tier powered by Groq at $0 COGS
- Centralized usage tracking and billing

BYOK is available as a paid add-on, not the primary model.

### 2. Groq Free Tier for Free Users
Free tier enhancements route to Groq's Llama 3.3 70B (~80ms, ~$0/call). This makes the free tier sustainable indefinitely with no per-user cost until upgrade. Pro tier upgrades to Claude Haiku/Sonnet.

### 3. Supabase from Day One
Supabase provides: Postgres, Auth (including GitHub OAuth for v2), Row Level Security, and the pgvector extension (for v2 context retrieval). No separate auth service needed.

### 4. WXT for Extension Build
WXT (Web Extension Tools) is Vite configured for MV3. Provides HMR during dev, TypeScript, and multi-entry-point builds (content script + background SW + popup) without manual Vite config.

### 5. No Inline DOM Replacement Until Commit
Accepted sections are greyed out visually but the original text is NOT replaced in the DOM until the user presses Enter after the binding pass. This prevents dirty-state cascade when users edit upstream clauses mid-flow.

### 6. Schema Designed for v2 from v1
The `context_chunks` table, `project_id` foreign keys, and `pgvector` extension are provisioned from the start even though v1 doesn't populate them. Schema migrations on production are painful; adding empty tables is free.

---

## Chrome Extension Layer

See [`EXTENSION.md`](EXTENSION.md) for full deep-dive.

### Three Isolated JS Environments (MV3)

```
Content Script     → Reads/writes DOM, renders ghost text, handles hotkeys
                   → Cannot make cross-origin fetch (page CSP blocks it)
                   ↕ chrome.runtime.Port
Background SW      → Makes all API calls (no CSP restrictions)
                   → Manages per-tab state in chrome.storage.session
                   → Gets killed after ~30s idle — use chrome.alarms keepalive
                   ↕ chrome.storage.sync
Popup              → React UI for mode toggle, project selector, account status
```

---

## Backend API Layer

**Runtime:** Bun + Hono + TypeScript  
**Deploy:** Fly.io (global regions for low streaming latency)

### Endpoints

| Method | Path | Type | Purpose |
|---|---|---|---|
| POST | `/enhance` | SSE stream | Expand a single section |
| POST | `/segment` | JSON | Classify raw segments |
| POST | `/bind` | SSE stream | Final assembly pass |
| POST | `/auth/token` | JSON | Refresh Supabase session and return verified app auth context |
| GET | `/projects` | JSON | List user projects (v2) |
| POST | `/projects/:id/context` | JSON | Store repo context (v2) |

### Middleware Stack
```
Protected request (not `/auth/token`) → Auth (JWT validation)
            → Rate limit check (Redis counter by user_id)
            → Tier check (free: Groq only, pro: full routing)
            → Route handler
            → LLM orchestrator
            → SSE stream response
```

`/auth/token` is public and remains outside the protected middleware chain; Step 2 adds explicit IP-based rate limiting for this endpoint.

---

## Database Layer

**Provider:** Supabase (Postgres 15 + pgvector)  
**Cache:** Upstash Redis

### Core Tables

```sql
auth.users          id, email, created_at
profiles            id, tier, encrypted_api_key, stripe_customer_id, created_at
projects            id, user_id, name, repo_url, tech_stack[], system_context
context_chunks      id, project_id, file_path, content, embedding vector(1536)
enhancement_history id, user_id, project_id, raw_input, final_prompt, mode, model_used, created_at
```

### Redis Keys

```
rate:daily:{user_id}        → int, TTL 24h (daily enhancement count)
session:{user_id}           → JSON, TTL 7d (cached user record)
pending:{tab_id}            → JSON, TTL 30m (in-flight section state)
```

---

## LLM Service Layer

See [`LLM_ROUTING.md`](LLM_ROUTING.md) for full routing logic.

### Request Flow

```
/enhance called
  → read tier from verified auth context backed by profiles
  → read mode from request body
  → select model (see routing table)
  → inject project context if project_id present (v2)
  → assemble system prompt (goal_type + mode + context)
  → stream response back via SSE
  → log to enhancement_history
```

### Prompt Assembly

The system prompt changes per `goal_type` and `mode`. Each combination has a specific instruction template stored in `backend/src/services/prompts/`.

---

## v2 Context Service

GitHub OAuth flow → repo access → file tree fetch → chunking + embedding → pgvector storage → semantic retrieval at enhancement time.

Only the most semantically relevant chunks (top-3 cosine similarity) are injected into the expansion prompt to avoid token budget blowout.

Architecture is stubbed in v1 schema but not implemented until v2.