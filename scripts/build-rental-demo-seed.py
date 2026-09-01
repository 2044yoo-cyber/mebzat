#!/usr/bin/env python3
"""
Turns the rental demo CSV into a seed migration.

    python3 scripts/build-rental-demo-seed.py \
        supabase/seed/rental-demo \
        supabase/migrations/0047_rental_demo_seed.sql

The same shape as `build-property-demo-seed.py`, and deliberately so: these are
rentals, not a separate kind of thing. They go into `properties` with
`listing_kind = 'rent'`, which is what the existing filters, cards, map, search
and detail page already understand.

## The ten agents are the ten that already exist

`medosha_demo_agents.csv` here is byte-for-byte the same list as the property
demo's — same ids, same names, same agencies. So the ids are derived from the
*same* namespace as 0044, which means these rentals attach to the ten profiles
that are already there rather than creating ten more with the same names. Each
demo agent ends up with both sales and rentals, which is also what a real agent
looks like.

## What the CSV has that the schema does not

`furnished`, `serviced` and `shared` are columns in the dataset and not columns
on `properties`. Two of them already have homes:

  * `furnished` -> the `furnishing` enum from 0017 (`furnished` /
    `unfurnished`). Not a new column; the form has offered this since the table
    was created.
  * `serviced` -> the `amenities` text[], which is what the filters read.

`shared` is False on all 100 rows, so nothing is dropped by not having a place
for it. If a later dataset uses it, it belongs in `amenities` too rather than
in a new column.
"""

from __future__ import annotations

import csv
import hashlib
import math
import sys
from pathlib import Path

# The same namespace as the property demo, so `agent:agent_demo_01` resolves to
# the id 0044 already created. Changing this string would silently duplicate
# every agent.
NAMESPACE = "medosha:property-demo:"
BATCH = "rental-demo-2026-08"

from importlib.machinery import SourceFileLoader

# The gazetteer, the scatter and the id derivation are shared with the property
# seed rather than copied. One table of coordinates, so the two seeds cannot
# disagree about where Bole is, and the check script only has two copies to
# compare instead of three.
_property_seed = SourceFileLoader(
    "property_seed", str(Path(__file__).with_name("build-property-demo-seed.py"))
).load_module()

find_neighbourhood = _property_seed.find_neighbourhood
scatter_within = _property_seed.scatter_within
normalise = _property_seed.normalise
q = _property_seed.q
num = _property_seed.num
as_int = _property_seed.as_int
slugify = _property_seed.slugify
read_csv = _property_seed.read_csv


def uuid_for(key: str) -> str:
    digest = hashlib.md5((NAMESPACE + key).encode()).hexdigest()
    return f"{digest[0:8]}-{digest[8:12]}-{digest[12:16]}-{digest[16:20]}-{digest[20:32]}"


# The dataset's property types, onto the enum in 0017.
#
# "Furnished Apartment" and "Serviced Apartment" are an apartment plus a fact
# recorded elsewhere — furnishing and amenities — not two more kinds of
# building. Encoding them as types would split the apartment filter three ways
# and make "show me apartments" miss two thirds of them.
PROPERTY_TYPES = {
    "apartment": "apartment",
    "furnished apartment": "apartment",
    "serviced apartment": "apartment",
    "condominium": "apartment",
    "villa": "villa",
    "house": "house",
    "townhouse": "house",
    "detached duplex": "house",
}

PROPERTY_IMAGES = {
    "apartment": "/images/projects/residential.svg",
    "villa": "/images/projects/residential.svg",
    "house": "/images/projects/residential.svg",
}


def truthy(value: str) -> bool:
    return str(value).strip().lower() in {"true", "yes", "1"}


def main(seed_dir: str, out_path: str) -> None:
    folder = Path(seed_dir)
    rentals = read_csv(folder / "medosha_100_demo_rentals.csv")
    agents = read_csv(folder / "medosha_demo_agents.csv")

    agent_ids = {a["agent_id"]: uuid_for(f"agent:{a['agent_id']}") for a in agents}

    rows: list[str] = []
    placed = 0
    unplaced: list[str] = []

    for record in rentals:
        key = record["rental_id"]
        place = find_neighbourhood(record["location"])

        if place:
            lat, lon = scatter_within(place[1], place[2], key)
            neighbourhood = place[0]
            placed += 1
        else:
            lat = lon = None
            neighbourhood = record["location"] or None
            unplaced.append(f"{key} ({record['location']})")

        kind = PROPERTY_TYPES.get(record["property_type"].strip().lower())
        if kind is None:
            unplaced.append(f"{key} (unknown type {record['property_type']})")
            continue

        furnishing = "furnished" if truthy(record["furnished"]) else "unfurnished"

        amenities = []
        if truthy(record["serviced"]):
            amenities.append("Serviced")
        if as_int(record["parking_spaces"]):
            amenities.append("Parking")
        amenity_literal = (
            "array[" + ", ".join(q(a) for a in amenities) + "]::text[]"
            if amenities
            else "'{}'::text[]"
        )

        rows.append(
            "  ("
            + ", ".join([
                f"{q(uuid_for('rental:' + key))}::uuid",
                f"{q(agent_ids[record['agent_id']])}::uuid",
                q(record["title"]),
                q(slugify(record["title"], key.lower())),
                q(record["description"]),
                f"{q(kind)}::public.property_type",
                num(record["rent_etb_per_month"]),
                str(as_int(record["bedrooms"]) if as_int(record["bedrooms"]) is not None else "null"),
                str(as_int(record["bathrooms"]) if as_int(record["bathrooms"]) is not None else "null"),
                str(as_int(record["parking_spaces"]) if as_int(record["parking_spaces"]) is not None else "null"),
                num(record["area_m2"]),
                q(neighbourhood),
                q(record["city"]),
                num(lat) if lat is not None else "null",
                num(lon) if lon is not None else "null",
                f"{q(furnishing)}::public.furnishing",
                amenity_literal,
                q(PROPERTY_IMAGES.get(kind, "/images/placeholders/project.svg")),
            ])
            + ")"
        )

    header = f"""-- One hundred demo rentals, in the marketplace that already exists.
--
-- Generated from supabase/seed/rental-demo/*.csv by
-- scripts/build-rental-demo-seed.py. Do not edit by hand: regenerate it.
--
--   {len(rows)} rentals across {len(agents)} agents.
--   {placed} placed from their neighbourhood name; {len(rentals) - placed} left off the map.
--
-- These are `properties` rows with `listing_kind = 'rent'`, not a rental table.
-- The cards, the filters, the map, its clustering, the search, the detail page,
-- favourites and enquiries all already handle that value, so none of them
-- needed changing to show a rental.
--
-- The ten agents are the ten 0044 already created — same ids, derived from the
-- same namespace — so each of them now has both sales and rentals rather than
-- there being twenty demo agents with ten names between them.
--
-- Every row is sample data and says so: `is_sample = true`, no verified badge
-- (the trigger in 0043 refuses that combination), and a coordinate labelled
-- `approximate` because it is a neighbourhood centroid.
--
-- Idempotent, and removable: registered in `seed_content` under the batch
-- '{BATCH}', with the delete at the foot of this file.
--
-- Additive. Run after 0046.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'properties'
      and column_name = 'is_sample'
  ) then
    raise exception using
      message = 'Rental demo seed: the sample-data columns are missing.',
      hint = 'Run migration 0043 first.';
  end if;

  if not exists (select 1 from public.profiles where is_demo) then
    raise exception using
      message = 'Rental demo seed: the demo agents do not exist.',
      hint = 'Run migration 0044 first — these rentals belong to the ten agents it creates.';
  end if;
end $$;

with demo (
  id, owner_id, title, slug, description, property_type, price,
  bedrooms, bathrooms, parking_spaces, area_m2,
  neighbourhood, location_city, latitude, longitude,
  furnishing, amenities, cover_image_url
) as (
  values
{",".join(chr(10) + row for row in rows)}
)
insert into public.properties (
  id, owner_id, title, slug, description, property_type, listing_kind,
  price, price_period, currency, bedrooms, bathrooms, parking_spaces, area_m2,
  neighbourhood, location_city, location_country, latitude, longitude,
  location_accuracy, location_source, location_visibility, privacy_radius_m,
  furnishing, amenities, cover_image_url, seller_kind, status, is_sample
)
select
  d.id, d.owner_id, d.title, d.slug, d.description, d.property_type, 'rent',
  -- `price_period = 'month'` is what makes the card read "ETB 45,000 / month".
  -- The column has existed since 0017; a rental without it is a listing whose
  -- price means nothing.
  d.price, 'month', 'ETB',
  d.bedrooms, d.bathrooms, d.parking_spaces, d.area_m2,
  d.neighbourhood, d.location_city, 'Ethiopia', d.latitude, d.longitude,
  'approximate', 'demo_neighborhood_geocode',
  'approximate', 500,
  d.furnishing, d.amenities, d.cover_image_url, 'agent', 'available', true
from demo d
where d.latitude is not null
  and d.longitude is not null
  and not exists (select 1 from public.properties p where p.id = d.id);

insert into public.seed_content (entity, entity_id, batch)
select 'properties', p.id, '{BATCH}'
from public.properties p
where p.is_sample and p.listing_kind = 'rent'
on conflict (entity, entity_id) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- To remove just the rentals, leaving the sales demo and the agents alone:
--
--   begin;
--   delete from public.properties
--    where id in (select entity_id from public.seed_content
--                  where batch = '{BATCH}' and entity = 'properties');
--   delete from public.seed_content where batch = '{BATCH}';
--   commit;
--
-- The agents are not deleted here: they belong to the 0044 batch and still own
-- the sales listings. Removing them is that batch's delete, not this one's.
-- ---------------------------------------------------------------------------
"""

    Path(out_path).write_text(header, encoding="utf-8")
    print(f"{len(rows)} rentals, {len(agents)} agents -> {out_path}")
    print(f"   {placed} placed from a neighbourhood name")
    if unplaced:
        print(f"   {len(unplaced)} without a location:")
        for entry in unplaced:
            print(f"     - {entry}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
