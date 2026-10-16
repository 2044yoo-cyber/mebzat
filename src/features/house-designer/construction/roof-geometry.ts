import { ASSUME } from "./context";

/**
 * The few roof dimensions that other parts of the model have to agree on: the
 * pitched roof's eaves, where the gutter hangs, the gable walls at its ends, and
 * the flat roof's parapet. The roof generator draws from them and the rainwater
 * pipes start from them, so a downpipe always begins at the gutter or the outlet
 * that is really there.
 */

export const PITCH_DEG = 25;
export const OVERHANG = 450;
export const TRUSS_D = 100;
/** Wall plate inset from the slab edge. */
export const PLATE = 100;
/**
 * The plates stand this high on the roof slab, so the rafters, which run on past the plates to the eaves, clear the edge of the slab:
 * at 25° a rafter drops 0.47 mm for every millimetre it runs out, and the slab edge is a plate's inset and the frame's half width away
 * (250 mm for 300 mm columns). 200 mm clears columns up to 550 mm square.
 */
export const PLATE_H = 200;
/** The rafters stop this far short of the eaves tip: the fascia is fixed to their ends, and the covering runs on past it into the gutter. */
export const FASCIA_SETBACK = 80;

const THETA = (PITCH_DEG * Math.PI) / 180;

/** The top surface of a rafter above the top of the plates, straight up at the bearing: half its depth to its centre line, and half of it again along the slope. */
export const RAFTER_TOP = TRUSS_D / 2 + TRUSS_D / 2 / Math.cos(THETA);

/**
 * The pitched roof's covering: its area in plan (the eaves overhang the slab at the gables by `OVERHANG`, and by
 * `OVERHANG` beyond the wall plates along the eaves) and along the slope. The roof generator and the building
 * configurator both read it from here, so the area quoted for a building is the area that is drawn.
 */
export function pitchedCover(lengthX: number, depthY: number): { plan: number; sloped: number; spanY: number } {
  const spanY = depthY - 2 * PLATE;
  const plan = (lengthX + 2 * OVERHANG) * (spanY + 2 * OVERHANG) * 1e-6;
  return { plan, sloped: plan / Math.cos(THETA), spanY };
}

/** Where the eaves gutters hang: the two y positions and the z of their centre line. */
export function pitchedGutter(bounds: { minY: number; maxY: number }, slabTop: number): { southY: number; northY: number; z: number } {
  const plateTop = slabTop + PLATE_H;
  return {
    southY: bounds.minY + PLATE - OVERHANG,
    northY: bounds.maxY - PLATE + OVERHANG,
    z: plateTop + TRUSS_D + 25 - OVERHANG * Math.tan(THETA) - 40,
  };
}

/** The top of the rafters above the roof slab, `s` along the span from the south plate (negative out over the south eaves, more than `spanY` out over the north ones). */
export const rafterTopAt = (s: number, spanY: number): number => PLATE_H + RAFTER_TOP + Math.min(s, spanY - s) * Math.tan(THETA);

/**
 * A gable wall seen from the end, as (s, height above the roof slab) corners: from the outer face of one eaves wall to the outer face
 * of the other, up to the top of the rafters, so it closes the end of the roof void and the covering lies on it. `s` runs along the span from the
 * south plate; `wallT` is the thickness of the wall.
 */
export function gableOutline(spanY: number, wallT: number): { s: number; z: number }[] {
  const out = PLATE + wallT / 2;
  const a = -out;
  const b = spanY + out;
  return [{ s: a, z: 0 }, { s: b, z: 0 }, { s: b, z: rafterTopAt(b, spanY) }, { s: spanY / 2, z: rafterTopAt(spanY / 2, spanY) }, { s: a, z: rafterTopAt(a, spanY) }];
}

/** The height of the parapet round a flat roof, mm: the building's own when it has one (a template sets it), the assumption otherwise. */
export const parapetHeightOf = (options: { parapetHeight?: number }): number => (options.parapetHeight && options.parapetHeight > 0 ? options.parapetHeight : ASSUME.parapetHeight);
