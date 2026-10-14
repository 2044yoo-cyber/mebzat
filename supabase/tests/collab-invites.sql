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

-- ===================================================================
-- 2. Invitation links.
-- ===================================================================
set role authenticated;

-- 2a. The owner makes one, and it is recorded as theirs whatever is sent.
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000001';
insert into public.collab_invites (id, project_id, token_hash, level, role, max_uses, created_by, uses)
values ('c7000000-0000-4000-8000-0000000000a1', 'c7000000-0000-4000-8000-00000000000a', public.collab_token_hash('tok_viewer_link_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
        'viewer', 'engineer', 1, 'c7000000-0000-4000-8000-000000000002', 7);
do $$
declare row public.collab_invites%rowtype;
begin
  select * into row from public.collab_invites where id = 'c7000000-0000-4000-8000-0000000000a1';
  if row.created_by <> 'c7000000-0000-4000-8000-000000000001' or row.uses <> 0 then
    raise exception 'FAIL 2a: a link was stamped with what was sent (by %, used %)', row.created_by, row.uses;
  end if;
  if row.token_hash = 'tok_viewer_link_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' or row.token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'FAIL 2a: the token itself is stored';
  end if;
  raise notice 'ok 2a: the owner makes a link; only a hash of its token is kept';
end
$$;

-- 2b. What a link may never be.
do $$
declare attempt text;
begin
  foreach attempt in array array[
    'client role', 'administrator role', 'owner level', 'forty days', 'no uses', 'too many uses', 'token not a hash'
  ] loop
    begin
      insert into public.collab_invites (project_id, token_hash, level, role, max_uses, expires_at)
      values ('c7000000-0000-4000-8000-00000000000a',
        case when attempt = 'token not a hash' then 'secret' else md5(attempt) || md5(attempt) end,
        case when attempt = 'owner level' then 'owner'::public.collab_access_level else 'commenter' end,
        case attempt when 'client role' then 'client'::public.agenda_role
                     when 'administrator role' then 'administrator'::public.agenda_role
                     else 'employee' end,
        case attempt when 'no uses' then 0 when 'too many uses' then 101 else 1 end,
        now() + case when attempt = 'forty days' then interval '40 days' else interval '7 days' end);
      raise exception 'FAIL 2b: a link with % was accepted', attempt;
    exception when others then
      if sqlerrm like 'FAIL%' then raise; end if;
    end;
  end loop;
  raise notice 'ok 2b: no link makes an owner, an administrator or a client; none lasts past 30 days or opens to everybody';
end
$$;

-- 2c. Somebody on the project who is not its owner neither makes links nor sees them.
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000002';
do $$
begin
  if exists (select 1 from public.collab_invites) then
    raise exception 'FAIL 2c: a member who is not the owner can see the links';
  end if;
  begin
    insert into public.collab_invites (project_id, token_hash) values ('c7000000-0000-4000-8000-00000000000a', md5('m') || md5('m'));
    raise exception 'FAIL 2c: a member who is not the owner made a link';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'ok 2c: only the owner makes and sees links';
end
$$;

-- 2d. Read before use: what it is for, and nothing for a token that is wrong.
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000006';
do $$
declare preview record;
begin
  select * into preview from public.collab_invite_preview('tok_viewer_link_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  if preview.state is distinct from 'ok' or preview.project_name <> 'Villa extension'
     or preview.level <> 'viewer' or preview.invited_by is null then
    raise exception 'FAIL 2d: the preview says % / % / %', preview.state, preview.project_name, preview.level;
  end if;
  if exists (select 1 from public.collab_invite_preview('tok_nothing_like_it_zzzzzzzzzzzzzzzzzzzzzzzz')) then
    raise exception 'FAIL 2d: a token that matches nothing previews something';
  end if;
  if exists (select 1 from public.collab_invites) then
    raise exception 'FAIL 2d: somebody holding a link can read the links table';
  end if;
  raise notice 'ok 2d: a link says what it is for before it is used, and nothing else is visible';
end
$$;

-- 2e. Used: on the project, at the level and role the link names, and no more.
select public.collab_accept_invite('tok_viewer_link_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
do $$
begin
  if public.collab_level('c7000000-0000-4000-8000-00000000000a') is distinct from 'viewer' then
    raise exception 'FAIL 2e: joined at %, not viewer', public.collab_level('c7000000-0000-4000-8000-00000000000a');
  end if;
  if public.agenda_is_owner('c7000000-0000-4000-8000-00000000000a') then
    raise exception 'FAIL 2e: a link made somebody an owner';
  end if;
  if not exists (select 1 from public.agenda_members where project_id = 'c7000000-0000-4000-8000-00000000000a' and user_id = auth.uid()
                 and status = 'active' and role = 'engineer' and invited_by = 'c7000000-0000-4000-8000-000000000001'
                 and not can_view_finance and not can_approve) then
    raise exception 'FAIL 2e: the membership is not what the link said';
  end if;
  raise notice 'ok 2e: the link makes an active engineer at the viewer level, with no confidential access';
end
$$;
reset role;
do $$
begin
  if not exists (select 1 from public.collab_access where project_id = 'c7000000-0000-4000-8000-00000000000a' and user_id = 'c7000000-0000-4000-8000-000000000006'
                 and granted_by = 'c7000000-0000-4000-8000-000000000001' and invite_id = 'c7000000-0000-4000-8000-0000000000a1') then
    raise exception 'FAIL 2f: the level does not say which link, or whose, gave it';
  end if;
  if (select uses from public.collab_invites where id = 'c7000000-0000-4000-8000-0000000000a1') <> 1 then
    raise exception 'FAIL 2f: the use was not counted';
  end if;
  if not exists (select 1 from public.agenda_events where project_id = 'c7000000-0000-4000-8000-00000000000a' and kind = 'collab'
                 and actor_id = 'c7000000-0000-4000-8000-000000000006' and title like '%joined with an invitation link') then
    raise exception 'FAIL 2f: joining is not in the project''s history';
  end if;
  raise notice 'ok 2f: recorded as given by the owner through that link, counted, and in the history';
end
$$;
set role authenticated;

-- 2g. Used again by the same person: nothing changes, no place is used.
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000006';
select public.collab_accept_invite('tok_viewer_link_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
do $$
begin
  if public.collab_level('c7000000-0000-4000-8000-00000000000a') is distinct from 'viewer' then
    raise exception 'FAIL 2g: using a link again changed the level';
  end if;
  raise notice 'ok 2g: somebody already in who uses the link again keeps what they have';
end
$$;

-- 2h. A one-person link, already used, does not let a second person in.
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000007';
do $$
begin
  perform public.collab_accept_invite('tok_viewer_link_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  raise exception 'FAIL 2h: a used-up link let a second person in';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  if public.agenda_is_member('c7000000-0000-4000-8000-00000000000a') then raise exception 'FAIL 2h: and they are a member'; end if;
  if sqlerrm not like '%already been used%' then raise exception 'FAIL 2h: turned away for the wrong reason: %', sqlerrm; end if;
  raise notice 'ok 2h: a used-up link turns the next person away (%)', sqlerrm;
end
$$;

-- 2i. Somebody invited by email who then uses a link: accepted, as the role
--     they were invited as, at the link's level.
reset role;
insert into public.agenda_members (project_id, user_id, role, status)
values ('c7000000-0000-4000-8000-00000000000a', 'c7000000-0000-4000-8000-000000000007', 'contractor', 'invited');
set role authenticated;
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000001';
insert into public.collab_invites (id, project_id, token_hash, level, role, max_uses)
values ('c7000000-0000-4000-8000-0000000000a2', 'c7000000-0000-4000-8000-00000000000a', public.collab_token_hash('tok_editor_link_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), 'editor', 'engineer', 5);
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000007';
select public.collab_accept_invite('tok_editor_link_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
do $$
begin
  if not exists (select 1 from public.agenda_members where project_id = 'c7000000-0000-4000-8000-00000000000a' and user_id = auth.uid()
                 and status = 'active' and role = 'contractor') then
    raise exception 'FAIL 2i: an emailed invitation was not accepted as invited';
  end if;
  if public.collab_level('c7000000-0000-4000-8000-00000000000a') is distinct from 'editor' then
    raise exception 'FAIL 2i: the link''s level was not given';
  end if;
  raise notice 'ok 2i: an emailed invitation is accepted by the link, as the role it named';
end
$$;

-- 2j. Somebody the owner removed is not let back in by a link.
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000001';
insert into public.collab_invites (id, project_id, token_hash, level, max_uses)
values ('c7000000-0000-4000-8000-0000000000a4', 'c7000000-0000-4000-8000-00000000000a', public.collab_token_hash('tok_leaver_link_dddddddddddddddddddddddddddddddddd'), 'commenter', 5);
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000004';
do $$
begin
  if (select state from public.collab_invite_preview('tok_leaver_link_dddddddddddddddddddddddddddddddddd')) is distinct from 'removed' then
    raise exception 'FAIL 2j: the preview does not say they were removed';
  end if;
  perform public.collab_accept_invite('tok_leaver_link_dddddddddddddddddddddddddddddddddd');
  raise exception 'FAIL 2j: a removed member came back through a link';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  if public.agenda_is_member('c7000000-0000-4000-8000-00000000000a') then raise exception 'FAIL 2j: and they are a member'; end if;
  if sqlerrm not like 'Your access to this project was removed%' then raise exception 'FAIL 2j: turned away for the wrong reason: %', sqlerrm; end if;
  raise notice 'ok 2j: a removed member is not let back in by a link (%)', sqlerrm;
end
$$;

-- 2k. An expired link opens nothing.
reset role;
alter table public.collab_invites disable trigger collab_invite_guard;
insert into public.collab_invites (project_id, token_hash, created_by, created_at, expires_at)
values ('c7000000-0000-4000-8000-00000000000a', public.collab_token_hash('tok_expired_link_cccccccccccccccccccccccccccccccccc'), 'c7000000-0000-4000-8000-000000000001', now() - interval '10 days', now() - interval '1 day');
alter table public.collab_invites enable trigger collab_invite_guard;
set role authenticated;
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000005';
do $$
begin
  if (select state from public.collab_invite_preview('tok_expired_link_cccccccccccccccccccccccccccccccccc')) is distinct from 'expired' then
    raise exception 'FAIL 2k: the preview does not say it has expired';
  end if;
  perform public.collab_accept_invite('tok_expired_link_cccccccccccccccccccccccccccccccccc');
  raise exception 'FAIL 2k: an expired link let somebody in';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  if public.agenda_is_member('c7000000-0000-4000-8000-00000000000a') then raise exception 'FAIL 2k: and they are a member'; end if;
  raise notice 'ok 2k: an expired link opens nothing (%)', sqlerrm;
end
$$;

-- 2l. Withdrawn: stamped as the owner's, final, and nobody gets in by it.
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000005';
-- No WHERE: row security then asks only the update policy, not the read one.
update public.collab_invites set revoked_at = now();
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000001';
do $$
begin
  if (select revoked_at from public.collab_invites where id = 'c7000000-0000-4000-8000-0000000000a2') is not null then
    raise exception 'FAIL 2l: somebody else''s owner withdrew this project''s link';
  end if;
end
$$;
update public.collab_invites set revoked_at = now(), revoked_by = 'c7000000-0000-4000-8000-000000000002' where id = 'c7000000-0000-4000-8000-0000000000a2';
do $$
begin
  if (select revoked_by from public.collab_invites where id = 'c7000000-0000-4000-8000-0000000000a2') is distinct from 'c7000000-0000-4000-8000-000000000001' then
    raise exception 'FAIL 2l: the withdrawal is not stamped as the owner''s';
  end if;
  begin
    update public.collab_invites set revoked_at = null where id = 'c7000000-0000-4000-8000-0000000000a2';
    raise exception 'FAIL 2l: a withdrawn link was put back';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    update public.collab_invites set level = 'editor' where id = 'c7000000-0000-4000-8000-0000000000a4';
    raise exception 'FAIL 2l: a link was edited after it was sent';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    update public.collab_invites set uses = uses + 2 where id = 'c7000000-0000-4000-8000-0000000000a4';
    raise exception 'FAIL 2l: a link''s count jumped';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    delete from public.collab_invites where id = 'c7000000-0000-4000-8000-0000000000a4';
    raise exception 'FAIL 2l: a link was deleted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'ok 2l: a link is withdrawn by its owner, stays withdrawn, is never edited or deleted';
end
$$;
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000005';
do $$
begin
  perform public.collab_accept_invite('tok_editor_link_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  raise exception 'FAIL 2m: a withdrawn link let somebody in';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  if public.agenda_is_member('c7000000-0000-4000-8000-00000000000a') then raise exception 'FAIL 2m: and they are a member'; end if;
  raise notice 'ok 2m: a withdrawn link opens nothing (%)', sqlerrm;
end
$$;

-- 2o. A level cannot be credited to another project's link.
set role authenticated;
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000005';
insert into public.collab_invites (id, project_id, token_hash)
values ('c7000000-0000-4000-8000-0000000000b1', 'c7000000-0000-4000-8000-00000000000b', md5('other') || md5('other'));
reset role;
insert into public.agenda_members (project_id, user_id, role, status)
values ('c7000000-0000-4000-8000-00000000000a', 'c7000000-0000-4000-8000-000000000005', 'employee', 'invited');
set role authenticated;
set local request.jwt.claim.sub = 'c7000000-0000-4000-8000-000000000001';
do $$
begin
  insert into public.collab_access (project_id, user_id, level, invite_id)
  values ('c7000000-0000-4000-8000-00000000000a', 'c7000000-0000-4000-8000-000000000005', 'viewer', 'c7000000-0000-4000-8000-0000000000b1');
  raise exception 'FAIL 2o: a level was credited to another project''s link';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 2o: a level is credited only to a link of the same project (%)', sqlerrm;
end
$$;

-- 2p. Signed in as nobody — a request with no subject — is not signed in.
set local request.jwt.claim.sub = '';
do $$
begin
  if exists (select 1 from public.collab_invite_preview('tok_leaver_link_dddddddddddddddddddddddddddddddddd')) then
    raise exception 'FAIL 2p: a link is described to nobody';
  end if;
  perform public.collab_accept_invite('tok_leaver_link_dddddddddddddddddddddddddddddddddd');
  raise exception 'FAIL 2p: nobody used a link';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  if sqlerrm not like 'Sign in%' then raise exception 'FAIL 2p: refused for the wrong reason: %', sqlerrm; end if;
  raise notice 'ok 2p: with no signed-in person a link describes nothing and opens nothing';
end
$$;
reset role;

-- 2n. Without a sign-in: nothing.
reset role;
set role anon;
do $$
begin
  begin
    perform 1 from public.collab_invites;
    raise exception 'FAIL 2n: anon reads the links';
  exception when insufficient_privilege then
    -- PostgreSQL's own refusal, not the function's: anon may not call it at all.
    if sqlerrm not like 'permission denied%' then raise exception 'FAIL 2n: anon got as far as %', sqlerrm; end if;
  end;
  begin
    perform public.collab_accept_invite('tok_leaver_link_dddddddddddddddddddddddddddddddddd');
    raise exception 'FAIL 2n: anon uses a link';
  exception when insufficient_privilege then
    -- PostgreSQL's own refusal, not the function's: anon may not call it at all.
    if sqlerrm not like 'permission denied%' then raise exception 'FAIL 2n: anon got as far as %', sqlerrm; end if;
  end;
  begin
    perform * from public.collab_invite_preview('tok_leaver_link_dddddddddddddddddddddddddddddddddd');
    raise exception 'FAIL 2n: anon previews a link';
  exception when insufficient_privilege then
    -- PostgreSQL's own refusal, not the function's: anon may not call it at all.
    if sqlerrm not like 'permission denied%' then raise exception 'FAIL 2n: anon got as far as %', sqlerrm; end if;
  end;
  raise notice 'ok 2n: without a sign-in a link neither opens nor describes anything';
end
$$;
reset role;

rollback;
