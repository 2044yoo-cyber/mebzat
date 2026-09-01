-- Credits and payments, attacked rather than demonstrated.
--
-- The happy path is not what this checks. A credit system that works when
-- everybody behaves is a credit system that has not been tested: what matters
-- is what happens when somebody double-clicks, when a provider retries a
-- webhook, when an operation fails after the money has been taken, and when a
-- signed-in member tries to write to their own wallet.
--
-- Runs as `authenticated`, because running it as a superuser bypasses RLS and
-- reports that every rule works.

begin;

insert into auth.users (id, email) values
  ('c0000000-0000-4000-8000-000000000001', 'buyer@example.test'),
  ('c0000000-0000-4000-8000-000000000002', 'thief@example.test');

create temporary table probe (name text, passed boolean, detail text) on commit drop;
grant all on probe to authenticated;

-- Give the buyer a plan high enough to run the operations below.
update public.profiles set plan = 'professional'
 where id = 'c0000000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

-- ---------------------------------------------------------------------------
-- The wallet exists, and is not writable
-- ---------------------------------------------------------------------------

insert into probe
select 'a new member gets a wallet', balance = 20, balance::text
from public.credit_wallets where user_id = 'c0000000-0000-4000-8000-000000000001';

-- The attack this system exists to prevent.
update public.credit_wallets set balance = 999999
 where user_id = 'c0000000-0000-4000-8000-000000000001';

insert into probe
select 'a member cannot write their own balance', balance = 20, balance::text
from public.credit_wallets where user_id = 'c0000000-0000-4000-8000-000000000001';

-- A forged ledger entry is *refused*, not silently dropped: an insert with no
-- policy raises, where the update above simply matched no rows. Both are the
-- right behaviour and they fail differently, so both are checked.
do $$
declare ok boolean := false;
begin
  begin
    insert into public.credit_ledger
      (user_id, kind, amount, balance_before, balance_after, description)
    values ('c0000000-0000-4000-8000-000000000001', 'grant', 5000, 20, 5020, 'nice try');
  exception when others then ok := true;
  end;
  insert into probe values ('nor forge a ledger entry', ok, null);
end $$;

-- And cannot call the function that creates credits.
do $$
declare ok boolean := false;
begin
  begin
    perform public.credits_grant('c0000000-0000-4000-8000-000000000001', 5000);
  exception when others then ok := true;
  end;
  insert into probe values ('nor call credits_grant', ok, null);
end $$;

-- ---------------------------------------------------------------------------
-- Preflight says why, not just no
-- ---------------------------------------------------------------------------

insert into probe
select 'preflight allows an affordable operation', allowed, reason
from public.credit_preflight('design.chat');

insert into probe
select 'and refuses one that costs more than the balance',
       not allowed and reason = 'not enough credits',
       format('%s, %s credits, %s balance', reason, credits, balance)
from public.credit_preflight('takeoff.drawing');

-- ---------------------------------------------------------------------------
-- Reserve, spend, and what is left
-- ---------------------------------------------------------------------------

do $$
declare reservation uuid;
begin
  reservation := public.credits_reserve('design.chat', null, null, 'A wardrobe');
  insert into probe values ('reserving returns a reservation', reservation is not null, null);

  insert into probe
  select 'the credits leave the balance immediately',
         balance = 18 and reserved = 2,
         format('balance %s, reserved %s', balance, reserved)
  from public.credit_wallets where user_id = 'c0000000-0000-4000-8000-000000000001';

  perform public.credits_commit(reservation);

  insert into probe
  select 'committing clears the hold without moving the balance again',
         balance = 18 and reserved = 0 and lifetime_spent = 2,
         format('balance %s, reserved %s, spent %s', balance, reserved, lifetime_spent)
  from public.credit_wallets where user_id = 'c0000000-0000-4000-8000-000000000001';

  -- Committing twice must not charge twice.
  perform public.credits_commit(reservation);
  insert into probe
  select 'committing twice charges once', balance = 18, balance::text
  from public.credit_wallets where user_id = 'c0000000-0000-4000-8000-000000000001';
end $$;

-- ---------------------------------------------------------------------------
-- A failed operation costs nothing
-- ---------------------------------------------------------------------------

do $$
declare reservation uuid;
begin
  reservation := public.credits_reserve('design.chat');
  perform public.credits_refund(reservation, 'The provider timed out');

  insert into probe
  select 'a refund puts the credits back', balance = 18 and reserved = 0,
         format('balance %s, reserved %s', balance, reserved)
  from public.credit_wallets where user_id = 'c0000000-0000-4000-8000-000000000001';

  -- The case that would be free money: refund, then refund again.
  perform public.credits_refund(reservation, 'again');
  insert into probe
  select 'refunding twice refunds once', balance = 18, balance::text
  from public.credit_wallets where user_id = 'c0000000-0000-4000-8000-000000000001';

  -- And a refund after a commit must not undo the charge.
  reservation := public.credits_reserve('design.chat');
  perform public.credits_commit(reservation);
  perform public.credits_refund(reservation, 'after the fact');
  insert into probe
  select 'a refund after a commit is ignored', balance = 16, balance::text
  from public.credit_wallets where user_id = 'c0000000-0000-4000-8000-000000000001';
end $$;

-- ---------------------------------------------------------------------------
-- Running out
-- ---------------------------------------------------------------------------

do $$
declare ok boolean := false;
begin
  -- 16 left, and a drawing takeoff costs 40.
  begin
    perform public.credits_reserve('takeoff.drawing');
  exception when others then ok := true;
  end;
  insert into probe values ('an unaffordable operation is refused', ok, null);

  insert into probe
  select 'and nothing was taken', balance = 16, balance::text
  from public.credit_wallets where user_id = 'c0000000-0000-4000-8000-000000000001';
end $$;

-- ---------------------------------------------------------------------------
-- The plan gate
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000002';

insert into probe
select 'a free member is refused a professional operation',
       not allowed and reason = 'plan too low', reason
from public.credit_preflight('takeoff.drawing');

do $$
declare ok boolean := false;
begin
  begin
    perform public.credits_reserve('takeoff.drawing');
  exception when others then ok := true;
  end;
  insert into probe values ('and cannot reserve for one either', ok, null);
end $$;

-- Somebody else's reservation is not theirs to settle.
do $$
declare theirs uuid; ok boolean := false;
begin
  select id into theirs from public.credit_reservations
   where user_id = 'c0000000-0000-4000-8000-000000000001' limit 1;
  begin
    perform public.credits_refund(theirs, 'give me those');
  exception when others then ok := true;
  end;
  insert into probe values ('a member cannot refund somebody else''s reservation', ok, null);
end $$;

insert into probe
select 'nor read their ledger', count(*) = 0, count(*)::text
from public.credit_ledger where user_id = 'c0000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Charging for what was used
--
-- The reservation is an estimate — it has to be, because a conversation's cost
-- is unknown until the tokens come back. What matters is that the difference
-- comes back, that nobody can charge above what was held, and that fractions
-- do not drift.
--
-- Every assertion below reads the balance through a scalar subquery rather
-- than `insert into probe select ... from credit_wallets`. The first version
-- used the latter and three of these checks quietly inserted nothing: this
-- section sits after the plan-gate section, which leaves the session as the
-- *other* member, and under RLS a select for somebody else's wallet returns no
-- rows — so the insert had nothing to insert and the run reported everything
-- passing. A scalar subquery yields null instead, and null is a failure.
-- ---------------------------------------------------------------------------

-- Back to the member with the plan and the balance.
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000001';

do $$
declare
  reservation uuid;
  opening numeric;
  wallet_of constant uuid := 'c0000000-0000-4000-8000-000000000001';
begin
  select balance into opening from public.credit_wallets where user_id = wallet_of;

  -- ai.chat holds 0.3 and this answer cost 0.12.
  reservation := public.credits_reserve('ai.chat');

  insert into probe values (
    'a fractional operation holds a fraction',
    (select reserved from public.credit_wallets where user_id = wallet_of) = 0.3,
    (select reserved::text from public.credit_wallets where user_id = wallet_of));

  perform public.credits_commit(reservation, 0.12);

  insert into probe values (
    'committing less than was held returns the difference',
    (select balance from public.credit_wallets where user_id = wallet_of)
      = opening - 0.12,
    format('balance %s, expected %s',
      (select balance from public.credit_wallets where user_id = wallet_of),
      opening - 0.12));

  insert into probe values (
    'and the reservation records what it actually cost',
    (select charged from public.credit_reservations where id = reservation) = 0.12,
    (select charged::text from public.credit_reservations where id = reservation));

  -- The attack: meter higher than the hold. A caller that could do this would
  -- charge whatever it liked after the fact.
  select balance into opening from public.credit_wallets where user_id = wallet_of;
  reservation := public.credits_reserve('ai.chat');
  perform public.credits_commit(reservation, 999);

  insert into probe values (
    'a charge above the hold is capped at the hold',
    (select balance from public.credit_wallets where user_id = wallet_of)
      = opening - 0.3,
    format('balance %s, expected %s',
      (select balance from public.credit_wallets where user_id = wallet_of),
      opening - 0.3));

  -- And the mirror of it: a negative charge must not pay somebody to use the
  -- product.
  select balance into opening from public.credit_wallets where user_id = wallet_of;
  reservation := public.credits_reserve('ai.chat');
  perform public.credits_commit(reservation, -50);

  insert into probe values (
    'a negative charge costs nothing rather than paying out',
    (select balance from public.credit_wallets where user_id = wallet_of) = opening,
    format('balance %s, expected %s',
      (select balance from public.credit_wallets where user_id = wallet_of),
      opening));

  -- An estimate may raise the hold, for a job the caller already knows is
  -- large.
  reservation := public.credits_reserve('ai.image', null, null, 'four images', 4);
  insert into probe values (
    'an estimate can hold more than the list price',
    (select reserved from public.credit_wallets where user_id = wallet_of) = 4,
    (select reserved::text from public.credit_wallets where user_id = wallet_of));
  perform public.credits_refund(reservation, 'tidy up');

  -- It may not lower it. Reserving under the price would be a way to run an
  -- operation for less than it costs.
  reservation := public.credits_reserve('ai.image', null, null, 'cheap please', 0.01);
  insert into probe values (
    'but not less than the list price',
    (select reserved from public.credit_wallets where user_id = wallet_of) = 1,
    (select reserved::text from public.credit_wallets where user_id = wallet_of));
  perform public.credits_refund(reservation, 'tidy up');

  -- Fractions have to survive being added up. Thirty answers at 0.3 is exactly
  -- 9, not 8.999999 — which is why these columns are numeric and not float.
  select balance into opening from public.credit_wallets where user_id = wallet_of;
  for i in 1..30 loop
    reservation := public.credits_reserve('ai.chat');
    perform public.credits_commit(reservation);
  end loop;

  insert into probe values (
    'thirty answers at 0.3 cost exactly nine credits',
    (select balance from public.credit_wallets where user_id = wallet_of)
      = opening - 9,
    format('%s, expected %s',
      (select balance from public.credit_wallets where user_id = wallet_of),
      opening - 9));
end $$;

-- Put the session back where the payments section expects it.
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

reset role;

-- What the wallet held before any of this, so the assertions below are
-- relative. They used to be absolute — "balance = 16" — which meant adding a
-- single spending test anywhere earlier in the file broke three payment
-- checks that had nothing to do with it. A test that has to be rewritten when
-- unrelated code changes stops being run.
create temporary table snapshot on commit drop as
select balance as before_payment from public.credit_wallets
 where user_id = 'c0000000-0000-4000-8000-000000000001';

-- A payment the way the checkout route creates one: server-side, priced from
-- billing_products rather than from anything a browser sent.
insert into public.payments
  (id, user_id, product_id, provider, provider_reference, purpose, amount,
   currency, plan, credits, months, status)
select
  'd0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  id, 'chapa', 'medosha-test-0001', purpose, price, currency, plan, credits,
  months, 'pending'
from public.billing_products where id = 'pro-monthly';

insert into probe
select 'a pending payment grants nothing',
       (select balance from public.credit_wallets
         where user_id = 'c0000000-0000-4000-8000-000000000001')
         = (select before_payment from snapshot),
       null;

do $$
declare ok boolean := false;
begin
  -- Fulfilling a payment that has not succeeded must be refused, or a webhook
  -- that misreads a "failed" event hands out a plan.
  begin
    perform public.fulfil_payment('d0000000-0000-4000-8000-000000000001');
  exception when others then ok := true;
  end;
  insert into probe values ('an unsuccessful payment cannot be fulfilled', ok, null);
end $$;

update public.payments set status = 'succeeded'
 where id = 'd0000000-0000-4000-8000-000000000001';

create temporary table fulfilment (label text, result text) on commit drop;

insert into fulfilment
select 'first', public.fulfil_payment('d0000000-0000-4000-8000-000000000001');

insert into probe
select 'a verified payment is fulfilled', result = 'fulfilled', result
from fulfilment where label = 'first';

insert into probe
select 'the plan is applied', plan = 'pro', plan::text
from public.profiles where id = 'c0000000-0000-4000-8000-000000000001';

insert into probe
select 'and the plan credits arrive',
       balance = (select before_payment from snapshot) + 500, balance::text
from public.credit_wallets where user_id = 'c0000000-0000-4000-8000-000000000001';

insert into probe
select 'and a subscription exists with an end date',
       count(*) = 1 and bool_and(current_period_end > now()), count(*)::text
from public.subscriptions where user_id = 'c0000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- The webhook arrives again, as webhooks do
-- ---------------------------------------------------------------------------

insert into fulfilment
select 'second', public.fulfil_payment('d0000000-0000-4000-8000-000000000001');

insert into probe
select 'fulfilling the same payment twice does nothing',
       result = 'already fulfilled', result
from fulfilment where label = 'second';

insert into probe
select 'and the credits were not granted twice',
       balance = (select before_payment from snapshot) + 500, balance::text
from public.credit_wallets where user_id = 'c0000000-0000-4000-8000-000000000001';

-- The event log is the other half of the defence: the same provider event
-- cannot be recorded twice, so a retry cannot even reach the fulfilment.
insert into public.payment_events (provider, event_reference, event_type)
values ('chapa', 'evt-0001', 'charge.success');

do $$
declare ok boolean := false;
begin
  begin
    insert into public.payment_events (provider, event_reference, event_type)
    values ('chapa', 'evt-0001', 'charge.success');
  exception when unique_violation then ok := true;
  end;
  insert into probe values ('the same webhook event cannot be logged twice', ok, null);
end $$;

-- ---------------------------------------------------------------------------
-- Cancelling, and lapsing
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000001';

select public.cancel_subscription();

insert into probe
select 'cancelling stops the renewal but keeps the plan',
       (select plan from public.profiles
         where id = 'c0000000-0000-4000-8000-000000000001') = 'pro'
       and (select not auto_renew from public.subscriptions
             where user_id = 'c0000000-0000-4000-8000-000000000001'
             order by created_at desc limit 1),
       null;

reset role;

-- Wind the period back and expire it.
update public.subscriptions set current_period_end = now() - interval '1 day'
 where user_id = 'c0000000-0000-4000-8000-000000000001';

select public.expire_subscriptions();

insert into probe
select 'a lapsed subscription drops the member to free', plan = 'free', plan::text
from public.profiles where id = 'c0000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- A hold nobody settled
-- ---------------------------------------------------------------------------

set local role authenticated;
do $$
begin
  perform public.credits_reserve('design.chat');
end $$;

reset role;

-- Backdated with RLS off, and that is not a convenience. As `authenticated`
-- the update matched no rows at all — `credit_reservations` has a select
-- policy and nothing else — so the first version of this test backdated
-- nothing, found nothing stale, and reported a broken expiry. The silence is
-- the system being tight; the test had to stop relying on it.
update public.credit_reservations set created_at = now() - interval '3 hours'
 where status = 'open';

insert into probe
select 'a stale hold is returned', public.credits_expire_stale() >= 1, null;

insert into probe
select 'and nothing is left held', reserved = 0, reserved::text
from public.credit_wallets where user_id = 'c0000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------

-- `passed is not true` rather than `not passed`, because a comparison against
-- a null column yields null, and null is neither true nor false. The first
-- version counted passes with `filter (where passed)` and failures with
-- `filter (where not passed)`, so a check whose verdict came out null appeared
-- in neither total and vanished from the run entirely. An unanswerable check
-- is a failed check.
select
  case when passed then '   PASS' else '** FAIL' end as result,
  name, coalesce(detail, case when passed is null then '(no verdict)' end)
from probe
order by passed nulls first, name;

select format('%s passed, %s failed',
              count(*) filter (where passed),
              count(*) filter (where passed is not true)) as summary
from probe;

rollback;
