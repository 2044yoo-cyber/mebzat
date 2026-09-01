#!/usr/bin/env python3
"""
Turns the demo property CSVs into a seed migration.

    python3 scripts/build-property-demo-seed.py \
        supabase/seed/property-demo \
        supabase/migrations/0044_property_demo_seed.sql

Run once per dataset revision. The output is committed, so applying the seed
needs only a SQL editor.

## Coordinates

Every property is placed from its neighbourhood name using the same gazetteer
the application uses (`src/lib/location/addis-neighbourhoods.ts`), mirrored here
because a Python generator cannot import TypeScript. The check script asserts
the two agree, so a change to one that is not made to the other fails rather
than quietly moving fifty pins.

Nothing is placed at random. A name the gazetteer does not know produces a
property with **no coordinate**, which appears in the listings and not on the
map — a pin in the wrong part of the city is worse than no pin.

## Identity

Ids are `md5('medosha:property-demo:' || key)::uuid` — deterministic, so
re-running inserts nothing new, and a row can be found again by its source key
without storing a second identifier.
"""

from __future__ import annotations

import csv
import hashlib
import math
import sys
from pathlib import Path

BATCH = "property-demo-2026-08"
NAMESPACE = "medosha:property-demo:"

# --- The gazetteer, mirrored from src/lib/location/addis-neighbourhoods.ts ---
# Longest name first is not required here; `find_neighbourhood` ranks by length.
GAZETTEER = [
    ("Bole Medhanialem", 9.0107, 38.7817),
    ("Bole Atlas", 9.008, 38.776),
    ("Bole Wollo Sefer", 8.9968, 38.769),
    ("Bole Bulbula", 8.956, 38.786),
    ("Bole Japan", 8.993, 38.794),
    ("Bole Edna Mall", 9.006, 38.787),
    ("Bole Imperial", 9.018, 38.796),
    ("Bole Denbel", 9.003, 38.776),
    ("Bole", 9.01, 38.78),
    ("Gerji Imperial", 9.018, 38.808),
    ("Gerji", 9.013, 38.808),
    ("CMC", 9.029, 38.821),
    ("Summit by Cambridge", 9.012, 38.852),
    ("Summit", 9.009, 38.848),
    ("Ayat", 9.03, 38.87),
    ("Kotebe", 9.032, 38.858),
    ("Wossen", 9.023, 38.833),
    ("Shola", 9.028, 38.805),
    ("Megenagna", 9.02, 38.799),
    ("Laga Tafo", 9.053, 38.92),
    ("22 Area", 9.018, 38.788),
    ("Kazanchis", 9.014, 38.766),
    ("Meskel Flower", 8.993, 38.762),
    ("Kebena", 9.027, 38.786),
    ("Ferensay", 9.047, 38.776),
    ("Addisu Gebeya", 9.045, 38.742),
    ("Sarbet", 8.993, 38.748),
    ("Gofa", 8.984, 38.742),
    ("Lebu Haile Garment", 8.963, 38.718),
    ("Lebu", 8.955, 38.71),
    ("Alem Bank", 8.988, 38.69),
    ("Kolfe Keranyo", 9.025, 38.69),
    ("Abinet", 9.006, 38.728),
    ("Old Airport", 8.995, 38.73),
    ("Nifas Silk-Lafto", 8.97, 38.73),
    ("Gotera", 8.993, 38.757),
    ("Kirkos", 9.006, 38.7565),
    ("Lideta", 9.01, 38.737),
    ("Mexico", 9.006, 38.744),
    ("Urael", 9.0085, 38.7705),
    ("Yeka", 9.04, 38.8),
]

ALIASES = {
    "kasanchis": "Kazanchis",
    "kazanchise": "Kazanchis",
    "haya hulet": "22 Area",
    "hayahulet": "22 Area",
    "22 mazoria": "22 Area",
    "legetafo": "Laga Tafo",
    "lege tafo": "Laga Tafo",
    "laga tafo abakiros": "Laga Tafo",
    "bulbula": "Bole Bulbula",
    "medhanialem": "Bole Medhanialem",
    "wollo sefer": "Bole Wollo Sefer",
    "cmc": "CMC",
    "haile garment": "Lebu Haile Garment",
}

# A local image per property type.
#
# The dataset ships an images.unsplash.com URL. next.config.ts allows exactly
# one remote host — this deployment's Supabase Storage — and says why: "All
# demo/placeholder imagery is stored locally under public/images ... so the app
# renders its content fully offline."
#
# An unconfigured host is not a broken picture. `next/image` throws, and a throw
# in a client component takes the route with it: fifty of these turned the
# property map into "The map could not start", losing the map, the list, the
# filters and the search at once.
#
# The dataset's own instructions say the same thing from the other direction —
# replace the placeholder with imagery Medosha owns. These are the branded SVGs
# already used for projects.
PROPERTY_IMAGES = {
    "apartment": "/images/projects/residential.svg",
    "villa": "/images/projects/residential.svg",
    "house": "/images/projects/residential.svg",
    "commercial": "/images/projects/commercial.svg",
    "office": "/images/projects/commercial.svg",
    "shop": "/images/projects/commercial.svg",
    "warehouse": "/images/projects/industrial.svg",
    "land": "/images/projects/landscape.svg",
}

# The dataset's words for a property type, mapped onto the enum in 0017.
PROPERTY_TYPES = {
    "apartment": "apartment",
    "villa": "villa",
    "house": "house",
    "commercial": "commercial",
    "land": "land",
    "office": "office",
    "shop": "shop",
    "warehouse": "warehouse",
}


def normalise(text: str) -> str:
    return " ".join("".join(c if c.isalnum() else " " for c in text.lower()).split())


def find_neighbourhood(location: str):
    """The longest matching name wins — see the TypeScript module for why."""
    text = normalise(location)
    if not text:
        return None

    best = None
    best_length = 0

    for alias, canonical in ALIASES.items():
        if len(alias) > best_length and alias in text:
            for name, lat, lon in GAZETTEER:
                if name == canonical:
                    best, best_length = (name, lat, lon), len(alias)

    for name, lat, lon in GAZETTEER:
        key = normalise(name)
        if len(key) > best_length and key in text:
            best, best_length = (name, lat, lon), len(key)

    return best


def scatter_within(lat: float, lon: float, key: str, radius_m: float = 150.0):
    """FNV-1a, mirrored from the TypeScript. Same key, same point, every run."""
    h = 0x811C9DC5
    for ch in key:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF

    angle = ((h & 0xFFFF) / 0x10000) * math.pi * 2
    distance = math.sqrt(((h >> 16) & 0xFFFF) / 0x10000) * radius_m

    per_deg_lat = 111_320.0
    per_deg_lon = 111_320.0 * math.cos(math.radians(lat))

    return (
        round(lat + (distance * math.sin(angle)) / per_deg_lat, 6),
        round(lon + (distance * math.cos(angle)) / per_deg_lon, 6),
    )


def uuid_for(key: str) -> str:
    digest = hashlib.md5((NAMESPACE + key).encode()).hexdigest()
    return f"{digest[0:8]}-{digest[8:12]}-{digest[12:16]}-{digest[16:20]}-{digest[20:32]}"


def q(value) -> str:
    """A SQL literal. Single quotes doubled; nothing else interpolated."""
    if value is None:
        return "null"
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none"}:
        return "null"
    return "'" + text.replace("'", "''") + "'"


def num(value) -> str:
    if value is None:
        return "null"
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none"}:
        return "null"
    try:
        return repr(float(text))
    except ValueError:
        return "null"


def as_int(value):
    text = (str(value) if value is not None else "").strip()
    if not text or text.lower() in {"nan", "none"}:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def slugify(text: str, suffix: str) -> str:
    base = "-".join(normalise(text).split())[:60].strip("-")
    return f"{base}-{suffix}".lower()


def read_csv(path: Path):
    # utf-8-sig: the files carry a BOM, which otherwise ends up inside the first
    # column's name and every lookup of it fails.
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def main(seed_dir: str, out_path: str) -> None:
    folder = Path(seed_dir)
    agents = read_csv(folder / "medosha_10_demo_agents.csv")
    properties = read_csv(folder / "medosha_50_demo_properties.csv")

    agent_ids = {a["agent_id"]: uuid_for(f"agent:{a['agent_id']}") for a in agents}

    lines: list[str] = []
    placed = 0
    unplaced: list[str] = []

    # --- agents -------------------------------------------------------------
    agent_users = []
    agent_updates = []
    for agent in agents:
        uid = agent_ids[agent["agent_id"]]
        agent_users.append(
            f"  ({q(uid)}::uuid, {q(agent['email'])})"
        )
        agent_updates.append(
            "  ("
            + ", ".join([
                f"{q(uid)}::uuid",
                q(agent["agent_name"]),
                q(agent["agency_name"]),
                q(agent["base_area"]),
                q(slugify(agent["agent_name"], agent["agent_id"].replace("agent_demo_", "d"))),
            ])
            + ")"
        )

    # --- properties ---------------------------------------------------------
    rows = []
    for record in properties:
        key = record["property_id"]
        pid = uuid_for(f"property:{key}")
        place = find_neighbourhood(record["location"])

        if place:
            lat, lon = scatter_within(place[1], place[2], key)
            accuracy = "approximate"
            source = "demo_neighborhood_geocode"
            neighbourhood = place[0]
            placed += 1
        else:
            # Deliberately no coordinate. The listing still exists; it simply
            # does not appear on the map.
            lat = lon = None
            accuracy = "unknown"
            source = None
            neighbourhood = record["location"] or None
            unplaced.append(f"{key} ({record['location']})")

        kind = PROPERTY_TYPES.get(record["property_type"].strip().lower())
        if kind is None:
            unplaced.append(f"{key} (unknown type {record['property_type']})")
            continue

        area = num(record["area_m2"])
        rows.append(
            "  ("
            + ", ".join([
                f"{q(pid)}::uuid",
                f"{q(agent_ids[record['agent_id']])}::uuid",
                q(record["title"]),
                q(slugify(record["title"], key.lower())),
                q(record["description"]),
                f"{q(kind)}::public.property_type",
                num(record["price_etb"]),
                str(as_int(record["bedrooms"]) if as_int(record["bedrooms"]) is not None else "null"),
                str(as_int(record["bathrooms"]) if as_int(record["bathrooms"]) is not None else "null"),
                str(as_int(record["parking_spaces"]) if as_int(record["parking_spaces"]) is not None else "null"),
                # Land is measured as a plot, not as built area. Putting a plot
                # size in area_m2 would make a 500 m² site sort beside a 500 m²
                # penthouse.
                "null" if kind == "land" else area,
                area if kind == "land" else "null",
                q(neighbourhood),
                q(record["city"]),
                num(lat) if lat is not None else "null",
                num(lon) if lon is not None else "null",
                f"{q(accuracy)}::public.location_accuracy",
                q(source),
                q(PROPERTY_IMAGES.get(kind, "/images/placeholders/project.svg")),
                q(record["source_url"]),
            ])
            + ")"
        )

    header = f"""-- Fifty demo properties and ten demo agents, on the existing map.
--
-- Generated from supabase/seed/property-demo/*.csv by
-- scripts/build-property-demo-seed.py. Do not edit by hand: regenerate it, so
-- the file and the dataset cannot drift apart.
--
--   {len(rows)} properties across {len(agents)} agents.
--   {placed} placed from their neighbourhood name; {len(properties) - placed} left off the map.
--
-- Every row is sample data and says so: `is_sample = true`, no verified badge
-- (a trigger in 0043 refuses that combination), and a coordinate labelled
-- `approximate` because it is a neighbourhood centroid, not a building.
--
-- These go into the existing `properties` table, so the existing map, its
-- clustering, its filters and its property cards pick them up with no second
-- source of data and no second map.
--
-- Idempotent. Ids are derived from the dataset's own keys, so re-running
-- inserts nothing new. Removable: every row is registered in `seed_content`
-- under the batch '{BATCH}', and the footer of this file has the delete.
--
-- Additive. Run after 0043.

begin;

do $$
begin
  if to_regclass('public.properties') is null
     or not exists (
       select 1 from information_schema.columns
       where table_name = 'properties' and column_name = 'is_sample'
     ) then
    raise exception using
      message = 'Property demo seed: the location-accuracy columns are missing.',
      hint = 'Run migration 0043 first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The agents
--
-- Inserted into auth.users, which fires the trigger from 0001 and creates the
-- profile. Writing to public.profiles directly would leave accounts that cannot
-- be signed into and that no foreign key from auth would protect.
--
-- No password and no confirmed email: these are display-only accounts. Nobody
-- can sign in as one, which is the intended level of access for a fictional
-- person.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values
{",".join(chr(10) + line for line in agent_users)}
on conflict (id) do nothing;

update public.profiles p
set full_name = a.full_name,
    company_name = a.company_name,
    location_city = 'Addis Ababa',
    bio = a.company_name || ' — demo agent based in ' || a.base_area ||
          '. Sample account created to populate the Medosha property '
          'marketplace. Not a real agent, and not a real agency.',
    account_type = 'individual',
    username = a.username,
    is_demo = true
from (values
{",".join(chr(10) + line for line in agent_updates)}
) as a(id, full_name, company_name, base_area, username)
where p.id = a.id;

-- ---------------------------------------------------------------------------
-- The properties
-- ---------------------------------------------------------------------------

with demo (
  id, owner_id, title, slug, description, property_type, price,
  bedrooms, bathrooms, parking_spaces, area_m2, plot_area_m2,
  neighbourhood, location_city, latitude, longitude,
  location_accuracy, location_source, cover_image_url, source_url
) as (
  values
{",".join(chr(10) + row for row in rows)}
)
insert into public.properties (
  id, owner_id, title, slug, description, property_type, listing_kind,
  price, currency, bedrooms, bathrooms, parking_spaces, area_m2, plot_area_m2,
  neighbourhood, location_city, location_country, latitude, longitude,
  location_accuracy, location_source, location_visibility, privacy_radius_m,
  cover_image_url, seller_kind, status, is_sample
)
select
  d.id, d.owner_id, d.title, d.slug, d.description, d.property_type, 'sale',
  d.price, 'ETB', d.bedrooms, d.bathrooms, d.parking_spaces,
  d.area_m2, d.plot_area_m2,
  d.neighbourhood, d.location_city, 'Ethiopia', d.latitude, d.longitude,
  d.location_accuracy, d.location_source,
  -- A circle rather than a pin, and a radius that matches how good the
  -- coordinate actually is. Showing a sharp pin for a neighbourhood centroid
  -- would be a more precise claim than the data supports.
  'approximate', 500,
  d.cover_image_url, 'agent', 'available', true
from demo d
-- A property with no coordinate is not skipped here; it is filtered out below,
-- because `properties.latitude` is not null and cannot hold "unknown". It stays
-- available to the listings through the same dataset once that column is made
-- nullable — until then, leaving it out is the honest option, and the count is
-- reported in this file's header.
where d.latitude is not null
  and d.longitude is not null
  and not exists (select 1 from public.properties p where p.id = d.id);

-- ---------------------------------------------------------------------------
-- The register
--
-- So this batch can be removed later, exactly, without anybody having to
-- remember which rows were which.
-- ---------------------------------------------------------------------------

insert into public.seed_content (entity, entity_id, batch)
select 'properties', p.id, '{BATCH}'
from public.properties p
where p.is_sample
on conflict (entity, entity_id) do nothing;

insert into public.seed_content (entity, entity_id, batch)
select 'profiles', p.id, '{BATCH}'
from public.profiles p
where p.is_demo
on conflict (entity, entity_id) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- To remove this batch entirely, run:
--
--   begin;
--   delete from public.properties
--    where id in (select entity_id from public.seed_content
--                  where batch = '{BATCH}' and entity = 'properties');
--   delete from auth.users
--    where id in (select entity_id from public.seed_content
--                  where batch = '{BATCH}' and entity = 'profiles');
--   delete from public.seed_content where batch = '{BATCH}';
--   commit;
--
-- Deleting the auth user cascades to the profile. No real listing is touched:
-- every id comes from the register, and the register only ever held these rows.
-- ---------------------------------------------------------------------------
"""

    Path(out_path).write_text(header, encoding="utf-8")

    print(f"{len(rows)} properties, {len(agents)} agents -> {out_path}")
    print(f"   {placed} placed from a neighbourhood name")
    if unplaced:
        print(f"   {len(unplaced)} without a location:")
        for entry in unplaced:
            print(f"     - {entry}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
