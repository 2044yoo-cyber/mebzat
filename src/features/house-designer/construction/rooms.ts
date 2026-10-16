import type { Ctx, RoomInfo, WallFrame } from "./context";
import { clipConvex, polygonArea, type P2 } from "./geometry";

/**
 * Room and wall facts shared by the finishes and the structure: the clear
 * area of a room once the walls and columns are taken out, the faces of a
 * wall, and the openings that stairs cut in slabs.
 */

const rectOf = (cx: number, cy: number, w: number, d: number): P2[] => [{ x: cx - w / 2, y: cy - d / 2 }, { x: cx + w / 2, y: cy - d / 2 }, { x: cx + w / 2, y: cy + d / 2 }, { x: cx - w / 2, y: cy + d / 2 }];

function isConvexCcw(poly: P2[]): boolean {
  if (poly.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const c = poly[(i + 2) % poly.length]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}

function ccw(poly: P2[]): P2[] {
  return polygonSigned(poly) < 0 ? [...poly].reverse() : poly;
}
const polygonSigned = (poly: P2[]) => poly.reduce((s, a, i) => { const b = poly[(i + 1) % poly.length]!; return s + (a.x * b.y - b.x * a.y); }, 0);

export type ClearRoom = { room: RoomInfo; poly: P2[]; area: number; exact: boolean; netOfColumns: number };

/**
 * The clear floor of a room: its drawn outline pulled in by half the
 * thickness of each wall that stands on an edge, less any column inside. It
 * is exact for convex rooms (every room of the sample); a concave room is
 * measured by its outline and marked as needing review.
 */
export function clearRoom(ctx: Ctx, room: RoomInfo): ClearRoom {
  const poly = ccw(room.boundary);
  const walls = ctx.wallsOf(room.levelId);
  const exact = isConvexCcw(poly);
  let clear = poly;
  if (exact) {
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1) continue;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      // The wall lying on this edge, if there is one.
      let thickness = 0;
      for (const wall of walls) {
        const along = Math.abs(wall.ux * ux + wall.uy * uy);
        if (along < 0.999) continue;
        const off = Math.abs((wall.start.x - a.x) * -uy + (wall.start.y - a.y) * ux);
        if (off > 5) continue;
        const s0 = (wall.start.x - a.x) * ux + (wall.start.y - a.y) * uy;
        const s1 = (wall.end.x - a.x) * ux + (wall.end.y - a.y) * uy;
        const lo = Math.max(0, Math.min(s0, s1));
        const hi = Math.min(len, Math.max(s0, s1));
        if (hi - lo > len * 0.3) thickness = Math.max(thickness, wall.thickness);
      }
      if (thickness === 0) continue;
      const d = thickness / 2;
      // Half-plane: keep points at least d inside edge a→b (left of a→b for a counter-clockwise polygon).
      const nx = -uy;
      const ny = ux;
      const far = 1e6;
      const half: P2[] = [{ x: a.x + nx * d - ux * far, y: a.y + ny * d - uy * far }, { x: a.x + nx * d + ux * far, y: a.y + ny * d + uy * far }, { x: a.x + nx * far + ux * far, y: a.y + ny * far + uy * far }, { x: a.x + nx * far - ux * far, y: a.y + ny * far - uy * far }];
      clear = clipConvex(clear, ccw(half));
    }
  }
  const gross = polygonArea(clear);
  // Columns standing inside the clear room (a column on a wall line sticks out a little).
  let columnArea = 0;
  if (exact) {
    for (const column of ctx.project.structuralColumns.filter((c) => c.levelId === room.levelId)) {
      const piece = clipConvex(rectOf(column.x, column.y, column.width, column.depth), clear);
      if (piece.length >= 3) columnArea += polygonArea(piece);
    }
  }
  return { room, poly: clear, area: gross - columnArea, exact, netOfColumns: columnArea };
}

/** The openings stairs cut in the slab of `levelIndex`: the footprints of the stairs that arrive from the level below. */
export function stairOpenings(ctx: Ctx, levelIndex: number): { id: string; x0: number; y0: number; x1: number; y1: number; rotated: boolean }[] {
  const below = ctx.levels[levelIndex - 1];
  if (!below) return [];
  const ease = 10;
  return ctx.project.stairs.filter((stair) => stair.levelId === below.levelId).map((stair) => {
    const rad = (stair.rotation * Math.PI) / 180;
    const w = Math.abs(stair.width * Math.cos(rad)) + Math.abs(stair.length * Math.sin(rad));
    const l = Math.abs(stair.width * Math.sin(rad)) + Math.abs(stair.length * Math.cos(rad));
    return { id: stair.id, x0: stair.x - w / 2 - ease, x1: stair.x + w / 2 + ease, y0: stair.y - l / 2 - ease, y1: stair.y + l / 2 + ease, rotated: Math.abs(stair.rotation % 90) > 0.5 };
  });
}

export type FaceSegment = { s0: number; s1: number; room: string | null };

/** The room on one face of a wall, in runs along it: a long external wall faces a different room every few metres. */
export function faceSegments(ctx: Ctx, wall: WallFrame, side: "left" | "right"): FaceSegment[] {
  const sign = side === "left" ? 1 : -1;
  const probe = wall.thickness / 2 + 40;
  const step = 50;
  const out: FaceSegment[] = [];
  let current: FaceSegment | null = null;
  for (let s = 0; s < wall.length; s += step) {
    const mid = Math.min(wall.length, s + step / 2);
    const p = { x: wall.start.x + wall.ux * mid + wall.nx * probe * sign, y: wall.start.y + wall.uy * mid + wall.ny * probe * sign };
    const room = ctx.roomAt(wall.levelId, p)?.name ?? null;
    if (current && current.room === room) current.s1 = Math.min(wall.length, s + step);
    else { current = { s0: s, s1: Math.min(wall.length, s + step), room }; out.push(current); }
  }
  return out;
}

/** True when this face of the wall looks outdoors. */
export function faceIsExternal(ctx: Ctx, wall: WallFrame, side: "left" | "right"): boolean {
  const seg = faceSegments(ctx, wall, side);
  return seg.length > 0 && seg.every((s) => s.room === null);
}

/** The pieces of a wall face that are left once the openings are taken out, as rectangles in (s, z) along the wall. */
export function facePieces(wall: WallFrame, height: number, openings = wall.openings, from = 0, to = wall.length): { s0: number; s1: number; z0: number; z1: number }[] {
  const pieces: { s0: number; s1: number; z0: number; z1: number }[] = [];
  const inside = openings.filter((o) => o.s1 > from && o.s0 < to).sort((a, b) => a.s0 - b.s0);
  let cursor = from;
  for (const o of inside) {
    const a = Math.max(from, o.s0);
    const b = Math.min(to, o.s1);
    if (a > cursor) pieces.push({ s0: cursor, s1: a, z0: 0, z1: height });
    if (o.z0 > 0) pieces.push({ s0: a, s1: b, z0: 0, z1: Math.min(height, o.z0) });
    if (o.z1 < height) pieces.push({ s0: a, s1: b, z0: Math.max(0, o.z1), z1: height });
    cursor = Math.max(cursor, b);
  }
  if (cursor < to) pieces.push({ s0: cursor, s1: to, z0: 0, z1: height });
  return pieces;
}
