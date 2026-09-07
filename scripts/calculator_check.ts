/**
 * The Construction Calculators: the arithmetic, and the wiring around it.
 *
 *   npx tsx scripts/calculator_check.ts
 *
 * ## What this is actually guarding
 *
 * A calculator that is wrong is worse than a calculator that is missing.
 * Somebody orders concrete against these numbers, so the bulk of what follows
 * is not "does it render" but "is 8 × 6 × 0.15 still 7.2 m³, and does 25%
 * markup still come out as a 20% margin".
 *
 * Every arithmetic check states the expected value as a literal worked out by
 * hand, never by calling the function a second time — a check that computes its
 * own expectation from the code under test passes whatever the code does.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { CALCULATORS, calculatorBySlug, populatedCategories, searchCalculators } from "../src/lib/calculators/registry";
import { initialState, validate, safeText } from "../src/lib/calculators/validate";
import { carcassParts } from "../src/lib/calculators/furniture";
import { stairs, slope } from "../src/lib/calculators/geometry";
import { barsForSpan, sectionAreaM2 } from "../src/lib/calculators/steel";
import { roofArea, roofingSheets, slopeFactorFromDegrees } from "../src/lib/calculators/roofing";
import { cementSandForVolume } from "../src/lib/calculators/mixes";
import { fromMarkup, fromPrice, vat, buildCost } from "../src/lib/calculators/cost";
import { round, toMetres, fromMetres, areaInSquareMetres, volumeInCubicMetres, massInKg } from "../src/lib/calculators/units";
import { studioKindFor, calculatorSlugForKind } from "../src/lib/calculators/studio";
import type { Values } from "../src/lib/calculators/types";

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

/** Floating point: two numbers agree to the precision a builder cares about. */
function near(actual: number, expected: number, tolerance = 1e-6): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/** Comments stripped, so an explanation cannot satisfy its own assertion. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function walkAll(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walkAll(full) : [full];
  });
}

/** Run a calculator by slug. Fails loudly rather than returning a default. */
function run(slug: string, values: Values) {
  const spec = calculatorBySlug(slug);
  if (!spec?.compute) throw new Error(`No computable calculator "${slug}"`);
  return spec.compute(values);
}

const numeric = (line: string) => Number(line.replace(/,/g, ""));

// ---------------------------------------------------------------------------
// 1. The catalogue is complete and coherent
// ---------------------------------------------------------------------------

check("all forty-one calculators are registered", CALCULATORS.length === 41, `found ${CALCULATORS.length}`);
check("every category has something in it", populatedCategories().length === 11);
check(
  "every calculator has a slug, a title, a summary and keywords",
  CALCULATORS.every(
    (one) => one.slug && one.title && one.summary && one.keywords.length > 0,
  ),
);
check(
  "every slug is URL-safe",
  CALCULATORS.every((one) => /^[a-z0-9-]+$/.test(one.slug)),
  CALCULATORS.filter((one) => !/^[a-z0-9-]+$/.test(one.slug)).map((one) => one.slug).join(", "),
);
check(
  "every calculator either computes or names its own component",
  CALCULATORS.every((one) => Boolean(one.compute) !== Boolean(one.custom)),
);
check(
  "the three bespoke ones are the BOQ, the material list and the converter",
  CALCULATORS.filter((one) => one.custom).map((one) => one.slug).sort().join(",") ===
    "boq,material-cost,unit-converter",
);

// Structural calculators must carry the disclaimer flag. This is a safety
// requirement from the brief, not a presentation choice.
for (const slug of ["footing", "column", "beam", "rebar-weight", "rebar-quantity"]) {
  check(`${slug} is marked structural, so it prints the engineering notice`, calculatorBySlug(slug)?.structural === true);
}

// ---------------------------------------------------------------------------
// 2. Unit conversion
//
// The definitions are exact, so these are exact.
// ---------------------------------------------------------------------------

check("a foot is 0.3048 m exactly", toMetres(1, "ft") === 0.3048);
check("an inch is 0.0254 m exactly", toMetres(1, "in") === 0.0254);
check("a yard is 0.9144 m exactly", toMetres(1, "yd") === 0.9144);
check("a pound is 0.45359237 kg exactly", massInKg(1, "lb") === 0.45359237);
check("a square foot is a foot squared", near(areaInSquareMetres(1, "ft2"), 0.3048 ** 2));
check("a cubic foot is a foot cubed", near(volumeInCubicMetres(1, "ft3"), 0.3048 ** 3));
check("a litre is a thousandth of a cubic metre", near(volumeInCubicMetres(1, "litre"), 0.001));
check("3 m is 3000 mm", near(fromMetres(3, "mm"), 3000));
check("100 m is 328.084 ft", near(fromMetres(100, "ft"), 328.0839895, 1e-6));
check("a round trip through feet returns the original", near(fromMetres(toMetres(12.5, "ft"), "ft"), 12.5, 1e-9));

// Rounding: the case that breaks the naive `Math.round(x * 100) / 100`.
check("1.005 rounds to 1.01, not 1.00", round(1.005, 2) === 1.01);
check("2.675 rounds to 2.68", round(2.675, 2) === 2.68);
check("a non-finite value rounds to zero rather than NaN", round(Number.POSITIVE_INFINITY) === 0);
check("NaN rounds to zero rather than propagating", round(Number.NaN) === 0);

// ---------------------------------------------------------------------------
// 3. Concrete
// ---------------------------------------------------------------------------

{
  // 8 × 6 × 0.15 = 7.2 m³; +5% = 7.56.
  const out = run("concrete-slab", { length: 8, width: 6, thickness: 0.15, grade: "C25", waste: 5 });
  check("a 8 × 6 × 0.15 m slab is 7.560 m³ ordered", out.headline.value === "7.560", out.headline.value);
  check("and its area is reported as 48 m²", out.lines.some((l) => l.value === "48.00"));
}

{
  // A 400 mm circular column, 3 m high: π × 0.2² × 3 = 0.376991 m³.
  const out = run("concrete", { shape: "circular", diameter: 0.4, height: 3, members: 1, grade: "C25", waste: 0 });
  check("a Ø400 × 3 m circular column is 0.377 m³", out.headline.value === "0.377", out.headline.value);
}

{
  // 18 columns, 300 × 400 × 3 m = 0.36 m³ each = 6.48 m³.
  const out = run("column", { shape: "rect", width: 0.3, depth: 0.4, height: 3, members: 18, grade: "C25", waste: 0 });
  check("18 columns of 300 × 400 × 3000 come to 6.480 m³", out.headline.value === "6.480", out.headline.value);
}

{
  // A beam 0.25 × 0.5 × 6, formwork = (0.25 + 2 × 0.5) × 6 = 7.5 m².
  const out = run("beam", { width: 0.25, height: 0.5, length: 6, members: 1, grade: "C25", waste: 0 });
  check("a 250 × 500 × 6000 beam is 0.750 m³", out.headline.value === "0.750", out.headline.value);
  check("and its formwork is 7.50 m² — soffit plus two sides", out.lines.some((l) => l.value === "7.50"));
}

// ---------------------------------------------------------------------------
// 4. Steel
// ---------------------------------------------------------------------------

{
  // d²/162: 12² ÷ 162 = 0.888888…; × 12 m × 10 = 106.67 kg.
  const out = run("rebar-weight", { diameter: "12", length: 12, quantity: 10 });
  check("120 m of Y12 weighs 106.67 kg", out.headline.value === "106.67", out.headline.value);
  const out16 = run("rebar-weight", { diameter: "16", length: 1, quantity: 1 });
  check("Y16 is 1.5802 kg/m", out16.lines.some((l) => l.value === "1.5802"), JSON.stringify(out16.lines[0]));
}

{
  // The fencepost rule: 4 m clear span at 200 mm centres is 21 bars, not 20.
  const run1 = barsForSpan({ spanAcross: 4, spanAlong: 6, spacing: 0.2, diameter: 12, cover: 0 });
  check("a 4 m span at 200 mm centres takes 21 bars, not 20", run1.bars === 21, String(run1.bars));
  // Cover comes off both ends of both spans.
  const run2 = barsForSpan({ spanAcross: 4, spanAlong: 6, spacing: 0.2, diameter: 12, cover: 0.025 });
  check("cover shortens the bar at both ends", near(run2.barLength, 5.95), String(run2.barLength));
  check("and narrows the span it is spaced across", run2.bars === 20, String(run2.bars));
  check("an impossible span yields no bars rather than a negative count", barsForSpan({ spanAcross: 0.01, spanAlong: 1, spacing: 0.2, diameter: 12, cover: 0.5 }).bars === 0);
}

{
  // Section areas, by hand.
  check("a Ø50 round bar is 1963.5 mm²", near(sectionAreaM2("round", { a: 50 }).area * 1e6, 1963.4954, 1e-3));
  // An angle shares its corner: (50 + 50 − 6) × 6 = 564 mm², not 600.
  check("a 50 × 50 × 6 angle is 564 mm², not 600", near(sectionAreaM2("angle", { a: 50, b: 50, t: 6 }).area * 1e6, 564, 1e-6));
  // A 50 square tube, 3 mm wall: 50² − 44² = 2500 − 1936 = 564 mm².
  check("a 50 × 50 × 3 SHS is 564 mm²", near(sectionAreaM2("square_tube", { a: 50, t: 3 }).area * 1e6, 564, 1e-6));
  // Plate 100 × 10 = 1000 mm².
  check("a 100 × 10 flat is 1000 mm²", near(sectionAreaM2("flat", { a: 100, b: 10 }).area * 1e6, 1000, 1e-9));
}

{
  // 0.0019634954 m² × 6 m × 7850 = 92.48 kg.
  const out = run("steel-weight", { section: "round", a: 50, length: 6, pieces: 1 });
  check("a Ø50 bar 6 m long weighs 92.48 kg", out.headline.value === "92.48", out.headline.value);
}

// ---------------------------------------------------------------------------
// 5. Masonry and mixes
// ---------------------------------------------------------------------------

{
  // A 10 × 2.8 wall less a 1.89 m² door = 26.11 m².
  // HCB 400 × 200 with a 10 mm joint: 1 ÷ (0.41 × 0.21) = 11.614 blocks/m².
  const out = run("block", { length: 10, height: 2.8, walls: 1, openings: 1.89, block: "hcb-200", joint: 0.01, waste: 5 });
  check("a 10 × 2.8 m wall less a door is 26.11 m²", out.lines.some((l) => l.value === "26.11"));
  check("HCB 400 × 200 at a 10 mm joint is 11.61 blocks/m²", out.lines.some((l) => l.value === "11.61"));
  // ceil(26.11 × 11.614) = ceil(303.24) = 304; +5% → ceil(319.2) = 320.
  check("which is 304 blocks, 320 with waste", out.headline.value === "320", out.headline.value);
}

{
  // 1 m³ wet at 1:4, no waste: dry 1.33; cement 0.266 m³ ÷ 0.0347 = 7.66 → 8 bags.
  const mix = cementSandForVolume(1, "1:4", 0);
  check("1 m³ of 1:4 mortar has a dry volume of 1.330 m³", near(mix.dryVolume, 1.33));
  check("and needs 8 bags of cement, rounded up from 7.66", mix.cementBags === 8, String(mix.cementBags));
  check("and 1.06 m³ of sand", near(mix.sandM3, 1.06, 0.005), String(mix.sandM3));
  check("cement is reported in kilogrammes too", mix.cementKg === 400);
}

// ---------------------------------------------------------------------------
// 6. Finishing
// ---------------------------------------------------------------------------

{
  // 4 × 3.5 = 14 m²; 600 × 600 tiles are 0.36 m² → ceil(38.9) = 39;
  // +10% → ceil(42.9) = 43; ⌈43 ÷ 4⌉ = 11 boxes.
  const out = run("tile", { surface: "floor", length: 4, width: 3.5, openings: 0, tileLength: 600, tileWidth: 600, perBox: 4, waste: 10 });
  check("a 4 × 3.5 m floor in 600 mm tiles is 11 boxes", out.headline.value === "11", out.headline.value);
  check("39 tiles cover it, 43 with cutting waste", out.lines.some((l) => l.value === "39") && out.lines.some((l) => l.value === "43"));
}

{
  // 4 walls of 10 × 2.8 = 112 m², two coats at 12 m²/L = 18.67 L, +5% = 19.6 L,
  // one 20 L tin.
  const out = run("paint", { length: 10, height: 2.8, walls: 4, openings: 0, system: "emulsion-interior", coats: 2, waste: 5 });
  check("112 m² in two coats of interior emulsion is one 20 L tin", out.headline.value === "1", out.headline.value);
  check("which is 19.60 L", out.lines.some((l) => l.value === "19.60"), JSON.stringify(out.lines.map((l) => l.value)));
}

// ---------------------------------------------------------------------------
// 7. Roofing
// ---------------------------------------------------------------------------

check("a 30° pitch has a slope factor of 1.1547", near(slopeFactorFromDegrees(30), 1.15470054, 1e-6));
check("a 45° pitch has a slope factor of √2", near(slopeFactorFromDegrees(45), Math.SQRT2, 1e-9));
check("a flat roof has a factor of 1", near(slopeFactorFromDegrees(0), 1, 1e-12));

{
  // 12 × 8 with 0.6 m overhang all round = 13.2 × 9.2 = 121.44 m² plan.
  const gable = roofArea({ type: "gable", length: 12, width: 8, overhang: 0.6, pitchDegrees: 30 });
  check("a 12 × 8 building with 600 mm eaves has a 121.440 m² plan", near(gable.planArea, 121.44, 1e-3));
  check("and a 140.23 m² roof at 30°", near(gable.surfaceArea, 140.234, 1e-2), String(gable.surfaceArea));
  const hip = roofArea({ type: "hip", length: 12, width: 8, overhang: 0.6, pitchDegrees: 30 });
  check("a hip roof over the same rectangle has the same area", near(hip.surfaceArea, gable.surfaceArea, 1e-9));
  check("and says so, rather than pretending otherwise", hip.notes.length > 0);
  const flat = roofArea({ type: "flat", length: 12, width: 8, overhang: 0.6, pitchDegrees: 30 });
  check("a flat roof ignores the pitch entirely", near(flat.surfaceArea, flat.planArea, 1e-9));
}

{
  // 2 × 0.9 sheets, 0.15 side and 0.2 end lap: 0.75 × 1.8 = 1.35 m² covered,
  // against a nominal 1.8 m². 100 ÷ 1.35 = 75 sheets.
  const sheets = roofingSheets({ roofArea: 100, sheetLength: 2, sheetWidth: 0.9, sideLap: 0.15, endLap: 0.2, wastePercent: 0 });
  check("a 2 × 0.9 m sheet with laps covers 1.35 m², not 1.8", near(sheets.effectiveArea, 1.35, 1e-6), String(sheets.effectiveArea));
  check("so 100 m² of roof takes 75 sheets", sheets.sheets === 75, String(sheets.sheets));
  const silly = roofingSheets({ roofArea: 100, sheetLength: 2, sheetWidth: 0.9, sideLap: 1, endLap: 3, wastePercent: 0 });
  check("laps larger than the sheet are refused, not divided by", silly.sheets === 0);
}

// ---------------------------------------------------------------------------
// 8. Stairs — the one with real consequences
// ---------------------------------------------------------------------------

{
  // 3.0 m at a preferred 175 mm: round(17.14) = 17 risers of 176.47 mm,
  // 16 treads.
  const flight = stairs({ floorToFloor: 3, preferredRiser: 0.175, treadDepth: 0.28 });
  check("a 3 m storey at 175 mm gives 17 risers", flight?.risers === 17, String(flight?.risers));
  check("of 176.5 mm each, all identical", near((flight?.riserHeight ?? 0) * 1000, 176.4706, 1e-3));
  check("with 16 treads — one fewer than the risers", flight?.treads === 16, String(flight?.treads));
  check("and a 4.48 m run", near(flight?.totalRun ?? 0, 4.48, 1e-6), String(flight?.totalRun));
  check("at 32.22°", near(flight?.angle ?? 0, 32.22, 0.01), String(flight?.angle));
  check("which is comfortable, so nothing is flagged", (flight?.warnings.length ?? 1) === 0, flight?.warnings.join(" | "));

  // The risers must divide the height exactly — no short step at the top.
  check(
    "the risers multiply back to the storey height exactly",
    near((flight?.risers ?? 0) * (flight?.riserHeight ?? 0), 3, 1e-9),
  );

  // A steep flight is called out.
  const steep = stairs({ floorToFloor: 3, preferredRiser: 0.22, treadDepth: 0.2 });
  check("a 220 mm riser on a 200 mm tread is warned about", (steep?.warnings.length ?? 0) > 0);
  check("and the warning names the angle", steep?.warnings.some((w) => w.includes("°")) === true);

  // Not enough room is a different warning again.
  const cramped = stairs({ floorToFloor: 3, preferredRiser: 0.175, treadDepth: 0.28, availableRun: 3 });
  check("a flight that will not fit the available run says so", cramped?.warnings.some((w) => w.includes("available")) === true);

  check("a zero storey height returns nothing rather than dividing by it", stairs({ floorToFloor: 0, preferredRiser: 0.175, treadDepth: 0.28 }) === null);
}

check("a 1:20 fall is 5%", near(slope(0.15, 3)?.percent ?? 0, 5));
check("and reads as a ratio of 1 : 20", slope(0.15, 3)?.ratio === "1 : 20");
check("a 45° slope is 100%", near(slope(1, 1)?.percent ?? 0, 100));
check("a zero run returns nothing rather than Infinity", slope(1, 0) === null);

// ---------------------------------------------------------------------------
// 9. Furniture
// ---------------------------------------------------------------------------

{
  const unit = carcassParts({
    width: 2400, height: 2400, depth: 600, thickness: 18, backThickness: 6,
    sections: 3, shelvesPerSection: 3, doors: 3, drawers: 0, toeKick: 100,
  });

  // (2400 − 36 − 36) ÷ 3 = 776 mm.
  check("three bays in a 2400 mm carcass are 776 mm each", near(unit.bayWidth, 776), String(unit.bayWidth));

  // The rule that matters: the top sits between the sides.
  const top = unit.parts.find((p) => p.label === "Top");
  check("the top is 2364 mm — the width less two board thicknesses", top?.length === 2364, String(top?.length));

  const side = unit.parts.find((p) => p.label === "Side panel (gable)");
  check("the sides run the full carcass height of 2300 mm", side?.length === 2300, String(side?.length));
  check("and there are two of them", side?.quantity === 2);

  const dividers = unit.parts.find((p) => p.label === "Divider");
  check("three bays need two dividers", dividers?.quantity === 2, String(dividers?.quantity));

  const shelves = unit.parts.find((p) => p.label === "Shelf");
  check("three bays of three shelves is nine shelves", shelves?.quantity === 9, String(shelves?.quantity));

  // A 2294 mm door needs four hinges, not two.
  const hinges = unit.hardware.find((h) => h.label.includes("hinge") || h.label.includes("Hinge"));
  check("a 2.3 m door gets four hinges", hinges?.quantity === 12, JSON.stringify(hinges));

  check("every part has a positive area", unit.parts.every((p) => p.area > 0));
  check("the board area is the sum of the parts", near(unit.boardArea, round(unit.parts.reduce((s, p) => s + p.area, 0), 3), 1e-3));
  check("the sheet count is a whole number of sheets", Number.isInteger(unit.sheets) && unit.sheets > 0);

  // A bay wide enough to sag is flagged.
  const wide = carcassParts({ width: 2000, height: 2000, depth: 600, thickness: 18, backThickness: 6, sections: 1, shelvesPerSection: 3, doors: 0, drawers: 0, toeKick: 0 });
  check("a 1964 mm shelf is warned about for sagging", wide.warnings.some((w) => w.includes("sag")));

  // Too many sections for the width is refused rather than producing negatives.
  const impossible = carcassParts({ width: 300, height: 2000, depth: 600, thickness: 18, backThickness: 6, sections: 20, shelvesPerSection: 1, doors: 0, drawers: 0, toeKick: 0 });
  check("twenty sections in 300 mm is refused, not negative", impossible.warnings.length > 0 && impossible.bayWidth <= 0);
  check("and no part is emitted with a negative dimension", impossible.parts.every((p) => p.length > 0 && p.width > 0));
}

{
  // 4200 ÷ 600 = 7 modules exactly, no filler.
  const out = run("kitchen", { runLength: 4200, moduleWidth: 600, height: 870, depth: 600, shelves: 1, doors: 1, drawers: 0, toeKick: 100, worktop: 38, thickness: 18, backThickness: 6 });
  check("a 4200 mm run in 600 mm modules is seven modules", out.lines.some((l) => l.value === "7"));
  check("with no filler", out.lines.some((l) => l.label.includes("Filler") && l.value === "0"));

  // 4300 leaves a 100 mm filler.
  const odd = run("kitchen", { runLength: 4300, moduleWidth: 600, height: 870, depth: 600, shelves: 1, doors: 1, drawers: 0, toeKick: 100, worktop: 38, thickness: 18, backThickness: 6 });
  check("a 4300 mm run leaves a 100 mm filler", odd.lines.some((l) => l.label.includes("Filler") && l.value === "100"));

  // A run too short for one module says so rather than emitting a cut list.
  const tiny = run("kitchen", { runLength: 400, moduleWidth: 600, height: 870, depth: 600, shelves: 1, doors: 1, drawers: 0, toeKick: 100, worktop: 38, thickness: 18, backThickness: 6 });
  check("a run shorter than one module is refused", (tiny.warnings?.length ?? 0) > 0 && tiny.headline.value === "0");
}

// ---------------------------------------------------------------------------
// 10. Money — where getting it wrong costs the most
// ---------------------------------------------------------------------------

check("25% markup on 100 gives a price of 125", fromMarkup(100, 25).price === 125);
check("and that is a 20% margin, not 25%", fromMarkup(100, 25).marginPercent === 20);
check("100 cost at 125 price is a 20% margin", fromPrice(100, 125).marginPercent === 20);
check("and a 25% markup", fromPrice(100, 125).markupPercent === 25);
check("markup and margin round-trip", fromPrice(100, fromMarkup(100, 40).price).markupPercent === 40);
check("a price below cost gives a negative profit, not zero", fromPrice(100, 80).profit === -20);

check("15% VAT on 100 is 15", vat(100, 15, false).tax === 15);
check("and a gross of 115", vat(100, 15, false).gross === 115);
check("115 inclusive of 15% VAT has a net of 100", vat(115, 15, true).net === 100);
check("and a tax of 15", vat(115, 15, true).tax === 15);
// The wrong method: 115 × 0.85 = 97.75, which is 2.25% low.
check("dividing, not multiplying — 115 × 0.85 would be 97.75", vat(115, 15, true).net !== 97.75);
check("a zero rate leaves the amount alone", vat(500, 0, false).gross === 500);

{
  // Waste on material only; contingency on everything.
  // 1000 material +10% = 1100; +500 labour = 1600; +10% = 1760.
  const cost = buildCost({ material: 1000, labour: 500, wastePercent: 10, contingencyPercent: 10 });
  check("waste applies to the material alone: 100, not 150", cost.waste === 100, String(cost.waste));
  check("contingency applies to the whole subtotal: 160", cost.contingency === 160, String(cost.contingency));
  check("giving a total of 1760", cost.total === 1760, String(cost.total));
}

{
  // 120 m² over 2 floors = 240 m². Standard quality (×1), Addis (×1).
  // Material 240 × 12000 = 2,880,000; +5% waste = 144,000.
  // Labour 240 × 5000 = 1,200,000. Subtotal 4,224,000; +10% = 4,646,400.
  const out = run("construction-cost", { area: 120, floors: 2, materialRate: 12000, labourRate: 5000, quality: "standard", city: "addis_ababa", waste: 5, contingency: 10 });
  check("a 120 m² two-storey build at those rates totals 4,646,400", out.headline.value === "4646400.00", out.headline.value);
  check("which is 19,360 per m²", out.lines.some((l) => l.value === "19360.00"), JSON.stringify(out.lines.map((l) => l.value)));
}

// ---------------------------------------------------------------------------
// 11. Validation — nothing unusable reaches an answer
// ---------------------------------------------------------------------------

{
  const spec = calculatorBySlug("concrete-slab")!;
  const state = initialState(spec.fields);

  check("a blank required field is an error, not a zero", Object.keys(validate(spec.fields, state).errors).length > 0);

  const negative = { ...state, length: { raw: "-5", unit: "m" as const } };
  check("a negative dimension is refused", validate(spec.fields, negative).errors.length !== undefined && "length" in validate(spec.fields, negative).errors);

  const nonsense = { ...state, length: { raw: "abc", unit: "m" as const } };
  check("a word where a number goes is refused", "length" in validate(spec.fields, nonsense).errors);

  const huge = { ...state, length: { raw: "1e400", unit: "m" as const } };
  check("a value too large to represent is refused, not passed as Infinity", "length" in validate(spec.fields, huge).errors);

  const filled = {
    length: { raw: "8", unit: "m" as const },
    width: { raw: "6", unit: "m" as const },
    thickness: { raw: "150", unit: "mm" as const },
    grade: { raw: "C25", unit: "m" as const },
    waste: { raw: "5", unit: "m" as const },
  };
  const good = validate(spec.fields, filled);
  check("a complete form validates", Object.keys(good.errors).length === 0, JSON.stringify(good.errors));
  check("and thickness typed in mm reaches compute as metres", good.values.thickness === 0.15, String(good.values.thickness));

  // An optional field left blank takes its default rather than blocking.
  const noWaste = { ...filled, waste: { raw: "", unit: "m" as const } };
  const optional = validate(spec.fields, noWaste);
  check("an optional field left blank does not block the form", Object.keys(optional.errors).length === 0);
  check("and arrives as its default", optional.values.waste === 5);
}

{
  // A hidden field must not block the form it is not on.
  const spec = calculatorBySlug("concrete")!;
  const circular = {
    ...initialState(spec.fields),
    shape: { raw: "circular", unit: "m" as const },
    diameter: { raw: "400", unit: "mm" as const },
    height: { raw: "3", unit: "m" as const },
  };
  const result = validate(spec.fields, circular);
  check(
    "the width field, hidden for a circular column, does not block the form",
    Object.keys(result.errors).length === 0,
    JSON.stringify(result.errors),
  );
  check("and is not passed to compute at all", !("width" in result.values));
}

// An integer field refuses a fraction: you cannot build 2.5 columns.
{
  const spec = calculatorBySlug("column")!;
  const state = {
    ...initialState(spec.fields),
    width: { raw: "300", unit: "mm" as const },
    depth: { raw: "400", unit: "mm" as const },
    height: { raw: "3", unit: "m" as const },
    members: { raw: "2.5", unit: "m" as const },
  };
  check("two and a half columns is refused", "members" in validate(spec.fields, state).errors);
}

check("safeText turns NaN into a dash", safeText("NaN") === "—");
check("and Infinity into a dash", safeText("Infinity") === "—");
check("and leaves a real number alone", safeText("7.560") === "7.560");

// ---------------------------------------------------------------------------
// 12. No calculator can print NaN or Infinity from zeroed input
//
// Every calculator, run with every field at zero — the worst case a reader can
// reach by clearing the form — must still produce printable text.
// ---------------------------------------------------------------------------

for (const spec of CALCULATORS) {
  if (!spec.compute) continue;
  const zeroed: Values = {};
  for (const field of spec.fields) {
    zeroed[field.id] = field.kind === "select" ? field.defaultValue : 0;
  }

  let output;
  try {
    output = spec.compute(zeroed);
  } catch (error) {
    check(`${spec.slug} survives an all-zero form`, false, String(error));
    continue;
  }

  const printed = [
    output.headline.value,
    ...output.lines.map((line) => line.value),
    ...(output.tables ?? []).flatMap((table) => table.rows.flat()),
  ];

  check(
    `${spec.slug} prints no NaN or Infinity from an empty form`,
    printed.every((value) => !/NaN|Infinity/.test(value)),
    printed.filter((value) => /NaN|Infinity/.test(value)).join(", "),
  );
  check(
    `${spec.slug} shows its working`,
    output.formula.length > 0,
  );
}

// ---------------------------------------------------------------------------
// 13. No calculator prints a negative quantity from positive input
// ---------------------------------------------------------------------------

for (const spec of CALCULATORS) {
  if (!spec.compute || spec.category === "business" || spec.category === "construction" || spec.category === "cost") continue;
  const filled: Values = {};
  for (const field of spec.fields) {
    filled[field.id] =
      field.kind === "select" ? field.defaultValue : field.kind === "number" ? (field.defaultValue ?? 2) : 2;
  }

  const output = spec.compute(filled);
  const quantities = [output.headline.value, ...output.lines.map((l) => l.value)].map(numeric);
  check(
    `${spec.slug} yields no negative quantity from positive dimensions`,
    quantities.every((value) => Number.isNaN(value) || value >= 0),
    output.lines.filter((l) => numeric(l.value) < 0).map((l) => `${l.label}=${l.value}`).join(", "),
  );
}

// ---------------------------------------------------------------------------
// 14. Search
// ---------------------------------------------------------------------------

check("searching 'concrete' finds the concrete calculator first", searchCalculators("concrete")[0]?.slug === "concrete");
check("searching 'paint' finds paint", searchCalculators("paint")[0]?.slug === "paint");
check("searching 'wardrobe' finds the wardrobe", searchCalculators("wardrobe")[0]?.slug === "wardrobe");
check("searching 'rebar' finds a rebar calculator", searchCalculators("rebar")[0]?.slug.startsWith("rebar") === true);
check("searching 'tile' finds tile", searchCalculators("tile")[0]?.slug === "tile");
check("a keyword that is not in any title still finds its calculator", searchCalculators("korkoro").some((one) => one.slug === "roofing-material"));
check("searching 'hcb' finds the block calculator", searchCalculators("hcb").some((one) => one.slug === "block"));
check("an empty query returns nothing rather than everything", searchCalculators("   ").length === 0);
check("a query matching nothing returns nothing", searchCalculators("zzzzqqq").length === 0);
check("search is case-insensitive", searchCalculators("CONCRETE")[0]?.slug === "concrete");

// ---------------------------------------------------------------------------
// 15. The Studio bridge is real, not decorative
// ---------------------------------------------------------------------------

check("the wardrobe calculator maps to the studio's wardrobe", studioKindFor("wardrobe") === "wardrobe");
check("the kitchen calculator maps to the studio's kitchen", studioKindFor("kitchen") === "kitchen");
check("the TV unit maps across the naming difference", studioKindFor("tv-unit") === "tv_unit");
check("a non-furniture calculator maps to nothing", studioKindFor("concrete") === null);
check("the mapping reverses", calculatorSlugForKind("wardrobe") === "wardrobe");

{
  const studio = code("src/app/studio/page.tsx");
  check("the studio page reads the kind from the URL", /searchParams/.test(studio) && /kind/.test(studio));
  check("and validates it against the real design kinds", /designKinds as readonly string\[\]\)\.includes\(kind\)/.test(studio));
  check("and passes it to the workspace", /opening=\{opening\}/.test(studio));

  const workspace = code("src/features/berchuma-studio/components/studio-workspace.tsx");
  check("the workspace builds the opening design", /startingDesign\(opening\.kind/.test(workspace));

  const hook = code("src/features/berchuma-studio/hooks/use-design.ts");
  check(
    "and holds it from the first render rather than pushing it in from an effect",
    /useState<Held>\(\(\) =>/.test(hook) && !/useEffect/.test(hook),
  );
}

// ---------------------------------------------------------------------------
// 16. Wiring: navigation, home, sitemap
// ---------------------------------------------------------------------------

{
  const nav = code("src/lib/workspace/navigation.ts");
  check("the calculators are in the navigation manifest", /id: "calculators"/.test(nav));
  check("with a real href", /href: "\/calculators"/.test(nav));
  // One list drives the sidebar, the More sheet, the palette and breadcrumbs,
  // so being in it is what makes it reachable everywhere at once.
  check("under Construction, next to the other construction tools", nav.indexOf('id: "calculators"') > nav.indexOf('id: "construction"'));
  // Not private: the brief said basic calculators must work signed out.
  const entry = nav.slice(nav.indexOf('id: "calculators"'), nav.indexOf('id: "takeoff"'));
  check("and not gated behind a sign-in", !/private: true/.test(entry));

  const home = code("src/app/page.tsx");
  check("the home page carries a calculators section", /<CalculatorRail \/>/.test(home));

  const sitemap = code("src/app/sitemap.ts");
  check("every calculator is in the sitemap", /CALCULATOR_ROUTES/.test(sitemap));
  check("and the hub is too", /path: "\/calculators"/.test(sitemap));
  check("the calculator routes are actually emitted, not just declared", /\[\.\.\.STATIC_ROUTES, \.\.\.CALCULATOR_ROUTES\]/.test(sitemap));
}

// ---------------------------------------------------------------------------
// 17. Mobile and accessibility
// ---------------------------------------------------------------------------

{
  const field = code("src/components/calculators/field-input.tsx");
  check("number inputs ask for the decimal keypad", /inputMode="decimal"/.test(field));
  check("every input is tied to its label by id", /htmlFor=\{id\}/.test(field) && /id=\{id\}/.test(field));
  check("errors are announced, not just coloured", /role="alert"/.test(field));
  check("and are linked to the field that caused them", /aria-describedby/.test(field));
  check("an invalid field says so to a screen reader", /aria-invalid/.test(field));
  check("the unit dropdown is labelled", /aria-label=\{`Unit for/.test(field));
  check("touch targets are at least 44px tall", /h-11/.test(field));
  check("nothing can overflow its column", /min-w-0/.test(field));

  const results = code("src/components/calculators/results-panel.tsx");
  check("every printed value is guarded against NaN", /safeText\(/.test(results));
  check("the working is behind a real expandable control", /aria-expanded=\{showWorking\}/.test(results));
  check("wide tables scroll inside their own box", /overflow-x-auto/.test(results));
  check("the structural notice is printed when the flag is set", /structural &&/.test(results));

  // Every calculator page clears the fixed bottom navigation.
  for (const path of ["src/app/calculators/page.tsx", "src/app/calculators/[slug]/page.tsx", "src/app/calculators/saved/page.tsx"]) {
    check(`${path} clears the bottom navigation bar`, /--bottom-nav-h/.test(code(path)));
  }
}

// ---------------------------------------------------------------------------
// 18. Nothing invented
//
// The brief was explicit: no fake data, and no invented Ethiopian prices. The
// only numbers in the cost calculators should be percentages and multipliers
// the reader can see and change.
// ---------------------------------------------------------------------------

{
  const cost = code("src/lib/calculators/cost.ts");
  // A birr amount hard-coded as a rate would be a made-up market price.
  const bigNumbers = (cost.match(/\b\d{4,}\b/g) ?? []).filter((n) => Number(n) > 1000);
  check(
    "no hard-coded birr amounts in the cost engine",
    bigNumbers.length === 0,
    bigNumbers.join(", "),
  );

  const spec = calculatorBySlug("construction-cost");
  check("the construction cost calculator asks for the rate rather than supplying one", spec?.fields.some((f) => f.kind === "money" && f.defaultValue === undefined) === true);
  check("and says why in a note", (spec?.note ?? "").includes("rate per square metre"));
}

// No demo or sample content anywhere in the calculator code.
{
  const files = walkAll("src/lib/calculators").concat(walkAll("src/components/calculators"));
  const offenders = files.filter((file) => {
    const body = code(file);
    return /\b(dummyData|sampleData|mockData|fakeData|DEMO_|placeholderPrice)\b/.test(body);
  });
  check("no demo, mock or sample data in the calculators", offenders.length === 0, offenders.join(", "));
}

// ---------------------------------------------------------------------------
// 19. Reuse, not duplication
//
// The takeoff engine already had paint, masonry, concrete and rebar. If these
// files ever grow their own copies, the two will disagree and only one of them
// will be maintained.
// ---------------------------------------------------------------------------

{
  const concreteSpec = code("src/lib/calculators/concrete.ts");
  check("concrete is computed by the takeoff engine's concreteQuantity", /from "@\/lib\/takeoff\/trades"/.test(concreteSpec) && /concreteQuantity\(/.test(concreteSpec));

  const masonrySpec = code("src/lib/calculators/specs/masonry.ts");
  check("blocks are counted by the takeoff engine's masonryQuantity", /masonryQuantity\(/.test(masonrySpec));
  // Not "does BLOCK_TYPES appear" — an import line satisfies that while a
  // hard-coded list sits underneath it. What matters is that no block's
  // dimensions are restated here: a second `{ length: 400, height: 200 }` is
  // the copy that drifts.
  check(
    "and no block dimensions are restated outside BLOCK_TYPES",
    /BLOCK_TYPES\.filter\(/.test(masonrySpec) &&
      !/length:\s*400\s*,\s*height:\s*200/.test(masonrySpec),
  );

  const finishingSpec = code("src/lib/calculators/specs/finishing.ts");
  check("paint is computed by the takeoff engine's paintQuantity", /paintQuantity\(/.test(finishingSpec));

  const steelLib = code("src/lib/calculators/steel.ts");
  check("rebar mass per metre is the takeoff engine's, not a second d²/162", /from "@\/lib\/takeoff\/trades"/.test(steelLib));
  check("and it is re-exported rather than reimplemented", !/\/\s*162/.test(steelLib));

  // Mortar, plaster and screed share one cement-and-sand function.
  const mixUsers = ["specs/masonry.ts", "specs/finishing.ts"].map((f) => code(`src/lib/calculators/${f}`));
  check("mortar, plaster and screed all use one mix function", mixUsers.every((body) => /cementSandForVolume\(/.test(body)));

  // The six furniture calculators share one carcass function.
  const furnitureSpec = code("src/lib/calculators/specs/furniture.ts");
  check("all six furniture calculators share one carcass generator", /carcassParts\(/.test(furnitureSpec));
  check(
    "and the kitchen reads the engine rather than parsing its own output",
    /perModule\.boardArea/.test(furnitureSpec) && !/Number\(one\.lines\[/.test(furnitureSpec),
  );
}

// ---------------------------------------------------------------------------
// 20. Performance: arithmetic does not go to a server
// ---------------------------------------------------------------------------

{
  // Three files are allowed to touch the network, and none of them is a
  // formula: saved.ts reads the documents somebody kept, storage.ts is the
  // device-local store, and prices.ts asks the price book for a rate to
  // *offer*. Everything else is arithmetic and must work on a dead connection.
  const ALLOWED_TO_ASK = ["saved.ts", "storage.ts", "prices.ts"];
  const engineFiles = walkAll("src/lib/calculators").filter((f) => f.endsWith(".ts"));
  const networked = engineFiles.filter((file) => {
    if (ALLOWED_TO_ASK.some((allowed) => file.endsWith(allowed))) return false;
    return /\bfetch\(|createClient\(|supabase/.test(code(file));
  });
  check("no calculator formula reaches for the network", networked.length === 0, networked.join(", "));

  // The exemption above is only safe while nothing computable depends on those
  // files. A spec that imported the price lookup would make its `compute`
  // implicitly async and its answer dependent on a server — which is the thing
  // the exemption is meant to keep possible, not to permit.
  const specFiles = walkAll("src/lib/calculators/specs").filter((f) => f.endsWith(".ts"));
  const leaked = [...specFiles, "src/lib/calculators/registry.ts"].filter((file) =>
    /from "\.\.?\/(prices|saved|storage)"/.test(code(file)),
  );
  check("and no calculator spec imports one of the three that can", leaked.length === 0, leaked.join(", "));

  // Every compute is synchronous. An async one would be a formula waiting on
  // something, and nothing here has anything to wait for.
  const asyncComputes = CALCULATORS.filter(
    (one) => one.compute && one.compute.constructor.name === "AsyncFunction",
  );
  check("every compute is synchronous", asyncComputes.length === 0, asyncComputes.map((o) => o.slug).join(", "));
}

// ---------------------------------------------------------------------------
// 21. Printing
//
// The Print buttons were shipped before there was a print stylesheet, so they
// produced the sidebar, the bottom bar, a dark background and a cut list
// sliced through the middle of a row at the page break.
// ---------------------------------------------------------------------------

{
  const css = readFileSync("src/app/globals.css", "utf8");
  const printBlock = css.slice(css.indexOf("@media print"));

  check("there is a print stylesheet", css.includes("@media print"));
  check("navigation does not print", /\bnav,/.test(printBlock));
  check("fixed and sticky elements are unpinned so they do not repeat", /\.fixed,[\s\S]{0,40}\.sticky\s*\{[\s\S]{0,60}position: static/.test(printBlock));
  check(
    "scroll containers flow instead of printing only what was visible",
    /\.overflow-x-auto,[\s\S]{0,120}overflow: visible/.test(printBlock),
  );
  check("the table header repeats on every page", /thead\s*\{[\s\S]{0,80}table-header-group/.test(printBlock));
  check("a row is never split across a page break", /tr,[\s\S]{0,40}\{[\s\S]{0,60}page-break-inside: avoid/.test(printBlock));
  check("the page is white, not the app's dark ground", /background: #fff/.test(printBlock));

  const results = code("src/components/calculators/results-panel.tsx");
  // The working must be in the DOM to print. Rendering it only when expanded
  // meant Print produced a sheet with no sum on it — which is the one thing a
  // quantity surveyor checks.
  check(
    "the working is always in the document, hidden by class rather than unmounted",
    /data-print="working"/.test(results) && !/\{showWorking && \(/.test(results),
  );
  check("and print forces it visible", /\[data-print="working"\][\s\S]{0,60}display: block/.test(printBlock));
  check("a printed sheet says which calculator it came from", /hidden print:block/.test(results));
  check("the expand control itself does not print", /print:hidden/.test(results));
}

// ---------------------------------------------------------------------------
// 22. The price book, wired rather than merely reachable
//
// The SQL function existed for a while with nothing calling it, which is the
// disconnected architecture the brief warned against by name.
// ---------------------------------------------------------------------------

{
  const hook = code("src/lib/calculators/prices.ts");
  check("something actually calls the price function", /calculator_material_price/.test(hook));
  check("it passes the parameter the function declares", /p_material:/.test(hook));
  check(
    "\"no price\" and \"could not ask\" are different answers",
    /state: "none"/.test(hook) && /state: "unreachable"/.test(hook),
  );
  check("staleness uses the price book's own window, not a second one", /DEFAULT_VALIDITY_DAYS/.test(hook));
  check("the trust level is carried through", /dataStatus/.test(hook));
  check(
    "and the pending state is derived, not set inside the effect",
    /return \{ state: "asking" \};/.test(hook) && !/setLookup\(\{ state: "asking" \}\)/.test(hook),
  );

  const offer = code("src/components/calculators/price-offer.tsx");
  check("the offer prints the price book's own status label", /PRICE_STATUS_LABELS/.test(offer));
  check("and its caveat, rather than wording invented here", /PRICE_STATUS_NOTES/.test(offer));
  check("with the collection date", /collectedLabel/.test(offer));
  // Offered, never applied: a price arriving from the network must not
  // overwrite a figure the reader typed.
  check("the price is offered behind a tap, not written in", /onClick=\{\(\) => onUse\(price\.price\)\}/.test(offer));

  const materials = code("src/components/calculators/materials-calculator.tsx");
  check("the material list offers prices", /<PriceOffer[\s/>]/.test(materials));
  check("and lets the reader pick the city they are buying in", /setCity\(/.test(materials));

  const migration = readFileSync("supabase/migrations/0067_saved_calculations.sql", "utf8");
  check("expired prices are never offered", /data_status <> 'expired'/.test(migration));
  // Ranking on the generated boolean collapses the middle three statuses, so a
  // seeded educational estimate can outrank a supplier's real price on date.
  check(
    "trust is ranked on the status enum, not the verified boolean",
    /mp\.data_status desc/.test(migration) && !/mp\.verified desc/.test(migration),
  );
  check("and no second price table was created", !/create table[\s\S]{0,40}material_prices/.test(migration));
}

// ---------------------------------------------------------------------------
// 23. Sharing
// ---------------------------------------------------------------------------

{
  const share = code("src/components/calculators/share-result.tsx");
  check("there is a share control", /navigator\.share/.test(share));
  check("with a clipboard fallback for a browser that has no share sheet", /clipboard\.writeText/.test(share));
  check("the numbers travel, not just a link", /output\.lines/.test(share) && /headline/.test(share));
  // Not /output\.formula/ — the `if (output.formula.length > 0)` guard keeps
  // that identifier alive while the line that actually appends the steps is
  // gone. Assert on the append.
  check(
    "and the working goes with them",
    /lines\.push\([\s\S]{0,80}output\.formula\.map\(/.test(share),
  );
  // Dismissing the share sheet throws AbortError. That is not a failure.
  check("a dismissed share sheet is not reported as an error", /catch \{/.test(share));
}

// ---------------------------------------------------------------------------
// 24. The Studio loop closes
//
// The calculators send a design in. Without this the reader could not get back
// out, which would make it a one-way door rather than the loop the brief drew.
// ---------------------------------------------------------------------------

{
  const send = code("src/features/berchuma-studio/components/send-to-calculator.tsx");
  check("the studio offers a way back to the calculator", /calculatorSlugForKind\(/.test(send));
  check("and carries the width with it", /width=\$\{rounded\}/.test(send));
  check("a design with no matching calculator shows no button", /if \(!slug\) return null;/.test(send));

  const workspace = code("src/features/berchuma-studio/components/studio-workspace.tsx");
  // The boundary matters: /<SendToCalculator/ also matches <SendToCalculatorX,
  // so a renamed-away component would satisfy it while rendering nothing.
  check("and it is actually mounted in the studio", /<SendToCalculator[\s/>]/.test(workspace));

  // The link is only real if the calculator reads what it sends.
  const page = code("src/components/calculators/calculator-page.tsx");
  check("the calculator reads the query string it is sent", /useSearchParams\(\)/.test(page));
  check("and hands it to the form", /seed=\{seed\}/.test(page));

  const route = code("src/app/calculators/[slug]/page.tsx");
  check("inside a Suspense boundary, which a static route requires", /<Suspense[\s/>]/.test(route));

  const validate = code("src/lib/calculators/validate.ts");
  check("seeded values are applied at build time, not pushed in later", /initialState\(fields: Field\[\], seed\?/.test(validate));
  check("a value from the URL is validated before it is trusted", /Number\.isFinite\(parsed\) && parsed >= 0/.test(validate));
  check(
    "and an unknown key in a hand-edited URL is ignored",
    /const supplied = seed\?\.\[field\.id\];/.test(validate),
  );
}

{
  // Round trip: every furniture calculator maps to a kind that maps back.
  const furniture = CALCULATORS.filter((one) => one.category === "furniture");
  check("all six furniture calculators reach the studio", furniture.every((one) => studioKindFor(one.slug) !== null));
  check(
    "and every one of them comes back to itself",
    furniture.every((one) => calculatorSlugForKind(studioKindFor(one.slug)!) === one.slug),
  );
}

// ---------------------------------------------------------------------------
// 25. A saved calculation actually comes back
//
// The table stores inputs rather than answers, which is right — re-running the
// calculator over stored inputs always agrees with the calculator. It is also
// worthless unless something puts those inputs back in the form. For a while
// it did not: Save wrote them and the list linked to a blank page.
// ---------------------------------------------------------------------------

{
  const list = code("src/components/calculators/saved-list.tsx");
  check("the saved list carries the inputs back into the form", /restoreHref\(row\)/.test(list));
  check("as query parameters the form already understands", /params\.set\(id, entry\.raw\)/.test(list));
  // A thickness saved as 150 mm returning as 150 m is not a rounding error.
  check("with the unit each value was typed in", /params\.set\(`\$\{id\}\.unit`/.test(list));

  const validateSource = code("src/lib/calculators/validate.ts");
  check("and the form reads that unit back", /seed\?\.\[`\$\{field\.id\}\.unit`\]/.test(validateSource));
  check(
    "checking it against the unit table rather than trusting the URL",
    /suppliedUnit in LENGTH_IN_METRES/.test(validateSource),
  );

  // The round trip, in one assertion: a form filled in, saved the way the
  // save control saves it, and rebuilt from the link the list would produce.
  const spec = calculatorBySlug("concrete-slab")!;
  const typedIn = {
    length: { raw: "8", unit: "m" as const },
    width: { raw: "6", unit: "m" as const },
    thickness: { raw: "150", unit: "mm" as const },
    grade: { raw: "C25", unit: "m" as const },
    waste: { raw: "5", unit: "m" as const },
  };

  const asStored = Object.fromEntries(
    Object.entries(typedIn).map(([id, entry]) => [id, { raw: entry.raw, unit: entry.unit }]),
  );
  const asQuery: Record<string, string> = {};
  for (const [id, entry] of Object.entries(asStored)) {
    asQuery[id] = entry.raw;
    asQuery[`${id}.unit`] = entry.unit;
  }

  const rebuilt = initialState(spec.fields, asQuery);
  check("a saved calculation rebuilds the same form", rebuilt.thickness?.raw === "150");
  check("in the same units", rebuilt.thickness?.unit === "mm", rebuilt.thickness?.unit);

  const before = spec.compute!(validate(spec.fields, typedIn).values);
  const after = spec.compute!(validate(spec.fields, rebuilt).values);
  check(
    "and gives the identical answer, not one 1000x out",
    before.headline.value === after.headline.value && after.headline.value === "7.560",
    `${before.headline.value} vs ${after.headline.value}`,
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
console.log(`${DIM}calculators: forty-one, and the arithmetic behind them${RESET}`);
