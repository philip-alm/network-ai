-- 0015_strip_embeddings_from_tool_results.sql
--
-- The agent's `find` tool was leaking the 1536-float `embedding` column
-- in every returned row via `to_jsonb(c)`. A single 50-row find returned
-- ~900 KB of vector data, which tokenizes to ~225k LLM tokens — past
-- every provider's context window (Cerebras 131k, Groq 131k, Fireworks
-- 131k, OpenRouter Gemini 1M but slow). The agent crashed with
-- `context_length_exceeded` on its first or second turn.
--
-- The LLM has zero use for raw embeddings — they're for server-side
-- ranking, not for the agent's reasoning. Strip them at the source:
-- `to_jsonb(c) - 'embedding' - 'embedding_model' - 'embedding_generated_at'`
-- removes the three vector-pipeline fields before returning. Also drops
-- `fts` (a stored tsvector that's just as useless to the LLM) and `user_id`
-- (RLS-scoped — every row belongs to auth.uid() by definition).
--
-- This replaces the find_anything definition from 0014. The contract is
-- otherwise identical: same params, same return shape, same `total` /
-- `_score` / `_matched` / `_contact_name` fields. Only the row payload
-- is leaner.

create or replace function public.find_anything(
  query_terms     text[]   default null,
  query_embedding halfvec(1536) default null,
  regex_pattern   text     default null,
  in_contacts     boolean  default true,
  in_assets       boolean  default true,
  required_tags   text[]   default null,
  any_tags        text[]   default null,
  min_warmth      int      default null,
  max_warmth      int      default null,
  city_filter     text     default null,
  contains_filter text     default null,
  has_assets      boolean  default null,
  recent_days     int      default null,
  match_count     int      default 50
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  joined_query text := nullif(array_to_string(coalesce(query_terms, '{}'::text[]), ' '), '');
  fts_q tsquery := public.or_tsquery(joined_query);
  recent_cutoff timestamptz := case when recent_days is not null
                                    then now() - (recent_days || ' days')::interval
                                    else null end;
  contact_rows jsonb;
  asset_rows   jsonb;
  contact_total bigint := 0;
  asset_total   bigint := 0;
begin
  -- CONTACTS
  if in_contacts then
    select jsonb_agg(row order by score desc), coalesce(max(total_match_count), 0)
      into contact_rows, contact_total
      from (
        with
        base as (
          select c.*
            from public.contacts c
           where c.deleted_at is null
             and (min_warmth   is null or c.warmth >= min_warmth)
             and (max_warmth   is null or c.warmth <= max_warmth)
             and (required_tags is null or c.tags @> required_tags)
             and (any_tags      is null or c.tags && any_tags)
             and (city_filter   is null or c.city  ilike '%' || city_filter || '%')
             and (recent_cutoff is null or c.updated_at > recent_cutoff)
             and (has_assets    is null or has_assets = false
                  or exists (select 1 from public.assets a
                              where a.contact_id = c.id and a.deleted_at is null))
        ),
        fts_hits as (
          select id, ts_rank_cd(fts, fts_q) as r
            from base
           where fts_q is not null and fts @@ fts_q
        ),
        sem_hits as (
          select id, 1.0 / (1.0 + (embedding <=> query_embedding)) as r
            from base
           where query_embedding is not null and embedding is not null
           order by embedding <=> query_embedding
           limit 100
        ),
        trgm_hits as (
          select b.id,
                 similarity(
                   coalesce(b.name,'')  || ' ' ||
                   coalesce(b.notes,'') || ' ' ||
                   coalesce(b.city,''),
                   joined_query) as r
            from base b
           where joined_query is not null
             and (coalesce(b.name,'') || ' ' || coalesce(b.notes,'') || ' ' || coalesce(b.city,''))
                 % joined_query
        ),
        substr_hits as (
          select id, 1.0::float as r
            from base
           where contains_filter is not null
             and (name  ilike '%' || contains_filter || '%'
               or notes ilike '%' || contains_filter || '%'
               or city  ilike '%' || contains_filter || '%')
        ),
        regex_hits as (
          select id, 0.9::float as r
            from base
           where regex_pattern is not null
             and (coalesce(name,'') || ' ' || coalesce(notes,'') || ' ' || coalesce(city,''))
                 ~* regex_pattern
        ),
        no_query_listing as (
          select id, 0.1::float as r
            from base
           where fts_q is null
             and query_embedding is null
             and contains_filter is null
             and regex_pattern is null
        ),
        unioned as (
          select id, sum(r) as score,
                 array_agg(strat) as matched
            from (
              select id, r, 'fts'      as strat from fts_hits
              union all select id, r, 'sem'      from sem_hits
              union all select id, r * 0.6, 'trgm'  from trgm_hits
              union all select id, r * 1.4, 'contains' from substr_hits
              union all select id, r * 1.2, 'regex' from regex_hits
              union all select id, r, 'list'   from no_query_listing
            ) s
           group by id
        )
        -- Strip embedding + fts + user_id from the returned row. None of
        -- them are useful to the LLM, and `embedding` alone is ~18 KB
        -- per row (1536 halfvec floats serialized as text).
        select (
                to_jsonb(c)
                - 'embedding'
                - 'embedding_model'
                - 'embedding_generated_at'
                - 'fts'
                - 'user_id'
               ) || jsonb_build_object('_score', u.score, '_matched', u.matched) as row,
               u.score as score,
               count(*) over () as total_match_count
          from unioned u
          join public.contacts c on c.id = u.id
         order by u.score desc
         limit match_count
      ) ranked;
  end if;

  -- ASSETS
  if in_assets then
    select jsonb_agg(row order by score desc), coalesce(max(total_match_count), 0)
      into asset_rows, asset_total
      from (
        with
        base as (
          select a.*
            from public.assets a
           where a.deleted_at is null
             and (required_tags is null or a.tags @> required_tags)
             and (any_tags      is null or a.tags && any_tags)
             and (recent_cutoff is null or a.updated_at > recent_cutoff)
        ),
        fts_hits as (
          select id, ts_rank_cd(fts, fts_q) as r
            from base
           where fts_q is not null and fts @@ fts_q
        ),
        sem_hits as (
          select id, 1.0 / (1.0 + (embedding <=> query_embedding)) as r
            from base
           where query_embedding is not null and embedding is not null
           order by embedding <=> query_embedding
           limit 100
        ),
        trgm_hits as (
          select b.id,
                 similarity(
                   coalesce(b.name,'')        || ' ' ||
                   coalesce(b.description,'') || ' ' ||
                   coalesce(b.availability,''),
                   joined_query) as r
            from base b
           where joined_query is not null
             and (coalesce(b.name,'') || ' ' || coalesce(b.description,'') || ' ' || coalesce(b.availability,''))
                 % joined_query
        ),
        substr_hits as (
          select id, 1.0::float as r
            from base
           where contains_filter is not null
             and (name        ilike '%' || contains_filter || '%'
               or description ilike '%' || contains_filter || '%'
               or availability ilike '%' || contains_filter || '%')
        ),
        regex_hits as (
          select id, 0.9::float as r
            from base
           where regex_pattern is not null
             and (coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(availability,''))
                 ~* regex_pattern
        ),
        no_query_listing as (
          select id, 0.1::float as r
            from base
           where fts_q is null
             and query_embedding is null
             and contains_filter is null
             and regex_pattern is null
        ),
        unioned as (
          select id, sum(r) as score,
                 array_agg(strat) as matched
            from (
              select id, r, 'fts'      as strat from fts_hits
              union all select id, r, 'sem'      from sem_hits
              union all select id, r * 0.6, 'trgm'  from trgm_hits
              union all select id, r * 1.4, 'contains' from substr_hits
              union all select id, r * 1.2, 'regex' from regex_hits
              union all select id, r, 'list'   from no_query_listing
            ) s
           group by id
        )
        select (
                (
                  to_jsonb(a)
                  - 'embedding'
                  - 'embedding_model'
                  - 'embedding_generated_at'
                  - 'fts'
                  - 'user_id'
                ) ||
                jsonb_build_object(
                  '_score', u.score,
                  '_matched', u.matched,
                  '_contact_name',
                    (select c.name from public.contacts c where c.id = a.contact_id)
                )
               ) as row,
               u.score as score,
               count(*) over () as total_match_count
          from unioned u
          join public.assets a on a.id = u.id
         order by u.score desc
         limit match_count
      ) ranked;
  end if;

  return jsonb_build_object(
    'contacts', coalesce(contact_rows, '[]'::jsonb),
    'assets',   coalesce(asset_rows,   '[]'::jsonb),
    'total',    jsonb_build_object('contacts', contact_total, 'assets', asset_total),
    'debug', jsonb_build_object(
      'fts_query',       fts_q::text,
      'queries_used',    to_jsonb(query_terms),
      'contains_filter', contains_filter,
      'regex_pattern',   regex_pattern
    )
  );
end;
$$;

revoke all on function public.find_anything from public;
grant execute on function public.find_anything to authenticated;

notify pgrst, 'reload schema';
