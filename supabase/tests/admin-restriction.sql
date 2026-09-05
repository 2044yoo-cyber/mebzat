-- Restricting an account — what an admin, a member and a suspect can each do.
--
-- Run this in the Supabase SQL editor after applying 0063. It prints one line
-- per check and rolls itself back.
--
-- It matters that it runs as `authenticated`, not as the editor's default
-- role: a superuser bypasses row-level security and every trigger check here,
-- so a probe run as one reports that every rule works and proves nothing.
--
-- The rule this file exists for: an account that can clear its own restriction
-- is not restricted.
--
-- One warning about where you run it. Section 2 needs `authenticated` to hold
-- UPDATE on public.profiles — which Supabase grants and a hand-built local
-- shim may not. Without the grant the self-clear fails with "permission denied"
-- and this file reports a pass it has not earned: the trigger was never
-- reached. That is how a `security definer` trigger function, which can never
-- see the caller's role and so could never fire, looked correct for an hour.
-- If section 2 passes, check that the grant is there before believing it.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'admin@example.test'),
  ('a0000000-0000-4000-8000-000000000002', 'member@example.test'),
  ('a0000000-0000-4000-8000-000000000003', 'suspect@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, username, full_name, is_admin) values
  ('a0000000-0000-4000-8000-000000000001', 'probe_admin', 'Probe Admin', true),
  ('a0000000-0000-4000-8000-000000000002', 'probe_member', 'Probe Member', false),
  ('a0000000-0000-4000-8000-000000000003', 'probe_suspect', 'Probe Suspect', false)
on conflict (id) do update set is_admin = excluded.is_admin;

-- ===================================================================
-- 1. An admin restricts somebody.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000001';

select public.set_account_restriction(
  'a0000000-0000-4000-8000-000000000003', now() + interval '7 days', 'Repeated listings');

select '1. the account is restricted' as step,
       public.account_is_restricted('a0000000-0000-4000-8000-000000000003') as should_be_true;

reset role;
select '1b. and the reason was recorded' as step, restriction_reason
from public.profiles where id = 'a0000000-0000-4000-8000-000000000003';

-- ===================================================================
-- 2. The suspect cannot lift it.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000003';

do $$ begin
  update public.profiles set restricted_until = null
  where id = 'a0000000-0000-4000-8000-000000000003';
  raise notice '2. A RESTRICTED ACCOUNT CLEARED ITS OWN RESTRICTION — trigger failed';
exception when others then
  raise notice '2. a restricted account cannot clear its own restriction';
end $$;

do $$ begin
  perform public.set_account_restriction('a0000000-0000-4000-8000-000000000003', null, null);
  raise notice '2b. A NON-ADMIN CALLED THE FUNCTION — check failed';
exception when others then
  raise notice '2b. a non-admin cannot call set_account_restriction';
end $$;

reset role;
select '2c. still restricted after both attempts' as step,
       public.account_is_restricted('a0000000-0000-4000-8000-000000000003') as should_be_true;

-- ===================================================================
-- 3. Nor can anybody else, including restricting a stranger.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000002';

do $$ begin
  perform public.set_account_restriction(
    'a0000000-0000-4000-8000-000000000001', now() + interval '1 day', 'nice try');
  raise notice '3. A MEMBER RESTRICTED AN ADMIN — check failed';
exception when others then
  raise notice '3. a member cannot restrict anybody';
end $$;

reset role;
select '3b. the admin is not restricted' as step,
       public.account_is_restricted('a0000000-0000-4000-8000-000000000001') as should_be_false;

-- ===================================================================
-- 4. An admin cannot lock themselves out.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000001';

do $$ begin
  perform public.set_account_restriction(
    'a0000000-0000-4000-8000-000000000001', now() + interval '1 day', 'oops');
  raise notice '4. AN ADMIN RESTRICTED THEMSELVES — check failed';
exception when others then
  raise notice '4. an admin cannot restrict their own account';
end $$;

-- ===================================================================
-- 5. Lifting it, and expiry.
-- ===================================================================
select public.set_account_restriction('a0000000-0000-4000-8000-000000000003', null, null);
reset role;
select '5. lifting the restriction clears it' as step,
       public.account_is_restricted('a0000000-0000-4000-8000-000000000003') as should_be_false;
select '5b. and clears the reason too' as step,
       restriction_reason is null as should_be_true
from public.profiles where id = 'a0000000-0000-4000-8000-000000000003';

-- A restriction whose date has passed is not a restriction. An account that
-- stays restricted after its expiry is a support ticket nobody can resolve.
update public.profiles set restricted_until = now() - interval '1 hour'
where id = 'a0000000-0000-4000-8000-000000000003';
select '5c. an expired restriction is not one' as step,
       public.account_is_restricted('a0000000-0000-4000-8000-000000000003') as should_be_false;

rollback;
