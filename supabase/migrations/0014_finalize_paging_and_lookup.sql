-- 0014_finalize_paging_and_lookup.sql
--
-- Closes the agent ↔ UI contract. Replaces three existing RPCs and adds
-- three new ones so the agent + the panel + the user always see the same
-- truth:
--
--   query_contacts_page  — p_search upgraded to FTS + trigram fallback
--                          (was ILIKE-only). Same indexes from 0009.
--   query_assets_page    — same upgrade.
--   find_anything        — returns a top-level `total` so the agent knows
--                          how many rows actually matched, not just how
--                          many were returned post-limit.
--   lookup_contacts_by_ids ─┐
--   lookup_assets_by_ids   ─┴ for @mention-on-miss + asset-owner-on-miss.
--   validate_panel_pins  — pre-flight check for set_panel's pinned ids.
--
-- Plus: enable the realtime publication on contacts + assets so
-- cross-tab + cross-device updates actually fire (the memory note
-- `project_realtime_publication_gap.md` flagged this gap).

-- ─── query_contacts_page (replace p_search semantics) ─────────────

create or replace function public.query_contacts_page(
  p_search                text       default null,
  p_cities                text[]     default null,
  p_warmth                smallint[] default null,
  p_tags_any              text[]     default null,
  p_tags_all              text[]     default null,
  p_has_assets            boolean    default null,
  p_updated_within_days   int        default null,
  p_sort                  text       default 'warmth_desc',
  p_offset                int        default 0,
  p_limit                 int        default 200
)
returns table (
  id          uuid,
  name        text,
  warmth      smallint,
  city        text,
  tags        text[],
  notes       text,
  created_at  timestamptz,
  updated_at  timestamptz,
  asset_count int,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtered as (
    select
      c.id, c.name, c.warmth, c.city, c.tags, c.notes,
      c.created_at, c.updated_at,
      coalesce((
        select count(*)::int
        from public.assets a
        where a.contact_id = c.id and a.deleted_at is null
      ), 0) as asset_count
    from public.contacts c
    where c.user_id = auth.uid()
      and c.deleted_at is null
      and (p_cities  is null or c.city = any(p_cities))
      and (p_warmth  is null or c.warmth = any(p_warmth))
      and (p_tags_any is null or c.tags && p_tags_any)
      and (p_tags_all is null or c.tags @> p_tags_all)
      and (p_updated_within_days is null
           or c.updated_at > now() - (p_updated_within_days || ' days')::interval)
      -- p_search: prefer FTS (stem/prefix-aware, GIN-indexed). Fall back
      -- to WORD trigram similarity (<% operator) for typo tolerance.
      -- Word similarity matches a query against the closest word in the
      -- haystack — much more permissive than full-string `%` for
      -- multi-word fields like "Anna Svensson" matched by "Annaa".
      -- The GIN trigram index from 0009 supports <%.
      and (
        p_search is null
        or c.fts @@ public.or_tsquery(p_search)
        or p_search <% (
          coalesce(c.name, '') || ' '
          || coalesce(c.notes, '') || ' '
          || coalesce(c.city, '')
        )
      )
  ),
  with_assets_filter as (
    select * from filtered
    where p_has_assets is null
       or (p_has_assets = true  and asset_count > 0)
       or (p_has_assets = false and asset_count = 0)
  ),
  with_total as (
    select *, count(*) over () as total_count
    from with_assets_filter
  ),
  sorted as (
    select *
    from with_total
    order by
      case
        when p_sort = 'warmth_desc'   and warmth is null     then 1
        when p_sort = 'warmth_asc'    and warmth is null     then 1
        when p_sort = 'updated_desc'  and updated_at is null then 1
        when p_sort = 'created_desc'  and created_at is null then 1
        when p_sort = 'name_asc'      and (name is null or name = '') then 1
        when p_sort = 'name_desc'     and (name is null or name = '') then 1
        else 0
      end asc,
      case when p_sort = 'warmth_desc'      then warmth      end desc,
      case when p_sort = 'warmth_asc'       then warmth      end asc,
      case when p_sort = 'updated_desc'     then updated_at  end desc,
      case when p_sort = 'created_desc'     then created_at  end desc,
      case when p_sort = 'name_asc'         then name        end asc,
      case when p_sort = 'name_desc'        then name        end desc,
      case when p_sort = 'asset_count_desc' then asset_count end desc,
      name asc,
      id asc
  )
  select
    id, name, warmth, city, tags, notes,
    created_at, updated_at, asset_count, total_count
  from sorted
  offset greatest(coalesce(p_offset, 0), 0)
  limit  least(coalesce(p_limit, 200), 1000);
$$;

revoke all on function public.query_contacts_page from public;
grant execute on function public.query_contacts_page to authenticated;

-- ─── query_assets_page (replace p_search semantics) ───────────────

create or replace function public.query_assets_page(
  p_search                text     default null,
  p_tags_any              text[]   default null,
  p_tags_all              text[]   default null,
  p_owner_ids             uuid[]   default null,
  p_has_owner             boolean  default null,
  p_availability_contains text     default null,
  p_updated_within_days   int      default null,
  p_sort                  text     default 'updated_desc',
  p_offset                int      default 0,
  p_limit                 int      default 200
)
returns table (
  id           uuid,
  name         text,
  description  text,
  tags         text[],
  contact_id   uuid,
  availability text,
  created_at   timestamptz,
  updated_at   timestamptz,
  total_count  bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtered as (
    select
      a.id, a.name, a.description, a.tags, a.contact_id, a.availability,
      a.created_at, a.updated_at
    from public.assets a
    where a.user_id = auth.uid()
      and a.deleted_at is null
      and (p_tags_any  is null or a.tags && p_tags_any)
      and (p_tags_all  is null or a.tags @> p_tags_all)
      and (p_owner_ids is null or a.contact_id = any(p_owner_ids))
      and (p_has_owner is null
           or (p_has_owner = true  and a.contact_id is not null)
           or (p_has_owner = false and a.contact_id is null))
      and (p_availability_contains is null
           or coalesce(a.availability, '') ilike '%' || p_availability_contains || '%')
      and (p_updated_within_days is null
           or a.updated_at > now() - (p_updated_within_days || ' days')::interval)
      -- Same FTS-then-word-trigram upgrade as contacts. The trigram
      -- concat matches `assets_trgm_idx` (name + description; the
      -- index uses gin_trgm_ops which supports <%).
      and (
        p_search is null
        or a.fts @@ public.or_tsquery(p_search)
        or p_search <% (coalesce(a.name, '') || ' ' || coalesce(a.description, ''))
      )
  ),
  with_total as (
    select *, count(*) over () as total_count
    from filtered
  ),
  sorted as (
    select *
    from with_total
    order by
      case
        when p_sort = 'updated_desc' and updated_at is null then 1
        when p_sort = 'created_desc' and created_at is null then 1
        when p_sort = 'name_asc'     and (name is null or name = '') then 1
        when p_sort = 'name_desc'    and (name is null or name = '') then 1
        else 0
      end asc,
      case when p_sort = 'updated_desc' then updated_at end desc,
      case when p_sort = 'created_desc' then created_at end desc,
      case when p_sort = 'name_asc'     then name       end asc,
      case when p_sort = 'name_desc'    then name       end desc,
      name asc,
      id asc
  )
  select id, name, description, tags, contact_id, availability,
         created_at, updated_at, total_count
  from sorted
  offset greatest(coalesce(p_offset, 0), 0)
  limit  least(coalesce(p_limit, 200), 1000);
$$;

revoke all on function public.query_assets_page from public;
grant execute on function public.query_assets_page to authenticated;

-- ─── find_anything (add top-level `total`) ────────────────────────
--
-- Replaces the function defined in 0010. The shape is identical except
-- the return JSON gains a `total: { contacts, assets }` field carrying
-- the TRUE count of rows that matched the fused search BEFORE the
-- `match_count` cap. The agent reads this so its chat narration is
-- truthful ("Found 312 contacts, showing top 50") instead of guessing
-- from the returned candidate count.

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
        -- The window function counts the FULL unioned set BEFORE the
        -- LIMIT (per Postgres semantics: window evaluates after WHERE/
        -- JOIN but before LIMIT). Every output row carries the same
        -- total — the outer aggregate picks one via max().
        select to_jsonb(c) ||
               jsonb_build_object('_score', u.score, '_matched', u.matched) as row,
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
        select (to_jsonb(a) ||
                jsonb_build_object(
                  '_score', u.score,
                  '_matched', u.matched,
                  '_contact_name',
                    (select c.name from public.contacts c where c.id = a.contact_id)
                )) as row,
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

-- ─── lookup_contacts_by_ids ──────────────────────────────────────
-- For MentionPill clicks on contacts not currently in the loaded set,
-- and for pinned-rows-always-visible. RLS-scoped, soft-delete aware.

create or replace function public.lookup_contacts_by_ids(p_ids uuid[])
returns table (
  id          uuid,
  name        text,
  warmth      smallint,
  city        text,
  tags        text[],
  notes       text,
  created_at  timestamptz,
  updated_at  timestamptz,
  asset_count int
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    c.id, c.name, c.warmth, c.city, c.tags, c.notes,
    c.created_at, c.updated_at,
    coalesce((
      select count(*)::int
      from public.assets a
      where a.contact_id = c.id and a.deleted_at is null
    ), 0) as asset_count
  from public.contacts c
  where c.user_id = auth.uid()
    and c.deleted_at is null
    and c.id = any(coalesce(p_ids, ARRAY[]::uuid[]));
$$;

revoke all on function public.lookup_contacts_by_ids from public;
grant execute on function public.lookup_contacts_by_ids to authenticated;

-- ─── lookup_assets_by_ids ────────────────────────────────────────

create or replace function public.lookup_assets_by_ids(p_ids uuid[])
returns table (
  id           uuid,
  name         text,
  description  text,
  tags         text[],
  contact_id   uuid,
  availability text,
  created_at   timestamptz,
  updated_at   timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select a.id, a.name, a.description, a.tags, a.contact_id, a.availability,
         a.created_at, a.updated_at
  from public.assets a
  where a.user_id = auth.uid()
    and a.deleted_at is null
    and a.id = any(coalesce(p_ids, ARRAY[]::uuid[]));
$$;

revoke all on function public.lookup_assets_by_ids from public;
grant execute on function public.lookup_assets_by_ids to authenticated;

-- ─── validate_panel_pins ─────────────────────────────────────────
-- Pre-flight for set_panel's pinning. The agent passes the proposed
-- pinned ids; we return which ones actually exist (RLS-scoped). The
-- tool wrapper rejects the call with a clear hint if any are missing
-- — the LLM then re-finds and self-corrects without writing a lie.

create or replace function public.validate_panel_pins(
  p_contact_ids uuid[] default null,
  p_asset_ids   uuid[] default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with valid_contacts as (
    select id
    from public.contacts
    where user_id = auth.uid()
      and deleted_at is null
      and id = any(coalesce(p_contact_ids, ARRAY[]::uuid[]))
  ),
  valid_assets as (
    select id
    from public.assets
    where user_id = auth.uid()
      and deleted_at is null
      and id = any(coalesce(p_asset_ids, ARRAY[]::uuid[]))
  ),
  missing_contacts as (
    select id
    from unnest(coalesce(p_contact_ids, ARRAY[]::uuid[])) as id
    where id not in (select id from valid_contacts)
  ),
  missing_assets as (
    select id
    from unnest(coalesce(p_asset_ids, ARRAY[]::uuid[])) as id
    where id not in (select id from valid_assets)
  )
  select jsonb_build_object(
    'valid_contact_ids',   coalesce((select jsonb_agg(id) from valid_contacts),   '[]'::jsonb),
    'missing_contact_ids', coalesce((select jsonb_agg(id) from missing_contacts), '[]'::jsonb),
    'valid_asset_ids',     coalesce((select jsonb_agg(id) from valid_assets),     '[]'::jsonb),
    'missing_asset_ids',   coalesce((select jsonb_agg(id) from missing_assets),   '[]'::jsonb)
  );
$$;

revoke all on function public.validate_panel_pins from public;
grant execute on function public.validate_panel_pins to authenticated;

-- ─── Realtime publication on contacts + assets ───────────────────
-- The memory note `project_realtime_publication_gap.md` flagged that
-- our realtime channel subscription was a no-op because the tables
-- weren't published. Fix it. The DO block guards against duplicate
-- ALTER if the publication already includes them.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contacts'
  ) then
    alter publication supabase_realtime add table public.contacts;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'assets'
  ) then
    alter publication supabase_realtime add table public.assets;
  end if;
end $$;

-- PostgREST schema cache reload to avoid "function not in cache" race.
notify pgrst, 'reload schema';
