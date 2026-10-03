import type { Room } from "@/features/berchuma-studio/types/room";

import {
  buildFacadeElements,
  buildHouseBalconies,
  buildHouseCeilings,
  buildHouseSite,
  buildHouseVerandas,
  buildStructuralBeams,
  buildStructuralColumns,
  buildStructuralGrid,
  housePlanWalls,
  openingObjectId,
  wallObjectId,
  type HouseProject,
  type HouseSelection,
} from "../types/project";

export type HousePatch = Record<string, string | number>;

/**
 * Deleting an exterior wall means deleting the corner it starts from — there
 * is no such thing as erasing one side of a closed footprint and leaving the
 * rest alone. Reuses `rebuildLevel`, the same regeneration a dragged corner
 * already goes through, so walls, rooms, slabs, roofs, structure and the
 * rest stay consistent with the new, shorter footprint. Refused below a
 * triangle, for the same reason a `Room` itself refuses it.
 */
export function removeFootprintCorner(
  project: HouseProject,
  levelId: string,
  cornerId: string,
): { project: HouseProject; ok: boolean } {
  const level = project.levels.find((item) => item.id === levelId);
  const plan = level?.plan;
  if (!plan || plan.corners.length <= 3 || !plan.corners.some((corner) => corner.id === cornerId)) {
    return { project, ok: false };
  }
  const corners = plan.corners.filter((corner) => corner.id !== cornerId);
  return { project: rebuildLevel(project, levelId, { ...plan, corners }), ok: true };
}

/** Apply one inspector edit and keep the level plan and normalized objects aligned. */
export function patchHouseObject(
  project: HouseProject,
  selection: HouseSelection,
  patch: HousePatch,
): HouseProject {
  switch (selection.kind) {
    case "room":
      return patchRoom(project, selection.id, patch);
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
    case "grid":
      return patchGrid(project, selection.id, patch);
    case "facade":
      return { ...project, facadeElements: patchList(project.facadeElements, selection.id, patch) };
    case "balcony":
      return { ...project, balconies: patchList(project.balconies, selection.id, patch) };
    case "veranda":
      return { ...project, verandas: patchList(project.verandas, selection.id, patch) };
    case "ceiling":
      return { ...project, ceilings: patchList(project.ceilings, selection.id, patch) };
    case "site":
      return patchSite(project, selection.id, patch);
    case "foundation":
      return { ...project, foundations: patchList(project.foundations, selection.id, patch) };
    case "component":
      return { ...project, components: patchList(project.components, selection.id, patch) };
    case "railing":
      return patchRailing(project, selection.id, patch);
    case "reference-plane":
      return patchReferencePlane(project, selection.id, patch);
    case "annotation":
      return patchAnnotation(project, selection.id, patch);
    case "level":
      return patchLevel(project, selection.id, patch);
  }
}

function patchRailing(project: HouseProject, id: string, patch: HousePatch): HouseProject {
  return {
    ...project,
    railings: project.railings.map((item) => item.id === id ? {
      ...item,
      start: { x: numberOr(patch.startX, item.start.x), y: numberOr(patch.startY, item.start.y) },
      end: { x: numberOr(patch.endX, item.end.x), y: numberOr(patch.endY, item.end.y) },
      elevation: numberOr(patch.elevation, item.elevation),
      height: positiveOr(patch.height, item.height),
      material: typeof patch.material === "string" ? patch.material : item.material,
    } : item),
  };
}

function patchReferencePlane(project: HouseProject, id: string, patch: HousePatch): HouseProject {
  return {
    ...project,
    referencePlanes: project.referencePlanes.map((item) => item.id === id ? {
      ...item,
      name: typeof patch.name === "string" ? patch.name : item.name,
      start: { x: numberOr(patch.startX, item.start.x), y: numberOr(patch.startY, item.start.y) },
      end: { x: numberOr(patch.endX, item.end.x), y: numberOr(patch.endY, item.end.y) },
    } : item),
  };
}

function patchAnnotation(project: HouseProject, id: string, patch: HousePatch): HouseProject {
  return {
    ...project,
    annotations: project.annotations.map((item) => item.id === id ? {
      ...item,
      text: typeof patch.text === "string" ? patch.text : item.text,
      start: { x: numberOr(patch.startX, item.start.x), y: numberOr(patch.startY, item.start.y) },
      end: item.end ? { x: numberOr(patch.endX, item.end.x), y: numberOr(patch.endY, item.end.y) } : item.end,
      value: typeof patch.value === "number" && Number.isFinite(patch.value) ? patch.value : item.value,
    } : item),
  };
}

function patchRoom(project: HouseProject, id: string, patch: HousePatch): HouseProject {
  const room = project.rooms.find((item) => item.id === id);
  if (!room) return project;
  const name = typeof patch.name === "string" ? patch.name : room.name;
  const floorMaterial = typeof patch.floorMaterial === "string" ? patch.floorMaterial : room.floorMaterial;
  const wallMaterial = typeof patch.wallMaterial === "string" ? patch.wallMaterial : room.wallMaterial;
  const ceilingMaterial = typeof patch.ceilingMaterial === "string" ? patch.ceilingMaterial : room.ceilingMaterial;
  return {
    ...project,
    rooms: project.rooms.map((item) => item.id === id ? { ...item, name, floorMaterial, wallMaterial, ceilingMaterial } : item),
    levels: project.levels.map((level) => level.id === room.levelId && level.plan
      ? {
          ...level,
          plan: {
            ...level.plan,
            zones: level.plan.zones?.map((zone) => `${level.id}:${zone.id}` === id ? { ...zone, name, floorMaterial, wallMaterial, ceilingMaterial } : zone),
          },
        }
      : level),
    ceilings: project.ceilings.map((ceiling) => ceiling.roomId === id ? { ...ceiling, material: ceilingMaterial } : ceiling),
  };
}

function patchGrid(project: HouseProject, id: string, patch: HousePatch): HouseProject {
  return {
    ...project,
    structuralGrid: project.structuralGrid.map((grid) => {
      if (grid.id !== id) return grid;
      const position = numberOr(patch.position, grid.position);
      const start = { x: numberOr(patch.startX, grid.start.x), y: numberOr(patch.startY, grid.start.y) };
      const end = { x: numberOr(patch.endX, grid.end.x), y: numberOr(patch.endY, grid.end.y) };
      if (grid.axis === "x") { start.x = position; end.x = position; }
      else { start.y = position; end.y = position; }
      return { ...grid, label: typeof patch.label === "string" ? patch.label : grid.label, position, start, end };
    }),
  };
}

function patchSite(project: HouseProject, id: string, patch: HousePatch): HouseProject {
  const site = project.site;
  if (!site || site.id !== id) return project;
  const bounds = boundaryBounds(site.boundary);
  const centreX = numberOr(patch.x, (bounds.minX + bounds.maxX) / 2);
  const centreY = numberOr(patch.y, (bounds.minY + bounds.maxY) / 2);
  const width = positiveOr(patch.width, bounds.maxX - bounds.minX);
  const depth = positiveOr(patch.depth, bounds.maxY - bounds.minY);
  return {
    ...project,
    site: {
      ...site,
      boundary: rectangleBoundary(centreX, centreY, width, depth),
      elevation: numberOr(patch.elevation, site.elevation),
      thickness: positiveOr(patch.thickness, site.thickness),
      material: typeof patch.material === "string" ? patch.material : site.material,
    },
  };
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
  const effectivePatch = { ...patch };
  if (typeof patch.length === "number" && Number.isFinite(patch.length) && patch.length >= 200) {
    const currentLength = Math.max(0.5, Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y));
    effectivePatch.endX = wall.start.x + ((wall.end.x - wall.start.x) / currentLength) * patch.length;
    effectivePatch.endY = wall.start.y + ((wall.end.y - wall.start.y) / currentLength) * patch.length;
  }
  const next: HouseProject = {
    ...project,
    walls: project.walls.map((item) =>
      item.id === id
        ? {
            ...item,
            start: { x: numberOr(effectivePatch.startX, item.start.x), y: numberOr(effectivePatch.startY, item.start.y) },
            end: { x: numberOr(effectivePatch.endX, item.end.x), y: numberOr(effectivePatch.endY, item.end.y) },
            thickness: positiveOr(effectivePatch.thickness, item.thickness),
            height: positiveOr(effectivePatch.height, item.height),
            material: typeof effectivePatch.material === "string" ? effectivePatch.material : item.material,
          }
        : item,
    ),
  };
  const level = next.levels.find((item) => item.id === wall.levelId);
  const plan = level?.plan;
  const sourceWallId = wall.sourceWallId ?? wall.id.split(":wall:")[1];
  if (!level || !plan || !sourceWallId) return next;

  const startIndex = plan.corners.findIndex((corner) => corner.id === sourceWallId);
  if (startIndex < 0) {
    const interior = plan.interiorWalls?.find((item) => item.id === sourceWallId);
    if (!interior) return next;
    return rebuildLevel(next, level.id, {
      ...plan,
      interiorWalls: (plan.interiorWalls ?? []).map((item) => item.id === sourceWallId ? {
        ...item,
        start: { x: numberOr(effectivePatch.startX, item.start.x), y: numberOr(effectivePatch.startY, item.start.y) },
        end: { x: numberOr(effectivePatch.endX, item.end.x), y: numberOr(effectivePatch.endY, item.end.y) },
        thickness: positiveOr(effectivePatch.thickness, item.thickness),
        height: positiveOr(effectivePatch.height, item.height),
      } : item),
    });
  }
  const endIndex = (startIndex + 1) % plan.corners.length;
  const corners = plan.corners.map((corner, index) => {
    if (index === startIndex) {
      return {
        ...corner,
        x: numberOr(effectivePatch.startX, corner.x),
        y: numberOr(effectivePatch.startY, corner.y),
      };
    }
    if (index === endIndex) {
      return {
        ...corner,
        x: numberOr(effectivePatch.endX, corner.x),
        y: numberOr(effectivePatch.endY, corner.y),
      };
    }
    return corner;
  });
  const changedPlan: Room = {
    ...plan,
    corners,
    wallThickness: positiveOr(effectivePatch.thickness, plan.wallThickness),
    ceilingHeight: positiveOr(effectivePatch.height, plan.ceilingHeight),
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
  // An opening stays inside its wall: dragging or typing past the end stops
  // at the end, rather than leaving a door hanging off the corner.
  const host = project.walls.find((item) => item.id === opening.wallId);
  if (host && (patch.offset !== undefined || patch.width !== undefined)) {
    const length = Math.hypot(host.end.x - host.start.x, host.end.y - host.start.y);
    const width = Math.min(positiveOr(patch.width, opening.width), length);
    patch = { ...patch, width, offset: Math.min(Math.max(0, numberOr(patch.offset, opening.offset)), Math.max(0, length - width)) };
  }
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
    balconies: project.balconies.map((item) =>
      item.levelId === id ? { ...item, elevation: item.elevation + delta } : item,
    ),
    verandas: project.verandas.map((item) =>
      item.levelId === id ? { ...item, elevation: item.elevation + delta } : item,
    ),
    ceilings: project.ceilings.map((item) =>
      item.levelId === id ? { ...item, elevation: item.elevation + delta } : item,
    ),
    site: project.site?.levelId === id
      ? { ...project.site, elevation: project.site.elevation + delta }
      : project.site,
  };
}

/**
 * A new floor on top, the way a two-storey project starts out: the top
 * floor's plan carried up, its walls, rooms and slab built from it, the roof
 * moved up to cover it, and a stair added on the floor below so the two are
 * joined. The new floor's geometry comes from the same rebuild every plan
 * edit goes through, so it is the same model in 2D and 3D from the start.
 */
export function addHouseFloor(project: HouseProject): { project: HouseProject; levelId: string | null } {
  const top = [...project.levels].sort((a, b) => b.elevation - a.elevation)[0];
  if (!top?.plan) return { project, levelId: null };
  const taken = new Set(project.levels.map((level) => level.id));
  let number = project.levels.length + 1;
  while (taken.has(`floor-${number}`)) number += 1;
  const levelId = `floor-${number}`;
  const name = `${ordinalFloor(project.levels.length)} Floor`;
  const elevation = top.elevation + top.floorToFloorHeight;
  const plan: Room = { ...structuredClone(top.plan), reference: undefined, runWalls: [] };

  const hasStair = project.stairs.some((stair) => stair.levelId === top.id);
  const xs = plan.corners.map((corner) => corner.x);
  const ys = plan.corners.map((corner) => corner.y);
  const stair: HouseProject["stairs"][number] = {
    id: `${top.id}:stair`,
    levelId: top.id,
    x: Math.min(...xs) + Math.min(1200, (Math.max(...xs) - Math.min(...xs)) * 0.2),
    y: Math.min(...ys) + Math.min(1200, (Math.max(...ys) - Math.min(...ys)) * 0.2),
    elevation: top.elevation,
    width: 1000,
    length: 3000,
    height: top.floorToFloorHeight,
    rotation: 0,
    steps: Math.min(24, Math.max(12, Math.round(top.floorToFloorHeight / 175))),
    type: "straight",
    material: "Reinforced concrete",
  };

  const next: HouseProject = {
    ...project,
    levels: [...project.levels, { id: levelId, name, elevation, floorToFloorHeight: top.floorToFloorHeight, plan }],
    views: [...project.views, { id: `view:plan:${levelId}`, name, kind: "floor-plan", levelId, hiddenCategories: [], temporaryHiddenIds: [], isolatedIds: [], cutPlane: 1200, topOffset: 2300, bottomOffset: 0 }],
    slabs: [...project.slabs, { id: `${levelId}:slab`, levelId, boundary: plan.corners.map((point) => ({ x: point.x, y: point.y })), thickness: 150, elevation, material: "Reinforced concrete" }],
    roofs: project.roofs.map((roof) => roof.levelId === top.id ? { ...roof, levelId, elevation: roof.elevation + top.floorToFloorHeight } : roof),
    stairs: hasStair ? project.stairs : [...project.stairs, stair],
    plannedFloorCount: Math.max(project.plannedFloorCount, project.levels.length + 1),
  };
  return { project: rebuildLevel(next, levelId, plan), levelId };
}

function ordinalFloor(index: number) {
  const suffix = index % 100 >= 11 && index % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[index % 10] ?? "th";
  return `${index}${suffix}`;
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

  const walls = housePlanWalls(plan).map((wall) => ({
    id: wallObjectId(levelId, wall.id),
    sourceWallId: wall.id,
    levelId,
    roomId,
    start: { ...wall.start },
    end: { ...wall.end },
    thickness: wall.thickness,
    height: wall.height,
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
  const rebuiltRooms = [
    ...project.rooms.filter((room) => room.levelId !== levelId),
    ...roomsForPlan(levelId, plan, project.rooms.filter((room) => room.levelId === levelId)),
  ];
  const rebuiltDoors = [
    ...project.doors.filter((opening) => opening.levelId !== levelId),
    ...openings.filter((opening) => opening.type !== "window"),
  ];
  const rebuiltWindows = [
    ...project.windows.filter((opening) => opening.levelId !== levelId),
    ...openings.filter((opening) => opening.type === "window"),
  ];
  // Only this floor's automatic structure follows the plan. Columns, beams
  // and grid lines somebody placed by hand — and every other floor's — are
  // kept: rebuilding them all from corners used to delete a hand-placed
  // column the moment a door was slid. With structure switched off (an
  // apartment or a single room) nothing is generated at all.
  const generate = project.modelingOptions?.structure ?? true;
  const thisLevel = levels.filter((level) => level.id === levelId);
  const automatic = (id: string, kind: "column" | "beam" | "grid") => id.startsWith(`${levelId}:${kind}:`);
  const keptColumns = project.structuralColumns.filter((item) => !automatic(item.id, "column"));
  const structuralColumns = generate ? [...keptColumns, ...buildStructuralColumns(thisLevel, project.structuralColumns)] : keptColumns;
  const keptBeams = project.structuralBeams.filter((item) => !automatic(item.id, "beam"));
  const structuralBeams = generate ? [...keptBeams, ...buildStructuralBeams(walls, thisLevel, project.structuralBeams)] : keptBeams;
  const keptGrid = project.structuralGrid.filter((item) => !automatic(item.id, "grid"));
  const structuralGrid = generate ? [...keptGrid, ...buildStructuralGrid(thisLevel, structuralColumns, project.structuralGrid)] : keptGrid;
  // A slab or roof that followed the outline follows it still; one laid over
  // a single room (an extension's own floor) keeps its own shape.
  const oldOutline = project.levels.find((level) => level.id === levelId)?.plan?.corners ?? [];
  const followsOutline = (boundary: readonly { x: number; y: number }[]) => boundary.length === oldOutline.length && boundary.every((point, index) => Math.hypot(point.x - oldOutline[index]!.x, point.y - oldOutline[index]!.y) < 1);

  return {
    ...project,
    levels,
    rooms: rebuiltRooms,
    walls: rebuiltWalls,
    doors: rebuiltDoors,
    windows: rebuiltWindows,
    slabs: project.slabs.map((slab) =>
      slab.levelId === levelId && followsOutline(slab.boundary)
        ? { ...slab, boundary: plan.corners.map((point) => ({ x: point.x, y: point.y })) }
        : slab,
    ),
    roofs: project.roofs.map((roof) =>
      roof.levelId === levelId && followsOutline(roof.boundary)
        ? { ...roof, boundary: plan.corners.map((point) => ({ x: point.x, y: point.y })) }
        : roof,
    ),
    facadeElements: buildFacadeElements(rebuiltWalls, levels, project.facade),
    structuralColumns,
    structuralBeams,
    structuralGrid,
    ceilings: buildHouseCeilings(rebuiltRooms, levels, project.ceilings),
    site: buildHouseSite(rebuiltRooms, project.site),
    verandas: buildHouseVerandas(levels, rebuiltWalls, rebuiltDoors, project.verandas),
    balconies: buildHouseBalconies(levels, rebuiltWalls, rebuiltDoors, project.balconies),
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

function boundaryBounds(points: { x: number; y: number }[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function rectangleBoundary(x: number, y: number, width: number, depth: number) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  return [
    { x: x - halfWidth, y: y - halfDepth },
    { x: x + halfWidth, y: y - halfDepth },
    { x: x + halfWidth, y: y + halfDepth },
    { x: x - halfWidth, y: y + halfDepth },
  ];
}

function roomsForPlan(levelId: string, plan: Room, previous: HouseProject["rooms"]): HouseProject["rooms"] {
  if (plan.zones?.length) {
    return plan.zones.map((zone) => {
      const id = `${levelId}:${zone.id}`;
      const old = previous.find((room) => room.id === id);
      return {
        id,
        levelId,
        name: zone.name,
        boundary: zone.boundary.map((point) => ({ ...point })),
        floorMaterial: old?.floorMaterial ?? zone.floorMaterial,
        wallMaterial: old?.wallMaterial ?? zone.wallMaterial,
        ceilingMaterial: old?.ceilingMaterial ?? zone.ceilingMaterial,
        ceilingHeight: plan.ceilingHeight,
      };
    });
  }
  const old = previous[0];
  return [{
    id: old?.id ?? `${levelId}:room-1`,
    levelId,
    name: old?.name ?? "Floor",
    boundary: plan.corners.map((point) => ({ x: point.x, y: point.y })),
    floorMaterial: old?.floorMaterial ?? "Unspecified",
    wallMaterial: old?.wallMaterial ?? "Paint",
    ceilingMaterial: old?.ceilingMaterial ?? "Gypsum board",
    ceilingHeight: plan.ceilingHeight,
  }];
}
