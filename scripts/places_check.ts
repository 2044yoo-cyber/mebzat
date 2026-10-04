/**
 * The place directory, and the migration that has to agree with it.
 *
 *   npx tsx scripts/places_check.ts
 *
 * ## What was wrong
 *
 * `location_areas` held 41 rows, every one of them an Addis neighbourhood that
 * the *property map* had needed a pin for. Ayertena was not among them, nor was
 * Piassa, nor Merkato, nor any town outside the capital — so "where are you
 * based" was a question a large part of the country could not answer. The
 * dropdown it fed was 41 items long and unsearchable, which is the other half
 * of the same complaint.
 *
 * ## What this file is guarding
 *
 * Two things, and the second is the one that will break.
 *
 * The **ranking**, because a plain substring match puts "Bole Wollo Sefer"
 * above "Bole" for the query "bol" and "Addisu Gebeya" above "Addis Ababa" for
 * "addi". Those are the examples the brief gave, and they are here as
 * assertions rather than as a comment.
 *
 * The **agreement** between `places.ts` and `0085_places.sql`, because the
 * directory now exists in two places — TypeScript for the picker, SQL for the
 * service-area rows — and a list kept in two places drifts. The same thing has
 * already happened once in this repository between the gazetteer and the
 * Python seed generator, which is why `property-map-check.ts` compares those
 * two line for line as well.
 */

import { readFileSync } from "node:fs";

import { knownNeighbourhoods } from "../src/lib/location/addis-neighbourhoods.ts";
import {
  PLACES,
  SERVICE_AREA_PLACES,
  findPlace,
  isPlausiblePlace,
  placeSlug,
  searchPlaces,
} from "../src/lib/location/places.ts";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const first = (query: string) => searchPlaces(query, { limit: 5 })[0]?.name ?? "";
const names = (query: string) =>
  searchPlaces(query, { limit: 8 }).map((place) => place.name);

// ---------------------------------------------------------------------------
// 1. The list is whole and has no duplicates
// ---------------------------------------------------------------------------

{
  const slugs = PLACES.map((place) => place.slug);
  check(
    "every slug is unique",
    new Set(slugs).size === slugs.length,
    slugs.filter((slug, i) => slugs.indexOf(slug) !== i).join(", "),
  );

  const displayed = PLACES.map((place) => place.name);
  check(
    "and no name is offered twice",
    new Set(displayed).size === displayed.length,
    // Addis Ababa, Dire Dawa and Gambela are each a city and a region. Both
    // rows are true and one of them has to lose, or the picker shows the name
    // twice and looks broken.
    displayed.filter((name, i) => displayed.indexOf(name) !== i).join(", "),
  );

  const sorted = [...PLACES].sort((a, b) => a.name.localeCompare(b.name));
  check(
    "the list is alphabetical before anybody sorts it",
    PLACES.every((place, i) => place.name === sorted[i]!.name),
    "sorting once, here, is what stops two callers disagreeing about the order",
  );

  check(
    "every slug is derivable from its name",
    PLACES.every(
      (place) =>
        place.slug === placeSlug(place.name) ||
        place.slug === `region-${placeSlug(place.name)}`,
    ),
  );
}

// ---------------------------------------------------------------------------
// 2. The map's gazetteer is included, not copied
//
// A neighbourhood added for the map has to appear in the directory without
// anybody remembering to add it twice.
// ---------------------------------------------------------------------------

for (const area of knownNeighbourhoods()) {
  const place = PLACES.find((entry) => entry.name === area.name);
  check(
    `${area.name} reaches the directory from the gazetteer`,
    place !== undefined &&
      place.latitude === area.latitude &&
      place.longitude === area.longitude,
    "imported, so this can only fail if the import was replaced by a copy",
  );
}

// ---------------------------------------------------------------------------
// 3. Ayertena, and the rest of the country
// ---------------------------------------------------------------------------

{
  const ayertena = PLACES.find((place) => place.name === "Ayertena");
  check("Ayertena is on the list", ayertena !== undefined);
  check(
    "and it is in Kolfe Keranyo",
    ayertena?.parent === "Kolfe Keranyo",
    ayertena?.parent ?? "missing",
  );

  check(
    "the directory reaches outside Addis Ababa",
    PLACES.filter((place) => place.kind === "city" && place.name !== "Addis Ababa")
      .length >= 30,
    `${PLACES.filter((p) => p.kind === "city").length} cities`,
  );
  check(
    "and knows the regions",
    PLACES.some((place) => place.name === "Oromia" && place.kind === "region") &&
      PLACES.some((place) => place.name === "Tigray" && place.kind === "region"),
  );
  check(
    "a region is not offered as a service area",
    SERVICE_AREA_PLACES.every((place) => place.kind !== "region") &&
      SERVICE_AREA_PLACES.length < PLACES.length,
    "a service area is somewhere you travel to for one job; a region is not",
  );
}

// ---------------------------------------------------------------------------
// 4. The three examples from the brief
// ---------------------------------------------------------------------------

check("typing 'aye' suggests Ayertena", first("aye") === "Ayertena", first("aye"));
check("typing 'bol' suggests Bole", first("bol") === "Bole", first("bol"));
check(
  "typing 'addi' suggests Addis Ababa",
  first("addi") === "Addis Ababa",
  first("addi"),
);

check(
  "'bol' offers the Bole areas under Bole itself",
  names("bol").slice(1).some((name) => name.startsWith("Bole ")),
  names("bol").join(", "),
);
check(
  "'addi' still offers Addis Ketema and Addisu Gebeya",
  names("addi").includes("Addis Ketema") && names("addi").includes("Addisu Gebeya"),
  names("addi").join(", "),
);

// The two queries where ranking and alphabetical order disagree. Without them
// every tier above "contains" can be deleted and the brief's three examples
// still pass, because in those three the best answer happens to sort first
// anyway.
check(
  "a name you are spelling beats a name that merely contains those letters",
  first("ki") === "Arat Kilo",
  `${first("ki")} — alphabetically "Akaki Kality" comes first, and it is not what "ki" means`,
);
check(
  "and the exact name beats both",
  first("kality") === "Kality",
  `${first("kality")} — "Akaki Kality" sorts earlier and is still not the answer`,
);
check(
  "a name beats a sub-city that happens to contain the same letters",
  first("eka") === "Yeka",
  `${first("eka")} — every place in Yeka matches too, and "22 Area" sorts first`,
);

// ---------------------------------------------------------------------------
// 5. How the matching behaves
// ---------------------------------------------------------------------------

check("matching ignores case", first("AYE") === "Ayertena", first("AYE"));
check(
  "a word inside a name matches",
  names("medhanialem").includes("Bole Medhanialem"),
  names("medhanialem").join(", "),
);
check(
  "a sub-city finds what is in it",
  names("kolfe").includes("Ayertena"),
  "typing a district should not come back with only the district",
);
check(
  "but the district itself comes first",
  first("kolfe") === "Kolfe Keranyo",
  first("kolfe"),
);
check(
  "searching finds a place by a spelling it is not filed under",
  first("nazret") === "Adama" && first("piazza") === "Piassa",
  `${first("nazret")}, ${first("piazza")}`,
);
check(
  "and an exact alias is not beaten by a name that happens to contain the letters",
  first("debre zeit") === "Bishoftu",
  first("debre zeit"),
);
check(
  "a spelling nobody standardised still lands",
  findPlace("Ayer Tena")?.name === "Ayertena" &&
    findPlace("Debre Zeit")?.name === "Bishoftu" &&
    findPlace("Nazret")?.name === "Adama",
);
check(
  "an empty query offers the start of the list rather than nothing",
  searchPlaces("", { limit: 5 }).length === 5,
  "a picker that goes blank until the first keystroke hides that there is anything to pick",
);
check(
  "a query that matches nothing returns nothing",
  searchPlaces("qqzzxx").length === 0,
);
check(
  "the limit is honoured",
  searchPlaces("a", { limit: 3 }).length === 3,
);
check(
  "kinds can be narrowed",
  searchPlaces("", { limit: 100, kinds: ["city"] }).every(
    (place) => place.kind === "city",
  ),
);

// ---------------------------------------------------------------------------
// 6. Adding a place that is not on the list
// ---------------------------------------------------------------------------

check(
  "a real name that is missing can still be added",
  isPlausiblePlace("Chelelektu") && isPlausiblePlace("Kebele 08"),
);
check(
  "but not a single letter, a sentence, or markup",
  !isPlausiblePlace("a") &&
    !isPlausiblePlace("<script>alert(1)</script>") &&
    !isPlausiblePlace("   ") &&
    !isPlausiblePlace("x".repeat(81)),
  "otherwise it is a free-text field under a different name",
);

// ---------------------------------------------------------------------------
// 7. The migration says the same thing
//
// Compared as text, because that is the only way to read SQL from here — and
// it is the drift that matters, not the mechanism.
// ---------------------------------------------------------------------------

{
  const sql = readFileSync("supabase/migrations/0085_places.sql", "utf8");

  for (const place of SERVICE_AREA_PLACES) {
    const subCity = place.parent === null ? "null" : `'${place.parent}'`;
    const row = `('${place.slug}', '${place.name.replace(/'/g, "''")}', ${subCity}, '${place.city}', '${place.region}', ${place.latitude}, ${place.longitude})`;
    check(
      `${place.name} matches its row in 0085`,
      sql.includes(row),
      `missing or different: ${row}`,
    );
  }

  const sqlSlugs = [...sql.matchAll(/^\s{2}\('([a-z0-9-]+)',/gm)].map((m) => m[1]!);
  check(
    "the migration inserts no place the application does not know",
    sqlSlugs.every((slug) =>
      SERVICE_AREA_PLACES.some((place) => place.slug === slug),
    ),
    sqlSlugs
      .filter((slug) => !SERVICE_AREA_PLACES.some((p) => p.slug === slug))
      .join(", "),
  );
  check(
    "and the two lists are the same length",
    sqlSlugs.length === SERVICE_AREA_PLACES.length,
    `sql ${sqlSlugs.length}, typescript ${SERVICE_AREA_PLACES.length}`,
  );
  check(
    "re-running the migration is free",
    /on conflict \(slug, city, country\) do nothing/.test(sql),
    "without this a second run fails on the natural key",
  );
  check(
    "no row already seeded in 0078 is deleted or renamed",
    !/\bdelete from public\.location_areas\b/.test(sql) &&
      !/\bupdate public\.location_areas\b/.test(sql),
    "an existing professional_service_areas row points at one of those slugs",
  );
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}places: Ayertena is on the list, and "aye" finds it${RESET}`);
