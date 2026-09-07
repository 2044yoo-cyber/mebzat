import { round } from "./units";

/**
 * Roofs: how much surface is up there, and how many sheets cover it.
 */

export const ROOF_TYPES = [
  { value: "flat", label: "Flat" },
  { value: "single", label: "Single slope (shed / lean-to)" },
  { value: "gable", label: "Gable" },
  { value: "hip", label: "Hip" },
] as const;

export type RoofType = (typeof ROOF_TYPES)[number]["value"];

/**
 * Slope factor: how much longer the rafter is than its own plan shadow.
 *
 * √(1 + (rise ÷ run)²). A 30° roof has a factor of about 1.155, so its surface
 * is 15.5% more than the area it covers — which is the number people leave out
 * when they order sheets by the footprint and come up short.
 */
export function slopeFactor(rise: number, run: number): number {
  if (run <= 0) return 1;
  return Math.sqrt(1 + (rise / run) ** 2);
}

/** A pitch given in degrees, as a rise-over-run factor. */
export function slopeFactorFromDegrees(degrees: number): number {
  const clamped = Math.min(Math.max(degrees, 0), 89);
  return 1 / Math.cos((clamped * Math.PI) / 180);
}

export type RoofArea = {
  planArea: number;
  factor: number;
  surfaceArea: number;
  formula: string[];
  notes: string[];
};

/**
 * Roof surface from a rectangular footprint.
 *
 * The overhang is added on all four sides before the pitch is applied.
 *
 * Gable and hip give the same surface area over the same rectangle at the same
 * pitch, and that is not an oversight. Every plane of either roof rises at the
 * same angle over the plan it covers, so both come to plan × slope factor; what
 * differs is the ridge and hip lengths, and the cutting waste that follows from
 * them. Inventing a difference in the area to make the two options look distinct
 * would just be a wrong number that looks reassuring.
 */
export function roofArea(input: {
  type: RoofType;
  length: number;
  width: number;
  overhang: number;
  pitchDegrees: number;
}): RoofArea {
  const { type, overhang, pitchDegrees } = input;
  const length = input.length + 2 * overhang;
  const width = input.width + 2 * overhang;
  const planArea = length * width;
  const notes: string[] = [];

  const factor = type === "flat" ? 1 : slopeFactorFromDegrees(pitchDegrees);
  const surfaceArea = planArea * factor;

  const formula = [
    `Plan with overhang: (${input.length} + 2 × ${overhang}) × (${input.width} + 2 × ${overhang}) = ${round(planArea, 3).toFixed(3)} m²`,
  ];

  if (type === "flat") {
    formula.push("Flat roof — surface equals the plan area.");
  } else {
    formula.push(
      `Slope factor at ${pitchDegrees}° = 1 ÷ cos(${pitchDegrees}°) = ${round(factor, 4)}`,
      `${round(planArea, 3).toFixed(3)} m² × ${round(factor, 4)} = ${round(surfaceArea, 3).toFixed(3)} m²`,
    );
  }

  if (type === "hip") {
    notes.push(
      "A hip roof has the same surface area as a gable roof over the same rectangle at the same pitch. It cuts more waste at the hips, so allow a higher waste percentage when ordering.",
    );
  }

  return {
    planArea: round(planArea, 3),
    factor: round(factor, 4),
    surfaceArea: round(surfaceArea, 3),
    formula,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

export type SheetResult = {
  effectiveArea: number;
  sheets: number;
  sheetsWithWaste: number;
  formula: string[];
};

/**
 * How many sheets or tiles.
 *
 * The overlap is the trap. A 2.0 × 0.9 m sheet does not cover 1.8 m²; it covers
 * its width less the side lap and its length less the end lap. Ordering on the
 * nominal size is how a roof ends one course short.
 */
export function roofingSheets(input: {
  roofArea: number;
  sheetLength: number;
  sheetWidth: number;
  sideLap: number;
  endLap: number;
  wastePercent: number;
}): SheetResult {
  const coverWidth = Math.max(0, input.sheetWidth - input.sideLap);
  const coverLength = Math.max(0, input.sheetLength - input.endLap);
  const effectiveArea = coverWidth * coverLength;

  if (effectiveArea <= 0) {
    return {
      effectiveArea: 0,
      sheets: 0,
      sheetsWithWaste: 0,
      formula: ["The laps are larger than the sheet — check the sheet size and overlap."],
    };
  }

  const sheets = Math.ceil(input.roofArea / effectiveArea);
  const sheetsWithWaste = Math.ceil(sheets * (1 + Math.max(0, input.wastePercent) / 100));

  return {
    effectiveArea: round(effectiveArea, 4),
    sheets,
    sheetsWithWaste,
    formula: [
      `Covering size: (${input.sheetWidth} − ${input.sideLap}) × (${input.sheetLength} − ${input.endLap}) = ${round(effectiveArea, 4).toFixed(4)} m² per sheet`,
      `${round(input.roofArea, 3).toFixed(3)} m² ÷ ${round(effectiveArea, 4).toFixed(4)} m² = ${sheets} sheets`,
      `+ ${input.wastePercent}% waste = ${sheetsWithWaste} sheets`,
    ],
  };
}
