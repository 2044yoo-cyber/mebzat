/**
 * The building configurator: four templates, their dimensions, their areas, and
 * the 3D model that follows the numbers.
 *
 *   npx tsx scripts/building_config_check.ts
 *
 * Expected numbers are worked out here from the length and width that were
 * asked for, or measured on the drawn model by a method that does not use the
 * code that produced it (column positions, the polygons of the slabs, the
 * covering of the roof). Calls are asserted, not identifiers.
 */
import assert from "node:assert/strict";

import {
  BUILDING_TEMPLATES, TEMPLATES, areaRange, areasOf, buildBuilding, configForArea, defaultConfig, normalizeConfig, roofAreaOf, widthBounds,
  type BuildingConfig, type BuildingTemplateId,
} from "../src/features/house-designer/construction/building-config";
import { Ctx } from "../src/features/house-designer/construction/context";
import { polygonArea, unionArea, type P2, type Shape } from "../src/features/house-designer/construction/geometry";
import { buildLearningHouseProject } from "../src/features/house-designer/construction/learning-house";
import { OVERHANG, PITCH_DEG, PLATE } from "../src/features/house-designer/construction/roof-geometry";
import { buildConstructionModel } from "../src/features/house-designer/construction/model";
import { auditContextOf, auditServices } from "../src/features/house-designer/construction/service-audit";
import { DEFAULT_OPTIONS, DEFAULT_RULES, STAGE_IDS, type ComponentRecord, type ConstructionModel } from "../src/features/house-designer/construction/types";
import { houseProjectSchema } from "../src/features/house-designer/types/project";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };
const near = (actual: number, expected: number, message: string, tolerance = 1e-6) => { assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} is not ${expected} (±${tolerance})`); checks += 1; };

const m2 = (config: Pick<BuildingConfig, "length" | "width">) => (config.length * config.width) / 1e6;

type Case = { name: string; template: BuildingTemplateId; config: BuildingConfig };
const cases: Case[] = BUILDING_TEMPLATES.flatMap((template) => [
  { name: `${template} at its example size`, template, config: defaultConfig(template) },
  { name: `${template} at 150 m² a floor`, template, config: configForArea(defaultConfig(template), 150).config },
  { name: `${template} at 200 m² a floor`, template, config: configForArea(defaultConfig(template), 200).config },
]);

const modelCache = new Map<string, { building: ReturnType<typeof buildBuilding>; model: ConstructionModel; ms: number }>();
function modelOf(config: BuildingConfig) {
  const key = JSON.stringify(config);
  let hit = modelCache.get(key);
  if (!hit) {
    const building = buildBuilding(config);
    const t0 = Date.now();
    const model = buildConstructionModel(building.project, { ...DEFAULT_OPTIONS, ...building.options }, DEFAULT_RULES);
    hit = { building, model, ms: Date.now() - t0 };
    modelCache.set(key, hit);
  }
  return hit;
}

const boxes = (c: ComponentRecord) => c.shapes.filter((s): s is Extract<Shape, { t: "box" }> => s.t === "box");
const prisms = (c: ComponentRecord) => c.shapes.filter((s): s is Extract<Shape, { t: "prism" }> => s.t === "prism");
const ofKind = (model: ConstructionModel, kind: string) => model.components.filter((c) => c.kind === kind);

// ---------------------------------------------------------------------------
// 1. The four templates, and the current building as the first of them
// ---------------------------------------------------------------------------
{
  equal(BUILDING_TEMPLATES.map((id) => TEMPLATES[id].label), ["Existing Building", "Modern House", "Modern Villa", "G+2 Building"], "the four templates, the existing building first");
  for (const id of BUILDING_TEMPLATES) {
    const def = TEMPLATES[id];
    equal(normalizeConfig(def.defaults).issues, [], `${def.label}: its own example size raises nothing`);
    ok(def.summary.length > 40 && def.features.length >= 3, `${def.label} says what it is`);
  }

  // The Existing Building is the learning house, untouched: same project, same model.
  const original = buildLearningHouseProject({}).project;
  const existing = buildBuilding({ template: "existing" });
  // Everything but the clock: the project carries the time it was generated.
  const sameButClock = (project: typeof original) => { const copy = JSON.parse(JSON.stringify(project)); delete copy.metadata.updatedAt; return copy; };
  equal(sameButClock(existing.project), sameButClock(original), "the Existing Building at its example size is exactly the learning house the lab started with");
  equal(existing.config, { template: "existing", length: 12000, width: 9000, floors: 3, floorToFloor: 3200 }, "and measures 12 m × 9 m, three floors of 3.2 m");
  equal(existing.issues, [], "with no warnings");
  equal(buildBuilding({}).config.template, "existing", "asking for nothing gives the Existing Building");
  equal(buildBuilding({ template: "no-such-template" as BuildingTemplateId }).config.template, "existing", "and so does a template that does not exist");
  for (const c of cases) houseProjectSchema.parse(JSON.parse(JSON.stringify(buildBuilding(c.config).project)));
  checks += cases.length;
}

// ---------------------------------------------------------------------------
// 2. Areas: footprint, area per floor, gross floor area, roof — read from the geometry
// ---------------------------------------------------------------------------
{
  const existing = buildBuilding({ template: "existing" });
  near(existing.areas.footprint, 108, "Existing Building: 12 m × 9 m is 108 m² on the ground", 1e-9);
  equal(existing.areas.areaPerFloor.map((a) => Math.round(a * 1e6) / 1e6), [108, 108, 108], "108 m² on each of three floors");
  near(existing.areas.grossFloorArea, 324, "so 324 m² gross floor area", 1e-9);
  equal(existing.areas.balconyPerFloor.map((a) => Math.round(a * 1e6) / 1e6), [0, 2.64, 0], "and its entrance balcony, 2.2 m × 1.2 m, is counted apart from the floors");

  for (const c of cases) {
    const { building } = modelOf(c.config);
    const { config, areas } = building;
    const L = config.length; const W = config.width;
    equal(building.config, c.config, `${c.name}: the configuration it was built from is already sane`);
    equal(areas.areaPerFloor.length, config.floors, `${c.name}: one area for each of the ${config.floors} floors`);
    areas.areaPerFloor.forEach((a, i) => near(a, (L * W) / 1e6, `${c.name}: floor ${i} is length × width`, 1e-9));
    near(areas.footprint, (L * W) / 1e6, `${c.name}: the footprint is the ground floor outline`, 1e-9);
    near(areas.grossFloorArea, (config.floors * L * W) / 1e6, `${c.name}: gross floor area is the floors added up`, 1e-9);
    near(areas.totalSlabArea, areas.grossFloorArea + areas.balconyPerFloor.reduce((s, a) => s + a, 0), `${c.name}: floors and cantilevers together`, 1e-9);
    ok(areas.footprint !== areas.grossFloorArea || config.floors === 1, `${c.name}: footprint and gross floor area are different numbers`);
    ok(areas.roofArea > 0 && areas.roofArea < areas.totalSlabArea, `${c.name}: the roof area is its own number`);
  }

  // The areas that were asked for are the areas that come out.
  for (const template of BUILDING_TEMPLATES) {
    for (const asked of [150, 200]) {
      const { config } = configForArea(defaultConfig(template), asked);
      near(m2(config), asked, `${template}: ${asked} m² a floor comes out at ${m2(config).toFixed(2)} m²`, 0.05);
      ok(config.length % 50 === 0 && config.width % 50 === 0, `${template}: lengths are whole multiples of 50 mm`);
      const [lo, hi] = TEMPLATES[template].limits.length;
      ok(config.length >= lo && config.length <= hi, `${template}: ${asked} m² is within the length the template can be drawn at`);
    }
  }
  // 150 m² and 200 m² per floor on the G+2 building: 450 and 600 m² gross.
  const g150 = modelOf(configForArea(defaultConfig("g-plus-2"), 150).config).building.areas;
  near(g150.grossFloorArea, 450, "G+2 with three 150 m² floors is about 450 m² gross", 0.2);
  const g200 = modelOf(configForArea(defaultConfig("g-plus-2"), 200).config).building.areas;
  near(g200.grossFloorArea, 600, "and with three 200 m² floors about 600 m²", 0.2);

  // Out of range: the nearest allowed area, not a broken building.
  for (const template of BUILDING_TEMPLATES) {
    const [lo, hi] = areaRange(template, defaultConfig(template).floorToFloor);
    const small = configForArea(defaultConfig(template), 5).config;
    near(m2(small), lo, `${template}: an area below the smallest becomes the smallest`, 0.05);
    const huge = configForArea(defaultConfig(template), 5000).config;
    near(m2(huge), hi, `${template}: an area above the largest becomes the largest`, 0.05);
  }

  // The balcony is its own area: outside the floor, not part of the gross floor area.
  const house = modelOf(defaultConfig("modern-house")).building;
  near(house.areas.balconyPerFloor[1]!, (house.project.balconies[0]!.width * house.project.balconies[0]!.depth) / 1e6, "Modern House: the balcony area is its width × depth");
  near(house.areas.balconyPerFloor[0]!, 0, "on the first floor only");
  ok(house.areas.balconyPerFloor[1]! > 5, `and is a real cantilever (${house.areas.balconyPerFloor[1]!.toFixed(1)} m²)`);
  near(house.areas.grossFloorArea, house.areas.areaPerFloor.reduce((s, a) => s + a, 0), "which gross floor area does not count");
  const villa = modelOf(defaultConfig("modern-villa")).building;
  equal(villa.project.balconies.length, 2, "Modern Villa: two balconies");
  equal(modelOf(defaultConfig("g-plus-2")).building.project.balconies.length, 0, "G+2: none");
}

// ---------------------------------------------------------------------------
// 3. The model is drawn at the size the numbers say
// ---------------------------------------------------------------------------
{
  for (const c of cases) {
    const { building, model } = modelOf(c.config);
    const { config } = building;
    const columns = ofKind(model, "column");
    const storeys = [...new Set(columns.map((col) => col.storeyIndex))].sort((a, b) => a - b);
    equal(storeys, Array.from({ length: config.floors }, (_, i) => i), `${c.name}: columns on each of the ${config.floors} floors`);
    // Column centres, measured from the drawn boxes.
    const centres = columns.flatMap((col) => boxes(col).map((b) => b.c));
    const xs = centres.map((p) => p.x); const ys = centres.map((p) => p.y);
    near(Math.max(...xs) - Math.min(...xs), config.length, `${c.name}: the columns stand ${config.length} mm apart end to end`, 1e-6);
    near(Math.max(...ys) - Math.min(...ys), config.width, `${c.name}: and ${config.width} mm apart across`, 1e-6);
    // Five lines across and three deep: fifteen columns on a floor.
    equal(columns.filter((col) => col.storeyIndex === 0).length, 15, `${c.name}: fifteen columns to a floor`);

    // The slabs of each floor, from the polygons the model drew, cover the floor area that was quoted.
    // (A suspended slab is named for the level it carries; the roof slab for the roof.)
    const slabsOf = (levelId: string) => model.components.filter((x) => x.kind === "slab" && x.id.startsWith(`frame:slab:${levelId}:`));
    const drawnOn = (i: number) => (i === 0 ? model.components.filter((x) => x.kind === "ground-slab") : slabsOf(building.project.levels[i]!.id)).flatMap((x) => prisms(x).map((p) => p.poly));
    const t = building.params.externalWall;
    const edge = Math.max(building.params.columnSize, building.params.beamWidth) / 2;
    for (let i = 0; i < config.floors; i += 1) {
      const drawn = drawnOn(i);
      ok(drawn.length >= 1, `${c.name}: floor ${i} has a slab`);
      if (i === 0) {
        // The slab on the ground is laid between the faces of the external walls, which stand on the outline: the outline less half a wall all round.
        near(unionArea(drawn) * 1e-6, ((config.length - t) * (config.width - t)) / 1e6, `${c.name}: the ground slab drawn fills the outline less half the wall thickness all round`, 0.01);
        ok(unionArea(drawn) * 1e-6 < building.areas.footprint, `${c.name}: so it is a little smaller than the footprint quoted to the outline`);
      } else {
        // The zones tile the outline and run out past it to the outer face of the frame (half the widest column or beam); the stairwell is a hole cut through them.
        near(unionArea(drawn) * 1e-6, ((config.length + 2 * edge) * (config.width + 2 * edge)) / 1e6, `${c.name}: the slab zones drawn on floor ${i} cover the outline out to the outer face of the frame`, 0.01);
        const holes = slabsOf(building.project.levels[i]!.id).flatMap((x) => prisms(x).flatMap((p) => p.holes ?? []));
        ok(holes.some((h) => polygonArea(h) > 3e6), `${c.name}: the stairwell, more than 3 m², is cut through floor ${i}`);
      }
    }
    // The roof slab is cast to the same edge as the floors below it.
    near(unionArea(model.components.filter((x) => x.kind === "slab" && x.id.startsWith("frame:slab:roof:")).flatMap((x) => prisms(x).map((p) => p.poly))) * 1e-6, ((config.length + 2 * edge) * (config.width + 2 * edge)) / 1e6, `${c.name}: and the roof slab the same`, 0.01);

    // Storey heights are the floor-to-floor height: the floor levels are that far apart, and so are the slabs drawn.
    building.project.levels.forEach((level, i) => near(level.elevation, i * config.floorToFloor, `${c.name}: floor ${i} stands ${i * config.floorToFloor} mm above the ground floor`, 1e-6));
    const slabTop = (i: number) => Math.max(...slabsOf(building.project.levels[i]!.id).flatMap((x) => prisms(x).map((p) => p.z1)));
    for (let i = 1; i < config.floors; i += 1) near(slabTop(i), i * config.floorToFloor, `${c.name}: the slab of floor ${i} is drawn with its top at ${i * config.floorToFloor} mm`, 1e-6);

    // Every component is unique, belongs to a real parent, and every stage has something in it.
    const ids = new Set(model.components.map((x) => x.id));
    equal(ids.size, model.components.length, `${c.name}: every component id is unique`);
    ok(model.components.every((x) => x.parentId === null || ids.has(x.parentId)), `${c.name}: every parent exists`);
    for (const stage of STAGE_IDS) ok(model.components.some((x) => x.stage === stage), `${c.name}: stage ${stage} has components`);
  }
}

// ---------------------------------------------------------------------------
// 4. Resizing changes the model, not just the numbers
// ---------------------------------------------------------------------------
{
  const small = modelOf(defaultConfig("existing"));
  const large = modelOf(configForArea(defaultConfig("existing"), 200).config);
  // Column centres, so that a bigger column in a bigger building does not count as length.
  const extent = (model: ConstructionModel) => {
    const centres = model.components.filter((c) => c.kind === "column").flatMap((c) => boxes(c).map((b) => b.c));
    return { x: Math.max(...centres.map((p) => p.x)) - Math.min(...centres.map((p) => p.x)), y: Math.max(...centres.map((p) => p.y)) - Math.min(...centres.map((p) => p.y)) };
  };
  const a = extent(small.model); const b = extent(large.model);
  near(b.x - a.x, large.building.config.length - small.building.config.length, "a longer building is drawn that much longer");
  near(b.y - a.y, large.building.config.width - small.building.config.width, "and a wider one that much wider");
  const blocks = (m: ConstructionModel) => m.components.filter((c) => c.category === "masonry").reduce((s, c) => s + c.shapes.length, 0);
  ok(blocks(large.model) > blocks(small.model), `more wall is built for the larger plan (${blocks(small.model)} → ${blocks(large.model)} pieces)`);
  const groundSlab = (m: ConstructionModel) => m.components.filter((c) => c.kind === "ground-slab").reduce((sum, c) => sum + prisms(c).reduce((t, p) => t + polygonArea(p.poly), 0), 0) * 1e-6;
  const inside = (b: typeof small) => ((b.building.config.length - b.building.params.externalWall) * (b.building.config.width - b.building.params.externalWall)) / 1e6;
  near(groundSlab(small.model), inside(small), "the ground slab of the small plan is the plan inside its walls");
  near(groundSlab(large.model), inside(large), "and that of the large plan the larger plan inside its walls");
  ok(groundSlab(large.model) > groundSlab(small.model) * 1.8, "so 200 m² of floor casts nearly twice the slab that 108 m² does");

  // One more storey is one more floor of columns, slab and walls.
  const three = buildBuilding({ template: "existing", floors: 3 });
  const four = buildBuilding({ template: "existing", floors: 4 });
  equal(four.project.levels.length - three.project.levels.length, 1, "asking for four floors draws four");
  near(four.areas.grossFloorArea - three.areas.grossFloorArea, three.areas.footprint, "and adds one floor of area", 1e-9);

  // A taller storey is a taller building.
  const tall = modelOf({ ...defaultConfig("modern-house"), floorToFloor: 3600 });
  const top = (m: ConstructionModel) => Math.max(...m.components.filter((c) => c.kind === "column").flatMap((c) => boxes(c).map((b) => b.c.z + b.s.z / 2)));
  ok(top(tall.model) - top(modelOf(defaultConfig("modern-house")).model) >= 2 * 400 - 1, "a floor-to-floor height 400 mm taller raises the top of the columns by 800 mm over two floors");

  // The stair always fits the bay it stands in.
  const tallest = normalizeConfig({ template: "existing", floorToFloor: 4500, width: 7500 });
  ok(tallest.config.width >= widthBounds("existing", 4500)[0], "a tall storey widens a building too narrow for its stair");
  ok(tallest.issues.some((i) => i.field === "width" && /stair/.test(i.message)), "and says why");

  // The learner's own structure sizes ride on top of the template, without resizing the rest.
  const thick = buildBuilding({ template: "existing" }, { slabThickness: 250 });
  equal(thick.params.slabThickness, 250, "a slab thickness typed in is used");
  equal(thick.params.beamDepth, 450, "and the beams stay as the example had them");
  equal(thick.project.slabs[1]!.thickness, 250, "and the suspended slabs in the project are that thick");
  equal(thick.project.slabs[0]!.thickness, 150, "while the ground slab keeps its own");
  for (const template of ["modern-house", "modern-villa", "g-plus-2"] as const) {
    const own = buildBuilding({ template }, { slabThickness: 300, beamWidth: 350 });
    equal([own.params.slabThickness, own.params.beamWidth], [300, 350], `${template}: sizes typed in win over the ones the template chose`);
    equal(own.project.slabs[1]!.thickness, 300, `${template}: and are the ones drawn`);
  }
  const bad = buildBuilding({ template: "existing" }, { slabThickness: 20 });
  ok(bad.issues.some((i) => /slabThickness was 20/.test(i.message)) && bad.params.slabThickness === 120, "an impossible thickness is corrected, with a message");
  const resized = buildBuilding(configForArea(defaultConfig("existing"), 150).config);
  ok(resized.params.beamDepth !== 450 || resized.params.columnSize !== 300, "a resized building has its structure sized to the longer spans");
}

// ---------------------------------------------------------------------------
// 5. What cannot be built is said, not drawn
// ---------------------------------------------------------------------------
{
  const clamped = normalizeConfig({ template: "modern-house", length: 5000, width: 99999, floors: 9, floorToFloor: 100 });
  equal([clamped.config.length, clamped.config.width, clamped.config.floors, clamped.config.floorToFloor], [10000, 18000, 3, 2800], "values outside the template are brought to its limits");
  ok(clamped.issues.length >= 3 && clamped.issues.every((i) => i.message.length > 20), `and each one is explained (${clamped.issues.length})`);
  equal(normalizeConfig({ template: "g-plus-2", floors: 2 }).config.floors, 3, "a G+2 building has three floors");
  ok(normalizeConfig({ template: "g-plus-2", floors: 2 }).issues.some((i) => i.field === "floors"), "and says so when asked for two");
  equal(normalizeConfig({ template: "modern-villa", floors: 1 }).config.floors, 2, "a villa has at least two");
  equal(normalizeConfig({ template: "existing", length: Number.NaN, width: undefined }).config.length, 12000, "a length that is not a number falls back to the template's");

  // Column lines typed by hand: the Existing Building only.
  const hand = normalizeConfig({ template: "existing", gridX: [0, 3500, 7000, 9400, 11000], gridY: [0, 4000, 8000] });
  equal([hand.config.length, hand.config.width], [11000, 8000], "column lines typed by hand decide the length and width");
  equal(hand.issues, [], "when they are valid");
  const handBuilt = buildBuilding({ template: "existing", gridX: [0, 3500, 7000, 9400, 11000], gridY: [0, 4000, 8000] });
  near(handBuilt.areas.footprint, 88, "and the area follows them: 11 m × 8 m");
  ok(normalizeConfig({ template: "existing", gridX: [0, 100, 200] }).issues.some((i) => i.field === "gridX"), "lines that do not make a grid are refused with a message");
  ok(normalizeConfig({ template: "modern-villa", gridX: [0, 3500, 7000, 9400, 11000] }).issues.some((i) => i.field === "gridX"), "and other templates lay out their own lines");
  equal(normalizeConfig({ template: "modern-villa", gridX: [0, 3500, 7000, 9400, 11000] }).config.gridX, undefined, "which are not replaced");
  equal(configForArea({ ...defaultConfig("existing"), gridX: [0, 3500, 7000, 9400, 11000] }, 150).config.gridX, undefined, "asking for an area gives the proportional grid back");

  // Roof area follows the roof that is shown.
  for (const c of cases) {
    const { building, model } = modelOf(c.config);
    const outline = building.project.slabs[0]!.boundary as P2[];
    const flat = roofAreaOf(outline, "flat");
    const pitched = roofAreaOf(outline, "pitched");
    const flatDrawn = model.components.find((x) => x.id === "roof:flat:membrane");
    const pitchedDrawn = model.components.find((x) => x.id === "roof:pitched:covering");
    ok(flatDrawn && pitchedDrawn, `${c.name}: both roofs are drawn`);
    near(flat.covering, flatDrawn!.quantities.find((q) => q.workItem === "waterproofing.roof-membrane")!.value!, `${c.name}: the flat roof area is the area of membrane drawn`, 0.01);
    near(pitched.covering, pitchedDrawn!.quantities.find((q) => q.workItem === "roof.covering")!.value!, `${c.name}: the pitched roof area is the area of covering drawn`, 0.01);
    near(areasOf(building.project, "pitched").roofArea, pitched.covering, `${c.name}: asking for the pitched roof gives its area`, 1e-9);
    near(areasOf(building.project, "flat").roofArea, flat.covering, `${c.name}: and for the flat roof its own`, 1e-9);
    ok(pitched.covering > pitched.plan, `${c.name}: the pitched roof is measured on the slope, so it is bigger than its plan`);
    // Worked out by hand: the covering overhangs the gables by OVERHANG and the eaves by OVERHANG beyond the wall plates, and is measured along the slope.
    const L = building.config.length; const W = building.config.width;
    near(pitched.plan, ((L + 2 * OVERHANG) * (W - 2 * PLATE + 2 * OVERHANG)) / 1e6, `${c.name}: the pitched roof in plan is the building plus its overhang`, 1e-9);
    near(pitched.covering, ((L + 2 * OVERHANG) * (W - 2 * PLATE + 2 * OVERHANG)) / 1e6 / Math.cos((PITCH_DEG * Math.PI) / 180), `${c.name}: and along the slope it is longer by the pitch`, 1e-9);
    near(flat.covering, ((L - 300) * (W - 300)) / 1e6, `${c.name}: the flat roof is the slab inside a 150 mm parapet`, 1e-9);
  }
  equal(buildBuilding({ template: "modern-villa" }).options.roofType, "pitched", "the Modern Villa starts with its pitched roof");
  equal(buildBuilding({ template: "modern-house" }).options.roofType, "flat", "and the Modern House with a flat one");
}

// ---------------------------------------------------------------------------
// 6. Every option, at every size, comes out a sound building
// ---------------------------------------------------------------------------
{
  for (const c of cases) {
    const { building, model, ms } = modelOf(c.config);
    const ctx = new Ctx(building.project, { ...DEFAULT_OPTIONS, ...building.options }, DEFAULT_RULES);
    const audit = auditServices(ctx, model, auditContextOf(ctx));
    ok(audit.floating.length === 0 && audit.collisions.length === 0, `${c.name}: no pipe or conduit floats or runs through another (${audit.floating.length}/${audit.collisions.length})`);
    equal(model.warnings.filter((w) => /^(Plumbing|Electrical):/.test(w)), [], `${c.name}: every pipe and conduit is placed`);
    ok(ms < 20000, `${c.name}: the model is built in ${ms} ms`);
  }
}

console.log(`Building configurator: ${checks} checks passed.`);
