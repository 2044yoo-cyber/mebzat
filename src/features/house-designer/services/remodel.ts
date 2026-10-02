import { z } from "zod";

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
]);

export type HouseRemodelCommand = z.infer<typeof houseRemodelCommandSchema>;

export type HouseRemodelResult = {
  project: HouseProject;
  blockedFields: string[];
};

const editableFields: Record<HouseObjectKind, readonly string[]> = {
  level: ["elevation", "floorToFloorHeight"],
  wall: ["startX", "startY", "endX", "endY", "thickness", "height", "material"],
  door: ["width", "height", "offset", "sillHeight", "style", "material"],
  window: ["width", "height", "offset", "sillHeight", "style", "material"],
  stair: ["type", "x", "y", "width", "length", "height", "rotation", "steps", "material"],
  slab: ["thickness", "elevation", "material"],
  roof: ["type", "elevation", "height", "slope", "overhang", "thickness", "material"],
  column: ["x", "y", "width", "depth", "height", "elevation", "type", "material"],
  beam: ["startX", "startY", "endX", "endY", "width", "depth", "elevation", "material"],
};

/** Appearance/construction edits that cannot move verified plan geometry. */
const strictFields: Record<HouseObjectKind, readonly string[]> = {
  level: [],
  wall: ["material"],
  door: ["style", "material"],
  window: ["style", "material"],
  stair: ["material"],
  slab: ["thickness", "material"],
  roof: ["type", "height", "slope", "overhang", "thickness", "material"],
  column: ["width", "depth", "height", "type", "material"],
  beam: ["width", "depth", "material"],
};

const bounds: Partial<Record<HouseObjectKind, Record<string, readonly [number, number]>>> = {
  level: { elevation: [-10_000, 50_000], floorToFloorHeight: [1_800, 8_000] },
  wall: { startX: [-100_000, 100_000], startY: [-100_000, 100_000], endX: [-100_000, 100_000], endY: [-100_000, 100_000], thickness: [50, 1_000], height: [1_200, 8_000] },
  door: { width: [200, 6_000], height: [200, 5_000], offset: [0, 100_000], sillHeight: [0, 5_000] },
  window: { width: [200, 6_000], height: [200, 5_000], offset: [0, 100_000], sillHeight: [0, 5_000] },
  stair: { x: [-100_000, 100_000], y: [-100_000, 100_000], width: [500, 5_000], length: [800, 15_000], height: [1_000, 10_000], rotation: [-360, 360], steps: [3, 40] },
  slab: { thickness: [50, 1_000], elevation: [-10_000, 50_000] },
  roof: { elevation: [0, 50_000], height: [100, 8_000], slope: [0, 60], overhang: [0, 3_000], thickness: [30, 1_000] },
  column: { x: [-100_000, 100_000], y: [-100_000, 100_000], width: [100, 3_000], depth: [100, 3_000], height: [500, 12_000], elevation: [-10_000, 50_000] },
  beam: { startX: [-100_000, 100_000], startY: [-100_000, 100_000], endX: [-100_000, 100_000], endY: [-100_000, 100_000], width: [100, 3_000], depth: [100, 3_000], elevation: [-10_000, 50_000] },
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
    case "wall": return project.walls.find((item) => item.id === selection.id) ?? null;
    case "door": return project.doors.find((item) => item.id === selection.id) ?? null;
    case "window": return project.windows.find((item) => item.id === selection.id) ?? null;
    case "stair": return project.stairs.find((item) => item.id === selection.id) ?? null;
    case "slab": return project.slabs.find((item) => item.id === selection.id) ?? null;
    case "roof": return project.roofs.find((item) => item.id === selection.id) ?? null;
    case "column": return project.structuralColumns.find((item) => item.id === selection.id) ?? null;
    case "beam": return project.structuralBeams.find((item) => item.id === selection.id) ?? null;
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
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 100);
  return trimmed || null;
}
