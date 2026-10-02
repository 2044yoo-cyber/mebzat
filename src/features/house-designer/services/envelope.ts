import {
  buildHouseBalconies,
  buildHouseCeilings,
  buildHouseSite,
  buildHouseVerandas,
  type HouseProject,
} from "../types/project";

/** Add Phase 6 envelope objects to older saved projects without changing plan geometry. */
export function ensureHouseEnvelopeProject(project: HouseProject): HouseProject {
  const ground = project.levels[0];
  const hasEntrance = ground
    ? project.doors.some((door) => door.levelId === ground.id && door.type !== "passage")
    : false;
  const needsCeilings = project.ceilings.length !== project.rooms.length;
  const needsSite = project.site === null;
  const needsVeranda = hasEntrance && project.verandas.length === 0;
  const needsBalcony = hasEntrance && project.levels.length > 1 && project.balconies.length === 0;
  if (!needsCeilings && !needsSite && !needsVeranda && !needsBalcony) return project;

  const now = new Date().toISOString();
  return {
    ...project,
    ceilings: buildHouseCeilings(project.rooms, project.levels, project.ceilings),
    site: buildHouseSite(project.rooms, project.site),
    verandas: buildHouseVerandas(project.levels, project.walls, project.doors, project.verandas),
    balconies: buildHouseBalconies(project.levels, project.walls, project.doors, project.balconies),
    materials: [...new Set([...project.materials, "Gypsum board", "Paving", "Steel", "Coated metal"])],
    metadata: { ...project.metadata, updatedAt: now },
    revisions: [...project.revisions, { id: crypto.randomUUID(), createdAt: now, note: "Added editable balcony, veranda, ceilings and site ground" }],
  };
}
