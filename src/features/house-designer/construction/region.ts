import { pointInPolygon, type P2 } from "./geometry";

/**
 * Plan regions: a polygon, perhaps with holes, and lines drawn across it. Reinforcement is laid in a slab by
 * drawing lines across it and keeping the parts that are in the concrete, so a bar stops at the edge of the
 * slab, at the edge of an opening and at nothing else, whatever shape the slab is.
 */

const signedArea = (poly: readonly P2[]): number => poly.reduce((sum, a, i) => { const b = poly[(i + 1) % poly.length]!; return sum + (a.x * b.y - b.x * a.y); }, 0) / 2;

/** The polygon in counter-clockwise order. */
export const counterClockwise = (poly: readonly P2[]): P2[] => (signedArea(poly) < 0 ? [...poly].reverse() : [...poly]);

/**
 * The polygon moved outward by `d` mm on every side (inward when `d` is negative), corners mitred. Collinear and
 * repeated points are dropped first. A very sharp corner is not run out to a spike: the mitre is limited.
 */
export function offsetPolygon(poly: readonly P2[], d: number): P2[] {
  const clean = counterClockwise(poly).filter((p, i, all) => {
    const prev = all[(i + all.length - 1) % all.length]!;
    const next = all[(i + 1) % all.length]!;
    if (Math.hypot(p.x - prev.x, p.y - prev.y) < 1e-6) return false;
    return Math.abs((p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x)) > 1e-6;
  });
  const n = clean.length;
  if (n < 3 || d === 0) return clean;
  const normals = clean.map((p, i) => {
    const q = clean[(i + 1) % n]!;
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    // Outward is to the right of the direction of travel for a counter-clockwise polygon.
    return { x: (q.y - p.y) / len, y: -(q.x - p.x) / len };
  });
  return clean.map((p, i) => {
    const a = normals[(i + n - 1) % n]!;
    const b = normals[i]!;
    const k = Math.max(0.25, 1 + a.x * b.x + a.y * b.y);
    return { x: p.x + (d * (a.x + b.x)) / k, y: p.y + (d * (a.y + b.y)) / k };
  });
}

/** Where the segment a→b crosses the edges of a polygon, as fractions of the way along it. */
function crossings(a: P2, b: P2, poly: readonly P2[]): number[] {
  const out: number[] = [];
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const sx = q.x - p.x;
    const sy = q.y - p.y;
    const denom = rx * sy - ry * sx;
    if (Math.abs(denom) < 1e-12) continue;
    const t = ((p.x - a.x) * sy - (p.y - a.y) * sx) / denom;
    const u = ((p.x - a.x) * ry - (p.y - a.y) * rx) / denom;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) out.push(t);
  }
  return out;
}

/**
 * The parts of the segment a→b that are inside `outer` and outside every hole, as [from, to] fractions of the way
 * along it, in order. A segment lying along an edge is not reliably in or out, so lines should not be drawn along
 * the edges: leave the cover between them.
 */
export function clipToRegion(a: P2, b: P2, outer: readonly P2[], holes: readonly (readonly P2[])[] = []): [number, number][] {
  const cuts = [0, 1, ...crossings(a, b, outer), ...holes.flatMap((h) => crossings(a, b, h))].sort((x, y) => x - y);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const t0 = cuts[i]!;
    const t1 = cuts[i + 1]!;
    if (t1 - t0 < 1e-9) continue;
    const mid = { x: a.x + ((b.x - a.x) * (t0 + t1)) / 2, y: a.y + ((b.y - a.y) * (t0 + t1)) / 2 };
    if (!pointInPolygon(mid, outer) || holes.some((h) => pointInPolygon(mid, h))) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - t0) < 1e-9) last[1] = t1; else out.push([t0, t1]);
  }
  return out;
}

/** The part of the segment a→b that is in the region and contains the point at fraction `at` of the way along it, or null. */
export function clipThrough(a: P2, b: P2, at: number, outer: readonly P2[], holes: readonly (readonly P2[])[] = []): [number, number] | null {
  return clipToRegion(a, b, outer, holes).find(([t0, t1]) => at >= t0 - 1e-9 && at <= t1 + 1e-9) ?? null;
}

/** A rectangle as a polygon, grown by `by` on every side. */
export const rectRegion = (r: { x0: number; y0: number; x1: number; y1: number }, by = 0): P2[] => [
  { x: r.x0 - by, y: r.y0 - by }, { x: r.x1 + by, y: r.y0 - by }, { x: r.x1 + by, y: r.y1 + by }, { x: r.x0 - by, y: r.y1 + by },
];
