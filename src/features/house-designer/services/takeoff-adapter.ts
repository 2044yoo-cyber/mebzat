import type { BoqSectionCode } from "@/lib/takeoff/boq";
import type { Quantity } from "@/lib/takeoff/measure";
import { ELEMENT_KINDS, measured, type BuildingElement } from "@/lib/takeoff/model";

import { calculateHouseQuantities } from "./quantities";
import type { HouseProject } from "../types/project";

export const HOUSE_TAKEOFF_SESSION_KEY = "medosha:house-takeoff:v1";

export type HousePreparedQuantity = {
  id: string;
  representativeElementId: string;
  section: BoqSectionCode;
  description: string;
  quantity: Quantity;
};

export type HouseTakeoffPackage = {
  version: 1;
  source: "house-designer";
  projectId: string;
  name: string;
  elements: BuildingElement[];
  quantities: HousePreparedQuantity[];
  levels: string[];
  warnings: string[];
};

/** Adapt the verified house model without duplicating it into another domain model. */
export function createHouseTakeoffPackage(project: HouseProject): HouseTakeoffPackage {
  const levelNames = new Map(project.levels.map((level) => [level.id, level.name]));
  const level = (levelId: string) => levelNames.get(levelId) ?? levelId;
  const elements: BuildingElement[] = [
    ...project.walls.map((wall, index) => ({
      id: wall.id,
      kind: "wall" as const,
      name: `Wall ${index + 1}`,
      level: level(wall.levelId),
      length: measured(distance(wall.start, wall.end), "user"),
      height: measured(wall.height, "user"),
      thickness: measured(wall.thickness, "user"),
      openings: [...project.doors, ...project.windows].filter((opening) => opening.wallId === wall.id).map((opening) => opening.id),
      material: wall.material,
    })),
    ...project.doors.map((door, index) => openingElement(door, "door", `Door ${index + 1}`, level(door.levelId))),
    ...project.windows.map((window, index) => openingElement(window, "window", `Window ${index + 1}`, level(window.levelId))),
    ...project.structuralColumns.map((column, index) => ({
      id: column.id,
      kind: "column" as const,
      name: `Column ${index + 1}`,
      level: level(column.levelId),
      length: measured(column.width, "user"),
      width: measured(column.depth, "user"),
      height: measured(column.height, "user"),
      material: column.material,
      properties: { type: column.type, x: column.x, y: column.y, elevation: column.elevation },
    })),
    ...project.structuralBeams.map((beam, index) => ({
      id: beam.id,
      kind: "beam" as const,
      name: `Beam ${index + 1}`,
      level: level(beam.levelId),
      length: measured(distance(beam.start, beam.end), "user"),
      width: measured(beam.width, "user"),
      height: measured(beam.depth, "user"),
      material: beam.material,
      properties: { elevation: beam.elevation },
    })),
    ...project.foundations.map((foundation, index) => ({
      id: foundation.id,
      kind: "foundation" as const,
      name: `Foundation ${index + 1}`,
      level: level(foundation.levelId),
      length: measured(foundation.width, "user"),
      width: measured(foundation.depth, "user"),
      height: measured(foundation.thickness, "user"),
      material: foundation.material,
      properties: { x: foundation.x, y: foundation.y, elevation: foundation.elevation, preliminary: 1 },
    })),
    ...project.slabs.map((slab, index) => areaElement(slab.id, "slab", `Slab ${index + 1}`, level(slab.levelId), polygonArea(slab.boundary), slab.material, { thickness: slab.thickness, elevation: slab.elevation })),
    ...project.rooms.map((room) => areaElement(room.id, "room", room.name, level(room.levelId), polygonArea(room.boundary), room.floorMaterial, { ceilingHeight: room.ceilingHeight })),
    ...project.roofs.map((roof, index) => {
      const planArea = polygonArea(roof.boundary);
      const slope = roof.type === "flat" ? 0 : roof.slope * Math.PI / 180;
      return areaElement(roof.id, "roof", `Roof ${index + 1}`, level(roof.levelId), planArea / Math.max(0.4, Math.cos(slope)), roof.material, { type: roof.type, slope: roof.slope, overhang: roof.overhang });
    }),
    ...project.stairs.map((stair, index) => ({
      id: stair.id,
      kind: "stair" as const,
      name: `Stair ${index + 1}`,
      level: level(stair.levelId),
      length: measured(stair.length, "user"),
      height: measured(stair.width, "user"),
      material: stair.material,
      properties: { rise: stair.height, steps: stair.steps, type: stair.type },
    })),
    ...project.balconies.map((balcony, index) => ({
      id: balcony.id,
      kind: "slab" as const,
      name: `Balcony ${index + 1}`,
      level: level(balcony.levelId),
      length: measured(balcony.width, "user"),
      width: measured(balcony.depth, "user"),
      thickness: measured(balcony.thickness, "user"),
      material: balcony.material,
      properties: { x: balcony.x, y: balcony.y, elevation: balcony.elevation, rotation: balcony.rotation, railingHeight: balcony.railingHeight, railingMaterial: balcony.railingMaterial },
    })),
    ...project.verandas.map((veranda, index) => ({
      id: veranda.id,
      kind: "floor" as const,
      name: `Veranda ${index + 1}`,
      level: level(veranda.levelId),
      length: measured(veranda.width, "user"),
      width: measured(veranda.depth, "user"),
      thickness: measured(veranda.thickness, "user"),
      material: veranda.material,
      properties: { x: veranda.x, y: veranda.y, elevation: veranda.elevation, rotation: veranda.rotation, canopyHeight: veranda.canopyHeight, canopyMaterial: veranda.canopyMaterial, postMaterial: veranda.postMaterial },
    })),
    ...project.ceilings.map((ceiling, index) => areaElement(ceiling.id, "ceiling", `Ceiling ${index + 1}`, level(ceiling.levelId), polygonArea(ceiling.boundary), ceiling.material, { thickness: ceiling.thickness, elevation: ceiling.elevation, roomId: ceiling.roomId })),
    ...project.railings.map((railing, index) => ({
      id: railing.id,
      kind: "fixture" as const,
      name: `Railing ${index + 1}`,
      level: level(railing.levelId),
      length: measured(distance(railing.start, railing.end), "user"),
      height: measured(railing.height, "user"),
      material: railing.material,
      properties: { elevation: railing.elevation, hostId: railing.hostId ?? "" },
    })),
    ...project.components.map((component) => ({
      id: component.id,
      kind: "furniture" as const,
      name: component.name,
      level: level(component.levelId),
      length: measured(component.width, "user"),
      width: measured(component.depth, "user"),
      height: measured(component.height, "user"),
      material: component.material,
      properties: { x: component.x, y: component.y, elevation: component.elevation, rotation: component.rotation, family: component.family, source: component.source },
    })),
    ...(project.site ? [areaElement(project.site.id, "floor", "Site / ground", level(project.site.levelId), polygonArea(project.site.boundary), project.site.material, { thickness: project.site.thickness, elevation: project.site.elevation, external: 1 })] : []),
  ];

  const quantities: HousePreparedQuantity[] = calculateHouseQuantities(project)
    .filter((row) => row.quantity > 0 && row.sourceObjectIds.length > 0)
    .map((row) => {
      const unit = row.unit === "No." ? "pc" : row.unit;
      return {
        id: `house:${row.code}`,
        representativeElementId: row.sourceObjectIds[0]!,
        section: sectionFor(row.code),
        description: row.description,
        quantity: {
          label: row.description,
          value: round(row.quantity),
          unit,
          formula: `Calculated from ${row.sourceObjectIds.length} structured object${row.sourceObjectIds.length === 1 ? "" : "s"} = ${round(row.quantity)} ${unit}`,
          source: "user",
          confidence: 1,
          elementIds: row.sourceObjectIds,
        },
      };
    });

  return {
    version: 1,
    source: "house-designer",
    projectId: project.id,
    name: project.metadata.title,
    elements,
    quantities,
    levels: project.levels.map((item) => item.name),
    warnings: [...(project.freehandSketch && !project.freehandSketch.calibrated ? ["UNSCALED FREEHAND SKETCH: dimensions, areas and costs are approximate. Set known dimensions before using this estimate."] : []), "Preliminary quantities only. Verify the structural design and final measurements before construction or procurement."],
  };
}

export function parseHouseTakeoffPackage(raw: string): HouseTakeoffPackage | null {
  try {
    const value = JSON.parse(raw) as Partial<HouseTakeoffPackage>;
    if (value.version !== 1 || value.source !== "house-designer" || typeof value.projectId !== "string" || typeof value.name !== "string") return null;
    if (!Array.isArray(value.elements) || !value.elements.every(validElement) || !Array.isArray(value.quantities) || !value.quantities.every(validQuantity)) return null;
    if (!Array.isArray(value.levels) || !value.levels.every((item) => typeof item === "string") || !Array.isArray(value.warnings) || !value.warnings.every((item) => typeof item === "string")) return null;
    return value as HouseTakeoffPackage;
  } catch {
    return null;
  }
}

function openingElement(opening: HouseProject["doors"][number], kind: "door" | "window", name: string, level: string): BuildingElement {
  return {
    id: opening.id,
    kind,
    name,
    level,
    length: measured(opening.width, "user"),
    width: measured(opening.width, "user"),
    height: measured(opening.height, "user"),
    material: opening.material,
    properties: { style: opening.style, sillHeight: opening.sillHeight, offset: opening.offset },
  };
}

function areaElement(id: string, kind: "slab" | "room" | "roof" | "floor" | "ceiling", name: string, level: string, area: number, material: string, properties: Record<string, string | number>): BuildingElement {
  const side = Math.sqrt(Math.max(0, area));
  return { id, kind, name, level, length: measured(side, "user"), height: measured(side, "user"), material, properties: { ...properties, areaMm2: area } };
}

function validElement(value: unknown): value is BuildingElement {
  if (!value || typeof value !== "object") return false;
  const item = value as { id?: unknown; kind?: unknown; name?: unknown };
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.kind === "string" && ELEMENT_KINDS.includes(item.kind as (typeof ELEMENT_KINDS)[number]);
}

function validQuantity(value: unknown): value is HousePreparedQuantity {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<HousePreparedQuantity>;
  return typeof item.id === "string" && typeof item.representativeElementId === "string" && typeof item.description === "string" && !!item.quantity && Number.isFinite(item.quantity.value) && Array.isArray(item.quantity.elementIds);
}

function sectionFor(code: string): BoqSectionCode {
  if (code.startsWith("CON")) return "C";
  if (code.startsWith("MAS")) return "F";
  if (code === "FIN-01") return "M";
  if (code === "FIN-02") return "K";
  if (code === "FIN-03") return "H";
  if (code === "FIN-04") return "K";
  if (code === "FIN-05") return "N";
  if (code.startsWith("EXT")) return "W";
  if (code.startsWith("OPN")) return "I";
  return "A";
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function polygonArea(points: { x: number; y: number }[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function round(value: number) {
  return Math.round(value * 1_000) / 1_000;
}
