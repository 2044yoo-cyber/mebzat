-- Floor plans, sketches and pins on an Agenda project (0102).
--
-- Every access question is asked as `authenticated` with a jwt subject: a
-- superuser bypasses row-level security. Three people:
--
--   owner     started the project
--   site      a member
--   outsider  on another project of their own, not this one

begin;

insert into auth.users (id, email) values
  ('b7000000-0000-4000-8000-000000000001', 'plan-owner@example.test'),
  ('b7000000-0000-4000-8000-000000000003', 'plan-site@example.test'),
  ('b7000000-0000-4000-8000-000000000004', 'plan-outsider@example.test')
on conflict (id) do nothing;

set role authenticated;
set local request.jwt.claim.sub = 'b7000000-0000-4000-8000-000000000001';
insert into public.agenda_projects (id, owner_id, name)
values ('b7000000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000001', 'Kitchen renovation');
insert into public.agenda_tasks (id, project_id, title, created_by)
values ('b7000000-0000-4000-8000-0000000000a1', 'b7000000-0000-4000-8000-00000000000a',
        'Verify kitchen wall', 'b7000000-0000-4000-8000-000000000001');

set local request.jwt.claim.sub = 'b7000000-0000-4000-8000-000000000004';
insert into public.agenda_projects (id, owner_id, name)
values ('b7000000-0000-4000-8000-00000000000b', 'b7000000-0000-4000-8000-000000000004', 'Someone else');
insert into public.agenda_tasks (id, project_id, title, created_by)
values ('b7000000-0000-4000-8000-0000000000b1', 'b7000000-0000-4000-8000-00000000000b',
        'Their task', 'b7000000-0000-4000-8000-000000000004');
insert into public.agenda_plans (id, project_id, title, data)
values ('b7000000-0000-4000-8000-0000000000b2', 'b7000000-0000-4000-8000-00000000000b', 'Theirs', '{}');

reset role;
insert into public.agenda_members (project_id, user_id, role, status, accepted_at)
values ('b7000000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000003', 'engineer', 'active', now());

-- ===================================================================
-- 1. A member saves a plan to the project and another member opens it.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'b7000000-0000-4000-8000-000000000001';

do $$
declare n integer;
begin
  insert into public.agenda_plans (id, project_id, title, data, created_by, updated_by)
  values ('b7000000-0000-4000-8000-0000000000c1', 'b7000000-0000-4000-8000-00000000000a',
          'Ground floor', '{"levels": []}', auth.uid(), auth.uid());
  select count(*) into n from public.agenda_plans where id = 'b7000000-0000-4000-8000-0000000000c1';
  if n <> 1 then raise exception 'FAIL 1a: the owner cannot read the plan they saved'; end if;
  raise notice 'ok 1a: a plan is saved to the project';
end;
$$;

set local request.jwt.claim.sub = 'b7000000-0000-4000-8000-000000000003';
do $$
declare n integer;
begin
  select count(*) into n from public.agenda_plans where project_id = 'b7000000-0000-4000-8000-00000000000a';
  if n <> 1 then raise exception 'FAIL 1b: a member cannot open the project''s plan'; end if;
  update public.agenda_plans set data = '{"levels": [1]}', revision = revision + 1
  where id = 'b7000000-0000-4000-8000-0000000000c1' and revision = 1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL 1c: a member cannot save the plan'; end if;
  raise notice 'ok 1b: another member opens and saves it';
end;
$$;

-- ===================================================================
-- 2. A save made from an old revision changes nothing.
-- ===================================================================
do $$
declare n integer;
begin
  update public.agenda_plans set data = '{"stale": true}', revision = 2
  where id = 'b7000000-0000-4000-8000-0000000000c1' and revision = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 2a: a stale save overwrote a newer one'; end if;
  begin
    update public.agenda_plans set revision = 9 where id = 'b7000000-0000-4000-8000-0000000000c1';
    raise exception 'FAIL 2b: a revision jumped';
  exception when serialization_failure then
    raise notice 'ok 2: a stale save changes nothing, and revisions only go up by one';
  end;
end;
$$;

-- ===================================================================
-- 3. Somebody not on the project sees none of it and cannot add to it.
-- ===================================================================
set local request.jwt.claim.sub = 'b7000000-0000-4000-8000-000000000004';
do $$
declare n integer;
begin
  select count(*) into n from public.agenda_plans where project_id = 'b7000000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'FAIL 3a: an outsider can read the plan'; end if;
  update public.agenda_plans set title = 'x', revision = revision + 1 where id = 'b7000000-0000-4000-8000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 3b: an outsider can change the plan'; end if;
  begin
    insert into public.agenda_plans (project_id, title, data)
    values ('b7000000-0000-4000-8000-00000000000a', 'Intruder', '{}');
    raise exception 'FAIL 3c: an outsider can add a plan';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.agenda_pins (project_id, source_kind, plan_id, x, y, title)
    values ('b7000000-0000-4000-8000-00000000000a', 'plan', 'b7000000-0000-4000-8000-0000000000c1', 0, 0, 'Intruder');
    raise exception 'FAIL 3d: an outsider can pin the plan';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok 3: an outsider can neither see nor add';
end;
$$;

-- ===================================================================
-- 4. Sketches name what they are drawn over, inside the project.
-- ===================================================================
set local request.jwt.claim.sub = 'b7000000-0000-4000-8000-000000000003';
do $$
begin
  insert into public.agenda_sketches (id, project_id, title, source_kind, source_path, markup)
  values ('b7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-00000000000a', 'Kitchen wall', 'image',
          'b7000000-0000-4000-8000-00000000000a/plan-files/photo.jpg',
          '[{"type": "arrow", "points": [[0,0],[10,10]]}]');
  begin
    insert into public.agenda_sketches (project_id, title, source_kind, source_path)
    values ('b7000000-0000-4000-8000-00000000000a', 'Elsewhere', 'image', 'b7000000-0000-4000-8000-00000000000b/x.jpg');
    raise exception 'FAIL 4a: a sketch names a file in another project';
  exception when check_violation then null;
  end;
  begin
    insert into public.agenda_sketches (project_id, title, source_kind)
    values ('b7000000-0000-4000-8000-00000000000a', 'Nothing under it', 'plan');
    raise exception 'FAIL 4b: a plan sketch without a plan';
  exception when check_violation then null;
  end;
  begin
    insert into public.agenda_sketches (project_id, title, source_kind, plan_id)
    values ('b7000000-0000-4000-8000-00000000000a', 'Their plan', 'plan', 'b7000000-0000-4000-8000-0000000000b2');
    raise exception 'FAIL 4c: a sketch over another project''s plan';
  exception when check_violation then null;
  end;
  raise notice 'ok 4: sketches stay inside their project';
end;
$$;

-- ===================================================================
-- 5. Pins are numbered by the project and point at its own tasks.
-- ===================================================================
do $$
declare first_number text; second_number text; n integer;
begin
  insert into public.agenda_pins (id, project_id, source_kind, plan_id, source_level, x, y, title, measurement, number)
  values ('b7000000-0000-4000-8000-0000000000e1', 'b7000000-0000-4000-8000-00000000000a', 'plan',
          'b7000000-0000-4000-8000-0000000000c1', 'ground-floor', 3620, 0, 'Kitchen wall', '3.62 m', 'PIN-999')
  returning number into first_number;
  insert into public.agenda_pins (project_id, source_kind, sketch_id, source_path, x, y, title)
  values ('b7000000-0000-4000-8000-00000000000a', 'image', 'b7000000-0000-4000-8000-0000000000d1',
          'b7000000-0000-4000-8000-00000000000a/plan-files/photo.jpg', 120, 80, 'Ask carpenter')
  returning number into second_number;
  if first_number <> 'PIN-001' or second_number <> 'PIN-002' then
    raise exception 'FAIL 5a: pins numbered % and %', first_number, second_number;
  end if;

  update public.agenda_pins set task_id = 'b7000000-0000-4000-8000-0000000000a1', number = 'PIN-777'
  where id = 'b7000000-0000-4000-8000-0000000000e1';
  select count(*) into n from public.agenda_pins
  where task_id = 'b7000000-0000-4000-8000-0000000000a1' and number = 'PIN-001';
  if n <> 1 then raise exception 'FAIL 5b: linking a task lost the pin or renumbered it'; end if;

  begin
    update public.agenda_pins set task_id = 'b7000000-0000-4000-8000-0000000000b1'
    where id = 'b7000000-0000-4000-8000-0000000000e1';
    raise exception 'FAIL 5c: a pin points at another project''s task';
  exception when check_violation then null;
  end;
  begin
    insert into public.agenda_pins (project_id, source_kind, x, y, title)
    values ('b7000000-0000-4000-8000-00000000000a', 'image', 0, 0, 'On nothing');
    raise exception 'FAIL 5d: a pin on nothing';
  exception when check_violation then null;
  end;
  raise notice 'ok 5: pins are numbered by the project and point at its own tasks';
end;
$$;

-- ===================================================================
-- 6. Nothing is deleted.
-- ===================================================================
set local request.jwt.claim.sub = 'b7000000-0000-4000-8000-000000000001';
do $$
begin
  begin
    delete from public.agenda_plans where id = 'b7000000-0000-4000-8000-0000000000c1';
    raise exception 'FAIL 6: the owner deleted a plan';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.agenda_pins where id = 'b7000000-0000-4000-8000-0000000000e1';
    raise exception 'FAIL 6b: a pin was deleted';
  exception when insufficient_privilege then null;
  end;
  update public.agenda_plans set archived_at = now(), revision = revision + 1
  where id = 'b7000000-0000-4000-8000-0000000000c1';
  raise notice 'ok 6: plans and pins are archived, never deleted';
end;
$$;

reset role;
rollback;
