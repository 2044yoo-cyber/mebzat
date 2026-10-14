-- What a member may do to their own membership (0106), and invitation links (0107).
--
-- Every question is asked as `authenticated` with a jwt subject: a superuser
-- bypasses row-level security. The people:
--
--   owner      started the project
--   member     an active engineer on it
--   pending    invited by email, not yet accepted
--   leaver     was a member, removed by the owner
--   stranger   on no project of the owner's; owns one of their own
--   joiner     somebody the owner sends a link to
--   second     somebody else the link reaches

begin;

insert into auth.users (id, email) values
  ('c7000000-0000-4000-8000-000000000001', 'invite-owner@example.test'),
  ('c7000000-0000-4000-8000-000000000002', 'invite-member@example.test'),
  ('c7000000-0000-4000-8000-000000000003', 'invite-pending@example.test'),
  ('c7000000-0000-4000-8000-000000000004', 'invite-leaver@example.test'),
  ('c7000000-0000-4000-8000-000000000005', 'invite-stranger@example.test'),
  ('c7000000-0000-4000-8000-000000000006', 'invite-joiner@example.test'),
  ('c7000000-0000-4000-8000-000000000007', 'invite-second@example.test')
on conflict (id) do nothing;

set role authenticated;
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000001';
insert into public.agenda_projects (id, owner_id, name)
values ('c7000000-0000-4000-8000-00000000000a', 'c7000000-0000-4000-8000-000000000001', 'Villa extension');
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000005';
insert into public.agenda_projects (id, owner_id, name)
values ('c7000000-0000-4000-8000-00000000000b', 'c7000000-0000-4000-8000-000000000005', 'Stranger''s own');

reset role;
insert into public.agenda_members (project_id, user_id, role, status, accepted_at, removed_at) values
  ('c7000000-0000-4000-8000-00000000000a', 'c7000000-0000-4000-8000-000000000002', 'engineer', 'active', now(), null),
  ('c7000000-0000-4000-8000-00000000000a', 'c7000000-0000-4000-8000-000000000003', 'architect', 'invited', null, null),
  ('c7000000-0000-4000-8000-00000000000a', 'c7000000-0000-4000-8000-000000000004', 'contractor', 'removed', now(), now());

-- ===================================================================
-- 1. A member's own row: accept an invitation, or leave. Nothing else.
-- ===================================================================
set role authenticated;

-- 1a. The removed member puts themselves back.
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000004';
do $$
begin
  update public.agenda_members set status = 'active', removed_at = null
  where project_id = 'c7000000-0000-4000-8000-00000000000a' and user_id = auth.uid();
  if public.agenda_is_member('c7000000-0000-4000-8000-00000000000a') then
    raise exception 'FAIL 1a: a removed member reactivated themselves';
  end if;
  raise notice 'ok 1a: (no error, but no access either)';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 1a: a removed member cannot put themselves back (%)', sqlerrm;
end
$$;

-- 1b. Somebody invited to one project repoints that invitation at another.
--     `second` has a pending invitation to the stranger's project, and aims
--     it at the owner's — any membership row anywhere is all this needs.
reset role;
insert into public.agenda_members (project_id, user_id, role, status)
values ('c7000000-0000-4000-8000-00000000000b', 'c7000000-0000-4000-8000-000000000007', 'employee', 'invited');
set role authenticated;
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000007';
do $$
begin
  update public.agenda_members
  set project_id = 'c7000000-0000-4000-8000-00000000000a', status = 'active'
  where project_id = 'c7000000-0000-4000-8000-00000000000b' and user_id = auth.uid();
  if public.agenda_is_member('c7000000-0000-4000-8000-00000000000a') then
    raise exception 'FAIL 1b: an invitation to one project was moved onto another, and opened it';
  end if;
  raise notice 'ok 1b: (no error, but no access either)';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 1b: a membership cannot be moved to another project (%)', sqlerrm;
end
$$;

-- 1b2. The worst of it: anybody can start a project, which makes them its
--      administrator, and then carry that row — administrator, finance and
--      all — onto any other project.
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000005';
do $$
begin
  update public.agenda_members
  set project_id = 'c7000000-0000-4000-8000-00000000000a'
  where project_id = 'c7000000-0000-4000-8000-00000000000b' and user_id = auth.uid();
  if public.agenda_is_owner('c7000000-0000-4000-8000-00000000000a') then
    raise exception 'FAIL 1b2: a stranger carried their administrator row onto the owner''s project';
  end if;
  raise notice 'ok 1b2: (no error, but no access either)';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 1b2: an administrator row stays on its own project (%)', sqlerrm;
end
$$;

-- 1c. Or onto somebody else: the row is theirs, the person is not.
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000002';
do $$
begin
  update public.agenda_members set user_id = 'c7000000-0000-4000-8000-000000000005'
  where project_id = 'c7000000-0000-4000-8000-00000000000a' and user_id = auth.uid();
  raise exception 'FAIL 1c: a member handed their membership to somebody else';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 1c: a membership stays with its person (%)', sqlerrm;
end
$$;

-- 1c2. Nor rewrite who invited them.
do $$
begin
  update public.agenda_members set invited_by = auth.uid()
  where project_id = 'c7000000-0000-4000-8000-00000000000a' and user_id = auth.uid();
  raise exception 'FAIL 1c2: a member rewrote who invited them';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 1c2: who invited a member is not theirs to change (%)', sqlerrm;
end
$$;

-- 1c3. Nor promote themselves.
do $$
begin
  update public.agenda_members set role = 'administrator'
  where project_id = 'c7000000-0000-4000-8000-00000000000a' and user_id = auth.uid();
  raise exception 'FAIL 1c3: a member made themselves an administrator';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 1c3: a member does not promote themselves (%)', sqlerrm;
end
$$;

-- 1c4. Even the owner does not hand one person's membership to another:
--      that is a new membership, with its own invitation.
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000001';
do $$
begin
  update public.agenda_members set user_id = 'c7000000-0000-4000-8000-000000000006'
  where project_id = 'c7000000-0000-4000-8000-00000000000a' and user_id = 'c7000000-0000-4000-8000-000000000002';
  raise exception 'FAIL 1c4: the owner handed a membership to somebody else';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 1c4: a membership stays with its person, whoever asks (%)', sqlerrm;
end
$$;

-- 1d. What a member may still do: accept, and leave.
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000003';
update public.agenda_members set status = 'active', accepted_at = now()
where project_id = 'c7000000-0000-4000-8000-00000000000a' and user_id = auth.uid();
do $$
begin
  if not public.agenda_is_member('c7000000-0000-4000-8000-00000000000a') then
    raise exception 'FAIL 1d: accepting an invitation no longer works';
  end if;
  raise notice 'ok 1d: an invited member still accepts';
end
$$;
update public.agenda_members set status = 'removed', removed_at = now()
where project_id = 'c7000000-0000-4000-8000-00000000000a' and user_id = auth.uid();
do $$
begin
  if public.agenda_is_member('c7000000-0000-4000-8000-00000000000a') then
    raise exception 'FAIL 1e: a member could not leave';
  end if;
  raise notice 'ok 1e: and a member may leave';
end
$$;
-- …and once gone, may not walk back in.
do $$
begin
  update public.agenda_members set status = 'active'
  where project_id = 'c7000000-0000-4000-8000-00000000000a' and user_id = auth.uid();
  if public.agenda_is_member('c7000000-0000-4000-8000-00000000000a') then
    raise exception 'FAIL 1f: having left, a member let themselves back in';
  end if;
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 1f: having left, a member does not let themselves back in (%)', sqlerrm;
end
$$;

-- 1g. The owner still manages the roster.
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000001';
update public.agenda_members set status = 'active', removed_at = null
where project_id = 'c7000000-0000-4000-8000-00000000000a' and user_id = 'c7000000-0000-4000-8000-000000000004';
reset role;
do $$
begin
  if not exists (select 1 from public.agenda_members where project_id = 'c7000000-0000-4000-8000-00000000000a'
                 and user_id = 'c7000000-0000-4000-8000-000000000004' and status = 'active') then
    raise exception 'FAIL 1g: the owner could not bring a member back';
  end if;
  update public.agenda_members set status = 'removed', removed_at = now()
  where project_id = 'c7000000-0000-4000-8000-00000000000a' and user_id = 'c7000000-0000-4000-8000-000000000004';
  raise notice 'ok 1g: the owner still brings people back';
end
$$;

-- @@INVITES@@

rollback;
