import type { Ctx, LevelInfo, OpeningFrame, RoomInfo, WallFrame } from "./context";
import { onWall } from "./context";
import { cyl, box, type P2, type Shape } from "./geometry";
import { clearRoom, type ClearRoom } from "./rooms";

/**
 * Where things can go in a room: its clear edges, the wall on each, and the
 * openings in that wall as seen along the edge. Fixtures, furniture and
 * finishes all place themselves from this one reading.
 */

export type EdgeOpening = { opening: OpeningFrame; t0: number; t1: number };

export type Edge = {
  index: number;
  a: P2;
  b: P2;
  ux: number;
  uy: number;
  /** Unit normal pointing into the room. */
  nx: number;
  ny: number;
  length: number;
  wall: WallFrame | null;
  openings: EdgeOpening[];
};

export type RoomLayout = { room: RoomInfo; level: LevelInfo; clear: ClearRoom; edges: Edge[] };

export function roomLayout(ctx: Ctx, room: RoomInfo): RoomLayout {
  const level = ctx.level(room.levelId)!;
  const clear = clearRoom(ctx, room);
  const edges: Edge[] = [];
  const poly = clear.poly;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 50) continue;
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    const nx = -uy; // inward for a counter-clockwise polygon
    const ny = ux;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let wall: WallFrame | null = null;
    for (const candidate of ctx.wallsOf(room.levelId)) {
      if (Math.abs(candidate.ux * ux + candidate.uy * uy) < 0.999) continue;
      const across = Math.abs((mid.x - candidate.start.x) * candidate.nx + (mid.y - candidate.start.y) * candidate.ny);
      if (Math.abs(across - candidate.thickness / 2) > 12) continue;
      const along = (mid.x - candidate.start.x) * candidate.ux + (mid.y - candidate.start.y) * candidate.uy;
      if (along < -5 || along > candidate.length + 5) continue;
      wall = candidate;
      break;
    }
    const openings: EdgeOpening[] = [];
    if (wall) {
      for (const opening of wall.openings) {
        const p0 = onWall(wall, opening.s0);
        const p1 = onWall(wall, opening.s1);
        const t0 = (p0.x - a.x) * ux + (p0.y - a.y) * uy;
        const t1 = (p1.x - a.x) * ux + (p1.y - a.y) * uy;
        const lo = Math.min(t0, t1);
        const hi = Math.max(t0, t1);
        if (hi < 0 || lo > length) continue;
        openings.push({ opening, t0: Math.max(0, lo), t1: Math.min(length, hi) });
      }
      openings.sort((p, q) => p.t0 - q.t0);
    }
    edges.push({ index: i, a, b, ux, uy, nx, ny, length, wall, openings });
  }
  return { room, level, clear, edges };
}

/** A point on an edge at distance `t` from its start, pushed into the room by `inset`. */
export function onEdge(edge: Edge, t: number, inset = 0): P2 {
  return { x: edge.a.x + edge.ux * t + edge.nx * inset, y: edge.a.y + edge.uy * t + edge.ny * inset };
}

/** The runs of an edge not taken by an opening, shortened by `margin` at each end. */
export function freeRuns(edge: Edge, margin = 150, minLength = 300): [number, number][] {
  let runs: [number, number][] = [[margin, edge.length - margin]];
  for (const { t0, t1 } of edge.openings) {
    runs = runs.flatMap(([a, b]) => (t1 + margin <= a || t0 - margin >= b ? [[a, b] as [number, number]] : ([[a, Math.min(b, t0 - margin)], [Math.max(a, t1 + margin), b]] as [number, number][])));
  }
  return runs.filter(([a, b]) => b - a >= minLength);
}

/** The longest free run in the room, as an edge and a span: where a bed, a unit or a board goes. */
export function longestFreeRun(layout: RoomLayout, margin = 150): { edge: Edge; t0: number; t1: number } | null {
  let best: { edge: Edge; t0: number; t1: number } | null = null;
  for (const edge of layout.edges) {
    for (const [t0, t1] of freeRuns(edge, margin)) if (!best || t1 - t0 > best.t1 - best.t0) best = { edge, t0, t1 };
  }
  return best;
}

/** A pipe or conduit made of straight axis-aligned pieces through the given points; returns the shapes and the total length. */
export function manhattan(points: { x: number; y: number; z: number }[], diameter: number): { shapes: Shape[]; length: number } {
  const shapes: Shape[] = [];
  let length = 0;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const p = points[i]!;
    const q = points[i + 1]!;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const dz = q.z - p.z;
    const len = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
    if (len < 1) continue;
    const nonZero = [dx, dy, dz].filter((d) => Math.abs(d) > 0.5).length;
    if (nonZero > 1) throw new Error("manhattan: a segment must run along one axis");
    const axis = Math.abs(dx) > 0.5 ? "x" : Math.abs(dy) > 0.5 ? "y" : "z";
    shapes.push(cyl((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2, diameter / 2, len, axis));
    length += len;
  }
  return { shapes, length };
}

/** A small fixture box on a wall face: centre on the edge at `t`, `height` above the floor, pushed `inset` into the room. */
export function wallBox(layout: RoomLayout, edge: Edge, t: number, height: number, width: number, high: number, deep: number, inset = 0): Shape {
  const p = onEdge(edge, t, inset + deep / 2);
  const z = layout.level.floorZ + height;
  if (Math.abs(edge.ux) > 0.999) return box(p.x, p.y, z, width, deep, high);
  if (Math.abs(edge.uy) > 0.999) return box(p.x, p.y, z, deep, width, high);
  return box(p.x, p.y, z, width, deep, high, Math.atan2(edge.uy, edge.ux));
}
