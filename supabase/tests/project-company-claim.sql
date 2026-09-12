-- A project can name the business it was built by, and only somebody who
-- actually belongs to that business can name it.
--
-- Run after applying 0080. Prints one line per check and rolls itself back.
-- Run as `authenticated`: the guard is about who is making the change, and a
-- superuser run would report it working when it permits everything.

begin;

insert into auth.users (id, email) values
  ('99900000-0000-4000-8000-000000000001', 'owner@example.test'),
  ('99900000-0000-4000-8000-000000000002', 'member@example.test'),
  ('99900000-0000-4000-8000-000000000003', 'invitee@example.test'),
  ('99900000-0000-4000-8000-000000000004', 'stranger@example.test')
on conflict (id) do nothing;

update public.profiles set username = 'probe_co_owner' where id = '99900000-0000-4000-8000-000000000001';
update public.profiles set username = 'probe_co_member' where id = '99900000-0000-4000-8000-000000000002';
update public.profiles set username = 'probe_co_invitee' where id = '99900000-0000-4000-8000-000000000003';
update public.profiles set username = 'probe_stranger' where id = '99900000-0000-4000-8000-000000000004';

insert into public.companies (id, slug, name, owner_id)
values ('aaa00000-0000-4000-8000-000000000001', 'probe-builders', 'Probe Builders',
        '99900000-0000-4000-8000-000000000001');

insert into public.company_members (company_id, user_id, status) values
  ('aaa00000-0000-4000-8000-000000000001', '99900000-0000-4000-8000-000000000002', 'active'),
  ('aaa00000-0000-4000-8000-000000000001', '99900000-0000-4000-8000-000000000003', 'invited');

-- ===================================================================
-- 1. A project with no company is the ordinary case and is untouched.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = '99900000-0000-4000-8000-000000000004';

insert into public.projects (id, owner_id, title, slug)
values ('bbb00000-0000-4000-8000-000000000001',
        '99900000-0000-4000-8000-000000000004', 'A personal project', 'personal-probe');

do $$
declare p public.projects;
begin
  select * into p from public.projects where id = 'bbb00000-0000-4000-8000-000000000001';
  if p.company_id is not null then
    raise exception 'FAIL 1a: a project acquired a company nobody asked for';
  end if;
  raise notice 'ok 1a: most projects are somebody''s own work and name no company';
end;
$$;

-- ===================================================================
-- 2. A stranger cannot publish work in a business's name.
--
--    0004's update policy says who may edit the row. It says nothing at
--    all about which company they may write into it, so without the
--    guard anybody could attach their project to any business in the
--    directory and have it appear as that business's work.
-- ===================================================================
do $$
begin
  begin
    update public.projects set company_id = 'aaa00000-0000-4000-8000-000000000001'
    where id = 'bbb00000-0000-4000-8000-000000000001';
    raise exception 'FAIL 2a: a stranger attached their project to somebody else''s company';
  exception
    when insufficient_privilege then
      raise notice 'ok 2a: a stranger cannot publish work in a business''s name';
  end;
end;
$$;

-- ===================================================================
-- 3. An invitation that was never accepted is not membership.
-- ===================================================================
set local request.jwt.claim.sub = '99900000-0000-4000-8000-000000000003';

insert into public.projects (id, owner_id, title, slug)
values ('bbb00000-0000-4000-8000-000000000002',
        '99900000-0000-4000-8000-000000000003', 'Invitee project', 'invitee-probe');

do $$
begin
  begin
    update public.projects set company_id = 'aaa00000-0000-4000-8000-000000000001'
    where id = 'bbb00000-0000-4000-8000-000000000002';
    raise exception 'FAIL 3a: somebody with an outstanding invitation claimed the company';
  exception
    when insufficient_privilege then
      raise notice 'ok 3a: an invitation nobody accepted is not permission';
  end;
end;
$$;

-- ===================================================================
-- 4. An active member can, and so can the owner.
-- ===================================================================
set local request.jwt.claim.sub = '99900000-0000-4000-8000-000000000002';

insert into public.projects (id, owner_id, title, slug, company_id)
values ('bbb00000-0000-4000-8000-000000000003',
        '99900000-0000-4000-8000-000000000002', 'Member project', 'member-probe',
        'aaa00000-0000-4000-8000-000000000001');

do $$
declare p public.projects;
begin
  select * into p from public.projects where id = 'bbb00000-0000-4000-8000-000000000003';
  if p.company_id is null then
    raise exception 'FAIL 4a: an active member could not attach their own company';
  end if;
  raise notice 'ok 4a: an active member can publish work in the company''s name';
end;
$$;

set local request.jwt.claim.sub = '99900000-0000-4000-8000-000000000001';

insert into public.projects (id, owner_id, title, slug, company_id)
values ('bbb00000-0000-4000-8000-000000000004',
        '99900000-0000-4000-8000-000000000001', 'Owner project', 'owner-probe',
        'aaa00000-0000-4000-8000-000000000001');

do $$
declare n integer;
begin
  select count(*) into n from public.projects
  where id = 'bbb00000-0000-4000-8000-000000000004' and company_id is not null;
  if n <> 1 then
    raise exception 'FAIL 4b: the company owner could not attach their own company';
  end if;
  raise notice 'ok 4b: and so can the owner';

  -- Taking it off again is always allowed: it is a claim being withdrawn.
  update public.projects set company_id = null
  where id = 'bbb00000-0000-4000-8000-000000000004';
  raise notice 'ok 4c: and can take it off again';
end;
$$;

-- ===================================================================
-- 5. The link survives the company being removed.
--
--    `on delete set null`, not cascade: deleting a business must not
--    delete the portfolio of every person who ever worked for it.
-- ===================================================================
reset role;
delete from public.companies where id = 'aaa00000-0000-4000-8000-000000000001';

do $$
declare n integer;
begin
  select count(*) into n from public.projects
  where id = 'bbb00000-0000-4000-8000-000000000003';
  if n <> 1 then
    raise exception 'FAIL 5a: deleting a company deleted somebody''s project';
  end if;
  raise notice 'ok 5a: deleting a business does not delete the work people did for it';
end;
$$;

rollback;
