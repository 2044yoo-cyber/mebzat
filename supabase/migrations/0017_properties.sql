-- Phase 5: Properties.
--
-- Buy and sell property on an interactive city map. Additive only.
--
-- The media table is deliberately wider than what is built today: photo and
-- floor plan are rendered now, while panorama, drone video, street view,
-- virtual tour and AR model are accepted, stored and returned but have no
-- viewer yet. Adding an enum value later is cheap; migrating a table that
-- assumed one media kind is not.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.property_type as enum (
  'apartment',
  'villa',
  'house',
  'commercial',
  'office',
  'warehouse',
  'shop',
  'hotel',
  'restaurant',
  'factory',
  'land',
  'farm',
  'industrial',
  'mixed_use'
);

create type public.listing_kind as enum ('sale', 'rent', 'lease', 'auction');

create type public.property_status as enum (
  'draft',
  'available',
  'under_offer',
  'sold',
  'rented',
  'withdrawn'
);

create type public.furnishing as enum (
  'unfurnished',
  'semi_furnished',
  'furnished'
);

-- One row per media item; the viewer is chosen from the kind.
create type public.property_media_kind as enum (
  'photo',
  'floor_plan',
  'site_plan',
  'panorama_360',
  'drone_video',
  'video',
  'street_view',
  'virtual_tour',
  'ar_model'
);

-- What is near a property. Kept as an enum so the map can filter and colour
-- by category without parsing free text.
create type public.place_kind as enum (
  'school',
  'university',
  'hospital',
  'clinic',
  'pharmacy',
  'supermarket',
  'market',
  'bank',
  'restaurant',
  'cafe',
  'hotel',
  'park',
  'gym',
  'place_of_worship',
  'bus_stop',
  'transport_hub',
  'fuel',
  'police',
  'government'
);

-- ---------------------------------------------------------------------------
-- cities
-- The map is Addis Ababa today and multiple Ethiopian cities later, so the
-- viewport is a row rather than a constant in the client.
-- ---------------------------------------------------------------------------

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  country text not null default 'Ethiopia',
  latitude double precision not null,
  longitude double precision not null,
  default_zoom real not null default 12,
  -- Bounding box, so a search can be clamped to the city.
  min_latitude double precision,
  max_latitude double precision,
  min_longitude double precision,
  max_longitude double precision,
  active boolean not null default true,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

insert into public.cities
  (slug, name, latitude, longitude, default_zoom,
   min_latitude, max_latitude, min_longitude, max_longitude, active, position)
values
  ('addis-ababa', 'Addis Ababa', 9.0192, 38.7525, 12.5, 8.84, 9.15, 38.61, 38.92, true, 1),
  ('adama', 'Adama', 8.5400, 39.2700, 12.5, 8.46, 8.62, 39.19, 39.35, false, 2),
  ('bahir-dar', 'Bahir Dar', 11.5936, 37.3908, 12.5, 11.52, 11.67, 37.31, 37.47, false, 3),
  ('hawassa', 'Hawassa', 7.0621, 38.4764, 12.5, 6.99, 7.14, 38.40, 38.56, false, 4),
  ('mekelle', 'Mekelle', 13.4967, 39.4753, 12.5, 13.42, 13.57, 39.40, 39.55, false, 5),
  ('dire-dawa', 'Dire Dawa', 9.5931, 41.8661, 12.5, 9.52, 9.67, 41.79, 41.94, false, 6);

-- ---------------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------------

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  city_id uuid references public.cities (id) on delete set null,

  title text not null,
  slug text not null,
  description text,

  property_type public.property_type not null,
  listing_kind public.listing_kind not null default 'sale',

  price numeric(16, 2) check (price >= 0),
  currency text not null default 'ETB',
  -- Set for rentals: 'month' or 'year'. Null for a sale, where the price is
  -- the whole price.
  price_period text,
  price_negotiable boolean not null default false,

  bedrooms smallint check (bedrooms >= 0),
  bathrooms smallint check (bathrooms >= 0),
  -- Built area in m². Land and farms use plot_area instead, which is why
  -- neither is required.
  area_m2 numeric(12, 2) check (area_m2 >= 0),
  plot_area_m2 numeric(12, 2) check (plot_area_m2 >= 0),
  floors smallint check (floors >= 0),
  floor_number smallint,
  parking_spaces smallint check (parking_spaces >= 0),
  year_built smallint check (year_built between 1800 and 2100),
  furnishing public.furnishing,

  address text,
  neighbourhood text,
  location_city text,
  location_country text not null default 'Ethiopia',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  -- Hides the exact pin and shows an approximate circle instead, for sellers
  -- who do not want their door on a public map.
  hide_exact_location boolean not null default false,

  -- Building height in metres, used by the 3D extrusion layer. Null falls
  -- back to floors × 3.
  building_height_m real check (building_height_m >= 0),

  amenities text[] not null default '{}',
  cover_image_url text,
  has_virtual_tour boolean not null default false,
  has_360 boolean not null default false,

  view_count integer not null default 0,
  save_count integer not null default 0,
  inquiry_count integer not null default 0,

  featured boolean not null default false,
  available_from date,
  status public.property_status not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint properties_slug_unique unique (owner_id, slug),
  -- A rental priced without a period is ambiguous; a sale with one is wrong.
  constraint properties_rent_has_period check (
    (listing_kind in ('rent', 'lease') and price_period is not null)
    or (listing_kind in ('sale', 'auction'))
  )
);

comment on table public.properties is
  'Property listings shown on the interactive city map.';

-- The map queries a viewport, so the hot path is a bounding-box scan over
-- available listings.
create index properties_viewport_idx
  on public.properties (latitude, longitude)
  where status = 'available';
create index properties_city_idx on public.properties (city_id)
  where status = 'available';
create index properties_type_idx
  on public.properties (property_type, listing_kind)
  where status = 'available';
create index properties_price_idx on public.properties (price)
  where status = 'available';
create index properties_bedrooms_idx on public.properties (bedrooms)
  where status = 'available';
create index properties_owner_idx on public.properties (owner_id);
create index properties_featured_idx on public.properties (featured, created_at desc)
  where status = 'available' and featured;
create index properties_amenities_idx on public.properties using gin (amenities);

create index properties_search_idx
  on public.properties
  using gin (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
      coalesce(neighbourhood, '') || ' ' || coalesce(address, '')
    )
  );

create trigger properties_set_updated_at
  before update on public.properties
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- property_media
-- ---------------------------------------------------------------------------

create table public.property_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  kind public.property_media_kind not null default 'photo',
  url text not null,
  thumbnail_url text,
  caption text,
  -- Which room or floor this belongs to, so a 360 tour can be assembled from
  -- its panoramas without a second table.
  room text,
  floor_label text,
  -- Where a panorama starts looking, and where an AR model sits. Null until
  -- the viewer that needs them exists.
  heading real,
  pitch real,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index property_media_property_idx
  on public.property_media (property_id, position);
create index property_media_kind_idx
  on public.property_media (property_id, kind);

-- ---------------------------------------------------------------------------
-- nearby_places
-- What is around a property. Stored rather than fetched live so the map does
-- not depend on a third-party geocoder being up.
-- ---------------------------------------------------------------------------

create table public.nearby_places (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.cities (id) on delete cascade,
  name text not null,
  kind public.place_kind not null,
  latitude double precision not null,
  longitude double precision not null,
  address text,
  rating numeric(3, 2) check (rating between 0 and 5),
  created_at timestamptz not null default now()
);

create index nearby_places_viewport_idx
  on public.nearby_places (latitude, longitude);
create index nearby_places_kind_idx on public.nearby_places (kind);

-- ---------------------------------------------------------------------------
-- property_saves and property_inquiries
-- ---------------------------------------------------------------------------

create table public.property_saves (
  property_id uuid not null references public.properties (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (property_id, user_id)
);

create index property_saves_user_idx
  on public.property_saves (user_id, created_at desc);

create table public.property_inquiries (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  message text,
  -- Set when the enquirer asked to see it in person.
  viewing_requested_on date,
  phone text,
  created_at timestamptz not null default now(),

  constraint inquiries_one_per_sender unique (property_id, sender_id)
);

create index property_inquiries_property_idx
  on public.property_inquiries (property_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.cities enable row level security;
alter table public.properties enable row level security;
alter table public.property_media enable row level security;
alter table public.nearby_places enable row level security;
alter table public.property_saves enable row level security;
alter table public.property_inquiries enable row level security;

create policy "Cities are viewable by everyone"
  on public.cities for select
  to authenticated, anon
  using (true);

create policy "Listed properties are viewable by everyone"
  on public.properties for select
  to authenticated, anon
  using (status <> 'draft' or owner_id = auth.uid());

create policy "Owners manage their own properties"
  on public.properties for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Media follows its property"
  on public.property_media for select
  to authenticated, anon
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_media.property_id
        and (p.status <> 'draft' or p.owner_id = auth.uid())
    )
  );

create policy "Owners manage their property media"
  on public.property_media for all
  to authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_media.property_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.properties p
      where p.id = property_media.property_id and p.owner_id = auth.uid()
    )
  );

create policy "Nearby places are viewable by everyone"
  on public.nearby_places for select
  to authenticated, anon
  using (true);

-- A save is private; only the count on the property is public.
create policy "Users manage their own saves"
  on public.property_saves for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Inquiries are visible to sender and owner"
  on public.property_inquiries for select
  to authenticated
  using (
    sender_id = auth.uid()
    or exists (
      select 1 from public.properties p
      where p.id = property_inquiries.property_id and p.owner_id = auth.uid()
    )
  );

create policy "Users send their own inquiries"
  on public.property_inquiries for insert
  to authenticated
  with check (sender_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Counters and notifications
-- ---------------------------------------------------------------------------

create function public.refresh_property_saves()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.property_id, old.property_id);
begin
  update public.properties
  set save_count = (
    select count(*) from public.property_saves where property_id = target
  )
  where id = target;
  return coalesce(new, old);
end;
$$;

create trigger property_saves_refresh
  after insert or delete on public.property_saves
  for each row
  execute function public.refresh_property_saves();

create function public.notify_property_inquiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  property public.properties;
  actor text;
begin
  select * into property from public.properties where id = new.property_id;
  if property.owner_id = new.sender_id then
    return new;
  end if;

  update public.properties
  set inquiry_count = (
    select count(*) from public.property_inquiries where property_id = new.property_id
  )
  where id = new.property_id;

  select coalesce(full_name, company_name, username, 'Someone')
  into actor from public.profiles where id = new.sender_id;

  insert into public.notifications (user_id, actor_id, kind, title, body, href)
  values (
    property.owner_id,
    new.sender_id,
    'quote_request',
    actor || ' enquired about ' || property.title,
    left(coalesce(new.message, ''), 120),
    '/property/' || property.id
  );
  return new;
end;
$$;

create trigger property_inquiries_notify
  after insert on public.property_inquiries
  for each row
  execute function public.notify_property_inquiry();

/**
 * Keeps the media flags on the property in step with what was uploaded.
 *
 * The map filters on "has a 360 tour", and a flag it can index beats a
 * correlated exists() per pin.
 */
create function public.refresh_property_media_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.property_id, old.property_id);
begin
  update public.properties p
  set has_360 = exists (
        select 1 from public.property_media m
        where m.property_id = target and m.kind = 'panorama_360'
      ),
      has_virtual_tour = exists (
        select 1 from public.property_media m
        where m.property_id = target
          and m.kind in ('virtual_tour', 'panorama_360')
      )
  where p.id = target;
  return coalesce(new, old);
end;
$$;

create trigger property_media_refresh_flags
  after insert or update or delete on public.property_media
  for each row
  execute function public.refresh_property_media_flags();

create function public.increment_property_views(target_property_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.properties
  set view_count = view_count + 1
  where id = target_property_id;
$$;

-- ---------------------------------------------------------------------------
-- Map queries
-- ---------------------------------------------------------------------------

/**
 * Properties inside a viewport, with every filter the map exposes.
 *
 * One function rather than a PostgREST query per filter combination: the map
 * refetches on every pan, and the bounding box has to be the first thing the
 * planner sees for the index to help.
 *
 * Pins for sellers who hid their address are rounded to roughly 500m, which
 * is close enough to browse and too coarse to identify the door.
 */
create function public.properties_in_viewport(
  south double precision,
  west double precision,
  north double precision,
  east double precision,
  types public.property_type[] default null,
  kinds public.listing_kind[] default null,
  min_price numeric default null,
  max_price numeric default null,
  min_bedrooms integer default null,
  min_area numeric default null,
  max_results integer default 300
)
returns table (
  id uuid,
  title text,
  property_type public.property_type,
  listing_kind public.listing_kind,
  price numeric,
  currency text,
  price_period text,
  bedrooms smallint,
  bathrooms smallint,
  area_m2 numeric,
  latitude double precision,
  longitude double precision,
  cover_image_url text,
  neighbourhood text,
  has_360 boolean,
  building_height_m real,
  floors smallint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.title,
    p.property_type,
    p.listing_kind,
    p.price,
    p.currency,
    p.price_period,
    p.bedrooms,
    p.bathrooms,
    p.area_m2,
    case when p.hide_exact_location
         then round(p.latitude::numeric, 2)::double precision
         else p.latitude end,
    case when p.hide_exact_location
         then round(p.longitude::numeric, 2)::double precision
         else p.longitude end,
    p.cover_image_url,
    p.neighbourhood,
    p.has_360,
    coalesce(p.building_height_m, p.floors * 3.0)::real,
    p.floors
  from public.properties p
  where p.status = 'available'
    and p.latitude between south and north
    and p.longitude between west and east
    and (types is null or p.property_type = any (types))
    and (kinds is null or p.listing_kind = any (kinds))
    and (min_price is null or p.price >= min_price)
    and (max_price is null or p.price <= max_price)
    and (min_bedrooms is null or p.bedrooms >= min_bedrooms)
    and (min_area is null or p.area_m2 >= min_area)
  order by p.featured desc, p.created_at desc
  limit max_results;
$$;

/** Places within a radius of a property, nearest first. */
create function public.places_near_property(
  target_property_id uuid,
  radius_km double precision default 2,
  max_results integer default 40
)
returns table (
  id uuid,
  name text,
  kind public.place_kind,
  latitude double precision,
  longitude double precision,
  rating numeric,
  distance_km double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select latitude, longitude from public.properties where id = target_property_id
  )
  select
    n.id,
    n.name,
    n.kind,
    n.latitude,
    n.longitude,
    n.rating,
    round(public.distance_km(t.latitude, t.longitude, n.latitude, n.longitude)::numeric, 2)::double precision
  from public.nearby_places n
  cross join target t
  -- A cheap bounding box first, so the trigonometry only runs on candidates.
  where n.latitude between t.latitude - (radius_km / 111.0)
                      and t.latitude + (radius_km / 111.0)
    and n.longitude between t.longitude - (radius_km / 111.0)
                       and t.longitude + (radius_km / 111.0)
    and public.distance_km(t.latitude, t.longitude, n.latitude, n.longitude) <= radius_km
  order by 7
  limit max_results;
$$;

/** Comparable asking prices, for the "is this a fair price" panel. */
create function public.property_price_stats(
  target_type public.property_type,
  target_kind public.listing_kind,
  target_city text default null
)
returns table (
  average_price numeric,
  median_price numeric,
  lowest_price numeric,
  highest_price numeric,
  average_per_m2 numeric,
  sample_size bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    round(avg(price), 2),
    round(percentile_cont(0.5) within group (order by price)::numeric, 2),
    min(price),
    max(price),
    round(avg(price / nullif(area_m2, 0)), 2),
    count(*)::bigint
  from public.properties
  where status = 'available'
    and property_type = target_type
    and listing_kind = target_kind
    and price is not null
    and (target_city is null or location_city = target_city);
$$;

grant execute on function public.properties_in_viewport(double precision, double precision, double precision, double precision, public.property_type[], public.listing_kind[], numeric, numeric, integer, numeric, integer) to anon, authenticated;
grant execute on function public.places_near_property(uuid, double precision, integer) to anon, authenticated;
grant execute on function public.property_price_stats(public.property_type, public.listing_kind, text) to anon, authenticated;
grant execute on function public.increment_property_views(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.properties;
  end if;
end
$$;
