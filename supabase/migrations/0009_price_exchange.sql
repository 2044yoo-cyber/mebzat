-- Construction Price Exchange: live pricing, competitive bidding and history.
--
-- Materials, labour, furniture and project rates are one table with a sector
-- column rather than four near-identical tables. They differ only in what the
-- unit means, and splitting them would mean four copies of every index, policy
-- and trigger, plus a UNION in every query that spans sectors — which the
-- market table does on its default view. The sector-specific names are
-- provided as views, so `material_prices` and friends are still queryable.
--
-- Additive only.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.price_sector as enum (
  'material',
  'labor',
  'furniture',
  'project',
  'equipment',
  'service'
);

create type public.price_availability as enum (
  'in_stock',
  'made_to_order',
  'out_of_stock',
  'available',
  'booked'
);

create type public.bid_status as enum ('open', 'accepted', 'rejected', 'withdrawn');

create type public.price_event as enum (
  'new_bid',
  'price_dropped',
  'price_increased',
  'supplier_replied',
  'available_again'
);

-- ---------------------------------------------------------------------------
-- price_listings
-- One published price. current_price is the supplier's own figure; the bid
-- aggregates below are maintained by trigger so the market table can sort and
-- filter on them without a correlated subquery per row.
-- ---------------------------------------------------------------------------

create table public.price_listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  -- Set when the price mirrors a marketplace product, so editing the product
  -- can keep the exchange in step.
  product_id uuid references public.products (id) on delete set null,

  sector public.price_sector not null,
  item text not null,
  category text not null,
  specification text,
  brand text,

  unit text not null,
  current_price numeric(14, 2) not null check (current_price >= 0),
  currency text not null default 'ETB',

  location_city text,
  location_country text not null default 'Ethiopia',
  delivery_days integer check (delivery_days >= 0),
  availability public.price_availability not null default 'in_stock',

  -- Denormalised bid aggregates, maintained by trigger.
  lowest_bid numeric(14, 2),
  highest_bid numeric(14, 2),
  bid_count integer not null default 0,

  rating numeric(3, 2) not null default 0 check (rating >= 0 and rating <= 5),
  verified boolean not null default false,
  views integer not null default 0,

  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.price_listings is
  'A published price on the Construction Price Exchange.';

-- The market table filters by sector then sorts by price or recency; these
-- cover both without scanning.
create index price_listings_sector_price_idx
  on public.price_listings (sector, current_price)
  where published;
create index price_listings_sector_updated_idx
  on public.price_listings (sector, updated_at desc)
  where published;
create index price_listings_supplier_idx on public.price_listings (supplier_id);
create index price_listings_company_idx on public.price_listings (company_id);
create index price_listings_city_idx on public.price_listings (location_city);
create index price_listings_category_idx on public.price_listings (category);
create index price_listings_product_idx
  on public.price_listings (product_id)
  where product_id is not null;

-- Free-text search across the fields a buyer actually types.
create index price_listings_search_idx
  on public.price_listings
  using gin (
    to_tsvector(
      'simple',
      coalesce(item, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(specification, '') || ' ' ||
      coalesce(brand, '')
    )
  );

create trigger price_listings_set_updated_at
  before update on public.price_listings
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- price_bids
-- A competing offer against a listing.
-- ---------------------------------------------------------------------------

create table public.price_bids (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.price_listings (id) on delete cascade,
  bidder_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,

  price numeric(14, 2) not null check (price >= 0),
  currency text not null default 'ETB',
  unit text not null,
  delivery_days integer check (delivery_days >= 0),
  note text,

  status public.bid_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One live bid per supplier per listing; improving an offer updates it.
  constraint price_bids_one_open_per_bidder unique (listing_id, bidder_id)
);

create index price_bids_listing_idx on public.price_bids (listing_id, price);
create index price_bids_bidder_idx on public.price_bids (bidder_id);

create trigger price_bids_set_updated_at
  before update on public.price_bids
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- price_history
-- Append-only. Written by trigger whenever a price changes, so the 30/90/365
-- day charts read one indexed table instead of reconstructing from audit logs.
-- ---------------------------------------------------------------------------

create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.price_listings (id) on delete cascade,
  price numeric(14, 2) not null,
  currency text not null default 'ETB',
  recorded_at timestamptz not null default now()
);

create index price_history_listing_time_idx
  on public.price_history (listing_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- price_watchers
-- ---------------------------------------------------------------------------

create table public.price_watchers (
  listing_id uuid not null references public.price_listings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_id, user_id)
);

create index price_watchers_user_idx on public.price_watchers (user_id);

-- ---------------------------------------------------------------------------
-- price_notifications
-- ---------------------------------------------------------------------------

create table public.price_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid references public.price_listings (id) on delete cascade,
  bid_id uuid references public.price_bids (id) on delete cascade,
  event public.price_event not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index price_notifications_user_idx
  on public.price_notifications (user_id, created_at desc);
create index price_notifications_unread_idx
  on public.price_notifications (user_id)
  where read_at is null;

-- ---------------------------------------------------------------------------
-- Sector views
-- The names the product spec asks for, without duplicating the storage.
-- ---------------------------------------------------------------------------

create view public.material_prices as
  select * from public.price_listings where sector = 'material';

create view public.labor_prices as
  select * from public.price_listings where sector = 'labor';

create view public.furniture_prices as
  select * from public.price_listings where sector = 'furniture';

create view public.project_prices as
  select * from public.price_listings where sector = 'project';

create view public.supplier_prices as
  select * from public.price_listings where sector in ('material', 'furniture', 'equipment');

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Published prices are public — the exchange only works if buyers can compare
-- without an account. Writing is restricted to the owner.
-- ---------------------------------------------------------------------------

alter table public.price_listings enable row level security;
alter table public.price_bids enable row level security;
alter table public.price_history enable row level security;
alter table public.price_watchers enable row level security;
alter table public.price_notifications enable row level security;

create policy "Published prices are viewable by everyone"
  on public.price_listings for select
  to authenticated, anon
  using (published or supplier_id = auth.uid());

create policy "Suppliers manage their own prices"
  on public.price_listings for insert
  to authenticated
  with check (supplier_id = auth.uid());

create policy "Suppliers update their own prices"
  on public.price_listings for update
  to authenticated
  using (supplier_id = auth.uid())
  with check (supplier_id = auth.uid());

create policy "Suppliers delete their own prices"
  on public.price_listings for delete
  to authenticated
  using (supplier_id = auth.uid());

-- Bids are public so the market can show competition honestly.
create policy "Bids are viewable by everyone"
  on public.price_bids for select
  to authenticated, anon
  using (true);

create policy "Users submit their own bids"
  on public.price_bids for insert
  to authenticated
  with check (bidder_id = auth.uid());

create policy "Bidders update their own bids"
  on public.price_bids for update
  to authenticated
  using (bidder_id = auth.uid())
  with check (bidder_id = auth.uid());

-- The listing owner may accept or reject, which is also an update, so it needs
-- its own policy rather than widening the bidder's.
create policy "Listing owners decide on bids"
  on public.price_bids for update
  to authenticated
  using (
    exists (
      select 1 from public.price_listings l
      where l.id = price_bids.listing_id and l.supplier_id = auth.uid()
    )
  );

create policy "Price history is viewable by everyone"
  on public.price_history for select
  to authenticated, anon
  using (true);

create policy "Users manage their own watches"
  on public.price_watchers for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users read their own notifications"
  on public.price_notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users mark their own notifications read"
  on public.price_notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- History and change notifications
-- ---------------------------------------------------------------------------

create function public.record_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  watcher uuid;
  direction public.price_event;
begin
  if tg_op = 'INSERT' then
    insert into public.price_history (listing_id, price, currency)
    values (new.id, new.current_price, new.currency);
    return new;
  end if;

  if new.current_price = old.current_price then
    return new;
  end if;

  insert into public.price_history (listing_id, price, currency)
  values (new.id, new.current_price, new.currency);

  direction := case
    when new.current_price < old.current_price then 'price_dropped'
    else 'price_increased'
  end;

  -- Everyone watching this listing hears about the move.
  for watcher in
    select user_id from public.price_watchers where listing_id = new.id
  loop
    insert into public.price_notifications (user_id, listing_id, event, title, body)
    values (
      watcher,
      new.id,
      direction,
      new.item || ' price ' ||
        case when direction = 'price_dropped' then 'dropped' else 'increased' end,
      old.current_price || ' -> ' || new.current_price || ' ' || new.currency ||
        ' ' || new.unit
    );
  end loop;

  return new;
end;
$$;

create trigger price_listings_record_change
  after insert or update on public.price_listings
  for each row
  execute function public.record_price_change();

-- ---------------------------------------------------------------------------
-- Bid aggregates and notifications
-- Recomputed from the open bids rather than adjusted incrementally, so a
-- withdrawal or a rejection cannot leave the aggregate wrong.
-- ---------------------------------------------------------------------------

create function public.refresh_listing_bids()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.listing_id, old.listing_id);
  listing public.price_listings;
begin
  update public.price_listings l
  set lowest_bid = agg.low,
      highest_bid = agg.high,
      bid_count = agg.count
  from (
    select
      min(price) as low,
      max(price) as high,
      count(*)::integer as count
    from public.price_bids
    where listing_id = target and status = 'open'
  ) agg
  where l.id = target;

  if tg_op = 'INSERT' then
    select * into listing from public.price_listings where id = target;

    -- The supplier being undercut, plus anyone watching the listing.
    insert into public.price_notifications (user_id, listing_id, bid_id, event, title, body)
    select
      recipient,
      target,
      new.id,
      'new_bid',
      'New bid on ' || listing.item,
      new.price || ' ' || new.currency || ' ' || new.unit
    from (
      select listing.supplier_id as recipient
      union
      select user_id from public.price_watchers where listing_id = target
    ) recipients
    where recipient <> new.bidder_id;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger price_bids_refresh_aggregates
  after insert or update or delete on public.price_bids
  for each row
  execute function public.refresh_listing_bids();

-- ---------------------------------------------------------------------------
-- Market statistics
-- Average, low and high across comparable listings, used for the market price
-- column and the trend indicator.
-- ---------------------------------------------------------------------------

create function public.price_market_stats(target_category text, target_unit text)
returns table (
  average_price numeric,
  lowest_price numeric,
  highest_price numeric,
  sample_size bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    round(avg(current_price), 2),
    min(current_price),
    max(current_price),
    count(*)::bigint
  from public.price_listings
  where published
    and category = target_category
    and unit = target_unit;
$$;

/** Points for the 30/90/365 day charts, one row per day. */
create function public.price_trend(target_listing_id uuid, days integer)
returns table (day date, price numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    date_trunc('day', recorded_at)::date as day,
    round(avg(price), 2) as price
  from public.price_history
  where listing_id = target_listing_id
    and recorded_at > now() - make_interval(days => days)
  group by 1
  order by 1;
$$;

-- ---------------------------------------------------------------------------
-- Keeping the exchange in step with the marketplace
-- Editing a linked product updates its price listing, so a supplier maintains
-- one number rather than two that can disagree.
-- ---------------------------------------------------------------------------

create function public.sync_price_from_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price is null then
    return new;
  end if;

  update public.price_listings
  set current_price = new.price,
      currency = new.currency,
      unit = coalesce(new.unit, unit),
      item = new.title,
      availability = case new.stock_status
        when 'in_stock' then 'in_stock'::public.price_availability
        when 'made_to_order' then 'made_to_order'::public.price_availability
        else 'out_of_stock'::public.price_availability
      end
  where product_id = new.id;

  return new;
end;
$$;

create trigger products_sync_price_exchange
  after update on public.products
  for each row
  execute function public.sync_price_from_product();

grant execute on function public.price_market_stats(text, text) to anon, authenticated;
grant execute on function public.price_trend(uuid, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.price_listings;
    alter publication supabase_realtime add table public.price_bids;
    alter publication supabase_realtime add table public.price_notifications;
  end if;
end
$$;
