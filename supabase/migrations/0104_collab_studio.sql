-- The Collaborative Studio: boards, a canvas, drawing review and discussion,
-- on the project Agenda already has.
--
-- Nothing here starts a second kind of project. A Studio belongs to an
-- `agenda_projects` row, its people are that project's `agenda_members`, its
-- files are the project's `agenda-files` bucket, a render under review is an
-- `agenda_drawings` row whose revisions are `agenda_drawing_revisions`, a
-- correction turned into work is an `agenda_tasks` row, and an approval is an
-- `agenda_approvals` row. What is new is what none of those can hold:
--
--   collab_access       each member's Studio level — editor, commenter, viewer
--   collab_boards       a visual board or an infinite canvas
--   collab_items        one card or canvas object, with its own revision
--   collab_threads      a discussion: on a drawing revision at a point, on a
--                       board item, or the project's general discussion
--   collab_comments     the messages in a thread
--   collab_annotations  markup drawn on a drawing revision
--   collab_reads        how far each person has read each thread
--
-- ## Levels
--
-- `collab_level(project)` is the one answer every policy asks for:
--
--   owner      `agenda_is_owner` — the project's owner, client or
--              administrator. Sets everybody else's level.
--   editor     changes boards, the canvas and annotations; assigns work.
--   commenter  sees everything and gives feedback: threads, comments,
--              markup, resolving and approving.
--   viewer     sees, and nothing else.
--
-- An active member with no `collab_access` row is a commenter: being on the
-- project means you may be asked for an opinion, and edit access is given on
-- purpose. Somebody who is not an active member is nothing — removing or
-- suspending them in Agenda's team takes the Studio away in the same move.
--
-- ## Coordinates
--
-- Board and canvas objects are in world units, independent of zoom and pan.
-- A pin or a mark on a drawing is normalised to the image: x and y from 0 to
-- 1 across and down the page, so it stays on the same spot at any display
-- size. A PDF names its page.
--
-- ## Concurrency
--
-- Each item, thread and annotation carries a revision. An update must be made
-- from the revision it read — the new value is exactly one more — or it is
-- refused with `serialization_failure`, and the client reloads that one object
-- rather than overwriting somebody else's change.
--
-- ## The rules from 0024 continue to apply
--
-- Nothing is deleted: boards, items, comments and annotations are archived,
-- there is no DELETE policy, and the privilege is revoked.

begin;

-- ---------------------------------------------------------------------------
-- Notifications and activity this file writes
-- ---------------------------------------------------------------------------

alter type public.notification_kind add value if not exists 'collab_comment';
alter type public.notification_kind add value if not exists 'collab_mention';
alter type public.notification_kind add value if not exists 'collab_assigned';
alter type public.notification_kind add value if not exists 'collab_review';
alter type public.agenda_event_kind add value if not exists 'collab';

-- ---------------------------------------------------------------------------
-- Levels
-- ---------------------------------------------------------------------------

create type public.collab_access_level as enum ('owner', 'editor', 'commenter', 'viewer');

create table if not exists public.collab_access (
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Owner is not granted: it is whoever `agenda_is_owner` says it is.
  level public.collab_access_level not null check (level <> 'owner'),
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create or replace function public.collab_level(target_project uuid)
returns public.collab_access_level
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null
    when public.agenda_is_owner(target_project) then 'owner'::public.collab_access_level
    when not public.agenda_is_member(target_project) then null
    else coalesce(
      (select a.level from public.collab_access a
       where a.project_id = target_project and a.user_id = auth.uid()),
      'commenter'::public.collab_access_level)
  end;
$$;

create or replace function public.collab_can_view(target_project uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.collab_level(target_project) is not null; $$;

create or replace function public.collab_can_comment(target_project uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.collab_level(target_project) in ('owner', 'editor', 'commenter'); $$;

create or replace function public.collab_can_edit(target_project uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.collab_level(target_project) in ('owner', 'editor'); $$;

-- A level is given to somebody on the project, by its owner.
create or replace function public.collab_access_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (new.project_id <> old.project_id or new.user_id <> old.user_id) then
    raise exception 'A Studio level stays with the member it was given to.' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.agenda_members m
    where m.project_id = new.project_id and m.user_id = new.user_id
      and m.status in ('invited', 'active')
  ) then
    raise exception 'That person is not on this project.' using errcode = 'check_violation';
  end if;
  new.granted_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists collab_access_guard on public.collab_access;
create trigger collab_access_guard
  before insert or update on public.collab_access
  for each row execute function public.collab_access_guard();

-- ---------------------------------------------------------------------------
-- Boards and canvases
-- ---------------------------------------------------------------------------

create table if not exists public.collab_boards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  kind text not null check (kind in ('board', 'canvas')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  -- A board is laid out freely or in columns; a canvas is always free.
  layout text not null default 'free' check (layout in ('free', 'columns')),
  -- Grid and snap, view preferences that travel with the board.
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  sort_order double precision not null default 0,
  revision integer not null default 1 check (revision >= 1),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collab_boards_project_idx
  on public.collab_boards (project_id, kind, sort_order) where archived_at is null;

create table if not exists public.collab_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.collab_boards (id) on delete cascade,
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  kind text not null check (kind in (
    -- a board's cards and its structure
    'text', 'note', 'image', 'document', 'link', 'checklist', 'column', 'section',
    -- a canvas's objects
    'sticky', 'rect', 'ellipse', 'line', 'arrow', 'freehand', 'connector', 'group'
  )),
  -- The column, section or group it is in.
  parent_id uuid references public.collab_items (id) on delete set null,
  -- World units: the same at every zoom and on every screen.
  x double precision not null default 0,
  y double precision not null default 0,
  w double precision not null default 0,
  h double precision not null default 0,
  rotation double precision not null default 0,
  -- Stacking and column order; fractional, so moving one object rewrites one row.
  z double precision not null default 0,
  -- What the object says and looks like, by kind.
  data jsonb not null default '{}'::jsonb,
  -- A file it shows: a drawing in the project's register, or a file in the
  -- project's folder. Never a copy.
  drawing_id uuid references public.agenda_drawings (id) on delete set null,
  storage_path text,
  revision integer not null default 1 check (revision >= 1),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collab_items_data_object check (jsonb_typeof(data) = 'object'),
  -- Big enough for a long freehand stroke, small enough that one object
  -- cannot fill the database.
  constraint collab_items_data_size check (pg_column_size(data) <= 262144),
  constraint collab_items_finite check (
    abs(x) <= 1e7 and abs(y) <= 1e7 and w >= 0 and h >= 0 and w <= 1e6 and h <= 1e6
    and abs(rotation) <= 3600 and abs(z) <= 1e12
  ),
  constraint collab_items_path_in_project check (
    storage_path is null or storage_path like project_id::text || '/%'
  )
);

create index if not exists collab_items_board_idx
  on public.collab_items (board_id, z) where archived_at is null;
create index if not exists collab_items_drawing_idx
  on public.collab_items (drawing_id) where drawing_id is not null;

-- ---------------------------------------------------------------------------
-- Threads, comments, annotations, reads
-- ---------------------------------------------------------------------------

create table if not exists public.collab_threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  -- C-001, C-002 — from 0092's counter, so two people at once do not both get #7.
  number text not null,
  anchor_kind text not null check (anchor_kind in ('drawing', 'item', 'project')),
  drawing_id uuid references public.agenda_drawings (id) on delete set null,
  revision_id uuid references public.agenda_drawing_revisions (id) on delete set null,
  page integer check (page is null or page >= 1),
  -- Normalised to the drawing: 0 to 1 across and down.
  x double precision check (x is null or (x >= 0 and x <= 1)),
  y double precision check (y is null or (y >= 0 and y <= 1)),
  item_id uuid references public.collab_items (id) on delete set null,
  title text check (title is null or char_length(title) <= 200),
  status text not null default 'open' check (status in (
    'open', 'ready_for_review', 'resolved', 'approved', 'changes_requested'
  )),
  assigned_to uuid references public.profiles (id) on delete set null,
  task_id uuid references public.agenda_tasks (id) on delete set null,
  revision integer not null default 1 check (revision >= 1),
  created_by uuid references public.profiles (id) on delete set null,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  last_activity_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collab_threads_number_unique unique (project_id, number),
  constraint collab_threads_anchor check (
    (anchor_kind = 'drawing' and drawing_id is not null and revision_id is not null
       and x is not null and y is not null)
    or (anchor_kind = 'item' and item_id is not null)
    or (anchor_kind = 'project')
  )
);

create index if not exists collab_threads_project_idx
  on public.collab_threads (project_id, last_activity_at desc) where archived_at is null;
create index if not exists collab_threads_revision_idx
  on public.collab_threads (revision_id) where revision_id is not null;
create index if not exists collab_threads_assignee_idx
  on public.collab_threads (assigned_to) where assigned_to is not null;

create table if not exists public.collab_comments (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.collab_threads (id) on delete cascade,
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  -- People named with @, who are notified. Only members of the project count.
  mentions uuid[] not null default '{}',
  edited_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists collab_comments_thread_idx
  on public.collab_comments (thread_id, created_at);

create table if not exists public.collab_annotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  drawing_id uuid not null references public.agenda_drawings (id) on delete cascade,
  revision_id uuid not null references public.agenda_drawing_revisions (id) on delete cascade,
  page integer check (page is null or page >= 1),
  thread_id uuid references public.collab_threads (id) on delete set null,
  kind text not null check (kind in ('freehand', 'arrow', 'line', 'rect', 'ellipse', 'text')),
  -- Normalised points, 0 to 1, and the kind's own fields.
  geometry jsonb not null check (jsonb_typeof(geometry) = 'object'),
  style jsonb not null default '{}'::jsonb check (jsonb_typeof(style) = 'object'),
  revision integer not null default 1 check (revision >= 1),
  created_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collab_annotations_size check (pg_column_size(geometry) <= 131072)
);

create index if not exists collab_annotations_revision_idx
  on public.collab_annotations (revision_id, page) where archived_at is null;

create table if not exists public.collab_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  thread_id uuid not null references public.collab_threads (id) on delete cascade,
  project_id uuid not null references public.agenda_projects (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);

-- ---------------------------------------------------------------------------
-- Guards: everything a row points at is on its project; what may change, by whom
-- ---------------------------------------------------------------------------

create or replace function public.collab_same_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_json jsonb := to_jsonb(new);
begin
  if row_json ? 'board_id' and (row_json ->> 'board_id') is not null and not exists (
    select 1 from public.collab_boards b
    where b.id = (row_json ->> 'board_id')::uuid and b.project_id = new.project_id
  ) then
    raise exception 'That board is on another project.' using errcode = 'check_violation';
  end if;
  if row_json ? 'drawing_id' and (row_json ->> 'drawing_id') is not null and not exists (
    select 1 from public.agenda_drawings d
    where d.id = (row_json ->> 'drawing_id')::uuid and d.project_id = new.project_id
  ) then
    raise exception 'That drawing is on another project.' using errcode = 'check_violation';
  end if;
  if row_json ? 'revision_id' and (row_json ->> 'revision_id') is not null and not exists (
    select 1 from public.agenda_drawing_revisions r
    where r.id = (row_json ->> 'revision_id')::uuid
      and r.project_id = new.project_id
      and r.drawing_id = (row_json ->> 'drawing_id')::uuid
  ) then
    raise exception 'That revision is not of this drawing.' using errcode = 'check_violation';
  end if;
  if row_json ? 'item_id' and (row_json ->> 'item_id') is not null and not exists (
    select 1 from public.collab_items i
    where i.id = (row_json ->> 'item_id')::uuid and i.project_id = new.project_id
  ) then
    raise exception 'That item is on another project.' using errcode = 'check_violation';
  end if;
  if row_json ? 'parent_id' and (row_json ->> 'parent_id') is not null and not exists (
    select 1 from public.collab_items i
    where i.id = (row_json ->> 'parent_id')::uuid and i.board_id = (row_json ->> 'board_id')::uuid
  ) then
    raise exception 'That column or group is on another board.' using errcode = 'check_violation';
  end if;
  if row_json ? 'thread_id' and (row_json ->> 'thread_id') is not null and not exists (
    select 1 from public.collab_threads t
    where t.id = (row_json ->> 'thread_id')::uuid and t.project_id = new.project_id
  ) then
    raise exception 'That thread is on another project.' using errcode = 'check_violation';
  end if;
  if row_json ? 'task_id' and (row_json ->> 'task_id') is not null and not exists (
    select 1 from public.agenda_tasks t
    where t.id = (row_json ->> 'task_id')::uuid and t.project_id = new.project_id
  ) then
    raise exception 'That task is on another project.' using errcode = 'check_violation';
  end if;
  if row_json ? 'assigned_to' and (row_json ->> 'assigned_to') is not null and not exists (
    select 1 from public.agenda_members m
    where m.project_id = new.project_id and m.user_id = (row_json ->> 'assigned_to')::uuid
      and m.status = 'active'
  ) and not exists (
    select 1 from public.agenda_projects p
    where p.id = new.project_id and p.owner_id = (row_json ->> 'assigned_to')::uuid
  ) then
    raise exception 'Work can only be assigned to somebody on the project.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.collab_same_project() from public, anon, authenticated;

-- Moves and edits: the project and the board never change; a revision goes
-- up by exactly one, from the revision the edit was made from.
create or replace function public.collab_revision_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.project_id <> old.project_id then
    raise exception 'It cannot be moved to another project.' using errcode = 'check_violation';
  end if;
  if tg_table_name = 'collab_items'
     and (to_jsonb(new) ->> 'board_id') is distinct from (to_jsonb(old) ->> 'board_id') then
    raise exception 'An item stays on its board; duplicate it onto another.' using errcode = 'check_violation';
  end if;
  -- Bookkeeping alone — a reply moving a thread's last activity — is not an
  -- edit, and does not make everybody's copy of the thread out of date.
  if (to_jsonb(new) - 'last_activity_at' - 'updated_at')
     = (to_jsonb(old) - 'last_activity_at' - 'updated_at') then
    return new;
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'Somebody else changed this a moment ago. It has been reloaded.'
      using errcode = 'serialization_failure';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Who stamps a row is the database's business, not the client's.
create or replace function public.collab_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_json jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    if row_json ? 'created_by' then new := jsonb_populate_record(new, jsonb_build_object('created_by', auth.uid())); end if;
    if row_json ? 'author_id' then new := jsonb_populate_record(new, jsonb_build_object('author_id', auth.uid())); end if;
  end if;
  if row_json ? 'updated_by' then new := jsonb_populate_record(new, jsonb_build_object('updated_by', auth.uid())); end if;
  return new;
end;
$$;

revoke all on function public.collab_stamp() from public, anon, authenticated;

-- A board holds at most 5000 live objects: room for any real project,
-- and a ceiling on what one script can pour into it.
create or replace function public.collab_item_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.collab_items i
      where i.board_id = new.board_id and i.archived_at is null) >= 5000 then
    raise exception 'This board is full (5000 objects). Start another one.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.collab_item_limit() from public, anon, authenticated;

-- A thread: its number is given; its anchor is fixed; a commenter may move
-- it between open, resolved, approved and changes requested, and only an
-- editor assigns it, links a task, or marks it ready for review.
create or replace function public.collab_thread_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  level public.collab_access_level := public.collab_level(new.project_id);
begin
  if tg_op = 'INSERT' then
    new.number := public.agenda_next_number(new.project_id, 'collab_thread', 'C', 3);
    new.status := 'open';
    new.resolved_by := null;
    new.resolved_at := null;
    if level not in ('owner', 'editor') then
      new.assigned_to := null;
      new.task_id := null;
    end if;
    return new;
  end if;

  new.number := old.number;
  if new.anchor_kind <> old.anchor_kind
     or new.drawing_id is distinct from old.drawing_id
     or new.revision_id is distinct from old.revision_id
     or new.item_id is distinct from old.item_id then
    raise exception 'A comment stays where it was placed.' using errcode = 'check_violation';
  end if;
  if level not in ('owner', 'editor') then
    if new.assigned_to is distinct from old.assigned_to or new.task_id is distinct from old.task_id then
      raise exception 'Only an editor assigns work.' using errcode = 'insufficient_privilege';
    end if;
    if new.status = 'ready_for_review' and old.status <> 'ready_for_review' then
      raise exception 'Only an editor marks a correction ready for review.' using errcode = 'insufficient_privilege';
    end if;
    if (new.x, new.y, new.page) is distinct from (old.x, old.y, old.page)
       and old.created_by is distinct from auth.uid() then
      raise exception 'Only the person who placed a pin, or an editor, moves it.' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if new.status in ('resolved', 'approved') and old.status not in ('resolved', 'approved') then
    new.resolved_by := auth.uid();
    new.resolved_at := now();
  elsif new.status not in ('resolved', 'approved') then
    new.resolved_by := null;
    new.resolved_at := null;
  end if;
  if new.status is distinct from old.status or new.assigned_to is distinct from old.assigned_to then
    new.last_activity_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.collab_thread_guard() from public, anon, authenticated;

-- A comment is the author's: theirs to edit or withdraw, nobody else's.
create or replace function public.collab_comment_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.edited_at := null;
    return new;
  end if;
  if new.thread_id <> old.thread_id or new.project_id <> old.project_id
     or new.author_id <> old.author_id or new.created_at <> old.created_at then
    raise exception 'A comment stays in its thread, by its author.' using errcode = 'check_violation';
  end if;
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications and activity
-- ---------------------------------------------------------------------------

create or replace function public.collab_after_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  thread public.collab_threads;
  href text;
  author_name text;
  excerpt text := left(new.body, 140);
begin
  select * into thread from public.collab_threads where id = new.thread_id;
  update public.collab_threads set last_activity_at = now() where id = new.thread_id;
  href := '/agenda/projects/' || new.project_id || '/collaborate?thread=' || new.thread_id;
  select coalesce(p.full_name, p.company_name, p.username, 'Someone') into author_name
    from public.profiles p where p.id = new.author_id;

  -- Named with @: members of the project only, never the author.
  insert into public.notifications (user_id, actor_id, kind, title, body, href)
  select distinct m.user_id, new.author_id, 'collab_mention'::public.notification_kind,
         author_name || ' mentioned you in ' || thread.number, excerpt, href
  from public.agenda_members m
  where m.project_id = new.project_id and m.status = 'active'
    and m.user_id = any (new.mentions) and m.user_id <> new.author_id;

  -- Everybody else already in the conversation, and whoever it is assigned to.
  insert into public.notifications (user_id, actor_id, kind, title, body, href)
  select distinct who, new.author_id, 'collab_comment'::public.notification_kind,
         author_name || ' replied in ' || thread.number, excerpt, href
  from (
    select c.author_id as who from public.collab_comments c
      where c.thread_id = new.thread_id and c.id <> new.id
    union select thread.created_by
    union select thread.assigned_to
  ) people
  where who is not null and who <> new.author_id and not (who = any (new.mentions))
    and exists (
      select 1 from public.agenda_members m
      where m.project_id = new.project_id and m.user_id = who and m.status = 'active'
    );

  -- The author has read what they wrote.
  insert into public.collab_reads (user_id, thread_id, project_id, read_at)
  values (new.author_id, new.thread_id, new.project_id, now())
  on conflict (user_id, thread_id) do update set read_at = excluded.read_at;
  return new;
end;
$$;

revoke all on function public.collab_after_comment() from public, anon, authenticated;

create or replace function public.collab_after_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  href text := '/agenda/projects/' || new.project_id || '/collaborate?thread=' || new.id;
begin
  if tg_op = 'INSERT' then
    perform public.agenda_log_event(new.project_id, 'collab', 'Comment ' || new.number || ' opened',
      new.title, 'collab_threads', new.id);
  end if;
  if new.assigned_to is not null and new.assigned_to is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    insert into public.notifications (user_id, actor_id, kind, title, body, href)
    values (new.assigned_to, auth.uid(), 'collab_assigned',
            new.number || ' was assigned to you', new.title, href);
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.agenda_log_event(new.project_id, 'collab',
      'Comment ' || new.number || ' ' || replace(new.status, '_', ' '),
      new.title, 'collab_threads', new.id);
    -- A correction ready for review goes back to whoever asked for it.
    if new.status = 'ready_for_review' and new.created_by is not null
       and new.created_by is distinct from auth.uid() then
      insert into public.notifications (user_id, actor_id, kind, title, body, href)
      values (new.created_by, auth.uid(), 'collab_review',
              new.number || ' is ready for your review', new.title, href);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.collab_after_thread() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['collab_boards', 'collab_items', 'collab_threads', 'collab_comments', 'collab_annotations', 'collab_reads'] loop
    execute format('drop trigger if exists collab_same_project on public.%I', t);
    execute format('create trigger collab_same_project before insert or update on public.%I '
                   || 'for each row execute function public.collab_same_project()', t);
  end loop;
  foreach t in array array['collab_boards', 'collab_items', 'collab_threads', 'collab_annotations'] loop
    execute format('drop trigger if exists collab_revision_guard on public.%I', t);
    execute format('create trigger collab_revision_guard before update on public.%I '
                   || 'for each row execute function public.collab_revision_guard()', t);
  end loop;
  foreach t in array array['collab_boards', 'collab_items', 'collab_threads', 'collab_comments', 'collab_annotations'] loop
    execute format('drop trigger if exists collab_stamp on public.%I', t);
    execute format('create trigger collab_stamp before insert or update on public.%I '
                   || 'for each row execute function public.collab_stamp()', t);
  end loop;
end
$$;

drop trigger if exists collab_item_limit on public.collab_items;
create trigger collab_item_limit before insert on public.collab_items
  for each row execute function public.collab_item_limit();

drop trigger if exists collab_thread_guard on public.collab_threads;
create trigger collab_thread_guard before insert or update on public.collab_threads
  for each row execute function public.collab_thread_guard();

drop trigger if exists collab_comment_guard on public.collab_comments;
create trigger collab_comment_guard before insert or update on public.collab_comments
  for each row execute function public.collab_comment_guard();

drop trigger if exists collab_after_comment on public.collab_comments;
create trigger collab_after_comment after insert on public.collab_comments
  for each row execute function public.collab_after_comment();

drop trigger if exists collab_after_thread on public.collab_threads;
create trigger collab_after_thread after insert or update on public.collab_threads
  for each row execute function public.collab_after_thread();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.collab_access enable row level security;
alter table public.collab_boards enable row level security;
alter table public.collab_items enable row level security;
alter table public.collab_threads enable row level security;
alter table public.collab_comments enable row level security;
alter table public.collab_annotations enable row level security;
alter table public.collab_reads enable row level security;

-- Levels: everybody on the project sees them; the owner sets them.
create policy "collab access: members read" on public.collab_access
  for select to authenticated using (public.collab_can_view(project_id));
create policy "collab access: owner grants" on public.collab_access
  for insert to authenticated with check (public.collab_level(project_id) = 'owner');
create policy "collab access: owner changes" on public.collab_access
  for update to authenticated
  using (public.collab_level(project_id) = 'owner')
  with check (public.collab_level(project_id) = 'owner');

-- Boards and items: seen by all, changed by editors.
create policy "collab boards: read" on public.collab_boards
  for select to authenticated using (public.collab_can_view(project_id));
create policy "collab boards: editors create" on public.collab_boards
  for insert to authenticated with check (public.collab_can_edit(project_id));
create policy "collab boards: editors change" on public.collab_boards
  for update to authenticated
  using (public.collab_can_edit(project_id)) with check (public.collab_can_edit(project_id));

create policy "collab items: read" on public.collab_items
  for select to authenticated using (public.collab_can_view(project_id));
create policy "collab items: editors create" on public.collab_items
  for insert to authenticated with check (public.collab_can_edit(project_id));
create policy "collab items: editors change" on public.collab_items
  for update to authenticated
  using (public.collab_can_edit(project_id)) with check (public.collab_can_edit(project_id));

-- Threads and markup: seen by all, given by commenters and up (the guard
-- says which of a thread's fields a commenter may change).
create policy "collab threads: read" on public.collab_threads
  for select to authenticated using (public.collab_can_view(project_id));
create policy "collab threads: commenters open" on public.collab_threads
  for insert to authenticated with check (public.collab_can_comment(project_id));
create policy "collab threads: commenters change" on public.collab_threads
  for update to authenticated
  using (public.collab_can_comment(project_id)) with check (public.collab_can_comment(project_id));

create policy "collab comments: read" on public.collab_comments
  for select to authenticated using (public.collab_can_view(project_id));
create policy "collab comments: commenters write" on public.collab_comments
  for insert to authenticated
  with check (public.collab_can_comment(project_id) and author_id = auth.uid());
create policy "collab comments: authors edit" on public.collab_comments
  for update to authenticated
  using (author_id = auth.uid() and public.collab_can_comment(project_id))
  with check (author_id = auth.uid() and public.collab_can_comment(project_id));

create policy "collab annotations: read" on public.collab_annotations
  for select to authenticated using (public.collab_can_view(project_id));
create policy "collab annotations: commenters draw" on public.collab_annotations
  for insert to authenticated with check (public.collab_can_comment(project_id));
create policy "collab annotations: author or editor changes" on public.collab_annotations
  for update to authenticated
  using (public.collab_can_comment(project_id) and (created_by = auth.uid() or public.collab_can_edit(project_id)))
  with check (public.collab_can_comment(project_id));

-- Reads: your own, on projects you can see.
create policy "collab reads: own" on public.collab_reads
  for select to authenticated using (user_id = auth.uid());
create policy "collab reads: own write" on public.collab_reads
  for insert to authenticated with check (user_id = auth.uid() and public.collab_can_view(project_id));
create policy "collab reads: own update" on public.collab_reads
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.collab_can_view(project_id));

-- ---------------------------------------------------------------------------
-- Privileges: no deletes, nothing for signed-out visitors
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['collab_access', 'collab_boards', 'collab_items', 'collab_threads', 'collab_comments', 'collab_annotations', 'collab_reads'] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate on public.%I from authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end
$$;

do $$
declare fn text;
begin
  foreach fn in array array['collab_level(uuid)', 'collab_can_view(uuid)', 'collab_can_comment(uuid)', 'collab_can_edit(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Realtime: collaborators see each other's changes as they are made.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['collab_boards', 'collab_items', 'collab_threads', 'collab_comments', 'collab_annotations'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$$;

commit;
