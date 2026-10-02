import { z } from "zod";

import { roomSchema, type Room } from "@/features/berchuma-studio/types/room";

const point = z.object({ x: z.number().finite(), y: z.number().finite() });
const identifiedPoint = point.extend({ id: z.string().min(1).max(60) });

export const detectedHousePlanSchema = z.object({
  outerBoundary: z.array(identifiedPoint).min(3).max(32),
  wallThickness: z.number().positive().max(600).default(150),
  ceilingHeight: z.number().positive().max(6_000).optional(),
  interiorWalls: z.array(z.object({
    id: z.string().min(1).max(60),
    start: point,
    end: point,
    thickness: z.number().positive().max(600).optional(),
    height: z.number().positive().max(6_000).optional(),
    label: z.string().max(60).optional(),
  })).max(80).default([]),
  rooms: z.array(z.object({
    id: z.string().min(1).max(60),
    name: z.string().min(1).max(80),
    boundary: z.array(point).min(3).max(16),
  })).max(40).default([]),
  openings: z.array(z.object({
    id: z.string().min(1).max(60),
    kind: z.enum(["door", "window", "passage"]),
    wallId: z.string().min(1).max(60),
    offset: z.number().nonnegative(),
    width: z.number().positive().max(12_000),
    height: z.number().positive().max(4_000).optional(),
    sill: z.number().nonnegative().max(3_000).optional(),
    swing: z.enum(["in-left", "in-right", "out-left", "out-right", "none"]).optional(),
    label: z.string().max(60).optional(),
  })).max(40).default([]),
  columns: z.array(z.object({
    id: z.string().min(1).max(60),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive().max(3_000).optional(),
    depth: z.number().positive().max(3_000).optional(),
  })).max(80).default([]),
  stairs: z.array(z.object({
    id: z.string().min(1).max(60),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive().max(5_000),
    length: z.number().positive().max(15_000),
    rotation: z.number().finite().optional(),
  })).max(20).default([]),
  dimensions: z.array(z.object({
    id: z.string().min(1).max(60),
    start: point,
    end: point,
    label: z.string().max(60).optional(),
  })).max(80).default([]),
  platforms: z.array(z.object({
    id: z.string().min(1).max(60),
    kind: z.enum(["balcony", "veranda"]),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive().max(20_000),
    depth: z.number().positive().max(10_000),
    rotation: z.number().finite().optional(),
    wallId: z.string().max(60).optional(),
    label: z.string().max(60).optional(),
  })).max(20).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  notes: z.array(z.string().max(240)).max(12).default([]),
});

export type DetectedHousePlan = z.infer<typeof detectedHousePlanSchema>;

export function detectedPlanToRoom(input: unknown, options?: { ceilingHeight?: number; reference?: Room["reference"] }): { room: Room; confidence: number; notes: string[] } {
  const detected = detectedHousePlanSchema.parse(input);
  const aliases = new Map<string, string>();
  const corners = detected.outerBoundary.map((item, index) => {
    const id = `c${index + 1}`;
    aliases.set(item.id, id);
    return { id, x: item.x, y: item.y };
  });
  const interiorWalls = detected.interiorWalls.map((item, index) => {
    const id = `iw${index + 1}`;
    aliases.set(item.id, id);
    return {
      id,
      start: { ...item.start },
      end: { ...item.end },
      thickness: item.thickness ?? detected.wallThickness,
      height: item.height ?? options?.ceilingHeight ?? detected.ceilingHeight ?? 2_700,
      label: item.label || `Interior wall ${index + 1}`,
    };
  });
  const wallLengths = new Map<string, number>();
  corners.forEach((corner, index) => {
    const end = corners[(index + 1) % corners.length]!;
    wallLengths.set(corner.id, Math.hypot(end.x - corner.x, end.y - corner.y));
  });
  interiorWalls.forEach((wall) => wallLengths.set(wall.id, Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)));

  const room = roomSchema.parse({
    version: 1,
    corners,
    wallThickness: detected.wallThickness,
    ceilingHeight: options?.ceilingHeight ?? detected.ceilingHeight ?? 2_700,
    openings: detected.openings.flatMap((opening, index) => {
      const wallId = aliases.get(opening.wallId);
      const wallLength = wallId ? wallLengths.get(wallId) : undefined;
      if (!wallId || !wallLength || wallLength < 200) return [];
      const width = Math.min(opening.width, wallLength);
      return [{
        id: `opening-${index + 1}`,
        kind: opening.kind,
        wallId,
        offset: Math.min(Math.max(0, opening.offset), Math.max(0, wallLength - width)),
        width,
        height: opening.height ?? (opening.kind === "window" ? 1_200 : 2_100),
        sill: opening.sill ?? (opening.kind === "window" ? 900 : 0),
        swing: opening.swing ?? (opening.kind === "door" ? "in-right" : "none"),
        label: opening.label ?? "",
      }];
    }),
    runWalls: [],
    interiorWalls,
    zones: detected.rooms.map((item, index) => ({
      id: `zone-${index + 1}`,
      name: item.name,
      boundary: item.boundary.map((entry) => ({ ...entry })),
      floorMaterial: "Unspecified",
      wallMaterial: "Paint",
      ceilingMaterial: "Gypsum board",
    })),
    planColumns: detected.columns.map((item, index) => ({
      id: `column-${index + 1}`,
      x: item.x,
      y: item.y,
      width: item.width ?? 300,
      depth: item.depth ?? 300,
      label: `Column ${index + 1}`,
    })),
    planStairs: detected.stairs.map((item, index) => ({
      id: `stair-${index + 1}`,
      x: item.x,
      y: item.y,
      width: item.width,
      length: item.length,
      rotation: item.rotation ?? 0,
      label: `Stair ${index + 1}`,
    })),
    dimensions: detected.dimensions.map((item, index) => ({
      id: `dimension-${index + 1}`,
      start: { ...item.start },
      end: { ...item.end },
      label: item.label ?? "",
    })),
    planPlatforms: detected.platforms.map((item, index) => ({
      id: `platform-${index + 1}`,
      kind: item.kind,
      x: item.x,
      y: item.y,
      width: item.width,
      depth: item.depth,
      rotation: item.rotation ?? 0,
      wallId: item.wallId ? aliases.get(item.wallId) : undefined,
      label: item.label ?? (item.kind === "balcony" ? "Balcony" : "Veranda"),
    })),
    reference: options?.reference,
  });

  return { room, confidence: detected.confidence, notes: detected.notes };
}
