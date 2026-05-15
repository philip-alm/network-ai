-- 0005_sql_helpers.sql
-- Agent's SQL tools: two general-purpose functions (query_sql, mutate_sql) and the
-- pre-built hybrid_search functions for the search_contacts / search_assets tools.
--
-- All functions are SECURITY INVOKER + statement_timeout. The agent gets full
-- SQL capability *within* RLS — there is no path to other users' rows.

-- ---------------------------------------------------------------------------
-- query_sql: arbitrary SELECT/WITH. Returns a JSONB array of result rows.
-- ---------------------------------------------------------------------------
create or replace function public.query_sql(query text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  lc text := lower(ltrim(query));
begin
  set local statement_timeout = '10s';
  if not (lc like 'select%' or lc like 'with%') then
    raise exception 'query_sql only accepts SELECT or WITH statements; got: %', left(query, 40);
  end if;
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', query) into result;
  return result;
end;
$$;

grant execute on function public.query_sql(text) to authenticated;

-- ---------------------------------------------------------------------------
-- mutate_sql: INSERT / UPDATE / DELETE. Caller passes the statement INCLUDING
-- a RETURNING clause so the function can capture and return affected rows.
-- ---------------------------------------------------------------------------
create or replace function public.mutate_sql(query text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  lc text := lower(ltrim(query));
begin
  set local statement_timeout = '10s';
  if not (lc like 'insert%' or lc like 'update%' or lc like 'delete%') then
    raise exception 'mutate_sql only accepts INSERT / UPDATE / DELETE statements; got: %', left(query, 40);
  end if;
  execute format('with q as (%s) select coalesce(jsonb_agg(t), ''[]''::jsonb) from q t', query) into result;
  return result;
end;
$$;

grant execute on function public.mutate_sql(text) to authenticated;

-- ---------------------------------------------------------------------------
-- hybrid_search_contacts: RRF over FTS + pgvector. Applies structured filters
-- (min_warmth, required_tags) INSIDE both CTEs so they participate in fusion.
-- ---------------------------------------------------------------------------
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
       and (min_warmth is null or warmth <= min_warmth)
       and (required_tags is null or tags @> required_tags)
     limit least(match_count * 2, 100)
  ),
  sem as (
    select id,
           row_number() over (order by embedding <=> query_embedding) as rank
      from public.contacts
     where embedding is not null
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

grant execute on function public.hybrid_search_contacts(text, halfvec, int, float, float, int, int, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- hybrid_search_assets: same shape, scoped to public.assets.
-- ---------------------------------------------------------------------------
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
       and (required_tags is null or tags @> required_tags)
     limit least(match_count * 2, 100)
  ),
  sem as (
    select id,
           row_number() over (order by embedding <=> query_embedding) as rank
      from public.assets
     where embedding is not null
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

grant execute on function public.hybrid_search_assets(text, halfvec, int, float, float, int, text[]) to authenticated;
