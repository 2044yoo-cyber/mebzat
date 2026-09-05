-- Making a suspension mean something.
--
-- The moderation system has recorded suspensions since 0052: user_strikes has
-- levels warning, restricted and suspended, and strikes.ts works out the worst
-- one currently active. Nothing reads it. A moderator could suspend an account
-- and that account could carry on posting, because `profiles` has no state for
-- it and no request path ever asked.
--
-- ## Why a column and not a join
--
-- user_strikes is a log — several rows per person, each with its own expiry.
-- Answering "is this account restricted right now" from it means a filtered
-- aggregate on every request that cares. The check has to happen in the
-- session refresh, which runs on *every* page, so it has to be one indexed
-- read of one row that is being read anyway.
--
-- So the strike stays the record of what happened and why, and this column is
-- the answer to the only question the request path asks. The strike path
-- writes it; nothing else can.
--
-- ## Why it cannot be written from a session
--
-- The same rule is_admin has had since 0021, for the same reason: an account
-- that can clear its own restriction is not restricted. A trigger refuses any
-- change from an authenticated session, so it is set by the security-definer
-- function below or by someone with database access, and by nothing else.

alter table public.profiles
  add column if not exists restricted_until timestamptz,
  add column if not exists restriction_reason text;

comment on column public.profiles.restricted_until is
  'When the account stops being restricted. Null means it is not. Written only '
  'by public.set_account_restriction; a trigger refuses any session that tries.';

create index if not exists profiles_restricted_idx
  on public.profiles (restricted_until)
  where restricted_until is not null;

-- ------------------------------------------------------------- the guard

/**
 * Deliberately NOT `security definer`.
 *
 * A definer function runs as its owner, so `current_user` inside one is always
 * the owner and never the API role — the check below could not fire, and the
 * trigger read as a guard while permitting every write it was written to
 * refuse. It has to see the role the statement is actually running under, so
 * it runs as the invoker. It needs no elevated privilege: it reads NEW and OLD
 * and raises.
 */
create or replace function public.prevent_restriction_self_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Refused when the write comes straight from an API session. `current_user`
  -- is the API role for a request through PostgREST and the *function owner*
  -- inside a `security definer` function, so the sanctioned path below passes
  -- and a direct UPDATE does not. service_role, which legitimately sets this,
  -- is neither.
  --
  -- Two versions of this test were wrong before this one, and both failed
  -- quietly in different directions:
  --
  --   `auth.uid() is not null` refuses the legitimate path too — a definer
  --   function changes the privilege, not the JWT, so auth.uid() is still the
  --   caller inside it. That blocked set_account_restriction outright.
  --
  --   `current_user = session_user` never fires at all. session_user is the
  --   *connection* role — `authenticator` on Supabase — which equals neither
  --   the API role outside nor the owner inside. A guard that is never reached
  --   is worse than no guard, because it reads like one.
  --
  -- It is deliberately not a flag the caller sets: any GUC a client can write
  -- is a guard a client can lift.
  if current_user in ('authenticated', 'anon')
     and (new.restricted_until is distinct from old.restricted_until
          or new.restriction_reason is distinct from old.restriction_reason) then
    raise exception 'restricted_until cannot be changed from an authenticated session';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_restriction_self_edit on public.profiles;
create trigger prevent_restriction_self_edit
  before update on public.profiles
  for each row
  execute function public.prevent_restriction_self_edit();

-- --------------------------------------------------------- setting it

/**
 * Restrict an account, or lift a restriction.
 *
 * `security definer` so it can write past the trigger above, and it checks the
 * caller is an admin itself rather than trusting that only an admin page calls
 * it — a definer function is a public endpoint with a name.
 *
 * Passing null for `until` lifts the restriction, which is the same operation
 * and must not be a second function that could drift from this one.
 */
create or replace function public.set_account_restriction(
  target uuid,
  until timestamptz,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not permitted';
  end if;

  -- An admin who restricts themselves locks the operator out of the operator's
  -- own console, and the only way back is the database. Refused.
  if target = auth.uid() then
    raise exception 'an administrator cannot restrict their own account';
  end if;

  update public.profiles
  set restricted_until = until,
      restriction_reason = case when until is null then null else reason end
  where id = target;
end;
$$;

revoke all on function public.set_account_restriction(uuid, timestamptz, text) from public;
grant execute on function public.set_account_restriction(uuid, timestamptz, text) to authenticated;

/**
 * Whether this account is restricted right now.
 *
 * A past date is not a restriction — the expiry is the whole point of a
 * temporary one, and an account that stays restricted after its date has
 * passed is a support ticket nobody can resolve.
 */
create or replace function public.account_is_restricted(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = target and restricted_until is not null and restricted_until > now()
  );
$$;

grant execute on function public.account_is_restricted(uuid) to authenticated, anon;
