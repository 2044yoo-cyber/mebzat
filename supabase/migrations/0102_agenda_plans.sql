-- Floor plans, sketches and pins, on the project Agenda already has.
--
-- The House Designer saved to the browser and nowhere else: a plan drawn on a
-- phone on site could not be opened on the office computer, and could not be
-- talked about in the project it was for. These three tables put it in the
-- same project as everything else — the same `agenda_projects` row, the same
-- members, the same `agenda_is_member` question — rather than starting a
-- second kind of project that would then have to be kept in step with the
-- first.
--
--   agenda_plans     the floor plan itself: the editor's model, as JSON
--   agenda_sketches  markup drawn over something — the plan, a photo, a PDF
--                    page, a CAD drawing. Stored apart from what it is drawn
--                    on, which is never painted over.
--   agenda_pins      a numbered point on any of those, which an Agenda task
--                    can point back at, and which points at its task
--
-- Files — the photo, the PDF, the DXF — are already the bucket 0094 made and
-- the documents and photos 0090 made. Nothing here stores a file; a sketch or
-- a pin names the path of one.
--
-- ## The rules from 0024 continue to apply
--
-- Access is membership. Nothing is deleted: a plan or a sketch is archived,
-- there is no DELETE policy, and the privilege is revoked.

begin;

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  -- The editor's model, whole. Its rooms, walls and openings carry their own
  -- stable ids, which is what a wardrobe or a kitchen designed later against
  -- "this wall" needs to find it again.
  data jsonb not null,
  -- Bumped on every save. A save names the revision it was made from, so two
  -- people saving the same plan cannot silently overwrite each other.
  revision integer not null default 1 check (revision >= 1),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_plans_data_object check (jsonb_typeof(data) = 'object')
);

create index if not exists agenda_plans_project_idx
  on public.agenda_plans (project_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Sketches
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_sketches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  plan_id uuid references public.agenda_plans (id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  -- What the markup is drawn over. A plan is named by `plan_id` and a level;
  -- anything else is a file in the project's bucket, and a PDF also a page.
  source_kind text not null check (source_kind in ('plan', 'image', 'pdf', 'cad')),
  source_path text,
  source_name text check (source_name is null or char_length(source_name) <= 200),
  source_level text check (source_level is null or char_length(source_level) <= 120),
  source_page integer check (source_page is null or source_page >= 1),
  -- The shapes, in the source's own coordinates.
  markup jsonb not null default '[]'::jsonb,
  -- Millimetres per source unit, once known: a plan knows it, a photo or a
  -- PDF is calibrated by somebody entering a known length.
  scale_mm_per_unit double precision
    check (scale_mm_per_unit is null or scale_mm_per_unit > 0),
  -- The marked-up image, rendered, for an Agenda item to show.
  preview_path text,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_sketches_markup_array check (jsonb_typeof(markup) = 'array'),
  constraint agenda_sketches_source check (
    (source_kind = 'plan' and plan_id is not null)
    or (source_kind <> 'plan' and source_path is not null)
  ),
  -- The paths are inside this project's folder, or the row and the object
  -- disagree about who may see the file.
  constraint agenda_sketches_source_in_project check (
    source_path is null or source_path like project_id::text || '/%'
  ),
  constraint agenda_sketches_preview_in_project check (
    preview_path is null or preview_path like project_id::text || '/%'
  )
);

create index if not exists agenda_sketches_project_idx
  on public.agenda_sketches (project_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Pins
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_pins (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  -- PIN-001, PIN-002 — from 0092's counter, so two people dropping a pin at
  -- the same moment do not both get #24.
  number text not null,
  plan_id uuid references public.agenda_plans (id) on delete set null,
  sketch_id uuid references public.agenda_sketches (id) on delete set null,
  source_kind text not null check (source_kind in ('plan', 'image', 'pdf', 'cad')),
  source_path text,
  source_name text check (source_name is null or char_length(source_name) <= 200),
  source_level text check (source_level is null or char_length(source_level) <= 120),
  source_page integer check (source_page is null or source_page >= 1),
  -- Where, in the source's coordinates: millimetres on a plan, pixels on an
  -- image or a rendered page.
  x double precision not null,
  y double precision not null,
  title text not null check (char_length(title) between 1 and 200),
  note text check (note is null or char_length(note) <= 4000),
  measurement text check (measurement is null or char_length(measurement) <= 200),
  status text not null default 'open' check (status in ('open', 'resolved')),
  -- The Agenda task about it, when there is one. The task points back by
  -- this column being looked up, so the link is one row and cannot disagree
  -- with itself.
  task_id uuid references public.agenda_tasks (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_pins_number_unique unique (project_id, number),
  constraint agenda_pins_source check (
    (source_kind = 'plan' and plan_id is not null)
    or (source_kind <> 'plan' and source_path is not null)
  ),
  constraint agenda_pins_source_in_project check (
    source_path is null or source_path like project_id::text || '/%'
  )
);

create index if not exists agenda_pins_project_idx
  on public.agenda_pins (project_id, created_at desc);
create index if not exists agenda_pins_task_idx
  on public.agenda_pins (task_id) where task_id is not null;

-- ---------------------------------------------------------------------------
-- What a row points at is on the same project.
--
-- A member of two projects could otherwise pin project A's drawing to a task
-- on project B, and B's members would be sent to a plan they cannot open.
-- Foreign keys alone cannot say "and the same project"; this does, in one
-- place for all three references.
-- ---------------------------------------------------------------------------

create or replace function public.agenda_plan_refs_same_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plan_id is not null and not exists (
    select 1 from public.agenda_plans p
    where p.id = new.plan_id and p.project_id = new.project_id
  ) then
    raise exception 'That plan is on another project.' using errcode = 'check_violation';
  end if;

  if tg_table_name = 'agenda_pins' then
    if new.sketch_id is not null and not exists (
      select 1 from public.agenda_sketches s
      where s.id = new.sketch_id and s.project_id = new.project_id
    ) then
      raise exception 'That sketch is on another project.' using errcode = 'check_violation';
    end if;
    if new.task_id is not null and not exists (
      select 1 from public.agenda_tasks t
      where t.id = new.task_id and t.project_id = new.project_id
    ) then
      raise exception 'That task is on another project.' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.agenda_plan_refs_same_project() from public, anon, authenticated;

drop trigger if exists agenda_sketches_same_project on public.agenda_sketches;
create trigger agenda_sketches_same_project
  before insert or update on public.agenda_sketches
  for each row execute function public.agenda_plan_refs_same_project();

drop trigger if exists agenda_pins_same_project on public.agenda_pins;
create trigger agenda_pins_same_project
  before insert or update on public.agenda_pins
  for each row execute function public.agenda_plan_refs_same_project();

-- A pin's number is given, not chosen.
create or replace function public.agenda_pin_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.number := public.agenda_next_number(new.project_id, 'pin', 'PIN', 3);
  else
    new.number := old.number;
    new.project_id := old.project_id;
  end if;
  return new;
end;
$$;

revoke all on function public.agenda_pin_number() from public, anon, authenticated;

drop trigger if exists agenda_pins_number on public.agenda_pins;
create trigger agenda_pins_number
  before insert or update on public.agenda_pins
  for each row execute function public.agenda_pin_number();

-- A plan or sketch stays on the project it was made on, and a plan's revision
-- only goes up — by one, from the revision the save was made from.
create or replace function public.agenda_plan_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.project_id <> old.project_id then
    raise exception 'A plan cannot be moved to another project.' using errcode = 'check_violation';
  end if;
  if tg_table_name = 'agenda_plans' and new.revision <> old.revision + 1 then
    raise exception 'This plan was changed by somebody else. Reload it first.'
      using errcode = 'serialization_failure';
  end if;
  return new;
end;
$$;

drop trigger if exists agenda_plans_guard on public.agenda_plans;
create trigger agenda_plans_guard
  before update on public.agenda_plans
  for each row execute function public.agenda_plan_guard();

drop trigger if exists agenda_sketches_guard on public.agenda_sketches;
create trigger agenda_sketches_guard
  before update on public.agenda_sketches
  for each row execute function public.agenda_plan_guard();

-- ---------------------------------------------------------------------------
-- Access: members read, write and update; nobody deletes.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['agenda_plans', 'agenda_sketches', 'agenda_pins'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format($f$
      drop policy if exists "agenda plans: members read" on public.%I;
      create policy "agenda plans: members read" on public.%I
        for select to authenticated
        using (public.agenda_is_member(project_id));
    $f$, t, t);

    execute format($f$
      drop policy if exists "agenda plans: members write" on public.%I;
      create policy "agenda plans: members write" on public.%I
        for insert to authenticated
        with check (public.agenda_is_member(project_id));
    $f$, t, t);

    execute format($f$
      drop policy if exists "agenda plans: members update" on public.%I;
      create policy "agenda plans: members update" on public.%I
        for update to authenticated
        using (public.agenda_is_member(project_id))
        with check (public.agenda_is_member(project_id));
    $f$, t, t);

    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('revoke delete on public.%I from authenticated, anon', t);
    execute format('revoke all on public.%I from anon', t);

    execute format('drop trigger if exists agenda_touch_row on public.%I', t);
    execute format(
      'create trigger agenda_touch_row before update on public.%I '
      || 'for each row execute function public.agenda_touch()', t);
  end loop;
end;
$$;

commit;
