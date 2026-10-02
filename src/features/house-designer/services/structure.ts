import {
  buildStructuralBeams,
  buildStructuralColumns,
  type HouseProject,
} from "../types/project";

/** Preliminary layout only; a licensed engineer must verify it before construction. */
export function generatePreliminaryStructure(project: HouseProject): HouseProject {
  const now = new Date().toISOString();
  return {
    ...project,
    structuralColumns: buildStructuralColumns(project.levels, project.structuralColumns),
    structuralBeams: buildStructuralBeams(project.walls, project.levels, project.structuralBeams),
    materials: [...new Set([...project.materials, "Reinforced concrete"])],
    metadata: { ...project.metadata, updatedAt: now },
    revisions: [...project.revisions, { id: crypto.randomUUID(), createdAt: now, note: "Regenerated preliminary structural layout" }],
  };
}

export function ensurePhaseFourProject(project: HouseProject): HouseProject {
  if (project.structuralColumns.length > 0 && project.structuralBeams.length > 0) return project;
  return generatePreliminaryStructure(project);
}
