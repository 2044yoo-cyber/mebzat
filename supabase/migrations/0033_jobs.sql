-- Jobs — the parts that were missing.
--
-- `jobs` and `job_applications` have existed since 0012, with row-level
-- security, a status pipeline and a place in global search. What was missing
-- was everything around them: categories, attachments, saved jobs, interviews,
-- hires, and — the reason none of it was visible — any way to post a job at
-- all, and any notification when something happened.
--
-- This file adds only what is missing. It does not restate a policy that
-- already works or rename a column that other code reads.

-- ---------------------------------------------------------------------------
-- All of this file, or none of it.
-- ---------------------------------------------------------------------------
--
-- The Supabase SQL editor does not stop at the first error — it runs every
-- statement in what you pasted and reports failures afterwards, so a file that
-- fails halfway leaves half of itself behind. An explicit transaction makes
-- the whole file atomic: the first error aborts, everything after is refused,
-- and nothing is committed.
begin;

do $$
begin
  if to_regclass('public.jobs') is null then
    raise exception using
      message = 'Jobs: public.jobs does not exist.',
      hint = 'Apply 0012_jobs_events.sql first, then 0032_jobs_enums.sql, then this file.';
  end if;

  -- 0032 must have been committed before this file runs, or every reference to
  -- 'hired' below fails with a message about an unsafe enum value.
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'application_status' and e.enumlabel = 'hired'
  ) then
    raise exception using
      message = 'Jobs: application_status has no "hired" value.',
      hint = 'Run 0032_jobs_enums.sql as its own query first. It cannot be combined with this file.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

-- Created here rather than in 0032 because a type created in this transaction
-- may be used in it — only *adding to an existing* type is restricted.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'job_visibility') then
    create type public.job_visibility as enum ('public', 'private');
  end if;
  if not exists (select 1 from pg_type where typname = 'interview_status') then
    create type public.interview_status as enum (
      'proposed',
      'confirmed',
      'declined',
      'completed',
      'cancelled'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'job_file_kind') then
    create type public.job_file_kind as enum ('drawing', 'image', 'document');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- jobs — the fields a construction job needs
-- ---------------------------------------------------------------------------

alter table public.jobs
  -- Text, not an enum. Twenty-five categories ship today and the trade will
  -- want a twenty-sixth; a new category should not need a migration and a
  -- deployment. The application validates against JOB_CATEGORIES, which is the
  -- one place the list lives.
  add column if not exists category text,

  -- A private job is reachable by its link and by the people invited to it,
  -- but never listed and never searchable. A recruiter filling a role quietly
  -- is a normal thing to want.
  add column if not exists visibility public.job_visibility not null default 'public',

  -- What the work actually needs. An array rather than a join table: skills
  -- are a filter and a set of chips, never an entity with its own page.
  add column if not exists skills text[] not null default '{}',

  add column if not exists responsibilities_list text[] not null default '{}';

comment on column public.jobs.category is
  'One of JOB_CATEGORIES in the application. Text so a new category needs no migration.';
comment on column public.jobs.visibility is
  'A private job is reachable by link but never listed or searched.';

-- `salary_period` is already free text, so a project fee is a range with a
-- period of "project" rather than a second pair of budget columns. One range
-- with a stated period reads correctly for a monthly salary, a daily rate and
-- a fixed project price, and there is only one pair of numbers to keep in
-- step.
comment on column public.jobs.salary_period is
  'month, week, day, hour or project. A project fee is a range with period = project, not a separate budget field.';

create index if not exists jobs_category_idx
  on public.jobs (category, created_at desc)
  where status = 'open' and visibility = 'public';

create index if not exists jobs_skills_idx on public.jobs using gin (skills);

create index if not exists jobs_closing_idx
  on public.jobs (closes_on)
  where status = 'open' and closes_on is not null;

-- A private job must not be listed. The 0012 policy allowed anyone to read any
-- job that was not a draft, which was right when every job was public.
drop policy if exists "Open jobs are viewable by everyone" on public.jobs;
create policy "Jobs are viewable unless they are private or a draft"
  on public.jobs for select
  to authenticated, anon
  using (
    poster_id = auth.uid()
    or (visibility = 'public' and status in ('open', 'filled', 'closed'))
  );

-- ---------------------------------------------------------------------------
-- job_applications — what a proposal needs beyond a cover letter
-- ---------------------------------------------------------------------------

alter table public.job_applications
  -- A contractor bidding on a project writes a proposal, not a cover letter,
  -- and the difference is real: one is about the person, the other is about
  -- the work and how they would do it.
  add column if not exists proposal text,
  -- "Immediately", "after Meskerem", "two weeks' notice". A date cannot say
  -- any of those, and `available_from` already covers the case where a date is
  -- what somebody means.
  add column if not exists availability_note text,
  add column if not exists withdrawn_at timestamptz;

comment on column public.job_applications.expected_salary is
  'Read against the job''s salary_period: a monthly figure for a salaried role, a total fee for a project.';

-- ---------------------------------------------------------------------------
-- job_attachments — drawings, images and documents on a job
-- ---------------------------------------------------------------------------

create table if not exists public.job_attachments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  kind public.job_file_kind not null default 'document',
  url text not null,
  name text not null,
  -- Bytes. Shown next to the name, because a tender document is a different
  -- proposition on a phone than a floor plan.
  size_bytes bigint,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists job_attachments_job_idx
  on public.job_attachments (job_id, position);

alter table public.job_attachments enable row level security;

-- Visible exactly when the job is. Written as an `exists` against `jobs` so
-- the rule lives in one place: change who can see a job and this follows.
create policy "Job files are visible when the job is"
  on public.job_attachments for select
  to authenticated, anon
  using (exists (select 1 from public.jobs j where j.id = job_id));

create policy "Posters manage their own job files"
  on public.job_attachments for all
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id and j.poster_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_id and j.poster_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- job_application_attachments
-- ---------------------------------------------------------------------------

create table if not exists public.job_application_attachments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null
    references public.job_applications (id) on delete cascade,
  kind public.job_file_kind not null default 'document',
  url text not null,
  name text not null,
  size_bytes bigint,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists job_application_attachments_idx
  on public.job_application_attachments (application_id, position);

alter table public.job_application_attachments enable row level security;

create policy "Application files follow the application"
  on public.job_application_attachments for select
  to authenticated
  using (
    exists (
      select 1 from public.job_applications a where a.id = application_id
    )
  );

create policy "Applicants manage their own application files"
  on public.job_application_attachments for all
  to authenticated
  using (
    exists (
      select 1 from public.job_applications a
      where a.id = application_id and a.applicant_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.job_applications a
      where a.id = application_id and a.applicant_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- job_saved
-- ---------------------------------------------------------------------------

create table if not exists public.job_saved (
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create index if not exists job_saved_user_idx
  on public.job_saved (user_id, created_at desc);

alter table public.job_saved enable row level security;

-- Saving is private. Who else is interested in a job is nobody's business,
-- and a visible save count would tell an applicant how much competition they
-- have before they have decided whether to apply.
create policy "You see only your own saved jobs"
  on public.job_saved for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- job_interviews
-- ---------------------------------------------------------------------------

create table if not exists public.job_interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null
    references public.job_applications (id) on delete cascade,
  -- Denormalised so the employer's dashboard can list interviews without
  -- joining through applications to jobs on every row.
  job_id uuid not null references public.jobs (id) on delete cascade,
  scheduled_at timestamptz,
  -- "Site visit", "video call", "office". Free text because the shape of an
  -- interview in this trade varies more than a list would allow.
  mode text,
  location text,
  note text,
  status public.interview_status not null default 'proposed',
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_interviews_application_idx
  on public.job_interviews (application_id, scheduled_at desc);
create index if not exists job_interviews_job_idx
  on public.job_interviews (job_id, scheduled_at desc);

alter table public.job_interviews enable row level security;

create policy "Interviews are visible to both sides"
  on public.job_interviews for select
  to authenticated
  using (
    exists (
      select 1 from public.job_applications a
      join public.jobs j on j.id = a.job_id
      where a.id = application_id
        and (a.applicant_id = auth.uid() or j.poster_id = auth.uid())
    )
  );

create policy "Employers arrange interviews"
  on public.job_interviews for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.jobs j
      where j.id = job_id and j.poster_id = auth.uid()
    )
  );

-- Either side may move it: an employer reschedules, an applicant confirms or
-- declines. Neither can touch an interview they are not part of.
create policy "Both sides update an interview"
  on public.job_interviews for update
  to authenticated
  using (
    exists (
      select 1 from public.job_applications a
      join public.jobs j on j.id = a.job_id
      where a.id = application_id
        and (a.applicant_id = auth.uid() or j.poster_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.job_applications a
      join public.jobs j on j.id = a.job_id
      where a.id = application_id
        and (a.applicant_id = auth.uid() or j.poster_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- job_hires
--
-- The record that a working relationship exists. It is deliberately a table of
-- its own rather than a flag on the application: an application is a document
-- somebody submitted, a hire is an agreement between two parties, and the
-- second outlives the first.
--
-- The nullable `project_id` and `conversation_id` are the interfaces the spec
-- asks for. A hire that later becomes a project, a contract, a quotation or an
-- invoice attaches here; nothing about those is implemented, and the column
-- costs nothing until they are.
-- ---------------------------------------------------------------------------

create table if not exists public.job_hires (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  application_id uuid not null
    references public.job_applications (id) on delete cascade,

  employer_id uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,

  agreed_amount numeric(14, 2) check (agreed_amount is null or agreed_amount >= 0),
  currency text not null default 'ETB',
  -- month, project, day — mirrors the job's own salary_period so the number
  -- can be read without opening the job.
  amount_period text,
  starts_on date,
  note text,

  -- Where the two of them are talking. Set by `job_hire`, which starts the
  -- conversation if there is not one already.
  conversation_id uuid references public.conversations (id) on delete set null,
  -- For later. A hire that becomes a project links here.
  project_id uuid references public.projects (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One hire per application. Pressing Hire twice is one agreement.
  constraint job_hires_one_per_application unique (application_id)
);

create index if not exists job_hires_job_idx
  on public.job_hires (job_id, created_at desc);
create index if not exists job_hires_employer_idx
  on public.job_hires (employer_id, created_at desc);
create index if not exists job_hires_professional_idx
  on public.job_hires (professional_id, created_at desc);

alter table public.job_hires enable row level security;

-- A hire is between two people and is visible to both. It is not public: who
-- somebody hired is commercial information, and a professional's own profile
-- can choose to show it without every hire being world-readable.
create policy "A hire is visible to both parties"
  on public.job_hires for select
  to authenticated
  using (employer_id = auth.uid() or professional_id = auth.uid());

-- Insert goes through `job_hire`, which is security definer. No client-facing
-- insert policy exists, so a client cannot forge a hiring relationship — the
-- same reasoning as remix lineage in Berchuma.

create policy "The employer maintains the hire"
  on public.job_hires for update
  to authenticated
  using (employer_id = auth.uid())
  with check (employer_id = auth.uid());

create trigger job_hires_set_updated_at
  before update on public.job_hires
  for each row
  execute function public.set_updated_at();

create trigger job_interviews_set_updated_at
  before update on public.job_interviews
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
--
-- Private, with a read policy that follows the job. A public bucket would make
-- the drawings attached to a *private* job readable by anyone who guessed a
-- filename, which would quietly undo the whole point of the setting.
--
-- Path convention: <job_id>/<filename>. The policy reads the first folder
-- segment as the job id, which is what lets one bucket serve every job without
-- a policy per job.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-files',
  'job-files',
  false,
  20971520,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'image/vnd.dxf', 'application/acad', 'application/dxf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

drop policy if exists "job files readable with the job" on storage.objects;
create policy "job files readable with the job"
  on storage.objects for select
  to authenticated, anon
  using (
    bucket_id = 'job-files'
    and exists (
      select 1 from public.jobs j
      where j.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "posters upload job files" on storage.objects;
create policy "posters upload job files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'job-files'
    and exists (
      select 1 from public.jobs j
      where j.id::text = (storage.foldername(name))[1]
        and j.poster_id = auth.uid()
    )
  );

drop policy if exists "posters remove job files" on storage.objects;
create policy "posters remove job files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'job-files'
    and exists (
      select 1 from public.jobs j
      where j.id::text = (storage.foldername(name))[1]
        and j.poster_id = auth.uid()
    )
  );

commit;
