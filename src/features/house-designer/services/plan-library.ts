import { roomSchema, type Room } from "@/features/berchuma-studio/types/room";

/**
 * Residential floor plans, as real geometry: every template is laid out in
 * bands across the house — bedrooms at the back, a corridor, living at the
 * front — and built into a `Room` with an outline, inside walls, named rooms,
 * doors, windows and overall dimensions. Opened, it is edited like anything
 * drawn by hand.
 *
 * Millimetres, plan coordinates, y down the drawing; the front (the road
 * side) is the bottom of the plan. A room named again in a later band is the
 * same room, so a corridor can turn a corner. A "void" leaves the cell
 * outside the house: a courtyard, or the cut-out of an L.
 *
 * Adjusting to a plot changes the bands' widths and depths, never the scale:
 * a door stays 900 wide, a corridor at least a metre, a bedroom at least
 * 2.6 m across.
 */

export type RoomType = "bedroom" | "master" | "bath" | "toilet" | "kitchen" | "living" | "dining" | "corridor" | "store" | "garage" | "laundry" | "office" | "void";

type BandRoom = { name: string; type: RoomType; width: number; via?: string };
type Band = { depth: number; rooms: BandRoom[] };

export type LibraryTemplate = {
  id: string;
  name: string;
  bedrooms: number;
  floors: number;
  parking: boolean;
  courtyard: boolean;
  bands: Band[];
  /** Doors beyond the ones the rules give: [room, room]. */
  extraDoors?: [string, string][];
};

export type BuiltTemplate = {
  template: LibraryTemplate;
  plan: Room;
  /** Outside size, wall faces included. */
  width: number;
  length: number;
  area: number;
  bedrooms: number;
  bathrooms: number;
  rooms: { name: string; type: RoomType; width: number; depth: number }[];
};

const WALL = 200;
const INSIDE = 120;
const HEIGHT = 2800;

/** The least a room can be across, in either direction. */
export const ROOM_MINIMUM: Record<RoomType, number> = {
  bedroom: 2600, master: 3000, bath: 1500, toilet: 900, kitchen: 1800, living: 3000, dining: 2400,
  corridor: 1000, store: 1000, garage: 2700, laundry: 1200, office: 2200, void: 1500,
};
const GARAGE_LENGTH = 5000;

const room = (name: string, type: RoomType, width: number, via?: string): BandRoom => ({ name, type, width, via });
const band = (depth: number, ...rooms: BandRoom[]): Band => ({ depth, rooms });
const corridor = (width: number) => band(1200, room("Corridor", "corridor", width));

export const TEMPLATE_LIBRARY: LibraryTemplate[] = [
  { id: "one-bed-compact", name: "1-bedroom compact house", bedrooms: 1, floors: 1, parking: false, courtyard: false, bands: [
    band(3200, room("Bedroom", "bedroom", 3400), room("Bathroom", "bath", 1600), room("Store", "store", 1400)),
    band(3600, room("Living and kitchen", "living", 6400)),
  ] },
  { id: "one-bed-standard", name: "1-bedroom standard house", bedrooms: 1, floors: 1, parking: false, courtyard: false, bands: [
    band(3400, room("Bedroom", "bedroom", 3600), room("Bathroom", "bath", 1800), room("Kitchen", "kitchen", 2200)),
    corridor(7600),
    band(4200, room("Living", "living", 4800), room("Dining", "dining", 2800)),
  ] },
  { id: "two-bed-compact", name: "2-bedroom compact house", bedrooms: 2, floors: 1, parking: false, courtyard: false, bands: [
    band(3200, room("Bedroom 1", "bedroom", 3000), room("Bathroom", "bath", 1600), room("Bedroom 2", "bedroom", 3000)),
    corridor(7600),
    band(4000, room("Living", "living", 4400), room("Kitchen", "kitchen", 3200)),
  ] },
  { id: "two-bed-standard", name: "2-bedroom standard house", bedrooms: 2, floors: 1, parking: false, courtyard: false, bands: [
    band(3600, room("Bedroom 1", "bedroom", 3400), room("Bathroom", "bath", 2000), room("Bedroom 2", "bedroom", 3600)),
    corridor(9000),
    band(4800, room("Living", "living", 4200), room("Dining", "dining", 2400), room("Kitchen", "kitchen", 2400)),
  ], extraDoors: [["Dining", "Kitchen"]] },
  { id: "two-bed-master", name: "2-bedroom house with master bedroom", bedrooms: 2, floors: 1, parking: false, courtyard: false, bands: [
    band(3800, room("Master bedroom", "master", 3800), room("En-suite", "bath", 1800, "Master bedroom"), room("Bathroom", "bath", 1600), room("Bedroom 2", "bedroom", 2800)),
    corridor(10000),
    band(4600, room("Living", "living", 4800), room("Dining", "dining", 2600), room("Kitchen", "kitchen", 2600)),
  ], extraDoors: [["Dining", "Kitchen"]] },
  { id: "three-bed-compact", name: "3-bedroom compact house", bedrooms: 3, floors: 1, parking: false, courtyard: false, bands: [
    band(3200, room("Bedroom 1", "bedroom", 3000), room("Bedroom 2", "bedroom", 3000), room("Bedroom 3", "bedroom", 3000)),
    band(2000, room("Bathroom", "bath", 1800), room("Corridor", "corridor", 5400), room("Store", "store", 1800)),
    band(4200, room("Living", "living", 5400), room("Kitchen", "kitchen", 3600)),
  ] },
  { id: "three-bed-family", name: "3-bedroom standard family house", bedrooms: 3, floors: 1, parking: false, courtyard: false, bands: [
    band(3400, room("Bedroom 1", "bedroom", 3200), room("Bathroom", "bath", 1800), room("Bedroom 2", "bedroom", 3000)),
    corridor(8000),
    band(3200, room("Bedroom 3", "bedroom", 3200), room("Bathroom 2", "bath", 1800), room("Dining", "dining", 3000)),
    band(4400, room("Living", "living", 4400), room("Kitchen", "kitchen", 3600)),
  ], extraDoors: [["Kitchen", "Dining"]] },
  { id: "three-bed-master", name: "3-bedroom house with master bedroom", bedrooms: 3, floors: 1, parking: false, courtyard: false, bands: [
    band(4000, room("Master bedroom", "master", 3800), room("En-suite", "bath", 1800, "Master bedroom"), room("Bedroom 2", "bedroom", 3400), room("Bathroom", "bath", 1800)),
    corridor(10800),
    band(4600, room("Bedroom 3", "bedroom", 3400), room("Living", "living", 4400), room("Kitchen", "kitchen", 3000)),
  ], extraDoors: [["Living", "Kitchen"]] },
  { id: "three-bed-narrow", name: "3-bedroom narrow-plot house", bedrooms: 3, floors: 1, parking: false, courtyard: false, bands: [
    band(3200, room("Bedroom 1", "bedroom", 3400), room("Bedroom 2", "bedroom", 3000)),
    corridor(6400),
    band(3000, room("Bedroom 3", "bedroom", 3400), room("Corridor", "corridor", 1200), room("Bathroom", "bath", 1800)),
    band(3200, room("Dining", "dining", 3400), room("Corridor", "corridor", 1200), room("Kitchen", "kitchen", 1800)),
    band(4000, room("Living", "living", 6400)),
  ], extraDoors: [["Dining", "Living"]] },
  { id: "three-bed-courtyard", name: "3-bedroom courtyard house", bedrooms: 3, floors: 1, parking: false, courtyard: true, bands: [
    band(3600, room("Bedroom 1", "bedroom", 4000), room("Bathroom", "bath", 2000), room("Bedroom 2", "bedroom", 3600), room("Store", "store", 3200)),
    corridor(12800),
    band(3600, room("Kitchen", "kitchen", 4400), room("Courtyard", "void", 3600), room("Corridor", "corridor", 1200), room("Bedroom 3", "bedroom", 3600)),
    band(3600, room("Living", "living", 4400), room("Courtyard", "void", 3600), room("Corridor", "corridor", 1200), room("Bathroom 2", "bath", 3600)),
  ], extraDoors: [["Living", "Kitchen"]] },
  { id: "four-bed-compact", name: "4-bedroom compact house", bedrooms: 4, floors: 1, parking: false, courtyard: false, bands: [
    band(3200, room("Bedroom 1", "bedroom", 3000), room("Bedroom 2", "bedroom", 3000), room("Bathroom", "bath", 1600), room("Bedroom 3", "bedroom", 2800)),
    corridor(10400),
    band(3000, room("Bedroom 4", "bedroom", 3000), room("Toilet", "toilet", 1400), room("Kitchen", "kitchen", 3000), room("Dining", "dining", 3000)),
    band(3800, room("Living", "living", 10400)),
  ], extraDoors: [["Kitchen", "Dining"]] },
  { id: "four-bed-family", name: "4-bedroom family house", bedrooms: 4, floors: 1, parking: false, courtyard: false, bands: [
    band(3600, room("Bedroom 1", "bedroom", 3400), room("Bathroom", "bath", 2000), room("Bedroom 2", "bedroom", 3400), room("Bedroom 3", "bedroom", 3200)),
    corridor(12000),
    band(3600, room("Bedroom 4", "bedroom", 3400), room("Bathroom 2", "bath", 2000), room("Kitchen", "kitchen", 3400), room("Dining", "dining", 3200)),
    band(4400, room("Living", "living", 7600), room("Study", "office", 4400)),
  ], extraDoors: [["Kitchen", "Dining"], ["Dining", "Living"]] },
  { id: "four-bed-master", name: "4-bedroom master-suite house", bedrooms: 4, floors: 1, parking: false, courtyard: false, bands: [
    band(4000, room("Master bedroom", "master", 4200), room("En-suite", "bath", 2000, "Master bedroom"), room("Bedroom 2", "bedroom", 3400), room("Bedroom 3", "bedroom", 3400)),
    corridor(13000),
    band(3600, room("Bedroom 4", "bedroom", 3400), room("Bathroom", "bath", 2000), room("Kitchen", "kitchen", 3800), room("Dining", "dining", 3800)),
    band(4200, room("Office", "office", 3400), room("Living", "living", 9600)),
  ], extraDoors: [["Kitchen", "Dining"], ["Dining", "Living"]] },
  { id: "four-bed-courtyard", name: "4-bedroom courtyard house", bedrooms: 4, floors: 1, parking: false, courtyard: true, bands: [
    band(3600, room("Bedroom 1", "bedroom", 3600), room("Bathroom", "bath", 2000), room("Bedroom 2", "bedroom", 3600), room("Bedroom 3", "bedroom", 4000)),
    corridor(13200),
    band(3600, room("Kitchen", "kitchen", 4400), room("Courtyard", "void", 4400), room("Corridor", "corridor", 1200), room("Bedroom 4", "bedroom", 3200)),
    band(3400, room("Living", "living", 4400), room("Courtyard", "void", 4400), room("Corridor", "corridor", 1200), room("Bathroom 2", "bath", 3200)),
  ], extraDoors: [["Living", "Kitchen"]] },
  { id: "narrow-plot", name: "Narrow-plot house", bedrooms: 2, floors: 1, parking: false, courtyard: false, bands: [
    band(3200, room("Bedroom 1", "bedroom", 3200), room("Bathroom", "bath", 2000)),
    corridor(5200),
    band(3200, room("Bedroom 2", "bedroom", 3000), room("Corridor", "corridor", 1000), room("Toilet", "toilet", 1200)),
    band(3000, room("Kitchen", "kitchen", 3000), room("Corridor", "corridor", 1000), room("Laundry", "laundry", 1200)),
    band(4000, room("Living", "living", 5200)),
  ], extraDoors: [["Kitchen", "Living"]] },
  { id: "wide-plot", name: "Wide-plot house", bedrooms: 3, floors: 1, parking: false, courtyard: false, bands: [
    band(3800, room("Bedroom 1", "bedroom", 3600), room("Bathroom", "bath", 2000), room("Bedroom 2", "bedroom", 3600), room("Bedroom 3", "bedroom", 3600), room("Laundry", "laundry", 2200)),
    corridor(15000),
    band(4200, room("Kitchen", "kitchen", 3600), room("Dining", "dining", 3600), room("Living", "living", 7800)),
  ], extraDoors: [["Kitchen", "Dining"], ["Dining", "Living"]] },
  { id: "l-shaped", name: "L-shaped house", bedrooms: 3, floors: 1, parking: false, courtyard: false, bands: [
    band(3600, room("Bedroom 1", "bedroom", 3600), room("Bathroom", "bath", 2000), room("Bedroom 2", "bedroom", 3400), room("Bedroom 3", "bedroom", 3000)),
    corridor(12000),
    band(4400, room("Living", "living", 4600), room("Kitchen and dining", "kitchen", 3000), room("Garden", "void", 4400)),
  ], extraDoors: [["Living", "Kitchen and dining"]] },
  { id: "u-shaped", name: "U-shaped courtyard house", bedrooms: 3, floors: 1, parking: false, courtyard: true, bands: [
    band(3600, room("Bedroom 1", "bedroom", 3600), room("Corridor", "corridor", 1200), room("Courtyard", "void", 4000), room("Corridor", "corridor", 1200), room("Bedroom 2", "bedroom", 3600)),
    band(3000, room("Bathroom", "bath", 3600), room("Corridor", "corridor", 1200), room("Courtyard", "void", 4000), room("Corridor", "corridor", 1200), room("Bedroom 3", "bedroom", 3600)),
    corridor(13600),
    band(4400, room("Kitchen", "kitchen", 3600), room("Dining", "dining", 3600), room("Living", "living", 6400)),
  ], extraDoors: [["Kitchen", "Dining"], ["Dining", "Living"]] },
  { id: "with-parking", name: "House with parking", bedrooms: 3, floors: 1, parking: true, courtyard: false, bands: [
    band(3600, room("Bedroom 1", "bedroom", 3400), room("Bathroom", "bath", 1800), room("Bedroom 2", "bedroom", 3200), room("Bedroom 3", "bedroom", 3000)),
    corridor(11400),
    band(5600, room("Garage", "garage", 3200), room("Kitchen", "kitchen", 2800), room("Living", "living", 5400)),
  ], extraDoors: [["Kitchen", "Living"]] },
  { id: "large-family", name: "Larger family house", bedrooms: 5, floors: 1, parking: false, courtyard: false, bands: [
    band(4000, room("Master bedroom", "master", 4200), room("En-suite", "bath", 2200, "Master bedroom"), room("Bedroom 2", "bedroom", 3800), room("Bedroom 3", "bedroom", 3800)),
    corridor(14000),
    band(3600, room("Bedroom 4", "bedroom", 3400), room("Bathroom", "bath", 2000), room("Corridor", "corridor", 1400), room("Toilet", "toilet", 1400), room("Store", "store", 2000), room("Bedroom 5", "bedroom", 3800)),
    band(4800, room("Living", "living", 7000), room("Dining", "dining", 3200), room("Kitchen", "kitchen", 3800)),
  ], extraDoors: [["Kitchen", "Dining"], ["Dining", "Living"]] },
  { id: "two-bed-parking", name: "2-bedroom house with parking", bedrooms: 2, floors: 1, parking: true, courtyard: false, bands: [
    band(3400, room("Bedroom 1", "bedroom", 3200), room("Bathroom", "bath", 1800), room("Bedroom 2", "bedroom", 3200)),
    corridor(8200),
    band(5400, room("Garage", "garage", 3000), room("Living and kitchen", "living", 5200)),
  ] },
];

// ---------------------------------------------------------------------------
// Building a template into a plan
// ---------------------------------------------------------------------------

type Point = { x: number; y: number };
type Run = { start: Point; end: Point; length: number };
type Grid = { xs: number[]; ys: number[]; owner: (string | null)[][]; types: Map<string, RoomType>; via: Map<string, string> };

/** Column and row sizes: the boundaries every band's rooms make, together. */
export function templateGrid(template: LibraryTemplate): { columns: number[]; rows: number[] } {
  const cuts = new Set<number>([0]);
  for (const item of template.bands) { let x = 0; for (const entry of item.rooms) { x += entry.width; cuts.add(x); } }
  const xs = [...cuts].sort((a, b) => a - b);
  return { columns: xs.slice(1).map((x, index) => x - xs[index]!), rows: template.bands.map((item) => item.depth) };
}

function layGrid(template: LibraryTemplate, columns: number[], rows: number[]): Grid {
  const base = templateGrid(template);
  const baseXs = [0];
  for (const width of base.columns) baseXs.push(baseXs.at(-1)! + width);
  const xs = [0];
  for (const width of columns) xs.push(xs.at(-1)! + width);
  const ys = [0];
  for (const depth of rows) ys.push(ys.at(-1)! + depth);
  const types = new Map<string, RoomType>();
  const via = new Map<string, string>();
  const owner = template.bands.map((item) => {
    const row: (string | null)[] = new Array(columns.length).fill(null);
    let x = 0;
    for (const entry of item.rooms) {
      const from = baseXs.indexOf(x);
      const to = baseXs.indexOf(x + entry.width);
      for (let column = from; column < to; column += 1) row[column] = entry.type === "void" ? null : entry.name;
      if (entry.type !== "void") types.set(entry.name, entry.type);
      if (entry.via) via.set(entry.name, entry.via);
      x += entry.width;
    }
    return row;
  });
  return { xs, ys, owner, types, via };
}

const key = (point: Point) => `${point.x},${point.y}`;

/** The outline of the cells `inside` picks, walked clockwise on the drawing. */
function outlineOf(grid: Grid, inside: (row: number, column: number) => boolean): Point[] {
  const at = (row: number, column: number) => row >= 0 && column >= 0 && row < grid.owner.length && column < grid.xs.length - 1 && inside(row, column);
  const next = new Map<string, Point>();
  for (let row = 0; row < grid.owner.length; row += 1) for (let column = 0; column < grid.xs.length - 1; column += 1) {
    if (!at(row, column)) continue;
    const [x0, x1, y0, y1] = [grid.xs[column]!, grid.xs[column + 1]!, grid.ys[row]!, grid.ys[row + 1]!];
    if (!at(row - 1, column)) next.set(key({ x: x0, y: y0 }), { x: x1, y: y0 });
    if (!at(row, column + 1)) next.set(key({ x: x1, y: y0 }), { x: x1, y: y1 });
    if (!at(row + 1, column)) next.set(key({ x: x1, y: y1 }), { x: x0, y: y1 });
    if (!at(row, column - 1)) next.set(key({ x: x0, y: y1 }), { x: x0, y: y0 });
  }
  const first = [...next.keys()].map((value) => value.split(",").map(Number) as [number, number]).sort((a, b) => a[1] - b[1] || a[0] - b[0])[0];
  if (!first) return [];
  const loop: Point[] = [];
  let point: Point = { x: first[0], y: first[1] };
  for (let guard = 0; guard <= next.size; guard += 1) {
    loop.push(point);
    const following = next.get(key(point));
    if (!following) break;
    point = following;
    if (point.x === loop[0]!.x && point.y === loop[0]!.y) break;
  }
  if (loop.length !== next.size) throw new Error("A template's outline must be one piece with no holes");
  // Corners only: a point in the middle of a straight run is not one.
  return loop.filter((current, index) => {
    const before = loop[(index - 1 + loop.length) % loop.length]!;
    const after = loop[(index + 1) % loop.length]!;
    return (before.x - current.x) * (after.y - current.y) - (before.y - current.y) * (after.x - current.x) !== 0;
  });
}

/** Unit edges between two cells, or a cell and the outside, merged into runs along each line. */
function runsBetween(grid: Grid, test: (a: string | null, b: string | null) => boolean): Run[] {
  const pieces: [Point, Point][] = [];
  const cell = (row: number, column: number) => row >= 0 && column >= 0 && row < grid.owner.length && column < grid.xs.length - 1 ? grid.owner[row]![column]! : null;
  for (let row = 0; row <= grid.owner.length; row += 1) for (let column = 0; column < grid.xs.length - 1; column += 1) {
    if (test(cell(row - 1, column), cell(row, column))) pieces.push([{ x: grid.xs[column]!, y: grid.ys[row]! }, { x: grid.xs[column + 1]!, y: grid.ys[row]! }]);
  }
  for (let column = 0; column <= grid.xs.length - 1; column += 1) for (let row = 0; row < grid.owner.length; row += 1) {
    if (test(cell(row, column - 1), cell(row, column))) pieces.push([{ x: grid.xs[column]!, y: grid.ys[row]! }, { x: grid.xs[column]!, y: grid.ys[row + 1]! }]);
  }
  const runs: Run[] = [];
  for (const [start, end] of pieces) {
    const last = runs.at(-1);
    if (last && last.end.x === start.x && last.end.y === start.y && (last.start.x === end.x || last.start.y === end.y)) { last.end = end; last.length = Math.hypot(end.x - last.start.x, end.y - last.start.y); continue; }
    runs.push({ start, end, length: Math.hypot(end.x - start.x, end.y - start.y) });
  }
  return runs;
}

const both = (a: string, b: string) => (x: string | null, y: string | null) => (x === a && y === b) || (x === b && y === a);
const facing = (name: string, side?: "front") => (x: string | null, y: string | null) => side === "front" ? x === name && y === null : (x === name && y === null) || (x === null && y === name);

const WINDOW: Partial<Record<RoomType, { width: number; height: number; sill: number }>> = {
  bedroom: { width: 1500, height: 1200, sill: 900 }, master: { width: 1800, height: 1200, sill: 900 },
  living: { width: 2000, height: 1400, sill: 700 }, dining: { width: 1500, height: 1200, sill: 900 },
  kitchen: { width: 1200, height: 1050, sill: 1050 }, office: { width: 1200, height: 1200, sill: 900 },
  bath: { width: 600, height: 600, sill: 1500 }, toilet: { width: 500, height: 500, sill: 1600 },
  laundry: { width: 600, height: 600, sill: 1500 }, garage: { width: 900, height: 600, sill: 1500 },
};
const DOOR_WIDTH: Partial<Record<RoomType, number>> = { bath: 800, toilet: 700, laundry: 800, store: 800 };
const HUBS: RoomType[] = ["corridor", "living", "dining", "kitchen"];
const PRIVATE: RoomType[] = ["bedroom", "master", "bath", "toilet"];

/** The template's plan at the given column widths and row depths (its own, by default). */
export function buildTemplate(template: LibraryTemplate, sizes = templateGrid(template)): BuiltTemplate {
  const grid = layGrid(template, sizes.columns, sizes.rows);
  const outline = outlineOf(grid, (row, column) => grid.owner[row]![column] !== null);
  const corners = outline.map((point, index) => ({ id: `c${index + 1}`, x: point.x, y: point.y }));
  const outlineEdges = corners.map((corner, index) => ({ id: corner.id, start: corner, end: corners[(index + 1) % corners.length]! }));

  // Inside walls: every stretch between two different rooms, one wall per run.
  const wallRuns = runsBetween(grid, (a, b) => a !== null && b !== null && a !== b);
  const interiorWalls = wallRuns.map((run, index) => ({ id: `w${index + 1}`, start: run.start, end: run.end, thickness: INSIDE, height: HEIGHT, label: "Interior wall" }));

  const names = [...grid.types.keys()];
  const zones = names.map((name, index) => ({
    id: `room-${index + 1}`,
    name,
    boundary: outlineOf(grid, (row, column) => grid.owner[row]![column] === name),
    floorMaterial: "Unspecified", wallMaterial: "Paint", ceilingMaterial: "Gypsum board",
  }));

  // Where a run of edge sits: on an inside wall, or on an outline wall.
  const host = (run: Run): { wallId: string; from: number } | null => {
    for (const wall of [...interiorWalls.map((item) => ({ id: item.id, start: item.start, end: item.end })), ...outlineEdges]) {
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const length = Math.hypot(dx, dy);
      const off = (point: Point) => Math.abs((point.x - wall.start.x) * dy - (point.y - wall.start.y) * dx) / length;
      if (off(run.start) > 1 || off(run.end) > 1) continue;
      const along = (point: Point) => ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / length;
      const [a, b] = [along(run.start), along(run.end)].sort((p, q) => p - q);
      if (a! >= -1 && b! <= length + 1) return { wallId: wall.id, from: a! };
    }
    return null;
  };
  const taken = new Map<string, [number, number][]>();
  const free = (wallId: string, from: number, to: number) => !(taken.get(wallId) ?? []).some(([a, b]) => from < b + 150 && to > a - 150);
  const openings: Room["openings"] = [];
  const place = (id: string, kind: "door" | "window" | "passage", run: Run, width: number, options: { height?: number; sill?: number; label?: string; centred?: boolean }) => {
    const spot = host(run);
    if (!spot || run.length < width + 200) return false;
    // Centred if asked, else near the start; then either side of whatever is there already.
    const first = options.centred || run.length < width + 600 ? (run.length - width) / 2 : 300;
    const offset = [first, 300, run.length - 300 - width].map((at) => Math.round(spot.from + at)).find((at) => at >= spot.from + 99 && at + width <= spot.from + run.length - 99 && free(spot.wallId, at, at + width));
    if (offset === undefined) return false;
    taken.set(spot.wallId, [...(taken.get(spot.wallId) ?? []), [offset, offset + width]]);
    openings.push({ id, kind, wallId: spot.wallId, offset, width, height: options.height ?? (kind === "window" ? 1200 : 2100), sill: options.sill ?? 0, swing: kind === "door" ? "in-right" : "none", label: options.label ?? "" });
    return true;
  };
  const longest = (runs: Run[]) => [...runs].sort((a, b) => b.length - a.length);
  const connected = new Map<string, Set<string>>(names.map((name) => [name, new Set<string>()]));
  const join = (a: string, b: string, kind: "door" | "passage" = "door") => {
    if (connected.get(a)!.has(b)) return true;
    const type = grid.types.get(a)!;
    const other = grid.types.get(b)!;
    const width = kind === "passage" ? 1000 : DOOR_WIDTH[type] ?? DOOR_WIDTH[other] ?? 900;
    for (const run of longest(runsBetween(grid, both(a, b)))) {
      if (place(`door-${openings.length + 1}`, kind, run, width, { label: kind === "passage" ? "" : a })) { connected.get(a)!.add(b); connected.get(b)!.add(a); return true; }
    }
    return false;
  };
  const neighbours = (name: string) => names.filter((other) => other !== name && runsBetween(grid, both(name, other)).length);

  // The way in: the front door into the living room (or the first room on the front).
  const entrance = names.find((name) => grid.types.get(name) === "living" && runsBetween(grid, facing(name, "front")).length)
    ?? names.find((name) => runsBetween(grid, facing(name, "front")).length) ?? names[0]!;
  for (const run of longest(runsBetween(grid, facing(entrance, "front")))) if (place("entrance", "door", run, 1000, { label: "Entrance", centred: true })) break;
  for (const name of names.filter((item) => grid.types.get(item) === "garage")) {
    for (const run of longest(runsBetween(grid, facing(name, "front")))) if (place(`garage-door-${name}`, "door", run, 2500, { height: 2400, label: "Garage door", centred: true })) break;
  }

  // Every room opens onto the way round the house: its en-suite's bedroom,
  // or the corridor, or the living room, dining, kitchen — in that order.
  for (const name of names) {
    const type = grid.types.get(name)!;
    const via = grid.via.get(name);
    if (via) { join(name, via); continue; }
    if (type === "living" && name === entrance) continue;
    const options = neighbours(name).filter((other) => HUBS.includes(grid.types.get(other)!)).sort((a, b) => HUBS.indexOf(grid.types.get(a)!) - HUBS.indexOf(grid.types.get(b)!));
    for (const other of options) {
      const open = type === "corridor" && grid.types.get(other) === "living" || type === "living" && grid.types.get(other) === "corridor";
      if (join(name, other, open ? "passage" : "door")) break;
    }
  }
  for (const [a, b] of template.extraDoors ?? []) if (grid.types.has(a) && grid.types.has(b)) join(a, b, (grid.types.get(a) === "living" || grid.types.get(b) === "living") && (grid.types.get(a) !== "bedroom" && grid.types.get(b) !== "bedroom") ? "passage" : "door");
  // Anything still cut off is joined to whatever it can reach.
  for (let guard = 0; guard < names.length; guard += 1) {
    const reached = new Set<string>([entrance]);
    const queue = [entrance];
    while (queue.length) { const at = queue.shift()!; for (const other of connected.get(at)!) if (!reached.has(other)) { reached.add(other); queue.push(other); } }
    const stranded = names.filter((name) => !reached.has(name));
    if (!stranded.length) break;
    const open = (a: string, b: string) => [a, b].some((name) => grid.types.get(name) === "living") && [a, b].every((name) => !["bedroom", "master", "bath", "toilet"].includes(grid.types.get(name)!));
    // Through the open rooms first: nobody should walk through a bedroom or
    // a bathroom to get somewhere else.
    const rank = (name: string) => PRIVATE.includes(grid.types.get(name)!) ? 1 : 0;
    const candidates = stranded.sort((a, b) => rank(a) - rank(b));
    const bridged = candidates.some((name) => neighbours(name).filter((other) => reached.has(other)).some((other) => join(name, other, open(name, other) ? "passage" : "door")));
    if (!bridged) break;
  }

  // Windows on the outside walls: the longest free stretch, two in a living room.
  for (const name of names) {
    const spec = WINDOW[grid.types.get(name)!];
    if (!spec) continue;
    let count = 0;
    for (const run of longest(runsBetween(grid, facing(name)))) {
      // As wide as the room's window should be; narrower beside a door.
      const widths = [spec.width, spec.width * 0.75, 1200, 900].map((value) => Math.round(Math.min(value, spec.width, run.length - 600) / 50) * 50).filter((value, index, all) => value >= 500 && all.indexOf(value) === index);
      if (widths.some((width) => place(`window-${openings.length + 1}`, "window", run, width, { height: spec.height, sill: spec.sill, label: "Window", centred: true }))) count += 1;
      if (count >= (grid.types.get(name) === "living" || grid.types.get(name) === "master" ? 2 : 1)) break;
    }
  }

  const width = grid.xs.at(-1)!;
  const length = grid.ys.at(-1)!;
  const dimensions = [
    { id: "overall-x", start: { x: 0, y: -900 }, end: { x: width, y: -900 }, label: "Overall" },
    { id: "overall-y", start: { x: -900, y: 0 }, end: { x: -900, y: length }, label: "Overall" },
  ];
  const plan = roomSchema.parse({ version: 1, corners, wallThickness: WALL, ceilingHeight: HEIGHT, openings, runWalls: [], interiorWalls, zones, planColumns: [], planStairs: [], dimensions, planPlatforms: [] });
  const rooms = zones.map((zone) => { const xs = zone.boundary.map((point) => point.x); const ys = zone.boundary.map((point) => point.y); return { name: zone.name, type: grid.types.get(zone.name)!, width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...ys) - Math.min(...ys) }; });
  return {
    template, plan,
    width: width + WALL, length: length + WALL,
    area: Math.round(polygonArea(outline.map((point) => ({ x: point.x, y: point.y })), WALL) / 10_000) / 100,
    bedrooms: rooms.filter((item) => item.type === "bedroom" || item.type === "master").length,
    bathrooms: rooms.filter((item) => item.type === "bath" || item.type === "toilet").length,
    rooms,
  };
}

/** Floor area to the outside faces, in mm²: the centreline polygon grown by half a wall all round. */
function polygonArea(points: Point[], wall: number) {
  let area = 0;
  let perimeter = 0;
  for (let index = 0; index < points.length; index += 1) {
    const p = points[index]!;
    const q = points[(index + 1) % points.length]!;
    area += p.x * q.y - q.x * p.y;
    perimeter += Math.hypot(q.x - p.x, q.y - p.y);
  }
  return Math.abs(area) / 2 + perimeter * wall / 2 + wall * wall;
}

// ---------------------------------------------------------------------------
// Plots: what fits, what can be made to fit
// ---------------------------------------------------------------------------

export type Plot = {
  /** Along the road, m → mm. */
  width: number;
  /** Away from the road. */
  length: number;
  front: number;
  sides: number;
  rear: number;
};
export const DEFAULT_SETBACKS = { front: 3000, sides: 800, rear: 1500 };
export type FitStatus = "best" | "adjust" | "none";
export type Fit = { status: FitStatus; rotated: boolean; built: BuiltTemplate; adjusted: BuiltTemplate | null; minimumPlot: { width: number; length: number } };

export function usableArea(plot: Plot) {
  return { width: plot.width - 2 * plot.sides, length: plot.length - plot.front - plot.rear };
}

const roundUp = (mm: number) => Math.ceil(mm / 500) * 500;

/** Normal and turned a quarter, as it is, then adjusted. */
export function fitTemplate(template: LibraryTemplate, plot: Plot): Fit {
  const built = buildTemplate(template);
  const room = usableArea(plot);
  const minimumPlot = { width: roundUp(built.width + 2 * plot.sides), length: roundUp(built.length + plot.front + plot.rear) };
  const fits = (item: BuiltTemplate, rotated: boolean) => rotated ? item.length <= room.width && item.width <= room.length : item.width <= room.width && item.length <= room.length;
  if (fits(built, false)) return { status: "best", rotated: false, built, adjusted: null, minimumPlot };
  if (fits(built, true)) return { status: "best", rotated: true, built, adjusted: null, minimumPlot };
  for (const rotated of [false, true]) {
    const adjusted = adjustTemplate(template, rotated ? { width: room.length, length: room.width } : room);
    if (adjusted && fits(adjusted, rotated)) return { status: "adjust", rotated, built, adjusted, minimumPlot };
  }
  return { status: "none", rotated: false, built, adjusted: null, minimumPlot };
}

/**
 * The template made to fit `target` (outside size, its own axes) by changing
 * how wide its columns and how deep its rows are — never by scaling. A side
 * that has to shrink takes it from the rooms with room to spare; the other
 * side may grow to give the area back. Null when a room would fall below
 * what it needs, or more than a fifth would have to go.
 */
export function adjustTemplate(template: LibraryTemplate, target: { width: number; length: number }): BuiltTemplate | null {
  const base = templateGrid(template);
  const grid = layGrid(template, base.columns, base.rows);
  const typeOf = (name: string | null) => name === null ? "void" : grid.types.get(name)!;
  // What each room needs across: along a row, every stretch one room (or a
  // courtyard) takes; down a column, the same.
  const across: Need[] = grid.owner.flatMap((row) => stretches(row).map(({ from, to, name }) => ({ from, to, min: typeOf(name) === "corridor" ? 900 : ROOM_MINIMUM[typeOf(name)] })));
  const down: Need[] = base.columns.flatMap((_, column) => stretches(grid.owner.map((row) => row[column]!)).map(({ from, to, name }) => ({ from, to, min: typeOf(name) === "garage" ? GARAGE_LENGTH : ROOM_MINIMUM[typeOf(name)] })));
  const width = base.columns.reduce((sum, value) => sum + value, 0);
  const length = base.rows.reduce((sum, value) => sum + value, 0);
  // A corridor keeps its width when the house grows: rooms take the extra.
  const passage = (names: (string | null)[]) => names.every((name) => typeOf(name) === "corridor");
  const columnGrow = base.columns.map((size, column) => passage(grid.owner.map((row) => row[column]!)) ? 0 : size);
  const rowGrow = base.rows.map((size, row) => passage(grid.owner[row]!) ? 0 : size);
  // On a roomier plot it grows a little; on a tighter one it gives up no
  // more than a fifth.
  const wantWidth = Math.min(target.width - WALL, Math.round(width * 1.1 / 50) * 50);
  if (wantWidth < width * 0.8) return null;
  const columns = resize(base.columns, across, wantWidth, columnGrow);
  if (!columns) return null;
  // Narrower, it may grow longer to give the area back — up to the plot.
  const lost = Math.max(0, width - wantWidth);
  const goal = lost > 0 ? length + Math.round(lost * length / wantWidth) : Math.round(length * 1.1 / 50) * 50;
  const wantLength = Math.min(target.length - WALL, goal);
  if (wantLength < length * 0.8) return null;
  const rows = resize(base.rows, down, wantLength, rowGrow);
  if (!rows) return null;
  const built = buildTemplate(template, { columns, rows });
  const small = built.rooms.some((item) => Math.min(item.width, item.depth) < ROOM_MINIMUM[item.type] - 1 || (item.type === "garage" && Math.max(item.width, item.depth) < GARAGE_LENGTH - 1));
  return small ? null : built;
}

type Need = { from: number; to: number; min: number };

/** The runs of one owner along a line of cells: [from, to) by index. */
function stretches(line: (string | null)[]) {
  const result: { from: number; to: number; name: string | null }[] = [];
  line.forEach((name, index) => { const last = result.at(-1); if (last && last.name === name && last.to === index) last.to = index + 1; else result.push({ from: index, to: index + 1, name }); });
  return result;
}

/**
 * Sizes made to add up to `total`. Shrinking takes 50 mm at a time from
 * whichever column (or row) every room across it can best spare; null when
 * none can spare more. Growing goes to the rooms, in proportion.
 */
function resize(sizes: number[], needs: Need[], total: number, growth: number[]): number[] | null {
  const next = [...sizes];
  const sum = () => next.reduce((acc, value) => acc + value, 0);
  if (total >= sum()) {
    const extra = total - sum();
    const weight = growth.reduce((acc, value) => acc + value, 0) || 1;
    growth.forEach((share, index) => { next[index] = next[index]! + Math.floor(extra * share / weight / 50) * 50; });
    const widest = growth.indexOf(Math.max(...growth));
    next[widest] = next[widest]! + total - sum();
    return next;
  }
  const spare = (index: number) => Math.min(next[index]! - 300, ...needs.filter((need) => need.from <= index && index < need.to).map((need) => next.slice(need.from, need.to).reduce((acc, value) => acc + value, 0) - need.min));
  for (let guard = 0; sum() > total && guard < 1000; guard += 1) {
    let best = -1;
    let most = 0;
    next.forEach((_, index) => { const value = spare(index); if (value > most) { most = value; best = index; } });
    if (best < 0) return null;
    next[best] = next[best]! - Math.min(50, most, sum() - total);
  }
  return sum() === total ? next : null;
}

/** Best fit first, then what can be adjusted, closest to the wishes first. */
export function rankTemplates(plot: Plot, wishes: { bedrooms?: number | null; parking?: boolean | null; courtyard?: boolean | null; floors?: number | null } = {}) {
  const order: Record<FitStatus, number> = { best: 0, adjust: 1, none: 2 };
  const room = usableArea(plot);
  const score = (fit: Fit) => {
    const t = fit.built;
    let value = 0;
    if (wishes.bedrooms) value += Math.abs(Math.min(t.bedrooms, 5) - wishes.bedrooms) * 10;
    if (wishes.parking !== null && wishes.parking !== undefined && fit.built.template.parking !== wishes.parking) value += 15;
    if (wishes.courtyard !== null && wishes.courtyard !== undefined && fit.built.template.courtyard !== wishes.courtyard) value += 15;
    if (wishes.floors && (wishes.floors > 1) !== (fit.built.template.floors > 1)) value += 5;
    // Of plans that fit, the one using the plot best.
    value -= Math.min(1, (t.width * t.length) / Math.max(1, room.width * room.length)) * 5;
    return value;
  };
  return TEMPLATE_LIBRARY.map((template) => fitTemplate(template, plot)).sort((a, b) => order[a.status] - order[b.status] || score(a) - score(b));
}

// ---------------------------------------------------------------------------
// Facing the road
// ---------------------------------------------------------------------------

export type RoadSide = "north" | "south" | "east" | "west";

/**
 * The plan turned so its front faces the road — north up the drawing — and
 * a further quarter when the house is turned on its plot. Doors and windows
 * stay in their walls: they are measured along them, and turning does not
 * change that.
 */
export function facePlan(plan: Room, road: RoadSide, rotated: boolean): Room {
  const turns = (({ south: 0, west: 1, north: 2, east: 3 } as const)[road] + (rotated ? 1 : 0)) % 4;
  if (!turns) return plan;
  const turn = (point: Point): Point => { let { x, y } = point; for (let index = 0; index < turns; index += 1) [x, y] = [-y, x]; return { x, y }; };
  const turnedCorners = plan.corners.map((corner) => ({ ...corner, ...turn(corner) }));
  const minX = Math.min(...turnedCorners.map((point) => point.x));
  const minY = Math.min(...turnedCorners.map((point) => point.y));
  const place = <T extends Point>(point: T): T => { const next = turn(point); return { ...point, x: next.x - minX, y: next.y - minY }; };
  return roomSchema.parse({
    ...plan,
    corners: plan.corners.map(place),
    interiorWalls: (plan.interiorWalls ?? []).map((wall) => ({ ...wall, start: place(wall.start), end: place(wall.end) })),
    zones: (plan.zones ?? []).map((zone) => ({ ...zone, boundary: zone.boundary.map(place) })),
    dimensions: (plan.dimensions ?? []).map((item) => ({ ...item, start: place(item.start), end: place(item.end) })),
  });
}
