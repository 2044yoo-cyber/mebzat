import type { HouseRoof } from "../types/project";

/** A pitched roof's rise from its slope: tan(slope) × half the shorter span. A roof with no slope keeps its stated height. */
export function pitchedRise(roof: Pick<HouseRoof, "slope" | "height">, width: number, depth: number) {
  const half = Math.min(width, depth) / 2;
  return roof.slope > 0 ? Math.tan((Math.min(roof.slope, 60) * Math.PI) / 180) * half : roof.height;
}
