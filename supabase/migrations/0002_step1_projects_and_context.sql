create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  repo_url text,
  tech_stack text[] default '{}',
  system_context text,
  github_repo_id bigint,
  created_at timestamptz not null default now()
);

alter table public.enhancement_history
  add constraint enhancement_history_project_id_fkey
  foreign key (project_id)
  references public.projects(id)
  on delete set null;

create extension if not exists vector;

create table public.context_chunks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_path text not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index context_chunks_embedding_ivfflat_idx
  on public.context_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);