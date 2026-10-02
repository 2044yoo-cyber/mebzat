import { roomWalls } from "@/features/berchuma-studio/services/room-geometry";
import type { Room } from "@/features/berchuma-studio/types/room";

import {
  buildFacadeElements,
  buildStructuralBeams,
  buildStructuralColumns,
  openingObjectId,
  wallObjectId,
  type HouseProject,
  type HouseSelection,
} from "../types/project";

export type HousePatch = Record<string, string | number>;

/** Apply one inspector edit and keep the level plan and normalized objects aligned. */
export function patchHouseObject(
  project: HouseProject,
  selection: HouseSelection,
  patch: HousePatch,
): HouseProject {
  switch (selection.kind) {
    case "wall":
      return patchWall(project, selection.id, patch);
    case "door":
    case "window":
      return patchOpening(project, selection.kind, selection.id, patch);
    case "stair":
      return { ...project, stairs: patchList(project.stairs, selection.id, patch) };
    case "slab":
      return { ...project, slabs: patchList(project.slabs, selection.id, patch) };
    case "roof":
      return { ...project, roofs: patchList(project.roofs, selection.id, patch) };
    case "column":
      return { ...project, structuralColumns: patchList(project.structuralColumns, selection.id, patch) };
    case "beam":
      return patchBeam(project, selection.id, patch);
    case "level":
      return patchLevel(project, selection.id, patch);
  }
}

function patchBeam(project: HouseProject, id: string, patch: HousePatch): HouseProject {
  return {
    ...project,
    structuralBeams: project.structuralBeams.map((beam) => beam.id === id
      ? {
          ...beam,
          start: { x: numberOr(patch.startX, beam.start.x), y: numberOr(patch.startY, beam.start.y) },
          end: { x: numberOr(patch.endX, beam.end.x), y: numberOr(patch.endY, beam.end.y) },
          elevation: numberOr(patch.elevation, beam.elevation),
          width: positiveOr(patch.width, beam.width),
          depth: positiveOr(patch.depth, beam.depth),
          material: typeof patch.material === "string" ? patch.material : beam.material,
        }
      : beam),
  };
}

function patchWall(project: HouseProject, id: string, patch: HousePatch): HouseProject {
  const wall = project.walls.find((item) => item.id === id);
  if (!wall) return project;
  const next: HouseProject = {
    ...project,
    walls: project.walls.map((item) =>
      item.id === id && typeof patch.material === "string"
        ? { ...item, material: patch.material }
        : item,
    ),
  };
  const level = next.levels.find((item) => item.id === wall.levelId);
  const plan = level?.plan;
  const sourceWallId = wall.sourceWallId ?? wall.id.split(":wall:")[1];
  if (!level || !plan || !sourceWallId) return next;

  const startIndex = plan.corners.findIndex((corner) => corner.id === sourceWallId);
  if (startIndex < 0) return next;
  const endIndex = (startIndex + 1) % plan.corners.length;
  const corners = plan.corners.map((corner, index) => {
    if (index === startIndex) {
      return {
        ...corner,
        x: numberOr(patch.startX, corner.x),
        y: numberOr(patch.startY, corner.y),
      };
    }
    if (index === endIndex) {
      return {
        ...corner,
        x: numberOr(patch.endX, corner.x),
        y: numberOr(patch.endY, corner.y),
      };
    }
    return corner;
  });
  const changedPlan: Room = {
    ...plan,
    corners,
    wallThickness: positiveOr(patch.thickness, plan.wallThickness),
    ceilingHeight: positiveOr(patch.height, plan.ceilingHeight),
  };
  return rebuildLevel(next, level.id, changedPlan);
}

function patchOpening(
  project: HouseProject,
  kind: "door" | "window",
  id: string,
  patch: HousePatch,
): HouseProject {
  const list = kind === "door" ? project.doors : project.windows;
  const opening = list.find((item) => item.id === id);
  if (!opening) return project;
  const changed = patchList(list, id, patch);
  const next: HouseProject = kind === "door"
    ? { ...project, doors: changed }
    : { ...project, windows: changed };
  const level = next.levels.find((item) => item.id === opening.levelId);
  const plan = level?.plan;
  const sourceId = opening.sourceOpeningId ?? opening.id.split(`:${kind}:`)[1];
  if (!level || !plan || !sourceId) return next;

  const changedPlan: Room = {
    ...plan,
    openings: plan.openings.map((item) =>
      item.id === sourceId
        ? {
            ...item,
            width: positiveOr(patch.width, item.width),
            height: positiveOr(patch.height, item.height),
            sill: nonNegativeOr(patch.sillHeight, item.sill),
            offset: nonNegativeOr(patch.offset, item.offset),
          }
        : item,
    ),
  };
  return rebuildLevel(next, level.id, changedPlan);
}

function patchLevel(project: HouseProject, id: string, patch: HousePatch): HouseProject {
  const level = project.levels.find((item) => item.id === id);
  if (!level) return project;
  const elevation = numberOr(patch.elevation, level.elevation);
  const delta = elevation - level.elevation;
  const floorToFloorHeight = positiveOr(patch.floorToFloorHeight, level.floorToFloorHeight);
  return {
    ...project,
    levels: project.levels.map((item) =>
      item.id === id
        ? {
            ...item,
            elevation,
            floorToFloorHeight,
          }
        : item,
    ),
    slabs: project.slabs.map((item) =>
      item.levelId === id ? { ...item, elevation: item.elevation + delta } : item,
    ),
    stairs: project.stairs.map((item) =>
      item.levelId === id
        ? {
            ...item,
            elevation: item.elevation + delta,
            height: floorToFloorHeight,
            steps: Math.min(40, Math.max(3, Math.round(floorToFloorHeight / 175))),
          }
        : item,
    ),
    roofs: project.roofs.map((item) =>
      item.levelId === id ? { ...item, elevation: item.elevation + delta } : item,
    ),
    structuralColumns: project.structuralColumns.map((item) =>
      item.levelId === id ? { ...item, elevation: item.elevation + delta } : item,
    ),
    structuralBeams: project.structuralBeams.map((item) =>
      item.levelId === id ? { ...item, elevation: item.elevation + delta } : item,
    ),
  };
}

function rebuildLevel(project: HouseProject, levelId: string, plan: Room): HouseProject {
  const roomId = project.rooms.find((room) => room.levelId === levelId)?.id ?? `${levelId}:room-1`;
  const oldWalls = new Map(
    project.walls
      .filter((wall) => wall.levelId === levelId)
      .map((wall) => [wall.sourceWallId ?? wall.id.split(":wall:")[1], wall]),
  );
  const oldOpenings = new Map(
    [...project.doors, ...project.windows]
      .filter((opening) => opening.levelId === levelId)
      .map((opening) => [opening.sourceOpeningId ?? opening.id.split(":").at(-1), opening]),
  );

  const walls = roomWalls(plan).map((wall) => ({
    id: wallObjectId(levelId, wall.id),
    sourceWallId: wall.id,
    levelId,
    roomId,
    start: { ...wall.start },
    end: { ...wall.end },
    thickness: plan.wallThickness,
    height: plan.ceilingHeight,
    material: oldWalls.get(wall.id)?.material ?? "Masonry",
  }));
  const openings = plan.openings.map((opening) => {
    const old = oldOpenings.get(opening.id);
    return {
      id: openingObjectId(levelId, opening.kind, opening.id),
      sourceOpeningId: opening.id,
      levelId,
      wallId: wallObjectId(levelId, opening.wallId),
      width: opening.width,
      height: opening.height,
      sillHeight: opening.sill,
      offset: opening.offset,
      type: opening.kind,
      style: old?.style ?? "standard",
      material: old?.material ?? (opening.kind === "window" ? "Aluminium" : "Timber"),
      swing: opening.swing,
    };
  });
  const levels = project.levels.map((level) => level.id === levelId ? { ...level, plan } : level);
  const rebuiltWalls = [...project.walls.filter((wall) => wall.levelId !== levelId), ...walls];
  const structuralColumns = buildStructuralColumns(levels, project.structuralColumns);
  const structuralBeams = buildStructuralBeams(rebuiltWalls, levels, project.structuralBeams);

  return {
    ...project,
    levels,
    rooms: project.rooms.map((room) =>
      room.levelId === levelId
        ? {
            ...room,
            boundary: plan.corners.map((point) => ({ x: point.x, y: point.y })),
            ceilingHeight: plan.ceilingHeight,
          }
        : room,
    ),
    walls: rebuiltWalls,
    doors: [
      ...project.doors.filter((opening) => opening.levelId !== levelId),
      ...openings.filter((opening) => opening.type !== "window"),
    ],
    windows: [
      ...project.windows.filter((opening) => opening.levelId !== levelId),
      ...openings.filter((opening) => opening.type === "window"),
    ],
    slabs: project.slabs.map((slab) =>
      slab.levelId === levelId
        ? { ...slab, boundary: plan.corners.map((point) => ({ x: point.x, y: point.y })) }
        : slab,
    ),
    roofs: project.roofs.map((roof) =>
      roof.levelId === levelId
        ? { ...roof, boundary: plan.corners.map((point) => ({ x: point.x, y: point.y })) }
        : roof,
    ),
    facadeElements: buildFacadeElements(rebuiltWalls, levels, project.facade),
    structuralColumns,
    structuralBeams,
  };
}

function patchList<T extends { id: string }>(items: T[], id: string, patch: HousePatch): T[] {
  return items.map((item) => item.id === id ? { ...item, ...patch } as T : item);
}

function numberOr(value: string | number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveOr(value: string | number | undefined, fallback: number) {
  const next = numberOr(value, fallback);
  return next > 0 ? next : fallback;
}

function nonNegativeOr(value: string | number | undefined, fallback: number) {
  return Math.max(0, numberOr(value, fallback));
}
