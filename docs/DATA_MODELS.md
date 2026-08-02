# Data Models

> Postgres schema (Supabase), Redis key layout, and storage decisions.

---

## Postgres Schema

Lifecycle marker legend:

- v1 required: must be fully provisioned and protected in Step 1.
- v2-ready: schema exists early to avoid migration churn, but feature behavior may be deferred.

### `users` and `profiles` (v1 required)
Managed by Supabase Auth. Extended with a `profiles` table for app-specific metadata.

Step 1 identity linkage:

- `profiles.id` is the canonical app identity key and maps directly to `auth.users.id`.
- New `auth.users` rows must bootstrap matching `profiles` rows via an `AFTER INSERT` trigger.

```sql
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  tier            text not null default 'free' check (tier in ('free', 'pro', 'byok')),
  encrypted_api_key text,          -- BYOK: encrypted via Supabase vault
  stripe_customer_id text,
  created_at      timestamptz not null default now()
);

-- RLS: users can only read/update their own profile
alter table profiles enable row level security;
create policy "Own profile only" on profiles
  using (auth.uid() = id);
create policy "Own profile writes only" on profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Bootstrap: create a profiles row automatically when Supabase Auth inserts a new user
-- Step 1 planning requires this trigger so tier checks and foreign keys never see a missing profile row.
-- Bootstrap insert must use NEW.id -> public.profiles.id and explicit tier='free'.
-- Trigger function must be SECURITY DEFINER so signup-time bootstrap is not blocked by RLS.
```

Step 1 RLS intent:

- `profiles` ownership checks should explicitly cover reads and writes (`USING` and `WITH CHECK`) for own-row access.
- Profile bootstrap remains trigger-driven; clients do not insert `profiles` rows directly.

---

### `projects` (v2-ready)
Project profiles for context-aware enhancements.

```sql
create table projects (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  name            text not null,
  repo_url        text,
  tech_stack      text[] default '{}',
  system_context  text,         -- free-form project description injected into prompts
  github_repo_id  bigint,       -- GitHub repo ID after OAuth connection
  created_at      timestamptz not null default now()
);

alter table projects enable row level security;
create policy "Own projects only" on projects
  using (auth.uid() = user_id);
create policy "Own project writes only" on projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Step 1 RLS intent:

- `projects` policies should pair `USING` and `WITH CHECK` conditions on `auth.uid() = user_id` to prevent cross-user writes.

---

### `context_chunks` (v2-ready — requires pgvector)
Chunked file content from connected repos. Used for semantic retrieval at enhancement time.

```sql
create extension if not exists vector;

create table context_chunks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  file_path   text not null,
  content     text not null,
  embedding   vector(1536),    -- OpenAI text-embedding-3-small or similar
  created_at  timestamptz not null default now()
);

-- ANN index for fast cosine similarity search
create index on context_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
```

Step 1 RLS intent:

- `context_chunks` ownership must be enforced through the owning `projects.user_id` relationship for both read and write paths.

Retrieval query (top 3 most relevant chunks for a given query):
```sql
select content, file_path
from context_chunks
where project_id = $1
order by embedding <=> $2   -- $2 is the query embedding
limit 3;
```

---

### `enhancement_history` (v1 required)
Log of every completed enhancement. Used for usage tracking, debugging, and future personalization.

```sql
create table enhancement_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  project_id    uuid references projects(id) on delete set null,
  raw_input     text not null,
  final_prompt  text not null,
  mode          text not null check (mode in ('efficiency', 'balanced', 'detailed')),
  model_used    text not null,
  section_count int,
  created_at    timestamptz not null default now()
);

alter table enhancement_history enable row level security;
create policy "Own history only" on enhancement_history
  using (auth.uid() = user_id);
create policy "Own history writes only" on enhancement_history
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Step 1 RLS intent:

- `enhancement_history` policies should pair `USING` and `WITH CHECK` on `auth.uid() = user_id` to prevent cross-user inserts/updates.

---

## TypeScript Contract Shapes (`shared/contracts/`)

Source of truth: `shared/contracts/domain.ts` and `shared/contracts/api.ts`. These were
previously undocumented here — added 2026-08-02.

```typescript
// domain.ts
type GoalType = "context" | "tech_stack" | "constraint" | "action" | "output_format" | "edge_case";

interface Section {
  id: string;
  text: string;
  goal_type: GoalType;
  canonical_order: number;   // slot 1-6, derived from goal_type
  depends_on: string[];      // sanitized DAG of other section ids
  expansion?: string;
  status?: string;
}
```

```typescript
// api.ts
interface SegmentRequest { segments: string[]; mode: Mode; }
interface SegmentResponse { sections: Section[]; }

interface EnhanceRequest {
  section: Pick<Section, "id" | "text" | "goal_type">;
  siblings: Array<Pick<Section, "id" | "text" | "goal_type">>;
  mode: Mode;
  project_id: string | null;
}
// EnhanceResponse streams as SSE — see docs/BACKEND_API.md

interface BindRequestSection extends Pick<Section, "canonical_order" | "goal_type"> {
  expansion: string;
  accepted?: boolean;   // Option E / BIND-DESIGN-1 — omitted defaults to true
}
interface BindRequest { sections: BindRequestSection[]; mode: Mode; }
// BindResponse streams as SSE — see docs/BACKEND_API.md
```

No offsets/character spans travel over the wire — client-side splitting into clause spans
(`splitTextIntoDraftSegments` in the content script) happens before the backend ever sees
text; the backend only classifies/expands/binds already-split segments.

---

## Redis Key Layout

Redis client resolution in backend:

- Use `REDIS_URL` first when present (local/dev runtime via `ioredis`).
- Otherwise use hosted Upstash credentials (`UPSTASH_REDIS_URL` + `UPSTASH_REDIS_TOKEN`).

```
rate:daily:{user_id}
  type: string (integer counter)
  TTL: seconds until midnight UTC
  description: daily enhancement count for rate limiting

rate:auth-token-ip:{encoded_ip}
  type: string (integer counter)
  TTL: 60 seconds
  description: public /auth/token IP abuse-protection window

rate:burst:{user_id}
  type: string (integer counter)
  TTL: short sliding window (default 10s)
  description: per-account burst limiter for protected LLM routes

promptcompiler.tabState.{tab_id}
  type: chrome.storage.session object (extension background)
  TTL: browser session
  description: active per-tab runtime state for bridge recovery/cleanup decisions
```

---

## Storage Decision Summary

| Data | Where | Why |
|---|---|---|
| User accounts + auth | Supabase Auth | Built-in OAuth, JWT, session management |
| App metadata (tier, BYOK key) | Supabase `profiles` | RLS, same DB |
| Projects + context (v2) | Supabase Postgres | Relational, co-located with user data |
| Context embeddings (v2) | Supabase pgvector | Same DB, no separate vector store needed at v1 scale |
| Enhancement history | Supabase Postgres | Queryable, user-owned |
| Rate limit counters | Redis (local via `REDIS_URL` or hosted Upstash) | Atomic INCR, sub-ms, TTL-native |
| Burst guard counters | Redis (local via `REDIS_URL` or hosted Upstash) | Short-window protection for protected LLM routes |
| Extension settings (mode, project) | chrome.storage.local (`promptcompiler.settings`) | Current popup setting persistence surface |
| Per-tab clause state | chrome.storage.session (`promptcompiler.tabState.{tab_id}`, active background bridge) | Runtime state surface that survives SW restarts and clears on browser close |
| Auth session (extension) | chrome.storage.local + chrome.storage.session (`promptcompiler.auth`) | Both areas written on login; background/content read local, avoid localStorage |
| Prompt history + templates | chrome.storage.local (`promptcompiler.history`) | Client-only, no backend — search/copy/delete/pin, rolling cap (50 unpinned / 20 pinned) |
| Onboarding coach-mark seen flag | chrome.storage.local (`promptcompiler.onboarding.seen`) | Gates the one-time first-run coach mark |