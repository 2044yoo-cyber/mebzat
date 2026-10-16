import type { Ctx } from "./context";
import { rectPoly, type P2 } from "./geometry";
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

/** The line, x = this, where the slab is poured in two: the grid line nearest the middle of the building. Where two lie equally near, the eastern one. */
export function pourXCut(ctx: Ctx): number {
  const xs = ctx.project.structuralGrid.filter((g) => g.levelId === ctx.ground?.levelId && g.axis === "x").map((g) => g.position).sort((a, b) => a - b);
  const mid = (ctx.bounds.minX + ctx.bounds.maxX) / 2;
  if (xs.length === 0) return mid;
  return xs.reduce((best, x) => (Math.abs(x - mid) < Math.abs(best - mid) - 1e-9 || (Math.abs(Math.abs(x - mid) - Math.abs(best - mid)) < 1e-9 && x > best) ? x : best), xs[0]!);
}

/** The half of the plan on one side of the pour line: a rectangle far bigger than any building, counter-clockwise, to clip a slab against. */
export const halfPlane = (xcut: number, side: "west" | "east"): P2[] => (side === "west" ? rectPoly(-1e7, -1e7, xcut, 1e7) : rectPoly(xcut, -1e7, 1e7, 1e7));
