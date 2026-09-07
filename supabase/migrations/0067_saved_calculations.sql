-- Saved calculations, and the material prices calculators will read.
--
-- ## What this is for
--
-- The Construction Calculators run entirely in the browser: forty-one of them,
-- all arithmetic, no round trip. Two things about them do need the database.
--
-- **A saved calculation is a document.** Somebody who names and keeps a bill of
-- quantities expects to find it from another device, which rules out browser
-- storage. Favourites and the recent-results list stay on the device, because
-- those are conveniences rather than records and they must keep working signed
-- out — the brief was explicit that basic calculators do not require an account.
--
-- **Material prices belong to Medosha, not to the calculator.** The cost
-- calculators ask the reader to type a rate, and they will go on doing so, but
-- where the platform knows a current price it should offer it. That needs a
-- table with a material, a unit, a city, a price and — the part that makes it
-- honest — the date it was collected and where it came from.
--
-- ## What this does not touch
--
-- No existing table is altered and no data is moved. `material_prices` is new
-- and starts empty: nothing here invents an Ethiopian cement price, and a
-- calculator with no row to read falls back to manual entry, which is what it
-- does today.

-- ---------------------------------------------------------------- saved work

create table if not exists public.saved_calculations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  /** Which calculator. Matches the slug in src/lib/calculators/registry.ts. */
  slug text not null,
  /** What the person called it. */
  name text not null,

  /**
   * The inputs, exactly as typed, including each field's unit.
   *
   * Inputs rather than outputs: re-running the calculator over stored inputs
   * always agrees with the calculator, whereas a stored result would drift the
   * first time a formula is corrected — and would then be a number in the
   * database that the software can no longer reproduce.
   */
  inputs jsonb not null default '{}'::jsonb,

  /** The headline, for the list. Display only; `inputs` is the source. */
  headline text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint saved_calculations_name_not_blank check (length(btrim(name)) > 0),
  constraint saved_calculations_slug_not_blank check (length(btrim(slug)) > 0)
);

create index if not exists saved_calculations_user_idx
  on public.saved_calculations (user_id, created_at desc);

create index if not exists saved_calculations_slug_idx
  on public.saved_calculations (user_id, slug);

alter table public.saved_calculations enable row level security;

-- Yours and only yours. There is no sharing model for a saved calculation yet;
-- when there is, it arrives as an explicit grant rather than by loosening this.
drop policy if exists saved_calculations_select_own on public.saved_calculations;
create policy saved_calculations_select_own on public.saved_calculations
  for select using (auth.uid() = user_id);

drop policy if exists saved_calculations_insert_own on public.saved_calculations;
create policy saved_calculations_insert_own on public.saved_calculations
  for insert with check (auth.uid() = user_id);

drop policy if exists saved_calculations_update_own on public.saved_calculations;
create policy saved_calculations_update_own on public.saved_calculations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists saved_calculations_delete_own on public.saved_calculations;
create policy saved_calculations_delete_own on public.saved_calculations
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------- prices for calculators
--
-- No new price table. `public.material_prices` already exists — 0041 built it,
-- 0042 seeded it, and the Price Exchange writes to it — and it is a far better
-- record than a fresh one would have been: it carries `price_date`,
-- `data_status`, `verified`, `supplier` and a `superseded_by` chain, so a price
-- can be retired without deleting the history that justified it.
--
-- Adding a second table here would have split the answer to "what does cement
-- cost in Addis" across two places, which is exactly the duplication this work
-- was asked to avoid. What the calculators actually needed was a way to *ask*
-- that table one question, so that is all this adds.

/**
 * The price a calculator should offer for a material, or nothing at all.
 *
 * Nothing is a real answer and the calculators handle it by asking the reader
 * to type a figure. That is the honest outcome: returning a national average
 * nobody measured, or a two-year-old quotation presented as current, would look
 * exactly as confident as a good price and would be wrong.
 *
 * ## The ordering
 *
 * Rows superseded by a newer one are excluded outright — that is what
 * `superseded_by` is for. Of what remains, an exact city match beats a price
 * from elsewhere, an admin-verified figure beats a submitted one, and among
 * equals the most recent wins.
 *
 * `age_days` comes back with the price so the caller can print "Price last
 * updated: …" and grey out anything past its useful life. The price book's own
 * validity window is 180 days (see src/lib/prices/status.ts); this function
 * reports the age rather than applying that rule, so one definition of "stale"
 * stays in the application where the label is written.
 */
create or replace function public.calculator_material_price(
  p_material text,
  p_city text default 'Addis Ababa'
)
returns table (
  price numeric,
  currency text,
  unit text,
  material text,
  city_region text,
  supplier text,
  data_status public.price_data_status,
  verified boolean,
  price_date date,
  age_days integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    mp.price_etb,
    mp.currency,
    mp.unit,
    mp.material,
    mp.city_region,
    mp.supplier,
    mp.data_status,
    mp.verified,
    mp.price_date,
    (current_date - mp.price_date)::integer as age_days
  from public.material_prices mp
  where mp.superseded_by is null
    and lower(btrim(mp.material)) = lower(btrim(p_material))
  order by
    (lower(mp.city_region) = lower(coalesce(p_city, ''))) desc,
    mp.verified desc,
    mp.price_date desc
  limit 1;
$$;

comment on function public.calculator_material_price(text, text) is
  'The price the Construction Calculators offer for a material, preferring the caller''s city and an admin-verified figure. Returns no row when the price book has nothing, which the calculators treat as "type your own".';

grant execute on function public.calculator_material_price(text, text) to anon, authenticated;
