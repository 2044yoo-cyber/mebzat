-- The site record: drawings, documents, RFIs, submittals, schedule, quality.
--
-- Everything here follows the three rules 0024 set and 0089 continued.
--
--   1. Access is a membership. Every policy asks `agenda_is_member`, which is
--      defined once in 0024 and reused rather than restated — a second
--      spelling of "is this person on this project" is a second thing to get
--      wrong.
--   2. Nothing is deleted. Rows are archived, revisions are kept, and there is
--      no DELETE policy in this file.
--   3. A number is a fact somebody recorded, not one the system inferred.
--
-- ## Why revisions are rows and not a column
--
-- A drawing is not a file, it is a series of files with one of them current.
-- Keeping `revision` as a column on the drawing means uploading Rev 03
-- destroys Rev 02, and the question "what did the contractor build to in
-- March" becomes unanswerable — which is the question a dispute turns on. So
-- `agenda_drawings` is the sheet and `agenda_drawing_revisions` is what has
-- been issued of it, and the current one is a pointer rather than a state.

begin;

-- ---------------------------------------------------------------------------
-- Shared vocabulary
-- ---------------------------------------------------------------------------

create type public.agenda_discipline as enum (
  'architectural', 'structural', 'electrical', 'plumbing', 'mechanical',
  'interior', 'landscape', 'shop_drawing', 'civil', 'other'
);

-- One status vocabulary for everything that gets submitted and answered.
-- Separate enums per module is how a project ends up with four different words
-- for "waiting for the consultant".
create type public.agenda_review_status as enum (
  'draft', 'open', 'pending', 'answered', 'approved',
  'approved_with_comments', 'revise_resubmit', 'rejected', 'closed'
);

-- ---------------------------------------------------------------------------
-- Drawings
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_drawings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  drawing_number text not null,
  title text not null,
  discipline public.agenda_discipline not null default 'architectural',
  -- The revision everybody should be building to. Set by the trigger below
  -- rather than by the application, so "current" cannot disagree with what was
  -- actually issued.
  current_revision_id uuid,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_drawings_number_per_project
    unique (project_id, drawing_number)
);

create table if not exists public.agenda_drawing_revisions (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references public.agenda_drawings (id) on delete cascade,
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  -- Text, not a number: real sheets are issued as "Rev 01", "Rev A", "P2".
  revision text not null,
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  issued_on date,
  status public.agenda_review_status not null default 'open',
  notes text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint agenda_drawing_revision_unique unique (drawing_id, revision)
);

alter table public.agenda_drawings
  add constraint agenda_drawings_current_revision_fkey
  foreign key (current_revision_id)
  references public.agenda_drawing_revisions (id) on delete set null;

-- The newest issued revision is the current one, and the application does not
-- get a say. Uploading Rev 03 makes Rev 03 current; nothing makes Rev 02
-- disappear.
create or replace function public.agenda_drawing_set_current()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.agenda_drawings
  set current_revision_id = new.id, updated_at = now()
  where id = new.drawing_id;
  return new;
end;
$$;

drop trigger if exists agenda_drawing_set_current on public.agenda_drawing_revisions;
create trigger agenda_drawing_set_current
  after insert on public.agenda_drawing_revisions
  for each row execute function public.agenda_drawing_set_current();

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_document_folders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  parent_id uuid references public.agenda_document_folders (id) on delete cascade,
  name text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.agenda_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  folder_id uuid references public.agenda_document_folders (id) on delete set null,
  title text not null,
  kind public.agenda_file_kind not null default 'document',
  tags text[] not null default '{}',
  current_version_id uuid,
  -- Contracts and invoices are not readable by everybody on site. 0024's
  -- `agenda_confidentiality` already has the three levels this needs —
  -- `members`, `finance`, `meetings` — and they map onto the per-member
  -- permissions it also defined, so a fourth word is not invented here.
  confidentiality public.agenda_confidentiality not null default 'members',
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agenda_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.agenda_documents (id) on delete cascade,
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  version integer not null,
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  notes text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint agenda_document_version_unique unique (document_id, version)
);

alter table public.agenda_documents
  add constraint agenda_documents_current_version_fkey
  foreign key (current_version_id)
  references public.agenda_document_versions (id) on delete set null;

create or replace function public.agenda_document_set_current()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.agenda_documents
  set current_version_id = new.id, updated_at = now()
  where id = new.document_id;
  return new;
end;
$$;

drop trigger if exists agenda_document_set_current on public.agenda_document_versions;
create trigger agenda_document_set_current
  after insert on public.agenda_document_versions
  for each row execute function public.agenda_document_set_current();

-- ---------------------------------------------------------------------------
-- RFIs
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_rfis (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  number text not null,
  subject text not null,
  question text not null,
  discipline public.agenda_discipline,
  location text,
  -- Where on the sheet the question is about. Kept as a drawing *revision*
  -- rather than a drawing: "the clash on A-102" means the clash on the
  -- revision that was current when it was asked.
  drawing_revision_id uuid references public.agenda_drawing_revisions (id) on delete set null,
  requested_from uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  priority public.agenda_priority not null default 'normal',
  due_date date,
  status public.agenda_review_status not null default 'draft',
  answered_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_rfi_number_per_project unique (project_id, number)
);

create table if not exists public.agenda_rfi_responses (
  id uuid primary key default gen_random_uuid(),
  rfi_id uuid not null references public.agenda_rfis (id) on delete cascade,
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  -- The answer, as opposed to a comment on the way to it. An RFI has many
  -- responses and at most one of them settles it.
  is_official boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Submittals
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_submittals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  number text not null,
  title text not null,
  spec_section text,
  discipline public.agenda_discipline,
  contractor text,
  submitted_by uuid references public.profiles (id) on delete set null,
  reviewer_id uuid references public.profiles (id) on delete set null,
  submitted_on date,
  required_by date,
  status public.agenda_review_status not null default 'draft',
  current_revision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_submittal_number_per_project unique (project_id, number)
);

create table if not exists public.agenda_submittal_revisions (
  id uuid primary key default gen_random_uuid(),
  submittal_id uuid not null references public.agenda_submittals (id) on delete cascade,
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  revision integer not null,
  -- `pending` rather than a `submitted` that does not exist: a revision is
  -- with the reviewer the moment it is created.
  status public.agenda_review_status not null default 'pending',
  reviewer_comment text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  submitted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint agenda_submittal_revision_unique unique (submittal_id, revision)
);

alter table public.agenda_submittals
  add constraint agenda_submittals_current_revision_fkey
  foreign key (current_revision_id)
  references public.agenda_submittal_revisions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Schedule
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_schedule_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  parent_id uuid references public.agenda_schedule_items (id) on delete cascade,
  name text not null,
  start_date date,
  finish_date date,
  -- Stored beside the dates rather than derived from them: a five-day activity
  -- spanning a weekend is five days of work and seven of calendar, and which
  -- one a programme means is a decision the planner makes.
  duration_days integer,
  progress_percent smallint not null default 0,
  is_milestone boolean not null default false,
  is_critical boolean not null default false,
  assigned_to uuid references public.profiles (id) on delete set null,
  priority public.agenda_priority not null default 'normal',
  status public.agenda_task_status not null default 'todo',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_schedule_progress_range
    check (progress_percent between 0 and 100),
  constraint agenda_schedule_dates
    check (finish_date is null or start_date is null or finish_date >= start_date)
);

create table if not exists public.agenda_schedule_links (
  predecessor_id uuid not null references public.agenda_schedule_items (id) on delete cascade,
  successor_id uuid not null references public.agenda_schedule_items (id) on delete cascade,
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  lag_days integer not null default 0,
  primary key (predecessor_id, successor_id),
  -- An activity cannot wait for itself. The longer cycles are the
  -- application's problem; this stops the one that is always a typo.
  constraint agenda_schedule_link_not_self check (predecessor_id <> successor_id)
);

-- ---------------------------------------------------------------------------
-- Site photos and 360 progress
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  storage_path text not null,
  caption text,
  building text,
  floor text,
  area text,
  taken_at timestamptz not null default now(),
  latitude double precision,
  longitude double precision,
  tags text[] not null default '{}',
  -- The 360 work already exists — 0081 to 0083 built capture, stitching and
  -- frame poses. A progress panorama is one of those, pointed at from here,
  -- rather than a second pipeline.
  panorama_job_id uuid references public.panorama_jobs (id) on delete set null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists agenda_photos_place_idx
  on public.agenda_photos (project_id, building, floor, area, taken_at desc);

-- ---------------------------------------------------------------------------
-- Quality: inspections, observations, punch list
-- ---------------------------------------------------------------------------

create type public.agenda_inspection_result as enum (
  'pending', 'pass', 'fail', 'conditional', 'not_applicable'
);

create table if not exists public.agenda_inspections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  number text,
  title text not null,
  discipline public.agenda_discipline,
  location text,
  scheduled_for date,
  inspected_at timestamptz,
  result public.agenda_inspection_result not null default 'pending',
  inspector_id uuid references public.profiles (id) on delete set null,
  contractor_signed_by uuid references public.profiles (id) on delete set null,
  inspector_signed_at timestamptz,
  contractor_signed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agenda_inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.agenda_inspections (id) on delete cascade,
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  description text not null,
  result public.agenda_inspection_result not null default 'pending',
  comment text,
  position integer not null default 0
);

create type public.agenda_observation_kind as enum (
  'quality', 'safety', 'design', 'workmanship', 'material',
  'environmental', 'general'
);

create type public.agenda_issue_status as enum (
  'open', 'assigned', 'in_progress', 'ready_for_inspection',
  'rejected', 'resolved', 'closed'
);

create table if not exists public.agenda_observations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  kind public.agenda_observation_kind not null default 'general',
  description text not null,
  location text,
  responsible_company text,
  assigned_to uuid references public.profiles (id) on delete set null,
  due_date date,
  status public.agenda_issue_status not null default 'open',
  drawing_revision_id uuid references public.agenda_drawing_revisions (id) on delete set null,
  -- Where it came from, when it came from a failed inspection. This is the
  -- join the brief's second example is about: inspection, failed item,
  -- observation, punch item, reinspection, closed.
  inspection_item_id uuid references public.agenda_inspection_items (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agenda_punch_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  number text,
  description text not null,
  location text,
  assigned_company text,
  assigned_to uuid references public.profiles (id) on delete set null,
  due_date date,
  priority public.agenda_priority not null default 'normal',
  status public.agenda_issue_status not null default 'open',
  drawing_revision_id uuid references public.agenda_drawing_revisions (id) on delete set null,
  observation_id uuid references public.agenda_observations (id) on delete set null,
  -- Before and after, which is what closes a snag argument.
  before_photo_id uuid references public.agenda_photos (id) on delete set null,
  after_photo_id uuid references public.agenda_photos (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_punch_number_per_project unique (project_id, number)
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
--
-- Written as a loop rather than eighty hand-typed policies. Every table in
-- this file is gated on exactly the same question, and typing it out
-- repeatedly is how one of them ends up subtly different — which is the bug
-- nobody finds until it is a leak.

do $$
declare
  t text;
  tables text[] := array[
    'agenda_drawings', 'agenda_drawing_revisions',
    'agenda_document_folders', 'agenda_documents', 'agenda_document_versions',
    'agenda_rfis', 'agenda_rfi_responses',
    'agenda_submittals', 'agenda_submittal_revisions',
    'agenda_schedule_items', 'agenda_schedule_links',
    'agenda_photos',
    'agenda_inspections', 'agenda_inspection_items',
    'agenda_observations', 'agenda_punch_items'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);

    execute format($f$
      drop policy if exists "agenda site: members read" on public.%I;
      create policy "agenda site: members read" on public.%I
        for select to authenticated
        using (public.agenda_is_member(project_id));
    $f$, t, t);

    execute format($f$
      drop policy if exists "agenda site: members write" on public.%I;
      create policy "agenda site: members write" on public.%I
        for insert to authenticated
        with check (public.agenda_is_member(project_id));
    $f$, t, t);

    execute format($f$
      drop policy if exists "agenda site: members update" on public.%I;
      create policy "agenda site: members update" on public.%I
        for update to authenticated
        using (public.agenda_is_member(project_id))
        with check (public.agenda_is_member(project_id));
    $f$, t, t);
  end loop;
end;
$$;

-- Documents are the exception: a contract filed under `confidential` is gated
-- a second time, on the same permission the ledger is. Replacing the read
-- policy the loop just made rather than adding another, because two
-- permissive SELECT policies are OR'd and the second would widen access
-- rather than narrow it — which is the opposite of what this is for.
drop policy if exists "agenda site: members read" on public.agenda_documents;
create policy "agenda site: members read" on public.agenda_documents
  for select to authenticated
  using (
    public.agenda_is_member(project_id)
    and (
      confidentiality = 'members'
      or (confidentiality = 'finance' and public.agenda_can_view_finance(project_id))
      or (confidentiality = 'meetings' and public.agenda_can_view_meetings(project_id))
      or public.agenda_is_owner(project_id)
    )
  );

-- Touch triggers, so `updated_at` is not something the application remembers.
do $$
declare
  t text;
begin
  foreach t in array array[
    'agenda_drawings', 'agenda_documents', 'agenda_rfis', 'agenda_submittals',
    'agenda_schedule_items', 'agenda_inspections', 'agenda_observations',
    'agenda_punch_items'
  ] loop
    execute format('drop trigger if exists agenda_touch_row on public.%I', t);
    execute format(
      'create trigger agenda_touch_row before update on public.%I '
      || 'for each row execute function public.agenda_touch()', t);
  end loop;
end;
$$;

commit;
