-- 0002_contacts_assets.sql
-- Core domain: contacts (people with a warmth score 1-5) and assets (resources,
-- some attached to a contact, some owned by the user directly).

-- IMMUTABLE wrapper required for the `fts` generated column. Postgres marks
-- `to_tsvector(text, text)` as STABLE (config name can resolve differently per
-- session), but `to_tsvector(regconfig, text)` with a literal regconfig is
-- effectively IMMUTABLE — we wrap it explicitly so Postgres accepts it inside
-- a STORED generated column.
create or replace function public.contact_fts(p_name text, p_notes text, p_city text, p_tags text[])
returns tsvector
language sql
immutable
parallel safe
as $$
  select to_tsvector(
    'simple'::regconfig,
    coalesce(p_name, '') || ' ' ||
    coalesce(p_notes, '') || ' ' ||
    coalesce(p_city, '') || ' ' ||
    array_to_string(coalesce(p_tags, '{}'::text[]), ' ')
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
    coalesce(p_name, '') || ' ' ||
    coalesce(p_description, '') || ' ' ||
    coalesce(p_availability, '') || ' ' ||
    array_to_string(coalesce(p_tags, '{}'::text[]), ' ')
  );
$$;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  warmth smallint check (warmth between 1 and 5),
  city text,
  tags text[] not null default '{}',
  notes text not null default '',
  fts tsvector generated always as (public.contact_fts(name, notes, city, tags)) stored,
  embedding halfvec(1536),
  embedding_model text,
  embedding_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_user_id_idx       on public.contacts (user_id);
create index contacts_fts_idx           on public.contacts using gin (fts);
create index contacts_tags_idx          on public.contacts using gin (tags);
create index contacts_embedding_idx     on public.contacts using hnsw (embedding halfvec_cosine_ops) with (m = 16, ef_construction = 64);
create index contacts_warmth_idx        on public.contacts (warmth) where warmth is not null;
create index contacts_updated_at_idx    on public.contacts (user_id, updated_at desc);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  name text not null,
  description text not null default '',
  tags text[] not null default '{}',
  availability text,
  fts tsvector generated always as (public.asset_fts(name, description, availability, tags)) stored,
  embedding halfvec(1536),
  embedding_model text,
  embedding_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assets_user_id_idx     on public.assets (user_id);
create index assets_contact_id_idx  on public.assets (contact_id);
create index assets_fts_idx         on public.assets using gin (fts);
create index assets_tags_idx        on public.assets using gin (tags);
create index assets_embedding_idx   on public.assets using hnsw (embedding halfvec_cosine_ops) with (m = 16, ef_construction = 64);
create index assets_updated_at_idx  on public.assets (user_id, updated_at desc);

-- Keep updated_at fresh on every UPDATE (single trigger for both tables via shared function).
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

create trigger contacts_touch_updated_at before update on public.contacts
  for each row execute function public.touch_updated_at();
create trigger assets_touch_updated_at before update on public.assets
  for each row execute function public.touch_updated_at();
