/**
 * Plain geometry for the construction model.
 *
 * Millimetres throughout, in the house's own frame: X east, Y north (the plan
 * the House Designer draws), Z up. Nothing here knows about three.js; the
 * viewer converts at the last moment.
 */

export type P2 = { x: number; y: number };
export type V3 = { x: number; y: number; z: number };

/**
 * A piece of the model. Boxes may be turned about X, then Y, then Z (radians,
 * extrinsic); cylinders stand along an axis; prisms are a plan outline
 * extruded from z0 to z1. A horizontal cylinder may be tipped by `tilt`
 * (radians) so that its +axis end is the lower one: a drain's fall.
 */
export type Shape =
  | { t: "box"; c: V3; s: V3; rx?: number; ry?: number; rz?: number }
  | { t: "cyl"; c: V3; r: number; len: number; axis: "x" | "y" | "z"; tilt?: number }
  | { t: "prism"; poly: P2[]; z0: number; z1: number; holes?: P2[][] };

export const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });

export function box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rz = 0): Shape {
  // A turn by a multiple of a quarter circle is the same box with its sides swapped: keep it axis-aligned.
  const quarter = Math.round(rz / (Math.PI / 2));
  if (Math.abs(rz - quarter * (Math.PI / 2)) < 1e-9) {
    const odd = Math.abs(quarter) % 2 === 1;
    return { t: "box", c: { x: cx, y: cy, z: cz }, s: odd ? { x: sy, y: sx, z: sz } : { x: sx, y: sy, z: sz } };
  }
  return rz === 0 ? { t: "box", c: { x: cx, y: cy, z: cz }, s: { x: sx, y: sy, z: sz } } : { t: "box", c: { x: cx, y: cy, z: cz }, s: { x: sx, y: sy, z: sz }, rz };
}

/** A box from its low corner and size: easier to write than centres. */
export function boxAt(x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0): Shape {
  return box(x + sx / 2, y + sy / 2, z + sz / 2, sx, sy, sz, rz);
}

export function cyl(cx: number, cy: number, cz: number, r: number, len: number, axis: "x" | "y" | "z"): Shape {
  return { t: "cyl", c: { x: cx, y: cy, z: cz }, r, len, axis };
}

/**
 * A pipe from `a` to `b` that runs along x or y and may fall: the tip of a
 * horizontal run is worked out from the two ends, so the pipe starts and
 * ends exactly where it is asked to. Vertical runs stay upright.
 */
export function pipeBetween(a: V3, b: V3, r: number): Shape {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const run = Math.hypot(dx, dy);
  const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
  if (run < 0.5) return { t: "cyl", c, r, len: Math.abs(dz), axis: "z" };
  if (Math.abs(dx) > 0.5 && Math.abs(dy) > 0.5) throw new Error("pipeBetween: a run must lie along x or y");
  const along = Math.abs(dx) > 0.5 ? "x" : "y";
  const sign = along === "x" ? Math.sign(dx) : Math.sign(dy);
  // Positive tilt lowers the +axis end; a run drawn toward -axis falls the other way round.
  const tilt = Math.atan2(-dz * sign, run);
  const len = Math.hypot(run, dz);
  return Math.abs(tilt) < 1e-9 ? { t: "cyl", c, r, len, axis: along } : { t: "cyl", c, r, len, axis: along, tilt };
}

export function prism(poly: P2[], z0: number, z1: number, holes?: P2[][]): Shape {
  return { t: "prism", poly: poly.map((p) => ({ x: p.x, y: p.y })), z0, z1, ...(holes && holes.length ? { holes: holes.map((h) => h.map((p) => ({ x: p.x, y: p.y }))) } : {}) };
}

/** A rectangle as a counter-clockwise plan outline. */
export function rectPoly(x0: number, y0: number, x1: number, y1: number): P2[] {
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}

/** A beam, wall or pipe run: a box along a plan line between two points. */
export function alongLine(a: P2, b: P2, width: number, z0: number, z1: number, extendStart = 0, extendEnd = 0): Shape {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const ux = length === 0 ? 1 : dx / length;
  const uy = length === 0 ? 0 : dy / length;
  const total = length + extendStart + extendEnd;
  const mid = (total / 2) - extendStart;
  return box(a.x + ux * mid, a.y + uy * mid, (z0 + z1) / 2, total, width, z1 - z0, Math.atan2(dy, dx));
}

export function dist(a: P2, b: P2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function polygonArea(points: readonly P2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonBounds(points: readonly P2[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export function pointInPolygon(p: P2, poly: readonly P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function centroid(points: readonly P2[]): P2 {
  const n = points.length || 1;
  return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
}

/** The four plan corners of a box shape, counter-clockwise. */
export function boxFootprint(shape: Extract<Shape, { t: "box" }>): P2[] {
  const rz = shape.rz ?? 0;
  const cos = Math.cos(rz);
  const sin = Math.sin(rz);
  const hx = shape.s.x / 2;
  const hy = shape.s.y / 2;
  return [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([lx, ly]) => ({ x: shape.c.x + lx! * cos - ly! * sin, y: shape.c.y + lx! * sin + ly! * cos }));
}

/** Round to a tenth of a millimetre, so ids and totals do not carry float dust. */
export const round1 = (value: number) => Math.round(value * 10) / 10;
export const round3 = (value: number) => Math.round(value * 1000) / 1000;

// ---------------------------------------------------------------------------
// Net volumes: concrete counted once
// ---------------------------------------------------------------------------

/** A convex vertical prism: a counter-clockwise convex plan outline between two heights. */
export type Prism = { poly: P2[]; z0: number; z1: number; holes?: P2[][] };

export function prismOfShape(shape: Shape): Prism | null {
  if (shape.t === "box") {
    if ((shape.rx ?? 0) !== 0 || (shape.ry ?? 0) !== 0) return null;
    return { poly: boxFootprint(shape), z0: shape.c.z - shape.s.z / 2, z1: shape.c.z + shape.s.z / 2 };
  }
  if (shape.t === "prism") return { poly: ensureCcw(shape.poly), z0: shape.z0, z1: shape.z1, ...(shape.holes ? { holes: shape.holes } : {}) };
  return null;
}

function ensureCcw(poly: P2[]): P2[] {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum < 0 ? [...poly].reverse() : poly;
}

/** Sutherland–Hodgman: `subject` clipped to the convex, counter-clockwise `clip`. */
export function clipConvex(subject: P2[], clip: P2[]): P2[] {
  let output = subject;
  for (let i = 0; i < clip.length && output.length > 0; i += 1) {
    const a = clip[i]!;
    const b = clip[(i + 1) % clip.length]!;
    const input = output;
    output = [];
    const inside = (p: P2) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -1e-9;
    // Where the segment p→q meets the infinite line through a→b.
    const cross = (p: P2, q: P2): P2 => {
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const d1 = ex * (p.y - a.y) - ey * (p.x - a.x);
      const d2 = ex * (q.y - a.y) - ey * (q.x - a.x);
      const t = d1 === d2 ? 0 : d1 / (d1 - d2);
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    };
    for (let j = 0; j < input.length; j += 1) {
      const current = input[j]!;
      const previous = input[(j + input.length - 1) % input.length]!;
      const currentIn = inside(current);
      const previousIn = inside(previous);
      if (currentIn) {
        if (!previousIn) output.push(cross(previous, current));
        output.push(current);
      } else if (previousIn) output.push(cross(previous, current));
    }
  }
  return output;
}

/** `subject` cut by the left side (inside, for a counter-clockwise clip) of the directed edge a→b. */
function leftOfEdge(subject: P2[], a: P2, b: P2): P2[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const F = 1e7;
  const nx = -uy * F;
  const ny = ux * F;
  return clipConvex(subject, [{ x: a.x - ux * F, y: a.y - uy * F }, { x: a.x + ux * F, y: a.y + uy * F }, { x: a.x + ux * F + nx, y: a.y + uy * F + ny }, { x: a.x - ux * F + nx, y: a.y - uy * F + ny }]);
}

function rightOfEdge(subject: P2[], a: P2, b: P2): P2[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const F = 1e7;
  const nx = -uy * F;
  const ny = ux * F;
  return clipConvex(subject, [{ x: a.x - ux * F, y: a.y - uy * F }, { x: a.x - ux * F - nx, y: a.y - uy * F - ny }, { x: a.x + ux * F - nx, y: a.y + uy * F - ny }, { x: a.x + ux * F, y: a.y + uy * F }]);
}

/** The part of convex `p` that lies outside convex counter-clockwise `q`, as disjoint convex pieces. */
export function subtractConvex(p: P2[], q: P2[]): P2[][] {
  const pieces: P2[][] = [];
  let remaining = p;
  for (let i = 0; i < q.length && remaining.length >= 3; i += 1) {
    const a = q[i]!;
    const b = q[(i + 1) % q.length]!;
    const outside = rightOfEdge(remaining, a, b);
    if (outside.length >= 3 && polygonArea(outside) > 1e-6) pieces.push(outside);
    remaining = leftOfEdge(remaining, a, b);
  }
  return pieces;
}

type Rect4 = { x0: number; y0: number; x1: number; y1: number };

/**
 * The rectangle a polygon is, when it is one with its sides along the axes; otherwise null. A convex polygon whose
 * area equals that of its bounding box is that box, however many repeated or collinear points it was given with.
 */
function asAxisRect(poly: P2[]): Rect4 | null {
  if (poly.length < 3) return null;
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
  const box = (x1 - x0) * (y1 - y0);
  if (box <= 0) return null;
  return Math.abs(polygonArea(poly) - box) <= box * 1e-9 + 1e-9 ? { x0, y0, x1, y1 } : null;
}

/** Area of a union of axis-aligned rectangles by compressing the coordinates: exact, and never worse than n³ however the rectangles touch. */
function unionOfRects(rects: Rect4[]): number {
  const xs = [...new Set(rects.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((r) => [r.y0, r.y1]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i += 1) {
    const cx = (xs[i]! + xs[i + 1]!) / 2;
    const live = rects.filter((r) => r.x0 <= cx && r.x1 >= cx);
    if (!live.length) continue;
    for (let j = 0; j + 1 < ys.length; j += 1) {
      const cy = (ys[j]! + ys[j + 1]!) / 2;
      if (live.some((r) => r.y0 <= cy && r.y1 >= cy)) area += (xs[i + 1]! - xs[i]!) * (ys[j + 1]! - ys[j]!);
    }
  }
  return area;
}

/**
 * Area of the union of convex polygons, any number of them. Each is cut
 * against what has already been counted and only its new part is added, so
 * a connected grid of beams and columns costs no more than the sum of its
 * parts.
 */
export function unionArea(all: P2[][]): number {
  // A sliver with no area (a beam lying along the edge of the region) adds nothing and only multiplies the pieces.
  const polys = all.filter((poly) => poly.length >= 3 && polygonArea(poly) > 1e-6);
  const rects = polys.map(asAxisRect);
  if (rects.length && rects.every((r) => r !== null)) return unionOfRects(rects as Rect4[]);
  const disjoint: P2[][] = [];
  for (const raw of polys) {
    const poly = ensureCcw(raw);
    if (poly.length < 3) continue;
    let pieces: P2[][] = [poly];
    for (const existing of disjoint) {
      pieces = pieces.flatMap((piece) => subtractConvex(piece, existing));
      if (pieces.length === 0) break;
    }
    disjoint.push(...pieces);
  }
  return disjoint.reduce((sum, piece) => sum + polygonArea(piece), 0);
}

/**
 * The volume each prism adds, in order: itself less whatever the earlier ones
 * already occupy. Column, then beam, then slab — so a beam does not count the
 * part inside its column, and a slab does not count the part a beam fills.
 * The sum is the volume of the union; nothing is counted twice.
 */
export function netVolumes(prisms: readonly Prism[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < prisms.length; i += 1) {
    const me = prisms[i]!;
    const holeArea = (me.holes ?? []).reduce((sum, hole) => sum + polygonArea(hole), 0);
    const gross = (polygonArea(me.poly) - holeArea) * (me.z1 - me.z0);
    const earlier = prisms.slice(0, i).filter((p) => p.z0 < me.z1 - 1e-9 && p.z1 > me.z0 + 1e-9);
    if (earlier.length === 0) { out.push(gross); continue; }
    const cuts = [me.z0, me.z1, ...earlier.flatMap((p) => [p.z0, p.z1])].filter((z) => z >= me.z0 - 1e-9 && z <= me.z1 + 1e-9).sort((a, b) => a - b);
    let overlap = 0;
    for (let k = 0; k + 1 < cuts.length; k += 1) {
      const lo = cuts[k]!;
      const hi = cuts[k + 1]!;
      if (hi - lo < 1e-9) continue;
      const mid = (lo + hi) / 2;
      const active = earlier.filter((p) => p.z0 <= mid && p.z1 >= mid);
      if (active.length === 0) continue;
      const clipped = active.map((p) => clipConvex(me.poly, p.poly)).filter((poly) => poly.length >= 3);
      overlap += unionArea(clipped) * (hi - lo);
    }
    out.push(Math.max(0, gross - overlap));
  }
  return out;
}
