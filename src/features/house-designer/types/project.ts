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
export const houseObjectKinds = ["level", "wall", "door", "window", "stair", "slab", "roof", "column", "beam"] as const;
export const facadeElementTypes = ["band", "cornice", "pilaster", "accent", "parapet"] as const;

export type HouseStyle = (typeof houseStyles)[number];
export type HouseObjectKind = (typeof houseObjectKinds)[number];
export type HouseSelection = { kind: HouseObjectKind; id: string };

export type HouseFacadeSettings = {
  source: "style" | "reference";
  style: HouseStyle;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  roofColor: string;
  windowFrameColor: string;
  doorColor: string;
  wallMaterial: string;
  roofMaterial: string;
  windowStyle: string;
  entranceStyle: string;
};

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

const structuralColumnSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  sourceCornerId: z.string().optional(),
  x: z.number(),
  y: z.number(),
  elevation: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
  type: z.string(),
  material: z.string(),
});

const structuralBeamSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  sourceWallId: z.string().optional(),
  start: pointSchema,
  end: pointSchema,
  elevation: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
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

const facadeSettingsSchema = z.object({
  source: z.enum(["style", "reference"]),
  style: z.enum(houseStyles),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  accentColor: z.string(),
  roofColor: z.string(),
  windowFrameColor: z.string(),
  doorColor: z.string(),
  wallMaterial: z.string(),
  roofMaterial: z.string(),
  windowStyle: z.string(),
  entranceStyle: z.string(),
});

const facadeElementSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  wallId: z.string(),
  type: z.enum(facadeElementTypes),
  offset: z.number().nonnegative(),
  elevation: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
  depth: z.number().positive(),
  material: z.string(),
  color: z.string(),
});

const facadeReferenceAnalysisSchema = z.object({
  sourceImageId: z.string(),
  analysedAt: z.string(),
  currentStyle: z.string(),
  summary: z.string(),
  walls: z.string(),
  windows: z.string(),
  doors: z.string(),
  materials: z.array(z.string()),
});

const facadeAlternativeSchema = z.object({
  id: z.string(),
  name: z.string(),
  style: z.enum(houseStyles),
  facade: facadeSettingsSchema.default(facadeSettingsForStyle("modern")),
  facadeElements: z.array(facadeElementSchema).default([]),
  createdAt: z.string(),
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
  facade: facadeSettingsSchema,
  facadeReferenceAnalysis: facadeReferenceAnalysisSchema.nullable().default(null),
  designAlternatives: z.array(facadeAlternativeSchema).default([]),
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
  structuralColumns: z.array(structuralColumnSchema).default([]),
  structuralBeams: z.array(structuralBeamSchema).default([]),
  slabs: z.array(slabSchema),
  roofs: z.array(roofSchema),
  balconies: z.array(z.unknown()),
  facadeElements: z.array(facadeElementSchema),
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
export type HouseStructuralColumn = HouseProject["structuralColumns"][number];
export type HouseStructuralBeam = HouseProject["structuralBeams"][number];
export type HouseFacadeElement = HouseProject["facadeElements"][number];
export type HouseFacadeAlternative = HouseProject["designAlternatives"][number];

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
  const facade = facadeSettingsForStyle(input.style, input.referenceImages?.some((image) => image.kind === "facade") ?? false);
  const facadeElements = buildFacadeElements(walls, levels, facade);
  const structuralColumns = buildStructuralColumns(levels);
  const structuralBeams = buildStructuralBeams(walls, levels);

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
    facade,
    facadeReferenceAnalysis: null,
    designAlternatives: [],
    plannedFloorCount: input.floorCount,
    levels,
    rooms,
    walls,
    doors,
    windows,
    stairs,
    structuralColumns,
    structuralBeams,
    slabs,
    roofs,
    balconies: [],
    facadeElements,
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

export function facadeSettingsForStyle(style: HouseStyle, hasReference = false): HouseFacadeSettings {
  const profiles: Record<HouseStyle, Omit<HouseFacadeSettings, "source" | "style">> = {
    modern: { primaryColor: "#ede9e2", secondaryColor: "#303a45", accentColor: "#a87545", roofColor: "#555b62", windowFrameColor: "#202932", doorColor: "#795237", wallMaterial: "Smooth render", roofMaterial: "Reinforced concrete", windowStyle: "large black aluminium", entranceStyle: "recessed modern" },
    contemporary: { primaryColor: "#e3dfd7", secondaryColor: "#6d7276", accentColor: "#b36e3f", roofColor: "#4b5056", windowFrameColor: "#252a30", doorColor: "#704830", wallMaterial: "Textured render", roofMaterial: "Standing seam", windowStyle: "wide aluminium", entranceStyle: "canopy" },
    minimal: { primaryColor: "#f3f1ec", secondaryColor: "#c8c4bb", accentColor: "#575c61", roofColor: "#777b7e", windowFrameColor: "#35393d", doorColor: "#4d4037", wallMaterial: "Fine render", roofMaterial: "Reinforced concrete", windowStyle: "flush aluminium", entranceStyle: "flush minimal" },
    classic: { primaryColor: "#efe5d1", secondaryColor: "#c7ad84", accentColor: "#8c6b48", roofColor: "#70483e", windowFrameColor: "#f3eee4", doorColor: "#68452f", wallMaterial: "Painted plaster", roofMaterial: "Clay tile", windowStyle: "framed traditional", entranceStyle: "framed classic" },
    "neo-classical": { primaryColor: "#f2ecdf", secondaryColor: "#d3c3a7", accentColor: "#a58b66", roofColor: "#5b5149", windowFrameColor: "#ece6da", doorColor: "#4c3427", wallMaterial: "Painted stucco", roofMaterial: "Concrete tile", windowStyle: "tall framed", entranceStyle: "pilastered" },
    mediterranean: { primaryColor: "#f0dfc4", secondaryColor: "#c89d70", accentColor: "#8f6544", roofColor: "#a64f38", windowFrameColor: "#544c3e", doorColor: "#6d432d", wallMaterial: "Warm stucco", roofMaterial: "Terracotta tile", windowStyle: "deep reveal", entranceStyle: "arched accent" },
    "ethiopian-inspired": { primaryColor: "#ddd0ba", secondaryColor: "#6e6152", accentColor: "#a35b35", roofColor: "#514943", windowFrameColor: "#282827", doorColor: "#56392a", wallMaterial: "Mineral render and local stone", roofMaterial: "Coated metal", windowStyle: "deep-set aluminium", entranceStyle: "patterned portal" },
    "custom-reference": { primaryColor: "#e7e3dc", secondaryColor: "#77736e", accentColor: "#9b704d", roofColor: "#5d5852", windowFrameColor: "#343434", doorColor: "#604430", wallMaterial: "Reference finish", roofMaterial: "Reference roof", windowStyle: "reference proportion", entranceStyle: "reference entrance" },
  };
  return {
    source: hasReference ? "reference" : "style",
    style,
    ...profiles[style],
  };
}

export function buildFacadeElements(
  walls: HouseProject["walls"],
  levels: HouseProject["levels"],
  facade: HouseFacadeSettings,
): HouseProject["facadeElements"] {
  const elements: HouseProject["facadeElements"] = [];
  for (const level of levels) {
    const wall = walls.find((item) => item.levelId === level.id);
    if (!wall) continue;
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    const wallHeight = wall.height;
    const add = (type: HouseFacadeElement["type"], offset: number, elevation: number, width: number, height: number, depth: number, color = facade.accentColor) => {
      elements.push({ id: `${level.id}:facade:${type}:${elements.length + 1}`, levelId: level.id, wallId: wall.id, type, offset, elevation, width, height, depth, material: facade.wallMaterial, color });
    };

    if (["classic", "neo-classical", "mediterranean"].includes(facade.style)) {
      add("cornice", 0, level.elevation + wallHeight - 180, length, 180, 130, facade.secondaryColor);
    }
    if (["classic", "neo-classical"].includes(facade.style)) {
      add("pilaster", 80, level.elevation, 260, wallHeight, 110, facade.secondaryColor);
      add("pilaster", Math.max(80, length - 340), level.elevation, 260, wallHeight, 110, facade.secondaryColor);
    }
    if (["modern", "contemporary", "minimal", "ethiopian-inspired", "custom-reference"].includes(facade.style)) {
      add("band", 0, level.elevation + wallHeight * 0.58, length, 150, 70, facade.secondaryColor);
    }
    if (["modern", "contemporary", "ethiopian-inspired", "custom-reference"].includes(facade.style)) {
      const accentWidth = Math.min(1100, Math.max(450, length * 0.18));
      add("accent", Math.max(0, length * 0.58), level.elevation + 140, accentWidth, Math.max(600, wallHeight - 280), 95);
    }
    if (facade.style === "ethiopian-inspired") {
      add("band", 0, level.elevation + wallHeight * 0.25, length, 90, 85, facade.accentColor);
    }
  }
  return elements;
}

export function buildStructuralColumns(
  levels: HouseProject["levels"],
  previous: HouseProject["structuralColumns"] = [],
): HouseProject["structuralColumns"] {
  const existing = new Map(previous.map((column) => [column.id, column]));
  return levels.flatMap((level) => {
    const plan = level.plan;
    if (!plan) return [];
    return plan.corners.map((corner) => {
      const id = `${level.id}:column:${corner.id}`;
      const old = existing.get(id);
      return {
        id,
        levelId: level.id,
        sourceCornerId: corner.id,
        x: corner.x,
        y: corner.y,
        elevation: level.elevation,
        width: old?.width ?? 300,
        depth: old?.depth ?? 300,
        height: old?.height ?? plan.ceilingHeight,
        type: old?.type ?? "preliminary reinforced concrete",
        material: old?.material ?? "Reinforced concrete",
      };
    });
  });
}

export function buildStructuralBeams(
  walls: HouseProject["walls"],
  levels: HouseProject["levels"],
  previous: HouseProject["structuralBeams"] = [],
): HouseProject["structuralBeams"] {
  const existing = new Map(previous.map((beam) => [beam.id, beam]));
  return walls.map((wall) => {
    const level = levels.find((item) => item.id === wall.levelId);
    const id = `${wall.levelId}:beam:${wall.sourceWallId ?? wall.id}`;
    const old = existing.get(id);
    const depth = old?.depth ?? 400;
    return {
      id,
      levelId: wall.levelId,
      sourceWallId: wall.sourceWallId,
      start: { ...wall.start },
      end: { ...wall.end },
      elevation: (level?.elevation ?? 0) + wall.height - depth,
      width: old?.width ?? Math.max(200, wall.thickness),
      depth,
      material: old?.material ?? "Reinforced concrete",
    };
  });
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
