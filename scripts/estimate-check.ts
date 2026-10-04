/**
 * The editable estimate.
 *
 *   npm run check:estimate
 *
 * One rule matters more than everything else here and it is attacked from every
 * direction: **a price the user typed is never silently replaced.** Not by a
 * recalculation, not by a marketplace refresh, not by the model running again.
 *
 * A professional who sets a profile to ETB 4,000, watches it snap back to
 * 3,000, and has to set it again stops using the estimator that afternoon. So
 * the override is stored apart from the AI and marketplace figures, every
 * refresh replaces the latter and leaves the former alone, and the only thing
 * that clears an override is somebody clearing it.
 */

import {
  applyEdit,
  chooseProduct,
  computeLine,
  refreshCandidates,
  resetPrice,
  totalEstimate,
  type EstimateLine,
} from "../src/lib/pricing/estimate.ts";
import { priceMaterials, priceOne } from "../src/lib/pricing/catalogue.ts";
import type { MatchCandidate } from "../src/lib/pricing/match.ts";
import type { PriceCandidate } from "../src/lib/pricing/resolve.ts";

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

const near = (a: number, b: number, tolerance = 0.01) => Math.abs(a - b) < tolerance;

const base = (): EstimateLine => ({
  id: "L1",
  description: "Aluminium profile 40 × 40",
  unit: "bar",
  quantity: 4,
  candidates: [
    { source: "ai", price: 3000, unit: "bar" },
    { source: "market", price: 3500, unit: "bar", sampleSize: 4 },
  ],
});

// ---------------------------------------------------------------------------
// 1. The rule
// ---------------------------------------------------------------------------

const start = base();
check("it starts on the marketplace figure", computeLine(start).source === "market");
check("at 3,500", computeLine(start).unitPrice === 3500);
check("and is not marked as edited", computeLine(start).edited === false);

const { line: edited } = applyEdit(start, { field: "unitPrice", value: 4000 });
check("the user's price is used", computeLine(edited).unitPrice === 4000);
check("and attributed to them", computeLine(edited).source === "user");
check("and flagged as edited", computeLine(edited).edited === true);
check(
  "the total recalculates immediately",
  near(computeLine(edited).materialCost, 16_000),
  `${computeLine(edited).materialCost}`,
);

// The attack: the market moves, the model reruns, everything refreshes.
const refreshed = refreshCandidates(edited, [
  { source: "ai", price: 2900, unit: "bar" },
  { source: "market", price: 3100, unit: "bar", sampleSize: 9 },
]);

check(
  "a refresh does not touch the user's price",
  computeLine(refreshed).unitPrice === 4000,
  `${computeLine(refreshed).unitPrice}`,
);
check("it is still theirs", computeLine(refreshed).source === "user");
check(
  "but the new market figure is available underneath",
  computeLine(refreshed).alternatives.some(
    (alternative) => alternative.source === "market" && alternative.price === 3100,
  ),
);

// Ten refreshes in a row change nothing.
let hammered = edited;
for (let i = 0; i < 10; i += 1) {
  hammered = refreshCandidates(hammered, [
    { source: "ai", price: 1000 + i, unit: "bar" },
    { source: "market", price: 2000 + i, unit: "bar" },
  ]);
}
check("ten refreshes still leave it alone", computeLine(hammered).unitPrice === 4000);

// ---------------------------------------------------------------------------
// 2. Reset means reset
// ---------------------------------------------------------------------------

const { line: backToMarket } = resetPrice(edited, "market");
check("reset to marketplace drops the override", computeLine(backToMarket).unitPrice === 3500);
check("and the source follows", computeLine(backToMarket).source === "market");
check("and it is no longer edited", computeLine(backToMarket).edited === false);

const { line: backToAi } = resetPrice(edited, "ai");
check(
  "reset to AI falls through to the AI figure only when nothing better exists",
  computeLine(backToAi).source === "market",
  "the market figure is still a real candidate and outranks the AI one",
);
check(
  "resetting an unedited line changes nothing",
  computeLine(resetPrice(start, "market").line).unitPrice === 3500,
);

// ---------------------------------------------------------------------------
// 3. Choosing a product
// ---------------------------------------------------------------------------

const { line: withProduct } = chooseProduct(start, {
  id: "p-alu",
  title: "Alu 40×40 black",
  price: 3800,
  unit: "bar",
});
check("a chosen product beats the average", computeLine(withProduct).unitPrice === 3800);
check("and is named", computeLine(withProduct).source === "product");

// But not the user.
const { line: productThenUser } = applyEdit(withProduct, {
  field: "unitPrice",
  value: 4200,
});
check(
  "the user still beats a chosen product",
  computeLine(productThenUser).unitPrice === 4200,
);

// Choosing a second product replaces the first rather than stacking.
const { line: secondProduct } = chooseProduct(withProduct, {
  id: "p-other",
  title: "Alu 40×40 mill",
  price: 3400,
  unit: "bar",
});
check(
  "choosing another product replaces the first",
  computeLine(secondProduct).unitPrice === 3400,
);
check(
  "and there is only ever one product candidate",
  secondProduct.candidates.filter((candidate) => candidate.source === "product")
    .length === 1,
);

// ---------------------------------------------------------------------------
// 4. The arithmetic
// ---------------------------------------------------------------------------

const full: EstimateLine = {
  ...base(),
  quantity: 10,
  wastePercent: 10,
  labour: 200,
  fabrication: 150,
  installation: 100,
  transport: 50,
  marginPercent: 20,
  extras: [{ id: "e1", label: "Transport to site", quantity: 1, unitPrice: 2500 }],
};

const computed = computeLine(full);

check("waste inflates the quantity", near(computed.quantityWithWaste, 11));
check("material is quantity × price", near(computed.materialCost, 11 * 3500));
check("labour is per final unit", near(computed.labourCost, 11 * 200));
check("so is fabrication", near(computed.fabricationCost, 11 * 150));
check("and installation", near(computed.installationCost, 11 * 100));
check("and transport", near(computed.transportCost, 11 * 50));
check("a fixed extra is not multiplied by the quantity", near(computed.extrasCost, 2500));

const expectedCost = 11 * (3500 + 200 + 150 + 100 + 50) + 2500;
check("the cost adds up", near(computed.cost, expectedCost), `${computed.cost}`);
check("margin is a percentage of the whole cost", near(computed.margin, expectedCost * 0.2));
check(
  "and the selling price is cost plus margin",
  near(computed.sellingPrice, expectedCost * 1.2),
);
// Margin before the additions under-quotes every line that has labour on it.
check(
  "margin is applied after the additions, not to the material alone",
  computed.margin > 11 * 3500 * 0.2,
  `${computed.margin}`,
);

check("the workings are shown", computed.workings.length >= 5);
check(
  "including the waste step",
  computed.workings.some((working) => working.includes("10% waste")),
  computed.workings.join(" | "),
);
check(
  "and the margin step",
  computed.workings.some((working) => working.includes("Margin 20%")),
);

// A line with no candidates at all is zero, not a crash.
const priceless = computeLine({ ...base(), candidates: [] });
check("a line with no price costs nothing", priceless.unitPrice === 0);
check("and says so", priceless.sourceLabel === "No price");

// ---------------------------------------------------------------------------
// 5. Everything is editable, and every change is recorded
// ---------------------------------------------------------------------------

const edits = [
  { field: "quantity", value: 12 },
  { field: "unitPrice", value: 4000 },
  { field: "waste", value: 5 },
  { field: "labour", value: 250 },
  { field: "fabrication", value: 175 },
  { field: "installation", value: 125 },
  { field: "transport", value: 75 },
  { field: "margin", value: 25 },
] as const;

let running = base();
const history = [];
for (const edit of edits) {
  const result = applyEdit(running, edit);
  running = result.line;
  history.push(result.change);
}

check("every field can be changed", history.length === edits.length);
check(
  "each change records what it was and what it became",
  history.every((change) => change.to !== null && change.at.length > 0),
);
check(
  "the price change records the old price",
  history.find((change) => change.field === "unitPrice")?.from === 3500,
);
check("and the new one", history.find((change) => change.field === "unitPrice")?.to === 4000);
check(
  "every change names its line",
  history.every((change) => change.lineId === "L1"),
);

const after = computeLine(running);
check("the quantity took", after.quantity === 12);
check("the price took", after.unitPrice === 4000);
check("the margin took", near(after.margin, after.cost * 0.25));

// A reset is recorded as a reset, not as a typed value.
const { change: resetChange } = resetPrice(running, "market");
check("a reset is recorded", resetChange.reset === "market");
check("with the price it went back to", resetChange.to === 3500);

// Editing does not mutate the line it was given.
const original = base();
applyEdit(original, { field: "unitPrice", value: 9999 });
check(
  "applying an edit does not mutate the original",
  computeLine(original).unitPrice === 3500,
  "undo would be impossible and history would be a reconstruction",
);

// ---------------------------------------------------------------------------
// 6. Totals
// ---------------------------------------------------------------------------

const totals = totalEstimate([base(), running, { ...base(), id: "L3", candidates: [] }]);

check("three lines", totals.lines === 3);
check("one of them edited", totals.editedLines === 1, `${totals.editedLines}`);
check("one of them unpriced", totals.unpricedLines === 1);
check("the total is the sum of the selling prices", totals.sellingPrice > totals.cost);
check(
  "and cost plus margin equals the selling price",
  near(totals.cost + totals.margin, totals.sellingPrice),
);

// ---------------------------------------------------------------------------
// 7. Pricing a whole bill from the marketplace
//
// The refresh the "Price from Marketplace" button performs, composed exactly as
// the workspace composes it. The engine's guarantees are tested above; this
// checks the one call site honours them.
//
// Order within the array is deliberately *not* what is being checked —
// `resolvePrice` ranks by source, so the spreads could be written either way
// round. What the call site can actually get wrong is dropping something: the
// AI rate that "reset" falls back to, or the listing the estimator picked by
// hand.
// ---------------------------------------------------------------------------

/** What the workspace does with each result, verbatim. */
const applyMarketResult = (line: EstimateLine, fromMarket: PriceCandidate[]) =>
  refreshCandidates(line, [
    ...fromMarket,
    ...line.candidates.filter((candidate) => candidate.source === "ai"),
  ]);

const bill: EstimateLine[] = [
  { ...base(), id: "F.01", candidates: [{ source: "ai", price: 850, unit: "m²" }], unit: "m²" },
  { ...base(), id: "F.02", candidates: [{ source: "ai", price: 850, unit: "m²" }], unit: "m²" },
  { ...base(), id: "C.01", candidates: [{ source: "ai", price: 7800, unit: "m³" }], unit: "m³" },
];

// The estimator edits one line before pricing, which is the realistic order:
// they know the block rate on this job and they type it.
const { line: editedLine } = applyEdit(bill[1]!, { field: "unitPrice", value: 990 });
const working = [bill[0]!, editedLine, bill[2]!];

const market: Record<string, PriceCandidate[]> = {
  "F.01": [
    { source: "product", price: 42, unit: "m²", productId: "p1", productTitle: "HCB 200" },
    { source: "market", price: 45, unit: "m²", sampleSize: 3 },
  ],
  "F.02": [
    { source: "product", price: 42, unit: "m²", productId: "p1", productTitle: "HCB 200" },
  ],
  // Nothing on the marketplace for concrete.
  "C.01": [],
};

/** A line the marketplace could not price is left exactly as it was. */
const priceFromMarket = (line: EstimateLine) => {
  const found = market[line.id] ?? [];
  return found.length > 0 ? applyMarketResult(line, found) : line;
};

const priced = working.map(priceFromMarket);

check(
  "an unedited line takes the marketplace product",
  computeLine(priced[0]!).unitPrice === 42 &&
    computeLine(priced[0]!).source === "product",
  `${computeLine(priced[0]!).unitPrice} ${computeLine(priced[0]!).source}`,
);
check(
  "the edited line keeps the price the estimator typed",
  computeLine(priced[1]!).unitPrice === 990,
  `${computeLine(priced[1]!).unitPrice} — the marketplace overwrote an edit`,
);
check(
  "and is still attributed to them",
  computeLine(priced[1]!).source === "user",
);
check(
  "but the marketplace figure is underneath it, ready for a reset",
  computeLine(priced[1]!).alternatives.some(
    (alternative) => alternative.source === "product" && alternative.price === 42,
  ),
);
check(
  "resetting the edited line lands on the marketplace product, not the AI rate",
  computeLine(resetPrice(priced[1]!, "product").line).unitPrice === 42,
  `${computeLine(resetPrice(priced[1]!, "product").line).unitPrice}`,
);
check(
  "a line the marketplace could not price keeps its starting rate",
  computeLine(priced[2]!).unitPrice === 7800,
);
check(
  "and is still marked as the AI figure, not silently promoted",
  computeLine(priced[2]!).source === "ai",
);

// The AI rate survives underneath a marketplace price, so "reset" always has
// somewhere to land even when the marketplace later has nothing.
check(
  "the AI rate is kept beneath the marketplace one",
  priced[0]!.candidates.some((candidate) => candidate.source === "ai"),
);

// ---------------------------------------------------------------------------
// A listing chosen by hand, then re-priced.
//
// The estimator does not always want the best-scoring listing. They know a
// supplier, they pick that supplier, and the price is higher for a reason. The
// choice is held as an id in the override and a candidate in the list — so a
// refresh that replaces the list wholesale would leave an id pointing at
// nothing and silently swap the supplier back to the cheap one, at a price the
// estimator never agreed to.
// ---------------------------------------------------------------------------

const { line: pickedSupplier } = chooseProduct(bill[0]!, {
  id: "trusted",
  title: "HCB 200 — Adama Blocks",
  price: 58,
  unit: "m²",
});

// Re-pricing brings back the same matcher rows as before, and "trusted" is not
// among them: it did not score well, which is exactly why it had to be picked
// by hand.
const repriced = priceFromMarket(pickedSupplier);

check(
  "a listing chosen by hand survives a re-price",
  computeLine(repriced).unitPrice === 58,
  `${computeLine(repriced).unitPrice} — the marketplace swapped the supplier out`,
);
const chosen = repriced.candidates.find(
  (candidate) => candidate.productId === repriced.override?.productId,
);
check(
  "the override still points at a candidate that exists",
  chosen !== undefined,
  "the chosen listing is gone but the id remains — a dangling reference",
);
check(
  "and it is still the supplier they named, not the best-scoring one",
  chosen?.productTitle === "HCB 200 — Adama Blocks",
  `${chosen?.productTitle}`,
);
check(
  "only one product candidate survives, so the panel cannot show two",
  repriced.candidates.filter((candidate) => candidate.source === "product").length === 1,
  `${repriced.candidates.filter((candidate) => candidate.source === "product").length}`,
);
check(
  "the fresh market average is still offered alongside it",
  computeLine(repriced).alternatives.some(
    (alternative) => alternative.source === "market" && alternative.price === 45,
  ),
);

// Pricing twice in a row is the same as pricing once.
const twice = priced.map(priceFromMarket);
check(
  "pricing twice changes nothing",
  JSON.stringify(twice.map(computeLine).map((l) => [l.unitPrice, l.source])) ===
    JSON.stringify(priced.map(computeLine).map((l) => [l.unitPrice, l.source])),
);
check(
  "including the edited line",
  computeLine(twice[1]!).unitPrice === 990,
);

// ---------------------------------------------------------------------------
// 8. Where the marketplace prices come from
//
// The catalogue layer: listings in, `PriceCandidate`s out. The database half
// lives in `@/lib/data/materials` and is not exercised here — what is exercised
// is everything that happens to the rows once they arrive, which is where a
// wrong answer would be plausible enough to go unnoticed.
// ---------------------------------------------------------------------------

const listing = (
  id: string,
  title: string,
  price: number,
  unit = "m²",
): MatchCandidate => ({ id, title, category: "Masonry", brand: null, unit, price });

const blocks: MatchCandidate[] = [
  listing("b1", "Hollow Concrete Block 200mm", 42),
  listing("b2", "HCB 200 mm solid-top", 45),
  listing("b3", "Hollow Concrete Block 200mm premium", 48),
  // A different size. It must not be averaged in with the 200s.
  listing("b4", "Hollow Concrete Block 150mm", 31),
  // The right block, sold by the piece. Blocks really are listed both ways,
  // and ETB 18 per block averaged with ETB 42 per square metre is a number
  // that means nothing at all.
  listing("b5", "Hollow Concrete Block 200mm", 18, "pc"),
];

const hcb = priceOne({ description: "200 mm HCB walling", unit: "m²" }, blocks);

const hcbProduct = hcb.candidates.find((candidate) => candidate.source === "product");

// Not "the cheapest one" and not a named id: several of these listings are
// honestly the same block, and which of them scores highest is a matter of
// wording. What must never happen is the other thing.
check(
  "a 200 mm line is priced from a 200 mm listing, never the 150",
  hcbProduct?.productId !== undefined && hcbProduct.productId !== "b4",
  `${hcbProduct?.productTitle} at ${hcbProduct?.price}`,
);
check(
  "and carries the listing id, so the estimate can link back to it",
  typeof hcbProduct?.productId === "string" && hcbProduct.productId.length > 0,
);
check(
  "and its title, so the panel can name the supplier's product",
  typeof hcbProduct?.productTitle === "string" && hcbProduct.productTitle.length > 0,
);
check(
  "a market average is offered beside it",
  hcb.candidates.some((candidate) => candidate.source === "market"),
);
check(
  "the wrong size is not averaged into the right one",
  (hcb.candidates.find((candidate) => candidate.source === "market")?.price ?? 0) > 40,
  `${hcb.candidates.find((candidate) => candidate.source === "market")?.price} — 150 mm block dragged the average down`,
);
check(
  "a per-piece listing is not averaged with per-square-metre ones",
  (hcb.candidates.find((candidate) => candidate.source === "market")?.price ?? 0) > 40,
  `${hcb.candidates.find((candidate) => candidate.source === "market")?.price} — a per-piece rate got into the average`,
);
check(
  "and the average is stated in the unit the line is measured in",
  hcb.candidates.find((candidate) => candidate.source === "market")?.unit === "m²",
  `${hcb.candidates.find((candidate) => candidate.source === "market")?.unit}`,
);
check(
  "the product price is per square metre too, not per piece",
  hcbProduct?.unit === "m²",
  `${hcbProduct?.unit}`,
);
check(
  "no AI figure is invented at this layer",
  hcb.candidates.every((candidate) => candidate.source !== "ai"),
);

// Nothing on the marketplace resembles this. The correct output is no
// candidates at all — the estimate then keeps whatever rate it already had,
// rather than being handed a number nobody can trace.
const nothing = priceOne(
  { description: "Bespoke bronze balustrade, patinated", unit: "m" },
  blocks,
);
check("an unmatched description yields no candidates", nothing.candidates.length === 0);
check(
  "and says so, rather than failing silently",
  (nothing.match.message?.length ?? 0) > 0,
  `${nothing.match.message}`,
);

// Every listing is per piece and the line is measured in square metres. This
// is the wrong-by-a-factor-of-six case: ETB 18 is a true price for a block and
// a catastrophic one for a square metre of wall. Nothing may be offered.
const wrongUnit = priceOne({ description: "200 mm HCB walling", unit: "m²" }, [
  listing("p1", "Hollow Concrete Block 200mm", 18, "pc"),
  listing("p2", "HCB 200 mm", 19, "pc"),
  listing("p3", "Hollow Concrete Block 200mm grade B", 17, "pc"),
]);

check(
  "a per-piece listing is never offered as a per-square-metre price",
  wrongUnit.candidates.every((candidate) => candidate.source !== "product"),
  `${wrongUnit.candidates.find((candidate) => candidate.source === "product")?.price} per ${wrongUnit.candidates.find((candidate) => candidate.source === "product")?.unit}`,
);
check(
  "nor averaged into one",
  wrongUnit.candidates.every((candidate) => candidate.source !== "market"),
  `${wrongUnit.candidates.find((candidate) => candidate.source === "market")?.price} per ${wrongUnit.candidates.find((candidate) => candidate.source === "market")?.unit}`,
);
check(
  "the estimate is left unpriced rather than priced wrongly",
  wrongUnit.candidates.length === 0,
  `${wrongUnit.candidates.length} candidates`,
);
check(
  "but the near misses are still there to be picked by hand",
  wrongUnit.match.matches.length === 3,
  `${wrongUnit.match.matches.length}`,
);
check(
  "and every one of them is flagged as the wrong unit",
  wrongUnit.match.matches.every((entry) => !entry.usable),
);

// A single listing is not a market. It is already offered as the product
// price, and calling it an average of one implies a spread that is not there.
const only = priceOne({ description: "200 mm HCB walling", unit: "m²" }, [blocks[0]!]);
check(
  "one listing gives a product price",
  only.candidates.some((candidate) => candidate.source === "product"),
);
check(
  "but no market average — one listing is not a market",
  only.candidates.every((candidate) => candidate.source !== "market"),
);

// The batch: a real bill repeats the same description on every storey, and
// each repeat must not be another round trip.
//
// In a function rather than at the top level because the build targets CJS,
// where top-level await is not available.
async function batchChecks() {
  let lookups = 0;
  const counted = async (description: string) => {
    lookups += 1;
    return description.toLowerCase().includes("hcb") ? blocks : [];
  };

  const batch = await priceMaterials(
    [
      { key: "A.01", description: "200 mm HCB walling", unit: "m²" },
      { key: "A.02", description: "200 mm HCB walling", unit: "m²" },
      { key: "A.03", description: "  200 MM HCB WALLING  ", unit: "m²" },
      { key: "B.01", description: "Bespoke bronze balustrade", unit: "m" },
    ],
    counted,
  );

  check("every line comes back", batch.length === 4, `${batch.length}`);
  check(
    "in the order they were asked for",
    batch.map((entry) => entry.key).join(",") === "A.01,A.02,A.03,B.01",
    batch.map((entry) => entry.key).join(","),
  );
  check(
    "a repeated description is looked up once, whatever its casing or padding",
    lookups === 2,
    `${lookups} lookups for 2 distinct descriptions`,
  );
  check(
    "and the repeats get the same price, not a drifting one",
    new Set(
      batch
        .slice(0, 3)
        .map(
          (entry) =>
            entry.candidates.find((candidate) => candidate.source === "product")?.price,
        ),
    ).size === 1,
  );
  check(
    "the line with no match comes back empty rather than missing",
    batch[3]?.candidates.length === 0,
  );

  // A marketplace that cannot be reached is not a marketplace with nothing in
  // it. If the lookup fails and the batch quietly returns no candidates, the
  // page says "no match" and somebody goes off to re-list products that were
  // there the whole time. The failure has to reach the route, which turns it
  // into a 503 that says the rates are unchanged.
  let threw = false;
  try {
    await priceMaterials([{ key: "A.01", description: "200 mm HCB", unit: "m²" }], () => {
      throw new Error("connection refused");
    });
  } catch {
    threw = true;
  }
  check("a failed lookup is not reported as an empty marketplace", threw);
}

// ---------------------------------------------------------------------------

function report() {
  if (failures.length > 0) {
    console.log(`\n${RED}${failures.length} failed${RESET}`);
    for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  }

  console.log(
    `\n${failures.length === 0 ? GREEN : RED}${passed} passed, ${failures.length} failed${RESET}` +
      `\n${DIM}estimate: the price you typed stays the price you typed${RESET}\n`,
  );

  process.exit(failures.length === 0 ? 0 : 1);
}

// A thrown error must not be reported as a pass. `catch` records it as a
// failure so the summary is honest about having stopped early.
batchChecks()
  .catch((error) => {
    failures.push(`the batch checks threw — ${String(error)}`);
  })
  .then(report);
