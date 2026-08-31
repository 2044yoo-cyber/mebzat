/**
 * Colouring markers by price.
 *
 *   npm run check:bands
 *
 * One property matters more than the rest: **a dearer listing is never given a
 * cheaper band.** Everything else here is presentation; that one is a claim
 * about the market made in colour, and getting it backwards would tell somebody
 * the expensive side of town is the cheap side.
 *
 * The second is that the scale comes from the data. A hard-coded ladder looks
 * identical on today's demo set and is wrong the first time somebody filters.
 */

import { readFileSync } from "node:fs";

import {
  BAND_STYLES,
  bandFor,
  buildPriceScale,
  FIXED_THRESHOLDS,
  legendRows,
  MIN_SAMPLE_FOR_PERCENTILES,
  PRICE_BANDS,
  scaleKindFor,
} from "../src/lib/map/price-bands.ts";
import { shortPrice } from "../src/lib/constants/properties.ts";

const GREEN = "[32m";
const RED = "[31m";
const DIM = "[2m";
const RESET = "[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * The actual hundred demo rents, read from the seed CSV.
 *
 * Not a synthetic curve. The first version of this check invented a
 * distribution and asserted the brief's example against it — ETB 220K came out
 * "high" rather than "highest", which said nothing about the product and
 * everything about the curve I had made up. The real data answers the real
 * question.
 */
const rents = readFileSync(
  "supabase/seed/rental-demo/medosha_100_demo_rentals.csv",
  "utf8",
)
  .split("\n")
  .slice(1)
  .filter((line) => line.trim())
  .map((line) => Number(line.split(",")[6]))
  .filter((rent) => Number.isFinite(rent) && rent > 0);

// ---------------------------------------------------------------------------
// 1. Monotonicity
// ---------------------------------------------------------------------------

check("the hundred demo rents were read", rents.length === 100, `${rents.length}`);

const scale = buildPriceScale(rents, "rent");

// Sorted before the walk. The CSV is in listing order, so comparing
// consecutive rows unsorted compares two unrelated flats and reports an
// inversion for every step down the file — which is what the first version of
// this did, and it looked exactly like a broken banding function.
const ascending = [...rents].sort((a, b) => a - b);

let inversions = 0;
for (let i = 1; i < ascending.length; i += 1) {
  const previous = PRICE_BANDS.indexOf(bandFor(ascending[i - 1], scale)!);
  const current = PRICE_BANDS.indexOf(bandFor(ascending[i], scale)!);
  if (current < previous) inversions += 1;
}

check("a dearer listing never gets a cheaper band", inversions === 0, `${inversions} inversions`);

// Across the whole plausible range, not only the sample it was built from.
let rangeInversions = 0;
let lastRank = -1;
for (let price = 1_000; price <= 1_000_000; price += 1_000) {
  const rank = PRICE_BANDS.indexOf(bandFor(price, scale)!);
  if (rank < lastRank) rangeInversions += 1;
  lastRank = rank;
}
check("and that holds for prices outside the sample", rangeInversions === 0);

// ---------------------------------------------------------------------------
// 2. The brief's own examples
// ---------------------------------------------------------------------------

check(
  "ETB 220K/mo is at the top of the demo market",
  bandFor(220_000, scale) === "highest",
  `${bandFor(220_000, scale)}`,
);
check(
  "ETB 22K/mo is at the bottom",
  bandFor(22_000, scale) === "lowest",
  `${bandFor(22_000, scale)}`,
);
check(
  "and the marker still says the exact rent",
  shortPrice(220_000, "ETB", "month") === "ETB 220K/mo",
  shortPrice(220_000, "ETB", "month"),
);
check(
  "a sale says a price, not a rate",
  shortPrice(35_000_000, "ETB") === "ETB 35M",
  shortPrice(35_000_000, "ETB"),
);

// ---------------------------------------------------------------------------
// 3. Every band is used, and roughly a fifth each
//
// The point of quintiles. Equal-width buckets on this distribution would put
// most of the hundred in one colour, which is the failure that makes a
// heat-coloured map useless.
// ---------------------------------------------------------------------------

const counts = new Map(PRICE_BANDS.map((band) => [band, 0]));
for (const rent of rents) {
  const band = bandFor(rent, scale)!;
  counts.set(band, (counts.get(band) ?? 0) + 1);
}

check("the scale is computed, not fixed", scale.basis === "percentile", scale.basis);
check("every band is used", [...counts.values()].every((n) => n > 0),
  [...counts].map(([b, n]) => `${b}:${n}`).join(" "));
check(
  "and each holds roughly a fifth",
  [...counts.values()].every((n) => n >= 12 && n <= 28),
  [...counts].map(([b, n]) => `${b}:${n}`).join(" "),
);

// ---------------------------------------------------------------------------
// 4. The scale follows the filter
//
// The requirement that makes this dynamic rather than decorative: filter to
// the cheap end and the cheap end must spread across all five colours again.
// ---------------------------------------------------------------------------

const underEighty = ascending.filter((rent) => rent <= 80_000);
const filtered = buildPriceScale(underEighty, "rent");

check(
  "filtering recomputes the thresholds",
  filtered.thresholds[3]! < scale.thresholds[3]!,
  `${filtered.thresholds[3]} vs ${scale.thresholds[3]}`,
);
check(
  "a listing that was cheap becomes dear when only cheap ones are shown",
  PRICE_BANDS.indexOf(bandFor(underEighty.at(-1)!, filtered)!) >
    PRICE_BANDS.indexOf(bandFor(underEighty.at(-1)!, scale)!),
  `${bandFor(underEighty.at(-1)!, filtered)} vs ${bandFor(underEighty.at(-1)!, scale)}`,
);
check(
  "and the filtered set still uses every colour",
  new Set(underEighty.map((rent) => bandFor(rent, filtered))).size === 5,
  `${new Set(underEighty.map((rent) => bandFor(rent, filtered))).size} bands`,
);

// ---------------------------------------------------------------------------
// 5. Too little data
// ---------------------------------------------------------------------------

const few = buildPriceScale([25_000, 40_000, 90_000], "rent");
check("three listings do not get quintiles", few.basis === "fixed", few.basis);
check(
  "they get the rent ladder",
  JSON.stringify(few.thresholds) === JSON.stringify(FIXED_THRESHOLDS.rent),
);
check("and are still banded", bandFor(25_000, few) !== null && bandFor(90_000, few) !== null);
check(
  "the fixed ladder still orders them correctly",
  PRICE_BANDS.indexOf(bandFor(90_000, few)!) > PRICE_BANDS.indexOf(bandFor(25_000, few)!),
);

check("an empty map has no scale to show", buildPriceScale([], "rent").basis === "none");
check(
  "and asks for nothing when there is nothing",
  bandFor(null, buildPriceScale([], "rent")) === null,
);

// Forty identical rents cannot make five bands. The thresholds collapse, and
// silently keeping them would leave colours no listing can ever have.
const flat = buildPriceScale(Array.from({ length: 40 }, () => 25_000), "rent");
check("identical prices fall back rather than collapsing", flat.basis === "fixed", flat.basis);
check(
  "and the sample size is still reported honestly",
  flat.sampleSize === 40,
  `${flat.sampleSize}`,
);

// Just over the threshold, quintiles are allowed again.
const enough = buildPriceScale(
  Array.from({ length: MIN_SAMPLE_FOR_PERCENTILES }, (_, i) => 10_000 + i * 5_000),
  "rent",
);
check(
  `${MIN_SAMPLE_FOR_PERCENTILES} distinct listings are enough for percentiles`,
  enough.basis === "percentile",
  enough.basis,
);

// ---------------------------------------------------------------------------
// 6. Rent and sale are separate scales
// ---------------------------------------------------------------------------

check("rent uses the rent ladder", scaleKindFor("rent") === "rent");
check("lease counts as rent", scaleKindFor("lease") === "rent");
check("sale uses the sale ladder", scaleKindFor("sale") === "sale");
check("auction counts as sale", scaleKindFor("auction") === "sale");

const sales = Array.from({ length: 50 }, (_, i) => 4_300_000 + i * 3_000_000);
const saleScale = buildPriceScale(sales, "sale");
check(
  "a sale scale is built from sale prices",
  saleScale.thresholds[0]! > 1_000_000,
  `${saleScale.thresholds[0]}`,
);
check(
  "a monthly rent inside a sale scale would read as the cheapest",
  bandFor(45_000, saleScale) === "lowest",
  "which is why the two are never mixed",
);

// ---------------------------------------------------------------------------
// 7. Nulls and nonsense
// ---------------------------------------------------------------------------

for (const value of [null, undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
  check(`${String(value)} has no band`, bandFor(value as number | null, scale) === null);
}
check(
  "a price on request does not drag the bottom band down",
  buildPriceScale([null, undefined, 0, 30_000, 40_000], "rent").min === 30_000,
);
check(
  "and is not counted in the sample",
  buildPriceScale([null, 0, 30_000, 40_000], "rent").sampleSize === 2,
);

// ---------------------------------------------------------------------------
// 8. Not colour alone
// ---------------------------------------------------------------------------

check(
  "each band carries a different number of bars",
  new Set(PRICE_BANDS.map((band) => BAND_STYLES[band].bars)).size === 5,
);
check(
  "and the bars rise with the price",
  PRICE_BANDS.every((band, index) =>
    index === 0 ? true : BAND_STYLES[band].bars > BAND_STYLES[PRICE_BANDS[index - 1]!].bars,
  ),
);
check(
  "every band has a readable label",
  PRICE_BANDS.every((band) => BAND_STYLES[band].label.length > 0),
);
check(
  "the top of the market gets the strongest ring",
  BAND_STYLES.highest.ring.includes("0.75"),
  BAND_STYLES.highest.ring,
);

// ---------------------------------------------------------------------------
// 9. The legend
// ---------------------------------------------------------------------------

const rows = legendRows(scale);
check("the legend has five rows", rows.length === 5);
check("strongest first", rows[0]?.band === "highest" && rows[4]?.band === "lowest");
check("the bottom row is open-ended below", rows[4]?.from === null);
check("the top row is open-ended above", rows[0]?.to === null);
check(
  "and the bounds ascend",
  rows
    .slice()
    .reverse()
    .every((row, index, all) =>
      index === 0 ? true : (row.from ?? 0) >= (all[index - 1]!.from ?? 0),
    ),
);

// ---------------------------------------------------------------------------
// 10. The marker and the canvas
//
// Read as files. The rule the brief states most firmly — the colour is an
// addition, never a replacement — is a property of the DOM the marker builds,
// and a check that only exercised the maths would pass while the price
// vanished from the pin.
// ---------------------------------------------------------------------------

const markerSource = readFileSync("src/lib/map/markers.ts", "utf8");
const canvasSource = readFileSync("src/components/property/city-canvas.tsx", "utf8");

check(
  "the marker still writes the price as its text",
  /button\.textContent = shortPrice\(/.test(markerSource),
  "the colour has replaced the price",
);
check(
  "the price ring is drawn outside the pill, not over it",
  canvasSource.includes("0 0 0 3px var(--marker-ring)") &&
    canvasSource.includes("0 0 0 4px var(--marker-ring)"),
  "an inset or background ring would cover the price",
);
check(
  "the marker carries its band for styling and for tests",
  markerSource.includes("wrapper.dataset.band = band"),
);
check(
  "and says the band in words for a screen reader",
  markerSource.includes("price in the current results"),
);
check(
  "the level bars are hidden from screen readers, since the label says it",
  /level\.setAttribute\("aria-hidden", "true"\)/.test(markerSource),
);

// The scale must come from the displayed set and be recomputed only when it
// changes — the performance requirement, and the correctness one, in one line.
check(
  "the scale is memoised on the displayed properties",
  /useMemo\(\(\) => \{[\s\S]*?\}, \[properties\]\)/.test(canvasSource),
  "recomputed on every render, or not recomputed when the filter changes",
);
check(
  "rent and sale are scaled separately",
  canvasSource.includes('buildPriceScale(') &&
    canvasSource.match(/buildPriceScale\(/g)!.length === 2,
  "one scale over both would make every rental the cheapest thing on the map",
);
check(
  "a marker whose band changed is rebuilt, not left with the old colour",
  canvasSource.includes("dataset.band ?? \"\") === (band ?? \"\")") ||
    /dataset\.band[\s\S]{0,80}existing\.remove\(\)/.test(canvasSource),
  "filtering would recolour the legend but not the markers",
);
check(
  "a cluster whose price mix changed is rebuilt too",
  /dataset\.mix[\s\S]{0,120}already\.remove\(\)/.test(canvasSource),
);
check(
  "the cluster count sits above the mix ring",
  markerSource.includes("medosha-cluster__count"),
  "a conic ring would cover the number",
);

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
}

console.log(
  `\n${failures.length === 0 ? GREEN : RED}${passed} passed, ${failures.length} failed${RESET}` +
    `\n${DIM}price bands: the scale comes from what is on screen${RESET}\n`,
);

process.exit(failures.length === 0 ? 0 : 1);
