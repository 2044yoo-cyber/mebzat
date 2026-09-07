import { concreteQuantity, CONCRETE_MIXES } from "@/lib/takeoff/trades";
import { typed } from "./quantity";
import { round, volumeFromCubicMetres } from "./units";
import type { CalcOutput, ResultLine } from "./types";

/**
 * Concrete volumes, by shape.
 *
 * All five shapes reduce to a volume in cubic metres, and everything after that
 * — the mix, the cement bags, the sand and aggregate — is `concreteQuantity`
 * from the takeoff engine, unchanged. That function already knows the thing
 * people get wrong (dry volume is 1.54× wet volume) and it would be a mistake
 * to write a second version here that has to be corrected twice.
 */

export const CONCRETE_SHAPES = [
  { value: "slab", label: "Slab / rectangle" },
  { value: "footing", label: "Footing (pad)" },
  { value: "column", label: "Column (rectangular)" },
  { value: "circular", label: "Column (circular)" },
  { value: "beam", label: "Beam" },
] as const;

export type ConcreteShape = (typeof CONCRETE_SHAPES)[number]["value"];

/** Volume of one member, in cubic metres. Metres in, always. */
export function memberVolume(
  shape: ConcreteShape,
  dims: { length?: number; width?: number; depth?: number; diameter?: number; height?: number },
): { volume: number; formula: string } {
  const { length = 0, width = 0, depth = 0, diameter = 0, height = 0 } = dims;

  if (shape === "circular") {
    const radius = diameter / 2;
    const volume = Math.PI * radius * radius * height;
    return {
      volume,
      formula: `π × (${diameter.toFixed(3)} ÷ 2)² × ${height.toFixed(3)} m = ${volume.toFixed(4)} m³`,
    };
  }

  // Slab, footing, column and beam are all length × width × depth; they differ
  // in what the three dimensions are called, not in the arithmetic.
  const third = shape === "column" || shape === "beam" ? height || depth : depth;
  const volume = length * width * third;
  return {
    volume,
    formula: `${length.toFixed(3)} × ${width.toFixed(3)} × ${third.toFixed(3)} m = ${volume.toFixed(4)} m³`,
  };
}

/**
 * The shared tail of every concrete calculator.
 *
 * Given a total volume and a grade, produce the result block: ordered volume,
 * cement, sand, aggregate, and the same volume in cubic feet for anyone working
 * in imperial.
 */
export function concreteOutput(
  totalVolume: number,
  grade: string,
  wastePercent: number,
  workingSoFar: string[],
  extraLines: ResultLine[] = [],
): CalcOutput {
  const mixKey = grade in CONCRETE_MIXES ? grade : "C20";
  const result = concreteQuantity(
    typed("Concrete volume", round(totalVolume, 4), "m³", workingSoFar.at(-1) ?? ""),
    mixKey,
    { wastePercent },
  );

  return {
    headline: {
      label: "Concrete required",
      value: round(result.orderedVolume, 3).toFixed(3),
      unit: "m³",
    },
    lines: [
      ...extraLines,
      { label: "Net volume", value: round(totalVolume, 3).toFixed(3), unit: "m³", muted: true },
      {
        label: `Waste allowance (${wastePercent}%)`,
        value: round(result.orderedVolume - totalVolume, 3).toFixed(3),
        unit: "m³",
        muted: true,
      },
      {
        label: "In cubic feet",
        value: round(volumeFromCubicMetres(result.orderedVolume, "ft3"), 2).toFixed(2),
        unit: "ft³",
        muted: true,
      },
      { label: `Cement (${result.grade})`, value: String(result.cementBags), unit: "bags of 50 kg" },
      { label: "Sand", value: result.sandM3.toFixed(2), unit: "m³" },
      { label: "Aggregate", value: result.aggregateM3.toFixed(2), unit: "m³" },
    ],
    formula: [...workingSoFar, result.formula],
  };
}

export const CONCRETE_GRADE_OPTIONS = Object.entries(CONCRETE_MIXES).map(([value, mix]) => ({
  value,
  label: `${mix.label} — ${mix.ratio.join(":")}`,
}));
