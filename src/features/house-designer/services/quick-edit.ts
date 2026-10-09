import { pointInPolygon } from "./measurements";
import { createHouseObjectFromGesture, moveHouseSelections, type HouseCommandMutation } from "./model-commands";
import { patchHouseObject, splitRoomAlong, wallJointLinked, wallJointsLinked, toggleWallJoints, type HousePatch } from "./project-edit";
export { wallJointLinked, wallJointsLinked, toggleWallJoints } from "./project-edit";
import type { HouseProject, HouseSelection } from "../types/project";

/**
 * Fast wall and room editing, built from the commands the plan already has —
 * the same wall patch, move, wall creation and room split — so every one of
 * these is a single ordinary undo step and keeps rooms and openings attached
 * exactly as an edit made any other way would.
 *
 * Millimetres throughout.
 */
type Point = { x: number; y: number };
type Wall = HouseProject["walls"][number];
export type WallEnd = "start" | "end";

const TOLERANCE = 1;

function plain(project: HouseProject, wall: Wall) {
  const plan = project.levels.find((level) => level.id === wall.levelId)?.plan;
  const source = wall.sourceWallId ?? wall.id.split(":wall:")[1];
  const index = plan?.corners.findIndex((corner) => corner.id === source) ?? -1;
  return { plan, outline: index >= 0, index };
}

function unit(wall: Wall) {
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  return { length, x: (wall.end.x - wall.start.x) / Math.max(length, 1e-9), y: (wall.end.y - wall.start.y) / Math.max(length, 1e-9) };
}

function blocked(project: HouseProject, message: string): HouseCommandMutation {
  return { project, selections: [], blocked: [message] };
}

/**
 * Lengthens (positive) or shortens (negative) a wall from one end; the other
 * end stays put. An outside wall's end is a corner of the house: extending it
 * moves the wall meeting it there, parallel to itself, so the corner stays
 * square instead of the neighbour being dragged out of true.
 */
export function extendWall(project: HouseProject, wallId: string, end: WallEnd, delta: number): HouseCommandMutation {
  const wall = project.walls.find((item) => item.id === wallId);
  if (!wall) return blocked(project, "Wall not found");
  const direction = unit(wall);
  if (direction.length + delta < 200) return blocked(project, "A wall cannot be shorter than 200 mm");
  const sign = end === "end" ? 1 : -1;
  const move = { x: direction.x * delta * sign, y: direction.y * delta * sign };
  const selection: HouseSelection = { kind: "wall", id: wall.id };
  const { outline } = plain(project, wall);
  if (outline && !wallJointLinked(project, wallId, end))
    return blocked(project, "This exterior wall belongs to the closed footprint. Turn on Link joints before moving its corner.");
  // A connected OUTER wall is a side of a polygon, not a free line.
  // Lengthening it at a square corner translates its perpendicular next side
  // (both of that neighbour's endpoints) to keep the footprint orthogonal.
  // This ONLY happens after the user explicitly turns on Link joints.
  if (outline) {
    const corner = end === "end" ? wall.end : wall.start;
    const neighbour = project.walls.find((item) =>
      item.levelId === wall.levelId && item.id !== wall.id &&
      Math.hypot(
        (end === "end" ? item.start : item.end).x - corner.x,
        (end === "end" ? item.start : item.end).y - corner.y,
      ) < TOLERANCE,
    );
    if (neighbour) {
      const along = unit(neighbour);
      const perpendicular = Math.abs(along.x * direction.y - along.y * direction.x) > 1e-6;
      if (perpendicular) {
        // Temporarily allow THIS expressly connected corner operation through
        // the adjacent footprint wall's geometry guard. Do not persist a link
        // choice on the neighbour behind the user's back.
        const editable = wallJointsLinked(project, neighbour.id) ? project : toggleWallJoints(project, neighbour.id);
        const moved = moveHouseSelections(editable, [{ kind: "wall", id: neighbour.id }], move.x, move.y, { footprintEditable: true });
        if (moved.blocked.length) return blocked(project, moved.blocked.join(". "));
        return { project: { ...moved.project, objectInstances: project.objectInstances }, selections: [selection], blocked: [] };
      }
    }
  }
  // Inside walls stay independent unless their connection was linked.
  const point = end === "end" ? wall.end : wall.start;
  const patch: HousePatch = end === "end" ? { endX: point.x + move.x, endY: point.y + move.y } : { startX: point.x + move.x, startY: point.y + move.y };
  return { project: patchHouseObject(project, selection, patch), selections: [selection], blocked: [] };
}

/** Sets a wall's length from one end, the other end staying put. */
export function setWallLength(project: HouseProject, wallId: string, end: WallEnd, length: number): HouseCommandMutation {
  const wall = project.walls.find((item) => item.id === wallId);
  if (!wall) return blocked(project, "Wall not found");
  return extendWall(project, wallId, end, length - unit(wall).length);
}

/**
 * Moving a handle edits ONLY the selected wall by default. A link toggle
 * explicitly allows shared junctions to follow. The selected wall is edited
 * once: patchWall handles linked endpoints together in one rebuild/undo step.
 */
export function moveWallEnd(project: HouseProject, wallId: string, end: WallEnd, to: Point): HouseCommandMutation {
  const wall = project.walls.find((item) => item.id === wallId);
  if (!wall) return blocked(project, "Wall not found");
  const selection: HouseSelection = { kind: "wall", id: wallId };
  if (project.objectInstances[wallId]?.pinned) return blocked(project, "This wall is locked — unlock it to change it");
  const linked = wallJointLinked(project, wallId, end);
  if (plain(project, wall).outline && !linked
    return blocked(project, "This exterior wall belongs to the closed footprint. Turn on Link joints before moving its corner.");
  const moving = wall[end];
  const fixed = wall[end === "start" ? "end" : "start"];
  // Freehand plans are intentionally orthogonal. Dragging an endpoint must
  // not accidentally turn a horizontal/vertical wall into a diagonal one.
  // Moving the whole wall still slides it normally.
  const orthogonal = project.levels.find((level) => level.id === wall.levelId)?.plan?.freehand === true;
  const target = orthogonal
    ? Math.abs(wall.end.x - wall.start.x) >= Math.abs(wall.end.y - wall.start.y)
      ? { x: to.x, y: fixed.y }
      : { x: fixed.x, y: to.y }
    : to;
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || Math.hypot(target.x - fixed.x, target.y - fixed.y) < 200)
    return blocked(project, "A wall must be at least 200 mm long");
  if (Math.hypot(target.x - moving.x, target.y - moving.y) < 0.01)
    return { project, selections: [selection], blocked: [] };
  if (linked) {
    const connected = project.walls.filter((item) =>
      item.id !== wallId && item.levelId === wall.levelId &&
      (["start", "end"] as const).some((side) => Math.hypot(item[side].x - moving.x, item[side].y - moving.y) <= TOLERANCE),
    );
    for (const joint of connected) {
      if (project.objectInstances[joint.id]?.pinned)
        return blocked(project, "A locked wall shares this joint — release the connection or unlock that wall");
      const side = (["start", "end"] as const).find((key) =>
        Math.hypot(joint[key].x - moving.x, joint[key].y - moving.y) <= TOLERANCE)!;
      const far = joint[side === "start" ? "end" : "start"];
      if (Math.hypot(target.x - far.x, target.y - far.y) < 200)
        return blocked(project, "Moving the joined endpoint would make a neighbouring wall shorter than 200 mm");
    }
  }
  const patch: HousePatch = end === "end"
    ? { endX: target.x, endY: target.y }
    : { startX: target.x, startY: target.y };
  return { project: patchHouseObject(project, selection, patch), selections: [selection], blocked: [] };
}

/** An inside wall turned a quarter about its middle. The outline is the house's shape, and is not turned. */
export function rotateWall90(project: HouseProject, wallId: string): HouseCommandMutation {
  const wall = project.walls.find((item) => item.id === wallId);
  if (!wall) return blocked(project, "Wall not found");
  if (plain(project, wall).outline) return blocked(project, "An outside wall is part of the house's outline — move it, or turn an inside wall");
  const middle = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  const turn = (point: Point) => ({ x: middle.x - (point.y - middle.y), y: middle.y + (point.x - middle.x) });
  const start = turn(wall.start);
  const end = turn(wall.end);
  const selection: HouseSelection = { kind: "wall", id: wall.id };
  return { project: patchHouseObject(project, selection, { startX: start.x, startY: start.y, endX: end.x, endY: end.y }), selections: [selection], blocked: [] };
}

/**
 * A new inside wall parallel to this one, `offset` away along its normal —
 * splitting the room it crosses, as any wall drawn across a room does. With
 * no offset given, it goes halfway to the next parallel wall on the room's
 * side, which is where a second partition usually belongs.
 */
export function duplicateWallParallel(project: HouseProject, wallId: string, offset?: number): HouseCommandMutation {
  const wall = project.walls.find((item) => item.id === wallId);
  if (!wall) return blocked(project, "Wall not found");
  const direction = unit(wall);
  const normal = { x: -direction.y, y: direction.x };
  let distance = offset;
  if (distance === undefined) {
    // Halfway to the farther of the two neighbouring parallel walls.
    const chain = wallChain(project, wallId);
    const index = chain?.positions.findIndex((item) => item.wallId === wallId) ?? -1;
    const here = chain?.positions[index]?.at ?? 0;
    const before = index > 0 ? here - chain!.positions[index - 1]!.at : 0;
    const after = chain && index >= 0 && index + 1 < chain.positions.length ? chain.positions[index + 1]!.at - here : 0;
    if (chain && Math.max(before, after) > 400) {
      // The normal points towards increasing positions when direction is +1.
      distance = after >= before ? chain.direction * after / 2 : -chain.direction * before / 2;
    } else {
      distance = 1000;
    }
  }
  const start = { x: wall.start.x + normal.x * distance, y: wall.start.y + normal.y * distance };
  const end = { x: wall.end.x + normal.x * distance, y: wall.end.y + normal.y * distance };
  const created = createHouseObjectFromGesture(project, "wall", wall.levelId, start, end, { wallThickness: plain(project, wall).outline ? 120 : wall.thickness, height: wall.height });
  if (created.blocked.length) return created;
  return { ...created, project: splitRoomAlong(created.project, wall.levelId, start, end) };
}

/**
 * A partition across a room, at `at` along its width (vertical) or depth
 * (horizontal), from the room's own edge to edge — a real wall, splitting the
 * room in two. `at` defaults to the middle.
 */
export function splitRoom(project: HouseProject, roomId: string, axis: "vertical" | "horizontal", at?: number): HouseCommandMutation {
  const room = project.rooms.find((item) => item.id === roomId);
  if (!room) return blocked(project, "Room not found");
  const xs = room.boundary.map((point) => point.x);
  const ys = room.boundary.map((point) => point.y);
  const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const span = axis === "vertical" ? box.maxX - box.minX : box.maxY - box.minY;
  const offset = at ?? span / 2;
  if (offset < 300 || offset > span - 300) return blocked(project, "Each part needs to be at least 300 mm");
  const line = axis === "vertical" ? box.minX + offset : box.minY + offset;
  // Where the line crosses the room's outline: an L-shaped room is crossed
  // over the stretch that actually holds the room, not its bounding box.
  const crossings: number[] = [];
  room.boundary.forEach((a, index) => {
    const b = room.boundary[(index + 1) % room.boundary.length]!;
    const [p, q, r, s] = axis === "vertical" ? [a.x, b.x, a.y, b.y] : [a.y, b.y, a.x, b.x];
    if ((p - line) * (q - line) < 0 || (Math.abs(p - line) < 1e-6 && Math.abs(q - line) >= 1e-6)) {
      const t = (line - p) / (q - p);
      crossings.push(r + (s - r) * t);
    }
  });
  const sorted = [...new Set(crossings.map((value) => Math.round(value * 1000) / 1000))].sort((a, b) => a - b);
  const centre = axis === "vertical" ? (box.minY + box.maxY) / 2 : (box.minX + box.maxX) / 2;
  let from = sorted[0];
  let to = sorted.at(-1);
  for (let index = 0; index + 1 < sorted.length; index += 2) {
    const mid = (sorted[index]! + sorted[index + 1]!) / 2;
    const probe = axis === "vertical" ? { x: line, y: mid } : { x: mid, y: line };
    if (pointInPolygon(probe, room.boundary) && (index === 0 || Math.abs(mid - centre) < Math.abs(((from ?? 0) + (to ?? 0)) / 2 - centre))) { from = sorted[index]; to = sorted[index + 1]; }
  }
  if (from === undefined || to === undefined || to - from < 300) return blocked(project, "That line does not cross the room");
  const start = axis === "vertical" ? { x: line, y: from } : { x: from, y: line };
  const end = axis === "vertical" ? { x: line, y: to } : { x: to, y: line };
  const created = createHouseObjectFromGesture(project, "wall", room.levelId, start, end, { wallThickness: 120 });
  if (created.blocked.length) return created;
  return { ...created, project: splitRoomAlong(created.project, room.levelId, start, end) };
}

// ---------------------------------------------------------------------------
// Dimension chains
// ---------------------------------------------------------------------------

export type ChainPosition = { at: number; wallId: string };
export type WallChain = {
  /** "x": the chain runs across vertical walls, left to right. */
  axis: "x" | "y";
  /** Where the chain is drawn, on the other axis. */
  across: number;
  positions: ChainPosition[];
  /** +1: the selected wall's normal points along increasing `at`. */
  direction: 1 | -1;
};

function axisOf(wall: Wall): "x" | "y" | null {
  if (Math.abs(wall.end.x - wall.start.x) < TOLERANCE) return "x";
  if (Math.abs(wall.end.y - wall.start.y) < TOLERANCE) return "y";
  return null;
}

/**
 * The walls parallel to this one that it can be measured against: the ones
 * a line across it, at `t` along it, passes through — left to right for a
 * vertical wall, top to bottom for a horizontal one. Only straight (vertical
 * or horizontal) walls have a chain.
 */
export function wallChain(project: HouseProject, wallId: string, t = 0.25, shift = 0): WallChain | null {
  const wall = project.walls.find((item) => item.id === wallId);
  if (!wall) return null;
  const axis = axisOf(wall);
  if (!axis) return null;
  const across = axis === "x" ? wall.start.y + (wall.end.y - wall.start.y) * t : wall.start.x + (wall.end.x - wall.start.x) * t;
  const positions: ChainPosition[] = [];
  for (const other of project.walls.filter((item) => item.levelId === wall.levelId && axisOf(item) === axis)) {
    const [a, b] = axis === "x" ? [other.start.y, other.end.y] : [other.start.x, other.end.x];
    if (other.id !== wall.id && (across < Math.min(a, b) - TOLERANCE || across > Math.max(a, b) + TOLERANCE)) continue;
    const at = (axis === "x" ? other.start.x : other.start.y) + (other.id === wall.id ? shift : 0);
    if (!positions.some((item) => Math.abs(item.at - at) < TOLERANCE && item.wallId !== wall.id)) positions.push({ at, wallId: other.id });
  }
  positions.sort((a, b) => a.at - b.at);
  const direction = unit(wall);
  const normalAlong = axis === "x" ? -direction.y : direction.x;
  return { axis, across, positions, direction: normalAlong >= 0 ? 1 : -1 };
}

/** The floor's X and Y chains: where its vertical and horizontal walls stand. */
export function levelChains(project: HouseProject, levelId: string): { xs: number[]; ys: number[] } {
  const unique = (values: number[]) => values.sort((a, b) => a - b).filter((value, index, all) => index === 0 || value - all[index - 1]! >= TOLERANCE);
  const walls = project.walls.filter((wall) => wall.levelId === levelId);
  return {
    xs: unique(walls.filter((wall) => axisOf(wall) === "x").map((wall) => wall.start.x)),
    ys: unique(walls.filter((wall) => axisOf(wall) === "y").map((wall) => wall.start.y)),
  };
}

/**
 * Makes the distance between this wall and its neighbour in the chain exactly
 * `distance`, by moving this wall — the neighbour, the reference, stays.
 */
export function setWallDistance(project: HouseProject, wallId: string, neighbourId: string, distance: number): HouseCommandMutation {
  const chain = wallChain(project, wallId);
  const self = chain?.positions.find((item) => item.wallId === wallId);
  const other = chain?.positions.find((item) => item.wallId === neighbourId);
  if (!chain || !self || !other) return blocked(project, "Those walls are not side by side");
  if (distance < 100) return blocked(project, "That is closer than a wall's own thickness");
  const side = self.at >= other.at ? 1 : -1;
  const delta = other.at + side * distance - self.at;
  const move = chain.axis === "x" ? { x: delta, y: 0 } : { x: 0, y: delta };
  return moveHouseSelections(project, [{ kind: "wall", id: wallId }], move.x, move.y, { footprintEditable: true });
}

/** A rectangle the size of a room, for placing a copy. Null for any other shape. */
export function roomRectangle(project: HouseProject, roomId: string): { x: number; y: number; width: number; depth: number } | null {
  const room = project.rooms.find((item) => item.id === roomId);
  if (!room || room.boundary.length !== 4) return null;
  const xs = room.boundary.map((point) => point.x);
  const ys = room.boundary.map((point) => point.y);
  const rectangle = room.boundary.every((point, index) => {
    const next = room.boundary[(index + 1) % 4]!;
    return Math.abs(point.x - next.x) < TOLERANCE || Math.abs(point.y - next.y) < TOLERANCE;
  });
  return rectangle ? { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...ys) - Math.min(...ys) } : null;
}
