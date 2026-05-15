-- 0007_pgmq_helpers.sql
-- Public-schema wrappers around pgmq functions so the embed-batch Edge
-- Function can drive the queue via supabase-js RPC (PostgREST only exposes
-- `public` + `graphql_public` schemas by default).
--
-- Wrappers run as SECURITY DEFINER (function owner = postgres). Only the
-- service_role calls these — they're not granted to authenticated users.

create or replace function public.read_embedding_jobs(
  p_qty int default 50,
  p_vt int default 60
)
returns table(msg_id bigint, message jsonb)
language sql
security definer
set search_path = public, pg_temp
as $$
  select msg_id, message
    from pgmq.read('embedding_jobs', p_vt, p_qty);
$$;

create or replace function public.delete_embedding_job(p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select pgmq.delete('embedding_jobs', p_msg_id);
$$;

-- service_role-only by default (no grant to authenticated).
revoke execute on function public.read_embedding_jobs(int, int) from public;
revoke execute on function public.delete_embedding_job(bigint) from public;
grant execute on function public.read_embedding_jobs(int, int) to service_role;
grant execute on function public.delete_embedding_job(bigint) to service_role;
