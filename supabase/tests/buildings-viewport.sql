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

-- Its own owner, rather than `(select id from public.profiles limit 1)`.
--
-- That worked when this file was only ever pasted into a populated Supabase
-- project, and returns null against a database built from the migrations
-- alone — which is what `supabase/tests/run.sh` does. A fixture that depends
-- on somebody else's rows is a fixture whose result depends on them.
insert into auth.users (id, email)
values ('aa000000-0000-4000-8000-00000000ffff', 'buildings@example.test')
on conflict (id) do nothing;

update public.profiles
set username = 'probe_buildings', full_name = 'Probe Buildings Owner'
where id = 'aa000000-0000-4000-8000-00000000ffff';

-- `slug` is NOT NULL and has no default; it was added after this fixture was
-- written, which is why the insert used to name only the id and the name.
insert into public.companies (id, name, slug)
values ('cc000000-0000-4000-8000-00000000ffff', 'Probe Developments',
        'probe-developments')
on conflict (id) do nothing;

-- The case the map could never show: under construction, nothing listed.
-- `code` and `owner_id` are NOT NULL with no default, and both arrived after
-- this fixture. Every insert below names them.
insert into public.buildings
  (id, code, owner_id, name, building_type, construction_status, floors,
   total_units, completion_percent, latitude, longitude, sub_city, company_id)
values
  ('bb000000-0000-4000-8000-00000000fff1', 'PROBE-1',
   'aa000000-0000-4000-8000-00000000ffff', 'Probe Mixed-Use', 'office',
   'under_construction', 12, 120, 45, 9.0101, 38.7601, 'Bole',
   'cc000000-0000-4000-8000-00000000ffff');

-- Finished, with two units on the market and one already sold.
insert into public.buildings
  (id, code, owner_id, name, building_type, construction_status, floors,
   total_units, latitude, longitude, sub_city)
values
  ('bb000000-0000-4000-8000-00000000fff2', 'PROBE-2',
   'aa000000-0000-4000-8000-00000000ffff', 'Probe Towers', 'apartment',
   'completed', 8, 60, 9.0202, 38.8002, 'CMC');

insert into public.properties (id, owner_id, title, slug, property_type,
  listing_kind, price, currency, building_id, status, latitude, longitude)
select
  ('bb111111-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
  'aa000000-0000-4000-8000-00000000ffff',
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
insert into public.buildings (id, code, owner_id, name, latitude, longitude) values
  ('bb000000-0000-4000-8000-00000000fff3', 'PROBE-3', 'aa000000-0000-4000-8000-00000000ffff', 'Probe North', 20.0, 38.75),
  ('bb000000-0000-4000-8000-00000000fff4', 'PROBE-4', 'aa000000-0000-4000-8000-00000000ffff', 'Probe East',  9.01, 50.0);

-- A building with no coordinate used to be two more rows here, and two checks
-- below. `latitude` and `longitude` are NOT NULL now, so the case cannot be
-- built: the constraint refuses it before `buildings_in_viewport` is ever
-- asked. Sections 3c and 3d went with them rather than being rewritten to
-- assert that the insert fails — that would be a test of the column
-- definition dressed up as a test of the function, and the function has
-- nothing left to get wrong there.

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
