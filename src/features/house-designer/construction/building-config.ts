import type { Room } from "@/features/berchuma-studio/types/room";

import { ASSUME } from "./context";
import { polygonArea, type P2 } from "./geometry";
import { pitchedCover } from "./roof-geometry";
import {
  DEFAULT_LEARNING_PARAMS,
  buildLearningHouseProject,
  buildPlanFromSpec,
  buildProjectFromPlans,
  normalizeParams,
  type BuildHooks,
  type DoorSpec,
  type LearningHouseParams,
  type ParamIssue,
  type PlanSpec,
  type WindowSpec,
  type Zone,
} from "./learning-house";
import type { HouseProject } from "../types/project";
import type { ModelOptions } from "./types";

/**
 * The building configurator: four templates, each a function from a few
 * dimensions to a real `HouseProject`. Resizing builds a different project, so
 * the 3D model, the quantities and the cost all follow the numbers on screen.
 *
 * Every dimension here is an example chosen to make the construction readable
 * and the estimate plausible. None is a structural design.
 */

export const BUILDING_TEMPLATES = ["existing", "modern-house", "modern-villa", "g-plus-2"] as const;
export type BuildingTemplateId = (typeof BUILDING_TEMPLATES)[number];

export type BuildingConfig = {
  template: BuildingTemplateId;
  /** Overall length (x) and width (y) of the building's slab outline, mm, measured between column centres at the corners. */
  length: number;
  width: number;
  /** Number of storeys: 3 is "G+2". */
  floors: number;
  floorToFloor: number;
  /**
   * Existing Building only: column lines typed in by hand, five across and three deep, mm.
   * When they are set they decide the length and the width; the other templates lay their
   * rooms out from the length and the width and so keep their own lines.
   */
  gridX?: number[];
  gridY?: number[];
};

/** The structure a learner may adjust on top of a template: the sizes that are not the building's overall shape. */
export type StructureOverrides = Partial<Omit<LearningHouseParams, "title" | "gridX" | "gridY" | "storeys" | "floorToFloor" | "stairHall">>;

type TemplateDef = {
  id: BuildingTemplateId;
  label: string;
  summary: string;
  defaults: BuildingConfig;
  /** Limits of what the plan can be drawn in, mm and storeys. */
  limits: { length: [number, number]; width: [number, number]; floors: [number, number]; floorToFloor: [number, number] };
  /** Whether the number of floors can be changed, and why not if it cannot. */
  floorsNote?: string;
  roofType: ModelOptions["roofType"];
  /** Grid lines as fractions of the length and the width: five across, three deep. */
  gridX: number[];
  gridY: number[];
  features: string[];
};

export const TEMPLATES: Record<BuildingTemplateId, TemplateDef> = {
  existing: {
    id: "existing", label: "Existing Building", summary: "The three-storey house the learning mode started with: nine rooms a floor, a dog-legged stair, a flat concrete roof with a parapet.",
    defaults: { template: "existing", length: 12000, width: 9000, floors: 3, floorToFloor: 3200 },
    limits: { length: [9000, 24000], width: [7500, 18000], floors: [1, 4], floorToFloor: [2600, 4500] },
    roofType: "flat", gridX: [0, 4000 / 12000, 8000 / 12000, 10400 / 12000, 1], gridY: [0, 0.5, 1],
    features: ["Flat roof with parapet", "Entrance balcony above the door", "Dog-legged stair"],
  },
  "modern-house": {
    id: "modern-house", label: "Modern House", summary: "Two storeys with a long cantilevered balcony over the entrance, open-plan living on the ground floor and large windows.",
    defaults: { template: "modern-house", length: 14000, width: 10000, floors: 2, floorToFloor: 3200 },
    limits: { length: [10000, 24000], width: [8000, 18000], floors: [1, 3], floorToFloor: [2800, 4000] },
    roofType: "flat", gridX: [0, 0.3, 0.56, 0.76, 1], gridY: [0, 0.5, 1],
    features: ["1.5 m cantilever balcony", "Open-plan living, dining and kitchen", "Large windows", "Flat roof with parapet"],
  },
  "modern-villa": {
    id: "modern-villa", label: "Modern Villa", summary: "A larger house with a salon, family room and a master suite, two balconies and a pitched roof over the same concrete frame.",
    defaults: { template: "modern-villa", length: 16000, width: 12000, floors: 2, floorToFloor: 3300 },
    limits: { length: [12000, 26000], width: [9500, 20000], floors: [2, 3], floorToFloor: [2900, 4200] },
    roofType: "pitched", gridX: [0, 0.28, 0.54, 0.74, 1], gridY: [0, 0.46, 1],
    features: ["Two cantilever balconies", "Pitched timber roof", "Entrance canopy", "Master suite"],
  },
  "g-plus-2": {
    id: "g-plus-2", label: "G+2 Building", summary: "Three floors of equal area: two apartments on each side of a central stair core, with a flat roof. Floors are fixed at three.",
    defaults: { template: "g-plus-2", length: 15000, width: 10000, floors: 3, floorToFloor: 3200 },
    limits: { length: [11000, 28000], width: [8500, 18000], floors: [3, 3], floorToFloor: [2800, 4000] },
    floorsNote: "A G+2 building is three floors by definition.",
    roofType: "flat", gridX: [0, 0.34, 0.5, 0.66, 1], gridY: [0, 0.5, 1],
    features: ["Two apartments a floor", "Central stair core", "Three equal floors", "Flat roof with parapet"],
  },
};

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
const snap50 = (value: number) => Math.round(value / 50) * 50;

export type ConfigIssue = { field: keyof BuildingConfig | "area"; message: string };

/** A configuration made sane, with a note for anything that had to move. */
export function normalizeConfig(input: Partial<BuildingConfig> & { template?: BuildingTemplateId }): { config: BuildingConfig; issues: ConfigIssue[] } {
  const issues: ConfigIssue[] = [];
  const template = BUILDING_TEMPLATES.includes(input.template as BuildingTemplateId) ? (input.template as BuildingTemplateId) : "existing";
  const def = TEMPLATES[template];
  const num = (field: "length" | "width" | "floorToFloor", [lo, hi]: [number, number]) => {
    const raw = Number(input[field] ?? def.defaults[field]);
    const value = Number.isFinite(raw) ? snap50(clamp(raw, lo, hi)) : def.defaults[field];
    if (Number.isFinite(raw) && Math.abs(value - raw) > 25) issues.push({ field, message: `${field} was ${Math.round(raw)} mm; using ${value} mm (allowed ${lo}–${hi} mm for ${def.label}).` });
    return value;
  };
  const rawFloors = Number(input.floors ?? def.defaults.floors);
  const floors = Number.isFinite(rawFloors) ? Math.round(clamp(rawFloors, def.limits.floors[0], def.limits.floors[1])) : def.defaults.floors;
  if (Number.isFinite(rawFloors) && floors !== rawFloors) issues.push({ field: "floors", message: `${def.label} takes ${def.limits.floors[0] === def.limits.floors[1] ? `${floors} floors` : `${def.limits.floors[0]} to ${def.limits.floors[1]} floors`}; using ${floors}.` });
  const floorToFloor = num("floorToFloor", def.limits.floorToFloor);
  // Column lines typed by hand are only honoured on the Existing Building, whose rooms follow whatever grid it is given.
  const lines = (field: "gridX" | "gridY", count: number) => {
    const raw = input[field];
    if (raw === undefined) return undefined;
    if (template !== "existing") {
      issues.push({ field, message: `${def.label} lays out its column lines from the length and the width; the typed lines were not used.` });
      return undefined;
    }
    const ok = Array.isArray(raw) && raw.length === count && raw.every((v, i) => Number.isFinite(v) && (i === 0 || v - raw[i - 1]! >= 1500));
    if (!ok) {
      issues.push({ field, message: `${field} needs ${count} increasing lines at least 1.5 m apart; using the proportional grid.` });
      return undefined;
    }
    return raw as number[];
  };
  const gridX = lines("gridX", 5);
  const gridY = lines("gridY", 3);
  const length = gridX ? gridX[gridX.length - 1]! - gridX[0]! : num("length", def.limits.length);
  let width = gridY ? gridY[gridY.length - 1]! - gridY[0]! : num("width", def.limits.width);
  // The stair stands in the north bay: it has to fit between the middle grid line and the back wall.
  if (!gridY) {
    const [fitting] = widthBounds(template, floorToFloor);
    if (width < fitting) {
      issues.push({ field: "width", message: `A ${floorToFloor} mm storey needs a stair ${Math.round(stairLength(floorToFloor))} mm long in the back bay; width raised to ${fitting} mm.` });
      width = fitting;
    }
  }
  return { config: { template, length, width, floors, floorToFloor, ...(gridX ? { gridX } : {}), ...(gridY ? { gridY } : {}) }, issues };
}

/** How long the stair is, mm: two flights and a landing rising one storey. */
const stairLength = (floorToFloor: number) => 3800 + (floorToFloor - 3200) * 1.2;

/** The narrowest and widest the building can be at this storey height: the back bay has to hold the stair. */
export function widthBounds(template: BuildingTemplateId, floorToFloor: number): [number, number] {
  const def = TEMPLATES[template];
  const needed = stairLength(floorToFloor) / (1 - def.gridY[1]!);
  const [lo, hi] = def.limits.width;
  return [Math.min(hi, Math.max(lo, Math.ceil(needed / 50) * 50)), hi];
}

/** The smallest and largest area per floor a template can be drawn at, m². */
export function areaRange(template: BuildingTemplateId, floorToFloor: number = TEMPLATES[template].defaults.floorToFloor): [number, number] {
  const { length } = TEMPLATES[template].limits;
  const [wLo, wHi] = widthBounds(template, floorToFloor);
  return [(length[0] * wLo) / 1e6, (length[1] * wHi) / 1e6];
}

/** The configuration a template starts from. */
export const defaultConfig = (template: BuildingTemplateId): BuildingConfig => ({ ...TEMPLATES[template].defaults });

/**
 * A length and width that give `area` m² per floor. Both are multiples of 50 mm, so an exact
 * area is not always possible; of the pairs near the building's present shape (length ÷ width)
 * this takes the one whose area is closest to what was asked (to within 0.05 m²), and the nearest
 * shape among those that are equally close. Where the limits of the template stop the shape being kept it
 * gives way on one side, then the other, so the area is still met when it can be.
 */
export function configForArea(config: BuildingConfig, areaM2: number): { config: BuildingConfig; issues: ConfigIssue[] } {
  const def = TEMPLATES[config.template];
  const aspect = config.length / config.width;
  const target = areaM2 * 1e6;
  const [wLo, wHi] = widthBounds(config.template, config.floorToFloor);
  const [lLo, lHi] = def.limits.length;
  const ideal = clamp(Math.sqrt(target * aspect), lLo, lHi);
  let best: { length: number; width: number; error: number; shape: number } | null = null;
  for (let step = -24; step <= 24; step += 1) {
    const length = clamp(snap50(ideal) + step * 50, lLo, lHi);
    for (const nudge of [-1, 0, 1]) {
      const width = clamp(snap50(target / length) + nudge * 50, wLo, wHi);
      const error = Math.abs(length * width - target) / 1e6;
      const shape = Math.abs(length / width / aspect - 1);
      // Areas within 0.05 m² of what was asked count as equally close; the shape decides between them.
      const bucket = Math.floor(error / 0.05);
      const better = !best || bucket < Math.floor(best.error / 0.05) || (bucket === Math.floor(best.error / 0.05) && shape < best.shape);
      if (better) best = { length, width, error, shape };
    }
  }
  // Asking for an area means asking for the proportional grid again: hand-typed column lines would override it.
  const result = normalizeConfig({ ...config, gridX: undefined, gridY: undefined, length: best!.length, width: best!.width });
  return { config: result.config, issues: result.issues };
}

// ---------------------------------------------------------------------------
// Structure sized from the spans, so a big building is not drawn with a small beam
// ---------------------------------------------------------------------------

function structureFor(config: BuildingConfig, gridX: number[], gridY: number[]): Partial<LearningHouseParams> {
  const span = (lines: number[]) => Math.max(...lines.slice(1).map((v, i) => v - lines[i]!));
  const longest = Math.max(span(gridX), span(gridY));
  const beamDepth = clamp(Math.ceil(longest / 11 / 50) * 50, 400, 750);
  const beamWidth = clamp(Math.ceil((beamDepth * 0.55) / 50) * 50, 250, 400);
  const columnSize = config.floors >= 4 ? 400 : config.floors === 3 ? 350 : 300;
  const footingSize = clamp(1200 + 200 * config.floors + Math.max(0, longest - 5000) * 0.1, 1400, 2400);
  return {
    beamDepth, beamWidth, columnSize,
    footingSize: snap50(footingSize), footingThickness: config.floors >= 3 ? 500 : 450,
    slabThickness: longest > 6500 ? 250 : longest > 5500 ? 220 : 200,
  };
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

type Kind = "ground" | "first" | "second";

type Names = Record<"a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i", string>;

/** The nine-room plan the Existing Building uses, with its own names and windows: the modern house and villa are drawn on it. */
function planOnFiveByThree(kind: Kind, p: LearningHouseParams, style: { names: Record<Kind, Names>; window: { width: number; height: number; sill: number }; open: [string, string][]; openUpper?: [string, string][]; entranceWidth: number; bathLength: number }): PlanSpec {
  const [x0, x1, x2, x3, x4] = p.gridX as [number, number, number, number, number];
  const [y0, y1, y2] = p.gridY as [number, number, number];
  const bath = Math.min(style.bathLength, (x2 - x1) * 0.6);
  const xb = x1 + bath;
  const yb = y1 + Math.min(2400, (y2 - y1) * 0.55);
  const tile = "Ceramic tile";
  const wood = "Porcelain tile";
  const ground = kind === "ground";
  const names = style.names[kind];
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
        { a: "a", b: "S", at: 0.5, width: style.entranceWidth },
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
  const big = style.window;
  const windows: WindowSpec[] = [
    { zone: "a", side: "S", at: (x0 + x1) / 2, ...big }, { zone: "a", side: "W", at: (y0 + y1) / 2 },
    { zone: "b", side: "S", at: (x1 + x2) / 2, ...big }, { zone: "c", side: "S", at: (x2 + x4) / 2, ...big }, { zone: "c", side: "E", at: (y0 + y1) / 2 },
    { zone: "d", side: "W", at: (y1 + y2) / 2 }, { zone: "d", side: "N", at: (x0 + x1) / 2 },
    { zone: "f", side: "N", at: (x1 + xb) / 2, ...small },
    { zone: "h", side: "N", at: (x2 + x3) / 2, width: 800, height: 1500, sill: 600 },
    { zone: "i", side: "N", at: (x3 + x4) / 2, ...small }, { zone: "i", side: "E", at: (y1 + y2) / 2, ...small },
  ];
  return { zones, open: ground ? style.open : style.openUpper ?? [], doors, windows };
}

const MODERN_HOUSE_NAMES: Record<Kind, Names> = {
  ground: { a: "Living room", b: "Dining", c: "Kitchen", d: "Guest bedroom", e: "Bathroom", f: "WC", g: "Hall", h: "Stair hall", i: "Utility store" },
  first: { a: "Master bedroom", b: "Bedroom 2", c: "Study", d: "Family lounge", e: "Bathroom", f: "Shower room", g: "Landing", h: "Stair hall", i: "Laundry" },
  second: { a: "Bedroom 3", b: "Bedroom 4", c: "Home office", d: "Sitting area", e: "Bathroom", f: "Shower room", g: "Landing", h: "Stair hall", i: "Linen store" },
};

const MODERN_VILLA_NAMES: Record<Kind, Names> = {
  ground: { a: "Salon", b: "Dining", c: "Kitchen", d: "Family room", e: "Bathroom", f: "WC", g: "Entrance hall", h: "Stair hall", i: "Utility store" },
  first: { a: "Master bedroom", b: "Bedroom 2", c: "Bedroom 3", d: "Family lounge", e: "Bathroom", f: "Shower room", g: "Landing", h: "Stair hall", i: "Laundry" },
  second: { a: "Bedroom 4", b: "Bedroom 5", c: "Library study", d: "Sitting area", e: "Bathroom", f: "Shower room", g: "Landing", h: "Stair hall", i: "Linen store" },
};

/** Two apartments either side of a central core. Column lines: 0, 1 | 2 | 3, 4 across; 0, 1, 2 deep. */
function planApartments(kind: Kind, p: LearningHouseParams): PlanSpec {
  const [x0, x1, x2, x3, x4] = p.gridX as [number, number, number, number, number];
  const [y0, y1, y2] = p.gridY as [number, number, number];
  const ground = kind === "ground";
  const tile = "Ceramic tile";
  const wood = "Porcelain tile";
  const kitchenW = 2700;
  const bathW = 2400;
  const yb = y1 + Math.min(2400, (y2 - y1) * 0.5);
  const xkA = x1 - kitchenW;
  const xkB = x3 + kitchenW;
  const xmA = x1 - bathW;
  const xmB = x3 + bathW;
  const tag = (n: string) => (ground ? n : n);
  const zones: Zone[] = [
    { id: "a", name: tag("Living room A"), x0, y0, x1: xkA, y1, floor: wood },
    { id: "k", name: "Kitchen A", x0: xkA, y0, x1, y1, floor: tile },
    { id: "l", name: ground ? "Entrance lobby" : "Landing", x0: x1, y0, x1: x3, y1, floor: tile },
    { id: "m", name: "Kitchen B", x0: x3, y0, x1: xkB, y1, floor: tile },
    { id: "g", name: "Living room B", x0: xkB, y0, x1: x4, y1, floor: wood },
    { id: "b", name: "Bedroom A", x0, y0: y1, x1: xmA, y1: y2, floor: wood },
    { id: "e", name: "Bathroom A", x0: xmA, y0: y1, x1, y1: yb, floor: tile },
    { id: "f", name: "Store A", x0: xmA, y0: yb, x1, y1: y2, floor: tile },
    { id: "h", name: "Stair hall", x0: x1, y0: y1, x1: x2, y1: y2, floor: tile },
    { id: "i", name: "Lift lobby store", x0: x2, y0: y1, x1: x3, y1: y2, floor: tile },
    { id: "n", name: "Bathroom B", x0: x3, y0: y1, x1: xmB, y1: yb, floor: tile },
    { id: "o", name: "Store B", x0: x3, y0: yb, x1: xmB, y1: y2, floor: tile },
    { id: "d", name: "Bedroom B", x0: xmB, y0: y1, x1: x4, y1: y2, floor: wood },
  ];
  const doors: DoorSpec[] = [
    ...(ground ? [{ a: "l", b: "S", at: 0.5, width: 1200 } as DoorSpec] : []),
    { a: "l", b: "a", at: 0.5 }, { a: "l", b: "g", at: 0.5 },
    { a: "l", b: "h", at: 0.5, width: 1000, kind: "passage" }, { a: "l", b: "i", at: 0.5 },
    { a: "a", b: "k", at: 0.5, width: 1200, kind: "passage" }, { a: "g", b: "m", at: 0.5, width: 1200, kind: "passage" },
    { a: "a", b: "b", at: 0.25 }, { a: "a", b: "e", at: 0.5 }, { a: "b", b: "f", at: 0.5 },
    { a: "g", b: "d", at: 0.75 }, { a: "g", b: "n", at: 0.5 }, { a: "d", b: "o", at: 0.5 },
  ];
  const small = { width: 600, height: 600, sill: 1500 };
  const windows: WindowSpec[] = [
    { zone: "a", side: "S", at: (x0 + xkA) / 2 }, { zone: "a", side: "W", at: (y0 + y1) / 2 },
    { zone: "k", side: "S", at: (xkA + x1) / 2, width: 1200 },
    { zone: "m", side: "S", at: (x3 + xkB) / 2, width: 1200 },
    { zone: "g", side: "S", at: (xkB + x4) / 2 }, { zone: "g", side: "E", at: (y0 + y1) / 2 },
    { zone: "b", side: "W", at: (y1 + y2) / 2 }, { zone: "b", side: "N", at: (x0 + xmA) / 2 },
    { zone: "d", side: "E", at: (y1 + y2) / 2 }, { zone: "d", side: "N", at: (xmB + x4) / 2 },
    { zone: "f", side: "N", at: (xmA + x1) / 2, ...small }, { zone: "o", side: "N", at: (x3 + xmB) / 2, ...small },
    { zone: "h", side: "N", at: (x1 + x2) / 2, width: 800, height: 1500, sill: 600 },
  ];
  void x2;
  return { zones, open: [], doors, windows };
}

// ---------------------------------------------------------------------------
// Balconies: cantilevers off the front wall of the first floor
// ---------------------------------------------------------------------------

type BalconySpec = { id: string; centre: number; width: number; depth: number };

function balconiesFor(project: HouseProject, p: LearningHouseParams, specs: BalconySpec[]): HouseProject["balconies"] {
  const upper = project.levels[1];
  if (!upper) return [];
  const wall = project.walls.find((w) => w.levelId === upper.id && w.id.endsWith(":c1"));
  if (!wall) return [];
  const thickness = Math.max(p.slabThickness, 150);
  return specs.map((s) => ({
    id: `${upper.id}:balcony:${s.id}`, levelId: upper.id, wallId: wall.id, x: s.centre, y: -(p.externalWall / 2 + s.depth / 2), elevation: upper.elevation,
    width: s.width, depth: s.depth, thickness, rotation: 0, railingHeight: 1050, railingMaterial: "Steel and glass", material: "Reinforced concrete",
  }));
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

export type BuildingAreas = {
  /** The plan the building stands on: the ground-floor slab outline, m². */
  footprint: number;
  /** Floor area of each storey, to the slab edge, stairwell included, m². */
  areaPerFloor: number[];
  /** Cantilever balcony slab on each storey, outside the slab outline, m². */
  balconyPerFloor: number[];
  /** Total gross floor area: the floors added up, balconies not included, m². */
  grossFloorArea: number;
  /** Floors and cantilevers together, m². */
  totalSlabArea: number;
  /** The roof covering, m²: inside the parapet when flat, along the slope (overhang included) when pitched. */
  roofArea: number;
  /** The roof in plan, m². */
  roofPlanArea: number;
  roofType: ModelOptions["roofType"];
};

/**
 * The roof covering and the roof in plan, m², for a building with this outline. Read from the same
 * dimensions the roof generator draws from: a flat roof is the slab inside its parapet; a pitched
 * roof is measured along the slope, with its overhang.
 */
export function roofAreaOf(outline: P2[], roofType: ModelOptions["roofType"]): { covering: number; plan: number } {
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const L = Math.max(...xs) - Math.min(...xs);
  const W = Math.max(...ys) - Math.min(...ys);
  if (roofType === "pitched") {
    const cover = pitchedCover(L, W);
    return { covering: cover.sloped, plan: cover.plan };
  }
  const inner = (L - 2 * ASSUME.parapetThickness) * (W - 2 * ASSUME.parapetThickness) * 1e-6;
  return { covering: inner, plan: polygonArea(outline) * 1e-6 };
}

/** The areas, read from the geometry of the project rather than from the numbers typed in. */
export function areasOf(project: HouseProject, roofType: ModelOptions["roofType"]): BuildingAreas {
  const areaPerFloor = project.levels.map((level) => {
    const slab = project.slabs.find((s) => s.levelId === level.id);
    return slab ? polygonArea(slab.boundary) * 1e-6 : 0;
  });
  const balconyPerFloor = project.levels.map((level) => project.balconies.filter((b) => b.levelId === level.id).reduce((s, b) => s + b.width * b.depth * 1e-6, 0));
  const grossFloorArea = areaPerFloor.reduce((s, a) => s + a, 0);
  const outline = project.slabs.find((s) => s.levelId === project.levels[0]?.id)?.boundary ?? [];
  const roof = roofAreaOf(outline, roofType);
  return {
    footprint: areaPerFloor[0] ?? 0, areaPerFloor, balconyPerFloor, grossFloorArea,
    totalSlabArea: grossFloorArea + balconyPerFloor.reduce((s, a) => s + a, 0), roofArea: roof.covering, roofPlanArea: roof.plan, roofType,
  };
}

export type BuiltBuilding = {
  config: BuildingConfig;
  project: HouseProject;
  params: LearningHouseParams;
  areas: BuildingAreas;
  /** Model options the template starts with (its roof). */
  options: Partial<ModelOptions>;
  issues: (ConfigIssue | ParamIssue)[];
};

const gridOf = (length: number, fractions: number[]) => {
  const lines = fractions.map((f) => snap50(length * f));
  lines[0] = 0;
  lines[lines.length - 1] = length;
  return lines;
};

export function buildBuilding(input: Partial<BuildingConfig> & { template?: BuildingTemplateId }, overrides: StructureOverrides = {}): BuiltBuilding {
  const { config, issues: configIssues } = normalizeConfig(input);
  const def = TEMPLATES[config.template];
  const gridX = config.gridX ?? gridOf(config.length, def.gridX);
  const gridY = config.gridY ?? gridOf(config.width, def.gridY);
  const structure = structureFor(config, gridX, gridY);
  const title = config.template === "existing" ? DEFAULT_LEARNING_PARAMS.title : `${def.label} — ${config.floors === 3 ? "G+2" : config.floors === 1 ? "single storey" : `G+${config.floors - 1}`}`;
  const base: Partial<LearningHouseParams> = { title, gridX, gridY, storeys: config.floors, floorToFloor: config.floorToFloor, ...structure };

  if (config.template === "existing") {
    // The original building, untouched at its own size; its structure sized to the span otherwise. Either way the learner's own sizes win.
    const original = !config.gridX && !config.gridY && config.length === 12000 && config.width === 9000 && config.floors === 3 && config.floorToFloor === 3200;
    const built = buildLearningHouseProject({ ...(original ? {} : base), ...overrides });
    return { config, project: built.project, params: built.params, areas: areasOf(built.project, def.roofType), options: { roofType: def.roofType }, issues: [...configIssues, ...built.issues] };
  }

  const counts = { x: 5, y: 3 };
  const { params: p, issues } = normalizeParams({
    ...base,
    ...(config.template === "modern-house" ? { windowWidth: 1800, windowHeight: 1500, windowSill: 700, doorWidth: 900 } : {}),
    ...(config.template === "modern-villa" ? { windowWidth: 1500, windowHeight: 1400, windowSill: 800, doorWidth: 1000 } : {}),
    ...overrides,
  }, counts);
  let planOf: (index: number) => Room;
  let hooks: BuildHooks;
  const kindAt = (index: number): Kind => (index === 0 ? "ground" : index === p.storeys - 1 && p.storeys >= 3 ? "second" : "first");
  const hall = { x0: p.gridX[2]!, x1: p.gridX[3]!, y0: p.gridY[1]!, y1: p.gridY[2]! };

  if (config.template === "g-plus-2") {
    const apartmentParams: LearningHouseParams = { ...p, stairHall: { x0: p.gridX[1]!, x1: p.gridX[2]!, y0: p.gridY[1]!, y1: p.gridY[2]! } };
    planOf = (index) => buildPlanFromSpec(planApartments(kindAt(index), apartmentParams), apartmentParams);
    hooks = { id: "medosha-building-g-plus-2", parapet: 900, finish: (project) => ({ ...project, balconies: [] }) };
    return finish(config, def, apartmentParams, planOf, hooks, [...configIssues, ...issues]);
  }

  const modern = config.template === "modern-house";
  const style = {
    names: modern ? MODERN_HOUSE_NAMES : MODERN_VILLA_NAMES,
    window: modern ? { width: 2400, height: 1600, sill: 500 } : { width: 1800, height: 1500, sill: 700 },
    open: (modern ? [["a", "b"], ["b", "c"]] : [["a", "b"]]) as [string, string][],
    openUpper: (modern ? [["d", "g"]] : []) as [string, string][],
    entranceWidth: modern ? 1200 : 1400,
    bathLength: 2400,
  };
  const withHall: LearningHouseParams = { ...p, stairHall: hall };
  planOf = (index) => buildPlanFromSpec(planOnFiveByThree(kindAt(index), withHall, style), withHall);
  const front = withHall.gridX[withHall.gridX.length - 1]! - withHall.gridX[0]!;
  const balcony: BalconySpec[] = modern
    ? [{ id: "front", centre: front * 0.45, width: Math.min(front * 0.52, 7000), depth: 1500 }]
    : [{ id: "left", centre: front * 0.18, width: Math.min(front * 0.26, 4500), depth: 1500 }, { id: "right", centre: front * 0.78, width: Math.min(front * 0.26, 4500), depth: 1500 }];
  hooks = {
    id: `medosha-building-${config.template}`,
    parapet: modern ? 900 : 300,
    finish: (project, params) => ({ ...project, balconies: balconiesFor(project, params, balcony) }),
  };
  return finish(config, def, withHall, planOf, hooks, [...configIssues, ...issues]);
}

function finish(config: BuildingConfig, def: TemplateDef, p: LearningHouseParams, planOf: (index: number) => Room, hooks: BuildHooks, issues: (ConfigIssue | ParamIssue)[]): BuiltBuilding {
  const project = buildProjectFromPlans(p, planOf, hooks);
  return { config, project, params: p, areas: areasOf(project, def.roofType), options: { roofType: def.roofType }, issues };
}
