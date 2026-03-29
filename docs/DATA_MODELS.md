# Data Models

> Postgres schema (Supabase), Redis key layout, and storage decisions.

---

## Postgres Schema

### `users`
Managed by Supabase Auth. Extended with a `profiles` table for app-specific metadata.

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
```

---

### `projects` (v2)
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
```

---

### `context_chunks` (v2 — requires pgvector)
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

Retrieval query (top 3 most relevant chunks for a given query):
```sql
select content, file_path
from context_chunks
where project_id = $1
order by embedding <=> $2   -- $2 is the query embedding
limit 3;
```

---

### `enhancement_history`
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
```

---

## Redis Key Layout

All Redis via Upstash (serverless Redis, no persistent connection needed from Bun).

```
rate:daily:{user_id}
  type: string (integer counter)
  TTL: seconds until midnight UTC
  description: daily enhancement count for rate limiting

session:{user_id}
  type: string (JSON)
  TTL: 7 days
  description: cached user record (tier, limits) to avoid Supabase round-trips

pending:{tab_id}:{section_id}
  type: string (JSON)
  TTL: 30 minutes
  description: in-flight enhancement state (survives SW restarts)
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
| Rate limit counters | Upstash Redis | Atomic INCR, sub-ms, TTL-native |
| Session cache | Upstash Redis | Avoid Supabase round-trips on every request |
| Extension settings (mode, project) | chrome.storage.sync | Persists across devices, no server round-trip |
| Per-tab clause state | chrome.storage.session | Survives SW restarts, cleared on browser close |
| JWT (extension) | chrome.storage.session | Secure, not localStorage |