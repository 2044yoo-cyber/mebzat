import { rectangularRoom, type Room } from "@/features/berchuma-studio/types/room";

import { rebuildLevel } from "../services/project-edit";
import { ensureHouseBimState } from "../services/model-state";
import { stairFields, stairGeometry, stairParams, stairPreset } from "../services/stair-geometry";
import {
  buildStructuralGrid,
  createHouseProject,
  houseProjectSchema,
  openingObjectId,
  wallObjectId,
  type HouseProject,
} from "../types/project";

/**
 * The Medosha Three-Storey Learning House.
 *
 * An ordinary `HouseProject`, built through the same functions the editor
 * uses, from a handful of dimensions. It is generated on demand in memory and
 * never stored with the person's own projects, so opening it can neither
 * overwrite nor add to anything of theirs.
 *
 * Every dimension below is an illustrative example chosen to make the
 * construction readable. None is a structural design.
 */

export type LearningHouseParams = {
  title: string;
  /** Column grid, mm: five lines across, three deep. */
  gridX: number[];
  gridY: number[];
  storeys: number;
  floorToFloor: number;
  slabThickness: number;
  groundSlabThickness: number;
  externalWall: number;
  internalWall: number;
  columnSize: number;
  beamWidth: number;
  beamDepth: number;
  /** Pad footing size and thickness, and how far below the ground-floor level its underside is. */
  footingSize: number;
  footingThickness: number;
  footingDepth: number;
  doorWidth: number;
  doorHeight: number;
  windowWidth: number;
  windowHeight: number;
  windowSill: number;
  stairFlightWidth: number;
};

export const LEARNING_HOUSE_TITLE = "Medosha Three-Storey Learning House";
export const LEARNING_HOUSE_ID = "medosha-learning-house";

export const DEFAULT_LEARNING_PARAMS: LearningHouseParams = {
  title: LEARNING_HOUSE_TITLE,
  gridX: [0, 4000, 8000, 10400, 12000],
  gridY: [0, 4500, 9000],
  storeys: 3,
  floorToFloor: 3200,
  slabThickness: 200,
  groundSlabThickness: 150,
  externalWall: 200,
  internalWall: 150,
  columnSize: 300,
  beamWidth: 250,
  beamDepth: 450,
  footingSize: 1600,
  footingThickness: 450,
  footingDepth: 1500,
  doorWidth: 900,
  doorHeight: 2100,
  windowWidth: 1500,
  windowHeight: 1200,
  windowSill: 900,
  stairFlightWidth: 1000,
};

export type ParamIssue = { field: keyof LearningHouseParams | "gridX" | "gridY"; message: string };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Parameters made sane, with a note for anything that had to move. The house
 * cannot be generated from nonsense (a negative slab, a grid line out of
 * order), and the editor must say so rather than silently produce a broken
 * model.
 */
export function normalizeParams(input: Partial<LearningHouseParams>): { params: LearningHouseParams; issues: ParamIssue[] } {
  const issues: ParamIssue[] = [];
  const base = { ...DEFAULT_LEARNING_PARAMS, ...input };
  const num = (field: keyof LearningHouseParams, min: number, max: number) => {
    const raw = Number(base[field]);
    const value = Number.isFinite(raw) ? clamp(raw, min, max) : (DEFAULT_LEARNING_PARAMS[field] as number);
    if (value !== raw) issues.push({ field, message: `${String(field)} was ${Number.isFinite(raw) ? raw : "not a number"}; using ${value} (allowed ${min}–${max} mm).` });
    return value;
  };
  const grid = (field: "gridX" | "gridY", count: number, fallback: number[]) => {
    const raw = base[field];
    const ok = Array.isArray(raw) && raw.length === count && raw.every((v, i) => Number.isFinite(v) && (i === 0 || v - raw[i - 1]! >= 1500));
    if (!ok) issues.push({ field, message: `${field} needs ${count} increasing lines at least 1.5 m apart; using the example grid.` });
    return ok ? (raw as number[]) : fallback;
  };
  const params: LearningHouseParams = {
    title: String(base.title || LEARNING_HOUSE_TITLE).slice(0, 80),
    gridX: grid("gridX", 5, DEFAULT_LEARNING_PARAMS.gridX),
    gridY: grid("gridY", 3, DEFAULT_LEARNING_PARAMS.gridY),
    storeys: Math.round(num("storeys", 1, 4)),
    floorToFloor: num("floorToFloor", 2600, 4500),
    slabThickness: num("slabThickness", 120, 350),
    groundSlabThickness: num("groundSlabThickness", 100, 300),
    externalWall: num("externalWall", 100, 400),
    internalWall: num("internalWall", 75, 300),
    columnSize: num("columnSize", 200, 600),
    beamWidth: num("beamWidth", 150, 500),
    beamDepth: num("beamDepth", 250, 800),
    footingSize: num("footingSize", 900, 3000),
    footingThickness: num("footingThickness", 250, 900),
    footingDepth: num("footingDepth", 700, 3000),
    doorWidth: num("doorWidth", 700, 1200),
    doorHeight: num("doorHeight", 1900, 2400),
    windowWidth: num("windowWidth", 600, 2400),
    windowHeight: num("windowHeight", 600, 1800),
    windowSill: num("windowSill", 300, 1400),
    stairFlightWidth: num("stairFlightWidth", 800, 1400),
  };
  // The beam hangs below the slab, so it cannot be deeper than the room it leaves.
  const clear = params.floorToFloor - params.slabThickness;
  if (params.beamDepth > clear - params.doorHeight - 100) {
    const fixed = Math.max(250, clear - params.doorHeight - 100);
    issues.push({ field: "beamDepth", message: `beamDepth ${params.beamDepth} would hang below the doors; using ${fixed}.` });
    params.beamDepth = fixed;
  }
  const lowSill = params.windowSill + params.windowHeight;
  if (lowSill > clear - 150) {
    const sill = Math.max(300, clear - 150 - params.windowHeight);
    issues.push({ field: "windowSill", message: `The window would reach the ceiling; sill lowered to ${sill}.` });
    params.windowSill = sill;
  }
  return { params, issues };
}

// ---------------------------------------------------------------------------
// The plan: rooms as rectangles on the structural grid
// ---------------------------------------------------------------------------

type Zone = { id: string; name: string; x0: number; y0: number; x1: number; y1: number; floor: string };
type DoorSpec = { a: string; b: string; at: number; width?: number; kind?: "door" | "passage"; swing?: "in-left" | "in-right" | "out-left" | "out-right" };
type WindowSpec = { zone: string; side: "S" | "E" | "N" | "W"; at: number; width?: number; height?: number; sill?: number };

type PlanSpec = { zones: Zone[]; open: [string, string][]; doors: DoorSpec[]; windows: WindowSpec[] };

const sameEdge = (a: number, b: number) => Math.abs(a - b) < 1;

function planSpec(kind: "ground" | "first" | "second", p: LearningHouseParams): PlanSpec {
  const [x0, x1, x2, x3, x4] = p.gridX as [number, number, number, number, number];
  const [y0, y1, y2] = p.gridY as [number, number, number];
  const bath = Math.min(2400, (x2 - x1) * 0.6);
  const xb = x1 + bath;
  const yb = y1 + Math.min(2400, (y2 - y1) * 0.55);
  const tile = "Ceramic tile";
  const ground = kind === "ground";
  const names = ground
    ? { a: "Living room", b: "Dining", c: "Kitchen", d: "Guest bedroom", e: "Bathroom", f: "WC", g: "Corridor", h: "Stair hall", i: "Utility store" }
    : kind === "first"
      ? { a: "Master bedroom", b: "Bedroom 2", c: "Bedroom 3", d: "Family lounge", e: "Bathroom", f: "Shower room", g: "Landing", h: "Stair hall", i: "Laundry" }
      : { a: "Bedroom 4", b: "Bedroom 5", c: "Home office", d: "Sitting area", e: "Bathroom", f: "Shower room", g: "Landing", h: "Stair hall", i: "Linen store" };
  const wood = "Porcelain tile";
  const zones: Zone[] = [
    { id: "a", name: names.a, x0, y0, x1, y1, floor: wood },
    { id: "b", name: names.b, x0: x1, y0, x1: x2, y1, floor: wood },
    { id: "c", name: names.c, x0: x2, y0, x1: x4, y1, floor: tile },
    { id: "d", name: names.d, x0, y0: y1, x1, y1: y2, floor: wood },
    { id: "e", name: names.e, x0: x1, y0: y1, x1: xb, y1: yb, floor: tile },
    { id: "f", name: names.f, x0: x1, y0: yb, x1: xb, y1: y2, floor: tile },
    { id: "g", name: names.g, x0: xb, y0: y1, x1: x2, y1: y2, floor: wood },
    { id: "h", name: names.h, x0: x2, y0: y1, x1: x3, y1: y2, floor: tile },
    { id: "i", name: names.i, x0: x3, y0: y1, x1: x4, y1: y2, floor: tile },
  ];
  const doors: DoorSpec[] = ground
    ? [
        { a: "a", b: "S", at: 0.5, width: 1000 },
        { a: "a", b: "d", at: 0.5 },
        { a: "b", b: "g", at: 0.8 },
        { a: "b", b: "c", at: 0.5, width: 1500, kind: "passage" },
        { a: "g", b: "e", at: 0.5 },
        { a: "g", b: "f", at: 0.5 },
        { a: "g", b: "h", at: 0.45, width: 1000, kind: "passage" },
        { a: "c", b: "h", at: 0.5 },
        { a: "c", b: "i", at: 0.5 },
        { a: "h", b: "i", at: 0.5 },
      ]
    : [
        { a: "a", b: "d", at: 0.5 },
        { a: "b", b: "g", at: 0.8 },
        { a: "c", b: "h", at: 0.5 },
        { a: "g", b: "e", at: 0.5 },
        { a: "g", b: "f", at: 0.5 },
        { a: "g", b: "h", at: 0.45, width: 1000, kind: "passage" },
        { a: "d", b: "e", at: 0.5 },
        { a: "h", b: "i", at: 0.5 },
      ];
  const small = { width: 600, height: 600, sill: 1500 };
  const windows: WindowSpec[] = [
    { zone: "a", side: "S", at: (x0 + x1) / 2 }, { zone: "a", side: "W", at: (y0 + y1) / 2 },
    { zone: "b", side: "S", at: (x1 + x2) / 2 }, { zone: "c", side: "S", at: (x2 + x4) / 2 }, { zone: "c", side: "E", at: (y0 + y1) / 2 },
    { zone: "d", side: "W", at: (y1 + y2) / 2 }, { zone: "d", side: "N", at: (x0 + x1) / 2 },
    { zone: "f", side: "N", at: (x1 + xb) / 2, ...small },
    { zone: "h", side: "N", at: (x2 + x3) / 2, width: 800, height: 1500, sill: 600 },
    { zone: "i", side: "N", at: (x3 + x4) / 2, ...small }, { zone: "i", side: "E", at: (y1 + y2) / 2, ...small },
  ];
  // The bathroom is interior and has no window; the shower room or WC on the north wall carries one.
  return { zones, open: ground ? [["a", "b"]] : [], doors, windows };
}

type SharedEdge = { a: string; b: string; start: { x: number; y: number }; end: { x: number; y: number }; vertical: boolean };

function sharedEdges(zones: Zone[]): SharedEdge[] {
  const edges: SharedEdge[] = [];
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      const A = zones[i]!;
      const B = zones[j]!;
      if (sameEdge(A.x1, B.x0) || sameEdge(B.x1, A.x0)) {
        const x = sameEdge(A.x1, B.x0) ? A.x1 : A.x0;
        const lo = Math.max(A.y0, B.y0);
        const hi = Math.min(A.y1, B.y1);
        if (hi - lo > 1) edges.push({ a: A.id, b: B.id, start: { x, y: lo }, end: { x, y: hi }, vertical: true });
      }
      if (sameEdge(A.y1, B.y0) || sameEdge(B.y1, A.y0)) {
        const y = sameEdge(A.y1, B.y0) ? A.y1 : A.y0;
        const lo = Math.max(A.x0, B.x0);
        const hi = Math.min(A.x1, B.x1);
        if (hi - lo > 1) edges.push({ a: A.id, b: B.id, start: { x: lo, y }, end: { x: hi, y }, vertical: false });
      }
    }
  }
  return edges;
}

/** Offset along an exterior wall (from its start) for an absolute coordinate along that side. */
function exteriorOffset(side: "S" | "E" | "N" | "W", along: number, width: number, W: number, D: number): { wallId: string; offset: number } {
  switch (side) {
    case "S": return { wallId: "c1", offset: along - width / 2 };
    case "E": return { wallId: "c2", offset: along - width / 2 };
    case "N": return { wallId: "c3", offset: W - along - width / 2 };
    case "W": return { wallId: "c4", offset: D - along - width / 2 };
  }
}

function buildPlan(kind: "ground" | "first" | "second", p: LearningHouseParams): Room {
  const spec = planSpec(kind, p);
  const x0 = p.gridX[0]!;
  const x4 = p.gridX[4]!;
  const y0 = p.gridY[0]!;
  const y2 = p.gridY[2]!;
  const W = x4 - x0;
  const D = y2 - y0;
  const ceilingHeight = p.floorToFloor - p.slabThickness;
  const room = rectangularRoom(W, D);
  room.corners = [{ id: "c1", x: x0, y: y0 }, { id: "c2", x: x4, y: y0 }, { id: "c3", x: x4, y: y2 }, { id: "c4", x: x0, y: y2 }];
  room.wallThickness = p.externalWall;
  room.ceilingHeight = ceilingHeight;
  const edges = sharedEdges(spec.zones).filter((edge) => !spec.open.some(([a, b]) => (a === edge.a && b === edge.b) || (a === edge.b && b === edge.a)));
  const wallIdOf = (edge: SharedEdge) => `w-${edge.a}${edge.b}-${Math.round(edge.start.x)}-${Math.round(edge.start.y)}`;
  room.interiorWalls = edges.map((edge) => ({ id: wallIdOf(edge), start: edge.start, end: edge.end, thickness: p.internalWall, height: ceilingHeight, label: "Interior wall" }));
  room.zones = spec.zones.map((z) => ({
    id: z.id, name: z.name, boundary: [{ x: z.x0, y: z.y0 }, { x: z.x1, y: z.y0 }, { x: z.x1, y: z.y1 }, { x: z.x0, y: z.y1 }],
    floorMaterial: z.floor, wallMaterial: "Paint", ceilingMaterial: "Gypsum board", enclosed: true,
  }));
  const openings: Room["openings"] = [];
  let n = 0;
  for (const door of spec.doors) {
    const width = door.width ?? p.doorWidth;
    const kindName = door.kind ?? "door";
    if (door.b === "S") {
      const zone = spec.zones.find((z) => z.id === door.a)!;
      const at = zone.x0 + (zone.x1 - zone.x0) * door.at;
      const { wallId, offset } = exteriorOffset("S", at, width, W, D);
      openings.push({ id: `door-${n += 1}`, kind: kindName, wallId, offset: Math.max(0, offset), width, height: p.doorHeight, sill: 0, swing: door.swing ?? "in-right", label: "Entrance door" });
      continue;
    }
    const edge = edges.find((e) => (e.a === door.a && e.b === door.b) || (e.a === door.b && e.b === door.a));
    if (!edge) continue; // an open pair has no wall to cut
    const length = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);
    const offset = Math.min(Math.max(0, length * door.at - width / 2), Math.max(0, length - width));
    openings.push({ id: `door-${n += 1}`, kind: kindName, wallId: wallIdOf(edge), offset, width, height: kindName === "passage" ? p.doorHeight : p.doorHeight, sill: 0, swing: door.swing ?? "in-right", label: kindName === "passage" ? "Passage" : "Door" });
  }
  for (const win of spec.windows) {
    const width = win.width ?? p.windowWidth;
    const { wallId, offset } = exteriorOffset(win.side, win.at, width, W, D);
    openings.push({ id: `window-${n += 1}`, kind: "window", wallId, offset: Math.max(0, offset), width, height: win.height ?? p.windowHeight, sill: win.sill ?? p.windowSill, swing: "none", label: "Window" });
  }
  room.openings = openings;
  room.planColumns = p.gridX.flatMap((x, i) => p.gridY.map((y, j) => ({ id: `g${i + 1}${String.fromCharCode(65 + j)}`, x, y, width: p.columnSize, depth: p.columnSize, label: `Column ${i + 1}/${String.fromCharCode(65 + j)}` })));
  return room;
}

// ---------------------------------------------------------------------------
// The project
// ---------------------------------------------------------------------------

/** Where the dog-legged stair stands, and its geometry. */
export function stairLayout(p: LearningHouseParams) {
  const params = stairPreset("dog-legged", p.floorToFloor, p.stairFlightWidth, 280);
  const fields = stairFields(params);
  const geometry = stairGeometry(params);
  const hall = { x0: p.gridX[2]!, x1: p.gridX[3]!, y0: p.gridY[1]!, y1: p.gridY[2]! };
  // Clear of the grid columns at the hall's corners (200 mm from the west grid line), and 20 mm off the north wall's face.
  const x = hall.x0 + 200 + fields.width / 2;
  const y = hall.y1 - 120 - fields.length / 2;
  return { params, fields, geometry, hall, x, y };
}

/** The slab opening a stair needs: its footprint plus a little working room, as a plan rectangle. */
export function stairOpening(p: LearningHouseParams): { x0: number; y0: number; x1: number; y1: number } {
  const { fields, x, y } = stairLayout(p);
  const ease = 25;
  return { x0: x - fields.width / 2 - ease, x1: x + fields.width / 2 + ease, y0: y - fields.length / 2 - ease, y1: y + fields.length / 2 + ease };
}

export function buildLearningHouseProject(input: Partial<LearningHouseParams> = {}): { project: HouseProject; params: LearningHouseParams; issues: ParamIssue[] } {
  const { params: p, issues } = normalizeParams(input);
  const kinds: ("ground" | "first" | "second")[] = ["ground", "first", "second"];
  // Ground floor, then typical upper floors, with a different top floor when there are three or more.
  const planOf = (index: number) => buildPlan(index === 0 ? kinds[0]! : index === p.storeys - 1 && p.storeys >= 3 ? kinds[2]! : kinds[1]!, p);
  let project = createHouseProject({
    id: LEARNING_HOUSE_ID,
    createdAt: "2026-01-01T00:00:00.000Z",
    title: p.title,
    room: planOf(0),
    style: "modern",
    strict: false,
    floorCount: p.storeys,
    floorToFloorHeight: p.floorToFloor,
  });
  for (let index = 1; index < project.levels.length; index += 1) project = rebuildLevel(project, project.levels[index]!.id, planOf(index));

  const levels = project.levels;
  const ground = levels[0]!;
  const top = levels[levels.length - 1]!;
  const outline = ground.plan!.corners.map((c) => ({ x: c.x, y: c.y }));
  const ceilingHeight = p.floorToFloor - p.slabThickness;

  // Slabs: the one under each floor, each its own thickness.
  const slabs = levels.map((level, index) => ({
    id: `${level.id}:slab`, levelId: level.id, boundary: outline.map((point) => ({ ...point })),
    thickness: index === 0 ? p.groundSlabThickness : p.slabThickness, elevation: level.elevation, material: "Reinforced concrete",
  }));
  // Roof: a flat concrete roof slab over the top storey, with a parapet and no overhang.
  const roofs = [{
    id: "main-roof", levelId: top.id, boundary: outline.map((point) => ({ ...point })), elevation: top.elevation + ceilingHeight,
    type: "flat" as const, height: 300, slope: 0, overhang: 0, thickness: p.slabThickness, material: "Reinforced concrete",
  }];

  // Stairs: one dog-legged flight pair between each pair of floors.
  const layout = stairLayout(p);
  const stairs = levels.slice(0, -1).map((level) => ({
    id: `${level.id}:stair`, levelId: level.id, x: layout.x, y: layout.y, elevation: level.elevation, width: layout.fields.width, length: layout.fields.length,
    height: p.floorToFloor, rotation: 0, steps: layout.fields.steps, type: layout.fields.type, material: "Reinforced concrete",
    stairWidth: layout.fields.stairWidth, treadDepth: layout.fields.treadDepth, landing: layout.fields.landing, gap: layout.fields.gap, reversed: layout.fields.reversed,
  }));

  // Columns on the grid, beams along every grid line between them, pads under the ground-floor columns.
  const columns = project.structuralColumns.map((column) => ({ ...column, width: p.columnSize, depth: p.columnSize, height: ceilingHeight }));
  const beams: HouseProject["structuralBeams"] = [];
  for (const level of levels) {
    const levelColumns = columns.filter((column) => column.levelId === level.id);
    const find = (i: number, j: number) => levelColumns.find((column) => column.sourceCornerId === `g${i + 1}${String.fromCharCode(65 + j)}`)!;
    const elevation = level.elevation + ceilingHeight - p.beamDepth;
    for (let j = 0; j < p.gridY.length; j += 1) for (let i = 0; i + 1 < p.gridX.length; i += 1) {
      const a = find(i, j);
      const b = find(i + 1, j);
      beams.push({ id: `${level.id}:beam:x-${String.fromCharCode(65 + j)}${i + 1}-${i + 2}`, levelId: level.id, start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y }, elevation, width: p.beamWidth, depth: p.beamDepth, material: "Reinforced concrete" });
    }
    for (let i = 0; i < p.gridX.length; i += 1) for (let j = 0; j + 1 < p.gridY.length; j += 1) {
      const a = find(i, j);
      const b = find(i, j + 1);
      beams.push({ id: `${level.id}:beam:y-${i + 1}${String.fromCharCode(65 + j)}-${String.fromCharCode(66 + j)}`, levelId: level.id, start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y }, elevation, width: p.beamWidth, depth: p.beamDepth, material: "Reinforced concrete" });
    }
  }
  const foundations = columns.filter((column) => column.levelId === ground.id).map((column) => ({
    id: `foundation:${column.id}`, levelId: ground.id, x: column.x, y: column.y, elevation: -p.footingDepth,
    width: p.footingSize, depth: p.footingSize, thickness: p.footingThickness, material: "Reinforced concrete",
  }));

  project = {
    ...project,
    metadata: { ...project.metadata, title: p.title },
    slabs, roofs, stairs,
    structuralColumns: columns,
    structuralBeams: beams,
    structuralGrid: buildStructuralGrid(levels, columns),
    foundations,
    modelingOptions: { mode: "house", structure: true, foundations: true, roof: true, stairs: true, site: true, floors: true, ceilings: true },
    revisions: [{ id: "learning-house", createdAt: "2026-01-01T00:00:00.000Z", note: "Generated illustrative learning house" }],
  };
  project = ensureHouseBimState(project);
  return { project: houseProjectSchema.parse(project), params: p, issues };
}

/** Wall id helpers, re-exported for the generators and checks. */
export { wallObjectId, openingObjectId, stairParams };
