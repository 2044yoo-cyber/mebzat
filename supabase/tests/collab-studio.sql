-- The Collaborative Studio (0104): levels, boards, items, threads, comments,
-- annotations, reads — who may do what, and what can never happen.
--
-- Every access question is asked as `authenticated` with a jwt subject: a
-- superuser bypasses row-level security. Six people:
--
--   owner      started the project                         → owner
--   editor     a member given the editor level              → editor
--   client     a member with no level set                   → commenter
--   viewer     a member given the viewer level              → viewer
--   outsider   owns a project of their own, not this one    → nothing
--   leaver     was a member, removed                        → nothing

begin;

insert into auth.users (id, email) values
  ('c5000000-0000-4000-8000-000000000001', 'studio-owner@example.test'),
  ('c5000000-0000-4000-8000-000000000002', 'studio-editor@example.test'),
  ('c5000000-0000-4000-8000-000000000003', 'studio-client@example.test'),
  ('c5000000-0000-4000-8000-000000000004', 'studio-viewer@example.test'),
  ('c5000000-0000-4000-8000-000000000005', 'studio-outsider@example.test'),
  ('c5000000-0000-4000-8000-000000000006', 'studio-leaver@example.test'),
  ('c5000000-0000-4000-8000-000000000007', 'studio-second@example.test')
on conflict (id) do nothing;

set role authenticated;
set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000001';
insert into public.agenda_projects (id, owner_id, name)
values ('c5000000-0000-4000-8000-00000000000a', 'c5000000-0000-4000-8000-000000000001', 'Kitchen renovation');
insert into public.agenda_drawings (id, project_id, drawing_number, title)
values ('c5000000-0000-4000-8000-0000000000d1', 'c5000000-0000-4000-8000-00000000000a', 'R-01', 'Kitchen render');
insert into public.agenda_drawing_revisions (id, drawing_id, project_id, revision, storage_path)
values ('c5000000-0000-4000-8000-0000000000e1', 'c5000000-0000-4000-8000-0000000000d1',
        'c5000000-0000-4000-8000-00000000000a', 'A', 'c5000000-0000-4000-8000-00000000000a/studio/render-a.jpg');
insert into public.agenda_drawings (id, project_id, drawing_number, title)
values ('c5000000-0000-4000-8000-0000000000d2', 'c5000000-0000-4000-8000-00000000000a', 'R-02', 'Bathroom render');
insert into public.agenda_drawing_revisions (id, drawing_id, project_id, revision, storage_path)
values ('c5000000-0000-4000-8000-0000000000e2', 'c5000000-0000-4000-8000-0000000000d2',
        'c5000000-0000-4000-8000-00000000000a', 'A', 'c5000000-0000-4000-8000-00000000000a/studio/bath-a.jpg');
insert into public.agenda_tasks (id, project_id, title, created_by)
values ('c5000000-0000-4000-8000-0000000000f1', 'c5000000-0000-4000-8000-00000000000a',
        'Change cabinet finish', 'c5000000-0000-4000-8000-000000000001');

set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000005';
insert into public.agenda_projects (id, owner_id, name)
values ('c5000000-0000-4000-8000-00000000000b', 'c5000000-0000-4000-8000-000000000005', 'Someone else''s');
insert into public.agenda_drawings (id, project_id, drawing_number, title)
values ('c5000000-0000-4000-8000-0000000000d9', 'c5000000-0000-4000-8000-00000000000b', 'X-01', 'Theirs');
insert into public.agenda_drawing_revisions (id, drawing_id, project_id, revision, storage_path)
values ('c5000000-0000-4000-8000-0000000000e9', 'c5000000-0000-4000-8000-0000000000d9',
        'c5000000-0000-4000-8000-00000000000b', 'A', 'c5000000-0000-4000-8000-00000000000b/x.jpg');
insert into public.agenda_tasks (id, project_id, title, created_by)
values ('c5000000-0000-4000-8000-0000000000f9', 'c5000000-0000-4000-8000-00000000000b',
        'Their task', 'c5000000-0000-4000-8000-000000000005');
insert into public.collab_boards (id, project_id, kind, title)
values ('c5000000-0000-4000-8000-0000000000b9', 'c5000000-0000-4000-8000-00000000000b', 'board', 'Their board');

reset role;
insert into public.agenda_members (project_id, user_id, role, status, accepted_at) values
  ('c5000000-0000-4000-8000-00000000000a', 'c5000000-0000-4000-8000-000000000002', 'interior_designer', 'active', now()),
  ('c5000000-0000-4000-8000-00000000000a', 'c5000000-0000-4000-8000-000000000003', 'engineer', 'active', now()),
  ('c5000000-0000-4000-8000-00000000000a', 'c5000000-0000-4000-8000-000000000004', 'supplier', 'active', now()),
  ('c5000000-0000-4000-8000-00000000000a', 'c5000000-0000-4000-8000-000000000006', 'employee', 'active', now()),
  ('c5000000-0000-4000-8000-00000000000a', 'c5000000-0000-4000-8000-000000000007', 'contractor', 'active', now());

-- ===================================================================
-- 1. Levels: the owner grants them, to members only, and they mean something.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000001';
do $$
begin
  if public.collab_level('c5000000-0000-4000-8000-00000000000a') <> 'owner' then
    raise exception 'FAIL 1a: the project owner is not the Studio owner';
  end if;
  insert into public.collab_access (project_id, user_id, level) values
    ('c5000000-0000-4000-8000-00000000000a', 'c5000000-0000-4000-8000-000000000002', 'editor'),
    ('c5000000-0000-4000-8000-00000000000a', 'c5000000-0000-4000-8000-000000000004', 'viewer'),
    ('c5000000-0000-4000-8000-00000000000a', 'c5000000-0000-4000-8000-000000000006', 'editor');
  raise notice 'ok 1a: the owner gives members their levels';
  begin
    insert into public.collab_access (project_id, user_id, level)
    values ('c5000000-0000-4000-8000-00000000000a', 'c5000000-0000-4000-8000-000000000005', 'editor');
    raise exception 'FAIL 1b: a level was given to somebody not on the project';
  exception when check_violation then raise notice 'ok 1b: a level is only for somebody on the project';
  end;
  begin
    insert into public.collab_access (project_id, user_id, level)
    values ('c5000000-0000-4000-8000-00000000000a', 'c5000000-0000-4000-8000-000000000003', 'owner');
    raise exception 'FAIL 1c: owner was granted as a level';
  exception when check_violation then raise notice 'ok 1c: owner cannot be granted';
  end;
end;
$$;

set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000003';
do $$
begin
  if public.collab_level('c5000000-0000-4000-8000-00000000000a') <> 'commenter' then
    raise exception 'FAIL 1d: a member with no level is not a commenter';
  end if;
  raise notice 'ok 1d: a member with no level set is a commenter';
  begin
    insert into public.collab_access (project_id, user_id, level)
    values ('c5000000-0000-4000-8000-00000000000a', 'c5000000-0000-4000-8000-000000000003', 'editor');
    raise exception 'FAIL 1e: a commenter made themselves an editor';
  exception when insufficient_privilege then raise notice 'ok 1e: nobody but the owner gives levels';
  end;
end;
$$;

do $$
declare n integer;
begin
  update public.collab_access set level = 'editor'
  where project_id = 'c5000000-0000-4000-8000-00000000000a' and user_id = 'c5000000-0000-4000-8000-000000000004';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 1f: a commenter raised the viewer to editor'; end if;
  raise notice 'ok 1f: nor change them';
end;
$$;

set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000005';
do $$
begin
  if public.collab_level('c5000000-0000-4000-8000-00000000000a') is not null then
    raise exception 'FAIL 1g: an outsider has a level on somebody else''s project';
  end if;
  raise notice 'ok 1g: an outsider has no level';
end;
$$;

-- ===================================================================
-- 2. Boards and items: editors make them, everyone on the project sees them.
-- ===================================================================
set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000002';
do $$
declare stamped uuid;
begin
  insert into public.collab_boards (id, project_id, kind, title, created_by)
  values ('c5000000-0000-4000-8000-0000000000b1', 'c5000000-0000-4000-8000-00000000000a', 'board', 'Concept',
          'c5000000-0000-4000-8000-000000000005');
  select created_by into stamped from public.collab_boards where id = 'c5000000-0000-4000-8000-0000000000b1';
  if stamped <> 'c5000000-0000-4000-8000-000000000002' then
    raise exception 'FAIL 2a: created_by is whatever the client said (%)', stamped;
  end if;
  insert into public.collab_boards (id, project_id, kind, title)
  values ('c5000000-0000-4000-8000-0000000000b2', 'c5000000-0000-4000-8000-00000000000a', 'canvas', 'Workshop');
  insert into public.collab_items (id, board_id, project_id, kind, x, y, w, h, data)
  values ('c5000000-0000-4000-8000-0000000000a1', 'c5000000-0000-4000-8000-0000000000b1',
          'c5000000-0000-4000-8000-00000000000a', 'column', 0, 0, 280, 0, '{"title": "Materials"}'),
         ('c5000000-0000-4000-8000-0000000000a2', 'c5000000-0000-4000-8000-0000000000b2',
          'c5000000-0000-4000-8000-00000000000a', 'sticky', 120.5, -80.25, 200, 160, '{"text": "Walnut?"}');
  insert into public.collab_items (id, board_id, project_id, kind, parent_id, drawing_id, data)
  values ('c5000000-0000-4000-8000-0000000000a3', 'c5000000-0000-4000-8000-0000000000b1',
          'c5000000-0000-4000-8000-00000000000a', 'image', 'c5000000-0000-4000-8000-0000000000a1',
          'c5000000-0000-4000-8000-0000000000d1', '{}');
  raise notice 'ok 2a: an editor makes boards, a canvas, columns, cards and objects, stamped as theirs';
end;
$$;

set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000004';
do $$
declare n integer;
begin
  select count(*) into n from public.collab_items where project_id = 'c5000000-0000-4000-8000-00000000000a';
  if n <> 3 then raise exception 'FAIL 2b: the viewer sees % items, not 3', n; end if;
  raise notice 'ok 2b: a viewer sees the boards';
  begin
    insert into public.collab_items (board_id, project_id, kind)
    values ('c5000000-0000-4000-8000-0000000000b2', 'c5000000-0000-4000-8000-00000000000a', 'sticky');
    raise exception 'FAIL 2c: a viewer added to the canvas';
  exception when insufficient_privilege then raise notice 'ok 2c: a viewer cannot change them';
  end;
end;
$$;

set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000003';
do $$
declare n integer;
begin
  begin
    insert into public.collab_boards (project_id, kind, title)
    values ('c5000000-0000-4000-8000-00000000000a', 'board', 'Mine');
    raise exception 'FAIL 2d: a commenter created a board';
  exception when insufficient_privilege then raise notice 'ok 2d: nor can a commenter';
  end;
  update public.collab_items set x = 9999, revision = revision + 1 where id = 'c5000000-0000-4000-8000-0000000000a2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 2e: a commenter moved a canvas object'; end if;
  raise notice 'ok 2e: a commenter cannot move an object';
end;
$$;

set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000005';
do $$
declare n integer;
begin
  select count(*) into n from public.collab_boards where project_id = 'c5000000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'FAIL 2f: an outsider sees % boards', n; end if;
  select count(*) into n from public.collab_items where id = 'c5000000-0000-4000-8000-0000000000a2';
  if n <> 0 then raise exception 'FAIL 2f: an outsider reads an item by its id'; end if;
  raise notice 'ok 2f: an outsider sees nothing, even by id';
  begin
    insert into public.collab_items (board_id, project_id, kind)
    values ('c5000000-0000-4000-8000-0000000000b1', 'c5000000-0000-4000-8000-00000000000a', 'sticky');
    raise exception 'FAIL 2g: an outsider wrote to another project''s board';
  exception when insufficient_privilege then raise notice 'ok 2g: nor writes to it';
  end;
end;
$$;

-- ===================================================================
-- 3. Nothing points across projects.
-- ===================================================================
set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000002';
do $$
begin
  begin
    insert into public.collab_items (board_id, project_id, kind)
    values ('c5000000-0000-4000-8000-0000000000b9', 'c5000000-0000-4000-8000-00000000000a', 'sticky');
    raise exception 'FAIL 3a: an item went on another project''s board';
  exception when check_violation then raise notice 'ok 3a: an item goes only on its project''s boards';
  end;
  begin
    insert into public.collab_items (board_id, project_id, kind, drawing_id)
    values ('c5000000-0000-4000-8000-0000000000b1', 'c5000000-0000-4000-8000-00000000000a', 'image',
            'c5000000-0000-4000-8000-0000000000d9');
    raise exception 'FAIL 3b: a card showed another project''s drawing';
  exception when check_violation then raise notice 'ok 3b: a card shows only its project''s drawings';
  end;
  begin
    insert into public.collab_items (board_id, project_id, kind, storage_path)
    values ('c5000000-0000-4000-8000-0000000000b1', 'c5000000-0000-4000-8000-00000000000a', 'document',
            'c5000000-0000-4000-8000-00000000000b/x.jpg');
    raise exception 'FAIL 3c: a card named a file in another project''s folder';
  exception when check_violation then raise notice 'ok 3c: and only its project''s files';
  end;
  begin
    insert into public.collab_items (board_id, project_id, kind, parent_id)
    values ('c5000000-0000-4000-8000-0000000000b2', 'c5000000-0000-4000-8000-00000000000a', 'sticky',
            'c5000000-0000-4000-8000-0000000000a1');
    raise exception 'FAIL 3d: an object was put in a column on another board';
  exception when check_violation then raise notice 'ok 3d: a column or group is on the same board';
  end;
  begin
    insert into public.collab_threads (project_id, anchor_kind, drawing_id, revision_id, x, y)
    values ('c5000000-0000-4000-8000-00000000000a', 'drawing', 'c5000000-0000-4000-8000-0000000000d1',
            'c5000000-0000-4000-8000-0000000000e2', 0.5, 0.5);
    raise exception 'FAIL 3e: a pin named another drawing''s revision';
  exception when check_violation then raise notice 'ok 3e: a pin is on a revision of the drawing it names';
  end;
  begin
    insert into public.collab_threads (project_id, anchor_kind, drawing_id, revision_id, x, y)
    values ('c5000000-0000-4000-8000-00000000000a', 'drawing', 'c5000000-0000-4000-8000-0000000000d9',
            'c5000000-0000-4000-8000-0000000000e9', 0.5, 0.5);
    raise exception 'FAIL 3f: a pin went on another project''s drawing';
  exception when check_violation then raise notice 'ok 3f: and on this project''s drawings';
  end;
end;
$$;

-- The editor is also an editor on the outsider's project: moving a board
-- between two projects they can both edit is still refused.
reset role;
insert into public.agenda_members (project_id, user_id, role, status, accepted_at)
values ('c5000000-0000-4000-8000-00000000000b', 'c5000000-0000-4000-8000-000000000002', 'architect', 'active', now());
insert into public.collab_access (project_id, user_id, level)
values ('c5000000-0000-4000-8000-00000000000b', 'c5000000-0000-4000-8000-000000000002', 'editor');
set role authenticated;
set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000002';
do $$
begin
  begin
    update public.collab_boards set project_id = 'c5000000-0000-4000-8000-00000000000b', revision = revision + 1
    where id = 'c5000000-0000-4000-8000-0000000000b1';
    raise exception 'FAIL 3g: a board was moved to another project, its cards and comments with it';
  exception when check_violation then raise notice 'ok 3g: a board stays on its project, even for an editor of both';
  end;
  begin
    update public.collab_items set project_id = 'c5000000-0000-4000-8000-00000000000b', revision = revision + 1
    where id = 'c5000000-0000-4000-8000-0000000000a2';
    raise exception 'FAIL 3h: an item was moved to another project';
  exception when check_violation then raise notice 'ok 3h: and so does an item';
  end;
end;
$$;

-- ===================================================================
-- 4. Concurrent edits: a stale save is refused, never silently applied.
-- ===================================================================
do $$
declare r integer;
begin
  update public.collab_items set x = 300, revision = 2 where id = 'c5000000-0000-4000-8000-0000000000a2' and revision = 1;
  select revision into r from public.collab_items where id = 'c5000000-0000-4000-8000-0000000000a2';
  if r <> 2 then raise exception 'FAIL 4a: a save from the current revision did not apply'; end if;
  raise notice 'ok 4a: a save from the revision it read applies';
  begin
    update public.collab_items set x = 10, revision = 2 where id = 'c5000000-0000-4000-8000-0000000000a2';
    raise exception 'FAIL 4b: a save made from an old revision overwrote a newer one';
  exception when serialization_failure then raise notice 'ok 4b: a save from an old revision is refused';
  end;
  begin
    update public.collab_items set x = 10 where id = 'c5000000-0000-4000-8000-0000000000a2';
    raise exception 'FAIL 4c: a save without a revision applied';
  exception when serialization_failure then raise notice 'ok 4c: so is a save that does not say';
  end;
  if (select x from public.collab_items where id = 'c5000000-0000-4000-8000-0000000000a2') <> 300 then
    raise exception 'FAIL 4d: the refused saves changed the object';
  end if;
  raise notice 'ok 4d: and the newer change is what stands';
  begin
    update public.collab_items set board_id = 'c5000000-0000-4000-8000-0000000000b1', revision = 3
    where id = 'c5000000-0000-4000-8000-0000000000a2';
    raise exception 'FAIL 4e: an item changed boards';
  exception when check_violation then raise notice 'ok 4e: an item stays on its board';
  end;
end;
$$;

-- ===================================================================
-- 5. Threads: anchored, numbered; who may assign, review, resolve.
-- ===================================================================
set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000003';
do $$
declare number text; who uuid;
begin
  insert into public.collab_threads (id, project_id, anchor_kind, drawing_id, revision_id, page, x, y, title, assigned_to, status)
  values ('c5000000-0000-4000-8000-0000000000c1', 'c5000000-0000-4000-8000-00000000000a', 'drawing',
          'c5000000-0000-4000-8000-0000000000d1', 'c5000000-0000-4000-8000-0000000000e1', null, 0.42, 0.61,
          'Change this finish to walnut', 'c5000000-0000-4000-8000-000000000002', 'approved');
  select t.number, t.assigned_to into number, who from public.collab_threads t where id = 'c5000000-0000-4000-8000-0000000000c1';
  if number <> 'C-001' then raise exception 'FAIL 5a: the first thread is %, not C-001', number; end if;
  if who is not null then raise exception 'FAIL 5a: a commenter assigned work on opening a thread'; end if;
  if (select status from public.collab_threads where id = 'c5000000-0000-4000-8000-0000000000c1') <> 'open' then
    raise exception 'FAIL 5a: a thread opened as something other than open';
  end if;
  raise notice 'ok 5a: a client pins a comment on the render: numbered C-001, open, unassigned';
  begin
    insert into public.collab_threads (project_id, anchor_kind, drawing_id, revision_id, x, y)
    values ('c5000000-0000-4000-8000-00000000000a', 'drawing', 'c5000000-0000-4000-8000-0000000000d1',
            'c5000000-0000-4000-8000-0000000000e1', 1.2, 0.5);
    raise exception 'FAIL 5b: a pin was placed off the drawing';
  exception when check_violation then raise notice 'ok 5b: a pin is on the drawing, 0 to 1';
  end;
  begin
    insert into public.collab_threads (project_id, anchor_kind, drawing_id, revision_id)
    values ('c5000000-0000-4000-8000-00000000000a', 'drawing', 'c5000000-0000-4000-8000-0000000000d1',
            'c5000000-0000-4000-8000-0000000000e1');
    raise exception 'FAIL 5c: a drawing comment had no position';
  exception when check_violation then raise notice 'ok 5c: a drawing comment has a position';
  end;
  begin
    update public.collab_threads set assigned_to = 'c5000000-0000-4000-8000-000000000002', revision = revision + 1
    where id = 'c5000000-0000-4000-8000-0000000000c1';
    raise exception 'FAIL 5d: a commenter assigned the correction';
  exception when insufficient_privilege then raise notice 'ok 5d: a commenter does not assign work';
  end;
end;
$$;

set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000002';
do $$
declare n integer;
begin
  update public.collab_threads
  set assigned_to = 'c5000000-0000-4000-8000-000000000002', task_id = 'c5000000-0000-4000-8000-0000000000f1', revision = revision + 1
  where id = 'c5000000-0000-4000-8000-0000000000c1';
  begin
    update public.collab_threads set task_id = 'c5000000-0000-4000-8000-0000000000f9', revision = revision + 1
    where id = 'c5000000-0000-4000-8000-0000000000c1';
    raise exception 'FAIL 5e: a thread was linked to another project''s task';
  exception when check_violation then raise notice 'ok 5e: an editor assigns it and links its task, on this project only';
  end;
  begin
    update public.collab_threads set assigned_to = 'c5000000-0000-4000-8000-000000000005', revision = revision + 1
    where id = 'c5000000-0000-4000-8000-0000000000c1';
    raise exception 'FAIL 5f: work was assigned to an outsider';
  exception when check_violation then raise notice 'ok 5f: work goes only to somebody on the project';
  end;
  begin
    update public.collab_threads set revision_id = 'c5000000-0000-4000-8000-0000000000e2', drawing_id = 'c5000000-0000-4000-8000-0000000000d2', revision = revision + 1
    where id = 'c5000000-0000-4000-8000-0000000000c1';
    raise exception 'FAIL 5g: a pin was moved to another drawing';
  exception when check_violation then raise notice 'ok 5g: a comment stays on the drawing it was placed on';
  end;
  update public.collab_threads set status = 'ready_for_review', revision = revision + 1
  where id = 'c5000000-0000-4000-8000-0000000000c1';
  raise notice 'ok 5h: the designer marks the correction ready for review';
end;
$$;

set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000003';
do $$
declare who uuid; at timestamptz;
begin
  update public.collab_threads set status = 'approved', revision = revision + 1
  where id = 'c5000000-0000-4000-8000-0000000000c1';
  select resolved_by, resolved_at into who, at from public.collab_threads where id = 'c5000000-0000-4000-8000-0000000000c1';
  if who is distinct from 'c5000000-0000-4000-8000-000000000003'::uuid or at is null then
    raise exception 'FAIL 5j: approving did not record who approved it';
  end if;
  raise notice 'ok 5j: the client approves it, and the approval says who and when';
  update public.collab_threads set status = 'changes_requested', revision = revision + 1
  where id = 'c5000000-0000-4000-8000-0000000000c1';
  if (select resolved_by from public.collab_threads where id = 'c5000000-0000-4000-8000-0000000000c1') is not null then
    raise exception 'FAIL 5k: reopening left it marked resolved';
  end if;
  raise notice 'ok 5k: or asks for further changes, which reopens it';
  insert into public.collab_threads (id, project_id, anchor_kind, title)
  values ('c5000000-0000-4000-8000-0000000000c2', 'c5000000-0000-4000-8000-00000000000a', 'project', 'Site visit Thursday?');
  begin
    update public.collab_threads set status = 'ready_for_review', revision = revision + 1
    where id = 'c5000000-0000-4000-8000-0000000000c2';
    raise exception 'FAIL 5l: a commenter marked something ready for review';
  exception when insufficient_privilege then raise notice 'ok 5l: only an editor marks a correction ready for review';
  end;
end;
$$;

set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000004';
do $$
begin
  begin
    insert into public.collab_threads (project_id, anchor_kind, title)
    values ('c5000000-0000-4000-8000-00000000000a', 'project', 'Viewer here');
    raise exception 'FAIL 5m: a viewer opened a thread';
  exception when insufficient_privilege then raise notice 'ok 5m: a viewer does not comment';
  end;
end;
$$;

-- ===================================================================
-- 6. Comments: the author's own; mentions and replies notify the right people.
-- ===================================================================
set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000003';
do $$
begin
  insert into public.collab_comments (id, thread_id, project_id, author_id, body, mentions)
  values ('c5000000-0000-4000-8000-0000000000aa', 'c5000000-0000-4000-8000-0000000000c1',
          'c5000000-0000-4000-8000-00000000000a', 'c5000000-0000-4000-8000-000000000003',
          'Change this finish to walnut, please @editor',
          array['c5000000-0000-4000-8000-000000000002', 'c5000000-0000-4000-8000-000000000005']::uuid[]);
  -- Claiming to be somebody else changes nothing: the comment is the poster's.
  insert into public.collab_comments (id, thread_id, project_id, author_id, body)
  values ('c5000000-0000-4000-8000-0000000000ac', 'c5000000-0000-4000-8000-0000000000c1',
          'c5000000-0000-4000-8000-00000000000a', 'c5000000-0000-4000-8000-000000000002', 'Written as somebody else');
  if (select author_id from public.collab_comments where id = 'c5000000-0000-4000-8000-0000000000ac')
     <> 'c5000000-0000-4000-8000-000000000003' then
    raise exception 'FAIL 6a: a comment was posted in somebody else''s name';
  end if;
  raise notice 'ok 6a: a comment is always its poster''s, whatever the client claims';
end;
$$;

set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000002';
do $$
declare n integer;
begin
  insert into public.collab_comments (thread_id, project_id, author_id, body)
  values ('c5000000-0000-4000-8000-0000000000c1', 'c5000000-0000-4000-8000-00000000000a',
          'c5000000-0000-4000-8000-000000000002', 'Done — new revision uploaded.');
  -- A thread the client opened and never wrote in: the reply still reaches them.
  insert into public.collab_comments (thread_id, project_id, author_id, body)
  values ('c5000000-0000-4000-8000-0000000000c2', 'c5000000-0000-4000-8000-00000000000a',
          'c5000000-0000-4000-8000-000000000002', 'Thursday at 10 works.');
  update public.collab_comments set body = 'Edited by the wrong person' where id = 'c5000000-0000-4000-8000-0000000000aa';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 6b: somebody edited another person''s comment'; end if;
  raise notice 'ok 6b: a reply is posted; nobody edits another person''s comment';
end;
$$;

reset role;
do $$
declare n integer;
begin
  select count(*) into n from public.notifications
  where user_id = 'c5000000-0000-4000-8000-000000000002' and kind = 'collab_mention';
  if n <> 1 then raise exception 'FAIL 6c: the mentioned editor has % mention notifications', n; end if;
  select count(*) into n from public.notifications where user_id = 'c5000000-0000-4000-8000-000000000005';
  if n <> 0 then raise exception 'FAIL 6d: an outsider named in a mention was notified — the thread leaked'; end if;
  raise notice 'ok 6c: a mention notifies a member; ok 6d: and never somebody outside the project';
  select count(*) into n from public.notifications
  where user_id = 'c5000000-0000-4000-8000-000000000003' and kind = 'collab_comment';
  if n <> 2 then raise exception 'FAIL 6e: the client was notified of % replies, not 2', n; end if;
  raise notice 'ok 6e: a reply notifies whoever opened the thread, whether or not they wrote in it';
  select count(*) into n from public.notifications
  where user_id = 'c5000000-0000-4000-8000-000000000003' and kind = 'collab_review';
  if n <> 1 then raise exception 'FAIL 6f: the client was not told the correction was ready (%)', n; end if;
  raise notice 'ok 6f: and ready for review is sent back to whoever asked';
  select count(*) into n from public.notifications
  where user_id = 'c5000000-0000-4000-8000-000000000002' and kind = 'collab_assigned';
  if n <> 0 then raise exception 'FAIL 6g: assigning yourself notified you'; end if;
  select count(*) into n from public.agenda_events
  where project_id = 'c5000000-0000-4000-8000-00000000000a' and kind = 'collab';
  if n < 4 then raise exception 'FAIL 6h: the activity log has % Studio entries', n; end if;
  raise notice 'ok 6g: nobody is notified of their own assignment; ok 6h: and the project''s activity records it';
end;
$$;

-- ===================================================================
-- 7. Annotations and reads.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000003';
do $$
begin
  insert into public.collab_annotations (id, project_id, drawing_id, revision_id, kind, geometry)
  values ('c5000000-0000-4000-8000-0000000000ab', 'c5000000-0000-4000-8000-00000000000a',
          'c5000000-0000-4000-8000-0000000000d1', 'c5000000-0000-4000-8000-0000000000e1', 'ellipse',
          '{"x": 0.38, "y": 0.55, "w": 0.1, "h": 0.12}');
  raise notice 'ok 7a: a client circles the cabinet';
  if (select count(*) from public.collab_reads where thread_id = 'c5000000-0000-4000-8000-0000000000c1'
      and user_id = auth.uid()) <> 1 then
    raise exception 'FAIL 7a: posting a comment did not mark the thread read for its author';
  end if;
  raise notice 'ok 7a: and has read the thread they commented on';
end;
$$;

set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000004';
do $$
declare n integer;
begin
  select count(*) into n from public.collab_reads;
  if n <> 0 then raise exception 'FAIL 7b: the viewer reads other people''s read marks'; end if;
  insert into public.collab_reads (user_id, thread_id, project_id)
  values ('c5000000-0000-4000-8000-000000000004', 'c5000000-0000-4000-8000-0000000000c1', 'c5000000-0000-4000-8000-00000000000a');
  begin
    insert into public.collab_reads (user_id, thread_id, project_id)
    values ('c5000000-0000-4000-8000-000000000003', 'c5000000-0000-4000-8000-0000000000c2', 'c5000000-0000-4000-8000-00000000000a');
    raise exception 'FAIL 7c: somebody marked a thread read for another person';
  exception when insufficient_privilege then raise notice 'ok 7b: read marks are your own; ok 7c: and only yours';
  end;
  update public.collab_annotations set geometry = '{"x": 0}', revision = revision + 1 where id = 'c5000000-0000-4000-8000-0000000000ab';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 7d: a viewer changed the client''s markup'; end if;
  raise notice 'ok 7d: a viewer cannot change markup';
end;
$$;

set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000007';
do $$
declare n integer;
begin
  update public.collab_annotations set geometry = '{"x": 0}', revision = revision + 1 where id = 'c5000000-0000-4000-8000-0000000000ab';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 7f: another commenter changed the client''s markup'; end if;
  raise notice 'ok 7f: nor can another commenter: markup is its author''s';
end;
$$;

set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000002';
do $$
declare n integer;
begin
  update public.collab_annotations set style = '{"color": "#ef4444"}', revision = revision + 1
  where id = 'c5000000-0000-4000-8000-0000000000ab';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL 7e: an editor could not tidy the client''s markup'; end if;
  raise notice 'ok 7e: an editor can';
end;
$$;

-- ===================================================================
-- 8. Nothing is deleted; leaving the project takes the Studio with it.
-- ===================================================================
do $$
begin
  begin
    delete from public.collab_items where id = 'c5000000-0000-4000-8000-0000000000a2';
    raise exception 'FAIL 8a: an item was deleted';
  exception when insufficient_privilege then raise notice 'ok 8a: an item is archived, never deleted';
  end;
  begin
    delete from public.collab_comments where thread_id = 'c5000000-0000-4000-8000-0000000000c1';
    raise exception 'FAIL 8b: comments were deleted';
  exception when insufficient_privilege then raise notice 'ok 8b: so is a comment';
  end;
end;
$$;

reset role;
update public.agenda_members set status = 'removed', removed_at = now()
where project_id = 'c5000000-0000-4000-8000-00000000000a' and user_id = 'c5000000-0000-4000-8000-000000000006';
set role authenticated;
set local request.jwt.claim.sub = 'c5000000-0000-4000-8000-000000000006';
do $$
declare n integer;
begin
  if public.collab_level('c5000000-0000-4000-8000-00000000000a') is not null then
    raise exception 'FAIL 8c: a removed member still has their editor level';
  end if;
  select count(*) into n from public.collab_items where project_id = 'c5000000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'FAIL 8c: a removed member still reads the boards'; end if;
  begin
    insert into public.collab_items (board_id, project_id, kind)
    values ('c5000000-0000-4000-8000-0000000000b2', 'c5000000-0000-4000-8000-00000000000a', 'sticky');
    raise exception 'FAIL 8d: a removed member still edits';
  exception when insufficient_privilege then raise notice 'ok 8c: a removed member loses the Studio, editor level and all; ok 8d: and cannot edit';
  end;
end;
$$;

reset role;
set role anon;
do $$
declare n integer;
begin
  begin
    select count(*) into n from public.collab_boards;
    raise exception 'FAIL 9a: a signed-out visitor reads boards (% rows)', n;
  exception when insufficient_privilege then raise notice 'ok 9a: signed-out visitors get nothing';
  end;
end;
$$;

reset role;
do $$
declare n integer;
begin
  select count(*) into n from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public'
    and tablename in ('collab_boards', 'collab_items', 'collab_threads', 'collab_comments', 'collab_annotations');
  if n <> 5 then raise exception 'FAIL 9b: % of the Studio''s 5 tables are published for realtime', n; end if;
  raise notice 'ok 9b: boards, items, threads, comments and markup are published for realtime';
end;
$$;

rollback;
