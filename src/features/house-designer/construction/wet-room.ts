import type { Ctx, LevelInfo, RoomInfo } from "./context";
import { box, cyl, type P2, type Shape, type V3 } from "./geometry";
import type { Edge, RoomLayout } from "./layout";
import type { FixtureKind, PlacedFixture, PlumbingPlan, WetRoomPlan } from "./plumbing-plan";
import { DUCT_DEPTH, local } from "./service-frame";
import type { Riser } from "./service-plan";
import {
  atEdge, clearRuns, clipsAlong, inflate, mergeRuns, perimeterRoute, rectInsidePolygon, rectsOverlap, runShapes, runWithFall, type Rect, type Run, type WallPoint,
} from "./service-routing";

/**
 * A wet room's fixtures and the pipes that serve them: where the fixtures
 * stand, where the water, the waste and the vent run, and whether they can all
 * reach the shaft. Shared by the plumbing plan, which draws them, and by the
 * search for a shaft, which only accepts a place where they do.
 */

export const FIX: Record<FixtureKind, { w: number; d: number; h: number; supplyZ: number; outletZ: number; hot: boolean; label: string }> = {
  wc: { w: 380, d: 700, h: 400, supplyZ: 250, outletZ: 320, hot: false, label: "WC pan" },
  basin: { w: 500, d: 420, h: 150, supplyZ: 560, outletZ: 480, hot: true, label: "Wash basin" },
  shower: { w: 900, d: 900, h: 360, supplyZ: 1100, outletZ: 300, hot: true, label: "Shower tray and head" },
  sink: { w: 600, d: 100, h: 100, supplyZ: 900, outletZ: 520, hot: true, label: "Sink supply and waste stubs" },
  washer: { w: 600, d: 100, h: 100, supplyZ: 1000, outletZ: 800, hot: false, label: "Washing machine tap and standpipe" },
};

/** How far along the wall, from a fixture's centre, its cold feed arrives: clear of the 110 mm waste pipe under a WC pan. */
export const coldTap = (kind: FixtureKind): number => (kind === "wc" ? 120 : 45);

/** Where each pipe runs off the wall face, inside the duct or the cabinet space, and at what height. */
export const laneOf = (ctx: Ctx) => ({ cold: { offset: 40, z: ctx.rules.services.coldHeight }, hot: { offset: 70, z: ctx.rules.services.hotHeight } });
export const FALL_WASTE = 1 / 40;
export const FALL_SOIL = 1 / 60;
export const FALL_DRAIN = 1 / 60;

/** The falls the project asks for ("1 in N" in the settings), kept to what a drain can really be laid at. */
export function fallsOf(ctx: Ctx): { waste: number; soil: number; drain: number } {
  const f = ctx.rules.services.fall;
  const ratio = (n: number, fallback: number) => (Number.isFinite(n) && n > 0 ? 1 / Math.min(200, Math.max(20, n)) : fallback);
  return { waste: ratio(f.waste, FALL_WASTE), soil: ratio(f.soil, FALL_SOIL), drain: ratio(f.drain, FALL_DRAIN) };
}
export const CLIP_GAP = 800;

export const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const rectFromPoints = (pts: P2[]): Rect => ({ x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) });


// ---------------------------------------------------------------------------
// Placing a wet room's fixtures
// ---------------------------------------------------------------------------

export function shaftPoints(shaft: Riser) {
  const holeFrom = shaft.intrusion > 0 ? shaft.intrusion + 30 : 0;
  const vS = holeFrom + 62;
  return { holeFrom, vS, vC: vS + 100, uS: 150 };
}

/** The edge of this room's own layout that a shaft stands against. */
export function edgeOf(layout: RoomLayout, shaft: Riser): Edge | null {
  const f = shaft.frame;
  for (const e of layout.edges) {
    if (Math.abs(e.ux - f.ux) > 1e-6 || Math.abs(e.uy - f.uy) > 1e-6) continue;
    const off = Math.abs((f.origin.x - e.a.x) * e.nx + (f.origin.y - e.a.y) * e.ny);
    const t = (f.origin.x - e.a.x) * e.ux + (f.origin.y - e.a.y) * e.uy;
    if (off < 3 && t >= -3 && t <= e.length + 3) return e;
  }
  return null;
}

export function footprintOf(edge: Edge, t: number, w: number, depth: number): Rect {
  const pts = [atEdge(edge, t - w / 2, 0), atEdge(edge, t + w / 2, 0), atEdge(edge, t + w / 2, depth), atEdge(edge, t - w / 2, depth)];
  return rectFromPoints(pts);
}

/** Where the pipes of a shaft leave it and join the walk round the room. */
export type Exit = { side: 0 | 1; corner: boolean; at: WallPoint };

/**
 * The ways out of a shaft: along the wall it stands against, on either side of it; or, when it is tucked into a
 * corner, out of its front onto the wall it is tucked against. `side` is the side the riser and the vent stand on.
 */
export function exitsOf(layout: RoomLayout, shaft: Riser): Exit[] {
  const edge = edgeOf(layout, shaft);
  if (!edge) return [];
  const f = shaft.frame;
  const t0 = (f.origin.x - edge.a.x) * edge.ux + (f.origin.y - edge.a.y) * edge.uy;
  const t1 = t0 + shaft.width;
  const exits: Exit[] = [];
  const ei = layout.edges.indexOf(edge);
  const count = layout.edges.length;
  const reachOut = shaft.depth + 10;
  const square = (other: Edge) => Math.abs(edge.ux * other.ux + edge.uy * other.uy) < 0.01;
  if (t0 > 10) exits.push({ side: 0, corner: false, at: { edge, t: t0 - 10 } });
  if (t1 < edge.length - 10) exits.push({ side: 1, corner: false, at: { edge, t: t1 + 10 } });
  const before = layout.edges[(ei - 1 + count) % count]!;
  const after = layout.edges[(ei + 1) % count]!;
  if (t0 <= 10 && square(before) && before.length > reachOut + 100) exits.push({ side: 1, corner: true, at: { edge: before, t: before.length - reachOut } });
  if (t1 >= edge.length - 10 && square(after) && after.length > reachOut + 100) exits.push({ side: 0, corner: true, at: { edge: after, t: reachOut } });
  return exits;
}

export function placeRoom(ctx: Ctx, level: LevelInfo, room: RoomInfo, layout: RoomLayout, shaft: Riser): WetRoomPlan {
  const lane = laneOf(ctx);
  const ducted = room.kind === "bath" || room.kind === "wc";
  const { vS } = shaftPoints(shaft);
  const ductDepth = ducted ? Math.max(DUCT_DEPTH, vS + 70) : 0;
  const names = room.name.toLowerCase();
  const order: FixtureKind[] = room.kind === "bath" ? ["wc", "basin", "shower"] : room.kind === "wc" ? (/shower/.test(names) ? ["shower", "basin", "wc"] : ["wc", "basin"]) : room.kind === "kitchen" ? ["sink"] : ["washer"];
  const housing = shaft.housing;
  const shaftAt = rectCentre(housing);
  const z0 = level.floorZ;
  const trunkR = order.includes("wc") ? 55 : 25;
  const coldZ = z0 + lane.cold.z;
  const hotZ = z0 + lane.hot.z;
  const runs = layout.edges
    .flatMap((edge) => clearRuns(ctx, layout, edge, 120, 400, ductDepth + 300).map(([t0, t1]) => ({ edge, t0, t1 })))
    .sort((a, b) => dist2(midOf(a.edge, (a.t0 + a.t1) / 2), shaftAt) - dist2(midOf(b.edge, (b.t0 + b.t1) / 2), shaftAt));
  const via = (exit: Exit, offset: number, z: number, r: number, to: WallPoint) => perimeterRoute(ctx, layout, exit.at, to, offset, z - 5, z + 5, r, [housing]);

  /** Everything placed for one way out of the shaft: only where the waste and the cold pipe can get to it from there. */
  const attempt = (exit: Exit | null) => {
    const fixtures: PlacedFixture[] = [];
    const problems: string[] = [];
    const reserved: { edge: Edge; lo: number; hi: number }[] = [];
    const footprints: Rect[] = [];
    let heater: WetRoomPlan["heater"] = null;
    const reachable = (edge: Edge, t: number, kind: FixtureKind) => !exit || (!!via(exit, vS, z0 + 250, trunkR, { edge, t }) && !!via(exit, lane.cold.offset, coldZ, 10, { edge, t: t - coldTap(kind) }));
    for (const kind of order) {
      const spec = FIX[kind];
      const depth = ducted ? ductDepth + spec.d : spec.d;
      let placed: PlacedFixture | null = null;
      for (const run of runs) {
        // From the end nearer the shaft, in steps.
        const startNear = dist2(atEdge(run.edge, run.t0, 0), shaftAt) <= dist2(atEdge(run.edge, run.t1, 0), shaftAt);
        const lo = run.t0 + spec.w / 2;
        const hi = run.t1 - spec.w / 2;
        if (hi < lo) continue;
        for (let k = 0; ; k += 50) {
          const t = startNear ? lo + k : hi - k;
          if (startNear ? t > hi + 0.1 : t < lo - 0.1) break;
          const foot = footprintOf(run.edge, t, spec.w, depth);
          if (reserved.some((r) => r.edge === run.edge && t + spec.w / 2 + 120 > r.lo && t - spec.w / 2 - 120 < r.hi)) continue;
          if (footprints.some((fp) => rectsOverlap(inflate(foot, 40), fp))) continue;
          if (rectsOverlap(inflate(foot, 30), housing)) continue;
          if (!rectInsidePolygon(foot, layout.clear.poly)) continue;
          if (!reachable(run.edge, t, kind)) continue;
          placed = { kind, label: spec.label, edge: run.edge, t, w: spec.w, d: spec.d, supplyZ: spec.supplyZ, outletZ: spec.outletZ, hot: spec.hot, footprint: foot, shapes: fixtureShapes(layout, run.edge, t, kind, ductDepth, ducted) };
          break;
        }
        if (placed) break;
      }
      if (!placed) { problems.push(`There is no clear wall for the ${spec.label.toLowerCase()} that keeps clear of the doors, columns, shaft and the other fixtures, and that its pipes can reach from the shaft.`); continue; }
      reserved.push({ edge: placed.edge, lo: placed.t - placed.w / 2, hi: placed.t + placed.w / 2 });
      footprints.push(placed.footprint);
      fixtures.push(placed);
    }
    // Water heater, on the wall above the fixtures (a bathroom), or beside the sink (a kitchen): its cold feed must arrive and its hot pipe must reach every hot fixture.
    const hotFixtures = fixtures.filter((x) => x.hot);
    if (hotFixtures.length) {
      const hotReach = (edge: Edge, t: number) => hotFixtures.every((h) => !!perimeterRoute(ctx, layout, { edge, t: t + 45 }, { edge: h.edge, t: h.t + 45 }, lane.hot.offset, hotZ - 5, hotZ + 5, 10, [housing]));
      const coldReach = (edge: Edge, t: number) => !exit || !!via(exit, lane.cold.offset, coldZ, 10, { edge, t: t - 45 });
      if (ducted) {
        const hotFix = hotFixtures[0]!;
        search: for (const run of runs) {
          const near = [hotFix.t + hotFix.w / 2 + 330, hotFix.t - hotFix.w / 2 - 330, ...[0.5, 0.25, 0.75].map((x) => run.t0 + (run.t1 - run.t0) * x)];
          for (const t of near) {
            if (t < run.t0 + 250 || t > run.t1 - 250 || reserved.some((r) => r.edge === run.edge && t + 250 > r.lo && t - 250 < r.hi)) continue;
            const foot = footprintOf(run.edge, t, 400, ductDepth + 400);
            if (rectsOverlap(inflate(foot, 20), housing)) continue;
            if (!coldReach(run.edge, t) || !hotReach(run.edge, t)) continue;
            const c = atEdge(run.edge, t, ductDepth + 200);
            heater = { edge: run.edge, t, shape: cyl(c.x, c.y, z0 + 1900, 200, 600, "z"), inlet: { ...atEdge(run.edge, t - 45, lane.cold.offset), z: z0 + 1600 }, outlet: { ...atEdge(run.edge, t + 45, lane.hot.offset), z: z0 + 1600 } };
            reserved.push({ edge: run.edge, lo: t - 250, hi: t + 250 });
            break search;
          }
        }
        if (!heater) problems.push("There is no clear wall above the fixtures for a water heater that its cold and hot pipes can reach.");
      } else if (room.kind === "kitchen") {
        const hotFix = hotFixtures[0]!;
        for (const dt of [450, -450]) {
          const t = hotFix.t + dt;
          if (t < 150 || t > hotFix.edge.length - 150 || !coldReach(hotFix.edge, t) || !hotReach(hotFix.edge, t)) continue;
          const c = atEdge(hotFix.edge, t, 160);
          heater = { edge: hotFix.edge, t, shape: cyl(c.x, c.y, z0 + 450, 150, 350, "z"), inlet: { ...atEdge(hotFix.edge, t - 45, lane.cold.offset), z: z0 + 300 }, outlet: { ...atEdge(hotFix.edge, t + 45, lane.hot.offset), z: z0 + 300 } };
          break;
        }
        if (!heater) problems.push("There is no place beside the sink for a water heater that its cold and hot pipes can reach.");
      }
    }
    return { exit, fixtures, heater, problems };
  };

  const exits = exitsOf(layout, shaft);
  const tries = (exits.length ? exits : [null]).map((exit) => attempt(exit));
  // The first way out that places everything; failing that, the one that places most.
  const best = tries.find((x) => x.problems.length === 0) ?? [...tries].sort((p, q) => p.problems.length - q.problems.length)[0]!;
  const wr: WetRoomPlan = { level, room, shaft, layout, ductDepth, ducted, fixtures: best.fixtures, heater: best.heater, duct: [], unresolved: [], ...(best.exit ? { exit: best.exit } : {}) };
  for (const what of best.problems) wr.unresolved.push({ id: `unresolved:plumbing:${level.index}:${room.id}:${wr.unresolved.length}`, system: "plumbing", level: level.index, where: `${room.name}, ${level.name}`, reason: what });
  return wr;
}

export const rectCentre = (r: Rect): P2 => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
export const dist2 = (a: P2, b: P2) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const midOf = (e: Edge, t: number): P2 => atEdge(e, t, 0);

export function fixtureShapes(layout: RoomLayout, edge: Edge, t: number, kind: FixtureKind, ductDepth: number, ducted: boolean): Shape[] {
  const z0 = layout.level.floorZ;
  const D = ducted ? ductDepth : 0;
  const onFace = (height: number, w: number, high: number, deep: number, inset: number): Shape => {
    const p = atEdge(edge, t, inset + deep / 2);
    return Math.abs(edge.ux) > 0.999 ? box(p.x, p.y, z0 + height, w, deep, high) : box(p.x, p.y, z0 + height, deep, w, high);
  };
  if (kind === "wc") return [onFace(200, 380, 400, 700, D), onFace(650, 380, 350, 180, D)];
  if (kind === "basin") return [onFace(800, 500, 150, 420, D), onFace(450, 60, 400, 60, D + 100)];
  if (kind === "shower") {
    const head = atEdge(edge, t, D + 60);
    return [onFace(150, 900, 300, 900, D), onFace(330, 900, 60, 900, D), Math.abs(edge.nx) > 0.5 ? cyl(head.x, head.y, z0 + 1900, 70, 50, "x") : cyl(head.x, head.y, z0 + 1900, 70, 50, "y")];
  }
  return [];
}


// ---------------------------------------------------------------------------
// Branches in a wet room: supply, hot water, waste, vent
// ---------------------------------------------------------------------------

export function branches(ctx: Ctx, plan: PlumbingPlan, wr: WetRoomPlan): void {
  const lane = laneOf(ctx);
  const falls = fallsOf(ctx);
  const { level, room, layout, shaft } = wr;
  const edge = edgeOf(layout, shaft);
  const rid = `plumb:${level.index}:${slug(room.name)}`;
  const stack = plan.stacks.find((s) => s.shaft === shaft);
  if (!edge || !stack) return;
  const { vS, vC, uS } = shaftPoints(shaft);
  const f = shaft.frame;
  const t0 = (f.origin.x - edge.a.x) * edge.ux + (f.origin.y - edge.a.y) * edge.uy;
  const t1 = t0 + shaft.width;
  const z0 = level.floorZ;
  const base = { level, room: room.name, concealed: true, stage: 10 as const };
  const fail = (what: string) => wr.unresolved.push({ id: `unresolved:plumbing:${level.index}:${room.id}:${wr.unresolved.length}`, system: "plumbing", level: level.index, where: `${room.name}, ${level.name}`, reason: what });
  const housing = [shaft.housing];

  // Where the pipes leave the shaft: the way out the fixtures were placed for, or the best of those there are.
  const exits = wr.exit ? [wr.exit] : exitsOf(layout, shaft);
  const via = (exit: Exit, offset: number, z: number, r: number, to: WallPoint) => perimeterRoute(ctx, layout, exit.at, to, offset, z - 5, z + 5, r, housing);
  const trunkR = wr.fixtures.some((x) => x.kind === "wc") ? 55 : 25;
  const coldZ = z0 + lane.cold.z;
  // The exit that reaches every fixture, with the waste and the cold pipe, by the shortest way.
  const tally = (exit: Exit) => {
    let reached = 0; let length = 0;
    for (const fx of wr.fixtures) {
      const w = via(exit, vS, z0 + 250, trunkR, { edge: fx.edge, t: fx.t });
      const c = via(exit, lane.cold.offset, coldZ, 10, { edge: fx.edge, t: fx.t - coldTap(fx.kind) });
      if (w) { reached += 1; length += w.length; }
      if (c) { reached += 1; length += c.length; }
    }
    return { reached, length };
  };
  const ranked = exits.map((exit) => ({ exit, ...tally(exit) })).sort((a, b) => (b.reached - a.reached) || (a.length - b.length));
  if (!wr.fixtures.length) return;
  if (!ranked.length || ranked[0]!.reached === 0) { fail("The waste pipe from the fixtures cannot reach the stack along the walls without crossing a door, a column or the shaft."); return; }
  const chosen = ranked[0]!.exit;
  const side = chosen.side;
  const corner = chosen.corner;
  const faceU = side === 0 ? 0 : shaft.width;
  // Across the shaft toward the wall it is tucked against: a pipe lane `d` from that wall.
  const cornerU = (d: number) => (side === 1 ? d : shaft.width - d);

  // Inside the shaft: the cold riser and the vent stand on the service side, the stack between them and the way out.
  const uRiser = side === 0 ? 45 : shaft.width - 45;
  const uTee = corner ? (side === 1 ? 100 : shaft.width - 100) : side === 0 ? 100 : shaft.width - 100;
  const stackPt = local(f, uS, vS);

  // ----- waste -------------------------------------------------------------------------------
  const ductWaste = wr.ductDepth > 0;
  const wasteZInlet = z0 + 120;
  const wasteRuns: Run[] = [];
  const stubs: Run[] = [];
  const traps: Shape[] = [];
  const floorDrain: Shape[] = [];
  let valid = true;
  for (const fx of wr.fixtures) {
    const route = via(chosen, vS, z0 + 250, trunkR, { edge: fx.edge, t: fx.t });
    if (!route) { fail(`The waste pipe from the ${fx.label.toLowerCase()} cannot reach the stack along the walls.`); valid = false; continue; }
    const walk = route.points;
    if (!walk.length) continue;
    // The route goes shaft exit -> fixture; reverse so the pipe is lowest at the stack.
    const plan2 = [...walk].reverse();
    const fall = trunkR === 55 ? falls.soil : falls.waste;
    // Out of the side of the shaft, straight to the stack; or out of its front, across the shaft to the stack.
    const full: P2[] = corner ? [...plan2, local(f, cornerU(vS), vS), stackPt] : [...plan2.slice(0, -1), local(f, faceU, vS), stackPt];
    wasteRuns.push(runWithFall(dedupe2(full), wasteZInlet, fall, trunkR));
  }
  const merged = mergeRuns(wasteRuns);
  // Branch from each fixture's outlet down (or across) to the trunk.
  for (const fx of wr.fixtures) {
    const spec = FIX[fx.kind];
    const lane = ductWaste ? Math.min(wr.ductDepth - 20, vS) : vS;
    const at = atEdge(fx.edge, fx.t, lane);
    const trunkZ = zOnRuns(merged, at) ?? wasteZInlet;
    // A waste pipe only runs downhill: the trunk, at this fall, must still be below the fixture's outlet where they meet.
    if (trunkZ > z0 + spec.outletZ - 60) {
      fail(`The waste pipe cannot fall to the stack from the ${fx.label.toLowerCase()}: its outlet is ${spec.outletZ} mm above the floor and the pipe, at this fall and length, has already risen to ${Math.round(trunkZ - z0)} mm there. A gentler fall, a shorter run or a raised fixture is needed.`);
      valid = false;
    }
    if (fx.kind === "shower") {
      const out = atEdge(fx.edge, fx.t, wr.ductDepth + 60);
      stubs.push({ r: 25, points: [{ ...out, z: z0 + spec.outletZ }, { ...atEdge(fx.edge, fx.t, lane), z: z0 + spec.outletZ }, { ...at, z: trunkZ }] });
      floorDrain.push(cyl(out.x, out.y, z0 + 335, 55, 20, "z"));
      traps.push(cyl(out.x, out.y, z0 + spec.outletZ - 60, 40, 80, "z"));
    } else if (fx.kind === "wc") {
      const out = atEdge(fx.edge, fx.t, lane);
      stubs.push({ r: 55, points: [{ ...out, z: z0 + spec.outletZ }, { ...at, z: trunkZ }] });
    } else {
      const out = atEdge(fx.edge, fx.t, lane);
      stubs.push({ r: 25, points: [{ ...out, z: z0 + spec.outletZ }, { ...at, z: trunkZ }] });
      traps.push(cyl(out.x, out.y, z0 + spec.outletZ - 60, 38, 80, "z"));
    }
  }
  // Vent: a 50 mm pipe from the trunk up the shaft to a tie into the stack under the slab above.
  const tee = local(f, uTee, vS);
  const teeZ = zOnRuns(merged, tee) ?? wasteZInlet;
  const tie = level.soffitZ - 200;
  // The vent stands beside the riser and clear of the 110 mm stack, a lane further into the shaft than the trunk, and ties into the stack at the top.
  const ventUp = local(f, uTee, vS + 95);
  const ventAcross = local(f, uS, vS + 95);
  const ventRun: Run = { r: 25, points: [{ ...tee, z: teeZ }, { ...ventUp, z: teeZ }, { ...ventUp, z: tie }, { ...ventAcross, z: tie }, { x: stackPt.x, y: stackPt.y, z: tie }] };

  const wasteRunsAll = [...merged, ...stubs];
  const wasteShapes = wasteRunsAll.flatMap((r) => runShapes(r));
  if (valid && wasteRunsAll.length) {
    plan.items.push({
      id: `${rid}:waste`, kind: "pipe-waste", name: `Waste pipes — ${room.name}, ${level.name}`, system: "waste", subcategory: "Waste", materialId: "pipe-waste", ...base, runs: wasteRunsAll, shapes: wasteShapes,
      from: wr.fixtures.map((x) => x.label).join(", "), to: shaft.name, parent: stack.shaft ? plan.items.find((i) => i.kind === "drain-stack" && i.note?.includes(shaft.name))?.id ?? null : null, diameter: 50,
      note: `Falls 1:${Math.round(1 / falls.waste)} (1:${Math.round(1 / falls.soil)} for the soil pipe) toward the stack, along the wall inside ${ductWaste ? "the pre-wall duct" : "the cabinet space"}.`, explodeLayer: 2, explodeDir: { x: 0, y: 0, z: -1 },
      clips: wasteRunsAll.flatMap((r) => clipsAlong(r, CLIP_GAP).map((p) => ({ at: p, r: r.r, axis: axisOf(r) }))),
    });
    const wasteId = `${rid}:waste`;
    plan.items.push({ id: `${rid}:vent`, kind: "pipe-vent", name: `Vent pipe — ${room.name}, ${level.name}`, system: "vent", subcategory: "Waste", materialId: "pipe-vent", ...base, runs: [ventRun], shapes: runShapes(ventRun), from: "Waste trunk (tee)", to: "Stack, under the slab above", parent: wasteId, diameter: 50, note: "Lets air into the drain so that no trap loses its water seal.", explodeLayer: 3, explodeDir: { x: 0, y: 0, z: 1 } });
    if (traps.length) plan.items.push({ id: `${rid}:traps`, kind: "trap", name: `Traps — ${room.name}, ${level.name}`, system: "waste", subcategory: "Waste", materialId: "pipe-waste", ...base, runs: [], shapes: traps, from: "Fixture outlets", to: "Waste pipes", parent: wasteId, count: traps.length, explodeLayer: 4, explodeDir: { x: 0, y: 0, z: 1 } });
    if (floorDrain.length) plan.items.push({ id: `${rid}:floor-drain`, kind: "floor-drain", name: `Shower floor drain — ${room.name}, ${level.name}`, system: "waste", subcategory: "Waste", materialId: "valve", ...base, concealed: false, runs: [], shapes: floorDrain, from: "Shower tray", to: "Waste pipes", parent: wasteId, count: floorDrain.length, explodeLayer: 6, explodeDir: { x: 0, y: 0, z: 1 } });
  }

  // ----- cold and hot supply ---------------------------------------------------------------
  const coldPts: { fx: PlacedFixture | null; at: V3 }[] = wr.fixtures.map((fx) => ({ fx, at: { ...atEdge(fx.edge, fx.t - coldTap(fx.kind), lane.cold.offset), z: z0 + FIX[fx.kind].supplyZ } }));
  const hotPts = wr.fixtures.filter((fx) => fx.hot).map((fx) => ({ fx, at: { ...atEdge(fx.edge, fx.t + 45, lane.hot.offset), z: z0 + FIX[fx.kind].supplyZ } }));
  const heater = wr.heater;
  const coldRuns: Run[] = [];
  const riserPt = local(f, uRiser, vC);
  const branchStart = local(f, uRiser, lane.cold.offset);
  // Out of the side, along the lane; or, from a corner shaft, forward across the front of the stack's lane and out through the front.
  const exitPt = corner ? local(f, cornerU(lane.cold.offset), 250) : local(f, faceU, lane.cold.offset);
  const inShaftCold: V3[] = corner
    ? [{ ...riserPt, z: coldZ }, { ...local(f, uRiser, 250), z: coldZ }, { ...exitPt, z: coldZ }]
    : [{ ...riserPt, z: coldZ }, { ...branchStart, z: coldZ }, { ...exitPt, z: coldZ }];
  const reach = (offset: number, to: { edge: Edge; t: number }, z: number, r: number) => via(chosen, offset, z, r, to);
  const stubUp = (p: V3, zTrunk: number, r: number): Run => ({ r, points: [{ x: p.x, y: p.y, z: zTrunk }, p] });
  const coldStubs: Run[] = [];
  const supplyTargets = [...coldPts.map((c) => ({ ...c, edge: c.fx!.edge, t: c.fx!.t - coldTap(c.fx!.kind) })), ...(heater ? [{ fx: null, at: heater.inlet, edge: heater.edge, t: heater.t - 45 }] : [])];
  for (const tgt of supplyTargets) {
    const route = reach(lane.cold.offset, { edge: tgt.edge, t: tgt.t }, coldZ, 10);
    if (!route) { fail("The cold-water pipe cannot reach a fixture along the walls without crossing a door, a column or the shaft."); continue; }
    coldRuns.push({ r: 10, points: [...inShaftCold.slice(2), ...route.points.map((p) => ({ x: p.x, y: p.y, z: coldZ }))].filter((p, i, a) => i === 0 || Math.hypot(p.x - a[i - 1]!.x, p.y - a[i - 1]!.y) > 0.5) });
    coldStubs.push(stubUp({ x: route.points[route.points.length - 1]!.x, y: route.points[route.points.length - 1]!.y, z: tgt.at.z }, coldZ, 10));
  }
  const coldAll = [{ r: 10, points: inShaftCold }, ...mergeRuns(coldRuns), ...coldStubs];
  plan.items.push({
    id: `${rid}:supply`, kind: "pipe-cold", name: `Cold-water pipes — ${room.name}, ${level.name}`, system: "cold", subcategory: "Supply", materialId: "pipe-cold", ...base, runs: coldAll, shapes: coldAll.flatMap((r) => runShapes(r)),
    from: `${shaft.name} (cold riser)`, to: [...wr.fixtures.map((x) => x.label), ...(heater ? ["Water heater"] : [])].join(", "), parent: `plumb:riser:${plan.shafts.indexOf(shaft) + 1}`, diameter: 20,
    note: `Branch from the riser through an isolation valve, along the wall ${ductWaste ? "inside the pre-wall duct" : "in the cabinet space"}.`, explodeLayer: 3, explodeDir: { x: 0, y: 0, z: 1 },
    clips: coldAll.flatMap((r) => clipsAlong(r, CLIP_GAP).map((p) => ({ at: p, r: r.r, axis: axisOf(r) }))),
  });
  const valveAt = corner ? local(f, cornerU(lane.cold.offset), 285) : local(f, side === 0 ? 20 : shaft.width - 20, lane.cold.offset);
  const valveAxis = corner ? (Math.abs(f.vx) > 0.5 ? "x" : "y") : Math.abs(f.ux) > 0.5 ? "x" : "y";
  plan.items.push({ id: `${rid}:valve`, kind: "valve", name: `Isolation valve — ${room.name}, ${level.name}`, system: "cold", subcategory: "Valves", materialId: "valve", ...base, runs: [], shapes: [cyl(valveAt.x, valveAt.y, coldZ, 24, 60, valveAxis)], from: "Cold riser", to: "Cold-water branch", parent: `${rid}:supply`, count: 1, explodeLayer: 4, explodeDir: { x: 0, y: 0, z: 1 } });

  if (hotPts.length && heater) {
    const hotZ = z0 + lane.hot.z;
    const hotRuns: Run[] = [];
    const hotStubs: Run[] = [];
    const heaterOut = heater.outlet;
    hotRuns.push({ r: 10, points: [{ x: heaterOut.x, y: heaterOut.y, z: heaterOut.z }, { x: heaterOut.x, y: heaterOut.y, z: hotZ }] });
    for (const h of hotPts) {
      const route = perimeterRoute(ctx, layout, { edge: heater.edge, t: heater.t + 45 }, { edge: h.fx.edge, t: h.fx.t + 45 }, lane.hot.offset, hotZ - 5, hotZ + 5, 10, housing);
      if (!route) { fail(`The hot-water pipe from the heater cannot reach the ${h.fx.label.toLowerCase()} along the walls.`); continue; }
      hotRuns.push({ r: 10, points: route.points.map((p) => ({ x: p.x, y: p.y, z: hotZ })).filter((p, i, a) => i === 0 || Math.hypot(p.x - a[i - 1]!.x, p.y - a[i - 1]!.y) > 0.5) });
      hotStubs.push(stubUp({ x: route.points[route.points.length - 1]!.x, y: route.points[route.points.length - 1]!.y, z: h.at.z }, hotZ, 10));
    }
    const hotAll = [...mergeRuns(hotRuns), ...hotStubs];
    plan.items.push({ id: `${rid}:heater`, kind: "water-heater", name: `Water heater — ${room.name}, ${level.name}`, system: "hot", subcategory: "Hot water", materialId: "appliance", ...base, concealed: false, runs: [], shapes: [heater.shape], from: "Cold-water branch", to: "Hot-water pipes", parent: `${rid}:supply`, count: 1, note: "Electric storage heater (example). Needs its own circuit, a pressure-relief valve and a drain.", explodeLayer: 5, explodeDir: { x: 0, y: 0, z: 1 } });
    plan.items.push({ id: `${rid}:hot`, kind: "pipe-hot", name: `Hot-water pipes — ${room.name}, ${level.name}`, system: "hot", subcategory: "Hot water", materialId: "pipe-hot", ...base, runs: hotAll, shapes: hotAll.flatMap((r) => runShapes(r)), from: "Water heater", to: hotPts.map((h) => h.fx.label).join(", "), parent: `${rid}:heater`, diameter: 20, note: "Insulation of hot pipes is a separate item and is not counted here.", explodeLayer: 3, explodeDir: { x: 0, y: 0, z: 1 }, clips: hotAll.flatMap((r) => clipsAlong(r, CLIP_GAP).map((p) => ({ at: p, r: r.r, axis: axisOf(r) }))) });
  }

  // ----- the fixtures themselves, and the duct that carries the pipes -------------------------------------
  if (wr.fixtures.some((x) => x.shapes.length)) {
    plan.items.push({
      id: `${rid}:fixtures`, kind: "wc", name: `Sanitary fixtures — ${room.name}, ${level.name}`, system: "supply", subcategory: "Fixtures", materialId: "sanitary", ...base, concealed: false, runs: [], shapes: wr.fixtures.flatMap((x) => x.shapes), from: "Supply and waste branches", to: room.name,
      parent: `${rid}:supply`, count: wr.fixtures.length, explodeLayer: 5, explodeDir: { x: 0, y: 0, z: 1 }, note: "The fixture set is an example layout; the real set comes from the brief.",
    });
  }
  // Duct spans: round every pipe leg and every fixture.
  const spans = new Map<Edge, [number, number][]>();
  const addSpan = (e: Edge, a: number, b: number) => spans.set(e, [...(spans.get(e) ?? []), [Math.min(a, b), Math.max(a, b)]]);
  if (wr.ducted) {
    for (const fx of wr.fixtures) addSpan(fx.edge, fx.t - fx.w / 2 - 80, fx.t + fx.w / 2 + 80);
    if (wr.heater) addSpan(wr.heater.edge, wr.heater.t - 260, wr.heater.t + 260);
    addSpan(edge, t0 - 40, t1 + 40);
    // Legs of the routes along the walls.
    for (const run of [...merged, ...coldAll, ...(plan.items.find((i) => i.id === `${rid}:hot`)?.runs ?? [])]) {
      for (let i = 0; i + 1 < run.points.length; i += 1) {
        const a = run.points[i]!; const b = run.points[i + 1]!;
        if (Math.hypot(b.x - a.x, b.y - a.y) < 1) continue;
        for (const e of layout.edges) {
          if (Math.abs((b.x - a.x) * e.ux + (b.y - a.y) * e.uy) < Math.hypot(b.x - a.x, b.y - a.y) * 0.999) continue;
          const off = (a.x - e.a.x) * e.nx + (a.y - e.a.y) * e.ny;
          if (off < 0 || off > wr.ductDepth) continue;
          const ta = (a.x - e.a.x) * e.ux + (a.y - e.a.y) * e.uy; const tb = (b.x - e.a.x) * e.ux + (b.y - e.a.y) * e.uy;
          addSpan(e, ta - 40, tb + 40);
        }
      }
    }
    for (const [e, list] of spans) {
      list.sort((p, q) => p[0] - q[0]);
      const out: [number, number][] = [];
      for (const s of list) { const last = out[out.length - 1]; if (last && s[0] <= last[1] + 1) last[1] = Math.max(last[1], s[1]); else out.push([...s]); }
      for (const [a, b] of out) wr.duct.push({ edge: e, t0: Math.max(0, a), t1: Math.min(e.length, b) });
    }
  }
}

export function ductRect(d: { edge: Edge; t0: number; t1: number }, depth: number): Rect {
  return rectFromPoints([atEdge(d.edge, d.t0, 0), atEdge(d.edge, d.t1, 0), atEdge(d.edge, d.t1, depth), atEdge(d.edge, d.t0, depth)]);
}

export const axisOf = (r: Run): "x" | "y" => {
  const a = r.points[0]!; const b = r.points[r.points.length - 1]!;
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? "x" : "y";
};

export function dedupe2(points: P2[]): P2[] {
  const out: P2[] = [];
  for (const p of points) if (!out.length || Math.hypot(p.x - out[out.length - 1]!.x, p.y - out[out.length - 1]!.y) > 0.5) out.push(p);
  return out;
}

/** The height of a merged horizontal run at a plan point on it, or null. */
export function zOnRuns(runs: Run[], p: P2): number | null {
  for (const run of runs) for (let i = 0; i + 1 < run.points.length; i += 1) {
    const a = run.points[i]!; const b = run.points[i + 1]!;
    const dx = b.x - a.x; const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len);
    if (t < -0.001 || t > 1.001) continue;
    const px = a.x + dx * t; const py = a.y + dy * t;
    if (Math.hypot(px - p.x, py - p.y) <= 12) return a.z + (b.z - a.z) * t;
  }
  return null;
}


/**
 * Why a shaft cannot serve the wet rooms on its storeys, or null when it can: in each of them the fixtures
 * must find a place on the walls and the waste, the cold and the hot pipes must reach every one from the shaft.
 */
export function shaftProblem(ctx: Ctx, shaft: Riser, layoutOf: (room: RoomInfo) => RoomLayout): string | null {
  const { vS, uS } = shaftPoints(shaft);
  const centre = local(shaft.frame, uS, vS);
  for (const level of ctx.levels) {
    for (const room of ctx.roomsOf(level.levelId)) {
      if (!["bath", "wc", "kitchen", "laundry"].includes(room.kind)) continue;
      const layout = layoutOf(room);
      if (!rectInsidePolygon(shaft.housing, layout.clear.poly)) continue;
      const wr = placeRoom(ctx, level, room, layout, shaft);
      const scratch = { items: [], shafts: [shaft], stacks: [{ shaft, centre, bottom: -900, top: 0 }] } as unknown as PlumbingPlan;
      branches(ctx, scratch, wr);
      if (wr.unresolved.length) return `${room.name}, ${level.name}: ${wr.unresolved[0]!.reason}`;
    }
  }
  return null;
}
