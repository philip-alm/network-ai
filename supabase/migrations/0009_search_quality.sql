-- 0009_search_quality.sql
-- Search-quality fixes after a user reported `search_assets("podcast …")`
-- returning 0 matches even when an asset description contained
-- "podcast-utrustning". Three root causes, three fixes.
--
-- 1. HYPHEN TOKENIZATION. With the `simple` tsvector config (which we use
--    because we have mixed-language content — Swedish + English — and
--    don't want stemming surprises), Postgres treats `podcast-utrustning`
--    as a single token. Searching "podcast" never matches.
--    Fix: normalize non-alphanumeric → space BEFORE to_tsvector.
--
-- 2. AND-ONLY FTS. `websearch_to_tsquery` joins unquoted terms with AND.
--    A query "podcast inspelning ljud studio" requires ALL four to match.
--    Fix: build an OR-tsquery via `or_tsquery()` helper. Ranking via
--    ts_rank_cd still surfaces the highest-overlap matches first.
--
-- 3. SOFT-DELETE FILTERING was already there from 0008. We keep it.
--
-- Also adds a small trigram fallback so a typo'd query still surfaces
-- something useful, via the `pg_trgm` extension.

create extension if not exists "pg_trgm";

-- ===========================================================================
-- Step 1 — Rewrite the FTS-source functions to strip non-alphanumeric.
-- ===========================================================================

create or replace function public.contact_fts(p_name text, p_notes text, p_city text, p_tags text[])
returns tsvector
language sql
immutable
parallel safe
as $$
  select to_tsvector(
    'simple'::regconfig,
    regexp_replace(
      coalesce(p_name, '')  || ' ' ||
      coalesce(p_notes, '') || ' ' ||
      coalesce(p_city, '')  || ' ' ||
      array_to_string(coalesce(p_tags, '{}'::text[]), ' '),
      '[^[:alnum:][:space:]åäöÅÄÖéèüÜ]', ' ', 'g'
    )
  );
$$;

create or replace function public.asset_fts(p_name text, p_description text, p_availability text, p_tags text[])
returns tsvector
language sql
immutable
parallel safe
as $$
  select to_tsvector(
    'simple'::regconfig,
    regexp_replace(
      coalesce(p_name, '')         || ' ' ||
      coalesce(p_description, '')  || ' ' ||
      coalesce(p_availability, '') || ' ' ||
      array_to_string(coalesce(p_tags, '{}'::text[]), ' '),
      '[^[:alnum:][:space:]åäöÅÄÖéèüÜ]', ' ', 'g'
    )
  );
$$;

-- Force recompute of the STORED generated columns by no-op'ing every
-- live row. `name = name` triggers the column expression's re-evaluation
-- (Postgres recomputes stored generated columns on every UPDATE that
-- touches a referenced column, even if the value is unchanged). Bumps
-- `updated_at` via touch_updated_at — harmless for the network mapper.
update public.contacts set name = name where deleted_at is null;
update public.assets   set name = name where deleted_at is null;

-- ===========================================================================
-- Step 2 — `or_tsquery` helper. Builds a normalized OR-tsquery from raw
-- user input. Empty input returns NULL so the caller can short-circuit.
-- ===========================================================================

create or replace function public.or_tsquery(query_text text)
returns tsquery
language sql
immutable
parallel safe
as $$
  with terms as (
    select term
      from regexp_split_to_table(
        lower(regexp_replace(coalesce(query_text, ''), '[^[:alnum:][:space:]åäöÅÄÖéèüÜ]', ' ', 'g')),
        '\s+'
      ) as term
     where length(term) > 0
  )
  select case
    when count(*) = 0 then null::tsquery
    else to_tsquery('simple', string_agg(term || ':*', ' | '))
  end
  from terms;
$$;

-- Note: appending `:*` to each term gives prefix matching, so `pod` matches
-- `podcast`. Combined with OR, this is generous-but-still-relevant.

-- ===========================================================================
-- Step 3 — Replace hybrid_search_* with the OR + prefix variant.
-- Keeps the same signature so callers don't change. Adds a trigram tier
-- as a last-resort fallback when both FTS and vector are empty.
-- ===========================================================================

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
  with q as (select public.or_tsquery(query_text) as ts),
  fts as (
    select c.id,
           row_number() over (
             order by ts_rank_cd(c.fts, (select ts from q)) desc
           ) as rank
      from public.contacts c
     where (select ts from q) is not null
       and c.fts @@ (select ts from q)
       and c.deleted_at is null
       and (min_warmth is null or c.warmth <= min_warmth)
       and (required_tags is null or c.tags @> required_tags)
     limit least(match_count * 3, 100)
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
     limit least(match_count * 3, 100)
  ),
  trgm as (
    select c.id,
           row_number() over (
             order by similarity(coalesce(c.name,'') || ' ' || coalesce(c.notes,'') || ' ' || coalesce(c.city,''), query_text) desc
           ) as rank
      from public.contacts c
     where c.deleted_at is null
       and (min_warmth is null or c.warmth <= min_warmth)
       and (required_tags is null or c.tags @> required_tags)
       and (coalesce(c.name,'') || ' ' || coalesce(c.notes,'') || ' ' || coalesce(c.city,'')) % query_text
     limit least(match_count * 2, 50)
  ),
  fused as (
    select coalesce(fts.id, sem.id, trgm.id) as id,
           coalesce(1.0 / (rrf_k + fts.rank),  0) * full_text_weight +
           coalesce(1.0 / (rrf_k + sem.rank),  0) * semantic_weight +
           coalesce(1.0 / (rrf_k + trgm.rank), 0) * 0.5 as score
      from fts
      full outer join sem  on fts.id  = sem.id
      full outer join trgm on coalesce(fts.id, sem.id) = trgm.id
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
  with q as (select public.or_tsquery(query_text) as ts),
  fts as (
    select a.id,
           row_number() over (
             order by ts_rank_cd(a.fts, (select ts from q)) desc
           ) as rank
      from public.assets a
     where (select ts from q) is not null
       and a.fts @@ (select ts from q)
       and a.deleted_at is null
       and (required_tags is null or a.tags @> required_tags)
     limit least(match_count * 3, 100)
  ),
  sem as (
    select id,
           row_number() over (order by embedding <=> query_embedding) as rank
      from public.assets
     where embedding is not null
       and deleted_at is null
       and (required_tags is null or tags @> required_tags)
     order by embedding <=> query_embedding
     limit least(match_count * 3, 100)
  ),
  trgm as (
    select a.id,
           row_number() over (
             order by similarity(coalesce(a.name,'') || ' ' || coalesce(a.description,''), query_text) desc
           ) as rank
      from public.assets a
     where a.deleted_at is null
       and (required_tags is null or a.tags @> required_tags)
       and (coalesce(a.name,'') || ' ' || coalesce(a.description,'')) % query_text
     limit least(match_count * 2, 50)
  ),
  fused as (
    select coalesce(fts.id, sem.id, trgm.id) as id,
           coalesce(1.0 / (rrf_k + fts.rank),  0) * full_text_weight +
           coalesce(1.0 / (rrf_k + sem.rank),  0) * semantic_weight +
           coalesce(1.0 / (rrf_k + trgm.rank), 0) * 0.5 as score
      from fts
      full outer join sem  on fts.id  = sem.id
      full outer join trgm on coalesce(fts.id, sem.id) = trgm.id
  )
  select a.*
    from public.assets a
    join fused f on f.id = a.id
   order by f.score desc
   limit match_count;
$$;

-- pg_trgm GIN indexes for the trigram tier (cheap; the % operator above
-- otherwise sequential-scans). Use the alive partial form.
create index if not exists contacts_trgm_idx
  on public.contacts using gin (
    (coalesce(name,'') || ' ' || coalesce(notes,'') || ' ' || coalesce(city,'')) gin_trgm_ops
  )
  where deleted_at is null;

create index if not exists assets_trgm_idx
  on public.assets using gin (
    (coalesce(name,'') || ' ' || coalesce(description,'')) gin_trgm_ops
  )
  where deleted_at is null;
