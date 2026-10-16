import type { Ctx, LevelInfo } from "./context";
import { cyl, pointInPolygon, pipeBetween, rectPoly, type P2, type Shape, type V3 } from "./geometry";
import { footingGroups, groundBeams, pedestalsOf } from "./structure-data";
import type { Edge, RoomLayout } from "./layout";

/**
 * Routing for the pipes and conduits of the construction model.
 *
 * A service is not placed by choosing coordinates. It is run along something
 * real: a wall face, the inside of a wall, the mid-depth of a slab, a service
 * shaft. Every position here is read from the project's own walls, floors,
 * beams, columns and openings, so it moves with them when the building's
 * dimensions change, and a route that cannot be made without going through
 * structure comes back as `null` for the caller to flag, never as a line drawn
 * through it.
 */

export type Rect = { x0: number; y0: number; x1: number; y1: number };

export const rectPolygon = (r: Rect): P2[] => rectPoly(r.x0, r.y0, r.x1, r.y1);
export const inflate = (r: Rect, by: number): Rect => ({ x0: r.x0 - by, y0: r.y0 - by, x1: r.x1 + by, y1: r.y1 + by });
export const rectsOverlap = (a: Rect, b: Rect): boolean => a.x0 < b.x1 - 1e-6 && a.x1 > b.x0 + 1e-6 && a.y0 < b.y1 - 1e-6 && a.y1 > b.y0 + 1e-6;
export const rectCentre = (r: Rect): P2 => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });

/** Do two convex polygons share any area? Touching edges do not count. */
export function convexOverlap(a: P2[], b: P2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const nx = q.y - p.y;
      const ny = p.x - q.x;
      let minA = Infinity; let maxA = -Infinity; let minB = Infinity; let maxB = -Infinity;
      for (const v of a) { const d = v.x * nx + v.y * ny; if (d < minA) minA = d; if (d > maxA) maxA = d; }
      for (const v of b) { const d = v.x * nx + v.y * ny; if (d < minB) minB = d; if (d > maxB) maxB = d; }
      const len = Math.hypot(nx, ny) || 1;
      if (maxA <= minB + 1e-6 * len || maxB <= minA + 1e-6 * len) return false;
    }
  }
  return true;
}

/** The rectangle lies inside the polygon; resting against its edge counts as inside (a point on the boundary is shrunk off it first). */
export const rectInsidePolygon = (r: Rect, poly: readonly P2[], slack = 1): boolean =>
  [{ x: r.x0 + slack, y: r.y0 + slack }, { x: r.x1 - slack, y: r.y0 + slack }, { x: r.x1 - slack, y: r.y1 - slack }, { x: r.x0 + slack, y: r.y1 - slack }].every((p) => pointInPolygon(p, poly as P2[]));

// ---------------------------------------------------------------------------
// What is in the way
// ---------------------------------------------------------------------------

export type Obstacle = { id: string; kind: "column" | "beam" | "pad" | "ground-beam" | "pedestal" | "pipe"; poly: P2[]; z0: number; z1: number };

export function levelObstacles(ctx: Ctx, level: LevelInfo): Obstacle[] {
  const out: Obstacle[] = [];
  for (const column of ctx.project.structuralColumns.filter((c) => c.levelId === level.levelId)) {
    out.push({ id: column.id, kind: "column", z0: level.floorZ, z1: level.soffitZ, poly: rectPoly(column.x - column.width / 2, column.y - column.depth / 2, column.x + column.width / 2, column.y + column.depth / 2) });
  }
  for (const beam of ctx.project.structuralBeams.filter((b) => b.levelId === level.levelId)) {
    const dx = beam.end.x - beam.start.x;
    const dy = beam.end.y - beam.start.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (beam.width / 2);
    const ny = (dx / len) * (beam.width / 2);
    out.push({ id: beam.id, kind: "beam", z0: beam.elevation, z1: beam.elevation + beam.depth, poly: [{ x: beam.start.x + nx, y: beam.start.y + ny }, { x: beam.end.x + nx, y: beam.end.y + ny }, { x: beam.end.x - nx, y: beam.end.y - ny }, { x: beam.start.x - nx, y: beam.start.y - ny }] });
  }
  return out;
}

/** Everything structural a service might meet, above and below the ground floor. */
export function allObstacles(ctx: Ctx): Obstacle[] {
  const out: Obstacle[] = [];
  for (const level of ctx.levels) out.push(...levelObstacles(ctx, level));
  for (const group of footingGroups(ctx)) out.push({ id: group.id, kind: "pad", z0: group.bottomZ, z1: group.topZ, poly: rectPoly(group.rect.x0, group.rect.y0, group.rect.x1, group.rect.y1) });
  for (const beam of groundBeams(ctx)) {
    const dx = beam.b.x - beam.a.x;
    const dy = beam.b.y - beam.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (beam.width / 2);
    const ny = (dx / len) * (beam.width / 2);
    out.push({ id: beam.id, kind: "ground-beam", z0: beam.z0, z1: beam.z1, poly: [{ x: beam.a.x + nx, y: beam.a.y + ny }, { x: beam.b.x + nx, y: beam.b.y + ny }, { x: beam.b.x - nx, y: beam.b.y - ny }, { x: beam.a.x - nx, y: beam.a.y - ny }] });
  }
  for (const ped of pedestalsOf(ctx)) out.push({ id: `pedestal:${ped.col.id}`, kind: "pedestal", z0: ped.z0, z1: ped.z1, poly: rectPoly(ped.col.x - ped.col.width / 2, ped.col.y - ped.col.depth / 2, ped.col.x + ped.col.width / 2, ped.col.y + ped.col.depth / 2) });
  return out;
}

/** The first obstacle a straight run of radius `r` from `a` to `b` goes through, or null. */
export function firstObstacleHit(obstacles: readonly Obstacle[], a: V3, b: V3, r: number, step = 50): Obstacle | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    for (const o of obstacles) {
      if (p.z + r <= o.z0 || p.z - r >= o.z1) continue;
      // The pipe has width: test a small square round its centre against the obstacle.
      const probe = rectPoly(p.x - r, p.y - r, p.x + r, p.y + r);
      if (convexOverlap(probe, o.poly)) return o;
    }
  }
  return null;
}

/** A straight pipe passing through a ground beam, at right angles, through the middle of its depth: where a sleeve is cast in. */
export type BeamCrossing = { beam: Obstacle; at: V3; axis: "x" | "y"; width: number };

/**
 * How a straight run goes through the ground beams in its way, or null when it cannot: it must cross each at near
 * a right angle, with its whole pipe (and a margin for the sleeve) inside the beam's depth, and neither start nor
 * end inside a beam. A pipe may not run along a beam or through its top or bottom.
 */
export function beamCrossings(beams: readonly Obstacle[], a: V3, b: V3, r: number, margin = 60, step = 25): BeamCrossing[] | null {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const run = Math.hypot(dx, dy);
  const len = Math.hypot(run, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / step));
  const out: BeamCrossing[] = [];
  for (const beam of beams) {
    let from = -1;
    const finish = (to: number): boolean => {
      // The stretch inside the beam, from sample `from` to sample `to`.
      const pa = { x: a.x + dx * (from / n), y: a.y + dy * (from / n), z: a.z + (b.z - a.z) * (from / n) };
      const pb = { x: a.x + dx * (to / n), y: a.y + dy * (to / n), z: a.z + (b.z - a.z) * (to / n) };
      const bx = beam.poly[1]!.x - beam.poly[0]!.x; const by = beam.poly[1]!.y - beam.poly[0]!.y;
      const bl = Math.hypot(bx, by) || 1;
      if (run < 1 || Math.abs((dx * by - dy * bx) / (run * bl)) < 0.85) return false;
      const lo = Math.min(pa.z, pb.z) - r - margin; const hi = Math.max(pa.z, pb.z) + r + margin;
      if (lo < beam.z0 || hi > beam.z1) return false;
      const width = Math.hypot(beam.poly[3]!.x - beam.poly[0]!.x, beam.poly[3]!.y - beam.poly[0]!.y);
      out.push({ beam, at: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, z: (pa.z + pb.z) / 2 }, axis: Math.abs(dx) >= Math.abs(dy) ? "x" : "y", width });
      return true;
    };
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const p = { x: a.x + dx * t, y: a.y + dy * t, z: a.z + (b.z - a.z) * t };
      const inside = p.z + r > beam.z0 && p.z - r < beam.z1 && pointInPolygon({ x: p.x, y: p.y }, beam.poly);
      if (inside && from < 0) { if (i === 0) return null; from = i; }
      if (!inside && from >= 0) { if (!finish(i - 1)) return null; from = -1; }
    }
    if (from >= 0) return null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Walls: where fittings can stand, and what a pipe along them runs into
// ---------------------------------------------------------------------------

/** The spans of an edge a column would stand in front of, `reach` into the room. */
export function columnSpans(ctx: Ctx, layout: RoomLayout, edge: Edge, reach = 250, margin = 60): [number, number][] {
  const spans: [number, number][] = [];
  for (const column of ctx.project.structuralColumns.filter((c) => c.levelId === layout.room.levelId)) {
    const poly = rectPoly(column.x - column.width / 2, column.y - column.depth / 2, column.x + column.width / 2, column.y + column.depth / 2);
    // The strip between the wall face and `reach` inside the room.
    const a = edge.a; const b = edge.b;
    const strip = [{ x: a.x - edge.nx * 5, y: a.y - edge.ny * 5 }, { x: b.x - edge.nx * 5, y: b.y - edge.ny * 5 }, { x: b.x + edge.nx * reach, y: b.y + edge.ny * reach }, { x: a.x + edge.nx * reach, y: a.y + edge.ny * reach }];
    if (!convexOverlap(poly, strip)) continue;
    const ts = poly.map((p) => (p.x - a.x) * edge.ux + (p.y - a.y) * edge.uy);
    spans.push([Math.min(...ts) - margin, Math.max(...ts) + margin]);
  }
  return spans;
}

/** The span of an edge a rectangle in plan stands in front of, within `reach` of the wall face, or null. */
export function rectSpan(edge: Edge, rect: Rect, reach: number): [number, number] | null {
  const a = edge.a; const b = edge.b;
  const strip = [{ x: a.x - edge.nx * 5, y: a.y - edge.ny * 5 }, { x: b.x - edge.nx * 5, y: b.y - edge.ny * 5 }, { x: b.x + edge.nx * reach, y: b.y + edge.ny * reach }, { x: a.x + edge.nx * reach, y: a.y + edge.ny * reach }];
  const poly = rectPolygon(rect);
  if (!convexOverlap(poly, strip)) return null;
  const ts = poly.map((p) => (p.x - a.x) * edge.ux + (p.y - a.y) * edge.uy);
  return [Math.min(...ts), Math.max(...ts)];
}

/** Free runs of an edge: clear of openings and of columns, shortened by `margin` at each end. */
export function clearRuns(ctx: Ctx, layout: RoomLayout, edge: Edge, margin = 150, minLength = 300, reach = 250): [number, number][] {
  let runs: [number, number][] = [[margin, edge.length - margin]];
  const blocked = [...edge.openings.map((o) => [o.t0, o.t1] as [number, number]), ...columnSpans(ctx, layout, edge, reach)];
  for (const [t0, t1] of blocked) {
    runs = runs.flatMap(([a, b]) => (t1 + margin <= a || t0 - margin >= b ? [[a, b] as [number, number]] : ([[a, Math.min(b, t0 - margin)], [Math.max(a, t1 + margin), b]] as [number, number][])));
  }
  return runs.filter(([a, b]) => b - a >= minLength);
}

/** The plan point at `t` along an edge, `inset` into the room (negative is into the wall). */
export function atEdge(edge: Edge, t: number, inset = 0): P2 {
  return { x: edge.a.x + edge.ux * t + edge.nx * inset, y: edge.a.y + edge.uy * t + edge.ny * inset };
}

/** Is there an opening on this edge between `t0` and `t1` that a run at height `z` (radius `r`) would cross? */
export function openingBetween(edge: Edge, t0: number, t1: number, z: number, r: number, clear = 40): boolean {
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  return edge.openings.some((o) => o.t1 + clear > lo && o.t0 - clear < hi && o.opening.z0 < z + r + 10 && o.opening.z1 > z - r - 10);
}

export type WallPoint = { edge: Edge; t: number };

/**
 * A pipe run along the wall faces of a room from one wall point to another, at
 * `offset` off the face and height `z`. It goes whichever way round the room
 * is shorter and is not stopped by a door, a window that comes down to it, or
 * a column; with both ways stopped, there is no route and `null` comes back.
 */
export function perimeterRoute(ctx: Ctx, layout: RoomLayout, from: WallPoint, to: WallPoint, offset: number, zLo: number, zHi: number, r: number, blockers: Rect[] = []): { points: P2[]; length: number } | null {
  const edges = layout.edges;
  const n = edges.length;
  const iFrom = edges.indexOf(from.edge);
  const iTo = edges.indexOf(to.edge);
  if (iFrom < 0 || iTo < 0) return null;
  const line = (e: Edge, t: number): P2 => atEdge(e, t, offset);
  const corner = (e1: Edge, e2: Edge): P2 => {
    // Intersection of the two offset lines.
    const p1 = atEdge(e1, 0, offset);
    const p2 = atEdge(e2, 0, offset);
    const cross = e1.ux * e2.uy - e1.uy * e2.ux;
    if (Math.abs(cross) < 1e-9) return p2;
    const s = ((p2.x - p1.x) * e2.uy - (p2.y - p1.y) * e2.ux) / cross;
    return { x: p1.x + e1.ux * s, y: p1.y + e1.uy * s };
  };
  const walk = (dir: 1 | -1): { points: P2[]; length: number } | null => {
    const points: P2[] = [line(from.edge, from.t)];
    let k = iFrom;
    let t = from.t;
    for (let guard = 0; guard <= n; guard += 1) {
      const e = edges[k]!;
      if (k === iTo && (dir === 1 ? to.t >= t - 1e-6 : to.t <= t + 1e-6) && (guard === 0 || true)) {
        if (openingBetween(e, t, to.t, (zLo + zHi) / 2, r + (zHi - zLo) / 2) || columnBetween(ctx, layout, e, t, to.t, offset, r) || rectBetween(e, t, to.t, offset + r + 10, blockers)) return null;
        points.push(line(to.edge, to.t));
        return { points: dedupe(points), length: polyLength(dedupe(points)) };
      }
      const end = dir === 1 ? e.length : 0;
      if (openingBetween(e, t, end, (zLo + zHi) / 2, r + (zHi - zLo) / 2) || columnBetween(ctx, layout, e, t, end, offset, r) || rectBetween(e, t, end, offset + r + 10, blockers)) return null;
      const next = edges[(k + dir + n) % n]!;
      points.push(dir === 1 ? corner(e, next) : corner(next, e));
      k = (k + dir + n) % n;
      t = dir === 1 ? 0 : next.length;
    }
    return null;
  };
  const a = walk(1);
  const b = walk(-1);
  if (a && b) return a.length <= b.length ? a : b;
  return a ?? b;
}

function rectBetween(edge: Edge, t0: number, t1: number, reach: number, rects: Rect[]): boolean {
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  return rects.some((r) => { const span = rectSpan(edge, r, reach); return !!span && span[1] > lo + 0.5 && span[0] < hi - 0.5; });
}

function columnBetween(ctx: Ctx, layout: RoomLayout, edge: Edge, t0: number, t1: number, offset: number, r: number): boolean {
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  return columnSpans(ctx, layout, edge, offset + r + 20, 0).some(([a, b]) => b > lo && a < hi);
}

function dedupe(points: P2[]): P2[] {
  const out: P2[] = [];
  for (const p of points) if (!out.length || Math.hypot(p.x - out[out.length - 1]!.x, p.y - out[out.length - 1]!.y) > 0.5) out.push(p);
  return out;
}

export function polyLength(points: readonly P2[]): number {
  let sum = 0;
  for (let i = 0; i + 1 < points.length; i += 1) sum += Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.y - points[i]!.y);
  return sum;
}

// ---------------------------------------------------------------------------
// Runs of pipe with a fall, joined and supported
// ---------------------------------------------------------------------------

/** A run of pipe or conduit: plan points, each at a height, joined by straight pieces. */
export type Run = { points: V3[]; r: number };

export const at3 = (p: P2, z: number): V3 => ({ x: p.x, y: p.y, z });

/**
 * A route in plan, lifted into 3D with a constant `fall` per metre toward its
 * LAST point: the pipe is lowest where it ends. `zEnd` is the height at that
 * end. A run with no fall is level at `zEnd`.
 */
export function runWithFall(plan: readonly P2[], zEnd: number, fall: number, r: number): Run {
  const out: V3[] = [];
  let remaining = polyLength(plan);
  for (let i = 0; i < plan.length; i += 1) {
    out.push({ x: plan[i]!.x, y: plan[i]!.y, z: zEnd + fall * remaining });
    if (i + 1 < plan.length) remaining -= Math.hypot(plan[i + 1]!.x - plan[i]!.x, plan[i + 1]!.y - plan[i]!.y);
  }
  return { points: out, r };
}

export function runLength(run: Run): number {
  let sum = 0;
  for (let i = 0; i + 1 < run.points.length; i += 1) {
    const a = run.points[i]!;
    const b = run.points[i + 1]!;
    sum += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return sum;
}

/** One straight piece from point to point: along an axis, or a run that falls. */
function piece(a: V3, b: V3, r: number): Shape | null {
  const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
  if (Math.hypot(dx, dy, dz) < 1) return null;
  const horizontal = Math.hypot(dx, dy) > 0.5;
  if (horizontal && Math.abs(dx) > 0.5 && Math.abs(dy) > 0.5) throw new Error("A run must turn at a corner, not cut across it");
  if (!horizontal) return cyl(a.x, a.y, (a.z + b.z) / 2, r, Math.abs(dz), "z");
  return pipeBetween(a, b, r);
}

/** The shapes of a run: straight pieces, and a collar at every bend so the joint can be seen. */
export function runShapes(run: Run, collars = true): Shape[] {
  const shapes: Shape[] = [];
  const pts = run.points;
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const s = piece(pts[i]!, pts[i + 1]!, run.r);
    if (s) shapes.push(s);
  }
  if (collars) {
    for (let i = 1; i + 1 < pts.length; i += 1) {
      const a = pts[i - 1]!; const p = pts[i]!; const b = pts[i + 1]!;
      const d1 = [p.x - a.x, p.y - a.y, p.z - a.z];
      const d2 = [b.x - p.x, b.y - p.y, b.z - p.z];
      const l1 = Math.hypot(...(d1 as [number, number, number])) || 1;
      const l2 = Math.hypot(...(d2 as [number, number, number])) || 1;
      const dot = (d1[0]! * d2[0]! + d1[1]! * d2[1]! + d1[2]! * d2[2]!) / (l1 * l2);
      if (dot > 0.999) continue;
      shapes.push(cyl(p.x, p.y, p.z, run.r * 1.35, run.r * 2.2, "z"));
    }
  }
  return shapes;
}

/** Support clips along the horizontal pieces of a run, every `spacing` mm. */
export function clipsAlong(run: Run, spacing: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i + 1 < run.points.length; i += 1) {
    const a = run.points[i]!; const b = run.points[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (len < 300 || Math.hypot(b.x - a.x, b.y - a.y) < 1) continue;
    const n = Math.max(1, Math.round(len / spacing));
    for (let k = 0; k < n; k += 1) {
      const t = (k + 0.5) / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

/** Merge runs whose straight pieces overlap on the same line, so a shared trunk is one pipe, not several drawn on top of each other. */
export function mergeRuns(runs: readonly Run[]): Run[] {
  type Seg = { a: V3; b: V3; r: number };
  const segs: Seg[] = [];
  for (const run of runs) for (let i = 0; i + 1 < run.points.length; i += 1) segs.push({ a: run.points[i]!, b: run.points[i + 1]!, r: run.r });
  const keyOf = (s: Seg) => {
    const dx = s.b.x - s.a.x; const dy = s.b.y - s.a.y;
    const horizontal = Math.hypot(dx, dy) > 0.5;
    if (!horizontal) return `v:${Math.round(s.a.x / 5) * 5}:${Math.round(s.a.y / 5) * 5}:${s.r}`;
    return Math.abs(dx) > Math.abs(dy) ? `x:${Math.round(s.a.y / 5) * 5}:${s.r}` : `y:${Math.round(s.a.x / 5) * 5}:${s.r}`;
  };
  const groups = new Map<string, Seg[]>();
  for (const s of segs) { const k = keyOf(s); groups.set(k, [...(groups.get(k) ?? []), s]); }
  const out: Run[] = [];
  for (const [key, list] of groups) {
    const axis = key[0]!;
    if (axis === "v") {
      const first = list[0]!;
      // Overlapping verticals merge only when they overlap or touch.
      const sorted = [...list].sort((p, q) => Math.min(p.a.z, p.b.z) - Math.min(q.a.z, q.b.z));
      let cur = { lo: Math.min(sorted[0]!.a.z, sorted[0]!.b.z), hi: Math.max(sorted[0]!.a.z, sorted[0]!.b.z) };
      for (const s of sorted.slice(1)) {
        const l = Math.min(s.a.z, s.b.z); const h = Math.max(s.a.z, s.b.z);
        if (l <= cur.hi + 1) cur.hi = Math.max(cur.hi, h);
        else { out.push({ points: [{ x: first.a.x, y: first.a.y, z: cur.lo }, { x: first.a.x, y: first.a.y, z: cur.hi }], r: first.r }); cur = { lo: l, hi: h }; }
      }
      out.push({ points: [{ x: first.a.x, y: first.a.y, z: cur.lo }, { x: first.a.x, y: first.a.y, z: cur.hi }], r: first.r });
      continue;
    }
    // Horizontal: cut at every end, keep each elementary interval that any segment covers, at the height it has there.
    const along = (p: V3) => (axis === "x" ? p.x : p.y);
    const breaks = [...new Set(list.flatMap((s) => [along(s.a), along(s.b)].map((v) => Math.round(v * 10) / 10)))].sort((p, q) => p - q);
    const zAt = (s: Seg, v: number) => { const a = along(s.a); const b = along(s.b); return a === b ? s.a.z : s.a.z + ((s.b.z - s.a.z) * (v - a)) / (b - a); };
    const pieces: { v0: number; v1: number; z0: number; z1: number }[] = [];
    for (let i = 0; i + 1 < breaks.length; i += 1) {
      const v0 = breaks[i]!; const v1 = breaks[i + 1]!;
      const cover = list.find((s) => Math.min(along(s.a), along(s.b)) <= v0 + 0.05 && Math.max(along(s.a), along(s.b)) >= v1 - 0.05);
      if (cover) pieces.push({ v0, v1, z0: zAt(cover, v0), z1: zAt(cover, v1) });
    }
    // Join consecutive pieces that continue in a straight line at the same fall.
    const fixed = axis === "x" ? list[0]!.a.y : list[0]!.a.x;
    let i = 0;
    while (i < pieces.length) {
      let j = i;
      while (j + 1 < pieces.length && Math.abs(pieces[j]!.v1 - pieces[j + 1]!.v0) < 0.2 && Math.abs(pieces[j]!.z1 - pieces[j + 1]!.z0) < 0.5 && Math.abs((pieces[j + 1]!.z1 - pieces[j + 1]!.z0) / (pieces[j + 1]!.v1 - pieces[j + 1]!.v0) - (pieces[i]!.z1 - pieces[i]!.z0) / (pieces[i]!.v1 - pieces[i]!.v0)) < 1e-4) j += 1;
      const a = axis === "x" ? { x: pieces[i]!.v0, y: fixed, z: pieces[i]!.z0 } : { x: fixed, y: pieces[i]!.v0, z: pieces[i]!.z0 };
      const b = axis === "x" ? { x: pieces[j]!.v1, y: fixed, z: pieces[j]!.z1 } : { x: fixed, y: pieces[j]!.v1, z: pieces[j]!.z1 };
      out.push({ points: [a, b], r: list[0]!.r });
      i = j + 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Layers of conduit cast in a slab
// ---------------------------------------------------------------------------

type Seg2 = { a: P2; b: P2 };

const crossProperly = (p: Seg2, q: Seg2): boolean => {
  const d = (a: P2, b: P2, c: P2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(q.a, q.b, p.a); const d2 = d(q.a, q.b, p.b); const d3 = d(p.a, p.b, q.a); const d4 = d(p.a, p.b, q.b);
  return d1 * d2 < -1e-6 && d3 * d4 < -1e-6;
};

/** Two runs in one layer are in each other's way if they cross, or run side by side too close to be two conduits. */
const inTheWay = (p: Seg2, q: Seg2): boolean => {
  if (crossProperly(p, q)) return true;
  const vertical = (s: Seg2) => Math.abs(s.a.x - s.b.x) < 0.5;
  if (vertical(p) !== vertical(q)) return false;
  if (vertical(p)) {
    const gap = Math.abs(p.a.x - q.a.x);
    const overlap = Math.min(Math.max(p.a.y, p.b.y), Math.max(q.a.y, q.b.y)) - Math.max(Math.min(p.a.y, p.b.y), Math.min(q.a.y, q.b.y));
    return gap > 0.5 && gap < 24 && overlap > 20;
  }
  const gap = Math.abs(p.a.y - q.a.y);
  const overlap = Math.min(Math.max(p.a.x, p.b.x), Math.max(q.a.x, q.b.x)) - Math.max(Math.min(p.a.x, p.b.x), Math.min(q.a.x, q.b.x));
  return gap > 0.5 && gap < 24 && overlap > 20;
};

/** The two faces of a slab: the top, which the floor of the storey above comes out of, and the soffit, which the ceiling below comes out of. */
type SlabFace = "floor" | "ceiling";

/** Two stretches on one line and sharing some length of it: runs of one face merge there, but those of two faces would be one conduit in two storeys. */
const alongSameLine = (p: Seg2, q: Seg2): boolean => {
  const vertical = (s: Seg2) => Math.abs(s.a.x - s.b.x) < 0.5;
  if (vertical(p) !== vertical(q)) return false;
  if (vertical(p)) {
    return Math.abs(p.a.x - q.a.x) <= 0.5 && Math.min(Math.max(p.a.y, p.b.y), Math.max(q.a.y, q.b.y)) - Math.max(Math.min(p.a.y, p.b.y), Math.min(q.a.y, q.b.y)) > 20;
  }
  return Math.abs(p.a.y - q.a.y) <= 0.5 && Math.min(Math.max(p.a.x, p.b.x), Math.max(q.a.x, q.b.x)) - Math.max(Math.min(p.a.x, p.b.x), Math.min(q.a.x, q.b.x)) > 20;
};

const distToSeg = (p: P2, s: Seg2): number => {
  const dx = s.b.x - s.a.x; const dy = s.b.y - s.a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / l2));
  return Math.hypot(p.x - (s.a.x + dx * t), p.y - (s.a.y + dy * t));
};

/**
 * The conduits cast in one face of a slab, in layers. Layer 0 is the one
 * nearest the face the conduits come out of (the soffit for a ceiling light,
 * the top for a socket), so a conduit coming out of layer 2 passes layers 1
 * and 0 on its way; a run goes in the first layer where it neither crosses
 * another run nor has to come out through one.
 */
export class SlabLayers {
  readonly z: number[];
  private readonly segs: (Seg2 & { side: SlabFace })[][];
  private readonly drops: P2[][];
  constructor(z: number[]) { this.z = z; this.segs = z.map(() => []); this.drops = z.map(() => []); }

  /** Whether a new stretch from `side` cannot go in this layer: it crosses or crowds a neighbour, or lies along a run of the other face. */
  private blocked(layer: number, mine: Seg2[], side: SlabFace): boolean {
    return mine.some((m) => this.segs[layer]!.some((s) => inTheWay(m, s) || (s.side !== side && alongSameLine(m, s))));
  }

  /** The same, but only in the given layer: a branch off a run that is already there. */
  placeAt(layer: number, points: readonly P2[], drops: readonly P2[], side: SlabFace = "floor"): boolean {
    const mine: Seg2[] = [];
    for (let i = 0; i + 1 < points.length; i += 1) mine.push({ a: points[i]!, b: points[i + 1]! });
    if (this.blocked(layer, mine, side)) return false;
    this.segs[layer]!.push(...mine.map((m) => ({ ...m, side })));
    this.drops[layer]!.push(...drops);
    return true;
  }

  /** Every stretch of conduit one face has placed so far, with its layer: what a new run of that face may be tapped off. */
  placed(side: SlabFace): { layer: number; a: P2; b: P2 }[] {
    return this.segs.flatMap((list, layer) => list.filter((s) => s.side === side).map((s) => ({ layer, a: s.a, b: s.b })));
  }

  /**
   * A run for the top face of the slab (`floor`: the floor of the storey above, whose conduit comes up out of the
   * top) or the bottom face (`ceiling`: the ceiling of the storey below, whose conduit comes down out of the soffit).
   * Layers are listed from the top down; each run takes the first free layer from its own face, so the two
   * storeys that share a slab share its depth without ever sharing a layer.
   */
  place(points: readonly P2[], drops: readonly P2[], side: SlabFace = "floor"): number | null {
    const mine: Seg2[] = [];
    for (let i = 0; i + 1 < points.length; i += 1) mine.push({ a: points[i]!, b: points[i + 1]! });
    const n = this.z.length;
    const order = Array.from({ length: n }, (_, i) => (side === "floor" ? i : n - 1 - i));
    for (const layer of order) {
      if (this.blocked(layer, mine, side)) continue;
      // The layers between this one and the face it comes out of: nothing of theirs may be where its drops pass.
      const between = side === "floor" ? Array.from({ length: layer }, (_, j) => j) : Array.from({ length: n - 1 - layer }, (_, j) => layer + 1 + j);
      if (drops.some((d) => between.some((j) => this.segs[j]!.some((s) => distToSeg(d, s) < 26)))) continue;
      // Layers further in, on the same side, whose own drops come out through this one.
      const further = side === "floor" ? Array.from({ length: n - 1 - layer }, (_, j) => layer + 1 + j) : Array.from({ length: layer }, (_, j) => j);
      if (mine.some((m) => further.some((j) => this.drops[j]!.some((d) => distToSeg(d, m) < 26)))) continue;
      this.segs[layer]!.push(...mine.map((m) => ({ ...m, side })));
      this.drops[layer]!.push(...drops);
      return layer;
    }
    return null;
  }
}

/** One face of a shared slab, as the electrical plan uses it. */
export class SlabSide {
  constructor(private readonly slab: SlabLayers, private readonly side: SlabFace) {}
  get z(): number[] { return this.slab.z; }
  place(points: readonly P2[], drops: readonly P2[]): number | null { return this.slab.place(points, drops, this.side); }
  placeAt(layer: number, points: readonly P2[], drops: readonly P2[]): boolean { return this.slab.placeAt(layer, points, drops, this.side); }
  placed(): { layer: number; a: P2; b: P2 }[] { return this.slab.placed(this.side); }
}

/**
 * Give each overlapping stretch of conduit to the first run that has it. Runs
 * from different rooms that share a corridor line, in the same layer, become
 * one conduit, owned by the room that came first, so nothing is drawn twice.
 */
export function ownRuns(entries: { owner: string; run: Run }[]): Map<string, Run[]> {
  type Piece = { owner: string; a: V3; b: V3; r: number };
  const out = new Map<string, Run[]>();
  const push = (owner: string, run: Run) => out.set(owner, [...(out.get(owner) ?? []), run]);
  const groups = new Map<string, { owner: string; a: V3; b: V3; r: number }[]>();
  for (const { owner, run } of entries) {
    for (let i = 0; i + 1 < run.points.length; i += 1) {
      const a = run.points[i]!; const b = run.points[i + 1]!;
      const horizontal = Math.hypot(b.x - a.x, b.y - a.y) > 0.5;
      if (!horizontal) { push(owner, { points: [a, b], r: run.r }); continue; }
      const key = Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? `x:${Math.round(a.y / 5) * 5}:${Math.round(a.z / 5) * 5}:${run.r}` : `y:${Math.round(a.x / 5) * 5}:${Math.round(a.z / 5) * 5}:${run.r}`;
      groups.set(key, [...(groups.get(key) ?? []), { owner, a, b, r: run.r }]);
    }
  }
  for (const [key, list] of groups) {
    const axis = key[0]!;
    const along = (p: V3) => (axis === "x" ? p.x : p.y);
    const breaks = [...new Set(list.flatMap((s) => [along(s.a), along(s.b)].map((v) => Math.round(v * 10) / 10)))].sort((p, q) => p - q);
    const pieces: (Piece & { v0: number; v1: number })[] = [];
    for (let i = 0; i + 1 < breaks.length; i += 1) {
      const v0 = breaks[i]!; const v1 = breaks[i + 1]!;
      const cover = list.find((s) => Math.min(along(s.a), along(s.b)) <= v0 + 0.05 && Math.max(along(s.a), along(s.b)) >= v1 - 0.05);
      if (!cover) continue;
      const z = cover.a.z;
      const fixed = axis === "x" ? cover.a.y : cover.a.x;
      const mk = (v: number): V3 => (axis === "x" ? { x: v, y: fixed, z } : { x: fixed, y: v, z });
      pieces.push({ owner: cover.owner, a: mk(v0), b: mk(v1), r: cover.r, v0, v1 });
    }
    let i = 0;
    while (i < pieces.length) {
      let j = i;
      while (j + 1 < pieces.length && pieces[j + 1]!.owner === pieces[i]!.owner && Math.abs(pieces[j]!.v1 - pieces[j + 1]!.v0) < 0.2) j += 1;
      push(pieces[i]!.owner, { points: [pieces[i]!.a, pieces[j]!.b], r: pieces[i]!.r });
      i = j + 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// A route round openings, when the simple shapes will not do
// ---------------------------------------------------------------------------

/**
 * The shortest orthogonal route in plan from `a` to `b` that keeps clear of the
 * rectangles and stays inside the outline, with a penalty for every turn so
 * that it makes few. It works on the grid formed by the coordinates of the
 * ends and of the rectangles' edges, so it passes exactly through both ends.
 * `avoidLines` can forbid whole lines (to ask for an alternative). Null when no
 * route exists.
 */
export function routeAround(a: P2, b: P2, avoid: Rect[], outline: readonly P2[], margin = 40, turnCost = 400, avoidLines: { axis: "x" | "y"; at: number }[] = []): P2[] | null {
  const boxes = avoid.map((r) => inflate(r, margin));
  const xs = new Set<number>([a.x, b.x]);
  const ys = new Set<number>([a.y, b.y]);
  for (const r of boxes) { xs.add(r.x0); xs.add(r.x1); ys.add(r.y0); ys.add(r.y1); }
  const ox = outline.map((p) => p.x); const oy = outline.map((p) => p.y);
  for (const x of [Math.min(...ox) + 150, Math.max(...ox) - 150]) xs.add(x);
  for (const y of [Math.min(...oy) + 150, Math.max(...oy) - 150]) ys.add(y);
  const X = [...xs].sort((p, q) => p - q);
  const Y = [...ys].sort((p, q) => p - q);
  const ix = (v: number) => X.findIndex((x) => Math.abs(x - v) < 1e-6);
  const iy = (v: number) => Y.findIndex((y) => Math.abs(y - v) < 1e-6);
  const free = (p: P2, q: P2) => {
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    if (!pointInPolygon(mid, outline as P2[]) || !pointInPolygon(q, outline as P2[]) || !pointInPolygon(p, outline as P2[])) return false;
    for (const r of boxes) {
      if (Math.abs(p.x - q.x) < 0.5) { if (p.x > r.x0 + 1e-6 && p.x < r.x1 - 1e-6 && Math.max(p.y, q.y) > r.y0 + 1e-6 && Math.min(p.y, q.y) < r.y1 - 1e-6) return false; }
      else if (p.y > r.y0 + 1e-6 && p.y < r.y1 - 1e-6 && Math.max(p.x, q.x) > r.x0 + 1e-6 && Math.min(p.x, q.x) < r.x1 - 1e-6) return false;
    }
    return !avoidLines.some((l) => (l.axis === "x" ? Math.abs(p.y - q.y) < 0.5 && Math.abs(p.y - l.at) < 60 : Math.abs(p.x - q.x) < 0.5 && Math.abs(p.x - l.at) < 60));
  };
  // Dijkstra over (x index, y index, direction).
  type State = { i: number; j: number; d: number };
  const key = (s: State) => (s.i * Y.length + s.j) * 5 + s.d;
  const dist = new Map<number, number>();
  const prev = new Map<number, State | null>();
  const queue: { s: State; c: number }[] = [];
  const start: State = { i: ix(a.x), j: iy(a.y), d: 4 };
  dist.set(key(start), 0); prev.set(key(start), null); queue.push({ s: start, c: 0 });
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let goal: State | null = null;
  while (queue.length) {
    queue.sort((p, q) => q.c - p.c);
    const { s, c } = queue.pop()!;
    if (c > (dist.get(key(s)) ?? Infinity) + 1e-9) continue;
    if (s.i === ix(b.x) && s.j === iy(b.y)) { goal = s; break; }
    for (let d = 0; d < 4; d += 1) {
      const ni = s.i + dirs[d]![0]!; const nj = s.j + dirs[d]![1]!;
      if (ni < 0 || nj < 0 || ni >= X.length || nj >= Y.length) continue;
      const p = { x: X[s.i]!, y: Y[s.j]! }; const q = { x: X[ni]!, y: Y[nj]! };
      if (!free(p, q)) continue;
      const step = Math.hypot(q.x - p.x, q.y - p.y) + (s.d !== 4 && s.d !== d ? turnCost : 0);
      const next: State = { i: ni, j: nj, d };
      const nc = c + step;
      if (nc < (dist.get(key(next)) ?? Infinity) - 1e-9) { dist.set(key(next), nc); prev.set(key(next), s); queue.push({ s: next, c: nc }); }
    }
  }
  if (!goal) return null;
  const pts: P2[] = [];
  for (let s: State | null = goal; s; s = prev.get(key(s)) ?? null) pts.push({ x: X[s.i]!, y: Y[s.j]! });
  pts.reverse();
  // Drop the points in the middle of a straight stretch.
  return pts.filter((p, i) => i === 0 || i === pts.length - 1 || !((pts[i - 1]!.x === p.x && p.x === pts[i + 1]!.x) || (pts[i - 1]!.y === p.y && p.y === pts[i + 1]!.y)));
}
