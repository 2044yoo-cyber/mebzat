import { concreteOutput, CONCRETE_GRADE_OPTIONS, CONCRETE_SHAPES, memberVolume } from "../concrete";
import { count, num, str, type CalculatorSpec } from "../types";
import { round } from "../units";

/**
 * Concrete and structure.
 *
 * Five calculators over one volume function. The footing, column and beam ones
 * exist separately from the general volume calculator because they ask for the
 * dimensions in the words those members are described in, and because they
 * multiply by a member count — which is what people actually have: eighteen
 * columns, not one column eighteen times.
 */

const GRADE = {
  kind: "select" as const,
  id: "grade",
  label: "Concrete grade",
  options: CONCRETE_GRADE_OPTIONS,
  defaultValue: "C25",
  help: "The nominal mix. C25 is the usual choice for suspended slabs and columns.",
};

const WASTE = {
  kind: "number" as const,
  id: "waste",
  label: "Waste allowance",
  suffix: "%",
  defaultValue: 5,
  optional: true,
  help: "Spillage, over-excavation and what stays in the mixer. 5% is normal for a ready-mix pour.",
};

export const concreteSpecs: CalculatorSpec[] = [
  {
    slug: "concrete",
    title: "Concrete Volume Calculator",
    category: "concrete",
    summary:
      "Concrete volume for slabs, footings, columns and beams, with the cement, sand and aggregate that go into it.",
    keywords: ["concrete", "volume", "m3", "cubic", "pour", "mix", "cement", "ready mix"],
    popular: true,
    fields: [
      {
        kind: "select",
        id: "shape",
        label: "Shape",
        options: [...CONCRETE_SHAPES],
        defaultValue: "slab",
      },
      {
        kind: "length",
        id: "length",
        label: "Length",
        defaultUnit: "m",
        placeholder: "5",
        showWhen: { field: "shape", equals: ["slab", "footing", "beam", "column"] },
      },
      {
        kind: "length",
        id: "width",
        label: "Width",
        defaultUnit: "m",
        placeholder: "4",
        showWhen: { field: "shape", equals: ["slab", "footing", "beam", "column"] },
      },
      {
        kind: "length",
        id: "depth",
        label: "Depth / thickness",
        defaultUnit: "cm",
        placeholder: "15",
        showWhen: { field: "shape", equals: ["slab", "footing"] },
      },
      {
        kind: "length",
        id: "height",
        label: "Height",
        defaultUnit: "m",
        placeholder: "3",
        showWhen: { field: "shape", equals: ["column", "circular", "beam"] },
      },
      {
        kind: "length",
        id: "diameter",
        label: "Diameter",
        defaultUnit: "cm",
        placeholder: "40",
        showWhen: { field: "shape", equals: ["circular"] },
      },
      {
        kind: "number",
        id: "members",
        label: "How many",
        suffix: "members",
        integer: true,
        defaultValue: 1,
        min: 1,
      },
      GRADE,
      WASTE,
    ],
    compute(values) {
      const shape = str(values, "shape", "slab") as (typeof CONCRETE_SHAPES)[number]["value"];
      const members = count(values, "members", 1);
      const one = memberVolume(shape, {
        length: num(values, "length"),
        width: num(values, "width"),
        depth: num(values, "depth"),
        height: num(values, "height"),
        diameter: num(values, "diameter"),
      });
      const total = one.volume * members;

      return concreteOutput(
        total,
        str(values, "grade", "C25"),
        num(values, "waste", 5),
        [
          `One member: ${one.formula}`,
          `× ${members} member${members === 1 ? "" : "s"} = ${round(total, 4).toFixed(4)} m³`,
        ],
        members > 1
          ? [{ label: "Volume per member", value: round(one.volume, 4).toFixed(4), unit: "m³", muted: true }]
          : [],
      );
    },
  },

  {
    slug: "concrete-slab",
    title: "Concrete Slab Calculator",
    category: "concrete",
    summary: "Concrete for a floor slab or raft, including the waste allowance and the mix that fills it.",
    keywords: ["slab", "floor", "raft", "concrete", "screed base", "ground floor"],
    popular: true,
    fields: [
      { kind: "length", id: "length", label: "Slab length", defaultUnit: "m", placeholder: "8" },
      { kind: "length", id: "width", label: "Slab width", defaultUnit: "m", placeholder: "6" },
      {
        kind: "length",
        id: "thickness",
        label: "Thickness",
        defaultUnit: "cm",
        placeholder: "15",
        help: "A domestic ground slab is usually 100–150 mm; a suspended slab is thicker.",
      },
      GRADE,
      WASTE,
    ],
    compute(values) {
      const length = num(values, "length");
      const width = num(values, "width");
      const thickness = num(values, "thickness");
      const volume = length * width * thickness;

      return concreteOutput(
        volume,
        str(values, "grade", "C25"),
        num(values, "waste", 5),
        [
          `${length.toFixed(3)} × ${width.toFixed(3)} × ${thickness.toFixed(3)} m = ${round(volume, 4).toFixed(4)} m³`,
        ],
        [{ label: "Slab area", value: round(length * width, 2).toFixed(2), unit: "m²", muted: true }],
      );
    },
  },

  {
    slug: "footing",
    title: "Footing Calculator",
    category: "concrete",
    summary: "Concrete volume for isolated pad, strip and combined footings.",
    keywords: ["footing", "foundation", "pad", "strip", "combined", "base", "substructure"],
    structural: true,
    fields: [
      {
        kind: "select",
        id: "type",
        label: "Footing type",
        options: [
          { value: "isolated", label: "Isolated pad — one under each column" },
          { value: "strip", label: "Strip — continuous under a wall" },
          { value: "combined", label: "Combined — one pad under two columns" },
        ],
        defaultValue: "isolated",
      },
      { kind: "length", id: "length", label: "Length", defaultUnit: "m", placeholder: "1.5" },
      { kind: "length", id: "width", label: "Width", defaultUnit: "m", placeholder: "1.5" },
      { kind: "length", id: "depth", label: "Depth", defaultUnit: "cm", placeholder: "40" },
      {
        kind: "number",
        id: "members",
        label: "How many footings",
        suffix: "off",
        integer: true,
        defaultValue: 1,
        min: 1,
        showWhen: { field: "type", equals: ["isolated", "combined"] },
      },
      GRADE,
      WASTE,
    ],
    compute(values) {
      const type = str(values, "type", "isolated");
      const length = num(values, "length");
      const width = num(values, "width");
      const depth = num(values, "depth");
      const members = type === "strip" ? 1 : count(values, "members", 1);
      const one = length * width * depth;
      const total = one * members;

      const working = [
        `${length.toFixed(3)} × ${width.toFixed(3)} × ${depth.toFixed(3)} m = ${round(one, 4).toFixed(4)} m³`,
      ];
      if (members > 1) {
        working.push(`× ${members} footings = ${round(total, 4).toFixed(4)} m³`);
      }
      if (type === "strip") {
        working.push("Strip footing — the length is the full run under the wall.");
      }

      return concreteOutput(total, str(values, "grade", "C25"), num(values, "waste", 5), working);
    },
  },

  {
    slug: "column",
    title: "Column Calculator",
    category: "concrete",
    summary: "Concrete volume for rectangular or circular columns, across a whole floor.",
    keywords: ["column", "post", "pillar", "stanchion", "concrete", "vertical"],
    structural: true,
    fields: [
      {
        kind: "select",
        id: "shape",
        label: "Section",
        options: [
          { value: "rect", label: "Rectangular" },
          { value: "circular", label: "Circular" },
        ],
        defaultValue: "rect",
      },
      {
        kind: "length",
        id: "width",
        label: "Width",
        defaultUnit: "cm",
        placeholder: "30",
        showWhen: { field: "shape", equals: ["rect"] },
      },
      {
        kind: "length",
        id: "depth",
        label: "Depth",
        defaultUnit: "cm",
        placeholder: "40",
        showWhen: { field: "shape", equals: ["rect"] },
      },
      {
        kind: "length",
        id: "diameter",
        label: "Diameter",
        defaultUnit: "cm",
        placeholder: "40",
        showWhen: { field: "shape", equals: ["circular"] },
      },
      { kind: "length", id: "height", label: "Height (floor to soffit)", defaultUnit: "m", placeholder: "3" },
      {
        kind: "number",
        id: "members",
        label: "How many columns",
        suffix: "off",
        integer: true,
        defaultValue: 1,
        min: 1,
      },
      GRADE,
      WASTE,
    ],
    compute(values) {
      const shape = str(values, "shape", "rect");
      const height = num(values, "height");
      const members = count(values, "members", 1);

      const one =
        shape === "circular"
          ? memberVolume("circular", { diameter: num(values, "diameter"), height })
          : memberVolume("column", { length: num(values, "width"), width: num(values, "depth"), height });

      const total = one.volume * members;

      return concreteOutput(
        total,
        str(values, "grade", "C25"),
        num(values, "waste", 5),
        [`One column: ${one.formula}`, `× ${members} = ${round(total, 4).toFixed(4)} m³`],
        [
          { label: "Volume per column", value: round(one.volume, 4).toFixed(4), unit: "m³", muted: true },
          { label: "Total column height", value: round(height * members, 2).toFixed(2), unit: "m", muted: true },
        ],
      );
    },
  },

  {
    slug: "beam",
    title: "Beam Calculator",
    category: "concrete",
    summary: "Concrete volume for beams and ring beams, across a whole floor.",
    keywords: ["beam", "lintel", "ring beam", "grade beam", "concrete"],
    structural: true,
    fields: [
      { kind: "length", id: "width", label: "Beam width", defaultUnit: "cm", placeholder: "25" },
      { kind: "length", id: "height", label: "Beam depth", defaultUnit: "cm", placeholder: "50" },
      { kind: "length", id: "length", label: "Beam length", defaultUnit: "m", placeholder: "6" },
      {
        kind: "number",
        id: "members",
        label: "How many beams",
        suffix: "off",
        integer: true,
        defaultValue: 1,
        min: 1,
      },
      GRADE,
      WASTE,
    ],
    compute(values) {
      const width = num(values, "width");
      const height = num(values, "height");
      const length = num(values, "length");
      const members = count(values, "members", 1);
      const one = width * height * length;
      const total = one * members;

      return concreteOutput(
        total,
        str(values, "grade", "C25"),
        num(values, "waste", 5),
        [
          `${width.toFixed(3)} × ${height.toFixed(3)} × ${length.toFixed(3)} m = ${round(one, 4).toFixed(4)} m³ per beam`,
          `× ${members} = ${round(total, 4).toFixed(4)} m³`,
        ],
        [
          { label: "Total beam length", value: round(length * members, 2).toFixed(2), unit: "m", muted: true },
          {
            label: "Formwork (soffit + 2 sides)",
            value: round((width + 2 * height) * length * members, 2).toFixed(2),
            unit: "m²",
            muted: true,
          },
        ],
      );
    },
  },
];
