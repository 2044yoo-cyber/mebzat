import { AREA_SHAPES, shapeArea, shapeVolume, slope, stairs, VOLUME_SHAPES, type AreaShape, type VolumeShape } from "../geometry";
import { num, str, type CalculatorSpec } from "../types";
import { areaFromSquareMetres, round, volumeFromCubicMetres } from "../units";

export const architectureSpecs: CalculatorSpec[] = [
  {
    slug: "area",
    title: "Area Calculator",
    category: "architecture",
    summary: "Area of a rectangle, triangle, circle or trapezoid, in square metres and square feet.",
    keywords: ["area", "square metres", "m2", "sqm", "ft2", "plot", "room", "floor area"],
    fields: [
      { kind: "select", id: "shape", label: "Shape", options: [...AREA_SHAPES], defaultValue: "rectangle" },
      {
        kind: "length",
        id: "a",
        label: "Length / base / side A / diameter",
        defaultUnit: "m",
        placeholder: "5",
      },
      {
        kind: "length",
        id: "b",
        label: "Width / side B / second parallel side",
        defaultUnit: "m",
        placeholder: "4",
        showWhen: { field: "shape", equals: ["rectangle", "triangle_sides", "trapezoid"] },
      },
      {
        kind: "length",
        id: "c",
        label: "Side C",
        defaultUnit: "m",
        placeholder: "6",
        showWhen: { field: "shape", equals: ["triangle_sides"] },
      },
      {
        kind: "length",
        id: "h",
        label: "Height (perpendicular)",
        defaultUnit: "m",
        placeholder: "3",
        showWhen: { field: "shape", equals: ["triangle", "trapezoid"] },
      },
      { kind: "number", id: "quantity", label: "How many", suffix: "off", integer: true, defaultValue: 1, min: 1 },
    ],
    compute(values) {
      const shape = str(values, "shape", "rectangle") as AreaShape;
      const quantity = Math.max(1, num(values, "quantity", 1));
      const one = shapeArea(shape, {
        a: num(values, "a"),
        b: num(values, "b"),
        c: num(values, "c"),
        h: num(values, "h"),
      });
      const total = one.area * quantity;

      return {
        headline: { label: "Area", value: round(total, 3).toFixed(3), unit: "m²" },
        lines: [
          ...(quantity > 1 ? [{ label: "Area of one", value: round(one.area, 3).toFixed(3), unit: "m²", muted: true }] : []),
          { label: "In square feet", value: round(areaFromSquareMetres(total, "ft2"), 2).toFixed(2), unit: "ft²" },
          { label: "In square centimetres", value: round(areaFromSquareMetres(total, "cm2"), 0).toFixed(0), unit: "cm²", muted: true },
        ],
        formula: [one.formula, ...(quantity > 1 ? [`× ${quantity} = ${round(total, 3).toFixed(3)} m²`] : [])],
      };
    },
  },

  {
    slug: "volume",
    title: "Volume Calculator",
    category: "architecture",
    summary: "Volume of a box, cylinder, cone, sphere, pyramid or prism, in cubic metres and cubic feet.",
    keywords: ["volume", "cubic", "m3", "capacity", "tank", "cylinder", "litres"],
    fields: [
      { kind: "select", id: "shape", label: "Shape", options: [...VOLUME_SHAPES], defaultValue: "box" },
      { kind: "length", id: "a", label: "Length / diameter / base", defaultUnit: "m", placeholder: "3" },
      {
        kind: "length",
        id: "b",
        label: "Width / triangle height",
        defaultUnit: "m",
        placeholder: "2",
        showWhen: { field: "shape", equals: ["box", "pyramid", "prism"] },
      },
      {
        kind: "length",
        id: "h",
        label: "Height / depth / prism length",
        defaultUnit: "m",
        placeholder: "2.5",
        showWhen: { field: "shape", equals: ["box", "cylinder", "cone", "pyramid", "prism"] },
      },
      { kind: "number", id: "quantity", label: "How many", suffix: "off", integer: true, defaultValue: 1, min: 1 },
    ],
    compute(values) {
      const shape = str(values, "shape", "box") as VolumeShape;
      const quantity = Math.max(1, num(values, "quantity", 1));
      const one = shapeVolume(shape, { a: num(values, "a"), b: num(values, "b"), h: num(values, "h") });
      const total = one.volume * quantity;

      return {
        headline: { label: "Volume", value: round(total, 4).toFixed(4), unit: "m³" },
        lines: [
          ...(quantity > 1 ? [{ label: "Volume of one", value: round(one.volume, 4).toFixed(4), unit: "m³", muted: true }] : []),
          { label: "In cubic feet", value: round(volumeFromCubicMetres(total, "ft3"), 2).toFixed(2), unit: "ft³" },
          { label: "In litres", value: round(volumeFromCubicMetres(total, "litre"), 1).toFixed(1), unit: "L" },
        ],
        formula: [one.formula, ...(quantity > 1 ? [`× ${quantity} = ${round(total, 4).toFixed(4)} m³`] : [])],
      };
    },
  },

  {
    slug: "stair",
    title: "Stair Calculator",
    category: "architecture",
    summary: "Risers, treads, total run and pitch for a straight flight — with a warning when the flight is uncomfortable.",
    keywords: ["stair", "stairs", "riser", "tread", "going", "flight", "steps", "staircase"],
    popular: true,
    note: "The floor-to-floor height decides the number of risers, because every riser in a flight has to be identical. A short step at the top is both a code failure and the commonest way people fall on stairs.",
    fields: [
      {
        kind: "length",
        id: "floorToFloor",
        label: "Floor-to-floor height",
        defaultUnit: "m",
        placeholder: "3",
        help: "Finished floor below to finished floor above — not the ceiling height.",
      },
      {
        kind: "length",
        id: "preferredRiser",
        label: "Preferred riser height",
        defaultUnit: "mm",
        defaultValue: 175,
        placeholder: "175",
        help: "The flight will use the nearest whole number of risers to this.",
      },
      { kind: "length", id: "treadDepth", label: "Tread depth (going)", defaultUnit: "mm", defaultValue: 280, placeholder: "280" },
      {
        kind: "length",
        id: "availableRun",
        label: "Available run",
        defaultUnit: "m",
        placeholder: "4",
        optional: true,
        help: "Leave blank if the space is not fixed. Filled in, it warns when the flight will not fit.",
      },
    ],
    compute(values) {
      const result = stairs({
        floorToFloor: num(values, "floorToFloor"),
        preferredRiser: num(values, "preferredRiser", 0.175),
        treadDepth: num(values, "treadDepth", 0.28),
        availableRun: num(values, "availableRun"),
      });

      if (!result) {
        return {
          headline: { label: "Risers", value: "—" },
          lines: [],
          formula: ["Enter a floor-to-floor height and a preferred riser."],
          warnings: ["Both the height and the preferred riser must be more than zero."],
        };
      }

      return {
        headline: { label: "Risers", value: String(result.risers), unit: `at ${(result.riserHeight * 1000).toFixed(1)} mm` },
        lines: [
          { label: "Riser height", value: (result.riserHeight * 1000).toFixed(1), unit: "mm" },
          { label: "Treads", value: String(result.treads), unit: "treads" },
          { label: "Tread depth", value: (result.treadDepth * 1000).toFixed(0), unit: "mm" },
          { label: "Total run", value: result.totalRun.toFixed(3), unit: "m" },
          { label: "Pitch", value: result.angle.toFixed(2), unit: "°" },
          { label: "2 × riser + tread", value: (result.walkingLine * 1000).toFixed(0), unit: "mm", muted: true },
        ],
        formula: result.formula,
        warnings: result.warnings,
      };
    },
  },

  {
    slug: "slope",
    title: "Slope Calculator",
    category: "architecture",
    summary: "Slope as a percentage, a ratio and an angle — for drainage falls, ramps and ground.",
    keywords: ["slope", "gradient", "fall", "ramp", "drainage", "percent", "degrees", "ratio"],
    fields: [
      { kind: "length", id: "rise", label: "Rise (vertical)", defaultUnit: "cm", placeholder: "15" },
      { kind: "length", id: "run", label: "Run (horizontal)", defaultUnit: "m", placeholder: "3" },
    ],
    compute(values) {
      const rise = num(values, "rise");
      const run = num(values, "run");
      const result = slope(rise, run);

      if (!result) {
        return {
          headline: { label: "Slope", value: "—" },
          lines: [],
          formula: ["The run must be more than zero."],
          warnings: ["Enter a horizontal run to work out a slope."],
        };
      }

      const warnings: string[] = [];
      if (result.percent > 8.34) {
        warnings.push(
          `${result.percent}% is steeper than 1:12, the usual maximum for a wheelchair ramp. Check the accessibility requirement for this route.`,
        );
      }

      return {
        headline: { label: "Slope", value: result.percent.toFixed(2), unit: "%" },
        lines: [
          { label: "As a ratio", value: result.ratio },
          { label: "As an angle", value: result.degrees.toFixed(2), unit: "°" },
          { label: "Length along the slope", value: result.slopeLength.toFixed(3), unit: "m" },
        ],
        formula: [
          `Percentage = ${rise} ÷ ${run} × 100 = ${result.percent}%`,
          `Ratio = 1 : ${round(rise > 0 ? run / rise : 0, 2)}`,
          `Angle = atan(${rise} ÷ ${run}) = ${result.degrees}°`,
        ],
        warnings,
      };
    },
  },

  {
    slug: "unit-converter",
    title: "Unit Converter",
    category: "architecture",
    summary: "Length, area, volume and weight between metric and imperial, all at once.",
    keywords: ["convert", "converter", "unit", "metric", "imperial", "feet", "metres", "kg", "pounds", "mm"],
    popular: true,
    custom: "converter",
    fields: [],
  },
];
