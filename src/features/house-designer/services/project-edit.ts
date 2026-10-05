import { roomSchema, type Room } from "@/features/berchuma-studio/types/room";

import { applyModelingOptions } from "./workspace-options";
import { applyStairEdit, stairFields, stairParams } from "./stair-geometry";

import {
  buildFacadeElements,
  buildHouseBalconies,
  buildHouseCeilings,
  buildHouseSite,
  buildHouseVerandas,
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
      return patchStair(project, selection.id, patch);
    case "slab":
      return { ...project, slabs: patchList(project.slabs, selection.id, patch) };
    case "roof": {
      const roofs = patchList(project.roofs, selection.id, patch);
      const roof = roofs.find((item) => item.id === selection.id);
      if (!roof || patch.type === undefined) return { ...project, roofs };
      // A parapet belongs to a flat roof: under a gable or hip it would hide
      // the roof it is meant to edge. Going back to flat puts it back.
      return { ...project, roofs, facadeElements: parapetsOnlyOnFlatRoofs(buildFacadeElements(project.walls, project.levels, project.facade), roofs) };
    }
    case "column": {
      // A square or round column is as deep as it is wide.
      const column = project.structuralColumns.find((item) => item.id === selection.id);
      const shape = typeof patch.type === "string" ? patch.type : column?.type;
      const width = numberOr(patch.width, column?.width ?? 0);
      return { ...project, structuralColumns: patchList(project.structuralColumns, selection.id, shape === "circular" || shape === "square" ? { ...patch, depth: width } : patch) };
    }
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

/** A stair edit, and everything that follows from it: risers, treads, its footprint. */
function patchStair(project: HouseProject, id: string, patch: HousePatch): HouseProject {
  return {
    ...project,
    stairs: project.stairs.map((item) => {
      if (item.id !== id) return item;
      const fields = stairFields(applyStairEdit(stairParams(item), patch));
      return { ...item, ...fields, x: numberOr(patch.x, item.x), y: numberOr(patch.y, item.y), rotation: numberOr(patch.rotation, item.rotation), material: typeof patch.material === "string" ? patch.material : item.material };
    }),
  };
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
    const start = { x: numberOr(effectivePatch.startX, interior.start.x), y: numberOr(effectivePatch.startY, interior.start.y) };
    const end = { x: numberOr(effectivePatch.endX, interior.end.x), y: numberOr(effectivePatch.endY, interior.end.y) };
    // What was attached to the wall stays attached: the ends of the walls
    // that meet it (at a corner or a T) and the corners of the rooms it
    // bounds keep their place along its line, wherever the line goes. The
    // house's outside corners are never moved by an inside wall.
    const follow = attachedTo(interior.start, interior.end, start, end, interior.thickness / 2 + 5);
    const outside = new Set(plan.corners.map((corner) => `${corner.x},${corner.y}`));
    const keepOutside = (point: { x: number; y: number }) => outside.has(`${point.x},${point.y}`) ? point : follow(point);
    return rebuildLevel(next, level.id, {
      ...plan,
      interiorWalls: (plan.interiorWalls ?? []).map((item) => item.id === sourceWallId ? {
        ...item,
        start,
        end,
        thickness: positiveOr(effectivePatch.thickness, item.thickness),
        height: positiveOr(effectivePatch.height, item.height),
      } : { ...item, start: keepOutside(item.start), end: keepOutside(item.end) }),
      zones: (plan.zones ?? []).map((zone) => ({ ...zone, boundary: zone.boundary.map(keepOutside) })),
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
  // Inside walls ending on this wall, and room corners on it, go with it.
  const follow = attachedTo(plan.corners[startIndex]!, plan.corners[endIndex]!, corners[startIndex]!, corners[endIndex]!, plan.wallThickness / 2 + 5);
  const changedPlan: Room = {
    ...plan,
    corners,
    interiorWalls: (plan.interiorWalls ?? []).map((item) => ({ ...item, start: follow(item.start), end: follow(item.end) })),
    zones: plan.zones?.map((zone) => ({ ...zone, boundary: zone.boundary.map(follow) })),
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
            // The rebuild reads the swing from the plan: it is kept there too.
            swing: SWINGS.includes(patch.swing as never) ? patch.swing as Room["openings"][number]["swing"] : item.swing,
          }
        : item,
    ),
  };
  return rebuildLevel(next, level.id, changedPlan);
}

const SWINGS = ["in-left", "in-right", "out-left", "out-right", "none"];

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
 * Open space: the project's floors, settings and views with nothing on them —
 * no outline, walls, rooms, slabs, roof or structure. Only the grid shows
 * until something is drawn.
 */
export function openSpace(project: HouseProject): HouseProject {
  return {
    ...project,
    levels: project.levels.map((level) => ({ ...level, plan: null })),
    walls: [], doors: [], windows: [], rooms: [], slabs: [], roofs: [], ceilings: [], stairs: [],
    structuralColumns: [], structuralBeams: [], structuralGrid: [], foundations: [],
    facadeElements: [], verandas: [], balconies: [], railings: [], components: [], annotations: [],
    referencePlanes: [], site: null, objectInstances: {},
  };
}

/**
 * The first closed shape drawn on an empty floor becomes its outline: the
 * outside walls, the room inside them, the floor slab — and on the top floor
 * the roof, on the ground floor the footings — built by the same rebuild
 * every plan edit goes through, then trimmed to what the project's setup
 * includes. Null if the floor already has an outline or the shape is not one.
 */
export function establishLevelOutline(
  project: HouseProject,
  levelId: string,
  outline: readonly { x: number; y: number }[],
  options: { wallThickness?: number; roomName?: string } = {},
): HouseProject | null {
  const level = project.levels.find((item) => item.id === levelId);
  if (!level || level.plan || outline.length < 3) return null;
  const corners = outline.map((point, index) => ({ id: `c${index + 1}`, x: Math.round(point.x), y: Math.round(point.y) }));
  const area = corners.reduce((sum, corner, index) => { const next = corners[(index + 1) % corners.length]!; return sum + corner.x * next.y - next.x * corner.y; }, 0) / 2;
  if (Math.abs(area) < 250_000) return null;
  const plan = roomSchema.parse({
    version: 1,
    corners,
    wallThickness: options.wallThickness ?? 150,
    ceilingHeight: Math.min(6000, Math.max(1800, level.floorToFloorHeight)),
    openings: [], runWalls: [], interiorWalls: [], planColumns: [], planStairs: [], dimensions: [], planPlatforms: [],
    zones: [{ id: "room-1", name: options.roomName ?? "Room 1", boundary: corners.map(({ x, y }) => ({ x, y })), floorMaterial: "Unspecified", wallMaterial: "Paint", ceilingMaterial: "Gypsum board" }],
  });
  const boundary = corners.map(({ x, y }) => ({ x, y }));
  const top = [...project.levels].sort((a, b) => b.elevation - a.elevation)[0]!;
  const roofId = project.roofs.some((roof) => roof.id === "main-roof") ? `${levelId}:roof` : "main-roof";
  const withPlan: HouseProject = {
    ...project,
    slabs: [...project.slabs, { id: `${levelId}:slab`, levelId, boundary, thickness: 150, elevation: level.elevation, material: "Reinforced concrete" }],
    roofs: top.id === levelId && !project.roofs.some((roof) => roof.levelId === levelId)
      ? [...project.roofs, { id: roofId, levelId, boundary, elevation: level.elevation + plan.ceilingHeight, type: "flat", height: 300, slope: 0, overhang: 400, thickness: 180, material: "Reinforced concrete" }]
      : project.roofs,
  };
  // The rebuild reads the old outline to decide which slabs follow it; there
  // was none, so the plan goes in with the rebuild rather than before it.
  const next = rebuildLevel(withPlan, levelId, plan);
  return project.modelingOptions ? applyModelingOptions(next, project.modelingOptions) : next;
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
  if (!top) return { project, levelId: null };
  const taken = new Set(project.levels.map((level) => level.id));
  let number = project.levels.length + 1;
  while (taken.has(`floor-${number}`)) number += 1;
  const levelId = `floor-${number}`;
  const name = `${ordinalFloor(project.levels.length)} Floor`;
  const elevation = top.elevation + top.floorToFloorHeight;
  const view = { id: `view:plan:${levelId}`, name, kind: "floor-plan" as const, levelId, hiddenCategories: [], temporaryHiddenIds: [], isolatedIds: [], cutPlane: 1200, topOffset: 2300, bottomOffset: 0 };
  // Nothing to carry up from an empty floor: the new one is empty too.
  if (!top.plan) {
    return { project: { ...project, levels: [...project.levels, { id: levelId, name, elevation, floorToFloorHeight: top.floorToFloorHeight, plan: null }], views: [...project.views, view], plannedFloorCount: Math.max(project.plannedFloorCount, project.levels.length + 1) }, levelId };
  }
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
    slabs: project.modelingOptions?.floors === false ? project.slabs : [...project.slabs, { id: `${levelId}:slab`, levelId, boundary: plan.corners.map((point) => ({ x: point.x, y: point.y })), thickness: 150, elevation, material: "Reinforced concrete" }],
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

// Structure — columns, beams, grid, footings — is never generated here: a
// plan edit rebuilds the plan and leaves whatever structure exists alone.
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
    facadeElements: parapetsOnlyOnFlatRoofs(buildFacadeElements(rebuiltWalls, levels, project.facade), project.roofs),
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

type Point = { x: number; y: number };

/** A parapet belongs to a flat roof: under a gable or hip it would hide the
 * roof it is meant to edge. */
function parapetsOnlyOnFlatRoofs(elements: HouseProject["facadeElements"], roofs: HouseProject["roofs"]) {
  const pitched = new Set(roofs.filter((roof) => roof.type !== "flat").map((roof) => roof.levelId));
  return elements.filter((item) => !(item.type === "parapet" && pitched.has(item.levelId)));
}

/** The plan's rooms as zones, the outline standing in as one when none are drawn. */
function zonesOf(plan: Room): NonNullable<Room["zones"]> {
  if (plan.zones?.length) return plan.zones;
  return [{ id: "room-1", name: "Room 1", boundary: plan.corners.map(({ x, y }) => ({ x, y })), floorMaterial: "Unspecified", wallMaterial: "Paint", ceilingMaterial: "Gypsum board" }];
}

/**
 * A wall drawn right across a room — both ends on its edge — divides it in
 * two. The smaller room under the wall's middle is the one divided.
 */
export function splitRoomAlong(project: HouseProject, levelId: string, a: Point, b: Point, tolerance = 150): HouseProject {
  const level = project.levels.find((item) => item.id === levelId);
  const plan = level?.plan;
  if (!plan) return project;
  const zones = zonesOf(plan);
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const target = zones
    .filter((zone) => pointInPolygon(middle, zone.boundary))
    .sort((x, y) => Math.abs(signedArea(x.boundary)) - Math.abs(signedArea(y.boundary)))[0];
  if (!target) return project;
  const halves = splitPolygon(target.boundary, a, b, tolerance);
  if (!halves) return project;
  const [larger, smaller] = halves.sort((x, y) => Math.abs(signedArea(y)) - Math.abs(signedArea(x)));
  const taken = new Set(zones.map((zone) => zone.name));
  let number = zones.length + 1;
  while (taken.has(`Room ${number}`)) number += 1;
  const nextZones = zones.flatMap((zone) => zone.id === target.id
    ? [{ ...zone, boundary: larger! }, { ...zone, id: `zone-${crypto.randomUUID()}`, name: `Room ${number}`, boundary: smaller! }]
    : [zone]);
  return rebuildLevel(project, levelId, { ...plan, zones: nextZones });
}

/**
 * Two rooms sharing a wall become one: the shared stretch of inside wall is
 * taken out (with any door or window in it), the rest of that wall stays.
 */
export function mergeRooms(project: HouseProject, firstRoomId: string, secondRoomId: string): { project: HouseProject; blocked: string | null } {
  const first = project.rooms.find((room) => room.id === firstRoomId);
  const second = project.rooms.find((room) => room.id === secondRoomId);
  const level = first ? project.levels.find((item) => item.id === first.levelId) : null;
  const plan = level?.plan;
  if (!first || !second || !plan || first.levelId !== second.levelId || first.id === second.id) return { project, blocked: "Choose two rooms on the same floor" };
  const zones = zonesOf(plan);
  const zoneId = (room: typeof first) => room.id.slice(level!.id.length + 1);
  const a = zones.find((zone) => zone.id === zoneId(first));
  const b = zones.find((zone) => zone.id === zoneId(second));
  if (!a || !b) return { project, blocked: "Those rooms cannot be merged" };
  const union = unionAlongSharedEdges(a.boundary, b.boundary);
  if (!union) return { project, blocked: `${first.name} and ${second.name} do not share a wall` };
  const { interiorWalls, openings } = cutInteriorWalls(plan, sharedSegments(a.boundary, b.boundary));
  const nextZones = zones.filter((zone) => zone.id !== b.id).map((zone) => zone.id === a.id ? { ...zone, boundary: union } : zone);
  return { project: rebuildLevel(project, level!.id, { ...plan, zones: nextZones, interiorWalls, openings }), blocked: null };
}

/**
 * The stretches of inside wall lying along `cuts` are taken out. A door or
 * window in a wall that was shortened moves onto whichever piece still holds
 * it, measured from that piece's start; one in a stretch taken out goes with it.
 */
function cutInteriorWalls(plan: Room, cuts: readonly [Point, Point][]) {
  const removed = new Set<string>();
  const interiorWalls = (plan.interiorWalls ?? []).flatMap((wall) => {
    const pieces = subtractSegments(wall.start, wall.end, cuts, wall.thickness / 2 + 5);
    if (pieces.length === 1 && samePoint(pieces[0]![0], wall.start) && samePoint(pieces[0]![1], wall.end)) return [wall];
    removed.add(wall.id);
    return pieces.map(([start, end], index) => ({ ...wall, id: index === 0 && samePoint(start, wall.start) ? wall.id : `${wall.id}-${index + 1}`, start, end }));
  });
  const original = new Map((plan.interiorWalls ?? []).map((wall) => [wall.id, wall]));
  const openings = plan.openings.flatMap((opening) => {
    if (!removed.has(opening.wallId)) return [opening];
    const wall = original.get(opening.wallId)!;
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) || 1;
    const along = (point: Point) => ((point.x - wall.start.x) * (wall.end.x - wall.start.x) + (point.y - wall.start.y) * (wall.end.y - wall.start.y)) / length;
    const host = interiorWalls.find((piece) => (piece.id === wall.id || piece.id.startsWith(`${wall.id}-`)) && along(piece.start) <= opening.offset + 0.5 && opening.offset + opening.width <= along(piece.end) + 0.5);
    return host ? [{ ...opening, wallId: host.id, offset: micron(opening.offset - along(host.start)) }] : [];
  });
  return { interiorWalls, openings };
}

const edgesOf = (polygon: readonly Point[]): [Point, Point][] => polygon.map((point, index) => [point, polygon[(index + 1) % polygon.length]!]);

/** The stretches of a room's edge no other room shares: what is its alone. */
function ownEdges(target: readonly Point[], others: readonly (readonly Point[])[]): [Point, Point][] {
  const shared = others.flatMap((other) => sharedSegments(target, other));
  return edgesOf(target).flatMap(([start, end]) => subtractSegments(start, end, shared, 5));
}

const overlapsAny = (segments: readonly [Point, Point][], lines: readonly [Point, Point][]) =>
  segments.some(([start, end]) => { const left = subtractSegments(start, end, lines, 5); return !(left.length === 1 && samePoint(left[0]![0], start) && samePoint(left[0]![1], end)); });

function onOrInside(point: Point, polygon: readonly Point[]) {
  return pointInPolygon(point, polygon) || edgesOf(polygon).some(([a, b]) => { const dx = b.x - a.x; const dy = b.y - a.y; const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / Math.max(1, dx * dx + dy * dy))); return Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t) <= 5; });
}

/**
 * Deletes a room and the walls that were its alone; a wall it shares with
 * another room stays. The house's only room takes the outline with it: the
 * floor is empty again, or — when a room was drawn apart from the house —
 * that room becomes the house, its walls the outline, its doors and windows
 * kept.
 */
export function deleteRoom(project: HouseProject, roomId: string): { project: HouseProject; blocked: string | null } {
  const room = project.rooms.find((item) => item.id === roomId);
  const level = room ? project.levels.find((item) => item.id === room.levelId) : null;
  const plan = level?.plan;
  if (!room || !plan) return { project, blocked: "That room is not on the plan" };
  const zones = zonesOf(plan);
  const target = zones.find((zone) => `${level!.id}:${zone.id}` === roomId) ?? (zones.length === 1 ? zones[0] : undefined);
  if (!target) return { project, blocked: "That room is not on the plan" };
  const others = zones.filter((zone) => zone !== target);
  const own = ownEdges(target.boundary, others.map((zone) => zone.boundary));
  const outline = plan.corners.map(({ x, y }) => ({ x, y }));
  const inHouse = (zone: (typeof zones)[number]) => zone.boundary.every((point) => onOrInside(point, outline));
  const takesOutline = overlapsAny(own, edgesOf(outline)) && !others.some(inHouse);
  const { interiorWalls, openings } = cutInteriorWalls(plan, own);
  if (!takesOutline) return { project: rebuildLevel(project, level!.id, { ...plan, zones: others, interiorWalls, openings }), blocked: null };

  const cornerIds = new Set(plan.corners.map((corner) => corner.id));
  const kept = openings.filter((opening) => !cornerIds.has(opening.wallId));
  const promoted = [...others].sort((a, b) => Math.abs(signedArea(b.boundary)) - Math.abs(signedArea(a.boundary)))[0];
  if (!promoted) {
    // Nothing left on the floor: it is open space again.
    const levelId = level!.id;
    const gone = <T extends { levelId: string }>(items: T[]) => items.filter((item) => item.levelId !== levelId);
    return { project: { ...project, levels: project.levels.map((item) => item.id === levelId ? { ...item, plan: null } : item), walls: gone(project.walls), doors: gone(project.doors), windows: gone(project.windows), rooms: gone(project.rooms), slabs: gone(project.slabs), ceilings: gone(project.ceilings), facadeElements: gone(project.facadeElements), verandas: gone(project.verandas), balconies: gone(project.balconies) }, blocked: null };
  }
  // The room drawn apart becomes the house: its walls are the outline now.
  const corners = promoted.boundary.map((point, index) => ({ id: `c${index + 1}`, x: point.x, y: point.y }));
  const edges = edgesOf(promoted.boundary);
  const rest = cutInteriorWalls({ ...plan, interiorWalls, openings: kept }, edges);
  const before = new Map(interiorWalls.map((wall) => [wall.id, wall]));
  const moved = kept.flatMap((opening) => {
    if (rest.openings.includes(opening)) return [opening];
    const wall = before.get(opening.wallId);
    if (!wall) return [];
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) || 1;
    const at = (offset: number) => ({ x: wall.start.x + (wall.end.x - wall.start.x) * offset / length, y: wall.start.y + (wall.end.y - wall.start.y) * offset / length });
    const [from, to] = [at(opening.offset), at(opening.offset + opening.width)];
    const index = edges.findIndex(([a, b]) => { const left = subtractSegments(a, b, [[from, to]], 5); return !(left.length === 1 && samePoint(left[0]![0], a) && samePoint(left[0]![1], b)); });
    if (index < 0) return [];
    const [a, b] = edges[index]!;
    const run = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const along = (point: Point) => ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / run;
    return [{ ...opening, wallId: corners[index]!.id, offset: micron(Math.max(0, Math.min(along(from), along(to)))) }];
  });
  const openingsAfter = [...rest.openings.filter((opening) => !moved.includes(opening)), ...moved.filter((opening) => !rest.openings.includes(opening))];
  return { project: rebuildLevel(project, level!.id, { ...plan, corners, zones: others, interiorWalls: rest.interiorWalls, openings: openingsAfter }), blocked: null };
}

/**
 * Moves a room with its walls. A room apart from the others moves with the
 * walls that are its alone; the house's only room moves the whole outline.
 * A room sharing a wall with another is moved by dragging that wall.
 */
export function moveRoom(project: HouseProject, roomId: string, dx: number, dy: number): { project: HouseProject; blocked: string | null } {
  const room = project.rooms.find((item) => item.id === roomId);
  const level = room ? project.levels.find((item) => item.id === room.levelId) : null;
  const plan = level?.plan;
  if (!room || !plan) return { project, blocked: "That room is not on the plan" };
  const zones = zonesOf(plan);
  const target = zones.find((zone) => `${level!.id}:${zone.id}` === roomId) ?? (zones.length === 1 ? zones[0] : undefined);
  if (!target) return { project, blocked: "That room is not on the plan" };
  const others = zones.filter((zone) => zone !== target);
  if (others.some((zone) => sharedSegments(target.boundary, zone.boundary).length)) return { project, blocked: `${target.name} shares a wall with another room — drag that wall to change it` };
  const shift = <T extends Point>(point: T): T => ({ ...point, x: micron(point.x + dx), y: micron(point.y + dy) });
  const outline = plan.corners.map(({ x, y }) => ({ x, y }));
  const edges = edgesOf(target.boundary);
  const isHouse = overlapsAny(edges, edgesOf(outline));
  const lies = (wall: NonNullable<Room["interiorWalls"]>[number]) => isHouse
    ? onOrInside(wall.start, outline) && onOrInside(wall.end, outline)
    : subtractSegments(wall.start, wall.end, edges, wall.thickness / 2 + 5).length === 0;
  if (isHouse && others.some((zone) => zone.boundary.every((point) => onOrInside(point, outline)))) return { project, blocked: `${target.name} shares the house with another room — drag a wall to change it` };
  const interiorWalls = (plan.interiorWalls ?? []).map((wall) => lies(wall) ? { ...wall, start: shift(wall.start), end: shift(wall.end) } : wall);
  // The furniture in it goes with it.
  const inside = (item: { levelId: string; x: number; y: number }) => item.levelId === level!.id && pointInPolygon(item, target.boundary);
  const withContents = { ...project, components: project.components.map((item) => inside(item) ? shift(item) : item) };
  return { project: rebuildLevel(withContents, level!.id, {
    ...plan,
    corners: isHouse ? plan.corners.map(shift) : plan.corners,
    interiorWalls,
    zones: zones.map((zone) => zone === target ? { ...zone, boundary: zone.boundary.map(shift) } : zone),
  }), blocked: null };
}

function samePoint(a: Point, b: Point, tolerance = 1) { return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance; }

function signedArea(points: readonly Point[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) { const p = points[index]!; const q = points[(index + 1) % points.length]!; sum += p.x * q.y - q.x * p.y; }
  return sum / 2;
}

function pointInPolygon(point: Point, polygon: readonly Point[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index]!;
    const b = polygon[previous]!;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Where on the polygon's edge a point lies: edge index and the point snapped onto it. */
function onEdge(polygon: readonly Point[], point: Point, tolerance: number) {
  let best: { index: number; point: Point; distance: number } | null = null;
  for (let index = 0; index < polygon.length; index += 1) {
    const p = polygon[index]!;
    const q = polygon[(index + 1) % polygon.length]!;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const lengthSquared = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((point.x - p.x) * dx + (point.y - p.y) * dy) / lengthSquared));
    const snapped = { x: micron(p.x + dx * t), y: micron(p.y + dy * t) };
    const distance = Math.hypot(point.x - snapped.x, point.y - snapped.y);
    if (distance <= tolerance && (!best || distance < best.distance)) best = { index, point: snapped, distance };
  }
  return best;
}

function splitPolygon(polygon: readonly Point[], a: Point, b: Point, tolerance: number): [Point[], Point[]] | null {
  const ea = onEdge(polygon, a, tolerance);
  const eb = onEdge(polygon, b, tolerance);
  if (!ea || !eb || samePoint(ea.point, eb.point)) return null;
  // Walk round the boundary from one cut to the other, each way.
  const ring: { point: Point; cut?: "a" | "b" }[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    ring.push({ point: polygon[index]! });
    const p = polygon[index]!;
    const cuts = ([[ea, "a"], [eb, "b"]] as const).filter(([edge]) => edge.index === index)
      .sort(([x], [y]) => Math.hypot(x.point.x - p.x, x.point.y - p.y) - Math.hypot(y.point.x - p.x, y.point.y - p.y));
    for (const [edge, name] of cuts) ring.push({ point: edge.point, cut: name });
  }
  const clean = ring.filter((item, index) => item.cut || !ring.some((other, otherIndex) => otherIndex !== index && other.cut && samePoint(other.point, item.point)));
  const start = clean.findIndex((item) => item.cut === "a");
  const walk = (from: number, until: "a" | "b") => {
    const out: Point[] = [clean[from]!.point];
    for (let step = 1; step <= clean.length; step += 1) {
      const item = clean[(from + step) % clean.length]!;
      out.push(item.point);
      if (item.cut === until) return out;
    }
    return out;
  };
  const one = walk(start, "b");
  const other = walk(clean.findIndex((item) => item.cut === "b"), "a");
  if (one.length < 3 || other.length < 3 || Math.abs(signedArea(one)) < 1 || Math.abs(signedArea(other)) < 1) return null;
  return [one, other];
}

/** The two polygons' edges, cut at each other's corners, so shared stretches match exactly. */
function splitEdges(polygon: readonly Point[], at: readonly Point[]) {
  const edges: [Point, Point][] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const p = polygon[index]!;
    const q = polygon[(index + 1) % polygon.length]!;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const lengthSquared = dx * dx + dy * dy || 1;
    const inner = at
      .map((point) => ({ point, t: ((point.x - p.x) * dx + (point.y - p.y) * dy) / lengthSquared }))
      .filter(({ point, t }) => t > 0.0001 && t < 0.9999 && Math.abs((point.x - p.x) * dy - (point.y - p.y) * dx) / Math.sqrt(lengthSquared) < 1)
      .sort((x, y) => x.t - y.t)
      .map(({ point }) => point);
    const stops = [p, ...inner, q];
    for (let stop = 0; stop < stops.length - 1; stop += 1) edges.push([stops[stop]!, stops[stop + 1]!]);
  }
  return edges;
}

function oriented(polygon: readonly Point[]) { return signedArea(polygon) < 0 ? [...polygon].reverse() : [...polygon]; }

function sharedSegments(a: readonly Point[], b: readonly Point[]): [Point, Point][] {
  const ea = splitEdges(oriented(a), b);
  const eb = splitEdges(oriented(b), a);
  return ea.filter(([p, q]) => eb.some(([r, t]) => samePoint(p, t) && samePoint(q, r)));
}

function unionAlongSharedEdges(a: readonly Point[], b: readonly Point[]): Point[] | null {
  const ea = splitEdges(oriented(a), b);
  const eb = splitEdges(oriented(b), a);
  const shared = (p: Point, q: Point, others: [Point, Point][]) => others.some(([r, t]) => samePoint(p, t) && samePoint(q, r));
  const remaining = [...ea.filter(([p, q]) => !shared(p, q, eb)), ...eb.filter(([p, q]) => !shared(p, q, ea))];
  const loop: Point[] = [remaining[0]![0]];
  const used = new Set<number>();
  let at = remaining[0]![0];
  for (let guard = 0; guard < remaining.length; guard += 1) {
    const index = remaining.findIndex(([p], candidate) => !used.has(candidate) && samePoint(p, at));
    if (index < 0) return null;
    used.add(index);
    at = remaining[index]![1];
    if (samePoint(at, loop[0]!)) break;
    loop.push(at);
  }
  if (used.size !== remaining.length) return null;
  // Drop the corners left in the middle of a straight run.
  return loop.filter((point, index) => {
    const before = loop[(index - 1 + loop.length) % loop.length]!;
    const after = loop[(index + 1) % loop.length]!;
    return Math.abs((point.x - before.x) * (after.y - before.y) - (point.y - before.y) * (after.x - before.x)) > 1;
  });
}

/** What is left of a wall once the stretches lying along `cuts` are taken out. */
function subtractSegments(start: Point, end: Point, cuts: readonly [Point, Point][], tolerance: number): [Point, Point][] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!length) return [[start, end]];
  const along = (point: Point) => ((point.x - start.x) * dx + (point.y - start.y) * dy) / (length * length);
  const off = (point: Point) => Math.abs((point.x - start.x) * dy - (point.y - start.y) * dx) / length;
  const removed = cuts
    .filter(([p, q]) => off(p) <= tolerance && off(q) <= tolerance)
    .map(([p, q]) => [Math.max(0, Math.min(along(p), along(q))), Math.min(1, Math.max(along(p), along(q)))] as const)
    .filter(([from, to]) => to - from > 0.0001)
    .sort((x, y) => x[0] - y[0]);
  if (!removed.length) return [[start, end]];
  const at = (t: number) => ({ x: start.x + dx * t, y: start.y + dy * t });
  const pieces: [Point, Point][] = [];
  let cursor = 0;
  for (const [from, to] of removed) {
    if (from - cursor > 50 / length) pieces.push([at(cursor), at(from)]);
    cursor = Math.max(cursor, to);
  }
  if (1 - cursor > 50 / length) pieces.push([at(cursor), at(1)]);
  return pieces;
}

/** Maps a point lying on the old segment to the same distance from the
 * start along the new one — a move carries it, lengthening the wall leaves
 * it where it was measured from; any other point is returned unchanged. */
function attachedTo(oldStart: { x: number; y: number }, oldEnd: { x: number; y: number }, newStart: { x: number; y: number }, newEnd: { x: number; y: number }, tolerance: number) {
  const dx = oldEnd.x - oldStart.x;
  const dy = oldEnd.y - oldStart.y;
  const lengthSquared = dx * dx + dy * dy;
  return (point: { x: number; y: number }) => {
    if (!lengthSquared) return point;
    const t = ((point.x - oldStart.x) * dx + (point.y - oldStart.y) * dy) / lengthSquared;
    if (t < -0.001 || t > 1.001) return point;
    const off = Math.abs((point.x - oldStart.x) * dy - (point.y - oldStart.y) * dx) / Math.sqrt(lengthSquared);
    if (off > tolerance) return point;
    const oldLength = Math.sqrt(lengthSquared);
    const newLength = Math.hypot(newEnd.x - newStart.x, newEnd.y - newStart.y);
    if (!newLength) return { x: micron(newStart.x), y: micron(newStart.y) };
    // Lengthened or shortened along its own line: whatever meets it stays
    // where it is, only clamped to the new ends. Measuring from the start
    // moved every junction when the start was the end that changed.
    const ux = (newEnd.x - newStart.x) / newLength;
    const uy = (newEnd.y - newStart.y) / newLength;
    const sameLine = Math.abs(ux * dy - uy * dx) / oldLength < 1e-6 && Math.abs((newStart.x - oldStart.x) * dy - (newStart.y - oldStart.y) * dx) / oldLength < 0.5;
    if (sameLine) {
      const along = Math.min(Math.max(0, (point.x - newStart.x) * ux + (point.y - newStart.y) * uy), newLength);
      return { x: micron(newStart.x + ux * along), y: micron(newStart.y + uy * along) };
    }
    const along = Math.min(Math.max(0, t) * oldLength, newLength);
    return { x: micron(newStart.x + ((newEnd.x - newStart.x) / newLength) * along), y: micron(newStart.y + ((newEnd.y - newStart.y) / newLength) * along) };
  };
}

/** Plan coordinates are millimetres; a thousandth keeps arithmetic noise
 * (3000.0000000000005) out of them without moving anything. */
function micron(value: number) { return Math.round(value * 1000) / 1000; }

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
