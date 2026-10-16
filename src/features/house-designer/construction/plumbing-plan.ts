import { ASSUME, type Ctx, type LevelInfo, type RoomInfo, type RoomKind, type WallFrame } from "./context";
import { box, cyl, rectPoly, type P2, type Shape, type V3 } from "./geometry";
import { roomLayout, type Edge, type RoomLayout } from "./layout";
import { local } from "./service-frame";
import { planServices, type Riser, type Unresolved } from "./service-plan";
import type { Exit } from "./wet-room";
import { FALL_DRAIN, FALL_SOIL, FALL_WASTE, axisOf, ductRect, fallsOf, laneOf, placeRoom, shaftPoints, branches } from "./wet-room";
import {
  allObstacles, beamCrossings, clipsAlong, firstObstacleHit, inflate, mergeRuns, polyLength, rectInsidePolygon, rectsOverlap, routeAround, runShapes, runWithFall, type BeamCrossing, type Obstacle, type Rect, type Run,
} from "./service-routing";
import type { ChaseSpec, SleeveSpec } from "./electrical-plan";
import { insetOutline } from "./structure-data";
import { pitchedGutter } from "./roof-geometry";

/**
 * The plumbing and drainage, laid out from the building.
 *
 * Every wet room gets its own service shaft, in a corner, from the ground to
 * above the roof. The soil stack, its vent and the cold-water riser stand in
 * it; the floor and roof slabs are cut for it; the pipes leave it along the
 * wall faces, inside a pre-wall duct in a bathroom, to the fixtures, which are
 * mounted on the duct. Waste pipes fall toward the stack; below the ground the
 * stack turns into a drain that falls to an inspection chamber, found a way
 * through the foundations rather than across them.
 */

export { FALL_DRAIN, FALL_SOIL, FALL_WASTE };
export type PlumbSystem = "cold" | "hot" | "waste" | "soil" | "vent" | "drain" | "rain" | "supply";

export type PlumbItem = {
  id: string;
  kind: string;
  name: string;
  system: PlumbSystem;
  subcategory: string;
  materialId: string;
  level: LevelInfo | null;
  storeyIndex?: number;
  room: string | null;
  runs: Run[];
  shapes: Shape[];
  from: string;
  to: string;
  parent: string | null;
  concealed: boolean;
  note?: string;
  count?: number;
  label?: { text: string; anchor: V3 };
  explodeLayer: number;
  explodeDir?: V3;
  /** Set when the item belongs to one of the two roof alternatives only. */
  variant?: { group: "roof"; value: "flat" | "pitched" };
  /** Pipe diameter class for the quantity, mm, when it is a run. */
  diameter?: number;
  /** Support clips along it: where, and what they hold. */
  clips?: { at: V3; r: number; axis: "x" | "y" }[];
  stage: 10 | 11;
};

export type FixtureKind = "wc" | "basin" | "shower" | "sink" | "washer";
export type PlacedFixture = {
  kind: FixtureKind; label: string; edge: Edge; t: number; w: number; d: number; supplyZ: number; outletZ: number; hot: boolean;
  /** The plan footprint, from the wall face out. */
  footprint: Rect; shapes: Shape[];
};

export type WetRoomPlan = {
  level: LevelInfo; room: RoomInfo; shaft: Riser; layout: RoomLayout;
  ductDepth: number; ducted: boolean; fixtures: PlacedFixture[]; heater: { edge: Edge; t: number; shape: Shape; inlet: V3; outlet: V3 } | null;
  /** Spans of duct along each wall: edge index, from, to. */
  duct: { edge: Edge; t0: number; t1: number }[];
  unresolved: Unresolved[];
  /** Where the pipes leave the shaft: the way out the fixtures were placed for. */
  exit?: Exit;
};

export type PlumbingPlan = {
  shafts: Riser[];
  items: PlumbItem[];
  rooms: WetRoomPlan[];
  chases: ChaseSpec[];
  sleeves: SleeveSpec[];
  unresolved: Unresolved[];
  roofTop: number;
  ventTop: number;
  stacks: { shaft: Riser; centre: P2; bottom: number; top: number }[];
  tank: { x: number; y: number; z: number; stand: Rect } | null;
  pump: { x: number; y: number; wallId: string } | null;
  /** Places outside the building already taken by the rising main, the meter and the downpipes. */
  reserved: P2[];
  /** Equipment a nearby pipe is carried by: the pump pad, the gutter a downpipe hangs from. */
  supports: { x0: number; y0: number; x1: number; y1: number; z0: number; z1: number; why: string }[];
  /** The flat roof's outlets, where the downpipes leave it, and the height of the scupper through the parapet. */
  rain: { flatOutlets: P2[]; scupperZ: number };
  fixtureRects(level: LevelInfo, room: RoomInfo): Rect[];
};

const cache = new WeakMap<Ctx, PlumbingPlan>();

export function planPlumbing(ctx: Ctx): PlumbingPlan {
  const hit = cache.get(ctx);
  if (hit) return hit;
  const services = planServices(ctx);
  const topLevel = ctx.top;
  const roof = ctx.project.roofs[0];
  const roofTop = roof ? roof.elevation + roof.thickness : topLevel?.topZ ?? 0;
  const plan: PlumbingPlan = {
    shafts: services.shafts, items: [], rooms: [], chases: [], sleeves: [], unresolved: services.unresolved.filter((u) => u.system === "plumbing"),
    roofTop, ventTop: roofTop + 700, stacks: [], tank: null, pump: null, reserved: [], supports: [], rain: { flatOutlets: [], scupperZ: roofTop + ASSUME.roofScreedMin + 60 }, fixtureRects: () => [],
  };
  cache.set(ctx, plan);
  if (!ctx.ground || !topLevel) return plan;

  const layouts = new Map<string, RoomLayout>();
  const layoutOf = (room: RoomInfo) => { let l = layouts.get(room.id); if (!l) { l = roomLayout(ctx, room); layouts.set(room.id, l); } return l; };
  const rectsByRoom = new Map<string, Rect[]>();
  plan.fixtureRects = (level, room) => rectsByRoom.get(`${level.index}:${room.id}`) ?? [];

  // --- The wet rooms: fixtures first, so that the electrical layout can keep clear of them ---------------
  const wet = ctx.rooms.filter((r) => ["bath", "wc", "kitchen", "laundry"].includes(r.kind));
  for (const room of wet) {
    const level = ctx.level(room.levelId)!;
    const layout = layoutOf(room);
    const shaft = plan.shafts.find((s) => rectInsidePolygon(s.housing, layout.clear.poly));
    if (!shaft) continue;
    const wr = placeRoom(ctx, level, room, layout, shaft);
    plan.rooms.push(wr);
    rectsByRoom.set(`${level.index}:${room.id}`, [...wr.fixtures.map((f) => f.footprint), ...wr.duct.map((d) => ductRect(d, wr.ductDepth))]);
  }

  // --- The stacks, below the ground and above the roof ---------------------------------------------------
  const buried: Obstacle[] = [];
  const structure = allObstacles(ctx);
  // Every stack is an obstacle to every other stack's drain, so that no drain runs past another stack's foot.
  plan.shafts.forEach((shaft, index) => {
    const { vS, uS } = shaftPoints(shaft);
    const c = local(shaft.frame, uS, vS);
    buried.push({ id: `stack:${index}`, kind: "pedestal", z0: -3000, z1: ctx.ground!.floorZ, poly: rectPoly(c.x - 110, c.y - 110, c.x + 110, c.y + 110) });
  });
  plan.shafts.forEach((shaft, index) => stackFor(ctx, plan, shaft, index, structure, buried));

  // --- Branches in each wet room, now that the shaft's pipes are placed ----------------------------------
  for (const wr of plan.rooms) {
    branches(ctx, plan, wr);
    // The trap and the short waste leg of a shower sit under its tray, which is what carries them.
    for (const fx of wr.fixtures.filter((x) => x.kind === "shower")) plan.supports.push({ x0: fx.footprint.x0, y0: fx.footprint.y0, x1: fx.footprint.x1, y1: fx.footprint.y1, z0: wr.level.floorZ - 5, z1: wr.level.floorZ + 400, why: "shower tray" });
    // Whatever the room could not place or reach, placing or routing, is reported once, here, when both are done.
    plan.unresolved.push(...wr.unresolved);
  }

  // --- Water on the roof and outside ----------------------------------------------------------------------
  roofWater(ctx, plan, layoutOf, buried);
  rainWater(ctx, plan, structure, buried);
  return plan;
}

// ---------------------------------------------------------------------------
// Stacks and drains
// ---------------------------------------------------------------------------

function stackFor(ctx: Ctx, plan: PlumbingPlan, shaft: Riser, index: number, structure: Obstacle[], buried: Obstacle[]): void {
  const falls = fallsOf(ctx);
  const { vS, uS } = shaftPoints(shaft);
  const c = local(shaft.frame, uS, vS);
  const ground = ctx.ground!;
  const top = ctx.top!;
  const label = shaft.name;
  const n = index + 1;
  const first = plan.stacks.length === 0;
  const way = drainRoute(ctx, c, index, structure, buried);
  const bottom = way ? way.invert : -900;
  // Where the drain goes through a ground beam, a sleeve is cast into the beam with it.
  for (const [k, x] of (way?.sleeves ?? []).entries()) {
    plan.sleeves.push({ id: `sleeve:beam:${n}:${k + 1}`, system: "plumbing", level: -1, x: x.at.x, y: x.at.y, z: x.at.z, axis: x.axis, diameter: 160, length: x.width, wallId: x.beam.id, host: "ground-beam", note: `Cast into ${x.beam.id} so that the foul drain from ${label} can pass through it.` });
  }
  plan.stacks.push({ shaft, centre: c, bottom, top: plan.ventTop });
  const stackRun: Run = { r: 55, points: [{ x: c.x, y: c.y, z: bottom }, { x: c.x, y: c.y, z: plan.ventTop }] };
  plan.items.push({
    id: first ? "plumb:stack" : `plumb:stack:${n}`, kind: "drain-stack", name: first ? "Soil and vent stack" : `Soil and vent stack ${n}`, system: "soil", subcategory: "Stacks", materialId: "pipe-waste", level: null, storeyIndex: 0, room: null,
    runs: [stackRun], shapes: runShapes(stackRun), from: "Underground drain", to: "Vent terminal above the roof", parent: way ? (first ? "plumb:drain" : `plumb:drain:${n}`) : null, concealed: true, diameter: 110,
    note: `Stands in ${label}. It rises above the roof to vent and passes through each slab in the opening cut for it.`, label: { text: first ? "Soil stack" : `Soil stack ${n}`, anchor: { x: c.x, y: c.y, z: ctx.levels[1]?.floorZ ?? top.floorZ } }, explodeLayer: 2, explodeDir: { x: 0, y: 0, z: 1 }, stage: 10,
  });
  const stackId = plan.items[plan.items.length - 1]!.id;
  // Cleanout (rodding eye) at the stack base, reached through the access panel at the ground floor.
  plan.items.push({
    id: first ? "plumb:cleanout" : `plumb:cleanout:${n}`, kind: "cleanout", name: `Rodding access at the base of the stack${first ? "" : ` ${n}`}`, system: "soil", subcategory: "Stacks", materialId: "valve", level: ground, room: shaft.rooms[0] ?? null,
    runs: [], shapes: [cyl(c.x, c.y, ground.floorZ + 300, 70, 140, "z")], from: "Soil stack", to: "Access panel in the shaft lining", parent: stackId, concealed: true, count: 1, explodeLayer: 3, explodeDir: { x: 0, y: 0, z: 1 }, stage: 10,
  });
  if (way) {
    const drain = way.run;
    plan.items.push({
      id: first ? "plumb:drain" : `plumb:drain:${n}`, kind: "drain-horizontal", name: first ? "Underground foul drain" : `Underground foul drain ${n}`, system: "drain", subcategory: "Underground drainage", materialId: "pipe-waste", level: null, storeyIndex: -1, room: null,
      runs: [drain], shapes: runShapes(drain), from: label, to: "Inspection chambers", parent: null, concealed: true, diameter: 110,
      note: `Laid to a fall of 1:${Math.round(1 / falls.drain)} on a granular bed, routed between the footings and under the ground beams. The fall is a setting; the discharge point and its level come from the drainage design.`, explodeLayer: 0, explodeDir: { x: 0, y: 0, z: -1 }, stage: 10,
    });
    plan.items.push({
      id: first ? "plumb:chambers" : `plumb:chambers:${n}`, kind: "inspection-chamber", name: first ? "Inspection chambers" : `Inspection chambers ${n}`, system: "drain", subcategory: "Underground drainage", materialId: "chamber", level: null, storeyIndex: -1, room: null,
      runs: [], shapes: way.chambers.map((q) => box(q.x, q.y, (ASSUME.naturalGround + (q.z - 300)) / 2, 700, 700, ASSUME.naturalGround - (q.z - 300))), from: "Underground foul drain", to: "Public sewer or septic tank (not designed here)", parent: first ? "plumb:drain" : `plumb:drain:${n}`, concealed: true, count: way.chambers.length,
      label: { text: "Inspection chamber", anchor: { x: way.chambers[0]!.x, y: way.chambers[0]!.y, z: ASSUME.naturalGround + 300 } }, note: "Final connection depends on local rules and is not designed here.", explodeLayer: 1, explodeDir: { x: 0, y: 0, z: -1 }, stage: 10,
    });
  } else {
    plan.unresolved.push({ id: `unresolved:plumbing:drain:${n}`, system: "plumbing", level: -1, where: label, reason: "No route for the underground drain was found between the footings, ground beams and column bases that reaches the outside." });
  }
}

/** A way out for the drain from below a stack: a lane clear of every footing, ground beam and pedestal, falling to a chamber outside. */
function drainRoute(ctx: Ctx, stack: P2, index: number, structure: Obstacle[], buried: Obstacle[]): { run: Run; invert: number; chambers: V3[]; sleeves: BeamCrossing[] } | null {
  const falls = fallsOf(ctx);
  const b = ctx.bounds;
  const dirs: { dx: number; dy: number; d: number }[] = [
    { dx: -1, dy: 0, d: stack.x - b.minX }, { dx: 1, dy: 0, d: b.maxX - stack.x }, { dx: 0, dy: -1, d: stack.y - b.minY }, { dx: 0, dy: 1, d: b.maxY - stack.y },
  ].sort((p, q) => p.d - q.d);
  const deep = index % 2 === 0 ? [-900, -1200] : [-1200, -900];
  // Through a beam the pipe has to stay within the middle of its depth, which the fall soon takes it out of: shallow, and flat enough.
  const shallow = [-740, -780, -820, -860];
  // First a way that goes round every ground beam; failing that, one that passes through them in sleeves cast into them.
  for (const sleeved of [false, true]) for (const invert of sleeved ? shallow : deep) {
    for (const dir of dirs) {
      const lat = { x: Math.abs(dir.dy), y: Math.abs(dir.dx) };
      for (const off of [0, 200, -200, 400, -400, 700, -700, 1000, -1000, 1500, -1500, 2000, -2000, 2600, -2600, 3200, -3200]) {
        const turn = { x: stack.x + lat.x * off, y: stack.y + lat.y * off };
        const q1 = { x: turn.x + dir.dx * (dir.d + 1800), y: turn.y + dir.dy * (dir.d + 1800) };
        const q2 = { x: q1.x + dir.dx * 3000, y: q1.y + dir.dy * 3000 };
        const plan: P2[] = off === 0 ? [stack, q1, q2] : [stack, turn, q1, q2];
        const len = polyLength(plan);
        const end = invert - falls.drain * len;
        const run = runWithFall(plan, end, falls.drain, 55);
        // Vertical drop from the stack bottom is inside `stack`; check the horizontal lane and the chamber positions.
        const obstacles = [...structure, ...buried].filter((o) => o.id !== `stack:${index}`);
        const solid = sleeved ? obstacles.filter((o) => o.kind !== "ground-beam") : obstacles;
        const beams = obstacles.filter((o) => o.kind === "ground-beam");
        let blocked = false;
        const crossings: BeamCrossing[] = [];
        for (let i = 0; i + 1 < run.points.length && !blocked; i += 1) {
          if (firstObstacleHit(solid, run.points[i]!, run.points[i + 1]!, 60)) { blocked = true; break; }
          if (!sleeved) continue;
          const through = beamCrossings(beams, run.points[i]!, run.points[i + 1]!, 55);
          if (through === null) blocked = true; else crossings.push(...through);
        }
        if (blocked) continue;
        // A sleeve through a beam is cast in with it: not where two of them would meet, nor too close to a column.
        if (crossings.some((c, i) => crossings.some((d, j) => j > i && c.beam.id === d.beam.id && Math.hypot(c.at.x - d.at.x, c.at.y - d.at.y) < 600))) continue;
        // Also the stack's own descent to the invert, which the pipe above ground level does not cover.
        if (firstObstacleHit(obstacles, { x: stack.x, y: stack.y, z: ctx.ground!.floorZ - 150 }, { x: stack.x, y: stack.y, z: invert }, 60)) continue;
        for (let i = 0; i + 1 < run.points.length; i += 1) buried.push(segmentObstacle(run.points[i]!, run.points[i + 1]!, 55, `drain:${index}:${i}`));
        return { sleeves: crossings, run, invert, chambers: [{ ...q1, z: invert - falls.drain * polyLength(plan.slice(0, plan.length - 1)) }, { ...q2, z: end }] };
      }
    }
  }
  return null;
}

function segmentObstacle(a: V3, b: V3, r: number, id: string): Obstacle {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * r; const ny = (dx / len) * r;
  const ex = (dx / len) * r; const ey = (dy / len) * r;
  return { id, kind: "pipe", z0: Math.min(a.z, b.z) - r, z1: Math.max(a.z, b.z) + r, poly: [{ x: a.x - ex + nx, y: a.y - ey + ny }, { x: b.x + ex + nx, y: b.y + ey + ny }, { x: b.x + ex - nx, y: b.y + ey - ny }, { x: a.x - ex - nx, y: a.y - ey - ny }] };
}

// ---------------------------------------------------------------------------
// Risers, the tank on the roof, the pump and the rising main
// ---------------------------------------------------------------------------

function roofWater(ctx: Ctx, plan: PlumbingPlan, layoutOf: (room: RoomInfo) => RoomLayout, buried: Obstacle[]): void {
  const lane = laneOf(ctx);
  void layoutOf;
  const ground = ctx.ground!;
  const top = ctx.top!;
  const b = ctx.bounds;
  const roofTop = plan.roofTop;
  const wallT = ctx.walls.find((w) => w.exterior && w.levelId === ground.levelId)?.thickness ?? 200;
  const inner: Rect = { x0: b.minX + wallT / 2 + ASSUME.parapetThickness, y0: b.minY + wallT / 2 + ASSUME.parapetThickness, x1: b.maxX - wallT / 2 - ASSUME.parapetThickness, y1: b.maxY - wallT / 2 - ASSUME.parapetThickness };
  if (!plan.shafts.length) return;
  const risers = plan.shafts.map((s) => { const { vC } = shaftPoints(s); const side = 0; void side; return { shaft: s, at: local(s.frame, 45, vC), vent: plan.stacks.find((k) => k.shaft === s)!.centre }; });

  // The tank stands on the roof beside the first stack, clear of the other vents and inside the parapet.
  const first = risers[0]!;
  const standW = 1300; const standD = 900;
  const keepClear = plan.stacks.map((s) => ({ x0: s.centre.x - 350, y0: s.centre.y - 350, x1: s.centre.x + 350, y1: s.centre.y + 350 }));
  let tank: { x: number; y: number } | null = null;
  const spots: P2[] = [];
  for (const r of [1500, 2200, 3000, 3800]) for (let k = 0; k < 8; k += 1) spots.push({ x: first.vent.x + Math.cos((k * Math.PI) / 4) * r, y: first.vent.y + Math.sin((k * Math.PI) / 4) * r });
  for (const s of spots) {
    const stand: Rect = { x0: s.x - standW / 2, y0: s.y - standD / 2, x1: s.x + standW / 2, y1: s.y + standD / 2 };
    if (stand.x0 < inner.x0 + 300 || stand.x1 > inner.x1 - 300 || stand.y0 < inner.y0 + 300 || stand.y1 > inner.y1 - 300) continue;
    if (keepClear.some((k) => rectsOverlap(inflate(stand, 200), k))) continue;
    tank = { x: Math.round(s.x / 50) * 50, y: Math.round(s.y / 50) * 50 };
    break;
  }
  if (!tank) { plan.unresolved.push({ id: "unresolved:plumbing:tank", system: "plumbing", level: top.index, where: "Roof", reason: "There is no clear place on the roof, inside the parapet and away from the vents, for the water tank." }); return; }
  const tankZ = roofTop + 1500;
  const stand: Rect = { x0: tank.x - standW / 2, y0: tank.y - standD / 2, x1: tank.x + standW / 2, y1: tank.y + standD / 2 };
  plan.tank = { x: tank.x, y: tank.y, z: tankZ, stand };

  // Down-feed on the roof surface from the tank to each shaft's cold riser, then down the riser. It leaves
  // the tank's east end, beside the stand, and the rising main arrives at the west end.
  const roofOutline = insetOutline(ctx, ASSUME.parapetThickness + 30).poly;
  const outlet = { x: stand.x1 + 80, y: tank.y };
  const roofPipeZ = roofTop + 300;
  const portZ = roofTop + 1100;
  const downRuns: Run[] = [];
  // Pipes laid on the roof keep off the tank stand and off every shaft opening but the one they enter.
  const openings = plan.shafts.map((s) => s.housing);
  // And off every vent stack that stands up from the roof, the pipe's own included.
  const stackRects = plan.stacks.map((k) => ({ x0: k.centre.x - 60, y0: k.centre.y - 60, x1: k.centre.x + 60, y1: k.centre.y + 60 }));
  risers.forEach((rs, i) => {
    const route = routeAround(outlet, rs.at, [stand, ...openings.filter((h) => !contains(inflate(h, 20), rs.at)), ...stackRects], roofOutline, 25, 300);
    if (!route) { plan.unresolved.push({ id: `unresolved:plumbing:roof-feed:${i}`, system: "plumbing", level: top.index, where: "Roof", reason: `The down-feed from the tank to ${rs.shaft.name} cannot be run across the roof without meeting a vent or the tank stand.` }); return; }
    downRuns.push({ r: 12.5, points: [{ x: tank.x + 600, y: tank.y, z: portZ }, { x: outlet.x, y: outlet.y, z: portZ }, { x: outlet.x, y: outlet.y, z: roofPipeZ }, ...route.slice(1).map((p) => ({ x: p.x, y: p.y, z: roofPipeZ }))] });
  });
  const roofMerged = mergeRuns(downRuns);
  plan.items.push({
    id: "plumb:tank", kind: "water-tank", name: "Roof water tank (1000 litres, example)", system: "supply", subcategory: "Storage", materialId: "water-tank", level: top, room: null, runs: [],
    shapes: [cyl(tank.x, tank.y, tankZ, 550, 1200, "x"), ...[-500, 500].flatMap((dx) => [-300, 300].map((dy) => box(tank!.x + dx, tank!.y + dy, roofTop + 700, 100, 100, 1400)))], from: "Rising main", to: "Down-feed risers", parent: null, concealed: false, count: 1,
    label: { text: "Water tank", anchor: { x: tank.x, y: tank.y, z: tankZ + 700 } }, note: "Stand, size and structural support are designed separately; the roof slab must be designed to carry it.", explodeLayer: 3, explodeDir: { x: 0, y: 0, z: 1 }, stage: 10,
  });
  // Cold risers, one in each shaft, from the roof to the lowest branch.
  risers.forEach((rs, i) => {
    const lowest = ground.floorZ + lane.cold.z;
    const run: Run = { r: 12.5, points: [{ x: rs.at.x, y: rs.at.y, z: roofPipeZ }, { x: rs.at.x, y: rs.at.y, z: lowest }] };
    const roofLeg = roofMerged.filter((r) => r.points.some((p) => Math.hypot(p.x - rs.at.x, p.y - rs.at.y) < 1));
    const feed = roofLeg.filter(() => i === 0);
    void feed;
    plan.items.push({
      id: `plumb:riser:${i + 1}`, kind: "riser", name: `Cold-water riser ${i + 1} — ${rs.shaft.name}`, system: "cold", subcategory: "Supply", materialId: "pipe-cold", level: null, storeyIndex: 0, room: null, runs: [run], shapes: runShapes(run), from: "Roof tank", to: "Branches on each storey",
      parent: "plumb:tank", concealed: true, diameter: 25, note: "Stands in the service shaft. Isolation valves at each branch let one storey be shut off.", explodeLayer: 4, explodeDir: { x: 0, y: 0, z: 1 }, stage: 10,
    });
  });
  plan.items.push({
    id: "plumb:downfeed", kind: "riser", name: "Down-feed pipes on the roof", system: "cold", subcategory: "Supply", materialId: "pipe-cold", level: top, room: null, runs: roofMerged, shapes: roofMerged.flatMap((r) => runShapes(r)), from: "Roof tank", to: "Cold-water risers in the shafts",
    parent: "plumb:tank", concealed: false, diameter: 25, note: "Laid on the roof on supports, clipped at regular intervals, and falling gently from the tank.", explodeLayer: 4, explodeDir: { x: 0, y: 0, z: 1 }, stage: 10,
    clips: roofMerged.flatMap((r) => clipsAlong(r, 1000).map((p) => ({ at: p, r: r.r, axis: axisOf(r) }))),
  });

  // Pump and rising main, outside the building.
  const wall = ctx.walls.filter((w) => w.exterior && w.levelId === ground.levelId).map((w) => {
    const s = Math.max(500, Math.min(w.length - 500, (first.vent.x - w.start.x) * w.ux + (first.vent.y - w.start.y) * w.uy));
    const p = { x: w.start.x + w.ux * s, y: w.start.y + w.uy * s };
    return { w, s, d: Math.hypot(p.x - first.vent.x, p.y - first.vent.y) };
  }).sort((p, q) => p.d - q.d);
  for (const cand of wall) {
    const w = cand.w;
    // Outward is away from the building's centre.
    const mid = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    const sgn = Math.sign((w.start.x - mid.x) * w.nx + (w.start.y - mid.y) * w.ny) || 1;
    const out = { x: w.nx * sgn, y: w.ny * sgn };
    for (const step of [0, 150, -150, 300, -300, 600, -600, 900, -900, 1400, -1400]) {
      const s = cand.s + step;
      if (s < 400 || s > w.length - 400) continue;
      const riserOff = w.thickness / 2 + 55;
      const px = w.start.x + w.ux * s + out.x * riserOff;
      const py = w.start.y + w.uy * s + out.y * riserOff;
      // Clear of columns and of every opening on every storey along this line, and of the meter.
      if (ctx.project.structuralColumns.some((c) => Math.abs(c.x - px) < c.width / 2 + 120 && Math.abs(c.y - py) < c.depth / 2 + 120)) continue;
      if (ctx.walls.some((o) => o.exterior && Math.abs(o.ux * w.ux + o.uy * w.uy) > 0.999 && Math.abs((o.start.x - w.start.x) * w.nx + (o.start.y - w.start.y) * w.ny) < 5 && o.openings.some((op) => { const ss = (px - o.start.x) * o.ux + (py - o.start.y) * o.uy; return ss > op.s0 - 150 && ss < op.s1 + 150; }))) continue;
      const parapetTop = roofTop + ASSUME.parapetHeight;
      const pumpAt = { x: px + out.x * 350, y: py + out.y * 350 };
      const zOver = parapetTop + 150;
      const inward = { x: -out.x, y: -out.y };
      const landing = { x: px + inward.x * (riserOff + ASSUME.parapetThickness + 250), y: py + inward.y * (riserOff + ASSUME.parapetThickness + 250) };
      const tankIn = { x: stand.x0 - 80, y: tank!.y };
      const across = routeAround(landing, tankIn, [stand, ...openings, ...stackRects], roofOutline, 25, 300);
      if (!across) continue;
      const rising: Run = { r: 12.5, points: [{ x: pumpAt.x, y: pumpAt.y, z: ground.floorZ + 300 }, { x: px, y: py, z: ground.floorZ + 300 }, { x: px, y: py, z: zOver }, { x: landing.x, y: landing.y, z: zOver }, ...across.slice(1).map((p) => ({ x: p.x, y: p.y, z: zOver })), { x: tankIn.x, y: tankIn.y, z: portZ }, { x: tank!.x - 600, y: tank!.y, z: portZ }] };
      const rise = rising;
      plan.pump = { x: pumpAt.x, y: pumpAt.y, wallId: w.id };
      plan.reserved.push({ x: px, y: py }, pumpAt);
      plan.supports.push({ x0: pumpAt.x - 350, y0: pumpAt.y - 350, x1: pumpAt.x + 350, y1: pumpAt.y + 350, z0: ASSUME.naturalGround, z1: 520, why: "pump pad" });
      plan.items.push({
        id: "plumb:pump", kind: "pump", name: "Booster pump", system: "supply", subcategory: "Supply", materialId: "appliance", level: ground, room: null, runs: [], shapes: [box(pumpAt.x, pumpAt.y, 300, 500, 300, 400), box(pumpAt.x, pumpAt.y, (ASSUME.naturalGround + 100) / 2, 700, 700, 100 - ASSUME.naturalGround)], from: "Mains water", to: "Rising main", parent: null, concealed: false, count: 1,
        label: { text: "Booster pump", anchor: { x: pumpAt.x, y: pumpAt.y, z: 900 } }, note: "Stands outside on its own pad against the wall. Pump duty, and whether one is needed, depend on the mains pressure and the building height.", explodeLayer: 2, explodeDir: { x: 0, y: 0, z: 1 }, stage: 10,
      });
      plan.items.push({
        id: "plumb:upfeed", kind: "riser", name: "Rising main to the roof tank", system: "supply", subcategory: "Supply", materialId: "pipe-cold", level: null, storeyIndex: 0, room: null, runs: [rise], shapes: runShapes(rise), from: "Booster pump", to: "Roof tank",
        parent: "plumb:pump", concealed: false, diameter: 25, note: "Fixed to the outside face of the wall on stand-off clips, over the parapet and across the roof to the tank.", explodeLayer: 4, explodeDir: { x: 0, y: 0, z: 1 }, stage: 10,
        clips: clipsAlong(rise, 1000).map((p) => ({ at: p, r: rise.r, axis: axisOf(rise) })),
      });
      // The mains, from the boundary to the pump, buried; and the meter on the way.
      const entryAt = { x: pumpAt.x + out.x * 3000, y: pumpAt.y + out.y * 3000 };
      plan.reserved.push(entryAt);
      buried.push(segmentObstacle({ x: entryAt.x, y: entryAt.y, z: ASSUME.naturalGround - 150 }, { x: pumpAt.x, y: pumpAt.y, z: ASSUME.naturalGround - 150 }, 12.5, "mains"));
      const mains: Run = { r: 12.5, points: [{ x: entryAt.x, y: entryAt.y, z: ASSUME.naturalGround - 150 }, { x: pumpAt.x, y: pumpAt.y, z: ASSUME.naturalGround - 150 }, { x: pumpAt.x, y: pumpAt.y, z: 300 }] };
      plan.items.push({
        id: "plumb:mains", kind: "water-entry", name: "Mains water pipe, boundary to pump", system: "supply", subcategory: "Supply", materialId: "pipe-cold", level: null, storeyIndex: -1, room: null, runs: [mains], shapes: runShapes(mains, false), from: "Boundary meter", to: "Booster pump", parent: null,
        concealed: true, diameter: 25, note: "Buried at the depth the water authority requires, with warning tape above.", explodeLayer: 0, explodeDir: { x: 0, y: 0, z: -1 }, stage: 10,
      });
      plan.items.push({ id: "plumb:water-meter", kind: "water-meter", name: "Water meter", system: "supply", subcategory: "Supply", materialId: "valve", level: null, storeyIndex: -1, room: null, runs: [], shapes: [box(entryAt.x, entryAt.y, ASSUME.naturalGround + 100, 300, 250, 250)], from: "Public main", to: "Mains water pipe", parent: "plumb:mains", concealed: false, count: 1, label: { text: "Water meter", anchor: { x: entryAt.x, y: entryAt.y, z: ASSUME.naturalGround + 500 } }, explodeLayer: 1, explodeDir: { x: 0, y: 0, z: 1 }, stage: 10 });
      return;
    }
  }
  if (!plan.pump) plan.unresolved.push({ id: "unresolved:plumbing:rising-main", system: "plumbing", level: 0, where: "Outside wall", reason: "There is no clear stretch of outside wall, clear of columns, windows, doors and the meter, for the rising main to climb to the roof." });
}

// ---------------------------------------------------------------------------
// Rainwater: from the gutters and the roof outlets down the outside of the wall
// ---------------------------------------------------------------------------

const RAIN_R = 45;
const SOAK_RUN = 2500;
const GULLY_OUT = 450;

type Stretch = { wall: WallFrame; out: P2; face: P2; pipe: P2; d: number };

/**
 * Places on the outside of the walls, nearest `prefer` first, where a downpipe
 * can stand: clear of columns, of every window and door on every storey, of the
 * rising main and the meter, and set out far enough to clear a beam that is
 * wider than the wall it sits on.
 */
function wallStretches(ctx: Ctx, plan: PlumbingPlan, prefer: P2, only: (w: WallFrame) => boolean): Stretch[] {
  const ground = ctx.ground!;
  const b = ctx.bounds;
  const mid = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  const found: Stretch[] = [];
  for (const w of ctx.walls) {
    if (!w.exterior || w.levelId !== ground.levelId || !only(w)) continue;
    const sgn = Math.sign((w.start.x - mid.x) * w.nx + (w.start.y - mid.y) * w.ny) || 1;
    const out = { x: w.nx * sgn, y: w.ny * sgn };
    let half = w.thickness / 2;
    for (const beam of ctx.project.structuralBeams) {
      const bl = Math.hypot(beam.end.x - beam.start.x, beam.end.y - beam.start.y) || 1;
      const parallel = Math.abs(((beam.end.x - beam.start.x) * w.ux + (beam.end.y - beam.start.y) * w.uy) / bl) > 0.999;
      const offLine = Math.abs((beam.start.x - w.start.x) * w.nx + (beam.start.y - w.start.y) * w.ny);
      if (parallel && offLine < 5) half = Math.max(half, beam.width / 2);
    }
    const standoff = half + RAIN_R + 25;
    for (let s = 400; s <= w.length - 400; s += 100) {
      const at = (off: number): P2 => ({ x: w.start.x + w.ux * s + out.x * off, y: w.start.y + w.uy * s + out.y * off });
      const pipe = at(standoff);
      if (plan.reserved.some((r) => Math.hypot(r.x - pipe.x, r.y - pipe.y) < 900)) continue;
      if (ctx.project.structuralColumns.some((c) => Math.abs(c.x - pipe.x) < c.width / 2 + 160 && Math.abs(c.y - pipe.y) < c.depth / 2 + 160)) continue;
      const inOpening = ctx.walls.some((o) => o.exterior && Math.abs(o.ux * w.ux + o.uy * w.uy) > 0.999 && Math.abs((o.start.x - w.start.x) * w.nx + (o.start.y - w.start.y) * w.ny) < 5 && o.openings.some((op) => {
        const ss = (pipe.x - o.start.x) * o.ux + (pipe.y - o.start.y) * o.uy;
        return ss > op.s0 - 200 && ss < op.s1 + 200;
      }));
      if (inOpening) continue;
      found.push({ wall: w, out, face: at(w.thickness / 2), pipe, d: Math.hypot(pipe.x - prefer.x, pipe.y - prefer.y) });
    }
  }
  return found.sort((p, q) => p.d - q.d);
}

function rainWater(ctx: Ctx, plan: PlumbingPlan, structure: Obstacle[], buried: Obstacle[]): void {
  const falls = fallsOf(ctx);
  const ground = ctx.ground;
  const top = ctx.top;
  if (!ground || !top) return;
  const b = ctx.bounds;
  const g = ASSUME.naturalGround;
  const gutter = pitchedGutter(b, plan.roofTop);
  const shoeZ = g + 150;
  const invert = g - 350;
  const lerpX = (f: number) => b.minX + (b.maxX - b.minX) * f;
  const sets: { variant: "flat" | "pitched"; prefer: P2[]; only: (w: WallFrame) => boolean }[] = [
    { variant: "flat", prefer: [{ x: lerpX(0.25), y: b.minY }, { x: lerpX(0.75), y: b.minY }], only: () => true },
    { variant: "pitched", prefer: [{ x: b.maxX - 700, y: b.minY }, { x: b.maxX - 700, y: b.maxY }], only: (w) => Math.abs(w.ny) > 0.9 },
  ];
  for (const set of sets) {
    const downs: Run[] = [];
    const drains: Run[] = [];
    const pits: V3[] = [];
    const tops: V3[] = [];
    set.prefer.forEach((prefer, index) => {
      const placed = tryRain(ctx, plan, set.variant, prefer, set.only, { g, shoeZ, invert, gutter }, [...structure, ...buried]);
      if (!placed) {
        plan.unresolved.push({ id: `unresolved:plumbing:rain:${set.variant}:${index}`, system: "plumbing", level: -1, where: `Rainwater (${set.variant} roof)`, reason: "No clear place was found on the outside walls for a downpipe, with a storm drain that gets away between the footings and ground beams." });
        return;
      }
      downs.push(placed.down);
      drains.push(placed.drain);
      pits.push(placed.pit);
      tops.push(placed.top);
      for (let i = 0; i + 1 < placed.drain.points.length; i += 1) buried.push(segmentObstacle(placed.drain.points[i]!, placed.drain.points[i + 1]!, 60, `rain:${set.variant}:${index}:${i}`));
      plan.reserved.push(placed.stand);
      if (placed.hang) plan.supports.push(placed.hang);
      if (set.variant === "flat") plan.rain.flatOutlets.push(placed.outlet);
    });
    if (!downs.length) continue;
    const variant = { group: "roof", value: set.variant } as const;
    const downId = `plumb:rain:${set.variant}:downpipes`;
    plan.items.push({
      id: downId, kind: "rain-downpipe", name: `Rainwater downpipes (${set.variant} roof)`, system: "rain", subcategory: "Rainwater", materialId: "pipe-rain", level: top, room: null, runs: downs, shapes: downs.flatMap((r) => runShapes(r)),
      from: set.variant === "flat" ? "Roof outlets, through the parapet" : "Eaves gutter outlets", to: "Storm drain", parent: null, concealed: false, diameter: 90, variant,
      note: set.variant === "flat" ? "Each outlet drains through a hole in the parapet into a rainwater head, then down the outside face of the wall on clips." : "A swan neck brings each gutter outlet back to the wall; the downpipe is clipped to the wall face.",
      label: set.variant === "flat" ? { text: "Rainwater downpipe", anchor: { x: tops[0]!.x, y: tops[0]!.y, z: plan.roofTop - 1500 } } : undefined,
      clips: downs.flatMap((r) => clipsAlong(r, 1200).map((p) => ({ at: p, r: r.r, axis: axisOf(r) }))),
      explodeLayer: 7, explodeDir: { x: 0, y: -1, z: 0 }, stage: 10,
    });
    plan.items.push({
      id: `plumb:rain:${set.variant}:storm`, kind: "drain-horizontal", name: `Storm drain to soakaway (${set.variant} roof)`, system: "rain", subcategory: "Rainwater", materialId: "pipe-rain", level: null, storeyIndex: -1, room: null, runs: drains, shapes: drains.flatMap((r) => runShapes(r)),
      from: "Downpipe shoe", to: "Soakaway pit", parent: downId, concealed: true, diameter: 100, variant,
      note: `Laid to a fall of 1:${Math.round(1 / falls.drain)}, clear of the footings and ground beams. The soakaway or public storm drain is designed separately.`, explodeLayer: 0, explodeDir: { x: 0, y: 0, z: -1 }, stage: 10,
    });
    plan.items.push({
      id: `plumb:rain:${set.variant}:soakaway`, kind: "inspection-chamber", name: `Soakaway pits (${set.variant} roof)`, system: "rain", subcategory: "Rainwater", materialId: "chamber", level: null, storeyIndex: -1, room: null, runs: [],
      shapes: pits.map((q) => box(q.x, q.y, (g + (q.z - 300)) / 2, 700, 700, g - (q.z - 300))), from: "Storm drain", to: "Ground (not designed here)", parent: `plumb:rain:${set.variant}:storm`, concealed: true, count: pits.length, variant, explodeLayer: 1, explodeDir: { x: 0, y: 0, z: -1 }, stage: 10,
    });
  }
}

type RainSite = { g: number; shoeZ: number; invert: number; gutter: { southY: number; northY: number; z: number } };

function tryRain(ctx: Ctx, plan: PlumbingPlan, variant: "flat" | "pitched", prefer: P2, only: (w: WallFrame) => boolean, site: RainSite, obstacles: Obstacle[]): { down: Run; drain: Run; pit: V3; top: V3; outlet: P2; stand: P2; hang: PlumbingPlan["supports"][number] | null } | null {
  const falls = fallsOf(ctx);
  const { g, shoeZ, invert, gutter } = site;
  void g;
  for (const c of wallStretches(ctx, plan, prefer, only).slice(0, 80)) {
    const { pipe, out } = c;
    const gully = { x: pipe.x + out.x * GULLY_OUT, y: pipe.y + out.y * GULLY_OUT };
    const far = { x: gully.x + out.x * SOAK_RUN, y: gully.y + out.y * SOAK_RUN };
    const end = invert - falls.drain * SOAK_RUN;
    const fall = runWithFall([gully, far], end, falls.drain, 55);
    const drain: Run = { r: 55, points: [{ x: gully.x, y: gully.y, z: shoeZ }, ...fall.points] };
    let top: V3;
    let outlet: P2 = pipe;
    let upper: V3[];
    if (variant === "flat") {
      const inside = { x: c.face.x - out.x * 400, y: c.face.y - out.y * 400 };
      outlet = inside;
      top = { x: inside.x, y: inside.y, z: plan.rain.scupperZ };
      upper = [top, { x: pipe.x, y: pipe.y, z: plan.rain.scupperZ }];
    } else {
      const northSide = c.wall.start.y > (ctx.bounds.minY + ctx.bounds.maxY) / 2;
      const gy = northSide ? gutter.northY : gutter.southY;
      top = { x: pipe.x, y: gy, z: gutter.z - 40 };
      upper = [top, { x: pipe.x, y: gy, z: gutter.z - 160 }, { x: pipe.x, y: pipe.y, z: gutter.z - 160 }];
    }
    const down: Run = { r: RAIN_R, points: [...upper, { x: pipe.x, y: pipe.y, z: shoeZ }, { x: gully.x, y: gully.y, z: shoeZ }] };
    const all = [...down.points, ...drain.points];
    let blocked = false;
    for (let i = 0; i + 1 < all.length && !blocked; i += 1) if (firstObstacleHit(obstacles, all[i]!, all[i + 1]!, 60)) blocked = true;
    if (blocked) continue;
    const hang = variant === "pitched" ? { x0: pipe.x - 150, x1: pipe.x + 150, y0: Math.min(top.y, pipe.y) - 70, y1: Math.max(top.y, pipe.y) + 70, z0: gutter.z - 230, z1: gutter.z + 45, why: "eaves gutter" } : null;
    return { down, drain, pit: drain.points[drain.points.length - 1]!, top, outlet, stand: pipe, hang };
  }
  return null;
}

const contains = (r: Rect, p: P2) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1;

export type { RoomKind };
