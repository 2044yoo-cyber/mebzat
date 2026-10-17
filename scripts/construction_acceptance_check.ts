/**
 * Acceptance: the four buildings, each at 150 m² and at 200 m² a floor, through every stage and every viewer control, to the bill, the estimate and the two
 * documents.
 *
 *   npx tsx scripts/construction_acceptance_check.ts
 *
 * The other checks look hard at one thing each. This one looks at the whole of what an engineer would do with the tool, on every building the tool can make:
 * the eighteen stages are there and each has work in it; the building goes up in the order the stages say, formwork and props come away, and the finished
 * building has everything; the viewer's controls (a floor at a time, one kind of work on its own, the exploded view, the cut-away, the ghost of what comes
 * next, the courses of a wall) do what they say; every part can be inspected; the areas are the ones asked for; and the bill and the cost grow stage by stage to
 * the totals that the workbook and the PDF print.
 */
import assert from "node:assert/strict";

import { BUILDING_TEMPLATES, TEMPLATES, areasOf, buildBuilding, configForArea, defaultConfig, type BuiltBuilding } from "../src/features/house-designer/construction/building-config";
import { buildBill, type Bill } from "../src/features/house-designer/construction/boq";
import { auditBill } from "../src/features/house-designer/construction/boq-audit";
import { knowledgeFor } from "../src/features/house-designer/construction/catalogue";
import { DEFAULT_COST_RULES, estimateCost } from "../src/features/house-designer/construction/estimate";
import { explodeInfo } from "../src/features/house-designer/construction/explode";
import { describeComponent } from "../src/features/house-designer/construction/inspect";
import { buildConstructionModel } from "../src/features/house-designer/construction/model";
import { defaultPriceBook } from "../src/features/house-designer/construction/price-book";
import { buildReport } from "../src/features/house-designer/construction/report";
import { reportPdf } from "../src/features/house-designer/construction/report-pdf";
import { reportWorkbook } from "../src/features/house-designer/construction/report-xlsx";
import { STAGES } from "../src/features/house-designer/construction/stages";
import { DEFAULT_OPTIONS, DEFAULT_RULES, DEFAULT_VIEW, STAGE_IDS, type ComponentRecord, type ConstructionModel, type StageId, type ViewState } from "../src/features/house-designer/construction/types";
import { cutPlane, indexModel, isolateLayer, setStage, shapeVisible, showStoreysUpTo, visibleComponents } from "../src/features/house-designer/construction/view";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };
const near = (actual: number, expected: number, message: string, tolerance = 1e-6) => { assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} is not ${expected} (±${tolerance})`); checks += 1; };

// The eighteen stages the learning mode has always had, in their order: a change to one of them is a decision, not an accident.
equal(STAGES.map((s) => `${s.id}. ${s.title}`), [
  "1. Site preparation", "2. Excavation and earthworks", "3. Foundation system", "4. Ground-floor construction", "5. Reinforced-concrete frame", "6. Slabs and staircases",
  "7. Masonry and blockwork", "8. Roof construction", "9. Electrical installation", "10. Plumbing and drainage", "11. Plastering and wall preparation", "12. Ceilings and insulation",
  "13. Flooring, wall tiles and wet areas", "14. Doors, windows and glazing", "15. Painting and decoration", "16. Kitchen and built-in furniture", "17. Furniture and final interior", "18. External works and completion",
], "the eighteen stages are the eighteen the mode began with");
equal([...STAGE_IDS], Array.from({ length: 18 }, (_, i) => i + 1), "numbered one to eighteen");

const SIZES = [150, 200] as const;
const textOf = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join("");

for (const template of BUILDING_TEMPLATES) {
  for (const size of SIZES) {
    const name = `${TEMPLATES[template].label} at ${size} m² a floor`;
    const { config, issues } = configForArea(defaultConfig(template), size);
    const building: BuiltBuilding = buildBuilding(config);
    const model: ConstructionModel = buildConstructionModel(building.project, { ...DEFAULT_OPTIONS, ...building.options }, DEFAULT_RULES);
    const options = model.options;
    const index = indexModel(model);
    const base: ViewState = { ...DEFAULT_VIEW, options };

    // ---- The building is the size that was asked for ---------------------------------------------------------------------------------------------------
    equal(issues, [], `${name}: the size is one the plan can be drawn in`);
    ok(building.areas.areaPerFloor.every((a) => Math.abs(a - size) < 0.5), `${name}: every floor is ${size} m² (${building.areas.areaPerFloor.map((a) => a.toFixed(2)).join(", ")})`);
    near(building.areas.grossFloorArea, size * config.floors, `${name}: the gross floor area is ${config.floors} floors of ${size} m²`, 0.5 * config.floors);
    equal(model.storeys.length, config.floors, `${name}: a storey in the model for each floor asked for`);
    equal(model.warnings, [], `${name}: the model has nothing to warn of`);
    near(building.areas.footprint, building.areas.areaPerFloor[0]!, `${name}: the footprint is the ground floor`, 1e-9);

    // ---- Eighteen stages, each with work in it, going up in order -----------------------------------------------------------------------------------------
    for (const stage of STAGE_IDS) ok(model.components.some((c) => c.stage === stage), `${name}: stage ${stage} has work in it`);
    let before = new Set<string>();
    let lastingBefore = new Set<string>();
    let finishedCount = 0;
    const permanent: number[] = [];
    for (const stage of STAGE_IDS) {
      const view = setStage(base, stage as StageId);
      const visible = visibleComponents(model, view, index);
      const concrete = new Set(visible.filter((v) => v.component.layer === "concrete").map((v) => v.component.id));
      for (const id of before) assert.ok(concrete.has(id), `${name}: ${id} was built and is gone at stage ${stage}`);
      checks += before.size > 0 ? 1 : 0;
      before = concrete;
      ok(visible.every((v) => v.component.stage <= stage), `${name}: at stage ${stage} nothing of a later stage is built`);
      ok(visible.every((v) => v.component.removedAfter === undefined || v.component.removedAfter >= stage), `${name}: and nothing that has been taken away is still there`);
      // What stays: not what is taken away (formwork, props, markers, spoil), not the steel that is inside the concrete once its stage is over, not the services that are covered.
      // Whatever was built and is meant to stay is still there at every later stage, part by part: a count could hide one part lost for another found.
      const lasting = new Set(visible.filter((v) => v.component.removedAfter === undefined && v.component.layer !== "reinforcement" && !v.component.concealed).map((v) => v.component.id));
      for (const id of lastingBefore) assert.ok(lasting.has(id), `${name}: ${index.byId.get(id)!.name} (${id}) was built to stay and is gone at stage ${stage}`);
      checks += lastingBefore.size > 0 ? 1 : 0;
      lastingBefore = lasting;
      permanent.push(lasting.size);
      finishedCount = visible.length;
    }
    ok(finishedCount > 500, `${name}: the finished building has ${finishedCount} parts on show`);
    ok(permanent[0]! < permanent[2]! && permanent[2]! < permanent[4]! && permanent[4]! < permanent[6]! && permanent[6]! < permanent[17]!, `${name}: the building grows: ${permanent.join(" → ")}`);
    const at = (stage: StageId, patch: Partial<ViewState> = {}) => visibleComponents(model, { ...setStage(base, stage), ...patch }, index);
    ok(at(3).some((v) => v.component.layer === "formwork") && at(5).some((v) => v.component.layer === "formwork") && at(5).some((v) => v.component.layer === "props"), `${name}: formwork and props stand while the foundations and the frame are cast`);
    ok(at(18).every((v) => v.component.layer !== "formwork" && v.component.layer !== "props" && v.component.layer !== "temporary"), `${name}: and are all taken away by the end`);
    ok(at(18).every((v) => v.component.layer !== "reinforcement"), `${name}: the steel is inside the concrete by then`);
    const finished = new Set(at(18).map((v) => v.component.category));
    for (const category of ["substructure", "frame", "masonry", "roof", "openings", "finishes", "joinery", "external", "electrical", "plumbing"] as const) ok(finished.has(category), `${name}: the finished building has its ${category}`);
    const layers = new Set(at(18).map((v) => v.component.layer));
    for (const layer of ["concrete", "masonry", "plaster", "paint", "tile", "glass", "ceiling", "roofing", "joinery", "external"] as const) ok(layers.has(layer), `${name}: and its ${layer}`);
    for (const roofType of ["flat", "pitched"] as const) {
      const roof = at(18, { options: { ...options, roofType } }).filter((v) => v.component.variant?.group === "roof");
      ok(roof.length > 0 && roof.every((v) => v.component.variant?.value === roofType), `${name}: with a ${roofType} roof chosen the ${roof.length} parts of the roof are ${roofType} ones, and only those`);
    }

    // ---- The viewer's controls ------------------------------------------------------------------------------------------------------------------------------
    const all18 = at(18).length;
    const ground = visibleComponents(model, showStoreysUpTo(model, setStage(base, 18), 0), index);
    ok(ground.length < all18 && ground.filter((v) => v.component.storeyIndex === 0).length > 100 && ground.every((v) => v.component.storeyIndex <= 0), `${name}: a floor at a time: the ground floor alone is ${ground.length} of ${all18} parts, ${ground.filter((v) => v.component.storeyIndex === 0).length} of them its own, and nothing from above`);
    const steel = visibleComponents(model, isolateLayer(setStage(base, 5), "reinforcement"), index);
    ok(steel.length > 100 && steel.every((v) => v.component.layer === "reinforcement"), `${name}: one kind of work alone: ${steel.length} parts of steel at the frame, and nothing else`);
    const steelParts = model.components.filter((c) => c.layer === "reinforcement").length;
    equal(visibleComponents(model, isolateLayer(setStage(base, 18), "reinforcement"), index).length, steelParts, `${name}: and at the end every one of the ${steelParts} parts of steel shows, though the concrete has long covered it`);
    const ghosts = at(5, { ghostFuture: true }).filter((v) => v.visibility === "ghost" && v.component.stage > 5).length;
    ok(ghosts > 500, `${name}: what comes next can be shown faint: ${ghosts} parts`);
    const justThis = at(7, { onlyThisStage: true });
    const solid7 = justThis.filter((v) => v.visibility === "solid");
    ok(solid7.length > 0 && solid7.every((v) => v.component.stage === 7) && justThis.some((v) => v.visibility === "ghost"), `${name}: one stage alone shows only that stage's work solid (${solid7.length} parts), and the rest faint round it`);
    const courses = model.components.filter((c) => c.category === "masonry" && c.kind === "wall-blocks");
    const total = courses.reduce((n, c) => n + c.shapes.length, 0);
    const blocksAt = (progress: number) => courses.reduce((n, c) => n + c.shapes.filter((_, i) => shapeVisible(c, i, { ...setStage(base, 7), wallProgress: progress }, index)).length, 0);
    const rising = [0, 0.25, 0.5, 0.75, 1].map(blocksAt);
    ok(rising[0] === 0 && rising[4] === total && rising.every((n, i) => i === 0 || n >= rising[i - 1]!) && rising[0]! < rising[2]! && rising[2]! < rising[4]!, `${name}: a wall goes up course by course: ${rising.join(", ")} of ${total} blocks at a quarter, half, three quarters and the full height`);
    const planes = { level: ["z", "below"], "section-x": ["x", "above"], "section-y": ["y", "above"] } as const;
    for (const mode of ["level", "section-x", "section-y"] as const) {
      const cut = (position: number) => cutPlane(model, { ...base, cutaway: { mode, position } })!;
      const [axis, keep] = planes[mode];
      const plane = cut(0.5);
      ok(plane !== null && plane.axis === axis && plane.keep === keep && plane.value > model.bounds.min[axis] && plane.value < model.bounds.max[axis], `${name}: the ${mode} cut-away is a plane through the model, across ${axis}, keeping what is ${keep} it`);
      ok(cut(0.25).value < plane.value && plane.value < cut(0.75).value, `${name}: and the slider moves it`);
      near(cut(0).value, model.bounds.min[axis], `${name}: from one side of the building`, 1e-6);
      near(cut(1).value, model.bounds.max[axis], `${name}: to the other`, 1e-6);
      near(cut(7).value, cut(1).value, `${name}: and no further`, 1e-6);
      near(cut(-7).value, cut(0).value, `${name}: either way`, 1e-6);
    }
    equal(cutPlane(model, base), null, `${name}: and none when it is off`);
    const sample = model.components.filter((_, i) => i % 7 === 0);
    ok(sample.every((c) => { const a = explodeInfo(c, base, model); return a.base.x === 0 && a.base.y === 0 && a.base.z === 0 && a.layerDistance === 0; }), `${name}: assembled, nothing is displaced`);
    const exploded = { ...base, explode: { amount: 1, floors: true, categories: true, layers: true } };
    ok(sample.some((c) => { const a = explodeInfo(c, exploded, model); return a.base.z !== 0 || a.base.x !== 0; }), `${name}: exploded, parts move apart`);
    const only = (kind: "floors" | "categories" | "layers") => sample.map((c) => explodeInfo(c, { ...base, explode: { amount: 1, floors: kind === "floors", categories: kind === "categories", layers: kind === "layers" } }, model));
    ok(only("floors").every((a) => a.base.x === 0 && a.base.y === 0 && a.layerDistance === 0) && only("floors").some((a) => a.base.z !== 0), `${name}: the floors part straight up and down`);
    ok(only("categories").every((a) => a.base.z === 0 && a.layerDistance === 0) && only("categories").some((a) => a.base.x !== 0 || a.base.y !== 0), `${name}: the kinds of work part sideways`);
    const firstOfKind = new Map<string, ComponentRecord>();
    for (const c of model.components) if (!c.service && !firstOfKind.has(c.category)) firstOfKind.set(c.category, c);
    const sideways = [...firstOfKind.values()].map((c) => explodeInfo(c, { ...base, explode: { amount: 1, floors: false, categories: true, layers: false } }, model).base).map((b) => `${b.x.toFixed(3)},${b.y.toFixed(3)}`);
    ok(sideways.length > 8 && new Set(sideways).size === sideways.length, `${name}: and each of the ${sideways.length} kinds goes its own way`);
    ok(only("layers").every((a) => a.base.x === 0 && a.base.y === 0 && a.base.z === 0) && only("layers").some((a) => a.layerDistance !== 0), `${name}: and the layers of a part slide apart without the part moving`);
    equal(sample.map((c) => explodeInfo(c, { ...exploded, explode: { ...exploded.explode, amount: 3 } }, model)), sample.map((c) => explodeInfo(c, exploded, model)), `${name}: the explosion goes no further than all the way`);
    equal(sample.map((c) => explodeInfo(c, { ...exploded, explode: { ...exploded.explode, amount: -3 } }, model).base), sample.map(() => ({ x: 0, y: 0, z: 0 })), `${name}: and not below nothing`);
    const upper = model.components.find((c) => c.storeyIndex === model.storeys.length - 1 && !c.loose)!;
    const lower = model.components.find((c) => c.storeyIndex === 0 && !c.loose && c.category === upper.category)!;
    ok(explodeInfo(upper, { ...exploded, explode: { ...exploded.explode, categories: false } }, model).base.z > explodeInfo(lower, { ...exploded, explode: { ...exploded.explode, categories: false } }, model).base.z, `${name}: and the floors lift apart, the top one highest`);
    equal(sample.map((c) => explodeInfo(c, { ...exploded, explode: { ...exploded.explode, amount: 0 } }, model).base), sample.map(() => ({ x: 0, y: 0, z: 0 })), `${name}: put together again, every part is where it was`);

    // ---- Every kind of part can be looked into ------------------------------------------------------------------------------------------------------------------
    const kinds = [...new Set(model.components.map((c) => c.kind))];
    for (const kind of kinds) ok(knowledgeFor(kind), `${name}: there is a lesson for a ${kind}`);
    for (const kind of kinds) {
      const c = model.components.find((x) => x.kind === kind)!;
      const info = describeComponent(model, c.id);
      assert.ok(info && info.name === c.name && info.knowledge.title && info.title === info.knowledge.title && info.stage.id === c.stage && info.category && info.material && info.layer && info.quantities === c.quantities, `${name}: ${c.id} can be inspected`);
      checks += 1;
    }

    // ---- The bill and the cost grow with the building --------------------------------------------------------------------------------------------------------------
    const bill: Bill = buildBill(model, options, "building");
    const audit = auditBill(model, options, "building");
    equal(audit.omissions, [], `${name}: nothing that is built is left out of the bill`);
    equal(audit.duplicates, [], `${name}: nothing is counted twice`);
    equal(audit.concrete.over, [], `${name}: no more concrete is counted than is drawn (${audit.concrete.counted.toFixed(2)} of ${audit.concrete.drawn.toFixed(2)} m³)`);
    equal(audit.reinforcement.unreinforced, [], `${name}: every member that needs steel has it`);
    ok(audit.ok, `${name}: and the audit of the bill passes`);
    const book = defaultPriceBook();
    const areas = areasOf(building.project, options.roofType);
    const estimate = estimateCost(bill, book, DEFAULT_COST_RULES, { grossFloor: areas.grossFloorArea, totalSlab: areas.totalSlabArea });
    let lines = 0;
    let volume = 0;
    let firstLines = 0;
    let volumeAt3 = 0;
    let cumulative = 0;
    for (const stage of STAGE_IDS) {
      const upTo = buildBill(model, options, "building", (c) => c.stage <= stage);
      const m3 = upTo.lines.filter((l) => l.unit === "m³").reduce((s, l) => s + (l.net ?? 0), 0);
      ok(upTo.lines.length >= lines && m3 >= volume - 1e-9, `${name}: the bill up to stage ${stage} has ${upTo.lines.length} lines and ${m3.toFixed(1)} m³, no fewer than before`);
      lines = upTo.lines.length;
      volume = m3;
      if (stage === 1) firstLines = lines;
      if (stage === 3) volumeAt3 = m3;
      // The cost of the bill up to a stage is what the cost by stage adds up to: two ways of reading the same figure.
      cumulative += estimate.groups.stage.find((g) => g.key === String(stage))?.total ?? 0;
      const costUpTo = estimateCost(upTo, book, DEFAULT_COST_RULES, { grossFloor: areas.grossFloorArea, totalSlab: areas.totalSlabArea }).direct;
      near(costUpTo, cumulative, `${name}: the direct cost up to stage ${stage} is ${Math.round(costUpTo).toLocaleString("en")}, the cost by stage added up to it`, 1e-6 * estimate.direct);
    }
    ok(firstLines < lines && volumeAt3 < volume && volumeAt3 > 0, `${name}: the bill grows from ${firstLines} lines at stage 1 to ${lines}, and from ${volumeAt3.toFixed(1)} m³ at the foundations to ${volume.toFixed(1)} m³`);
    equal(lines, bill.lines.length, `${name}: and by stage 18 it is the whole bill`);
    let running = 0;
    for (const g of estimate.groups.stage) { const before2 = running; running += g.total; ok(running >= before2, `${name}: the cost up to stage ${g.key} is ${Math.round(running).toLocaleString("en")}, no less than before`); }
    near(running, estimate.direct, `${name}: and by the last stage it is the direct cost`, 1e-6 * estimate.direct);
    ok(estimate.groups.stage.length >= 15, `${name}: the cost falls in ${estimate.groups.stage.length} of the eighteen stages`);
    near(estimate.area.grossFloor, building.areas.grossFloorArea, `${name}: the cost per square metre is over the floor area of the building`, 1e-9);
    ok(estimate.area.perM2! > 15000 && estimate.area.perM2! < 70000, `${name}: ${Math.round(estimate.area.perM2!).toLocaleString("en")} ETB per m²`);
    equal(estimate.summary.problems, [], `${name}: nothing is left unpriced`);

    // ---- And the documents ------------------------------------------------------------------------------------------------------------------------------------------
    const report = buildReport({ model, building: config, areas, options, rules: DEFAULT_RULES, bill, estimate, book, costRules: DEFAULT_COST_RULES, generatedAt: "2026-01-01T00:00:00Z" });
    const xlsx = reportWorkbook(report, book);
    const pdf = reportPdf(report);
    const total2 = `ETB ${Math.round(estimate.total).toLocaleString("en")}`;
    ok(xlsx[0] === 0x50 && xlsx[1] === 0x4b && textOf(xlsx).includes(total2), `${name}: the workbook is a zip with the total, ${total2}, in it`);
    const table = (id: string) => report.tables.find((t) => t.id === id)!;
    equal(table("cost-summary").rows.at(-1), ["TOTAL", Math.round(estimate.total * 100) / 100], `${name}: the cost summary ends on the total`);
    for (const by of ["By section", "By floor", "By stage", "By category"]) {
      const rows = table("cost-groups").rows.filter((r) => r[0] === by);
      const added = rows.reduce((sum, r) => sum + (r[4] as number), 0);
      ok(rows.length > 0 && Math.abs(added - estimate.direct) <= 0.01 * rows.length + 1e-6, `${name}: the ${rows.length} groups ${by.toLowerCase()} add up to the direct cost, ${Math.round(estimate.direct).toLocaleString("en")} (${Math.round(added).toLocaleString("en")})`);
    }
    const inPdf = (title: string) => textOf(pdf).includes(title.split(/[^\x20-\x7e]/)[0]!.replace(/[()\\]/g, "\\$&"));
    for (const t of report.tables) {
      ok(textOf(xlsx).includes(`<sheet name="${t.sheet}" `), `${name}: the workbook has its sheet, "${t.sheet}", for "${t.title}"`);
      ok(inPdf(t.title), `${name}: and the PDF has "${t.title}"`);
    }
    ok(textOf(pdf).startsWith("%PDF-1.4") && textOf(pdf).trimEnd().endsWith("%%EOF") && textOf(pdf).includes(total2) && (textOf(pdf).match(/\/Type \/Page /g) ?? []).length >= 12, `${name}: and the PDF is a document of ${(textOf(pdf).match(/\/Type \/Page /g) ?? []).length} pages with the same total`);
  }
}

console.log(`Construction acceptance: ${checks} checks passed.`);
