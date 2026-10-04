-- Construction status, on properties as well as buildings.
--
-- 0053 gave buildings a construction_status with four values borrowed from how
-- a developer talks about a project. The map filter needs the vocabulary a
-- buyer uses standing in front of a half-built block: is it a shell, is it
-- plastered, can I move in. Those are different questions and the four values
-- did not answer them.
--
-- ALTER TYPE ... ADD VALUE is additive and does not rewrite the table, so
-- every existing row keeps the value it has.

-- Postgres refuses ADD VALUE inside a transaction block that then uses the new
-- value, so the additions stand alone and anything reading them comes later.
alter type public.construction_status add value if not exists 'unfinished' before 'planned';
alter type public.construction_status add value if not exists 'structure_complete' after 'under_construction';
alter type public.construction_status add value if not exists 'finishing' after 'structure_complete';
alter type public.construction_status add value if not exists 'furnished' after 'completed';

-- A property can be mid-build too — a shell unit sold to be finished by the
-- buyer is an ordinary listing here, not an edge case.
alter table public.properties
  add column if not exists construction_status public.construction_status,
  add column if not exists completion_percent smallint
    check (completion_percent is null or (completion_percent between 0 and 100));

create index if not exists properties_construction_idx
  on public.properties (construction_status)
  where construction_status is not null;

-- Seed buildings must be as removable as seed properties already are. The
-- properties table has carried is_sample since its own demo seed; without the
-- same flag here, demo buildings would be indistinguishable from real ones the
-- first time somebody wanted to clear them out.
alter table public.buildings
  add column if not exists is_sample boolean not null default false;

create index if not exists buildings_sample_idx
  on public.buildings (is_sample) where is_sample;

-- How many units the building has, which is not how many are listed here. A
-- tower of 64 flats with 6 on the market is the normal case, and counting rows
-- would either understate the building or require 64 rows to describe it.
alter table public.buildings
  add column if not exists total_units smallint
    check (total_units is null or total_units >= 0),
  add column if not exists completion_percent smallint
    check (completion_percent is null or (completion_percent between 0 and 100));

-- What a building card counts. Kept in SQL because the map asks for it per
-- building and per viewport, and counting in the page would be one round trip
-- per marker.
create or replace function public.building_availability(target uuid)
returns table (
  total_units integer,
  available_units integer,
  for_sale integer,
  for_rent integer,
  from_price numeric
)
language sql
stable
as $$
  select
    count(*)::integer,
    count(*) filter (where status = 'available')::integer,
    count(*) filter (where status = 'available' and listing_kind = 'sale')::integer,
    count(*) filter (where status = 'available' and listing_kind = 'rent')::integer,
    min(price) filter (where status = 'available')
  from public.properties
  where building_id = target;
$$;

grant execute on function public.building_availability(uuid) to anon, authenticated;
