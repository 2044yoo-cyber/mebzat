import type { Ctx, LevelInfo, RoomInfo, WallFrame } from "./context";
import { box, rectPoly, type P2, type Shape, type V3 } from "./geometry";
import { roomLayout, type Edge, type RoomLayout } from "./layout";
import { slabOpenings } from "./slab-openings";
import { CUPBOARD, local, planServices, type Riser, type Unresolved } from "./service-plan";
import { atEdge, clearRuns, convexOverlap, inflate, levelObstacles, ownRuns, rectInsidePolygon, rectsOverlap, routeAround, SlabLayers, SlabSide, type Rect, type Run } from "./service-routing";
import { pointInPolygon } from "./geometry";
import { planPlumbing } from "./plumbing-plan";

/**
 * The electrical installation, laid out from the building.
 *
 * Distribution goes where a real one goes. A riser cupboard on a wall holds
 * the board on every storey. From it, conduit is cast into the floor slab to
 * reach every switch and socket, and into the slab above to reach every ceiling
 * light, so nothing crosses a room in the open air and nothing has to pass
 * through a beam. Where a conduit meets a fitting it runs up the inside of the
 * wall, in a chase, to a box set in the wall. Each of those positions comes
 * from the wall, slab and fitting it is for.
 */

export const CONDUIT_R = 10;
/** Where the conduit sits in the wall, behind the face, in its chase. */
export const CHASE_INSET = 35;
/** Where the conduit that chains one box to the next sits in the wall: behind the vertical drops. */
export const CHAIN_INSET = 65;
const SOCKETS: Record<string, number> = { bed: 4, living: 6, dining: 4, kitchen: 6, office: 4, circulation: 1, laundry: 3, bath: 1, wc: 0, store: 0, stair: 0, other: 2 };

export type SleeveSpec = { id: string; system: "electrical" | "plumbing"; level: number; x: number; y: number; z: number; axis: "x" | "y"; diameter: number; length: number; wallId: string; note: string; /** What the sleeve is cast or built into: a wall unless stated. */ host?: "ground-beam" };
export type ChaseSpec = { id: string; system: "electrical" | "plumbing"; level: number; wallId: string; at: P2; nx: number; ny: number; ux: number; uy: number; z0: number; z1: number; room: string | null };

export type Fit = {
  kind: "switch" | "socket" | "data" | "fan" | "wall-light";
  edge: Edge; t: number; height: number;
  /** The visible plate or unit, and the back box set in the wall behind it. */
  face: Shape; backBox: Shape;
  /** Where the conduit meets the back box. */
  entry: V3;
};

export type RoomElectrical = {
  id: string;
  level: LevelInfo; room: RoomInfo;
  lightPoint: P2 | null; lightBox: Shape | null; lightEntry: V3 | null;
  detector: { at: P2; box: Shape; kind: "smoke" | "heat" } | null;
  /** Conduit cast in the slab above, from the riser to the ceiling points. */
  ceilingRuns: Run[];
  /** Conduit cast in the floor slab, from the riser to the foot of each wall chase. */
  floorRuns: Run[];
  /** Conduit up the inside of a wall and along it from box to box. */
  wallRuns: Run[];
  fits: Fit[];
  unresolved: Unresolved[];
};

export type ElectricalPlan = {
  cupboard: Riser | null;
  boards: { level: LevelInfo; centre: V3; box: Shape; frameU: number }[];
  /** Per storey: the vertical bundles in the cupboard. */
  risers: { level: LevelInfo; riser: Run | null; floor: Run; ceiling: Run }[];
  entry: null | {
    wall: WallFrame; meter: { centre: V3; size: V3; shape: Shape; outward: P2 };
    service: Run; earth: Run; rod: { x: number; y: number; z: number; len: number };
    sleeves: SleeveSpec[];
  };
  rooms: RoomElectrical[];
  chases: ChaseSpec[];
  unresolved: Unresolved[];
};

const cache = new WeakMap<Ctx, ElectricalPlan>();

/** Heights of the floor slab and of the slab over a level, mid-depth, where conduit is cast. */
export function slabMid(ctx: Ctx, level: LevelInfo, which: "floor" | "ceiling"): { z: number; thickness: number } {
  if (which === "floor") return { z: level.floorZ - level.slabThickness / 2, thickness: level.slabThickness };
  const above = ctx.levels[level.index + 1];
  const t = above ? above.slabThickness : ctx.project.roofs[0]?.thickness ?? level.slabThickness;
  return { z: level.soffitZ + t / 2, thickness: t };
}

/**
 * The conduit layers in a slab, shared by the two storeys that meet in it: the ceiling conduit of the one below
 * and the floor conduit of the one above. Layers are 22 mm apart, the first 28 mm in from the top face, and stop
 * 45 mm short of the bottom steel.
 */
function slabLayersOf(ctx: Ctx, slabIndex: number, cache: Map<number, SlabLayers>): SlabLayers {
  const hit = cache.get(slabIndex);
  if (hit) return hit;
  const below = ctx.levels[slabIndex - 1];
  const above = ctx.levels[slabIndex];
  const top = above ? above.floorZ : (below?.soffitZ ?? 0) + (ctx.project.roofs[0]?.thickness ?? 200);
  const thickness = above ? above.slabThickness : ctx.project.roofs[0]?.thickness ?? 200;
  const count = Math.max(2, Math.min(7, Math.floor((thickness - 73) / 22) + 1));
  const layers = new SlabLayers(Array.from({ length: count }, (_, i) => top - 28 - 22 * i));
  cache.set(slabIndex, layers);
  return layers;
}

/** One face of the slab: the floor of this storey, or the slab over it. */
function layersFor(ctx: Ctx, level: LevelInfo, which: "floor" | "ceiling", cache: Map<number, SlabLayers>): SlabSide {
  return new SlabSide(slabLayersOf(ctx, which === "floor" ? level.index : level.index + 1, cache), which);
}

export function planElectrical(ctx: Ctx): ElectricalPlan {
  const H = { switch: ctx.rules.services.switchHeight, socket: ctx.rules.services.socketHeight, board: ctx.rules.services.boardHeight };
  const hit = cache.get(ctx);
  if (hit) return hit;
  const services = planServices(ctx);
  const plan: ElectricalPlan = { cupboard: services.cupboard, boards: [], risers: [], entry: null, rooms: [], chases: [], unresolved: services.unresolved.filter((u) => u.system === "electrical") };
  cache.set(ctx, plan);
  const cupboard = services.cupboard;
  if (!cupboard || !ctx.ground) return plan;

  const layouts = new Map<string, RoomLayout>();
  const layoutOf = (room: RoomInfo) => { let l = layouts.get(room.id); if (!l) { l = roomLayout(ctx, room); layouts.set(room.id, l); } return l; };
  const edge = layoutOf(ctx.rooms.find((r) => r.id === cupboard.roomId)!).edges[cupboard.edgeIndex]!;
  const f = cupboard.frame;
  const holeFrom = Math.max(CUPBOARD.holeFromWall, cupboard.intrusion > 0 ? cupboard.intrusion + 30 : 0);
  const laneV = Math.min(cupboard.depth - 80, holeFrom + 15);
  const boardU = cupboard.width - 150 - 20;
  const hardRects = [...services.shafts.map((s) => s.housing), cupboard.housing];

  // --- The board on every storey, in the cupboard ---------------------------------------------------------
  for (const level of ctx.levels) {
    const centre = { ...local(f, boardU, 50), z: level.floorZ + H.board };
    plan.boards.push({ level, centre, box: wallBoxAt(f, boardU, 50, level.floorZ + H.board, 300, 400, 100), frameU: boardU });
  }

  // --- Service entry: the meter outside, back to back with the board, through a sleeve in the wall --------
  const host = edge.wall;
  if (host?.exterior) {
    const ground = ctx.ground;
    const outward = { x: -edge.nx, y: -edge.ny };
    const t = host.thickness;
    const meterAt = local(f, boardU, -t - 100);
    const size: V3 = { x: 350, y: 200, z: 450 };
    const horizontalAlong = Math.abs(edge.ux) > 0.999;
    const centre: V3 = { ...meterAt, z: ground.floorZ + H.board };
    const shape = horizontalAlong ? box(centre.x, centre.y, centre.z, size.x, size.y, size.z) : box(centre.x, centre.y, centre.z, size.y, size.x, size.z);
    const z = ground.floorZ + H.board - 50;
    const inner = local(f, boardU, 40);
    const outer = local(f, boardU, -t - 190);
    const service: Run = { r: CONDUIT_R + 5, points: [{ ...outer, z }, { ...inner, z }] };
    const earthZ = ground.floorZ + H.board - 250;
    const earthIn = local(f, boardU + 90, 40);
    const earthOut = local(f, boardU + 90, -t - 45);
    const rod = local(f, boardU + 90, -t - 400);
    const earthBottom = -300;
    const earth: Run = { r: 4, points: [{ ...earthIn, z: earthZ }, { ...earthOut, z: earthZ }, { ...earthOut, z: earthBottom }, { ...rod, z: earthBottom }] };
    const sleeves: SleeveSpec[] = [
      { id: "sleeve:elec:service", system: "electrical", level: 0, x: local(f, boardU, -t / 2).x, y: local(f, boardU, -t / 2).y, z, axis: horizontalAlong ? "y" : "x", diameter: 60, length: t, wallId: host.id, note: "Set in the wall as it is built: the service conduit from the meter passes through it to the board." },
      { id: "sleeve:elec:earth", system: "electrical", level: 0, x: local(f, boardU + 90, -t / 2).x, y: local(f, boardU + 90, -t / 2).y, z: earthZ, axis: horizontalAlong ? "y" : "x", diameter: 30, length: t, wallId: host.id, note: "Carries the earthing conductor from the board's earth bar to the electrode outside." },
    ];
    plan.entry = { wall: host, meter: { centre, size, shape, outward }, service, earth, rod: { x: rod.x, y: rod.y, z: earthBottom, len: 2400 }, sleeves };
  } else {
    plan.unresolved.push({ id: "unresolved:electrical:entry", system: "electrical", level: 0, where: cupboard.name, reason: "The riser cupboard is not on an outside wall, so the meter cannot stand back to back with the board and the service entry cannot be drawn." });
  }

  // --- Rooms ------------------------------------------------------------------------------------------
  const plumbing = planPlumbing(ctx);
  const walled = (layout: RoomLayout) => layout.edges.filter((e) => e.wall);
  const columnsOnGround = ctx.project.structuralColumns.filter((c) => c.levelId === ctx.ground!.levelId).map((c) => inflate({ x0: c.x - c.width / 2, y0: c.y - c.depth / 2, x1: c.x + c.width / 2, y1: c.y + c.depth / 2 }, 40));
  const floorEntries: { owner: string; run: Run }[] = [];
  const ceilingEntries: { owner: string; run: Run }[] = [];
  const byId = new Map<string, RoomElectrical>();
  const slabCache = new Map<number, SlabLayers>();
  for (const level of ctx.levels) {
    // The floor slab of the lowest storey has the column pedestals standing through it.
    const holesFloor = [...slabOpenings(ctx, level.index).map(rectOf), ...(level.index === 0 ? columnsOnGround : [])];
    const holesCeiling = slabOpenings(ctx, level.index + 1).map(rectOf);
    const beamPolys = levelObstacles(ctx, level).filter((o) => o.kind === "beam").map((o) => o.poly);
    const floorLayers = layersFor(ctx, level, "floor", slabCache);
    const ceilLayers = layersFor(ctx, level, "ceiling", slabCache);
    const startFloor = local(f, 60, laneV);
    const startCeil = local(f, 105, laneV + 30);
    for (const room of ctx.roomsOf(level.levelId)) {
      const layout = layoutOf(room);
      const edges = walled(layout);
      const re: RoomElectrical = { id: `${level.index}:${room.id}`, level, room, lightPoint: null, lightBox: null, lightEntry: null, detector: null, ceilingRuns: [], floorRuns: [], wallRuns: [], fits: [], unresolved: [] };
      byId.set(re.id, re);
      const blockers: Rect[] = [...hardRects, ...plumbing.fixtureRects(level, room)];
      const fail = (what: string, why: string) => re.unresolved.push({ id: `unresolved:electrical:${level.index}:${room.id}:${re.unresolved.length}`, system: "electrical", level: level.index, where: `${room.name}, ${level.name}`, reason: `${what}: ${why}` });

      // Ceiling light: near the middle of the room, clear of beams, openings in the slab and the shafts.
      let needsWallLight = false;
      const light = lightPoint(layout, beamPolys, holesCeiling, hardRects);
      if (light) {
        const placed = placeRun(ctx, ceilLayers, startCeil, light, holesCeiling, [light]);
        if (placed) {
          re.lightPoint = light;
          re.ceilingRuns.push(placed.run);
          re.lightBox = box(light.x, light.y, level.soffitZ - 20, 90, 90, 60);
          re.lightEntry = { x: light.x, y: light.y, z: level.soffitZ + 10 };
          re.ceilingRuns.push({ r: CONDUIT_R, points: [{ x: light.x, y: light.y, z: ceilLayers.z[placed.layer]! }, re.lightEntry] });
          ceilingEntries.push({ owner: re.id, run: placed.run }, { owner: re.id, run: re.ceilingRuns[re.ceilingRuns.length - 1]! });
          if (["circulation", "bed", "kitchen", "stair"].includes(room.kind)) {
            const det = detectorPoint(layout, light, beamPolys, holesCeiling, hardRects);
            if (det) {
              const branch = routeCandidates(light, det, holesCeiling, ctx.outline).find((c) => ceilLayers.placeAt(placed.layer, c, [det]));
              if (branch) {
                const z = ceilLayers.z[placed.layer]!;
                const r2: Run = { r: CONDUIT_R, points: branch.map((p) => ({ x: p.x, y: p.y, z })) };
                const stub: Run = { r: CONDUIT_R, points: [{ x: det.x, y: det.y, z }, { x: det.x, y: det.y, z: level.soffitZ + 10 }] };
                re.ceilingRuns.push(r2, stub);
                ceilingEntries.push({ owner: re.id, run: r2 }, { owner: re.id, run: stub });
                re.detector = { at: det, box: box(det.x, det.y, level.soffitZ - 20, 80, 80, 55), kind: room.kind === "kitchen" ? "heat" : "smoke" };
              } else fail("Detector", "its conduit cannot be run in the slab without crossing an opening or another conduit");
            }
          }
        } else needsWallLight = true;
      } else needsWallLight = true;

      // Fittings on the walls: only where there is a wall to put them in.
      type WantFit = { kind: Fit["kind"]; edge: Edge; t: number; height: number; w: number; high: number; deep: number; group: string };
      const wallFits: WantFit[] = [];
      for (const e of edges) {
        for (const eo of e.openings) {
          if (eo.opening.kind === "window") continue;
          const runs = clearRuns(ctx, layout, e, 90, 80, 250).filter(([a, b]) => b - a >= 120);
          const t = pickBeside(eo.t1 + 180, eo.t0 - 180, runs);
          if (t !== null) wallFits.push({ kind: "switch", edge: e, t, height: H.switch, w: 85, high: 85, deep: 12, group: `sw:${e.index}:${Math.round(t)}` });
        }
      }
      if (!wallFits.length) {
        for (const e of edges) {
          const run = clearRuns(ctx, layout, e, 150, 200)[0];
          if (run) { wallFits.push({ kind: "switch", edge: e, t: (run[0] + run[1]) / 2, height: H.switch, w: 85, high: 85, deep: 12, group: `sw:${e.index}:0` }); break; }
        }
      }
      const socketH = room.kind === "kitchen" ? 1100 : H.socket;
      const want = SOCKETS[room.kind] ?? 2;
      const runs = edges.flatMap((e) => clearRuns(ctx, layout, e, 250, 400, 250).map(([t0, t1]) => ({ edge: e, t0, t1 }))).filter((r) => !blockedBy(layout, r.edge, r.t0, r.t1, blockers)).sort((a, b) => (b.t1 - b.t0) - (a.t1 - a.t0));
      const fractions = [0.5, 0.2, 0.8];
      for (let k = 0; k < want && runs.length; k += 1) {
        const r = runs[k % runs.length]!;
        const pass = Math.floor(k / runs.length);
        wallFits.push({ kind: "socket", edge: r.edge, t: r.t0 + (r.t1 - r.t0) * fractions[pass % fractions.length]!, height: socketH, w: 85, high: 85, deep: 18, group: `so:${r.edge.index}:${Math.round(r.t0)}` });
      }
      const firstSocket = wallFits.find((w) => w.kind === "socket");
      if (["living", "office"].includes(room.kind) && firstSocket) {
        const run = runs.find((r) => `so:${r.edge.index}:${Math.round(r.t0)}` === firstSocket.group);
        if (run && firstSocket.t + 250 <= run.t1) wallFits.push({ kind: "data", edge: firstSocket.edge, t: firstSocket.t + 250, height: H.socket, w: 85, high: 85, deep: 15, group: firstSocket.group });
      }
      if (["bath", "wc", "kitchen"].includes(room.kind)) {
        const candidates = [...edges].sort((a, b) => Number(!!b.wall?.exterior) - Number(!!a.wall?.exterior) || b.length - a.length);
        for (const e of candidates) {
          const rs = clearRuns(ctx, layout, e, 300, 400, 250).filter(([a, b]) => !blockedBy(layout, e, a, b, blockers));
          if (rs[0]) { wallFits.push({ kind: "fan", edge: e, t: (rs[0][0] + rs[0][1]) / 2, height: 2200, w: 200, high: 200, deep: 90, group: `fan:${e.index}` }); break; }
        }
      }

      // A room with no clear ceiling (a stairwell under its opening) is lit from the wall.
      if (needsWallLight) {
        let done = false;
        for (const e of [...edges].sort((a, b) => b.length - a.length)) {
          const rs = clearRuns(ctx, layout, e, 300, 400, 250).filter(([a, b]) => !blockedBy(layout, e, a, b, blockers));
          if (rs[0]) { wallFits.push({ kind: "wall-light", edge: e, t: (rs[0][0] + rs[0][1]) / 2, height: 2200, w: 160, high: 160, deep: 80, group: `wl:${e.index}` }); done = true; break; }
        }
        if (!done) fail("Light", "there is no clear ceiling and no clear wall to fix a light to");
      }

      // Conduit to each: down in the floor slab to the foot of the wall, then up the chase. Fittings on one
      // wall run at the same height share a single drop and are chained along the wall behind their boxes.
      const groups = new Map<string, WantFit[]>();
      for (const w of wallFits) groups.set(w.group, [...(groups.get(w.group) ?? []), w]);
      for (const list of groups.values()) {
        list.sort((a, b) => a.t - b.t);
        const first = list[0]!;
        const foot = atEdge(first.edge, first.t, -CHASE_INSET);
        const placed = placeRun(ctx, floorLayers, startFloor, foot, holesFloor, [foot]);
        if (!placed) { for (const w of list) fail(w.kind === "socket" ? "Socket" : w.kind === "switch" ? "Switch" : w.kind === "wall-light" ? "Wall light" : "Outlet", "its conduit cannot be run in the floor slab from the riser without crossing an opening or another conduit"); continue; }
        re.floorRuns.push(placed.run);
        floorEntries.push({ owner: re.id, run: placed.run });
        const zFoot = floorLayers.z[placed.layer]!;
        const chaseTop = level.floorZ + first.height - 37 + 12;
        re.wallRuns.push({ r: CONDUIT_R, points: [{ ...foot, z: zFoot }, { ...foot, z: chaseTop }] });
        plan.chases.push({ id: `chase:elec:${level.index}:${room.id}:${plan.chases.length}`, system: "electrical", level: level.index, wallId: first.edge.wall?.id ?? "", at: foot, nx: first.edge.nx, ny: first.edge.ny, ux: first.edge.ux, uy: first.edge.uy, z0: level.floorZ - 30, z1: level.floorZ + Math.max(...list.map((w) => w.height)) + 60, room: room.name });
        for (let k = 0; k < list.length; k += 1) {
          const w = list[k]!;
          const pos = atEdge(w.edge, w.t, -30 + 22.5);
          const backBox = wallBoxOf(layout, w.edge, w.t, w.height, 75, 75, 45, -30);
          re.fits.push({ kind: w.kind, edge: w.edge, t: w.t, height: w.height, face: wallBoxOf(layout, w.edge, w.t, w.height, w.w, w.high, w.deep, 0), backBox, entry: { x: pos.x, y: pos.y, z: level.floorZ + w.height - 37 } });
          if (k > 0) {
            // The chain between boxes runs deeper in the wall than the vertical drops, so that it passes behind the drop of any other group on the wall.
            const prev = list[k - 1]!;
            const a = atEdge(prev.edge, prev.t, -CHAIN_INSET);
            const b = atEdge(w.edge, w.t, -CHAIN_INSET);
            const zc = level.floorZ + w.height - 35;
            if (k === 1) re.wallRuns.push({ r: CONDUIT_R, points: [{ ...atEdge(first.edge, first.t, -CHASE_INSET), z: zc }, { ...a, z: zc }] });
            re.wallRuns.push({ r: CONDUIT_R, points: [{ ...a, z: zc }, { ...b, z: zc }] });
          }
        }
      }
      plan.unresolved.push(...re.unresolved);
      plan.rooms.push(re);
    }
  }

  // Overlapping stretches in the slabs belong to the first room that has them; nothing is drawn twice.
  const ownedFloor = ownRuns(floorEntries);
  const ownedCeiling = ownRuns(ceilingEntries);
  for (const re of plan.rooms) {
    re.floorRuns = ownedFloor.get(re.id) ?? [];
    // The ceiling list also holds the vertical stubs to the boxes, which `ownRuns` passes through unchanged.
    re.ceilingRuns = ownedCeiling.get(re.id) ?? [];
  }

  // --- The conduit bundles in the cupboard: down to the deepest layer used, up to the deepest layer used -----
  for (const level of ctx.levels) {
    const top = level.floorZ + H.board + 200;
    const pFloor = local(f, 60, laneV);
    const pCeil = local(f, 105, laneV + 30);
    const pRiser = local(f, 150, laneV + 60);
    const out = (u: number, h: number): V3 => ({ ...local(f, u, 50), z: top + h });
    const floorZs = plan.rooms.filter((r) => r.level === level).flatMap((r) => r.floorRuns.flatMap((run) => run.points.map((p) => p.z)));
    const ceilZs = plan.rooms.filter((r) => r.level === level).flatMap((r) => r.ceilingRuns.flatMap((run) => run.points.map((p) => p.z)));
    const floorEnd = floorZs.length ? Math.min(...floorZs) : level.floorZ - 40;
    const ceilEnd = ceilZs.length ? Math.max(...ceilZs.filter((z) => z < level.soffitZ + 0)) : level.soffitZ + 40;
    const floor: Run = { r: CONDUIT_R, points: [out(boardU, 0), out(60, 0), { ...pFloor, z: top }, { ...pFloor, z: floorEnd }] };
    const ceiling: Run = { r: CONDUIT_R, points: [out(boardU - 40, 40), out(105, 40), { ...pCeil, z: top + 40 }, { ...pCeil, z: Number.isFinite(ceilEnd) ? ceilEnd : level.soffitZ + 40 }] };
    const next = ctx.levels[level.index + 1];
    const riser: Run | null = next ? { r: CONDUIT_R + 5, points: [out(boardU + 40, 80), out(150, 80), { ...pRiser, z: top + 80 }, { ...pRiser, z: next.floorZ + H.board - 200 - 80 }] } : null;
    plan.risers.push({ level, riser, floor, ceiling });
  }
  return plan;
}

const rectOf = (h: { x0: number; y0: number; x1: number; y1: number }): Rect => ({ x0: h.x0, y0: h.y0, x1: h.x1, y1: h.y1 });

function wallBoxAt(f: Riser["frame"], u: number, v: number, z: number, width: number, high: number, deep: number): Shape {
  const c = local(f, u, v);
  return Math.abs(f.ux) > 0.999 ? box(c.x, c.y, z, width, deep, high) : box(c.x, c.y, z, deep, width, high);
}

/** A box on a wall face: centre on the edge at `t`, `height` above the floor, `inset` into the room, `deep` thick. */
export function wallBoxOf(layout: RoomLayout, edge: Edge, t: number, height: number, width: number, high: number, deep: number, inset = 0): Shape {
  const p = atEdge(edge, t, inset + deep / 2);
  const z = layout.level.floorZ + height;
  return Math.abs(edge.ux) > 0.999 ? box(p.x, p.y, z, width, deep, high) : box(p.x, p.y, z, deep, width, high);
}

/** The first of two positions beside a door that lies in a clear run of the wall (or the nearest clear spot to it). */
function pickBeside(a: number, b: number, runs: [number, number][]): number | null {
  const inRun = (t: number) => runs.find(([lo, hi]) => t >= lo && t <= hi);
  if (inRun(a)) return a;
  if (inRun(b)) return b;
  let best: number | null = null;
  for (const [lo, hi] of runs) for (const t of [lo, hi]) if (best === null || Math.abs(t - a) < Math.abs(best - a)) best = t;
  return best;
}

function blockedBy(layout: RoomLayout, edge: Edge, t0: number, t1: number, rects: Rect[]): boolean {
  void layout;
  const p0 = atEdge(edge, t0, 0);
  const p1 = atEdge(edge, t1, 260);
  const strip: Rect = { x0: Math.min(p0.x, p1.x), y0: Math.min(p0.y, p1.y), x1: Math.max(p0.x, p1.x), y1: Math.max(p0.y, p1.y) };
  return rects.some((r) => rectsOverlap(inflate(r, 60), strip));
}

function lightPoint(layout: RoomLayout, beamPolys: P2[][], holes: Rect[], housings: Rect[]): P2 | null {
  const c = layout.room.centre;
  const spots: P2[] = [{ x: c.x, y: c.y }];
  for (const r of [250, 500, 750, 1000, 1500]) for (let k = 0; k < 8; k += 1) spots.push({ x: c.x + Math.cos((k * Math.PI) / 4) * r, y: c.y + Math.sin((k * Math.PI) / 4) * r });
  for (const s of spots) {
    const p = { x: Math.round(s.x / 50) * 50, y: Math.round(s.y / 50) * 50 };
    const body: Rect = { x0: p.x - 80, y0: p.y - 80, x1: p.x + 80, y1: p.y + 80 };
    if (!rectInsidePolygon(inflate(body, 250), layout.clear.poly)) continue;
    if (beamPolys.some((b) => convexOverlap(rectPolyOf(inflate(body, 60)), b))) continue;
    if (holes.some((h) => rectsOverlap(inflate(body, 80), h)) || housings.some((h) => rectsOverlap(inflate(body, 80), h))) continue;
    return p;
  }
  return null;
}

function detectorPoint(layout: RoomLayout, light: P2, beamPolys: P2[][], holes: Rect[], housings: Rect[]): P2 | null {
  for (const [dx, dy] of [[500, 500], [-500, 500], [500, -500], [-500, -500], [800, 0], [-800, 0], [0, 800], [0, -800]] as const) {
    const p = { x: light.x + dx, y: light.y + dy };
    const body: Rect = { x0: p.x - 70, y0: p.y - 70, x1: p.x + 70, y1: p.y + 70 };
    if (!rectInsidePolygon(inflate(body, 150), layout.clear.poly)) continue;
    if (beamPolys.some((b) => convexOverlap(rectPolyOf(inflate(body, 60)), b))) continue;
    if (holes.some((h) => rectsOverlap(inflate(body, 80), h)) || housings.some((h) => rectsOverlap(inflate(body, 80), h))) continue;
    return p;
  }
  return null;
}

const rectPolyOf = (r: Rect): P2[] => rectPoly(r.x0, r.y0, r.x1, r.y1);

/**
 * Candidate orthogonal routes in a slab from one plan point to another, round
 * the openings cut through that slab and never leaving the building: the two L
 * shapes first, then Z shapes through a number of mid positions.
 */
export function routeCandidates(a: P2, b: P2, holes: Rect[], outline: P2[]): P2[][] {
  const own = holes.filter((h) => inside(h, a, 40) || inside(h, b, 40));
  const others = holes.filter((h) => !own.includes(h)).map((h) => inflate(h, 40));
  const clear = (p: P2, q: P2) => !others.some((h) => segmentHitsRect(p, q, h)) && pointInPolygon({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, outline) && pointInPolygon(q, outline) && pointInPolygon(p, outline);
  const tries: P2[][] = [[a, { x: b.x, y: a.y }, b], [a, { x: a.x, y: b.y }, b]];
  for (const off of [0, 300, -300, 600, -600, 1000, -1000, 1500, -1500, 2200, -2200]) {
    const mx = (a.x + b.x) / 2 + off;
    const my = (a.y + b.y) / 2 + off;
    tries.push([a, { x: mx, y: a.y }, { x: mx, y: b.y }, b], [a, { x: a.x, y: my }, { x: b.x, y: my }, b]);
  }
  const out: P2[][] = [];
  for (const pts of tries) {
    const clean = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y) > 0.5);
    let ok = true;
    for (let i = 0; i + 1 < clean.length; i += 1) if (!clear(clean[i]!, clean[i + 1]!)) { ok = false; break; }
    if (ok) out.push(clean);
  }
  // Round the openings, when the simple shapes are all stopped, and with each of the first route's lines forbidden for an alternative.
  const around = routeAround(a, b, others, outline);
  if (around) {
    out.push(around);
    for (let i = 1; i + 1 < around.length; i += 1) {
      const p = around[i]!; const q = around[i + 1]!;
      const alt = routeAround(a, b, others, outline, 40, 400, [Math.abs(p.x - q.x) < 0.5 ? { axis: "y" as const, at: p.x } : { axis: "x" as const, at: p.y }].map((l) => (l.axis === "y" ? { axis: "y" as const, at: l.at } : l)));
      if (alt) out.push(alt);
    }
  }
  return out;
}

/** The first route that a layer of the slab will take, as a run at that layer's height. */
function placeRun(ctx: Ctx, layers: SlabSide, a: P2, b: P2, holes: Rect[], drops: P2[]): { run: Run; layer: number } | null {
  for (const route of routeCandidates(a, b, holes, ctx.outline)) {
    const layer = layers.place(route, drops);
    if (layer !== null) return { layer, run: { r: CONDUIT_R, points: route.map((p) => ({ x: p.x, y: p.y, z: layers.z[layer]! })) } };
  }
  // No clear way from the cupboard: tap the nearest conduit already laid, in its own layer, as a branch off it.
  const taps = layers.placed()
    .map((s) => { const p = nearestOnSegment(b, s.a, s.b); return { ...s, p, d: Math.hypot(p.x - b.x, p.y - b.y) }; })
    .sort((x, y) => x.d - y.d)
    .slice(0, 24);
  for (const tap of taps) {
    if (holes.some((h) => inside(h, tap.p, 20))) continue;
    for (const route of routeCandidates(tap.p, b, holes, ctx.outline)) {
      if (route.length < 2) continue;
      if (layers.placeAt(tap.layer, route, drops)) return { layer: tap.layer, run: { r: CONDUIT_R, points: route.map((p) => ({ x: p.x, y: p.y, z: layers.z[tap.layer]! })) } };
    }
  }
  return null;
}

function nearestOnSegment(p: P2, a: P2, b: P2): P2 {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

const inside = (r: Rect, p: P2, slack: number) => p.x >= r.x0 - slack && p.x <= r.x1 + slack && p.y >= r.y0 - slack && p.y <= r.y1 + slack;

function segmentHitsRect(p: P2, q: P2, r: Rect): boolean {
  if (Math.abs(p.x - q.x) < 0.5) {
    const x = p.x; const lo = Math.min(p.y, q.y); const hi = Math.max(p.y, q.y);
    return x > r.x0 && x < r.x1 && hi > r.y0 && lo < r.y1;
  }
  if (Math.abs(p.y - q.y) < 0.5) {
    const y = p.y; const lo = Math.min(p.x, q.x); const hi = Math.max(p.x, q.x);
    return y > r.y0 && y < r.y1 && hi > r.x0 && lo < r.x1;
  }
  return true;
}
