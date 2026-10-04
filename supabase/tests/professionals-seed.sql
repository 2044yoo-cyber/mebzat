-- Does the seeded directory actually answer the questions the pages ask?
--
-- Not "did twenty-eight rows go in" — that is an INSERT count and it proves
-- nothing about whether a customer can find any of them. This runs the
-- function the page runs, as an ordinary signed-in member, and checks the
-- answers: by trade, by where the job is, by availability, by provider type,
-- and that the map has a name it can resolve for every single one.
--
-- Run after 0084. It rolls itself back.
--
--   psql -f supabase/tests/professionals-seed.sql
--
-- ## The failure this exists to catch
--
-- `search_professionals` filters on `coalesce(p.is_demo, false) = false`. Seed
-- the directory the way 0044 seeds property agents — `is_demo = true` — and
-- every row goes in, every count passes, and the page stays empty. A check
-- that counted rows would have been green for a feature that did not work, so
-- nothing here counts rows in `profiles`: it asks the search.

begin;

create temporary table probe (name text, passed boolean, detail text) on commit drop;
grant all on probe to authenticated;

-- ---------------------------------------------------------------------------
-- The batch, taken down before the role changes
--
-- `seed_content` has RLS on and no policies at all — that is its whole access
-- model, and it is right: the register is for the owner and the service role,
-- not for members. It also means every check below that reads it as
-- `authenticated` reads an empty table.
--
-- That is not a theoretical problem. The first run of this file had eleven
-- checks shaped `count(*) = 0 from ... where id in (select from seed_content)`.
-- All eleven examined nothing, all eleven counted zero, and all eleven passed.
-- A check that passes on an empty set is not a check.
--
-- So the ids are taken here, as the owner, into a temporary table the role
-- change cannot hide — and the very next check asserts there are twenty-eight
-- of them, so that if this ever comes back empty, one check fails loudly
-- instead of eleven passing quietly.
-- ---------------------------------------------------------------------------

create temporary table seeded (id uuid primary key) on commit drop;
grant all on seeded to authenticated;

insert into seeded (id)
select entity_id from public.seed_content
where batch = 'professionals-2026-09' and entity = 'profiles';

insert into probe
select 'every seeded account is registered for removal',
       (select count(*) from public.seed_content
         where batch = 'professionals-2026-09' and entity = 'profiles') = 28,
       (select count(*)::text from public.seed_content
         where batch = 'professionals-2026-09' and entity = 'profiles');

insert into probe
select 'and the checks below have those twenty-eight to look at',
       count(*) = 28, count(*)::text
from seeded;

insert into probe
select 'the register names only rows this batch created',
       count(*) = 0, count(*)::text
from seeded s
where not exists (
  select 1 from public.profiles p
  where p.id = s.id and p.email like '%@professionals.medosha.local'
);

-- Somebody real, looking for a tradesman. None of these people are his.
insert into auth.users (id, email)
values ('99999999-0000-4000-8000-000000000077', 'customer@example.test')
on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-0000-4000-8000-000000000077';
set local request.jwt.claim.role = 'authenticated';

-- ---------------------------------------------------------------------------
-- The directory answers at all
-- ---------------------------------------------------------------------------

insert into probe
select 'the search returns the seeded professionals',
       count(*) >= 28, count(*)::text
from public.search_professionals(p_limit => 60);

insert into probe
select 'and it returns them as a page, not as a count with nothing behind it',
       count(*) = 28 and bool_and(profession is not null),
       count(*)::text || ' seeded, ' ||
       count(*) filter (where profession is null)::text || ' with no trade'
from public.search_professionals(p_limit => 60)
where id in (select id from seeded);

-- ---------------------------------------------------------------------------
-- By trade — including the trades 0084 is the first to use
-- ---------------------------------------------------------------------------

insert into probe
select 'a rebar bender can be found by his trade', count(*) = 2, count(*)::text
from public.search_professionals(p_profession => 'Rebar Bender (Ferayo)', p_limit => 60);

insert into probe
select 'and by the word used on site, through the free-text search',
       count(*) >= 2, count(*)::text
from public.search_professionals(p_query => 'ferayo', p_limit => 60);

insert into probe
select 'a carpenter''s helper is a trade of his own, not a carpenter',
       (select count(*) from public.search_professionals(
          p_profession => 'Carpenter''s Helper', p_limit => 60)) = 1
       and (select count(*) from public.search_professionals(
          p_profession => 'Carpenter', p_limit => 60)) = 1,
       'helper and carpenter are separate searches';

insert into probe
select 'every trade in the roster is reachable by its own name',
       count(*) filter (where n = 0) = 0,
       count(*) filter (where n = 0)::text || ' trades return nobody'
from (
  select p.profession,
         (select count(*) from public.search_professionals(
            p_profession => p.profession, p_limit => 60)) as n
  from (select distinct profession from public.profiles
         where id in (select id from seeded)
      ) p
) t;

-- ---------------------------------------------------------------------------
-- By where the job is
-- ---------------------------------------------------------------------------

insert into probe
select 'somebody who works in Bole is found by a job in Bole',
       count(*) >= 4, count(*)::text
from public.search_professionals(p_area => 'bole', p_limit => 60);

insert into probe
select 'and a job in Lebu finds the people who said Lebu',
       count(*) >= 3, count(*)::text
from public.search_professionals(p_area => 'lebu', p_limit => 60);

-- The whole point of 0078: base is not the filter. Solomon Desta is based in
-- Lebu and listed Sarbet; a search for Sarbet has to reach him.
insert into probe
select 'somebody based across town who listed the area still appears',
       exists (
         select 1 from public.search_professionals(p_area => 'sarbet', p_limit => 60)
         where username = 'solomon_desta'
       ),
       'searching Sarbet reaches the ferayo based in Lebu';

insert into probe
select 'a citywide firm answers an area it never listed',
       exists (
         select 1 from public.search_professionals(p_area => 'ayat', p_limit => 60)
         where username = 'lideta_contractors'
       ),
       'serves_entire_city is what makes this one match';

insert into probe
select 'and a firm that is not citywide does not',
       not exists (
         select 1 from public.search_professionals(p_area => 'ayat', p_limit => 60)
         where username = 'gotera_plumbing'
       ),
       'Gotera Plumbing listed five areas and Ayat is not one of them';

-- ---------------------------------------------------------------------------
-- Availability, which is a filter the page offers
-- ---------------------------------------------------------------------------

insert into probe
select 'the availability filter narrows the directory',
       (select count(*) from public.search_professionals(
          p_available_only => true, p_limit => 60))
       < (select count(*) from public.search_professionals(p_limit => 60)),
       'a filter that changes nothing is not a filter';

insert into probe
select 'and everybody it returns is actually taking work',
       bool_and(work_status in ('available', 'limited')),
       count(*)::text || ' returned'
from public.search_professionals(p_available_only => true, p_limit => 60);

-- Narrowing is not enough on its own. If every one of these twenty-eight were
-- booked solid, the count would still narrow — on the profiles that were here
-- before them — and a customer filtering for somebody who can start would be
-- shown an empty directory while all three checks above stayed green. This is
-- the one that says the roster itself answers the filter.
insert into probe
select 'and the seeded tradespeople are most of what it finds',
       count(*) >= 15, count(*)::text || ' of the 28 are taking work'
from public.search_professionals(p_available_only => true, p_limit => 60)
where id in (select id from seeded);

-- The other half of the same point: a roster where everybody is available
-- makes the filter meaningless in the other direction.
insert into probe
select 'and some of them are not, so the filter is a real distinction',
       count(*) >= 3, count(*)::text || ' are busy or booked'
from public.search_professionals(p_limit => 60)
where id in (select id from seeded)
  and work_status not in ('available', 'limited');

insert into probe
select 'somebody who is fully booked is excluded by it',
       not exists (
         select 1 from public.search_professionals(p_available_only => true, p_limit => 60)
         where work_status not in ('available', 'limited')
       ),
       'busy and fully_booked are the two the filter is for';

-- ---------------------------------------------------------------------------
-- Individuals and firms
-- ---------------------------------------------------------------------------

insert into probe
select 'the firms are findable as companies', count(*) >= 8, count(*)::text
from public.search_professionals(p_provider => 'company', p_limit => 60);

insert into probe
select 'and the workers as individuals', count(*) >= 20, count(*)::text
from public.search_professionals(p_provider => 'individual', p_limit => 60);

insert into probe
select 'every firm is also in the business directory',
       count(*) = 8, count(*)::text
from public.companies
where import_source = 'seed'
  and external_ref in ('gerji_wood_works', 'kazanchis_electrical', 'lebu_metal_works',
                       'summit_interiors', 'kolfe_scaffolding', 'gotera_plumbing',
                       'shola_gypsum', 'lideta_contractors');

insert into probe
select 'and each of those belongs to the profile that is its account',
       bool_and(p.id is not null and p.account_type <> 'individual'),
       count(*)::text
from public.companies c
left join public.profiles p on p.id = c.owner_id
where c.import_source = 'seed' and c.external_ref like '%_%'
  and c.owner_id in (select id from seeded);

-- ---------------------------------------------------------------------------
-- The map can draw every one of them
--
-- `mapPoints` resolves a point from the *name* of an area. A professional
-- whose base_area is a name the gazetteer has never heard of is a professional
-- the map silently drops — which is exactly the state the directory was in
-- before this seed, and the reason "56 professionals" drew no markers at all.
-- ---------------------------------------------------------------------------

insert into probe
select 'every seeded professional has a base area the gazetteer knows',
       count(*) = 0,
       count(*)::text || ' base areas do not resolve'
from public.profiles p
where p.id in (select id from seeded)
  and not exists (
    select 1 from public.location_areas a
    where lower(a.name) = lower(p.base_area) and a.city = 'Addis Ababa'
  );

insert into probe
select 'and at least three areas they travel to',
       count(*) = 0,
       count(*)::text || ' have fewer than three'
from (
  select s.id, count(sa.id) as n
  from seeded s
  left join public.professional_service_areas sa on sa.profile_id = s.id
  group by s.id
  having count(sa.id) < 3
) t;

insert into probe
select 'every service area row points at an area that exists',
       count(*) = 0, count(*)::text
from public.professional_service_areas sa
where sa.profile_id in (select id from seeded)
  and not exists (select 1 from public.location_areas a where a.slug = sa.area_slug);

-- ---------------------------------------------------------------------------
-- What was deliberately left out
-- ---------------------------------------------------------------------------

insert into probe
select 'not one of them publishes a phone number',
       count(*) = 0,
       count(*)::text || ' have a number or show_phone set'
from public.profiles p
where p.id in (select id from seeded)
  and (p.phone is not null or p.show_phone);

insert into probe
select 'and the search hands none out either',
       bool_and(phone is null), count(*)::text
from public.search_professionals(p_limit => 60);

insert into probe
select 'none of them carries a rating nobody gave them',
       bool_and(rating is null),
       count(*) filter (where rating is not null)::text || ' have one'
from public.search_professionals(p_limit => 60)
where id in (select id from seeded);

insert into probe
select 'none of them is verified, because nobody checked a document',
       bool_and(not id_verified and not business_verified and not license_verified),
       'a seeded badge is a lie with a tick next to it'
from public.search_professionals(p_limit => 60)
where id in (select id from seeded);

-- Not marked is_demo, and this is the one that matters: the search excludes
-- demo profiles, so the flag would have hidden the whole batch.
insert into probe
select 'not one is flagged is_demo, which would hide it from the search',
       count(*) = 0, count(*)::text
from public.profiles p
where p.id in (select id from seeded)
  and coalesce(p.is_demo, false);

-- ---------------------------------------------------------------------------
-- Removable, and nothing else with it
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------

-- `coalesce` because a check whose subject set is empty yields NULL, not
-- false — `bool_and` over no rows is NULL — and `count(*) filter (where not
-- passed)` does not count a NULL. Without this, a check that silently examined
-- nothing was reported neither as a pass nor as a failure, and the summary
-- line said "23 passed, 2 failed" over 28 checks. That is how three broken
-- checks nearly went out green.
select
  case when coalesce(passed, false) then '   PASS' else '** FAIL' end as result,
  name, detail
from probe
order by coalesce(passed, false), name;

select format('%s passed, %s failed',
              count(*) filter (where coalesce(passed, false)),
              count(*) filter (where not coalesce(passed, false))) as summary
from probe;

rollback;
