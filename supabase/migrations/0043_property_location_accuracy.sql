-- How precise a property's coordinate actually is, and whether it is sample data.
--
-- 0022 already said what a *viewer* is shown: `location_visibility` with
-- `exact | approximate | neighbourhood`, plus a published `display_latitude`
-- and a privacy radius. That is a decision the seller makes about how much to
-- reveal.
--
-- This is a different fact. `location_visibility = 'approximate'` means "we
-- know where it is and are choosing to blur it". `location_accuracy =
-- 'approximate'` means "nobody ever knew the building". A seller can have an
-- exact pin and publish a circle; a listing placed from a neighbourhood name
-- has no exact pin to publish. Collapsing the two would lose the ability to say
-- which — and the honest label on a map marker depends on knowing.
--
-- Additive. Nothing existing changes: every column has a default that describes
-- the rows already in the table, so no real listing is touched or re-described.
--
-- Run after 0042.

begin;

do $$
begin
  if to_regclass('public.properties') is null then
    raise exception using
      message = 'Location accuracy: the properties table does not exist.',
      hint = 'Run 0017 and 0022 first.';
  end if;

  -- Checked here rather than discovered 300 lines down.
  --
  -- The viewport function below returns a `public.seller_kind` column, and the
  -- trigger writes `listing_verified` — both from 0025. Without that migration
  -- this file fails with `type public.seller_kind does not exist`, which is
  -- true and names neither the migration that creates it nor the fact that the
  -- listing form is broken for the same reason.
  --
  -- That is not a hypothetical: it is exactly how this was found. A listing
  -- form returning "Could not create that listing" and a migration failing on
  -- an unknown type were one missing migration wearing two disguises.
  if not exists (select 1 from pg_type where typname = 'seller_kind') then
    raise exception using
      message = 'Location accuracy: migration 0025_listing_quality.sql has not been applied.',
      hint = 'Apply 0025 first. Until you do, creating a property listing also fails: the form writes seller_kind, contact_phone, preferred_contact, woreda and condominium_name, and none of those columns exist yet.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'properties'
      and column_name = 'listing_verified'
  ) then
    raise exception using
      message = 'Location accuracy: properties.listing_verified is missing.',
      hint = 'Apply 0025_listing_quality.sql first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Accuracy
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'location_accuracy') then
    create type public.location_accuracy as enum (
      -- Somebody placed the pin on the building.
      'exact',
      -- The pin is a named area's centroid, or a point inside it. Off by up to
      -- about a kilometre, and must be labelled as such wherever it is drawn.
      'approximate',
      -- No usable coordinate. The listing belongs in the list, not on the map.
      'unknown'
    );
  end if;
end
$$;

alter table public.properties
  -- 'exact' is the right default for what is already there: every existing row
  -- has coordinates a person entered through the location picker, which places
  -- a pin. Defaulting to 'approximate' would silently relabel real listings as
  -- vague, which is the opposite of the point.
  add column if not exists location_accuracy public.location_accuracy
    not null default 'exact',

  -- Free text rather than an enum: the set of ways a coordinate can arrive
  -- grows (a picker, an import, a geocoder, a gazetteer), and a new one should
  -- not need a migration to be recorded.
  add column if not exists location_source text,

  -- Sample data placed by Medosha to populate the module. Kept as a column
  -- rather than only in `seed_content` because, unlike a seeded job, this one
  -- has to be *visible*: a demo listing must carry a DEMO badge on the card,
  -- the map marker and the property page, and a badge cannot be drawn from a
  -- table the application never joins.
  add column if not exists is_sample boolean not null default false;

comment on column public.properties.location_accuracy is
  'How precise the stored coordinate is. Distinct from location_visibility, which is how much of it is published.';
comment on column public.properties.location_source is
  'Where the coordinate came from: user_picker, demo_neighborhood_geocode, import, etc.';
comment on column public.properties.is_sample is
  'Demo data. Must be shown as such — never presented as a live listing.';

-- The map and the listings both filter on this, and a demo dataset is a small
-- fraction of a real table, so a partial index is the cheap shape.
create index if not exists properties_sample_idx
  on public.properties (is_sample)
  where is_sample;

-- ---------------------------------------------------------------------------
-- Demo accounts
--
-- The agents behind sample listings are synthetic. Marked so the directory can
-- label them and so a cleanup can find them, and so nothing anywhere claims
-- these are real people with real licences.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_demo boolean not null default false;

comment on column public.profiles.is_demo is
  'A synthetic account created to populate a module. Never a real person.';

create index if not exists profiles_demo_idx
  on public.profiles (is_demo)
  where is_demo;

-- ---------------------------------------------------------------------------
-- A listing cannot claim to be verified and be a sample at the same time
--
-- The one rule worth enforcing in the database rather than in a form. "This is
-- demo data" and "we checked this" are contradictory claims, and a demo
-- listing wearing a verified badge is exactly the confusion the whole
-- is_sample flag exists to prevent. A trigger rather than a check constraint
-- because it corrects rather than refuses: a bulk update that sets
-- listing_verified across a table should not fail, it should leave the samples
-- alone.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_sample_not_verified()
returns trigger
language plpgsql
as $$
begin
  if new.is_sample then
    new.listing_verified := false;
    new.listing_verified_at := null;
    new.location_verified := false;
    new.location_verified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists properties_sample_never_verified on public.properties;
create trigger properties_sample_never_verified
  before insert or update on public.properties
  for each row
  execute function public.enforce_sample_not_verified();

-- ---------------------------------------------------------------------------
-- The map pins carry the new facts
--
-- `properties_in_viewport` returns an explicit column list, so a marker knows
-- only what this function hands it. Three additions:
--
--   * `is_sample`        — so the marker can wear a DEMO badge. Without it the
--                          map is the one surface where a sample listing looks
--                          exactly like a real one.
--   * `location_accuracy`— so a pin placed from a neighbourhood name can say so
--                          rather than implying somebody stood at that spot.
--   * `agent_name`       — the marker preview names who is selling, and one
--                          join here beats fifty round trips from the browser.
--
-- Dropped and recreated rather than `create or replace`: Postgres refuses to
-- change a function's return type in place, and this adds columns to it.
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
  is_premium boolean,
  is_sample boolean,
  location_accuracy public.location_accuracy,
  agent_name text
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
    -- The agency reads better than the person on a small card, and the demo
    -- dataset gives both. Left join: an owner-listed property has no agency and
    -- must still appear.
    coalesce(owner.company_name, owner.full_name)
  from public.properties p
  left join public.profiles owner on owner.id = p.owner_id
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

commit;
