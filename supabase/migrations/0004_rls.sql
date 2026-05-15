-- 0004_rls.sql
-- Row-Level Security: every table is owner-scoped. The `authenticated` role gets full
-- CRUD on user-data tables; RLS filters by auth.uid() = user_id. This is the security
-- model the agent's full-SQL tools rely on (max capability, bounded by RLS).

alter table public.contacts      enable row level security;
alter table public.assets        enable row level security;
alter table public.chat_threads  enable row level security;
alter table public.chat_messages enable row level security;

-- contacts
create policy contacts_select on public.contacts for select using (auth.uid() = user_id);
create policy contacts_insert on public.contacts for insert with check (auth.uid() = user_id);
create policy contacts_update on public.contacts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy contacts_delete on public.contacts for delete using (auth.uid() = user_id);

-- assets
create policy assets_select on public.assets for select using (auth.uid() = user_id);
create policy assets_insert on public.assets for insert with check (auth.uid() = user_id);
create policy assets_update on public.assets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy assets_delete on public.assets for delete using (auth.uid() = user_id);

-- chat_threads
create policy chat_threads_select on public.chat_threads for select using (auth.uid() = user_id);
create policy chat_threads_insert on public.chat_threads for insert with check (auth.uid() = user_id);
create policy chat_threads_update on public.chat_threads for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy chat_threads_delete on public.chat_threads for delete using (auth.uid() = user_id);

-- chat_messages
create policy chat_messages_select on public.chat_messages for select using (auth.uid() = user_id);
create policy chat_messages_insert on public.chat_messages for insert with check (auth.uid() = user_id);
create policy chat_messages_update on public.chat_messages for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy chat_messages_delete on public.chat_messages for delete using (auth.uid() = user_id);

-- Grant table permissions so SECURITY INVOKER SQL helper functions (next migration) work.
-- RLS still filters per-row; this only unlocks the schema-level CRUD.
grant select, insert, update, delete on public.contacts, public.assets,
                                       public.chat_threads, public.chat_messages
   to authenticated;
