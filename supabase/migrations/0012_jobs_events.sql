-- Phase 3: Jobs and events.
--
-- Additive only — no existing table is altered.
--
-- A job can be posted by a company or by an individual hiring directly, so
-- company_id is nullable and poster_id always carries the accountable person.
-- The same shape covers a freelance gig, which is a job with a contract type.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.job_type as enum (
  'full_time',
  'part_time',
  'contract',
  'freelance',
  'internship',
  'temporary'
);

create type public.work_mode as enum ('on_site', 'hybrid', 'remote');

create type public.experience_level as enum (
  'entry',
  'junior',
  'mid',
  'senior',
  'lead'
);

create type public.job_status as enum ('draft', 'open', 'closed', 'filled');

create type public.application_status as enum (
  'submitted',
  'reviewing',
  'shortlisted',
  'interviewing',
  'offered',
  'rejected',
  'withdrawn'
);

create type public.event_kind as enum (
  'exhibition',
  'trade_fair',
  'training',
  'workshop',
  'conference',
  'webinar',
  'site_visit'
);

create type public.event_status as enum ('draft', 'published', 'cancelled');

create type public.attendance_status as enum (
  'interested',
  'registered',
  'attended',
  'cancelled'
);

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,

  title text not null,
  slug text not null,
  description text not null,
  responsibilities text,
  requirements text,

  job_type public.job_type not null default 'full_time',
  work_mode public.work_mode not null default 'on_site',
  experience_level public.experience_level not null default 'mid',
  profession text,

  -- A range, because a single figure is either the floor or the ceiling and
  -- readers cannot tell which.
  salary_min numeric(14, 2) check (salary_min >= 0),
  salary_max numeric(14, 2) check (salary_max >= 0),
  currency text not null default 'ETB',
  salary_period text not null default 'month',
  salary_visible boolean not null default true,

  location_city text,
  location_country text not null default 'Ethiopia',

  openings smallint not null default 1 check (openings >= 1),
  application_count integer not null default 0,
  views integer not null default 0,

  closes_on date,
  status public.job_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint jobs_salary_range check (
    salary_max is null or salary_min is null or salary_max >= salary_min
  ),
  constraint jobs_slug_unique unique (poster_id, slug)
);

create index jobs_open_idx
  on public.jobs (created_at desc)
  where status = 'open';
create index jobs_company_idx on public.jobs (company_id)
  where company_id is not null;
create index jobs_poster_idx on public.jobs (poster_id);
create index jobs_city_idx on public.jobs (location_city);
create index jobs_type_idx on public.jobs (job_type, created_at desc);
create index jobs_profession_idx on public.jobs (profession);
create index jobs_search_idx
  on public.jobs
  using gin (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
      coalesce(profession, '') || ' ' || coalesce(requirements, '')
    )
  );

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- job_applications
-- ---------------------------------------------------------------------------

create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,

  cover_letter text,
  cv_url text,
  portfolio_url text,
  expected_salary numeric(14, 2) check (expected_salary >= 0),
  available_from date,

  status public.application_status not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Applying twice to the same job is an edit, not a second application.
  constraint job_applications_one_per_person unique (job_id, applicant_id)
);

create index job_applications_job_idx
  on public.job_applications (job_id, created_at desc);
create index job_applications_applicant_idx
  on public.job_applications (applicant_id, created_at desc);

create trigger job_applications_set_updated_at
  before update on public.job_applications
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,

  title text not null,
  slug text not null,
  description text,
  kind public.event_kind not null default 'workshop',

  starts_at timestamptz not null,
  ends_at timestamptz,

  -- Online events have a link and no venue; the check keeps the two coherent
  -- rather than trusting the form that created the row.
  is_online boolean not null default false,
  venue text,
  address text,
  location_city text,
  location_country text not null default 'Ethiopia',
  online_url text,

  price numeric(14, 2) check (price >= 0),
  currency text not null default 'ETB',
  capacity integer check (capacity > 0),
  attendee_count integer not null default 0,

  cover_image_url text,
  registration_url text,
  views integer not null default 0,

  status public.event_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint events_dates_ordered check (ends_at is null or ends_at >= starts_at),
  constraint events_place_coherent check (
    (is_online and online_url is not null) or (not is_online)
  ),
  constraint events_slug_unique unique (organizer_id, slug)
);

create index events_upcoming_idx
  on public.events (starts_at)
  where status = 'published';
create index events_kind_idx on public.events (kind, starts_at);
create index events_city_idx on public.events (location_city);
create index events_organizer_idx on public.events (organizer_id);
create index events_search_idx
  on public.events
  using gin (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
      coalesce(venue, '')
    )
  );

create trigger events_set_updated_at
  before update on public.events
  for each row
  execute function public.set_updated_at();

create table public.event_attendees (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.attendance_status not null default 'registered',
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_attendees_user_idx
  on public.event_attendees (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.jobs enable row level security;
alter table public.job_applications enable row level security;
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;

create policy "Open jobs are viewable by everyone"
  on public.jobs for select
  to authenticated, anon
  using (status in ('open', 'filled', 'closed') or poster_id = auth.uid());

create policy "Posters manage their own jobs"
  on public.jobs for all
  to authenticated
  using (poster_id = auth.uid())
  with check (poster_id = auth.uid());

-- An application is between the applicant and the employer; nobody else.
create policy "Applications are visible to applicant and employer"
  on public.job_applications for select
  to authenticated
  using (
    applicant_id = auth.uid()
    or exists (
      select 1 from public.jobs j
      where j.id = job_applications.job_id and j.poster_id = auth.uid()
    )
  );

create policy "Users submit their own applications"
  on public.job_applications for insert
  to authenticated
  with check (applicant_id = auth.uid());

create policy "Applicants update their own applications"
  on public.job_applications for update
  to authenticated
  using (applicant_id = auth.uid())
  with check (applicant_id = auth.uid());

create policy "Employers move applications through their pipeline"
  on public.job_applications for update
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_applications.job_id and j.poster_id = auth.uid()
    )
  );

create policy "Published events are viewable by everyone"
  on public.events for select
  to authenticated, anon
  using (status = 'published' or organizer_id = auth.uid());

create policy "Organizers manage their own events"
  on public.events for all
  to authenticated
  using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid());

-- Who is going is public; that is part of why people go.
create policy "Attendance is viewable by everyone"
  on public.event_attendees for select
  to authenticated, anon
  using (true);

create policy "Users manage their own attendance"
  on public.event_attendees for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Counters and notifications
-- ---------------------------------------------------------------------------

create function public.refresh_application_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.job_id, old.job_id);
begin
  update public.jobs
  set application_count = (
    select count(*) from public.job_applications
    where job_id = target and status <> 'withdrawn'
  )
  where id = target;
  return coalesce(new, old);
end;
$$;

create trigger job_applications_refresh
  after insert or update or delete on public.job_applications
  for each row
  execute function public.refresh_application_count();

create function public.refresh_attendee_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.event_id, old.event_id);
begin
  update public.events
  set attendee_count = (
    select count(*) from public.event_attendees
    where event_id = target and status in ('registered', 'attended')
  )
  where id = target;
  return coalesce(new, old);
end;
$$;

create trigger event_attendees_refresh
  after insert or update or delete on public.event_attendees
  for each row
  execute function public.refresh_attendee_count();

create function public.notify_job_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.jobs;
  actor text;
begin
  select * into job from public.jobs where id = new.job_id;
  if job.poster_id = new.applicant_id then
    return new;
  end if;

  select coalesce(full_name, company_name, username, 'Someone')
  into actor from public.profiles where id = new.applicant_id;

  insert into public.notifications (user_id, actor_id, kind, title, body, href)
  values (
    job.poster_id,
    new.applicant_id,
    'job_application',
    actor || ' applied for ' || job.title,
    left(coalesce(new.cover_letter, ''), 120),
    '/jobs/' || job.id
  );
  return new;
end;
$$;

create trigger job_applications_notify
  after insert on public.job_applications
  for each row
  execute function public.notify_job_application();

/**
 * Tells the applicant when their status moves.
 *
 * Only on an actual change, so an employer editing a note does not send a
 * second "you were shortlisted".
 */
create function public.notify_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.jobs;
begin
  if new.status = old.status then
    return new;
  end if;

  select * into job from public.jobs where id = new.job_id;

  insert into public.notifications (user_id, kind, title, body, href)
  values (
    new.applicant_id,
    'job_application',
    'Your application for ' || job.title || ' is now ' || new.status,
    null,
    '/jobs/' || job.id
  );
  return new;
end;
$$;

create trigger job_applications_status_notify
  after update on public.job_applications
  for each row
  execute function public.notify_application_status();

create function public.increment_job_views(target_job_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.jobs set views = views + 1 where id = target_job_id;
$$;

create function public.increment_event_views(target_event_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.events set views = views + 1 where id = target_event_id;
$$;

grant execute on function public.increment_job_views(uuid) to anon, authenticated;
grant execute on function public.increment_event_views(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.job_applications;
  end if;
end
$$;
