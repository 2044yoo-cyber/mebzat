import { box, cyl, pointInPolygon, type P2, type Shape } from "../geometry";
import { barBetween, spaced } from "../helpers";
import { clipToRegion, offsetPolygon } from "../region";

/**
 * The steel in a suspended slab, laid out from the shape of the slab and the beams under it rather than from
 * numbers typed in: bottom bars each way, and the top bars over the supports (the negative steel) with the
 * bars that hold them in place.
 *
 * Every bar is drawn by cutting a line across the slab where the concrete is, so it stops at the slab edge and at
 * each opening, with the cover the model assumes, and never hangs out in the air.
 */

export type BeamLine = { start: P2; end: P2; width: number };

/** Bars across a region in one direction, as many as fit at the spacing, each cut where the region ends or a hole begins. */
export function lattice(region: P2[], holes: P2[][], axis: "x" | "y", spacing: number, z: number, r: number): Shape[] {
  const xs = region.map((p) => p.x);
  const ys = region.map((p) => p.y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const out: Shape[] = [];
  // A millimetre in from the edge, so a line is never drawn exactly along it.
  for (const v of axis === "x" ? spaced(minY + 1, maxY - 1, spacing) : spaced(minX + 1, maxX - 1, spacing)) {
    const a = axis === "x" ? { x: minX - 1, y: v } : { x: v, y: minY - 1 };
    const b = axis === "x" ? { x: maxX + 1, y: v } : { x: v, y: maxY + 1 };
    for (const [t0, t1] of clipToRegion(a, b, region, holes)) {
      const len = (axis === "x" ? b.x - a.x : b.y - a.y) * (t1 - t0);
      if (len < 50) continue;
      const at = (axis === "x" ? a.x : a.y) + (axis === "x" ? b.x - a.x : b.y - a.y) * ((t0 + t1) / 2);
      out.push(axis === "x" ? cyl(at, v, z, r, len, "x") : cyl(v, at, z, r, len, "y"));
    }
  }
  return out;
}

const unit = (a: P2, b: P2) => { const len = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / len, y: (b.y - a.y) / len }; };
const dot = (a: P2, b: P2) => a.x * b.x + a.y * b.y;

/** How far the next parallel beam is on one side of this one, where the two overlap, or null when there is none. */
export function panelSpan(beam: BeamLine, all: BeamLine[], side: 1 | -1): number | null {
  const u = unit(beam.start, beam.end);
  const n = { x: -u.y, y: u.x };
  const mid = { x: (beam.start.x + beam.end.x) / 2, y: (beam.start.y + beam.end.y) / 2 };
  const a0 = dot(u, beam.start); const a1 = dot(u, beam.end);
  let best: number | null = null;
  for (const other of all) {
    if (other === beam) continue;
    const v = unit(other.start, other.end);
    if (Math.abs(u.x * v.y - u.y * v.x) > 0.02) continue;
    const offset = dot(n, { x: (other.start.x + other.end.x) / 2, y: (other.start.y + other.end.y) / 2 }) - dot(n, mid);
    if (offset * side <= 1) continue;
    const b0 = dot(u, other.start); const b1 = dot(u, other.end);
    const overlap = Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1));
    if (overlap < 300) continue;
    if (best === null || Math.abs(offset) < best) best = Math.abs(offset);
  }
  return best;
}

/** How far the top bars reach into the slab each side of a support, as a fraction of the panel span (a common rule of thumb for continuous slabs). */
export const NEGATIVE_BAR_REACH = 0.3;
const MIN_REACH = 600;
const DISTRIBUTION_SPACING = 250;

export type SupportSteel = {
  /** The top bars across each beam. */
  mains: Shape[];
  /** The bars along each beam that the mains rest on and are tied to. */
  distribution: Shape[];
  /** The leg turned down at a slab edge, so the bar is anchored where it has nothing to run on to. */
  hooks: Shape[];
  /** The chairs that hold the top steel up. */
  chairs: Shape[];
  /** The reach of the bars each side of the beam, mm, for the quantity notes. */
  reaches: number[];
};

type SupportArgs = {
  beams: BeamLine[];
  /** The zone of the slab this steel is in. */
  zone: P2[];
  /** The whole slab as cast, all its zones: a bar cut short by this edge is turned down, one cut short at a joint between zones is not. */
  outline: P2[];
  holes: P2[][];
  spacing: number;
  /** The top layer, and the cover, the bar radius and the thickness of the slab. */
  zTop: number;
  zBottomBars: number;
  cover: number;
  r: number;
  thickness: number;
};

/** The top steel over every beam that lies in the zone. */
export function supportSteel(a: SupportArgs): SupportSteel {
  const region = offsetPolygon(a.zone, -a.cover);
  const holes = a.holes.map((h) => offsetPolygon(h, a.cover));
  const loose = offsetPolygon(a.zone, 1);
  const out: SupportSteel = { mains: [], distribution: [], hooks: [], chairs: [], reaches: [] };
  for (const beam of a.beams) {
    const mid = { x: (beam.start.x + beam.end.x) / 2, y: (beam.start.y + beam.end.y) / 2 };
    if (!pointInPolygon(mid, loose)) continue;
    const u = unit(beam.start, beam.end);
    const n = { x: -u.y, y: u.x };
    const len = Math.hypot(beam.end.x - beam.start.x, beam.end.y - beam.start.y);
    const reachOf = (side: 1 | -1) => {
      const span = panelSpan(beam, a.beams, side);
      return Math.max(MIN_REACH, NEGATIVE_BAR_REACH * (span ?? 4500));
    };
    const lo = reachOf(-1);
    const hi = reachOf(1);
    // Beams along x carry their top bars across them, along y, in the lower of the two top layers; beams along y the other way about.
    const alongX = Math.abs(u.y) < 0.02;
    const mainZ = alongX ? a.zTop - 2 * a.r : a.zTop;
    const distZ = alongX ? a.zTop : a.zTop - 2 * a.r;
    let reachLo = 0;
    let reachHi = 0;
    for (const t of spaced(150, len - 150, a.spacing)) {
      const q = { x: beam.start.x + u.x * t, y: beam.start.y + u.y * t };
      const from = { x: q.x - n.x * lo, y: q.y - n.y * lo };
      const to = { x: q.x + n.x * hi, y: q.y + n.y * hi };
      const tq = lo / (lo + hi);
      // The part of the line in the concrete that is nearest the beam: the beam itself may sit on the zone's edge.
      const parts = clipToRegion(from, to, region, holes);
      if (!parts.length) continue;
      const nearest = parts.map((p) => ({ p, d: Math.max(0, p[0] - tq, tq - p[1]) })).sort((x, y) => x.d - y.d)[0]!;
      if (nearest.d * (lo + hi) > 200) continue;
      const [t0, t1] = nearest.p;
      const total = lo + hi;
      if (total * (t1 - t0) < 200) continue;
      const p0 = { x: from.x + (to.x - from.x) * t0, y: from.y + (to.y - from.y) * t0 };
      const p1 = { x: from.x + (to.x - from.x) * t1, y: from.y + (to.y - from.y) * t1 };
      out.mains.push(barBetween(p0, p1, mainZ, a.r * 2));
      reachLo = Math.max(reachLo, Math.max(0, tq - t0) * total);
      reachHi = Math.max(reachHi, Math.max(0, t1 - tq) * total);
      // A bar whose end is at the edge of the slab turns down there, so it is anchored where it has nothing to run on to.
      for (const end of [p0, p1]) {
        if (!a.outline.some((p, i) => distanceToSegment(end, p, a.outline[(i + 1) % a.outline.length]!) <= a.cover + 6)) continue;
        const leg = Math.max(60, a.thickness - 2 * a.cover - 3 * a.r - (alongX ? 2 * a.r : 0));
        out.hooks.push(cyl(end.x, end.y, mainZ - leg / 2, a.r, leg, "z"));
      }
    }
    out.reaches.push(Math.round(Math.max(reachLo, reachHi)));
    // The bars along the beam, across the width the mains reach, at a wider spacing.
    if (reachLo + reachHi > 100) {
      for (const v of spaced(-reachLo + 50, reachHi - 50, DISTRIBUTION_SPACING)) {
        const p0 = { x: beam.start.x + n.x * v, y: beam.start.y + n.y * v };
        const p1 = { x: beam.end.x + n.x * v, y: beam.end.y + n.y * v };
        for (const [t0, t1] of clipToRegion(p0, p1, region, holes)) {
          const length = len * (t1 - t0);
          if (length < 200) continue;
          out.distribution.push(barBetween({ x: p0.x + (p1.x - p0.x) * t0, y: p0.y + (p1.y - p0.y) * t0 }, { x: p0.x + (p1.x - p0.x) * t1, y: p0.y + (p1.y - p0.y) * t1 }, distZ, a.r * 2));
        }
      }
    }
    for (const t of spaced(400, len - 400, 1000)) {
      const q = { x: beam.start.x + u.x * t, y: beam.start.y + u.y * t };
      if (!pointInPolygon(q, region) || holes.some((h) => pointInPolygon(q, h))) continue;
      out.chairs.push(box(q.x, q.y, (a.zBottomBars + a.zTop) / 2, 40, 40, a.zTop - a.zBottomBars - a.r));
    }
  }
  return out;
}

function distanceToSegment(p: P2, a: P2, b: P2): number {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
