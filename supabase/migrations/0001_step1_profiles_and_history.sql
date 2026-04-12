create extension if not exists vector;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'pro', 'byok')),
  encrypted_api_key text,
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, tier, created_at)
  values (new.id, 'free', now());
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create table public.enhancement_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid,
  raw_input text not null,
  final_prompt text not null,
  mode text not null check (mode in ('efficiency', 'balanced', 'detailed')),
  model_used text not null,
  section_count int,
  created_at timestamptz not null default now()
);