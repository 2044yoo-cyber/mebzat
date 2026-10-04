import type { DisplayUnits } from "./workspace-options";
import type { HouseProject, HouseSelection } from "../types/project";

/**
 * What was measured, in words a professional can copy into Revit or ArchiCAD.
 *
 * Everything is kept in millimetres in the model; this only formats. The
 * labels are stable for a given plan — Wall A is the same wall every time the
 * list is read — because they are derived from the model's own order rather
 * than from anything on screen.
 */
export type MeasurementGroup = "Rooms" | "Walls" | "Doors" | "Windows" | "Furniture" | "Columns" | "Stairs" | "Measurements";

export type Measurement = {
  id: string;
  group: MeasurementGroup;
  label: string;
  /** The figures, formatted: "4.20 × 5.10 m · 21.42 m² · perimeter 18.60 m". */
  value: string;
  selection: HouseSelection;
};

const UNIT_LABEL: Record<DisplayUnits, string> = { mm: "mm", cm: "cm", m: "m" };

/** A length in the project's units: whole millimetres, tenths of a centimetre, metres to the millimetre. */
export function formatLength(mm: number, unit: DisplayUnits, metreDecimals = 3): string {
  if (unit === "mm") return `${Math.round(mm)} mm`;
  if (unit === "cm") return `${trim((mm / 10).toFixed(1))} cm`;
  return `${(mm / 1000).toFixed(metreDecimals)} m`;
}

/** Two lengths as a size, the unit written once: "900 × 2100 mm". */
export function formatSize(a: number, b: number, unit: DisplayUnits, metreDecimals = 3): string {
  const one = (value: number) => formatLength(value, unit, metreDecimals).replace(/ (mm|cm|m)$/, "");
  return `${one(a)} × ${one(b)} ${UNIT_LABEL[unit]}`;
}

export function formatArea(m2: number): string {
  return `${m2.toFixed(2)} m²`;
}

export function polygonArea(points: readonly { x: number; y: number }[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2 / 1_000_000;
}

export function polygonPerimeter(points: readonly { x: number; y: number }[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

function boundsOf(points: readonly { x: number; y: number }[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...ys) - Math.min(...ys) };
}

/** True when the outline is an axis-aligned rectangle, so "width × length" is the whole story. */
function isRectangle(points: readonly { x: number; y: number }[]): boolean {
  if (points.length !== 4) return false;
  return points.every((point, index) => {
    const next = points[(index + 1) % 4]!;
    return Math.abs(point.x - next.x) < 1 || Math.abs(point.y - next.y) < 1;
  });
}

export function pointInPolygon(point: { x: number; y: number }, polygon: readonly { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** A, B, … Z, AA, AB — a spreadsheet's column letters, which never run out. */
export function letters(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

/** The rooms either side of a wall, by name: what "Kitchen Wall A" is made of. */
export function wallRooms(project: HouseProject, wallId: string): string[] {
  const wall = project.walls.find((item) => item.id === wallId);
  if (!wall) return [];
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  if (length < 1) return [];
  const middle = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  const normal = { x: -(wall.end.y - wall.start.y) / length, y: (wall.end.x - wall.start.x) / length };
  const reach = wall.thickness / 2 + 60;
  const names: string[] = [];
  for (const side of [1, -1]) {
    const probe = { x: middle.x + normal.x * reach * side, y: middle.y + normal.y * reach * side };
    const room = project.rooms.find((item) => item.levelId === wall.levelId && pointInPolygon(probe, item.boundary));
    if (room && !names.includes(room.name)) names.push(room.name);
  }
  return names;
}

/** Wall labels for a level: Wall A, Wall B, … in the model's own order. */
export function wallLabels(project: HouseProject, levelId: string): Map<string, string> {
  return new Map(project.walls.filter((wall) => wall.levelId === levelId).map((wall, index) => [wall.id, `Wall ${letters(index)}`]));
}

export function levelMeasurements(project: HouseProject, levelId: string, unit: DisplayUnits = project.displayUnits ?? "mm"): Measurement[] {
  const result: Measurement[] = [];
  const on = <T extends { levelId: string }>(items: readonly T[]) => items.filter((item) => item.levelId === levelId);

  for (const room of on(project.rooms)) {
    const size = boundsOf(room.boundary);
    const area = polygonArea(room.boundary);
    const perimeter = polygonPerimeter(room.boundary);
    const prefix = isRectangle(room.boundary) ? "" : "overall ";
    result.push({
      id: room.id,
      group: "Rooms",
      label: room.name,
      value: `${prefix}${formatSize(size.width, size.depth, unit, 2)} · ${formatArea(area)} · perimeter ${formatLength(perimeter, unit, 2)}`,
      selection: { kind: "room", id: room.id },
    });
  }

  const labels = wallLabels(project, levelId);
  for (const wall of on(project.walls)) {
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    const rooms = wallRooms(project, wall.id);
    result.push({
      id: wall.id,
      group: "Walls",
      label: rooms.length ? `${labels.get(wall.id)} (${rooms.join(" / ")})` : labels.get(wall.id)!,
      value: `${formatLength(length, unit)} · thickness ${formatLength(wall.thickness, unit)} · height ${formatLength(wall.height, unit)}`,
      selection: { kind: "wall", id: wall.id },
    });
  }

  on(project.doors).forEach((door, index) => result.push({
    id: door.id, group: "Doors", label: `Door D${index + 1}`,
    value: formatSize(door.width, door.height, unit),
    selection: { kind: "door", id: door.id },
  }));
  on(project.windows).forEach((window, index) => result.push({
    id: window.id, group: "Windows", label: `Window W${index + 1}`,
    value: `${formatSize(window.width, window.height, unit)} · sill ${formatLength(window.sillHeight, unit)}`,
    selection: { kind: "window", id: window.id },
  }));
  on(project.components).forEach((item) => result.push({
    id: item.id, group: "Furniture", label: item.name,
    value: `${formatSize(item.width, item.depth, unit)} · height ${formatLength(item.height, unit)}`,
    selection: { kind: "component", id: item.id },
  }));
  on(project.structuralColumns).forEach((column, index) => result.push({
    id: column.id, group: "Columns", label: `Column C${index + 1}`,
    value: formatSize(column.width, column.depth, unit),
    selection: { kind: "column", id: column.id },
  }));
  on(project.stairs).forEach((stair, index) => result.push({
    id: stair.id, group: "Stairs", label: `Stair S${index + 1}`,
    value: `${formatSize(stair.width, stair.length, unit)} · ${stair.steps} steps`,
    selection: { kind: "stair", id: stair.id },
  }));
  on(project.annotations).filter((item) => item.kind === "dimension" && item.end).forEach((item, index) => {
    const length = Math.hypot(item.end!.x - item.start.x, item.end!.y - item.start.y);
    result.push({
      id: item.id, group: "Measurements", label: `Measurement M${index + 1}`,
      value: formatLength(length, unit),
      selection: { kind: "annotation", id: item.id },
    });
  });
  return result;
}

/** One line per item, ready to paste: "Living Room: 4.20 × 5.10 m · 21.42 m² · …". */
export function measurementText(items: readonly Measurement[], heading?: string): string {
  const lines = items.map((item) => `${item.label}: ${item.value}`);
  return heading ? [heading, ...lines].join("\n") : lines.join("\n");
}

function trim(value: string) {
  return value.replace(/\.0$/, "");
}
