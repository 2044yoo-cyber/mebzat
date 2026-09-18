-- Agenda gets a project of its own.
--
-- 0024 built the private site record — members, tasks, daily logs, meetings,
-- decisions, a ledger and an append-only audit — and hung all of it off
-- `public.projects`. That table is the *portfolio*: slug, views, style,
-- bedrooms, tags, cover image. A shop window, exactly as 0024's own header
-- says. There is nowhere on it for a project number, a contract value, a
-- consultant, a structural engineer or a site coordinate, and there should not
-- be: those belong to a job being built, not to a page showing one off.
--
-- So `agenda_projects` is the construction project, and the portfolio row
-- becomes an optional thing a finished job can be *published to* rather than
-- the thing it is.
--
-- ## Nothing moves
--
-- Every `agenda_*` table already carries `project_id`, and those values are
-- `public.projects.id`. Rather than rewrite them, the backfill creates an
-- `agenda_projects` row **with the same id** for every project that has
-- members today, and the foreign keys are repointed at it. Not one existing
-- row changes, and every existing Agenda keeps working at the URL it has.
--
-- ## The rules from 0024 continue to apply
--
-- Access is a membership, not a visibility flag. Confidential sections are
-- gated a second time on a per-member permission. And nothing is deleted:
-- rows are archived, and there are no DELETE policies in this file either.

begin;

create type public.agenda_project_type as enum (
  'residential', 'apartment', 'commercial', 'office', 'hotel', 'industrial',
  'infrastructure', 'interior', 'renovation', 'mixed_use', 'other'
);

-- Planning and construction are not the same state, and neither is a job that
-- has stopped. The dashboard filters on exactly these.
create type public.agenda_project_status as enum (
  'planning', 'tender', 'construction', 'on_hold', 'completed', 'cancelled'
);

create table if not exists public.agenda_projects (
  id uuid primary key default gen_random_uuid(),

  -- Who the record belongs to. The owner is a member with the administrator
  -- role like everybody else; this column is what survives every member being
  -- removed, so a project can never become unreachable.
  owner_id uuid not null references public.profiles (id) on delete restrict,

  name text not null,
  -- The number the site writes on drawings and invoices. Unique per owner
  -- rather than globally: two companies both have a job 001.
  project_number text,
  project_type public.agenda_project_type not null default 'residential',
  status public.agenda_project_status not null default 'planning',

  -- The parties. Free text as well as an optional profile, because most of a
  -- contract's signatories are not Medosha accounts and waiting for them to
  -- join is not a reason to leave the field blank.
  client_name text,
  client_id uuid references public.profiles (id) on delete set null,
  main_contractor text,
  consultant text,
  architect text,
  structural_engineer text,
  mep_engineer text,
  project_manager_id uuid references public.profiles (id) on delete set null,
  site_engineer_id uuid references public.profiles (id) on delete set null,

  location text,
  -- A site coordinate, unlike a listing's, is exact: it is what a delivery
  -- driver is sent to. `location_accuracy` from 0022 does not apply here.
  latitude double precision,
  longitude double precision,

  start_date date,
  target_completion_date date,
  actual_completion_date date,

  contract_value numeric(16, 2),
  currency text not null default 'ETB',

  description text,
  image_url text,

  -- Reported rather than derived. A percentage computed from tasks or from
  -- spend is a number the site did not agree to, and the first argument about
  -- it destroys trust in every other figure on the screen.
  progress_percent smallint not null default 0,

  -- Where a finished job is shown off, once it is finished. Nullable and
  -- `set null`: unpublishing a portfolio piece must not take the site record
  -- with it.
  showcase_project_id uuid references public.projects (id) on delete set null,

  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint agenda_projects_progress_range
    check (progress_percent between 0 and 100),
  constraint agenda_projects_dates
    check (target_completion_date is null or start_date is null
           or target_completion_date >= start_date),
  constraint agenda_projects_value_positive
    check (contract_value is null or contract_value >= 0)
);

comment on table public.agenda_projects is
  'A construction project being built. Not public.projects, which is the portfolio piece a finished job may later be published to.';

create unique index if not exists agenda_projects_number_per_owner
  on public.agenda_projects (owner_id, lower(project_number))
  where project_number is not null and archived_at is null;

create index if not exists agenda_projects_owner_idx
  on public.agenda_projects (owner_id, created_at desc);
create index if not exists agenda_projects_status_idx
  on public.agenda_projects (status) where archived_at is null;

-- ---------------------------------------------------------------------------
-- The backfill, and the repointing
-- ---------------------------------------------------------------------------
--
-- One row per portfolio project that somebody built an Agenda on, carrying the
-- same id. `on conflict do nothing` so this migration is safe to re-run.

insert into public.agenda_projects (
  id, owner_id, name, status, location, description, image_url,
  contract_value, currency, showcase_project_id, created_at
)
select
  p.id,
  p.owner_id,
  p.title,
  -- A portfolio project with a live Agenda is a job in progress until
  -- somebody says otherwise.
  'construction'::public.agenda_project_status,
  nullif(concat_ws(', ', p.location_city, p.location_country), ''),
  p.description,
  p.cover_image_url,
  p.budget,
  coalesce(p.budget_currency, 'ETB'),
  p.id,
  p.created_at
from public.projects p
where exists (
  select 1 from public.agenda_members m where m.project_id = p.id
)
on conflict (id) do nothing;

-- Repoint every child. The values do not change — only what they reference.
--
-- Selected by the referencing *column* rather than by the table's name: this
-- file's own `showcase_project_id` also points at `public.projects` and must
-- keep doing so, and a name-prefix match caught it and tried to rewrite it
-- into a foreign key on a column it does not have.
do $$
declare
  child record;
begin
  for child in
    select
      con.conname,
      cls.relname as table_name
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'public.projects'::regclass
      and ns.nspname = 'public'
      and cls.relname like 'agenda\_%'
      and cls.relname <> 'agenda_projects'
      and att.attname = 'project_id'
      and array_length(con.conkey, 1) = 1
  loop
    execute format('alter table public.%I drop constraint %I',
                   child.table_name, child.conname);
    execute format(
      'alter table public.%I add constraint %I foreign key (project_id) '
      || 'references public.agenda_projects (id) on delete cascade',
      child.table_name, child.conname);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may see a project
-- ---------------------------------------------------------------------------

alter table public.agenda_projects enable row level security;

-- `agenda_is_member` from 0024 is the one definition of access, and it is
-- reused rather than restated. A second spelling of "is this person on this
-- project" is a second thing to get wrong.
drop policy if exists "agenda projects: members read" on public.agenda_projects;
create policy "agenda projects: members read"
  on public.agenda_projects for select
  to authenticated
  using (owner_id = auth.uid() or public.agenda_is_member(id));

drop policy if exists "agenda projects: anybody starts one" on public.agenda_projects;
create policy "agenda projects: anybody starts one"
  on public.agenda_projects for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "agenda projects: owner and administrators edit" on public.agenda_projects;
create policy "agenda projects: owner and administrators edit"
  on public.agenda_projects for update
  to authenticated
  using (owner_id = auth.uid() or public.agenda_is_owner(id))
  with check (owner_id = auth.uid() or public.agenda_is_owner(id));

-- Starting a project makes you a member of it.
--
-- Without this the creator cannot read the row they just inserted — the select
-- policy asks `agenda_is_member`, and there are no members yet. A trigger
-- rather than a step in the application, because a project created any other
-- way would have the same hole.
create or replace function public.agenda_project_seed_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.agenda_members (
    project_id, user_id, role, status,
    can_view_finance, can_view_meetings, can_view_contracts, can_approve,
    invited_by, accepted_at
  )
  values (
    -- `active`, not `accepted`: that is the word `agenda_member_status` uses,
    -- and it is also what every helper in 0024 checks for. An owner seeded as
    -- anything else is an owner `agenda_can_view_finance` says no to.
    new.id, new.owner_id, 'administrator', 'active',
    true, true, true, true,
    new.owner_id, now()
  )
  on conflict (project_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists agenda_project_seed_owner on public.agenda_projects;
create trigger agenda_project_seed_owner
  after insert on public.agenda_projects
  for each row
  execute function public.agenda_project_seed_owner();

drop trigger if exists agenda_projects_touch on public.agenda_projects;
create trigger agenda_projects_touch
  before update on public.agenda_projects
  for each row execute function public.agenda_touch();

commit;
