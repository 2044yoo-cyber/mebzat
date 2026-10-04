-- Medosha Project Agenda.
--
-- Everything else in Medosha is a shop window: listings, profiles, prices,
-- projects shown off to win the next job. Agenda is the opposite of that. It
-- is the private record of a job actually being built — who was on site, what
-- was delivered, what went wrong, what was paid and who agreed to it — and it
-- is the document people reach for when there is a dispute about any of them.
--
-- Two consequences run through this whole file.
--
-- First, access is a membership, not a visibility flag. A project is public;
-- its Agenda is not, and no amount of knowing the project id opens it. Every
-- table here is gated on being an accepted member, and the confidential parts
-- — money, meetings, contracts — are gated again on a permission the client
-- controls per member.
--
-- Second, nothing is deleted. A site record that can be quietly edited or
-- removed is worthless the moment it matters, so rows are archived rather
-- than dropped, edits are captured in an append-only audit table, and there
-- are no DELETE policies anywhere in this file.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'agenda_role') then
    create type public.agenda_role as enum (
      'client',
      'project_manager',
      'contractor',
      'architect',
      'engineer',
      'interior_designer',
      'quantity_surveyor',
      'supervisor',
      'supplier',        -- limited: sees only what it is given
      'employee',
      'administrator'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'agenda_member_status') then
    create type public.agenda_member_status as enum (
      'invited',
      'active',
      'suspended',
      'removed'
    );
  end if;
end
$$;

create table if not exists public.agenda_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.agenda_role not null,
  status public.agenda_member_status not null default 'invited',

  -- The confidential sections. Off by default for everyone: a quantity
  -- surveyor needs the ledger and a supplier does not, and the safe default
  -- for money is that you were deliberately given it.
  can_view_finance boolean not null default false,
  can_view_meetings boolean not null default false,
  can_view_contracts boolean not null default false,
  -- Suppliers and employees usually record but do not approve.
  can_approve boolean not null default false,

  invited_by uuid references public.profiles (id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  removed_at timestamptz,

  constraint agenda_members_unique unique (project_id, user_id)
);

comment on table public.agenda_members is
  'Who may open a project''s private Agenda, and how much of it.';

create index if not exists agenda_members_project_idx
  on public.agenda_members (project_id) where status = 'active';
create index if not exists agenda_members_user_idx
  on public.agenda_members (user_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- The access predicates
--
-- Written as security-definer functions so a policy can ask "is this person a
-- member" without recursing into agenda_members' own policies, and so every
-- table asks the question exactly the same way. A bug fixed here is fixed
-- everywhere; a rule copied into fourteen policies is a rule that will drift.
-- ---------------------------------------------------------------------------

create or replace function public.agenda_is_member(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agenda_members m
    where m.project_id = target_project
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
  -- The project's owner is always a member of their own Agenda, whether or
  -- not anybody remembered to add the row.
  or exists (
    select 1 from public.projects p
    where p.id = target_project and p.owner_id = auth.uid()
  );
$$;

create or replace function public.agenda_is_owner(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = target_project and p.owner_id = auth.uid()
  ) or exists (
    select 1 from public.agenda_members m
    where m.project_id = target_project
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('client', 'administrator')
  );
$$;

/** Whether this member may see money: the ledger, payments, invoices. */
create or replace function public.agenda_can_view_finance(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.agenda_is_owner(target_project) or exists (
    select 1 from public.agenda_members m
    where m.project_id = target_project
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.can_view_finance
  );
$$;

create or replace function public.agenda_can_view_meetings(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.agenda_is_owner(target_project) or exists (
    select 1 from public.agenda_members m
    where m.project_id = target_project
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.can_view_meetings
  );
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'agenda_is_member(uuid)',
    'agenda_is_owner(uuid)',
    'agenda_can_view_finance(uuid)',
    'agenda_can_view_meetings(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end
$$;

alter table public.agenda_members enable row level security;

-- A member sees the roster. Nobody outside sees that the Agenda exists.
drop policy if exists "agenda members: read" on public.agenda_members;
create policy "agenda members: read"
  on public.agenda_members for select to authenticated
  using (user_id = auth.uid() or public.agenda_is_member(project_id));

-- Only the client, the project owner or an administrator changes the roster,
-- which is what makes "clients control who can view" true rather than a
-- setting a contractor could quietly flip.
drop policy if exists "agenda members: owner writes" on public.agenda_members;
create policy "agenda members: owner writes"
  on public.agenda_members for insert to authenticated
  with check (public.agenda_is_owner(project_id));

drop policy if exists "agenda members: owner updates" on public.agenda_members;
create policy "agenda members: owner updates"
  on public.agenda_members for update to authenticated
  using (public.agenda_is_owner(project_id) or user_id = auth.uid())
  with check (public.agenda_is_owner(project_id) or user_id = auth.uid());

/**
 * Nobody grants themselves access to the money.
 *
 * The update policy lets a member touch their own row so they can accept an
 * invitation. Without this, accepting would also be an opportunity to set
 * can_view_finance — the one thing the client is supposed to control.
 */
create or replace function public.agenda_guard_member_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.agenda_is_owner(new.project_id) then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.can_view_finance is distinct from old.can_view_finance
     or new.can_view_meetings is distinct from old.can_view_meetings
     or new.can_view_contracts is distinct from old.can_view_contracts
     or new.can_approve is distinct from old.can_approve then
    raise exception 'Only the client or an administrator can change Agenda permissions';
  end if;

  return new;
end;
$$;

drop trigger if exists agenda_guard_member_update on public.agenda_members;
create trigger agenda_guard_member_update
  before update on public.agenda_members
  for each row execute function public.agenda_guard_member_update();

-- ---------------------------------------------------------------------------
-- The timeline
--
-- Declared before the tables that feed it, because their triggers write here.
-- One chronological stream is what turns a pile of records into a history you
-- can read start to finish, so it is the destination rather than a view — and
-- rows carry their own visibility, so a finance event does not surface to
-- somebody who cannot open the ledger.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'agenda_event_kind') then
    create type public.agenda_event_kind as enum (
      'log',
      'task_created',
      'task_started',
      'task_completed',
      'ledger',
      'meeting',
      'decision',
      'attachment',
      'member',
      'reminder',
      'milestone'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'agenda_confidentiality') then
    create type public.agenda_confidentiality as enum (
      'members',    -- any active member
      'finance',    -- needs can_view_finance
      'meetings'    -- needs can_view_meetings
    );
  end if;
end
$$;

create table if not exists public.agenda_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind public.agenda_event_kind not null,
  title text not null,
  detail text,
  /** What the event is about, so the UI can link to it. */
  entity_table text,
  entity_id uuid,
  actor_id uuid references public.profiles (id) on delete set null,
  confidentiality public.agenda_confidentiality not null default 'members',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists agenda_events_project_idx
  on public.agenda_events (project_id, occurred_at desc);

alter table public.agenda_events enable row level security;

drop policy if exists "agenda events: read" on public.agenda_events;
create policy "agenda events: read"
  on public.agenda_events for select to authenticated
  using (
    public.agenda_is_member(project_id)
    and (
      confidentiality = 'members'
      or (confidentiality = 'finance' and public.agenda_can_view_finance(project_id))
      or (confidentiality = 'meetings' and public.agenda_can_view_meetings(project_id))
    )
  );

-- Events are written by triggers running as the definer, never by hand.
drop policy if exists "agenda events: insert" on public.agenda_events;
create policy "agenda events: insert"
  on public.agenda_events for insert to authenticated
  with check (public.agenda_is_member(project_id));

/** Records one thing having happened. Called by the triggers below. */
create or replace function public.agenda_log_event(
  target_project uuid,
  event_kind public.agenda_event_kind,
  event_title text,
  event_detail text default null,
  source_table text default null,
  source_id uuid default null,
  visibility public.agenda_confidentiality default 'members',
  happened_at timestamptz default now()
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.agenda_events
    (project_id, kind, title, detail, entity_table, entity_id, actor_id,
     confidentiality, occurred_at)
  values
    (target_project, event_kind, event_title, event_detail, source_table,
     source_id, auth.uid(), visibility, happened_at);
$$;

-- ---------------------------------------------------------------------------
-- Daily site log
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_daily_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  log_date date not null,
  weather text,
  temperature_c numeric(4, 1),
  workers_present integer check (workers_present is null or workers_present >= 0),
  work_completed text,
  materials_delivered text,
  equipment_used text,
  problems text,
  safety_issues text,
  visitors text,
  notes text,
  author_id uuid not null references public.profiles (id) on delete cascade,
  -- Nothing is deleted; a log withdrawn stays readable and marked.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One log per site per day. A second entry is an edit of the first, which
  -- is what makes the audit trail meaningful.
  constraint agenda_daily_logs_unique unique (project_id, log_date)
);

create index if not exists agenda_daily_logs_project_idx
  on public.agenda_daily_logs (project_id, log_date desc);

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'agenda_task_status') then
    create type public.agenda_task_status as enum (
      'todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'agenda_priority') then
    create type public.agenda_priority as enum ('low', 'normal', 'high', 'urgent');
  end if;
end
$$;

create table if not exists public.agenda_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 200),
  description text,
  assigned_to uuid references public.profiles (id) on delete set null,
  priority public.agenda_priority not null default 'normal',
  status public.agenda_task_status not null default 'todo',
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete cascade,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agenda_tasks_project_idx
  on public.agenda_tasks (project_id, status, due_at);
create index if not exists agenda_tasks_assignee_idx
  on public.agenda_tasks (assigned_to) where status <> 'done';

create table if not exists public.agenda_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agenda_tasks (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists agenda_task_comments_task_idx
  on public.agenda_task_comments (task_id, created_at);

-- ---------------------------------------------------------------------------
-- The private ledger
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'agenda_ledger_kind') then
    create type public.agenda_ledger_kind as enum (
      'material_purchase',
      'labour_payment',
      'equipment_rental',
      'supplier_payment',
      'cash_expense',
      'transport',
      'fuel',
      'unexpected_cost',
      'variation_order',
      'client_payment',
      'other'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'agenda_ledger_status') then
    create type public.agenda_ledger_status as enum ('paid', 'outstanding', 'void');
  end if;
end
$$;

create table if not exists public.agenda_ledger (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind public.agenda_ledger_kind not null,
  -- Money in or out of the project. Stored as a sign rather than inferred from
  -- the kind, so a refunded purchase is one row with a direction rather than a
  -- special case in every sum.
  direction smallint not null default -1 check (direction in (-1, 1)),
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null default 'ETB',
  status public.agenda_ledger_status not null default 'paid',
  description text not null,
  counterparty text,
  reference text,
  -- Links out to the rest of Medosha, when the money came from there.
  supplier_id uuid references public.companies (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  occurred_on date not null default current_date,
  due_on date,
  recorded_by uuid not null references public.profiles (id) on delete cascade,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.agenda_ledger is
  'The project''s private money record. Readable only by members the client has granted finance access.';

create index if not exists agenda_ledger_project_idx
  on public.agenda_ledger (project_id, occurred_on desc);
create index if not exists agenda_ledger_outstanding_idx
  on public.agenda_ledger (project_id, due_on) where status = 'outstanding';

-- ---------------------------------------------------------------------------
-- Meetings and decisions
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_meetings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  held_at timestamptz not null default now(),
  location text,
  attendees text,
  minutes text,
  client_decisions text,
  design_changes text,
  approvals text,
  inspection_result text,
  next_actions text,
  author_id uuid not null references public.profiles (id) on delete cascade,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agenda_meetings_project_idx
  on public.agenda_meetings (project_id, held_at desc);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'agenda_decision_status') then
    create type public.agenda_decision_status as enum (
      'proposed', 'approved', 'rejected', 'superseded'
    );
  end if;
end
$$;

create table if not exists public.agenda_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  detail text,
  status public.agenda_decision_status not null default 'proposed',
  -- Who actually made the call, which is the whole point of the record.
  decided_by uuid references public.profiles (id) on delete set null,
  decided_by_name text,
  decided_on date,
  meeting_id uuid references public.agenda_meetings (id) on delete set null,
  /** A decision is never edited away; it is superseded by another. */
  supersedes uuid references public.agenda_decisions (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agenda_decisions_project_idx
  on public.agenda_decisions (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Attachments
--
-- One table for every kind of file against every kind of record. A separate
-- photos table per feature would mean the same upload, permission and audit
-- code five times over, and DWG files would end up somewhere else again.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'agenda_file_kind') then
    create type public.agenda_file_kind as enum (
      'image', 'video', 'voice', 'pdf', 'cad', 'model', 'spreadsheet',
      'document', 'other'
    );
  end if;
end
$$;

create table if not exists public.agenda_attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  /** Which record this belongs to. Text rather than an enum so a new record
      type does not need a migration to be attachable. */
  entity_table text not null,
  entity_id uuid not null,
  url text not null,
  file_name text,
  file_kind public.agenda_file_kind not null default 'other',
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  duration_seconds integer,
  caption text,
  /** Confidential attachments — a signed contract, an invoice — follow the
      same permission as the ledger rather than being visible to everyone who
      can see the record they hang off. */
  confidentiality public.agenda_confidentiality not null default 'members',
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists agenda_attachments_entity_idx
  on public.agenda_attachments (entity_table, entity_id);
create index if not exists agenda_attachments_project_idx
  on public.agenda_attachments (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Reminders
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'agenda_reminder_kind') then
    create type public.agenda_reminder_kind as enum (
      'late_task', 'meeting', 'inspection', 'material_order',
      'payment', 'warranty', 'deadline'
    );
  end if;
end
$$;

create table if not exists public.agenda_reminders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind public.agenda_reminder_kind not null,
  title text not null,
  detail text,
  due_at timestamptz not null,
  entity_table text,
  entity_id uuid,
  assigned_to uuid references public.profiles (id) on delete cascade,
  confidentiality public.agenda_confidentiality not null default 'members',
  notified_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists agenda_reminders_due_idx
  on public.agenda_reminders (project_id, due_at) where completed_at is null;

-- ---------------------------------------------------------------------------
-- The audit trail
--
-- "Nothing is deleted" is only true if edits are captured too: a daily log
-- rewritten a month later looks identical to one written on the day unless
-- the change itself is recorded. Append-only, and nobody can write to it by
-- hand — the trigger is the only author.
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_audit (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('insert', 'update', 'archive')),
  actor_id uuid references public.profiles (id) on delete set null,
  /** Only the fields that actually changed, old and new. */
  changes jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agenda_audit_row_idx
  on public.agenda_audit (table_name, row_id, created_at desc);
create index if not exists agenda_audit_project_idx
  on public.agenda_audit (project_id, created_at desc);

create or replace function public.agenda_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  diff jsonb := '{}'::jsonb;
  key text;
  old_json jsonb;
  new_json jsonb;
  action_name text;
begin
  new_json := to_jsonb(new);

  if tg_op = 'INSERT' then
    action_name := 'insert';
  else
    old_json := to_jsonb(old);
    -- Archiving is called out separately: it is the nearest thing to a delete
    -- this schema has, and it should be obvious in the history.
    if new_json ? 'archived_at'
       and (old_json ->> 'archived_at') is null
       and (new_json ->> 'archived_at') is not null then
      action_name := 'archive';
    else
      action_name := 'update';
    end if;

    for key in select jsonb_object_keys(new_json) loop
      -- updated_at changes on every write and says nothing.
      if key <> 'updated_at'
         and (old_json -> key) is distinct from (new_json -> key) then
        diff := diff || jsonb_build_object(
          key,
          jsonb_build_object('from', old_json -> key, 'to', new_json -> key)
        );
      end if;
    end loop;

    -- A write that changed nothing is not history.
    if diff = '{}'::jsonb then
      return new;
    end if;
  end if;

  insert into public.agenda_audit
    (project_id, table_name, row_id, action, actor_id, changes)
  values
    (new.project_id, tg_table_name, new.id, action_name, auth.uid(),
     case when tg_op = 'INSERT' then null else diff end);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Timestamps and timeline, wired to each table
-- ---------------------------------------------------------------------------

create or replace function public.agenda_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'agenda_daily_logs', 'agenda_tasks', 'agenda_ledger',
    'agenda_meetings', 'agenda_decisions'
  ] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format(
      'create trigger %I_touch before update on public.%I
         for each row execute function public.agenda_touch()', t, t);

    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format(
      'create trigger %I_audit after insert or update on public.%I
         for each row execute function public.agenda_audit_row()', t, t);
  end loop;
end
$$;

-- Timeline writers, one per record type.

create or replace function public.agenda_after_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.agenda_log_event(
      new.project_id, 'log',
      'Site log for ' || to_char(new.log_date, 'DD Mon YYYY'),
      nullif(left(coalesce(new.work_completed, ''), 200), ''),
      'agenda_daily_logs', new.id, 'members', new.log_date::timestamptz);
  end if;
  return new;
end;
$$;

create or replace function public.agenda_after_task()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.agenda_log_event(
      new.project_id, 'task_created', new.title, null,
      'agenda_tasks', new.id);
  elsif new.status is distinct from old.status then
    if new.status = 'in_progress' then
      perform public.agenda_log_event(
        new.project_id, 'task_started', new.title || ' started', null,
        'agenda_tasks', new.id);
    elsif new.status = 'done' then
      perform public.agenda_log_event(
        new.project_id, 'task_completed', new.title || ' completed', null,
        'agenda_tasks', new.id);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.agenda_after_ledger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.agenda_log_event(
      new.project_id, 'ledger',
      new.description,
      trim(to_char(new.amount, 'FM999,999,999.00')) || ' ' || new.currency,
      'agenda_ledger', new.id,
      -- Money never appears on a timeline somebody without finance access
      -- is reading. This is the line that makes that true.
      'finance', new.occurred_on::timestamptz);
  end if;
  return new;
end;
$$;

create or replace function public.agenda_after_meeting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.agenda_log_event(
      new.project_id, 'meeting', new.title, null,
      'agenda_meetings', new.id, 'meetings', new.held_at);
  end if;
  return new;
end;
$$;

create or replace function public.agenda_after_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform public.agenda_log_event(
      new.project_id, 'decision',
      new.title,
      initcap(new.status::text),
      'agenda_decisions', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists agenda_daily_logs_timeline on public.agenda_daily_logs;
create trigger agenda_daily_logs_timeline after insert on public.agenda_daily_logs
  for each row execute function public.agenda_after_log();

drop trigger if exists agenda_tasks_timeline on public.agenda_tasks;
create trigger agenda_tasks_timeline after insert or update on public.agenda_tasks
  for each row execute function public.agenda_after_task();

drop trigger if exists agenda_ledger_timeline on public.agenda_ledger;
create trigger agenda_ledger_timeline after insert on public.agenda_ledger
  for each row execute function public.agenda_after_ledger();

drop trigger if exists agenda_meetings_timeline on public.agenda_meetings;
create trigger agenda_meetings_timeline after insert on public.agenda_meetings
  for each row execute function public.agenda_after_meeting();

drop trigger if exists agenda_decisions_timeline on public.agenda_decisions;
create trigger agenda_decisions_timeline after insert or update on public.agenda_decisions
  for each row execute function public.agenda_after_decision();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Member-gated read and write on everything, finance-gated on the ledger, and
-- no DELETE policy anywhere. The last of those is not an omission: without a
-- policy, RLS refuses every delete, so "nothing is deleted" is enforced by the
-- database rather than by every caller remembering to archive instead.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'agenda_daily_logs', 'agenda_tasks', 'agenda_task_comments',
    'agenda_meetings', 'agenda_decisions', 'agenda_attachments',
    'agenda_reminders', 'agenda_ledger', 'agenda_audit'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- The straightforward ones: any active member reads and writes.
  foreach t in array array[
    'agenda_daily_logs', 'agenda_tasks', 'agenda_task_comments',
    'agenda_decisions', 'agenda_reminders'
  ] loop
    execute format('drop policy if exists "%s: member read" on public.%I', t, t);
    execute format(
      'create policy "%s: member read" on public.%I for select to authenticated
         using (public.agenda_is_member(project_id))', t, t);

    execute format('drop policy if exists "%s: member write" on public.%I', t, t);
    execute format(
      'create policy "%s: member write" on public.%I for insert to authenticated
         with check (public.agenda_is_member(project_id))', t, t);

    execute format('drop policy if exists "%s: member update" on public.%I', t, t);
    execute format(
      'create policy "%s: member update" on public.%I for update to authenticated
         using (public.agenda_is_member(project_id))
         with check (public.agenda_is_member(project_id))', t, t);
  end loop;
end
$$;

-- The ledger: finance permission, not mere membership.
drop policy if exists "agenda ledger: read" on public.agenda_ledger;
create policy "agenda ledger: read"
  on public.agenda_ledger for select to authenticated
  using (public.agenda_can_view_finance(project_id));

drop policy if exists "agenda ledger: write" on public.agenda_ledger;
create policy "agenda ledger: write"
  on public.agenda_ledger for insert to authenticated
  with check (public.agenda_can_view_finance(project_id));

drop policy if exists "agenda ledger: update" on public.agenda_ledger;
create policy "agenda ledger: update"
  on public.agenda_ledger for update to authenticated
  using (public.agenda_can_view_finance(project_id))
  with check (public.agenda_can_view_finance(project_id));

-- Meetings: their own permission.
drop policy if exists "agenda meetings: read" on public.agenda_meetings;
create policy "agenda meetings: read"
  on public.agenda_meetings for select to authenticated
  using (public.agenda_can_view_meetings(project_id));

drop policy if exists "agenda meetings: write" on public.agenda_meetings;
create policy "agenda meetings: write"
  on public.agenda_meetings for insert to authenticated
  with check (public.agenda_can_view_meetings(project_id));

drop policy if exists "agenda meetings: update" on public.agenda_meetings;
create policy "agenda meetings: update"
  on public.agenda_meetings for update to authenticated
  using (public.agenda_can_view_meetings(project_id))
  with check (public.agenda_can_view_meetings(project_id));

-- Attachments carry their own confidentiality, so a contract on a task is
-- not visible to everyone who can see the task.
drop policy if exists "agenda attachments: read" on public.agenda_attachments;
create policy "agenda attachments: read"
  on public.agenda_attachments for select to authenticated
  using (
    public.agenda_is_member(project_id)
    and (
      confidentiality = 'members'
      or (confidentiality = 'finance' and public.agenda_can_view_finance(project_id))
      or (confidentiality = 'meetings' and public.agenda_can_view_meetings(project_id))
    )
  );

drop policy if exists "agenda attachments: write" on public.agenda_attachments;
create policy "agenda attachments: write"
  on public.agenda_attachments for insert to authenticated
  with check (public.agenda_is_member(project_id));

drop policy if exists "agenda attachments: update" on public.agenda_attachments;
create policy "agenda attachments: update"
  on public.agenda_attachments for update to authenticated
  using (public.agenda_is_member(project_id))
  with check (public.agenda_is_member(project_id));

-- The audit trail is readable by members and writable by nobody: the trigger
-- is security definer and bypasses this, which is exactly the intent.
drop policy if exists "agenda audit: read" on public.agenda_audit;
create policy "agenda audit: read"
  on public.agenda_audit for select to authenticated
  using (public.agenda_is_member(project_id));

-- ---------------------------------------------------------------------------
-- Summaries
-- ---------------------------------------------------------------------------

/**
 * The numbers behind the Agenda header.
 *
 * One round trip rather than six. Finance figures come back null — not zero —
 * for a member without finance access, so the caller cannot mistake "not
 * allowed to see" for "nothing spent".
 */
create or replace function public.agenda_overview(target_project uuid)
returns table (
  is_member boolean,
  can_view_finance boolean,
  member_count integer,
  open_tasks integer,
  overdue_tasks integer,
  logs_this_week integer,
  last_log_date date,
  open_reminders integer,
  total_spent numeric,
  total_received numeric,
  outstanding numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    public.agenda_is_member(target_project),
    public.agenda_can_view_finance(target_project),
    (select count(*)::integer from public.agenda_members m
      where m.project_id = target_project and m.status = 'active'),
    (select count(*)::integer from public.agenda_tasks t
      where t.project_id = target_project
        and t.status not in ('done', 'cancelled') and t.archived_at is null),
    (select count(*)::integer from public.agenda_tasks t
      where t.project_id = target_project
        and t.status not in ('done', 'cancelled') and t.archived_at is null
        and t.due_at < now()),
    (select count(*)::integer from public.agenda_daily_logs l
      where l.project_id = target_project
        and l.log_date > current_date - 7 and l.archived_at is null),
    (select max(l.log_date) from public.agenda_daily_logs l
      where l.project_id = target_project and l.archived_at is null),
    (select count(*)::integer from public.agenda_reminders r
      where r.project_id = target_project and r.completed_at is null),
    case when public.agenda_can_view_finance(target_project) then
      (select coalesce(sum(g.amount), 0) from public.agenda_ledger g
        where g.project_id = target_project and g.direction = -1
          and g.status = 'paid' and g.archived_at is null)
    end,
    case when public.agenda_can_view_finance(target_project) then
      (select coalesce(sum(g.amount), 0) from public.agenda_ledger g
        where g.project_id = target_project and g.direction = 1
          and g.status = 'paid' and g.archived_at is null)
    end,
    case when public.agenda_can_view_finance(target_project) then
      (select coalesce(sum(g.amount), 0) from public.agenda_ledger g
        where g.project_id = target_project and g.status = 'outstanding'
          and g.archived_at is null)
    end
  where public.agenda_is_member(target_project);
$$;

revoke all on function public.agenda_overview(uuid) from public;
grant execute on function public.agenda_overview(uuid) to authenticated;

/** Every Agenda the caller belongs to, for the projects list. */
create or replace function public.my_agendas()
returns table (
  project_id uuid,
  title text,
  role public.agenda_role,
  open_tasks integer,
  last_activity timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.title,
    coalesce(m.role, 'client'::public.agenda_role),
    (select count(*)::integer from public.agenda_tasks t
      where t.project_id = p.id and t.status not in ('done', 'cancelled')),
    (select max(e.occurred_at) from public.agenda_events e where e.project_id = p.id)
  from public.projects p
  left join public.agenda_members m
    on m.project_id = p.id and m.user_id = auth.uid() and m.status = 'active'
  where p.owner_id = auth.uid() or m.id is not null
  order by 5 desc nulls last;
$$;

revoke all on function public.my_agendas() from public;
grant execute on function public.my_agendas() to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

alter type public.notification_kind add value if not exists 'agenda_invite';
alter type public.notification_kind add value if not exists 'agenda_task';
alter type public.notification_kind add value if not exists 'agenda_reminder';

-- ---------------------------------------------------------------------------
-- Privileges
--
-- Granted explicitly rather than left to the schema default, and DELETE is
-- withheld from every table in this module. RLS already refuses deletes by
-- having no policy for them; withholding the privilege as well means a future
-- policy added carelessly still cannot destroy site history. Two locks on the
-- one door that must not open.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'agenda_members', 'agenda_events', 'agenda_daily_logs', 'agenda_tasks',
    'agenda_task_comments', 'agenda_ledger', 'agenda_meetings',
    'agenda_decisions', 'agenda_attachments', 'agenda_reminders'
  ] loop
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('revoke delete on public.%I from authenticated, anon', t);
  end loop;

  -- The audit trail is read-only to everyone. Its trigger is security definer
  -- and writes regardless.
  grant select on public.agenda_audit to authenticated;
  revoke insert, update, delete on public.agenda_audit from authenticated, anon;
end
$$;
