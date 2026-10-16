import type { Ctx, LevelInfo, WallFrame } from "./context";
import { pointInPolygon, type P2, type Shape, type V3 } from "./geometry";
import { allObstacles, convexOverlap, type Obstacle } from "./service-routing";
import { rectPoly } from "./geometry";
import type { ComponentRecord, ConstructionModel } from "./types";
import { planElectrical } from "./electrical-plan";
import { planPlumbing } from "./plumbing-plan";
import { planServices } from "./service-plan";

/**
 * Where every pipe and conduit of the model actually is.
 *
 * The services are drawn from routes, and a route can be wrong in ways that
 * look fine from one camera angle: floating through the middle of a room,
 * passing through a column, crossing a wall with no opening cut for it. This
 * reads the finished model back and says, for each run, what it is fixed to.
 * It looks only at the model, so it holds for any project, and it is the
 * check the routing in `service-routing.ts` is held to.
 */

/** The kinds of component that are runs of pipe or conduit, as opposed to the equipment at their ends. */
export const ROUTE_KINDS: ReadonlySet<string> = new Set([
  "conduit", "supply-entry", "earthing-conductor", "pipe-cold", "pipe-hot", "pipe-waste", "pipe-vent", "drain-horizontal", "drain-stack", "riser", "water-entry", "rain-downpipe",
]);

export type RouteSegment = { componentId: string; system: "electrical" | "plumbing"; a: V3; b: V3; r: number };

/** The two ends of a pipe shape: along its axis, tipped by `tilt` when it has a fall (the +axis end is the lower). */
export function cylEnds(shape: Extract<Shape, { t: "cyl" }>): [V3, V3] {
  const h = shape.len / 2;
  const tilt = shape.tilt ?? 0;
  const run = Math.cos(tilt) * h;
  const fall = Math.sin(tilt) * h;
  const c = shape.c;
  if (shape.axis === "z") return [{ x: c.x, y: c.y, z: c.z - h }, { x: c.x, y: c.y, z: c.z + h }];
  if (shape.axis === "x") return [{ x: c.x - run, y: c.y, z: c.z + fall }, { x: c.x + run, y: c.y, z: c.z - fall }];
  return [{ x: c.x, y: c.y - run, z: c.z + fall }, { x: c.x, y: c.y + run, z: c.z - fall }];
}

export function routeSegments(model: ConstructionModel): RouteSegment[] {
  const out: RouteSegment[] = [];
  for (const c of model.components) {
    if ((c.category !== "electrical" && c.category !== "plumbing") || !ROUTE_KINDS.has(c.kind)) continue;
    for (const shape of c.shapes) {
      if (shape.t !== "cyl") continue;
      // A collar at a bend is a short, fat fitting: not a run.
      if (shape.axis === "z" && shape.len < shape.r * 3) continue;
      const [a, b] = cylEnds(shape);
      out.push({ componentId: c.id, system: c.category, a, b, r: shape.r });
    }
  }
  return out;
}

export type Placement = "buried" | "outside" | "in-slab" | "in-shaft" | "in-wall" | "on-wall" | "on-roof" | "at-equipment" | "free";

export type Finding = { componentId: string; other?: string; placement: Placement | "column" | "beam" | "pad" | "ground-beam" | "pedestal" | "unsleeved" | "pipe" | "overlap"; at: V3; note: string };

export type ServiceAudit = {
  segments: number;
  /** Length in mm by what the run is fixed to. */
  length: Record<Placement, number>;
  /** Runs hanging in the open air of a room. */
  floating: Finding[];
  /** Runs through structure, a wall with no sleeve, or another run. */
  collisions: Finding[];
};

const STEP = 100;

/** A wall's rectangle in plan, widened by `reach` on each face. */
function inWall(wall: WallFrame, p: P2, reach = 0): boolean {
  const s = (p.x - wall.start.x) * wall.ux + (p.y - wall.start.y) * wall.uy;
  const n = (p.x - wall.start.x) * wall.nx + (p.y - wall.start.y) * wall.ny;
  return s >= -reach && s <= wall.length + reach && Math.abs(n) <= wall.thickness / 2 + reach;
}

/** Distance off the nearest face of the wall, or null when the point is not alongside it. */
function offFace(wall: WallFrame, p: P2): number | null {
  const s = (p.x - wall.start.x) * wall.ux + (p.y - wall.start.y) * wall.uy;
  if (s < -5 || s > wall.length + 5) return null;
  const n = Math.abs((p.x - wall.start.x) * wall.nx + (p.y - wall.start.y) * wall.ny);
  return n - wall.thickness / 2;
}

export type AuditContext = {
  /** Plan rectangles of the service shafts and riser cupboard: places a run may stand free through every floor. */
  shafts: { x0: number; y0: number; x1: number; y1: number }[];
  /** Wall sleeves: where a run is allowed to go straight through a wall. */
  sleeves: { x: number; y: number; z: number; r: number }[];
  /** Equipment that carries a short pipe beside it: a pump pad, a gutter. */
  supports?: { x0: number; y0: number; x1: number; y1: number; z0: number; z1: number }[];
};

/** What the plans have made allowance for: the shafts, the wall sleeves and the equipment a short pipe hangs from. */
export function auditContextOf(ctx: Ctx): AuditContext {
  const services = planServices(ctx);
  const electrical = planElectrical(ctx);
  const plumbing = planPlumbing(ctx);
  return {
    shafts: [...services.shafts.map((s) => s.housing), ...(services.cupboard ? [services.cupboard.housing] : [])],
    sleeves: [...(electrical.entry?.sleeves ?? []), ...plumbing.sleeves].map((s) => ({ x: s.x, y: s.y, z: s.z, r: s.diameter / 2 })),
    supports: plumbing.supports,
  };
}

export function auditServices(ctx: Ctx, model: ConstructionModel, known: AuditContext = { shafts: [], sleeves: [] }): ServiceAudit {
  const length: Record<Placement, number> = { buried: 0, outside: 0, "in-slab": 0, "in-shaft": 0, "in-wall": 0, "on-wall": 0, "on-roof": 0, "at-equipment": 0, free: 0 };
  const floating: Finding[] = [];
  const collisions: Finding[] = [];
  const segments = routeSegments(model);
  const obstacles = allObstacles(ctx);
  const groundFloor = ctx.ground?.floorZ ?? 0;
  const groundSlab = ctx.ground?.slabThickness ?? 150;
  const roofTop = (ctx.project.roofs[0]?.elevation ?? 0) + (ctx.project.roofs[0]?.thickness ?? 0);

  for (const seg of segments) {
    const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y, seg.b.z - seg.a.z);
    if (len < 1) continue;
    const steps = Math.max(1, Math.ceil(len / STEP));
    const share = len / steps;
    const horizontal = Math.abs(seg.b.z - seg.a.z) < Math.abs(seg.b.x - seg.a.x) + Math.abs(seg.b.y - seg.a.y);
    const dirX = (seg.b.x - seg.a.x) / len;
    const dirY = (seg.b.y - seg.a.y) / len;
    const reported = new Set<string>();
    for (let i = 0; i < steps; i += 1) {
      const t = (i + 0.5) / steps;
      const p: V3 = { x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t, z: seg.a.z + (seg.b.z - seg.a.z) * t };
      const plan = { x: p.x, y: p.y };
      const place = placementOf(ctx, p, seg.r, known, groundFloor - groundSlab, roofTop);
      length[place] += share;
      if (place === "free" && !reported.has("free")) {
        reported.add("free");
        floating.push({ componentId: seg.componentId, placement: "free", at: p, note: "Not fixed to a wall, a slab, a shaft, the roof or the ground." });
      }
      // Structure: columns, beams, footings, ground beams.
      for (const o of obstacles) {
        if (p.z + seg.r <= o.z0 || p.z - seg.r >= o.z1) continue;
        if (!convexOverlap(rectPoly(plan.x - seg.r, plan.y - seg.r, plan.x + seg.r, plan.y + seg.r), o.poly)) continue;
        // A drain through a ground beam goes through a sleeve cast into it.
        if (o.kind === "ground-beam" && known.sleeves.some((s) => Math.hypot(s.x - p.x, s.y - p.y) <= Math.hypot(o.poly[3]!.x - o.poly[0]!.x, o.poly[3]!.y - o.poly[0]!.y) / 2 + seg.r + 25 && Math.abs(s.z - p.z) <= s.r + seg.r)) continue;
        const key = `${o.kind}:${o.id}`;
        if (reported.has(key)) continue;
        reported.add(key);
        collisions.push({ componentId: seg.componentId, placement: o.kind, at: p, note: `Passes through ${o.kind} ${o.id}.` });
      }
      // A run that goes straight through a wall, across its thickness, needs a sleeve there.
      const level = levelAt(ctx, p.z);
      if (horizontal && level) {
        for (const wall of ctx.wallsOf(level.levelId)) {
          if (!inWall(wall, plan, -1)) continue;
          if (Math.abs(dirX * wall.nx + dirY * wall.ny) <= 0.9) continue;
          // A short jog inside the thickness of the wall (a conduit stepping deeper into its chase) does not go through it.
          if (len < wall.thickness * 0.6) continue;
          const sleeved = known.sleeves.some((s) => Math.hypot(s.x - p.x, s.y - p.y) <= wall.thickness && Math.abs(s.z - p.z) <= s.r + 25);
          const key = `wall:${wall.id}:${Math.round(p.x / 50)}:${Math.round(p.y / 50)}`;
          if (!sleeved && !reported.has(key)) {
            reported.add(key);
            collisions.push({ componentId: seg.componentId, placement: "unsleeved", at: p, note: `Crosses wall ${wall.id} with no sleeve.` });
          }
        }
      }
    }
  }

  // Runs through each other.
  const flagged = new Set<string>();
  for (let i = 0; i < segments.length; i += 1) {
    const a = segments[i]!;
    for (let j = i + 1; j < segments.length; j += 1) {
      const b = segments[j]!;
      if (Math.min(a.a.z, a.b.z) - a.r > Math.max(b.a.z, b.b.z) + b.r || Math.min(b.a.z, b.b.z) - b.r > Math.max(a.a.z, a.b.z) + a.r) continue;
      if (Math.min(a.a.x, a.b.x) - a.r > Math.max(b.a.x, b.b.x) + b.r || Math.min(b.a.x, b.b.x) - b.r > Math.max(a.a.x, a.b.x) + a.r) continue;
      if (Math.min(a.a.y, a.b.y) - a.r > Math.max(b.a.y, b.b.y) + b.r || Math.min(b.a.y, b.b.y) - b.r > Math.max(a.a.y, a.b.y) + a.r) continue;
      const hit = segmentsCross(a, b);
      if (!hit) continue;
      // A run that leaves the cupboard's vertical bundle at its own layer is a branch off it, not a crossing.
      if (hit.kind === "cross" && (branchesOffBundle(a, b) || branchesOffBundle(b, a))) continue;
      const key = `${a.componentId}|${b.componentId}|${hit.kind}`;
      if (flagged.has(key)) continue;
      flagged.add(key);
      collisions.push({ componentId: a.componentId, other: b.componentId, placement: hit.kind === "overlap" ? "overlap" : "pipe", at: hit.at, note: hit.kind === "overlap" ? `Lies along ${b.componentId} for ${Math.round(hit.length)} mm.` : `Passes through ${b.componentId}.` });
    }
  }
  return { segments: segments.length, length, floating, collisions };
}

/** `bundle` is a vertical run of a riser bundle in the cupboard and `run` is one of the runs that start from it, at a layer of its own. */
function branchesOffBundle(bundle: RouteSegment, run: RouteSegment): boolean {
  if (!bundle.componentId.endsWith(":trunks") || run.system !== "electrical") return false;
  if (Math.hypot(bundle.b.x - bundle.a.x, bundle.b.y - bundle.a.y) > 1) return false;
  const x = bundle.a.x; const y = bundle.a.y;
  const along = (run.b.x - run.a.x) * (x - run.a.x) + (run.b.y - run.a.y) * (y - run.a.y);
  const len2 = (run.b.x - run.a.x) ** 2 + (run.b.y - run.a.y) ** 2;
  if (len2 < 1 || along < 0 || along > len2) return false;
  const t = along / len2;
  return Math.hypot(run.a.x + (run.b.x - run.a.x) * t - x, run.a.y + (run.b.y - run.a.y) * t - y) < bundle.r + run.r + 2;
}

/** Do two runs meet other than end on? A T or an elbow where one ends on the other is a joint, not a crossing. */
function segmentsCross(a: RouteSegment, b: RouteSegment): { kind: "cross" | "overlap"; at: V3; length: number } | null {
  const u = sub(a.b, a.a); const v = sub(b.b, b.a);
  const lu = Math.hypot(u.x, u.y, u.z); const lv = Math.hypot(v.x, v.y, v.z);
  if (lu < 1 || lv < 1) return null;
  const need = a.r + b.r - 1.5;
  const cosine = Math.abs(dot(u, v)) / (lu * lv);
  if (cosine > 0.9995) {
    // Parallel: they are in each other's way only if they lie on one line and overlap.
    const w = sub(b.a, a.a);
    const along = dot(w, u) / lu;
    const off = Math.hypot(w.x - (u.x / lu) * along, w.y - (u.y / lu) * along, w.z - (u.z / lu) * along);
    if (off > need) return null;
    const t0 = dot(sub(b.a, a.a), u) / lu; const t1 = dot(sub(b.b, a.a), u) / lu;
    const overlap = Math.min(lu, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1));
    return overlap > 60 ? { kind: "overlap", at: lerp(a.a, a.b, 0.5), length: overlap } : null;
  }
  const { d, s, t } = segmentDistance(a.a, u, lu, b.a, v, lv);
  if (d >= need) return null;
  // A joint: one run ends on the other.
  const endOn = (p: V3, r: number, other: RouteSegment) => pointToSegment(p, other.a, other.b) <= r + other.r + 4;
  if (s <= 4 / lu + 1e-6 || s >= 1 - 4 / lu - 1e-6 || t <= 4 / lv + 1e-6 || t >= 1 - 4 / lv - 1e-6 || endOn(a.a, a.r, b) || endOn(a.b, a.r, b) || endOn(b.a, b.r, a) || endOn(b.b, b.r, a)) return null;
  return { kind: "cross", at: lerp(a.a, a.b, s), length: 0 };
}

const sub = (p: V3, q: V3): V3 => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const dot = (p: V3, q: V3) => p.x * q.x + p.y * q.y + p.z * q.z;
const lerp = (p: V3, q: V3, t: number): V3 => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t });

function pointToSegment(p: V3, a: V3, b: V3): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab) || 1;
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  const q = lerp(a, b, t);
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
}

/** Closest approach of two segments (Ericson): the distance, and where along each, as 0..1. */
function segmentDistance(p1: V3, u: V3, lu: number, p2: V3, v: V3, lv: number): { d: number; s: number; t: number } {
  const w = sub(p1, p2);
  const a = dot(u, u); const b = dot(u, v); const c = dot(v, v); const d = dot(u, w); const e = dot(v, w);
  const D = a * c - b * b;
  let sN: number; let sD = D; let tN: number; let tD = D;
  if (D < 1e-9) { sN = 0; sD = 1; tN = e; tD = c; } else {
    sN = b * e - c * d; tN = a * e - b * d;
    if (sN < 0) { sN = 0; tN = e; tD = c; } else if (sN > sD) { sN = sD; tN = e + b; tD = c; }
  }
  if (tN < 0) { tN = 0; if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a; } } else if (tN > tD) { tN = tD; if (-d + b < 0) sN = 0; else if (-d + b > a) sN = sD; else { sN = -d + b; sD = a; } }
  const sc = Math.abs(sN) < 1e-9 ? 0 : sN / sD;
  const tc = Math.abs(tN) < 1e-9 ? 0 : tN / tD;
  const dp = { x: w.x + u.x * sc - v.x * tc, y: w.y + u.y * sc - v.y * tc, z: w.z + u.z * sc - v.z * tc };
  void lu; void lv;
  return { d: Math.hypot(dp.x, dp.y, dp.z), s: sc, t: tc };
}

function levelAt(ctx: Ctx, z: number): LevelInfo | null {
  for (const level of ctx.levels) if (z >= level.floorZ - 1 && z <= level.soffitZ + 1) return level;
  return null;
}

/** What a point on a run is fixed to. */
export function placementOf(ctx: Ctx, p: V3, r: number, known: AuditContext, buriedBelow: number, roofTop: number): Placement {
  const plan = { x: p.x, y: p.y };
  if (known.supports?.some((b) => plan.x >= b.x0 - r && plan.x <= b.x1 + r && plan.y >= b.y0 - r && plan.y <= b.y1 + r && p.z >= b.z0 - r && p.z <= b.z1 + r)) return "at-equipment";
  if (p.z < buriedBelow) return "buried";
  const inside = pointInPolygon(plan, ctx.outline);
  const level = levelAt(ctx, p.z);
  const shaft = known.shafts.find((s) => plan.x >= s.x0 - r && plan.x <= s.x1 + r && plan.y >= s.y0 - r && plan.y <= s.y1 + r);
  if (shaft && (inside || p.z > ctx.top!.topZ)) return "in-shaft";
  if (!inside) {
    // Outside the plan: standing close to an outside wall (a riser or downpipe), or in the ground.
    if (p.z < (ctx.ground?.floorZ ?? 0)) return "buried";
    for (const wall of ctx.walls) {
      if (!wall.exterior) continue;
      const off = offFace(wall, plan);
      if (off !== null && off <= 150) return "on-wall";
    }
    return p.z > roofTop ? "outside" : "free";
  }
  // Inside the building.
  if (p.z >= roofTop - 5) return "on-roof";
  for (const lv of ctx.levels) {
    const above = ctx.levels[lv.index + 1];
    const slabTop = above ? above.floorZ : roofTop;
    if (p.z >= lv.soffitZ - 1 && p.z <= slabTop + 1) return "in-slab";
  }
  // The floor slab of the lowest level, below its floor.
  if (p.z < (ctx.ground?.floorZ ?? 0) && p.z >= (ctx.ground?.floorZ ?? 0) - (ctx.ground?.slabThickness ?? 150) - 1) return "in-slab";
  if (!level) return p.z < (ctx.ground?.floorZ ?? 0) ? "buried" : "free";
  for (const wall of ctx.wallsOf(level.levelId)) if (inWall(wall, plan, 2)) return "in-wall";
  for (const wall of ctx.wallsOf(level.levelId)) {
    const off = offFace(wall, plan);
    if (off !== null && off >= -2 && off <= 230 && p.z >= level.floorZ - 1) return "on-wall";
  }
  return "free";
}

/** The component that a finding is about, for the report. */
export function componentOf(model: ConstructionModel, id: string): ComponentRecord | undefined {
  return model.components.find((c) => c.id === id);
}

export type { Obstacle };
