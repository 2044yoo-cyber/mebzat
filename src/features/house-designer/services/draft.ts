import {
  houseProjectSchema,
  type HouseProject,
} from "../types/project";

const DRAFT_VERSION = 1;
const DRAFT_TTL = 14 * 24 * 60 * 60 * 1000;

type HouseDraft = {
  version: number;
  savedAt: number;
  project: HouseProject;
};

export function houseDraftKey(userId: string): string {
  return `medosha:house-design:${userId}`;
}

export function readHouseDraft(storage: Storage, key: string): HouseDraft | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<HouseDraft>;
    if (
      value.version !== DRAFT_VERSION ||
      typeof value.savedAt !== "number" ||
      Date.now() - value.savedAt > DRAFT_TTL
    ) {
      return null;
    }
    const project = houseProjectSchema.safeParse(value.project);
    return project.success
      ? { version: DRAFT_VERSION, savedAt: value.savedAt, project: project.data }
      : null;
  } catch {
    return null;
  }
}

export function writeHouseDraft(storage: Storage, key: string, project: HouseProject): boolean {
  try {
    storage.setItem(
      key,
      JSON.stringify({ version: DRAFT_VERSION, savedAt: Date.now(), project } satisfies HouseDraft),
    );
    return true;
  } catch {
    return false;
  }
}
