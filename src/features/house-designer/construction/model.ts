import type { HouseProject } from "../types/project";
import { Ctx } from "./context";
import type { ApprovedBar } from "./helpers";
import { ENGINEERING_DISCLAIMER } from "./stages";
import { DEFAULT_OPTIONS, DEFAULT_RULES, type ConstructionModel, type EstimatingRules, type ModelOptions } from "./types";
import { generateSite, generateEarthworks } from "./generators/site";
import { generateFoundation } from "./generators/foundation";
import { generateGroundFloor } from "./generators/ground-floor";
import { generateFrame } from "./generators/frame";
import { generateStairs } from "./generators/stairs";
import { generateMasonry } from "./generators/masonry";
import { generateRoof } from "./generators/roof";
import { generateElectrical } from "./generators/electrical";
import { generatePlumbing } from "./generators/plumbing";
import { generateFinishes } from "./generators/finishes";
import { generateOpenings } from "./generators/openings";
import type { Shape, V3 } from "./geometry";

export type BuildExtras = {
  /** Reinforcement is quantified only from an approved schedule supplied here. */
  approvedBars?: ApprovedBar[];
};

/**
 * Reads a house project and works out the construction model: every
 * component with its identity, geometry, stage, layer and quantities.
 *
 * Pure and deterministic: the same project and options give the same ids,
 * the same shapes and the same numbers. The project is never modified.
 */
export function buildConstructionModel(
  project: HouseProject,
  options: Partial<ModelOptions> = {},
  rules: Partial<EstimatingRules> = {},
  extras: BuildExtras = {},
): ConstructionModel {
  const resolvedOptions: ModelOptions = { ...DEFAULT_OPTIONS, ...options };
  const resolvedRules: EstimatingRules = { ...DEFAULT_RULES, ...rules, allowances: { ...DEFAULT_RULES.allowances, ...(rules.allowances ?? {}) } };
  const ctx = new Ctx(project, resolvedOptions, resolvedRules, extras.approvedBars ?? []);
  if (project.levels.length === 0 || ctx.outline.length < 3) {
    ctx.warnings.push("This project has no closed floor plan yet, so there is nothing to build. Draw the plan first.");
  } else {
    for (const generate of GENERATORS) generate(ctx);
  }
  return {
    projectId: project.id,
    title: project.metadata.title,
    disclaimer: ENGINEERING_DISCLAIMER,
    options: resolvedOptions,
    rules: resolvedRules,
    storeys: ctx.levels.map((level) => ({ id: level.id, name: level.name, index: level.index, elevation: level.elevation, floorToFloor: level.floorToFloor, slabThickness: level.slabThickness })),
    components: ctx.components,
    bounds: boundsOf(ctx.components.flatMap((component) => component.shapes)),
    warnings: ctx.warnings,
  };
}

const GENERATORS: ((ctx: Ctx) => void)[] = [generateSite, generateEarthworks, generateFoundation, generateGroundFloor, generateFrame, generateStairs, generateMasonry, generateRoof, generateElectrical, generatePlumbing, generateFinishes, generateOpenings];

export function boundsOf(shapes: Shape[]): { min: V3; max: V3 } {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  const grow = (x: number, y: number, z: number) => {
    if (x < min.x) min.x = x; if (y < min.y) min.y = y; if (z < min.z) min.z = z;
    if (x > max.x) max.x = x; if (y > max.y) max.y = y; if (z > max.z) max.z = z;
  };
  for (const s of shapes) {
    if (s.t === "box") {
      const r = Math.hypot(s.s.x, s.s.y, s.s.z) / 2;
      const rotated = (s.rx ?? 0) !== 0 || (s.ry ?? 0) !== 0 || (s.rz ?? 0) !== 0;
      const rx = rotated ? r : s.s.x / 2; const ry = rotated ? r : s.s.y / 2; const rz = rotated ? r : s.s.z / 2;
      grow(s.c.x - rx, s.c.y - ry, s.c.z - rz); grow(s.c.x + rx, s.c.y + ry, s.c.z + rz);
    } else if (s.t === "cyl") {
      const h = s.len / 2;
      const ex = s.axis === "x" ? h : s.r; const ey = s.axis === "y" ? h : s.r; const ez = s.axis === "z" ? h : s.r;
      grow(s.c.x - ex, s.c.y - ey, s.c.z - ez); grow(s.c.x + ex, s.c.y + ey, s.c.z + ez);
    } else for (const p of s.poly) { grow(p.x, p.y, s.z0); grow(p.x, p.y, s.z1); }
  }
  if (!isFinite(min.x)) return { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
  return { min, max };
}
