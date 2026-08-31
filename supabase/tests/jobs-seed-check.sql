-- Does the populated board actually work?
--
-- Not "did fifty rows go in" — that is an INSERT count and it proves nothing.
-- This runs the queries the application itself runs, as an ordinary signed-in
-- member, and checks that the postings come back through each of them: the
-- feed, search, the category filter, the location filter, one job's page, the
-- poster's profile, a company page, and applying.
--
-- Run it after supabase/seed/jobs-50.sql. It rolls itself back.

begin;

create temporary table probe (name text, passed boolean, detail text) on commit drop;
grant all on probe to authenticated;

-- Somebody real, who did not post any of these.
insert into auth.users (id, email)
values ('99999999-0000-4000-8000-000000000001', 'jobseeker@example.test')
on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

-- ---------------------------------------------------------------------------
-- The feed — getJobs()
-- ---------------------------------------------------------------------------

insert into probe
select 'the feed shows the postings', count(*) >= 45, count(*)::text
from public.jobs
where status = 'open' and visibility = 'public';

-- Ordered newest first, which is what makes them read as recently posted.
insert into probe
select 'the newest posting is hours old, not months',
       now() - max(created_at) < interval '3 days',
       age(now(), max(created_at))::text
from public.jobs where status = 'open' and visibility = 'public';

insert into probe
select 'the oldest is weeks old, so the board has history',
       now() - min(created_at) > interval '20 days',
       age(now(), min(created_at))::text
from public.jobs where status = 'open' and visibility = 'public';

-- Every card needs an employer name or it renders as "Medosha member", and a
-- page of those is the single most obvious tell that a board was populated.
insert into probe
select 'every posting has a named employer',
       bool_and(
         coalesce(
           nullif(trim(c.name), ''),
           nullif(trim(p.company_name), ''),
           nullif(trim(p.full_name), '')
         ) is not null
       ),
       count(*) filter (
         where coalesce(nullif(trim(c.name), ''), nullif(trim(p.company_name), ''),
                        nullif(trim(p.full_name), '')) is null
       )::text
from public.jobs j
join public.profiles p on p.id = j.poster_id
left join public.companies c on c.id = j.company_id
where j.status = 'open' and j.visibility = 'public';

-- ---------------------------------------------------------------------------
-- Search — the `or(title.ilike, profession.ilike, description.ilike)` in getJobs
-- ---------------------------------------------------------------------------

insert into probe
select 'searching a trade finds work', count(*) >= 2, count(*)::text
from public.jobs
where status = 'open' and visibility = 'public'
  and (title ilike '%plumb%' or profession ilike '%plumb%' or description ilike '%plumb%');

insert into probe
select 'searching a city finds work', count(*) >= 1, count(*)::text
from public.jobs
where status = 'open' and visibility = 'public'
  and (title ilike '%Hawassa%' or description ilike '%Hawassa%');

-- global_search from 0035, which is what the site-wide search box uses.
insert into probe
select 'site search returns jobs', count(*) >= 1, count(*)::text
from public.global_search('engineer', 30) where kind = 'job';

-- ---------------------------------------------------------------------------
-- Filters
-- ---------------------------------------------------------------------------

insert into probe
select 'the categories span the trade', count(distinct category) >= 20,
       count(distinct category)::text
from public.jobs where status = 'open' and visibility = 'public';

-- Each of the disciplines the brief named must actually be filterable, which
-- means at least one open posting carries the id the sidebar links to.
insert into probe
select format('category filter works for %s', c), count(*) >= 1, count(*)::text
from unnest(array[
  'architecture','interior_design','structural_engineering','civil_engineering',
  'mep','plumbing','electrical','site_engineering','quantity_surveying','bim',
  'rendering','furniture','carpentry','finishing','masonry','painting','tiling',
  'landscaping','property_services'
]) as c
left join public.jobs j
  on j.category = c and j.status = 'open' and j.visibility = 'public'
group by c;

insert into probe
select format('location filter works for %s', city), count(*) >= 1, count(*)::text
from unnest(array[
  'Addis Ababa','Dire Dawa','Adama','Bishoftu','Hawassa','Bahir Dar','Mekelle'
]) as city
left join public.jobs j
  on j.location_city = city and j.status = 'open' and j.visibility = 'public'
group by city;

insert into probe
select 'the skills filter works', count(*) >= 1, count(*)::text
from public.jobs
where status = 'open' and visibility = 'public' and skills @> array['Revit'];

insert into probe
select 'every posting carries skills to filter on',
       bool_and(array_length(skills, 1) >= 3), count(*)::text
from public.jobs where status = 'open' and visibility = 'public';

-- ---------------------------------------------------------------------------
-- A job's own page — getJob()
-- ---------------------------------------------------------------------------

insert into probe
select 'a posting opens with everything its page renders',
       count(*) = 1
         and bool_and(length(description) > 120)
         and bool_and(responsibilities is not null)
         and bool_and(requirements is not null),
       null
from public.jobs
where status = 'open' and visibility = 'public'
  and title = 'Structural Engineer — G+12 residential, Kazanchis';

insert into probe
select 'pay is a range a person can act on',
       bool_and(salary_min > 0 and salary_max >= salary_min),
       null
from public.jobs
where status = 'open' and visibility = 'public' and salary_visible;

-- Not every employer publishes pay, and a board where all fifty do is a board
-- nobody wrote.
insert into probe
select 'some employers withhold the figure, as they do',
       count(*) between 1 and 12, count(*)::text
from public.jobs
where status = 'open' and visibility = 'public' and not salary_visible;

-- ---------------------------------------------------------------------------
-- The words that must never appear
-- ---------------------------------------------------------------------------

-- Substring, not word boundary, and deliberately so. The brief said these
-- words must not appear on a job card or a public page, and "pressure testing"
-- contains one of them however innocent the sentence is. A check that argues
-- about word boundaries is a check that lets a screenshot through with TEST in
-- the title, so this one does not argue.
insert into probe
select 'nothing anywhere says demo, test, sample or seed',
       count(*) = 0,
       coalesce(string_agg(title, '; '), 'none')
from public.jobs
where concat_ws(' ', title, description, responsibilities, requirements,
                profession, category, slug, array_to_string(skills, ' '))
      ~* '(demo|test|sample|seed|dummy|placeholder|lorem|fake)';

-- ---------------------------------------------------------------------------
-- The poster's profile and the company page
-- ---------------------------------------------------------------------------

insert into probe
select 'postings appear on their poster''s profile', count(*) >= 1, count(*)::text
from public.jobs
where poster_id = (
  select poster_id from public.jobs
  where status = 'open' and visibility = 'public'
  order by created_at desc limit 1
) and status = 'open' and visibility = 'public';

insert into probe
select 'postings appear on a company page', count(*) >= 1, count(*)::text
from public.jobs
where company_id is not null and status = 'open' and visibility = 'public';

-- ---------------------------------------------------------------------------
-- Applying
-- ---------------------------------------------------------------------------

do $$
declare
  target uuid;
  application_id uuid;
begin
  select id into target from public.jobs
   where status = 'open' and visibility = 'public'
   order by created_at desc limit 1;

  application_id := public.job_apply(
    p_job => target,
    p_cover_letter => 'Fifteen years on site and I can start in three weeks.',
    p_expected => 40000
  );

  insert into probe values (
    'a member can apply to one of these', application_id is not null, null
  );
end $$;

-- ---------------------------------------------------------------------------
-- The register is invisible, and complete
-- ---------------------------------------------------------------------------

insert into probe
select 'a signed-in member cannot read the register', count(*) = 0, count(*)::text
from public.seed_content;

reset role;

-- Checked with RLS off, because `notifications` is secured on user_id: an
-- applicant counting the employer's notifications counts zero and the check
-- would pass for entirely the wrong reason.
insert into probe
select 'the employer was notified of the application', count(*) = 1, count(*)::text
from public.notifications n
where n.kind = 'job_application'
  and n.user_id = (
    select j.poster_id from public.jobs j
    join public.job_applications a on a.job_id = j.id
    where a.applicant_id = '99999999-0000-4000-8000-000000000001'
  );

insert into probe
select 'every posting is registered for removal', count(*) = 50, count(*)::text
from public.seed_content where batch = 'jobs-launch-01';

-- The genuine posting, which nothing here was allowed to touch.
insert into probe
select 'a real member''s own posting is untouched and unregistered',
       count(*) = 1 and bool_and(s.id is null), count(*)::text
from public.jobs j
left join public.seed_content s on s.entity_id = j.id
where j.slug = 'my-own-real-posting';

-- ---------------------------------------------------------------------------

select
  case when passed then '   PASS' else '** FAIL' end as result,
  name, detail
from probe
order by passed, name;

select format('%s passed, %s failed',
              count(*) filter (where passed),
              count(*) filter (where not passed)) as summary
from probe;

rollback;
