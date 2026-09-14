#!/usr/bin/env python3
"""Writes supabase/migrations/0084_professionals_seed.sql.

Twenty tradespeople and eight firms, so that Find Professionals is a directory
somebody can use rather than an empty page with a search box on it.

## Why this is generated

The same reason build-property-demo-seed.py is: the roster is data, and data
edited in two places drifts. The roster lives in this file, the SQL is its
output, and a change to one is a rerun rather than two edits that have to agree.

    python3 scripts/build_professionals_seed.py

## Two decisions worth knowing before reading the SQL

**These people carry no phone number.** Every other field is filled in. A
phone number is the one field that cannot be invented without consequence: an
Ethiopian mobile number that looks plausible *is* somebody's handset, and the
person holding it would start taking calls about rebar. `show_phone` stays
false and `phone` stays null, so the contact buttons fall back to the
platform's own message and quote flow, which is where a first contact with a
stranger should go anyway.

**They are not marked `is_demo`.** That was the first plan, and it is wrong:
`search_professionals` filters on `coalesce(p.is_demo, false) = false`, so a
demo-flagged professional is invisible to the only page that looks for one.
The batch is registered in `seed_content` instead — a table the application
never reads and the footer of the SQL can delete in one statement.
"""

import uuid
from pathlib import Path

BATCH = "professionals-2026-09"
# A fixed namespace, so rerunning this produces the same ids and the migration
# stays idempotent through `on conflict (id) do nothing`.
NAMESPACE = uuid.UUID("8f3d5a12-6c41-4e8b-9a77-2b0e5f1c93d4")


def ident(username: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"{BATCH}:{username}"))


# (username, full name, trade, specialties, base area, service areas,
#  years, work_status, bio)
WORKERS = [
    ("tesfaye_alemu", "Tesfaye Alemu", "Carpenter",
     ["Doors", "Cabinets", "Roof timber"],
     "Gerji", ["Gerji", "CMC", "Bole", "Summit"], 14, "available",
     "Doors, fitted cupboards and roof timber. Works from a small shop in Gerji "
     "and takes site work anywhere along the eastern side of the city."),
    ("yohannes_bekele", "Yohannes Bekele", "Carpenter's Helper",
     ["Formwork", "Shuttering", "Sanding"],
     "Kotebe", ["Kotebe", "Ayat", "Summit"], 3, "available",
     "Three years on formwork and shuttering. Available by the day or by the "
     "week, and will travel to a site anywhere in Yeka."),
    ("girma_tadesse", "Girma Tadesse", "Electrician",
     ["House wiring", "Distribution boards", "Fault finding"],
     "Megenagna", ["Megenagna", "Shola", "Kazanchis", "Bole"], 11, "limited",
     "House wiring and distribution boards, new build and rewiring. Eleven "
     "years, most of it on residential work in Yeka and Bole."),
    ("hiwot_mulugeta", "Hiwot Mulugeta", "Electrician's Helper",
     ["Conduit chasing", "Pulling cable", "Fixing boxes"],
     "Kolfe Keranyo", ["Kolfe Keranyo", "Alem Bank", "Lideta"], 2, "available",
     "Chasing, conduit and cable pulling. Two years on site, looking for "
     "steady work with an electrician in the west of the city."),
    ("solomon_desta", "Solomon Desta", "Rebar Bender (Ferayo)",
     ["Column cages", "Beam reinforcement", "Stirrups"],
     "Lebu", ["Lebu", "Lebu Haile Garment", "Gofa", "Sarbet"], 9, "available",
     "Ferayo. Column cages, beams and stirrups, cut and bent on site. Nine "
     "years on G+4 and below around Lebu and Gofa."),
    ("mekonnen_haile", "Mekonnen Haile", "Rebar Bender (Ferayo)",
     ["Slab mesh", "Footing bars", "Bar cutting"],
     "Ayat", ["Ayat", "Kotebe", "Summit", "Laga Tafo"], 16, "busy",
     "Sixteen years bending bar, mostly on apartment blocks out towards Ayat "
     "and Legetafo. Works with a crew of four when the job needs it."),
    ("getachew_assefa", "Getachew Assefa", "Mason",
     ["Block work", "Plastering", "Foundations"],
     "Gofa", ["Gofa", "Sarbet", "Old Airport", "Meskel Flower"], 18, "limited",
     "Block work, plastering and foundations. Eighteen years, villas and small "
     "apartment buildings on the southern side of the city."),
    ("dereje_wolde", "Dereje Wolde", "Mason's Helper",
     ["Mixing mortar", "Carrying blocks", "Curing"],
     "Alem Bank", ["Alem Bank", "Kolfe Keranyo", "Abinet"], 4, "available",
     "Four years helping masons — mortar, blocks and curing. Starts early and "
     "is happy with a long job rather than a day here and there."),
    ("ashenafi_negash", "Ashenafi Negash", "Welder",
     ["Gates", "Handrails", "Window frames"],
     "22 Area", ["22 Area", "Megenagna", "Bole", "Urael"], 12, "available",
     "Gates, handrails and window frames, measured on site and made in the "
     "workshop at 22. Twelve years at it."),
    ("bekele_terefe", "Bekele Terefe", "Plumber",
     ["Bathrooms", "Water tanks", "Leak repair"],
     "Kazanchis", ["Kazanchis", "Kirkos", "Mexico", "Gotera"], 10, "limited",
     "Bathrooms, kitchens, tanks and pumps. Ten years, and does the awkward "
     "leak-finding jobs other people have given up on."),
    ("selamawit_girma", "Selamawit Girma", "Plumber's Helper",
     ["Chasing walls", "Carrying pipe", "Fitting brackets"],
     "Gotera", ["Gotera", "Kirkos", "Meskel Flower"], 2, "available",
     "Two years assisting on bathroom and kitchen installations. Chasing, "
     "pipe work and brackets."),
    ("habtamu_regassa", "Habtamu Regassa", "Construction Labourer",
     ["Concrete pouring", "Loading and unloading", "Site clean-up"],
     "Lebu Haile Garment",
     ["Lebu", "Lebu Haile Garment", "Nifas Silk-Lafto"], 6, "available",
     "Six years of general site labour — pours, loading, clearing. Reliable "
     "for a full week rather than a single day."),
    ("almaz_hailu", "Almaz Hailu", "Construction Labourer",
     ["Excavation by hand", "Demolition", "Site clean-up"],
     "Abinet", ["Abinet", "Addisu Gebeya", "Lideta", "Ferensay"], 5, "available",
     "Hand excavation, strip-out and clearing. Five years, and works with the "
     "same three people so a crew can be arranged at short notice."),
    ("fikadu_yimer", "Fikadu Yimer", "Scaffolder",
     ["Eucalyptus scaffold", "Erecting", "Edge protection"],
     "Shola", ["Shola", "Megenagna", "Yeka", "Kebena"], 8, "limited",
     "Eucalyptus and tube scaffold, erected and struck. Eight years, and will "
     "not leave a lift without edge protection on it."),
    ("endale_mamo", "Endale Mamo", "Roofer",
     ["Corrugated sheet", "Purlins", "Gutters and downpipes"],
     "Summit", ["Summit", "Summit by Cambridge", "CMC", "Ayat"], 13, "available",
     "Corrugated roofing, purlins, gutters and downpipes. Thirteen years, and "
     "does leak repairs on roofs somebody else put up."),
    ("meseret_legesse", "Meseret Legesse", "Painter",
     ["Interior painting", "Exterior painting", "Decorative finishes"],
     "Bole Bulbula", ["Bole Bulbula", "Bole", "Bole Japan", "Gerji"], 7, "available",
     "Interior and exterior painting, including the preparation nobody wants "
     "to do. Seven years, mostly apartments in Bole."),
    ("alemayehu_tesfa", "Alemayehu Tesfa", "Tile Installer",
     ["Floor tiling", "Bathrooms", "Granite"],
     "Old Airport", ["Old Airport", "Sarbet", "Gofa", "Nifas Silk-Lafto"], 9, "busy",
     "Floor and wall tiling, bathrooms and granite worktops. Nine years, and "
     "sets out a room before cutting anything."),
    ("tigist_abera", "Tigist Abera", "Gypsum Worker",
     ["Ceilings", "Cornices", "Lighting coves"],
     "Kebena", ["Kebena", "Kazanchis", "Ferensay", "Yeka"], 6, "available",
     "Gypsum ceilings, cornices and lighting coves. Six years on residential "
     "and small office fit-outs."),
    ("muluken_bogale", "Muluken Bogale", "Excavator Operator",
     ["Foundation digging", "Trenching", "Site levelling"],
     "Laga Tafo", ["Laga Tafo", "Ayat", "Kotebe", "Summit"], 15, "limited",
     "Excavator operator — foundations, trenches and levelling. Fifteen years. "
     "Machine hire arranged separately."),
    ("birhanu_kassa", "Birhanu Kassa", "Aluminium Worker",
     ["Windows", "Doors", "Partitions"],
     "Bole Denbel", ["Bole Denbel", "Bole Atlas", "Bole Medhanialem", "Urael"],
     11, "available",
     "Aluminium windows, doors and office partitions. Eleven years, measured "
     "and fitted, and repairs on frames already in place."),
]

# (username, company name, account_type, trade, specialties, base area,
#  service areas, citywide, years, staff, work_status, category slug, bio)
FIRMS = [
    ("gerji_wood_works", "Gerji Wood Works", "company", "Furniture Maker",
     ["Kitchens", "Wardrobes", "Office furniture"],
     "Gerji", ["Gerji", "CMC", "Bole", "Summit", "Ayat"], False, 9, 14,
     "available", "joinery",
     "Kitchens, wardrobes and office furniture, made in the workshop in Gerji "
     "and fitted on site. Fourteen people, nine years in business."),
    ("kazanchis_electrical", "Kazanchis Electrical Contractors", "contractor",
     "Electrician",
     ["House wiring", "Distribution boards", "Generators", "Solar"],
     "Kazanchis", ["Kazanchis", "Kirkos", "Mexico", "Bole", "Megenagna"],
     True, 12, 26, "limited", "electrical",
     "Electrical contracting for apartment blocks and offices: wiring, boards, "
     "generators and standby. Twelve years, and works across the city."),
    ("lebu_metal_works", "Lebu Metal & Aluminium Works", "company",
     "Aluminium Worker",
     ["Windows", "Doors", "Curtain walling", "Shopfronts"],
     "Lebu", ["Lebu", "Lebu Haile Garment", "Gofa", "Sarbet", "Alem Bank"],
     False, 7, 18, "available", "joinery",
     "Aluminium windows, curtain walling and shopfronts, plus steel gates and "
     "handrails. Own workshop at Lebu."),
    ("summit_interiors", "Summit Interiors & Fit-out", "company",
     "Interior Designer",
     ["Offices", "Cafés and restaurants", "Furniture selection"],
     "Summit", ["Summit", "Summit by Cambridge", "CMC", "Bole", "Gerji"],
     False, 6, 11, "available", "interior",
     "Office and restaurant fit-out from drawings through to handover. Small "
     "team, one project at a time."),
    ("kolfe_scaffolding", "Kolfe Scaffolding & Formwork", "company",
     "Scaffolder",
     ["Tube and coupler", "Erecting", "Dismantling", "Edge protection"],
     "Kolfe Keranyo", ["Kolfe Keranyo", "Alem Bank", "Abinet", "Lideta"],
     False, 10, 32, "limited", "general-contracting",
     "Scaffold and formwork hire with erection and striking included. Ten "
     "years supplying contractors on the western side of the city."),
    ("gotera_plumbing", "Gotera Plumbing & Sanitary", "company", "Plumber",
     ["Bathrooms", "Kitchens", "Water tanks", "Pumps"],
     "Gotera", ["Gotera", "Kirkos", "Meskel Flower", "Kazanchis", "Old Airport"],
     False, 8, 9, "available", "plumbing",
     "Plumbing and sanitary installation for houses and small apartment "
     "buildings, including tanks and booster pumps."),
    ("shola_gypsum", "Shola Gypsum & Ceiling", "company", "Gypsum Worker",
     ["Ceilings", "Partitions", "Cornices", "Bulkheads"],
     "Shola", ["Shola", "Megenagna", "Yeka", "Kebena", "22 Area"], False, 5, 15,
     "available", "finishing",
     "Gypsum ceilings, partitions and bulkheads. Five years, mostly apartment "
     "finishing work in Yeka."),
    ("lideta_contractors", "Lideta Building Contractors", "contractor",
     "Contractor",
     ["Full build", "Renovation", "Site management", "Finishing works"],
     "Lideta", ["Lideta", "Abinet", "Mexico", "Kirkos", "Addisu Gebeya"],
     True, 15, 64, "busy", "general-contracting",
     "General contracting: villas, G+4 residential and renovation. Fifteen "
     "years, sixty-four people, and works across Addis Ababa."),
]


def quote(text: str) -> str:
    return "'" + text.replace("'", "''") + "'"


def array(values) -> str:
    return "array[" + ", ".join(quote(v) for v in values) + "]::text[]"


def slugify(name: str) -> str:
    return name.lower().replace(" ", "-")


def main() -> None:
    lines: list[str] = []
    add = lines.append

    add(f"""-- Twenty tradespeople and eight firms, in the professionals directory.
--
-- Generated by scripts/build_professionals_seed.py. Do not edit by hand:
-- regenerate it, so the file and the roster cannot drift apart.
--
--   {len(WORKERS)} individual workers, {len(FIRMS)} companies.
--   Every one of them has a trade, a base area and the areas they travel to,
--   so every one of them is findable by trade, findable by job location, and
--   drawable on the map.
--
-- ## Why Find Professionals was empty without this
--
-- The search matches on *where the job is*, through
-- `professional_service_areas`. A profile with no rows in that table matches
-- no area search at all, and `mapPoints` cannot place it either, because it
-- resolves a point from the name of an area and there is no name. So a
-- directory of profiles that had never filled that section in was a directory
-- that answered "nobody works here" for every area in the city and drew an
-- empty map. These rows are the first set that answers.
--
-- ## What is deliberately missing
--
-- **A phone number.** Not an oversight and not a placeholder. A plausible
-- +251 mobile number is a real handset belonging to a real person, and
-- publishing twenty-eight of them against fictional tradespeople would send
-- strangers' phones calls about rebar and roofing. `phone` stays null and
-- `show_phone` stays false, so the contact buttons use the platform's own
-- message and quote flow.
--
-- **Reviews and ratings.** A rating comes from `reviews`, and a seeded review
-- is a testimonial from somebody who does not exist about work that never
-- happened. These profiles carry years of experience, which is a claim, and no
-- rating, which is a fact nobody has yet established.
--
-- **`is_demo`.** Deliberately NOT set, and this is the trap worth naming:
-- `search_professionals` filters on `coalesce(p.is_demo, false) = false`, so
-- flagging these rows the way 0044 flags its demo agents would make every one
-- of them invisible to the only page that looks for them. Removability comes
-- from `seed_content` instead, which is a register the application never
-- reads — which is exactly what 0036 created it for.
--
-- Idempotent. Ids are derived from each username through a fixed namespace, so
-- re-running inserts nothing new. Removable: every row is registered in
-- `seed_content` under the batch '{BATCH}', and the footer has the delete.
--
-- Additive. Run after 0078.

begin;

-- ---------------------------------------------------------------------------
-- Refuse to run against a schema that cannot hold this
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.professional_service_areas') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles'
         and column_name = 'profession'
     ) then
    raise exception using
      message = 'Professionals seed: the service-area columns are missing.',
      hint = 'Run migration 0078 first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The accounts
--
-- Inserted into auth.users, which fires the trigger from 0001 and creates the
-- profile. Writing to public.profiles directly would leave rows that no
-- foreign key from auth protects and that nobody could ever sign into.
--
-- No password and no confirmed email, so none of these can be signed in as.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values""")

    rows = []
    for w in WORKERS:
        rows.append(f"  ('{ident(w[0])}'::uuid, '{w[0]}@professionals.medosha.local')")
    for f in FIRMS:
        rows.append(f"  ('{ident(f[0])}'::uuid, '{f[0]}@professionals.medosha.local')")
    add(",\n".join(rows))
    add("on conflict (id) do nothing;\n")

    # ---- individuals -------------------------------------------------------
    add("""-- ---------------------------------------------------------------------------
-- The tradespeople
--
-- `travel_radius_km` is left null on purpose: these people listed the areas
-- they work in, and a radius on top of that would quietly add areas nobody
-- named. The listed areas are the claim.
-- ---------------------------------------------------------------------------

update public.profiles p
set full_name = s.full_name,
    username = s.username,
    account_type = 'individual',
    profession = s.profession,
    specialties = s.specialties,
    base_area = s.base_area,
    location_city = 'Addis Ababa',
    location_country = 'Ethiopia',
    years_experience = s.years_experience,
    work_status = s.work_status::public.work_status,
    bio = s.bio,
    serves_entire_city = false,
    travel_radius_km = null,
    show_phone = false,
    phone = null,
    onboarding_completed = true,
    updated_at = now()
from (values""")
    rows = []
    for username, name, trade, specialties, base, areas, years, status, bio in WORKERS:
        rows.append(
            f"  ('{ident(username)}'::uuid, {quote(name)}, {quote(username)}, "
            f"{quote(trade)}, {array(specialties)}, {quote(base)}, "
            f"{years}, {quote(status)}, {quote(bio)})"
        )
    add(",\n".join(rows))
    add("""\n) as s(id, full_name, username, profession, specialties, base_area,
         years_experience, work_status, bio)
where p.id = s.id;
""")

    # ---- firms -------------------------------------------------------------
    add("""-- ---------------------------------------------------------------------------
-- The firms
--
-- `serves_entire_city` is true for the two that genuinely work across Addis
-- Ababa and false for the rest. It is not a bigger version of a service area:
-- the search treats it as a match for every area in the city, so a firm that
-- sets it and does not mean it sits in every result in the directory.
-- ---------------------------------------------------------------------------

update public.profiles p
set company_name = s.company_name,
    full_name = s.company_name,
    username = s.username,
    account_type = s.account_type::public.account_type,
    profession = s.profession,
    specialties = s.specialties,
    base_area = s.base_area,
    location_city = 'Addis Ababa',
    location_country = 'Ethiopia',
    years_experience = s.years_experience,
    work_status = s.work_status::public.work_status,
    bio = s.bio,
    serves_entire_city = s.serves_entire_city,
    travel_radius_km = null,
    show_phone = false,
    phone = null,
    onboarding_completed = true,
    updated_at = now()
from (values""")
    rows = []
    for (username, cname, atype, trade, specialties, base, areas, citywide,
         years, staff, status, category, bio) in FIRMS:
        rows.append(
            f"  ('{ident(username)}'::uuid, {quote(cname)}, {quote(username)}, "
            f"{quote(atype)}, {quote(trade)}, {array(specialties)}, "
            f"{quote(base)}, {str(citywide).lower()}, {years}, "
            f"{quote(status)}, {quote(bio)})"
        )
    add(",\n".join(rows))
    add("""\n) as s(id, company_name, username, account_type, profession, specialties,
         base_area, serves_entire_city, years_experience, work_status, bio)
where p.id = s.id;
""")

    # ---- service areas -----------------------------------------------------
    add("""-- ---------------------------------------------------------------------------
-- The areas each of them works in
--
-- Joined to location_areas by name rather than written with a slug beside it,
-- so an area this gazetteer does not have produces no row instead of a row
-- pointing at a slug that resolves to nothing. If a name below is ever
-- misspelled, that professional loses one area — it does not gain a broken one.
-- ---------------------------------------------------------------------------

insert into public.professional_service_areas (profile_id, area_slug, area_name, city, country)
select s.id, a.slug, a.name, a.city, a.country
from (values""")
    rows = []
    for w in WORKERS:
        for area in w[5]:
            rows.append(f"  ('{ident(w[0])}'::uuid, {quote(area)})")
    for f in FIRMS:
        for area in f[6]:
            rows.append(f"  ('{ident(f[0])}'::uuid, {quote(area)})")
    add(",\n".join(rows))
    add("""\n) as s(id, area_name)
join public.location_areas a
  on lower(a.name) = lower(s.area_name) and a.city = 'Addis Ababa'
on conflict (profile_id, area_slug, city) do nothing;
""")

    # ---- companies ---------------------------------------------------------
    add("""-- ---------------------------------------------------------------------------
-- The firms, as businesses
--
-- A company on Medosha is two things: a profile somebody can hire through, and
-- a listing in the business directory. Creating only the first would leave
-- eight firms that answer a professional search and cannot be found by anybody
-- browsing companies, which is a difference nobody outside the schema would
-- expect.
--
-- `is_claimed` is true and `owner_id` points at the profile, because these are
-- not scraped listings waiting for somebody to claim them.
-- ---------------------------------------------------------------------------

insert into public.companies (
  slug, name, category, description, city, country,
  employees_count, owner_id, is_claimed, verified, import_source, external_ref
)
values""")
    rows = []
    for (username, cname, atype, trade, specialties, base, areas, citywide,
         years, staff, status, category, bio) in FIRMS:
        rows.append(
            f"  ({quote(slugify(cname))}, {quote(cname)}, {quote(category)}, "
            f"{quote(bio)}, 'Addis Ababa', 'Ethiopia', {staff}, "
            f"'{ident(username)}'::uuid, true, false, 'seed', {quote(username)})"
        )
    add(",\n".join(rows))
    add("on conflict (import_source, external_ref) do nothing;\n")

    # ---- register ----------------------------------------------------------
    add(f"""-- ---------------------------------------------------------------------------
-- The register
--
-- So this batch can be removed later, exactly, without anybody having to
-- remember which rows were which. Built from the ids this file wrote, not from
-- a flag on the row — a flag would have to be either read by the search (and
-- then it hides them) or ignored by it (and then it is not a flag, it is a
-- comment).
-- ---------------------------------------------------------------------------

insert into public.seed_content (entity, entity_id, batch)
values""")
    rows = []
    for w in WORKERS:
        rows.append(f"  ('profiles', '{ident(w[0])}'::uuid, {quote(BATCH)})")
    for f in FIRMS:
        rows.append(f"  ('profiles', '{ident(f[0])}'::uuid, {quote(BATCH)})")
    add(",\n".join(rows))
    add("on conflict (entity, entity_id) do nothing;\n")

    add(f"""insert into public.seed_content (entity, entity_id, batch)
select 'companies', c.id, {quote(BATCH)}
from public.companies c
where c.import_source = 'seed'
  and c.external_ref in ({", ".join(quote(f[0]) for f in FIRMS)})
on conflict (entity, entity_id) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- To remove this batch entirely, run:
--
--   begin;
--   delete from public.companies
--    where id in (select entity_id from public.seed_content
--                  where batch = {quote(BATCH)} and entity = 'companies');
--   delete from auth.users
--    where id in (select entity_id from public.seed_content
--                  where batch = {quote(BATCH)} and entity = 'profiles');
--   delete from public.seed_content where batch = {quote(BATCH)};
--   commit;
--
-- Deleting the auth user cascades to the profile, and the profile cascades to
-- its service areas. No real professional is touched: every id comes from the
-- register, and the register only ever held these rows.
-- ---------------------------------------------------------------------------""")

    out = Path("supabase/migrations/0084_professionals_seed.sql")
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {out} — {len(WORKERS)} workers, {len(FIRMS)} firms")


if __name__ == "__main__":
    main()
