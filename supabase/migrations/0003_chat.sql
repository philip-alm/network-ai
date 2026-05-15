-- 0003_chat.sql
-- Chat threads and the messages within them. Messages are stored in OpenAI-compatible
-- shape (role + content), so the same row can carry assistant text, tool_calls, or
-- tool_results without a separate table per kind.

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_threads_user_recent_idx
  on public.chat_threads (user_id, updated_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool', 'system')),
  -- content is JSONB so we can carry text OR { tool_calls: [...] } OR { tool_call_id, result }
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index chat_messages_thread_idx
  on public.chat_messages (thread_id, created_at);

-- Bump the thread's updated_at when a new message lands so MRU sorting in the UI is correct.
create or replace function public.bump_thread_updated_at() returns trigger
language plpgsql as $$
begin
  update public.chat_threads
     set updated_at = now()
   where id = new.thread_id;
  return new;
end; $$;

create trigger chat_messages_bump_thread after insert on public.chat_messages
  for each row execute function public.bump_thread_updated_at();
