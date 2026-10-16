import type { P2 } from "./geometry";

/** Depth of the pre-wall duct that fixtures are mounted on and pipes run in, in a wet room. */
export const DUCT_DEPTH = 150;
export const DUCT_HEIGHT = 1700;

/** A local frame at a wall: `u` along the wall from the corner, `v` out from its face. */
export type Frame = { origin: P2; ux: number; uy: number; vx: number; vy: number };
export const local = (f: Frame, u: number, v: number): P2 => ({ x: f.origin.x + f.ux * u + f.vx * v, y: f.origin.y + f.uy * u + f.vy * v });
