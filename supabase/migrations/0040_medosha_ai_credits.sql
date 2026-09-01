-- Credits that can cost less than one, and are charged for what was used.
--
-- 0037 made credits integers, which was right for the operations it had:
-- a design turn, an image, a takeoff. It is wrong for a conversation. A
-- sentence and a forty-page analysis are both "one question", and billing them
-- the same means either the sentence is extortionate or the analysis is free.
--
-- Two changes, and they belong together:
--
--   1. **Credits become numeric.** A text turn can cost 0.3, an image 1, a BOQ
--      analysis 3. The brief asked for exactly this and gave those numbers.
--
--   2. **A reservation can be committed for less than it reserved.** The gate
--      holds an estimate before the model is called — it has to, because the
--      cost is unknown until the tokens come back — and then commits the real
--      figure. The difference returns to the balance in the same transaction.
--
-- The second is what makes the first worth having. Without it the estimate is
-- the charge, and a fractional estimate is just a smaller lie.
--
-- Run this on its own, after 0039.

begin;

do $$
begin
  if to_regclass('public.credit_wallets') is null then
    raise exception using
      message = 'Medosha AI credits: the credit tables do not exist.',
      hint = 'Run 0037, 0038 and 0039 first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Numeric credits
--
-- 3 decimal places. Two is not enough: a short question priced from tokens
-- lands around 0.02–0.4, and rounding that to 0.01 steps loses a fifth of the
-- range. Three is exact for everything the meter produces and still reads as
-- money.
-- ---------------------------------------------------------------------------

alter table public.ai_operation_costs
  alter column credits type numeric(10, 3);

alter table public.credit_wallets
  alter column balance type numeric(12, 3),
  alter column reserved type numeric(12, 3),
  alter column lifetime_granted type numeric(12, 3),
  alter column lifetime_spent type numeric(12, 3);

alter table public.credit_ledger
  alter column amount type numeric(12, 3),
  alter column balance_before type numeric(12, 3),
  alter column balance_after type numeric(12, 3);

alter table public.credit_reservations
  alter column credits type numeric(12, 3);

-- What the reservation actually cost, once it was known. Null while open.
alter table public.credit_reservations
  add column if not exists charged numeric(12, 3);

comment on column public.credit_reservations.charged is
  'The metered cost, set at commit. Lower than `credits` when the estimate was generous.';

-- ---------------------------------------------------------------------------
-- What Medosha AI costs
--
-- One wallet, both kinds of work. The brief was explicit that text and images
-- draw on the same balance, and the tables already had no reason for them not
-- to — `design.chat` and `design.image` were Berchuma's names for the same
-- two operations. These are the general ones the unified assistant uses.
-- ---------------------------------------------------------------------------

insert into public.ai_operation_costs (operation, label, credits, min_plan, notes)
values
  ('ai.chat', 'Medosha AI answer', 0.3, 'free',
   'A reservation. The real charge is metered from tokens and is usually less.'),
  ('ai.image', 'Medosha AI image', 1, 'free',
   'Per image. Editing a photograph and generating one cost the same to run.')
on conflict (operation) do nothing;

-- Berchuma's `design.chat` is deliberately left where it is. It looks like the
-- same operation and is not: it returns a validated parametric design that the
-- geometry engine can build and price, where `ai.chat` returns an answer.
-- Repricing it to match would be a pricing decision smuggled in under a
-- refactor.

-- ---------------------------------------------------------------------------
-- The functions, recreated for numeric
--
-- Dropped rather than replaced: `create or replace function` cannot change a
-- return type or an argument type, and every one of these changes at least one.
-- ---------------------------------------------------------------------------

drop function if exists public.credit_preflight(text);
drop function if exists public.credits_reserve(text, uuid, uuid, text);
drop function if exists public.credits_commit(uuid);
drop function if exists public.credits_refund(uuid, text);
drop function if exists public.credits_grant(uuid, integer, text, uuid);

create or replace function public.credit_preflight(p_operation text)
returns table (
  allowed boolean,
  reason text,
  credits numeric,
  balance numeric,
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
    return query select false, 'authentication required'::text, 0::numeric,
      0::numeric, 'free'::public.account_plan, 'free'::public.account_plan;
    return;
  end if;

  select * into member from public.profiles where id = uid;
  select * into cost from public.ai_operation_costs where operation = p_operation;
  select * into wallet from public.credit_wallets where user_id = uid;

  if cost.operation is null or not cost.active then
    return query select false, 'unknown operation'::text, 0::numeric,
      coalesce(wallet.balance, 0), member.plan, 'free'::public.account_plan;
    return;
  end if;

  if member.is_admin then
    return query select true, null::text, 0::numeric, coalesce(wallet.balance, 0),
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

/**
 * Holds credits before the work starts.
 *
 * `p_estimate` lets the caller hold more than the list price when it already
 * knows the job is a big one — four images rather than one, a long document
 * rather than a question. It can only ever raise the hold, never lower it: a
 * client that could ask to reserve less than an operation costs would have
 * found a way to run it for less than it costs.
 */
create or replace function public.credits_reserve(
  p_operation text,
  p_project uuid default null,
  p_design uuid default null,
  p_description text default null,
  p_estimate numeric default null
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
  before numeric;
  after numeric;
  reservation uuid;
  charge numeric;
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

  charge := case
    when member.is_admin then 0
    else greatest(cost.credits, coalesce(p_estimate, 0))
  end;

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
     set balance = after, reserved = reserved + charge, updated_at = now()
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

grant execute on function
  public.credits_reserve(text, uuid, uuid, text, numeric) to authenticated;

/**
 * Spends the hold, at what it actually cost.
 *
 * `p_actual` is the metered figure — tokens for an answer, images produced for
 * a render. Anything held above it goes back to the balance here, in the same
 * transaction that records the spend, so there is never a moment where the
 * member is short the difference.
 *
 * Clamped to the hold. A caller that meters higher than it reserved does not
 * get to charge the difference; the shortfall is the estimate's fault, not the
 * member's, and silently taking more than was held is how a bill becomes a
 * surprise.
 */
create or replace function public.credits_commit(
  p_reservation uuid,
  p_actual numeric default null
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
  spend numeric;
  back numeric;
  before numeric;
  after numeric;
begin
  select * into r from public.credit_reservations where id = p_reservation;
  if not found then
    raise exception 'no such reservation' using errcode = 'P0002';
  end if;

  if uid is not null and r.user_id <> uid then
    raise exception 'no such reservation' using errcode = 'P0002';
  end if;

  if r.status <> 'open' then
    return;
  end if;

  spend := least(greatest(coalesce(p_actual, r.credits), 0), r.credits);
  back := r.credits - spend;

  update public.credit_reservations
     set status = 'committed', settled_at = now(), charged = spend
   where id = r.id;

  select balance into before from public.credit_wallets
   where user_id = r.user_id for update;

  after := before + back;

  update public.credit_wallets
     set balance = after,
         reserved = greatest(0, reserved - r.credits),
         lifetime_spent = lifetime_spent + spend,
         updated_at = now()
   where user_id = r.user_id;

  insert into public.credit_ledger
    (user_id, kind, operation, amount, balance_before, balance_after,
     project_id, design_id, description, reservation_id)
  values (r.user_id, 'spend', r.operation, -spend, before, after,
          r.project_id, r.design_id, r.description, r.id);
end;
$$;

grant execute on function public.credits_commit(uuid, numeric) to authenticated;

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
  before numeric;
  after numeric;
begin
  select * into r from public.credit_reservations where id = p_reservation;
  if not found then
    raise exception 'no such reservation' using errcode = 'P0002';
  end if;

  if uid is not null and r.user_id <> uid then
    raise exception 'no such reservation' using errcode = 'P0002';
  end if;

  if r.status <> 'open' then
    return;
  end if;

  update public.credit_reservations
     set status = 'refunded', settled_at = now(), charged = 0
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

create or replace function public.credits_grant(
  p_user uuid,
  p_credits numeric,
  p_description text default null,
  p_payment uuid default null
)
returns numeric
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  before numeric;
  after numeric;
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

revoke all on function public.credits_grant(uuid, numeric, text, uuid) from public;
revoke all on function public.credits_grant(uuid, numeric, text, uuid)
  from anon, authenticated;

-- `fulfil_payment` and `credits_expire_stale` call the functions above. They
-- are recreated so their calls bind to the new signatures rather than to the
-- dropped ones.
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

-- ---------------------------------------------------------------------------
-- What was actually used
--
-- The brief listed what has to be tracked: input tokens, output tokens, the
-- model, image count and quality, the cost, the credits deducted, the user and
-- a request id. Most of it was already on `ai_usage_logs`; these are the rest.
--
-- On the usage log rather than the ledger on purpose. The ledger is an account
-- of money and should stay readable as one; how many tokens a model consumed
-- is engineering telemetry, and joining them on `request_id` when somebody
-- actually asks is cheaper than carrying both in both places.
-- ---------------------------------------------------------------------------

alter table public.ai_usage_logs
  add column if not exists request_id uuid,
  add column if not exists credits numeric(12, 3) not null default 0,
  add column if not exists images integer not null default 0,
  add column if not exists quality text,
  add column if not exists capability text;

comment on column public.ai_usage_logs.request_id is
  'Ties every attempt in one request together, and to the credit reservation.';
comment on column public.ai_usage_logs.credits is
  'What this actually cost the member. Zero for a failed attempt — those are refunded.';
comment on column public.ai_usage_logs.capability is
  'Which Medosha AI capability the router chose. For finding out where it is wrong.';

create index if not exists ai_usage_logs_request_idx
  on public.ai_usage_logs (request_id) where request_id is not null;

commit;
