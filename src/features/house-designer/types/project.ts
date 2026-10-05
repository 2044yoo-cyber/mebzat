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
  "luxury",
] as const;

/** What a person sees for each style; the ids are stored and stay as they are. */
export const HOUSE_STYLE_LABELS: Record<HouseStyle, string> = {
  modern: "Modern",
  contemporary: "Contemporary",
  minimal: "Minimal",
  classic: "Classic",
  "neo-classical": "Neo-classical",
  mediterranean: "Mediterranean",
  "ethiopian-inspired": "Traditional Ethiopian",
  "custom-reference": "Custom (from a reference photo)",
  luxury: "Luxury",
};

export const roofTypes = ["flat", "gable", "hip"] as const;
export const stairTypes = ["straight", "l-shaped", "u-shaped", "dog-legged", "switchback", "winder", "l-winder", "u-winder", "spiral", "curved"] as const;
export const houseObjectKinds = ["level", "room", "wall", "door", "window", "stair", "slab", "roof", "column", "beam", "grid", "facade", "balcony", "veranda", "ceiling", "site", "foundation", "railing", "reference-plane", "annotation", "component"] as const;
export const facadeElementTypes = ["band", "cornice", "pilaster", "accent", "parapet"] as const;

export type HouseStyle = (typeof houseStyles)[number];
export type HouseObjectKind = (typeof houseObjectKinds)[number];
export type HouseSelection = { kind: HouseObjectKind; id: string };

export const houseViewKinds = ["floor-plan", "ceiling-plan", "3d", "elevation", "section", "schedule"] as const;
export type HouseViewKind = (typeof houseViewKinds)[number];

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
const editableValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const objectTypeSchema = z.object({
  id: z.string(),
  kind: z.enum(houseObjectKinds),
  name: z.string(),
  properties: z.record(z.string(), editableValueSchema),
});

const objectInstanceSchema = z.object({
  typeId: z.string().nullable().default(null),
  mark: z.string().default(""),
  pinned: z.boolean().default(false),
  groupId: z.string().nullable().default(null),
  flipped: z.boolean().default(false),
  properties: z.record(z.string(), editableValueSchema).default({}),
});

const referencePlaneSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  name: z.string(),
  start: pointSchema,
  end: pointSchema,
});

const foundationSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  x: z.number(),
  y: z.number(),
  elevation: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  thickness: z.number().positive(),
  material: z.string(),
});

const railingSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  hostId: z.string().nullable().default(null),
  start: pointSchema,
  end: pointSchema,
  elevation: z.number(),
  height: z.number().positive(),
  material: z.string(),
});

const annotationSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  kind: z.enum(["dimension", "text", "tag", "section", "elevation"]),
  text: z.string(),
  start: pointSchema,
  end: pointSchema.nullable().default(null),
  value: z.number().nullable().default(null),
});

const componentSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  family: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  elevation: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number(),
  material: z.string(),
  source: z.enum(["library", "berchuma", "custom"]),
});

const viewStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(houseViewKinds),
  levelId: z.string().nullable().default(null),
  hiddenCategories: z.array(z.enum(houseObjectKinds)).default([]),
  temporaryHiddenIds: z.array(z.string()).default([]),
  isolatedIds: z.array(z.string()).default([]),
  cutPlane: z.number().default(1200),
  topOffset: z.number().default(2300),
  bottomOffset: z.number().default(0),
});

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
  /** Risers. */
  steps: z.number().int().min(3).max(40),
  type: z.enum(stairTypes),
  material: z.string(),
  // The stair's own parameters; its width and length are the footprint they
  // make (services/stair-geometry). Absent on stairs saved before them.
  stairWidth: z.number().positive().optional(),
  treadDepth: z.number().positive().optional(),
  landing: z.number().positive().optional(),
  gap: z.number().nonnegative().optional(),
  reversed: z.boolean().optional(),
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
  /** "rectangular", "square" or "circular" (width is the diameter). */
  type: z.string(),
  material: z.string(),
  rotation: z.number().optional(),
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

const structuralGridSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  axis: z.enum(["x", "y"]),
  label: z.string(),
  position: z.number(),
  start: pointSchema,
  end: pointSchema,
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

const balconySchema = z.object({
  id: z.string(),
  levelId: z.string(),
  wallId: z.string(),
  x: z.number(),
  y: z.number(),
  elevation: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  thickness: z.number().positive(),
  rotation: z.number(),
  railingHeight: z.number().nonnegative(),
  railingMaterial: z.string(),
  material: z.string(),
});

const verandaSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  wallId: z.string(),
  x: z.number(),
  y: z.number(),
  elevation: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  thickness: z.number().positive(),
  rotation: z.number(),
  canopyHeight: z.number().positive(),
  canopyMaterial: z.string(),
  postMaterial: z.string(),
  material: z.string(),
});

const ceilingSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  roomId: z.string(),
  boundary: z.array(pointSchema).min(3),
  elevation: z.number(),
  thickness: z.number().positive(),
  material: z.string(),
});

const siteSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  boundary: z.array(pointSchema).min(3),
  elevation: z.number(),
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
  displayUnits: z.enum(["mm", "cm", "m"]).optional(),
  modelingOptions: z.object({
    mode: z.enum(["house", "apartment", "room"]),
    structure: z.boolean(), foundations: z.boolean(), roof: z.boolean(),
    stairs: z.boolean(), site: z.boolean(), floors: z.boolean(), ceilings: z.boolean(),
  }).optional(),
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
      wallMaterial: z.string().default("Paint"),
      ceilingMaterial: z.string().default("Gypsum board"),
      ceilingHeight: z.number().positive(),
    }),
  ),
  walls: z.array(wallSchema),
  doors: z.array(openingSchema),
  windows: z.array(openingSchema),
  stairs: z.array(stairSchema),
  structuralColumns: z.array(structuralColumnSchema).default([]),
  structuralBeams: z.array(structuralBeamSchema).default([]),
  structuralGrid: z.array(structuralGridSchema).default([]),
  slabs: z.array(slabSchema),
  roofs: z.array(roofSchema),
  balconies: z.array(balconySchema).default([]),
  verandas: z.array(verandaSchema).default([]),
  ceilings: z.array(ceilingSchema).default([]),
  site: siteSchema.nullable().default(null),
  facadeElements: z.array(facadeElementSchema),
  objectTypes: z.array(objectTypeSchema).default([]),
  objectInstances: z.record(z.string(), objectInstanceSchema).default({}),
  referencePlanes: z.array(referencePlaneSchema).default([]),
  foundations: z.array(foundationSchema).default([]),
  railings: z.array(railingSchema).default([]),
  annotations: z.array(annotationSchema).default([]),
  components: z.array(componentSchema).default([]),
  views: z.array(viewStateSchema).default([]),
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
export type HouseRoom = HouseProject["rooms"][number];
export type HouseWall = HouseProject["walls"][number];
export type HouseOpening = HouseProject["doors"][number];
export type HouseStair = HouseProject["stairs"][number];
export type HouseSlab = HouseProject["slabs"][number];
export type HouseRoof = HouseProject["roofs"][number];
export type HouseStructuralColumn = HouseProject["structuralColumns"][number];
export type HouseStructuralBeam = HouseProject["structuralBeams"][number];
export type HouseStructuralGrid = HouseProject["structuralGrid"][number];
export type HouseBalcony = HouseProject["balconies"][number];
export type HouseVeranda = HouseProject["verandas"][number];
export type HouseCeiling = HouseProject["ceilings"][number];
export type HouseSite = NonNullable<HouseProject["site"]>;
export type HouseFacadeElement = HouseProject["facadeElements"][number];
export type HouseFacadeAlternative = HouseProject["designAlternatives"][number];
export type HouseObjectType = HouseProject["objectTypes"][number];
export type HouseObjectInstance = HouseProject["objectInstances"][string];
export type HouseReferencePlane = HouseProject["referencePlanes"][number];
export type HouseFoundation = HouseProject["foundations"][number];
export type HouseRailing = HouseProject["railings"][number];
export type HouseAnnotation = HouseProject["annotations"][number];
export type HouseComponent = HouseProject["components"][number];
export type HouseViewState = HouseProject["views"][number];

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
    const plan = clonePlan(input.room, index === 0);
    const elevation = index * input.floorToFloorHeight;

    levels.push({
      id: levelId,
      name: index === 0 ? "Ground Floor" : `${ordinal(index)} Floor`,
      elevation,
      floorToFloorHeight: input.floorToFloorHeight,
      plan,
    });
    const planRooms = plan.zones?.length
      ? plan.zones
      : [{ id: "room-1", name: index === 0 ? "Ground floor" : `${ordinal(index)} floor`, boundary: plan.corners, floorMaterial: "Unspecified", wallMaterial: "Paint", ceilingMaterial: "Gypsum board" }];
    for (const room of planRooms) {
      rooms.push({
        id: `${levelId}:${room.id}`,
        levelId,
        name: room.name,
        boundary: room.boundary.map(copyPoint),
        floorMaterial: room.floorMaterial,
        wallMaterial: room.wallMaterial,
        ceilingMaterial: room.ceilingMaterial,
        ceilingHeight: plan.ceilingHeight,
      });
    }
    const roomId = rooms.find((room) => room.levelId === levelId)?.id ?? `${levelId}:room-1`;

    for (const wall of housePlanWalls(plan)) {
      walls.push({
        id: wallObjectId(levelId, wall.id),
        sourceWallId: wall.id,
        levelId,
        roomId,
        start: copyPoint(wall.start),
        end: copyPoint(wall.end),
        thickness: wall.thickness,
        height: wall.height,
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
      const planned = plan.planStairs?.length ? plan.planStairs : [{ id: "stair", x: bounds.minX + Math.min(1200, bounds.width * 0.2), y: bounds.minY + Math.min(1200, bounds.depth * 0.2), width: Math.min(1000, bounds.width * 0.28), length: Math.min(3200, bounds.depth * 0.58), rotation: 0 }];
      for (const stair of planned) {
        stairs.push({
          id: `${levelId}:${stair.id}`,
          levelId,
          x: stair.x,
          y: stair.y,
          elevation,
          width: stair.width,
          length: stair.length,
          height,
          rotation: stair.rotation,
          steps: clampInt(Math.round(height / 175), 12, 24),
          type: "straight",
          material: "Reinforced concrete",
        });
      }
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
  const structuralGrid = buildStructuralGrid(levels, structuralColumns);
  const ceilings = buildHouseCeilings(rooms, levels);
  const site = buildHouseSite(rooms);
  const verandas = buildHouseVerandas(levels, walls, doors);
  const balconies = buildHouseBalconies(levels, walls, doors);

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
    structuralGrid,
    slabs,
    roofs,
    balconies,
    verandas,
    ceilings,
    site,
    facadeElements,
    objectTypes: defaultObjectTypes(input.floorToFloorHeight),
    objectInstances: buildObjectInstances({ walls, doors, windows, stairs, structuralColumns, structuralBeams, slabs, roofs, rooms }),
    referencePlanes: [],
    foundations: structuralColumns.filter((column) => column.levelId === levels[0]?.id).map((column) => ({
      id: `foundation:${column.id}`,
      levelId: column.levelId,
      x: column.x,
      y: column.y,
      elevation: -450,
      width: Math.max(900, column.width * 3),
      depth: Math.max(900, column.depth * 3),
      thickness: 450,
      material: "Reinforced concrete",
    })),
    railings: [],
    annotations: [],
    components: [],
    views: defaultHouseViews(levels),
    materials: ["Masonry", "Reinforced concrete", "Aluminium", "Timber", "Gypsum board", "Paint", "Paving"],
    referenceImages: input.referenceImages ?? [],
    revisions: [
      { id: crypto.randomUUID(), createdAt: now, note: "Generated editable architectural model" },
    ],
  });
}

/** Upgrade a Phase 1 draft without changing its identity or references. */
export function ensurePhaseTwoProject(project: HouseProject): HouseProject {
  if (project.modelingOptions) return project;
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
    luxury: { primaryColor: "#ece6dc", secondaryColor: "#8a7a66", accentColor: "#8c6a3f", roofColor: "#2f3236", windowFrameColor: "#1f2226", doorColor: "#3b2a1e", wallMaterial: "Natural stone cladding and fine render", roofMaterial: "Reinforced concrete", windowStyle: "floor-to-ceiling bronze aluminium", entranceStyle: "double-height pivot door" },
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
  for (const [levelIndex, level] of levels.entries()) {
    const exteriorIds = new Set(level.plan?.corners.map((corner) => corner.id) ?? []);
    const exteriorWalls = walls.filter((item) => item.levelId === level.id && !!item.sourceWallId && exteriorIds.has(item.sourceWallId));
    for (const [wallIndex, wall] of exteriorWalls.entries()) {
      const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
      const wallHeight = wall.height;
      const add = (type: HouseFacadeElement["type"], offset: number, elevation: number, width: number, height: number, depth: number, color = facade.accentColor) => {
        elements.push({ id: `${level.id}:facade:${wall.sourceWallId}:${type}:${elements.length + 1}`, levelId: level.id, wallId: wall.id, type, offset, elevation, width, height, depth, material: facade.wallMaterial, color });
      };

      if (["classic", "neo-classical", "mediterranean"].includes(facade.style)) {
        add("cornice", 0, level.elevation + wallHeight - 180, length, 180, 130, facade.secondaryColor);
      }
      if (["classic", "neo-classical"].includes(facade.style) && wallIndex === 0) {
        add("pilaster", 80, level.elevation, 260, wallHeight, 110, facade.secondaryColor);
        add("pilaster", Math.max(80, length - 340), level.elevation, 260, wallHeight, 110, facade.secondaryColor);
      }
      if (["modern", "contemporary", "minimal", "ethiopian-inspired", "custom-reference", "luxury"].includes(facade.style)) {
        add("band", 0, level.elevation + wallHeight * 0.58, length, 150, 70, facade.secondaryColor);
      }
      if (["modern", "contemporary", "ethiopian-inspired", "custom-reference", "luxury"].includes(facade.style) && wallIndex === 0) {
        const accentWidth = Math.min(1100, Math.max(450, length * 0.18));
        add("accent", Math.max(0, length * 0.58), level.elevation + 140, accentWidth, Math.max(600, wallHeight - 280), 95);
      }
      // Luxury: a stone plinth along every outside wall and a full-height
      // feature either side of the entrance.
      if (facade.style === "luxury") {
        add("band", 0, level.elevation, length, 450, 60, facade.secondaryColor);
        if (wallIndex === 0) {
          add("pilaster", Math.max(0, length * 0.58 - 320), level.elevation, 220, wallHeight, 120, facade.accentColor);
          add("pilaster", Math.min(length - 220, length * 0.58 + Math.min(1100, Math.max(450, length * 0.18)) + 100), level.elevation, 220, wallHeight, 120, facade.accentColor);
        }
      }
      if (facade.style === "ethiopian-inspired") {
        add("band", 0, level.elevation + wallHeight * 0.25, length, 90, 85, facade.accentColor);
      }
      if (levelIndex === levels.length - 1 && ["modern", "contemporary", "minimal", "custom-reference", "ethiopian-inspired", "luxury"].includes(facade.style)) {
        add("parapet", 0, level.elevation + wallHeight, length, 800, Math.max(120, wall.thickness), facade.primaryColor);
      }
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
    const points = plan.planColumns?.length
      ? plan.planColumns.map((column) => ({ id: column.id, x: column.x, y: column.y, width: column.width, depth: column.depth }))
      : plan.corners.map((corner) => ({ id: corner.id, x: corner.x, y: corner.y, width: 300, depth: 300 }));
    return points.map((point) => {
      const id = `${level.id}:column:${point.id}`;
      const old = existing.get(id);
      return {
        id,
        levelId: level.id,
        sourceCornerId: point.id,
        x: point.x,
        y: point.y,
        elevation: level.elevation,
        width: old?.width ?? point.width,
        depth: old?.depth ?? point.depth,
        height: old?.height ?? plan.ceilingHeight,
        type: old?.type ?? "preliminary reinforced concrete",
        material: old?.material ?? "Reinforced concrete",
      };
    });
  });
}

export function buildStructuralGrid(
  levels: HouseProject["levels"],
  columns: HouseProject["structuralColumns"],
  previous: HouseProject["structuralGrid"] = [],
): HouseProject["structuralGrid"] {
  const existing = new Map(previous.map((grid) => [grid.id, grid]));
  return levels.flatMap((level) => {
    const plan = level.plan;
    if (!plan) return [];
    const bounds = planBounds(plan);
    const levelColumns = columns.filter((column) => column.levelId === level.id);
    const xs = uniquePositions(levelColumns.map((column) => column.x));
    const ys = uniquePositions(levelColumns.map((column) => column.y));
    return [
      ...xs.map((position, index) => {
        const id = `${level.id}:grid:x:${index + 1}`;
        return { id, levelId: level.id, axis: "x" as const, label: existing.get(id)?.label ?? String(index + 1), position, start: { x: position, y: bounds.minY - 500 }, end: { x: position, y: bounds.minY + bounds.depth + 500 } };
      }),
      ...ys.map((position, index) => {
        const id = `${level.id}:grid:y:${index + 1}`;
        return { id, levelId: level.id, axis: "y" as const, label: existing.get(id)?.label ?? String.fromCharCode(65 + index), position, start: { x: bounds.minX - 500, y: position }, end: { x: bounds.minX + bounds.width + 500, y: position } };
      }),
    ];
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

export function buildHouseCeilings(
  rooms: HouseProject["rooms"],
  levels: HouseProject["levels"],
  previous: HouseProject["ceilings"] = [],
): HouseProject["ceilings"] {
  const existing = new Map(previous.map((ceiling) => [ceiling.id, ceiling]));
  return rooms.map((room) => {
    const id = `${room.id}:ceiling`;
    const old = existing.get(id);
    const level = levels.find((item) => item.id === room.levelId);
    return {
      id,
      levelId: room.levelId,
      roomId: room.id,
      boundary: room.boundary.map(copyPoint),
      elevation: (level?.elevation ?? 0) + room.ceilingHeight,
      thickness: old?.thickness ?? 12,
      material: old?.material ?? room.ceilingMaterial,
    };
  });
}

export function buildHouseSite(
  rooms: HouseProject["rooms"],
  previous: HouseProject["site"] = null,
): HouseProject["site"] {
  if (rooms.length === 0) return null;
  const points = rooms.flatMap((room) => room.boundary);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const margin = 2_500;
  const minX = Math.min(...xs) - margin;
  const maxX = Math.max(...xs) + margin;
  const minY = Math.min(...ys) - margin;
  const maxY = Math.max(...ys) + margin;
  return {
    id: "site-ground",
    levelId: rooms[0]!.levelId,
    boundary: [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }],
    elevation: previous?.elevation ?? -150,
    thickness: previous?.thickness ?? 150,
    material: previous?.material ?? "Paving",
  };
}

export function buildHouseVerandas(
  levels: HouseProject["levels"],
  walls: HouseProject["walls"],
  doors: HouseProject["doors"],
  previous: HouseProject["verandas"] = [],
): HouseProject["verandas"] {
  const ground = levels[0];
  if (!ground?.plan) return [];
  const planned = ground.plan.planPlatforms?.filter((item) => item.kind === "veranda") ?? [];
  if (planned.length > 0) {
    return planned.map((platform) => {
      const id = `${ground.id}:veranda:${platform.id}`;
      const old = previous.find((item) => item.id === id);
      const wall = platformWall(ground, walls, platform.wallId);
      return {
        id,
        levelId: ground.id,
        wallId: wall?.id ?? "",
        x: old?.x ?? platform.x,
        y: old?.y ?? platform.y,
        elevation: old?.elevation ?? ground.elevation,
        width: old?.width ?? platform.width,
        depth: old?.depth ?? platform.depth,
        thickness: old?.thickness ?? 120,
        rotation: old?.rotation ?? platform.rotation,
        canopyHeight: old?.canopyHeight ?? 2_700,
        canopyMaterial: old?.canopyMaterial ?? "Coated metal",
        postMaterial: old?.postMaterial ?? "Steel",
        material: old?.material ?? "Paving",
      };
    });
  }
  const door = doors.find((item) => item.levelId === ground.id && item.type !== "passage");
  const wall = door ? walls.find((item) => item.id === door.wallId) : null;
  if (!door || !wall) return [];
  const id = `${ground.id}:veranda:entry`;
  const old = previous.find((item) => item.id === id);
  const depth = old?.depth ?? 1_500;
  const placement = entrancePlacement(ground.plan, wall, door.offset, door.width, depth);
  const wallLength = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  const width = Math.min(wallLength, old?.width ?? Math.min(3_200, Math.max(2_000, door.width + 1_000)));
  return [{
    id,
    levelId: ground.id,
    wallId: wall.id,
    ...placement,
    elevation: ground.elevation,
    width,
    depth,
    thickness: old?.thickness ?? 120,
    canopyHeight: old?.canopyHeight ?? 2_700,
    canopyMaterial: old?.canopyMaterial ?? "Coated metal",
    postMaterial: old?.postMaterial ?? "Steel",
    material: old?.material ?? "Paving",
  }];
}

export function buildHouseBalconies(
  levels: HouseProject["levels"],
  walls: HouseProject["walls"],
  doors: HouseProject["doors"],
  previous: HouseProject["balconies"] = [],
): HouseProject["balconies"] {
  const ground = levels[0];
  const upper = levels[1];
  if (!ground?.plan) return [];
  const planned = ground.plan.planPlatforms?.filter((item) => item.kind === "balcony") ?? [];
  if (planned.length > 0) {
    const target = upper?.plan ? upper : ground;
    return planned.map((platform) => {
      const id = `${target.id}:balcony:${platform.id}`;
      const old = previous.find((item) => item.id === id);
      const wall = platformWall(target, walls, platform.wallId);
      return {
        id,
        levelId: target.id,
        wallId: wall?.id ?? "",
        x: old?.x ?? platform.x,
        y: old?.y ?? platform.y,
        elevation: old?.elevation ?? (upper ? target.elevation : target.elevation + (target.plan?.ceilingHeight ?? 2_700)),
        width: old?.width ?? platform.width,
        depth: old?.depth ?? platform.depth,
        thickness: old?.thickness ?? 150,
        rotation: old?.rotation ?? platform.rotation,
        railingHeight: old?.railingHeight ?? 1_050,
        railingMaterial: old?.railingMaterial ?? "Steel and glass",
        material: old?.material ?? "Reinforced concrete",
      };
    });
  }
  if (!upper?.plan) return [];
  const door = doors.find((item) => item.levelId === ground.id && item.type !== "passage");
  const groundWall = door ? walls.find((item) => item.id === door.wallId) : null;
  const wall = groundWall?.sourceWallId
    ? walls.find((item) => item.levelId === upper.id && item.sourceWallId === groundWall.sourceWallId)
    : null;
  if (!door || !wall) return [];
  const id = `${upper.id}:balcony:entry`;
  const old = previous.find((item) => item.id === id);
  const depth = old?.depth ?? 1_200;
  const placement = entrancePlacement(upper.plan, wall, door.offset, door.width, depth);
  const wallLength = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  const width = Math.min(wallLength, old?.width ?? Math.min(3_400, Math.max(2_200, door.width + 1_200)));
  return [{
    id,
    levelId: upper.id,
    wallId: wall.id,
    ...placement,
    elevation: upper.elevation,
    width,
    depth,
    thickness: old?.thickness ?? 150,
    railingHeight: old?.railingHeight ?? 1_050,
    railingMaterial: old?.railingMaterial ?? "Steel and glass",
    material: old?.material ?? "Reinforced concrete",
  }];
}

function entrancePlacement(
  plan: Room,
  wall: HouseProject["walls"][number],
  openingOffset: number,
  openingWidth: number,
  depth: number,
) {
  const source = roomWalls(plan).find((item) => item.id === wall.sourceWallId);
  const length = Math.max(1, Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y));
  const dx = (wall.end.x - wall.start.x) / length;
  const dy = (wall.end.y - wall.start.y) / length;
  const along = Math.min(length, Math.max(0, openingOffset + openingWidth / 2));
  const projection = wall.thickness / 2 + depth / 2;
  const inward = source?.inward ?? { x: -dy, y: dx };
  return {
    x: wall.start.x + dx * along - inward.x * projection,
    y: wall.start.y + dy * along - inward.y * projection,
    rotation: Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180 / Math.PI,
  };
}

function defaultObjectTypes(floorHeight: number): HouseProject["objectTypes"] {
  return [
    { id: "wall-exterior-200", kind: "wall", name: "200 mm Exterior Block", properties: { thickness: 200, height: floorHeight, material: "Masonry", loadBearing: true } },
    { id: "wall-interior-120", kind: "wall", name: "120 mm Interior Block", properties: { thickness: 120, height: floorHeight, material: "Masonry", loadBearing: false } },
    { id: "door-single-900x2100", kind: "door", name: "Single 900 × 2100", properties: { width: 900, height: 2100, material: "Timber", panelCount: 1 } },
    { id: "window-sliding-1200x1500", kind: "window", name: "Aluminium Sliding 1200 × 1500", properties: { width: 1200, height: 1500, material: "Aluminium", panelCount: 2 } },
    { id: "column-300x300", kind: "column", name: "RC Column 300 × 300", properties: { width: 300, depth: 300, material: "Reinforced concrete", structural: true } },
    { id: "beam-250x450", kind: "beam", name: "RC Beam 250 × 450", properties: { width: 250, depth: 450, material: "Reinforced concrete", structural: true } },
    { id: "slab-150", kind: "slab", name: "RC Slab 150", properties: { thickness: 150, material: "Reinforced concrete" } },
    { id: "roof-flat-180", kind: "roof", name: "Flat RC Roof 180", properties: { thickness: 180, slope: 0, material: "Reinforced concrete" } },
  ];
}

function buildObjectInstances(input: {
  walls: HouseProject["walls"];
  doors: HouseProject["doors"];
  windows: HouseProject["windows"];
  stairs: HouseProject["stairs"];
  structuralColumns: HouseProject["structuralColumns"];
  structuralBeams: HouseProject["structuralBeams"];
  slabs: HouseProject["slabs"];
  roofs: HouseProject["roofs"];
  rooms: HouseProject["rooms"];
}): HouseProject["objectInstances"] {
  const result: HouseProject["objectInstances"] = {};
  const add = (id: string, typeId: string | null, mark: string) => {
    result[id] = { typeId, mark, pinned: false, groupId: null, flipped: false, properties: {} };
  };
  input.walls.forEach((item, index) => add(item.id, item.sourceWallId?.startsWith("interior") ? "wall-interior-120" : "wall-exterior-200", `W-${index + 1}`));
  input.doors.forEach((item, index) => add(item.id, "door-single-900x2100", `D-${index + 1}`));
  input.windows.forEach((item, index) => add(item.id, "window-sliding-1200x1500", `WN-${index + 1}`));
  input.stairs.forEach((item, index) => add(item.id, null, `ST-${index + 1}`));
  input.structuralColumns.forEach((item, index) => add(item.id, "column-300x300", `C-${index + 1}`));
  input.structuralBeams.forEach((item, index) => add(item.id, "beam-250x450", `B-${index + 1}`));
  input.slabs.forEach((item, index) => add(item.id, "slab-150", `S-${index + 1}`));
  input.roofs.forEach((item, index) => add(item.id, "roof-flat-180", `RF-${index + 1}`));
  input.rooms.forEach((item, index) => add(item.id, null, `RM-${index + 1}`));
  return result;
}

function defaultHouseViews(levels: HouseProject["levels"]): HouseProject["views"] {
  return [
    ...levels.map((level) => ({ id: `view:plan:${level.id}`, name: level.name, kind: "floor-plan" as const, levelId: level.id, hiddenCategories: [], temporaryHiddenIds: [], isolatedIds: [], cutPlane: 1200, topOffset: 2300, bottomOffset: 0 })),
    { id: "view:3d:default", name: "Default 3D", kind: "3d", levelId: null, hiddenCategories: [], temporaryHiddenIds: [], isolatedIds: [], cutPlane: 1200, topOffset: 2300, bottomOffset: 0 },
    ...(["Front", "Rear", "Left", "Right"] as const).map((name) => ({ id: `view:elevation:${name.toLowerCase()}`, name, kind: "elevation" as const, levelId: null, hiddenCategories: [], temporaryHiddenIds: [], isolatedIds: [], cutPlane: 1200, topOffset: 2300, bottomOffset: 0 })),
    { id: "schedule:doors", name: "Door Schedule", kind: "schedule", levelId: null, hiddenCategories: [], temporaryHiddenIds: [], isolatedIds: [], cutPlane: 1200, topOffset: 2300, bottomOffset: 0 },
    { id: "schedule:windows", name: "Window Schedule", kind: "schedule", levelId: null, hiddenCategories: [], temporaryHiddenIds: [], isolatedIds: [], cutPlane: 1200, topOffset: 2300, bottomOffset: 0 },
  ];
}

function clonePlan(room: Room, keepReference: boolean): Room {
  return {
    ...room,
    corners: room.corners.map((corner) => ({ ...corner })),
    openings: room.openings.map((opening) => ({ ...opening })),
    interiorWalls: room.interiorWalls?.map((wall) => ({ ...wall, start: { ...wall.start }, end: { ...wall.end } })),
    zones: room.zones?.map((zone) => ({ ...zone, boundary: zone.boundary.map(copyPoint) })),
    planColumns: room.planColumns?.map((column) => ({ ...column })),
    planStairs: room.planStairs?.map((stair) => ({ ...stair })),
    dimensions: room.dimensions?.map((dimension) => ({ ...dimension, start: { ...dimension.start }, end: { ...dimension.end } })),
    planPlatforms: room.planPlatforms?.map((platform) => ({ ...platform })),
    runWalls: [],
    reference: keepReference ? room.reference : undefined,
  };
}

export function housePlanWalls(room: Room) {
  return [
    ...roomWalls(room).map((wall) => ({ ...wall, thickness: room.wallThickness, height: room.ceilingHeight, exterior: true })),
    ...(room.interiorWalls ?? []).map((wall) => {
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const length = Math.max(0.5, Math.hypot(dx, dy));
      return { id: wall.id, label: wall.label, start: { ...wall.start }, end: { ...wall.end }, length, angle: Math.atan2(-dy, dx) * 180 / Math.PI, inward: { x: -dy / length, y: dx / length }, thickness: wall.thickness, height: wall.height, exterior: false };
    }),
  ];
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

function uniquePositions(values: number[]) {
  const positions: number[] = [];
  for (const value of [...values].sort((a, b) => a - b)) {
    if (!positions.some((position) => Math.abs(position - value) < 1)) positions.push(value);
  }
  return positions;
}

function platformWall(level: HouseProject["levels"][number], walls: HouseProject["walls"], sourceWallId?: string) {
  const exteriorIds = new Set(level.plan?.corners.map((corner) => corner.id) ?? []);
  return walls.find((wall) => wall.levelId === level.id && wall.sourceWallId === sourceWallId)
    ?? walls.find((wall) => wall.levelId === level.id && !!wall.sourceWallId && exteriorIds.has(wall.sourceWallId));
}
