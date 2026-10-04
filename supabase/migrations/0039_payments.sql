-- Payments, subscriptions, and the webhook log that keeps them honest.
--
-- Two rules run through this file.
--
-- Nothing here is ever written by a browser. A payment is created server-side,
-- the provider is told about it, and the *provider* tells the server what
-- happened. The browser's opinion that a payment succeeded is not evidence and
-- is never acted on — it is a redirect, and a redirect can be typed by hand.
--
-- And every provider event is recorded before it is acted on, keyed on the
-- provider's own reference. Payment providers retry. Chapa retries. A webhook
-- that adds credits every time it arrives adds them three times for one
-- purchase, and the member who noticed would be right to.

begin;

do $$
begin
  if to_regclass('public.credit_wallets') is null then
    raise exception using
      message = 'Payments: the credit tables do not exist.',
      hint = 'Run 0037_plans_credits.sql and 0038_credit_functions.sql first.';
  end if;
end $$;

do $$ begin
  create type public.payment_status as enum (
    'pending',
    'succeeded',
    'failed',
    'cancelled',
    'refunded',
    'reversed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_purpose as enum ('subscription', 'credits');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- What is for sale
-- ---------------------------------------------------------------------------

/**
 * Plans and credit bundles, priced in a table.
 *
 * In the database rather than in the code for the same reason the credit costs
 * are: a price change is a business decision made on a Tuesday, and it should
 * not need a deploy. It also means the checkout can verify that the amount it
 * is about to charge matches a real product — a browser posting "plan: pro,
 * amount: 1" gets refused because the amount is read from here, not from the
 * request.
 */
create table if not exists public.billing_products (
  id text primary key,
  label text not null,
  purpose public.payment_purpose not null,
  /** For a subscription: which plan it grants. */
  plan public.account_plan,
  /** For a bundle: how many credits. Also the monthly allowance of a plan. */
  credits integer not null default 0,
  price numeric(12, 2) not null check (price >= 0),
  currency text not null default 'ETB',
  /** Months of access, for a subscription. */
  months integer not null default 0,
  active boolean not null default true,
  sort integer not null default 0,
  description text
);

comment on table public.billing_products is
  'Plans and credit bundles. The checkout reads the price from here, never from the request.';

insert into public.billing_products
  (id, label, purpose, plan, credits, price, months, sort, description)
values
  ('pro-monthly', 'Pro, monthly', 'subscription', 'pro', 500, 1200, 1, 10,
   'The studio, image to 3D, and 500 credits a month.'),
  ('pro-yearly', 'Pro, yearly', 'subscription', 'pro', 6000, 12000, 12, 11,
   'Two months free, and 6,000 credits for the year.'),
  ('business-monthly', 'Business, monthly', 'subscription', 'business', 1500, 3500, 1, 20,
   'Everything in Pro, for a company account.'),
  ('professional-monthly', 'Professional, monthly', 'subscription', 'professional', 4000, 7500, 1, 30,
   'Takeoff, BOQ and model import. For quantity surveyors and contractors.'),
  ('credits-250', '250 credits', 'credits', null, 250, 400, 0, 40, null),
  ('credits-1000', '1,000 credits', 'credits', null, 1000, 1400, 0, 41,
   'The usual choice — about thirty percent cheaper per credit.'),
  ('credits-5000', '5,000 credits', 'credits', null, 5000, 6000, 0, 42, null)
on conflict (id) do nothing;

alter table public.billing_products enable row level security;

-- The price list is public: somebody has to be able to read it before they
-- have an account.
create policy "Anyone can read the price list"
  on public.billing_products for select to authenticated, anon
  using (active);

create policy "Admins change the prices"
  on public.billing_products for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id text references public.billing_products (id),

  provider text not null default 'chapa',
  /**
   * Our reference, sent to the provider and returned by it.
   *
   * Unique per provider, and it is what makes a replayed webhook harmless: the
   * second delivery finds a payment that is already succeeded and does
   * nothing.
   */
  provider_reference text not null,
  /** The provider's own id for the transaction, when it gives us one. */
  provider_transaction_id text,

  purpose public.payment_purpose not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'ETB',
  /** What this buys, copied at checkout so a later price change cannot alter it. */
  plan public.account_plan,
  credits integer not null default 0,
  months integer not null default 0,

  status public.payment_status not null default 'pending',
  /** Set once, when the payment first becomes successful. */
  fulfilled_at timestamptz,
  failure_reason text,

  /** The provider's last payload, for when somebody has to work out why. */
  provider_payload jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payments_provider_reference_unique unique (provider, provider_reference)
);

create index if not exists payments_user_idx
  on public.payments (user_id, created_at desc);
create index if not exists payments_status_idx
  on public.payments (status) where status = 'pending';

alter table public.payments enable row level security;

create policy "Members read their own payments"
  on public.payments for select to authenticated
  using (user_id = auth.uid());

-- No write policy. Payments are created by the checkout route through the
-- service role and updated only by the webhook after verification.

-- ---------------------------------------------------------------------------
-- The webhook log
-- ---------------------------------------------------------------------------

/**
 * Every event a provider sends, recorded before anything is done about it.
 *
 * The unique constraint is the idempotency. A second delivery of the same
 * event fails the insert, the handler sees the conflict, and it stops —
 * without having granted anything. This is cheaper and more reliable than
 * checking whether the work has already been done, because the check and the
 * work are not atomic and the insert is.
 */
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  /** The provider's event or transaction id. */
  event_reference text not null,
  event_type text,
  payment_id uuid references public.payments (id) on delete set null,
  payload jsonb,
  /** Null until it has been acted on, so a crash mid-handling is visible. */
  processed_at timestamptz,
  outcome text,
  received_at timestamptz not null default now(),

  constraint payment_events_unique unique (provider, event_reference)
);

create index if not exists payment_events_unprocessed_idx
  on public.payment_events (received_at) where processed_at is null;

alter table public.payment_events enable row level security;
-- No policies at all. Nobody but the service role ever reads this.

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan public.account_plan not null,
  status text not null default 'active'
    check (status in ('active', 'cancelled', 'expired', 'past_due')),

  started_at timestamptz not null default now(),
  /** When access ends. A cancelled subscription runs to here, then stops. */
  current_period_end timestamptz not null,
  cancelled_at timestamptz,
  /** Whether it renews. Cancelling sets this false rather than ending access. */
  auto_renew boolean not null default false,

  payment_id uuid references public.payments (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_idx
  on public.subscriptions (user_id, current_period_end desc);
create index if not exists subscriptions_expiring_idx
  on public.subscriptions (current_period_end) where status = 'active';

alter table public.subscriptions enable row level security;

create policy "Members read their own subscription"
  on public.subscriptions for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Fulfilment
-- ---------------------------------------------------------------------------

/**
 * Turns a verified payment into what it bought.
 *
 * Executable by nobody, like `credits_grant` and for the same reason. The
 * webhook route calls it with the service role *after* asking the provider
 * directly whether the transaction succeeded.
 *
 * Idempotent on `fulfilled_at`: a payment that has already been fulfilled
 * returns without doing anything. Between the unique constraint on the event
 * and this check, the same purchase cannot be granted twice however many times
 * the provider retries.
 */
create or replace function public.fulfil_payment(p_payment uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  pay public.payments%rowtype;
  existing public.subscriptions%rowtype;
  starts timestamptz;
begin
  select * into pay from public.payments where id = p_payment for update;
  if not found then
    raise exception 'no such payment' using errcode = 'P0002';
  end if;

  if pay.fulfilled_at is not null then
    return 'already fulfilled';
  end if;

  if pay.status <> 'succeeded' then
    raise exception 'payment is %, not succeeded', pay.status
      using errcode = '22023';
  end if;

  if pay.purpose = 'credits' then
    perform public.credits_grant(
      pay.user_id, pay.credits,
      format('Bought %s credits', pay.credits), pay.id
    );

  elsif pay.purpose = 'subscription' then
    -- Renewing early extends rather than restarts. Somebody who pays on the
    -- 28th for a month that ends on the 30th should get to the 30th of next
    -- month, not lose two days for being organised.
    select * into existing from public.subscriptions
     where user_id = pay.user_id and status = 'active'
     order by current_period_end desc limit 1;

    starts := greatest(now(), coalesce(existing.current_period_end, now()));

    if existing.id is not null then
      update public.subscriptions
         set status = 'expired', updated_at = now()
       where id = existing.id;
    end if;

    insert into public.subscriptions
      (user_id, plan, status, started_at, current_period_end, auto_renew,
       payment_id)
    values (pay.user_id, pay.plan, 'active', now(),
            starts + make_interval(months => greatest(1, pay.months)),
            false, pay.id);

    update public.profiles
       set plan = pay.plan, updated_at = now()
     where id = pay.user_id;

    -- A plan comes with its own credits.
    if pay.credits > 0 then
      perform public.credits_grant(
        pay.user_id, pay.credits,
        format('%s plan credits', pay.plan), pay.id
      );
    end if;
  end if;

  update public.payments
     set fulfilled_at = now(), updated_at = now()
   where id = pay.id;

  return 'fulfilled';
end;
$$;

revoke all on function public.fulfil_payment(uuid) from public;
revoke all on function public.fulfil_payment(uuid) from anon, authenticated;

/**
 * Ends a subscription without ending access.
 *
 * Cancelling stops the renewal; the member keeps what they paid for until the
 * period runs out. Taking access away the moment somebody cancels is taking
 * money for a month they cannot use.
 *
 * This one *is* callable by the member, because it is their subscription and
 * nothing about it grants anything.
 */
create or replace function public.cancel_subscription()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  update public.subscriptions
     set auto_renew = false, cancelled_at = now(), status = 'cancelled',
         updated_at = now()
   where user_id = uid and status = 'active';
end;
$$;

grant execute on function public.cancel_subscription() to authenticated;

/**
 * Drops members back to free when their period ends.
 *
 * Run on a schedule. Without it, a subscription that lapses leaves the profile
 * on `pro` forever and the plan check passes for somebody who has stopped
 * paying.
 */
create or replace function public.expire_subscriptions()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  count integer := 0;
begin
  with lapsed as (
    update public.subscriptions
       set status = 'expired', updated_at = now()
     where status in ('active', 'cancelled')
       and current_period_end < now()
    returning user_id
  )
  update public.profiles p
     set plan = 'free', updated_at = now()
    from lapsed
   where p.id = lapsed.user_id
     and not exists (
       select 1 from public.subscriptions s
        where s.user_id = p.id and s.status = 'active'
          and s.current_period_end >= now()
     );

  get diagnostics count = row_count;
  return count;
end;
$$;

revoke all on function public.expire_subscriptions() from public;
revoke all on function public.expire_subscriptions() from anon, authenticated;

commit;
