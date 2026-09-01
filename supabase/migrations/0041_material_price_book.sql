-- The Ethiopian construction material price book.
--
-- A reference price for a material — what a square metre of 18 mm MDF costs in
-- Addis Ababa in August — is a different kind of fact from a supplier's listing
-- on the Price Exchange. A listing belongs to whoever posted it, competes for
-- bids, and disappears when they take it down. A reference price belongs to the
-- platform, carries a status saying how far anyone should trust it, and must
-- survive being superseded so the history can be drawn.
--
-- 0009 already reserved the name `material_prices` as a view over
-- `price_listings where sector = 'material'`. Nothing in the application ever
-- queried it — grep finds no reference outside 0009 itself — so it is a
-- compatibility alias that never had a caller. It is dropped here and the name
-- given to the real table, which is what it should always have meant. The
-- sibling views (labor_prices, furniture_prices, project_prices,
-- supplier_prices) are left exactly as they are.
--
-- ## Append-only
--
-- A price is an observation on a date, not a mutable field. When MDF moves from
-- 6,500 to 7,200 that is a second row, not an edit — otherwise the July figure
-- is gone and no chart can ever be drawn. So nothing here overwrites
-- `price_etb`. Corrections happen (a typo, a wrong unit), so editing is
-- permitted, but it is recorded in an audit table alongside every other change
-- of status.
--
-- ## Status, not a boolean
--
-- "Verified" cannot be a boolean because the interesting cases are in between:
-- a teaching baseline, a figure a supplier typed, something read off a web
-- listing. Each is usable for a different purpose and the user must be able to
-- see which they are looking at. The order in `price_data_status` is the order
-- of trust, and the resolver reads it that way.
--
-- Additive. Run after 0040.

begin;

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception using
      message = 'Material price book: the profiles table does not exist.',
      hint = 'Run the earlier migrations first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Status
--
-- Declared in order of trust, weakest first, so `enum_range` and any ordinal
-- comparison agree with what the resolver does. Postgres orders enum values by
-- their declaration, which makes `status > 'web_sourced'` mean what it reads
-- like.
-- ---------------------------------------------------------------------------

create type public.price_data_status as enum (
  -- Older than the configured validity period. Kept forever — an expired price
  -- is still the truth about what May cost, and deleting it would put a hole in
  -- the history.
  'expired',
  -- A planning or teaching baseline. The state every row of the seed workbook
  -- arrives in. Never to be shown as a market price.
  'educational_estimate',
  -- Read from a public listing or a published index. Has a real source and a
  -- real date, but nobody at Medosha has stood behind it.
  'web_sourced',
  -- Typed in by a supplier, contractor or approved professional. Not yet
  -- official — this is the queue the admin works through.
  'supplier_submitted',
  -- An administrator reviewed the record and stands behind it.
  'admin_verified'
);

comment on type public.price_data_status is
  'How far a material price can be trusted. Declared weakest-first so ordinal comparison matches the resolver.';

/** VAT treatment of a quoted figure. "Unknown" is the honest default. */
create type public.price_vat_status as enum ('unknown', 'inclusive', 'exclusive', 'exempt');

-- ---------------------------------------------------------------------------
-- The name
--
-- Dropped rather than renamed: it is a view with no dependents and no callers,
-- and `create or replace` cannot turn a view into a table.
-- ---------------------------------------------------------------------------

drop view if exists public.material_prices;

-- ---------------------------------------------------------------------------
-- material_prices
-- ---------------------------------------------------------------------------

create table public.material_prices (
  id uuid primary key default gen_random_uuid(),

  -- What it is.
  category text not null,
  subcategory text,
  material text not null,
  specification text,
  unit text not null,
  brand text,

  -- Where and how much.
  city_region text not null default 'Addis Ababa',
  price_etb numeric(14, 2) not null check (price_etb >= 0),
  currency text not null default 'ETB',
  vat_status public.price_vat_status not null default 'unknown',

  -- Where it came from.
  supplier text,
  supplier_id uuid references public.profiles (id) on delete set null,
  source text,
  price_date date not null default current_date,

  -- How far to trust it.
  data_status public.price_data_status not null default 'supplier_submitted',
  verified boolean generated always as (data_status = 'admin_verified') stored,
  verified_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  -- Set when this record is retired in favour of a newer one for the same
  -- material. The old row stays readable; it just stops being the answer.
  superseded_by uuid references public.material_prices (id) on delete set null,

  notes text,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A price with no date cannot be ranked against another, and a future date is
  -- either a typo or somebody guessing. One day of slack for timezones.
  constraint material_prices_date_sane
    check (price_date <= (current_date + 1) and price_date >= date '2000-01-01'),

  -- An admin-verified row must say who verified it and when. Without this the
  -- highest trust level is the one that carries the least evidence.
  constraint material_prices_verified_has_verifier
    check (
      data_status <> 'admin_verified'
      or (verified_by is not null and verified_at is not null)
    )
);

comment on table public.material_prices is
  'Reference prices for Ethiopian construction materials. Append-only: a price change is a new row, never an edit.';
comment on column public.material_prices.verified is
  'Generated. Reads as a boolean for callers that only care whether an admin stood behind the figure.';
comment on column public.material_prices.superseded_by is
  'The newer record that replaced this one. Set by the resolver, never by deleting history.';

-- The lookup the AI, the BOQ and the exchange all perform: this material, in
-- this city, best status first, newest first.
create index material_prices_lookup_idx
  on public.material_prices (material, city_region, data_status desc, price_date desc);

-- The admin queue.
create index material_prices_status_idx
  on public.material_prices (data_status, created_at desc);

create index material_prices_category_idx on public.material_prices (category, subcategory);
create index material_prices_supplier_idx
  on public.material_prices (supplier_id)
  where supplier_id is not null;

-- Free text over the fields somebody actually types: "MDF 18mm", "Dangote
-- cement", "hollow concrete block 200".
create index material_prices_search_idx
  on public.material_prices
  using gin (
    to_tsvector(
      'simple',
      coalesce(material, '') || ' ' ||
      coalesce(specification, '') || ' ' ||
      coalesce(brand, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(subcategory, '')
    )
  );

-- Trigram search for the partial words a full-text index will not match —
-- "gyps" while somebody is still typing.
create extension if not exists pg_trgm;
create index material_prices_material_trgm_idx
  on public.material_prices
  using gin (material gin_trgm_ops);

create trigger material_prices_set_updated_at
  before update on public.material_prices
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- material_price_events
--
-- Every status change, edit and rejection. The price rows are append-only, but
-- "append-only" is only trustworthy if the exceptions are visible: this is
-- where a correction shows up, with who made it and what it was before.
-- ---------------------------------------------------------------------------

create table public.material_price_events (
  id uuid primary key default gen_random_uuid(),
  price_id uuid not null references public.material_prices (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,

  action text not null check (
    action in ('created', 'approved', 'rejected', 'edited', 'expired', 'superseded', 'imported')
  ),
  from_status public.price_data_status,
  to_status public.price_data_status,
  from_price numeric(14, 2),
  to_price numeric(14, 2),
  note text,

  created_at timestamptz not null default now()
);

create index material_price_events_price_idx
  on public.material_price_events (price_id, created_at desc);
create index material_price_events_actor_idx
  on public.material_price_events (actor_id, created_at desc);

comment on table public.material_price_events is
  'Audit trail for the price book. Written by trigger; nothing writes it by hand.';

-- ---------------------------------------------------------------------------
-- The audit trigger
--
-- Security definer so it can write the audit row regardless of the writer's
-- policies. It records what happened rather than deciding whether it may.
-- ---------------------------------------------------------------------------

create function public.record_material_price_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  what text;
begin
  if tg_op = 'INSERT' then
    insert into public.material_price_events (
      price_id, actor_id, action, to_status, to_price, note
    )
    values (
      new.id,
      new.created_by,
      case when new.data_status = 'educational_estimate' then 'imported' else 'created' end,
      new.data_status,
      new.price_etb,
      new.notes
    );
    return new;
  end if;

  -- Nothing worth recording.
  if new.data_status = old.data_status
     and new.price_etb = old.price_etb
     and new.superseded_by is not distinct from old.superseded_by then
    return new;
  end if;

  what := case
    when new.superseded_by is distinct from old.superseded_by
         and new.superseded_by is not null then 'superseded'
    when new.data_status = 'admin_verified'
         and old.data_status <> 'admin_verified' then 'approved'
    when new.data_status = 'expired' and old.data_status <> 'expired' then 'expired'
    when new.price_etb <> old.price_etb then 'edited'
    else 'edited'
  end;

  insert into public.material_price_events (
    price_id, actor_id, action, from_status, to_status, from_price, to_price
  )
  values (
    new.id,
    coalesce(new.verified_by, auth.uid()),
    what,
    old.data_status,
    new.data_status,
    old.price_etb,
    new.price_etb
  );

  return new;
end;
$$;

create trigger material_prices_audit
  after insert or update on public.material_prices
  for each row
  execute function public.record_material_price_event();

-- ---------------------------------------------------------------------------
-- Who is an administrator
--
-- A function rather than a subquery repeated in four policies, and
-- security definer so the policy can read `profiles.is_admin` without the
-- reader needing a select policy on that row. Defined before the policies that
-- call it — a policy body is parsed at creation and cannot reference a function
-- that does not exist yet.
-- ---------------------------------------------------------------------------

create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

comment on function public.is_platform_admin() is
  'True when the caller has the admin flag. Used by the price book policies.';

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Reading is public. A price book nobody can read without an account is not a
-- price book, and every figure in it carries a status saying how much it is
-- worth.
--
-- Writing is open to any authenticated member, but only at
-- `supplier_submitted` — the check constraint below is what stops somebody
-- inserting their own price as `admin_verified`. That is the whole security
-- model of the queue, so it lives in the policy rather than in application
-- code where a second caller could forget it.
-- ---------------------------------------------------------------------------

alter table public.material_prices enable row level security;
alter table public.material_price_events enable row level security;

create policy "Prices are readable by everyone"
  on public.material_prices for select
  to authenticated, anon
  using (true);

create policy "Members submit prices for review"
  on public.material_prices for insert
  to authenticated
  with check (
    created_by = auth.uid()
    -- The only status a member may create. Anything above this is the
    -- administrator's to grant.
    and data_status = 'supplier_submitted'
    and verified_by is null
    and verified_at is null
  );

-- A submitter may correct their own row while it is still waiting, and may not
-- promote it. Once an admin has touched it, it is out of their hands.
create policy "Submitters correct their own pending prices"
  on public.material_prices for update
  to authenticated
  using (created_by = auth.uid() and data_status = 'supplier_submitted')
  with check (created_by = auth.uid() and data_status = 'supplier_submitted');

create policy "Administrators manage the price book"
  on public.material_prices for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "Price history is readable by everyone"
  on public.material_price_events for select
  to authenticated, anon
  using (true);

-- ---------------------------------------------------------------------------
-- Lookup
--
-- One place that answers "what is this material worth", so the AI, the BOQ and
-- the exchange cannot disagree. Ordering is the trust order first, then recency
-- — `data_status desc` works because the enum is declared weakest-first.
--
-- City is a preference, not a filter: a price in Addis is better than no price
-- at all when somebody asks about Bahir Dar, and the row carries its own city
-- so the caller can say so.
-- ---------------------------------------------------------------------------

/**
 * The searchable words in a phrase.
 *
 * "MDF 18mm" has to find a row whose specification reads "18 mm", so a digit
 * pressed against a letter is split apart — the same rule the TypeScript
 * matcher applies in `terms()`, and the reason the two agree about what a word
 * is. Without it the brief's own example query matches nothing at all: "18mm"
 * never meets "18 mm" under any amount of ilike.
 *
 * Immutable so it can be used in an index expression later if the book grows.
 */
create function public.price_search_terms(phrase text)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(word) filter (where length(word) > 1),
    '{}'::text[]
  )
  from unnest(
    regexp_split_to_array(
      regexp_replace(
        regexp_replace(lower(coalesce(phrase, '')), '([0-9])([a-z])', '\1 \2', 'g'),
        '([a-z])([0-9])', '\1 \2', 'g'
      ),
      '[^a-z0-9]+'
    )
  ) as word;
$$;

/**
 * Candidate prices for a phrase.
 *
 * Deliberately broad. Postgres does the cheap, wide part — anything mentioning
 * one of the significant words — and the strict part happens in TypeScript,
 * where a mismatched size can be made to count *against* a candidate. No `ilike`
 * can express that, and the difference between 18 mm and 12 mm MDF is exactly
 * the thing that must not be blurred: they are ETB 7,000 and ETB 9,000, and
 * quoting one for the other is the whole failure this book exists to prevent.
 *
 * A wide net is affordable because the strict half runs on twenty rows.
 *
 * City is a preference, not a filter: a price in Addis is better than no price
 * at all when somebody asks about Bahir Dar, and every row carries its own city
 * so the caller can say which it got.
 */
create function public.material_price_lookup(
  search text,
  target_city text default null,
  target_unit text default null,
  max_rows integer default 10
)
returns setof public.material_prices
language sql
stable
security definer
set search_path = public
as $$
  with terms as (select public.price_search_terms(search) as words)
  select m.*
  from public.material_prices m, terms
  where m.data_status <> 'expired'
    and m.superseded_by is null
    and cardinality(terms.words) > 0
    -- Any word, not all of them. "18 mm laminated MDF board" must still find a
    -- row that only says "MDF board", which the scorer then ranks below an
    -- exact one.
    and exists (
      select 1 from unnest(terms.words) as word
      where m.material ilike '%' || word || '%'
         or m.specification ilike '%' || word || '%'
         or m.brand ilike '%' || word || '%'
         or m.category ilike '%' || word || '%'
    )
    and (target_unit is null or m.unit = target_unit)
  order by
    (target_city is not null and m.city_region ilike '%' || target_city || '%') desc,
    m.data_status desc,
    m.price_date desc,
    m.updated_at desc
  limit greatest(1, least(max_rows, 200));
$$;

-- ---------------------------------------------------------------------------
-- No statistics function here, deliberately.
--
-- The obvious next function is min/max/avg over the same search, and it would
-- be wrong. `material_price_lookup` is broad on purpose — asking it for "MDF"
-- returns 6, 9, 12, 15 and 18 mm board, because it cannot tell which thickness
-- somebody meant. A range computed straight off that reads
-- "ETB 5,100 – 9,000 per sheet", which is true of the word "MDF" and false of
-- every actual product.
--
-- The range shown on screen has to be computed after the scorer has thrown out
-- the wrong sizes and the disagreeing units, and that lives in
-- `src/lib/prices/`. One place decides what is comparable; a second one in SQL
-- would eventually disagree with it, and the two would be wrong on different
-- screens.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Expiry
--
-- Marks anything older than the validity period, without deleting a thing.
-- Educational baselines are left alone: they were never current, so they cannot
-- go stale, and expiring the whole seed the first time this runs would empty
-- the book.
--
-- Returns the number of rows marked so a scheduled caller can log it.
-- ---------------------------------------------------------------------------

create function public.expire_stale_material_prices(validity_days integer default 180)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.material_prices
  set data_status = 'expired'
  where data_status in ('admin_verified', 'supplier_submitted', 'web_sourced')
    and price_date < current_date - make_interval(days => validity_days);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

comment on function public.expire_stale_material_prices(integer) is
  'Marks prices older than the validity period as expired. Never deletes. Educational baselines are exempt.';

grant execute on function public.material_price_lookup(text, text, text, integer)
  to anon, authenticated;
grant execute on function public.price_search_terms(text) to anon, authenticated;
grant execute on function public.is_platform_admin() to authenticated;
-- Deliberately not granted to anon or authenticated: expiry is an operator
-- action, run by a scheduler or an admin through the service role.
revoke all on function public.expire_stale_material_prices(integer) from public;

commit;
