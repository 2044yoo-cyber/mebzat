/**
 * Saving a study and opening it again, and the two documents made from it: the workbook and the PDF.
 *
 *   npx tsx scripts/construction_export_check.ts
 *
 * A study is saved to a store that is given to the functions, so the check uses one that can be made to fail. A saved study reopens as the same building with the
 * same bill and the same estimate, figure for figure. The workbook is opened here the way a spreadsheet opens it: the zip is read back entry by entry with its
 * checksums, the sheets are read cell by cell, and what is in them is compared with the report. The PDF is read by pdf.js, the reader the app itself uses, and its
 * cross-reference table is checked byte by byte.
 */
import assert from "node:assert/strict";

import { areasOf, buildBuilding, configForArea, defaultConfig, normalizeConfig, type BuildingConfig, type StructureOverrides } from "../src/features/house-designer/construction/building-config";
import { buildBill } from "../src/features/house-designer/construction/boq";
import { DEFAULT_COST_RULES, estimateCost, type CostRules } from "../src/features/house-designer/construction/estimate";
import { buildConstructionModel } from "../src/features/house-designer/construction/model";
import { buildPdf, textWidth, winAnsi, wrapText } from "../src/features/house-designer/construction/pdf";
import { defaultPriceBook, setRate, type PriceBook } from "../src/features/house-designer/construction/price-book";
import { buildReport, type Report } from "../src/features/house-designer/construction/report";
import { reportPdf } from "../src/features/house-designer/construction/report-pdf";
import { reportWorkbook } from "../src/features/house-designer/construction/report-xlsx";
import {
  MAX_STUDIES, STUDIES_KEY, deleteStudy, fileStem, listStudies, makeStudy, newStudyId, parseStudyFile, readOptions, readOverrides, readRules, readStudy, saveStudy, serializeStudy,
  type StorageLike, type Study,
} from "../src/features/house-designer/construction/study";
import { DEFAULT_OPTIONS, DEFAULT_RULES, type EstimatingRules, type ModelOptions } from "../src/features/house-designer/construction/types";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };
const near = (actual: number, expected: number, message: string, tolerance = 1e-6) => { assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} is not ${expected} (±${tolerance})`); checks += 1; };

/** A store that remembers, and can be told to refuse. */
function memoryStore(options: { failWrites?: boolean } = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { if (options.failWrites) throw new Error("QuotaExceededError"); data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

// ---------------------------------------------------------------------------
// A study the way the lab makes one
// ---------------------------------------------------------------------------

const building: BuildingConfig = normalizeConfig(configForArea(defaultConfig("modern-villa"), 150).config).config;
const overrides: StructureOverrides = { columnSize: 350, beamDepth: 500 };
const options: ModelOptions = { ...DEFAULT_OPTIONS, roofType: "pitched", floorFinish: "stone", blockType: "solid" };
const rules: EstimatingRules = { ...DEFAULT_RULES, openingDeduction: "all", reinforcement: { basis: "ratio", ratios: { ...DEFAULT_RULES.reinforcement.ratios, "concrete.beam": 170 } }, allowances: { ...DEFAULT_RULES.allowances, tiles: 12 } };
let priceBook: PriceBook = setRate(defaultPriceBook(), "concrete.slab", "material", 16250, { status: "quoted", source: "Supplier X quotation 114", date: "2025-02-03" });
priceBook = setRate(priceBook, "steel.beam-bars", "labour", null);
const costRules: CostRules = { ...structuredClone(DEFAULT_COST_RULES), contingencyPercent: 7.5 };
const NOW = new Date("2026-03-04T09:30:00Z");

const study = makeStudy({ name: "  Villa for the Tesfaye plot  ", building, overrides, options, rules, priceBook, costRules, stage: 7 }, NOW, () => 0.5);

equal(study.name, "Villa for the Tesfaye plot", "a study's name is trimmed when it is made");
equal(makeStudy({ ...study, name: "   " }, NOW).name, "Untitled study", "and a name of spaces is no name");
equal(makeStudy({ ...study, id: undefined }, new Date("2026-05-06T07:08:09Z"), () => 0.3).savedAt, "2026-05-06T07:08:09.000Z", "a study made from another is saved at the time it is made, not the time of the other");
equal(study.id, `study_${NOW.getTime().toString(36)}_${Math.floor(0.5 * 36 ** 4).toString(36)}`, "a study is given an id from the time and some chance");
equal(study.savedAt, "2026-03-04T09:30:00.000Z", "and the time it was made");
equal(newStudyId(NOW, () => 0), `study_${NOW.getTime().toString(36)}_0000`, "an id with no chance in it still has four characters of it");
ok(new Set(Array.from({ length: 50 }, () => newStudyId())).size > 45, "ids of studies made one after another are different");

// ---- Saved, listed, replaced, deleted ---------------------------------------------------------------------------------------------------------------------
{
  const store = memoryStore();
  equal(listStudies(store), [], "an empty store has no studies");
  const saved = saveStudy(store, study);
  ok(saved.ok && saved.studies.length === 1, "a study is saved");
  equal(readStudy(JSON.parse(JSON.stringify(study))), readStudy(study), "and reads back as itself");
  const back = listStudies(store);
  equal(back.length, 1, "it is listed");
  equal(back[0]!.name, "Villa for the Tesfaye plot", "with its name trimmed");
  equal(back[0]!.building, building, "its building as it was");
  equal(back[0]!.overrides, overrides, "its structure sizes");
  equal(back[0]!.options, options, "its options");
  equal(back[0]!.rules, rules, "the rules its quantities follow");
  equal(back[0]!.priceBook, priceBook, "its price book, with the rate that was quoted and the one that was cleared");
  equal(back[0]!.costRules, costRules, "its costs that are not work on site");
  equal(back[0]!.stage, 7, "and the stage it was on");
  ok(STUDIES_KEY.startsWith("medosha:"), "kept under a key of the app's own");

  const another = (name: string, when: string, chance: number) => makeStudy({ ...study, id: undefined, name }, new Date(when), () => chance);
  saveStudy(store, another("Second", "2026-03-05T00:00:00Z", 0.1));
  equal(listStudies(store).map((s) => s.name), ["Second", "Villa for the Tesfaye plot"], "the newest comes first");
  saveStudy(store, another("Renamed", "2026-03-06T00:00:00Z", 0.2));
  equal(listStudies(store).map((s) => s.name), ["Renamed", "Second", "Villa for the Tesfaye plot"], "a study saved under a new id is another study");
  const resaved = saveStudy(store, { ...study, name: "Same id, new name", savedAt: "2026-03-07T00:00:00.000Z" });
  ok(resaved.ok, "a study saved again under its own id is saved");
  equal(listStudies(store).map((s) => s.name), ["Same id, new name", "Renamed", "Second"], "and replaces the old one, becoming the newest");
  const deleted = deleteStudy(store, study.id);
  ok(deleted.ok && deleted.studies.every((s) => s.id !== study.id), "a study is deleted");
  equal(listStudies(store).some((s) => s.id === study.id), false, "and is gone");
  ok(deleteStudy(store, "no_such_study").ok, "deleting what is not there is not an error");
}

// ---- When the store refuses, or holds rubbish ---------------------------------------------------------------------------------------------------------------
{
  const full = memoryStore({ failWrites: true });
  const refused = saveStudy(full, study);
  ok(!refused.ok && /download the study as a file/i.test(refused.reason), "a store that is full says so, and says what to do instead");
  equal(listStudies(full), [], "and nothing was kept");
  const store = memoryStore();
  store.data.set(STUDIES_KEY, "{not json");
  equal(listStudies(store), [], "a store that holds rubbish has no studies");
  ok(saveStudy(store, study).ok, "and can be saved over");
  store.data.set(STUDIES_KEY, JSON.stringify({ version: 1, studies: [study, { version: 9 }, "x", null, { ...study, id: "study_second_ok", name: "Fine" }] }));
  equal(listStudies(store).map((s) => s.name).sort(), ["Fine", "Villa for the Tesfaye plot"], "a study that cannot be read is left out, and the rest are kept");
  const crowded = memoryStore();
  for (let i = 0; i < MAX_STUDIES + 5; i += 1) saveStudy(crowded, makeStudy({ ...study, id: undefined, name: `Study ${i}` }, new Date(Date.UTC(2026, 0, 1, 0, i)), () => i / 100));
  equal(listStudies(crowded).length, MAX_STUDIES, "no more than the most are kept");
  equal(listStudies(crowded)[0]!.name, `Study ${MAX_STUDIES + 4}`, "and the newest of them");
  ok(!listStudies(crowded).some((s) => s.name === "Study 0"), "the oldest were dropped");
  const bigStore = memoryStore();
  const custom: PriceBook["entries"] = Object.fromEntries(Array.from({ length: 12000 }, (_, i) => [`custom.item.${i}`, { workItem: `custom.item.${i}`, unit: "m" as const, material: { value: 1, status: "entered" as const, source: "s".repeat(100), date: null }, labour: { value: 1, status: "entered" as const, source: "s".repeat(100), date: null }, includedIn: null, note: "n".repeat(100) }]));
  const tooBig = saveStudy(bigStore, { ...study, id: "study_big_one", priceBook: { ...priceBook, entries: { ...priceBook.entries, ...custom } } });
  ok(!tooBig.ok && /too much/i.test(tooBig.reason), "a study too big for the store is refused, with the reason");
  equal(bigStore.data.size, 0, "and nothing was stored");
}

// ---- A file ------------------------------------------------------------------------------------------------------------------------------------------------
{
  const text = serializeStudy(study);
  const parsed = parseStudyFile(text);
  ok(parsed.ok, "a study written to a file reads back");
  if (parsed.ok) equal(parsed.study, readStudy(study)!, "as the same study");
  equal(serializeStudy(study), serializeStudy(study), "and the same study is the same text");
  ok(!parseStudyFile("{not json").ok && /not readable/i.test((parseStudyFile("{not json") as { reason: string }).reason), "a file that is not JSON is refused, with the reason");
  ok(!parseStudyFile("[]").ok && !parseStudyFile('{"version":2}').ok && !parseStudyFile('{"version":1,"building":{"template":"castle"}}').ok, "so is JSON that is not a study of this version");
  const otherVersion = parseStudyFile(JSON.stringify({ ...JSON.parse(serializeStudy(study)), version: 2 }));
  ok(!otherVersion.ok && /not a study this version can open/.test((otherVersion as { reason: string }).reason), "a study of another version is refused even when the rest of it is right");
  const tooLarge = parseStudyFile(JSON.stringify({ ...JSON.parse(serializeStudy(study)), padding: "x".repeat(3_000_001) }));
  ok(!tooLarge.ok && /too large/.test((tooLarge as { reason: string }).reason), "and so is a file too big to be one, though it is right JSON");
  // What is wrong inside a study is mended, not refused.
  const mangled = parseStudyFile(JSON.stringify({
    version: 1, id: "bad id!", name: "   ", savedAt: "yesterday",
    building: { template: "g-plus-2", length: 1, width: 99999999, floors: 12, floorToFloor: "tall" },
    overrides: { columnSize: "wide", beamDepth: 500, bogus: 1 }, options: { roofType: "dome", floorFinish: "gold", blockType: "mud", mepView: "x", parapetHeight: 99999 },
    rules: { openingDeduction: "some", openingThresholdM2: -4, jointMm: 5000, reinforcement: { basis: "magic", ratios: { "concrete.beam": 5000, "concrete.not a thing": 7, "steel.x": 3 } }, allowances: { concrete: 500, tiles: "lots" }, services: { fall: { waste: 1, soil: "x" }, coldHeight: 99999 } },
    priceBook: "no", costRules: 4, stage: 99,
  }));
  ok(mangled.ok, "a study with a great deal wrong with it is still opened");
  if (mangled.ok) {
    const s = mangled.study;
    equal(s.id, "study_imported", "an id that is not safe is replaced");
    equal(s.name, "Untitled study", "a name of spaces is no name");
    equal(s.savedAt, new Date(0).toISOString(), "a date that is not a date is the beginning of time");
    equal(s.building.template, "g-plus-2", "the template is kept");
    ok(s.building.floors <= 4 && s.building.width < 99999999 && s.building.length >= 9000, `and the size is brought within what the plan can be drawn in (${s.building.length} × ${s.building.width}, ${s.building.floors} floors)`);
    equal(s.overrides, { beamDepth: 500 }, "only structure sizes that are numbers are kept");
    equal(s.options.roofType, "flat", "an unknown roof is the default");
    equal(s.options.floorFinish, DEFAULT_OPTIONS.floorFinish, "and an unknown floor finish");
    equal(s.options.blockType, DEFAULT_OPTIONS.blockType, "and an unknown block");
    equal(s.options.parapetHeight, 2000, "a parapet too high is the highest there is");
    equal(s.rules.openingDeduction, DEFAULT_RULES.openingDeduction, "an unknown opening rule is the default");
    equal(s.rules.openingThresholdM2, 0, "a negative threshold is none");
    equal(s.rules.jointMm, 50, "a joint of five metres is the widest allowed");
    equal(s.rules.reinforcement.basis, "ratio", "an unknown reinforcement rule is the default");
    equal(s.rules.reinforcement.ratios["concrete.beam"], 1000, "a ratio too large is the largest");
    ok(!("concrete.not a thing" in s.rules.reinforcement.ratios) && !("steel.x" in s.rules.reinforcement.ratios), "and a ratio for something that is not concrete is not kept");
    equal(s.rules.allowances.concrete, 100, "an allowance over 100 % is 100 %");
    equal(s.rules.allowances.tiles, DEFAULT_RULES.allowances.tiles, "and one that is not a number is the default");
    equal(s.rules.services.fall.waste, 20, "a fall steeper than allowed is the steepest");
    equal(s.rules.services.fall.soil, DEFAULT_RULES.services.fall.soil, "and a fall that is not a number is the default");
    equal(s.rules.services.coldHeight, 2200, "a height too great is the greatest");
    equal(s.priceBook, defaultPriceBook(), "a price book that is not one is the examples");
    equal(s.costRules, DEFAULT_COST_RULES, "and so are costs that are not");
    equal(s.stage, 1, "a stage that does not exist is the first");
  }
  equal(readStudy({ ...JSON.parse(serializeStudy(study)), name: "  Padded  " })!.name, "Padded", "a name read back from a file is trimmed");
  equal(readStudy({ ...JSON.parse(serializeStudy(study)), name: "x".repeat(200) })!.name.length, 80, "and cut to eighty characters");
  equal(readOverrides(null), {}, "no structure sizes are none");
  equal(readOptions(undefined), DEFAULT_OPTIONS, "no options are the defaults");
  equal(readRules(undefined), DEFAULT_RULES, "and no rules");
  equal(readRules(JSON.parse(JSON.stringify(rules))), rules, "rules saved and read back are the rules");
  equal(readOptions(JSON.parse(JSON.stringify(options))), options, "and options");
  equal(fileStem("Villa for the Tesfaye plot"), "medosha_house_villa_for_the_tesfaye_plot", "a file name is lower case with underscores");
  ok(!fileStem("A — B / C: D?").includes("-") && /^[a-z0-9_]+$/.test(fileStem("A — B / C: D?")), "and has no hyphen, nothing a system would refuse");
  equal(fileStem("—  ///  —"), "medosha_house", "a name of punctuation still gives a file name");
  ok(fileStem("x".repeat(200)).length <= "medosha_house_".length + 40, "and a long name is cut");
}

// ---------------------------------------------------------------------------
// A study opens as the building it was
// ---------------------------------------------------------------------------

const workOut = (s: Study) => {
  const built = buildBuilding(s.building, s.overrides);
  const buildOptions = { ...DEFAULT_OPTIONS, ...built.options, ...s.options };
  const model = buildConstructionModel(built.project, buildOptions, s.rules);
  const bill = buildBill(model, buildOptions, "building");
  const areas = areasOf(built.project, buildOptions.roofType);
  const estimate = estimateCost(bill, s.priceBook, s.costRules, { grossFloor: areas.grossFloorArea, totalSlab: areas.totalSlabArea });
  return { built, model, bill, areas, estimate, buildOptions };
};

const original = workOut(study);
const store = memoryStore();
saveStudy(store, study);
const reopened = listStudies(store)[0]!;
const again = workOut(reopened);
// (A project is stamped with the time it was made; nothing else in it depends on the clock.)
const unstamped = (project: typeof again.built.project) => JSON.stringify({ ...project, metadata: { ...project.metadata, updatedAt: "" } });
equal(unstamped(again.built.project), unstamped(original.built.project), "the study reopens as the same building, plan and structure");
equal(again.bill.lines.map((l) => `${l.ref}|${l.workItem}|${l.net}`), original.bill.lines.map((l) => `${l.ref}|${l.workItem}|${l.net}`), "with the same bill of quantities, line for line");
equal(again.estimate.total, original.estimate.total, "and the same total, to the last digit");
equal(again.estimate.lines.map((l) => l.total), original.estimate.lines.map((l) => l.total), "and the same cost for every line");
ok(original.estimate.lines.find((l) => l.workItem === "steel.beam-bars")!.pricing === "partial" && again.estimate.lines.find((l) => l.workItem === "steel.beam-bars")!.pricing === "partial", "the rate that was cleared is still missing");
ok(again.estimate.lines.find((l) => l.workItem === "concrete.slab")!.flags.includes("quoted-rate"), "and the rate that was quoted is still quoted");
near(again.estimate.contingency.percent, 7.5, "with its contingency", 0);
equal(again.buildOptions.roofType, "pitched", "and its roof");
ok(original.bill.lines.some((l) => l.workItem === "roof.truss"), "a pitched roof has trusses in the bill");
// A study of the same building with other rules is a different bill.
const other = workOut({ ...reopened, rules: { ...reopened.rules, openingDeduction: "none" } });
ok(other.bill.lines.find((l) => l.workItem === "masonry.wall-area")!.net! > original.bill.lines.find((l) => l.workItem === "masonry.wall-area")!.net!, "the rules it was saved with are what make its quantities");

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

const report: Report = buildReport({ model: original.model, building: study.building, areas: original.areas, options: original.buildOptions, rules: study.rules, bill: original.bill, estimate: original.estimate, book: study.priceBook, costRules: study.costRules, generatedAt: "2026-03-04T09:30:00Z" });
const table = (id: string) => report.tables.find((t) => t.id === id)!;
equal(report.tables.map((t) => t.id), ["bill", "bill-floor", "bill-stage", "bill-category", "cost-summary", "cost-groups", "cost-lines", "rates", "problems", "assumptions"], "the report has its tables in order");
ok(report.tables.every((t) => t.sheet.length <= 31 && !/[:\\/?*[\]]/.test(t.sheet)), "each with a sheet name Excel accepts");
equal(new Set(report.tables.map((t) => t.sheet)).size, report.tables.length, "and no two the same");
ok(report.tables.every((t) => t.rows.every((r) => r.length === t.columns.length)), "every row has a cell for every column");
for (const id of ["bill", "bill-floor", "bill-stage", "bill-category"]) {
  const t = table(id);
  const sumM3 = t.rows.filter((r) => r[3] === "m³").reduce((s, r) => s + (r[4] as number), 0);
  near(sumM3, original.bill.lines.filter((l) => l.unit === "m³").reduce((s, l) => s + (l.net ?? 0), 0), `the bill by ${id.replace("bill-", "") || "section"} adds up to the cubic metres of the bill`, 0.01);
}
equal(table("bill").rows.length, original.bill.lines.length, "the bill by section has a row for each line");
ok(table("bill-floor").rows.length >= original.bill.lines.length, "and by floor a row for each part of a line in each floor");
// The tables say what the bill and the estimate say, line by line.
{
  const billRows = table("bill").rows;
  original.bill.lines.forEach((l, i) => {
    const row = billRows[i]!;
    equal([row[1], row[2], row[3], row[4], row[6]], [l.ref, l.description, l.unit, l.net === null ? null : Math.round(l.net * 1000) / 1000, l.status], `the bill's row ${i + 1} is ${l.ref}, ${l.description}`);
    equal(row[5], l.allowanceQuantity === null ? null : Math.round(l.allowanceQuantity * 1000) / 1000, `${l.ref}: with its allowance`);
  });
  const costRows = table("cost-lines").rows;
  original.estimate.lines.forEach((l, i) => {
    const row = costRows[i]!;
    equal([row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9]], [l.ref, l.description, l.unit, l.net === null ? null : Math.round(l.net * 1000) / 1000, l.materialRate, l.labourRate, Math.round(l.material * 100) / 100, Math.round(l.labour * 100) / 100, Math.round(l.total * 100) / 100], `the priced bill's row ${i + 1} is ${l.ref}: its quantity, both rates and what they come to`);
  });
}
const cost = table("cost-lines");
near(cost.rows.slice(0, -1).reduce((s, r) => s + (r[9] as number), 0), original.estimate.direct, "the priced lines add up to the direct cost", 0.005 * cost.rows.length);
equal(cost.rows.at(-1)![0], "Total", "with a total at the foot");
near(cost.rows.at(-1)![9] as number, Math.round(original.estimate.direct * 100) / 100, "which is the direct cost", 0.006);
const summary = table("cost-summary");
near(summary.rows.find((r) => r[0] === "TOTAL")![1] as number, Math.round(original.estimate.total * 100) / 100, "the build-up ends in the total", 0.006);
ok(summary.rows.some((r) => /Contingency, 7\.5 %/.test(String(r[0]))), "naming the contingency that was set");
equal(table("problems").rows.map((r) => r[0]).length, original.estimate.summary.problems.length, "the problems are listed");
ok(table("problems").rows.some((r) => /Labour price missing/.test(String(r[2]))), "among them the labour rate that was cleared");
for (const grouping of ["By section", "By floor", "By stage", "By category"]) {
  const rows = table("cost-groups").rows.filter((r) => r[0] === grouping);
  ok(rows.length >= 2, `${grouping}: the cost falls in ${rows.length} groups`);
  near(rows.reduce((sum, r) => sum + (r[5] as number), 0), 1, `${grouping}: and the shares add up to the whole`, 0.0006 * rows.length);
  near(rows.reduce((sum, r) => sum + (r[4] as number), 0), original.estimate.direct, `${grouping}: and the costs to the direct cost`, 0.006 * rows.length);
  ok(rows.every((r) => Math.abs((r[2] as number) + (r[3] as number) - (r[4] as number)) < 0.011), `${grouping}: each group's materials and labour make its total`);
}
const perM2Row = report.summary.find(([k]) => k === "Per m² of gross floor area")!;
ok(perM2Row[1] === `ETB ${Math.round(original.estimate.area.perM2!).toLocaleString("en")}`, "the summary gives the cost per square metre of gross floor area");
ok(report.summary.find(([k]) => k === "Per m² of slab, balconies included")![1] === `ETB ${Math.round(original.estimate.area.perM2Slab!).toLocaleString("en")}`, "and of slab, balconies included");
ok(report.summary.find(([k]) => k === "Direct cost on example rates")![1].endsWith(" %") && report.summary.some(([k, v]) => k === "Gross floor area, m²" && v === (Math.round(original.areas.grossFloorArea * 10) / 10).toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 })), "and how much rests on example rates, and the floor area");
const freeRow = table("rates").rows.find((r) => r[0] === "earth.pit")!;
equal([freeRow[2], freeRow[4]], [0, "nothing to pay"], "a rate of nothing is said to be nothing to pay, not an example");
const slabRates = table("rates").rows.find((r) => r[0] === "concrete.slab")!;
equal([slabRates[2], slabRates[4], slabRates[6]], [16250, "quoted", "Supplier X quotation 114, 2025-02-03"], "the rates used say the slab's material is quoted, and by whom and when");
equal([slabRates[5], slabRates[7]], ["example", "Example rate (an assumption)"], "and that its labour is an example");
const beamBars = table("rates").rows.find((r) => r[0] === "steel.beam-bars")!;
equal([beamBars[3], beamBars[5]], [null, "no rate"], "a labour rate that was cleared is no rate, not nothing");
ok(!table("rates").rows.some((r) => r[0] === "masonry.blocks"), "and a line included in another has no rates of its own");
ok(report.notes.some((n) => /indicative/i.test(n) && /example/i.test(n)), "the notes say it is indicative and that the rates are examples");
ok(report.notes.some((n) => /not from a bar schedule/i.test(n)), "that steel is not from a bar schedule");
ok(report.notes.some((n) => /not a structural, electrical, plumbing or architectural design/i.test(n) && /ready to build/i.test(n)), "and that it is not a design and not ready to build");
ok(report.summary.some(([k, v]) => k === "Total with additions, contingency and tax" && v.includes(Math.round(original.estimate.total).toLocaleString("en"))), "the summary gives the total");
equal(buildReport({ model: original.model, building: study.building, areas: original.areas, options: original.buildOptions, rules: study.rules, bill: original.bill, estimate: original.estimate, book: study.priceBook, costRules: study.costRules, generatedAt: "2026-03-04T09:30:00Z" }), report, "and the same study gives the same report");

// ---------------------------------------------------------------------------
// The workbook, opened as a spreadsheet opens it
// ---------------------------------------------------------------------------

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (data: Uint8Array) => { let c = 0xffffffff; for (const b of data) c = (c >>> 8) ^ CRC[(c ^ b) & 0xff]!; return (c ^ 0xffffffff) >>> 0; };

/** The files of a zip: the central directory is read, and each file's checksum and size are checked against its own header. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  assert.ok(eocd >= 0, "an end of central directory record");
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const files = new Map<string, string>();
  for (let n = 0; n < count; n += 1) {
    assert.equal(view.getUint32(at, true), 0x02014b50, "a central directory entry");
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.slice(at + 46, at + 46 + nameLength));
    assert.equal(method, 0, `${name} is stored`);
    assert.equal(view.getUint32(local, true), 0x04034b50, `${name} has a local header`);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.slice(start, start + size);
    assert.equal(crc32(data), crc, `${name}: the checksum is right`);
    files.set(name, new TextDecoder().decode(data));
    at += 46 + nameLength + extraLength + commentLength;
    checks += 2;
  }
  return files;
}

const unescapeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
type Grid = Map<string, string | number>;
function readSheet(xml: string): { cells: Grid; rows: number } {
  const cells: Grid = new Map();
  let rows = 0;
  for (const row of xml.matchAll(/<row r="(\d+)">([\s\S]*?)<\/row>/g)) {
    rows = Math.max(rows, Number(row[1]));
    for (const c of row[2]!.matchAll(/<c r="([A-Z]+\d+)"[^>]*?(?: t="(inlineStr)")?>(?:<v>([^<]*)<\/v>|<is><t[^>]*>([^<]*)<\/t><\/is>)<\/c>/g)) cells.set(c[1]!, c[2] ? unescapeXml(c[4] ?? "") : Number(c[3]));
  }
  return { cells, rows };
}
const colName = (i: number) => { let n = ""; let r = i; while (r >= 0) { n = String.fromCharCode(65 + (r % 26)) + n; r = Math.floor(r / 26) - 1; } return n; };

{
  const bytes = reportWorkbook(report, study.priceBook);
  ok(bytes[0] === 0x50 && bytes[1] === 0x4b, "the workbook is a zip");
  const files = unzip(bytes);
  for (const name of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml"]) ok(files.has(name), `${name} is in it`);
  const names = [...files.get("xl/workbook.xml")!.matchAll(/<sheet name="([^"]*)"/g)].map((m) => unescapeXml(m[1]!));
  equal(names, ["Summary", ...report.tables.map((t) => t.sheet), "Price book"], "the sheets are the summary, the tables of the report, and the price book");
  ok(names.every((n) => n.length <= 31), "none with a name too long");
  const sheetOf = (name: string) => readSheet(files.get(`xl/worksheets/sheet${names.indexOf(name) + 1}.xml`)!);

  for (const t of report.tables) {
    const { cells, rows } = sheetOf(t.sheet);
    equal(rows, t.rows.length + 1, `${t.sheet}: a row for each row of the table and one for the headings`);
    t.columns.forEach((c, i) => equal(cells.get(`${colName(i)}1`), c.header, `${t.sheet}: heading ${i + 1} is ${c.header}`));
    // Every cell that has something in it is what the report has.
    let compared = 0;
    t.rows.forEach((row, r) => row.forEach((value, c) => {
      const got = cells.get(`${colName(c)}${r + 2}`);
      if (value === null || value === "") { assert.equal(got, undefined, `${t.sheet} ${colName(c)}${r + 2} is empty`); return; }
      assert.deepEqual(got, value, `${t.sheet} ${colName(c)}${r + 2}`);
      compared += 1;
    }));
    checks += t.rows.length * t.columns.length;
    ok(compared > 0, `${t.sheet}: ${compared} cells compared`);
  }
  // Numbers are numbers: a spreadsheet can add them up.
  const costSheet = sheetOf("Cost");
  const lines = report.tables.find((t) => t.id === "cost-lines")!.rows.length - 1;
  let total = 0;
  for (let r = 2; r < lines + 2; r += 1) { const v = costSheet.cells.get(`J${r}`); ok(typeof v === "number", `Cost J${r} is a number`); total += v as number; }
  near(total, original.estimate.direct, "the Total column of the Cost sheet adds up to the direct cost", 0.005 * lines);
  near(costSheet.cells.get(`J${lines + 2}`) as number, Math.round(original.estimate.direct * 100) / 100, "and the foot of it says the same", 0.006);
  const summarySheet = sheetOf("Summary");
  equal(summarySheet.cells.get("A1"), report.title, "the summary begins with the title of the report");
  ok([...summarySheet.cells.values()].some((v) => typeof v === "string" && /ETB/.test(v) && v.includes(Math.round(original.estimate.total).toLocaleString("en"))), "and gives the total in birr");
  ok([...summarySheet.cells.values()].some((v) => typeof v === "string" && /not a structural, electrical, plumbing or architectural design/i.test(v)), "and the note that it is not a design");
  const bookSheet = sheetOf("Price book");
  equal(bookSheet.rows, Object.keys(study.priceBook.entries).length + 1, "the price book sheet has every entry");
  const slabRow = [...bookSheet.cells].find(([k, v]) => k.startsWith("A") && v === "concrete.slab")![0].slice(1);
  equal([bookSheet.cells.get(`C${slabRow}`), bookSheet.cells.get(`D${slabRow}`), bookSheet.cells.get(`E${slabRow}`), bookSheet.cells.get(`F${slabRow}`)], [16250, "quoted", "Supplier X quotation 114", "2025-02-03"], "the rate that was quoted is there with its source and date");
  const exampleRow = [...bookSheet.cells].find(([k, v]) => k.startsWith("A") && v === "concrete.beam")![0].slice(1);
  equal([bookSheet.cells.get(`D${exampleRow}`), bookSheet.cells.get(`E${exampleRow}`), bookSheet.cells.get(`H${exampleRow}`)], ["example", "Example rate (an assumption)", "example"], "an example rate is called one in the price book, with its source");
  const includedRow = [...bookSheet.cells].find(([k, v]) => k.startsWith("A") && v === "masonry.blocks")![0].slice(1);
  equal([bookSheet.cells.get(`C${includedRow}`), bookSheet.cells.get(`K${includedRow}`)], [undefined, "masonry.wall-area"], "a line included in another has no rate, and says in which");
  const beamRow = [...bookSheet.cells].find(([k, v]) => k.startsWith("A") && v === "steel.beam-bars")![0].slice(1);
  equal(bookSheet.cells.get(`G${beamRow}`), undefined, "and the rate that was cleared is an empty cell, not a nought");
  equal(reportWorkbook(report, study.priceBook), bytes, "the same report is the same workbook, byte for byte");
  // The names of the downloads.
  ok(/^medosha_house_[a-z0-9_]+$/.test(fileStem(study.name)), "and the file is named with underscores");
}

// ---------------------------------------------------------------------------
// The PDF
// ---------------------------------------------------------------------------

// The type of text, by hand: Helvetica H 722, e 556, l 222, l 222, o 556 = 2 278 thousandths.
near(textWidth("Hello", 10), 22.78, "Hello at 10 points in Helvetica is 22.78 points wide", 1e-9);
near(textWidth("Hello", 10, true), 24.45, "and in Helvetica Bold 24.45", 1e-9);
near(textWidth("", 10), 0, "nothing is no width", 0);
near(textWidth("\u00e9", 10), 5.56, "a letter with an accent is 556 thousandths, as a letter", 1e-9);
near(textWidth("\u00b2", 10), 3.33, "a superscript two is 333", 1e-9);
near(textWidth("\u00d7", 10), 5.84, "the multiplication sign 584", 1e-9);
near(textWidth("\u0096", 10), 5.56, "and an en dash 556", 1e-9);
near(textWidth("\u0097", 10), 10, "and an em dash 1000", 1e-9);
equal(winAnsi("m² × 3³ – ok"), "m² × 3³ \u0096 ok", "superscripts, the multiplication sign and the en dash are in WinAnsi");
equal(winAnsi("≥ 5 → ok"), ">= 5 -> ok", "what WinAnsi lacks is spelled out where it can be");
equal(winAnsi("日本"), "??", "and is a question mark where it cannot");
equal(winAnsi("a\tb\nc"), "a b c", "tabs and line ends are spaces");
equal(winAnsi("é"), "é", "letters with accents are kept");
equal(winAnsi("€"), "\u0080", "the euro sign is where WinAnsi puts it");
{
  const words = "aaa bbb ccc ddd";
  const width = textWidth("aaa bbb", 10);
  equal(wrapText(words, 10, width + 0.01), ["aaa bbb", "ccc ddd"], "text breaks at spaces, as late as it can");
  equal(wrapText("aaa bbb", 10, textWidth("aaa bbb", 10)), ["aaa bbb"], "a line exactly as wide as the space still fits");
  equal(wrapText("aaa", 10, 100), ["aaa"], "a short line stays whole");
  const broken = wrapText("abcdefghijklmnopqrstuvwxyz", 10, 40);
  ok(broken.length > 3 && broken.every((l) => textWidth(l, 10) <= 40) && broken.join("") === "abcdefghijklmnopqrstuvwxyz", "a word too long for a line is broken inside, losing nothing");
  equal(wrapText("one\ntwo", 10, 100), ["one", "two"], "a line end is a line end");
  equal(wrapText("", 10, 100), [""], "and nothing is one empty line");
}

/** The text of every page, read by pdf.js. */
type PdfJs = { getDocument(o: { data: Uint8Array; verbosity: number }): { promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getViewport(o: { scale: number }): { width: number; height: number }; getTextContent(): Promise<{ items: { str: string }[] }> }>; getMetadata(): Promise<{ info: Record<string, string> }> }> } };
async function readPdf(bytes: Uint8Array) {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJs;
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const pages: { width: number; height: number; text: string[] }[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    pages.push({ width: Math.round(vp.width), height: Math.round(vp.height), text: (await page.getTextContent()).items.map((i) => i.str).filter((s) => s.trim() !== "") });
  }
  return { count: doc.numPages, pages, info: (await doc.getMetadata()).info };
}

/** The cross-reference table, checked against the file: each entry must point at the object it names. */
function checkXref(bytes: Uint8Array): number {
  const text = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  ok(text.startsWith("%PDF-1."), "a PDF begins with its header");
  ok(text.trimEnd().endsWith("%%EOF"), "and ends with its marker");
  const start = Number(/startxref\n(\d+)\n%%EOF\n?$/.exec(text)![1]);
  equal(text.slice(start, start + 4), "xref", "startxref points at the table");
  const header = /^xref\n0 (\d+)\n/.exec(text.slice(start))!;
  const size = Number(header[1]);
  const entries = text.slice(start + header[0].length, start + header[0].length + size * 20);
  for (let n = 1; n < size; n += 1) {
    const entry = entries.slice(n * 20, n * 20 + 20);
    ok(/^\d{10} 00000 n \n$/.test(entry), `entry ${n} is twenty bytes`);
    const offset = Number(entry.slice(0, 10));
    equal(text.slice(offset, offset + `${n} 0 obj`.length), `${n} 0 obj`, `entry ${n} points at object ${n}`);
  }
  const trailer = /trailer\n<< \/Size (\d+) \/Root 1 0 R \/Info 5 0 R >>/.exec(text)!;
  equal(Number(trailer[1]), size, "the trailer's size is the table's");
  for (const len of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const from = len.index! + len[0].length;
    equal(text.slice(from + Number(len[1]), from + Number(len[1]) + 10), "\nendstream", "a stream is as long as it says");
  }
  return size;
}

async function pdfChecks(): Promise<void> {
  const bytes = reportPdf(report);
  checkXref(bytes);
  const pdf = await readPdf(bytes);
  ok(pdf.count >= 12, `the report is ${pdf.count} pages`);
  equal(pdf.info.Title, report.title, "the document is titled");
  equal(pdf.info.Producer, "Medosha", "and says what made it");
  ok(pdf.pages.slice(0, 1).every((p) => p.width === 595 && p.height === 842), "the first page is A4, upright");
  ok(pdf.pages.some((p) => p.width === 842 && p.height === 595), "and the priced bill is on pages laid on their side");
  pdf.pages.forEach((p, i) => ok(p.text.includes(`Page ${i + 1} of ${pdf.count}`), `page ${i + 1} says which page it is`));
  const all = pdf.pages.flatMap((p) => p.text);
  ok(report.title.startsWith(pdf.pages[0]!.text[0]!) && pdf.pages[0]!.text[0]!.length > 15, "the first page carries the title");
  ok(all.some((s) => s === "Read this first"), "and the warnings");
  const footer = `Medosha · ${report.subtitle} · indicative estimate, not a quotation`;
  ok(pdf.pages.every((p) => p.text.includes(footer)), "every page's footer says what it is, and that it is not a quotation");
  for (const note of report.notes) ok(all.some((s) => s.length > 30 && note.startsWith(s)), `the note "${note.slice(0, 40)}…" is in the document`);
  equal(pdf.info.CreationDate, "D:20260304093000Z", "the document is dated the day and the time of the report");
  const totalText = (Math.round(original.estimate.total * 100) / 100).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  ok(all.includes(totalText), `the total, ${totalText}, is in the document`);
  ok(all.some((s) => s === "TOTAL"), "on the line headed TOTAL");
  // Every line of the bill is in the document, by its reference, and with its figure.
  for (const l of original.estimate.lines) ok(all.includes(l.ref), `${l.ref} is in the document`);
  const concreteLine = original.bill.lines.find((l) => l.workItem === "concrete.slab")!;
  ok(all.includes(concreteLine.net!.toLocaleString("en", { minimumFractionDigits: 3, maximumFractionDigits: 3 })), `and the slabs' ${concreteLine.net} m³`);
  ok(all.some((s) => /m³/.test(s)) && all.some((s) => /m²/.test(s)), "units come out with their superscripts");
  ok(!all.some((s) => /\?\?/.test(s)), "and no text came out as question marks");
  for (const heading of ["Bill of quantities by section", "Bill of quantities by floor", "Bill of quantities by construction stage", "Bill of quantities by category", "The bill, priced", "The rates used", "How the total is built up (ETB)", "What could not be priced", "Where the direct cost falls", "The rules and assumptions behind the figures"]) ok(all.includes(heading), `"${heading}" is a heading`);
  const raw = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  ok(/\/F2 7\.5 Tf [\d. -]+ Td \(TOTAL\) Tj/.test(raw) && /\/F1 7\.5 Tf [\d. -]+ Td \(Labour\) Tj/.test(raw), "the line headed TOTAL is in bold, the others are not");
  const orderOf = (heading: string) => pdf.pages.findIndex((p) => p.text.includes(heading));
  ok(orderOf("How the total is built up (ETB)") <= orderOf("What could not be priced") && orderOf("What could not be priced") <= orderOf("Bill of quantities by section") && orderOf("Bill of quantities by category") <= orderOf("The bill, priced") && orderOf("The bill, priced") <= orderOf("The rates used") && orderOf("The rates used") <= orderOf("The rules and assumptions behind the figures"), "and the tables come in the order: the total, what is wrong, the bill, the priced bill, the rates, the rules");
  equal(reportPdf(report), bytes, "the same report is the same PDF, byte for byte");

  // A table longer than a page starts again with its headings.
  const long = buildPdf({ title: "Long", footer: "f", date: "2026-01-01", blocks: [{ t: "table", columns: [{ header: "Name", align: "left", weight: 3 }, { header: "Value", align: "right", weight: 1 }], rows: Array.from({ length: 200 }, (_, i) => [`Item ${i}`, String(i)]) }] });
  checkXref(long);
  const lp = await readPdf(long);
  ok(lp.count >= 4 && lp.pages.every((p) => p.text.includes("Name") && p.text.includes("Value")), `a table of 200 rows runs over ${lp.count} pages, with its headings on each`);
  ok(lp.pages.flatMap((p) => p.text).filter((s) => /^Item \d+$/.test(s)).length === 200, "and no row is lost between pages");
  const grouped = buildPdf({ title: "Grouped", footer: "f", date: "2026-01-01", blocks: [{ t: "table", groupBy: 0, columns: [{ header: "Group", align: "left", weight: 1 }, { header: "Name", align: "left", weight: 3 }], rows: Array.from({ length: 150 }, (_, i) => [i < 100 ? "Alpha group" : "Beta group", `Row ${i}`]) }] });
  checkXref(grouped);
  const gp = await readPdf(grouped);
  ok(gp.count >= 3 && gp.pages.every((p) => p.text.includes("Alpha group") || p.text.includes("Beta group")), "a group that runs over a page is named again at the head of the next");
  ok(gp.pages.flatMap((p) => p.text).filter((t) => /^Row \d+$/.test(t)).length === 150 && !gp.pages.flatMap((p) => p.text).includes("Group"), "with every row there once, and the column that names the group left out of the table");
  // Awkward text.
  const awkward = buildPdf({ title: "Awkward (title) \\ ü – ≥", footer: "f (g)", date: "2026-01-01", blocks: [
    { t: "paragraph", text: "Pipe (110 mm) \\ test with brackets ) ( and a backslash \\" },
    { t: "table", columns: [{ header: "A", align: "left", weight: 1 }, { header: "B", align: "right", weight: 1 }], rows: [["x".repeat(400), "1"], ["", ""], ["é – ≥ 日本", "²"]] },
  ] });
  checkXref(awkward);
  const ap = await readPdf(awkward);
  const at = ap.pages.flatMap((p) => p.text);
  ok(at.some((s) => s.includes("Pipe (110 mm) \\ test")), "brackets and backslashes survive in the text");
  ok(at.filter((s) => /^x+$/.test(s)).join("").length >= 100, "a word longer than the page is broken, not lost");
  equal(ap.info.Title, "Awkward (title) \\ ü – ≥", "a title with brackets, a backslash and an en dash is read back as written");
  const empty = buildPdf({ title: "Empty", footer: "f", date: "not a date", blocks: [] });
  checkXref(empty);
  equal((await readPdf(empty)).count, 1, "a document with nothing in it is one page");
  equal((await readPdf(empty)).info.CreationDate, "D:19800101000000Z", "and one with no date is dated 1980, the earliest a file can be");
  equal((await readPdf(buildPdf({ title: "Dated", footer: "f", date: "2026-07-08", blocks: [] }))).info.CreationDate, "D:20260708000000Z", "a date with no time is midnight");
}

pdfChecks().then(
  () => console.log(`Construction saving and exports: ${checks} checks passed.`),
  (error) => { console.error(error); process.exit(1); },
);
