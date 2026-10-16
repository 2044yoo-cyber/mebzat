import { onWall, type Ctx, type LevelInfo, type RoomInfo, type RoomKind } from "./context";
import { pointInPolygon, polygonArea, rectPoly, type P2 } from "./geometry";
import { roomLayout, type Edge, type RoomLayout } from "./layout";
import { stairOpenings } from "./rooms";
import { DUCT_DEPTH, DUCT_HEIGHT, local, type Frame } from "./service-frame";
import { shaftExit, type ExitKey } from "./wet-room";
import { clipConvex } from "./geometry";
import { atEdge, convexOverlap, inflate, levelObstacles, rectInsidePolygon, rectPolygon, rectsOverlap, type Rect } from "./service-routing";

/**
 * Where the services stand and where they cross the building.
 *
 * Everything that goes through a floor or a wall is decided here, once, from
 * the project's own rooms, walls, beams and columns, and then read by the
 * structure (slab openings, wall chases, sleeves) as well as by the
 * electrical and plumbing generators. That is what keeps the stack, its slab
 * opening, the blockwork around it and the pipe in it in the same place.
 */

export const SHAFT = { width: 300, depth: 300 } as const;
/** The electrical riser cupboard: floor to ceiling, with a small sleeve through each slab. */
export const CUPBOARD = { width: 520, depth: 220, holeWidth: 170, holeDepth: 130, holeFromWall: 90 } as const;

export { DUCT_DEPTH, DUCT_HEIGHT, local, type Frame };

export type Riser = {
  id: string;
  kind: "plumbing" | "electrical";
  name: string;
  /** The enclosure, floor to ceiling, in plan. */
  housing: Rect;
  /** The opening through every slab it passes. */
  hole: Rect;
  frame: Frame;
  /** The wall edge it stands against, as the room's layout reads it. */
  edgeIndex: number;
  /** The room at each storey, by name. */
  rooms: string[];
  /** The room it was found in on the lowest storey it serves, and that room's id. */
  roomId: string;
  width: number;
  depth: number;
  /** How far the nearest beam over the wall stands out from its face, mm: nothing that goes through the slabs may be closer to the wall than this. */
  intrusion: number;
  /** For a plumbing shaft: the one way its pipes leave it on every storey. Absent when no way serves every room. */
  exit?: ExitKey;
};

export type Unresolved = { id: string; system: "electrical" | "plumbing"; level: number | null; where: string; reason: string };

export type ServicePlan = {
  /** One enclosure per wet room (stacked wet rooms share one), floor to roof. */
  shafts: Riser[];
  /** The electrical riser cupboard that holds the board on every storey. */
  cupboard: Riser | null;
  unresolved: Unresolved[];
};

const cache = new WeakMap<Ctx, ServicePlan>();

/** The services' layout for a project, worked out once per model build. */
export function planServices(ctx: Ctx): ServicePlan {
  const hit = cache.get(ctx);
  if (hit) return hit;
  const plan: ServicePlan = { shafts: [], cupboard: null, unresolved: [] };
  const debug = (globalThis as { __serviceDebug?: (m: string) => void }).__serviceDebug;
  cache.set(ctx, plan);
  if (!ctx.ground) return plan;
  const layouts = new Map<string, RoomLayout>();
  const layoutOf = (room: RoomInfo) => { let l = layouts.get(room.id); if (!l) { l = roomLayout(ctx, room); layouts.set(room.id, l); } return l; };

  // The electrical cupboard first: it is the more constrained of the two.
  const cupboard = findRiser(ctx, layoutOf, {
    kind: "electrical", id: "riser:electrical", name: "Electrical riser cupboard", width: CUPBOARD.width, depth: CUPBOARD.depth, holeWidth: CUPBOARD.holeWidth, holeDepth: CUPBOARD.holeDepth,
    rooms: orderRooms(ctx, ["circulation", "stair", "other"]), preferExterior: true, taken: [], debug,
  });
  if (cupboard) plan.cupboard = cupboard;
  else plan.unresolved.push({ id: "unresolved:electrical:cupboard", system: "electrical", level: null, where: "Circulation space", reason: "No place for an electrical riser cupboard was found that is clear of beams, columns, doors, windows and the stairs on every storey." });

  // One shaft for each wet room on the lowest storey it appears, shared by the rooms stacked over it.
  const wet = ctx.rooms.filter((room) => WET.includes(room.kind)).sort((a, b) => (ctx.level(a.levelId)!.index - ctx.level(b.levelId)!.index) || a.name.localeCompare(b.name));
  for (const room of wet) {
    const clear = layoutOf(room).clear.poly;
    // Already served by a shaft that stands inside this room?
    if (plan.shafts.some((s) => rectInsidePolygon(s.housing, clear))) continue;
    const taken = [...plan.shafts.map((s) => s.housing), ...(plan.cupboard ? [plan.cupboard.housing] : [])];
    const riser = findRiser(ctx, layoutOf, {
      kind: "plumbing", id: `riser:plumbing:${plan.shafts.length + 1}`, name: `Service shaft ${plan.shafts.length + 1} — ${room.name}`, width: SHAFT.width, depth: SHAFT.depth, holeWidth: SHAFT.width, holeDepth: SHAFT.depth,
      rooms: [room], preferExterior: false, taken, awayFromOpenings: true, debug,
    });
    if (riser) plan.shafts.push(riser);
    else plan.unresolved.push({ id: `unresolved:plumbing:${room.id}`, system: "plumbing", level: ctx.level(room.levelId)?.index ?? null, where: room.name, reason: `No place for a soil stack in ${room.name} was found that is clear of beams, columns, doors and windows and stands in a room on every storey above and below it.` });
  }
  return plan;
}

const WET: RoomKind[] = ["bath", "wc", "kitchen", "laundry"];

function orderRooms(ctx: Ctx, kinds: RoomKind[]): RoomInfo[] {
  const ground = ctx.ground!;
  const onGround = ctx.roomsOf(ground.levelId);
  const first = kinds.flatMap((kind) => onGround.filter((r) => r.kind === kind));
  const rest = onGround.filter((r) => !first.includes(r)).sort((a, b) => b.area - a.area);
  return [...first, ...rest];
}

type Spec = {
  kind: Riser["kind"]; id: string; name: string; width: number; depth: number; holeWidth: number; holeDepth: number;
  rooms: RoomInfo[]; preferExterior: boolean; taken: Rect[]; awayFromOpenings?: boolean;
  /** Called with the reason for every position tried, for the checks. */
  debug?: (message: string) => void;
};

/** The slab openings the stairs make, on every storey: nothing else may stand in them. */
export function stairHoles(ctx: Ctx): Rect[] {
  const out: Rect[] = [];
  for (let i = 1; i <= ctx.levels.length; i += 1) for (const h of stairOpenings(ctx, i)) out.push({ x0: h.x0, y0: h.y0, x1: h.x1, y1: h.y1 });
  return out;
}

/** The plan rectangles doors, passages and windows take, with room to open and to see out. */
export function openingZones(ctx: Ctx, level: LevelInfo, doorReach = 700, windowReach = 300): Rect[] {
  const out: Rect[] = [];
  for (const wall of ctx.wallsOf(level.levelId)) {
    for (const o of wall.openings) {
      const reach = o.kind === "window" ? windowReach : doorReach;
      const pad = o.kind === "window" ? 80 : 120;
      const pts = [onWall(wall, o.s0 - pad, wall.thickness / 2 + reach), onWall(wall, o.s1 + pad, wall.thickness / 2 + reach), onWall(wall, o.s1 + pad, -wall.thickness / 2 - reach), onWall(wall, o.s0 - pad, -wall.thickness / 2 - reach)];
      const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
      out.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
    }
  }
  return out;
}

function findRiser(ctx: Ctx, layoutOf: (room: RoomInfo) => RoomLayout, spec: Spec): Riser | null {
  const stairs = stairHoles(ctx);
  const beamPolys = ctx.levels.flatMap((level) => levelObstacles(ctx, level).filter((o) => o.kind === "beam").map((o) => o.poly));
  const columnPolys = ctx.levels.flatMap((level) => levelObstacles(ctx, level).filter((o) => o.kind === "column").map((o) => o.poly));
  const zones = ctx.levels.map((level) => openingZones(ctx, level, spec.awayFromOpenings ? 700 : 600));
  const clearPolys = (level: LevelInfo) => ctx.roomsOf(level.levelId).map((room) => ({ room, poly: layoutOf(room).clear.poly }));

  let fallback: Riser | null = null;
  for (const room of spec.rooms) {
    const layout = layoutOf(room);
    const edges = [...layout.edges].filter((e) => (Math.abs(e.ux) > 0.999 || Math.abs(e.uy) > 0.999) && e.length >= spec.width + 200);
    // Outside walls first when asked, then the longer edges.
    edges.sort((a, b) => (spec.preferExterior ? Number(!!b.wall?.exterior) - Number(!!a.wall?.exterior) : 0) || b.length - a.length);
    for (const pass of [0, 1]) for (const edge of edges) {
      for (const t of slideOrder(edge.length - spec.width)) {
        const frame: Frame = { origin: atEdge(edge, t, 0), ux: edge.ux, uy: edge.uy, vx: edge.nx, vy: edge.ny };
        const housing = rectFrom(frame, spec.width, spec.depth);
        // A beam over the wall stands out from its face: what passes through the slabs keeps clear of it.
        const intrusion = beamIntrusion(frame, spec.width, beamPolys);
        // First choice is a wall with no beam standing out from it; a beam wall only when there is no other.
        if (pass === 0 && intrusion > 0 && spec.kind === "plumbing") continue;
        const holeFrom = Math.max(spec.kind === "plumbing" ? 0 : CUPBOARD.holeFromWall, intrusion > 0 ? intrusion + 30 : 0);
        const hole = spec.kind === "plumbing"
          ? rectFrom({ ...frame, origin: local(frame, 0, holeFrom) }, spec.width, spec.depth - holeFrom)
          : rectFrom({ ...frame, origin: local(frame, 20, holeFrom) }, spec.holeWidth, Math.min(spec.holeDepth, spec.depth - holeFrom));
        const problem = riserProblem(ctx, spec, housing, hole, { stairs, beamPolys, columnPolys, zones, clearPolys });
        if (spec.debug) spec.debug(`${room.name} edge ${edge.index} t=${t}: ${problem ?? "fits"}`);
        if (problem) continue;
        const riser: Riser = {
          id: spec.id, kind: spec.kind, name: spec.name, housing, hole, frame, edgeIndex: layout.edges.indexOf(edge),
          rooms: ctx.levels.map((level) => clearPolys(level).find((c) => rectInsidePolygon(housing, c.poly))?.room.name ?? ""), roomId: room.id, width: spec.width, depth: spec.depth, intrusion,
        };
        // A shaft is only worth having where the fixtures can be placed and every pipe can reach them, in every wet room it serves.
        if (spec.kind === "plumbing") {
          const found = shaftExit(ctx, riser, layoutOf);
          if (spec.debug) spec.debug(`${room.name} edge ${edge.index} t=${t}: ${"problem" in found ? found.problem : "serves its rooms"}`);
          if ("problem" in found) { fallback ??= riser; continue; }
          riser.exit = found.key;
        }
        return riser;
      }
    }
  }
  return fallback;
}

/** Start positions along an edge: the ends first (a corner is where a stack belongs), then inward. */
function slideOrder(span: number): number[] {
  const out: number[] = [];
  for (let d = 0; d <= span / 2 + 1; d += 50) { out.push(d); if (span - d > d) out.push(span - d); }
  return out;
}

const ccwPoly = (poly: P2[]): P2[] => (poly.reduce((sum, a, i) => { const b = poly[(i + 1) % poly.length]!; return sum + (a.x * b.y - b.x * a.y); }, 0) < 0 ? [...poly].reverse() : poly);

/** How far into the room, from the wall face, any beam reaches along the width of this housing. */
function beamIntrusion(frame: Frame, width: number, beamPolys: P2[][]): number {
  const strip = ccwPoly([local(frame, 0, 0), local(frame, width, 0), local(frame, width, 140), local(frame, 0, 140)]);
  let deepest = 0;
  for (const beam of beamPolys) {
    const piece = clipConvex(strip, ccwPoly(beam));
    if (piece.length < 3) continue;
    for (const p of piece) deepest = Math.max(deepest, (p.x - frame.origin.x) * frame.vx + (p.y - frame.origin.y) * frame.vy);
  }
  return deepest;
}

function rectFrom(frame: Frame, width: number, depth: number): Rect {
  const pts = [local(frame, 0, 0), local(frame, width, 0), local(frame, width, depth), local(frame, 0, depth)];
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Why a housing cannot stand here, or null when it can. */
export function riserProblem(
  ctx: Ctx, spec: Pick<Spec, "kind" | "taken">, housing: Rect, hole: Rect,
  env: { stairs: Rect[]; beamPolys: P2[][]; columnPolys: P2[][]; zones: Rect[][]; clearPolys: (level: LevelInfo) => { room: RoomInfo; poly: P2[] }[] },
): string | null {
  // In a room, with its walls, on every storey.
  for (const level of ctx.levels) if (!env.clearPolys(level).some((c) => rectInsidePolygon(housing, c.poly))) return `not inside a room on ${level.name}`;
  const body = rectPolygon(inflate(housing, 20));
  const holeBody = rectPolygon(inflate(hole, 25));
  // Columns stand in the housing's way; beams only in the way of what goes through the slabs.
  if (env.columnPolys.some((poly) => convexOverlap(body, poly))) return "a column";
  if (env.beamPolys.some((poly) => convexOverlap(holeBody, poly))) return "a beam over the slab opening";
  if (env.zones.some((z) => z.some((r) => rectsOverlap(inflate(housing, 40), r)))) return "a door or window";
  if (env.stairs.some((r) => rectsOverlap(inflate(housing, 100), r))) return "the stairs";
  if (spec.taken.some((r) => rectsOverlap(inflate(housing, 80), r))) return "another riser";
  return null;
}

/** The rectangles through the slab that forms the floor of storey `levelIndex` (and the roof, one past the top). */
export function serviceHoles(ctx: Ctx, levelIndex: number): { id: string; x0: number; y0: number; x1: number; y1: number }[] {
  const plan = planServices(ctx);
  const out: { id: string; x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const shaft of plan.shafts) out.push({ id: shaft.id, ...shaft.hole });
  if (plan.cupboard) out.push({ id: plan.cupboard.id, ...plan.cupboard.hole });
  void levelIndex;
  return out;
}

/** Which riser, if any, a plan point is inside, for the checks and the audit. */
export function riserAt(plan: ServicePlan, p: P2, reach = 0): Riser | null {
  return [...plan.shafts, ...(plan.cupboard ? [plan.cupboard] : [])].find((r) => p.x >= r.housing.x0 - reach && p.x <= r.housing.x1 + reach && p.y >= r.housing.y0 - reach && p.y <= r.housing.y1 + reach) ?? null;
}

export const area = (poly: P2[]) => polygonArea(poly);
export { pointInPolygon, rectPoly };
export type { Edge };
