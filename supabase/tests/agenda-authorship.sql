-- Who did what on a project: records say who made them, and nobody can make
-- a record say somebody else made it, decided it, or approved it (0108).
--
-- Every question is asked as `authenticated` with a jwt subject. The people:
--
--   owner      started the project
--   member     an active engineer, no approval permission
--   approver   an active project manager the owner lets approve
--   viewer     an active supplier, a Studio viewer

begin;

insert into auth.users (id, email) values
  ('c8000000-0000-4000-8000-000000000001', 'authorship-owner@example.test'),
  ('c8000000-0000-4000-8000-000000000002', 'authorship-member@example.test'),
  ('c8000000-0000-4000-8000-000000000003', 'authorship-approver@example.test'),
  ('c8000000-0000-4000-8000-000000000004', 'authorship-viewer@example.test')
on conflict (id) do nothing;

set role authenticated;
set local request.jwt.claim.sub = 'c8000000-0000-4000-8000-000000000001';
insert into public.agenda_projects (id, owner_id, name)
values ('c8000000-0000-4000-8000-00000000000a', 'c8000000-0000-4000-8000-000000000001', 'Office fit-out');
insert into public.agenda_drawings (id, project_id, drawing_number, title, created_by)
values ('c8000000-0000-4000-8000-0000000000d1', 'c8000000-0000-4000-8000-00000000000a', 'A-101', 'Ground floor plan',
        'c8000000-0000-4000-8000-000000000001');
insert into public.agenda_drawing_revisions (id, drawing_id, project_id, revision, storage_path, uploaded_by)
values ('c8000000-0000-4000-8000-0000000000e1', 'c8000000-0000-4000-8000-0000000000d1',
        'c8000000-0000-4000-8000-00000000000a', 'A', 'c8000000-0000-4000-8000-00000000000a/a-101-a.pdf',
        'c8000000-0000-4000-8000-000000000001');
insert into public.agenda_tasks (id, project_id, title, created_by)
values ('c8000000-0000-4000-8000-0000000000f1', 'c8000000-0000-4000-8000-00000000000a', 'Check the stair', 'c8000000-0000-4000-8000-000000000001');
insert into public.agenda_task_comments (id, task_id, project_id, author_id, body)
values ('c8000000-0000-4000-8000-0000000000c1', 'c8000000-0000-4000-8000-0000000000f1',
        'c8000000-0000-4000-8000-00000000000a', 'c8000000-0000-4000-8000-000000000001', 'The rise looks too steep.');
insert into public.agenda_approvals (id, project_id, subject_type, subject_id, step, approver_id, decision)
values ('c8000000-0000-4000-8000-0000000000a1', 'c8000000-0000-4000-8000-00000000000a', 'drawing_revision',
        'c8000000-0000-4000-8000-0000000000e1', 1, 'c8000000-0000-4000-8000-000000000003', 'pending');

reset role;
insert into public.agenda_members (project_id, user_id, role, status, accepted_at, can_approve) values
  ('c8000000-0000-4000-8000-00000000000a', 'c8000000-0000-4000-8000-000000000002', 'engineer', 'active', now(), false),
  ('c8000000-0000-4000-8000-00000000000a', 'c8000000-0000-4000-8000-000000000003', 'project_manager', 'active', now(), true),
  ('c8000000-0000-4000-8000-00000000000a', 'c8000000-0000-4000-8000-000000000004', 'supplier', 'active', now(), false);
insert into public.collab_access (project_id, user_id, level) values
  ('c8000000-0000-4000-8000-00000000000a', 'c8000000-0000-4000-8000-000000000004', 'viewer');

set role authenticated;

-- ===================================================================
-- 1. Approvals: decided by the person named, who may approve.
-- ===================================================================

-- 1a. A member records an approval in the owner's name.
set local request.jwt.claim.sub = 'c8000000-0000-4000-8000-000000000002';
do $$
begin
  insert into public.agenda_approvals (project_id, subject_type, subject_id, step, approver_id, decision, decided_at)
  values ('c8000000-0000-4000-8000-00000000000a', 'drawing_revision', 'c8000000-0000-4000-8000-0000000000e1', 2,
          'c8000000-0000-4000-8000-000000000001', 'approved', now());
  if exists (select 1 from public.agenda_approvals where step = 2 and approver_id = 'c8000000-0000-4000-8000-000000000001' and decision = 'approved') then
    raise exception 'FAIL 1a: a member recorded an approval in the owner''s name';
  end if;
  raise notice 'ok 1a: (recorded, but not as the owner''s)';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 1a: nobody approves in somebody else''s name (%)', sqlerrm;
end
$$;

-- 1b. A member without approval permission approves as themselves.
do $$
begin
  insert into public.agenda_approvals (project_id, subject_type, subject_id, step, approver_id, decision, decided_at)
  values ('c8000000-0000-4000-8000-00000000000a', 'drawing_revision', 'c8000000-0000-4000-8000-0000000000e1', 3,
          auth.uid(), 'approved', now());
  raise exception 'FAIL 1b: a member who may not approve recorded an approval';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 1b: approving needs the permission to approve (%)', sqlerrm;
end
$$;

-- 1c. A member decides the approval waiting on somebody else.
do $$
begin
  update public.agenda_approvals set decision = 'rejected', decided_at = now()
  where id = 'c8000000-0000-4000-8000-0000000000a1';
  if (select decision from public.agenda_approvals where id = 'c8000000-0000-4000-8000-0000000000a1') <> 'pending' then
    raise exception 'FAIL 1c: a member decided an approval that was waiting on somebody else';
  end if;
  raise notice 'ok 1c: (no error, and still pending)';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 1c: an approval is decided by its approver (%)', sqlerrm;
end
$$;

-- 1d. The approver decides it, and the record says when.
set local request.jwt.claim.sub = 'c8000000-0000-4000-8000-000000000003';
update public.agenda_approvals set decision = 'approved', comment = 'Fine.'
where id = 'c8000000-0000-4000-8000-0000000000a1';
do $$
declare row public.agenda_approvals%rowtype;
begin
  select * into row from public.agenda_approvals where id = 'c8000000-0000-4000-8000-0000000000a1';
  if row.decision <> 'approved' or row.decided_at is null then
    raise exception 'FAIL 1d: the approver''s decision was not recorded with its time (%, %)', row.decision, row.decided_at;
  end if;
  raise notice 'ok 1d: the approver decides, and the time is recorded';
end
$$;

-- 1e. And once decided, it is not quietly changed — not even by them.
do $$
begin
  update public.agenda_approvals set decision = 'rejected'
  where id = 'c8000000-0000-4000-8000-0000000000a1';
  if (select decision from public.agenda_approvals where id = 'c8000000-0000-4000-8000-0000000000a1') <> 'approved' then
    raise exception 'FAIL 1e: a decided approval was changed afterwards';
  end if;
  raise notice 'ok 1e: (no error, and unchanged)';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 1e: a decision stands once made (%)', sqlerrm;
end
$$;

-- 1f. The owner approves as themselves, and may.
set local request.jwt.claim.sub = 'c8000000-0000-4000-8000-000000000001';
insert into public.agenda_approvals (project_id, subject_type, subject_id, step, approver_id, decision)
values ('c8000000-0000-4000-8000-00000000000a', 'drawing_revision', 'c8000000-0000-4000-8000-0000000000e1', 4,
        'c8000000-0000-4000-8000-000000000001', 'approved');
do $$
begin
  if not exists (select 1 from public.agenda_approvals where step = 4 and decision = 'approved' and decided_at is not null) then
    raise exception 'FAIL 1f: the owner could not approve';
  end if;
  raise notice 'ok 1f: the owner approves';
end
$$;

-- ===================================================================
-- 2. History: events are the system's, not anybody's to write.
-- ===================================================================
set local request.jwt.claim.sub = 'c8000000-0000-4000-8000-000000000002';
do $$
begin
  insert into public.agenda_events (project_id, kind, title, actor_id)
  values ('c8000000-0000-4000-8000-00000000000a', 'collab', 'Owner accepted the variation', 'c8000000-0000-4000-8000-000000000001');
  raise exception 'FAIL 2a: a member wrote a line of history in the owner''s name';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 2a: history is written by the system, not by hand (%)', sqlerrm;
end
$$;

-- ===================================================================
-- 3. Records say who made them.
-- ===================================================================

-- 3a. A task made by a member, sent as the owner's.
do $$
begin
  insert into public.agenda_tasks (id, project_id, title, created_by)
  values ('c8000000-0000-4000-8000-0000000000f2', 'c8000000-0000-4000-8000-00000000000a', 'Demolish the wall', 'c8000000-0000-4000-8000-000000000001');
  if (select created_by from public.agenda_tasks where id = 'c8000000-0000-4000-8000-0000000000f2') <> auth.uid() then
    raise exception 'FAIL 3a: a task says the owner made it';
  end if;
  raise notice 'ok 3a: a task is recorded as made by whoever made it';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 3a: a task cannot claim another maker (%)', sqlerrm;
end
$$;

-- 3b. And afterwards rewritten to be somebody else's.
do $$
begin
  update public.agenda_tasks set created_by = 'c8000000-0000-4000-8000-000000000003'
  where id = 'c8000000-0000-4000-8000-0000000000f1';
  if (select created_by from public.agenda_tasks where id = 'c8000000-0000-4000-8000-0000000000f1') <> 'c8000000-0000-4000-8000-000000000001' then
    raise exception 'FAIL 3b: who made a task was rewritten';
  end if;
  raise notice 'ok 3b: (no error, and unchanged)';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 3b: who made a task stays (%)', sqlerrm;
end
$$;

-- 3c. A comment, sent as the owner's; then somebody else's comment rewritten.
do $$
begin
  insert into public.agenda_task_comments (task_id, project_id, author_id, body)
  values ('c8000000-0000-4000-8000-0000000000f1', 'c8000000-0000-4000-8000-00000000000a',
          'c8000000-0000-4000-8000-000000000001', 'Approved, go ahead.');
  if exists (select 1 from public.agenda_task_comments where body = 'Approved, go ahead.' and author_id <> auth.uid()) then
    raise exception 'FAIL 3c: a comment says the owner wrote it';
  end if;
  raise notice 'ok 3c: a comment is recorded as written by its writer';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 3c: a comment cannot claim another writer (%)', sqlerrm;
end
$$;
do $$
begin
  update public.agenda_task_comments set body = 'The rise is fine.' where id = 'c8000000-0000-4000-8000-0000000000c1';
  if (select body from public.agenda_task_comments where id = 'c8000000-0000-4000-8000-0000000000c1') <> 'The rise looks too steep.' then
    raise exception 'FAIL 3d: somebody else''s comment was rewritten';
  end if;
  raise notice 'ok 3d: (no error, and unchanged)';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 3d: a comment is not rewritten by somebody else (%)', sqlerrm;
end
$$;

-- ===================================================================
-- 4. Drawings: a revision is never overwritten, and a Studio viewer adds none.
-- ===================================================================

-- 4a. The file behind revision A swapped for another.
do $$
begin
  update public.agenda_drawing_revisions set storage_path = 'c8000000-0000-4000-8000-00000000000a/forged.pdf'
  where id = 'c8000000-0000-4000-8000-0000000000e1';
  if (select storage_path from public.agenda_drawing_revisions where id = 'c8000000-0000-4000-8000-0000000000e1') <> 'c8000000-0000-4000-8000-00000000000a/a-101-a.pdf' then
    raise exception 'FAIL 4a: the file behind an issued revision was swapped';
  end if;
  raise notice 'ok 4a: (no error, and unchanged)';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 4a: an issued revision keeps its file (%)', sqlerrm;
end
$$;

-- 4b. Or its uploader rewritten.
do $$
begin
  update public.agenda_drawing_revisions set uploaded_by = auth.uid()
  where id = 'c8000000-0000-4000-8000-0000000000e1';
  if (select uploaded_by from public.agenda_drawing_revisions where id = 'c8000000-0000-4000-8000-0000000000e1') <> 'c8000000-0000-4000-8000-000000000001' then
    raise exception 'FAIL 4b: who uploaded a revision was rewritten';
  end if;
  raise notice 'ok 4b: (no error, and unchanged)';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 4b: who uploaded a revision stays (%)', sqlerrm;
end
$$;

-- 4c. A revision uploaded by a member, sent as the owner's.
do $$
begin
  insert into public.agenda_drawing_revisions (drawing_id, project_id, revision, storage_path, uploaded_by)
  values ('c8000000-0000-4000-8000-0000000000d1', 'c8000000-0000-4000-8000-00000000000a', 'B',
          'c8000000-0000-4000-8000-00000000000a/a-101-b.pdf', 'c8000000-0000-4000-8000-000000000001');
  if exists (select 1 from public.agenda_drawing_revisions where revision = 'B' and uploaded_by <> auth.uid()) then
    raise exception 'FAIL 4c: a revision says the owner uploaded it';
  end if;
  raise notice 'ok 4c: a revision is recorded as uploaded by its uploader';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 4c: a revision cannot claim another uploader (%)', sqlerrm;
end
$$;

-- 4d. A Studio viewer adds a revision behind the Studio's back.
set local request.jwt.claim.sub = 'c8000000-0000-4000-8000-000000000004';
do $$
begin
  insert into public.agenda_drawing_revisions (drawing_id, project_id, revision, storage_path)
  values ('c8000000-0000-4000-8000-0000000000d1', 'c8000000-0000-4000-8000-00000000000a', 'V',
          'c8000000-0000-4000-8000-00000000000a/viewer.pdf');
  raise exception 'FAIL 4d: a Studio viewer added a drawing revision';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 4d: a Studio viewer adds no revisions (%)', sqlerrm;
end
$$;

-- 4e. Or a drawing.
do $$
begin
  insert into public.agenda_drawings (project_id, drawing_number, title)
  values ('c8000000-0000-4000-8000-00000000000a', 'V-1', 'Viewer''s');
  raise exception 'FAIL 4e: a Studio viewer added a drawing';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 4e: a Studio viewer adds no drawings (%)', sqlerrm;
end
$$;

-- ===================================================================
-- 5. Somebody who may approve still approves only as themselves.
-- ===================================================================
set role authenticated;

-- 5a. Anybody on the project may ask for an approval.
set local request.jwt.claim.sub = 'c8000000-0000-4000-8000-000000000002';
insert into public.agenda_approvals (id, project_id, subject_type, subject_id, step, approver_id, decided_at)
values ('c8000000-0000-4000-8000-0000000000a5', 'c8000000-0000-4000-8000-00000000000a', 'drawing_revision', 'c8000000-0000-4000-8000-0000000000e1', 5, 'c8000000-0000-4000-8000-000000000001', now() - interval '3 days');
do $$
begin
  if (select decided_at from public.agenda_approvals where id = 'c8000000-0000-4000-8000-0000000000a5') is not null then
    raise exception 'FAIL 5a: a request came in already decided';
  end if;
  raise notice 'ok 5a: a member asks the owner for an approval';
end
$$;

-- 5b. The approver decides the one waiting on the owner.
set local request.jwt.claim.sub = 'c8000000-0000-4000-8000-000000000003';
do $$
begin
  update public.agenda_approvals set decision = 'approved' where id = 'c8000000-0000-4000-8000-0000000000a5';
  raise exception 'FAIL 5b: an approver decided an approval waiting on somebody else';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  if sqlerrm not like '%waiting on somebody else%' then raise exception 'FAIL 5b: refused for the wrong reason: %', sqlerrm; end if;
  raise notice 'ok 5b: an approval waiting on the owner is the owner''s to decide (%)', sqlerrm;
end
$$;

-- 5c. Or records a new one in the owner's name.
do $$
begin
  insert into public.agenda_approvals (project_id, subject_type, subject_id, step, approver_id, decision)
  values ('c8000000-0000-4000-8000-00000000000a', 'drawing_revision', 'c8000000-0000-4000-8000-0000000000e1', 6, 'c8000000-0000-4000-8000-000000000001', 'approved');
  raise exception 'FAIL 5c: an approver recorded an approval in the owner''s name';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  if sqlerrm not like '%in the name of whoever gives it%' then raise exception 'FAIL 5c: refused for the wrong reason: %', sqlerrm; end if;
  raise notice 'ok 5c: an approval is in the name of whoever gives it (%)', sqlerrm;
end
$$;

-- 5d. Or passes the request on to themselves.
do $$
begin
  update public.agenda_approvals set approver_id = auth.uid() where id = 'c8000000-0000-4000-8000-0000000000a5';
  raise exception 'FAIL 5d: somebody took over a request addressed to the owner';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 5d: a request is passed on by the owner or the person asked (%)', sqlerrm;
end
$$;

-- 5e. Or moves an approval onto another drawing.
set local request.jwt.claim.sub = 'c8000000-0000-4000-8000-000000000001';
do $$
begin
  update public.agenda_approvals set subject_id = gen_random_uuid() where id = 'c8000000-0000-4000-8000-0000000000a5';
  raise exception 'FAIL 5e: an approval was moved onto something else';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 5e: an approval stays with what it is for (%)', sqlerrm;
end
$$;

-- 5f. The owner decides it — recorded as the owner's, with the time.
update public.agenda_approvals set decision = 'rejected', comment = 'Not yet.' where id = 'c8000000-0000-4000-8000-0000000000a5';
do $$
declare row public.agenda_approvals%rowtype;
begin
  select * into row from public.agenda_approvals where id = 'c8000000-0000-4000-8000-0000000000a5';
  if row.decision <> 'rejected' or row.approver_id <> 'c8000000-0000-4000-8000-000000000001' or row.decided_at is null then
    raise exception 'FAIL 5f: the owner''s decision is not recorded as theirs';
  end if;
  raise notice 'ok 5f: the owner decides what is waiting on them';
end
$$;

-- ===================================================================
-- 6. "Decided by" names only yourself; files stay; maintenance still works.
-- ===================================================================
set local request.jwt.claim.sub = 'c8000000-0000-4000-8000-000000000002';
do $$
begin
  insert into public.agenda_decisions (project_id, title, decided_by, created_by)
  values ('c8000000-0000-4000-8000-00000000000a', 'Use the cheaper tiles', 'c8000000-0000-4000-8000-000000000001', auth.uid());
  raise exception 'FAIL 6a: a decision was recorded as the owner''s by somebody else';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 6a: a decision names only its own decider (%)', sqlerrm;
end
$$;
insert into public.agenda_decisions (project_id, title, decided_by, created_by)
values ('c8000000-0000-4000-8000-00000000000a', 'Keep the stair as drawn', 'c8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000002');
do $$
begin
  if not exists (select 1 from public.agenda_decisions where title = 'Keep the stair as drawn' and decided_by = auth.uid()) then
    raise exception 'FAIL 6b: a member could not record their own decision';
  end if;
  raise notice 'ok 6b: and a member records their own';
end
$$;

-- 6c. A document version and a photo keep their files.
set local request.jwt.claim.sub = 'c8000000-0000-4000-8000-000000000001';
insert into public.agenda_documents (id, project_id, title) values ('c8000000-0000-4000-8000-0000000000b1', 'c8000000-0000-4000-8000-00000000000a', 'Spec');
insert into public.agenda_document_versions (id, document_id, project_id, version, storage_path)
values ('c8000000-0000-4000-8000-0000000000b2', 'c8000000-0000-4000-8000-0000000000b1', 'c8000000-0000-4000-8000-00000000000a', 1, 'c8000000-0000-4000-8000-00000000000a/spec-1.pdf');
insert into public.agenda_photos (id, project_id, storage_path) values ('c8000000-0000-4000-8000-0000000000b3', 'c8000000-0000-4000-8000-00000000000a', 'c8000000-0000-4000-8000-00000000000a/site.jpg');
set local request.jwt.claim.sub = 'c8000000-0000-4000-8000-000000000002';
do $$
begin
  begin
    update public.agenda_document_versions set storage_path = 'c8000000-0000-4000-8000-00000000000a/other.pdf' where id = 'c8000000-0000-4000-8000-0000000000b2';
    raise exception 'FAIL 6c: a document version''s file was swapped';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    update public.agenda_photos set storage_path = 'c8000000-0000-4000-8000-00000000000a/other.jpg' where id = 'c8000000-0000-4000-8000-0000000000b3';
    raise exception 'FAIL 6c: a photo''s file was swapped';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  update public.agenda_photos set caption = 'North wall' where id = 'c8000000-0000-4000-8000-0000000000b3';
  if (select caption from public.agenda_photos where id = 'c8000000-0000-4000-8000-0000000000b3') <> 'North wall' then
    raise exception 'FAIL 6c: a photo could not be captioned';
  end if;
  raise notice 'ok 6c: document versions and photos keep their files; the rest is still editable';
end
$$;

-- 6d. Maintenance, not a person acting on the record, may still correct it.
reset role;
update public.agenda_drawing_revisions set storage_path = 'c8000000-0000-4000-8000-00000000000a/a-101-a-restored.pdf' where id = 'c8000000-0000-4000-8000-0000000000e1';
do $$
begin
  if (select storage_path from public.agenda_drawing_revisions where id = 'c8000000-0000-4000-8000-0000000000e1') <> 'c8000000-0000-4000-8000-00000000000a/a-101-a-restored.pdf' then
    raise exception 'FAIL 6d: the service role could not correct a record';
  end if;
  raise notice 'ok 6d: maintenance can still correct a record';
end
$$;
set role authenticated;

-- 6e. A Studio viewer does not even ask for approvals.
set local request.jwt.claim.sub = 'c8000000-0000-4000-8000-000000000004';
do $$
begin
  insert into public.agenda_approvals (project_id, subject_type, subject_id, step, approver_id)
  values ('c8000000-0000-4000-8000-00000000000a', 'drawing_revision', 'c8000000-0000-4000-8000-0000000000e1', 7, 'c8000000-0000-4000-8000-000000000001');
  raise exception 'FAIL 6e: a Studio viewer asked for an approval';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  if sqlerrm not like 'You can view this project%' then raise exception 'FAIL 6e: refused for the wrong reason: %', sqlerrm; end if;
  raise notice 'ok 6e: a Studio viewer changes no approvals (%)', sqlerrm;
end
$$;

-- 6f. The owner may still do all of it — even with a Studio viewer level
--     left over from before they were made an owner.
reset role;
insert into public.collab_access (project_id, user_id, level) values ('c8000000-0000-4000-8000-00000000000a', 'c8000000-0000-4000-8000-000000000001', 'viewer');
set role authenticated;
set local request.jwt.claim.sub = 'c8000000-0000-4000-8000-000000000001';
insert into public.agenda_drawing_revisions (drawing_id, project_id, revision, storage_path)
values ('c8000000-0000-4000-8000-0000000000d1', 'c8000000-0000-4000-8000-00000000000a', 'C', 'c8000000-0000-4000-8000-00000000000a/a-101-c.pdf');
do $$
begin
  if not exists (select 1 from public.agenda_drawing_revisions where revision = 'C' and uploaded_by = auth.uid()) then
    raise exception 'FAIL 6f: the owner could not add a revision';
  end if;
  raise notice 'ok 6f: the owner adds revisions, stamped as theirs';
end
$$;

rollback;
