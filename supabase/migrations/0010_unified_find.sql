-- 0010_unified_find.sql
-- Unified search RPC: `find_anything`.
--
-- The agent often KNOWS many things about what it's looking for: the
-- user's words (in two languages), expected tags, a city hint, a vague
-- recency, maybe a substring. Instead of forcing it to issue N narrow
-- queries and stitch the results, we accept everything in ONE call and
-- do the heavy lifting in Postgres.
--
-- Strategies run in parallel CTEs, applied to a filtered candidate set:
--   1. FTS (OR-tokenized, prefix-matched) via or_tsquery() from 0009
--   2. Vector cosine via the pre-computed embedding
--   3. Trigram similarity (pg_trgm, indexed)
--   4. Substring ILIKE for "give me anything mentioning X" (Grep-style)
--   5. Regex match for power-mode wildcards
-- Fusion is composite-weighted scoring; rows present in multiple
-- strategies get the sum. Returns JSONB so contacts + assets ride
-- back in one call.
--
-- Returns shape:
--   {
--     contacts: [{...row, _score, _matched: ['fts','sem','contains']}, ...],
--     assets:   [{...row, _score, _matched: [...], _contact_name?: string}, ...],
--     debug:    { fts_query, queries_used, total_candidates_*: int }
--   }
--
-- All filters are optional. The minimum useful call is:
--   find_anything(query_terms => ARRAY['podcast'])

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
  asset_rows jsonb;
  contact_candidates_count int := 0;
  asset_candidates_count int := 0;
begin
  -- =========================================================================
  -- CONTACTS
  -- =========================================================================
  if in_contacts then
    select jsonb_agg(row order by score desc), count(*)
      into contact_rows, contact_candidates_count
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
        select to_jsonb(c) ||
               jsonb_build_object('_score', u.score, '_matched', u.matched) as row,
               u.score as score
          from unioned u
          join public.contacts c on c.id = u.id
         order by u.score desc
         limit match_count
      ) ranked;
  end if;

  -- =========================================================================
  -- ASSETS
  -- =========================================================================
  if in_assets then
    select jsonb_agg(row order by score desc), count(*)
      into asset_rows, asset_candidates_count
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
        select (to_jsonb(a) ||
                jsonb_build_object(
                  '_score', u.score,
                  '_matched', u.matched,
                  '_contact_name',
                    (select c.name from public.contacts c where c.id = a.contact_id)
                )) as row,
               u.score as score
          from unioned u
          join public.assets a on a.id = u.id
         order by u.score desc
         limit match_count
      ) ranked;
  end if;

  return jsonb_build_object(
    'contacts', coalesce(contact_rows, '[]'::jsonb),
    'assets',   coalesce(asset_rows,   '[]'::jsonb),
    'debug', jsonb_build_object(
      'fts_query',        fts_q::text,
      'queries_used',     to_jsonb(query_terms),
      'contains_filter',  contains_filter,
      'regex_pattern',    regex_pattern,
      'contact_candidates', contact_candidates_count,
      'asset_candidates',   asset_candidates_count
    )
  );
end;
$$;

grant execute on function public.find_anything(
  text[], halfvec, text, boolean, boolean, text[], text[], int, int, text, text, boolean, int, int
) to authenticated;
