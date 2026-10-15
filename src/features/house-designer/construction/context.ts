import type { HouseProject, HouseRoom } from "../types/project";
import type { ApprovedBar } from "./helpers";
import { centroid, dist, pointInPolygon, polygonArea, polygonBounds, type P2, type V3 } from "./geometry";
import type {
  CategoryId, ComponentRecord, DimensionKey, Dimension, EstimatingRules, GeometrySource, LayerId, ModelOptions, Provenance, QuantityItem, StageId, StoreyInfo,
} from "./types";
import { NO_COST } from "./types";
import { PROVENANCE } from "./types";

/**
 * Example assumptions the model makes where the project says nothing. Each is
 * stated here, once, and every quantity that depends on one says so.
 */
export const ASSUME = {
  /** Natural ground, relative to the ground-floor structural level (negative is below it). */
  naturalGround: -450,
  topsoilStrip: 150,
  working: 300,
  blindingThickness: 75,
  groundBeamTop: -600,
  groundBeamDepth: 450,
  sandBlinding: 50,
  dpm: 3,
  subBase: 150,
  floorInsulation: 50,
  screed: 50,
  floorTile: 10,
  tileAdhesive: 5,
  wetWaterproofing: 3,
  plasterBase: 12,
  plasterMid: 8,
  plasterFinal: 5,
  skim: 2,
  primer: 1,
  paint: 1,
  externalPlasterExtra: 5,
  blockCourse: 200,
  blockLength: 400,
  ceilingBoard: 12.5,
  rebarCover: 40,
  mainBar: 16,
  stirrupBar: 8,
  slabBar: 10,
  slabSpacing: 200,
  stirrupSpacing: 150,
  roofScreedMin: 20,
  roofFall: 0.02,
  membrane: 4,
  roofInsulation: 50,
  parapetHeight: 600,
  parapetThickness: 150,
  copingProjection: 25,
  conduit: 20,
  pipeCold: 20,
  pipeHot: 20,
  pipeWaste: 50,
  pipeVent: 40,
  stackDiameter: 110,
  floorBuildUp: 65,
  doorFrame: 50,
  windowFrame: 50,
  pourZones: 2,
  formworkPly: 18,
  lintelDepth: 200,
  lintelBearing: 200,
} as const;

export type RoomKind = "kitchen" | "bath" | "wc" | "bed" | "living" | "dining" | "circulation" | "stair" | "store" | "laundry" | "office" | "other";

export function roomKindOf(name: string): RoomKind {
  const n = name.toLowerCase();
  if (/kitchen/.test(n)) return "kitchen";
  if (/shower|\bwc\b|toilet|lavatory/.test(n)) return "wc";
  if (/bath/.test(n)) return "bath";
  if (/bed/.test(n)) return "bed";
  if (/living|lounge|sitting|family/.test(n)) return "living";
  if (/dining/.test(n)) return "dining";
  if (/stair/.test(n)) return "stair";
  if (/laundry|utility/.test(n)) return "laundry";
  if (/store|linen|storage/.test(n)) return "store";
  if (/office|study|desk/.test(n)) return "office";
  if (/corridor|landing|hall|passage|lobby|entrance/.test(n)) return "circulation";
  return "other";
}

export type LevelInfo = StoreyInfo & {
  levelId: string;
  /** Top of the structural slab: the project's level elevation. */
  floorZ: number;
  /** Underside of the slab above (or of the roof): where walls and columns stop. */
  soffitZ: number;
  /** Where the suspended ceiling stands, below the beams. */
  ceilingZ: number;
  topZ: number;
};

export type OpeningFrame = {
  id: string;
  kind: "door" | "window" | "passage";
  wallId: string;
  s0: number;
  s1: number;
  z0: number;
  z1: number;
  width: number;
  height: number;
  sill: number;
  material: string;
  swing: string;
  /** Which of the pair this is, for the label. */
  ordinal: number;
};

export type WallFrame = {
  id: string;
  levelId: string;
  levelIndex: number;
  start: P2;
  end: P2;
  length: number;
  ux: number;
  uy: number;
  /** Left normal. */
  nx: number;
  ny: number;
  thickness: number;
  height: number;
  exterior: boolean;
  openings: OpeningFrame[];
  /** Rooms on the left and right of the wall, by name. */
  left: string | null;
  right: string | null;
};

export type RoomInfo = { id: string; levelId: string; name: string; kind: RoomKind; boundary: P2[]; area: number; centre: P2; bounds: ReturnType<typeof polygonBounds>; floorMaterial: string };

export type AddInput = {
  id: string;
  name: string;
  kind: string;
  category: CategoryId;
  subcategory?: string;
  stage: StageId;
  removedAfter?: StageId;
  level?: LevelInfo | null;
  /** Explicit storey index/name for things below ground or on the site. */
  storeyIndex?: number;
  room?: string | null;
  grid?: string | null;
  layer: LayerId;
  materialId: string;
  shapes: ComponentRecord["shapes"];
  repeated?: ComponentRecord["repeated"];
  dims?: ComponentRecord["dims"];
  source?: GeometrySource;
  sourceRef?: string | null;
  parentId?: string | null;
  connectedIds?: string[];
  explode?: { layerIndex?: number; dir?: V3 };
  variant?: ComponentRecord["variant"];
  pour?: number;
  label?: ComponentRecord["label"];
  note?: string;
};

export const UP: V3 = { x: 0, y: 0, z: 1 };

export const dim = (value: number | null, unit: Dimension["unit"], status: Provenance, note?: string): Dimension => ({ value, unit, status, ...(note ? { note } : {}) });

export class Ctx {
  readonly components: ComponentRecord[] = [];
  readonly ids = new Set<string>();
  readonly warnings: string[] = [];
  readonly levels: LevelInfo[];
  readonly rooms: RoomInfo[];
  readonly walls: WallFrame[];
  readonly outline: P2[];
  readonly bounds: ReturnType<typeof polygonBounds>;
  private seq = new Map<number, number>();

  constructor(readonly project: HouseProject, readonly options: ModelOptions, readonly rules: EstimatingRules, readonly approved: readonly ApprovedBar[] = []) {
    const groundSlab = project.slabs.find((slab) => slab.levelId === project.levels[0]?.id);
    void groundSlab;
    this.levels = project.levels.map((level, index) => {
      const slab = project.slabs.find((item) => item.levelId === level.id);
      const next = project.levels[index + 1];
      const roof = project.roofs.find((item) => item.levelId === level.id);
      const ceilingHeight = level.plan?.ceilingHeight ?? level.floorToFloorHeight;
      const soffit = next ? next.elevation - (project.slabs.find((item) => item.levelId === next.id)?.thickness ?? 150) : (roof ? roof.elevation : level.elevation + ceilingHeight);
      const beams = project.structuralBeams.filter((beam) => beam.levelId === level.id);
      const beamDrop = beams.length ? Math.max(...beams.map((beam) => beam.depth)) : 0;
      return {
        id: level.id, levelId: level.id, name: level.name, index, elevation: level.elevation, floorToFloor: level.floorToFloorHeight,
        slabThickness: slab?.thickness ?? 150, floorZ: level.elevation, soffitZ: soffit, ceilingZ: soffit - beamDrop, topZ: level.elevation + level.floorToFloorHeight,
      };
    });
    const ground = project.levels[0];
    this.outline = (ground?.plan?.corners ?? []).map((corner) => ({ x: corner.x, y: corner.y }));
    this.bounds = this.outline.length ? polygonBounds(this.outline) : { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    this.rooms = project.rooms.map((room: HouseRoom) => ({
      id: room.id, levelId: room.levelId, name: room.name, kind: roomKindOf(room.name), boundary: room.boundary.map((p) => ({ x: p.x, y: p.y })),
      area: polygonArea(room.boundary), centre: centroid(room.boundary), bounds: polygonBounds(room.boundary), floorMaterial: room.floorMaterial,
    }));
    this.walls = this.buildWalls();
  }

  level(levelId: string | null | undefined): LevelInfo | null {
    return this.levels.find((level) => level.levelId === levelId) ?? null;
  }

  get ground(): LevelInfo | null {
    return this.levels[0] ?? null;
  }

  get top(): LevelInfo | null {
    return this.levels[this.levels.length - 1] ?? null;
  }

  roomsOf(levelId: string): RoomInfo[] {
    return this.rooms.filter((room) => room.levelId === levelId);
  }

  roomAt(levelId: string, point: P2): RoomInfo | null {
    return this.roomsOf(levelId).find((room) => pointInPolygon(point, room.boundary)) ?? null;
  }

  /** Grid reference such as "3/B" for the nearest grid intersection, or null when none is near. */
  gridRef(levelId: string, x: number, y: number, tolerance = 200): string | null {
    const lines = this.project.structuralGrid.filter((line) => line.levelId === levelId);
    const xs = lines.filter((line) => line.axis === "x" && Math.abs(line.position - x) <= tolerance);
    const ys = lines.filter((line) => line.axis === "y" && Math.abs(line.position - y) <= tolerance);
    if (xs[0] && ys[0]) return `${xs[0].label}/${ys[0].label}`;
    return null;
  }

  /** The grid line label a coordinate lies on, or a span such as "1–2". */
  gridSpanX(levelId: string, x: number): string | null {
    const labels = this.project.structuralGrid.filter((line) => line.levelId === levelId && line.axis === "x").sort((a, b) => a.position - b.position);
    const hit = labels.find((line) => Math.abs(line.position - x) < 200);
    if (hit) return hit.label;
    for (let i = 0; i + 1 < labels.length; i += 1) if (x > labels[i]!.position && x < labels[i + 1]!.position) return `${labels[i]!.label}–${labels[i + 1]!.label}`;
    return null;
  }

  gridSpanY(levelId: string, y: number): string | null {
    const labels = this.project.structuralGrid.filter((line) => line.levelId === levelId && line.axis === "y").sort((a, b) => a.position - b.position);
    const hit = labels.find((line) => Math.abs(line.position - y) < 200);
    if (hit) return hit.label;
    for (let i = 0; i + 1 < labels.length; i += 1) if (y > labels[i]!.position && y < labels[i + 1]!.position) return `${labels[i]!.label}–${labels[i + 1]!.label}`;
    return null;
  }

  private buildWalls(): WallFrame[] {
    const cornerIds = new Set<string>();
    const result: WallFrame[] = [];
    for (const level of this.project.levels) for (const c of level.plan?.corners ?? []) cornerIds.add(c.id);
    for (const wall of this.project.walls) {
      const levelIndex = this.project.levels.findIndex((level) => level.id === wall.levelId);
      const length = dist(wall.start, wall.end);
      if (length < 1) continue;
      const ux = (wall.end.x - wall.start.x) / length;
      const uy = (wall.end.y - wall.start.y) / length;
      const exterior = onOutline(wall.start, wall.end, this.project.levels[levelIndex]?.plan?.corners ?? []);
      const openings: OpeningFrame[] = [...this.project.doors, ...this.project.windows]
        .filter((opening) => opening.wallId === wall.id)
        .map((opening, ordinal) => ({
          id: opening.id, kind: (opening.type === "window" ? "window" : opening.type === "passage" ? "passage" : "door") as OpeningFrame["kind"], wallId: wall.id,
          s0: opening.offset, s1: opening.offset + opening.width, z0: opening.sillHeight, z1: opening.sillHeight + opening.height, width: opening.width, height: opening.height, sill: opening.sillHeight,
          material: opening.material, swing: opening.swing, ordinal,
        }))
        .sort((a, b) => a.s0 - b.s0);
      const frame: WallFrame = {
        id: wall.id, levelId: wall.levelId, levelIndex, start: { ...wall.start }, end: { ...wall.end }, length, ux, uy, nx: -uy, ny: ux,
        thickness: wall.thickness, height: wall.height, exterior, openings, left: null, right: null,
      };
      const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
      const probe = wall.thickness / 2 + 40;
      frame.left = this.roomAt(wall.levelId, { x: mid.x + frame.nx * probe, y: mid.y + frame.ny * probe })?.name ?? null;
      frame.right = this.roomAt(wall.levelId, { x: mid.x - frame.nx * probe, y: mid.y - frame.ny * probe })?.name ?? null;
      result.push(frame);
    }
    return result;
  }

  wallsOf(levelId: string): WallFrame[] {
    return this.walls.filter((wall) => wall.levelId === levelId);
  }

  next(stage: number): number {
    const n = (this.seq.get(stage) ?? 0) + 1;
    this.seq.set(stage, n);
    return n;
  }

  add(input: AddInput): ComponentRecord {
    if (this.ids.has(input.id)) throw new Error(`Duplicate component id: ${input.id}`);
    this.ids.add(input.id);
    const level = input.level ?? null;
    const record: ComponentRecord = {
      id: input.id, name: input.name, kind: input.kind, category: input.category, subcategory: input.subcategory ?? "",
      stage: input.stage, ...(input.removedAfter ? { removedAfter: input.removedAfter } : {}),
      storeyId: level?.levelId ?? null, storeyName: level?.name ?? null, storeyIndex: level?.index ?? input.storeyIndex ?? -1,
      room: input.room ?? null, grid: input.grid ?? null, layer: input.layer, materialId: input.materialId, shapes: input.shapes,
      ...(input.repeated ? { repeated: input.repeated } : {}),
      dims: input.dims ?? {}, geometrySource: input.source ?? "schematic", sourceRef: input.sourceRef ?? null,
      parentId: input.parentId ?? null, connectedIds: input.connectedIds ?? [], sequence: this.next(input.stage),
      explode: { layerIndex: input.explode?.layerIndex ?? 0, dir: input.explode?.dir ?? UP },
      ...(input.variant ? { variant: input.variant } : {}), ...(input.pour ? { pour: input.pour } : {}), ...(input.label ? { label: input.label } : {}),
      ...(input.note ? { note: input.note } : {}), quantities: [],
    };
    this.components.push(record);
    return record;
  }

  /** Attach a quantity to a component, with everything the BOQ needs to trace it. */
  quantity(component: ComponentRecord, q: Omit<QuantityItem, "id" | "componentId" | "cost" | "storeyId" | "room" | "allowance" | "assumptions" | "exclusions" | "sourceGeometry" | "materialSpec"> & Partial<Pick<QuantityItem, "allowance" | "assumptions" | "exclusions" | "sourceGeometry" | "materialSpec">>): QuantityItem {
    const item: QuantityItem = {
      id: `${component.id}#${component.quantities.length + 1}`, componentId: component.id, cost: { ...NO_COST }, storeyId: component.storeyId, room: component.room,
      allowance: q.allowance ?? null, assumptions: q.assumptions ?? [], exclusions: q.exclusions ?? [],
      sourceGeometry: q.sourceGeometry ?? (component.sourceRef ? `project:${component.sourceRef}` : "schematic"), materialSpec: q.materialSpec ?? component.materialId,
      workItem: q.workItem, description: q.description, section: q.section, unit: q.unit, value: q.value, formula: q.formula, inputs: q.inputs, status: q.status,
    };
    component.quantities.push(item);
    return item;
  }

  dimsOf(component: ComponentRecord, entries: Partial<Record<DimensionKey, Dimension>>) {
    component.dims = { ...component.dims, ...entries };
  }
}

/** Both ends of a segment lie on one edge of the outline. */
function onOutline(a: P2, b: P2, outline: { x: number; y: number }[]): boolean {
  const near = (p: P2, c: P2, d: P2) => {
    const dx = d.x - c.x;
    const dy = d.y - c.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return false;
    const t = Math.max(0, Math.min(1, ((p.x - c.x) * dx + (p.y - c.y) * dy) / len2));
    return Math.hypot(p.x - (c.x + t * dx), p.y - (c.y + t * dy)) < 5;
  };
  for (let i = 0; i < outline.length; i += 1) {
    const c = outline[i]!;
    const d = outline[(i + 1) % outline.length]!;
    if (near(a, c, d) && near(b, c, d)) return true;
  }
  return false;
}

export const isProvenance = (value: string): value is Provenance => (PROVENANCE as readonly string[]).includes(value);

/** Plan point at distance `s` along a wall, offset sideways by `n` (positive to the left). */
export function onWall(wall: Pick<WallFrame, "start" | "ux" | "uy" | "nx" | "ny">, s: number, n = 0): P2 {
  return { x: wall.start.x + wall.ux * s + wall.nx * n, y: wall.start.y + wall.uy * s + wall.ny * n };
}
