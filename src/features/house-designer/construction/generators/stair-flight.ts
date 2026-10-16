import { box, cyl, profile, type P2, type Shape } from "../geometry";
import { barBetween, spaced } from "../helpers";

/**
 * A straight flight of stairs as it is cast: a sloping waist slab with the steps on top of it, not a pile of blocks.
 *
 * Seen from the side the concrete is a polygon: a saw-tooth on top (each tread and each riser), and a sloping soffit
 * below it. The waist is the thickness of the slab under the steps, so the soffit is parallel to the line through the
 * inner corners of the steps, one waist (at right angles to the slope) beneath it. It meets the floor a little way
 * up the flight, and at the other end it runs on, under the landing or the floor above, until it meets the underside of
 * that. The polygon is extruded across the width of the flight, so the 3D model, the concrete volume and the
 * formwork all come from the same outline.
 */

export type Flight = {
  /** The foot of the first riser, on the centre line of the flight, in plan. */
  origin: P2;
  /** Along the flight, upward, a unit vector in plan. */
  dir: P2;
  width: number;
  /** Number of treads. */
  treads: number;
  going: number;
  riser: number;
  /** The level the first riser rises from: the floor, or the landing the flight starts at. */
  zBase: number;
  /** The waist, measured at right angles to the slope. */
  waist: number;
  /** The underside of the landing or the slab the top of the flight runs into, when there is one. */
  zJoin: number | null;
};

type Tread = { points: P2[]; level: number };

const centroid = (points: P2[]): P2 => ({ x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length });

/**
 * The flight, if these treads make a straight one: rectangles, one going deep, one width wide, one after another
 * along a line, each one riser above the last. Winders, curves and spirals are not, and are left to be drawn as
 * separate steps. `zJoin` is the underside of what the top of the flight runs into.
 */
export function straightFlight<T extends Tread>(pieces: T[], topOf: (piece: T) => number, riser: number, going: number, width: number, waist: number, zJoin: number | null): Flight | null {
  if (pieces.length < 2) return null;
  const centres = pieces.map((p) => centroid(p.points));
  const first = centres[0]!;
  const last = centres[centres.length - 1]!;
  const length = Math.hypot(last.x - first.x, last.y - first.y);
  if (length < 1) return null;
  const dir = { x: (last.x - first.x) / length, y: (last.y - first.y) / length };
  const across = { x: -dir.y, y: dir.x };
  for (let k = 0; k < pieces.length; k += 1) {
    const piece = pieces[k]!;
    if (piece.points.length !== 4) return null;
    const along = piece.points.map((p) => (p.x - first.x) * dir.x + (p.y - first.y) * dir.y);
    const side = piece.points.map((p) => (p.x - first.x) * across.x + (p.y - first.y) * across.y);
    if (Math.abs(Math.max(...along) - Math.min(...along) - going) > 2 || Math.abs(Math.max(...side) - Math.min(...side) - width) > 2) return null;
    if (Math.abs((along[0]! + along[1]! + along[2]! + along[3]!) / 4 - k * going) > 2 || Math.abs((side[0]! + side[1]! + side[2]! + side[3]!) / 4) > 2) return null;
  }
  for (let k = 1; k < pieces.length; k += 1) if (Math.abs(topOf(pieces[k]!) - topOf(pieces[k - 1]!) - riser) > 0.5) return null;
  return { origin: { x: first.x - dir.x * (going / 2), y: first.y - dir.y * (going / 2) }, dir, width, treads: pieces.length, going, riser, zBase: topOf(pieces[0]!) - riser, waist, zJoin };
}

const slopeCos = (f: Flight) => f.going / Math.hypot(f.going, f.riser);
const waistDepth = (f: Flight) => f.waist / slopeCos(f);

/** Height of the soffit at `s` along the flight (it is below the floor for the first stretch, where the flight stands on it). */
export function soffitAt(f: Flight, s: number): number {
  return f.zBase + (f.riser / f.going) * s - waistDepth(f);
}

/** How far up the flight the soffit meets the floor. */
export const footOf = (f: Flight): number => Math.min(f.treads * f.going * 0.9, (waistDepth(f) * f.going) / f.riser);

/** How far past the last tread the soffit runs on, under the landing or slab, to meet its underside. Zero when it runs into nothing. */
export function wedgeLength(f: Flight): number {
  if (f.zJoin === null) return 0;
  const h = f.zJoin - soffitAt(f, f.treads * f.going);
  return h > 1 ? (h * f.going) / f.riser : 0;
}

/** The flight seen from the side, counter-clockwise: the soffit from the foot up, the saw-tooth back down. */
export function flightPolygon(f: Flight): { s: number; z: number }[] {
  const { going: T, riser: R, treads: n, zBase } = f;
  const out: { s: number; z: number }[] = [{ s: 0, z: zBase }, { s: footOf(f), z: zBase }, { s: n * T, z: soffitAt(f, n * T) }];
  // Down the saw-tooth: the back of each tread and the foot of its riser. The last point is the top of the first riser; the outline closes to the foot.
  for (let k = n; k >= 1; k -= 1) out.push({ s: k * T, z: zBase + k * R }, { s: (k - 1) * T, z: zBase + k * R });
  return out.filter((p, i) => i === 0 || Math.hypot(p.s - out[i - 1]!.s, p.z - out[i - 1]!.z) > 1e-6);
}

/** The triangle of concrete under the landing or the slab, where the soffit runs on until it meets the underside. */
export function wedgePolygon(f: Flight): { s: number; z: number }[] | null {
  const run = wedgeLength(f);
  if (run <= 0 || f.zJoin === null) return null;
  const end = f.treads * f.going;
  return [{ s: end, z: soffitAt(f, end) }, { s: end + run, z: f.zJoin }, { s: end, z: f.zJoin }];
}

/** The flight's concrete: the steps and waist, and the wedge under what it runs into. */
export function flightShapes(f: Flight): Shape[] {
  const wedge = wedgePolygon(f);
  return [profile(f.origin, f.dir, flightPolygon(f), f.width), ...(wedge ? [profile(f.origin, f.dir, wedge, f.width)] : [])];
}

/** A point of the flight in plan, at `s` along it and `across` to the left of its centre line. */
export const flightPoint = (f: Flight, s: number, across = 0): P2 => ({ x: f.origin.x + f.dir.x * s - f.dir.y * across, y: f.origin.y + f.dir.y * s + f.dir.x * across });

/**
 * The main bars along the flight, parallel to the soffit and a cover above it, spread across the width; and the bars across
 * the flight that tie them, one every 250 mm of run, above them. The bars stop a cover short of the foot and carry on
 * 50 mm into the wedge, or stop a cover short of the end when there is none.
 */
export function flightBars(f: Flight, cover: number, mainDiameter: number, spacing: number): Shape[] {
  const out: Shape[] = [];
  const cosT = slopeCos(f);
  const theta = Math.atan2(f.riser, f.going);
  const phi = Math.atan2(f.dir.y, f.dir.x);
  const lift = (cover + mainDiameter / 2) / cosT;
  const zAt = (s: number) => soffitAt(f, s) + lift;
  const s0 = footOf(f) + cover + 60;
  const s1 = f.treads * f.going + (wedgeLength(f) > 150 ? 50 : -cover);
  if (s1 - s0 < 200) return out;
  const half = f.width / 2 - cover - mainDiameter / 2;
  const sloped = Math.hypot(s1 - s0, zAt(s1) - zAt(s0));
  for (const o of spaced(-half, half, spacing)) {
    const mid = flightPoint(f, (s0 + s1) / 2, o);
    const bar = box(mid.x, mid.y, (zAt(s0) + zAt(s1)) / 2, sloped, mainDiameter, mainDiameter) as Extract<Shape, { t: "box" }>;
    out.push({ ...bar, ry: -theta, rz: phi });
  }
  for (const s of spaced(s0 + 100, s1 - 100, 250)) {
    out.push(barBetween(flightPoint(f, s, -half), flightPoint(f, s, half), zAt(s) + mainDiameter / 2 + 4, 8));
  }
  return out;
}

/** The deck under the soffit, from just above the floor to where the soffit meets what it runs into, and the boards at the two sides. */
export function flightForm(f: Flight, ply: number): Shape[] {
  const drop = ply / slopeCos(f);
  const deck0 = footOf(f) + 40;
  const deck1 = f.treads * f.going + wedgeLength(f);
  const deck = profile(f.origin, f.dir, [
    { s: deck0, z: soffitAt(f, deck0) - drop }, { s: deck1, z: soffitAt(f, deck1) - drop }, { s: deck1, z: soffitAt(f, deck1) }, { s: deck0, z: soffitAt(f, deck0) },
  ], f.width + 2 * ply);
  const wedge = wedgePolygon(f);
  const sides = [-1, 1].flatMap((side) => {
    const at = flightPoint(f, 0, side * (f.width / 2 + ply / 2));
    return [profile(at, f.dir, flightPolygon(f), ply), ...(wedge ? [profile(at, f.dir, wedge, ply)] : [])];
  });
  return [deck, ...sides];
}

/** The props under the flight: two across, in rows at most 1200 mm apart along the run, from the floor to the underside of the deck. */
export function flightProps(f: Flight, floorZ: number, ply: number): Shape[] {
  const out: Shape[] = [];
  const drop = ply / slopeCos(f);
  const end = f.treads * f.going + wedgeLength(f);
  // Rows no more than 1200 mm apart along the run (the end rows are fixed, the ones between them are spread evenly): a row is left out where the deck is almost on the floor.
  const from = footOf(f) + 200;
  const to = end - 150;
  const rows = Math.max(1, Math.ceil((to - from) / 1200));
  for (let k = 0; k <= rows; k += 1) {
    const s = from + ((to - from) * k) / rows;
    const top = soffitAt(f, s) - drop;
    const height = top - floorZ;
    if (height < 100) continue;
    for (const side of [-1, 1]) {
      const p = flightPoint(f, s, side * (f.width / 2 - 150));
      out.push(cyl(p.x, p.y, floorZ + height / 2, 30, height, "z"));
    }
  }
  return out;
}

/** The area of the concrete in the flight's side view, m²: the steps, the waist and the wedge. Times the width it is the volume. */
export function flightSideArea(f: Flight): number {
  const area = (poly: { s: number; z: number }[]) => Math.abs(poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]!; return sum + (p.s * q.z - q.s * p.z); }, 0)) / 2;
  const wedge = wedgePolygon(f);
  return (area(flightPolygon(f)) + (wedge ? area(wedge) : 0)) * 1e-6;
}

/** The area of the soffit, m²: from where it leaves the floor to where it meets what it runs into, along the slope, times the width. */
export function flightSoffitArea(f: Flight): number {
  const s0 = footOf(f);
  const s1 = f.treads * f.going + wedgeLength(f);
  return (Math.hypot(s1 - s0, soffitAt(f, s1) - soffitAt(f, s0)) * f.width) * 1e-6;
}
