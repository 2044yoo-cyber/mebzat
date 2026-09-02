-- Buildings, and the units inside them.
--
-- Until now `properties` was the whole property system: one flat table, 66
-- columns, no relatives. A unit could say "floor 5" and "Sunrise Apartments"
-- in `floor_number` and `building_name`, but those are free text — two units
-- in the same building had no way to know about each other, and the map drew
-- them as two pins at one coordinate.
--
-- A building is not a listing. It has no price, no listing_kind, and is not
-- for sale; modelling it as a `properties` row would put non-listings into
-- search, filters and the map and force every query to exclude them. So it
-- gets its own table, and a property points at it or does not.
--
-- Everything here is additive. building_id is nullable, so all 150 existing
-- properties remain valid standalone listings with no backfill and no change
-- to any UUID.

-- ---------------------------------------------------------------- city codes

-- The middle segment of MED-ADD-BLD-0001 has nowhere to come from: cities has
-- a slug ("addis-ababa") and a name, but no short code.
alter table public.cities
  add column if not exists code text;

do $$ begin
  create unique index cities_code_unique on public.cities (code) where code is not null;
exception when duplicate_table then null; end $$;

-- Derived from the slug's first three letters where a city has no code yet.
-- Addis Ababa becomes ADD, Bahir Dar BAH. Collisions are possible in principle
-- and are left for a human to resolve rather than silently suffixed, because a
-- code nobody chose is a code nobody can predict.
update public.cities
set code = upper(substring(regexp_replace(slug, '[^a-z]', '', 'g') from 1 for 3))
where code is null;

-- ----------------------------------------------------------------- buildings

do $$ begin
  create type public.construction_status as enum (
    'planned', 'under_construction', 'completed', 'renovating'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),

  -- The human-readable reference. Never the primary key: it is for people to
  -- read out over a phone, and anything people can read they eventually want
  -- to change.
  code text not null unique,

  name text not null,
  building_type public.property_type,
  construction_status public.construction_status not null default 'completed',

  floors smallint check (floors is null or floors >= 0),

  city_id uuid references public.cities (id) on delete set null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,

  address text,
  sub_city text,
  neighbourhood text,
  latitude double precision not null,
  longitude double precision not null,

  cover_image_url text,
  description text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists buildings_city_idx on public.buildings (city_id);
create index if not exists buildings_owner_idx on public.buildings (owner_id);
create index if not exists buildings_coords_idx on public.buildings (latitude, longitude);
create index if not exists buildings_name_idx on public.buildings using gin (to_tsvector('simple', name));

-- ------------------------------------------------------- the link, and units

alter table public.properties
  add column if not exists building_id uuid references public.buildings (id) on delete set null,
  add column if not exists unit_number text,
  -- Denormalised so "MED-ADD-BLD-0001-F05-U02" is one indexed search rather
  -- than a join and a string build. Maintained by trigger below, never by
  -- hand: a code somebody can edit is a code that drifts away from the row it
  -- describes.
  add column if not exists unit_code text;

create index if not exists properties_building_idx on public.properties (building_id);
create index if not exists properties_unit_code_idx on public.properties (unit_code);

-- A unit number only means something inside a building.
do $$ begin
  alter table public.properties
    add constraint properties_unit_needs_building
    check (unit_number is null or building_id is not null);
exception when duplicate_object then null; end $$;

-- One unit per floor per building.
create unique index if not exists properties_unit_unique
  on public.properties (building_id, floor_number, unit_number)
  where building_id is not null and unit_number is not null;

-- ------------------------------------------------------------- code building

/** MED-ADD-BLD-0001. Sequential per city so the number stays short and
 * readable; the uniqueness that matters is enforced by the column. */
create or replace function public.next_building_code(target_city uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  city_code text;
  next_number integer;
begin
  select code into city_code from public.cities where id = target_city;
  city_code := coalesce(city_code, 'ETH');

  select coalesce(max(substring(code from '([0-9]+)$')::integer), 0) + 1
  into next_number
  from public.buildings
  where code like 'MED-' || city_code || '-BLD-%';

  return 'MED-' || city_code || '-BLD-' || lpad(next_number::text, 4, '0');
end;
$$;

create or replace function public.building_code_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.code is null or new.code = '' then
    new.code := public.next_building_code(new.city_id);
  end if;
  return new;
end;
$$;

drop trigger if exists buildings_set_code on public.buildings;
create trigger buildings_set_code
  before insert on public.buildings
  for each row execute function public.building_code_before_insert();

/** The unit's own code, rebuilt whenever anything it is made of changes. */
create or replace function public.property_unit_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  building_code text;
begin
  if new.building_id is null then
    new.unit_code := null;
    return new;
  end if;

  select code into building_code from public.buildings where id = new.building_id;
  if building_code is null then
    new.unit_code := null;
    return new;
  end if;

  new.unit_code := building_code
    || coalesce('-F' || lpad(new.floor_number::text, 2, '0'), '')
    || coalesce('-U' || new.unit_number, '');

  return new;
end;
$$;

drop trigger if exists properties_set_unit_code on public.properties;
create trigger properties_set_unit_code
  before insert or update of building_id, floor_number, unit_number
  on public.properties
  for each row execute function public.property_unit_code();

/** If a building's code ever changes, its units' codes must follow. Without
 * this the denormalisation has a drift hole: unit_code would still name a
 * building code that no longer exists, and the search that motivated storing
 * it would return nothing. */
create or replace function public.rebuild_unit_codes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.properties
  set unit_code = new.code
    || coalesce('-F' || lpad(floor_number::text, 2, '0'), '')
    || coalesce('-U' || unit_number, '')
  where building_id = new.id;
  return new;
end;
$$;

drop trigger if exists buildings_code_changed on public.buildings;
create trigger buildings_code_changed
  after update of code on public.buildings
  for each row when (old.code is distinct from new.code)
  execute function public.rebuild_unit_codes();

-- --------------------------------------------------------------- row security

alter table public.buildings enable row level security;

drop policy if exists "Buildings are viewable by everyone" on public.buildings;
create policy "Buildings are viewable by everyone"
  on public.buildings for select
  to authenticated, anon
  using (true);

drop policy if exists "Owners manage their own buildings" on public.buildings;
create policy "Owners manage their own buildings"
  on public.buildings for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select on public.buildings to anon, authenticated;
grant insert, update, delete on public.buildings to authenticated;

-- ------------------------------------------------------------------- summary

/** What a building card needs, without reading every unit into the page. */
create or replace function public.building_summary(target uuid)
returns table (
  total_units integer,
  available_units integer,
  min_price numeric,
  max_price numeric,
  floors_with_units integer
)
language sql
stable
as $$
  select
    count(*)::integer,
    count(*) filter (where status = 'available')::integer,
    min(price) filter (where status = 'available'),
    max(price) filter (where status = 'available'),
    count(distinct floor_number)::integer
  from public.properties
  where building_id = target;
$$;

grant execute on function public.building_summary(uuid) to anon, authenticated;
grant execute on function public.next_building_code(uuid) to authenticated;
