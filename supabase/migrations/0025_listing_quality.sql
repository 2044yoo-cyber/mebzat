-- Listing quality: who is selling, how to reach them, and what is verified.
--
-- Three gaps this closes.
--
-- A buyer browsing Ethiopian property listings is asking, before anything
-- else, whether they are talking to the owner or to a broker — because it
-- changes the price, the speed and whether the person on the phone can
-- actually agree to anything. The listing had no way to say.
--
-- Contact was a single phone number on the profile, which is not how anyone
-- sells property here: the number you call is often not the number on the
-- account, and WhatsApp is frequently the only one that gets answered.
--
-- And verification was one flag on a person, so a verified agent's listing and
-- an unverified one looked identical.

-- ---------------------------------------------------------------------------
-- Who is selling
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'seller_kind') then
    create type public.seller_kind as enum (
      'owner',
      'agent',
      'developer',
      'broker',
      'property_manager'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'contact_method') then
    create type public.contact_method as enum ('call', 'whatsapp', 'message', 'email');
  end if;
end
$$;

alter table public.properties
  add column if not exists seller_kind public.seller_kind,
  -- Contact details that belong to the listing, not the account. The number
  -- to call about a house is often not the number the account was opened
  -- with, and requiring them to match loses the sale.
  add column if not exists contact_phone text,
  add column if not exists contact_phone_alt text,
  add column if not exists contact_whatsapp text,
  add column if not exists contact_email text,
  add column if not exists preferred_contact public.contact_method not null default 'call',
  -- Verification is per listing, because a verified agent can still post a
  -- property nobody has checked.
  add column if not exists listing_verified boolean not null default false,
  add column if not exists listing_verified_at timestamptz,
  add column if not exists is_premium boolean not null default false,
  -- Structured location the search now matches on.
  add column if not exists woreda text,
  add column if not exists condominium_name text;

comment on column public.properties.seller_kind is
  'Owner, agent, developer, broker or property manager. Shown as a badge everywhere the listing appears.';
comment on column public.properties.listing_verified is
  'This specific listing has been checked, which is not the same as the seller being verified.';

-- Existing listings are unlabelled rather than guessed at. A wrong badge is
-- worse than none: it is the fact a buyer decides how to negotiate on.
create index if not exists properties_seller_kind_idx
  on public.properties (seller_kind) where status = 'available';
create index if not exists properties_premium_idx
  on public.properties (is_premium, created_at desc)
  where status = 'available' and is_premium;

-- ---------------------------------------------------------------------------
-- The privacy radius, revised
--
-- 200m replaces 250m. Existing listings on 250 move to 200 rather than being
-- left violating the new constraint — and because the radius changed, the
-- display offset is re-rolled by the trigger from 0022, which is correct: the
-- circle is a different size, so the point inside it should be redrawn.
-- ---------------------------------------------------------------------------

alter table public.properties
  drop constraint if exists properties_privacy_radius_choice;

update public.properties set privacy_radius_m = 200 where privacy_radius_m = 250;

alter table public.properties
  add constraint properties_privacy_radius_choice
  check (privacy_radius_m in (50, 100, 200, 500, 1000));

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------

alter table public.property_media
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists size_bytes bigint,
  add column if not exists blur_data_url text,
  -- What the quality check found, so it is not re-run on every page view.
  add column if not exists quality_score smallint
    check (quality_score is null or quality_score between 0 and 100),
  add column if not exists quality_notes text;

-- ---------------------------------------------------------------------------
-- Landmarks worth quoting a drive time to
-- ---------------------------------------------------------------------------

create table if not exists public.travel_landmarks (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.cities (id) on delete cascade,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  /** Ordering on the property page. Airport first, always. */
  position smallint not null default 100,
  active boolean not null default true,

  -- Without this the seed below has nothing to conflict on, and running the
  -- migration twice quietly doubles every landmark — which shows up as each
  -- drive time listed twice on the property page.
  constraint travel_landmarks_unique unique (city_id, name)
);

-- Repairs a database where the migration was applied before the constraint
-- existed. Keeps the earliest row of each name.
delete from public.travel_landmarks t
 using public.travel_landmarks keep
 where t.city_id is not distinct from keep.city_id
   and t.name = keep.name
   and t.ctid > keep.ctid;

alter table public.travel_landmarks
  drop constraint if exists travel_landmarks_unique;
alter table public.travel_landmarks
  add constraint travel_landmarks_unique unique (city_id, name);

alter table public.travel_landmarks enable row level security;

drop policy if exists "travel landmarks: public read" on public.travel_landmarks;
create policy "travel landmarks: public read"
  on public.travel_landmarks for select to anon, authenticated using (active);

grant select on public.travel_landmarks to anon, authenticated;

insert into public.travel_landmarks (city_id, name, latitude, longitude, position)
select c.id, v.name, v.lat, v.lon, v.position
from public.cities c,
  (values
    ('Bole International Airport', 8.9779, 38.7993, 1),
    ('Meskel Square', 9.0107, 38.7613, 2),
    ('Megenagna', 9.0206, 38.7996, 3),
    ('Bole Medhanialem', 8.9990, 38.7800, 4),
    ('Edna Mall', 8.9955, 38.7869, 5),
    ('Piassa', 9.0349, 38.7514, 6),
    ('Kazanchis', 9.0146, 38.7663, 7),
    ('Mexico Square', 9.0079, 38.7420, 8),
    ('Sarbet', 8.9944, 38.7362, 9),
    ('CMC', 9.0135, 38.8398, 10),
    ('Ayat', 8.9986, 38.8600, 11),
    ('Lebu', 8.9339, 38.7080, 12),
    ('Summit', 8.9820, 38.8480, 13)
  ) as v(name, lat, lon, position)
where c.slug = 'addis-ababa'
on conflict (city_id, name) do nothing;

/**
 * Drive times from a property to the landmarks that matter.
 *
 * Measured from the *published* point, so this cannot be used to trilaterate
 * a hidden listing — the same rule the nearby-places function follows.
 *
 * The speed is a straight-line estimate scaled for Addis traffic rather than
 * a routing call: there is no routing service in this deployment, and a
 * number that is honestly approximate beats a page that says nothing. The
 * caller labels it "about", which is what makes it honest rather than wrong.
 */
create or replace function public.property_travel_times(
  target_property_id uuid,
  max_results integer default 8
)
returns table (
  name text,
  distance_m double precision,
  minutes integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.name,
    public.distance_m(p.display_latitude, p.display_longitude, l.latitude, l.longitude),
    greatest(
      3,
      round(
        -- 1.35 for the road not being straight, then 18 km/h, which is what
        -- Addis actually averages in the daytime.
        public.distance_m(p.display_latitude, p.display_longitude, l.latitude, l.longitude)
          * 1.35 / 1000.0 / 18.0 * 60.0
      )
    )::integer
  from public.properties p
  join public.travel_landmarks l on l.active
  where p.id = target_property_id
    -- A listing with no city row still gets drive times: matching strictly on
    -- city_id silently returned nothing for every property created before the
    -- cities table was populated, which is most of them.
    and (
      l.city_id is null
      or p.city_id is null
      or l.city_id = p.city_id
    )
    -- ...but only to landmarks that are plausibly in the same city. 60km is
    -- past the edge of Addis and nowhere near the next one.
    and public.distance_m(p.display_latitude, p.display_longitude, l.latitude, l.longitude)
        < 60000
  order by l.position, 2
  limit max_results;
$$;

revoke all on function public.property_travel_times(uuid, integer) from public;
grant execute on function public.property_travel_times(uuid, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Location search, widened again
--
-- Woreda, condominium and apartment names join street and building. The same
-- rule as before: anything that could name a single property is offered only
-- once several listings share it, and always as a centroid of published
-- points.
-- ---------------------------------------------------------------------------

create or replace function public.search_locations(
  query text,
  max_results integer default 12
)
returns table (
  kind text,
  label text,
  detail text,
  latitude double precision,
  longitude double precision,
  city text
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (select trim(query) as text, lower(trim(query)) as lowered),
  from_listings as (
    select
      p.neighbourhood as name, 'neighbourhood'::text as kind,
      max(coalesce(p.sub_city || ', ', '') || coalesce(p.location_city, 'Ethiopia')) as detail,
      avg(p.display_latitude) as latitude, avg(p.display_longitude) as longitude,
      max(p.location_city) as city, count(*) as listings
    from public.properties p
    where p.status = 'available' and p.neighbourhood is not null
    group by p.neighbourhood

    union all
    select p.sub_city, 'sub_city',
      max(coalesce(p.location_city, 'Ethiopia')) || ' sub city',
      avg(p.display_latitude), avg(p.display_longitude), max(p.location_city), count(*)
    from public.properties p
    where p.status = 'available' and p.sub_city is not null
    group by p.sub_city

    union all
    select p.woreda, 'woreda',
      max(coalesce(p.sub_city || ', ', '') || coalesce(p.location_city, 'Ethiopia')),
      avg(p.display_latitude), avg(p.display_longitude), max(p.location_city), count(*)
    from public.properties p
    where p.status = 'available' and p.woreda is not null
    group by p.woreda

    union all
    select p.street, 'street',
      max(coalesce(p.neighbourhood || ', ', '') || coalesce(p.location_city, 'Ethiopia')),
      avg(p.display_latitude), avg(p.display_longitude), max(p.location_city), count(*)
    from public.properties p
    where p.status = 'available' and p.street is not null
    group by p.street

    union all
    select p.building_name, 'building',
      max(coalesce(p.neighbourhood || ', ', '') || coalesce(p.location_city, 'Ethiopia')),
      avg(p.display_latitude), avg(p.display_longitude), max(p.location_city), count(*)
    from public.properties p
    where p.status = 'available' and p.building_name is not null
    group by p.building_name

    union all
    select p.condominium_name, 'condominium',
      max(coalesce(p.neighbourhood || ', ', '') || coalesce(p.location_city, 'Ethiopia')),
      avg(p.display_latitude), avg(p.display_longitude), max(p.location_city), count(*)
    from public.properties p
    where p.status = 'available' and p.condominium_name is not null
    group by p.condominium_name
  )
  select * from (
    select 'city'::text, c.name, 'City'::text, c.latitude, c.longitude, c.name
    from public.cities c, q
    where c.active and q.lowered <> '' and lower(c.name) like '%' || q.lowered || '%'

    union all

    select l.kind, l.name, l.detail, l.latitude, l.longitude, l.city
    from from_listings l, q
    where q.lowered <> ''
      and lower(l.name) like '%' || q.lowered || '%'
      -- Areas are public facts and are always offered. A street, a building
      -- or a condominium block can identify one property, so those wait
      -- until the centroid means nothing in particular.
      and (l.kind in ('neighbourhood', 'sub_city', 'woreda') or l.listings >= 3)

    union all

    -- Landmarks: hotels, schools, malls, everything in nearby_places, plus
    -- the drive-time landmarks. These are public places, not listings.
    select 'landmark'::text, n.name,
      initcap(replace(n.kind::text, '_', ' ')), n.latitude, n.longitude, c.name
    from public.nearby_places n
    left join public.cities c on c.id = n.city_id, q
    where q.lowered <> '' and lower(n.name) like '%' || q.lowered || '%'

    union all

    select 'landmark'::text, t.name, 'Landmark'::text, t.latitude, t.longitude, c.name
    from public.travel_landmarks t
    left join public.cities c on c.id = t.city_id, q
    where t.active and q.lowered <> '' and lower(t.name) like '%' || q.lowered || '%'
  ) as results(kind, label, detail, latitude, longitude, city)
  order by
    case when lower(results.label) like lower(trim(query)) || '%' then 0 else 1 end,
    length(results.label),
    results.label
  limit max_results;
$$;

revoke all on function public.search_locations(text, integer) from public;
grant execute on function public.search_locations(text, integer) to authenticated, anon;

create index if not exists properties_woreda_idx
  on public.properties (lower(woreda)) where status = 'available';
create index if not exists properties_condominium_idx
  on public.properties (lower(condominium_name)) where status = 'available';

-- ---------------------------------------------------------------------------
-- The map's hover card
--
-- Everything a card needs in the viewport query, so hovering a marker costs
-- nothing. The alternative — a fetch per hover — is a request storm on a map
-- with three hundred pins and a visible delay on every one.
-- ---------------------------------------------------------------------------

drop function if exists public.properties_in_viewport(
  double precision, double precision, double precision, double precision,
  public.property_type[], public.listing_kind[], numeric, numeric,
  integer, numeric, integer
);

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
  floors smallint,
  privacy_radius_m integer,
  location_visibility public.location_visibility,
  location_verified boolean,
  seller_kind public.seller_kind,
  listing_verified boolean,
  is_premium boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.title, p.property_type, p.listing_kind, p.price, p.currency,
    p.price_period, p.bedrooms, p.bathrooms, p.area_m2,
    -- The published point, always.
    p.display_latitude, p.display_longitude,
    p.cover_image_url, p.neighbourhood, p.has_360,
    coalesce(p.building_height_m, p.floors * 3.0)::real, p.floors,
    p.privacy_radius_m, p.location_visibility, p.location_verified,
    p.seller_kind, p.listing_verified, p.is_premium
  from public.properties p
  where p.status = 'available'
    and p.display_latitude between south and north
    and p.display_longitude between west and east
    and (types is null or p.property_type = any (types))
    and (kinds is null or p.listing_kind = any (kinds))
    and (min_price is null or p.price >= min_price)
    and (max_price is null or p.price <= max_price)
    and (min_bedrooms is null or p.bedrooms >= min_bedrooms)
    and (min_area is null or p.area_m2 >= min_area)
  -- Premium listings first, which is what the badge is sold for.
  order by p.is_premium desc, p.featured desc, p.created_at desc
  limit max_results;
$$;

grant execute on function public.properties_in_viewport(
  double precision, double precision, double precision, double precision,
  public.property_type[], public.listing_kind[], numeric, numeric,
  integer, numeric, integer
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Nearby services, from Medosha's own companies and professionals
-- ---------------------------------------------------------------------------

/**
 * Architects, contractors and designers near a property.
 *
 * Deliberately reads Medosha's own directory rather than a places API: the
 * point of showing these on a listing is that the buyer can hire them here.
 * Measured from the published point, like everything else.
 */
create or replace function public.services_near_property(
  target_property_id uuid,
  radius_km double precision default 10,
  max_results integer default 12
)
returns table (
  id uuid,
  name text,
  slug text,
  logo_url text,
  category text,
  distance_m double precision,
  verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.name, c.slug, c.logo_url,
    coalesce(c.category, 'Company'),
    public.distance_m(p.display_latitude, p.display_longitude, c.latitude, c.longitude),
    c.verified
  from public.properties p
  join public.companies c
    on c.latitude is not null and c.longitude is not null
  where p.id = target_property_id
    and public.distance_m(p.display_latitude, p.display_longitude, c.latitude, c.longitude)
        <= radius_km * 1000
  order by 6
  limit max_results;
$$;

revoke all on function public.services_near_property(uuid, double precision, integer) from public;
grant execute on function public.services_near_property(uuid, double precision, integer)
  to anon, authenticated;
