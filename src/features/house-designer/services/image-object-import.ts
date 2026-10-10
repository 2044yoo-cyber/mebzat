/**
 * Explicit, calibrated annotations traced by a person over a floor-plan image.
 * The importer never guesses architectural openings, stair shape or furniture
 * from the pixel pattern: it requires user confirmation before creating BIM.
 * The endpoints are in ORIGINAL image pixels, not millimetres.
 */
import type { HouseProject, HouseWall } from "../types/project";
import { rebuildLevel } from "./project-edit";
import { OBJECT_LIBRARY } from "./object-library";
import { applyStairEdit, stairFields, stairPreset } from "./stair-geometry";

export type ImportedSymbolKind = "door" | "window" | "stair" | "furniture";
export type ImportedSymbol = {
  id: string;
  kind: ImportedSymbolKind;
  start: { x: number; y: number };
  end: { x: number; y: number };
  /** The existing editable furniture symbol's library ID. */
  furnitureId?: string;
  stairType?: "straight" | "l-shaped" | "u-shaped";
};
export type ImportSymbolsResult = {
  project: HouseProject;
  placed: Record<ImportedSymbolKind, number>;
  warnings: string[];
};
export const MAX_TRACED_SYMBOLS = 100;
const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));

export function applyTracedImageSymbols(
  original: HouseProject,
  raw: readonly ImportedSymbol[],
  mmPerPixel: number,
): ImportSymbolsResult {
  const placed: Record<ImportedSymbolKind, number> = { door: 0, window: 0, stair: 0, furniture: 0 };
  const warnings: string[] = [];
  if (!Number.isFinite(mmPerPixel) || mmPerPixel <= 0 || mmPerPixel > 100_000)
    return { project: original, placed, warnings: ["Invalid plan scale; mark a real-world dimension again."] };
  if (raw.length > MAX_TRACED_SYMBOLS)
    return { project: original, placed, warnings: [`Too many objects (maximum ${MAX_TRACED_SYMBOLS}).`] };
  const level = original.levels[0];
  if (!level?.plan) return { project: original, placed, warnings: ["The imported floor plan is missing."] };
  const mm = (p: { x: number; y: number }) => ({ x: p.x * mmPerPixel, y: p.y * mmPerPixel });
  let project = original;
  const openings: NonNullable<typeof level.plan>["openings"] = [...level.plan.openings];
  const components = [...project.components];
  const stairs = [...project.stairs];
  const wallById = new Map(project.walls.map(wall => [wall.id, wall]));

  for (const [index, mark] of raw.entries()) {
    const prefix = `${mark.kind} ${index + 1}`;
    if (!mark || !["door", "window", "stair", "furniture"].includes(mark.kind) ||
      !mark.start || !mark.end || ![mark.start.x, mark.start.y, mark.end.x, mark.end.y].every(Number.isFinite)) {
      warnings.push(`Item ${index + 1} has invalid coordinates and was skipped.`);
      continue;
    }
    const a = mm(mark.start), b = mm(mark.end);
    if (mark.kind === "door" || mark.kind === "window") {
      const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const length = d(a, b);
      const possible = project.walls
        .filter(wall => wall.levelId === level.id && d(wall.start, wall.end) >= (mark.kind === "door" ? 550 : 350))
        .map(wall => {
          const vx = wall.end.x - wall.start.x, vy = wall.end.y - wall.start.y;
          const size = Math.hypot(vx, vy);
          const t = clamp(((centre.x - wall.start.x) * vx + (centre.y - wall.start.y) * vy) / (size * size), 0, 1);
          const closest = { x: wall.start.x + t * vx, y: wall.start.y + t * vy };
          // Parallel mark and wall preferred over a nearest but unrelated wall.
          const aligned = length < 1 ? false : Math.abs((b.x - a.x) * vx + (b.y - a.y) * vy) / (length * size) > 0.77;
          return { wall, size, t, distance: d(centre, closest), aligned };
        })
        .filter(hit => hit.aligned)
        .sort((x, y) => x.distance - y.distance)[0];
      // Never invent a door in an unrelated wall when the user traced a swing
      // somewhere else. The user can move the mark nearer its host wall.
      if (!possible || possible.distance > 450) {
        warnings.push(`${prefix}: cannot identify a matching wall within 0.45 m. Trace the opening along its wall.`);
        continue;
      }
      const width = clamp(length, mark.kind === "door" ? 500 : 300, mark.kind === "door" ? 2400 : 4000);
      if (possible.size < width + 100) {
        warnings.push(`${prefix}: the host wall is shorter than this opening.`);
        continue;
      }
      const offset = clamp(possible.t * possible.size - width / 2, 50, possible.size - width - 50);
      const hostId = wallById.get(possible.wall.id)?.sourceWallId;
      if (!hostId) {
        warnings.push(`${prefix}: selected wall has no editable source geometry.`);
        continue;
      }
      // Never create overlapping door/window cutouts; both openings would
      // invalidate the host wall's geometry and the quantity takeoff.
      const overlap = openings.some(opening => opening.wallId === hostId &&
        offset < opening.offset + opening.width + 40 && opening.offset < offset + width + 40);
      if (overlap) {
        warnings.push(`${prefix}: another opening already occupies this wall position.`);
        continue;
      }
      openings.push({
        id: `traced-${mark.kind}-${index}`,
        kind: mark.kind,
        wallId: hostId,
        offset,
        width,
        height: mark.kind === "door" ? 2100 : 1400,
        sill: mark.kind === "door" ? 0 : 900,
        swing: mark.kind === "door" ? "in-right" : "none",
        label: `Traced ${mark.kind}`,
      });
      placed[mark.kind]++;
      continue;
    }

    const minX = Math.min(a.x, b.x), minY = Math.min(a.y, b.y);
    const width = Math.abs(a.x - b.x), depth = Math.abs(a.y - b.y);
    if (width < 250 || depth < 250) {
      warnings.push(`${prefix}: trace a footprint of at least 0.25 m on each side.`);
      continue;
    }
    if (mark.kind === "stair") {
      const kind = mark.stairType === "l-shaped" || mark.stairType === "u-shaped" ? mark.stairType : "straight";
      // The underlying stair engine makes BIM treads and risers. Sizes are
      // fitted to the traced box and remain editable after the import.
      const params = applyStairEdit(stairPreset(kind, level.floorToFloorHeight), {
        width: clamp(width, 600, 5000),
        length: clamp(depth, 1000, 15000),
      });
      const fields = stairFields(params);
      stairs.push({
        id: `traced-stair-${index}`,
        levelId: level.id,
        x: minX,
        y: minY,
        elevation: level.elevation,
        rotation: 0,
        material: "Reinforced concrete",
        ...fields,
      });
      placed.stair++;
      continue;
    }
    const furniture = OBJECT_LIBRARY.find(item => item.id === mark.furnitureId);
    if (!furniture) {
      warnings.push(`${prefix}: select the correct furniture type before importing.`);
      continue;
    }
    components.push({
      id: `traced-furniture-${index}`,
      levelId: level.id,
      family: furniture.id,
      name: furniture.name,
      x: minX,
      y: minY,
      elevation: level.elevation + (furniture.elevation ?? 0),
      width: clamp(width, 250, 15_000),
      depth: clamp(depth, 250, 15_000),
      height: furniture.height,
      rotation: 0,
      material: furniture.material,
      source: "library",
    });
    placed.furniture++;
  }
  if (placed.door || placed.window) {
    project = rebuildLevel(project, level.id, { ...level.plan, openings });
  }
  project = { ...project, components, stairs };
  return { project, placed, warnings };
}
