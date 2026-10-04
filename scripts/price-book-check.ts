/**
 * The price book's answers.
 *
 *   npm run check:prices
 *
 * One rule matters more than the rest and is attacked from every direction:
 * **the book never invents a price.** Not when nothing matches, not when the
 * only match is in the wrong unit, not when a material sounds similar. The
 * second rule is that it never overstates one: an unverified figure has to
 * arrive labelled as unverified, every time, whatever route it came by.
 *
 * The database half of this lives in `supabase/tests/price-book.sql`, which
 * attacks the policies and the SQL. This half attacks the arithmetic and the
 * wording, which is where a wrong answer would be plausible enough to ship.
 */

import { readFileSync } from "node:fs";

import {
  isEstimatedSource,
  PRICE_SOURCES,
  sourceLabel,
  sourceRank,
} from "../src/lib/pricing/resolve.ts";
import {
  estimateMessage,
  formatEtb,
  matchPrices,
  NO_PRICE_MESSAGE,
  priceRange,
  resolvePriceQuestion,
  type PriceRecord,
} from "../src/lib/prices/resolve.ts";
import {
  ageInDays,
  confidenceOf,
  isStale,
  PRICE_STATUSES,
  PRICE_STATUS_NOTES,
  statusRank,
  type PriceDataStatus,
} from "../src/lib/prices/status.ts";

const GREEN = "[32m";
const RED = "[31m";
const DIM = "[2m";
const RESET = "[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const NOW = new Date("2026-08-11T00:00:00Z");

let counter = 0;
const price = (over: Partial<PriceRecord> = {}): PriceRecord => ({
  id: `p${(counter += 1)}`,
  category: "Wood & Timber",
  subcategory: "Boards",
  material: "MDF board",
  specification: "18 mm",
  unit: "sheet",
  brand: null,
  cityRegion: "Addis Ababa",
  priceEtb: 7000,
  currency: "ETB",
  vatStatus: "unknown",
  supplier: null,
  source: null,
  priceDate: "2026-08-01",
  dataStatus: "educational_estimate",
  notes: null,
  ...over,
});

// ---------------------------------------------------------------------------
// 1. The trust order
//
// The array's order is the database enum's order. If they disagree, the
// exchange and the AI answer the same question differently and nothing warns
// anybody, so it is pinned here as well as in the SQL suite.
// ---------------------------------------------------------------------------

check(
  "the status list is in the order declared in migration 0041",
  PRICE_STATUSES.join(",") ===
    "expired,educational_estimate,web_sourced,supplier_submitted,admin_verified",
  PRICE_STATUSES.join(","),
);

check(
  "verified outranks everything",
  PRICE_STATUSES.every(
    (status) =>
      status === "admin_verified" ||
      statusRank(status) < statusRank("admin_verified"),
  ),
);

check(
  "an expired price ranks below every live one",
  PRICE_STATUSES.every(
    (status) => status === "expired" || statusRank(status) > statusRank("expired"),
  ),
);

check(
  "every status except the verified one carries a caveat",
  PRICE_STATUSES.every((status) =>
    status === "admin_verified"
      ? PRICE_STATUS_NOTES[status] === null
      : (PRICE_STATUS_NOTES[status]?.length ?? 0) > 0,
  ),
);

// ---------------------------------------------------------------------------
// 2. Nothing matches
//
// The failure that matters. A book that answers "about seven thousand" when it
// holds nothing is worse than no book.
// ---------------------------------------------------------------------------

const empty = resolvePriceQuestion({ material: "MDF 18mm", unit: "sheet" }, []);
check("an empty book answers with nothing", empty.kind === "none");
check("and no figure at all", empty.best === null);
check("and says the brief's words", empty.message === NO_PRICE_MESSAGE, empty.message);
check("and offers no range to draw", empty.range === null);
check("and claims no confidence", empty.confidence === null);

const unrelated = resolvePriceQuestion(
  { material: "bespoke bronze balustrade", unit: "m" },
  [price(), price({ material: "Cement", unit: "bag", priceEtb: 1100 })],
);
check(
  "a material the book does not hold answers with nothing",
  unrelated.kind === "none",
  `${unrelated.best?.material} ${unrelated.best?.priceEtb}`,
);

// ---------------------------------------------------------------------------
// 3. The wrong unit is not a cheaper answer
//
// ETB 18 is a true price for one block and a catastrophic one for a square
// metre of wall. A book that answers with it has done more damage than one that
// answered nothing.
// ---------------------------------------------------------------------------

const wrongUnit = resolvePriceQuestion(
  { material: "Hollow concrete block 200mm", unit: "m²" },
  [
    price({ material: "Hollow concrete block", specification: "200 mm", unit: "pc", priceEtb: 18 }),
    price({ material: "Hollow concrete block", specification: "200 mm", unit: "pc", priceEtb: 19 }),
  ],
);
check(
  "a per-piece price is never offered for a per-square-metre question",
  wrongUnit.kind === "none",
  `${wrongUnit.best?.priceEtb} per ${wrongUnit.best?.unit}`,
);
check("and the book says so rather than guessing", wrongUnit.message === NO_PRICE_MESSAGE);

// With no unit given, the caller has not claimed one, so nothing is excluded.
const noUnitAsked = resolvePriceQuestion(
  { material: "Hollow concrete block 200mm" },
  [price({ material: "Hollow concrete block", specification: "200 mm", unit: "pc", priceEtb: 18 })],
);
check(
  "but a question that names no unit still gets an answer",
  noUnitAsked.kind === "estimate" && noUnitAsked.best?.priceEtb === 18,
  `${noUnitAsked.kind} ${noUnitAsked.best?.priceEtb}`,
);

// ---------------------------------------------------------------------------
// 4. Trust beats recency
//
// The brief is explicit: status first, newest within status. A baseline typed
// this morning does not outrank a price an administrator verified last month.
// ---------------------------------------------------------------------------

const trustVsDate = resolvePriceQuestion({ material: "MDF 18mm", unit: "sheet" }, [
  price({ priceEtb: 9999, priceDate: "2026-08-10", dataStatus: "educational_estimate" }),
  price({ priceEtb: 7200, priceDate: "2026-07-01", dataStatus: "admin_verified" }),
]);
check(
  "a verified price from last month beats a baseline from this morning",
  trustVsDate.best?.priceEtb === 7200,
  `${trustVsDate.best?.priceEtb} (${trustVsDate.best?.dataStatus})`,
);
check("and is reported as verified", trustVsDate.kind === "verified");

const withinStatus = resolvePriceQuestion({ material: "MDF 18mm", unit: "sheet" }, [
  price({ priceEtb: 6500, priceDate: "2026-06-01", dataStatus: "web_sourced" }),
  price({ priceEtb: 7200, priceDate: "2026-08-01", dataStatus: "web_sourced" }),
]);
check(
  "within one status the newest wins",
  withinStatus.best?.priceEtb === 7200,
  `${withinStatus.best?.priceEtb}`,
);

// The full ladder, one rung at a time.
const ladder: PriceDataStatus[] = [
  "educational_estimate",
  "web_sourced",
  "supplier_submitted",
  "admin_verified",
];
for (let i = 1; i < ladder.length; i += 1) {
  const weaker = ladder[i - 1]!;
  const stronger = ladder[i]!;
  const answer = resolvePriceQuestion({ material: "MDF 18mm", unit: "sheet" }, [
    // The weaker one is newer *and* first in the array, so only trust can win.
    price({ priceEtb: 1, priceDate: "2026-08-10", dataStatus: weaker }),
    price({
      priceEtb: 2,
      priceDate: "2026-01-01",
      dataStatus: stronger,
      ...(stronger === "admin_verified" ? {} : {}),
    }),
  ]);
  check(
    `${stronger} outranks ${weaker}`,
    answer.best?.priceEtb === 2,
    `${answer.best?.priceEtb} (${answer.best?.dataStatus})`,
  );
}

// ---------------------------------------------------------------------------
// 5. Relevance comes before trust
//
// The one place the brief's ordering must not be applied literally. A verified
// price for the wrong material is not a better answer than an unverified price
// for the right one — it is a wrong answer, and quoting it is how somebody ends
// up ordering 150 mm block for a 200 mm wall.
// ---------------------------------------------------------------------------

const wrongMaterial = resolvePriceQuestion(
  { material: "Hollow concrete block 200mm", unit: "m²" },
  [
    price({
      material: "Hollow concrete block",
      specification: "150 mm",
      unit: "m²",
      priceEtb: 31,
      dataStatus: "admin_verified",
      priceDate: "2026-08-10",
    }),
    price({
      material: "Hollow concrete block",
      specification: "200 mm",
      unit: "m²",
      priceEtb: 42,
      dataStatus: "educational_estimate",
      priceDate: "2026-01-01",
    }),
  ],
);
check(
  "a verified 150 mm price does not answer a 200 mm question",
  wrongMaterial.best?.specification === "200 mm",
  `${wrongMaterial.best?.specification} at ${wrongMaterial.best?.priceEtb} (${wrongMaterial.best?.dataStatus})`,
);
check(
  "and the answer is honest that it is only an estimate",
  wrongMaterial.kind === "estimate",
);

// ---------------------------------------------------------------------------
// 6. The wording
//
// Three messages, and each has to be unmistakable. A user who cannot tell a
// verified price from a teaching baseline has not been given a price book, they
// have been given a number.
// ---------------------------------------------------------------------------

const estimate = resolvePriceQuestion({ material: "MDF 18mm", unit: "sheet" }, [
  price({ priceEtb: 7000, dataStatus: "educational_estimate" }),
]);
check(
  "an unverified answer says it has not been verified with a supplier",
  estimate.message.includes("has not yet been verified with a supplier"),
  estimate.message,
);
check(
  "and carries the figure in it",
  estimate.message.includes("7,000"),
  estimate.message,
);
check("and is not called verified", estimate.kind === "estimate");

const verified = resolvePriceQuestion({ material: "MDF 18mm", unit: "sheet" }, [
  price({ priceEtb: 7200, dataStatus: "admin_verified" }),
]);
check(
  "a verified answer never carries the unverified caveat",
  !verified.message.includes("not yet been verified"),
  verified.message,
);

// Every status that is not `admin_verified` must produce the caveat. Written as
// a loop over the list rather than three hand-picked cases, so a status added
// later is covered the day it is added.
for (const status of PRICE_STATUSES) {
  if (status === "admin_verified") continue;
  const answer = resolvePriceQuestion({ material: "MDF 18mm", unit: "sheet" }, [
    price({ priceEtb: 7000, dataStatus: status }),
  ]);
  check(
    `a ${status} price is never presented as verified`,
    answer.kind !== "verified" &&
      answer.message.includes("has not yet been verified with a supplier"),
    `${answer.kind}: ${answer.message}`,
  );
}

check(
  "the estimate wording is the brief's, to the character",
  estimateMessage(7000) ===
    "Initial estimated price: ETB 7,000. This price has not yet been verified with a supplier.",
  estimateMessage(7000),
);
check(
  "and the empty wording is too",
  NO_PRICE_MESSAGE === "I don't currently have a verified price for this material.",
);
check("money is grouped", formatEtb(1234567) === "ETB 1,234,567", formatEtb(1234567));
check("and keeps the cents it has", formatEtb(7.5) === "ETB 7.5", formatEtb(7.5));

// ---------------------------------------------------------------------------
// 7. The range
//
// What appears above the table: "6,500 – 7,500 ETB / sheet". It has to be
// computed over what is comparable, not over what the search dragged in.
// ---------------------------------------------------------------------------

const spread = resolvePriceQuestion({ material: "MDF 18mm", unit: "sheet" }, [
  price({ priceEtb: 6500, dataStatus: "web_sourced", supplier: "A" }),
  price({ priceEtb: 7000, dataStatus: "web_sourced", supplier: "B" }),
  price({ priceEtb: 7500, dataStatus: "web_sourced", supplier: "C" }),
]);
check("the range is lowest to highest", spread.range?.lowest === 6500 && spread.range?.highest === 7500,
  `${spread.range?.lowest}-${spread.range?.highest}`);
check("the median is the middle one", spread.range?.median === 7000, `${spread.range?.median}`);
check("the sample size is the count", spread.range?.sampleSize === 3);
check("and the suppliers are counted distinctly", spread.range?.sourceCount === 3);
check("the range states its unit", spread.range?.unit === "sheet");

// The thickness trap: the range must not span sizes the user did not ask for.
const thicknesses = resolvePriceQuestion({ material: "MDF 18mm", unit: "sheet" }, [
  price({ specification: "18 mm", priceEtb: 7000 }),
  price({ specification: "18 mm", priceEtb: 7500 }),
  price({ specification: "12 mm", priceEtb: 9000 }),
  price({ specification: "6 mm", priceEtb: 5100 }),
]);
check(
  "a range for 18 mm does not span 6 mm to 12 mm board",
  thicknesses.range?.lowest === 7000 && thicknesses.range?.highest === 7500,
  `${thicknesses.range?.lowest}-${thicknesses.range?.highest} over ${thicknesses.range?.sampleSize} rows`,
);

check("an even sample averages the two middle prices",
  priceRange([
    { record: price({ priceEtb: 100 }), score: 1, usable: true },
    { record: price({ priceEtb: 200 }), score: 1, usable: true },
    { record: price({ priceEtb: 300 }), score: 1, usable: true },
    { record: price({ priceEtb: 500 }), score: 1, usable: true },
  ])?.median === 250);

check("an empty set has no range", priceRange([]) === null);

// ---------------------------------------------------------------------------
// 8. Age and confidence
// ---------------------------------------------------------------------------

check("age is counted in days", ageInDays("2026-08-01", NOW) === 10, `${ageInDays("2026-08-01", NOW)}`);
check("a price from today is not stale", !isStale("2026-08-11", 180, NOW));
check("a price from last year is", isStale("2025-01-01", 180, NOW));

check(
  "a lone educational baseline is low confidence",
  confidenceOf({
    status: "educational_estimate",
    sampleSize: 1,
    priceDate: "2026-08-01",
    now: NOW,
  }) === "low",
);
check(
  "and stays low however many agree — a baseline is not evidence",
  confidenceOf({
    status: "educational_estimate",
    sampleSize: 40,
    priceDate: "2026-08-01",
    now: NOW,
  }) === "low",
);
check(
  "a verified price with corroboration is high",
  confidenceOf({
    status: "admin_verified",
    sampleSize: 3,
    priceDate: "2026-08-01",
    now: NOW,
  }) === "high",
);
check(
  "a verified price on its own is medium",
  confidenceOf({
    status: "admin_verified",
    sampleSize: 1,
    priceDate: "2026-08-01",
    now: NOW,
  }) === "medium",
);
check(
  "an old verified price is low however well corroborated",
  confidenceOf({
    status: "admin_verified",
    sampleSize: 9,
    priceDate: "2024-01-01",
    now: NOW,
  }) === "low",
);
check(
  "three agreeing listings are medium",
  confidenceOf({
    status: "web_sourced",
    sampleSize: 3,
    priceDate: "2026-08-01",
    now: NOW,
  }) === "medium",
);
check(
  "one listing is not",
  confidenceOf({
    status: "web_sourced",
    sampleSize: 1,
    priceDate: "2026-08-01",
    now: NOW,
  }) === "low",
);

// The seeded book is 439 baselines. If that came out anything but low, the
// whole workbook would present as trustworthy on day one.
const seeded = resolvePriceQuestion(
  { material: "Selected fill material", unit: "m³", now: NOW },
  [price({ material: "Selected fill material", specification: "Approved selected soil", unit: "m³", priceEtb: 1350, dataStatus: "educational_estimate", priceDate: "2026-08-09" })],
);
check("a freshly seeded baseline reads as low confidence", seeded.confidence === "low");
check("and as an estimate, not a price", seeded.kind === "estimate");

// ---------------------------------------------------------------------------
// 9. City
//
// A preference, never a filter. Somebody in Bahir Dar with nothing local is
// better served by an Addis price clearly labelled "Addis Ababa" than by
// silence.
// ---------------------------------------------------------------------------

const cities = resolvePriceQuestion(
  { material: "MDF 18mm", unit: "sheet", city: "Bahir Dar" },
  [
    price({ cityRegion: "Addis Ababa", priceEtb: 7000, dataStatus: "web_sourced" }),
    price({ cityRegion: "Bahir Dar", priceEtb: 7900, dataStatus: "web_sourced" }),
  ],
);
check("the asked-for city is preferred", cities.best?.cityRegion === "Bahir Dar", `${cities.best?.cityRegion}`);
check("but the others are still offered", cities.matches.length === 2);

const cityOnly = resolvePriceQuestion(
  { material: "MDF 18mm", unit: "sheet", city: "Bahir Dar" },
  [price({ cityRegion: "Addis Ababa", priceEtb: 7000, dataStatus: "web_sourced" })],
);
check(
  "a city with no local price gets one from elsewhere rather than nothing",
  cityOnly.kind === "estimate" && cityOnly.best?.cityRegion === "Addis Ababa",
  `${cityOnly.kind}`,
);

// Trust still outranks geography: a verified Addis price beats an anonymous
// local listing, because being right about the number matters more than being
// close to it.
const cityVsTrust = resolvePriceQuestion(
  { material: "MDF 18mm", unit: "sheet", city: "Bahir Dar" },
  [
    price({ cityRegion: "Bahir Dar", priceEtb: 9999, dataStatus: "educational_estimate" }),
    price({ cityRegion: "Addis Ababa", priceEtb: 7200, dataStatus: "admin_verified" }),
  ],
);
check(
  "a verified price elsewhere beats a baseline next door",
  cityVsTrust.best?.priceEtb === 7200,
  `${cityVsTrust.best?.priceEtb} in ${cityVsTrust.best?.cityRegion}`,
);

// "Addis Ketema, Addis Ababa" is Addis Ababa.
const district = resolvePriceQuestion(
  { material: "MDF 18mm", unit: "sheet", city: "Addis Ababa" },
  [
    price({ cityRegion: "Bahir Dar", priceEtb: 7900, dataStatus: "web_sourced" }),
    price({ cityRegion: "Addis Ketema, Addis Ababa", priceEtb: 6800, dataStatus: "web_sourced" }),
  ],
);
check(
  "a district inside the asked-for city counts as that city",
  district.best?.cityRegion === "Addis Ketema, Addis Ababa",
  `${district.best?.cityRegion}`,
);

// ---------------------------------------------------------------------------
// 10. Determinism
//
// A quotation that changes on a re-run is a quotation nobody trusts.
// ---------------------------------------------------------------------------

const identical = [
  price({ priceEtb: 7000, dataStatus: "web_sourced", priceDate: "2026-08-01" }),
  price({ priceEtb: 7000, dataStatus: "web_sourced", priceDate: "2026-08-01" }),
  price({ priceEtb: 7000, dataStatus: "web_sourced", priceDate: "2026-08-01" }),
];
const firstRun = resolvePriceQuestion({ material: "MDF 18mm", unit: "sheet" }, identical);
const secondRun = resolvePriceQuestion(
  { material: "MDF 18mm", unit: "sheet" },
  [...identical].reverse(),
);
check(
  "indistinguishable records resolve to the same one whatever the input order",
  firstRun.best?.id === secondRun.best?.id,
  `${firstRun.best?.id} vs ${secondRun.best?.id}`,
);

check(
  "scoring the same question twice gives the same matches",
  JSON.stringify(matchPrices({ material: "MDF 18mm", unit: "sheet" }, identical)) ===
    JSON.stringify(matchPrices({ material: "MDF 18mm", unit: "sheet" }, identical)),
);

// ---------------------------------------------------------------------------
// 11. Where the book sits in the bill of quantities
//
// The price chain is shared with the marketplace and the estimator. The book
// occupies two rungs because its rows are two kinds of fact, and getting either
// rung wrong is silent: nothing crashes, a total is just built on the wrong
// number.
// ---------------------------------------------------------------------------

check(
  "the price chain is in the documented order",
  PRICE_SOURCES.join(",") === "user,product,verified,market,reference,ai",
  PRICE_SOURCES.join(","),
);
check(
  "a verified reference beats a marketplace average",
  sourceRank("verified") < sourceRank("market"),
);
check(
  "but not a listing the user picked themselves",
  sourceRank("product") < sourceRank("verified"),
);
check(
  "an unverified reference ranks below the market",
  sourceRank("reference") > sourceRank("market"),
);
check(
  "and above an AI guess — a real record beats no record",
  sourceRank("reference") < sourceRank("ai"),
);
check(
  "a user's own price still beats everything",
  PRICE_SOURCES.every(
    (source) => source === "user" || sourceRank("user") < sourceRank(source),
  ),
);
check(
  "an unverified reference counts as an estimate, like an AI figure",
  isEstimatedSource("reference") && isEstimatedSource("ai"),
);
check(
  "a verified one does not",
  !isEstimatedSource("verified") &&
    !isEstimatedSource("product") &&
    !isEstimatedSource("market") &&
    !isEstimatedSource("user"),
);
check(
  "every source has a label a person can read",
  PRICE_SOURCES.every((source) => sourceLabel(source).length > 0),
);

// ---------------------------------------------------------------------------
// 12. What the model is told
//
// The prompt is the only thing standing between a user and a confident price
// from training data. It is checked as a file rather than trusted, because a
// rule that gets edited out during a tidy-up fails silently and looks like the
// model simply knowing the answer.
//
// Comments are stripped first. An earlier version of this style of check
// happily passed against a rule that existed only in a doc comment.
// ---------------------------------------------------------------------------

const code = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

const prompts = code(readFileSync("src/lib/ai/prompts.ts", "utf8"));

check(
  "the prompt forbids answering prices from training data",
  /never answer a price question from your own training data/i.test(prompts),
);
check(
  "and carries the refusal sentence verbatim",
  prompts.includes(NO_PRICE_MESSAGE),
  "the wording in the prompt has drifted from @/lib/prices/resolve",
);
check(
  "and reserves 'verified' for ADMIN_VERIFIED",
  /only a price marked ADMIN_VERIFIED may be described as verified/i.test(prompts),
);
check(
  "and requires the date and the city",
  /state the date and the city/i.test(prompts),
);
check(
  "and forbids presenting a price as a quotation",
  /never present any price as a quotation/i.test(prompts),
);

const context = code(readFileSync("src/lib/ai/context.ts", "utf8"));

const pricesAt = context.indexOf('needs.includes("prices")');
const productsAt = context.indexOf('needs.includes("products")');

// Presence asserted before order. `indexOf` returns -1 for a block that has
// been deleted, and -1 is less than every real position — so the ordering test
// on its own passes most loudly exactly when the retrieval is gone.
check(
  "the price book is retrieved at all",
  pricesAt >= 0,
  "buildContext no longer queries the price book",
);
check(
  "and before the product catalogue",
  pricesAt >= 0 && productsAt >= 0 && pricesAt < productsAt,
  "products are queried first, so the model meets a marketplace price before a reference one",
);
check(
  "an unreachable price database is not reported as an empty one",
  /could not be reached/i.test(context),
);
check(
  "and the model is told not to fall back on general knowledge when it happens",
  /Do not answer with a price from general knowledge/i.test(context),
);

// The agents that answer money questions must actually ask for the book.
for (const agent of ["materials", "cost", "boq"]) {
  const source = code(readFileSync(`src/lib/ai/agents/${agent}.ts`, "utf8"));
  check(
    `the ${agent} agent retrieves the price book`,
    /needs:\s*\[[^\]]*"prices"/.test(source),
    "it will answer cost questions from the model's own memory",
  );
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
}

console.log(
  `\n${failures.length === 0 ? GREEN : RED}${passed} passed, ${failures.length} failed${RESET}` +
    `\n${DIM}prices: never invented, never overstated${RESET}\n`,
);

process.exit(failures.length === 0 ? 0 : 1);
