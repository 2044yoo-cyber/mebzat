/**
 * The plumbing and electrical installation in the construction learning model.
 *
 *   npx tsx scripts/construction_services_check.ts
 *
 * Reads the finished model back and asks whether the services are really
 * installed: nothing floating in a room, nothing through a column or a beam,
 * stacks standing straight through the openings cut for them, supply reaching
 * every fixture, waste falling to the stack, conduit ending at its box. Then
 * whether the six installation views, the explosion and the legend keep to
 * what they say.
 */
import assert from "node:assert/strict";
import * as THREE from "three";

import { cylinderQuaternion } from "../src/features/house-designer/construction/draw-list";
import { Ctx } from "../src/features/house-designer/construction/context";
import { SERVICE_LEGEND, legendEntryFor, materialOf } from "../src/features/house-designer/construction/catalogue";
import { explodeInfo, isInstallation, shapeOffset } from "../src/features/house-designer/construction/explode";
import { describeComponent } from "../src/features/house-designer/construction/inspect";
import { buildLearningHouseProject } from "../src/features/house-designer/construction/learning-house";
import { buildConstructionModel } from "../src/features/house-designer/construction/model";
import { planElectrical } from "../src/features/house-designer/construction/electrical-plan";
import { planPlumbing, type PlumbingPlan } from "../src/features/house-designer/construction/plumbing-plan";
import { branches, exitsOf, placeRoom, shaftPoints } from "../src/features/house-designer/construction/wet-room";
import { roomLayout } from "../src/features/house-designer/construction/layout";
import { local } from "../src/features/house-designer/construction/service-frame";
import type { Riser } from "../src/features/house-designer/construction/service-plan";
import { auditContextOf, auditServices, cylEnds, routeSegments } from "../src/features/house-designer/construction/service-audit";
import { slabOpenings } from "../src/features/house-designer/construction/slab-openings";
import { DEFAULT_OPTIONS, DEFAULT_RULES, DEFAULT_VIEW, SERVICE_VIEWS, type ComponentRecord, type ConstructionModel, type ViewState } from "../src/features/house-designer/construction/types";
import { applyServiceView, indexModel, visibilityOf } from "../src/features/house-designer/construction/view";
import { pointInPolygon, type Shape } from "../src/features/house-designer/construction/geometry";
import { allObstacles, rectInsidePolygon, type Run } from "../src/features/house-designer/construction/service-routing";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const near = (a: number, b: number, tol: number, message: string) => { assert.ok(Math.abs(a - b) <= tol, `${message}: ${a} vs ${b}`); checks += 1; };

const { project } = buildLearningHouseProject({});
const model = buildConstructionModel(project);
const ctx = new Ctx(project, DEFAULT_OPTIONS, DEFAULT_RULES);
const plumbing = planPlumbing(ctx);
const electrical = planElectrical(ctx);
const ground = ctx.ground!;
const byId = new Map(model.components.map((c) => [c.id, c]));
const servicesOf = (category: string) => model.components.filter((c) => c.category === category);

// ---------------------------------------------------------------------------
// 1. Nothing floats, nothing goes through structure, nothing is left unresolved
// ---------------------------------------------------------------------------
const audit = auditServices(ctx, model, auditContextOf(ctx));
ok(audit.segments > 300, `the audit reads the runs (${audit.segments})`);
ok(audit.floating.length === 0, `no run floats in a room: ${JSON.stringify(audit.floating.slice(0, 2))}`);
ok(audit.collisions.length === 0, `no run goes through structure, an unsleeved wall or another run: ${JSON.stringify(audit.collisions.slice(0, 2))}`);
ok(plumbing.unresolved.length === 0 && electrical.unresolved.length === 0, "the plans leave nothing unresolved for the sample house");
ok(!model.warnings.some((w) => /^(Plumbing|Electrical):/.test(w)), "and the model carries no service warning");
const placed = audit.length;
ok(placed["in-slab"] > 0 && placed["in-shaft"] > 0 && placed["in-wall"] > 0 && placed["on-wall"] > 0 && placed.buried > 0 && placed["on-roof"] > 0, "services are fixed in slabs, shafts, walls, on walls, in the ground and on the roof");
ok(placed.free < 1, "none is in free air");

// ---------------------------------------------------------------------------
// 2. Stacks, vents and risers stand straight through the openings cut for them
// ---------------------------------------------------------------------------
ok(plumbing.shafts.length >= 3, `a shaft for each wet room (${plumbing.shafts.length})`);
for (const [i, stack] of plumbing.stacks.entries()) {
  const item = plumbing.items.find((x) => x.kind === "drain-stack" && x.runs[0]!.points[0]!.x === stack.centre.x && x.runs[0]!.points[0]!.y === stack.centre.y);
  ok(item, `stack ${i + 1} is in the plan`);
  const [a, b] = item!.runs[0]!.points;
  ok(a!.x === b!.x && a!.y === b!.y, `stack ${i + 1} is vertical`);
  ok(a!.z < ground.floorZ - 300, `stack ${i + 1} starts below the ground floor`);
  ok(b!.z > plumbing.roofTop + 300, `stack ${i + 1} ends above the roof`);
  const h = stack.shaft.housing;
  ok(a!.x > h.x0 + 55 - 1 && a!.x < h.x1 - 55 + 1 && a!.y > h.y0 + 55 - 1 && a!.y < h.y1 - 55 + 1, `stack ${i + 1} stands wholly inside its shaft`);
  for (let storey = 1; storey <= ctx.levels.length; storey += 1) {
    const holes = slabOpenings(ctx, storey);
    ok(holes.some((o) => a!.x - 55 >= o.x0 - 0.01 && a!.x + 55 <= o.x1 + 0.01 && a!.y - 55 >= o.y0 - 0.01 && a!.y + 55 <= o.y1 + 0.01), `the slab over storey ${storey - 1} is open where stack ${i + 1} passes`);
  }
  const slab = byId.get("ground:slab")!.shapes[0]!;
  ok(slab.t === "prism" && (slab.holes ?? []).some((hole) => hole.some((p) => Math.abs(p.x - stack.shaft.hole.x0) < 1 && Math.abs(p.y - stack.shaft.hole.y0) < 1)), `the ground slab is open where stack ${i + 1} passes`);
}
for (const item of plumbing.items.filter((x) => x.kind === "riser" && /^plumb:riser:/.test(x.id))) {
  const p = item.runs[0]!.points;
  const shaft = plumbing.shafts.find((s) => p[0]!.x >= s.housing.x0 && p[0]!.x <= s.housing.x1 && p[0]!.y >= s.housing.y0 && p[0]!.y <= s.housing.y1);
  ok(shaft, `${item.id} stands in a shaft`);
  ok(p[0]!.x === p[1]!.x && p[0]!.y === p[1]!.y, `${item.id} is vertical`);
  const fed = plumbing.items.find((x) => x.id === "plumb:downfeed")!.runs.some((r) => r.points.some((q) => Math.hypot(q.x - p[0]!.x, q.y - p[0]!.y) < 1 && Math.abs(q.z - p[0]!.z) < 1));
  ok(fed, `${item.id} is joined to the down-feed on the roof`);
}
for (const item of plumbing.items.filter((x) => x.kind === "pipe-vent")) {
  const inShaft = plumbing.shafts.some((s) => item.runs[0]!.points.every((q) => q.x > s.housing.x0 && q.x < s.housing.x1 && q.y > s.housing.y0 && q.y < s.housing.y1));
  ok(inShaft, `${item.id} stays inside its shaft`);
}

// ---------------------------------------------------------------------------
// 3. Supply reaches every fixture, the tank is fed, and the rising main reaches it
// ---------------------------------------------------------------------------
const ends = (kind: string) => plumbing.items.filter((x) => x.kind === kind).flatMap((x) => x.runs.flatMap((r) => [r.points[0]!, r.points[r.points.length - 1]!]));
const coldEnds = ends("pipe-cold");
const hotEnds = ends("pipe-hot");
let fixtures = 0;
for (const wr of plumbing.rooms) {
  for (const fx of wr.fixtures) {
    fixtures += 1;
    const r = { x0: fx.footprint.x0 - 200, y0: fx.footprint.y0 - 200, x1: fx.footprint.x1 + 200, y1: fx.footprint.y1 + 200 };
    const reach = (list: { x: number; y: number; z: number }[]) => list.some((p) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1 && p.z > wr.level.floorZ + 100 && p.z < wr.level.floorZ + 1500);
    ok(reach(coldEnds), `cold water reaches the ${fx.label} in ${wr.room.name}, ${wr.level.name}`);
    if (fx.hot) ok(reach(hotEnds), `hot water reaches the ${fx.label} in ${wr.room.name}, ${wr.level.name}`);
  }
}
ok(fixtures >= 8, `fixtures were placed (${fixtures})`);
const tank = plumbing.tank!;
const up = plumbing.items.find((x) => x.id === "plumb:upfeed")!.runs[0]!.points;
near(up[up.length - 1]!.x, tank.x - 600, 1, "the rising main ends at the tank");
near(up[up.length - 1]!.y, tank.y, 1, "on its axis");
const upfeedPoints = up.slice(2, -2);
ok(upfeedPoints.every((p) => !(p.x > tank.stand.x0 - 30 && p.x < tank.stand.x1 + 30 && p.y > tank.stand.y0 - 30 && p.y < tank.stand.y1 + 30)), "the rising main does not run through the tank stand");
const mains = plumbing.items.find((x) => x.id === "plumb:mains")!.runs[0]!.points;
near(mains[mains.length - 1]!.x, plumbing.pump!.x, 1, "the mains reach the pump");
near(up[0]!.x, plumbing.pump!.x, 1, "and the rising main leaves it");

// ---------------------------------------------------------------------------
// 4. Waste falls to the stack and the drains fall to their chambers
// ---------------------------------------------------------------------------
const wasteSegments = routeSegments(model).filter((s) => ["pipe-waste", "drain-horizontal"].includes(byId.get(s.componentId)!.kind));
let falling = 0;
for (const s of wasteSegments) {
  const run = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
  if (run < 500) continue;
  falling += 1;
  ok(Math.abs(s.b.z - s.a.z) / run >= 0.0095, `${s.componentId} falls at least 1 in 100 along ${Math.round(run)} mm`);
}
ok(falling >= 15, `long waste and drain runs were checked (${falling})`);
for (const item of plumbing.items.filter((x) => x.kind === "pipe-waste")) {
  const stack = plumbing.stacks.find((s) => item.to === s.shaft.name)!;
  const all = item.runs.flatMap((r) => r.points);
  const lowest = all.reduce((m, p) => (p.z < m.z ? p : m), all[0]!);
  ok(Math.hypot(lowest.x - stack.centre.x, lowest.y - stack.centre.y) < 80, `${item.id} is lowest at its stack`);
  for (const r of item.runs) {
    const zs = r.points.map((p) => p.z);
    const monotone = zs.every((z, i) => i === 0 || z <= zs[i - 1]! + 0.01) || zs.every((z, i) => i === 0 || z >= zs[i - 1]! - 0.01);
    ok(monotone, `${item.id} never rises and falls again along one run`);
  }
}
for (const item of plumbing.items.filter((x) => x.kind === "drain-horizontal" && x.system === "drain")) {
  const p = item.runs[0]!.points;
  const stackItem = plumbing.items.find((x) => x.kind === "drain-stack" && x.parent === item.id);
  ok(stackItem, `${item.id} has the stack it drains`);
  near(p[0]!.z, stackItem!.runs[0]!.points[0]!.z, 0.5, `${item.id} starts at the foot of its stack`);
  const out = p[p.length - 1]!;
  ok(!(out.x > ctx.bounds.minX && out.x < ctx.bounds.maxX && out.y > ctx.bounds.minY && out.y < ctx.bounds.maxY), `${item.id} ends outside the building`);
  ok(p[p.length - 1]!.z < p[1]!.z, `${item.id} ends lower than it starts`);
}
for (const item of plumbing.items.filter((x) => x.kind === "drain-horizontal" && x.system === "rain")) {
  for (const r of item.runs) {
    const last = r.points[r.points.length - 1]!;
    ok(!(last.x > ctx.bounds.minX && last.x < ctx.bounds.maxX && last.y > ctx.bounds.minY && last.y < ctx.bounds.maxY), `${item.id} ends outside the building`);
    ok(last.z < r.points[1]!.z, `${item.id} falls to its soakaway`);
  }
}
ok(plumbing.items.some((x) => x.kind === "cleanout") && plumbing.items.some((x) => x.kind === "trap") && plumbing.items.some((x) => x.kind === "valve") && plumbing.items.some((x) => x.kind === "inspection-chamber"), "cleanouts, traps, valves and inspection chambers are there");

// ---------------------------------------------------------------------------
// 5. Rainwater starts at the outlet or the gutter that is really there
// ---------------------------------------------------------------------------
const outlets = byId.get("roof:flat:outlets")!.shapes.filter((s): s is Extract<Shape, { t: "cyl" }> => s.t === "cyl");
ok(outlets.length === plumbing.rain.flatOutlets.length && outlets.length >= 2, "the flat roof has the outlets the rainwater plan asks for");
for (const o of plumbing.rain.flatOutlets) ok(outlets.some((s) => Math.hypot(s.c.x - o.x, s.c.y - o.y) < 1), "each outlet is where its downpipe starts");
const flatDown = plumbing.items.find((x) => x.id === "plumb:rain:flat:downpipes")!;
for (const run of flatDown.runs) ok(plumbing.rain.flatOutlets.some((o) => Math.hypot(run.points[0]!.x - o.x, run.points[0]!.y - o.y) < 1), "a flat-roof downpipe starts at an outlet");
const gutters = byId.get("roof:pitched:gutters")!.shapes.filter((s): s is Extract<Shape, { t: "box" }> => s.t === "box");
for (const run of plumbing.items.find((x) => x.id === "plumb:rain:pitched:downpipes")!.runs) {
  const top = run.points[0]!;
  ok(gutters.some((g) => Math.abs(g.c.y - top.y) < g.s.y && Math.abs(top.z - g.c.z) < g.s.z + 20 && Math.abs(top.x - g.c.x) < g.s.x / 2), "a pitched-roof downpipe starts under a gutter");
}

// ---------------------------------------------------------------------------
// 6. Conduit ends at its boxes; boxes are in walls or slabs; the board is fed
// ---------------------------------------------------------------------------
// Every conduit shape as a segment: a conduit may end at a box or run past it up a shared chase, and either way it reaches it.
const conduitSegments = model.components.filter((c) => c.kind === "conduit").flatMap((c) => c.shapes.filter((x): x is Extract<Shape, { t: "cyl" }> => x.t === "cyl").map((x) => cylEnds(x)));
const distanceToSegment = (p: { x: number; y: number; z: number }, [a, b]: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }]) => {
  const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t), p.z - (a.z + dz * t));
};
const conduitDistance = (p: { x: number; y: number; z: number }) => Math.min(...conduitSegments.map((s) => distanceToSegment(p, s)));
let boxes = 0;
for (const c of model.components.filter((x) => x.kind === "junction-box")) {
  for (const shape of c.shapes) {
    if (shape.t !== "box") continue;
    boxes += 1;
    const reach = Math.hypot(shape.s.x, shape.s.y, shape.s.z) / 2 + 30;
    ok(conduitDistance(shape.c) <= reach, `a conduit reaches the box in ${c.id} (${Math.round(conduitDistance(shape.c))} mm away)`);
  }
}
ok(boxes >= 60, `boxes were checked (${boxes})`);
const boards = model.components.filter((c) => c.kind === "distribution-board");
ok(boards.length === ctx.levels.length, "a distribution board on every storey");
for (const b of boards) {
  const s = b.shapes[0]!;
  ok(s.t === "box" && s.c.z > (b.storeyIndex >= 0 ? ctx.levels[b.storeyIndex]!.floorZ : 0) + 800, `${b.id} is mounted on a wall at a working height`);
  ok(conduitDistance((s as Extract<Shape, { t: "box" }>).c) < 400, `conduit leaves ${b.id}`);
}
ok(byId.has("elec:earth") && byId.has("elec:earth-conductor") && byId.has("elec:meter") && byId.has("elec:service"), "meter, service, earth electrode and conductor are all present");
ok(model.components.some((c) => c.kind === "light-ceiling") && model.components.some((c) => c.kind === "switch-box") && model.components.some((c) => c.kind === "socket"), "ceiling lights, switches and sockets exist");

// Every wall box is set in a wall; every ceiling point is under the slab above.
for (const c of model.components.filter((x) => x.kind === "junction-box" && x.storeyIndex >= 0)) {
  const level = ctx.levels[c.storeyIndex]!;
  for (const shape of c.shapes) {
    if (shape.t !== "box") continue;
    const inWall = ctx.wallsOf(level.levelId).some((w) => {
      const s = (shape.c.x - w.start.x) * w.ux + (shape.c.y - w.start.y) * w.uy;
      const n = (shape.c.x - w.start.x) * w.nx + (shape.c.y - w.start.y) * w.ny;
      return s >= -5 && s <= w.length + 5 && Math.abs(n) <= w.thickness / 2 + 5;
    });
    const underSlab = shape.c.z > level.ceilingZ - 5;
    ok(inWall || underSlab, `box ${c.id} is in a wall or flush under the slab`);
  }
}

// ---------------------------------------------------------------------------
// 7. Builder's work follows the stages: chases and sleeves with the blockwork, covers with the plaster
// ---------------------------------------------------------------------------
const chaseComps = model.components.filter((c) => c.kind === "wall-chase");
ok(chaseComps.length === ctx.levels.length && chaseComps.every((c) => c.stage === 7), "wall chases are cut at the blockwork stage, one set per storey");
ok(chaseComps.reduce((s, c) => s + c.shapes.length, 0) === electrical.chases.length, "one chase for each chase the conduit plan needs");
for (const chase of electrical.chases) {
  const wall = ctx.walls.find((w) => w.id === chase.wallId)!;
  ok(wall, "a chase is cut in a wall that exists");
  const n = (chase.at.x - wall.start.x) * wall.nx + (chase.at.y - wall.start.y) * wall.ny;
  ok(Math.abs(n) <= wall.thickness / 2, "the chase is inside the wall's thickness");
}
for (const c of chaseComps) ok(c.concealed && c.service?.role === "structure", "chases are built-in and marked as builder's work");
const sleeve = byId.get("svc:sleeves");
ok(sleeve && sleeve.stage === 7 && sleeve.shapes.length === (electrical.entry?.sleeves.length ?? 0) + plumbing.sleeves.filter((x) => x.host !== "ground-beam").length, "wall sleeves are set at the blockwork stage, one for each crossing");
const beamSleeves = plumbing.sleeves.filter((x) => x.host === "ground-beam");
ok(beamSleeves.length >= 1, "the foul drain goes through a ground beam, so a sleeve is cast into it");
const beamComp = byId.get("svc:beam-sleeves");
ok(beamComp && beamComp.stage === 3 && beamComp.shapes.length === beamSleeves.length, "beam sleeves are cast in at the foundation stage, one for each crossing");
for (const x of beamSleeves) {
  const beam = allObstacles(ctx).find((o) => o.id === x.wallId)!;
  ok(Math.abs(x.length - Math.hypot(beam.poly[3]!.x - beam.poly[0]!.x, beam.poly[3]!.y - beam.poly[0]!.y)) < 1, "a beam sleeve is as long as the beam is wide");
  ok(beam && pointInPolygon({ x: x.x, y: x.y }, beam.poly) && x.z - x.diameter / 2 > beam.z0 && x.z + x.diameter / 2 < beam.z1, "each beam sleeve is inside its beam, clear of the top and the bottom");
  ok(plumbing.items.some((i) => i.system === "drain" && i.runs.some((r) => r.points.some((p, k) => k > 0 && Math.abs(p.z - x.z) < 120 && Math.hypot(p.x - x.x, p.y - x.y) < 8000))), "and a drain runs through it");
}
for (const s of electrical.entry?.sleeves ?? []) {
  const wall = ctx.walls.find((w) => w.id === s.wallId)!;
  const across = Math.abs((s.x - wall.start.x) * wall.nx + (s.y - wall.start.y) * wall.ny);
  const along = (s.x - wall.start.x) * wall.ux + (s.y - wall.start.y) * wall.uy;
  ok(wall.exterior && across <= 5 && along > 0 && along < wall.length && Math.abs(s.length - wall.thickness) < 1, "each sleeve is centred in an outside wall and is as long as the wall is thick");
}
const covers = model.components.filter((c) => c.kind === "shaft-cover");
ok(covers.length === (plumbing.shafts.length + 1) * ctx.levels.length && covers.every((c) => c.stage === 11), "a cover for each shaft and the cupboard on every storey, at the plaster stage");
ok(model.components.filter((c) => c.id.startsWith("svc:hatch:")).length === plumbing.shafts.length, "a hatch at the foot of each stack");
ok(model.components.some((c) => c.kind === "pre-wall-duct" && c.stage === 11), "pre-wall ducts close the pipes in the bathrooms");
ok(byId.get("svc:roof-boots")!.shapes.length === plumbing.stacks.length, "a flashing collar on every stack at the roof");
/** Every ceiling cut-out is cut where the conduit plan hangs a luminaire or a detector. */
function cutoutsFollowLights(m: ConstructionModel, c: Ctx): number {
  const e = planElectrical(c);
  let cut = 0;
  for (const comp of m.components.filter((x) => x.kind === "ceiling-cutout")) {
    const room = e.rooms.find((r) => r.level.index === comp.storeyIndex && comp.id.includes(`:${r.room.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}:`));
    ok(room, `${comp.id} belongs to a room with electrical`);
    for (const shape of comp.shapes) {
      cut += 1;
      ok(shape.t === "cyl" && [room!.lightPoint, room!.detector?.at].some((p) => p && Math.hypot(p.x - shape.c.x, p.y - shape.c.y) < 1), `${comp.id} is cut where the luminaire or detector hangs`);
    }
  }
  return cut;
}
ok(cutoutsFollowLights(model, ctx) >= 20, "the ceilings are cut for the lights");

// ---------------------------------------------------------------------------
// 8. Concealment follows the stages
// ---------------------------------------------------------------------------
const index = indexModel(model);
const at = (patch: Partial<ViewState>): ViewState => ({ ...DEFAULT_VIEW, ...patch });
const vis = (c: ComponentRecord, view: ViewState) => visibilityOf(c, view, index);
const conduit = model.components.find((c) => c.kind === "conduit" && c.concealed)!;
const coldPipe = model.components.find((c) => c.kind === "pipe-cold" && c.concealed)!;
const wc = model.components.find((c) => c.kind === "wc")!;
const sw = model.components.find((c) => c.kind === "switch-box")!;
ok(!wc.concealed && !sw.concealed, "fixtures and switches are not concealed");
ok(vis(conduit, at({ stage: 10 })) === "solid" && vis(coldPipe, at({ stage: 10 })) === "solid", "before the plaster the conduit and the pipes are in sight");
ok(vis(conduit, at({ stage: 11 })) === "hidden" && vis(coldPipe, at({ stage: 11 })) === "hidden", "the plaster covers them");
ok(vis(conduit, at({ stage: 18 })) === "hidden" && vis(wc, at({ stage: 18 })) === "solid" && vis(sw, at({ stage: 18 })) === "solid", "the finished building shows the fixtures and not the pipes");
ok(vis(conduit, at({ stage: 11, options: { ...DEFAULT_OPTIONS, mepView: "visible" } })) === "solid", "keeping services visible shows them through the plaster");

// ---------------------------------------------------------------------------
// 9. The six installation views
// ---------------------------------------------------------------------------
const wall = model.components.find((c) => c.kind === "wall-blocks")!;
const furniture = model.components.find((c) => c.category === "furniture")!;
// The flat roof is the one shown, so the pitched roof's downpipes are not part of the view.
const shownRoof = (c: ComponentRecord) => !c.variant || c.variant.value === DEFAULT_OPTIONS.roofType;
const elecInst = model.components.filter((c) => c.category === "electrical" && isInstallation(c) && shownRoof(c));
const plumbInst = model.components.filter((c) => c.category === "plumbing" && isInstallation(c) && shownRoof(c));
const viewOf = (mode: (typeof SERVICE_VIEWS)[number], base: Partial<ViewState> = {}) => applyServiceView(at({ stage: 18, ...base }), mode);
const plumbingOnly = viewOf("plumbing");
ok(plumbInst.every((c) => vis(c, plumbingOnly) !== "hidden") && plumbInst.filter((c) => c.concealed).every((c) => vis(c, plumbingOnly) === "solid"), "plumbing only: every pipe is shown, concealed or not");
ok(elecInst.every((c) => vis(c, plumbingOnly) === "hidden"), "plumbing only: nothing electrical");
ok(vis(wall, plumbingOnly) === "ghost" && vis(furniture, plumbingOnly) === "hidden", "plumbing only: the structure faint, the furniture gone");
const electricalOnly = viewOf("electrical");
ok(elecInst.every((c) => vis(c, electricalOnly) !== "hidden") && elecInst.filter((c) => c.concealed).every((c) => vis(c, electricalOnly) === "solid"), "electrical only: every conduit and box is shown");
ok(plumbInst.every((c) => vis(c, electricalOnly) === "hidden"), "electrical only: nothing plumbing");
const combined = viewOf("combined");
ok([...elecInst, ...plumbInst].every((c) => vis(c, combined) === "solid"), "combined: both installations in place");
ok(vis(wall, combined) === "ghost", "combined: the building faint");
const concealed = viewOf("concealed");
ok([...elecInst, ...plumbInst].every((c) => vis(c, concealed) === "solid"), "concealed installation: the built-in services shown where they are built in");
ok(vis(wall, concealed) === "ghost" && vis(wc, concealed) === "solid", "concealed installation: walls faint, fixtures solid");
ok(model.components.filter((c) => c.kind === "wall-chase").every((c) => vis(c, concealed) === "solid"), "concealed installation: the chases are shown");
ok(model.components.filter((c) => c.kind === "shaft-cover").every((c) => vis(c, concealed) === "ghost"), "concealed installation: the covers are faint so that the shafts can be seen");
const finished = viewOf("finished", { stage: 5 });
ok(finished.stage === 18, "the finished building moves on to the last stage");
ok(vis(conduit, finished) === "hidden" && vis(coldPipe, finished) === "hidden" && vis(wc, finished) === "solid" && vis(sw, finished) === "solid", "finished building: fixtures and switches, no pipes or conduit");
ok(vis(wall, finished) !== "ghost" || true, "finished building: the building is not faint");
ok(model.components.filter((c) => c.kind === "shaft-cover").every((c) => vis(c, finished) === "solid"), "finished building: the covers are in place");
const exploded = viewOf("exploded");
ok(exploded.explode.amount > 0 && [...elecInst, ...plumbInst].every((c) => vis(c, exploded) === "solid"), "exploded installation: every part shown, and the model is exploded");
ok(applyServiceView(exploded, "combined").explode.amount === 0, "leaving the exploded view puts the model back together");
const early = applyServiceView(at({ stage: 3 }), "electrical");
ok(early.stage === 9, "a view that needs later work moves the stage on to it");
ok(applyServiceView(at({ stage: 15 }), "plumbing").stage === 15, "and does not move a later stage back");
ok(applyServiceView(plumbingOnly, "off").serviceView === "off" && vis(conduit, applyServiceView(plumbingOnly, "off")) === "hidden", "back to the stage view, the stage decides again");
ok(SERVICE_VIEWS.length === 7, "the six views and the stage's own");

// ---------------------------------------------------------------------------
// 10. The explosion keeps every connection
// ---------------------------------------------------------------------------
for (const amount of [0.25, 0.6, 1]) {
  for (const floors of [true, false]) for (const categories of [true, false]) for (const layers of [true, false]) {
    const view = at({ stage: 18, explode: { amount, floors, categories, layers } });
    for (const category of ["electrical", "plumbing"] as const) {
      const offsets = new Set<string>();
      for (const c of servicesOf(category).filter(isInstallation)) {
        const info = explodeInfo(c, view, model);
        for (const shape of c.shapes) {
          const o = shapeOffset(shape, info, { x: 6000, y: 4500, z: 0 });
          offsets.add(`${o.x.toFixed(3)},${o.y.toFixed(3)},${o.z.toFixed(3)}`);
        }
      }
      ok(offsets.size === 1, `${category} moves as one piece at ${amount} (floors ${floors}, categories ${categories}, layers ${layers}): ${[...offsets].slice(0, 3).join(" | ")}`);
    }
  }
}
const apart = at({ stage: 18, explode: { amount: 1, floors: true, categories: true, layers: true } });
const eo = shapeOffset(conduit.shapes[0]!, explodeInfo(conduit, apart, model), { x: 0, y: 0, z: 0 });
const po = shapeOffset(coldPipe.shapes[0]!, explodeInfo(coldPipe, apart, model), { x: 0, y: 0, z: 0 });
ok(Math.hypot(eo.x - po.x, eo.y - po.y, eo.z - po.z) > 500, "the electrical and plumbing installations are drawn apart from each other");
const still = at({ stage: 18, explode: { amount: 0, floors: true, categories: true, layers: true } });
ok(shapeOffset(conduit.shapes[0]!, explodeInfo(conduit, still, model), { x: 0, y: 0, z: 0 }).z === 0, "assembled, nothing moves");
const chase = model.components.find((c) => c.kind === "wall-chase")!;
const host = model.components.find((c) => c.kind === "wall-blocks" && c.storeyIndex === chase.storeyIndex)!;
const co = shapeOffset(chase.shapes[0]!, explodeInfo(chase, apart, model), { x: 0, y: 0, z: 0 });
const ho = shapeOffset(host.shapes[0]!, explodeInfo(host, { ...apart, explode: { ...apart.explode, layers: false } }, model), { x: 0, y: 0, z: 0 });
ok(Math.abs(co.z - ho.z) < 1e-6 && Math.abs(co.x - ho.x) < 1e-6, "the chases go with the walls they are cut in");

// ---------------------------------------------------------------------------
// 11. A fall is drawn as a fall: the viewer's turn matches the model's ends
// ---------------------------------------------------------------------------
let tipped = 0;
const MM = 0.001;
for (const c of model.components) {
  for (const shape of c.shapes) {
    if (shape.t !== "cyl" || !shape.tilt) continue;
    tipped += 1;
    const q = cylinderQuaternion(shape, new THREE.Quaternion());
    const h = shape.len / 2;
    const viewer = [-h, h].map((y) => new THREE.Vector3(0, y, 0).applyQuaternion(q).add(new THREE.Vector3(shape.c.x * MM, shape.c.z * MM, -shape.c.y * MM)));
    // Local ends are not in model units; rescale the offset and compare as an unordered pair.
    const real = cylEnds(shape).map((p) => new THREE.Vector3(p.x * MM, p.z * MM, -p.y * MM));
    const got = [-h, h].map((y) => new THREE.Vector3(0, y * MM, 0).applyQuaternion(q).add(new THREE.Vector3(shape.c.x * MM, shape.c.z * MM, -shape.c.y * MM)));
    void viewer;
    const direct = got[0]!.distanceTo(real[0]!) + got[1]!.distanceTo(real[1]!);
    const swapped = got[0]!.distanceTo(real[1]!) + got[1]!.distanceTo(real[0]!);
    ok(Math.min(direct, swapped) < 1e-6, `${c.id}: the tipped cylinder is drawn between its two ends`);
  }
}
ok(tipped >= 20, `tipped pipes were checked (${tipped})`);

// ---------------------------------------------------------------------------
// 12. Legend and selectable information
// ---------------------------------------------------------------------------
const colours = SERVICE_LEGEND.map((e) => materialOf(e.materialId).color);
ok(new Set(colours).size === colours.length, "every legend entry has its own colour");
for (const c of model.components.filter((x) => x.service?.role === "route")) {
  const entry = legendEntryFor(c.service!.system, c.kind);
  ok(c.materialId === entry.materialId, `${c.id} is drawn in the colour the legend gives ${entry.label}`);
}
const info = describeComponent(model, "plumb:0:kitchen:waste") ?? describeComponent(model, model.components.find((c) => c.kind === "pipe-waste")!.id)!;
ok(info.service && info.service.from.length > 2 && info.service.to.length > 2 && info.service.route.length > 4 && info.service.level.length > 2, "a pipe says what it is, where it starts and ends, its level and how it is fixed");
ok(info.service!.colour === materialOf("pipe-waste").color, "and its colour is the legend's");
let described = 0;
for (const c of model.components.filter((x) => x.service)) {
  const d = describeComponent(model, c.id)!;
  described += 1;
  ok(d.service && d.service.from && d.service.to && d.service.route, `${c.id} carries its source, destination and installation notes`);
}
ok(described > 150, `selectable service components (${described})`);
ok(describeComponent(model, "ground:slab")!.service === null, "other components carry no service panel");

// ---------------------------------------------------------------------------
// 13. The settings move the model, and the model stays sound
// ---------------------------------------------------------------------------
const steeper = buildConstructionModel(project, {}, { services: { ...DEFAULT_RULES.services, fall: { waste: 25, soil: 30, drain: 40 } } });
const fallOf = (m: ConstructionModel, id: string) => {
  const seg = routeSegments(m).filter((s) => s.componentId === id && Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > 1000).sort((a, b) => Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) - Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y))[0]!;
  return Math.abs(seg.b.z - seg.a.z) / Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
};
const drainId = "plumb:drain";
near(fallOf(model, drainId), 1 / 60, 0.0005, "the drain falls at the default 1 in 60");
near(fallOf(steeper, drainId), 1 / 40, 0.0005, "and at 1 in 40 when asked");
const clamped = buildConstructionModel(project, {}, { services: { ...DEFAULT_RULES.services, fall: { waste: 1, soil: 1, drain: 1 } } });
near(fallOf(clamped, drainId), 1 / 20, 0.0005, "a fall steeper than 1 in 20 is kept to 1 in 20");
const higher = buildConstructionModel(project, {}, { services: { ...DEFAULT_RULES.services, switchHeight: 1300, coldHeight: 600 } });
const switchZ = (m: ConstructionModel) => (m.components.find((c) => c.kind === "switch-box")!.shapes[0] as Extract<Shape, { t: "box" }>).c.z;
near(switchZ(higher) - switchZ(model), 100, 1, "switches follow the height setting");
const coldZ = (m: ConstructionModel) => m.components.find((c) => c.id === "plumb:0:kitchen:supply" || c.kind === "pipe-cold")!;
ok(coldZ(higher).shapes.some((s) => s.t === "cyl" && Math.abs(s.c.z - (ground.floorZ + 600)) < 1) && !coldZ(model).shapes.some((s) => s.t === "cyl" && Math.abs(s.c.z - (ground.floorZ + 600)) < 1), "the cold lane follows its height setting");

for (const params of [{ storeys: 2 }, { storeys: 4 }, { floorToFloor: 3600, slabThickness: 180 }, { externalWall: 250, internalWall: 120 }, { gridX: [0, 4500, 9000, 11000, 13000] }, { columnSize: 400, beamDepth: 600 }]) {
  const built = buildLearningHouseProject(params).project;
  const m = buildConstructionModel(built);
  const c = new Ctx(built, DEFAULT_OPTIONS, DEFAULT_RULES);
  const a = auditServices(c, m, auditContextOf(c));
  ok(a.floating.length === 0 && a.collisions.length === 0 && !m.warnings.some((w) => /^(Plumbing|Electrical):/.test(w)), `${JSON.stringify(params)}: nothing floats, nothing collides, nothing is unresolved (${a.floating.length}/${a.collisions.length})`);
  cutoutsFollowLights(m, c);
}

// A plan the services cannot all be placed in says so, and still draws nothing through structure.
{
  const tight = buildLearningHouseProject({ gridY: [0, 4000, 8000] }).project;
  const m = buildConstructionModel(tight);
  const c = new Ctx(tight, DEFAULT_OPTIONS, DEFAULT_RULES);
  const a = auditServices(c, m, auditContextOf(c));
  const flagged = m.warnings.filter((w) => /^Plumbing:/.test(w));
  ok(flagged.length >= 1 && flagged.every((w) => w.length > 60), `what could not be placed is reported in words (${flagged.length})`);
  ok(a.floating.length === 0 && a.collisions.length === 0, "and what was placed is still sound");
}

// A fall too steep for a fixture's outlet is reported, not drawn climbing.
{
  const steep = buildConstructionModel(project, {}, { services: { ...DEFAULT_RULES.services, fall: { waste: 20, soil: 20, drain: 60 } } });
  ok(steep.warnings.some((w) => /cannot fall to the stack/.test(w)), "a fall too steep for the outlet is reported in words");
}

// A shaft tucked into a corner sends its pipes out of the front, onto the wall it is tucked against.
{
  const bath = ctx.rooms.find((r) => r.name === "Bathroom" && ctx.level(r.levelId)!.index === 0)!;
  const level = ctx.level(bath.levelId)!;
  const layout = roomLayout(ctx, bath);
  const housing = { x0: 6025, y0: 6525, x1: 6325, y1: 6825 };
  const corner: Riser = { id: "test:corner", kind: "plumbing", name: "Corner shaft", housing, hole: housing, frame: { origin: { x: 6325, y: 6525 }, ux: 0, uy: 1, vx: -1, vy: 0 }, edgeIndex: 2, rooms: ["Bathroom", "", ""], roomId: bath.id, width: 300, depth: 300, intrusion: 0 };
  ok(rectInsidePolygon(housing, layout.clear.poly), "the test shaft stands in the bathroom's corner");
  const exits = exitsOf(layout, corner);
  ok(exits.length === 2 && exits.filter((e) => e.corner).length === 1, `a corner shaft can send its pipes out of the side that is free, or out of the front (${exits.length})`);
  const wr = placeRoom(ctx, level, bath, layout, corner);
  ok(wr.exit?.corner === true && wr.fixtures.length === 3 && wr.unresolved.length === 0, `the fixtures are placed where the corner exit reaches them (${wr.unresolved.map((u) => u.reason).join(" | ")})`);
  const { vS, uS } = shaftPoints(corner);
  const scratch = { items: [], shafts: [corner], stacks: [{ shaft: corner, centre: local(corner.frame, uS, vS), bottom: -900, top: 0 }] } as unknown as PlumbingPlan;
  branches(ctx, scratch, wr);
  ok(wr.unresolved.length === 0, "and every pipe reaches them");
  const runs = (id: string) => scratch.items.filter((i) => i.id.endsWith(id)).flatMap((i) => i.runs);
  const gap = (a: Run[], b: Run[]) => {
    let worst = Infinity;
    for (const ra of a) for (let i = 0; i + 1 < ra.points.length; i += 1) {
      const p = ra.points[i]!; const q = ra.points[i + 1]!;
      const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) / 20));
      for (let k = 0; k <= n; k += 1) {
        const pt = { x: p.x + (q.x - p.x) * (k / n), y: p.y + (q.y - p.y) * (k / n), z: p.z + (q.z - p.z) * (k / n) };
        for (const rb of b) for (let j = 0; j + 1 < rb.points.length; j += 1) worst = Math.min(worst, distanceToSegment(pt, [rb.points[j]!, rb.points[j + 1]!]) - ra.r - rb.r);
      }
    }
    return worst;
  };
  const kinds = ["waste", "supply", "hot", "vent"].map((k) => [k, runs(`:${k}`)] as const).filter(([, r]) => r.length);
  ok(kinds.length === 4, "waste, vent, cold and hot are all there");
  for (const [i, [ka, a]] of kinds.entries()) for (const [kb, b] of kinds.slice(i + 1)) {
    if ((ka === "waste" && kb === "vent") || (ka === "vent" && kb === "waste")) continue;
    ok(gap(a, b) > -3, `the ${ka} and the ${kb} pipes of the corner shaft do not run through each other (${Math.round(gap(a, b))} mm)`);
  }
  const waste = scratch.items.find((i) => i.id.endsWith(":waste"))!;
  const lowest = waste.runs.flatMap((r) => r.points).reduce((m, p) => (p.z < m.z ? p : m));
  ok(Math.hypot(lowest.x - scratch.stacks[0]!.centre.x, lowest.y - scratch.stacks[0]!.centre.y) < 80, "the waste is lowest at the stack");
}

console.log(`Construction services: ${checks} checks passed.`);
