-- Reserve, commit, refund.
--
-- The whole credit system is these four functions. Everything above them is
-- storage and everything below them is UI; if the accounting is wrong it is
-- wrong here.
--
-- Each is security definer because it writes to tables no client may write to.
-- Each therefore checks for itself exactly what a policy would have checked,
-- and none of them trusts a user id passed in as an argument — `auth.uid()` is
-- the only identity they will accept, so a caller cannot spend somebody else's
-- credits by naming them.
--
-- The one that grants credits is different, and deliberately harder to reach:
-- it is executable by nobody, so it can only be called by the service role
-- after a payment has been verified against the provider. A member who could
-- call it could print money.

begin;

do $$
begin
  if to_regclass('public.credit_wallets') is null then
    raise exception using
      message = 'Credits: public.credit_wallets does not exist.',
      hint = 'Run 0037_plans_credits.sql first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- What may this member do?
-- ---------------------------------------------------------------------------

/** Plans in order, so "at least pro" is a comparison rather than a list. */
create or replace function public.plan_rank(p public.account_plan)
returns integer
language sql
immutable
as $$
  select case p
    when 'free' then 0
    when 'pro' then 1
    when 'business' then 2
    when 'professional' then 3
    when 'admin' then 4
  end;
$$;

/**
 * Everything the server needs before it runs an operation, in one round trip.
 *
 * Returns the price, whether the plan allows it, whether the balance covers
 * it, and what the balance actually is — so the caller can refuse with a
 * specific reason rather than a generic one. "You need 40 and have 12" is
 * actionable; "not allowed" is not.
 */
create or replace function public.credit_preflight(p_operation text)
returns table (
  allowed boolean,
  reason text,
  credits integer,
  balance integer,
  plan public.account_plan,
  min_plan public.account_plan
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cost public.ai_operation_costs%rowtype;
  wallet public.credit_wallets%rowtype;
  member public.profiles%rowtype;
begin
  if uid is null then
    return query select false, 'authentication required'::text, 0, 0,
      'free'::public.account_plan, 'free'::public.account_plan;
    return;
  end if;

  select * into member from public.profiles where id = uid;
  select * into cost from public.ai_operation_costs where operation = p_operation;
  select * into wallet from public.credit_wallets where user_id = uid;

  if cost.operation is null or not cost.active then
    return query select false, 'unknown operation'::text, 0,
      coalesce(wallet.balance, 0), member.plan, 'free'::public.account_plan;
    return;
  end if;

  -- An admin runs anything, free. Not a courtesy: somebody has to be able to
  -- reproduce a member's failing operation to find out why it failed.
  if member.is_admin then
    return query select true, null::text, 0, coalesce(wallet.balance, 0),
      member.plan, cost.min_plan;
    return;
  end if;

  if public.plan_rank(member.plan) < public.plan_rank(cost.min_plan) then
    return query select false, 'plan too low'::text, cost.credits,
      coalesce(wallet.balance, 0), member.plan, cost.min_plan;
    return;
  end if;

  if coalesce(wallet.balance, 0) < cost.credits then
    return query select false, 'not enough credits'::text, cost.credits,
      coalesce(wallet.balance, 0), member.plan, cost.min_plan;
    return;
  end if;

  return query select true, null::text, cost.credits, wallet.balance,
    member.plan, cost.min_plan;
end;
$$;

grant execute on function public.credit_preflight(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reserve
-- ---------------------------------------------------------------------------

/**
 * Takes the credits out before the work starts.
 *
 * Out of `balance` and into `reserved`, in one statement with the row locked,
 * so two requests arriving together cannot both see the same balance and both
 * decide it is enough. That race is not theoretical — it is what happens when
 * somebody double-clicks.
 *
 * Raises rather than returning null on refusal, with a message the route turns
 * into something a person can act on.
 */
create or replace function public.credits_reserve(
  p_operation text,
  p_project uuid default null,
  p_design uuid default null,
  p_description text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cost public.ai_operation_costs%rowtype;
  member public.profiles%rowtype;
  before integer;
  after integer;
  reservation uuid;
  charge integer;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into member from public.profiles where id = uid;
  select * into cost from public.ai_operation_costs where operation = p_operation;

  if cost.operation is null or not cost.active then
    raise exception 'unknown operation: %', p_operation using errcode = '22023';
  end if;

  if not member.is_admin
     and public.plan_rank(member.plan) < public.plan_rank(cost.min_plan) then
    raise exception 'this needs a % plan', cost.min_plan using errcode = '42501';
  end if;

  charge := case when member.is_admin then 0 else cost.credits end;

  -- The lock is the point of this statement. Without `for update` two
  -- concurrent reservations both read the old balance.
  select balance into before from public.credit_wallets
   where user_id = uid for update;

  if before is null then
    insert into public.credit_wallets (user_id) values (uid)
    on conflict (user_id) do nothing;
    before := 0;
  end if;

  if before < charge then
    raise exception 'not enough credits: % needed, % available', charge, before
      using errcode = '53000';
  end if;

  after := before - charge;

  update public.credit_wallets
     set balance = after,
         reserved = reserved + charge,
         updated_at = now()
   where user_id = uid;

  insert into public.credit_reservations
    (user_id, operation, credits, project_id, design_id, description)
  values (uid, p_operation, charge, p_project, p_design, p_description)
  returning id into reservation;

  insert into public.credit_ledger
    (user_id, kind, operation, amount, balance_before, balance_after,
     project_id, design_id, description, reservation_id)
  values (uid, 'reserve', p_operation, -charge, before, after,
          p_project, p_design, p_description, reservation);

  return reservation;
end;
$$;

grant execute on function public.credits_reserve(text, uuid, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Commit
-- ---------------------------------------------------------------------------

/**
 * The work succeeded, so the held credits are spent.
 *
 * The balance does not move — it moved at the reservation. This clears the
 * hold and writes the entry that says what the money went on. Committing twice
 * is a no-op rather than an error: a route that retries its own bookkeeping
 * should not fail the operation the member already received.
 */
create or replace function public.credits_commit(p_reservation uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.credit_reservations%rowtype;
  current integer;
begin
  select * into r from public.credit_reservations where id = p_reservation;
  if not found then
    raise exception 'no such reservation' using errcode = 'P0002';
  end if;

  -- `auth.uid()` is null when the service role calls this, which is how a
  -- background worker settles a reservation. A signed-in caller must own it.
  if uid is not null and r.user_id <> uid then
    raise exception 'no such reservation' using errcode = 'P0002';
  end if;

  if r.status <> 'open' then
    return;
  end if;

  update public.credit_reservations
     set status = 'committed', settled_at = now()
   where id = r.id;

  select balance into current from public.credit_wallets
   where user_id = r.user_id for update;

  update public.credit_wallets
     set reserved = greatest(0, reserved - r.credits),
         lifetime_spent = lifetime_spent + r.credits,
         updated_at = now()
   where user_id = r.user_id;

  insert into public.credit_ledger
    (user_id, kind, operation, amount, balance_before, balance_after,
     project_id, design_id, description, reservation_id)
  values (r.user_id, 'spend', r.operation, 0, current, current,
          r.project_id, r.design_id, r.description, r.id);
end;
$$;

grant execute on function public.credits_commit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Refund
-- ---------------------------------------------------------------------------

/**
 * The work failed, so the member gets their credits back.
 *
 * This is the function that has to be right. An AI operation fails for reasons
 * that are nobody's fault — a provider times out, a model returns something
 * unreadable twice — and charging for that is charging for nothing. Every
 * route that reserves must refund on every path that is not success, including
 * the ones that throw.
 */
create or replace function public.credits_refund(
  p_reservation uuid,
  p_reason text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.credit_reservations%rowtype;
  before integer;
  after integer;
begin
  select * into r from public.credit_reservations where id = p_reservation;
  if not found then
    raise exception 'no such reservation' using errcode = 'P0002';
  end if;

  if uid is not null and r.user_id <> uid then
    raise exception 'no such reservation' using errcode = 'P0002';
  end if;

  -- Refunding twice would hand back the credits twice.
  if r.status <> 'open' then
    return;
  end if;

  update public.credit_reservations
     set status = 'refunded', settled_at = now()
   where id = r.id;

  select balance into before from public.credit_wallets
   where user_id = r.user_id for update;

  after := before + r.credits;

  update public.credit_wallets
     set balance = after,
         reserved = greatest(0, reserved - r.credits),
         updated_at = now()
   where user_id = r.user_id;

  insert into public.credit_ledger
    (user_id, kind, operation, amount, balance_before, balance_after,
     project_id, design_id, description, reservation_id)
  values (r.user_id, 'refund', r.operation, r.credits, before, after,
          r.project_id, r.design_id,
          coalesce(p_reason, 'The operation failed'), r.id);
end;
$$;

grant execute on function public.credits_refund(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Grant
-- ---------------------------------------------------------------------------

/**
 * Credits arrive here and nowhere else.
 *
 * Executable by nobody. Not by `authenticated`, not by `anon` — the grants are
 * revoked below and never given back. The only callers are the service role,
 * which the payment webhook uses after verifying the transaction against the
 * provider, and a person with database access.
 *
 * If this were callable by a signed-in member, a signed-in member could give
 * themselves ten thousand credits with one line of JavaScript. That is the
 * whole reason the function is shaped this way, and the reason the webhook
 * verifies server-side instead of believing what the browser tells it.
 */
create or replace function public.credits_grant(
  p_user uuid,
  p_credits integer,
  p_description text default null,
  p_payment uuid default null
)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  before integer;
  after integer;
begin
  if p_credits <= 0 then
    raise exception 'a grant must be positive' using errcode = '22023';
  end if;

  insert into public.credit_wallets (user_id) values (p_user)
  on conflict (user_id) do nothing;

  select balance into before from public.credit_wallets
   where user_id = p_user for update;

  after := before + p_credits;

  update public.credit_wallets
     set balance = after,
         lifetime_granted = lifetime_granted + p_credits,
         updated_at = now()
   where user_id = p_user;

  insert into public.credit_ledger
    (user_id, kind, amount, balance_before, balance_after, description,
     payment_id)
  values (p_user, 'grant', p_credits, before, after,
          coalesce(p_description, 'Credits added'), p_payment);

  return after;
end;
$$;

revoke all on function public.credits_grant(uuid, integer, text, uuid) from public;
revoke all on function public.credits_grant(uuid, integer, text, uuid)
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Expiring a hold that nobody settled
-- ---------------------------------------------------------------------------

/**
 * Returns credits held by operations that never finished.
 *
 * A route that crashes between reserving and settling leaves a hold forever,
 * and the member is short those credits with nothing to show for it. Anything
 * open for two hours is longer than any operation here takes, so it is a
 * casualty rather than a long job.
 *
 * Meant to be run on a schedule. Safe to run at any time — an operation that
 * is genuinely still going has not been open for two hours.
 */
create or replace function public.credits_expire_stale()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r public.credit_reservations%rowtype;
  count integer := 0;
begin
  for r in
    select * from public.credit_reservations
     where status = 'open' and created_at < now() - interval '2 hours'
  loop
    perform public.credits_refund(r.id, 'The operation never completed');
    count := count + 1;
  end loop;

  return count;
end;
$$;

revoke all on function public.credits_expire_stale() from public;
revoke all on function public.credits_expire_stale() from anon, authenticated;

commit;
