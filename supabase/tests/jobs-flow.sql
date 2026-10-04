-- Jobs — the queries the application actually runs.
--
-- `jobs.sql` walks the flow and checks the rules. This file checks something
-- narrower and just as easy to get wrong: that the specific queries in
-- `src/lib/data/jobs.ts` and the RPC calls in `src/app/jobs/actions.ts` return
-- what the pages assume they return.
--
-- A policy can be correct while the query above it asks the wrong question. A
-- list that filters on `status = 'open'` but forgets `visibility = 'public'`
-- still passes every policy test — the policy allows the poster to see their
-- own private job — and quietly publishes a private posting to a list. That is
-- the class of mistake this file is for.
--
-- Run it after 0032–0035. It prints one line per check and rolls itself back.

begin;

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'flow-employer@example.test'),
  ('a1000000-0000-4000-8000-000000000002', 'flow-engineer@example.test'),
  ('a1000000-0000-4000-8000-000000000003', 'flow-outsider@example.test');

create temporary table probe (name text, passed boolean, detail text);
grant all on probe to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

-- ---------------------------------------------------------------------------
-- POST — a draft, exactly as `createJob` writes one
-- ---------------------------------------------------------------------------

insert into public.jobs (
  id, poster_id, title, slug, description, category, profession,
  job_type, work_mode, experience_level,
  salary_min, salary_max, currency, salary_period, salary_visible,
  location_city, location_country, openings, skills, closes_on,
  status, visibility
)
values (
  'b1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'Structural Engineer for a G+12 in Kazanchis',
  'structural-engineer-kazanchis-a1b2c3',
  'Reviewing and stamping the frame design, then supervising the pour sequence.',
  'structural_engineering', 'Structural Engineer',
  'full_time', 'on_site', 'senior',
  60000, 85000, 'ETB', 'month', true,
  'Addis Ababa', 'Ethiopia', 1,
  array['ETABS', 'Rebar detailing', 'ES EN 1992'],
  current_date + 21,
  'draft', 'public'
);

-- A second, private, so every list check below has something it must exclude.
insert into public.jobs (
  id, poster_id, title, slug, description, category,
  job_type, work_mode, experience_level, currency, salary_period,
  location_city, openings, skills, status, visibility
)
values (
  'b1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000001',
  'Replacing our MEP lead, discreetly',
  'mep-lead-private-d4e5f6',
  'Not to be advertised while the current holder is still in post.',
  'mep', 'full_time', 'on_site', 'lead', 'ETB', 'month',
  'Addis Ababa', 1, array['HVAC'], 'open', 'private'
);

-- The employer's own dashboard query: every status, drafts included.
insert into probe
select 'getMyJobs returns drafts as well as live jobs',
       count(*) = 2 and count(*) filter (where status = 'draft') = 1,
       count(*)::text
from public.jobs
where poster_id = 'a1000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Applying before it is published
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';

do $$
declare ok boolean := false;
begin
  begin
    perform public.job_apply('b1000000-0000-4000-8000-000000000001');
  exception when others then
    ok := true;
  end;
  insert into probe values ('a draft cannot be applied to', ok, null);
end $$;

-- A private job is reachable by its link on purpose, so it *is* applicable.
-- This is the difference between "unlisted" and "closed", and getting it wrong
-- in either direction breaks a real use of the feature.
do $$
declare application_id uuid;
begin
  application_id := public.job_apply(
    'b1000000-0000-4000-8000-000000000002',
    'I have run MEP on two towers in Addis.'
  );
  insert into probe values (
    'a private job can still be applied to by link',
    application_id is not null, application_id::text
  );
end $$;

-- ---------------------------------------------------------------------------
-- PUBLISH
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

update public.jobs
   set status = 'open'
 where id = 'b1000000-0000-4000-8000-000000000001';

insert into probe
select 'publishing a draft makes it open', status = 'open', status::text
from public.jobs where id = 'b1000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- SEARCH — the list query from getJobs, run as somebody else
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000003';

insert into probe
select 'the public list shows the published job',
       count(*) = 1,
       count(*)::text
from public.jobs
where status = 'open' and visibility = 'public';

insert into probe
select 'the public list excludes the private job',
       count(*) = 0, count(*)::text
from public.jobs
where status = 'open' and visibility = 'public'
  and id = 'b1000000-0000-4000-8000-000000000002';

-- The category filter, which is the one the sidebar counts drive.
insert into probe
select 'filtering by category finds it', count(*) = 1, count(*)::text
from public.jobs
where status = 'open' and visibility = 'public'
  and category = 'structural_engineering';

-- The skills filter. `skills @> array[...]` is what PostgREST's `.contains()`
-- compiles to, and it is the reason `jobs_skills_idx` is a gin index.
insert into probe
select 'filtering by skill finds it', count(*) = 1, count(*)::text
from public.jobs
where status = 'open' and visibility = 'public'
  and skills @> array['ETABS'];

insert into probe
select 'a skill nobody asked for finds nothing', count(*) = 0, count(*)::text
from public.jobs
where status = 'open' and visibility = 'public'
  and skills @> array['Welding'];

-- The "pays at least" filter deliberately drops jobs that hide their salary,
-- rather than assuming they qualify.
insert into probe
select 'the minimum-pay filter uses the top of the range',
       count(*) = 1, count(*)::text
from public.jobs
where status = 'open' and visibility = 'public'
  and salary_visible and salary_max >= 80000;

insert into probe
select 'global search finds the published job',
       count(*) >= 1, count(*)::text
from public.global_search('Kazanchis', 20)
where kind = 'job';

insert into probe
select 'global search never returns the private one',
       count(*) = 0, count(*)::text
from public.global_search('discreetly', 20)
where kind = 'job';

-- ---------------------------------------------------------------------------
-- APPLY
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';

do $$
declare application_id uuid;
begin
  application_id := public.job_apply(
    p_job => 'b1000000-0000-4000-8000-000000000001',
    p_cover_letter => 'Fourteen years on frames, six of them stamping.',
    p_cv_url => 'https://example.test/cv.pdf',
    p_expected => 78000,
    p_available_from => current_date + 30,
    p_availability_note => 'One month notice'
  );
  insert into probe values (
    'applying returns the application id', application_id is not null, null
  );
end $$;

insert into probe
select 'the figures the applicant entered are kept',
       expected_salary = 78000
         and available_from = current_date + 30
         and availability_note = 'One month notice',
       expected_salary::text
from public.job_applications
where job_id = 'b1000000-0000-4000-8000-000000000001';

-- Applying to your own posting is refused, which is the check the old
-- table-write path did in TypeScript and the function now does in one place.
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

do $$
declare ok boolean := false;
begin
  begin
    perform public.job_apply('b1000000-0000-4000-8000-000000000001');
  exception when others then
    ok := true;
  end;
  insert into probe values ('you cannot apply to your own job', ok, null);
end $$;

-- ---------------------------------------------------------------------------
-- EMPLOYER RECEIVES
-- ---------------------------------------------------------------------------

-- Exactly one. 0012 notifies from a trigger and 0034 used to notify from the
-- function as well, which sent two of everything — the thing the spec asked
-- for explicitly ("do NOT create a second notification system") and the reason
-- these counts are equalities rather than `>= 1`.
insert into probe
select 'the employer was notified exactly once', count(*) = 1, count(*)::text
from public.notifications
where user_id = 'a1000000-0000-4000-8000-000000000001'
  and kind = 'job_application'
  and href like '%b1000000-0000-4000-8000-000000000001%';

insert into probe
select 'the notification leads to the pipeline, not the advert',
       bool_and(href = '/jobs/b1000000-0000-4000-8000-000000000001/applications'),
       min(href)
from public.notifications
where user_id = 'a1000000-0000-4000-8000-000000000001'
  and kind = 'job_application'
  and href like '%b1000000-0000-4000-8000-000000000001%';

-- The pipeline query from getJobApplications, including the applicant join.
insert into probe
select 'the pipeline lists the applicant with their profile',
       count(*) = 1 and bool_and(p.id is not null),
       count(*)::text
from public.job_applications a
join public.profiles p on p.id = a.applicant_id
where a.job_id = 'b1000000-0000-4000-8000-000000000001';

-- getMyJobs counts what is waiting, not what was ever submitted.
insert into probe
select 'the waiting count ignores withdrawn and rejected',
       count(*) filter (
         where status not in ('withdrawn', 'rejected')
       ) = 1,
       count(*)::text
from public.job_applications
where job_id = 'b1000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- SHORTLIST
-- ---------------------------------------------------------------------------

do $$
declare application_id uuid;
begin
  select id into application_id from public.job_applications
   where job_id = 'b1000000-0000-4000-8000-000000000001';
  perform public.job_set_application_status(application_id, 'shortlisted');
end $$;

insert into probe
select 'the applicant is shortlisted', status = 'shortlisted', status::text
from public.job_applications
where job_id = 'b1000000-0000-4000-8000-000000000001';

-- Read as the applicant: `notifications` is row-level-secured on user_id, so
-- an employer counting the applicant's notifications counts zero and the check
-- passes for the wrong reason.
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';

insert into probe
select 'and told about it, once', count(*) = 1, count(*)::text
from public.notifications
where user_id = 'a1000000-0000-4000-8000-000000000002'
  and kind = 'application_update'
  and title = 'You have been shortlisted';

set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

-- An outsider must not be able to move somebody else's applicant.
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000003';

do $$
declare ok boolean := false; application_id uuid;
begin
  select id into application_id from public.job_applications
   where job_id = 'b1000000-0000-4000-8000-000000000001';
  begin
    perform public.job_set_application_status(application_id, 'rejected');
  exception when others then
    ok := true;
  end;
  insert into probe values (
    'a stranger cannot move an application', ok, null
  );
end $$;

-- ---------------------------------------------------------------------------
-- MESSAGE
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

do $$
declare thread uuid;
begin
  thread := public.start_direct_conversation(
    'a1000000-0000-4000-8000-000000000002',
    'job',
    'b1000000-0000-4000-8000-000000000001',
    'Structural Engineer for a G+12 in Kazanchis'
  );
  insert into probe values (
    'the employer can message the applicant about the job',
    thread is not null, thread::text
  );
end $$;

insert into probe
select 'the conversation remembers which job it is about',
       count(*) = 1, count(*)::text
from public.conversations
where context_type = 'job'
  and context_id = 'b1000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- HIRE
-- ---------------------------------------------------------------------------

do $$
declare application_id uuid; hire_id uuid;
begin
  select id into application_id from public.job_applications
   where job_id = 'b1000000-0000-4000-8000-000000000001';

  hire_id := public.job_hire(
    p_application => application_id,
    p_amount => 80000,
    p_currency => 'ETB',
    p_period => 'month',
    p_starts_on => current_date + 30,
    p_note => 'Subject to the licence check.'
  );

  insert into probe values ('hiring returns the hire', hire_id is not null, null);
end $$;

insert into probe
select 'the agreement records what was agreed',
       agreed_amount = 80000 and currency = 'ETB' and amount_period = 'month'
         and starts_on = current_date + 30,
       agreed_amount::text
from public.job_hires
where job_id = 'b1000000-0000-4000-8000-000000000001';

insert into probe
select 'the one-opening job is now filled', status = 'filled', status::text
from public.jobs where id = 'b1000000-0000-4000-8000-000000000001';

insert into probe
select 'a filled job is off the open list', count(*) = 0, count(*)::text
from public.jobs
where status = 'open' and visibility = 'public'
  and id = 'b1000000-0000-4000-8000-000000000001';

-- The hire reuses the conversation that was already open rather than starting
-- a second one beside it.
insert into probe
select 'hiring did not open a second conversation', count(*) = 1, count(*)::text
from public.conversations
where context_type = 'job'
  and context_id = 'b1000000-0000-4000-8000-000000000001';

insert into probe
select 'the hire points at that conversation',
       conversation_id is not null, conversation_id::text
from public.job_hires
where job_id = 'b1000000-0000-4000-8000-000000000001';

-- getHires: one query for both sides, which is the `.or()` in the data layer.
insert into probe
select 'the employer sees the hire from their side', count(*) = 1, count(*)::text
from public.job_hires
where employer_id = 'a1000000-0000-4000-8000-000000000001'
   or professional_id = 'a1000000-0000-4000-8000-000000000001';

set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';

insert into probe
select 'and the professional sees it from theirs', count(*) = 1, count(*)::text
from public.job_hires
where employer_id = 'a1000000-0000-4000-8000-000000000002'
   or professional_id = 'a1000000-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------

insert into probe
select 'the professional is told they were hired, once', count(*) = 1, count(*)::text
from public.notifications
where user_id = 'a1000000-0000-4000-8000-000000000002'
  and kind = 'job_hired';

-- The whole flow, counted. Four things happened to this applicant that they
-- should hear about: applied (nothing — they did it), shortlisted, hired. Two
-- notifications, not four.
insert into probe
select 'the applicant got two notifications in total, not four',
       count(*) = 2, count(*)::text
from public.notifications
where user_id = 'a1000000-0000-4000-8000-000000000002';

-- Every notification this flow produced belongs to somebody in it, and none of
-- it was written by the client — `notifications` has no insert policy at all.
insert into probe
select 'no notification escaped to a third party', count(*) = 0, count(*)::text
from public.notifications
where user_id = 'a1000000-0000-4000-8000-000000000003';

-- ---------------------------------------------------------------------------
-- Withdrawing, after the fact
-- ---------------------------------------------------------------------------
--
-- The applicant for the *private* job pulls out. The employer hears about it
-- rather than finding a stale application in their list.

do $$
declare application_id uuid;
begin
  select id into application_id from public.job_applications
   where job_id = 'b1000000-0000-4000-8000-000000000002';
  perform public.job_withdraw_application(application_id);
end $$;

insert into probe
select 'withdrawing records when it happened',
       status = 'withdrawn' and withdrawn_at is not null,
       status::text
from public.job_applications
where job_id = 'b1000000-0000-4000-8000-000000000002';

set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

insert into probe
select 'the employer is told it was withdrawn', count(*) = 1, count(*)::text
from public.notifications
where user_id = 'a1000000-0000-4000-8000-000000000001'
  and kind = 'application_update'
  and title = 'An application was withdrawn';

-- ---------------------------------------------------------------------------
-- Saving
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000003';

insert into probe
select 'saving a job returns true', public.job_toggle_saved(
  'b1000000-0000-4000-8000-000000000001'
) = true, null;

-- getSavedJobs joins through to the job, and a job the viewer may no longer
-- read comes back as a null join rather than a row that renders nothing.
insert into probe
select 'the saved list resolves to a job',
       count(*) = 1 and bool_and(j.id is not null), count(*)::text
from public.job_saved s
left join public.jobs j on j.id = s.job_id
where s.user_id = 'a1000000-0000-4000-8000-000000000003';

insert into probe
select 'saving it again removes it', public.job_toggle_saved(
  'b1000000-0000-4000-8000-000000000001'
) = false, null;

-- ---------------------------------------------------------------------------
-- Editing
-- ---------------------------------------------------------------------------
--
-- `updateJob` writes without a `poster_id` filter and lets the policy decide.
-- If the policy were wrong, that write would be a stranger editing a posting.

update public.jobs
   set title = 'Hijacked'
 where id = 'b1000000-0000-4000-8000-000000000001';

insert into probe
select 'a stranger''s edit changes nothing', title <> 'Hijacked', title
from public.jobs where id = 'b1000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------

select
  case when passed then '   PASS' else '** FAIL' end as result,
  name,
  detail
from probe
order by passed, name;

select format('%s passed, %s failed',
              count(*) filter (where passed),
              count(*) filter (where not passed)) as summary
from probe;

rollback;
