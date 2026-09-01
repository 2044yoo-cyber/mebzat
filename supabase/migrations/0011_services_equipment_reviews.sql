-- Phase 3: Professional services, equipment rental, and reviews.
--
-- Additive only — no existing table is altered.
--
-- Services and equipment are separate from products because they are priced
-- and transacted differently: a product has a price and a stock status, a
-- service has a rate and an availability window, and equipment has three
-- rates and a booking calendar. Forcing all three through the products table
-- would mean a column that is null for two thirds of the rows.
--
-- Reviews are one polymorphic table rather than four. A rating is a rating
-- whatever it is about, the aggregate is the same query in every case, and a
-- table per subject would mean four copies of the moderation and one-per-user
-- rules.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.service_pricing as enum (
  'hourly',
  'daily',
  'per_m2',
  'fixed',
  'per_project',
  'on_request'
);

create type public.listing_status as enum ('draft', 'published', 'archived');

create type public.equipment_condition as enum (
  'new',
  'excellent',
  'good',
  'fair'
);

create type public.rental_period as enum ('daily', 'weekly', 'monthly');

create type public.booking_status as enum (
  'requested',
  'confirmed',
  'active',
  'returned',
  'cancelled',
  'declined'
);

create type public.review_subject as enum (
  'company',
  'professional',
  'product',
  'project',
  'service',
  'equipment'
);

-- ---------------------------------------------------------------------------
-- service_categories (reference data)
-- ---------------------------------------------------------------------------

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  icon text,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

insert into public.service_categories (slug, name, icon, position) values
  ('architecture', 'Architecture & Design', 'DraftingCompass', 1),
  ('structural', 'Structural Engineering', 'Frame', 2),
  ('mep', 'MEP Engineering', 'Zap', 3),
  ('surveying', 'Surveying & Quantity', 'Ruler', 4),
  ('general-contracting', 'General Contracting', 'HardHat', 5),
  ('interior', 'Interior Design & Fit-out', 'Sofa', 6),
  ('landscaping', 'Landscaping', 'Trees', 7),
  ('electrical', 'Electrical Works', 'Plug', 8),
  ('plumbing', 'Plumbing & Sanitary', 'Droplets', 9),
  ('finishing', 'Finishing & Painting', 'PaintRoller', 10),
  ('joinery', 'Joinery & Furniture', 'Hammer', 11),
  ('project-management', 'Project Management', 'ClipboardList', 12);

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  category_id uuid references public.service_categories (id) on delete set null,

  title text not null,
  slug text not null,
  description text,

  pricing public.service_pricing not null default 'on_request',
  price_from numeric(14, 2) check (price_from >= 0),
  price_to numeric(14, 2) check (price_to >= 0),
  currency text not null default 'ETB',
  unit text,

  -- Roughly how long before the provider can start, in days. Null means the
  -- provider has not said, which reads differently from "available now".
  lead_time_days integer check (lead_time_days >= 0),
  accepting_work boolean not null default true,

  location_city text,
  location_country text not null default 'Ethiopia',
  serves_remotely boolean not null default false,

  cover_image_url text,
  rating numeric(3, 2) not null default 0 check (rating between 0 and 5),
  review_count integer not null default 0,
  views integer not null default 0,

  status public.listing_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint services_price_range check (
    price_to is null or price_from is null or price_to >= price_from
  ),
  constraint services_slug_unique unique (provider_id, slug)
);

create index services_published_idx
  on public.services (created_at desc)
  where status = 'published';
create index services_category_idx on public.services (category_id);
create index services_provider_idx on public.services (provider_id);
create index services_city_idx on public.services (location_city);
create index services_rating_idx on public.services (rating desc)
  where status = 'published';
create index services_search_idx
  on public.services
  using gin (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
  );

create trigger services_set_updated_at
  before update on public.services
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- equipment
-- ---------------------------------------------------------------------------

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,

  title text not null,
  slug text not null,
  category text not null,
  description text,
  brand text,
  model text,
  year_made smallint check (year_made between 1950 and 2100),
  condition public.equipment_condition not null default 'good',

  -- Three rates rather than one rate plus a period: renters compare weekly
  -- against daily, and deriving one from the other invents a discount the
  -- owner never offered.
  daily_rate numeric(14, 2) check (daily_rate >= 0),
  weekly_rate numeric(14, 2) check (weekly_rate >= 0),
  monthly_rate numeric(14, 2) check (monthly_rate >= 0),
  currency text not null default 'ETB',
  deposit numeric(14, 2) check (deposit >= 0),

  operator_included boolean not null default false,
  delivery_available boolean not null default false,
  min_rental_days integer not null default 1 check (min_rental_days >= 1),

  location_city text,
  location_country text not null default 'Ethiopia',

  cover_image_url text,
  rating numeric(3, 2) not null default 0 check (rating between 0 and 5),
  review_count integer not null default 0,
  views integer not null default 0,

  available boolean not null default true,
  status public.listing_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint equipment_slug_unique unique (owner_id, slug),
  constraint equipment_has_a_rate check (
    daily_rate is not null or weekly_rate is not null or monthly_rate is not null
  )
);

create index equipment_published_idx
  on public.equipment (created_at desc)
  where status = 'published';
create index equipment_category_idx on public.equipment (category);
create index equipment_owner_idx on public.equipment (owner_id);
create index equipment_city_idx on public.equipment (location_city);
create index equipment_rate_idx on public.equipment (daily_rate)
  where status = 'published' and available;
create index equipment_search_idx
  on public.equipment
  using gin (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(category, '') || ' ' ||
      coalesce(brand, '') || ' ' || coalesce(model, '') || ' ' ||
      coalesce(description, '')
    )
  );

create trigger equipment_set_updated_at
  before update on public.equipment
  for each row
  execute function public.set_updated_at();

create table public.equipment_images (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  url text not null,
  alt text,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index equipment_images_idx
  on public.equipment_images (equipment_id, position);

-- ---------------------------------------------------------------------------
-- equipment_bookings
-- ---------------------------------------------------------------------------

create table public.equipment_bookings (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  renter_id uuid not null references public.profiles (id) on delete cascade,

  starts_on date not null,
  ends_on date not null,
  period public.rental_period not null default 'daily',
  quoted_total numeric(14, 2) check (quoted_total >= 0),
  currency text not null default 'ETB',
  note text,

  status public.booking_status not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bookings_dates_ordered check (ends_on >= starts_on)
);

create index equipment_bookings_equipment_idx
  on public.equipment_bookings (equipment_id, starts_on);
create index equipment_bookings_renter_idx
  on public.equipment_bookings (renter_id, created_at desc);

create trigger equipment_bookings_set_updated_at
  before update on public.equipment_bookings
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- reviews
-- One review per user per subject, enforced by a unique constraint: editing
-- your review should change it, not add a second vote.
-- ---------------------------------------------------------------------------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  subject_type public.review_subject not null,
  subject_id uuid not null,

  rating smallint not null check (rating between 1 and 5),
  title text,
  body text check (body is null or length(body) <= 5000),

  -- Set when the reviewer demonstrably transacted: an awarded quote, a
  -- completed booking. The UI marks these, and only these, as verified.
  verified boolean not null default false,

  helpful_count integer not null default 0,
  reply text,
  replied_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reviews_one_per_subject unique (author_id, subject_type, subject_id)
);

create index reviews_subject_idx
  on public.reviews (subject_type, subject_id, created_at desc);
create index reviews_author_idx on public.reviews (author_id);

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row
  execute function public.set_updated_at();

create table public.review_helpful (
  review_id uuid not null references public.reviews (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.equipment enable row level security;
alter table public.equipment_images enable row level security;
alter table public.equipment_bookings enable row level security;
alter table public.reviews enable row level security;
alter table public.review_helpful enable row level security;

create policy "Service categories are viewable by everyone"
  on public.service_categories for select
  to authenticated, anon
  using (true);

create policy "Published services are viewable by everyone"
  on public.services for select
  to authenticated, anon
  using (status = 'published' or provider_id = auth.uid());

create policy "Providers manage their own services"
  on public.services for all
  to authenticated
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

create policy "Published equipment is viewable by everyone"
  on public.equipment for select
  to authenticated, anon
  using (status = 'published' or owner_id = auth.uid());

create policy "Owners manage their own equipment"
  on public.equipment for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Equipment images follow their listing"
  on public.equipment_images for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.equipment e
      where e.id = equipment_images.equipment_id
        and (e.status = 'published' or e.owner_id = auth.uid())
    )
  );

create policy "Owners manage their equipment images"
  on public.equipment_images for all
  to authenticated
  using (
    exists (
      select 1 from public.equipment e
      where e.id = equipment_images.equipment_id and e.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.equipment e
      where e.id = equipment_images.equipment_id and e.owner_id = auth.uid()
    )
  );

-- A booking is between two parties, so both can see it and nobody else can.
create policy "Bookings are visible to renter and owner"
  on public.equipment_bookings for select
  to authenticated
  using (
    renter_id = auth.uid()
    or exists (
      select 1 from public.equipment e
      where e.id = equipment_bookings.equipment_id and e.owner_id = auth.uid()
    )
  );

create policy "Renters request their own bookings"
  on public.equipment_bookings for insert
  to authenticated
  with check (renter_id = auth.uid());

create policy "Renters update their own bookings"
  on public.equipment_bookings for update
  to authenticated
  using (renter_id = auth.uid())
  with check (renter_id = auth.uid());

-- The owner confirms or declines, which is also an update and so needs its
-- own policy rather than widening the renter's.
create policy "Owners decide on bookings"
  on public.equipment_bookings for update
  to authenticated
  using (
    exists (
      select 1 from public.equipment e
      where e.id = equipment_bookings.equipment_id and e.owner_id = auth.uid()
    )
  );

create policy "Reviews are viewable by everyone"
  on public.reviews for select
  to authenticated, anon
  using (true);

create policy "Users write their own reviews"
  on public.reviews for insert
  to authenticated
  with check (author_id = auth.uid());

create policy "Authors update their own reviews"
  on public.reviews for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "Authors delete their own reviews"
  on public.reviews for delete
  to authenticated
  using (author_id = auth.uid());

create policy "Helpful marks are viewable by everyone"
  on public.review_helpful for select
  to authenticated, anon
  using (true);

create policy "Users manage their own helpful marks"
  on public.review_helpful for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Rating aggregates
-- Recomputed from the reviews rather than adjusted, so an edited or deleted
-- review cannot leave an average that no set of reviews would produce.
-- ---------------------------------------------------------------------------

create function public.refresh_review_aggregates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  subject public.review_subject := coalesce(new.subject_type, old.subject_type);
  subject_uuid uuid := coalesce(new.subject_id, old.subject_id);
  avg_rating numeric(3, 2);
  total integer;
begin
  select round(coalesce(avg(rating), 0), 2), count(*)
  into avg_rating, total
  from public.reviews
  where subject_type = subject and subject_id = subject_uuid;

  if subject = 'service' then
    update public.services
    set rating = avg_rating, review_count = total
    where id = subject_uuid;
  elsif subject = 'equipment' then
    update public.equipment
    set rating = avg_rating, review_count = total
    where id = subject_uuid;
  end if;
  -- Companies, professionals, products and projects read their aggregate
  -- through review_summary() instead of carrying a column, because those
  -- tables predate reviews and altering them is not additive.

  return coalesce(new, old);
end;
$$;

create trigger reviews_refresh_aggregates
  after insert or update or delete on public.reviews
  for each row
  execute function public.refresh_review_aggregates();

create function public.refresh_review_helpful()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.review_id, old.review_id);
begin
  update public.reviews
  set helpful_count = (
    select count(*) from public.review_helpful where review_id = target
  )
  where id = target;
  return coalesce(new, old);
end;
$$;

create trigger review_helpful_refresh
  after insert or delete on public.review_helpful
  for each row
  execute function public.refresh_review_helpful();

-- ---------------------------------------------------------------------------
-- Review notifications
-- ---------------------------------------------------------------------------

create function public.notify_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
  actor text;
begin
  recipient := case new.subject_type
    when 'professional' then new.subject_id
    when 'company' then (select owner_id from public.companies where id = new.subject_id)
    when 'product' then (select owner_id from public.products where id = new.subject_id)
    when 'project' then (select owner_id from public.projects where id = new.subject_id)
    when 'service' then (select provider_id from public.services where id = new.subject_id)
    when 'equipment' then (select owner_id from public.equipment where id = new.subject_id)
  end;

  if recipient is null or recipient = new.author_id then
    return new;
  end if;

  select coalesce(full_name, company_name, username, 'Someone')
  into actor from public.profiles where id = new.author_id;

  insert into public.notifications (user_id, actor_id, kind, title, body)
  values (
    recipient,
    new.author_id,
    'review',
    actor || ' left a ' || new.rating || '-star review',
    left(coalesce(new.body, new.title, ''), 120)
  );
  return new;
end;
$$;

create trigger reviews_notify
  after insert on public.reviews
  for each row
  execute function public.notify_review();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

/** Average, count and the 1-5 histogram for any review subject. */
create function public.review_summary(
  subject public.review_subject,
  subject_uuid uuid
)
returns table (
  average numeric,
  total bigint,
  five bigint,
  four bigint,
  three bigint,
  two bigint,
  one bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    round(coalesce(avg(rating), 0), 2),
    count(*)::bigint,
    count(*) filter (where rating = 5)::bigint,
    count(*) filter (where rating = 4)::bigint,
    count(*) filter (where rating = 3)::bigint,
    count(*) filter (where rating = 2)::bigint,
    count(*) filter (where rating = 1)::bigint
  from public.reviews
  where subject_type = subject and subject_id = subject_uuid;
$$;

/**
 * Whether a piece of equipment is free for a date range.
 *
 * Overlap is `starts <= existing_end and ends >= existing_start`, which is the
 * only form that catches a booking wholly inside another one.
 */
create function public.equipment_is_available(
  target_equipment_id uuid,
  from_date date,
  to_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.equipment_bookings
    where equipment_id = target_equipment_id
      and status in ('confirmed', 'active')
      and from_date <= ends_on
      and to_date >= starts_on
  );
$$;

create function public.increment_service_views(target_service_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.services set views = views + 1 where id = target_service_id;
$$;

create function public.increment_equipment_views(target_equipment_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.equipment set views = views + 1 where id = target_equipment_id;
$$;

grant execute on function public.review_summary(public.review_subject, uuid) to anon, authenticated;
grant execute on function public.equipment_is_available(uuid, date, date) to anon, authenticated;
grant execute on function public.increment_service_views(uuid) to anon, authenticated;
grant execute on function public.increment_equipment_views(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.equipment_bookings;
    alter publication supabase_realtime add table public.reviews;
  end if;
end
$$;
