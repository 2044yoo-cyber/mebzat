-- Jobs — the whole flow, as a member.
--
-- Run this in the Supabase SQL editor after applying 0032, 0033 and 0034. It
-- prints one line per check and rolls itself back.
--
-- It runs as `authenticated`, not as the editor's own role. A probe run as a
-- superuser bypasses row-level security entirely and reports that every rule
-- works, which is worse than no probe.
--
-- The path it walks is the one the spec asks for end to end:
-- post → publish → find → apply → employer sees it → shortlist → interview →
-- hire → both sides notified → a conversation exists.

begin;

insert into auth.users (id, email) values
  ('f0000000-0000-4000-8000-000000000001', 'jobs-employer@example.test'),
  ('f0000000-0000-4000-8000-000000000002', 'jobs-architect@example.test'),
  ('f0000000-0000-4000-8000-000000000003', 'jobs-stranger@example.test');

create temporary table probe (name text, passed boolean, detail text);
grant all on probe to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

-- ---------------------------------------------------------------------------
-- Posting
-- ---------------------------------------------------------------------------

insert into public.jobs (
  id, poster_id, title, slug, description, category, profession,
  job_type, work_mode, experience_level,
  salary_min, salary_max, currency, salary_period,
  location_city, openings, skills, closes_on, status, visibility
)
values (
  'e0000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000001',
  'Site Architect for a mixed-use build in Bole',
  'site-architect-bole',
  'Supervising construction of an eight-storey mixed-use building.',
  'architecture', 'Architect',
  'full_time', 'on_site', 'mid',
  35000, 55000, 'ETB', 'month',
  'Addis Ababa', 2,
  array['Revit', 'AutoCAD', 'Site supervision'],
  current_date + 30, 'open', 'public'
),
(
  'e0000000-0000-4000-8000-000000000002',
  'f0000000-0000-4000-8000-000000000001',
  'Quiet search for a quantity surveyor',
  'private-qs',
  'Not advertised.',
  'quantity_surveying', 'Quantity Surveyor',
  'contract', 'hybrid', 'senior',
  120000, 180000, 'ETB', 'project',
  'Addis Ababa', 1, array['BOQ'], null, 'open', 'private'
),
(
  'e0000000-0000-4000-8000-000000000003',
  'f0000000-0000-4000-8000-000000000001',
  'Draft, not posted', 'draft-job', 'Still being written.',
  'drafting_cad', 'Draughtsman', 'contract', 'remote', 'junior',
  null, null, 'ETB', 'month', 'Addis Ababa', 1, '{}', null, 'draft', 'public'
);

insert into probe
select 'an employer can post a job', count(*) = 3, count(*)::text
from public.jobs where poster_id = 'f0000000-0000-4000-8000-000000000001';

insert into public.job_attachments (job_id, kind, url, name, size_bytes)
values ('e0000000-0000-4000-8000-000000000001', 'drawing',
        'job-files/e0000000-0000-4000-8000-000000000001/plan.pdf',
        'Ground floor plan.pdf', 482000);

insert into probe
select 'drawings can be attached to a job', count(*) = 1, count(*)::text
from public.job_attachments
where job_id = 'e0000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- What everyone else can see
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000002';

insert into probe
select 'a public job is visible to others', count(*) = 1, count(*)::text
from public.jobs where id = 'e0000000-0000-4000-8000-000000000001';

-- The setting has to mean something. Before 0033 every non-draft job was
-- world-readable, so "private" would have been a label with no rule behind it.
insert into probe
select 'a private job is not listed', count(*) = 0, count(*)::text
from public.jobs where id = 'e0000000-0000-4000-8000-000000000002';

insert into probe
select 'a draft is not visible to anyone else', count(*) = 0, count(*)::text
from public.jobs where id = 'e0000000-0000-4000-8000-000000000003';

insert into probe
select 'a job''s drawings are visible with the job', count(*) = 1, count(*)::text
from public.job_attachments
where job_id = 'e0000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Saving
-- ---------------------------------------------------------------------------

do $$
declare
  saved boolean;
begin
  saved := public.job_toggle_saved('e0000000-0000-4000-8000-000000000001');
  insert into probe values ('saving a job returns true', saved, saved::text);

  saved := public.job_toggle_saved('e0000000-0000-4000-8000-000000000001');
  insert into probe values ('saving it again unsaves it', not saved, saved::text);

  perform public.job_toggle_saved('e0000000-0000-4000-8000-000000000001');
end $$;

set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000003';
insert into probe
select 'saved jobs are private to the person who saved them',
       count(*) = 0, count(*)::text
from public.job_saved;

-- ---------------------------------------------------------------------------
-- Applying
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000002';

do $$
declare
  app_id uuid;
  again uuid;
begin
  app_id := public.job_apply(
    'e0000000-0000-4000-8000-000000000001',
    'I have supervised three mixed-use builds in Addis.',
    null, 'cv.pdf', 'portfolio.example', 48000,
    current_date + 14, 'Two weeks'' notice'
  );

  insert into probe
  select 'an application is recorded', count(*) = 1, count(*)::text
  from public.job_applications where id = app_id;

  insert into probe
  select 'it starts as submitted', count(*) = 1, coalesce(max(status::text), 'none')
  from public.job_applications where id = app_id and status = 'submitted';

  -- Applying twice is an edit of the first, which is what the constraint from
  -- 0012 says. Without the upsert this raised a unique violation at the user.
  again := public.job_apply(
    'e0000000-0000-4000-8000-000000000001',
    'Updated: I can start sooner.', null, 'cv-2.pdf', null, 46000, null, null
  );

  insert into probe values ('applying twice edits the same application',
    again = app_id, coalesce(again::text, 'null'));

  insert into probe
  select 'and keeps the newer text', count(*) = 1, coalesce(max(cover_letter), 'none')
  from public.job_applications
  where id = app_id and cover_letter like 'Updated:%';

  insert into public.job_application_attachments (application_id, kind, url, name)
  values (app_id, 'document', 'cv-2.pdf', 'CV.pdf');

  insert into probe
  select 'an applicant can attach files', count(*) = 1, count(*)::text
  from public.job_application_attachments where application_id = app_id;
end $$;

-- The employer hears about it. Counted as the recipient: a notification is
-- readable only by the person it is for, so asking as the applicant returns
-- zero and looks like nothing was sent.
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';

insert into probe
select 'the employer is notified of an application', count(*) >= 1, count(*)::text
from public.notifications
where kind = 'job_application' and user_id = 'f0000000-0000-4000-8000-000000000001';

insert into probe
select 'the application count is kept up to date', count(*) = 1, coalesce(max(application_count)::text, 'none')
from public.jobs
where id = 'e0000000-0000-4000-8000-000000000001' and application_count = 1;

-- ---------------------------------------------------------------------------
-- What an applicant must not be able to do
-- ---------------------------------------------------------------------------

do $$
begin
  perform public.job_apply('e0000000-0000-4000-8000-000000000001');
  insert into probe values ('an employer cannot apply to their own job', false, 'it succeeded');
exception when others then
  insert into probe values ('an employer cannot apply to their own job', true, sqlerrm);
end $$;

set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000003';

do $$
begin
  perform public.job_apply('e0000000-0000-4000-8000-000000000003');
  insert into probe values ('a draft cannot be applied to', false, 'it succeeded');
exception when others then
  insert into probe values ('a draft cannot be applied to', true, sqlerrm);
end $$;

insert into probe
select 'a stranger cannot read somebody else''s application',
       count(*) = 0, count(*)::text
from public.job_applications;

do $$
declare
  app_id uuid;
begin
  select id into app_id from public.job_applications
  where job_id = 'e0000000-0000-4000-8000-000000000001'
  limit 1;

  -- RLS hides it, so this is the stronger result: there is nothing to attack.
  if app_id is null then
    insert into probe values ('a stranger cannot move an application', true, 'not even readable');
  else
    begin
      perform public.job_set_application_status(app_id, 'rejected');
      insert into probe values ('a stranger cannot move an application', false, 'it succeeded');
    exception when others then
      insert into probe values ('a stranger cannot move an application', true, sqlerrm);
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The pipeline
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';

do $$
declare
  app_id uuid;
  interview_id uuid;
begin
  select id into app_id from public.job_applications
  where job_id = 'e0000000-0000-4000-8000-000000000001' limit 1;

  perform public.job_set_application_status(app_id, 'shortlisted');

  insert into probe
  select 'an employer can shortlist', count(*) = 1, count(*)::text
  from public.job_applications where id = app_id and status = 'shortlisted';

  interview_id := public.job_schedule_interview(
    app_id, now() + interval '3 days', 'Site visit', 'Bole, Addis Ababa',
    'Bring a hard hat.'
  );

  insert into probe
  select 'an interview can be arranged', count(*) = 1, count(*)::text
  from public.job_interviews where id = interview_id;

  -- Inviting somebody to interview and leaving them "shortlisted" would show
  -- the employer the wrong thing in their own list.
  insert into probe
  select 'arranging one moves the application', count(*) = 1, coalesce(max(status::text), 'none')
  from public.job_applications where id = app_id and status = 'interviewing';

  -- Hiring is not a status change. It creates an agreement, and letting the
  -- status route do it would produce a hire with no record.
  begin
    perform public.job_set_application_status(app_id, 'hired');
    insert into probe values ('hiring cannot be done as a status change', false, 'it succeeded');
  exception when others then
    insert into probe values ('hiring cannot be done as a status change', true, sqlerrm);
  end;

  begin
    perform public.job_set_application_status(app_id, 'withdrawn');
    insert into probe values ('an employer cannot withdraw for the applicant', false, 'it succeeded');
  exception when others then
    insert into probe values ('an employer cannot withdraw for the applicant', true, sqlerrm);
  end;
end $$;

-- The applicant hears about each move.
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000002';

insert into probe
select 'the applicant is notified when they are shortlisted', count(*) >= 1, count(*)::text
from public.notifications
where kind = 'application_update'
  and user_id = 'f0000000-0000-4000-8000-000000000002'
  and title like '%shortlisted%';

insert into probe
select 'and when they are invited to interview', count(*) >= 1, count(*)::text
from public.notifications
where kind = 'application_update'
  and user_id = 'f0000000-0000-4000-8000-000000000002'
  and title like '%interview%';

insert into probe
select 'the applicant can see their own interview', count(*) = 1, count(*)::text
from public.job_interviews;

-- ---------------------------------------------------------------------------
-- Hiring
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';

do $$
declare
  app_id uuid;
  hire_id uuid;
  again uuid;
  h public.job_hires%rowtype;
begin
  select id into app_id from public.job_applications
  where job_id = 'e0000000-0000-4000-8000-000000000001' limit 1;

  hire_id := public.job_hire(app_id, 50000, 'ETB', 'month', current_date + 21,
                             'Starting after the holiday.');
  select * into h from public.job_hires where id = hire_id;

  insert into probe values ('a hire is recorded', h.id is not null, coalesce(h.id::text, 'null'));
  insert into probe values ('it names both parties',
    h.employer_id = 'f0000000-0000-4000-8000-000000000001'
      and h.professional_id = 'f0000000-0000-4000-8000-000000000002',
    coalesce(h.professional_id::text, 'null'));
  insert into probe values ('the agreed amount is kept',
    h.agreed_amount = 50000 and h.currency = 'ETB',
    coalesce(h.agreed_amount::text, 'null'));

  insert into probe
  select 'the application becomes hired', count(*) = 1, coalesce(max(status::text), 'none')
  from public.job_applications where id = app_id and status = 'hired';

  -- The whole point of hiring inside a function rather than as an update.
  insert into probe values ('a conversation is opened',
    h.conversation_id is not null, coalesce(h.conversation_id::text, 'null'));

  -- Two openings, one hire: the job stays open for the second.
  insert into probe
  select 'a job with two openings stays open after one hire',
         count(*) = 1, coalesce(max(status::text), 'none')
  from public.jobs
  where id = 'e0000000-0000-4000-8000-000000000001' and status = 'open';

  again := public.job_hire(app_id);
  insert into probe values ('hiring twice is one agreement', again = hire_id,
    coalesce(again::text, 'null'));

  insert into probe
  select 'and does not open a second hire', count(*) = 1, count(*)::text
  from public.job_hires where application_id = app_id;
end $$;

set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000002';

insert into probe
select 'the professional is told they were hired', count(*) = 1, count(*)::text
from public.notifications
where kind = 'job_hired' and user_id = 'f0000000-0000-4000-8000-000000000002';

insert into probe
select 'the professional can see their own hire', count(*) = 1, count(*)::text
from public.job_hires
where professional_id = 'f0000000-0000-4000-8000-000000000002';

set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000003';
insert into probe
select 'a hire is not public', count(*) = 0, count(*)::text
from public.job_hires;

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------

insert into probe
select 'a public job is findable in Medosha search', count(*) >= 1, count(*)::text
from public.global_search('Site Architect', 5, null)
where kind = 'job';

insert into probe
select 'a private job never appears in search', count(*) = 0, count(*)::text
from public.global_search('quantity surveyor', 5, null)
where kind = 'job';

-- ---------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------

reset role;

select
  case when passed then '  PASS' else '✗ FAIL' end as result,
  name,
  case when passed then '' else detail end as detail
from probe
order by passed, name;

select
  count(*) filter (where passed) || ' passed, ' ||
  count(*) filter (where not passed) || ' failed' as summary
from probe;

rollback;
