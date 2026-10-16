import type { Ctx } from "./context";
import type { P2 } from "./geometry";
import { offsetPolygon } from "./region";

/**
 * The slab as it is cast. The columns and the edge beams stand on the plan outline, so the slab runs out past
 * it by half the widest of them: to the outer face of the frame. Without that the outer half of each edge
 * column, and of each edge beam, would have no slab over it between the soffit and the top of the slab.
 */
export function frameHalfOf(ctx: Ctx, levelId: string): number {
  const columns = ctx.project.structuralColumns.filter((c) => c.levelId === levelId);
  const beams = ctx.project.structuralBeams.filter((b) => b.levelId === levelId);
  return Math.max(0, ...columns.map((c) => Math.max(c.width, c.depth) / 2), ...beams.map((b) => b.width / 2));
}

/** The outline of the slab over the storey `levelId`, as cast. */
export function slabCastOutline(ctx: Ctx, levelId: string): P2[] {
  const half = frameHalfOf(ctx, levelId);
  return half > 0 ? offsetPolygon(ctx.outline, half) : ctx.outline;
}
