/**
 * One demo building, so the map grouping can actually be seen.
 *
 *   npx tsx --env-file=.env.local scripts/demo_building.ts
 *   npx tsx --env-file=.env.local scripts/demo_building.ts --undo
 *
 * Attaches five existing *sample* listings to a new building rather than
 * inventing five more: the dataset already has 150 demo properties and adding
 * to it to demonstrate a feature leaves litter that looks like real data
 * later.
 *
 * Fully reversible. The original coordinates of every listing it touches are
 * written into the building's description before anything is changed, so
 * --undo can put them back exactly — including on a different machine, or
 * after this terminal is gone.
 */

import { adminClient, requireTables } from "./lib/admin.ts";

const BUILDING_NAME = "Sunrise Apartments (demo)";
const UNIT_COUNT = 5;

type Saved = { id: string; lat: number | null; lon: number | null };

async function main() {
  const admin = adminClient();
  await requireTables(admin, ["properties", "buildings"]);

  const undo = process.argv.includes("--undo");

  const { data: existing } = await admin
    .from("buildings")
    .select("id, code, description")
    .eq("name", BUILDING_NAME)
    .maybeSingle();

  if (undo) {
    if (!existing) {
      console.log("Nothing to undo — no demo building found.");
      return;
    }

    let saved: Saved[] = [];
    try {
      saved = JSON.parse(existing.description ?? "[]") as Saved[];
    } catch {
      console.error("Could not read the saved coordinates. Detaching anyway.");
    }

    for (const row of saved) {
      await admin
        .from("properties")
        .update({
          building_id: null,
          unit_number: null,
          floor_number: null,
          // Both columns are NOT NULL, so a missing saved value means leave
          // it alone rather than write null and fail the whole restore.
          latitude: row.lat ?? undefined,
          longitude: row.lon ?? undefined,
          display_latitude: row.lat,
          display_longitude: row.lon,
        })
        .eq("id", row.id);
    }

    await admin.from("buildings").delete().eq("id", existing.id);
    console.log(`Undone. ${saved.length} listings put back where they were.`);
    return;
  }

  if (existing) {
    console.log(`Already set up: ${existing.code}. Run with --undo first to redo it.`);
    return;
  }

  // Sample rows only, and only ones not already in a building.
  const { data: units, error } = await admin
    .from("properties")
    .select("id, owner_id, city_id, latitude, longitude, title")
    .eq("is_sample", true)
    .is("building_id", null)
    .limit(UNIT_COUNT);

  if (error || !units || units.length < 2) {
    console.error("Need at least two unattached sample properties. Found:", units?.length ?? 0);
    process.exit(1);
  }

  const anchor = units[0];
  const saved: Saved[] = units.map((u) => ({
    id: u.id,
    lat: u.latitude,
    lon: u.longitude,
  }));

  const { data: building, error: buildingError } = await admin
    .from("buildings")
    .insert({
      // The before-insert trigger replaces an empty code with the generated
      // one; it tests for "" precisely so a caller need not know the format.
      code: "",
      name: BUILDING_NAME,
      city_id: anchor.city_id,
      owner_id: anchor.owner_id,
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      floors: 10,
      building_type: "apartment",
      // The undo data. Kept on the row rather than in a file so the reversal
      // survives this machine.
      description: JSON.stringify(saved),
    })
    .select("id, code")
    .single();

  if (buildingError || !building) {
    console.error("Could not create the building:", buildingError?.message);
    process.exit(1);
  }

  // Spread across floors so the building page has more than one heading, and
  // pin every unit to the building's exact coordinate — which is the condition
  // the grouping exists to handle.
  let floor = 10;
  for (const unit of units) {
    await admin
      .from("properties")
      .update({
        building_id: building.id,
        floor_number: floor,
        unit_number: "01",
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        display_latitude: anchor.latitude,
        display_longitude: anchor.longitude,
      })
      .eq("id", unit.id);
    floor -= 2;
  }

  const { data: coded } = await admin
    .from("properties")
    .select("unit_code")
    .eq("building_id", building.id)
    .order("unit_code");

  console.log(`\nBuilding created: ${building.code}`);
  console.log(`  ${units.length} units at ${anchor.latitude}, ${anchor.longitude}`);
  for (const row of coded ?? []) console.log(`  ${row.unit_code}`);
  console.log(`\n  Map:      /city  — one marker, not ${units.length}`);
  console.log(`  Building: /building/${building.code}`);
  console.log(`\n  Undo:     npx tsx --env-file=.env.local scripts/demo_building.ts --undo\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
