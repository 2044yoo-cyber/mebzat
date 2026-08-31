-- Location privacy.
--
-- A property listing has a conflict at its heart: the buyer needs to know
-- where it is, and the seller does not want their front door on a public map.
-- The listing was resolving that by rounding the coordinates to two decimal
-- places when a flag was set — which is not privacy. Rounding is reversible
-- in aggregate, the grid it snaps to is visible once you have two listings on
-- it, and every viewer sees the same displaced point, so the true location is
-- recoverable from the pattern.
--
-- What replaces it: the exact coordinates stay in a column the public path
-- never reads, and a *separate* display point is generated once per property
-- at a random bearing and distance inside the chosen radius. The circle drawn
-- around that point contains the property but is not centred on it, so the
-- centre gives nothing away and the area is honest.

-- ---------------------------------------------------------------------------
-- How much of the location is public
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'location_visibility') then
    create type public.location_visibility as enum (
      'exact',          -- the pin, as given
      'approximate',    -- a circle of the chosen radius. The recommendation.
      'neighbourhood'   -- the area name only, no pin and no circle
    );
  end if;
end
$$;

alter table public.properties
  add column if not exists location_visibility public.location_visibility
    not null default 'approximate',
  -- Metres. Constrained to the offered choices so the circle drawn by the
  -- client always matches the circle the offset was generated for.
  add column if not exists privacy_radius_m integer not null default 100,
  -- The published point. Never the real one unless visibility is 'exact'.
  add column if not exists display_latitude double precision,
  add column if not exists display_longitude double precision,
  -- Structured location, so search can match the way people actually describe
  -- where something is.
  add column if not exists sub_city text,
  add column if not exists street text,
  add column if not exists landmark text,
  add column if not exists building_name text,
  -- Set by staff after checking the pin against the address.
  add column if not exists location_verified boolean not null default false,
  add column if not exists location_verified_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'properties_privacy_radius_choice'
  ) then
    alter table public.properties
      add constraint properties_privacy_radius_choice
      check (privacy_radius_m in (50, 100, 250, 500, 1000));
  end if;
end
$$;

comment on column public.properties.latitude is
  'The exact position. Never exposed by a public path — read display_latitude instead.';
comment on column public.properties.display_latitude is
  'The published position: offset within privacy_radius_m unless visibility is exact.';

-- The old boolean becomes a mirror of the new enum so nothing reading it
-- breaks mid-deploy. Dropped in a later migration once callers have moved.
update public.properties
   set location_visibility = case
         when hide_exact_location then 'approximate'::public.location_visibility
         else 'exact'::public.location_visibility
       end
 where location_visibility = 'approximate'
   and not hide_exact_location;

-- ---------------------------------------------------------------------------
-- The offset
-- ---------------------------------------------------------------------------

/**
 * A point at a random bearing and distance inside `radius_m` of the input.
 *
 * The distance is drawn as radius * sqrt(random) rather than radius * random,
 * so the offset is uniform over the *area* of the circle. The naive version
 * clusters points near the centre, which is exactly where the property is —
 * it would leak the thing being hidden.
 *
 * Generated once and stored. Re-rolling it on every read would let anyone
 * average repeated requests back to the true position.
 */
create or replace function public.offset_point(
  lat double precision,
  lon double precision,
  radius_m integer
)
returns table (out_lat double precision, out_lon double precision)
language plpgsql
volatile
as $$
declare
  bearing double precision := random() * 2 * pi();
  distance double precision := radius_m * sqrt(random());
  -- Metres per degree of latitude, near enough at any populated latitude.
  lat_deg double precision := distance * cos(bearing) / 111320.0;
  lon_deg double precision := distance * sin(bearing)
                              / (111320.0 * cos(radians(lat)));
begin
  return query select lat + lat_deg, lon + lon_deg;
end;
$$;

/**
 * Keeps the published point in step with the private one.
 *
 * Re-rolled only when the position, the radius or the visibility actually
 * changes. An unrelated edit — a price change, a new photo — must not move
 * the circle, or a watcher could average the successive centres back to the
 * true location.
 */
create or replace function public.sync_display_location()
returns trigger
language plpgsql
as $$
declare
  moved boolean;
begin
  moved :=
    tg_op = 'INSERT'
    or new.latitude is distinct from old.latitude
    or new.longitude is distinct from old.longitude
    or new.privacy_radius_m is distinct from old.privacy_radius_m
    or new.location_visibility is distinct from old.location_visibility
    or new.display_latitude is null;

  if not moved then
    return new;
  end if;

  if new.location_visibility = 'exact' then
    new.display_latitude := new.latitude;
    new.display_longitude := new.longitude;
  else
    select out_lat, out_lon
      into new.display_latitude, new.display_longitude
      from public.offset_point(new.latitude, new.longitude, new.privacy_radius_m);
  end if;

  -- The legacy boolean, kept truthful for anything still reading it.
  new.hide_exact_location := new.location_visibility <> 'exact';

  return new;
end;
$$;

drop trigger if exists sync_display_location on public.properties;
create trigger sync_display_location
  before insert or update on public.properties
  for each row
  execute function public.sync_display_location();

-- Backfill. Every existing row gets a display point.
update public.properties set updated_at = updated_at;

-- ---------------------------------------------------------------------------
-- Who may see the exact location
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'location_grant_reason') then
    create type public.location_grant_reason as enum (
      'viewing_accepted',  -- the seller accepted a viewing request
      'buyer_approved',    -- the seller approved this buyer
      'shared'             -- the seller sent it by hand
    );
  end if;
end
$$;

create table if not exists public.property_location_grants (
  property_id uuid not null references public.properties (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason public.location_grant_reason not null,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- A grant can be withdrawn; the row stays for the record.
  revoked_at timestamptz,
  primary key (property_id, user_id)
);

comment on table public.property_location_grants is
  'Buyers the seller has let see a property''s exact address.';

create index if not exists property_location_grants_user_idx
  on public.property_location_grants (user_id)
  where revoked_at is null;

alter table public.property_location_grants enable row level security;

drop policy if exists "grants: read own or as owner" on public.property_location_grants;
create policy "grants: read own or as owner"
  on public.property_location_grants
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.properties p
      where p.id = property_id and p.owner_id = auth.uid()
    )
  );

-- Only the property's owner may grant. A buyer cannot let themselves in.
drop policy if exists "grants: owner writes" on public.property_location_grants;
create policy "grants: owner writes"
  on public.property_location_grants
  for all
  to authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.properties p
      where p.id = property_id and p.owner_id = auth.uid()
    )
  );

/**
 * Whether the calling user may see this property's exact position.
 *
 * The owner always may. Everyone else needs a live grant, or a listing whose
 * visibility is 'exact' in the first place.
 */
create or replace function public.can_see_exact_location(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.properties p
    where p.id = target_property_id
      and (p.owner_id = auth.uid() or p.location_visibility = 'exact')
  ) or exists (
    select 1 from public.property_location_grants g
    where g.property_id = target_property_id
      and g.user_id = auth.uid()
      and g.revoked_at is null
  );
$$;

revoke all on function public.can_see_exact_location(uuid) from public;
grant execute on function public.can_see_exact_location(uuid) to authenticated, anon;

/**
 * The location of a property, told to whoever is asking.
 *
 * One function so no caller has to remember the rule. The exact coordinates
 * come back only when `can_see_exact_location` says so; otherwise the caller
 * receives the display point and the radius, and cannot tell the difference
 * between a property at the centre and one at the edge.
 */
create or replace function public.property_location(target_property_id uuid)
returns table (
  latitude double precision,
  longitude double precision,
  radius_m integer,
  visibility public.location_visibility,
  is_exact boolean,
  city text,
  sub_city text,
  neighbourhood text,
  landmark text,
  verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when public.can_see_exact_location(p.id)
         then p.latitude else p.display_latitude end,
    case when public.can_see_exact_location(p.id)
         then p.longitude else p.display_longitude end,
    p.privacy_radius_m,
    p.location_visibility,
    public.can_see_exact_location(p.id),
    p.location_city,
    p.sub_city,
    p.neighbourhood,
    p.landmark,
    p.location_verified
  from public.properties p
  where p.id = target_property_id;
$$;

revoke all on function public.property_location(uuid) from public;
grant execute on function public.property_location(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Granting on an accepted viewing
-- ---------------------------------------------------------------------------

/**
 * An accepted viewing request reveals the address.
 *
 * The seller agreeing to show someone round is the moment the address stops
 * being a secret from that person, so the grant follows the acceptance rather
 * than needing a second deliberate action nobody would remember to take.
 */
create or replace function public.grant_location_on_viewing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    insert into public.property_location_grants
      (property_id, user_id, reason, granted_by)
    values
      (new.property_id, new.sender_id, 'viewing_accepted',
       (select owner_id from public.properties where id = new.property_id))
    on conflict (property_id, user_id) do update
      set revoked_at = null, reason = 'viewing_accepted';
  end if;
  return new;
end;
$$;

do $$
begin
  -- Only wire this up if enquiries actually carry a status column.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'property_inquiries'
      and column_name = 'status'
  ) then
    drop trigger if exists grant_location_on_viewing on public.property_inquiries;
    create trigger grant_location_on_viewing
      after insert or update on public.property_inquiries
      for each row
      execute function public.grant_location_on_viewing();
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- The public map
-- ---------------------------------------------------------------------------

-- Rewritten to publish the display point. The previous version rounded the
-- real coordinates, which is why it is being replaced rather than amended.
--
-- The signature is unchanged apart from three added columns, so every existing
-- caller keeps working; only what comes back for a hidden listing is different.
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
  location_verified boolean
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
    -- The published point, always. The exact one is not in this result set at
    -- any visibility, so a viewport query cannot be used to harvest addresses
    -- in bulk.
    p.display_latitude,
    p.display_longitude,
    p.cover_image_url,
    p.neighbourhood,
    p.has_360,
    coalesce(p.building_height_m, p.floors * 3.0)::real,
    p.floors,
    p.privacy_radius_m,
    p.location_visibility,
    p.location_verified
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
  order by p.featured desc, p.created_at desc
  limit max_results;
$$;

create index if not exists properties_display_viewport_idx
  on public.properties (display_latitude, display_longitude)
  where status = 'available';

-- ---------------------------------------------------------------------------
-- Location search
-- ---------------------------------------------------------------------------

/**
 * Autocomplete over everywhere a listing could be.
 *
 * Cities, neighbourhoods and sub cities already in use, and the landmarks in
 * `nearby_places`. Ranked so an exact prefix beats a substring, because a
 * seller typing "Bo" means Bole long before they mean "Gerji, near Bole".
 */
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
  with q as (select trim(query) as text, lower(trim(query)) as lowered)
  select * from (
    -- Cities
    select
      'city'::text,
      c.name,
      'City'::text,
      c.latitude,
      c.longitude,
      c.name
    from public.cities c, q
    where c.active and q.lowered <> '' and lower(c.name) like '%' || q.lowered || '%'

    union all

    -- Neighbourhoods and sub cities already used by a listing
    select distinct
      'neighbourhood'::text,
      p.neighbourhood,
      coalesce(p.sub_city || ', ', '') || coalesce(p.location_city, 'Ethiopia'),
      -- The centroid of the *published* points, so this cannot be used to
      -- locate a single listing by searching for its neighbourhood.
      avg(p.display_latitude) over (partition by p.neighbourhood),
      avg(p.display_longitude) over (partition by p.neighbourhood),
      p.location_city
    from public.properties p, q
    where p.neighbourhood is not null
      and p.status = 'available'
      and q.lowered <> ''
      and lower(p.neighbourhood) like '%' || q.lowered || '%'

    union all

    -- Landmarks
    select
      'landmark'::text,
      n.name,
      initcap(replace(n.kind::text, '_', ' ')),
      n.latitude,
      n.longitude,
      c.name
    from public.nearby_places n
    left join public.cities c on c.id = n.city_id, q
    where q.lowered <> '' and lower(n.name) like '%' || q.lowered || '%'
  ) as results(kind, label, detail, latitude, longitude, city)
  order by
    -- Prefix matches first, then alphabetical. A seller typing "Bo" wants
    -- Bole, not "Gerji, near Bole".
    case when lower(results.label) like lower(trim(query)) || '%' then 0 else 1 end,
    length(results.label),
    results.label
  limit max_results;
$$;

revoke all on function public.search_locations(text, integer) from public;
grant execute on function public.search_locations(text, integer) to authenticated, anon;

/** Straight-line distance in metres. Used for "1.2 km from the centre". */
create or replace function public.distance_m(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
      * power(sin(radians(lon2 - lon1) / 2), 2)
  ));
$$;

/**
 * What is around a property, measured from the *published* point.
 *
 * Deliberately not from the real one: a landmark list accurate to the metre
 * would let anyone trilaterate the address from three rows.
 */
create or replace function public.public_places_near_property(
  target_property_id uuid,
  radius_km double precision default 2,
  max_results integer default 40
)
returns table (
  id uuid,
  name text,
  kind text,
  distance_m double precision,
  rating numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id,
    n.name,
    n.kind::text,
    public.distance_m(p.display_latitude, p.display_longitude, n.latitude, n.longitude),
    n.rating
  from public.properties p
  join public.nearby_places n on true
  where p.id = target_property_id
    and public.distance_m(p.display_latitude, p.display_longitude, n.latitude, n.longitude)
        <= radius_km * 1000
  order by 4
  limit max_results;
$$;

revoke all on function public.public_places_near_property(uuid, double precision, integer) from public;
grant execute on function public.public_places_near_property(uuid, double precision, integer)
  to authenticated, anon;
