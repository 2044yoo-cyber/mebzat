-- One owner, sub-administrators, and what each of them may do.
--
-- Run this in the Supabase SQL editor after applying 0064. It prints one line
-- per check and rolls itself back.
--
-- It matters that it runs as `authenticated`, not as the editor's default
-- role: a superuser bypasses row-level security and every check in these
-- functions, so a probe run as one reports that every rule works and proves
-- nothing.
--
-- The rules this file exists for: a sub-administrator cannot promote
-- themselves, cannot grant themselves an area, and cannot remove the owner.

begin;

insert into auth.users (id, email) values
  ('c0000000-0000-4000-8000-000000000001', 'owner@example.test'),
  ('c0000000-0000-4000-8000-000000000002', 'reports@example.test'),
  ('c0000000-0000-4000-8000-000000000003', 'outsider@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, username, full_name) values
  ('c0000000-0000-4000-8000-000000000001', 'probe_owner', 'Probe Owner'),
  ('c0000000-0000-4000-8000-000000000002', 'probe_reports', 'Probe Reports'),
  ('c0000000-0000-4000-8000-000000000003', 'probe_outsider', 'Probe Outsider')
on conflict (id) do nothing;

-- The owner is appointed by someone with database access, which is the only
-- way it can be done. Everything after this happens as an ordinary API role.
delete from public.admin_members;
insert into public.admin_members (user_id, is_owner, areas)
values ('c0000000-0000-4000-8000-000000000001', true, '{}');

select '0. the owner is flagged on their profile' as step, is_admin as should_be_true
from public.profiles where id = 'c0000000-0000-4000-8000-000000000001';

-- ===================================================================
-- 1. The owner may do everything without being granted anything.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000001';

select '1. the owner may moderate' as step, public.admin_can('moderation') as should_be_true;
select '1b. and may reach users' as step, public.admin_can('users') as should_be_true;
select '1c. and holds every area' as step,
       array_length(public.my_admin_areas(), 1) = array_length(enum_range(null::public.admin_area), 1) as should_be_true;

-- ===================================================================
-- 2. The owner adds somebody for reports only.
-- ===================================================================
select public.set_admin_member(
  'c0000000-0000-4000-8000-000000000002', array['moderation']::public.admin_area[]);

reset role;
select '2. the new administrator is flagged on their profile' as step, is_admin as should_be_true
from public.profiles where id = 'c0000000-0000-4000-8000-000000000002';

set role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000002';
select '2b. they may moderate' as step, public.admin_can('moderation') as should_be_true;
select '2c. and may not reach users' as step, public.admin_can('users') as should_be_false;
select '2d. nor prices' as step, public.admin_can('prices') as should_be_false;
select '2e. they hold exactly one area' as step,
       array_length(public.my_admin_areas(), 1) as should_be_1;

-- ===================================================================
-- 3. A sub-administrator cannot promote themselves.
-- ===================================================================
do $$ begin
  perform public.set_admin_member(
    'c0000000-0000-4000-8000-000000000002',
    enum_range(null::public.admin_area));
  raise notice '3. A SUB-ADMIN GRANTED THEMSELVES EVERY AREA — check failed';
exception when others then
  raise notice '3. a sub-administrator cannot grant themselves anything';
end $$;

do $$ begin
  update public.admin_members set is_owner = true
  where user_id = 'c0000000-0000-4000-8000-000000000002';
  raise notice '3b. A SUB-ADMIN MADE THEMSELVES OWNER — no write policy failed';
exception when others then
  raise notice '3b. a sub-administrator cannot write the table directly';
end $$;

do $$ begin
  perform public.remove_admin_member('c0000000-0000-4000-8000-000000000001');
  raise notice '3c. A SUB-ADMIN REMOVED THE OWNER — check failed';
exception when others then
  raise notice '3c. a sub-administrator cannot remove the owner';
end $$;

select '3d. still only one area after all that' as step,
       array_length(public.my_admin_areas(), 1) as should_be_1;

-- ===================================================================
-- 4. Somebody who is not an administrator at all.
-- ===================================================================
reset role; set role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000003';

select '4. an outsider may do nothing' as step, public.admin_can('moderation') as should_be_false;
select '4b. and holds no areas' as step, public.my_admin_areas() is null as should_be_true;
select '4c. and cannot see the team' as step, count(*) as should_be_0 from public.admin_members;

do $$ begin
  perform public.set_admin_member(
    'c0000000-0000-4000-8000-000000000003', enum_range(null::public.admin_area));
  raise notice '4d. AN OUTSIDER APPOINTED THEMSELVES — check failed';
exception when others then
  raise notice '4d. an outsider cannot appoint themselves';
end $$;

-- ===================================================================
-- 5. The owner cannot be edited or removed, even by themselves.
-- ===================================================================
reset role; set role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000001';

do $$ begin
  perform public.set_admin_member('c0000000-0000-4000-8000-000000000001', '{}');
  raise notice '5. THE OWNER EDITED THEIR OWN ACCESS — check failed';
exception when others then
  raise notice '5. the owner cannot change their own access';
end $$;

do $$ begin
  perform public.remove_admin_member('c0000000-0000-4000-8000-000000000001');
  raise notice '5b. THE OWNER WAS REMOVED — check failed';
exception when others then
  raise notice '5b. the owner cannot be removed';
end $$;

-- ===================================================================
-- 6. Changing and removing a sub-administrator.
-- ===================================================================
select public.set_admin_member(
  'c0000000-0000-4000-8000-000000000002',
  array['moderation','properties']::public.admin_area[]);

reset role; set role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000002';
select '6. their areas were widened' as step,
       public.admin_can('properties') as should_be_true;

reset role; set role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000001';
select public.remove_admin_member('c0000000-0000-4000-8000-000000000002');

reset role;
select '6b. removing them clears the profile flag' as step,
       is_admin as should_be_false
from public.profiles where id = 'c0000000-0000-4000-8000-000000000002';

-- Two owners is an argument nobody can settle.
do $$ begin
  insert into public.admin_members (user_id, is_owner, areas)
  values ('c0000000-0000-4000-8000-000000000003', true, '{}');
  raise notice '6c. A SECOND OWNER WAS ALLOWED — unique index failed';
exception when unique_violation then
  raise notice '6c. there can only be one owner';
end $$;

-- ===================================================================
-- 7. is_admin is still not writable from a session.
--
-- 0064 corrects the guard from 0021 so that privileged code can keep the flag
-- in step with the team. This is the assertion that the correction did not
-- open the door it was protecting.
-- ===================================================================
reset role; set role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000003';

do $$ begin
  update public.profiles set is_admin = true
  where id = 'c0000000-0000-4000-8000-000000000003';
  raise notice '7. AN ORDINARY ACCOUNT MADE ITSELF ADMIN — guard failed';
exception when others then
  raise notice '7. an ordinary account still cannot set is_admin';
end $$;

reset role;
select '7b. and it is still not an administrator' as step, is_admin as should_be_false
from public.profiles where id = 'c0000000-0000-4000-8000-000000000003';

rollback;
