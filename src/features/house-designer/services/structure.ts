import { buildStructuralGrid, type HouseProject } from "../types/project";
import { suggestColumns } from "./column-suggestions";

const automatic = (project: HouseProject, id: string, kind: "column" | "beam" | "grid") => project.levels.some((level) => id.startsWith(`${level.id}:${kind}:`));
const automaticFooting = (id: string) => id.startsWith("foundation:");

/** True once the plan has been given its structure. */
export function hasGeneratedStructure(project: HouseProject): boolean {
  return project.structuralColumns.some((item) => automatic(project, item.id, "column"))
    || project.structuralGrid.some((item) => automatic(project, item.id, "grid"))
    || project.foundations.some((item) => automaticFooting(item.id));
}

/** The plan alone: the generated structure taken off, anything placed by hand kept. */
export function withoutStructure(project: HouseProject): HouseProject {
  return {
    ...project,
    structuralColumns: project.structuralColumns.filter((item) => !automatic(project, item.id, "column")),
    structuralBeams: project.structuralBeams.filter((item) => !automatic(project, item.id, "beam")),
    structuralGrid: project.structuralGrid.filter((item) => !automatic(project, item.id, "grid")),
    foundations: project.foundations.filter((item) => !automaticFooting(item.id)),
  };
}

/**
 * The structure, generated last — from the finished plan, never while it is
 * being drawn. Columns where they are needed (corners, wall junctions, long
 * spans, kept clear of doors and windows; columns placed by hand count), the
 * grid through them, beams along every grid line from column to column, and
 * a footing under each ground-floor column. Preliminary: an engineer sizes
 * and confirms the real structure.
 */
export function generateStructureFromGrid(project: HouseProject): HouseProject {
  const options = project.modelingOptions;
  let next = withoutStructure(project);
  if (options?.structure === false) return next;

  const columns = [...next.structuralColumns];
  for (const level of next.levels) {
    if (!level.plan) continue;
    const height = level.plan.ceilingHeight ?? level.floorToFloorHeight;
    for (const [index, proposal] of suggestColumns({ ...next, structuralColumns: columns }, level.id).entries()) {
      // A corner's column is named after the corner, so regenerating after a
      // plan edit keeps it the same column.
      const corner = level.plan.corners.find((point) => Math.hypot(point.x - proposal.x, point.y - proposal.y) < 1);
      columns.push({ id: `${level.id}:column:${corner ? corner.id : `auto-${index + 1}`}`, levelId: level.id, x: proposal.x, y: proposal.y, elevation: level.elevation, width: proposal.width, depth: proposal.depth, height, type: "preliminary reinforced concrete", material: "Reinforced concrete" });
    }
  }
  const grid = buildStructuralGrid(next.levels, columns, []);

  // Beams follow the grid: along each line, from each column to the next.
  const beams: HouseProject["structuralBeams"] = [];
  for (const line of grid) {
    const level = next.levels.find((item) => item.id === line.levelId);
    if (!level?.plan) continue;
    const along = line.axis === "x" ? (point: { x: number; y: number }) => point.y : (point: { x: number; y: number }) => point.x;
    const on = columns
      .filter((column) => column.levelId === line.levelId && Math.abs((line.axis === "x" ? column.x : column.y) - line.position) < 1)
      .sort((a, b) => along(a) - along(b));
    const top = level.elevation + (level.plan.ceilingHeight ?? level.floorToFloorHeight);
    for (let index = 0; index + 1 < on.length; index += 1) {
      beams.push({ id: `${line.id.replace(":grid:", ":beam:")}:${index + 1}`, levelId: line.levelId, start: { x: on[index]!.x, y: on[index]!.y }, end: { x: on[index + 1]!.x, y: on[index + 1]!.y }, elevation: top - 400, width: 200, depth: 400, material: "Reinforced concrete" });
    }
  }

  const lowest = [...next.levels].sort((a, b) => a.elevation - b.elevation)[0];
  const footings = options?.foundations === false || !lowest ? [] : columns.filter((column) => column.levelId === lowest.id).map((column) => ({
    id: `foundation:${column.id}`, levelId: column.levelId, x: column.x, y: column.y, elevation: lowest.elevation - 450,
    width: Math.max(900, column.width * 3), depth: Math.max(900, column.depth * 3), thickness: 450, material: "Reinforced concrete",
  }));

  next = {
    ...next,
    structuralColumns: columns,
    structuralGrid: [...next.structuralGrid, ...grid],
    structuralBeams: [...next.structuralBeams, ...beams],
    foundations: [...next.foundations, ...footings],
    materials: [...new Set([...next.materials, "Reinforced concrete"])],
  };
  return next;
}

/** Regenerate, from the structure panel. */
export function generatePreliminaryStructure(project: HouseProject): HouseProject {
  const now = new Date().toISOString();
  const next = generateStructureFromGrid(project);
  return { ...next, metadata: { ...next.metadata, updatedAt: now }, revisions: [...next.revisions, { id: crypto.randomUUID(), createdAt: now, note: "Regenerated preliminary structure from the grid" }] };
}

export function ensurePhaseFourProject(project: HouseProject): HouseProject {
  if (project.modelingOptions) return project;
  if (project.structuralColumns.length > 0 && project.structuralBeams.length > 0 && project.structuralGrid.length > 0) return project;
  return generatePreliminaryStructure(project);
}
