import { z } from "zod";

import { roomWalls } from "@/features/berchuma-studio/services/room-geometry";

import { applyFacadeStyle, generateFacadeAlternatives, patchFacade } from "./facade";
import { patchHouseObject, type HousePatch } from "./project-edit";
import {
  houseStyles,
  roofTypes,
  stairTypes,
  type HouseFacadeSettings,
  type HouseObjectKind,
  type HouseProject,
  type HouseSelection,
} from "../types/project";

const patchValueSchema = z.union([z.string().max(100), z.number().finite()]);
const facadePatchSchema = z.object({
  primaryColor: z.string().max(80).optional(),
  secondaryColor: z.string().max(80).optional(),
  accentColor: z.string().max(80).optional(),
  roofColor: z.string().max(80).optional(),
  windowFrameColor: z.string().max(80).optional(),
  doorColor: z.string().max(80).optional(),
  wallMaterial: z.string().max(100).optional(),
  roofMaterial: z.string().max(100).optional(),
  windowStyle: z.string().max(100).optional(),
  entranceStyle: z.string().max(100).optional(),
}).strict();

export const houseRemodelCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("patch_object"),
    patch: z.record(z.string(), patchValueSchema),
    explanation: z.string().max(320),
  }).strict(),
  z.object({
    action: z.literal("apply_style"),
    style: z.enum(houseStyles),
    explanation: z.string().max(320),
  }).strict(),
  z.object({
    action: z.literal("patch_facade"),
    patch: facadePatchSchema,
    explanation: z.string().max(320),
  }).strict(),
  z.object({
    action: z.literal("generate_alternatives"),
    count: z.union([z.literal(2), z.literal(3), z.literal(4)]),
    explanation: z.string().max(320),
  }).strict(),
  z.object({
    action: z.literal("add_object"),
    objectType: z.enum(["balcony", "veranda", "parapet", "column", "stair"]),
    explanation: z.string().max(320),
  }).strict(),
]);

export type HouseRemodelCommand = z.infer<typeof houseRemodelCommandSchema>;

export type HouseRemodelResult = {
  project: HouseProject;
  blockedFields: string[];
};

const editableFields: Record<HouseObjectKind, readonly string[]> = {
  level: ["elevation", "floorToFloorHeight"],
  room: ["name", "floorMaterial", "wallMaterial", "ceilingMaterial"],
  wall: ["length", "startX", "startY", "endX", "endY", "thickness", "height", "material"],
  door: ["width", "height", "offset", "sillHeight", "style", "material"],
  window: ["width", "height", "offset", "sillHeight", "style", "material"],
  stair: ["type", "x", "y", "width", "length", "height", "rotation", "steps", "material"],
  slab: ["thickness", "elevation", "material"],
  roof: ["type", "elevation", "height", "slope", "overhang", "thickness", "material"],
  column: ["x", "y", "width", "depth", "height", "elevation", "type", "material"],
  beam: ["startX", "startY", "endX", "endY", "width", "depth", "elevation", "material"],
  grid: ["label", "position", "startX", "startY", "endX", "endY"],
  facade: ["type", "offset", "elevation", "width", "height", "depth", "material", "color"],
  balcony: ["x", "y", "width", "depth", "elevation", "thickness", "rotation", "railingHeight", "railingMaterial", "material"],
  veranda: ["x", "y", "width", "depth", "elevation", "thickness", "rotation", "canopyHeight", "canopyMaterial", "postMaterial", "material"],
  ceiling: ["elevation", "thickness", "material"],
  site: ["x", "y", "width", "depth", "elevation", "thickness", "material"],
  foundation: ["x", "y", "width", "depth", "elevation", "thickness", "material"],
  railing: ["startX", "startY", "endX", "endY", "elevation", "height", "material"],
  "reference-plane": ["name", "startX", "startY", "endX", "endY"],
  annotation: ["text", "startX", "startY", "endX", "endY", "value"],
  component: ["name", "x", "y", "width", "depth", "height", "rotation", "material"],
};

/** Appearance/construction edits that cannot move verified plan geometry. */
const strictFields: Record<HouseObjectKind, readonly string[]> = {
  level: [],
  room: ["floorMaterial", "wallMaterial", "ceilingMaterial"],
  wall: ["material"],
  door: ["style", "material"],
  window: ["style", "material"],
  stair: ["material"],
  slab: ["thickness", "material"],
  roof: ["type", "height", "slope", "overhang", "thickness", "material"],
  column: ["width", "depth", "height", "type", "material"],
  beam: ["width", "depth", "material"],
  grid: [],
  facade: ["type", "offset", "elevation", "width", "height", "depth", "material", "color"],
  balcony: ["x", "y", "width", "depth", "elevation", "thickness", "rotation", "railingHeight", "railingMaterial", "material"],
  veranda: ["x", "y", "width", "depth", "elevation", "thickness", "rotation", "canopyHeight", "canopyMaterial", "postMaterial", "material"],
  ceiling: ["thickness", "material"],
  site: ["x", "y", "width", "depth", "elevation", "thickness", "material"],
  foundation: ["width", "depth", "thickness", "material"],
  railing: ["height", "material"],
  "reference-plane": [],
  annotation: ["text"],
  component: ["name", "x", "y", "width", "depth", "height", "rotation", "material"],
};

const bounds: Partial<Record<HouseObjectKind, Record<string, readonly [number, number]>>> = {
  level: { elevation: [-10_000, 50_000], floorToFloorHeight: [1_800, 8_000] },
  wall: { length: [200, 100_000], startX: [-100_000, 100_000], startY: [-100_000, 100_000], endX: [-100_000, 100_000], endY: [-100_000, 100_000], thickness: [50, 1_000], height: [1_200, 8_000] },
  door: { width: [200, 6_000], height: [200, 5_000], offset: [0, 100_000], sillHeight: [0, 5_000] },
  window: { width: [200, 6_000], height: [200, 5_000], offset: [0, 100_000], sillHeight: [0, 5_000] },
  stair: { x: [-100_000, 100_000], y: [-100_000, 100_000], width: [500, 5_000], length: [800, 15_000], height: [1_000, 10_000], rotation: [-360, 360], steps: [3, 40] },
  slab: { thickness: [50, 1_000], elevation: [-10_000, 50_000] },
  roof: { elevation: [0, 50_000], height: [100, 8_000], slope: [0, 60], overhang: [0, 3_000], thickness: [30, 1_000] },
  column: { x: [-100_000, 100_000], y: [-100_000, 100_000], width: [100, 3_000], depth: [100, 3_000], height: [500, 12_000], elevation: [-10_000, 50_000] },
  beam: { startX: [-100_000, 100_000], startY: [-100_000, 100_000], endX: [-100_000, 100_000], endY: [-100_000, 100_000], width: [100, 3_000], depth: [100, 3_000], elevation: [-10_000, 50_000] },
  grid: { position: [-100_000, 100_000], startX: [-100_000, 100_000], startY: [-100_000, 100_000], endX: [-100_000, 100_000], endY: [-100_000, 100_000] },
  foundation: { x: [-100_000, 100_000], y: [-100_000, 100_000], width: [200, 10_000], depth: [200, 10_000], elevation: [-20_000, 50_000], thickness: [100, 3_000] },
  railing: { startX: [-100_000, 100_000], startY: [-100_000, 100_000], endX: [-100_000, 100_000], endY: [-100_000, 100_000], elevation: [-10_000, 50_000], height: [100, 3_000] },
  "reference-plane": { startX: [-100_000, 100_000], startY: [-100_000, 100_000], endX: [-100_000, 100_000], endY: [-100_000, 100_000] },
  annotation: { startX: [-100_000, 100_000], startY: [-100_000, 100_000], endX: [-100_000, 100_000], endY: [-100_000, 100_000], value: [-1_000_000, 1_000_000] },
  component: { x: [-100_000, 100_000], y: [-100_000, 100_000], width: [10, 50_000], depth: [10, 50_000], height: [10, 50_000], rotation: [-360, 360] },
  facade: { offset: [0, 100_000], elevation: [0, 50_000], width: [20, 100_000], height: [20, 20_000], depth: [10, 5_000] },
  balcony: { x: [-100_000, 100_000], y: [-100_000, 100_000], width: [300, 20_000], depth: [300, 10_000], elevation: [-10_000, 50_000], thickness: [50, 1_000], rotation: [-360, 360], railingHeight: [0, 3_000] },
  veranda: { x: [-100_000, 100_000], y: [-100_000, 100_000], width: [300, 20_000], depth: [300, 10_000], elevation: [-10_000, 50_000], thickness: [50, 1_000], rotation: [-360, 360], canopyHeight: [1_800, 6_000] },
  ceiling: { elevation: [-10_000, 50_000], thickness: [3, 500] },
  site: { x: [-100_000, 100_000], y: [-100_000, 100_000], width: [1_000, 200_000], depth: [1_000, 200_000], elevation: [-10_000, 50_000], thickness: [20, 5_000] },
};

export function applyHouseRemodelCommand(
  project: HouseProject,
  selection: HouseSelection | null,
  command: HouseRemodelCommand,
): HouseRemodelResult {
  if (command.action === "apply_style") {
    return { project: applyFacadeStyle(project, command.style), blockedFields: [] };
  }
  if (command.action === "patch_facade") {
    return { project: patchFacade(project, command.patch as Partial<HouseFacadeSettings>), blockedFields: [] };
  }
  if (command.action === "generate_alternatives") {
    return { project: generateFacadeAlternatives(project, command.count), blockedFields: [] };
  }
  if (command.action === "add_object") {
    if (project.originalPlanStrict && (command.objectType === "stair" || command.objectType === "column")) {
      return { project, blockedFields: [command.objectType] };
    }
    return { project: addHouseObject(project, selection, command.objectType), blockedFields: [] };
  }
  if (!selection) return { project, blockedFields: ["selection"] };

  const allowed = new Set(project.originalPlanStrict ? strictFields[selection.kind] : editableFields[selection.kind]);
  const nextPatch: HousePatch = {};
  const blockedFields: string[] = [];
  for (const [field, raw] of Object.entries(command.patch)) {
    if (!allowed.has(field)) {
      blockedFields.push(field);
      continue;
    }
    const value = normalizeValue(selection.kind, field, raw);
    if (value === null) blockedFields.push(field);
    else nextPatch[field] = value;
  }

  return {
    project: Object.keys(nextPatch).length > 0
      ? patchHouseObject(project, selection, nextPatch)
      : project,
    blockedFields,
  };
}

export function selectedObjectSnapshot(project: HouseProject, selection: HouseSelection | null): unknown {
  if (!selection) return null;
  switch (selection.kind) {
    case "level": {
      const level = project.levels.find((item) => item.id === selection.id);
      if (!level) return null;
      return { id: level.id, name: level.name, elevation: level.elevation, floorToFloorHeight: level.floorToFloorHeight };
    }
    case "room": return project.rooms.find((item) => item.id === selection.id) ?? null;
    case "wall": return project.walls.find((item) => item.id === selection.id) ?? null;
    case "door": return project.doors.find((item) => item.id === selection.id) ?? null;
    case "window": return project.windows.find((item) => item.id === selection.id) ?? null;
    case "stair": return project.stairs.find((item) => item.id === selection.id) ?? null;
    case "slab": return project.slabs.find((item) => item.id === selection.id) ?? null;
    case "roof": return project.roofs.find((item) => item.id === selection.id) ?? null;
    case "column": return project.structuralColumns.find((item) => item.id === selection.id) ?? null;
    case "beam": return project.structuralBeams.find((item) => item.id === selection.id) ?? null;
    case "grid": return project.structuralGrid.find((item) => item.id === selection.id) ?? null;
    case "facade": return project.facadeElements.find((item) => item.id === selection.id) ?? null;
    case "balcony": return project.balconies.find((item) => item.id === selection.id) ?? null;
    case "veranda": return project.verandas.find((item) => item.id === selection.id) ?? null;
    case "ceiling": return project.ceilings.find((item) => item.id === selection.id) ?? null;
    case "site": return project.site?.id === selection.id ? project.site : null;
    case "foundation": return project.foundations.find((item) => item.id === selection.id) ?? null;
    case "railing": return project.railings.find((item) => item.id === selection.id) ?? null;
    case "reference-plane": return project.referencePlanes.find((item) => item.id === selection.id) ?? null;
    case "annotation": return project.annotations.find((item) => item.id === selection.id) ?? null;
    case "component": return project.components.find((item) => item.id === selection.id) ?? null;
  }
}

function normalizeValue(kind: HouseObjectKind, field: string, value: string | number): string | number | null {
  const range = bounds[kind]?.[field];
  if (range) {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const clamped = Math.min(range[1], Math.max(range[0], value));
    return field === "steps" ? Math.round(clamped) : clamped;
  }
  if (field === "type" && kind === "roof") return typeof value === "string" && roofTypes.includes(value as (typeof roofTypes)[number]) ? value : null;
  if (field === "type" && kind === "stair") return typeof value === "string" && stairTypes.includes(value as (typeof stairTypes)[number]) ? value : null;
  if (field === "type" && kind === "facade") return typeof value === "string" && ["band", "cornice", "pilaster", "accent", "parapet"].includes(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 100);
  return trimmed || null;
}

function addHouseObject(project: HouseProject, selection: HouseSelection | null, objectType: "balcony" | "veranda" | "parapet" | "column" | "stair"): HouseProject {
  const selectedOpening = selection && (selection.kind === "door" || selection.kind === "window")
    ? [...project.doors, ...project.windows].find((opening) => opening.id === selection.id)
    : null;
  const entrance = selectedOpening ?? project.doors.find((opening) => opening.levelId === project.levels[0]?.id && opening.type !== "passage");
  const selectedWall = selection?.kind === "wall"
    ? project.walls.find((item) => item.id === selection.id)
    : selectedOpening
      ? project.walls.find((item) => item.id === selectedOpening.wallId)
      : null;
  const ground = project.levels[0];
  if (!ground) return project;
  const wall = selectedWall ?? project.walls.find((item) => item.id === entrance?.wallId) ?? exteriorWalls(project, ground.id)[0];
  if (!wall) return project;

  if (objectType === "column") {
    return {
      ...project,
      structuralColumns: [...project.structuralColumns, {
        id: nextId(project.structuralColumns, `${wall.levelId}:column:ai`),
        levelId: wall.levelId,
        x: (wall.start.x + wall.end.x) / 2,
        y: (wall.start.y + wall.end.y) / 2,
        elevation: project.levels.find((item) => item.id === wall.levelId)?.elevation ?? 0,
        width: 300,
        depth: 300,
        height: wall.height,
        type: "preliminary reinforced concrete",
        material: "Reinforced concrete",
      }],
    };
  }

  if (objectType === "stair") {
    const level = project.levels.find((item) => item.id === wall.levelId) ?? ground;
    const room = project.rooms.find((item) => item.levelId === level.id);
    if (!room) return project;
    const box = boundaryBounds(room.boundary);
    return {
      ...project,
      stairs: [...project.stairs, {
        id: nextId(project.stairs, `${level.id}:stair:ai`),
        levelId: level.id,
        x: (box.minX + box.maxX) / 2,
        y: (box.minY + box.maxY) / 2,
        elevation: level.elevation,
        width: Math.min(1_000, box.maxX - box.minX),
        length: Math.min(3_200, box.maxY - box.minY),
        height: level.floorToFloorHeight,
        rotation: 0,
        steps: Math.min(40, Math.max(3, Math.round(level.floorToFloorHeight / 175))),
        type: "straight",
        material: "Reinforced concrete",
      }],
    };
  }

  if (objectType === "parapet") {
    const length = wallLength(wall);
    return {
      ...project,
      facadeElements: [...project.facadeElements, {
        id: nextId(project.facadeElements, `${wall.levelId}:facade:ai-parapet`),
        levelId: wall.levelId,
        wallId: wall.id,
        type: "parapet",
        offset: 0,
        elevation: (project.levels.find((item) => item.id === wall.levelId)?.elevation ?? 0) + wall.height,
        width: length,
        height: 800,
        depth: Math.max(120, wall.thickness),
        material: project.facade.wallMaterial,
        color: project.facade.primaryColor,
      }],
    };
  }

  const targetLevel = objectType === "balcony" ? project.levels[1] ?? ground : ground;
  const targetWall = wall.sourceWallId
    ? project.walls.find((item) => item.levelId === targetLevel.id && item.sourceWallId === wall.sourceWallId) ?? wall
    : wall;
  const depth = objectType === "balcony" ? 1_200 : 1_500;
  const placement = outsidePlacement(project, targetWall, depth, entrance ? entrance.offset + entrance.width / 2 : undefined);
  const suggestedWidth = entrance ? entrance.width + (objectType === "balcony" ? 1_200 : 1_000) : objectType === "balcony" ? 3_400 : 3_200;
  const width = Math.min(wallLength(targetWall), suggestedWidth);
  if (objectType === "balcony") {
    return {
      ...project,
      balconies: [...project.balconies, {
        id: nextId(project.balconies, `${targetLevel.id}:balcony:ai`),
        levelId: targetLevel.id,
        wallId: targetWall.id,
        ...placement,
        elevation: targetLevel === ground ? ground.elevation + targetWall.height : targetLevel.elevation,
        width,
        depth,
        thickness: 150,
        railingHeight: 1_050,
        railingMaterial: "Steel and glass",
        material: "Reinforced concrete",
      }],
    };
  }
  return {
    ...project,
    verandas: [...project.verandas, {
      id: nextId(project.verandas, `${targetLevel.id}:veranda:ai`),
      levelId: targetLevel.id,
      wallId: targetWall.id,
      ...placement,
      elevation: targetLevel.elevation,
      width,
      depth,
      thickness: 120,
      canopyHeight: 2_700,
      canopyMaterial: "Coated metal",
      postMaterial: "Steel",
      material: "Paving",
    }],
  };
}

function exteriorWalls(project: HouseProject, levelId: string) {
  const level = project.levels.find((item) => item.id === levelId);
  const ids = new Set(level?.plan?.corners.map((point) => point.id) ?? []);
  return project.walls.filter((wall) => wall.levelId === levelId && !!wall.sourceWallId && ids.has(wall.sourceWallId));
}

function outsidePlacement(project: HouseProject, wall: HouseProject["walls"][number], depth: number, along?: number) {
  const level = project.levels.find((item) => item.id === wall.levelId);
  const source = level?.plan ? roomWalls(level.plan).find((item) => item.id === wall.sourceWallId) : null;
  const length = wallLength(wall);
  const dx = (wall.end.x - wall.start.x) / length;
  const dy = (wall.end.y - wall.start.y) / length;
  const inward = source?.inward ?? { x: -dy, y: dx };
  const projection = wall.thickness / 2 + depth / 2;
  return {
    x: wall.start.x + dx * Math.min(length, Math.max(0, along ?? length / 2)) - inward.x * projection,
    y: wall.start.y + dy * Math.min(length, Math.max(0, along ?? length / 2)) - inward.y * projection,
    rotation: Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180 / Math.PI,
  };
}

function wallLength(wall: HouseProject["walls"][number]) {
  return Math.max(1, Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y));
}

function nextId(items: { id: string }[], prefix: string) {
  let index = items.length + 1;
  while (items.some((item) => item.id === `${prefix}:${index}`)) index += 1;
  return `${prefix}:${index}`;
}

function boundaryBounds(points: { x: number; y: number }[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
