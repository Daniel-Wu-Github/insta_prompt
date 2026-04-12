alter table public.profiles enable row level security;
alter table public.enhancement_history enable row level security;
alter table public.projects enable row level security;
alter table public.context_chunks enable row level security;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = id);

create policy "profiles_delete_own"
  on public.profiles
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = id);

create policy "enhancement_history_select_own"
  on public.enhancement_history
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "enhancement_history_insert_own"
  on public.enhancement_history
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "enhancement_history_update_own"
  on public.enhancement_history
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "enhancement_history_delete_own"
  on public.enhancement_history
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "projects_select_own"
  on public.projects
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "projects_insert_own"
  on public.projects
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "projects_update_own"
  on public.projects
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "projects_delete_own"
  on public.projects
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "context_chunks_select_own"
  on public.context_chunks
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.projects p
      where p.id = context_chunks.project_id
        and p.user_id = (select auth.uid())
    )
  );

create policy "context_chunks_insert_own"
  on public.context_chunks
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.projects p
      where p.id = context_chunks.project_id
        and p.user_id = (select auth.uid())
    )
  );

create policy "context_chunks_update_own"
  on public.context_chunks
  for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.projects p
      where p.id = context_chunks.project_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.projects p
      where p.id = context_chunks.project_id
        and p.user_id = (select auth.uid())
    )
  );

create policy "context_chunks_delete_own"
  on public.context_chunks
  for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.projects p
      where p.id = context_chunks.project_id
        and p.user_id = (select auth.uid())
    )
  );