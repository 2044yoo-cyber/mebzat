import { round } from "./units";

/**
 * Cement-and-sand mortar, and everything made of it.
 *
 * Mortar, plaster and screed are the same calculation three times: a volume, a
 * ratio, and the fact that dry constituents pack down when you wet them. They
 * share this function rather than each having their own copy with its own
 * slightly different factor.
 *
 * The dry factor is 1.33 for cement-sand mixes — mix a cubic metre of dry sand
 * and cement and you get about three-quarters of a cubic metre of mortar, the
 * rest having gone into the voids. (Concrete uses 1.54 because the coarse
 * aggregate leaves bigger voids; that one lives in the takeoff engine.)
 */

/** A 50 kg bag of cement is about this much loose volume. */
export const CEMENT_BAG_M3 = 0.0347;
export const CEMENT_BAG_KG = 50;

/** Dry volume is this much more than the wet mortar it makes. */
export const MORTAR_DRY_FACTOR = 1.33;

/** Cement : sand, as mixed on Ethiopian sites. */
export const MORTAR_MIXES = [
  { value: "1:3", label: "1:3 — strong (screed, external plaster)", cement: 1, sand: 3 },
  { value: "1:4", label: "1:4 — general masonry", cement: 1, sand: 4 },
  { value: "1:5", label: "1:5 — internal plaster", cement: 1, sand: 5 },
  { value: "1:6", label: "1:6 — lean / blockwork", cement: 1, sand: 6 },
] as const;

export type MortarMixValue = (typeof MORTAR_MIXES)[number]["value"];

export function mortarMix(value: string) {
  return MORTAR_MIXES.find((mix) => mix.value === value) ?? MORTAR_MIXES[1];
}

export type MixResult = {
  /** Wet volume as measured, m³. */
  wetVolume: number;
  /** With waste, m³. */
  orderedVolume: number;
  dryVolume: number;
  cementBags: number;
  cementKg: number;
  sandM3: number;
  formula: string[];
};

/**
 * Cement and sand for a wet volume of mortar.
 *
 * The bags are rounded up because cement is sold in bags: 6.2 bags is seven
 * bags on the delivery note, and a calculator that says 6.2 has quietly left
 * somebody short.
 */
export function cementSandForVolume(
  wetVolume: number,
  mixValue: string,
  wastePercent: number,
): MixResult {
  const mix = mortarMix(mixValue);
  const parts = mix.cement + mix.sand;
  const orderedVolume = wetVolume * (1 + Math.max(0, wastePercent) / 100);
  const dryVolume = orderedVolume * MORTAR_DRY_FACTOR;

  const cementM3 = (dryVolume * mix.cement) / parts;
  const sandM3 = (dryVolume * mix.sand) / parts;
  const cementBags = Math.ceil(cementM3 / CEMENT_BAG_M3);

  return {
    wetVolume: round(wetVolume, 3),
    orderedVolume: round(orderedVolume, 3),
    dryVolume: round(dryVolume, 3),
    cementBags,
    cementKg: cementBags * CEMENT_BAG_KG,
    sandM3: round(sandM3, 2),
    formula: [
      `Wet volume ${wetVolume.toFixed(3)} m³ + ${wastePercent}% waste = ${round(orderedVolume, 3).toFixed(3)} m³`,
      `Dry volume = ${round(orderedVolume, 3).toFixed(3)} × ${MORTAR_DRY_FACTOR} = ${round(dryVolume, 3).toFixed(3)} m³`,
      `Split ${mix.cement}:${mix.sand} → cement ${round(cementM3, 3).toFixed(3)} m³, sand ${round(sandM3, 2).toFixed(2)} m³`,
      `Cement ${round(cementM3, 3).toFixed(3)} m³ ÷ ${CEMENT_BAG_M3} m³/bag = ${cementBags} bags (${cementBags * CEMENT_BAG_KG} kg)`,
    ],
  };
}
