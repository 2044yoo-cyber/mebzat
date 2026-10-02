import { z } from "zod";

import { roomWalls } from "@/features/berchuma-studio/services/room-geometry";
import { roomSchema, type Room } from "@/features/berchuma-studio/types/room";

export const houseStyles = [
  "modern",
  "contemporary",
  "minimal",
  "classic",
  "neo-classical",
  "mediterranean",
  "ethiopian-inspired",
  "custom-reference",
] as const;

export const roofTypes = ["flat", "gable", "hip"] as const;
export const stairTypes = ["straight", "l-shaped", "u-shaped"] as const;
export const houseObjectKinds = ["level", "wall", "door", "window", "stair", "slab", "roof"] as const;

export type HouseStyle = (typeof houseStyles)[number];
export type HouseObjectKind = (typeof houseObjectKinds)[number];
export type HouseSelection = { kind: HouseObjectKind; id: string };

const pointSchema = z.object({ x: z.number(), y: z.number() });

const levelSchema = z.object({
  id: z.string(),
  name: z.string(),
  elevation: z.number(),
  floorToFloorHeight: z.number().positive(),
  plan: roomSchema.nullable(),
});

const wallSchema = z.object({
  id: z.string(),
  sourceWallId: z.string().optional(),
  levelId: z.string(),
  roomId: z.string(),
  start: pointSchema,
  end: pointSchema,
  thickness: z.number().positive(),
  height: z.number().positive(),
  material: z.string(),
});

const openingSchema = z.object({
  id: z.string(),
  sourceOpeningId: z.string().optional(),
  levelId: z.string(),
  wallId: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  sillHeight: z.number().nonnegative(),
  offset: z.number().nonnegative(),
  type: z.string(),
  style: z.string().default("standard"),
  material: z.string().default("Aluminium"),
  swing: z.string(),
});

const stairSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  x: z.number(),
  y: z.number(),
  elevation: z.number(),
  width: z.number().positive(),
  length: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number(),
  steps: z.number().int().min(3).max(40),
  type: z.enum(stairTypes),
  material: z.string(),
});

const slabSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  boundary: z.array(pointSchema).min(3),
  thickness: z.number().positive(),
  elevation: z.number(),
  material: z.string(),
});

const roofSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  boundary: z.array(pointSchema).min(3),
  elevation: z.number(),
  type: z.enum(roofTypes),
  height: z.number().positive(),
  slope: z.number().min(0).max(60),
  overhang: z.number().nonnegative(),
  thickness: z.number().positive(),
  material: z.string(),
});

export const houseProjectSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  metadata: z.object({
    title: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  units: z.literal("mm"),
  designStyle: z.enum(houseStyles),
  originalPlanStrict: z.boolean(),
  plannedFloorCount: z.number().int().min(1).max(6),
  levels: z.array(levelSchema),
  rooms: z.array(
    z.object({
      id: z.string(),
      levelId: z.string(),
      name: z.string(),
      boundary: z.array(pointSchema),
      floorMaterial: z.string(),
      ceilingHeight: z.number().positive(),
    }),
  ),
  walls: z.array(wallSchema),
  doors: z.array(openingSchema),
  windows: z.array(openingSchema),
  stairs: z.array(stairSchema),
  structuralColumns: z.array(z.unknown()),
  structuralBeams: z.array(z.unknown()),
  slabs: z.array(slabSchema),
  roofs: z.array(roofSchema),
  balconies: z.array(z.unknown()),
  facadeElements: z.array(z.unknown()),
  materials: z.array(z.string()),
  referenceImages: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["floor-plan", "facade"]),
      name: z.string(),
      url: z.string(),
      mediaType: z.enum(["image", "pdf"]),
    }),
  ),
  revisions: z.array(
    z.object({ id: z.string(), createdAt: z.string(), note: z.string() }),
  ),
});

export type HouseProject = z.infer<typeof houseProjectSchema>;
export type HouseWall = HouseProject["walls"][number];
export type HouseOpening = HouseProject["doors"][number];
export type HouseStair = HouseProject["stairs"][number];
export type HouseSlab = HouseProject["slabs"][number];
export type HouseRoof = HouseProject["roofs"][number];

export type HouseProjectInput = {
  id?: string;
  createdAt?: string;
  title: string;
  room: Room;
  style: HouseStyle;
  strict: boolean;
  floorCount: number;
  floorToFloorHeight: number;
  referenceImages?: HouseProject["referenceImages"];
};

/** Generate reproducible architecture from the verified plan. */
export function createHouseProject(input: HouseProjectInput): HouseProject {
  const now = new Date().toISOString();
  const levels: HouseProject["levels"] = [];
  const rooms: HouseProject["rooms"] = [];
  const walls: HouseProject["walls"] = [];
  const doors: HouseProject["doors"] = [];
  const windows: HouseProject["windows"] = [];
  const slabs: HouseProject["slabs"] = [];
  const stairs: HouseProject["stairs"] = [];

  for (let index = 0; index < input.floorCount; index += 1) {
    const levelId = index === 0 ? "ground-floor" : `floor-${index + 1}`;
    const roomId = `${levelId}:room-1`;
    const plan = clonePlan(input.room, index === 0);
    const elevation = index * input.floorToFloorHeight;

    levels.push({
      id: levelId,
      name: index === 0 ? "Ground Floor" : `${ordinal(index)} Floor`,
      elevation,
      floorToFloorHeight: input.floorToFloorHeight,
      plan,
    });
    rooms.push({
      id: roomId,
      levelId,
      name: index === 0 ? "Ground floor" : `${ordinal(index)} floor`,
      boundary: plan.corners.map(copyPoint),
      floorMaterial: "Unspecified",
      ceilingHeight: plan.ceilingHeight,
    });

    for (const wall of roomWalls(plan)) {
      walls.push({
        id: wallObjectId(levelId, wall.id),
        sourceWallId: wall.id,
        levelId,
        roomId,
        start: copyPoint(wall.start),
        end: copyPoint(wall.end),
        thickness: plan.wallThickness,
        height: plan.ceilingHeight,
        material: "Masonry",
      });
    }

    for (const opening of plan.openings) {
      const item: HouseOpening = {
        id: openingObjectId(levelId, opening.kind, opening.id),
        sourceOpeningId: opening.id,
        levelId,
        wallId: wallObjectId(levelId, opening.wallId),
        width: opening.width,
        height: opening.height,
        sillHeight: opening.sill,
        offset: opening.offset,
        type: opening.kind,
        style: "standard",
        material: opening.kind === "window" ? "Aluminium" : "Timber",
        swing: opening.swing,
      };
      if (opening.kind === "window") windows.push(item);
      else doors.push(item);
    }

    slabs.push({
      id: `${levelId}:slab`,
      levelId,
      boundary: plan.corners.map(copyPoint),
      thickness: 150,
      elevation,
      material: "Reinforced concrete",
    });

    if (index < input.floorCount - 1) {
      const bounds = planBounds(plan);
      const height = input.floorToFloorHeight;
      stairs.push({
        id: `${levelId}:stair`,
        levelId,
        x: bounds.minX + Math.min(1200, bounds.width * 0.2),
        y: bounds.minY + Math.min(1200, bounds.depth * 0.2),
        elevation,
        width: Math.min(1000, bounds.width * 0.28),
        length: Math.min(3200, bounds.depth * 0.58),
        height,
        rotation: 0,
        steps: clampInt(Math.round(height / 175), 12, 24),
        type: "straight",
        material: "Reinforced concrete",
      });
    }
  }

  const top = levels[levels.length - 1];
  const topPlan = top.plan ?? input.room;
  const roofs: HouseProject["roofs"] = [
    {
      id: "main-roof",
      levelId: top.id,
      boundary: topPlan.corners.map(copyPoint),
      elevation: top.elevation + topPlan.ceilingHeight,
      type: "flat",
      height: 300,
      slope: 0,
      overhang: 400,
      thickness: 180,
      material: "Reinforced concrete",
    },
  ];

  return houseProjectSchema.parse({
    version: 1,
    id: input.id ?? crypto.randomUUID(),
    metadata: {
      title: input.title.trim() || "Untitled house",
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    },
    units: "mm",
    designStyle: input.style,
    originalPlanStrict: input.strict,
    plannedFloorCount: input.floorCount,
    levels,
    rooms,
    walls,
    doors,
    windows,
    stairs,
    structuralColumns: [],
    structuralBeams: [],
    slabs,
    roofs,
    balconies: [],
    facadeElements: [],
    materials: ["Masonry", "Reinforced concrete", "Aluminium", "Timber"],
    referenceImages: input.referenceImages ?? [],
    revisions: [
      { id: crypto.randomUUID(), createdAt: now, note: "Generated editable architectural model" },
    ],
  });
}

/** Upgrade a Phase 1 draft without changing its identity or references. */
export function ensurePhaseTwoProject(project: HouseProject): HouseProject {
  if (project.slabs.length > 0 && project.roofs.length > 0) return project;
  const room = project.levels.find((level) => level.plan)?.plan;
  if (!room) return project;
  return createHouseProject({
    id: project.id,
    createdAt: project.metadata.createdAt,
    title: project.metadata.title,
    room,
    style: project.designStyle,
    strict: project.originalPlanStrict,
    floorCount: project.plannedFloorCount,
    floorToFloorHeight: project.levels[0]?.floorToFloorHeight ?? 3000,
    referenceImages: project.referenceImages,
  });
}

export function wallObjectId(levelId: string, sourceWallId: string): string {
  return `${levelId}:wall:${sourceWallId}`;
}

export function openingObjectId(levelId: string, kind: string, sourceOpeningId: string): string {
  return `${levelId}:${kind}:${sourceOpeningId}`;
}

function clonePlan(room: Room, keepReference: boolean): Room {
  return {
    ...room,
    corners: room.corners.map((corner) => ({ ...corner })),
    openings: room.openings.map((opening) => ({ ...opening })),
    runWalls: [],
    reference: keepReference ? room.reference : undefined,
  };
}

function copyPoint(point: { x: number; y: number }) {
  return { x: point.x, y: point.y };
}

function planBounds(room: Room) {
  const xs = room.corners.map((point) => point.x);
  const ys = room.corners.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, width: maxX - minX, depth: maxY - minY };
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ordinal(index: number): string {
  const names = ["First", "Second", "Third", "Fourth", "Fifth"];
  return names[index - 1] ?? `Level ${index}`;
}
