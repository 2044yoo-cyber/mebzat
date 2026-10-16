import type { P2, Shape, V3 } from "./geometry";
import type { ComponentRecord, ConstructionModel } from "./types";

/**
 * Whether the reinforcement in the model is really in the concrete.
 *
 * The bars are drawn for teaching, but a bar drawn in the air beside a slab teaches the wrong thing, so every
 * bar is followed along its length and each point must be inside concrete the finished building has: a column,
 * a beam, a slab, a footing, a stair, a balcony. A bar that sticks out past a slab edge, runs across the opening
 * left for a shaft, or ends beyond the member that holds it is reported with where it is.
 *
 * Bars that rise out of a member to be lapped to the next lift are fine: in the finished building the next
 * storey's column is there, and the test is made against all the concrete together.
 */

export type RebarFinding = { componentId: string; shapeIndex: number; at: V3; kind: string; note: string };
export type RebarAudit = {
  /** Bars looked at, and sample points tested along them. */
  bars: number;
  samples: number;
  outside: RebarFinding[];
};

type Solid =
  | { t: "box"; c: V3; s: V3; rx: number; ry: number; rz: number; min: V3; max: V3 }
  | { t: "prism"; poly: P2[]; holes: P2[][]; z0: number; z1: number; min: V3; max: V3 }
  | { t: "profile"; origin: P2; dir: P2; poly: { s: number; z: number }[]; thickness: number; min: V3; max: V3 };

const TOL = 3;

const inPoly = (poly: readonly P2[], x: number, y: number): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!; const b = poly[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

/** The point in a box's own frame: undo Z, then Y, then X (the box was turned about X, then Y, then Z, about its centre). */
function toLocal(box: Extract<Solid, { t: "box" }>, p: V3): V3 {
  let x = p.x - box.c.x; let y = p.y - box.c.y; let z = p.z - box.c.z;
  if (box.rz) { const c = Math.cos(-box.rz); const s = Math.sin(-box.rz); [x, y] = [x * c - y * s, x * s + y * c]; }
  if (box.ry) { const c = Math.cos(-box.ry); const s = Math.sin(-box.ry); [x, z] = [x * c + z * s, -x * s + z * c]; }
  if (box.rx) { const c = Math.cos(-box.rx); const s = Math.sin(-box.rx); [y, z] = [y * c - z * s, y * s + z * c]; }
  return { x, y, z };
}

function insideSolid(solid: Solid, p: V3, tol: number): boolean {
  if (p.x < solid.min.x - tol || p.x > solid.max.x + tol || p.y < solid.min.y - tol || p.y > solid.max.y + tol || p.z < solid.min.z - tol || p.z > solid.max.z + tol) return false;
  if (solid.t === "box") {
    const l = toLocal(solid, p);
    return Math.abs(l.x) <= solid.s.x / 2 + tol && Math.abs(l.y) <= solid.s.y / 2 + tol && Math.abs(l.z) <= solid.s.z / 2 + tol;
  }
  if (solid.t === "prism") {
    if (p.z < solid.z0 - tol || p.z > solid.z1 + tol) return false;
    // A point within the tolerance of the edge counts as inside: try the four points a tolerance away as well.
    const probe = (x: number, y: number) => inPoly(solid.poly, x, y) && !solid.holes.some((h) => inPoly(h, x, y));
    return probe(p.x, p.y) || probe(p.x + tol, p.y) || probe(p.x - tol, p.y) || probe(p.x, p.y + tol) || probe(p.x, p.y - tol);
  }
  const dx = p.x - solid.origin.x; const dy = p.y - solid.origin.y;
  const s = dx * solid.dir.x + dy * solid.dir.y;
  const w = dx * solid.dir.y - dy * solid.dir.x;
  if (Math.abs(w) > solid.thickness / 2 + tol) return false;
  const poly = solid.poly.map((q) => ({ x: q.s, y: q.z }));
  return inPoly(poly, s, p.z) || inPoly(poly, s + tol, p.z) || inPoly(poly, s - tol, p.z) || inPoly(poly, s, p.z + tol) || inPoly(poly, s, p.z - tol);
}

function solidOf(shape: Shape): Solid | null {
  if (shape.t === "box") {
    const rx = shape.rx ?? 0; const ry = shape.ry ?? 0; const rz = shape.rz ?? 0;
    const reach = rx || ry || rz ? Math.hypot(shape.s.x, shape.s.y, shape.s.z) / 2 : 0;
    const hx = reach || shape.s.x / 2; const hy = reach || shape.s.y / 2; const hz = reach || shape.s.z / 2;
    return { t: "box", c: shape.c, s: shape.s, rx, ry, rz, min: { x: shape.c.x - hx, y: shape.c.y - hy, z: shape.c.z - hz }, max: { x: shape.c.x + hx, y: shape.c.y + hy, z: shape.c.z + hz } };
  }
  if (shape.t === "prism") {
    const xs = shape.poly.map((q) => q.x); const ys = shape.poly.map((q) => q.y);
    return { t: "prism", poly: shape.poly, holes: shape.holes ?? [], z0: shape.z0, z1: shape.z1, min: { x: Math.min(...xs), y: Math.min(...ys), z: shape.z0 }, max: { x: Math.max(...xs), y: Math.max(...ys), z: shape.z1 } };
  }
  if (shape.t === "profile") {
    const ss = shape.poly.map((q) => q.s); const zs = shape.poly.map((q) => q.z);
    const n = { x: shape.dir.y, y: -shape.dir.x };
    const corners = [Math.min(...ss), Math.max(...ss)].flatMap((s) => [-shape.thickness / 2, shape.thickness / 2].map((w) => ({ x: shape.origin.x + shape.dir.x * s + n.x * w, y: shape.origin.y + shape.dir.y * s + n.y * w })));
    return { t: "profile", origin: shape.origin, dir: shape.dir, poly: shape.poly, thickness: shape.thickness, min: { x: Math.min(...corners.map((q) => q.x)), y: Math.min(...corners.map((q) => q.y)), z: Math.min(...zs) }, max: { x: Math.max(...corners.map((q) => q.x)), y: Math.max(...corners.map((q) => q.y)), z: Math.max(...zs) } };
  }
  return null;
}

/** Points along a bar's axis, at most `step` apart, the two ends included. A cylinder is along its axis; a box is along its longest side. */
function along(shape: Shape, step: number): V3[] {
  let a: V3; let b: V3;
  if (shape.t === "cyl") {
    const h = shape.len / 2;
    const tilt = shape.tilt ?? 0;
    const run = Math.cos(tilt) * h;
    const fall = Math.sin(tilt) * h;
    if (shape.axis === "z") { a = { x: shape.c.x, y: shape.c.y, z: shape.c.z - h }; b = { x: shape.c.x, y: shape.c.y, z: shape.c.z + h }; }
    else if (shape.axis === "x") { a = { x: shape.c.x - run, y: shape.c.y, z: shape.c.z + fall }; b = { x: shape.c.x + run, y: shape.c.y, z: shape.c.z - fall }; }
    else { a = { x: shape.c.x, y: shape.c.y - run, z: shape.c.z + fall }; b = { x: shape.c.x, y: shape.c.y + run, z: shape.c.z - fall }; }
  } else if (shape.t === "box") {
    const axis = shape.s.x >= shape.s.y && shape.s.x >= shape.s.z ? "x" : shape.s.y >= shape.s.z ? "y" : "z";
    const h = (axis === "x" ? shape.s.x : axis === "y" ? shape.s.y : shape.s.z) / 2;
    const local = (sign: number): V3 => {
      let x = axis === "x" ? sign * h : 0; let y = axis === "y" ? sign * h : 0; let z = axis === "z" ? sign * h : 0;
      const rx = shape.rx ?? 0; const ry = shape.ry ?? 0; const rz = shape.rz ?? 0;
      if (rx) { const c = Math.cos(rx); const s = Math.sin(rx); [y, z] = [y * c - z * s, y * s + z * c]; }
      if (ry) { const c = Math.cos(ry); const s = Math.sin(ry); [x, z] = [x * c + z * s, -x * s + z * c]; }
      if (rz) { const c = Math.cos(rz); const s = Math.sin(rz); [x, y] = [x * c - y * s, x * s + y * c]; }
      return { x: shape.c.x + x, y: shape.c.y + y, z: shape.c.z + z };
    };
    a = local(-1); b = local(1);
  } else return [];
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / step));
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n, z: a.z + ((b.z - a.z) * i) / n }));
}

const isBar = (c: ComponentRecord) => c.layer === "reinforcement" && c.kind !== "spacer" && c.materialId.startsWith("steel");

/** Every point of every bar is inside concrete, or it is reported. */
export function auditReinforcement(model: ConstructionModel, step = 100): RebarAudit {
  const solids: Solid[] = [];
  for (const c of model.components) {
    if (c.layer !== "concrete") continue;
    for (const shape of c.shapes) { const s = solidOf(shape); if (s) solids.push(s); }
  }
  // A coarse grid of the solids, so a point is only tried against those near it.
  const cell = 1000;
  const grid = new Map<string, Solid[]>();
  const key = (i: number, j: number) => `${i}:${j}`;
  for (const s of solids) {
    for (let i = Math.floor(s.min.x / cell); i <= Math.floor(s.max.x / cell); i += 1) for (let j = Math.floor(s.min.y / cell); j <= Math.floor(s.max.y / cell); j += 1) {
      const k = key(i, j);
      const list = grid.get(k);
      if (list) list.push(s); else grid.set(k, [s]);
    }
  }
  const near = (p: V3): Solid[] => grid.get(key(Math.floor(p.x / cell), Math.floor(p.y / cell))) ?? [];
  const outside: RebarFinding[] = [];
  let bars = 0;
  let samples = 0;
  for (const c of model.components) {
    if (!isBar(c)) continue;
    c.shapes.forEach((shape, shapeIndex) => {
      const points = along(shape, step);
      if (!points.length) return;
      bars += 1;
      for (const p of points) {
        samples += 1;
        if (near(p).some((s) => insideSolid(s, p, TOL))) continue;
        outside.push({ componentId: c.id, shapeIndex, at: p, kind: c.kind, note: `${c.name}: a bar is outside the concrete at (${Math.round(p.x)}, ${Math.round(p.y)}, ${Math.round(p.z)}).` });
        break;
      }
    });
  }
  return { bars, samples, outside };
}
