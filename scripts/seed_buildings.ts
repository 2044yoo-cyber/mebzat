/**
 * Buildings across Addis, so the city map has something to discover.
 *
 *   npx tsx --env-file=.env.local scripts/seed_buildings.ts
 *   npx tsx --env-file=.env.local scripts/seed_buildings.ts --undo
 *
 * Five per category across thirteen categories: sixty-five buildings, each
 * with a handful of its units actually listed. A building declares how many
 * units it has; only some of them are on the market, which is the normal case
 * and the reason total_units is a column rather than a count of rows.
 *
 * Every row is written with is_sample = true. Nothing in the interface says
 * "demo" — these are meant to read as ordinary listings — but the flag is what
 * makes them removable in one statement later, and what keeps them separable
 * from the first real building somebody lists.
 */

import { adminClient, requireTables, type Admin } from "./lib/admin.ts";
import { buildingCover } from "./lib/images.ts";
import { makeRng, pick, intBetween, chance } from "./lib/rng.ts";

type Category = {
  id: string;
  floors: [number, number];
  type: string;
  names: string[];
  unitsPer: [number, number];
};

/** Real sub-cities, with the coordinates the city actually sits at. */
const AREAS: { name: string; lat: number; lon: number }[] = [
  { name: "Bole", lat: 8.9945, lon: 38.7896 },
  { name: "Kazanchis", lat: 9.0155, lon: 38.7644 },
  { name: "Piassa", lat: 9.0353, lon: 38.7508 },
  { name: "CMC", lat: 9.0208, lon: 38.8261 },
  { name: "Ayat", lat: 9.0166, lon: 38.8664 },
  { name: "Summit", lat: 8.9820, lon: 38.8420 },
  { name: "Gerji", lat: 9.0031, lon: 38.8107 },
  { name: "Sarbet", lat: 8.9931, lon: 38.7462 },
  { name: "Megenagna", lat: 9.0206, lon: 38.8018 },
  { name: "Lebu", lat: 8.9391, lon: 38.7167 },
  { name: "Jemo", lat: 8.9455, lon: 38.7010 },
  { name: "Kolfe", lat: 9.0192, lon: 38.7000 },
  { name: "Old Airport", lat: 8.9878, lon: 38.7355 },
];

const CATEGORIES: Category[] = [
  { id: "g0", floors: [1, 1], type: "house", unitsPer: [1, 1],
    names: ["Woreda 07 Villa", "Kebele Row House", "Enyi Family Home", "Shiromeda Cottage", "Ferensay Bungalow"] },
  { id: "g1", floors: [2, 2], type: "house", unitsPer: [1, 2],
    names: ["Adwa Duplex", "Bisrate Gabriel House", "Haya Hulet Twin", "Gulele Terrace", "Kotebe Duplex"] },
  { id: "g2", floors: [3, 3], type: "apartment", unitsPer: [4, 8],
    names: ["Selam Court", "Abyssinia Residence", "Tikur Anbessa Court", "Yeka Terrace", "Meskel Court"] },
  { id: "g3", floors: [4, 4], type: "apartment", unitsPer: [8, 14],
    names: ["Ras Mekonnen Apartments", "Zewditu Court", "Ambo Residence", "Nile Court", "Arat Kilo Apartments"] },
  { id: "g4", floors: [5, 5], type: "apartment", unitsPer: [10, 20],
    names: ["Entoto View", "Shola Residence", "Gotera Apartments", "Bisrat Court", "Lideta Residence"] },
  { id: "g5", floors: [6, 9], type: "apartment", unitsPer: [18, 40],
    names: ["Adarash Towers", "Wollo Sefer Residence", "Zefmesh Court", "Meri Luke Apartments", "Bethel Heights"] },
  { id: "apartment", floors: [6, 12], type: "apartment", unitsPer: [24, 64],
    names: ["Sunrise Apartments", "Awash Residence", "Rift Valley Court", "Blue Nile Apartments", "Tana Residence"] },
  { id: "highrise", floors: [14, 26], type: "apartment", unitsPer: [70, 160],
    names: ["Addis Skyline", "Meskel Tower", "Unity Heights", "Sheger Tower", "Enat Tower"] },
  { id: "villa", floors: [2, 3], type: "villa", unitsPer: [1, 1],
    names: ["Bole Rwanda Villa", "Old Airport Villa", "Kebena Garden Villa", "Sarbet Hill Villa", "Ayat Estate Villa"] },
  { id: "commercial", floors: [3, 8], type: "commercial", unitsPer: [6, 30],
    names: ["Dembel Trade Centre", "Getu Commercial", "Zefmesh Grand Mall", "Bole Medhanialem Plaza", "Merkato Trade House"] },
  { id: "office", floors: [6, 16], type: "office", unitsPer: [12, 50],
    names: ["Nani Business Centre", "Flamingo Office Park", "Kazanchis Business Hub", "Ethio Business Tower", "Bole Office Court"] },
  { id: "hotel", floors: [5, 15], type: "hotel", unitsPer: [40, 180],
    names: ["Abyssinia Grand Hotel", "Entoto View Hotel", "Sheger Suites", "Adot Hotel & Suites", "Ras Hotel Annex"] },
  { id: "mixed", floors: [8, 18], type: "mixed_use", unitsPer: [30, 90],
    names: ["Century Mall Residences", "Morning Star Complex", "Zemen Mixed Use", "Bole Atlas Complex", "Edna Mall Court"] },
];

const STATUSES = [
  { status: "unfinished", percent: [5, 25] },
  { status: "under_construction", percent: [25, 60] },
  { status: "structure_complete", percent: [60, 75] },
  { status: "finishing", percent: [75, 95] },
  { status: "completed", percent: [100, 100] },
  { status: "furnished", percent: [100, 100] },
] as const;

async function main() {
  const admin = adminClient();
  await requireTables(admin, ["properties", "buildings", "cities", "companies"]);

  if (process.argv.includes("--undo")) return undo(admin);

  // A fixed seed, so re-running after an --undo lays the city out the same
  // way rather than shuffling every building to a new corner.
  const rng = makeRng(20260904);

  const { data: city } = await admin
    .from("cities").select("id").ilike("slug", "addis%").limit(1).maybeSingle();
  const { data: owner } = await admin
    .from("profiles").select("id").limit(1).maybeSingle();
  const { data: companies } = await admin
    .from("companies").select("id").limit(12);

  if (!owner) {
    console.error("No profile to own the buildings. Run the main seed first.");
    process.exit(1);
  }

  let created = 0;
  let units = 0;

  for (const category of CATEGORIES) {
    for (const name of category.names) {
      const area = pick(rng, AREAS);
      const state = pick(rng, STATUSES);
      const floors = intBetween(rng, category.floors[0], category.floors[1]);
      const total = intBetween(rng, category.unitsPer[0], category.unitsPer[1]);

      // Scattered around the area rather than stacked on its centre: thirteen
      // buildings on one point would be a cluster, not a city.
      const latitude = area.lat + (rng() - 0.5) * 0.02;
      const longitude = area.lon + (rng() - 0.5) * 0.02;

      const { data: building, error } = await admin
        .from("buildings")
        .insert({
          code: "",
          name,
          city_id: city?.id ?? null,
          owner_id: owner.id,
          // Two thirds have a developer; the rest are unclaimed, which is the
          // state the claim flow exists for.
          company_id: companies?.length && chance(rng, 0.66)
            ? pick(rng, companies).id : null,
          building_type: category.type as never,
          construction_status: state.status as never,
          completion_percent: intBetween(rng, state.percent[0], state.percent[1]),
          floors,
          total_units: total,
          sub_city: area.name,
          neighbourhood: area.name,
          latitude,
          longitude,
          cover_image_url: buildingCover(category.type, floors, name),
          is_sample: true,
        })
        .select("id, code")
        .single();

      if (error || !building) {
        console.error(`  ${name}: ${error?.message}`);
        continue;
      }
      created += 1;

      // A few of its units on the market, not all of them.
      const listed = Math.min(total, intBetween(rng, 2, 6));
      for (let i = 0; i < listed; i += 1) {
        const forRent = chance(rng, 0.45);
        const bedrooms = category.type === "office" || category.type === "commercial"
          ? null : intBetween(rng, 1, 4);
        const area_m2 = intBetween(rng, 55, 260);
        const price = forRent
          ? intBetween(rng, 12, 90) * 1000
          : intBetween(rng, 28, 190) * 100000;

        const floor = intBetween(rng, 0, Math.max(0, floors - 1));
        const { error: unitError } = await admin.from("properties").insert({
          owner_id: owner.id,
          city_id: city?.id ?? null,
          building_id: building.id,
          floor_number: floor,
          unit_number: String(i + 1).padStart(2, "0"),
          title: `${bedrooms ? `${bedrooms} Bedroom ` : ""}${category.type === "office" ? "Office" : category.type === "commercial" ? "Retail Space" : "Unit"} at ${name}`,
          slug: `${building.code.toLowerCase()}-u${i + 1}`,
          property_type: category.type as never,
          listing_kind: (forRent ? "rent" : "sale") as never,
          price,
          currency: "ETB",
          price_period: forRent ? "month" : null,
          bedrooms,
          bathrooms: bedrooms ? Math.max(1, bedrooms - 1) : 1,
          area_m2,
          floors,
          construction_status: state.status as never,
          completion_percent: intBetween(rng, state.percent[0], state.percent[1]),
          furnishing: (state.status === "furnished" ? "furnished" : "unfurnished") as never,
          sub_city: area.name,
          neighbourhood: area.name,
          location_country: "Ethiopia",
          latitude,
          longitude,
          display_latitude: latitude,
          display_longitude: longitude,
          cover_image_url: buildingCover(category.type, floors, `${name}-${i}`),
          status: "available" as never,
          is_sample: true,
        });
        if (!unitError) units += 1;
      }
    }
  }

  console.log(`\n  ${created} buildings, ${units} listed units.`);
  console.log(`  Undo: npx tsx --env-file=.env.local scripts/seed_buildings.ts --undo\n`);
}

async function undo(admin: Admin) {
  const { data: buildings } = await admin
    .from("buildings").select("id").eq("is_sample", true);

  const ids = (buildings ?? []).map((b) => b.id);
  if (ids.length === 0) {
    console.log("Nothing to undo.");
    return;
  }

  // Units first: a property still pointing at a building would survive the
  // delete with a dangling reference set to null and no way to tell it apart.
  const { count } = await admin
    .from("properties")
    .delete({ count: "exact" })
    .in("building_id", ids)
    .eq("is_sample", true);

  await admin.from("buildings").delete().eq("is_sample", true);
  console.log(`Removed ${ids.length} buildings and ${count ?? 0} units.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
