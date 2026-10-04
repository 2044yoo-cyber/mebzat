import { backfill, excavation, SOIL_TYPES, soilType } from "../earthwork";
import { count, num, str, type CalculatorSpec } from "../types";
import { round, volumeFromCubicMetres } from "../units";

const SOIL_OPTIONS = SOIL_TYPES.map((soil) => ({
  value: soil.value,
  label: `${soil.label} — ${soil.density} kg/m³`,
}));

export const earthworkSpecs: CalculatorSpec[] = [
  {
    slug: "excavation",
    title: "Excavation Calculator",
    category: "earthwork",
    summary: "Volume of a dig in place and loose, plus what it weighs and how many loads it is.",
    keywords: ["excavation", "dig", "cut", "trench", "foundation", "spoil", "volume", "bulking"],
    fields: [
      { kind: "length", id: "length", label: "Length", defaultUnit: "m", placeholder: "10" },
      { kind: "length", id: "width", label: "Width", defaultUnit: "m", placeholder: "0.6" },
      { kind: "length", id: "depth", label: "Depth", defaultUnit: "m", placeholder: "1.2" },
      { kind: "number", id: "pits", label: "How many of these", suffix: "off", integer: true, defaultValue: 1, min: 1 },
      { kind: "select", id: "soil", label: "Material", options: SOIL_OPTIONS, defaultValue: "loam" },
      {
        kind: "number",
        id: "truck",
        label: "Truck capacity",
        suffix: "m³",
        defaultValue: 8,
        optional: true,
        help: "Loose volume per load. Leave blank if you are not hauling.",
      },
    ],
    compute(values) {
      const soil = soilType(str(values, "soil", "loam"));
      const result = excavation({
        length: num(values, "length"),
        width: num(values, "width"),
        depth: num(values, "depth"),
        pits: count(values, "pits", 1),
        soil: str(values, "soil", "loam"),
      });

      const truck = num(values, "truck", 8);
      const loads = truck > 0 ? Math.ceil(result.looseVolume / truck) : 0;

      return {
        headline: { label: "Excavation volume", value: result.bankVolume.toFixed(3), unit: "m³" },
        lines: [
          { label: "In cubic feet", value: result.cubicFeet.toFixed(2), unit: "ft³", muted: true },
          { label: `Loose after digging (×${soil.bulking})`, value: result.looseVolume.toFixed(3), unit: "m³" },
          { label: "Weight", value: result.tonnes.toFixed(2), unit: "t" },
          ...(loads > 0 ? [{ label: `Truck loads at ${truck} m³`, value: String(loads), unit: "loads" }] : []),
        ],
        formula: result.formula,
        warnings: [
          "Working space, battered sides and any strut or shoring are not included — this is the neat volume of the hole as dimensioned.",
        ],
      };
    },
  },

  {
    slug: "backfill",
    title: "Backfill Calculator",
    category: "earthwork",
    summary: "How much fill goes back around a structure, and how much loose material that takes.",
    keywords: ["backfill", "fill", "compaction", "spoil", "surplus", "trench"],
    fields: [
      { kind: "number", id: "excavated", label: "Excavated volume", suffix: "m³", placeholder: "24" },
      {
        kind: "number",
        id: "structure",
        label: "Volume the structure occupies",
        suffix: "m³",
        placeholder: "9",
        help: "Footings, walls and anything else now sitting in the hole.",
      },
      {
        kind: "number",
        id: "compaction",
        label: "Compaction factor",
        defaultValue: 1.25,
        suffix: "×",
        help: "Loose material needed to make one compacted cubic metre. 1.2–1.3 for granular fill in layers.",
      },
    ],
    compute(values) {
      const result = backfill({
        excavated: num(values, "excavated"),
        structure: num(values, "structure"),
        compaction: num(values, "compaction", 1.25),
      });

      return {
        headline: { label: "Backfill in place", value: result.backfill.toFixed(3), unit: "m³" },
        lines: [
          { label: "Excavated", value: result.excavated.toFixed(3), unit: "m³", muted: true },
          { label: "Occupied by the structure", value: result.occupied.toFixed(3), unit: "m³", muted: true },
          { label: "Loose material to bring", value: result.looseRequired.toFixed(3), unit: "m³" },
          { label: "Spoil to cart away", value: result.surplus.toFixed(3), unit: "m³" },
        ],
        formula: result.formula,
        warnings: result.warnings,
      };
    },
  },

  {
    slug: "soil-fill",
    title: "Soil & Fill Calculator",
    category: "earthwork",
    summary: "Volume and weight of soil, hardcore or aggregate for an area at a given depth.",
    keywords: ["soil", "fill", "hardcore", "aggregate", "topsoil", "sub-base", "density", "tonnes"],
    fields: [
      { kind: "length", id: "length", label: "Length", defaultUnit: "m", placeholder: "20" },
      { kind: "length", id: "width", label: "Width", defaultUnit: "m", placeholder: "10" },
      { kind: "length", id: "depth", label: "Depth", defaultUnit: "cm", defaultValue: 15, placeholder: "15" },
      { kind: "select", id: "soil", label: "Material", options: SOIL_OPTIONS, defaultValue: "hardcore" },
      {
        kind: "number",
        id: "density",
        label: "Density override",
        suffix: "kg/m³",
        optional: true,
        help: "Leave blank to use the figure for the material above.",
      },
    ],
    compute(values) {
      const length = num(values, "length");
      const width = num(values, "width");
      const depth = num(values, "depth", 0.15);
      const soil = soilType(str(values, "soil", "hardcore"));
      const density = num(values, "density", 0) > 0 ? num(values, "density") : soil.density;

      const area = length * width;
      const volume = area * depth;
      const tonnes = (volume * density) / 1000;

      return {
        headline: { label: "Volume", value: round(volume, 3).toFixed(3), unit: "m³" },
        lines: [
          { label: "Area", value: round(area, 2).toFixed(2), unit: "m²", muted: true },
          { label: "In cubic feet", value: round(volumeFromCubicMetres(volume, "ft3"), 2).toFixed(2), unit: "ft³", muted: true },
          { label: "Weight", value: round(tonnes, 2).toFixed(2), unit: "t" },
          { label: "Weight in kilogrammes", value: round(volume * density, 0).toFixed(0), unit: "kg", muted: true },
          { label: `Loose volume (×${soil.bulking})`, value: round(volume * soil.bulking, 3).toFixed(3), unit: "m³" },
        ],
        formula: [
          `${length} × ${width} = ${round(area, 2).toFixed(2)} m²`,
          `× ${(depth * 1000).toFixed(0)} mm = ${round(volume, 3).toFixed(3)} m³`,
          `× ${density} kg/m³ = ${round(volume * density, 0).toFixed(0)} kg = ${round(tonnes, 2).toFixed(2)} t`,
        ],
      };
    },
  },
];
