/**
 * Units, and the arithmetic of getting between them.
 *
 * Every calculator here takes numbers a person typed and produces numbers a
 * person will buy things with, so the conversion has to happen in exactly one
 * place. The alternative — each calculator remembering that a foot is 0.3048 m
 * — is how one screen quietly disagrees with another.
 *
 * The rule throughout: **convert to SI on the way in, compute in SI, convert on
 * the way out.** Nothing in the middle of a calculation knows what the user
 * picked in a dropdown.
 */

// ---------------------------------------------------------------------------
// Length
// ---------------------------------------------------------------------------

/** Metres per one of each unit. Exact where the definition is exact. */
export const LENGTH_IN_METRES = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  km: 1000,
  in: 0.0254,
  ft: 0.3048,
  yd: 0.9144,
} as const;

export type LengthUnit = keyof typeof LENGTH_IN_METRES;

export const LENGTH_UNITS = Object.keys(LENGTH_IN_METRES) as LengthUnit[];

export const LENGTH_LABELS: Record<LengthUnit, string> = {
  mm: "mm",
  cm: "cm",
  m: "m",
  km: "km",
  in: "in",
  ft: "ft",
  yd: "yd",
};

/** Any length into metres. */
export function toMetres(value: number, unit: LengthUnit): number {
  return value * LENGTH_IN_METRES[unit];
}

/** Metres into any length. */
export function fromMetres(metres: number, unit: LengthUnit): number {
  return metres / LENGTH_IN_METRES[unit];
}

// ---------------------------------------------------------------------------
// Area
//
// Derived from length rather than tabulated separately: a square foot is a foot
// squared, and writing 0.09290304 by hand is a typo waiting to happen.
// ---------------------------------------------------------------------------

export const AREA_UNITS = ["m2", "ft2", "cm2", "in2", "yd2"] as const;
export type AreaUnit = (typeof AREA_UNITS)[number];

export const AREA_LABELS: Record<AreaUnit, string> = {
  m2: "m²",
  ft2: "ft²",
  cm2: "cm²",
  in2: "in²",
  yd2: "yd²",
};

const AREA_BASE: Record<AreaUnit, LengthUnit> = {
  m2: "m",
  ft2: "ft",
  cm2: "cm",
  in2: "in",
  yd2: "yd",
};

export function areaInSquareMetres(value: number, unit: AreaUnit): number {
  const side = LENGTH_IN_METRES[AREA_BASE[unit]];
  return value * side * side;
}

export function areaFromSquareMetres(squareMetres: number, unit: AreaUnit): number {
  const side = LENGTH_IN_METRES[AREA_BASE[unit]];
  return squareMetres / (side * side);
}

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------

export const VOLUME_UNITS = ["m3", "ft3", "cm3", "in3", "yd3", "litre"] as const;
export type VolumeUnit = (typeof VOLUME_UNITS)[number];

export const VOLUME_LABELS: Record<VolumeUnit, string> = {
  m3: "m³",
  ft3: "ft³",
  cm3: "cm³",
  in3: "in³",
  yd3: "yd³",
  litre: "L",
};

/** Cubic metres per one of each unit. */
const VOLUME_IN_CUBIC_METRES: Record<VolumeUnit, number> = {
  m3: 1,
  ft3: LENGTH_IN_METRES.ft ** 3,
  cm3: LENGTH_IN_METRES.cm ** 3,
  in3: LENGTH_IN_METRES.in ** 3,
  yd3: LENGTH_IN_METRES.yd ** 3,
  litre: 0.001,
};

export function volumeInCubicMetres(value: number, unit: VolumeUnit): number {
  return value * VOLUME_IN_CUBIC_METRES[unit];
}

export function volumeFromCubicMetres(cubicMetres: number, unit: VolumeUnit): number {
  return cubicMetres / VOLUME_IN_CUBIC_METRES[unit];
}

// ---------------------------------------------------------------------------
// Mass
// ---------------------------------------------------------------------------

export const MASS_UNITS = ["kg", "tonne", "lb", "g"] as const;
export type MassUnit = (typeof MASS_UNITS)[number];

export const MASS_LABELS: Record<MassUnit, string> = {
  kg: "kg",
  tonne: "t",
  lb: "lb",
  g: "g",
};

/** Kilogrammes per one of each unit. The pound is exact by definition. */
const MASS_IN_KG: Record<MassUnit, number> = {
  kg: 1,
  tonne: 1000,
  lb: 0.45359237,
  g: 0.001,
};

export function massInKg(value: number, unit: MassUnit): number {
  return value * MASS_IN_KG[unit];
}

export function massFromKg(kg: number, unit: MassUnit): number {
  return kg / MASS_IN_KG[unit];
}

// ---------------------------------------------------------------------------
// Rounding and presentation
// ---------------------------------------------------------------------------

/**
 * Round to a number of decimal places.
 *
 * `Math.round(x * 100) / 100` is the usual one-liner and it is wrong often
 * enough to matter: 1.005 × 100 is 100.49999999999999 in binary floating point,
 * so it rounds down. Going via the exponent notation avoids that class of
 * surprise for the magnitudes a calculator deals in.
 */
export function round(value: number, places = 2): number {
  if (!Number.isFinite(value)) return 0;
  const shifted = Number(`${value}e${places}`);
  if (!Number.isFinite(shifted)) return Number(value.toFixed(places));
  return Number(`${Math.round(shifted)}e${-places}`);
}

/** A number a person reads, with thousands separators and fixed places. */
export function formatNumber(value: number, places = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
}
