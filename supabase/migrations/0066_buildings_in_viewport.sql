-- Developments on the map, whether or not anybody has listed a unit yet.
--
-- ## What was missing
--
-- The map already drew building markers, but it derived them from listings:
-- groupByBuilding() folds two or more listed units at one coordinate into a
-- single pin. That solves crowding — thirty apartments in one tower share a
-- coordinate exactly, and no amount of zooming separates them — and it is the
-- wrong source for a *development*.
--
-- A tower going up in Bole with nothing listed yet has no units to group, so
-- it never appeared. Which is to say: the map could show every building except
-- the new ones, and "New Projects" is precisely the category of building that
-- has no listings.
--
-- The `projects` table is not the answer either, despite the name. It is a
-- design portfolio — style, materials, client, budget — with no coordinates at
-- all. `buildings` is the real-estate development: name, type, floors,
-- total_units, construction_status, completion_percent, developer, and a
-- latitude and longitude. Nothing needs adding to it.
--
-- ## What this adds
--
-- One function, matching properties_in_viewport in shape so the map's fetching
-- code does not have to learn a second pattern: a bounding box, a cap, and one
-- row per building. No table, no column, no policy change.
--
-- The two counts are computed here rather than in the browser. `unit_count`
-- and `price_from` come from the building's listed units, and fetching every
-- unit of every building in the viewport to count them in JavaScript is the
-- shape of query that makes a map slow at exactly the zoom level where a map
-- has the most markers.

create or replace function public.buildings_in_viewport(
  south double precision,
  west double precision,
  north double precision,
  east double precision,
  statuses public.construction_status[] default null,
  max_results integer default 200
)
returns table (
  id uuid,
  code text,
  name text,
  building_type public.property_type,
  construction_status public.construction_status,
  floors smallint,
  total_units integer,
  completion_percent integer,
  latitude double precision,
  longitude double precision,
  address text,
  sub_city text,
  neighbourhood text,
  cover_image_url text,
  company_id uuid,
  company_name text,
  -- Listed units, and the cheapest of them. Null when nothing is on the market
  -- yet, which for a new development is the normal case rather than an error.
  unit_count bigint,
  price_from numeric
)
language sql
stable
-- `security definer` for the same reason as properties_in_viewport: the
-- function is the boundary. It reads only the columns above, from buildings
-- that are already world-readable under the policy from 0053, and the price it
-- exposes is the asking price of a published listing.
security definer
set search_path = public
as $$
  select
    b.id,
    b.code,
    b.name,
    b.building_type,
    b.construction_status,
    b.floors,
    b.total_units,
    b.completion_percent,
    b.latitude,
    b.longitude,
    b.address,
    b.sub_city,
    b.neighbourhood,
    b.cover_image_url,
    b.company_id,
    c.name as company_name,
    u.unit_count,
    u.price_from
  from public.buildings b
  left join public.companies c on c.id = b.company_id
  left join lateral (
    select count(*) as unit_count, min(p.price) filter (where p.price > 0) as price_from
    from public.properties p
    where p.building_id = b.id
      and p.status = 'available'
  ) u on true
  -- The two null guards are for the partial index below, not for correctness:
  -- `between` already yields null for a null coordinate and null is not true,
  -- so a building with no position is excluded either way. Deleting them
  -- changes no result, which is worth writing down — a reader who assumes they
  -- are load-bearing will spend an afternoon proving they are not.
  where b.latitude is not null
    and b.longitude is not null
    and b.latitude between south and north
    and b.longitude between west and east
    and (statuses is null or b.construction_status = any (statuses))
  -- The tallest first, so a cap that bites keeps the landmarks rather than
  -- whichever rows the planner happened to reach.
  order by b.floors desc nulls last, b.total_units desc nulls last, b.id
  limit least(greatest(max_results, 1), 500);
$$;

grant execute on function public.buildings_in_viewport(
  double precision, double precision, double precision, double precision,
  public.construction_status[], integer
) to anon, authenticated;

-- The bounding-box scan wants an index on the coordinates it filters.
create index if not exists buildings_viewport_idx
  on public.buildings (latitude, longitude)
  where latitude is not null and longitude is not null;
