/**
 * The bill of quantities of the construction model: every line read off the components of the model, by floor, stage and category, with nothing left out
 * and nothing counted twice.
 *
 *   npx tsx scripts/construction_boq_check.ts
 *
 * Two kinds of check. The first works on a small model written out here, component by component, so that every expected figure is arithmetic done by hand:
 * the floor, the stage and the category each part belongs to, the steel that follows from the concrete, what the audit reports for each kind of fault. The
 * second works on the four buildings at three sizes, and compares the bill with things worked out apart from it: the exact volume of the union of the concrete
 * that is drawn (a grid of every distinct coordinate), the door and window counts of the project, the clear lengths of blinding between the footings.
 */
import assert from "node:assert/strict";

import { BUILDING_TEMPLATES, buildBuilding, configForArea, defaultConfig, type BuiltBuilding } from "../src/features/house-designer/construction/building-config";
import { buildBill, groupBill, type BillGrouping } from "../src/features/house-designer/construction/boq";
import { auditBill, shapeVolume } from "../src/features/house-designer/construction/boq-audit";
import type { Ctx } from "../src/features/house-designer/construction/context";
import type { Shape } from "../src/features/house-designer/construction/geometry";
import { steelWeightKg, type ApprovedBar } from "../src/features/house-designer/construction/helpers";
import { outsideRects } from "../src/features/house-designer/construction/generators/foundation";
import { normalizeParams } from "../src/features/house-designer/construction/learning-house";
import { buildConstructionModel } from "../src/features/house-designer/construction/model";
import { aggregateQuantities, countedComponents, floorOf, ROOF_FLOOR, SITE_FLOOR } from "../src/features/house-designer/construction/quantities";
import { applyReinforcementRule } from "../src/features/house-designer/construction/reinforcement-rule";
import { STAGE_BY_ID } from "../src/features/house-designer/construction/stages";
import { CATEGORY_IDS, CATEGORY_LABELS, DEFAULT_OPTIONS, DEFAULT_RULES, STAGE_IDS, type ComponentRecord, type ConstructionModel, type EstimatingRules, type QuantityItem } from "../src/features/house-designer/construction/types";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };
const near = (actual: number, expected: number, message: string, tolerance = 1e-6) => { assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} is not ${expected} (±${tolerance})`); checks += 1; };

// ---------------------------------------------------------------------------
// A small model, written out by hand
// ---------------------------------------------------------------------------

const STOREYS = [
  { id: "g", name: "Ground", index: 0, elevation: 0, floorToFloor: 3000, slabThickness: 200 },
  { id: "f1", name: "First", index: 1, elevation: 3000, floorToFloor: 3000, slabThickness: 200 },
];

/** A box of exactly `m3` cubic metres: 1 m × 1 m × (m3) m. */
const cubic = (m3: number): Shape => ({ t: "box", c: { x: 0, y: 0, z: 0 }, s: { x: 1000, y: 1000, z: m3 * 1000 } });
/** `n` bars of a diameter and a length, as cylinders. */
const bars = (n: number, diameter: number, length: number): Shape[] => Array.from({ length: n }, (_, i) => ({ t: "cyl", c: { x: i * 50, y: 0, z: 0 }, r: diameter / 2, len: length, axis: "x" }));

/** `n` rectangular hoops of an 8 mm bar, each of four boxes: two 300 mm long and two 400 mm long, 1400 mm of bar a hoop. */
const hoops = (n: number, d: number, a: number, b: number): Shape[] => Array.from({ length: n }, (_, i) => [
  { t: "box", c: { x: i * 100, y: 0, z: 0 }, s: { x: a, y: d, z: d } }, { t: "box", c: { x: i * 100, y: b, z: 0 }, s: { x: a, y: d, z: d } },
  { t: "box", c: { x: i * 100 - a / 2, y: b / 2, z: 0 }, s: { x: d, y: b, z: d } }, { t: "box", c: { x: i * 100 + a / 2, y: b / 2, z: 0 }, s: { x: d, y: b, z: d } },
] as Shape[]).flat();

const unitOf = (workItem: string): QuantityItem["unit"] => (workItem.startsWith("steel") ? "kg" : workItem.startsWith("concrete") || workItem.startsWith("earth") ? "m³" : workItem.startsWith("prelim.fence") ? "m" : "m²");
const sectionOf = (workItem: string): QuantityItem["section"] => (workItem.startsWith("concrete") ? "C" : workItem.startsWith("steel") ? "D" : workItem.startsWith("formwork") ? "E" : workItem.startsWith("masonry") ? "F" : workItem.startsWith("paint") ? "M" : "A");
const item = (componentId: string, workItem: string, value: number | null, allowance: number | null = null, status: QuantityItem["status"] = "calculated"): QuantityItem => ({
  id: `${componentId}#${workItem}`, componentId, workItem, description: workItem, section: sectionOf(workItem), unit: unitOf(workItem), value, formula: `${workItem} of ${componentId}`, inputs: {}, status: value === null ? "missing" : status,
  sourceGeometry: "project", allowance: allowance === null ? null : { rule: "example", percent: allowance }, cost: { unitMaterial: null, unitLabour: null, unitEquipment: null, currency: null, priceSource: null, priceDate: null }, storeyId: null, room: null, materialSpec: "spec", assumptions: [], exclusions: [],
});
const part = (id: string, o: Partial<ComponentRecord>, ...quantities: QuantityItem[]): ComponentRecord => ({
  id, name: id, kind: "beam", category: "frame", subcategory: "", stage: 5, storeyId: "g", storeyName: "Ground", storeyIndex: 0, room: null, grid: null, layer: "concrete", materialId: "concrete", shapes: [],
  dims: {}, geometrySource: "project", sourceRef: null, parentId: null, connectedIds: [], sequence: 0, explode: { layerIndex: 0, dir: { x: 0, y: 0, z: 1 } }, quantities, ...o,
});
const stub = (components: ComponentRecord[]): ConstructionModel => ({
  projectId: "stub", title: "Stub", disclaimer: "", options: DEFAULT_OPTIONS, rules: DEFAULT_RULES, storeys: STOREYS, components,
  bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, warnings: [],
});
const withSteel = (id: string, workItem: string): QuantityItem => item(id, workItem, null);

/** Every kind of place in the building, once: foundations, a column, the floor structure of the ground storey, a roof slab, the walls of the first floor, the roof's parapet, the site. */
function smallBuilding(): ComponentRecord[] {
  return [
    part("found:footing:a", { kind: "pad-footing", category: "substructure", stage: 3, storeyId: null, storeyName: null, storeyIndex: -1, shapes: [cubic(1)] }, item("found:footing:a", "concrete.footing", 1)),
    part("found:rebar:a", { kind: "footing-rebar", category: "substructure", stage: 3, storeyId: null, storeyName: null, storeyIndex: -1, layer: "reinforcement", materialId: "steel-bar", parentId: "found:footing:a", shapes: bars(4, 12, 1500) }, withSteel("found:rebar:a", "steel.footing-rebar")),
    part("frame:g-column-1", { kind: "column", shapes: [cubic(0.5)] }, item("frame:g-column-1", "concrete.column", 0.5)),
    part("frame:g-column-1:bars", { kind: "column-bars", layer: "reinforcement", materialId: "steel-bar", parentId: "frame:g-column-1", shapes: bars(4, 16, 3000) }, withSteel("frame:g-column-1:bars", "steel.column-bars")),
    part("frame:g-column-1:stirrups", { kind: "column-stirrups", layer: "reinforcement", materialId: "steel-bar", parentId: "frame:g-column-1", shapes: hoops(10, 8, 300, 400) }, withSteel("frame:g-column-1:stirrups", "steel.column-stirrups")),
    part("frame:g-beam-1", { kind: "beam", shapes: [cubic(0.8)] }, item("frame:g-beam-1", "concrete.beam", 0.8)),
    part("frame:g-beam-1:bars", { kind: "beam-bars", layer: "reinforcement", materialId: "steel-bar", parentId: "frame:g-beam-1", shapes: bars(4, 16, 5000) }, withSteel("frame:g-beam-1:bars", "steel.beam-bars")),
    part("frame:g-beam-1:form", { kind: "beam-formwork", layer: "formwork", materialId: "formwork", parentId: "frame:g-beam-1", stage: 4, shapes: [cubic(0.01)] }, item("frame:g-beam-1:form", "formwork.beam", 6)),
    part("frame:slab:f1:z", { kind: "slab", shapes: [cubic(3)] }, item("frame:slab:f1:z", "concrete.slab", 3)),
    part("frame:slab:f1:z:top", { kind: "slab-bars-top", layer: "reinforcement", materialId: "steel-bar", parentId: "frame:slab:f1:z", shapes: bars(6, 10, 4000) }, withSteel("frame:slab:f1:z:top", "steel.slab-bars-top")),
    part("frame:slab:f1:z:props", { kind: "prop", layer: "props", materialId: "props", parentId: "frame:slab:f1:z:form", stage: 4, shapes: [cubic(0.01)] }),
    part("frame:slab:f1:z:form", { kind: "slab-formwork", layer: "formwork", materialId: "formwork", parentId: "frame:slab:f1:z", stage: 4, shapes: [cubic(0.01)] }, item("frame:slab:f1:z:form", "formwork.slab", 20)),
    part("frame:balcony:b1", { kind: "balcony", parentId: "frame:slab:f1:z", shapes: [cubic(0.6)] }, item("frame:balcony:b1", "concrete.balcony", 0.6)),
    part("frame:balcony:b1:bars", { kind: "balcony-bars", layer: "reinforcement", materialId: "steel-bar", parentId: "frame:balcony:b1", shapes: bars(5, 12, 2000) }, withSteel("frame:balcony:b1:bars", "steel.balcony-bars")),
    part("frame:slab:roof:z", { kind: "slab", storeyId: "f1", storeyName: "First", storeyIndex: 1, shapes: [cubic(4)] }, item("frame:slab:roof:z", "concrete.slab", 4)),
    part("frame:slab:roof:z:top", { kind: "slab-bars-top", storeyId: "f1", storeyName: "First", storeyIndex: 1, layer: "reinforcement", materialId: "steel-bar", parentId: "frame:slab:roof:z", shapes: bars(6, 10, 4000) }, withSteel("frame:slab:roof:z:top", "steel.slab-bars-top")),
    part("masonry:f1-wall-1", { kind: "wall-blocks", category: "masonry", stage: 6, storeyId: "f1", storeyName: "First", storeyIndex: 1, layer: "masonry", materialId: "block-hollow", shapes: [cubic(2)] }, item("masonry:f1-wall-1", "masonry.wall-area", 20)),
    part("ext:parapet:flat", { kind: "parapet", category: "masonry", stage: 6, storeyId: "f1", storeyName: "First", storeyIndex: 1, layer: "masonry", materialId: "block-hollow", shapes: [cubic(0.5)] }, item("ext:parapet:flat", "masonry.parapet", 8)),
    part("paint:1", { kind: "paint-layer", category: "finishes", stage: 17, storeyId: "f1", storeyName: "First", storeyIndex: 1, layer: "paint", materialId: "paint", shapes: [cubic(0.001)] }, item("paint:1", "paint.walls", 40, 5)),
    part("paint:0", { kind: "paint-layer", category: "finishes", stage: 17, layer: "paint", materialId: "paint", shapes: [cubic(0.001)] }, item("paint:0", "paint.walls", 10, 5, "assumed")),
    part("site:fence", { kind: "fence", category: "site", stage: 1, storeyId: null, storeyName: null, storeyIndex: -1, layer: "marker", materialId: "fence", shapes: [cubic(0.001)] }, item("site:fence", "prelim.fence", 30)),
    part("ext:steps", { kind: "entrance-steps", category: "external", stage: 18, layer: "concrete", shapes: [cubic(0.9)] }, item("ext:steps", "concrete.steps", 0.9)),
    part("frame:g-prop-1", { kind: "prop", layer: "props", materialId: "props", stage: 4, shapes: [cubic(0.01)] }),
  ];
}

// The floor, stage and category of every part of every line, written out by hand.
const EXPECTED_PARTS: { id: string; workItem: string; floor: string; stage: number; category: string; net: number }[] = [
  { id: "found:footing:a", workItem: "concrete.footing", floor: SITE_FLOOR, stage: 3, category: "substructure", net: 1 },
  { id: "frame:g-column-1", workItem: "concrete.column", floor: "g", stage: 5, category: "frame", net: 0.5 },
  { id: "frame:g-beam-1", workItem: "concrete.beam", floor: "f1", stage: 5, category: "frame", net: 0.8 },
  { id: "frame:slab:f1:z", workItem: "concrete.slab", floor: "f1", stage: 5, category: "frame", net: 3 },
  { id: "frame:slab:roof:z", workItem: "concrete.slab", floor: ROOF_FLOOR, stage: 5, category: "frame", net: 4 },
  { id: "frame:balcony:b1", workItem: "concrete.balcony", floor: "f1", stage: 5, category: "frame", net: 0.6 },
  { id: "ext:steps", workItem: "concrete.steps", floor: "g", stage: 18, category: "external", net: 0.9 },
  { id: "frame:g-beam-1:form", workItem: "formwork.beam", floor: "f1", stage: 4, category: "frame", net: 6 },
  { id: "frame:slab:f1:z:form", workItem: "formwork.slab", floor: "f1", stage: 4, category: "frame", net: 20 },
  { id: "masonry:f1-wall-1", workItem: "masonry.wall-area", floor: "f1", stage: 6, category: "masonry", net: 20 },
  { id: "ext:parapet:flat", workItem: "masonry.parapet", floor: ROOF_FLOOR, stage: 6, category: "masonry", net: 8 },
  { id: "paint:1", workItem: "paint.walls", floor: "f1", stage: 17, category: "finishes", net: 40 },
  { id: "paint:0", workItem: "paint.walls", floor: "g", stage: 17, category: "finishes", net: 10 },
  { id: "site:fence", workItem: "prelim.fence", floor: SITE_FLOOR, stage: 1, category: "site", net: 30 },
];
// The steel the default rule puts on each member: volume × kg per m³ (footing 80, column 200, beam 150, slab 100, balcony 130).
const EXPECTED_STEEL: { id: string; workItem: string; floor: string; stage: number; category: string; net: number }[] = [
  { id: "found:rebar:a", workItem: "steel.footing-rebar", floor: SITE_FLOOR, stage: 3, category: "substructure", net: 80 },
  { id: "frame:g-beam-1:bars", workItem: "steel.beam-bars", floor: "f1", stage: 5, category: "frame", net: 120 },
  { id: "frame:slab:f1:z:top", workItem: "steel.slab-bars-top", floor: "f1", stage: 5, category: "frame", net: 300 },
  { id: "frame:balcony:b1:bars", workItem: "steel.balcony-bars", floor: "f1", stage: 5, category: "frame", net: 78 },
  { id: "frame:slab:roof:z:top", workItem: "steel.slab-bars-top", floor: ROOF_FLOOR, stage: 5, category: "frame", net: 400 },
];

{
  const components = smallBuilding();
  const model = stub(components);
  applyReinforcementRule({ rules: DEFAULT_RULES, components } as unknown as Ctx);
  const get = (id: string) => components.find((c) => c.id === id)!;
  const steel = (id: string) => get(id).quantities.find((q) => q.workItem.startsWith("steel."))!;

  // The steel of a member: its concrete times its ratio, shared out among its bars in the proportion of the bars' weights (by diameter and length, worked out here).
  const weight = (n: number, d: number, length: number) => n * (Math.PI / 4) * (d / 1000) ** 2 * (length / 1000) * 7850;
  near(steel("found:rebar:a").value!, 1 * 80, "the footing: 1.000 m³ × 80 kg/m³", 0.005);
  near(steel("frame:g-beam-1:bars").value!, 0.8 * 150, "the beam: 0.800 m³ × 150 kg/m³", 0.005);
  near(steel("frame:slab:f1:z:top").value!, 3 * 100, "the slab: 3.000 m³ × 100 kg/m³", 0.005);
  near(steel("frame:slab:roof:z:top").value!, 4 * 100, "the roof slab: 4.000 m³ × 100 kg/m³", 0.005);
  near(steel("frame:balcony:b1:bars").value!, 0.6 * 130, "the balcony: 0.600 m³ × 130 kg/m³", 0.005);
  const w1 = weight(4, 16, 3000);
  const w2 = weight(10, 8, 1400);
  near(steel("frame:g-column-1:bars").value!, 0.5 * 200 * (w1 / (w1 + w2)), "the column's four round bars take their share of 0.500 m³ × 200 kg/m³, by the weight of 4 × 3 m of 16 mm against 10 hoops of 1.4 m of 8 mm", 0.005);
  near(steel("frame:g-column-1:stirrups").value!, 0.5 * 200 * (w2 / (w1 + w2)), "and its stirrups the rest", 0.005);
  near(steel("frame:g-column-1:bars").value! + steel("frame:g-column-1:stirrups").value!, 100, "the two together are the member's steel, no more and no less", 0.01);
  equal(steel("frame:g-column-1:bars").status, "assumed", "a figure from the rule is an assumption");
  ok(steel("frame:g-column-1:bars").assumptions.some((a) => /not a bar schedule/.test(a)), "and says it is not a bar schedule");
  equal(steel("frame:g-column-1:bars").allowance?.percent, DEFAULT_RULES.allowances.steel, "with the steel allowance beside it");
  ok(/0\.500 m³ of column concrete × 200 kg\/m³/.test(steel("frame:g-column-1:bars").formula), "and shows its working");

  // The rule leaves a figure the bar schedule has given.
  {
    const parts = smallBuilding();
    steelItemOf(parts, "frame:g-column-1:bars").value = 33.5;
    steelItemOf(parts, "frame:g-column-1:bars").status = "review";
    applyReinforcementRule({ rules: DEFAULT_RULES, components: parts } as unknown as Ctx);
    near(steelItemOf(parts, "frame:g-column-1:bars").value!, 33.5, "a weight from an approved schedule is kept as it is", 0);
    near(steelItemOf(parts, "frame:g-column-1:stirrups").value!, 0.5 * 200 * (w2 / (w1 + w2)), "and the other bars of the member still take their own share", 0.005);
  }
  // A strict model keeps steel without a figure until a schedule is approved.
  {
    const parts = smallBuilding();
    applyReinforcementRule({ rules: { ...DEFAULT_RULES, reinforcement: { ...DEFAULT_RULES.reinforcement, basis: "schedule" } }, components: parts } as unknown as Ctx);
    ok(parts.flatMap((c) => c.quantities).filter((q) => q.workItem.startsWith("steel.")).every((q) => q.value === null && q.status === "missing"), "with the bar schedule as the only source, no steel has a figure");
  }
  // Bars with nothing drawn share a member equally.
  {
    const parts = smallBuilding();
    for (const id of ["frame:g-column-1:bars", "frame:g-column-1:stirrups"]) parts.find((c) => c.id === id)!.shapes = [];
    applyReinforcementRule({ rules: DEFAULT_RULES, components: parts } as unknown as Ctx);
    near(steelItemOf(parts, "frame:g-column-1:bars").value!, 50, "two groups of bars with nothing drawn take half of 100 kg each", 0.005);
    near(steelItemOf(parts, "frame:g-column-1:stirrups").value!, 50, "the other half", 0.005);
  }
  // A member whose work item has no ratio is left without a figure, and says what to set.
  {
    const parts = smallBuilding();
    const rules: EstimatingRules = { ...DEFAULT_RULES, reinforcement: { basis: "ratio", ratios: { ...DEFAULT_RULES.reinforcement.ratios, "concrete.column": undefined as unknown as number } } };
    delete (rules.reinforcement.ratios as Record<string, number | undefined>)["concrete.column"];
    applyReinforcementRule({ rules, components: parts } as unknown as Ctx);
    equal(steelItemOf(parts, "frame:g-column-1:bars").value, null, "a member with no ratio set is not given steel");
    ok(/No steel ratio is set for concrete\.column/.test(steelItemOf(parts, "frame:g-column-1:bars").formula), "and the line says which ratio to set");
    near(steelItemOf(parts, "frame:g-beam-1:bars").value!, 120, "while the others are not touched", 0.005);
  }
  // A member poured in two parts (a balcony across the pour joint) has the steel of the two together.
  {
    const parts = smallBuilding();
    const first = parts.find((c) => c.id === "frame:balcony:b1")!;
    first.sourceRef = "b1";
    first.quantities[0]!.value = 0.35;
    first.shapes = [cubic(0.35)];
    parts.push(part("frame:balcony:b1:b", { kind: "balcony", sourceRef: "b1", parentId: "frame:slab:f1:z", shapes: [cubic(0.25)] }, item("frame:balcony:b1:b", "concrete.balcony", 0.25)));
    applyReinforcementRule({ rules: DEFAULT_RULES, components: parts } as unknown as Ctx);
    near(steelItemOf(parts, "frame:balcony:b1:bars").value!, 0.6 * 130, "a balcony poured in two parts has steel for the two together: 0.350 + 0.250 m³ × 130 kg/m³", 0.005);
  }

  // ---- The floors, stages and categories of the parts --------------------------------------------------------------------------------------------------
  const bill = buildBill(model, DEFAULT_OPTIONS, "building");
  const flat = bill.lines.flatMap((l) => l.parts.map((p) => ({ id: p.componentId, workItem: l.workItem, floor: p.floor, stage: p.stage, category: p.category, net: p.net })));
  for (const want of [...EXPECTED_PARTS, ...EXPECTED_STEEL]) {
    const found = flat.find((p) => p.id === want.id && p.workItem === want.workItem);
    ok(found, `${want.id}: ${want.workItem} is in the bill`);
    if (!found) continue;
    equal(found.floor, want.floor, `${want.id} is billed with ${want.floor}`);
    equal(found.stage, want.stage, `${want.id} is from stage ${want.stage}`);
    equal(found.category, want.category, `${want.id} is in category ${want.category}`);
    near(found.net!, want.net, `${want.id}: ${want.workItem}`, 0.005);
  }
  equal(flat.length, EXPECTED_PARTS.length + EXPECTED_STEEL.length + 2, "and nothing else is in the bill but the column's two steel groups");
  equal(bill.lines.filter((l) => l.workItem === "paint.walls").length, 1, "two components with one work item are one line");
  near(bill.lines.find((l) => l.workItem === "paint.walls")!.net!, 50, "of 40 + 10 m²");
  near(bill.lines.find((l) => l.workItem === "paint.walls")!.allowanceQuantity!, 2.5, "with a 5 % allowance of 2.5 m² kept apart");
  equal(bill.lines.find((l) => l.workItem === "concrete.slab")!.parts.map((p) => p.floor).sort(), [ROOF_FLOOR, "f1"].sort(), "the slabs of two floors are two parts of one line");
  equal(floorOf(get("frame:slab:f1:z:props"), model), "f1", "a prop goes with the slab it carries");
  equal(floorOf(get("frame:g-beam-1:form"), model), "f1", "formwork with the beam it shapes, and the beam with the floor it holds up");
  equal(floorOf(get("frame:g-column-1"), model), "g", "a column with the storey it stands in");
  equal(floorOf(get("frame:g-column-1:bars"), model), "g", "and its bars with it");
  const lone = (id: string, category: ComponentRecord["category"]) => part(id, { category, storeyId: "f1", storeyName: "First", storeyIndex: 1, kind: "wall-blocks", layer: "masonry" });
  equal(floorOf(lone("ext:gable:east", "masonry"), model), ROOF_FLOOR, "a gable wall is part of the roof");
  equal(floorOf(lone("ext:parapet:north", "masonry"), model), ROOF_FLOOR, "so is a parapet");
  equal(floorOf(lone("roof:flat:cover", "finishes"), model), ROOF_FLOOR, "so is a part with a roof's name");
  equal(floorOf(lone("misc:tank-stand", "roof"), model), ROOF_FLOOR, "and any part in the roof category");
  equal(floorOf(lone("misc:wall", "masonry"), model), "f1", "while a wall of the first floor is not");
  equal(floorOf(lone("earth:pit", "earthworks"), model), SITE_FLOOR, "the earthworks are with the foundations");
  equal(floorOf(lone("site:office", "site"), model), SITE_FLOOR, "and so is the site");
  equal(floorOf(lone("found:thing", "substructure"), model), SITE_FLOOR, "and the substructure");
  equal(floorOf(part("ext:path", { category: "external", storeyId: null, storeyName: null, storeyIndex: -1, layer: "external" }), model), SITE_FLOOR, "an external work with no storey is with the site");
  equal(floorOf(part("misc:nostorey", { category: "finishes", storeyId: null, storeyName: null, storeyIndex: -1 }), model), "g", "anything else with no storey is with the ground floor");

  // Every grouping is a sum of the same parts.
  const unitTotals = (rows: { line: { unit: string }; net: number | null }[]) => { const t = new Map<string, number>(); for (const r of rows) t.set(r.line.unit, (t.get(r.line.unit) ?? 0) + (r.net ?? 0)); return t; };
  const wholeTotals = unitTotals(bill.lines.map((l) => ({ line: l, net: l.net })));
  for (const by of ["section", "floor", "stage", "category"] as BillGrouping[]) {
    const groups = groupBill(bill, by);
    const totals = unitTotals(groups.flatMap((g) => g.rows));
    for (const [unit, total] of wholeTotals) near(totals.get(unit) ?? 0, total, `grouped by ${by}, the total in ${unit} is the total of the bill`, 1e-6);
    ok(groups.every((g) => g.rows.length > 0), `grouped by ${by}, no group is empty`);
  }
  equal(groupBill(bill, "floor").map((g) => g.key), [SITE_FLOOR, "g", "f1", ROOF_FLOOR], "the floors come from the foundations up");
  equal(groupBill(bill, "stage").map((g) => g.key), ["1", "3", "4", "5", "6", "17", "18"], "the stages in order");
  near(groupBill(bill, "floor").find((g) => g.key === "f1")!.rows.find((r) => r.line.workItem === "concrete.slab")!.net!, 3, "the slab in the First Floor group is that floor's 3.000 m³, not both slabs");
  near(groupBill(bill, "floor").find((g) => g.key === ROOF_FLOOR)!.rows.find((r) => r.line.workItem === "concrete.slab")!.net!, 4, "and the roof's is 4.000 m³");
  const paintRow = (floor: string) => groupBill(bill, "floor").find((g) => g.key === floor)!.rows.find((r) => r.line.workItem === "paint.walls")!;
  near(paintRow("f1").net!, 40, "the paint of the First Floor is 40 m²", 1e-9);
  near(paintRow("f1").allowance!, 2, "with its own allowance, 5 % of 40 m²", 1e-9);
  near(paintRow("g").net!, 10, "and the Ground Floor's is 10 m²", 1e-9);
  near(paintRow("g").allowance!, 0.5, "with 5 % of 10 m²", 1e-9);
  equal(paintRow("g").componentIds, ["paint:0"], "each group knows which components it is made of");
  equal(paintRow("g").status, "assumed", "the Ground Floor's paint is an assumption");
  equal(paintRow("f1").status, "calculated", "the First Floor's, in the same line, is calculated");
  equal(bill.lines.find((l) => l.workItem === "paint.walls")!.status, "assumed", "and the line, taken whole, is as sure as its least sure part");
  equal(groupBill(bill, "floor").find((g) => g.key === SITE_FLOOR)!.rows.find((r) => r.line.workItem === "steel.footing-rebar")!.status, "assumed", "and the status of its own part: the footing's steel is an assumption");
  equal(groupBill(bill, "floor").find((g) => g.key === SITE_FLOOR)!.rows.find((r) => r.line.workItem === "concrete.footing")!.status, "calculated", "and its concrete is calculated");
  equal(groupBill(bill, "floor").map((g) => g.label), ["Foundations, ground slab and site works", "Ground", "First", "Roof"], "each floor is called by its name");
  equal(groupBill(bill, "stage").find((g) => g.key === "5")?.label, `5. ${STAGE_BY_ID[5].title}`, "each stage by its number and title");
  equal(groupBill(bill, "category").find((g) => g.key === "frame")?.label, CATEGORY_LABELS.frame, "each category by its label");
  equal(groupBill(bill, "section").find((g) => g.key === "C")?.label, "C. Concrete", "and each section by its letter and title");
  equal(groupBill(bill, "category").map((g) => g.key), CATEGORY_IDS.filter((c) => ["site", "substructure", "frame", "masonry", "finishes", "external"].includes(c)), "the categories in the order of the model");

  // ---- What the audit finds ---------------------------------------------------------------------------------------------------------------------------
  const audit = auditBill(model, DEFAULT_OPTIONS, "building");
  equal(audit.omissions, [], "the small building has nothing left out (the props are equipment, not bought)");
  equal(audit.exempt.map((e) => e.componentId).sort(), ["frame:g-prop-1", "frame:slab:f1:z:props"].sort(), "and says which are not bought, and why");
  ok(audit.exempt.every((e) => e.reason.length > 10), "each with a reason");
  equal(audit.duplicates, [], "nothing counted twice");
  equal(audit.concrete.over, [], "no more concrete counted than is drawn");
  near(audit.concrete.counted, 1 + 0.5 + 0.8 + 3 + 4 + 0.6 + 0.9, "the concrete counted is the sum of the members", 1e-9);
  const expectedSteel = 80 + 120 + 300 + 78 + 400 + 100;
  near(audit.reinforcement.expected!, expectedSteel, "the steel the rule asks for is the concrete times the ratios", 1e-6);
  near(audit.reinforcement.counted, expectedSteel, "and the steel in the bill is that", 0.02);
  equal(audit.reinforcement.unreinforced, [], "every member that needs steel has it");
  ok(audit.ok, "the audit passes");

  const damaged = (change: (parts: ComponentRecord[]) => void) => { const parts = smallBuilding(); change(parts); applyReinforcementRule({ rules: DEFAULT_RULES, components: parts } as unknown as Ctx); return auditBill(stub(parts), DEFAULT_OPTIONS, "building"); };
  {
    const a = damaged((parts) => { parts.find((c) => c.id === "masonry:f1-wall-1")!.quantities = []; });
    equal(a.omissions.map((o) => o.componentId), ["masonry:f1-wall-1"], "a wall that has lost its quantities is reported as left out");
    ok(!a.ok, "and the audit fails");
  }
  {
    const a = damaged((parts) => { parts.push(part("mystery", { kind: "mystery", category: "frame", shapes: [cubic(0.1)] })); });
    equal(a.omissions.map((o) => o.kind), ["mystery"], "so is something built that the bill knows nothing of");
  }
  {
    const a = damaged((parts) => { parts.push(part("cabinet:1", { kind: "cabinet-panel", category: "joinery", layer: "joinery", parentId: "masonry:f1-wall-1", shapes: [cubic(0.1)] })); });
    equal(a.omissions, [], "a panel of a cabinet is counted in the cabinet's schedule, and is not a fault");
    equal(a.carried.map((c) => c.componentId), ["cabinet:1"], "but is listed as carried");
  }
  const again = (parts: ComponentRecord[], change: (copy: ComponentRecord) => void) => {
    const wall = parts.find((c) => c.id === "masonry:f1-wall-1")!;
    const copy: ComponentRecord = { ...wall, id: "masonry:f1-wall-1-again", quantities: wall.quantities.map((q) => ({ ...q, id: `${q.id}-again`, componentId: "masonry:f1-wall-1-again" })) };
    change(copy);
    parts.push(copy);
  };
  {
    const a = damaged((parts) => again(parts, () => {}));
    equal(a.duplicates.length, 1, "the same wall twice, in the same place, is counted twice");
    equal(a.duplicates[0]?.componentIds.sort(), ["masonry:f1-wall-1", "masonry:f1-wall-1-again"].sort(), "and the audit names both");
    ok(!a.ok, "and fails the audit");
  }
  {
    const a = damaged((parts) => again(parts, (copy) => { copy.storeyId = "g"; copy.storeyName = "Ground"; copy.storeyIndex = 0; }));
    equal(a.duplicates, [], "the same wall on another storey, in the same shape, is not a duplicate");
  }
  {
    const a = damaged((parts) => again(parts, (copy) => { copy.shapes = [{ t: "box", c: { x: 5000, y: 0, z: 0 }, s: { x: 1000, y: 1000, z: 2000 } }]; }));
    equal(a.duplicates, [], "the same wall elsewhere on the storey is not a duplicate");
  }
  {
    const a = damaged((parts) => again(parts, (copy) => { copy.quantities.forEach((q) => { q.formula = "another sum"; }); }));
    equal(a.duplicates, [], "nor is another sum, in the same place");
  }
  {
    const a = damaged((parts) => again(parts, (copy) => { copy.quantities.forEach((q) => { q.room = "Bedroom"; }); }));
    equal(a.duplicates, [], "nor the same work in another room");
  }
  {
    const a = damaged((parts) => { parts.find((c) => c.id === "frame:g-column-1")!.quantities[0]!.value = 0.9; });
    equal(a.concrete.over.map((o) => o.componentId), ["frame:g-column-1"], "a column with more concrete counted than it has is reported");
    near(a.concrete.over[0]!.counted, 0.9, "with what was counted", 1e-9);
    near(a.concrete.over[0]!.drawn, 0.5, "and what is drawn", 1e-9);
    ok(!a.ok, "and fails the audit");
  }
  {
    const a = damaged((parts) => { parts.splice(parts.findIndex((c) => c.id === "frame:g-beam-1:bars"), 1); });
    equal(a.reinforcement.unreinforced, ["frame:g-beam-1"], "a beam without steel is reported");
    ok(!a.ok, "and fails the audit");
  }
  {
    const a = damaged((parts) => { parts.find((c) => c.id === "frame:g-beam-1")!.quantities[0]!.value = 0.0004; parts.find((c) => c.id === "frame:g-beam-1:bars")!.quantities = []; });
    equal(a.reinforcement.unreinforced, [], "a sliver of concrete too small to hold a bar is not expected to have steel");
  }
  {
    const parts = smallBuilding();
    const strict = auditBill(stub(parts.map((c) => c)), DEFAULT_OPTIONS, "building");
    equal(strict.reinforcement.basis, "ratio", "the audit reads the rule the model was made with");
    const m = stub(parts);
    m.rules = { ...DEFAULT_RULES, reinforcement: { ...DEFAULT_RULES.reinforcement, basis: "schedule" } };
    const s = auditBill(m, DEFAULT_OPTIONS, "building");
    equal(s.reinforcement.expected, null, "with a bar schedule as the only source there is no figure to compare with");
    equal(s.reinforcement.unreinforced, [], "and no member is faulted for having none");
    equal(s.reinforcement.withoutFigure, parts.flatMap((c) => c.quantities).filter((q) => q.workItem.startsWith("steel.")).length, "the lines waiting for a schedule are counted");
  }
  // A filtered bill keeps the references of the whole bill.
  {
    const whole = buildBill(model, DEFAULT_OPTIONS, "building");
    const early = buildBill(model, DEFAULT_OPTIONS, "building", (c) => c.stage <= 3);
    ok(early.lines.length < whole.lines.length && early.lines.length > 0, "a bill up to stage 3 has fewer lines");
    for (const line of early.lines) equal(line.ref, whole.lines.find((l) => l.workItem === line.workItem)!.ref, `${line.workItem} keeps ${line.ref} whichever stage is shown`);
    ok(whole.lines.every((l) => /^[A-W]\.\d\d$/.test(l.ref)), "references are a section letter and two digits");
    equal(new Set(whole.lines.map((l) => l.ref)).size, whole.lines.length, "no two lines share one");
    for (const section of whole.sections) equal(section.lines.map((l) => l.ref), section.lines.map((_, i) => `${section.code}.${String(i + 1).padStart(2, "0")}`), `section ${section.code} is numbered 01, 02, … in order`);
  }
}

function steelItemOf(parts: ComponentRecord[], id: string): QuantityItem {
  return parts.find((c) => c.id === id)!.quantities.find((q) => q.workItem.startsWith("steel."))!;
}

// ---------------------------------------------------------------------------
// The four buildings, at three sizes
// ---------------------------------------------------------------------------

const sizes = BUILDING_TEMPLATES.flatMap((template) => [
  { name: `${template} at its example size`, template, building: buildBuilding(defaultConfig(template)) },
  { name: `${template} at 150 m² a floor`, template, building: buildBuilding(configForArea(defaultConfig(template), 150).config) },
  { name: `${template} at 200 m² a floor`, template, building: buildBuilding(configForArea(defaultConfig(template), 200).config) },
]);
const modelOf = (building: BuiltBuilding, rules: EstimatingRules = DEFAULT_RULES, approvedBars: ApprovedBar[] = []): ConstructionModel => buildConstructionModel(building.project, { ...DEFAULT_OPTIONS, ...building.options }, rules, { approvedBars });

/** The exact volume of the union of axis-aligned boxes and rectilinear prisms, by a grid of every distinct coordinate; and the volume where classes of them overlap. */
type Cell = [number, number, number, number, number, number];
function insidePolygon(p: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!; const b = poly[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function cellsOf(shape: Shape): Cell[] | null {
  if (shape.t === "box") {
    if (shape.rx || shape.ry || shape.rz) return null;
    return [[shape.c.x - shape.s.x / 2, shape.c.x + shape.s.x / 2, shape.c.y - shape.s.y / 2, shape.c.y + shape.s.y / 2, shape.c.z - shape.s.z / 2, shape.c.z + shape.s.z / 2]];
  }
  if (shape.t === "prism") {
    const corners = [...shape.poly, ...(shape.holes ?? []).flat()];
    const xs = [...new Set(corners.map((p) => p.x))].sort((a, b) => a - b);
    const ys = [...new Set(corners.map((p) => p.y))].sort((a, b) => a - b);
    const cells: Cell[] = [];
    for (let i = 0; i + 1 < xs.length; i += 1) for (let j = 0; j + 1 < ys.length; j += 1) {
      const centre = { x: (xs[i]! + xs[i + 1]!) / 2, y: (ys[j]! + ys[j + 1]!) / 2 };
      if (insidePolygon(centre, shape.poly) && !(shape.holes ?? []).some((h) => insidePolygon(centre, h))) cells.push([xs[i]!, xs[i + 1]!, ys[j]!, ys[j + 1]!, shape.z0, shape.z1]);
    }
    return cells;
  }
  return null;
}
function occupancy(classes: Cell[][]): { union: number; overlap: (a: number, b: number) => number } {
  const all = classes.flat();
  const axes = [0, 1, 2].map((k) => [...new Set(all.flatMap((c) => [c[2 * k]!, c[2 * k + 1]!]))].sort((a, b) => a - b));
  const index = axes.map((values) => new Map(values.map((v, i) => [v, i])));
  const [nx, ny, nz] = axes.map((v) => v.length - 1) as [number, number, number];
  const mask = new Uint32Array(nx * ny * nz);
  classes.forEach((cells, k) => {
    for (const c of cells) {
      for (let i = index[0]!.get(c[0])!; i < index[0]!.get(c[1])!; i += 1) for (let j = index[1]!.get(c[2])!; j < index[1]!.get(c[3])!; j += 1) for (let l = index[2]!.get(c[4])!; l < index[2]!.get(c[5])!; l += 1) mask[(i * ny + j) * nz + l]! |= 1 << k;
    }
  });
  const pair = new Map<number, number>();
  let union = 0;
  for (let i = 0; i < nx; i += 1) for (let j = 0; j < ny; j += 1) for (let l = 0; l < nz; l += 1) {
    const m = mask[(i * ny + j) * nz + l]!;
    if (!m) continue;
    const v = (axes[0]![i + 1]! - axes[0]![i]!) * (axes[1]![j + 1]! - axes[1]![j]!) * (axes[2]![l + 1]! - axes[2]![l]!);
    union += v;
    if (m & (m - 1)) for (let a = 0; a < classes.length; a += 1) if (m & (1 << a)) for (let b = a + 1; b < classes.length; b += 1) if (m & (1 << b)) pair.set(a * 32 + b, (pair.get(a * 32 + b) ?? 0) + v);
  }
  return { union: union * 1e-9, overlap: (a, b) => (pair.get(Math.min(a, b) * 32 + Math.max(a, b)) ?? 0) * 1e-9 };
}

type ConcreteOracle = { names: string[]; counted: number; union: number; stairs: number; overlap: (a: string, b: string) => number; drawn: (name: string) => number; countedOf: (name: string) => number };
/** The concrete of a model, kind by kind: what the bill counts of it, what is drawn, and the exact volume of the union of what is drawn. Stairs, which slope, are set aside. */
function concreteOracle(model: ConstructionModel): ConcreteOracle {
  const components = countedComponents(model, model.options, "building").filter((c) => c.quantities.some((q) => q.workItem.startsWith("concrete.") && q.unit === "m³" && q.value !== null));
  const byClass = new Map<string, { cells: Cell[]; counted: number }>();
  let counted = 0;
  let stairs = 0;
  for (const c of components) {
    const mine = c.quantities.filter((q) => q.workItem.startsWith("concrete.") && q.unit === "m³" && q.value !== null).reduce((s, q) => s + q.value!, 0);
    const cells = c.shapes.map(cellsOf);
    if (cells.some((x) => x === null)) {
      stairs += mine;
      ok(mine <= c.shapes.reduce((s, sh) => s + shapeVolume(sh), 0) * 1e-9 + 5e-4, `${c.id} (a sloping stair) counts no more than it has`);
      continue;
    }
    const key = c.quantities.find((q) => q.workItem.startsWith("concrete."))!.workItem;
    const entry = byClass.get(key) ?? { cells: [], counted: 0 };
    entry.cells.push(...cells.flatMap((x) => x!));
    entry.counted += mine;
    byClass.set(key, entry);
    counted += mine;
  }
  const names = [...byClass.keys()];
  const grid = occupancy(names.map((n) => byClass.get(n)!.cells));
  const at = (n: string) => names.indexOf(n);
  return {
    names, counted, union: grid.union, stairs, overlap: (a, b) => (at(a) < 0 || at(b) < 0 ? 0 : grid.overlap(at(a), at(b))),
    drawn: (n) => occupancy([byClass.get(n)!.cells]).union, countedOf: (n) => byClass.get(n)?.counted ?? 0,
  };
}

// Concrete that is built against other concrete, and counted once: a column and the beams that frame into it, beams where they cross, the pedestals under the
// beams and the ground slab, the entrance steps cast against a column or a pedestal. Any other pair of kinds of concrete must not share a cubic metre.
const MEET: [string, string][] = [["concrete.column", "concrete.beam"], ["concrete.beam", "concrete.beam"], ["concrete.pedestal", "concrete.ground-beam"], ["concrete.pedestal", "concrete.ground-slab"], ["concrete.pedestal", "concrete.steps"], ["concrete.column", "concrete.steps"], ["concrete.ground-beam", "concrete.ground-beam"]];

for (const { name, building } of sizes) {
  const model = modelOf(building);
  const { project } = building;
  const bill = buildBill(model);
  const floorKeys = new Set(bill.floors.map((f) => f.key));
  const lineByRef = new Map(bill.lines.map((l) => [l.ref, l]));

  // ---- The lines are the sum of their parts ------------------------------------------------------------------------------------------------------------
  ok(bill.lines.length > 150, `${name}: a bill of ${bill.lines.length} lines`);
  for (const line of bill.lines) {
    const parts = line.parts.filter((p) => p.net !== null);
    if (line.net === null) ok(parts.length === 0, `${name}: ${line.ref} has no net because none of its parts has`);
    else near(parts.reduce((s, p) => s + p.net!, 0), line.net, `${name}: ${line.ref} ${line.workItem} is the sum of its parts`, 1e-5);
    equal(line.parts.length, line.itemCount, `${name}: ${line.ref}: one part for each item`);
    ok(line.parts.every((p) => floorKeys.has(p.floor) && (STAGE_IDS as readonly number[]).includes(p.stage) && (CATEGORY_IDS as readonly string[]).includes(p.category)), `${name}: ${line.ref}: every part has a floor, a stage and a category of the building`);
    const allowance = line.parts.reduce((s, p) => s + (p.allowance ?? 0), 0);
    near(allowance, line.allowanceQuantity ?? 0, `${name}: ${line.ref}: the allowances of the parts are the line's`, 1e-5);
  }
  equal(lineByRef.size, bill.lines.length, `${name}: every line has its own reference`);

  // ---- Every grouping adds up to the same lines ------------------------------------------------------------------------------------------------------
  for (const by of ["section", "floor", "stage", "category"] as BillGrouping[]) {
    const sums = new Map<string, number>();
    const appears = new Map<string, number>();
    for (const group of groupBill(bill, by)) for (const row of group.rows) {
      sums.set(row.line.ref, (sums.get(row.line.ref) ?? 0) + (row.net ?? 0));
      appears.set(row.line.ref, (appears.get(row.line.ref) ?? 0) + 1);
      ok(row.parts.length > 0, `${name}: by ${by}, a row has parts`);
    }
    for (const line of bill.lines) {
      near(sums.get(line.ref) ?? 0, line.net ?? 0, `${name}: by ${by}, ${line.ref} adds up to the line`, 1e-5);
      ok((appears.get(line.ref) ?? 0) >= 1, `${name}: by ${by}, ${line.ref} is in a group`);
    }
    if (by === "section") ok([...appears.values()].every((n) => n === 1), `${name}: by section, a line is in one group`);
  }

  // ---- Floors, by hand ----------------------------------------------------------------------------------------------------------------------------
  const storeyIds = model.storeys.map((s) => s.id);
  const partsOf = (workItem: string) => bill.lines.filter((l) => l.workItem === workItem).flatMap((l) => l.parts);
  ok(partsOf("concrete.footing").concat(partsOf("concrete.pedestal"), partsOf("concrete.ground-beam"), partsOf("concrete.ground-slab"), partsOf("earth.pit")).every((p) => p.floor === SITE_FLOOR), `${name}: footings, pedestals, ground beams, the ground slab and the pits are with the foundations`);
  ok(partsOf("concrete.column").every((p) => storeyIds.includes(p.floor)), `${name}: columns are with the storey they stand in`);
  equal([...new Set(partsOf("concrete.column").map((p) => p.floor))].sort(), [...storeyIds].sort(), `${name}: and there are columns in every storey`);
  const slabFloors = [...new Set(partsOf("concrete.slab").map((p) => p.floor))];
  equal(slabFloors.sort(), [...storeyIds.slice(1), ROOF_FLOOR].sort(), `${name}: the slabs are with the floors they form, the roof slab with the roof, and none with the ground floor`);
  equal([...new Set(partsOf("concrete.beam").map((p) => p.floor))].sort(), [...storeyIds.slice(1), ROOF_FLOOR].sort(), `${name}: and so are the beams under them`);
  for (const balcony of project.balconies) {
    const own = bill.lines.filter((l) => l.workItem === "concrete.balcony").flatMap((l) => l.parts).filter((p) => model.components.find((c) => c.id === p.componentId)?.sourceRef === balcony.id);
    ok(own.length >= 1 && own.every((p) => p.floor === balcony.levelId), `${name}: ${balcony.id} is billed with the floor it opens from, ${balcony.levelId}`);
  }
  ok(partsOf("masonry.parapet").concat(partsOf("masonry.gable"), partsOf("roof.covering"), partsOf("roof.truss"), partsOf("waterproofing.roof-membrane")).every((p) => p.floor === ROOF_FLOOR), `${name}: the parapet, gables and roof covering are with the roof`);
  ok(partsOf("masonry.wall-area").every((p) => storeyIds.includes(p.floor)), `${name}: the blockwork of the walls is with the storeys`);
  equal([...new Set(partsOf("masonry.wall-area").map((p) => p.floor))].sort(), [...storeyIds].sort(), `${name}: in every storey`);
  ok(partsOf("steel.slab-bars-top").every((p) => p.floor !== storeyIds[0]) && partsOf("steel.slab-bars-top").length > 0, `${name}: the steel of a slab is with the slab`);
  // Doors and windows, from the project.
  const doors = project.doors;
  const windows = project.windows;
  const count = (workItem: string) => bill.lines.find((l) => l.workItem === workItem)?.net ?? 0;
  equal(count("openings.door-frame"), doors.length, `${name}: a door frame for each of the ${doors.length} doors of the project`);
  equal(count("openings.door-opening"), doors.length, `${name}: and an opening for each`);
  equal(count("openings.window-frame"), windows.length, `${name}: a window frame for each of the ${windows.length} windows`);
  equal(count("openings.window-opening"), windows.length, `${name}: and an opening for each`);

  // ---- Nothing left out, nothing counted twice ---------------------------------------------------------------------------------------------------------
  const audit = auditBill(model);
  equal(audit.omissions, [], `${name}: no component built and left out of the bill`);
  equal(audit.duplicates, [], `${name}: no work counted twice`);
  equal(audit.concrete.over, [], `${name}: no member with more concrete counted than drawn`);
  equal(audit.reinforcement.unreinforced, [], `${name}: no member without steel`);
  ok(audit.ok, `${name}: the audit passes`);
  ok(audit.withQuantities + audit.exempt.length + audit.carried.length === audit.counted, `${name}: every component is billed, exempt or carried by its parent (${audit.withQuantities} + ${audit.exempt.length} + ${audit.carried.length} = ${audit.counted})`);
  ok(audit.exempt.every((e) => e.reason.length > 10), `${name}: and every exemption gives its reason`);

  // ---- The concrete against the exact union of what is drawn -----------------------------------------------------------------------------------------
  const oracle = concreteOracle(model);
  near(oracle.counted, oracle.union, `${name}: the concrete counted (${oracle.counted.toFixed(3)} m³) is the exact volume of the concrete drawn (${oracle.union.toFixed(3)} m³)`, 0.01);
  ok(oracle.stairs > 0 && oracle.stairs < 3, `${name}: and the stairs, ${oracle.stairs.toFixed(3)} m³, are the rest`);
  oracle.names.forEach((a, i) => oracle.names.forEach((b, j) => {
    if (j <= i) return;
    const shared = oracle.overlap(a, b);
    if (MEET.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return;
    ok(shared < 0.001, `${name}: ${a} and ${b} do not share concrete (${shared.toFixed(4)} m³)`);
  }));
  ok(oracle.names.every((n) => oracle.overlap(n, n) === 0 || MEET.some(([x, y]) => x === n && y === n)), `${name}: and no kind overlaps itself but where beams cross`);
  // What is drawn and not counted is what lies in other concrete: the entrance steps are counted net of the columns and pedestals they are cast against.
  if (oracle.names.includes("concrete.steps")) {
    const against = oracle.overlap("concrete.steps", "concrete.column") + oracle.overlap("concrete.steps", "concrete.pedestal");
    near(oracle.drawn("concrete.steps") - oracle.countedOf("concrete.steps"), against, `${name}: the steps are counted less the ${against.toFixed(4)} m³ that is in the columns and pedestals`, 0.0004);
  }

  // ---- The steel is the rule's ---------------------------------------------------------------------------------------------------------------------
  const rule = model.rules.reinforcement;
  const wantSteel = bill.lines.filter((l) => l.workItem.startsWith("concrete.")).reduce((s, l) => s + (rule.ratios[l.workItem] ?? 0) * (l.net ?? 0), 0);
  const gotSteel = bill.lines.filter((l) => l.workItem.startsWith("steel.") && l.unit === "kg").reduce((s, l) => s + (l.net ?? 0), 0);
  near(gotSteel, wantSteel, `${name}: the steel in the bill (${gotSteel.toFixed(1)} kg) is the concrete times the ratios (${wantSteel.toFixed(1)} kg)`, 0.005 * bill.lines.length + 0.0002 * wantSteel);
  ok(bill.lines.filter((l) => l.workItem.startsWith("steel.") && l.unit === "kg").every((l) => l.status === "assumed" && l.missingItems === 0), `${name}: and every figure is marked an assumption`);
  ok(wantSteel / (project.levels.length * (building.areas.areaPerFloor[0] ?? 1)) > 30 && wantSteel / (project.levels.length * (building.areas.areaPerFloor[0] ?? 1)) < 120, `${name}: which is a believable kilogram of steel for each square metre of floor`);
}

// ---------------------------------------------------------------------------
// A project the configurator did not make
// ---------------------------------------------------------------------------

{
  // Footings 700 mm thick on a 1500 mm depth reach up to −800 mm, into the ground beams (which begin at −1050 mm). A project of the learner's own may be drawn so.
  const { building } = sizes.find((s) => s.name === "modern-house at its example size")!;
  const project = { ...building.project, foundations: building.project.foundations.map((f) => ({ ...f, thickness: 700 })) };
  const model = buildConstructionModel(project, { ...DEFAULT_OPTIONS, ...building.options }, DEFAULT_RULES);
  const oracle = concreteOracle(model);
  ok(oracle.overlap("concrete.footing", "concrete.ground-beam") + oracle.overlap("concrete.combined-footing", "concrete.ground-beam") > 0.1, `the ground beams run into the footings (${oracle.overlap("concrete.footing", "concrete.ground-beam").toFixed(3)} m³ shared)`);
  near(oracle.counted, oracle.union, "and the concrete they share is counted once", 0.01);
  const audit = auditBill(model);
  ok(audit.ok, "and the audit passes");
}

// ---------------------------------------------------------------------------
// Rules that change the bill
// ---------------------------------------------------------------------------

{
  const building = sizes.find((s) => s.name === "modern-house at its example size")!.building;
  const base = buildBill(modelOf(building));
  const total = (b: ReturnType<typeof buildBill>, prefix: string) => b.lines.filter((l) => l.workItem.startsWith(prefix) && l.unit === "kg").reduce((s, l) => s + (l.net ?? 0), 0);

  // A ratio edited changes the steel of that member and no other.
  const doubled = buildBill(modelOf(building, { ...DEFAULT_RULES, reinforcement: { ...DEFAULT_RULES.reinforcement, ratios: { ...DEFAULT_RULES.reinforcement.ratios, "concrete.beam": 300 } } }));
  const beamSteel = (b: ReturnType<typeof buildBill>) => b.lines.filter((l) => /^steel\.beam-(bars|stirrups)$/.test(l.workItem)).reduce((s, l) => s + (l.net ?? 0), 0);
  near(beamSteel(doubled), 2 * beamSteel(base), "twice the kilograms per m³ of beam, twice the steel in the beams", 0.5);
  near(total(doubled, "steel.slab"), total(base, "steel.slab"), "the slabs are not touched", 0.5);
  near(total(doubled, "steel.column"), total(base, "steel.column"), "nor the columns", 0.5);
  const noBeams = buildBill(modelOf(building, { ...DEFAULT_RULES, reinforcement: { ...DEFAULT_RULES.reinforcement, ratios: { ...DEFAULT_RULES.reinforcement.ratios, "concrete.beam": 0 } } }));
  near(beamSteel(noBeams), 0, "and none at all for none", 0.01);

  // Strict: no bar schedule, no figure.
  const strictModel = modelOf(building, { ...DEFAULT_RULES, reinforcement: { ...DEFAULT_RULES.reinforcement, basis: "schedule" } });
  const strict = buildBill(strictModel);
  const steelLines = strict.lines.filter((l) => l.workItem.startsWith("steel.") && l.unit === "kg");
  ok(steelLines.length > 10 && steelLines.every((l) => l.net === null && l.status === "missing"), "with a bar schedule as the only source, every steel line has no figure and is marked missing");
  const strictAudit = auditBill(strictModel);
  ok(strictAudit.ok && strictAudit.reinforcement.expected === null && strictAudit.reinforcement.counted === 0 && strictAudit.reinforcement.withoutFigure > 10, "and the audit counts them rather than faulting the model");
  equal(strict.lines.filter((l) => !l.workItem.startsWith("steel.")).map((l) => `${l.ref}:${l.net}`), base.lines.filter((l) => !l.workItem.startsWith("steel.")).map((l) => `${l.ref}:${l.net}`), "everything else in the bill is the same");

  // An approved bar schedule decides the group it covers.
  const footing = modelOf(building).components.find((c) => c.kind === "footing-rebar")!;
  const schedule: ApprovedBar[] = [{ componentId: footing.id, mark: "F1", diameterMm: 12, lengthMm: 1400, count: 20 }];
  const approved = modelOf(building, DEFAULT_RULES, schedule).components.find((c) => c.id === footing.id)!.quantities.find((q) => q.workItem.startsWith("steel."))!;
  near(approved.value!, Math.round(steelWeightKg(schedule) * 100) / 100, "a schedule gives the weight of its own bars: 20 × 1.4 m × 0.888 kg/m", 0.006);
  equal(approved.status, "review", "marked for review, not an assumption");
  ok(/F1/.test(approved.formula) && !/kg\/m³/.test(approved.formula), "with its own working, not the rule's");

  // A different rule for openings changes the walls, and nothing in the concrete.
  const none = buildBill(modelOf(building, { ...DEFAULT_RULES, openingDeduction: "none" }));
  const area = (b: ReturnType<typeof buildBill>, workItem: string) => b.lines.find((l) => l.workItem === workItem)!.net!;
  ok(area(none, "masonry.wall-area") > area(base, "masonry.wall-area") + 5, "deducting no openings gives more wall");
  near(area(none, "concrete.slab"), area(base, "concrete.slab"), "and the same slabs", 1e-6);
}

// ---------------------------------------------------------------------------
// The bill follows the building
// ---------------------------------------------------------------------------

for (const template of BUILDING_TEMPLATES) {
  const at = (area: number) => buildBill(modelOf(buildBuilding(configForArea(defaultConfig(template), area).config)));
  const small = at(150);
  const large = at(200);
  for (const workItem of ["concrete.slab", "concrete.beam", "masonry.wall-area", "paint.walls", "flooring.tile-area", "formwork.slab"]) {
    const a = small.lines.find((l) => l.workItem === workItem)?.net;
    const b = large.lines.find((l) => l.workItem === workItem)?.net;
    if (a === undefined || b === undefined) continue;
    ok(b! > a! * 1.1, `${template}: ${workItem} grows with the building (${a} at 150 m² to ${b} at 200 m²)`);
  }
  ok(large.lines.length >= small.lines.length - 5, `${template}: and the bill keeps its shape`);
}

// ---------------------------------------------------------------------------
// The structure does not run into itself
// ---------------------------------------------------------------------------

{
  const roomy = normalizeParams({ footingThickness: 600, footingDepth: 1200 });
  equal(roomy.params.footingDepth, 1650, "a footing 600 mm thick goes 1050 + 600 mm down, under the ground beams");
  equal(roomy.issues.map((i) => i.field), ["footingDepth"], "and the change is reported");
  const shallow = normalizeParams({ footingThickness: 250, footingDepth: 700 });
  equal(shallow.params.footingDepth, 1300, "a thin footing needs 1300 mm");
  const fine = normalizeParams({ footingThickness: 450, footingDepth: 1500 });
  equal(fine.params.footingDepth, 1500, "the example footing already clears the beams");
  equal(fine.issues, [], "and says nothing");
  const deep = normalizeParams({ footingThickness: 450, footingDepth: 2400 });
  equal(deep.params.footingDepth, 2400, "a footing deeper than that is left as it is");
  // The stretches of a line outside a set of rectangles, worked out by hand.
  const rect = (x0: number, x1: number, y0: number, y1: number) => ({ x0, x1, y0, y1 });
  const along = (a: [number, number], b: [number, number], rects: ReturnType<typeof rect>[]) => outsideRects({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }, rects).map(([s0, s1]) => [Math.round(s0 * 100) / 100, Math.round(s1 * 100) / 100]);
  equal(along([0, 0], [10000, 0], [rect(2000, 3000, -500, 500)]), [[0, 2000], [3000, 10000]], "a line 10 m long through a footing 1 m wide has two clear stretches, 2 m and 7 m");
  equal(along([0, 0], [10000, 0], [rect(3500, 5000, -500, 500), rect(2000, 4000, -500, 500)]), [[0, 2000], [5000, 10000]], "two footings that overlap are one gap");
  equal(along([0, 0], [10000, 0], [rect(2000, 3000, 600, 1000)]), [[0, 10000]], "a footing beside the line leaves it whole");
  equal(along([0, 0], [10000, 0], [rect(-100, 12000, -500, 500)]), [], "a footing under the whole line leaves nothing");
  equal(along([0, 0], [10000, 0], [rect(-500, 1000, -500, 500), rect(9000, 11000, -500, 500)]), [[1000, 9000]], "footings at both ends leave the middle");
  equal(along([0, 0], [10000, 0], [rect(2000, 6000, -500, 500), rect(3000, 4000, -500, 500)]), [[0, 2000], [6000, 10000]], "a footing inside another changes nothing");
  equal(along([0, 0], [10000, 0], [rect(7000, 8000, -500, 500), rect(1000, 2000, -500, 500)]), [[0, 1000], [2000, 7000], [8000, 10000]], "footings given in any order");
  equal(along([0, 0], [0, 6000], [rect(-300, 300, 1000, 2000)]), [[0, 1000], [2000, 6000]], "a line along y is cut the same way");
  equal(along([5000, 0], [0, 0], [rect(2000, 3000, -500, 500)]), [[0, 2000], [3000, 5000]], "and a line drawn the other way, as distances from its start");
  equal(along([0, 0], [4000, 4000], [rect(1000, 2000, 1000, 2000)]), [[0, 1414.21], [2828.43, 5656.85]], "a diagonal line is cut where it crosses the corners");
  equal(along([0, 0], [0, 0], [rect(-1, 1, -1, 1)]), [], "a line with no length has no stretches");
  equal(along([0, 0], [3000, 0], []), [[0, 3000]], "and with no footings the line is whole");
  for (const { name, building } of sizes) {
    const model = modelOf(building);
    const footings = model.components.filter((c) => c.kind === "pad-footing" || c.kind === "combined-footing");
    const groundBeams = model.components.filter((c) => c.kind === "ground-beam");
    const topOfFootings = Math.max(...footings.flatMap((c) => c.shapes.map((s) => (s.t === "box" ? s.c.z + s.s.z / 2 : -Infinity))));
    const bottomOfBeams = Math.min(...groundBeams.flatMap((c) => c.shapes.map((s) => (s.t === "box" ? s.c.z - s.s.z / 2 : Infinity))));
    ok(topOfFootings <= bottomOfBeams + 1e-6, `${name}: the footings (up to ${topOfFootings} mm) lie under the ground beams (from ${bottomOfBeams} mm)`);

    // The blinding under a ground beam lies only where the beam is clear of the footings: each beam runs along an axis, and its centre line is cut at the edges of the footings it crosses.
    const rects = footings.flatMap((c) => c.shapes.map((s) => (s.t === "box" ? { x0: s.c.x - s.s.x / 2, x1: s.c.x + s.s.x / 2, y0: s.c.y - s.s.y / 2, y1: s.c.y + s.s.y / 2 } : null)).filter((r) => r !== null)) as { x0: number; x1: number; y0: number; y1: number }[];
    for (const beam of groundBeams) {
      const box = beam.shapes[0] as Extract<Shape, { t: "box" }>;
      const alongX = box.s.x > box.s.y;
      const lo = alongX ? box.c.x - box.s.x / 2 : box.c.y - box.s.y / 2;
      const hi = alongX ? box.c.x + box.s.x / 2 : box.c.y + box.s.y / 2;
      const line = alongX ? box.c.y : box.c.x;
      const covered = rects.filter((r) => (alongX ? r.y0 < line && line < r.y1 : r.x0 < line && line < r.x1)).map((r) => (alongX ? [Math.max(lo, r.x0), Math.min(hi, r.x1)] : [Math.max(lo, r.y0), Math.min(hi, r.y1)]) as [number, number]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
      let clear = hi - lo;
      let reach = lo;
      for (const [a, b] of covered) { const from = Math.max(a, reach); if (b > from) { clear -= b - from; reach = b; } }
      const blinding = model.components.find((c) => c.id === `${beam.id}:blinding`);
      const length = blinding ? blinding.quantities.find((q) => q.workItem === "concrete.blinding")!.inputs.length : 0;
      near(Number(length), clear, `${name}: ${beam.id}: the blinding is ${clear.toFixed(0)} mm long, the length clear of the footings`, 0.51);
    }
  }
}

// ---------------------------------------------------------------------------
// One bill, read twice
// ---------------------------------------------------------------------------

{
  const model = modelOf(sizes[0]!.building);
  const a = aggregateQuantities(model);
  const b = buildBill(model);
  equal(b.lines.map((l) => `${l.workItem}|${l.unit}|${l.net}`), a.map((l) => `${l.workItem}|${l.unit}|${l.net}`), "the bill is the quantity lines of the model, numbered");
  const loose = buildBill(model, model.options, "loose");
  ok(loose.lines.length > 0, "loose furniture has a bill of its own");
  ok(loose.lines.every((l) => /^[A-W]\.\d\d$/.test(l.ref)), "whose references are well formed");
  equal(new Set(loose.lines.map((l) => l.ref)).size, loose.lines.length, "and not shared");
  for (const section of loose.sections) equal(section.lines.map((l) => l.ref), section.lines.map((_, i) => `${section.code}.${String(i + 1).padStart(2, "0")}`), `section ${section.code} of the furniture is numbered 01, 02, … from its own first line`);
  const built = new Set(b.lines.flatMap((l) => l.componentIds));
  ok(loose.lines.every((l) => l.componentIds.every((id) => !built.has(id))), "and none of its components is in the building's");
  const later = buildBill(model, model.options, "building", (c) => c.stage <= 5);
  for (const line of later.lines) equal(line.ref, b.lines.find((l) => l.workItem === line.workItem && l.unit === line.unit)!.ref, `after the furniture's bill was made, ${line.workItem} still has the building's reference ${line.ref}`);
}

console.log(`Construction bill of quantities: ${checks} checks passed.`);
