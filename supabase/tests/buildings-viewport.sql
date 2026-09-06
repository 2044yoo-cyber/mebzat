-- Developments on the map: the checks, against this database.
--
--   Paste into the Supabase SQL editor and run, after applying 0066. It prints
--   one line per check and rolls itself back — every row it creates is gone
--   when it finishes, and none of yours is read for writing.
--
-- It builds its own four buildings rather than asserting against yours. The
-- question "does a development with no listed units appear" has a fixed answer
-- and a fixture that gives it; asking it of live data makes the result depend
-- on what somebody happened to post this week.

begin;

insert into public.companies (id, name)
values ('cc000000-0000-4000-8000-00000000ffff', 'Probe Developments')
on conflict (id) do nothing;

-- The case the map could never show: under construction, nothing listed.
insert into public.buildings
  (id, name, building_type, construction_status, floors, total_units,
   completion_percent, latitude, longitude, sub_city, company_id)
values
  ('bb000000-0000-4000-8000-00000000fff1', 'Probe Mixed-Use', 'office',
   'under_construction', 12, 120, 45, 9.0101, 38.7601, 'Bole',
   'cc000000-0000-4000-8000-00000000ffff');

-- Finished, with two units on the market and one already sold.
insert into public.buildings
  (id, name, building_type, construction_status, floors, total_units,
   latitude, longitude, sub_city)
values
  ('bb000000-0000-4000-8000-00000000fff2', 'Probe Towers', 'apartment',
   'completed', 8, 60, 9.0202, 38.8002, 'CMC');

insert into public.properties (id, owner_id, title, slug, property_type,
  listing_kind, price, currency, building_id, status, latitude, longitude)
select
  ('bb111111-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
  (select id from public.profiles limit 1),
  'Probe unit ' || g, 'probe-unit-' || g, 'apartment', 'sale',
  (array[4500000, 3200000, 1000000])[g], 'ETB',
  'bb000000-0000-4000-8000-00000000fff2',
  (array['available','available','sold'])[g]::public.property_status,
  9.0202, 38.8002
from generate_series(1, 3) as g;

-- Outside on each axis separately, and null on each coordinate separately.
-- Both pairs matter: a check whose fixture is outside on *both* axes passes
-- with either half of the bounding box deleted, and a check whose fixture has
-- *both* coordinates null passes with either null-guard deleted. Two rows that
-- fail for two reasons at once test one predicate between them.
insert into public.buildings (id, name, latitude, longitude) values
  ('bb000000-0000-4000-8000-00000000fff3', 'Probe North', 20.0, 38.75),
  ('bb000000-0000-4000-8000-00000000fff4', 'Probe East',  9.01, 50.0),
  ('bb000000-0000-4000-8000-00000000fff5', 'Probe No Lat', null, 38.75),
  ('bb000000-0000-4000-8000-00000000fff6', 'Probe No Lng', 9.01, null);

create temporary view probe as
  select * from public.buildings_in_viewport(8.9, 38.6, 9.2, 38.9)
  where name like 'Probe %';
grant select on probe to authenticated, anon;

set role authenticated;

select '1. a development with no listed units still appears' as step,
       exists (select 1 from probe where name = 'Probe Mixed-Use') as should_be_true;

select '1b. and reports no units rather than failing' as step,
       (select unit_count from probe where name = 'Probe Mixed-Use') = 0 as should_be_true;

select '1c. with no price, because nothing is for sale in it yet' as step,
       (select price_from from probe where name = 'Probe Mixed-Use') is null as should_be_true;

select '2. listed units are counted' as step,
       (select unit_count from probe where name = 'Probe Towers') = 2 as should_be_true;

select '2b. and the sold one is not, in the count or the price' as step,
       (select price_from from probe where name = 'Probe Towers') = 3200000 as should_be_true;

select '3. north of the box is excluded' as step,
       not exists (select 1 from probe where name = 'Probe North') as should_be_true;

select '3b. and east of it' as step,
       not exists (select 1 from probe where name = 'Probe East') as should_be_true;

select '3c. a null latitude is excluded' as step,
       not exists (select 1 from probe where name = 'Probe No Lat') as should_be_true;

select '3d. and a null longitude' as step,
       not exists (select 1 from probe where name = 'Probe No Lng') as should_be_true;

-- coalesce, because a dropped join returns null rather than false, and a null
-- reads as neither passed nor failed in the output — which is how a broken
-- join looked like a passing check.
select '4. the developer comes through' as step,
       coalesce(
         (select company_name from probe where name = 'Probe Mixed-Use')
           = 'Probe Developments', false) as should_be_true;

select '5. construction status filters' as step,
       (select count(*) from public.buildings_in_viewport(
          8.9, 38.6, 9.2, 38.9,
          array['under_construction']::public.construction_status[])
        where name like 'Probe %') = 1 as should_be_true;

select '6. an anonymous visitor sees them too' as step, true as should_be_true;
reset role;
set role anon;
select '6b. and gets the same count' as step,
       (select count(*) from probe) = 2 as should_be_true;

select '7. the cap is honoured' as step,
       (select count(*) from public.buildings_in_viewport(8.9, 38.6, 9.2, 38.9, null, 1)) = 1
       as should_be_true;

reset role;
rollback;

-- Nothing above survives. Confirm with:
--   select count(*) from public.buildings where name like 'Probe %';
