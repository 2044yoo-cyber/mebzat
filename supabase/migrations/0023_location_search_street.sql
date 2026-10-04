-- Searching by street, sub city and building name.
--
-- 0022 added the columns and then did not look in them: the autocomplete
-- matched cities, neighbourhoods and landmarks only, so a seller who knows
-- their listing is "on Cameroon Street" or "in Getu Commercial Centre" got
-- nothing and fell back to dragging the pin.
--
-- The privacy rule is unchanged and is the reason this is fiddlier than a
-- wider LIKE. A street or a building can hold a single listing, so returning
-- its position would hand over the address the rest of this feature exists to
-- protect. Both are therefore matched only where more than one listing shares
-- the name, and the point returned is the centroid of the *published* points —
-- never the real ones.

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
  -- Named places built from listings. Grouped rather than selected row by
  -- row: the group is what makes the result safe to publish, because a
  -- centroid of one point is that point.
  from_listings as (
    select
      p.neighbourhood as name,
      'neighbourhood'::text as kind,
      max(coalesce(p.sub_city || ', ', '') || coalesce(p.location_city, 'Ethiopia')) as detail,
      avg(p.display_latitude) as latitude,
      avg(p.display_longitude) as longitude,
      max(p.location_city) as city,
      count(*) as listings
    from public.properties p
    where p.status = 'available' and p.neighbourhood is not null
    group by p.neighbourhood

    union all

    select
      p.sub_city,
      'sub_city',
      max(coalesce(p.location_city, 'Ethiopia')) || ' sub city',
      avg(p.display_latitude),
      avg(p.display_longitude),
      max(p.location_city),
      count(*)
    from public.properties p
    where p.status = 'available' and p.sub_city is not null
    group by p.sub_city

    union all

    select
      p.street,
      'street',
      max(coalesce(p.neighbourhood || ', ', '') || coalesce(p.location_city, 'Ethiopia')),
      avg(p.display_latitude),
      avg(p.display_longitude),
      max(p.location_city),
      count(*)
    from public.properties p
    where p.status = 'available' and p.street is not null
    group by p.street

    union all

    select
      p.building_name,
      'building',
      max(coalesce(p.neighbourhood || ', ', '') || coalesce(p.location_city, 'Ethiopia')),
      avg(p.display_latitude),
      avg(p.display_longitude),
      max(p.location_city),
      count(*)
    from public.properties p
    where p.status = 'available' and p.building_name is not null
    group by p.building_name
  )
  select * from (
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

    select
      l.kind,
      l.name,
      l.detail,
      l.latitude,
      l.longitude,
      l.city
    from from_listings l, q
    where q.lowered <> ''
      and lower(l.name) like '%' || q.lowered || '%'
      -- A neighbourhood is a public fact and is offered however many
      -- listings it holds. A street or a building can identify one property,
      -- so those appear only once several listings share the name and the
      -- centroid means nothing in particular.
      and (l.kind in ('neighbourhood', 'sub_city') or l.listings >= 3)

    union all

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

-- The autocomplete runs on every keystroke, so the columns it matches are
-- worth an index each.
create index if not exists properties_street_idx
  on public.properties (lower(street)) where status = 'available';
create index if not exists properties_building_idx
  on public.properties (lower(building_name)) where status = 'available';
create index if not exists properties_sub_city_idx
  on public.properties (lower(sub_city)) where status = 'available';
create index if not exists properties_neighbourhood_idx
  on public.properties (lower(neighbourhood)) where status = 'available';
