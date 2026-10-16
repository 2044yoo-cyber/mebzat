/**
 * The roof in the construction model, both ways it can be built on the same roof slab.
 *
 * A pitched timber roof: plates on a raised heel, trusses whose rafters run on out over the eaves, a fascia across their ends and the gutter
 * hung from it, battens on the rafters, underlay and covering on the battens, barge boards up the edges, and blockwork gable walls closing the two ends.
 * A flat roof: a parapet on the very edge of the slab, flush with the frame under it, rendered and painted inside and out, with a coping.
 * Then the faces of the frame between the walls, rendered with them.
 *
 *   npx tsx scripts/construction_roof_check.ts
 *
 * Expected numbers are worked out here by hand from the outline of the building, the wall thickness, the frame and the pitch: the area of a gable from its
 * corners, how far a rafter reaches, how high it is over the edge of the slab, the length of the parapet and the area of render on it. Where the roof is
 * a stack of layers, each is tested against the one under it, measured off the shapes in the model rather than off the numbers the generator used.
 */
import assert from "node:assert/strict";

import { BUILDING_TEMPLATES, buildBuilding, configForArea, defaultConfig, type BuiltBuilding } from "../src/features/house-designer/construction/building-config";
import { ASSUME } from "../src/features/house-designer/construction/context";
import type { Shape } from "../src/features/house-designer/construction/geometry";
import { buildConstructionModel } from "../src/features/house-designer/construction/model";
import { parapetHeightOf } from "../src/features/house-designer/construction/roof-geometry";
import { routeSegments } from "../src/features/house-designer/construction/service-audit";
import { DEFAULT_OPTIONS, DEFAULT_RULES, type ComponentRecord, type ConstructionModel } from "../src/features/house-designer/construction/types";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };
const near = (actual: number, expected: number, message: string, tolerance = 1e-6) => { assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} is not ${expected} (±${tolerance})`); checks += 1; };

type Box = Extract<Shape, { t: "box" }>;
type Prism = Extract<Shape, { t: "prism" }>;
type Profile = Extract<Shape, { t: "profile" }>;

const THETA = (25 * Math.PI) / 180;
const TAN = Math.tan(THETA);
const COS = Math.cos(THETA);
/** The top of a rafter above the top of its plate at the bearing: half its 100 mm depth to its centre line, and half again along the slope. */
const RAFTER_TOP = 50 + 50 / COS;
const modelOf = (building: BuiltBuilding): ConstructionModel => buildConstructionModel(building.project, { ...DEFAULT_OPTIONS, ...building.options }, DEFAULT_RULES);
const quantity = (c: ComponentRecord, workItem: string) => c.quantities.find((q) => q.workItem === workItem)!;
const boxes = (c: ComponentRecord) => c.shapes as Box[];
const bounds = (poly: { x: number; y: number }[]) => [Math.min(...poly.map((p) => p.x)), Math.max(...poly.map((p) => p.x)), Math.min(...poly.map((p) => p.y)), Math.max(...poly.map((p) => p.y))];

const sizes = BUILDING_TEMPLATES.flatMap((template) => [
  { name: `${template} at its example size`, template, building: buildBuilding(defaultConfig(template)) },
  { name: `${template} at 200 m² a floor`, template, building: buildBuilding(configForArea(defaultConfig(template), 200).config) },
]);

// ---------------------------------------------------------------------------
// The options
// ---------------------------------------------------------------------------
{
  equal(parapetHeightOf({}), ASSUME.parapetHeight, "without a height of its own, a parapet is the example 600 mm");
  equal(parapetHeightOf({ parapetHeight: 0 }), ASSUME.parapetHeight, "and a height of nothing is not a height");
  equal(parapetHeightOf({ parapetHeight: -300 }), ASSUME.parapetHeight, "nor is a negative one");
  equal(parapetHeightOf({ parapetHeight: 900 }), 900, "a height the building has is used");
  equal(buildBuilding({ template: "modern-house" }).options.parapetHeight, 900, "the Modern House says its parapet is 900 mm");
  equal(buildBuilding({ template: "g-plus-2" }).options.parapetHeight, 900, "and so does the G+2 Building");
  equal(buildBuilding({ template: "existing" }).options.parapetHeight, undefined, "the Existing Building leaves it to the example, as it always has");
  equal(buildBuilding({ template: "modern-villa" }).options.parapetHeight, undefined, "and the villa, whose roof is pitched, has none");
}

for (const { name, template, building } of sizes) {
  const { project } = building;
  const model = modelOf(building);
  const byId = (id: string) => model.components.find((c) => c.id === id);
  const get = (id: string) => { const c = byId(id); assert.ok(c, `${name}: ${id} is in the model`); return c!; };
  const corners = project.levels[0]!.plan!.corners;
  const [minX, maxX, minY, maxY] = bounds(corners);
  const L = maxX! - minX!; const W = maxY! - minY!;
  const roof = project.roofs[0]!;
  const slabTop = roof.elevation + roof.thickness;
  const topLevel = project.levels[project.levels.length - 1]!;
  // An exterior wall lies along an edge of the outline: both its ends are on the same side.
  const onSide = (w: { start: { x: number; y: number }; end: { x: number; y: number } }) => (w.start.x === w.end.x && (w.start.x === minX || w.start.x === maxX)) || (w.start.y === w.end.y && (w.start.y === minY || w.start.y === maxY));
  const wallT = project.walls.find((w) => w.levelId === topLevel.id && onSide(w))!.thickness;
  // The slab is cast out to half the widest member of the top storey, and the roof's parapet stands on its edge.
  const topColumns = project.structuralColumns.filter((c) => c.levelId === topLevel.id);
  const topBeams = project.structuralBeams.filter((b) => b.levelId === topLevel.id);
  const half = Math.max(...topColumns.map((c) => Math.max(c.width, c.depth) / 2), ...topBeams.map((b) => b.width / 2));

  // =========================================================================
  // The pitched roof
  // =========================================================================
  {
    const spanY = W - 200;
    const halfSpan = spanY / 2;
    const plateTop = slabTop + 200;
    const yS = minY! + 100; const yN = maxY! - 100;
    const ridgeY = (minY! + maxY!) / 2;
    const rafterLen = (halfSpan + 370) / COS;

    // --- The gable walls ---------------------------------------------------------------------------------------
    const gables = get("roof:pitched:gables");
    equal([gables.kind, gables.stage, gables.category, gables.layer, gables.variant], ["gable-wall", 8, "masonry", "masonry", { group: "roof", value: "pitched" }], `${name}: the gables are blockwork, built with the pitched roof and shown only with it`);
    const walls = gables.shapes as Profile[];
    equal(walls.map((w) => w.t), ["profile", "profile"], `${name}: one at each end`);
    equal(walls.map((w) => Math.round(w.origin.x)).sort((a, b) => a - b), [minX!, maxX!].map(Math.round), `${name}: on the outline at each end, over the end beam`);
    ok(walls.every((w) => w.thickness === wallT && w.dir.x === 0 && w.dir.y === 1), `${name}: as thick as the walls under them, running across the building`);
    const h0 = 200 + RAFTER_TOP - (100 + wallT / 2) * TAN;
    const h1 = 200 + RAFTER_TOP + halfSpan * TAN;
    const width = W + wallT;
    const oneArea = width * h0 + 0.5 * width * (h1 - h0);
    const poly = walls[0]!.poly;
    equal(poly.length, 5, `${name}: a gable has five corners: two on the slab, two at the eaves and the apex`);
    near(poly[0]!.z, slabTop, `${name}: it stands on the roof slab`);
    near(poly[0]!.s, -(100 + wallT / 2), `${name}: from the outer face of the south eaves wall`, 1e-6);
    near(poly[1]!.s, spanY + 100 + wallT / 2, `${name}: to the outer face of the north one: the whole width of the building, ${W + wallT} mm`, 1e-6);
    near(poly[3]!.z, slabTop + h1, `${name}: the apex is at the top of the rafters at the ridge, ${h1.toFixed(0)} mm over the slab`, 1e-6);
    near(poly[3]!.s, halfSpan, `${name}: in the middle`, 1e-6);
    near(poly[4]!.z, slabTop + h0, `${name}: and ${h0.toFixed(0)} mm over it at the eaves`, 1e-6);
    near(quantity(gables, "masonry.gable").value!, Math.round(2 * oneArea * 1e-6 * 1e3) / 1e3, `${name}: the area of the two is worked out from the corners: ${(2 * oneArea * 1e-6).toFixed(2)} m²`, 1e-3);
    near(quantity(gables, "masonry.blocks").value!, Math.round(2 * oneArea * 1e-6 * 12.5 * 10) / 10, `${name}: with 12.5 blocks to the square metre`, 0.2);
    equal(quantity(gables, "masonry.gable").status, "calculated", `${name}: a figure measured off the outline`);

    // --- The plates and the trusses ---------------------------------------------------------------------------------------------------
    const plates = get("roof:pitched:plates");
    const plateBoxes = boxes(plates);
    ok(plateBoxes.every((p) => Math.abs(p.c.z - p.s.z / 2 - slabTop) < 1e-6 && Math.abs(p.s.z - 200) < 1e-6), `${name}: the plates stand on the slab, 200 mm high`);
    ok(plateBoxes.every((p) => Math.abs(p.c.x - p.s.x / 2 - (minX! + wallT / 2)) < 1e-6 && Math.abs(p.c.x + p.s.x / 2 - (maxX! - wallT / 2)) < 1e-6), `${name}: and run between the gable walls`);
    near(quantity(plates, "roof.wall-plate").value!, Math.round(((2 * (L - wallT)) / 1000) * 1e3) / 1e3, `${name}: two of them, ${(L - wallT) / 1000} m between the gable walls`, 1e-3);
    const trusses = get("roof:pitched:trusses");
    const members = boxes(trusses);
    ok(members.every((m) => m.c.x - m.s.x / 2 >= minX! + wallT / 2 - 1e-6 && m.c.x + m.s.x / 2 <= maxX! - wallT / 2 + 1e-6), `${name}: every truss stands between the gable walls and none is built into one`);
    near(Math.min(...members.map((m) => m.c.x - m.s.x / 2)), minX! + wallT / 2, `${name}: the first against the inner face of the west gable`, 1e-6);
    near(Math.max(...members.map((m) => m.c.x + m.s.x / 2)), maxX! - wallT / 2, `${name}: and the last against the inner face of the east one`, 1e-6);
    const xs = [...new Set(members.map((m) => Math.round(m.c.x * 100) / 100))].sort((a, b) => a - b);
    ok(xs.every((x, i) => i === 0 || x - xs[i - 1]! <= 900 + 1e-6), `${name}: trusses no more than 900 mm apart (${xs.length})`);
    equal(quantity(trusses, "roof.truss").value, xs.length, `${name}: counted as they stand`);

    // --- The rafters run out to the eaves and clear the edge of the slab ----------------------------------------------------------------
    const first = xs[0]!;
    const rafters = members.filter((m) => Math.abs(m.c.x - first) < 0.01 && Math.abs(Math.abs(m.rx ?? 0) - THETA) < 1e-9);
    equal(rafters.length, 2, `${name}: a rafter down each slope of the end truss`);
    const south = rafters.find((r) => (r.rx ?? 0) > 0)!;
    const north = rafters.find((r) => (r.rx ?? 0) < 0)!;
    near(south.s.y, rafterLen, `${name}: each is ${rafterLen.toFixed(0)} mm long: from the ridge out to 370 mm past the plate, along the slope`, 1e-6);
    near(south.c.y - (south.s.y / 2) * COS, yS - 370, `${name}: the south rafter ends 370 mm out from its plate, short of the eaves tip by the fascia's set-back`, 1e-6);
    near(south.c.y + (south.s.y / 2) * COS, ridgeY, `${name}: and meets the other at the ridge`, 1e-6);
    near(north.c.y + (north.s.y / 2) * COS, yN + 370, `${name}: the north rafter ends 370 mm out from its plate`, 1e-6);
    // Height of the centre line of a rafter at y, and of its top and underside.
    const line = (r: Box, y: number) => r.c.z + (y - r.c.y) * (r.rx! > 0 ? TAN : -TAN);
    const topOf = (r: Box, y: number) => line(r, y) + 50 / COS;
    const underOf = (r: Box, y: number) => line(r, y) - 50 / COS;
    near(topOf(south, yS), plateTop + RAFTER_TOP, `${name}: at the plate the top of a rafter is ${RAFTER_TOP.toFixed(1)} mm over it`, 1e-6);
    // The slab as cast ends `half` outside the outline; the rafter, running on out, must be clear of its top there.
    near(underOf(south, minY! - half) - slabTop, 200 + 50 - 50 / COS - (100 + half) * TAN, `${name}: over the edge of the slab the underside of a rafter is as high as the heel and the slope make it`, 1e-6);
    ok(underOf(south, minY! - half) > slabTop + 10 && underOf(north, maxY! + half) > slabTop + 10, `${name}: clear of the top of the slab at both eaves (${(underOf(south, minY! - half) - slabTop).toFixed(0)} mm)`);

    // --- The gable's top edge is the top of the rafters ---------------------------------------------------------------------------------
    const gableTopAt = (y: number): number => {
      // The edge between the eaves corner and the apex, on the south side (s < spanY / 2).
      const s = y - yS;
      const a = poly[4]!; const apex = poly[3]!;
      return a.z + ((apex.z - a.z) * (s - a.s)) / (apex.s - a.s);
    };
    for (const y of [yS + 500, yS + 2000, ridgeY - 1000]) near(gableTopAt(y), topOf(south, y), `${name}: at y = ${Math.round(y)} the wall comes up to the top of the rafter`, 1e-6);

    // --- Battens, underlay and covering, each on the one under it ----------------------------------------------------------------------
    const battens = get("roof:pitched:battens");
    const rows = Math.max(1, Math.floor((rafterLen - 100) / 350));
    equal(battens.shapes.length, 2 * (rows + 1), `${name}: ${rows + 1} battens on each slope, about 350 mm apart`);
    const coverX = L + 900;
    ok(boxes(battens).every((bt) => Math.abs(bt.s.x - (coverX - 50)) < 1e-6 && Math.abs(bt.c.x - (minX! + maxX!) / 2) < 1e-6), `${name}: each runs the whole length of the roof, from one barge board to the other`);
    ok(boxes(battens).every((bt) => Math.abs(bt.c.z - (topOf(bt.c.y < ridgeY ? south : north, bt.c.y) + 12.5 / COS)) < 0.5), `${name}: every batten lies on the top of the rafters`);
    ok(boxes(battens).filter((bt) => bt.c.y < ridgeY).every((bt) => bt.c.y > yS - 370 && bt.c.y < ridgeY), `${name}: the battens on the south slope run from the ends of the rafters to the ridge`);
    const lowestSouth = Math.min(...boxes(battens).map((bt) => bt.c.y));
    ok(lowestSouth < yS - 300, `${name}: and the first is out over the eaves, on the rafter tails (${Math.round(lowestSouth - yS)} mm from the plate)`);
    const underlay = boxes(get("roof:pitched:underlay")); const covering = boxes(get("roof:pitched:covering"));
    const face = (s: Box, y: number, sign: 1 | -1) => s.c.z + (y - s.c.y) * (s.rx! > 0 ? TAN : -TAN) + (sign * s.s.z) / (2 * COS);
    const tipY = yS - 450;
    const battenTop = (y: number) => topOf(south, y) + 25 / COS;
    const southUnder = underlay.find((s) => (s.rx ?? 0) > 0)!; const southCover = covering.find((s) => (s.rx ?? 0) > 0)!;
    for (const y of [tipY + 50, yS, ridgeY - 100]) {
      near(face(southUnder, y, -1), battenTop(y), `${name}: the underlay lies on the battens at y = ${Math.round(y)}`, 1);
      near(face(southCover, y, -1), face(southUnder, y, 1), `${name}: and the covering on the underlay`, 1);
    }
    near(southCover.c.y - (southCover.s.y / 2) * COS, tipY, `${name}: the covering runs ${450} mm out from the plate line, on over the fascia`, 1e-6);
    near(southCover.c.y + (southCover.s.y / 2) * COS, ridgeY, `${name}: and up to the ridge`, 1e-6);
    near(southCover.s.x, coverX, `${name}: it overhangs each gable by 450 mm`, 1e-6);

    // --- The fascia and the gutter ---------------------------------------------------------------------------------------------------------
    const fascia = get("roof:pitched:fascia");
    const fasciaBoxes = boxes(fascia);
    equal(fasciaBoxes.length, 2, `${name}: a fascia board along each eaves`);
    ok(fasciaBoxes.every((f) => Math.abs(f.s.x - (coverX - 50)) < 1e-6 && f.s.y === 25 && f.s.z === 150), `${name}: 25 × 150 mm, nearly the whole length of the roof`);
    const fSouth = fasciaBoxes.find((f) => f.c.y < ridgeY)!;
    near(fSouth.c.y + 12.5, yS - 370, `${name}: its inner face is against the ends of the rafters`, 1e-6);
    near(fSouth.c.z + 75, battenTop(yS - 370), `${name}: and its top is level with the top of the battens`, 0.6);
    const gutter = get("roof:pitched:gutters"); const gSouth = boxes(gutter).find((g) => g.c.y < ridgeY)!;
    near(gSouth.c.y + gSouth.s.y / 2, fSouth.c.y - 12.5, `${name}: the gutter is fixed to the outside of it`, 1e-6);
    ok(gSouth.c.z + gSouth.s.z / 2 <= face(southUnder, tipY, -1) + 1e-6 && gSouth.c.z + gSouth.s.z / 2 >= face(southUnder, tipY, -1) - 30, `${name}: and hangs just under the lower edge of the covering, ${(face(southUnder, tipY, -1) - (gSouth.c.z + gSouth.s.z / 2)).toFixed(0)} mm`);
    near(quantity(fascia, "roof.fascia").value!, Math.round(((2 * (coverX - 50)) / 1000) * 1e3) / 1e3, `${name}: fascia by the metre, two lengths`, 1e-3);
    const barge = get("roof:pitched:barge");
    equal(barge.shapes.length, 4, `${name}: barge boards, two up each gable`);
    ok(boxes(barge).every((bb) => bb.s.x === 25 && bb.s.z === 150 && Math.abs(bb.s.y - rafterLen) < 1e-6), `${name}: 25 × 150 mm, each the length of a rafter, ${rafterLen.toFixed(0)} mm`);
    equal(boxes(barge).map((bb) => Math.round(bb.c.x)).sort((a, b) => a - b), [minX! - 450 + 12.5, minX! - 450 + 12.5, maxX! + 450 - 12.5, maxX! + 450 - 12.5].map(Math.round), `${name}: at the two edges of the covering`);
    near(quantity(barge, "roof.barge").value!, Math.round(((4 * rafterLen) / 1000) * 1e3) / 1e3, `${name}: barge board by the metre, four lengths`, 1e-3);
    const boardLength = 2 * (coverX - 50) + 4 * rafterLen;
    near(quantity(fascia, "paint.timber-external").value!, Math.round(boardLength * 0.325 * 1e-3 * 1e3) / 1e3, `${name}: and the paint on them, both faces and the edge: 325 mm of girth`, 1e-3);

    // --- The render and the paint on the gables --------------------------------------------------------------------------------------------
    const coatThickness: Record<string, number> = { base: ASSUME.plasterBase, final: ASSUME.plasterFinal + ASSUME.externalPlasterExtra, paint: ASSUME.paint };
    let before = 0;
    for (const coat of ["base", "final", "paint"] as const) {
      const c = get(`ext:gable:${coat}`);
      equal([c.stage, c.parentId, c.variant], [18, "roof:pitched:gables", { group: "roof", value: "pitched" }], `${name}: the ${coat} coat on the gables is put on at stage 18 and goes with the pitched roof`);
      const skins = c.shapes as Profile[];
      const t = coatThickness[coat]!;
      equal(skins.map((s) => Math.round((s.origin.x - (s.origin.x < (minX! + maxX!) / 2 ? minX! : maxX!)) * 100) / 100).sort((a, b) => a - b), [-(wallT / 2 + before + t / 2), wallT / 2 + before + t / 2].map((v) => Math.round(v * 100) / 100), `${name}: ${coat}: outside the face of each gable, on the coats under it`);
      ok(skins.every((s) => Math.abs(s.thickness - t) < 1e-9), `${name}: ${coat}: ${t} mm thick`);
      near(c.quantities[0]!.value!, Math.round(2 * oneArea * 1e-6 * 1e3) / 1e3, `${name}: ${coat}: the outer faces of the two gables`, 1e-3);
      before += t;
    }
  }

  // =========================================================================
  // The flat roof
  // =========================================================================
  {
    const ph = template === "modern-house" || template === "g-plus-2" ? 900 : 600;
    const parapet = get("roof:flat:parapet");
    const solid = parapet.shapes[0] as Prism;
    equal([solid.z0, solid.z1 - solid.z0], [slabTop, ph], `${name}: the parapet stands on the roof slab and is ${ph} mm high`);
    equal(bounds(solid.poly).map(Math.round), [minX! - half, maxX! + half, minY! - half, maxY! + half].map(Math.round), `${name}: its outer face is the edge of the slab as cast, ${half} mm out from the outline, flush with the frame under it`);
    equal(bounds(solid.holes![0]!).map(Math.round), [minX! - half + 150, maxX! + half - 150, minY! - half + 150, maxY! + half - 150].map(Math.round), `${name}: 150 mm thick`);
    const innerL = L + 2 * half - 300; const innerW = W + 2 * half - 300;
    const centreLength = 2 * ((L + 2 * half - 150) + (W + 2 * half - 150));
    near(quantity(parapet, "masonry.parapet").value!, Math.round(centreLength * ph * 1e-6 * 1e3) / 1e3, `${name}: its blockwork is the length of its centre line, ${(centreLength / 1000).toFixed(2)} m, times its height`, 1e-3);
    const membrane = get("roof:flat:membrane");
    near(quantity(membrane, "waterproofing.roof-membrane").value!, Math.round(innerL * innerW * 1e-6 * 1e3) / 1e3, `${name}: the roof surface is what is inside the parapet: ${(innerL / 1000).toFixed(2)} m × ${(innerW / 1000).toFixed(2)} m`, 1e-3);
    const coping = get("roof:flat:coping");
    const cap = coping.shapes[0] as Prism;
    equal(bounds(cap.poly).map(Math.round), [minX! - half - 25, maxX! + half + 25, minY! - half - 25, maxY! + half + 25].map(Math.round), `${name}: the coping overhangs the outside face by 25 mm`);
    equal(bounds(cap.holes![0]!).map(Math.round), [minX! - half + 175, maxX! + half - 175, minY! - half + 175, maxY! + half - 175].map(Math.round), `${name}: and the inside face by the same`);
    equal([cap.z0, cap.z1 - cap.z0], [slabTop + ph, 40], `${name}: 40 mm thick, on top of the parapet`);
    near(quantity(coping, "roof.coping").value!, Math.round(centreLength * 1e-3 * 1e3) / 1e3, `${name}: and counted along the centre line`, 1e-3);

    // No pipe or conduit is run through the parapet (the rainwater scuppers are holes made for the purpose): the rising main to the tank goes over the top of it.
    const insidePoly = (poly: { x: number; y: number }[], x: number, y: number) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) { const a = poly[i]!; const b = poly[j]!; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside; } return inside; };
    const offenders: string[] = [];
    let overParapet = 0;
    for (const seg of routeSegments(model)) {
      if (seg.componentId.startsWith("plumb:rain:flat")) continue;
      const length = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y, seg.b.z - seg.a.z);
      for (let k = 0; k <= Math.ceil(length / 25); k += 1) {
        const f = k / Math.max(1, Math.ceil(length / 25));
        const x = seg.a.x + (seg.b.x - seg.a.x) * f; const y = seg.a.y + (seg.b.y - seg.a.y) * f; const z = seg.a.z + (seg.b.z - seg.a.z) * f;
        const inBand = insidePoly(solid.poly, x, y) && !insidePoly(solid.holes![0]!, x, y);
        if (inBand && z - seg.r < slabTop + ph && z + seg.r > slabTop) { offenders.push(`${seg.componentId} at (${Math.round(x)}, ${Math.round(y)}, ${Math.round(z)})`); break; }
        if (inBand && z - seg.r >= slabTop + ph) overParapet += 1;
      }
    }
    equal(offenders.slice(0, 3), [], `${name}: no pipe or conduit is run through the parapet`);
    if (byId("plumb:upfeed")) ok(overParapet > 0, `${name}: the rising main to the tank crosses the parapet over the top of it (${overParapet} points)`);

    // The parapet's faces: outside from the slab up, inside from above the membrane's upstand.
    const membraneTop = (membrane.shapes[0] as Prism).z1;
    const upstand = get("roof:flat:upstand").dims.height!.value!;
    const innerH = slabTop + ph - (membraneTop + upstand);
    const outerPerimeter = 2 * (L + 2 * half + W + 2 * half);
    const innerPerimeter = 2 * (innerL + innerW);
    const faces = (outerPerimeter * ph + innerPerimeter * innerH) * 1e-6;
    let before = 0;
    for (const coat of ["base", "final", "paint"] as const) {
      const c = get(`ext:parapet:${coat}`);
      equal([c.stage, c.parentId, c.variant, c.category], [18, "roof:flat:parapet", { group: "roof", value: "flat" }, "external"], `${name}: the ${coat} coat on the parapet is put on at stage 18 and goes with the flat roof`);
      near(c.quantities[0]!.value!, Math.round(faces * 1e3) / 1e3, `${name}: ${coat}: the outer face ${(outerPerimeter / 1000).toFixed(2)} m × ${ph} mm and the inner face ${(innerPerimeter / 1000).toFixed(2)} m × ${innerH.toFixed(0)} mm above the ${upstand} mm upstand = ${faces.toFixed(2)} m²`, 1e-3);
      const t = { base: ASSUME.plasterBase, final: ASSUME.plasterFinal + ASSUME.externalPlasterExtra, paint: ASSUME.paint }[coat];
      const skins = c.shapes as Box[];
      const outside = skins.filter((s) => s.c.z - s.s.z / 2 < slabTop + 1 && Math.abs(s.s.z - ph) < 1e-6);
      equal(outside.length, 4, `${name}: ${coat}: four skins on the outside face, one on each side of the parapet`);
      const front = outside.find((s) => Math.abs(s.rz ?? 0) < 1e-9 && s.c.y < (minY! + maxY!) / 2)!;
      near(front.c.y, minY! - half - before - t / 2, `${name}: ${coat}: lying on the coats under it, outside the face of the parapet`, 1e-6);
      equal(skins.length - outside.length, 4, `${name}: ${coat}: and four on the inside face`);
      before += t;
    }
  }

  // =========================================================================
  // The frame between the walls, rendered with them
  // =========================================================================
  {
    const level = building.project.levels[0]!;
    const second = building.project.levels[1]!;
    const slabOver = project.slabs.find((s) => s.levelId === second.id)!.thickness;
    const soffit = second.elevation - slabOver;
    const columns = project.structuralColumns.filter((c) => c.levelId === level.id);
    const beams = project.structuralBeams.filter((b) => b.levelId === level.id);
    const beamBottom = soffit - Math.max(...beams.map((b) => b.depth));
    const frameHalf = Math.max(...columns.map((c) => Math.max(c.width, c.depth) / 2), ...beams.map((b) => b.width / 2));
    const final = get("ext:0:final");
    const skins = final.shapes as Box[];
    const t = ASSUME.plasterFinal + ASSUME.externalPlasterExtra;
    const plane = frameHalf + ASSUME.plasterBase + t / 2;
    // The band of beam and slab edge: boxes on the four planes of the cast outline, from the underside of the beams to the floor over.
    const band = skins.filter((s) => Math.abs(s.c.z - s.s.z / 2 - beamBottom) < 1e-6);
    ok(band.length >= 4, `${name}: ground floor: the band of beam and slab edge is rendered on all four sides (${band.length} pieces)`);
    ok(band.every((s) => s.c.z + s.s.z / 2 <= second.elevation + 1e-6), `${name}: ground floor: up to the floor over and no further`);
    const onSouth = band.filter((s) => Math.abs(s.c.y - (minY! - plane)) < 1e-6 && Math.abs(s.rz ?? 0) < 1e-9);
    const onNorth = band.filter((s) => Math.abs(s.c.y - (maxY! + plane)) < 1e-6 && Math.abs(s.rz ?? 0) < 1e-9);
    const onWest = band.filter((s) => Math.abs(s.c.x - (minX! - plane)) < 1e-6);
    const onEast = band.filter((s) => Math.abs(s.c.x - (maxX! + plane)) < 1e-6);
    ok(onSouth.length >= 1 && onNorth.length >= 1 && onWest.length === 1 && onEast.length === 1, `${name}: ground floor: ${frameHalf} mm out from the outline, on the face of the frame (south ${onSouth.length}, north ${onNorth.length}, west ${onWest.length}, east ${onEast.length})`);
    const around = (side: Box[]) => side.reduce((sum, s) => sum + s.s.x, 0);
    // Under a balcony the band is not exposed: the balcony slab carries on from the floor slab. The beam below the balcony's soffit is.
    const balconies = project.balconies.filter((b) => b.levelId === second.id);
    near(around(onNorth), W === 0 ? 0 : L + 2 * frameHalf, `${name}: ground floor: the back is rendered all along: ${L + 2 * frameHalf} mm`, 1e-6);
    const widths = balconies.reduce((sum, b) => sum + b.width, 0);
    const bandFront = onSouth.filter((s) => s.c.z + s.s.z / 2 > second.elevation - 1);
    near(around(bandFront), L + 2 * frameHalf - widths, `${name}: ground floor: and the front all along less the ${balconies.length} balcon${balconies.length === 1 ? "y" : "ies"} (${widths} mm): ${L + 2 * frameHalf - widths} mm`, 1e-6);
    for (const b of balconies) {
      const x0 = b.x - b.width / 2; const x1 = b.x + b.width / 2;
      ok(!bandFront.some((s) => s.c.x + s.s.x / 2 > x0 + 1 && s.c.x - s.s.x / 2 < x1 - 1), `${name}: ground floor: no skin on the slab edge where the balcony at ${x0}–${x1} is carried out`);
      const under = onSouth.filter((s) => s.c.z + s.s.z / 2 <= second.elevation - b.thickness + 1e-6 && s.c.z + s.s.z / 2 > beamBottom + 1);
      ok(under.some((s) => s.c.x - s.s.x / 2 <= x0 + 1 && s.c.x + s.s.x / 2 >= x1 - 1), `${name}: ground floor: but the beam below its soffit is rendered (to ${second.elevation - b.thickness})`);
    }
    // The column faces: one for each outer face of each column on the outline, from the floor to the beams.
    const edges = (c: { x: number; y: number }) => [Math.abs(c.x - minX!) < 1, Math.abs(c.x - maxX!) < 1, Math.abs(c.y - minY!) < 1, Math.abs(c.y - maxY!) < 1].filter(Boolean).length;
    const expectedFaces = columns.reduce((sum, c) => sum + edges(c), 0);
    // (A box turned a quarter turn is stored with its sides swapped, so the thin side is s.y on the north and south faces and s.x on the east and west ones.)
    const faces = skins.filter((s) => Math.abs(s.c.z - s.s.z / 2 - level.elevation) < 1e-6 && Math.abs(s.c.z + s.s.z / 2 - beamBottom) < 1e-6 && (s.s.y === t || s.s.x === t));
    const columnFaces = faces.filter((s) => Math.max(s.s.x, s.s.y) <= Math.max(...columns.map((c) => Math.max(c.width, c.depth))) + 1e-6);
    equal(columnFaces.length, expectedFaces, `${name}: ground floor: a face on every outer side of every column on the outline: ${expectedFaces}`);
    ok(columnFaces.every((s) => s.c.z - s.s.z / 2 === level.elevation), `${name}: ground floor: from the floor`);
    // Each lies on the outside of its column, on the coat under it: the base coat is 12 mm and this one 10.
    const wanted = columns.flatMap((c) => [
      ...(Math.abs(c.y - minY!) < 1 ? [{ x: c.x, y: c.y - (c.depth / 2 + 12 + t / 2), along: c.width, vertical: false }] : []),
      ...(Math.abs(c.y - maxY!) < 1 ? [{ x: c.x, y: c.y + (c.depth / 2 + 12 + t / 2), along: c.width, vertical: false }] : []),
      ...(Math.abs(c.x - minX!) < 1 ? [{ x: c.x - (c.width / 2 + 12 + t / 2), y: c.y, along: c.depth, vertical: true }] : []),
      ...(Math.abs(c.x - maxX!) < 1 ? [{ x: c.x + (c.width / 2 + 12 + t / 2), y: c.y, along: c.depth, vertical: true }] : []),
    ]);
    ok(wanted.every((w) => columnFaces.some((s) => Math.abs(s.c.x - w.x) < 1e-6 && Math.abs(s.c.y - w.y) < 1e-6 && Math.abs((w.vertical ? s.s.y : s.s.x) - w.along) < 1e-6)), `${name}: ground floor: every face stands outside its column, ${12 + t / 2} mm off it (${wanted.length} faces)`);
  }
}

console.log(`Construction roof and frame faces: ${checks} checks passed.`);
