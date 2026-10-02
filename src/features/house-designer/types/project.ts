import { z } from "zod";

import {
  roomSchema,
  type Room,
} from "@/features/berchuma-studio/types/room";
import { roomWalls } from "@/features/berchuma-studio/services/room-geometry";

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

export type HouseStyle = (typeof houseStyles)[number];

const pointSchema = z.object({ x: z.number(), y: z.number() });

const levelSchema = z.object({
  id: z.string(),
  name: z.string(),
  elevation: z.number(),
  floorToFloorHeight: z.number().positive(),
  /** Phase 1 produces an editable ground plan; later floors can be added here. */
  plan: roomSchema.nullable(),
});

const wallSchema = z.object({
  id: z.string(),
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
  levelId: z.string(),
  wallId: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  sillHeight: z.number().nonnegative(),
  offset: z.number().nonnegative(),
  type: z.string(),
  swing: z.string(),
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
  stairs: z.array(z.unknown()),
  structuralColumns: z.array(z.unknown()),
  structuralBeams: z.array(z.unknown()),
  slabs: z.array(z.unknown()),
  roofs: z.array(z.unknown()),
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

export type HouseProjectInput = {
  id?: string;
  title: string;
  room: Room;
  style: HouseStyle;
  strict: boolean;
  floorCount: number;
  floorToFloorHeight: number;
  referenceImages?: HouseProject["referenceImages"];
};

/** Build every stored building object from the verified plan in one pass. */
export function createHouseProject(input: HouseProjectInput): HouseProject {
  const now = new Date().toISOString();
  const id = input.id ?? crypto.randomUUID();
  const levelId = "ground-floor";
  const roomId = "room-ground-1";
  const walls = roomWalls(input.room);

  const levels: HouseProject["levels"] = Array.from(
    { length: input.floorCount },
    (_, index) => ({
      id: index === 0 ? levelId : `floor-${index + 1}`,
      name: index === 0 ? "Ground Floor" : `${ordinal(index)} Floor`,
      elevation: index * input.floorToFloorHeight,
      floorToFloorHeight: input.floorToFloorHeight,
      plan: index === 0 ? input.room : null,
    }),
  );

  const openings = input.room.openings.map((opening) => ({
    id: opening.id,
    levelId,
    wallId: opening.wallId,
    width: opening.width,
    height: opening.height,
    sillHeight: opening.sill,
    offset: opening.offset,
    type: opening.kind,
    swing: opening.swing,
  }));

  return houseProjectSchema.parse({
    version: 1,
    id,
    metadata: {
      title: input.title.trim() || "Untitled house",
      createdAt: now,
      updatedAt: now,
    },
    units: "mm",
    designStyle: input.style,
    originalPlanStrict: input.strict,
    plannedFloorCount: input.floorCount,
    levels,
    rooms: [
      {
        id: roomId,
        levelId,
        name: "Ground floor",
        boundary: input.room.corners.map(copyPoint),
        floorMaterial: "Unspecified",
        ceilingHeight: input.room.ceilingHeight,
      },
    ],
    walls: walls.map((wall) => ({
      id: wall.id,
      levelId,
      roomId,
      start: copyPoint(wall.start),
      end: copyPoint(wall.end),
      thickness: input.room.wallThickness,
      height: input.room.ceilingHeight,
      material: "Masonry",
    })),
    doors: openings.filter((opening) => opening.type !== "window"),
    windows: openings.filter((opening) => opening.type === "window"),
    stairs: [],
    structuralColumns: [],
    structuralBeams: [],
    slabs: [],
    roofs: [],
    balconies: [],
    facadeElements: [],
    materials: ["Masonry"],
    referenceImages: input.referenceImages ?? [],
    revisions: [
      { id: crypto.randomUUID(), createdAt: now, note: "Verified ground plan" },
    ],
  });
}

function copyPoint(point: { x: number; y: number }) {
  return { x: point.x, y: point.y };
}

function ordinal(index: number): string {
  const names = ["First", "Second", "Third", "Fourth", "Fifth"];
  return names[index - 1] ?? `Level ${index}`;
}
