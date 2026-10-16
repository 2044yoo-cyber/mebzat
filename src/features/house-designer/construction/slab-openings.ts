import type { Ctx } from "./context";
import { stairOpenings } from "./rooms";
import { serviceHoles } from "./service-plan";

export type SlabOpening = { id: string; x0: number; y0: number; x1: number; y1: number; rotated: boolean };

/**
 * Everything cut through the slab that forms the floor of storey `levelIndex`
 * (the roof slab for one past the top): the stairs that arrive from below, and
 * the service shafts and riser sleeves that pass through every floor. One list,
 * so the slab, its reinforcement, the floor finish and the ceiling under it
 * all leave the same openings.
 */
export function slabOpenings(ctx: Ctx, levelIndex: number): SlabOpening[] {
  return [...stairOpenings(ctx, levelIndex), ...serviceHoles(ctx, levelIndex).map((h) => ({ ...h, rotated: false }))];
}
