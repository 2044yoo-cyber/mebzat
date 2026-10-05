import type { HouseProject } from "../types/project";

/**
 * The architectural objects a plan is furnished with: what each is, its
 * usual size, the plan symbol that draws it and the 3D model that raises it.
 * A placed object is one record in the project (`components`, with `family`
 * naming its definition); the plan and the 3D view both read it, so the
 * two cannot drift apart.
 *
 * Sizes in millimetres. In a symbol's own frame the object's back is at the
 * top (−y) and its front — where you sit, open, stand — at the bottom.
 */

export const OBJECT_CATEGORIES = [
  { id: "living", name: "Living" },
  { id: "bedroom", name: "Bedroom" },
  { id: "dining", name: "Dining" },
  { id: "kitchen", name: "Kitchen" },
  { id: "bathroom", name: "Bathroom" },
  { id: "office", name: "Office" },
  { id: "other", name: "Other" },
] as const;
export type ObjectCategory = (typeof OBJECT_CATEGORIES)[number]["id"];

export type SymbolId =
  | "chair" | "sofa" | "sofa-l" | "sofa-u" | "coffee-table" | "side-table" | "tv-unit"
  | "bed" | "bedside" | "wardrobe" | "dresser"
  | "dining-table" | "round-table"
  | "base-cabinet" | "wall-cabinet" | "sink" | "double-sink" | "fridge" | "stove" | "oven" | "dishwasher" | "island"
  | "toilet" | "basin" | "double-basin" | "shower" | "bathtub"
  | "desk" | "office-chair" | "meeting-table"
  | "washer" | "cabinet" | "bench" | "car" | "generic";

export type ModelId = "chair" | "sofa" | "table" | "round-table" | "bed" | "cabinet" | "tall-cabinet" | "wall-cabinet" | "toilet" | "basin" | "bathtub" | "shower" | "car" | "box";

export type ObjectDefinition = {
  id: string;
  name: string;
  category: ObjectCategory;
  width: number;
  depth: number;
  height: number;
  /** Above the floor: a wall cabinet hangs. */
  elevation?: number;
  symbol: SymbolId;
  model: ModelId;
  /** Symbol detail: seats round a table, pillows on a bed, cushions on a sofa. */
  count?: number;
  material: string;
};

const item = (id: string, name: string, category: ObjectCategory, width: number, depth: number, height: number, symbol: SymbolId, model: ModelId, extra: Partial<ObjectDefinition> = {}): ObjectDefinition =>
  ({ id, name, category, width, depth, height, symbol, model, material: "Generic", ...extra });

export const OBJECT_LIBRARY: readonly ObjectDefinition[] = [
  // Living
  item("chair-1", "1-seat chair", "living", 800, 800, 850, "chair", "sofa", { count: 1, material: "Fabric" }),
  item("sofa-2", "2-seat sofa", "living", 1600, 900, 850, "sofa", "sofa", { count: 2, material: "Fabric" }),
  item("sofa-3", "3-seat sofa", "living", 2200, 900, 850, "sofa", "sofa", { count: 3, material: "Fabric" }),
  item("sofa-l", "L-shaped sofa", "living", 2600, 1800, 850, "sofa-l", "sofa", { material: "Fabric" }),
  item("sofa-u", "U-shaped sofa", "living", 3200, 2200, 850, "sofa-u", "sofa", { material: "Fabric" }),
  item("coffee-table", "Coffee table", "living", 1200, 600, 420, "coffee-table", "table", { material: "Timber" }),
  item("side-table", "Side table", "living", 500, 500, 550, "side-table", "table", { material: "Timber" }),
  item("tv-unit", "TV unit", "living", 1800, 450, 500, "tv-unit", "cabinet", { material: "MDF" }),
  // Bedroom
  item("single-bed", "Single bed", "bedroom", 900, 2000, 500, "bed", "bed", { count: 1, material: "Timber" }),
  item("double-bed", "Double bed", "bedroom", 1400, 2000, 500, "bed", "bed", { count: 2, material: "Timber" }),
  item("queen-bed", "Queen bed", "bedroom", 1600, 2000, 500, "bed", "bed", { count: 2, material: "Timber" }),
  item("king-bed", "King bed", "bedroom", 1800, 2000, 500, "bed", "bed", { count: 2, material: "Timber" }),
  item("bedside", "Bedside table", "bedroom", 450, 400, 550, "bedside", "cabinet", { material: "Timber" }),
  item("wardrobe", "Wardrobe", "bedroom", 1800, 600, 2200, "wardrobe", "tall-cabinet", { count: 3, material: "MDF" }),
  item("dresser", "Dresser", "bedroom", 1200, 500, 800, "dresser", "cabinet", { material: "MDF" }),
  // Dining
  item("dining-2", "2-seat dining table", "dining", 800, 800, 750, "dining-table", "table", { count: 2, material: "Timber" }),
  item("dining-4", "4-seat dining table", "dining", 1200, 800, 750, "dining-table", "table", { count: 4, material: "Timber" }),
  item("dining-6", "6-seat dining table", "dining", 1800, 900, 750, "dining-table", "table", { count: 6, material: "Timber" }),
  item("dining-8", "8-seat dining table", "dining", 2400, 1000, 750, "dining-table", "table", { count: 8, material: "Timber" }),
  item("dining-round", "Round dining table", "dining", 1200, 1200, 750, "round-table", "round-table", { count: 4, material: "Timber" }),
  // Kitchen
  item("base-cabinet", "Base cabinet", "kitchen", 600, 600, 900, "base-cabinet", "cabinet", { material: "MDF" }),
  item("wall-cabinet", "Wall cabinet", "kitchen", 600, 350, 700, "wall-cabinet", "wall-cabinet", { elevation: 1450, material: "MDF" }),
  item("sink", "Sink", "kitchen", 800, 600, 900, "sink", "cabinet", { material: "Stainless steel" }),
  item("double-sink", "Double sink", "kitchen", 1200, 600, 900, "double-sink", "cabinet", { material: "Stainless steel" }),
  item("fridge", "Refrigerator", "kitchen", 700, 700, 1800, "fridge", "tall-cabinet", { material: "Steel" }),
  item("stove", "Stove / cooker", "kitchen", 600, 600, 900, "stove", "cabinet", { material: "Steel" }),
  item("oven", "Oven", "kitchen", 600, 600, 900, "oven", "cabinet", { material: "Steel" }),
  item("dishwasher", "Dishwasher", "kitchen", 600, 600, 850, "dishwasher", "cabinet", { material: "Steel" }),
  item("island", "Kitchen island", "kitchen", 1800, 900, 900, "island", "cabinet", { material: "MDF" }),
  // Bathroom
  item("toilet", "Toilet", "bathroom", 400, 700, 800, "toilet", "toilet", { material: "Ceramic" }),
  item("basin", "Wash basin", "bathroom", 550, 450, 850, "basin", "basin", { material: "Ceramic" }),
  item("double-basin", "Double basin", "bathroom", 1200, 500, 850, "double-basin", "basin", { material: "Ceramic" }),
  item("shower", "Shower", "bathroom", 900, 900, 2100, "shower", "shower", { material: "Ceramic" }),
  item("bathtub", "Bathtub", "bathroom", 1700, 750, 550, "bathtub", "bathtub", { material: "Acrylic" }),
  // Office
  item("desk", "Desk", "office", 1400, 700, 750, "desk", "table", { material: "Timber" }),
  item("office-chair", "Office chair", "office", 600, 600, 1000, "office-chair", "chair", { material: "Fabric" }),
  item("meeting-table", "Meeting table", "office", 2400, 1100, 750, "meeting-table", "table", { count: 8, material: "Timber" }),
  // Other
  item("washer", "Washing machine", "other", 600, 600, 850, "washer", "cabinet", { material: "Steel" }),
  item("storage-cabinet", "Storage cabinet", "other", 900, 450, 1800, "cabinet", "tall-cabinet", { material: "MDF" }),
  item("bench", "Bench", "other", 1400, 400, 450, "bench", "table", { material: "Timber" }),
  item("car", "Car / parking", "other", 1900, 4600, 1500, "car", "car", { material: "Steel" }),
];

/** Names the earlier furniture catalogue used, for plans saved with it. */
const LEGACY: Record<string, string> = {
  "Bed": "queen-bed", "Single bed": "single-bed", "Sofa": "sofa-3", "Chair": "chair-1", "Table": "dining-6", "Wardrobe": "wardrobe",
  "Kitchen counter": "base-cabinet", "Refrigerator": "fridge", "Sink": "sink", "Toilet": "toilet", "Shower": "shower", "Cabinet": "storage-cabinet",
};

const GENERIC: ObjectDefinition = item("generic", "Object", "other", 600, 600, 800, "generic", "box");

export function objectDefinition(id: string): ObjectDefinition | null {
  return OBJECT_LIBRARY.find((entry) => entry.id === id) ?? null;
}

/** The definition a placed object was made from — by id, or by an old catalogue name. */
export function definitionOf(component: Pick<HouseProject["components"][number], "family" | "name">): ObjectDefinition {
  return objectDefinition(component.family) ?? objectDefinition(LEGACY[component.family] ?? "") ?? objectDefinition(LEGACY[component.name] ?? "") ?? GENERIC;
}

/** Search by name or category, ignoring case. */
export function searchObjects(query: string): ObjectDefinition[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...OBJECT_LIBRARY];
  return OBJECT_LIBRARY.filter((entry) => words.every((word) => `${entry.name} ${entry.category} ${entry.id}`.toLowerCase().includes(word)));
}

// ---------------------------------------------------------------------------
// Doors, windows and columns: types of the objects already in walls and plans
// ---------------------------------------------------------------------------

export const DOOR_TYPES = [
  { id: "single", name: "Single hinged", width: 900 },
  { id: "double", name: "Double hinged", width: 1500 },
  { id: "sliding", name: "Sliding", width: 900 },
  { id: "double-sliding", name: "Double sliding", width: 1800 },
  { id: "pocket", name: "Pocket", width: 900 },
  { id: "folding", name: "Folding", width: 1200 },
  { id: "pivot", name: "Pivot", width: 1000 },
] as const;
export type DoorType = (typeof DOOR_TYPES)[number]["id"];

export const WINDOW_TYPES = [
  { id: "fixed", name: "Fixed", width: 1000, height: 1200, sill: 900 },
  { id: "casement", name: "Single casement", width: 600, height: 1200, sill: 900 },
  { id: "double-casement", name: "Double casement", width: 1200, height: 1200, sill: 900 },
  { id: "sliding", name: "Sliding", width: 1500, height: 1200, sill: 900 },
  { id: "awning", name: "Awning", width: 900, height: 600, sill: 1500 },
  { id: "picture", name: "Large / picture", width: 2400, height: 1800, sill: 400 },
  { id: "corner", name: "Corner window", width: 1000, height: 1200, sill: 900 },
] as const;
export type WindowType = (typeof WINDOW_TYPES)[number]["id"];

/** A door's type; one placed before types existed is a single hinged door. */
export function doorType(style: string | undefined): DoorType { return DOOR_TYPES.some((entry) => entry.id === style) ? style as DoorType : "single"; }
export function windowType(style: string | undefined): WindowType { return WINDOW_TYPES.some((entry) => entry.id === style) ? style as WindowType : "fixed"; }

export const COLUMN_SHAPES = [
  { id: "rectangular", name: "Rectangular column" },
  { id: "square", name: "Square column" },
  { id: "circular", name: "Circular column" },
] as const;
export type ColumnShape = (typeof COLUMN_SHAPES)[number]["id"];
export const COLUMN_SIZES: readonly [number, number][] = [[200, 200], [250, 250], [300, 300], [300, 400], [400, 400]];
export function columnShape(type: string | undefined): ColumnShape { return type === "circular" || type === "square" ? type : "rectangular"; }

// ---------------------------------------------------------------------------
// Placing: against the nearest wall, back to it
// ---------------------------------------------------------------------------

type Point = { x: number; y: number };

/**
 * Where an object goes when put down at `point`: if its back would land
 * within reach of a wall, it is turned to face away from that wall and set
 * against its face; otherwise where it was put, at `rotation`.
 */
export function placeAgainstWall(project: HouseProject, levelId: string, point: Point, size: { width: number; depth: number }, rotation = 0, reach = 400): { x: number; y: number; rotation: number; wallId: string | null } {
  let best: { distance: number; x: number; y: number; rotation: number; wallId: string } | null = null;
  for (const wall of project.walls.filter((entry) => entry.levelId === levelId)) {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const length = Math.hypot(dx, dy);
    if (length < size.width * 0.5) continue;
    const t = ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / (length * length);
    if (t < 0 || t > 1) continue;
    const foot = { x: wall.start.x + dx * t, y: wall.start.y + dy * t };
    const away = Math.hypot(point.x - foot.x, point.y - foot.y);
    // The object's back sits half its depth behind its centre.
    const gap = away - size.depth / 2 - wall.thickness / 2;
    if (Math.abs(gap) > reach || away < 1) continue;
    const nx = (point.x - foot.x) / away;
    const ny = (point.y - foot.y) / away;
    const centreAway = wall.thickness / 2 + size.depth / 2;
    // Back to the wall: the symbol's front (+y) points along the normal.
    const facing = Math.round(Math.atan2(-nx, ny) * 180 / Math.PI);
    const candidate = { distance: Math.abs(gap), x: Math.round(foot.x + nx * centreAway), y: Math.round(foot.y + ny * centreAway), rotation: ((facing % 360) + 360) % 360, wallId: wall.id };
    if (!best || candidate.distance < best.distance) best = candidate;
  }
  return best ? { x: best.x, y: best.y, rotation: best.rotation, wallId: best.wallId } : { x: Math.round(point.x), y: Math.round(point.y), rotation, wallId: null };
}

// ---------------------------------------------------------------------------
// Placing: edge to edge with the furniture already there
// ---------------------------------------------------------------------------

type Box = { minX: number; maxX: number; minY: number; maxY: number };
const footprint = (item: { x: number; y: number; width: number; depth: number; rotation: number }): Box => {
  const turned = Math.abs(Math.round(item.rotation / 90)) % 2 === 1;
  const w = turned ? item.depth : item.width;
  const d = turned ? item.width : item.depth;
  return { minX: item.x - w / 2, maxX: item.x + w / 2, minY: item.y - d / 2, maxY: item.y + d / 2 };
};

/**
 * An object brought within reach of another snaps to it: side by side, edge
 * on edge, or lined up with its edges — a bedside table against the bed, two
 * base cabinets in a run. `along` keeps a shift to one axis (an object set
 * against a wall slides along it, it does not leave it).
 */
export function snapToFurniture(project: HouseProject, levelId: string, placed: { x: number; y: number; width: number; depth: number; rotation: number }, options: { ignore?: string; along?: "x" | "y"; reach?: number } = {}): { x: number; y: number } {
  const reach = options.reach ?? 150;
  const me = footprint(placed);
  let shiftX: number | null = null;
  let shiftY: number | null = null;
  const consider = (current: number | null, value: number) => Math.abs(value) <= reach && (current === null || Math.abs(value) < Math.abs(current)) ? value : current;
  for (const other of project.components.filter((item) => item.levelId === levelId && item.id !== options.ignore)) {
    const box = footprint(other);
    const nearInY = me.minY < box.maxY + reach && me.maxY > box.minY - reach;
    const nearInX = me.minX < box.maxX + reach && me.maxX > box.minX - reach;
    if (nearInY && options.along !== "y") for (const value of [box.maxX - me.minX, box.minX - me.maxX, box.minX - me.minX, box.maxX - me.maxX]) shiftX = consider(shiftX, value);
    if (nearInX && options.along !== "x") for (const value of [box.maxY - me.minY, box.minY - me.maxY, box.minY - me.minY, box.maxY - me.maxY]) shiftY = consider(shiftY, value);
  }
  return { x: Math.round(placed.x + (shiftX ?? 0)), y: Math.round(placed.y + (shiftY ?? 0)) };
}
