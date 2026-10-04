import {
  type ProjectCategory,
  usesBuildingColumns,
} from "@/lib/constants/project-categories";
import type { BuildingType } from "@/types/database.types";

/**
 * The three columns 0004 built for houses, for whatever this project is now.
 *
 * Lives here rather than inside the server action because it is the rule that
 * decides whether a wardrobe can be carrying four bedrooms, and a `"use
 * server"` module can only export async functions — so a rule left in there
 * can only be checked by reading it.
 */
export type BuildingColumns = {
  building_type: BuildingType | null;
  bedrooms: number | null;
  floors: number | null;
};

/**
 * Cleared for a category that does not use them.
 *
 * Not merely "not rendered": a project recategorised from Building
 * Construction to Kitchen keeps whatever it was given while it was a building,
 * the project page finds a number where it checks for one, and the kitchen
 * shows "Bedrooms: 4". Hiding the input does not close that route; this does.
 */
export function buildingColumnsFor(
  category: ProjectCategory,
  input: {
    buildingType?: string | null;
    bedrooms?: number | null;
    floors?: number | null;
  },
): BuildingColumns {
  if (!usesBuildingColumns(category)) {
    return { building_type: null, bedrooms: null, floors: null };
  }

  return {
    building_type: (input.buildingType || null) as BuildingType | null,
    bedrooms: input.bedrooms ?? null,
    floors: input.floors ?? null,
  };
}

/**
 * Which image is the cover.
 *
 * The order of the images and the choice of cover are two different decisions
 * — the brief asks for both — so the cover is posted by name rather than taken
 * from position zero. It is checked against the list: a cover that is not one
 * of the project's own images would be a URL from anywhere rendered as this
 * project's card.
 */
export function pickCover(
  images: string[],
  raw: FormDataEntryValue | string | null,
): string | null {
  if (typeof raw === "string" && images.includes(raw)) return raw;
  return images[0] ?? null;
}
