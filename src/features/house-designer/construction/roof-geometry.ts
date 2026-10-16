/**
 * The few roof dimensions that other parts of the model have to agree on: the
 * pitched roof's eaves, where the gutter hangs, and the flat roof's outlets.
 * The roof generator draws from them and the rainwater pipes start from them,
 * so a downpipe always begins at the gutter or the outlet that is really there.
 */

export const PITCH_DEG = 25;
export const OVERHANG = 450;
export const TRUSS_D = 100;
/** Wall plate inset from the slab edge. */
export const PLATE = 100;

/** Where the eaves gutters hang: the two y positions and the z of their centre line. */
export function pitchedGutter(bounds: { minY: number; maxY: number }, slabTop: number): { southY: number; northY: number; z: number } {
  const theta = (PITCH_DEG * Math.PI) / 180;
  const plateTop = slabTop + 50;
  return {
    southY: bounds.minY + PLATE - OVERHANG,
    northY: bounds.maxY - PLATE + OVERHANG,
    z: plateTop + TRUSS_D + 25 - OVERHANG * Math.tan(theta) - 40,
  };
}
