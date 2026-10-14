-- A project's record says who did what, and nobody can make it say somebody
-- else did.
--
-- Agenda is the record people reach for in a dispute (0024's own words), and
-- its tables let any active member insert and update rows. Nothing checked the
-- columns that say *who*. Shown on PostgreSQL 16, as an authenticated member,
-- in supabase/tests/agenda-authorship.sql before this file existed:
--
--   * an approval recorded in the owner's name; an approval by a member the
--     owner had not allowed to approve; somebody else's pending approval
--     decided; a decided approval changed afterwards;
--   * a line of project history written by hand, in the owner's name;
--   * a task, a comment or a drawing revision saying the owner made it, and
--     who made one rewritten later; somebody else's comment rewritten;
--   * the file behind an issued drawing revision swapped for another;
--   * a member the owner made a Studio viewer adding drawings and revisions
--     through the API, behind the Studio's back.
--
-- What changes, for people using the app (sessions as `authenticated`;
-- maintenance — the SQL editor, the service role, migrations — is not a
-- person acting on the record, as in 0106):
--
--   1. "Made by" columns are whoever is signed in, and never change.
--      "Decided by" columns can only ever name yourself. "Updated by" is
--      stamped.
--   2. Approvals: anybody on the project may ask somebody for one; it is
--      decided by that person, or by the owner, and only by somebody allowed
--      to approve (the owner, the client, an administrator, or a member given
--      `can_approve`). A decision is stamped with its time and then stands; a
--      change of mind is a new step.
--   3. History is written by the system only.
--   4. A comment is edited by its writer only.
--   5. A stored file never changes under a record: an issued revision, a
--      document version, a photo, an attachment keep the file they were
--      made with. A new file is a new revision.
--   6. A member the owner made a Studio viewer does not add or change
--      drawings, revisions or approvals.

begin;

create or replace function public.agenda_app_session()
returns boolean
language sql
stable
set search_path = public
as $$ select coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon'); $$;

/** May this person approve on this project. */
create or replace function public.agenda_can_approve(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.agenda_is_owner(target_project) or exists (
    select 1 from public.agenda_members m
    where m.project_id = target_project and m.user_id = auth.uid()
      and m.status = 'active' and m.can_approve
  );
$$;

grant execute on function public.agenda_can_approve(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Who made it, who decided it, who changed it last
-- ---------------------------------------------------------------------------

/**
 * Arguments: the "made by" columns, the "decided by" columns and the
 * "updated by" columns of the table, each comma-separated (possibly empty).
 */
create or replace function public.agenda_stamp_who()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  fresh jsonb := to_jsonb(new);
  before jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  patch jsonb := '{}'::jsonb;
  col text;
begin
  if not public.agenda_app_session() then
    return new;
  end if;

  foreach col in array string_to_array(coalesce(tg_argv[0], ''), ',') loop
    continue when col = '';
    if tg_op = 'INSERT' then
      patch := patch || jsonb_build_object(col, me);
    elsif (fresh -> col) is distinct from (before -> col) then
      raise exception 'Who made a record is not changed afterwards.'
        using errcode = 'insufficient_privilege';
    end if;
  end loop;

  foreach col in array string_to_array(coalesce(tg_argv[1], ''), ',') loop
    continue when col = '';
    if (tg_op = 'INSERT' and fresh ->> col is not null)
       or (tg_op = 'UPDATE' and (fresh -> col) is distinct from (before -> col)) then
      if fresh ->> col is distinct from me::text then
        raise exception 'A record can only name you as the person who decided it.'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  end loop;

  foreach col in array string_to_array(coalesce(tg_argv[2], ''), ',') loop
    continue when col = '';
    patch := patch || jsonb_build_object(col, me);
  end loop;

  if patch <> '{}'::jsonb then
    new := jsonb_populate_record(new, patch);
  end if;
  return new;
end;
$$;

-- Every Agenda table with such columns, found rather than listed, so a table
-- added later with a `created_by` is covered by running this again. Members,
-- history, the audit trail and approvals have rules of their own.
do $$
declare
  t record;
begin
  for t in
    select c.table_name,
      string_agg(c.column_name, ',') filter (where c.column_name in ('created_by', 'uploaded_by', 'author_id', 'recorded_by', 'submitted_by', 'requested_by')) as made,
      string_agg(c.column_name, ',') filter (where c.column_name in ('decided_by', 'approved_by', 'reviewed_by', 'contractor_signed_by')) as decided,
      string_agg(c.column_name, ',') filter (where c.column_name = 'updated_by') as updated
    from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.table_name like 'agenda\_%'
      and c.table_name not in ('agenda_members', 'agenda_events', 'agenda_audit', 'agenda_approvals')
      and c.data_type = 'uuid'
      and c.column_name in ('created_by', 'uploaded_by', 'author_id', 'recorded_by', 'submitted_by', 'requested_by',
                            'decided_by', 'approved_by', 'reviewed_by', 'contractor_signed_by', 'updated_by')
    group by c.table_name
  loop
    execute format('drop trigger if exists agenda_stamp_who on public.%I', t.table_name);
    execute format(
      'create trigger agenda_stamp_who before insert or update on public.%I
         for each row execute function public.agenda_stamp_who(%L, %L, %L)',
      t.table_name, coalesce(t.made, ''), coalesce(t.decided, ''), coalesce(t.updated, ''));
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Approvals
-- ---------------------------------------------------------------------------

create or replace function public.agenda_approval_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if not public.agenda_app_session() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.project_id is distinct from old.project_id or new.subject_type is distinct from old.subject_type
       or new.subject_id is distinct from old.subject_id or new.step is distinct from old.step then
      raise exception 'An approval stays with what it is for.' using errcode = 'check_violation';
    end if;
    if old.decision <> 'pending' then
      raise exception 'A decision stands once made. Ask again as a new step.' using errcode = 'check_violation';
    end if;
  end if;

  if new.decision = 'pending' then
    -- Asking somebody: anybody on the project may; re-addressing a request
    -- that is waiting is the owner's, or the one who was asked.
    if tg_op = 'UPDATE' and new.approver_id is distinct from old.approver_id
       and not public.agenda_is_owner(new.project_id) and old.approver_id is distinct from me then
      raise exception 'Only the owner passes an approval to somebody else.' using errcode = 'insufficient_privilege';
    end if;
    new.decided_at := null;
    return new;
  end if;

  -- Deciding.
  if not public.agenda_can_approve(new.project_id) then
    raise exception 'You are not allowed to approve on this project. Ask the owner.' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and old.approver_id is not null and old.approver_id <> me
     and not public.agenda_is_owner(new.project_id) then
    raise exception 'This approval is waiting on somebody else.' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'INSERT' and new.approver_id is not null and new.approver_id <> me then
    raise exception 'An approval is recorded in the name of whoever gives it.' using errcode = 'insufficient_privilege';
  end if;
  new.approver_id := me;
  new.decided_at := now();
  return new;
end;
$$;

drop trigger if exists agenda_approval_guard on public.agenda_approvals;
create trigger agenda_approval_guard
  before insert or update on public.agenda_approvals
  for each row execute function public.agenda_approval_guard();

-- ---------------------------------------------------------------------------
-- 3. History is the system's
-- ---------------------------------------------------------------------------

-- `agenda_log_event` (security definer) is the one writer; every trigger and
-- function that records something goes through it.
drop policy if exists "agenda events: insert" on public.agenda_events;
revoke insert, update, delete, truncate on public.agenda_events from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. A comment is its writer's
-- ---------------------------------------------------------------------------

create or replace function public.agenda_comment_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.agenda_app_session() and old.author_id is distinct from auth.uid() then
    raise exception 'Only the person who wrote a comment edits it.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['agenda_task_comments', 'agenda_rfi_responses'] loop
    execute format('drop trigger if exists agenda_comment_guard on public.%I', t);
    execute format('create trigger agenda_comment_guard before update on public.%I
                      for each row execute function public.agenda_comment_guard()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. A stored file never changes under its record
-- ---------------------------------------------------------------------------

/** Arguments: the columns that are fixed once the row exists, comma-separated. */
create or replace function public.agenda_fixed_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  col text;
begin
  if not public.agenda_app_session() then
    return new;
  end if;
  foreach col in array string_to_array(tg_argv[0], ',') loop
    if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      raise exception 'The file of an issued record is kept as it was. Add a new revision instead.'
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('agenda_drawing_revisions', 'drawing_id,revision,storage_path,file_name,mime_type,size_bytes'),
      ('agenda_document_versions', 'document_id,version,storage_path,file_name,mime_type,size_bytes'),
      ('agenda_photos', 'storage_path'),
      ('agenda_attachments', 'file_name,mime_type,size_bytes')
    ) as fixed (table_name, columns)
  loop
    execute format('drop trigger if exists agenda_fixed_columns on public.%I', t.table_name);
    execute format('create trigger agenda_fixed_columns before update on public.%I
                      for each row execute function public.agenda_fixed_columns(%L)', t.table_name, t.columns);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. A Studio viewer changes no drawings, revisions or approvals
-- ---------------------------------------------------------------------------

create or replace function public.agenda_studio_viewer_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The Studio's levels live in 0105's table; without it there are no viewers.
  if to_regclass('public.collab_access') is null then
    return new;
  end if;
  if public.agenda_app_session()
     and not public.agenda_is_owner(new.project_id)
     and exists (
       select 1 from public.collab_access a
       where a.project_id = new.project_id and a.user_id = auth.uid() and a.level = 'viewer'
     ) then
    raise exception 'You can view this project''s drawings but not change them. Ask the owner for more access.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['agenda_drawings', 'agenda_drawing_revisions', 'agenda_approvals'] loop
    execute format('drop trigger if exists agenda_studio_viewer_guard on public.%I', t);
    execute format('create trigger agenda_studio_viewer_guard before insert or update on public.%I
                      for each row execute function public.agenda_studio_viewer_guard()', t);
  end loop;
end;
$$;

commit;
