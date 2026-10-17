/**
 * The cost estimate of the construction model: the price book (a material and a labour rate in birr for each line of work), and the estimate worked out from the
 * bill and the book: materials, labour, additional costs, contingency, taxes, the total and the cost per square metre, with a flag on everything that is an
 * example, a guess or missing.
 *
 *   npx tsx scripts/construction_estimate_check.ts
 *
 * The first part works on a bill of a few lines written out here, with every figure of the estimate worked out by hand. The second works on the four buildings
 * at three sizes: the price book must cover every line of work they have, each grouping of the cost must add up to the direct cost, the direct cost must equal
 * a separate sum over the lines, and a price changed must change the cost by exactly the quantity times the change.
 */
import assert from "node:assert/strict";

import { BUILDING_TEMPLATES, areasOf, buildBuilding, configForArea, defaultConfig, type BuiltBuilding } from "../src/features/house-designer/construction/building-config";
import { buildBill, type Bill, type BillGrouping } from "../src/features/house-designer/construction/boq";
import { DEFAULT_COST_RULES, estimateCost, readCostRules, type CostRules } from "../src/features/house-designer/construction/estimate";
import { buildConstructionModel } from "../src/features/house-designer/construction/model";
import { changedEntries, defaultPriceBook, noteRate, readPriceBook, resetRate, setRate, type PriceBook, type PriceEntry, type Rate } from "../src/features/house-designer/construction/price-book";
import { aggregateQuantities } from "../src/features/house-designer/construction/quantities";
import { DEFAULT_OPTIONS, DEFAULT_RULES, type ComponentRecord, type ConstructionModel, type QuantityItem } from "../src/features/house-designer/construction/types";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };
const near = (actual: number, expected: number, message: string, tolerance = 1e-6) => { assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} is not ${expected} (±${tolerance})`); checks += 1; };

// ---------------------------------------------------------------------------
// A bill of a few lines, and a book to price it
// ---------------------------------------------------------------------------

const STOREYS = [
  { id: "g", name: "Ground", index: 0, elevation: 0, floorToFloor: 3000, slabThickness: 200 },
  { id: "f1", name: "First", index: 1, elevation: 3000, floorToFloor: 3000, slabThickness: 200 },
];
const NO_COST = { unitMaterial: null, unitLabour: null, unitEquipment: null, currency: null, priceSource: null, priceDate: null };
const item = (componentId: string, workItem: string, section: QuantityItem["section"], unit: QuantityItem["unit"], value: number | null, allowance: number | null = null, status: QuantityItem["status"] = "calculated"): QuantityItem => ({
  id: `${componentId}#${workItem}`, componentId, workItem, description: workItem, section, unit, value, formula: `${workItem} of ${componentId}`, inputs: {}, status: value === null ? "missing" : status,
  sourceGeometry: "project", allowance: allowance === null ? null : { rule: "example", percent: allowance }, cost: NO_COST, storeyId: null, room: null, materialSpec: "spec", assumptions: [], exclusions: [],
});
const part = (id: string, o: Partial<ComponentRecord>, ...quantities: QuantityItem[]): ComponentRecord => ({
  id, name: id, kind: "beam", category: "frame", subcategory: "", stage: 5, storeyId: "g", storeyName: "Ground", storeyIndex: 0, room: null, grid: null, layer: "concrete", materialId: "concrete", shapes: [],
  dims: {}, geometrySource: "project", sourceRef: null, parentId: null, connectedIds: [], sequence: 0, explode: { layerIndex: 0, dir: { x: 0, y: 0, z: 1 } }, quantities, ...o,
});
const stub = (components: ComponentRecord[]): ConstructionModel => ({
  projectId: "stub", title: "Stub", disclaimer: "", options: DEFAULT_OPTIONS, rules: DEFAULT_RULES, storeys: STOREYS, components,
  bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, warnings: [],
});

const rate = (value: number | null, status: Rate["status"] = "assumed"): Rate => ({ value, status, source: "test", date: null });
const entry = (workItem: string, unit: PriceEntry["unit"], material: Rate, labour: Rate, includedIn: string | null = null): PriceEntry => ({ workItem, unit, material, labour, includedIn, note: "" });
const book = (...entries: PriceEntry[]): PriceBook => ({ version: 1, currency: "ETB", name: "test", entries: Object.fromEntries(entries.map((e) => [e.workItem, e])) });

const MICRO = [
  part("beam", { kind: "beam" }, item("beam", "concrete.beam", "C", "m³", 2, 5)),
  part("paint:f1", { kind: "paint-layer", category: "finishes", stage: 17, storeyId: "f1", storeyName: "First", storeyIndex: 1, layer: "paint" }, item("paint:f1", "paint.walls", "M", "m²", 40, 5)),
  part("paint:g", { kind: "paint-layer", category: "finishes", stage: 17, layer: "paint" }, item("paint:g", "paint.walls", "M", "m²", 6, 5, "assumed"), item("paint:g", "paint.walls", "M", "m²", 4, 5, "assumed")),
  part("wall", { kind: "wall-blocks", category: "masonry", stage: 6, storeyId: "f1", storeyName: "First", storeyIndex: 1, layer: "masonry" }, item("wall", "masonry.wall-area", "F", "m²", 20), item("wall", "masonry.blocks", "F", "piece", 500, 5)),
  part("fence", { kind: "fence", category: "site", stage: 1, storeyId: null, storeyName: null, storeyIndex: -1, layer: "marker" }, item("fence", "prelim.fence", "A", "m", 30, null, "review")),
  part("odd", { kind: "thing", category: "frame", layer: "concrete" }, item("odd", "foo.bar", "C", "m³", 3)),
  part("bars", { kind: "beam-bars", layer: "reinforcement", materialId: "steel-bar", parentId: "beam" }, item("bars", "steel.beam-bars", "D", "kg", null)),
  part("pit", { kind: "pit", category: "earthworks", stage: 3, storeyId: null, storeyName: null, storeyIndex: -1, layer: "soil" }, item("pit", "earth.pit", "B", "m²", 8)),
  part("panel", { kind: "cabinet", category: "joinery", stage: 16, layer: "joinery" }, item("panel", "joinery.panel.mdf-18-white", "T", "m²", 3), item("panel", "joinery.panel.mdf-18-white", "T", "m²", null)),
  part("tank", { kind: "water-tank", category: "plumbing", stage: 12, layer: "plumbing" }, item("tank", "plumbing.tank", "O", "piece", 1)),
];
const microBook = book(
  entry("concrete.beam", "m³", rate(14000, "quoted"), rate(3000, "entered")),
  entry("paint.walls", "m²", rate(100), rate(60)),
  entry("masonry.wall-area", "m²", rate(880), rate(280)),
  entry("masonry.blocks", "piece", rate(null), rate(null), "masonry.wall-area"),
  entry("prelim.fence", "m", rate(null), rate(120)),
  entry("steel.beam-bars", "kg", rate(105), rate(20)),
  entry("earth.pit", "m³", rate(0), rate(380)),
  entry("joinery.panel.mdf-18-white", "m²", rate(0), rate(0)),
  entry("plumbing.tank", "piece", rate(null), rate(null)),
);
const microRules: CostRules = {
  additional: [
    { id: "prelims", name: "Preliminaries", basis: "direct", value: 10, enabled: true, note: "" },
    { id: "transport", name: "Transport", basis: "materials", value: 4, enabled: true, note: "" },
    { id: "profit", name: "Profit", basis: "running", value: 10, enabled: true, note: "" },
    { id: "bond", name: "Bond", basis: "fixed", value: 5000, enabled: true, note: "" },
    { id: "off", name: "Switched off", basis: "direct", value: 50, enabled: false, note: "" },
    { id: "wages", name: "Labour on-costs", basis: "labour", value: 20, enabled: true, note: "" },
  ],
  contingencyPercent: 5,
  taxes: [{ id: "vat", name: "VAT", percent: 15, enabled: true, note: "" }, { id: "other", name: "Other", percent: 2, enabled: false, note: "" }],
};

{
  const model = stub(MICRO);
  const bill = buildBill(model, DEFAULT_OPTIONS, "building");
  const est = estimateCost(bill, microBook, microRules, { grossFloor: 100, totalSlab: 120 });
  const line = (workItem: string) => est.lines.find((l) => l.workItem === workItem)!;

  // Material is the quantity and its allowance times the rate; labour is the net quantity times the rate.
  near(line("concrete.beam").material, (2 + 0.1) * 14000, "the beam's material: (2.000 m³ + 5 % waste) × 14 000 = 29 400", 1e-9);
  near(line("concrete.beam").labour, 2 * 3000, "and its labour: 2.000 m³ × 3 000 = 6 000, on the net quantity", 1e-9);
  near(line("paint.walls").material, (40 + 2) * 100 + (10 + 0.5) * 100, "the paint in two floors: 42 m² and 10.5 m² of paint at 100", 1e-9);
  near(line("paint.walls").labour, 50 * 60, "and 50 m² laid at 60", 1e-9);
  near(line("masonry.wall-area").total, 20 * 880 + 20 * 280, "the wall: 20 m² at 880 + 280", 1e-9);
  equal(line("masonry.blocks").pricing, "included", "the count of blocks is included in the wall");
  equal(line("masonry.blocks").includedIn, "masonry.wall-area", "and says in which line");
  equal(line("masonry.blocks").total, 0, "and costs nothing of its own");
  equal(line("prelim.fence").pricing, "partial", "a line with a labour rate and no material rate is partly priced");
  near(line("prelim.fence").labour, 30 * 120, "its labour is 30 m at 120", 1e-9);
  equal(line("prelim.fence").material, 0, "and its material is not guessed");
  ok(line("prelim.fence").flags.includes("material-price-missing"), "the line says the material price is missing");
  equal(line("foo.bar").pricing, "unpriced", "work the book has no entry for is not priced");
  ok(line("foo.bar").flags.includes("no-price-entry"), "and says why");
  equal(line("steel.beam-bars").pricing, "no-quantity", "a line with no quantity is not priced, however good its rates");
  ok(line("steel.beam-bars").flags.includes("no-quantity"), "and says it has none");
  equal(line("earth.pit").pricing, "unpriced", "a price in cubic metres does not price square metres");
  ok(line("earth.pit").flags.includes("unit-differs"), "and says the unit differs");
  equal(line("earth.pit").total, 0, "so it costs nothing in the estimate");
  equal(line("concrete.beam").pricing, "priced", "a line with both rates is priced");

  // The total, by hand.
  const materials = 29400 + 4200 + 1050 + 17600;
  const labour = 6000 + 3000 + 5600 + 3600;
  near(est.materials, materials, "materials: 29 400 + 5 250 + 17 600 = 52 250", 1e-9);
  near(est.labour, labour, "labour: 6 000 + 3 000 + 5 600 + 3 600 = 18 200", 1e-9);
  near(est.direct, materials + labour, "direct cost: 70 450", 1e-9);
  const byId = (id: string) => est.additional.find((a) => a.id === id)!;
  near(byId("prelims").amount, 7045, "preliminaries, 10 % of the direct cost: 7 045", 1e-9);
  near(byId("transport").amount, 0.04 * materials, "transport, 4 % of the materials: 2 090", 1e-9);
  near(byId("profit").amount, (70450 + 7045 + 2090) * 0.1, "profit, 10 % of the total so far (70 450 + 7 045 + 2 090): 7 958.50", 1e-9);
  near(byId("bond").amount, 5000, "a fixed sum is the sum", 1e-9);
  near(byId("wages").amount, 0.2 * labour, "on-costs, 20 % of the labour: 3 640", 1e-9);
  equal(byId("off").amount, 0, "an item switched off adds nothing");
  const additional = 7045 + 2090 + 7958.5 + 5000 + 3640;
  near(est.additionalTotal, additional, "additional costs: 25 733.50", 1e-9);
  near(est.subtotal, 70450 + additional, "subtotal: 96 183.50", 1e-9);
  near(est.contingency.amount, (70450 + additional) * 0.05, "contingency, 5 % of the subtotal: 4 809.175", 1e-9);
  near(est.taxable, (70450 + additional) * 1.05, "taxable: 100 992.675", 1e-9);
  near(est.taxes.find((t) => t.id === "vat")!.amount, (70450 + additional) * 1.05 * 0.15, "VAT, 15 % of that: 15 148.90125", 1e-9);
  equal(est.taxes.find((t) => t.id === "other")!.amount, 0, "a tax switched off adds nothing");
  near(est.total, (70450 + additional) * 1.05 * 1.15, "the total: 116 141.57625", 1e-9);
  near(est.area.perM2!, est.total / 100, "per square metre of gross floor area: 1 161.42", 1e-9);
  near(est.area.directPerM2!, 704.5, "and the direct cost per square metre: 704.50", 1e-9);
  near(est.area.perM2Slab!, est.total / 120, "and per square metre of slab, balconies included", 1e-9);
  equal(estimateCost(bill, microBook, microRules, { grossFloor: 0, totalSlab: 0 }).area.perM2, null, "with no floor area there is no cost per square metre");

  // Every grouping adds up to the direct cost.
  const groupTotal = (by: BillGrouping) => est.groups[by].reduce((s, g) => s + g.total, 0);
  for (const by of ["section", "floor", "stage", "category"] as BillGrouping[]) near(groupTotal(by), est.direct, `grouped by ${by}, the costs add up to the direct cost`, 1e-9);
  const floor = (key: string) => est.groups.floor.find((g) => g.key === key)!;
  near(floor("f1").total, (2.1 * 14000 + 2 * 3000) + (42 * 100 + 40 * 60) + 20 * 1160, "the First Floor: the beam it is cast on, its paint and its wall: 65 200", 1e-9);
  near(floor("g").total, 10.5 * 100 + 10 * 60, "the Ground Floor: the paint, 1 650", 1e-9);
  near(floor("site").total, 3600, "the foundations and site: the fence, 3 600", 1e-9);
  equal(est.groups.floor.map((g) => g.key), ["site", "g", "f1"], "floors from the foundations up, those with anything in them");
  near(est.groups.stage.find((g) => g.key === "17")!.total, 4200 + 2400 + 1050 + 600, "stage 17, the paint: 8 250", 1e-9);
  near(est.groups.section.find((g) => g.key === "F")!.total, 23200, "section F, masonry: 17 600 + 5 600 = 23 200", 1e-9);
  equal(est.groups.section.find((g) => g.key === "F")!.label, "F. Masonry", "called by its letter and title");
  equal(floor("g").lines, 4, "the Ground Floor has four lines in it, the paint being one line however many items it has: the paint, the other work, the tank and the panels");
  equal(floor("f1").lines, 5, "a floor counts the lines that have a part in it: the beam, its bars (with no quantity), the paint, the wall and the count of its blocks");

  // What the estimate says about itself.
  equal(est.summary.byPricing, { priced: 4, partial: 1, unpriced: 3, included: 1, "no-quantity": 1 }, "four lines priced, one partly, three not, one included and one without a quantity");
  near(est.summary.directByRate.quoted, 29400, "the cost that rests on a quoted rate: the beam's material", 1e-9);
  near(est.summary.directByRate.entered, 6000, "on an entered rate: the beam's labour", 1e-9);
  near(est.summary.directByRate.assumed, est.direct - 29400 - 6000, "and the rest on example rates", 1e-9);
  near(est.summary.exampleShare, (est.direct - 35400) / est.direct, "which is this share of the direct cost", 1e-9);
  near(est.summary.directByQuantity.assumed, 1050 + 600, "the cost resting on a quantity that is an assumption: the Ground Floor's paint", 1e-9);
  near(Object.values(est.summary.directByQuantity).reduce((a, b) => a + b, 0), est.direct, "every quantity is one status, so they add up to the direct cost", 1e-9);
  equal(est.summary.problems.map((p) => `${p.workItem}:${p.flag}`).sort(), ["earth.pit:unit-differs", "foo.bar:no-price-entry", "joinery.panel.mdf-18-white:quantity-incomplete", "plumbing.tank:labour-price-missing", "plumbing.tank:material-price-missing", "prelim.fence:material-price-missing", "steel.beam-bars:no-quantity"], "and lists each thing that could not be priced, with the reason");
  ok(est.summary.problems.every((p) => p.detail.length > 10 && /^[A-W]\.\d\d$/.test(p.ref)), "each with a sentence and the line's reference");
  ok(line("concrete.beam").flags.includes("quoted-rate") && line("concrete.beam").flags.includes("entered-rate"), "the beam is flagged as priced from a quoted rate and an entered one");
  ok(line("paint.walls").flags.includes("example-rate") && line("paint.walls").flags.includes("quantity-assumed"), "the paint from an example rate and a quantity that is an assumption");
  equal(line("earth.pit").material + line("earth.pit").labour, 0, "an unpriced line has no cost");
  equal(line("plumbing.tank").pricing, "unpriced", "a line whose rates are both missing is unpriced, not partly priced");
  ok(line("plumbing.tank").flags.includes("material-price-missing") && line("plumbing.tank").flags.includes("labour-price-missing"), "and says both are missing");
  equal(line("joinery.panel.mdf-18-white").pricing, "priced", "a line with rates of nothing is priced");
  equal([line("joinery.panel.mdf-18-white").materialRateStatus, line("joinery.panel.mdf-18-white").labourRateStatus], [null, null], "and its rates of nothing are not examples");
  near(line("joinery.panel.mdf-18-white").net!, 3, "a line with one item that has a quantity and one that has none is the quantity it has", 0);
  ok(line("joinery.panel.mdf-18-white").flags.includes("quantity-incomplete"), "and says some of its items have none");
  ok(line("prelim.fence").flags.includes("quantity-review") && !line("prelim.fence").flags.includes("quantity-assumed"), "a quantity for review is flagged as that, not as an assumption");

  // A rate of nought is a price; a rate with no figure is not.
  const free = estimateCost(bill, book(...Object.values(microBook.entries).map((e) => (e.workItem === "prelim.fence" ? { ...e, material: rate(0) } : e))), microRules);
  equal(free.lines.find((l) => l.workItem === "prelim.fence")!.pricing, "priced", "a fence with nothing to pay for its material is priced");
  ok(!free.lines.find((l) => l.workItem === "prelim.fence")!.flags.includes("material-price-missing"), "and not flagged");
  ok(free.lines.find((l) => l.workItem === "prelim.fence")!.flags.includes("example-rate"), "but its labour is still an example rate");
  equal(free.lines.find((l) => l.workItem === "prelim.fence")!.materialRateStatus, null, "and a material rate of nothing is not called an example");
  equal(free.lines.find((l) => l.workItem === "prelim.fence")!.labourRateStatus, "assumed", "while the labour rate is");

  // Changing a rate changes the cost by the quantity and nothing else.
  const dearer = estimateCost(bill, book(...Object.values(microBook.entries).map((e) => (e.workItem === "concrete.beam" ? { ...e, material: rate(15000, "entered") } : e))), microRules);
  near(dearer.direct - est.direct, 2.1 * 1000, "a material rate 1 000 higher costs 2.1 m³ × 1 000 more", 1e-9);
  near(dearer.lines.find((l) => l.workItem === "paint.walls")!.total, line("paint.walls").total, "and no other line moves", 1e-9);
  // 2 100 more direct cost: 10 % more of it in preliminaries (210), 4 % of the extra material in transport (84), 10 % of the running total in profit (239.40).
  near(dearer.total - est.total, (2100 + 210 + 84 + 239.4) * 1.05 * 1.15, "the total follows through the additional costs, the contingency and the tax: 2 633.40 × 1.05 × 1.15 more", 1e-9);

  // Nothing to price.
  const empty = estimateCost({ ...bill, lines: [], sections: [] }, microBook, microRules, { grossFloor: 100, totalSlab: 100 });
  near(empty.direct, 0, "with no direct cost", 0);
  near(empty.total, (5000) * 1.05 * 1.15, "just the fixed sum with its contingency and tax", 1e-9);
}

// ---------------------------------------------------------------------------
// The price book
// ---------------------------------------------------------------------------

{
  const fresh = defaultPriceBook();
  ok(Object.keys(fresh.entries).length >= 215, `the book has an entry for each of its ${Object.keys(fresh.entries).length} kinds of work`);
  equal(fresh.currency, "ETB", "in birr");
  ok(Object.values(fresh.entries).every((e) => (e.includedIn !== null) === (e.material.value === null && e.labour.value === null)), "an entry has rates or is included in another line, not both");
  ok(Object.values(fresh.entries).filter((e) => !e.includedIn).every((e) => e.material.value !== null && e.labour.value !== null && e.material.value >= 0 && e.labour.value >= 0), "every entry that is priced has a material and a labour rate, none negative");
  ok(Object.values(fresh.entries).filter((e) => !e.includedIn).every((e) => e.material.status === "assumed" && e.labour.status === "assumed" && /assumption/i.test(e.material.source)), "and every one is marked as an example, in words");
  ok(Object.values(fresh.entries).filter((e) => e.includedIn).every((e) => fresh.entries[e.includedIn!] && !fresh.entries[e.includedIn!]!.includedIn && fresh.entries[e.includedIn!]!.material.value !== null), "an included entry points at an entry that is priced");
  equal(changedEntries(fresh), [], "a new book has nothing changed");
  ok(defaultPriceBook() !== defaultPriceBook() && JSON.stringify(defaultPriceBook()) === JSON.stringify(defaultPriceBook()), "and every book is its own copy");
  ok(defaultPriceBook().entries !== defaultPriceBook().entries && defaultPriceBook().entries["concrete.slab"] !== defaultPriceBook().entries["concrete.slab"], "down to its entries");

  // Editing is a new book, and the old one is not touched.
  const edited = setRate(fresh, "concrete.slab", "material", 16000.456);
  near(edited.entries["concrete.slab"]!.material.value!, 16000.46, "a rate is kept to the centime", 0);
  equal(edited.entries["concrete.slab"]!.material.status, "entered", "marked as entered");
  equal(edited.entries["concrete.slab"]!.material.source, "Entered by you", "with its source");
  ok(/^\d{4}-\d{2}-\d{2}$/.test(edited.entries["concrete.slab"]!.material.date!), "and the day");
  near(fresh.entries["concrete.slab"]!.material.value!, 14500, "while the old book is as it was", 0);
  equal(edited.entries["concrete.slab"]!.labour, fresh.entries["concrete.slab"]!.labour, "and the other rate is not touched");
  equal(changedEntries(edited).map((e) => e.workItem), ["concrete.slab"], "the changed entries are listed");
  equal(setRate(fresh, "concrete.slab", "labour", -5).entries["concrete.slab"]!.labour.value, null, "a negative rate is no rate");
  equal(setRate(fresh, "concrete.slab", "labour", Number.NaN).entries["concrete.slab"]!.labour.value, null, "and neither is something that is not a number");
  equal(setRate(fresh, "concrete.slab", "labour", null).entries["concrete.slab"]!.labour.value, null, "a rate can be cleared");
  equal(setRate(fresh, "concrete.slab", "labour", 0).entries["concrete.slab"]!.labour.value, 0, "and set to nothing");
  equal(setRate(fresh, "masonry.blocks", "material", 55), fresh, "a line included in another has no rate to set");
  equal(setRate(fresh, "no.such.work", "material", 55), fresh, "nor work the book does not know");
  const quoted = setRate(fresh, "concrete.slab", "material", 15000, { status: "quoted", source: "Supplier X quotation 114", date: "2025-02-03" });
  equal(quoted.entries["concrete.slab"]!.material, { value: 15000, status: "quoted", source: "Supplier X quotation 114", date: "2025-02-03" }, "a quoted rate keeps its source and its date");
  const noted = noteRate(edited, "concrete.slab", "material", { status: "quoted", source: "Supplier Y" });
  near(noted.entries["concrete.slab"]!.material.value!, 16000.46, "a source can be added to a rate without changing its figure", 0);
  equal(noted.entries["concrete.slab"]!.material.status, "quoted", "and the status");
  equal(resetRate(edited, "concrete.slab"), fresh, "a rate put back is the example again");
  equal(resetRate(fresh, "no.such.work"), fresh, "and work not known stays as it was");

  // Saved, and read back.
  equal(readPriceBook(JSON.parse(JSON.stringify(edited))), edited, "a book saved and read back is the book");
  equal(readPriceBook(JSON.parse(JSON.stringify(fresh))), fresh, "and so is a new one");
  equal(readPriceBook(null), fresh, "nothing saved gives the examples");
  equal(readPriceBook("rubbish"), fresh, "and so does anything that is not a book");
  equal(readPriceBook({ entries: [] }), fresh, "and a book with no entries");
  const broken = readPriceBook({ name: "  Mine  ", entries: {
    "concrete.slab": { workItem: "concrete.slab", unit: "m²", material: { value: "lots", status: "wonderful", source: 5, date: "yesterday" }, labour: { value: -3, status: "entered", source: "x", date: "2025-01-02" }, includedIn: "steel.beam-bars" },
    "masonry.blocks": { workItem: "masonry.blocks", unit: "piece", material: { value: 99, status: "entered", source: "x", date: null }, labour: { value: 99, status: "entered", source: "x", date: null }, includedIn: null },
    "custom.item": { workItem: "custom.item", unit: "m", material: { value: 10, status: "quoted", source: "Mine", date: "2025-03-04" }, labour: { value: 5, status: "entered", source: "Mine", date: null }, includedIn: null, note: "extra" },
    "bad.unit": { workItem: "bad.unit", unit: "furlongs", material: { value: 1, status: "entered", source: "x", date: null }, labour: { value: 1, status: "entered", source: "x", date: null } },
  } });
  equal(broken.name, "Mine", "the name is trimmed");
  equal(broken.entries["concrete.slab"]!.unit, "m³", "the unit of known work is the book's own");
  equal(broken.entries["concrete.slab"]!.includedIn, null, "and so is what is included in what");
  equal(broken.entries["concrete.slab"]!.material, fresh.entries["concrete.slab"]!.material, "a rate that is not a number is the example again");
  equal(broken.entries["concrete.slab"]!.labour.value, fresh.entries["concrete.slab"]!.labour.value, "a negative rate too");
  equal(broken.entries["masonry.blocks"]!.material.value, null, "a figure for a line that is included in another is not kept");
  equal(broken.entries["custom.item"]!.material.value, 10, "work the book does not know is kept if it is well formed");
  ok(!("bad.unit" in broken.entries), "and left out if it is not");
  equal(readPriceBook({ entries: { "concrete.slab": { workItem: "concrete.slab", material: { value: 7, status: "quoted", source: "ok", date: "2025-06-07" }, labour: { value: 8, status: "entered", source: "ok", date: "2025-06-08" } } } }).entries["concrete.slab"]!.labour, { value: 8, status: "entered", source: "ok", date: "2025-06-08" }, "an entry without a unit is read with the book's");

  // Cost rules, saved and read back.
  equal(readCostRules(JSON.parse(JSON.stringify(microRules))), microRules, "cost rules saved and read back are the rules");
  equal(readCostRules(null), DEFAULT_COST_RULES, "nothing saved gives the defaults");
  const mended = readCostRules({ additional: [{ id: "x", name: "X", basis: "sideways", value: -4, enabled: false }, 7], contingencyPercent: 500, taxes: [{ name: "Y", percent: -1 }, null] });
  equal(mended.additional.length, 1, "an additional cost that is not an object is dropped");
  equal(mended.additional[0]!.basis, "direct", "an unknown basis is the direct cost");
  equal(mended.additional[0]!.value, 0, "a negative percentage is nothing");
  equal(mended.additional[0]!.enabled, false, "and the switch is kept");
  equal(mended.contingencyPercent, 100, "a contingency over 100 % is 100 %");
  equal(mended.taxes.map((t) => t.percent), [0], "a negative tax is nothing, and a tax that is not an object is dropped");
  ok(DEFAULT_COST_RULES.additional.every((a) => a.basis !== "fixed" ? a.value <= 100 : true) && DEFAULT_COST_RULES.taxes.some((t) => t.percent === 15), "the defaults include 15 % value added tax");
}

// ---------------------------------------------------------------------------
// The four buildings, at three sizes
// ---------------------------------------------------------------------------

const sizes = BUILDING_TEMPLATES.flatMap((template) => [
  { name: `${template} at its example size`, template, building: buildBuilding(defaultConfig(template)) },
  { name: `${template} at 150 m² a floor`, template, building: buildBuilding(configForArea(defaultConfig(template), 150).config) },
  { name: `${template} at 200 m² a floor`, template, building: buildBuilding(configForArea(defaultConfig(template), 200).config) },
]);
const modelOf = (building: BuiltBuilding, rules = DEFAULT_RULES): ConstructionModel => buildConstructionModel(building.project, { ...DEFAULT_OPTIONS, ...building.options }, rules);
const areasFor = (building: BuiltBuilding) => { const a = areasOf(building.project, building.options.roofType ?? "flat"); return { grossFloor: a.grossFloorArea, totalSlab: a.totalSlabArea }; };
const priceBook = defaultPriceBook();
const perM2: Record<string, number> = {};
const totals: Record<string, number> = {};

for (const { name, template, building } of sizes) {
  const model = modelOf(building);
  const bill: Bill = buildBill(model);
  const areas = areasFor(building);
  const est = estimateCost(bill, priceBook, DEFAULT_COST_RULES, areas);

  // The book covers the building.
  equal(est.summary.problems, [], `${name}: nothing in the bill is left without a price, a quantity or a unit`);
  equal(est.summary.byPricing.unpriced + est.summary.byPricing.partial + est.summary.byPricing["no-quantity"], 0, `${name}: every line is priced or included in another`);
  ok(est.summary.byPricing.priced > 150 && est.summary.byPricing.included >= 10, `${name}: ${est.summary.byPricing.priced} lines priced, ${est.summary.byPricing.included} included in others`);
  ok(est.lines.filter((l) => l.pricing === "included").every((l) => l.total === 0 && est.lines.some((h) => h.workItem === l.includedIn && h.pricing === "priced")), `${name}: and each line that is included in another has a priced line to be included in`);

  // The direct cost is a separate sum over the lines of the bill.
  const lines = aggregateQuantities(model);
  let direct = 0;
  for (const l of lines) {
    const e = priceBook.entries[l.workItem];
    if (!e || e.includedIn || l.net === null) continue;
    direct += (l.net + (l.allowanceQuantity ?? 0)) * (e.material.value ?? 0) + l.net * (e.labour.value ?? 0);
  }
  near(est.direct, direct, `${name}: the direct cost (${Math.round(est.direct).toLocaleString("en")} ETB) is the sum over the lines, quantity and allowance × material rate plus quantity × labour rate`, 1e-6 * direct);
  near(est.materials + est.labour, est.direct, `${name}: materials and labour make the direct cost`, 1e-6);
  for (const by of ["section", "floor", "stage", "category"] as BillGrouping[]) {
    near(est.groups[by].reduce((s, g) => s + g.total, 0), est.direct, `${name}: by ${by}, the costs add up to the direct cost`, 1e-6 * direct);
    near(est.groups[by].reduce((s, g) => s + g.material, 0), est.materials, `${name}: and the materials`, 1e-6 * direct);
    near(est.groups[by].reduce((s, g) => s + g.labour, 0), est.labour, `${name}: and the labour`, 1e-6 * direct);
  }
  equal(est.groups.floor.map((g) => g.key)[0], "site", `${name}: the foundations are the first floor of the cost`);
  ok(est.groups.floor.length >= building.project.levels.length + 1, `${name}: and there is a cost for each storey and the roof`);

  // The total follows from the direct cost by the rules.
  const additional = DEFAULT_COST_RULES.additional.filter((a) => a.enabled);
  let running = est.direct;
  let add = 0;
  for (const a of additional) {
    const base = a.basis === "materials" ? est.materials : a.basis === "labour" ? est.labour : a.basis === "direct" ? est.direct : running;
    running += (base * a.value) / 100;
    add += (base * a.value) / 100;
  }
  near(est.additionalTotal, add, `${name}: the additional costs`, 1e-6 * direct);
  near(est.total, (est.direct + add) * 1.05 * 1.15, `${name}: the total is (direct + additional) × 1.05 contingency × 1.15 tax = ${Math.round(est.total).toLocaleString("en")} ETB`, 1e-6 * est.total);
  near(est.area.perM2!, est.total / areas.grossFloor, `${name}: ${Math.round(est.area.perM2!).toLocaleString("en")} ETB per square metre of gross floor area`, 1e-6);
  ok(est.area.perM2! > 15000 && est.area.perM2! < 70000, `${name}: which is a plausible figure for a house (between 15 000 and 70 000 ETB per m²)`);
  ok(est.summary.exampleShare > 0.99, `${name}: and it says nearly all of the cost rests on example rates (${(est.summary.exampleShare * 100).toFixed(1)} %)`);
  ok(est.summary.directByQuantity.assumed + est.summary.directByQuantity.review > 0, `${name}: and that some of it rests on assumed quantities (${Math.round(est.summary.directByQuantity.assumed).toLocaleString("en")} ETB)`);
  near(est.summary.directByRate.assumed + est.summary.directByRate.entered + est.summary.directByRate.quoted, est.direct, `${name}: every rate is one kind, so they add up to the direct cost`, 1e-6 * direct);
  perM2[name] = est.area.perM2!;
  totals[name] = est.total;

  // A price changed changes the cost by the quantity times the change.
  const slabs = bill.lines.find((l) => l.workItem === "concrete.slab")!;
  const dearer = estimateCost(bill, setRate(priceBook, "concrete.slab", "material", 15500), DEFAULT_COST_RULES, areas);
  near(dearer.direct - est.direct, (slabs.net! + (slabs.allowanceQuantity ?? 0)) * 1000, `${name}: concrete 1 000 ETB dearer a cubic metre costs the slabs' ${slabs.net} m³ and 5 % over, times 1 000, more`, 1e-4);
  const labourDearer = estimateCost(bill, setRate(priceBook, "concrete.slab", "labour", 3400), DEFAULT_COST_RULES, areas);
  near(labourDearer.direct - est.direct, slabs.net! * 1000, `${name}: and labour 1 000 dearer costs the net quantity times 1 000 more`, 1e-4);
  const withEntered = estimateCost(bill, setRate(priceBook, "concrete.slab", "material", 15500), DEFAULT_COST_RULES, areas);
  ok(withEntered.lines.find((l) => l.workItem === "concrete.slab")!.flags.includes("entered-rate"), `${name}: the line says its rate was entered`);
  ok(withEntered.summary.directByRate.entered > 0 && withEntered.summary.exampleShare < est.summary.exampleShare, `${name}: and less of the cost rests on example rates`);
  // A rate cleared is a rate missing: the line is flagged, and what it cost leaves the total.
  const cleared = estimateCost(bill, setRate(priceBook, "concrete.slab", "material", null), DEFAULT_COST_RULES, areas);
  equal(cleared.lines.find((l) => l.workItem === "concrete.slab")!.pricing, "partial", `${name}: a material rate cleared leaves the line partly priced`);
  ok(cleared.summary.problems.some((p) => p.workItem === "concrete.slab" && p.flag === "material-price-missing"), `${name}: and it is listed as a problem`);
  near(est.direct - cleared.direct, (slabs.net! + (slabs.allowanceQuantity ?? 0)) * 14500, `${name}: and the material that was priced leaves the cost`, 1e-4);
  // The bill is the same bill: only the cost moved.
  equal(bill.lines.map((l) => l.net), buildBill(model).lines.map((l) => l.net), `${name}: pricing does not change the quantities`);
  void template;
}

// The cost grows with the building.
for (const template of BUILDING_TEMPLATES) {
  const small = totals[`${template} at 150 m² a floor`]!;
  const large = totals[`${template} at 200 m² a floor`]!;
  ok(large > small * 1.1 && large < small * 1.8, `${template}: a floor of 200 m² costs more than one of 150 m² (${Math.round(small).toLocaleString("en")} to ${Math.round(large).toLocaleString("en")} ETB), but not out of proportion`);
  const a = perM2[`${template} at 150 m² a floor`]!;
  const b = perM2[`${template} at 200 m² a floor`]!;
  ok(Math.abs(a - b) / a < 0.3, `${template}: and the cost per square metre stays near (${Math.round(a).toLocaleString("en")} and ${Math.round(b).toLocaleString("en")} ETB)`);
}

// A model whose steel waits for a bar schedule: the steel has no quantity, and the estimate says so.
{
  const building = sizes[3]!.building;
  const strict = modelOf(building, { ...DEFAULT_RULES, reinforcement: { ...DEFAULT_RULES.reinforcement, basis: "schedule" } });
  const base = estimateCost(buildBill(modelOf(building)), priceBook, DEFAULT_COST_RULES, areasFor(building));
  const est = estimateCost(buildBill(strict), priceBook, DEFAULT_COST_RULES, areasFor(building));
  ok(est.summary.byPricing["no-quantity"] >= 10, "with no bar schedule the steel lines have no quantity");
  ok(est.summary.problems.filter((p) => p.flag === "no-quantity").every((p) => p.workItem.startsWith("steel.")), "and they are all the steel");
  ok(est.direct < base.direct - 500000, `and the cost falls by the steel (${Math.round(base.direct - est.direct).toLocaleString("en")} ETB)`);
  equal(est.lines.filter((l) => l.pricing === "no-quantity").every((l) => l.total === 0 && l.net === null), true, "which cost nothing, and say so, rather than cost nothing quietly");
}

console.log(`Construction cost estimate: ${checks} checks passed.`);
