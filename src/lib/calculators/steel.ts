import { rebarKgPerMetre } from "@/lib/takeoff/trades";
import { round } from "./units";

/**
 * Steel: bars, sections and what they weigh.
 *
 * `rebarKgPerMetre` — d² ÷ 162 — comes from the takeoff engine and is not
 * restated here. The rest is section geometry times the density of steel.
 *
 * A word on what these do *not* do. Bar counts below are derived from a spacing
 * the reader supplies; they do not choose that spacing, the diameter, the cover
 * or the laps. Those come from a structural design, and the takeoff engine
 * refuses to invent them for exactly the reason this note exists — a schedule
 * that looks confident and was guessed will get built.
 */

/** Common deformed bar diameters, in millimetres. */
export const REBAR_DIAMETERS = [6, 8, 10, 12, 14, 16, 20, 25, 32] as const;

/** Density of structural steel, kg/m³. */
export const STEEL_DENSITY = 7850;

/** Mild steel bar is bought in 12 m lengths. */
export const STANDARD_BAR_LENGTH_M = 12;

export { rebarKgPerMetre };

// ---------------------------------------------------------------------------
// Bars from a spacing
// ---------------------------------------------------------------------------

export type BarRun = {
  /** How many bars fit across the span. */
  bars: number;
  /** Cut length of one bar, in metres. */
  barLength: number;
  /** Every bar end to end. */
  totalLength: number;
  weightKg: number;
  formula: string;
};

/**
 * Bars in one direction of a slab, footing or beam.
 *
 * Two spans are involved and mixing them up is the classic error: bars *run
 * along* one dimension and are *spaced across* the other. `spanAcross` is the
 * one the spacing divides; `spanAlong` is how long each bar has to be.
 *
 * Both are reduced by the cover at each end, and the bar count is
 * `floor(span ÷ spacing) + 1` — the fencepost rule. Twelve metres at 200 mm
 * centres is 61 bars, not 60: there is a bar at each end.
 */
export function barsForSpan(input: {
  spanAcross: number;
  spanAlong: number;
  spacing: number;
  diameter: number;
  cover: number;
}): BarRun {
  const { spacing, diameter, cover } = input;
  const across = Math.max(0, input.spanAcross - 2 * cover);
  const along = Math.max(0, input.spanAlong - 2 * cover);

  if (spacing <= 0 || across <= 0 || along <= 0) {
    return { bars: 0, barLength: 0, totalLength: 0, weightKg: 0, formula: "No bars — check the spans and spacing." };
  }

  const bars = Math.floor(across / spacing) + 1;
  const totalLength = bars * along;
  const kgPerMetre = rebarKgPerMetre(diameter);

  return {
    bars,
    barLength: round(along, 3),
    totalLength: round(totalLength, 2),
    weightKg: round(totalLength * kgPerMetre, 2),
    formula:
      `⌊${across.toFixed(3)} m ÷ ${spacing.toFixed(3)} m⌋ + 1 = ${bars} bars` +
      ` × ${along.toFixed(3)} m = ${totalLength.toFixed(2)} m` +
      ` × ${kgPerMetre} kg/m = ${round(totalLength * kgPerMetre, 2).toFixed(2)} kg`,
  };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export const STEEL_SECTIONS = [
  { value: "round", label: "Round bar" },
  { value: "square", label: "Square bar" },
  { value: "flat", label: "Flat bar" },
  { value: "plate", label: "Plate" },
  { value: "angle", label: "Equal / unequal angle" },
  { value: "square_tube", label: "Square tube (hollow)" },
  { value: "rect_tube", label: "Rectangular tube (hollow)" },
  { value: "pipe", label: "Round pipe (hollow)" },
] as const;

export type SteelSection = (typeof STEEL_SECTIONS)[number]["value"];

/**
 * Cross-sectional area of a section, in square metres.
 *
 * Millimetres in — sections are always specified in millimetres — square metres
 * out, so it multiplies straight into a length in metres and a density in
 * kg/m³.
 *
 * The hollow sections subtract the bore. An angle is two legs that share their
 * corner, so the thickness is counted once there: `(a + b − t) × t`. Adding the
 * legs without that correction over-weighs every angle by one square of the
 * thickness.
 */
export function sectionAreaM2(
  section: SteelSection,
  d: { a?: number; b?: number; t?: number },
): { area: number; formula: string } {
  const mm2 = 1e-6;
  const a = d.a ?? 0;
  const b = d.b ?? 0;
  const t = d.t ?? 0;

  switch (section) {
    case "round": {
      const area = (Math.PI / 4) * a * a;
      return { area: area * mm2, formula: `π ÷ 4 × ${a}² = ${area.toFixed(1)} mm²` };
    }
    case "square": {
      const area = a * a;
      return { area: area * mm2, formula: `${a} × ${a} = ${area.toFixed(1)} mm²` };
    }
    case "flat":
    case "plate": {
      const area = a * b;
      return { area: area * mm2, formula: `${a} × ${b} = ${area.toFixed(1)} mm²` };
    }
    case "angle": {
      const area = Math.max(0, (a + b - t) * t);
      return {
        area: area * mm2,
        formula: `(${a} + ${b} − ${t}) × ${t} = ${area.toFixed(1)} mm²`,
      };
    }
    case "square_tube": {
      const bore = Math.max(0, a - 2 * t);
      const area = a * a - bore * bore;
      return {
        area: area * mm2,
        formula: `${a}² − ${bore}² = ${area.toFixed(1)} mm²`,
      };
    }
    case "rect_tube": {
      const boreA = Math.max(0, a - 2 * t);
      const boreB = Math.max(0, b - 2 * t);
      const area = a * b - boreA * boreB;
      return {
        area: area * mm2,
        formula: `(${a} × ${b}) − (${boreA} × ${boreB}) = ${area.toFixed(1)} mm²`,
      };
    }
    case "pipe": {
      const bore = Math.max(0, a - 2 * t);
      const area = (Math.PI / 4) * (a * a - bore * bore);
      return {
        area: area * mm2,
        formula: `π ÷ 4 × (${a}² − ${bore}²) = ${area.toFixed(1)} mm²`,
      };
    }
  }
}

/** Weight of a length of section: area × length × density. */
export function sectionWeight(
  section: SteelSection,
  dims: { a?: number; b?: number; t?: number },
  lengthM: number,
  pieces: number,
): { perPiece: number; total: number; formula: string[] } {
  const { area, formula } = sectionAreaM2(section, dims);
  const perPiece = area * lengthM * STEEL_DENSITY;
  return {
    perPiece: round(perPiece, 3),
    total: round(perPiece * pieces, 2),
    formula: [
      `Section area: ${formula}`,
      `${(area * 1e6).toFixed(1)} mm² × ${lengthM} m × ${STEEL_DENSITY} kg/m³ = ${round(perPiece, 3).toFixed(3)} kg each`,
      `× ${pieces} = ${round(perPiece * pieces, 2).toFixed(2)} kg`,
    ],
  };
}
