-- The verified badge cannot be self-granted.
--
-- Run after applying 0068. Prints one line per check and rolls itself back.
--
-- It matters that these run as `authenticated` rather than the SQL editor's
-- default role. A superuser bypasses row-level security *and* the
-- `current_user` test inside the guard, so a probe run as one reports that
-- everything is protected and proves nothing.

begin;

insert into auth.users (id, email, phone, phone_confirmed_at) values
  ('e0000000-0000-4000-8000-000000000001', 'liar@example.test',   '+251900000001', null),
  ('e0000000-0000-4000-8000-000000000002', 'honest@example.test', '+251900000002', now()),
  ('e0000000-0000-4000-8000-000000000003', 'other@example.test',  '+251900000003', now())
on conflict (id) do nothing;

-- The liar has typed a phone number into their profile and never confirmed a
-- code. This is the case the brief names outright — "should NOT receive the
-- verified badge simply because they enter a phone number" — and it is the
-- only fixture that can tell the two sources of truth apart.
--
-- Without it, an implementation reading profiles.phone instead of
-- auth.users.phone_confirmed_at passes every check here, because a profile
-- with no phone at all answers false either way. That version was written and
-- did pass, which is how this fixture came to exist.
insert into public.profiles (id, username, full_name, phone) values
  ('e0000000-0000-4000-8000-000000000001', 'probe_liar', 'Probe Liar', '+251900000001'),
  ('e0000000-0000-4000-8000-000000000002', 'probe_honest', 'Probe Honest', '+251900000002'),
  ('e0000000-0000-4000-8000-000000000003', 'probe_other', 'Probe Other', '+251900000003')
on conflict (id) do nothing;

-- ===================================================================
-- 1. A member cannot award themselves the badge.
-- ===================================================================
set role authenticated;
set local request.jwt.claim.sub = 'e0000000-0000-4000-8000-000000000001';

do $$
begin
  update public.profiles set phone_verified = true where id = auth.uid();
  raise notice '1. FAIL — a member set their own phone_verified';
exception when others then
  raise notice '1. PASS — phone_verified refused from an API session';
end $$;

do $$
begin
  update public.profiles set verification_status = 'verified' where id = auth.uid();
  raise notice '2. FAIL — a member set their own verification_status';
exception when others then
  raise notice '2. PASS — verification_status refused from an API session';
end $$;

-- Everything else about their own profile still works. A guard that froze the
-- whole row would be a different bug.
update public.profiles set full_name = 'Renamed By Owner' where id = auth.uid();
select '3. the rest of the profile is still editable' as step,
       full_name = 'Renamed By Owner' as should_be_true
from public.profiles where id = 'e0000000-0000-4000-8000-000000000001';

-- ===================================================================
-- 4. The function is the only way in, and it tells the truth.
-- ===================================================================
select '4. an unconfirmed phone does not earn the badge' as step,
       phone_verified = false as should_be_true
from public.sync_phone_verification();

select '4b. and the status stays unverified' as step,
       verification_status = 'unverified' as should_be_true
from public.sync_phone_verification();

-- Said explicitly, because it is the whole point: this profile *has* a phone
-- number on it. Typing one in is not verification.
select '4c. a typed phone number is not a confirmed one' as step,
       (select phone is not null from public.profiles where id = auth.uid())
         and not (select phone_verified from public.sync_phone_verification())
       as should_be_true;

-- ===================================================================
-- 5. A confirmed phone does earn it.
-- ===================================================================
reset role;
set role authenticated;
set local request.jwt.claim.sub = 'e0000000-0000-4000-8000-000000000002';

select '5. a confirmed phone earns the badge' as step,
       phone_verified = true as should_be_true
from public.sync_phone_verification();

select '5b. and the status follows' as step,
       verification_status = 'verified' as should_be_true
from public.sync_phone_verification();

select '5c. calling it twice is calling it once' as step,
       phone_verified = true as should_be_true
from public.sync_phone_verification();

-- ===================================================================
-- 6. It only ever touches the caller's own row.
-- ===================================================================
select '6. the liar is still unverified' as step,
       phone_verified = false as should_be_true
from public.profiles where id = 'e0000000-0000-4000-8000-000000000001';

-- ===================================================================
-- 7. Nobody can verify somebody else.
--
-- Asserted on the outcome, not on an exception. Row-level security *filters*
-- rather than refuses: an update aimed at another member's row matches zero
-- rows and succeeds quietly. Expecting it to raise was the wrong test — it
-- reported a failure while the row was in fact untouched.
-- ===================================================================
with attempted as (
  update public.profiles
  set phone_verified = true
  where id = 'e0000000-0000-4000-8000-000000000001'
  returning 1
)
select '7. verifying another account changes nothing' as step,
       count(*) = 0 as should_be_true
from attempted;

select '7b. and that account is still unverified' as step,
       phone_verified = false as should_be_true
from public.profiles where id = 'e0000000-0000-4000-8000-000000000001';

-- ===================================================================
-- 8. Losing the confirmation loses the badge.
-- ===================================================================
reset role;
update auth.users set phone_confirmed_at = null
where id = 'e0000000-0000-4000-8000-000000000002';

set role authenticated;
set local request.jwt.claim.sub = 'e0000000-0000-4000-8000-000000000002';

select '8. a revoked confirmation revokes the badge' as step,
       phone_verified = false as should_be_true
from public.sync_phone_verification();

-- ===================================================================
-- 9. A profile under review is left in review, not demoted.
-- ===================================================================
reset role;
update public.profiles set verification_status = 'pending'
where id = 'e0000000-0000-4000-8000-000000000003';

set role authenticated;
set local request.jwt.claim.sub = 'e0000000-0000-4000-8000-000000000003';
reset role;
update auth.users set phone_confirmed_at = null
where id = 'e0000000-0000-4000-8000-000000000003';
set role authenticated;
set local request.jwt.claim.sub = 'e0000000-0000-4000-8000-000000000003';

select '9. a profile in review stays in review' as step,
       verification_status = 'pending' as should_be_true
from public.sync_phone_verification();

rollback;
