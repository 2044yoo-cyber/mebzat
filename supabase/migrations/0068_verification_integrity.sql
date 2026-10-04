-- The verified badge has to be earned, not set.
--
-- ## What is wrong today
--
-- `profiles.phone_verified` and `profiles.verification_status` are ordinary
-- columns, and the profile update policy is:
--
--   using (auth.uid() = id) with check (auth.uid() = id)
--
-- which permits every column. So any signed-in member can run
--
--   update profiles set phone_verified = true where id = auth.uid();
--
-- from the browser and wear the badge. `is_admin` (0021, 0064) and
-- `restricted_until` (0063) are already guarded exactly this way; these two
-- were not, and they are the two the badge is drawn from.
--
-- A badge anybody can grant themselves is worse than no badge: it makes every
-- honest one meaningless, and it tells a reader deciding whether to send money
-- to a stranger something that is not true.
--
-- ## What this does
--
-- Two things, and neither invents a new source of truth.
--
-- The trigger refuses either column from an API session, the way the other
-- three guards do.
--
-- `sync_phone_verification()` is then the only way in. It is `security
-- definer` and reads `auth.users.phone_confirmed_at` for the caller — the
-- timestamp Supabase Auth writes when an OTP is actually confirmed. Nothing in
-- the browser can forge it: a member can call this function all day and it
-- will keep answering false until they have genuinely completed the code.
--
-- ## What it deliberately does not do
--
-- It does not touch `verification_status` beyond phone. Identity, professional
-- and business verification are real processes that have not happened, and a
-- column that says "verified" without saying what was verified is how a phone
-- check ends up displayed as a government one.

-- ------------------------------------------------------------------ the guard

create or replace function public.prevent_verification_self_grant()
returns trigger
language plpgsql
-- `security invoker`, deliberately. As a definer this runs as its owner and
-- `current_user` could never be an API role, so the test could never fire and
-- the guard would read as protection while permitting everything. The same
-- reasoning is written out in 0064 for the admin flag.
security invoker
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.phone_verified is distinct from old.phone_verified then
      raise exception 'phone_verified cannot be changed from an authenticated session';
    end if;
    if new.verification_status is distinct from old.verification_status then
      raise exception 'verification_status cannot be changed from an authenticated session';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_verification_self_grant on public.profiles;
create trigger prevent_verification_self_grant
  before update on public.profiles
  for each row
  execute function public.prevent_verification_self_grant();

-- --------------------------------------------------------------- the only way in

/**
 * Bring the badge into line with what Supabase Auth actually knows.
 *
 * Returns the resulting state rather than nothing, so the caller can render
 * the answer without a second round trip — and so a member who has not
 * finished the code gets `false` and a reason instead of silence.
 *
 * Idempotent: calling it twice is calling it once. The client calls it after
 * an OTP confirmation, and it is safe to call on sign-in as well.
 */
create or replace function public.sync_phone_verification()
returns table (phone_verified boolean, verification_status public.verification_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  confirmed boolean;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  -- The one fact this is allowed to read. `phone_confirmed_at` is written by
  -- Supabase Auth when a one-time code is confirmed, and by nothing else.
  select u.phone_confirmed_at is not null
    into confirmed
  from auth.users u
  where u.id = auth.uid();

  update public.profiles p
  set
    phone_verified = coalesce(confirmed, false),
    -- Only ever moves to 'verified' on the strength of a confirmed phone, and
    -- back to 'unverified' if that is ever revoked. 'pending' belongs to the
    -- review processes, so a profile sitting in review is left alone.
    verification_status = case
      when coalesce(confirmed, false) then 'verified'::public.verification_status
      when p.verification_status = 'pending' then p.verification_status
      else 'unverified'::public.verification_status
    end,
    updated_at = now()
  where p.id = auth.uid();

  return query
    select p.phone_verified, p.verification_status
    from public.profiles p
    where p.id = auth.uid();
end;
$$;

revoke all on function public.sync_phone_verification() from public;
grant execute on function public.sync_phone_verification() to authenticated;

comment on function public.sync_phone_verification() is
  'Sets profiles.phone_verified from auth.users.phone_confirmed_at for the caller. The only route to the badge: the column itself is refused to API sessions by prevent_verification_self_grant.';
