/**
 * Takeoff, trades and BOQ — the arithmetic, and where it came from.
 *
 *   npm run check:takeoff
 *
 * Two things are checked hardest, because both are ways of being confidently
 * wrong:
 *
 *   1. **Provenance that improves.** A calculation is only as good as its worst
 *      input. Multiply a BIM length by an AI-estimated height and the answer is
 *      an estimate — presenting it as BIM data is the failure the brief called
 *      out by name, and it is invisible unless something checks it.
 *   2. **Reinforcement that was never specified.** A bar schedule that looks
 *      confident and was guessed gets built. Missing structural information has
 *      to come back empty and say so.
 *
 * Everything is a pure function over a small model. No database, no network.
 */

import {
  allItems,
  boqWarnings,
  buildBoq,
  itemFromQuantity,
  itemsForElement,
  sectionTitle,
  BOQ_SECTIONS,
} from "../src/lib/takeoff/boq.ts";
import {
  bothFaces,
  floorArea,
  grossArea,
  netArea,
  netVolume,
  openingArea,
  perimeter,
  total,
  volume,
  withWaste,
} from "../src/lib/takeoff/measure.ts";
import {
  ElementIndex,
  measured,
  weakest,
  type BuildingElement,
} from "../src/lib/takeoff/model.ts";
import {
  concreteQuantity,
  masonryQuantity,
  paintQuantity,
  rebarKgPerMetre,
  rebarQuantity,
  BLOCK_TYPES,
  PAINT_SYSTEMS,
} from "../src/lib/takeoff/trades.ts";
import {
  matchMaterial,
  scoreMatch,
  terms,
  type MatchCandidate,
} from "../src/lib/pricing/match.ts";

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

const near = (a: number, b: number, tolerance = 0.005) => Math.abs(a - b) < tolerance;

// ---------------------------------------------------------------------------
// 1. The worked example from the brief
//
//   Length 18.40 m, height 3.00 m, openings 8.40 m²
//   18.40 × 3.00 − 8.40 = 46.80 m²
// ---------------------------------------------------------------------------

const door: BuildingElement = {
  id: "D-01",
  kind: "door",
  name: "D-01",
  width: measured(1200, "bim"),
  height: measured(2100, "bim"),
  count: measured(2, "bim"),
};

const window1: BuildingElement = {
  id: "W-01",
  kind: "window",
  name: "W-01",
  width: measured(1500, "bim"),
  height: measured(1200, "bim"),
  count: measured(2, "bim"),
};

const wall: BuildingElement = {
  id: "WALL-104",
  kind: "wall",
  name: "Wall W-104",
  level: "Ground",
  location: "Living room",
  drawingRef: "A-101",
  length: measured(18_400, "bim"),
  height: measured(3000, "bim"),
  thickness: measured(200, "bim"),
  openings: ["D-01", "W-01"],
};

const index = new ElementIndex([wall, door, window1]);

const gross = grossArea(wall);
check("gross area is length × height", near(gross?.value ?? 0, 55.2), `${gross?.value}`);
check(
  "and the formula says so",
  gross?.formula === "18.40 × 3.00 = 55.20 m²",
  gross?.formula,
);

const openings = openingArea(wall, index);
check(
  "openings are 2 doors + 2 windows = 8.64 m²",
  near(openings.value, 1.2 * 2.1 * 2 + 1.5 * 1.2 * 2),
  `${openings.value}`,
);

const net = netArea(wall, index);
check(
  "net area is gross less openings",
  near(net?.value ?? 0, 55.2 - openings.value),
  `${net?.value}`,
);
check(
  "and the working is shown",
  (net?.formula ?? "").includes("−") && (net?.formula ?? "").includes("="),
  net?.formula,
);

// The brief's exact numbers, with the openings stated rather than modelled.
const briefWall: BuildingElement = {
  id: "BW",
  kind: "wall",
  name: "Brief wall",
  length: measured(18_400, "drawing"),
  height: measured(3000, "drawing"),
  openings: ["BO"],
};
const briefOpening: BuildingElement = {
  id: "BO",
  kind: "window",
  name: "Openings",
  width: measured(4200, "drawing"),
  height: measured(2000, "drawing"),
  count: measured(1, "drawing"),
};
const briefNet = netArea(briefWall, new ElementIndex([briefWall, briefOpening]));
check(
  "18.40 × 3.00 − 8.40 = 46.80 m²",
  near(briefNet?.value ?? 0, 46.8),
  `${briefNet?.value}`,
);

// Both faces, for plaster.
const faces = bothFaces(net!);
check("both faces is twice one face", near(faces.value, (net?.value ?? 0) * 2));

// Volumes.
const wallVolume = netVolume(wall, index);
check(
  "net volume is net area × thickness",
  near(wallVolume?.value ?? 0, (net?.value ?? 0) * 0.2, 0.001),
  `${wallVolume?.value}`,
);

const column: BuildingElement = {
  id: "C-01",
  kind: "column",
  name: "Column C-01",
  length: measured(400, "bim"),
  width: measured(400, "bim"),
  height: measured(3000, "bim"),
  count: measured(12, "bim"),
};
const columnVolume = volume(column);
check(
  "twelve 400 × 400 × 3000 columns are 5.76 m³",
  near(columnVolume?.value ?? 0, 0.4 * 0.4 * 3 * 12, 0.001),
  `${columnVolume?.value}`,
);

const room: BuildingElement = {
  id: "R-01",
  kind: "room",
  name: "Living room",
  length: measured(6000, "bim"),
  width: measured(4500, "bim"),
  height: measured(3000, "bim"),
};
check("floor area is 27 m²", near(floorArea(room)?.value ?? 0, 27));
check("perimeter is 21 m", near(perimeter(room)?.value ?? 0, 21));

// Waste is its own line, so the measured quantity stays checkable.
const wasted = withWaste(net!, 10);
check("10% waste adds 10%", near(wasted.value, (net?.value ?? 0) * 1.1, 0.01));
check("and says so in the formula", wasted.formula.includes("10%"));

// Adding m² to m³ is a wrong answer with a plausible magnitude.
check(
  "quantities of different units refuse to be summed",
  total("nonsense", [net!, columnVolume!]) === null,
);
check(
  "but matching ones add up",
  near(total("walls", [net!, net!])?.value ?? 0, (net?.value ?? 0) * 2),
);

// ---------------------------------------------------------------------------
// 2. Provenance degrades, never improves
// ---------------------------------------------------------------------------

check("BIM plus BIM is BIM", weakest("bim", "bim") === "bim");
check("BIM plus an estimate is an estimate", weakest("bim", "ai") === "ai");
check("a drawing plus BIM is drawing-derived", weakest("bim", "drawing") === "drawing");
check("user input beats a drawing", weakest("user", "drawing") === "drawing");
check(
  "calculated alone stays calculated",
  weakest("calculated", "calculated") === "calculated",
);
check(
  "but a calculation over BIM values is BIM-grade",
  weakest("calculated", "bim") === "bim",
);

// The failure the brief named: an estimated height must not produce a BIM area.
const halfKnown: BuildingElement = {
  id: "HK",
  kind: "wall",
  name: "Half-known wall",
  length: measured(10_000, "bim", 1),
  height: measured(3000, "ai", 0.5),
};
const halfArea = grossArea(halfKnown);
check(
  "a BIM length times an estimated height is an estimate",
  halfArea?.source === "ai",
  halfArea?.source,
);
check(
  "and carries the lower confidence",
  halfArea?.confidence === 0.5,
  `${halfArea?.confidence}`,
);
check(
  "it is never reported as BIM data",
  halfArea?.source !== "bim",
  "an AI-estimated dimension was presented as verified BIM information",
);

// A total is no better than its worst part.
const mixedTotal = total("mixed", [gross!, halfArea!]);
check("a total inherits the worst provenance", mixedTotal?.source === "ai");
check("and the lowest confidence", mixedTotal?.confidence === 0.5);

// A total of BIM parts stays BIM.
check(
  "a total of BIM quantities is not downgraded to calculated",
  total("bim only", [gross!, gross!])?.source === "bim",
  total("bim only", [gross!, gross!])?.source,
);

// ---------------------------------------------------------------------------
// 3. Openings that were not measured are said, not assumed
// ---------------------------------------------------------------------------

const vague: BuildingElement = {
  id: "V",
  kind: "wall",
  name: "Vague wall",
  length: measured(5000, "bim"),
  height: measured(3000, "bim"),
  openings: ["UNMEASURED", "MISSING"],
};
const unmeasuredDoor: BuildingElement = {
  id: "UNMEASURED",
  kind: "door",
  name: "Door, size unknown",
};
const vagueIndex = new ElementIndex([vague, unmeasuredDoor]);
const vagueOpenings = openingArea(vague, vagueIndex);

check(
  "an opening with no dimensions contributes nothing",
  vagueOpenings.value === 0,
);
check(
  "but the sheet says one was not measured",
  vagueOpenings.formula.includes("not measured"),
  vagueOpenings.formula,
);
check(
  "an opening id that names nothing is simply absent",
  vagueOpenings.elementIds.includes("UNMEASURED") &&
    !vagueOpenings.elementIds.includes("MISSING"),
);

// Openings bigger than the wall are bad input, not negative area.
const swallowed: BuildingElement = {
  id: "S",
  kind: "wall",
  name: "Tiny wall",
  length: measured(1000, "bim"),
  height: measured(1000, "bim"),
  openings: ["BIG"],
};
const big: BuildingElement = {
  id: "BIG",
  kind: "window",
  name: "Oversized",
  width: measured(3000, "bim"),
  height: measured(3000, "bim"),
};
check(
  "net area never goes negative",
  netArea(swallowed, new ElementIndex([swallowed, big]))?.value === 0,
);

// ---------------------------------------------------------------------------
// 4. Paint
// ---------------------------------------------------------------------------

const emulsion = PAINT_SYSTEMS.find((system) => system.id === "emulsion-interior")!;
const paint = paintQuantity(faces, emulsion);

check(
  "paint is area × coats ÷ coverage",
  near(paint.litres, (faces.value * 2) / 12, 0.02),
  `${paint.litres}`,
);
check("two coats by default", paint.coats === 2);
check("and it is bought in whole tins", Number.isInteger(paint.tins));
check(
  "enough tins to cover it",
  paint.tins * emulsion.tinLitres >= paint.litresWithWaste,
);
check("the formula shows the sum", paint.formula.includes("÷"), paint.formula);

// Three coats is more paint. A specification that says three and is billed for
// two is the commonest paint dispute there is.
check(
  "three coats needs more than two",
  paintQuantity(faces, emulsion, { coats: 3 }).litres > paint.litres,
);
// Openings are already out — paint is measured on net area, so a wall with
// windows in it needs less paint. Checked because it is easy to pass gross.
check(
  "painting a net area needs less than painting a gross one",
  paintQuantity(net!, emulsion).litres < paintQuantity(gross!, emulsion).litres,
);

// ---------------------------------------------------------------------------
// 5. Masonry
// ---------------------------------------------------------------------------

const hcb200 = BLOCK_TYPES.find((block) => block.id === "hcb-200")!;
const masonry = masonryQuantity(net!, hcb200, { stated: true });

check(
  "blocks per m² is computed from the block and the joint",
  near(masonry.blocksPerM2, 1 / (((400 + 10) * (200 + 10)) / 1_000_000), 0.01),
  `${masonry.blocksPerM2}`,
);
check("about 11.6 blocks per m² for a 400 × 200 block", near(masonry.blocksPerM2, 11.6, 0.05));
check("blocks are whole", Number.isInteger(masonry.blocks));
check("waste adds blocks", masonry.blocksWithWaste >= masonry.blocks);
check("there is mortar", masonry.mortar > 0);

// The brief: do not assume a block size when the drawing states another.
const hcb150 = BLOCK_TYPES.find((block) => block.id === "hcb-150")!;
check(
  "a different block size gives a different answer",
  masonryQuantity(net!, hcb150, { stated: true }).mortar !==
    masonryQuantity(net!, hcb200, { stated: true }).mortar,
);
check(
  "an assumed block size is flagged",
  masonryQuantity(net!, hcb200, { stated: false }).notes.length === 1,
);
check(
  "a stated one is not",
  masonryQuantity(net!, hcb200, { stated: true }).notes.length === 0,
);

// A brick is a different size and must not reuse the block figure.
const brick = BLOCK_TYPES.find((block) => block.id === "brick-clay")!;
check(
  "bricks are far more numerous per m² than blocks",
  masonryQuantity(net!, brick, { stated: true }).blocksPerM2 >
    masonry.blocksPerM2 * 2,
);

// ---------------------------------------------------------------------------
// 6. Concrete
// ---------------------------------------------------------------------------

const concrete = concreteQuantity(columnVolume!, "C25");

check(
  "the ordered volume includes waste",
  concrete.orderedVolume > columnVolume!.value,
);
check("cement comes in whole bags", Number.isInteger(concrete.cementBags));
check("there is sand and aggregate", concrete.sandM3 > 0 && concrete.aggregateM3 > 0);
check(
  "a richer mix needs more cement for the same volume",
  concreteQuantity(columnVolume!, "C30").cementBags >
    concreteQuantity(columnVolume!, "C15").cementBags,
);
check(
  "the dry volume exceeds the wet volume",
  concrete.sandM3 + concrete.aggregateM3 > concrete.orderedVolume,
  "the 1.54 dry factor is missing — every pour would be under-ordered",
);
check("the grade is named", concrete.grade.includes("C25"));

// ---------------------------------------------------------------------------
// 7. Reinforcement — the one that must never be invented
// ---------------------------------------------------------------------------

const noSchedule = rebarQuantity([]);
check("no schedule means no bars", noSchedule.byDiameter.length === 0);
check("and no weight", noSchedule.totalWeightKg === 0);
check(
  "and it says the information is missing rather than estimating",
  noSchedule.notes.some((note) => note.includes("structural drawings")),
  noSchedule.notes.join(" "),
);

const schedule = rebarQuantity([
  { mark: "01", diameter: 16, length: 6.2, count: 8, member: "Beam B1" },
  { mark: "02", diameter: 12, length: 4.0, count: 24, member: "Beam B1" },
  { mark: "03", diameter: 8, length: 1.8, count: 60, member: "Links" },
]);

check("three diameters", schedule.byDiameter.length === 3);
check("sorted smallest first", schedule.byDiameter[0]?.diameter === 8);
check(
  "Y12 weighs 0.888 kg/m",
  near(rebarKgPerMetre(12), 0.888, 0.001),
  `${rebarKgPerMetre(12)}`,
);
check(
  "Y16 weighs 1.58 kg/m",
  near(rebarKgPerMetre(16), 1.58, 0.005),
  `${rebarKgPerMetre(16)}`,
);
check(
  "the weight is length × kg/m",
  near(
    schedule.byDiameter.find((group) => group.diameter === 12)?.weightKg ?? 0,
    4 * 24 * 0.888,
    0.1,
  ),
);
check(
  "the total is the sum of the groups",
  near(
    schedule.totalWeightKg,
    schedule.byDiameter.reduce((sum, group) => sum + group.weightKg, 0),
    0.01,
  ),
);
// The same rule as aluminium: you buy whole bars.
check(
  "bars are bought whole in 12 m lengths",
  schedule.byDiameter.every((group) => Number.isInteger(group.bars) && group.bars > 0),
);
check(
  "96 m of Y12 is 8 bars",
  schedule.byDiameter.find((group) => group.diameter === 12)?.bars === 8,
);
check("a real schedule carries no missing-information note", schedule.notes.length === 0);

// ---------------------------------------------------------------------------
// 8. The bill
// ---------------------------------------------------------------------------

const boq = buildBoq("Test villa", [
  itemFromQuantity("F", "200 mm HCB walling", net!, { rate: 850 }),
  itemFromQuantity("J", "Cement plaster, two faces", faces, { rate: 320 }),
  itemFromQuantity("M", "Interior emulsion, two coats", faces, { rate: 180 }),
  itemFromQuantity("C", "C25 concrete to columns", columnVolume!, { rate: 7800 }),
]);

check("only the sections with items appear", boq.sections.length === 4);
check(
  "and they are in bill order",
  boq.sections.map((section) => section.code).join("") === "CFJM",
  boq.sections.map((s) => s.code).join(""),
);
check("every item has a reference", allItems(boq).every((item) => /^[A-W]\.\d\d$/.test(item.ref)));
check(
  "amount is quantity × rate",
  near(
    allItems(boq).find((item) => item.section === "F")?.amount ?? 0,
    (net?.value ?? 0) * 850,
    0.02,
  ),
);
check("the bill totals", boq.total !== null && boq.total > 0);
check(
  "and the total is the sum of the sections",
  near(
    boq.total ?? 0,
    boq.sections.reduce((sum, section) => sum + (section.total ?? 0), 0),
    0.02,
  ),
);
check("section titles are the standard ones", sectionTitle("M") === "Painting");
check("there are 23 sections defined, A to W", BOQ_SECTIONS.length === 23);

// An unpriced bill is honest about it rather than showing a partial total.
//
// The two items are deliberately in the *same* section. An earlier version of
// this test put them in different sections, so the section with the unpriced
// item had nothing else in it — and a mutation changing `every` to `some`
// passed, because one-of-one is the same either way. A partial total is only
// possible where a section is part priced.
const unpriced = buildBoq("Tender bill", [
  itemFromQuantity("F", "Walling", net!),
  itemFromQuantity("F", "Blockwork to parapet", net!, { rate: 850 }),
  itemFromQuantity("J", "Plaster", faces, { rate: 320 }),
]);
check(
  "a part-priced section shows no total at all",
  unpriced.sections[0]?.total === null,
  `${unpriced.sections[0]?.total}`,
);
check(
  "even though one of its items is priced",
  (unpriced.sections[0]?.items ?? []).some((item) => item.amount !== null),
);
check(
  "and the fully priced section still totals",
  (unpriced.sections[1]?.total ?? 0) > 0,
);
check("and the bill untotalled", unpriced.total === null);
check("and it is counted", unpriced.unpricedItems === 1);
check(
  "with a warning a reader can act on",
  boqWarnings(unpriced).some((warning) => warning.includes("no rate")),
);

// An estimated quantity is flagged in the bill, not just in the model.
const estimated = buildBoq("Estimated", [
  itemFromQuantity("M", "Painting", halfArea!, { rate: 180 }),
]);
check("an AI-derived quantity is counted", estimated.estimatedItems === 1);
check(
  "and warned about",
  boqWarnings(estimated).some((warning) => warning.includes("AI estimate")),
  boqWarnings(estimated).join(" | "),
);
check(
  "a measured one is not",
  buildBoq("Measured", [itemFromQuantity("F", "Walling", net!, { rate: 1 })])
    .estimatedItems === 0,
);

// ---------------------------------------------------------------------------
// 9. Traceability, both ways
// ---------------------------------------------------------------------------

const masonryItem = allItems(boq).find((item) => item.section === "F")!;

check(
  "a bill line knows which elements it was measured from",
  masonryItem.elementIds.includes("WALL-104"),
);
check(
  "including the openings that were deducted",
  masonryItem.elementIds.includes("D-01") && masonryItem.elementIds.includes("W-01"),
  "clicking the line would not highlight the openings taken out of it",
);
check(
  "a bill line carries its formula, so it can be checked without the model",
  (masonryItem.formula ?? "").includes("="),
);
check("and its provenance", masonryItem.source === "bim");

// The reverse: from an element to everything it paid for.
const fromWall = itemsForElement(boq, "WALL-104");
check(
  "one wall appears in masonry, plaster and paint",
  fromWall.length === 3,
  `${fromWall.length} lines`,
);
check(
  "and not in the concrete",
  fromWall.every((item) => item.section !== "C"),
);
check(
  "the column appears only in the concrete",
  itemsForElement(boq, "C-01").every((item) => item.section === "C"),
);
check(
  "an element nobody measured appears nowhere",
  itemsForElement(boq, "NOT-A-THING").length === 0,
);

// The chain, end to end: element → measurement → item → back to element.
const chain = itemsForElement(boq, "WALL-104")
  .flatMap((item) => item.elementIds)
  .includes("WALL-104");
check("the chain closes", chain);

// ---------------------------------------------------------------------------
// 10. Matching a BOQ line to something somebody sells
// ---------------------------------------------------------------------------

const catalogue: MatchCandidate[] = [
  { id: "p-hcb200", title: "Hollow Concrete Block 200mm", category: "Blocks", unit: "pc", price: 42 },
  { id: "p-hcb150", title: "Hollow Concrete Block 150mm", category: "Blocks", unit: "pc", price: 35 },
  { id: "p-cement", title: "Dangote Ordinary Portland Cement 50kg", category: "Cement", unit: "bag", price: 1150 },
  { id: "p-paint", title: "Interior Emulsion Paint White 20L", category: "Paint", unit: "bucket", price: 3200 },
  { id: "p-alu", title: "Aluminium Profile 40x40 Black Anodised", category: "Aluminium", unit: "bar", price: 4000 },
  { id: "p-alu-m", title: "Aluminium Profile 40x40 Black Anodised", category: "Aluminium", unit: "m", price: 700 },
];

const blocks = matchMaterial(
  { description: "Supply and fix 200 mm HCB walling in cement mortar", unit: "pc" },
  catalogue,
);
check("the 200 mm block is found", blocks.best?.candidate.id === "p-hcb200", blocks.best?.candidate.id);
check("and not the 150", blocks.best?.candidate.id !== "p-hcb150");
check("with no 'no match' message", blocks.message === null);
check(
  "and the words that matched are shown",
  blocks.best?.matched.includes("200") ?? false,
  blocks.best?.matched.join(",") ?? "no match",
);

// The size is the product. A mismatched number is a different thing, not a
// near miss.
const wrongSize = scoreMatch(
  { description: "150 mm HCB", unit: "pc" },
  catalogue[0]!,
);
check(
  "a stated size that disagrees scores near zero",
  wrongSize.score < 0.2,
  `${wrongSize.score}`,
);

// Nothing plausible must produce nothing, in the brief's words.
const nothing = matchMaterial(
  { description: "Structural glazing spider fitting", unit: "pc" },
  catalogue,
);
check("an unmatched material has no best", nothing.best === null);
check(
  "and says so in the words the brief asked for",
  nothing.message?.startsWith("No exact Marketplace match") ?? false,
  nothing.message ?? "",
);

// A listing in the wrong unit is never silently chosen.
const wrongUnit = matchMaterial(
  { description: "Interior emulsion paint", unit: "L" },
  catalogue,
);
check(
  "a paint sold by the bucket does not price a quantity in litres",
  wrongUnit.best === null,
  wrongUnit.best?.candidate.id,
);
check(
  "but it is still offered so somebody can choose it",
  wrongUnit.matches.some((match) => match.candidate.id === "p-paint"),
);
check(
  "and it is marked unusable",
  wrongUnit.matches.find((m) => m.candidate.id === "p-paint")?.usable === false,
);

// Two listings for one product in different units: the one that matches the
// quantity wins, which is the same rule that stops the four-times-too-big
// quotation at the other end of the chain.
const inBars = matchMaterial(
  { description: "Aluminium profile 40x40 black anodised", unit: "bar" },
  catalogue,
);
const inMetres = matchMaterial(
  { description: "Aluminium profile 40x40 black anodised", unit: "m" },
  catalogue,
);
check("asked in bars, the per-bar listing wins", inBars.best?.candidate.id === "p-alu");
check("asked in metres, the per-metre one does", inMetres.best?.candidate.id === "p-alu-m");

// Noise words must not carry a match on their own.
check(
  "supply-and-fix boilerplate alone matches nothing",
  matchMaterial({ description: "Supply and install as specified", unit: "pc" }, catalogue)
    .best === null,
);
check("noise words are stripped", !terms("supply and fix the item").includes("supply"));
check("real words survive", terms("200 mm HCB walling").includes("hcb"));

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
}

console.log(
  `\n${failures.length === 0 ? GREEN : RED}${passed} passed, ${failures.length} failed${RESET}` +
    `\n${DIM}takeoff: the software does the arithmetic, and says where the numbers came from${RESET}\n`,
);

process.exit(failures.length === 0 ? 0 : 1);
