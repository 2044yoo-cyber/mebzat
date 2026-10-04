import { polygonArea, polygonPerimeter, wallLabels, wallRooms } from "./measurements";
import type { HouseProject } from "../types/project";

/**
 * What Berchuma will be given when a wardrobe or a kitchen is designed against
 * a wall or a room of the plan — prepared now, not yet wired to a button.
 *
 * Read from the plan, never copied: rooms, walls and openings already carry
 * stable ids (a wall is `${levelId}:wall:${cornerId}`, an inside wall keeps the
 * id it was drawn with, a room is `${levelId}:${zoneId}`), so "this bedroom
 * wall" is found again however the plan has changed since. Millimetres
 * throughout, plan coordinates, y pointing down the drawing.
 */
export type WallOpening = {
  id: string;
  kind: "door" | "window" | "opening";
  /** From the wall's start, along it. */
  offset: number;
  width: number;
  height: number;
  sill: number;
};

export type WallContext = {
  wallId: string;
  levelId: string;
  label: string;
  rooms: string[];
  start: { x: number; y: number };
  end: { x: number; y: number };
  length: number;
  thickness: number;
  height: number;
  /** Direction of the wall from start to end, in degrees from the plan's +x axis. */
  angle: number;
  openings: WallOpening[];
  /** The stretches of wall with no door or window in them: where a unit can stand. */
  freeRuns: { from: number; to: number; length: number }[];
};

export type RoomContext = {
  roomId: string;
  levelId: string;
  name: string;
  /** The room's clear height: the plan's ceiling height for its floor. */
  height: number;
  area: number;
  perimeter: number;
  boundary: { x: number; y: number }[];
  walls: WallContext[];
};

export function wallContext(project: HouseProject, wallId: string, clearance = 0): WallContext | null {
  const wall = project.walls.find((item) => item.id === wallId);
  if (!wall) return null;
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  const openings: WallOpening[] = [...project.doors, ...project.windows]
    .filter((item) => item.wallId === wall.id)
    .map((item) => ({ id: item.id, kind: item.type === "window" ? "window" as const : item.type === "door" ? "door" as const : "opening" as const, offset: item.offset, width: item.width, height: item.height, sill: item.sillHeight }))
    .sort((a, b) => a.offset - b.offset);
  const freeRuns: WallContext["freeRuns"] = [];
  let cursor = 0;
  for (const opening of openings) {
    const stop = Math.max(0, opening.offset - clearance);
    if (stop > cursor) freeRuns.push({ from: cursor, to: stop, length: stop - cursor });
    cursor = Math.max(cursor, Math.min(length, opening.offset + opening.width + clearance));
  }
  if (length > cursor) freeRuns.push({ from: cursor, to: length, length: length - cursor });
  return {
    wallId: wall.id,
    levelId: wall.levelId,
    label: wallLabels(project, wall.levelId).get(wall.id) ?? "Wall",
    rooms: wallRooms(project, wall.id),
    start: { ...wall.start },
    end: { ...wall.end },
    length,
    thickness: wall.thickness,
    height: wall.height,
    angle: (Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180) / Math.PI,
    openings,
    freeRuns,
  };
}

/** A room and the walls around it, each with its openings and free runs. */
export function roomContext(project: HouseProject, roomId: string, clearance = 0): RoomContext | null {
  const room = project.rooms.find((item) => item.id === roomId);
  if (!room) return null;
  const level = project.levels.find((item) => item.id === room.levelId);
  const walls = project.walls
    .filter((wall) => wall.levelId === room.levelId && wallRooms(project, wall.id).includes(room.name))
    .map((wall) => wallContext(project, wall.id, clearance)!)
    .filter(Boolean);
  return {
    roomId: room.id,
    levelId: room.levelId,
    name: room.name,
    height: level?.plan?.ceilingHeight ?? level?.floorToFloorHeight ?? 0,
    area: polygonArea(room.boundary),
    perimeter: polygonPerimeter(room.boundary),
    boundary: room.boundary.map((point) => ({ ...point })),
    walls,
  };
}
