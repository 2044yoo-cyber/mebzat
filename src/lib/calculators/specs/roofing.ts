import { roofArea, roofingSheets, ROOF_TYPES, type RoofType } from "../roofing";
import { slope } from "../geometry";
import { num, str, type CalculatorSpec } from "../types";
import { round } from "../units";

export const roofingSpecs: CalculatorSpec[] = [
  {
    slug: "roof-area",
    title: "Roof Area Calculator",
    category: "roofing",
    summary: "Roof surface area for flat, shed, gable and hip roofs, including the overhang and the pitch.",
    keywords: ["roof", "area", "gable", "hip", "pitch", "surface", "eaves", "overhang"],
    popular: true,
    fields: [
      { kind: "select", id: "type", label: "Roof type", options: [...ROOF_TYPES], defaultValue: "gable" },
      { kind: "length", id: "length", label: "Building length", defaultUnit: "m", placeholder: "12" },
      { kind: "length", id: "width", label: "Building width", defaultUnit: "m", placeholder: "8" },
      {
        kind: "length",
        id: "overhang",
        label: "Eaves overhang",
        defaultUnit: "cm",
        defaultValue: 60,
        placeholder: "60",
        optional: true,
        help: "Added on all four sides before the pitch is applied.",
      },
      {
        kind: "number",
        id: "pitch",
        label: "Roof pitch",
        suffix: "°",
        defaultValue: 25,
        min: 0,
        max: 85,
        showWhen: { field: "type", equals: ["single", "gable", "hip"] },
        help: "Corrugated sheet needs at least 10°; tiles usually want 25° or more.",
      },
    ],
    compute(values) {
      const result = roofArea({
        type: str(values, "type", "gable") as RoofType,
        length: num(values, "length"),
        width: num(values, "width"),
        overhang: num(values, "overhang", 0.6),
        pitchDegrees: num(values, "pitch", 25),
      });

      return {
        headline: { label: "Roof surface area", value: result.surfaceArea.toFixed(2), unit: "m²" },
        lines: [
          { label: "Plan area with overhang", value: result.planArea.toFixed(2), unit: "m²" },
          { label: "Slope factor", value: result.factor.toFixed(4), unit: "×", muted: true },
          {
            label: "Extra over the footprint",
            value: round(result.surfaceArea - result.planArea, 2).toFixed(2),
            unit: "m²",
            muted: true,
          },
        ],
        formula: result.formula,
        warnings: result.notes,
      };
    },
  },

  {
    slug: "roof-pitch",
    title: "Roof Pitch Calculator",
    category: "roofing",
    summary: "Convert between rise-and-run, pitch percentage, ratio and degrees.",
    keywords: ["pitch", "roof", "slope", "angle", "degrees", "rise", "run", "fall"],
    fields: [
      { kind: "length", id: "rise", label: "Rise (vertical)", defaultUnit: "m", placeholder: "2" },
      { kind: "length", id: "run", label: "Run (horizontal)", defaultUnit: "m", placeholder: "4" },
    ],
    compute(values) {
      const rise = num(values, "rise");
      const run = num(values, "run");
      const result = slope(rise, run);

      if (!result) {
        return {
          headline: { label: "Pitch", value: "—" },
          lines: [],
          formula: ["The run must be more than zero."],
          warnings: ["Enter a horizontal run to work out a pitch."],
        };
      }

      const warnings: string[] = [];
      if (result.degrees > 0 && result.degrees < 10) {
        warnings.push(
          `${result.degrees}° is shallow. Most corrugated sheeting needs 10° or more to shed water at the laps.`,
        );
      }

      return {
        headline: { label: "Pitch", value: result.degrees.toFixed(2), unit: "°" },
        lines: [
          { label: "Pitch as a percentage", value: result.percent.toFixed(2), unit: "%" },
          { label: "Ratio (rise : run)", value: result.ratio },
          { label: "Rafter length for this rise and run", value: result.slopeLength.toFixed(3), unit: "m" },
        ],
        formula: [
          `Percentage = ${rise} ÷ ${run} × 100 = ${result.percent}%`,
          `Angle = atan(${rise} ÷ ${run}) = ${result.degrees}°`,
          `Rafter = √(${rise}² + ${run}²) = ${result.slopeLength} m`,
        ],
        warnings,
      };
    },
  },

  {
    slug: "roofing-material",
    title: "Roofing Material Calculator",
    category: "roofing",
    summary: "Sheets or tiles for a roof area, with the side and end laps taken out of the covering size.",
    keywords: ["roofing", "sheets", "corrugated", "iron sheet", "tiles", "overlap", "lap", "korkoro"],
    fields: [
      { kind: "number", id: "roofArea", label: "Roof surface area", suffix: "m²", placeholder: "120", help: "Use the Roof Area Calculator first if you only have the footprint." },
      { kind: "length", id: "sheetLength", label: "Sheet length", defaultUnit: "m", defaultValue: 2, placeholder: "2" },
      { kind: "length", id: "sheetWidth", label: "Sheet width", defaultUnit: "m", defaultValue: 0.9, placeholder: "0.9" },
      {
        kind: "length",
        id: "sideLap",
        label: "Side lap",
        defaultUnit: "cm",
        defaultValue: 15,
        placeholder: "15",
        help: "Usually one and a half corrugations.",
      },
      { kind: "length", id: "endLap", label: "End lap", defaultUnit: "cm", defaultValue: 20, placeholder: "20" },
      { kind: "number", id: "waste", label: "Waste allowance", suffix: "%", defaultValue: 10, optional: true, help: "Hips and valleys cut more waste than a plain gable — allow 15% or more." },
    ],
    compute(values) {
      const area = num(values, "roofArea");
      const result = roofingSheets({
        roofArea: area,
        sheetLength: num(values, "sheetLength", 2),
        sheetWidth: num(values, "sheetWidth", 0.9),
        sideLap: num(values, "sideLap", 0.15),
        endLap: num(values, "endLap", 0.2),
        wastePercent: num(values, "waste", 10),
      });

      const nominal = num(values, "sheetLength", 2) * num(values, "sheetWidth", 0.9);

      return {
        headline: { label: "Sheets to order", value: String(result.sheetsWithWaste), unit: "sheets" },
        lines: [
          { label: "Roof area", value: round(area, 2).toFixed(2), unit: "m²" },
          { label: "Nominal sheet size", value: round(nominal, 3).toFixed(3), unit: "m²", muted: true },
          { label: "Area each sheet actually covers", value: result.effectiveArea.toFixed(3), unit: "m²" },
          { label: "Sheets before waste", value: String(result.sheets), unit: "sheets", muted: true },
          {
            label: "Lost to laps",
            value: nominal > 0 ? `${round((1 - result.effectiveArea / nominal) * 100, 1)}` : "—",
            unit: "% of each sheet",
            muted: true,
          },
        ],
        formula: result.formula,
      };
    },
  },
];
