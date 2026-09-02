-- The map needs to know which building a unit belongs to.
--
-- Thirty apartments in one tower share one coordinate. The existing clustering
-- buckets by a lat/long grid whose cell shrinks with zoom and dissolves
-- entirely at zoom 14, so those thirty become thirty pins stacked exactly on
-- top of each other the moment somebody zooms in far enough to care. Only the
-- top one is clickable and the other twenty-nine are unreachable.
--
-- Grouping them needs building_id on the marker, and properties_in_viewport
-- returns an explicit column list, so the function has to return it.
--
-- Dropped and recreated rather than `create or replace`: Postgres refuses to
-- change a function's return type in place. This is the same pattern 0022,
-- 0025 and 0043 each used for the same reason, and the body below is 0043's
-- verbatim with three columns added — no filter, ordering or privacy
-- behaviour is altered.

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
  is_premium boolean,
  is_sample boolean,
  location_accuracy public.location_accuracy,
  agent_name text,
  -- The three new ones. Null for a standalone property, which is most of them.
  building_id uuid,
  building_code text,
  building_name text
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
    p.seller_kind, p.listing_verified, p.is_premium,
    p.is_sample, p.location_accuracy,
    coalesce(owner.company_name, owner.full_name),
    p.building_id, b.code, b.name
  from public.properties p
  left join public.profiles owner on owner.id = p.owner_id
  -- Left join, not inner: a standalone property has no building and must still
  -- appear on the map exactly as it does today.
  left join public.buildings b on b.id = p.building_id
  where p.status = 'available'
    and p.display_latitude between south and north
    and p.display_longitude between west and east
    and (types is null or p.property_type = any (types))
    and (kinds is null or p.listing_kind = any (kinds))
    and (min_price is null or p.price >= min_price)
    and (max_price is null or p.price <= max_price)
    and (min_bedrooms is null or p.bedrooms >= min_bedrooms)
    and (min_area is null or p.area_m2 >= min_area)
  order by p.is_premium desc, p.featured desc, p.created_at desc
  limit max_results;
$$;

grant execute on function public.properties_in_viewport(
  double precision, double precision, double precision, double precision,
  public.property_type[], public.listing_kind[], numeric, numeric,
  integer, numeric, integer
) to anon, authenticated;
