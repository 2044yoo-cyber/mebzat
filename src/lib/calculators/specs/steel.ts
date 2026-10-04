import {
  barsForSpan,
  rebarKgPerMetre,
  REBAR_DIAMETERS,
  sectionWeight,
  STANDARD_BAR_LENGTH_M,
  STEEL_SECTIONS,
  type SteelSection,
} from "../steel";
import { count, num, str, type CalculatorSpec } from "../types";
import { massFromKg, round } from "../units";

const DIAMETER_OPTIONS = REBAR_DIAMETERS.map((d) => ({ value: String(d), label: `Ø${d} mm` }));

export const steelSpecs: CalculatorSpec[] = [
  {
    slug: "rebar-weight",
    title: "Rebar Weight Calculator",
    category: "steel",
    summary: "Weight of reinforcement bar from diameter, length and quantity — in kilogrammes and tonnes.",
    keywords: ["rebar", "steel", "weight", "kg", "tonne", "bar", "reinforcement", "d2/162"],
    popular: true,
    structural: true,
    fields: [
      { kind: "select", id: "diameter", label: "Bar diameter", options: DIAMETER_OPTIONS, defaultValue: "12" },
      {
        kind: "length",
        id: "length",
        label: "Length of one bar",
        defaultUnit: "m",
        placeholder: "12",
        help: "Deformed bar is sold in 12 m lengths in Ethiopia.",
      },
      { kind: "number", id: "quantity", label: "How many bars", suffix: "bars", integer: true, defaultValue: 1, min: 1 },
    ],
    compute(values) {
      const diameter = num(values, "diameter", 12);
      const length = num(values, "length");
      const quantity = count(values, "quantity", 1);

      const kgPerMetre = rebarKgPerMetre(diameter);
      const totalLength = length * quantity;
      const weight = totalLength * kgPerMetre;

      return {
        headline: { label: "Total weight", value: round(weight, 2).toFixed(2), unit: "kg" },
        lines: [
          { label: "Weight per metre", value: kgPerMetre.toFixed(4), unit: "kg/m" },
          { label: "Weight of one bar", value: round(length * kgPerMetre, 3).toFixed(3), unit: "kg", muted: true },
          { label: "Total length", value: round(totalLength, 2).toFixed(2), unit: "m" },
          { label: "In tonnes", value: round(massFromKg(weight, "tonne"), 4).toFixed(4), unit: "t" },
          {
            label: `Standard ${STANDARD_BAR_LENGTH_M} m bars to order`,
            value: String(Math.ceil(totalLength / STANDARD_BAR_LENGTH_M)),
            unit: "bars",
          },
        ],
        formula: [
          `Mass per metre = d² ÷ 162 = ${diameter}² ÷ 162 = ${kgPerMetre} kg/m`,
          `Total length = ${length} m × ${quantity} = ${round(totalLength, 2).toFixed(2)} m`,
          `Weight = ${round(totalLength, 2).toFixed(2)} m × ${kgPerMetre} kg/m = ${round(weight, 2).toFixed(2)} kg`,
        ],
      };
    },
  },

  {
    slug: "rebar-quantity",
    title: "Rebar Quantity Calculator",
    category: "steel",
    summary: "Bar count, total length and weight for a slab, footing or beam from a spacing you specify.",
    keywords: ["rebar", "spacing", "bars", "mesh", "slab reinforcement", "bar count", "cover"],
    structural: true,
    note: "This counts bars for a spacing you supply. It does not choose the spacing, the diameter, the cover or the laps — those come from the structural drawings.",
    fields: [
      { kind: "length", id: "length", label: "Member length", defaultUnit: "m", placeholder: "6" },
      { kind: "length", id: "width", label: "Member width", defaultUnit: "m", placeholder: "4" },
      { kind: "select", id: "diameter", label: "Bar diameter", options: DIAMETER_OPTIONS, defaultValue: "12" },
      {
        kind: "length",
        id: "spacing",
        label: "Bar spacing (centres)",
        defaultUnit: "mm",
        placeholder: "200",
        help: "Centre to centre, as noted on the drawing.",
      },
      {
        kind: "length",
        id: "cover",
        label: "Concrete cover",
        defaultUnit: "mm",
        placeholder: "25",
        help: "Taken off both ends of every span.",
      },
      {
        kind: "select",
        id: "directions",
        label: "Reinforcement",
        options: [
          { value: "1", label: "One way — bars in one direction" },
          { value: "2", label: "Two way — a mat both directions" },
        ],
        defaultValue: "2",
      },
      {
        kind: "number",
        id: "layers",
        label: "Layers",
        suffix: "layers",
        integer: true,
        defaultValue: 1,
        min: 1,
        help: "Two for top and bottom steel.",
      },
    ],
    compute(values) {
      const length = num(values, "length");
      const width = num(values, "width");
      const diameter = num(values, "diameter", 12);
      const spacing = num(values, "spacing");
      const cover = num(values, "cover");
      const directions = num(values, "directions", 2);
      const layers = count(values, "layers", 1);

      // Bars running the length are spaced across the width, and vice versa.
      const alongLength = barsForSpan({
        spanAcross: width,
        spanAlong: length,
        spacing,
        diameter,
        cover,
      });
      const alongWidth =
        directions >= 2
          ? barsForSpan({ spanAcross: length, spanAlong: width, spacing, diameter, cover })
          : null;

      const perLayerBars = alongLength.bars + (alongWidth?.bars ?? 0);
      const perLayerLength = alongLength.totalLength + (alongWidth?.totalLength ?? 0);
      const totalLength = perLayerLength * layers;
      const kgPerMetre = rebarKgPerMetre(diameter);
      const weight = totalLength * kgPerMetre;

      const formula = [`Bars running the length (spaced across the width):`, `  ${alongLength.formula}`];
      if (alongWidth) {
        formula.push(`Bars running the width (spaced across the length):`, `  ${alongWidth.formula}`);
      }
      if (layers > 1) {
        formula.push(`× ${layers} layers = ${round(totalLength, 2).toFixed(2)} m of bar`);
      }
      formula.push(`Weight = ${round(totalLength, 2).toFixed(2)} m × ${kgPerMetre} kg/m = ${round(weight, 2).toFixed(2)} kg`);

      return {
        headline: { label: "Total weight", value: round(weight, 2).toFixed(2), unit: "kg" },
        lines: [
          { label: "Bars per layer", value: String(perLayerBars), unit: "bars" },
          { label: "Total bars", value: String(perLayerBars * layers), unit: "bars" },
          { label: "Bars along the length", value: `${alongLength.bars} × ${alongLength.barLength.toFixed(2)} m`, muted: true },
          ...(alongWidth
            ? [{ label: "Bars along the width", value: `${alongWidth.bars} × ${alongWidth.barLength.toFixed(2)} m`, muted: true }]
            : []),
          { label: "Total bar length", value: round(totalLength, 2).toFixed(2), unit: "m" },
          { label: "In tonnes", value: round(massFromKg(weight, "tonne"), 4).toFixed(4), unit: "t" },
          {
            label: `${STANDARD_BAR_LENGTH_M} m lengths to order`,
            value: String(Math.ceil(totalLength / STANDARD_BAR_LENGTH_M)),
            unit: "bars",
          },
        ],
        formula,
        warnings: [
          "Laps, hooks, bends and chair bars are not included. Add them from the bar bending schedule.",
        ],
      };
    },
  },

  {
    slug: "steel-weight",
    title: "Steel Weight Calculator",
    category: "steel",
    summary: "Weight of round bar, flat, angle, plate, pipe and hollow sections from their dimensions.",
    keywords: ["steel", "weight", "angle", "flat bar", "plate", "tube", "hollow section", "pipe", "rhs", "shs"],
    fields: [
      {
        kind: "select",
        id: "section",
        label: "Section",
        options: [...STEEL_SECTIONS],
        defaultValue: "round",
      },
      {
        kind: "number",
        id: "a",
        label: "Diameter / width / leg A",
        suffix: "mm",
        placeholder: "50",
        help: "Diameter for round and pipe; the width or first leg for everything else.",
      },
      {
        kind: "number",
        id: "b",
        label: "Second dimension / leg B",
        suffix: "mm",
        placeholder: "50",
        optional: true,
        showWhen: { field: "section", equals: ["flat", "plate", "angle", "rect_tube"] },
      },
      {
        kind: "number",
        id: "t",
        label: "Thickness",
        suffix: "mm",
        placeholder: "5",
        optional: true,
        showWhen: { field: "section", equals: ["angle", "square_tube", "rect_tube", "pipe"] },
      },
      { kind: "length", id: "length", label: "Length of one piece", defaultUnit: "m", placeholder: "6" },
      { kind: "number", id: "pieces", label: "How many pieces", suffix: "off", integer: true, defaultValue: 1, min: 1 },
    ],
    compute(values) {
      const section = str(values, "section", "round") as SteelSection;
      const lengthM = num(values, "length");
      const pieces = count(values, "pieces", 1);

      const result = sectionWeight(
        section,
        { a: num(values, "a"), b: num(values, "b"), t: num(values, "t") },
        lengthM,
        pieces,
      );

      return {
        headline: { label: "Total weight", value: result.total.toFixed(2), unit: "kg" },
        lines: [
          { label: "Weight per piece", value: result.perPiece.toFixed(3), unit: "kg" },
          {
            label: "Weight per metre",
            value: lengthM > 0 ? round(result.perPiece / lengthM, 3).toFixed(3) : "—",
            unit: "kg/m",
          },
          { label: "Total length", value: round(lengthM * pieces, 2).toFixed(2), unit: "m", muted: true },
          { label: "In tonnes", value: round(massFromKg(result.total, "tonne"), 4).toFixed(4), unit: "t" },
        ],
        formula: result.formula,
      };
    },
  },
];
