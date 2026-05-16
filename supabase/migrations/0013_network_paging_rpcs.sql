-- 0013_network_paging_rpcs.sql
--
-- Server-side paging + filter + sort for the right panel. Replaces the
-- old "load every row, filter client-side" model that worked at 1k
-- but breaks at 10k+. Three RPCs:
--
--   1. network_counts()         — cheap totals for the panel header
--                                 ("200 of 15,461"). Returns one row.
--   2. query_contacts_page(...) — paged + filtered + sorted contacts,
--                                 plus the matching total_count window.
--   3. query_assets_page(...)   — same for assets.
--
-- Tiebreak + null-handling MUST match the client comparator chain in
-- packages/app/src/features/contacts/panelLogic.ts so the user gets
-- identical row order regardless of whether the data came through the
-- RPC or the optimistic in-memory upsert path. The chain is:
--
--   primary sort key →
--   name asc (alphabetical inside ties) →
--   id asc (final stability guard)
--
-- Nulls/missing values always sort LAST regardless of direction.
--
-- All filters are optional. The minimum useful call is
-- `query_contacts_page()` — returns the first page sorted by the
-- default key.

-- ─── network_counts ────────────────────────────────────────────────

create or replace function public.network_counts()
returns table (contacts bigint, assets bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    (
      select count(*)
      from public.contacts
      where user_id = auth.uid() and deleted_at is null
    ),
    (
      select count(*)
      from public.assets
      where user_id = auth.uid() and deleted_at is null
    );
$$;

revoke all on function public.network_counts from public;
grant execute on function public.network_counts to authenticated;

-- ─── query_contacts_page ───────────────────────────────────────────

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
      and (p_search is null
           or c.name  ilike '%' || p_search || '%'
           or c.notes ilike '%' || p_search || '%'
           or coalesce(c.city, '') ilike '%' || p_search || '%')
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
      -- Nulls always sort LAST regardless of direction (matches client).
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
      -- Tiebreak: alphabetical by name, then id for final stability.
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

-- ─── query_assets_page ─────────────────────────────────────────────

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
      and (p_search is null
           or a.name ilike '%' || p_search || '%'
           or coalesce(a.description, '')  ilike '%' || p_search || '%'
           or coalesce(a.availability, '') ilike '%' || p_search || '%')
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

-- ─── network_facets ───────────────────────────────────────────────
--
-- Single round-trip for "what can the user filter by, and how many
-- rows hit each value." Drives the smart filter dropdown so the user
-- sees every city/tag/warmth that exists in their data — not just
-- the ones present in the first 200 rows.
--
-- Returned shape (JSON):
--   {
--     cities:             [{value, count}, ...] ordered by count desc
--     tags:               [{value, count}, ...] ordered by count desc
--     warmth:             [{value, count}, ...] ordered by value asc
--     asset_tags:         [{value, count}, ...] ordered by count desc
--     asset_availability: [{value, count}, ...] ordered by count desc
--   }

create or replace function public.network_facets()
returns json
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select json_build_object(
    'cities', (
      select coalesce(
        json_agg(json_build_object('value', city, 'count', cnt) order by cnt desc, city asc),
        '[]'::json
      )
      from (
        select city, count(*)::int as cnt
        from public.contacts
        where user_id = auth.uid() and deleted_at is null and city is not null
        group by city
      ) t
    ),
    'tags', (
      select coalesce(
        json_agg(json_build_object('value', t, 'count', cnt) order by cnt desc, t asc),
        '[]'::json
      )
      from (
        select t, count(*)::int as cnt
        from public.contacts c, unnest(c.tags) t
        where c.user_id = auth.uid() and c.deleted_at is null
        group by t
      ) t
    ),
    'warmth', (
      select coalesce(
        json_agg(json_build_object('value', warmth, 'count', cnt) order by warmth asc),
        '[]'::json
      )
      from (
        select warmth, count(*)::int as cnt
        from public.contacts
        where user_id = auth.uid() and deleted_at is null and warmth is not null
        group by warmth
      ) t
    ),
    'asset_tags', (
      select coalesce(
        json_agg(json_build_object('value', t, 'count', cnt) order by cnt desc, t asc),
        '[]'::json
      )
      from (
        select t, count(*)::int as cnt
        from public.assets a, unnest(a.tags) t
        where a.user_id = auth.uid() and a.deleted_at is null
        group by t
      ) t
    ),
    'asset_availability', (
      select coalesce(
        json_agg(json_build_object('value', availability, 'count', cnt) order by cnt desc, availability asc),
        '[]'::json
      )
      from (
        select availability, count(*)::int as cnt
        from public.assets
        where user_id = auth.uid() and deleted_at is null and availability is not null
        group by availability
      ) t
    )
  );
$$;

revoke all on function public.network_facets from public;
grant execute on function public.network_facets to authenticated;

-- PostgREST schema-cache reload — same pattern as 0011 to avoid the
-- "could not find function" race right after a fresh migration apply.
notify pgrst, 'reload schema';
