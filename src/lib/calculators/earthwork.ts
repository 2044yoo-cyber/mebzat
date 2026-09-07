import { round, volumeFromCubicMetres } from "./units";

/**
 * Moving soil.
 *
 * Two things make earthwork different from every other volume on the site, and
 * both are here rather than left to the reader.
 *
 * **Bulking.** Soil that has been dug up occupies more space than the hole it
 * came out of — it has been loosened. A lorry is loaded in loose cubic metres
 * and the hole is measured in bank cubic metres, and the difference is 15–35%
 * depending on the material. Order haulage on the bank volume and a third of it
 * is left on site.
 *
 * **Compaction.** Fill going back in compacts the other way: to end up with a
 * cubic metre in place you have to bring more than a cubic metre loose.
 */

export const SOIL_TYPES = [
  { value: "sand", label: "Sand", density: 1600, bulking: 1.12 },
  { value: "gravel", label: "Gravel", density: 1700, bulking: 1.13 },
  { value: "loam", label: "Loam / topsoil", density: 1400, bulking: 1.25 },
  { value: "clay", label: "Clay", density: 1900, bulking: 1.3 },
  { value: "rock", label: "Broken rock", density: 2200, bulking: 1.5 },
  { value: "hardcore", label: "Hardcore / crushed stone", density: 2100, bulking: 1.15 },
] as const;

export type SoilTypeValue = (typeof SOIL_TYPES)[number]["value"];

export function soilType(value: string) {
  return SOIL_TYPES.find((soil) => soil.value === value) ?? SOIL_TYPES[2];
}

export type ExcavationResult = {
  bankVolume: number;
  looseVolume: number;
  cubicFeet: number;
  tonnes: number;
  formula: string[];
};

/** A rectangular dig, and what comes out of it. */
export function excavation(input: {
  length: number;
  width: number;
  depth: number;
  pits: number;
  soil: string;
}): ExcavationResult {
  const soil = soilType(input.soil);
  const one = input.length * input.width * input.depth;
  const bankVolume = one * input.pits;
  const looseVolume = bankVolume * soil.bulking;
  const tonnes = (bankVolume * soil.density) / 1000;

  return {
    bankVolume: round(bankVolume, 3),
    looseVolume: round(looseVolume, 3),
    cubicFeet: round(volumeFromCubicMetres(bankVolume, "ft3"), 2),
    tonnes: round(tonnes, 2),
    formula: [
      `${input.length} × ${input.width} × ${input.depth} = ${round(one, 4).toFixed(4)} m³ per pit`,
      `× ${input.pits} = ${round(bankVolume, 3).toFixed(3)} m³ in place`,
      `Bulking ×${soil.bulking} = ${round(looseVolume, 3).toFixed(3)} m³ loose, for haulage`,
      `Mass = ${round(bankVolume, 3).toFixed(3)} m³ × ${soil.density} kg/m³ = ${round(tonnes, 2).toFixed(2)} t`,
    ],
  };
}

export type BackfillResult = {
  excavated: number;
  occupied: number;
  backfill: number;
  looseRequired: number;
  /** Spoil left over once the hole is filled: the volume the structure took. */
  surplus: number;
  formula: string[];
  warnings: string[];
};

/**
 * How much goes back in.
 *
 * Excavated volume less whatever the structure now occupies. `compaction` is
 * how much loose material makes one compacted cubic metre — 1.25 is a normal
 * figure for granular fill in layers.
 */
export function backfill(input: {
  excavated: number;
  structure: number;
  compaction: number;
}): BackfillResult {
  const backfillVolume = input.excavated - input.structure;
  const warnings: string[] = [];

  if (backfillVolume < 0) {
    warnings.push(
      "The structure is larger than the excavation. Check both volumes — there is nothing to backfill.",
    );
  }

  const net = Math.max(0, backfillVolume);
  const looseRequired = net * Math.max(1, input.compaction);

  return {
    excavated: round(input.excavated, 3),
    occupied: round(input.structure, 3),
    backfill: round(net, 3),
    looseRequired: round(looseRequired, 3),
    surplus: round(Math.min(input.structure, input.excavated), 3),
    formula: [
      `${round(input.excavated, 3).toFixed(3)} m³ excavated − ${round(input.structure, 3).toFixed(3)} m³ occupied = ${round(net, 3).toFixed(3)} m³ to fill`,
      `Loose material needed = ${round(net, 3).toFixed(3)} × ${input.compaction} = ${round(looseRequired, 3).toFixed(3)} m³`,
      `Spoil to cart away = ${round(Math.min(input.structure, input.excavated), 3).toFixed(3)} m³, the volume the structure now occupies`,
    ],
    warnings,
  };
}
