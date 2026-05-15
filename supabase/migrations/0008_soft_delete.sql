-- 0008_soft_delete.sql
-- Soft-delete columns on contacts + assets. Reads filter `deleted_at IS NULL`;
-- the "delete" UX sets a timestamp; "undo" sets it back to NULL.

alter table public.contacts add column if not exists deleted_at timestamptz;
alter table public.assets   add column if not exists deleted_at timestamptz;

-- Partial indexes optimize the live-only queries.
create index if not exists contacts_alive_idx on public.contacts (user_id, updated_at desc)
  where deleted_at is null;
create index if not exists assets_alive_idx   on public.assets   (user_id, updated_at desc)
  where deleted_at is null;

-- Update hybrid_search_* to filter soft-deleted rows.
create or replace function public.hybrid_search_contacts(
  query_text text,
  query_embedding halfvec(1536),
  match_count int default 10,
  full_text_weight float default 1.0,
  semantic_weight float default 1.0,
  rrf_k int default 50,
  min_warmth int default null,
  required_tags text[] default null
) returns setof public.contacts
language sql stable
security invoker
set search_path = public, pg_temp
as $$
  with fts as (
    select id,
           row_number() over (
             order by ts_rank_cd(fts, websearch_to_tsquery('simple', query_text)) desc
           ) as rank
      from public.contacts
     where fts @@ websearch_to_tsquery('simple', query_text)
       and deleted_at is null
       and (min_warmth is null or warmth <= min_warmth)
       and (required_tags is null or tags @> required_tags)
     limit least(match_count * 2, 100)
  ),
  sem as (
    select id,
           row_number() over (order by embedding <=> query_embedding) as rank
      from public.contacts
     where embedding is not null
       and deleted_at is null
       and (min_warmth is null or warmth <= min_warmth)
       and (required_tags is null or tags @> required_tags)
     order by embedding <=> query_embedding
     limit least(match_count * 2, 100)
  ),
  fused as (
    select coalesce(fts.id, sem.id) as id,
           coalesce(1.0 / (rrf_k + fts.rank), 0) * full_text_weight +
           coalesce(1.0 / (rrf_k + sem.rank), 0) * semantic_weight as score
      from fts
      full outer join sem on fts.id = sem.id
  )
  select c.*
    from public.contacts c
    join fused f on f.id = c.id
   order by f.score desc
   limit match_count;
$$;

create or replace function public.hybrid_search_assets(
  query_text text,
  query_embedding halfvec(1536),
  match_count int default 10,
  full_text_weight float default 1.0,
  semantic_weight float default 1.0,
  rrf_k int default 50,
  required_tags text[] default null
) returns setof public.assets
language sql stable
security invoker
set search_path = public, pg_temp
as $$
  with fts as (
    select id,
           row_number() over (
             order by ts_rank_cd(fts, websearch_to_tsquery('simple', query_text)) desc
           ) as rank
      from public.assets
     where fts @@ websearch_to_tsquery('simple', query_text)
       and deleted_at is null
       and (required_tags is null or tags @> required_tags)
     limit least(match_count * 2, 100)
  ),
  sem as (
    select id,
           row_number() over (order by embedding <=> query_embedding) as rank
      from public.assets
     where embedding is not null
       and deleted_at is null
       and (required_tags is null or tags @> required_tags)
     order by embedding <=> query_embedding
     limit least(match_count * 2, 100)
  ),
  fused as (
    select coalesce(fts.id, sem.id) as id,
           coalesce(1.0 / (rrf_k + fts.rank), 0) * full_text_weight +
           coalesce(1.0 / (rrf_k + sem.rank), 0) * semantic_weight as score
      from fts
      full outer join sem on fts.id = sem.id
  )
  select a.*
    from public.assets a
    join fused f on f.id = a.id
   order by f.score desc
   limit match_count;
$$;
