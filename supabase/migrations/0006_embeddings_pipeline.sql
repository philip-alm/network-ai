-- 0006_embeddings_pipeline.sql
-- Embedding pipeline: triggers on contacts/assets enqueue jobs into pgmq.
-- A pg_cron schedule invokes the embed-batch Edge Function every 10 seconds,
-- which drains the queue, calls OpenRouter embeddings, and writes back.
--
-- NOTE: The cron.schedule call is intentionally placed in this migration but
-- references a placeholder URL. The deploy step (or `supabase secrets set ...`)
-- updates the URL + service-role bearer token. See supabase/CLAUDE.md.

-- Create the queue. `pgmq.create` is idempotent.
select pgmq.create('embedding_jobs');

-- Trigger function: enqueue a job when the embeddable text of a row changes.
create or replace function public.enqueue_embedding_job() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  text_changed boolean;
begin
  if tg_op = 'INSERT' then
    text_changed := true;
  elsif tg_op = 'UPDATE' then
    if tg_table_name = 'contacts' then
      text_changed := (new.name      is distinct from old.name)
                   or (new.notes     is distinct from old.notes)
                   or (new.city      is distinct from old.city)
                   or (new.tags      is distinct from old.tags);
    elsif tg_table_name = 'assets' then
      text_changed := (new.name         is distinct from old.name)
                   or (new.description  is distinct from old.description)
                   or (new.availability is distinct from old.availability)
                   or (new.tags         is distinct from old.tags);
    else
      text_changed := false;
    end if;
  else
    text_changed := false;
  end if;

  if text_changed then
    perform pgmq.send(
      'embedding_jobs',
      jsonb_build_object(
        'table',   tg_table_name,
        'id',      new.id,
        'user_id', new.user_id
      )
    );
  end if;
  return new;
end;
$$;

create trigger contacts_enqueue_embedding
  after insert or update on public.contacts
  for each row execute function public.enqueue_embedding_job();

create trigger assets_enqueue_embedding
  after insert or update on public.assets
  for each row execute function public.enqueue_embedding_job();

-- Helper: count jobs currently in the queue. Used by tests + verify scripts.
create or replace function public.embedding_queue_depth() returns bigint
language sql stable
security definer
set search_path = public, pg_temp
as $$
  select count(*) from pgmq.q_embedding_jobs;
$$;

grant execute on function public.embedding_queue_depth() to authenticated;

-- Helper: count jobs in the queue for a specific user. Lets tests assert
-- enqueue behavior without being affected by other test users' jobs.
create or replace function public.embedding_queue_depth_for_user(p_user_id uuid)
returns bigint
language sql stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)
    from pgmq.q_embedding_jobs
   where (message ->> 'user_id')::uuid = p_user_id;
$$;

grant execute on function public.embedding_queue_depth_for_user(uuid) to authenticated;
