import {
  buildStructuralBeams,
  buildStructuralColumns,
  buildStructuralGrid,
  type HouseProject,
} from "../types/project";

/** Preliminary layout only; a licensed engineer must verify it before construction. */
export function generatePreliminaryStructure(project: HouseProject): HouseProject {
  const now = new Date().toISOString();
  const structuralColumns = buildStructuralColumns(project.levels, project.structuralColumns);
  return {
    ...project,
    structuralColumns,
    structuralBeams: buildStructuralBeams(project.walls, project.levels, project.structuralBeams),
    structuralGrid: buildStructuralGrid(project.levels, structuralColumns, project.structuralGrid),
    materials: [...new Set([...project.materials, "Reinforced concrete"])],
    metadata: { ...project.metadata, updatedAt: now },
    revisions: [...project.revisions, { id: crypto.randomUUID(), createdAt: now, note: "Regenerated preliminary structural layout" }],
  };
}

export function ensurePhaseFourProject(project: HouseProject): HouseProject {
  if (project.modelingOptions) return project;
  if (project.structuralColumns.length > 0 && project.structuralBeams.length > 0 && project.structuralGrid.length > 0) return project;
  return generatePreliminaryStructure(project);
}
