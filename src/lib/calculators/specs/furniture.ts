import { carcassParts, kitchenModules, SHEET_AREA_M2, SHEET_LENGTH, SHEET_WIDTH, type CarcassInput } from "../furniture";
import { count, num, type CalcOutput, type CalculatorSpec, type Field, type Values } from "../types";
import { round } from "../units";

/**
 * Six pieces of fitted furniture, one carcass.
 *
 * Wardrobe, kitchen, TV unit, vanity, bookshelf and general storage differ in
 * their defaults and in one or two fields each; the panels are worked out by
 * `carcassParts` for all of them. Writing six of these by hand would mean six
 * chances to get the "top sits between the sides" rule wrong.
 */

const BOARD_THICKNESS: Field = {
  kind: "number",
  id: "thickness",
  label: "Board thickness",
  suffix: "mm",
  defaultValue: 18,
  placeholder: "18",
  help: "18 mm melamine-faced chipboard or MDF is the standard carcass board.",
};

const BACK_THICKNESS: Field = {
  kind: "number",
  id: "backThickness",
  label: "Back panel thickness",
  suffix: "mm",
  defaultValue: 6,
  placeholder: "6",
  optional: true,
};

function dimensionFields(defaults: { width: number; height: number; depth: number }): Field[] {
  return [
    { kind: "number", id: "width", label: "Overall width", suffix: "mm", defaultValue: defaults.width, placeholder: String(defaults.width) },
    { kind: "number", id: "height", label: "Overall height", suffix: "mm", defaultValue: defaults.height, placeholder: String(defaults.height) },
    { kind: "number", id: "depth", label: "Depth", suffix: "mm", defaultValue: defaults.depth, placeholder: String(defaults.depth) },
  ];
}

/**
 * Turn a carcass result into the shared output shape.
 *
 * The cut list is a table because it is a table: a joiner reads down a column
 * of lengths, and flattening it into prose would make it useless at the saw.
 */
function carcassOutput(input: CarcassInput, extraFormula: string[] = []): CalcOutput {
  const result = carcassParts(input);

  return {
    headline: { label: "Board to buy", value: String(result.sheets), unit: `sheets of ${SHEET_LENGTH} × ${SHEET_WIDTH} mm` },
    lines: [
      { label: "Total board area", value: result.boardArea.toFixed(3), unit: "m²" },
      { label: "Pieces to cut", value: String(result.parts.reduce((sum, part) => sum + part.quantity, 0)), unit: "pieces" },
      { label: "Edge banding", value: result.bandingMetres.toFixed(2), unit: "m" },
      { label: "Bay width", value: result.bayWidth.toFixed(1), unit: "mm", muted: true },
      { label: "Carcass height", value: result.carcassHeight.toFixed(1), unit: "mm", muted: true },
    ],
    tables: [
      {
        title: "Cut list",
        columns: ["Part", "Length", "Width", "Thk", "Qty", "Edging"],
        rows: result.parts.map((part) => [
          part.label,
          `${part.length.toFixed(0)} mm`,
          `${part.width.toFixed(0)} mm`,
          `${part.thickness} mm`,
          String(part.quantity),
          part.banding,
        ]),
        note: "Lengths are finished sizes. Add the saw kerf when nesting, and check the grain direction on any faced board.",
      },
      ...(result.hardware.length > 0
        ? [
            {
              title: "Hardware",
              columns: ["Item", "Quantity", "Unit"],
              rows: result.hardware.map((line) => [line.label, String(line.quantity), line.unit]),
            },
          ]
        : []),
    ],
    formula: [...extraFormula, ...result.formula],
    warnings: result.warnings,
  };
}

function readCarcass(values: Values, overrides: Partial<CarcassInput> = {}): CarcassInput {
  return {
    width: num(values, "width"),
    height: num(values, "height"),
    depth: num(values, "depth"),
    thickness: num(values, "thickness", 18),
    backThickness: num(values, "backThickness", 6),
    sections: count(values, "sections", 1),
    shelvesPerSection: count(values, "shelves", 0),
    doors: count(values, "doors", 0),
    drawers: count(values, "drawers", 0),
    toeKick: num(values, "toeKick", 0),
    ...overrides,
  };
}

export const furnitureSpecs: CalculatorSpec[] = [
  {
    slug: "wardrobe",
    title: "Wardrobe Calculator",
    category: "furniture",
    summary: "A complete cut list, board count, edge banding and hardware for a fitted wardrobe.",
    keywords: ["wardrobe", "closet", "cupboard", "cut list", "board", "melamine", "hanging"],
    popular: true,
    fields: [
      ...dimensionFields({ width: 2400, height: 2400, depth: 600 }),
      { kind: "number", id: "sections", label: "Sections (bays)", suffix: "bays", integer: true, defaultValue: 3, min: 1 },
      { kind: "number", id: "shelves", label: "Shelves per section", suffix: "shelves", integer: true, defaultValue: 3, min: 0 },
      { kind: "number", id: "doors", label: "Doors", suffix: "doors", integer: true, defaultValue: 3, min: 0 },
      { kind: "number", id: "drawers", label: "Drawers", suffix: "drawers", integer: true, defaultValue: 2, min: 0 },
      { kind: "number", id: "toeKick", label: "Plinth height", suffix: "mm", defaultValue: 100, optional: true },
      BOARD_THICKNESS,
      BACK_THICKNESS,
    ],
    compute: (values) => carcassOutput(readCarcass(values, { hangingRail: true })),
  },

  {
    slug: "kitchen",
    title: "Kitchen Cabinet Calculator",
    category: "furniture",
    summary: "Modules, panels, board and hardware for a run of base or wall kitchen units.",
    keywords: ["kitchen", "cabinet", "base unit", "wall unit", "cut list", "modules", "worktop"],
    popular: true,
    fields: [
      { kind: "number", id: "runLength", label: "Total run length", suffix: "mm", defaultValue: 4200, placeholder: "4200" },
      {
        kind: "number",
        id: "moduleWidth",
        label: "Module width",
        suffix: "mm",
        defaultValue: 600,
        placeholder: "600",
        help: "600 mm is standard. The run is divided into whole modules and whatever is left becomes a filler.",
      },
      { kind: "number", id: "height", label: "Cabinet height", suffix: "mm", defaultValue: 870, placeholder: "870" },
      { kind: "number", id: "depth", label: "Cabinet depth", suffix: "mm", defaultValue: 600, placeholder: "600" },
      { kind: "number", id: "shelves", label: "Shelves per module", suffix: "shelves", integer: true, defaultValue: 1, min: 0 },
      { kind: "number", id: "doors", label: "Doors per module", suffix: "doors", integer: true, defaultValue: 1, min: 0 },
      { kind: "number", id: "drawers", label: "Drawers per module", suffix: "drawers", integer: true, defaultValue: 0, min: 0 },
      { kind: "number", id: "toeKick", label: "Plinth height", suffix: "mm", defaultValue: 100, optional: true },
      { kind: "number", id: "worktop", label: "Worktop thickness", suffix: "mm", defaultValue: 38, optional: true },
      BOARD_THICKNESS,
      BACK_THICKNESS,
    ],
    compute(values) {
      const runLength = num(values, "runLength");
      const moduleWidth = num(values, "moduleWidth", 600);
      const modules = kitchenModules(runLength, moduleWidth);

      if (modules.modules < 1) {
        return {
          headline: { label: "Modules", value: "0" },
          lines: [],
          formula: modules.formula,
          warnings: [`A ${runLength} mm run does not fit a single ${moduleWidth} mm module.`],
        };
      }

      // One module is cut, then multiplied. That is how a kitchen is actually
      // built — identical boxes, made in a batch.
      //
      // The per-module figures come from `carcassParts` directly rather than by
      // reading them back out of the formatted result lines. Parsing your own
      // output by array position is a silent breakage waiting for somebody to
      // reorder a line.
      const moduleInput: CarcassInput = {
        width: moduleWidth,
        height: num(values, "height", 870),
        depth: num(values, "depth", 600),
        thickness: num(values, "thickness", 18),
        backThickness: num(values, "backThickness", 6),
        sections: 1,
        shelvesPerSection: count(values, "shelves", 1),
        doors: count(values, "doors", 1),
        drawers: count(values, "drawers", 0),
        toeKick: num(values, "toeKick", 100),
        worktopThickness: num(values, "worktop", 38),
      };

      const perModule = carcassParts(moduleInput);
      const one = carcassOutput(moduleInput, modules.formula);

      const n = modules.modules;
      const totalArea = perModule.boardArea * n;
      const sheets = Math.ceil((totalArea * 1.15) / SHEET_AREA_M2);

      return {
        headline: { label: "Board to buy", value: String(sheets), unit: `sheets of ${SHEET_LENGTH} × ${SHEET_WIDTH} mm` },
        lines: [
          { label: "Modules", value: String(n), unit: `× ${moduleWidth} mm` },
          { label: "Filler to make up the run", value: modules.fillerWidth.toFixed(0), unit: "mm" },
          { label: "Board area, whole run", value: round(totalArea, 3).toFixed(3), unit: "m²" },
          { label: "Board area, one module", value: perModule.boardArea.toFixed(3), unit: "m²", muted: true },
          { label: "Edge banding, whole run", value: round(perModule.bandingMetres * n, 2).toFixed(2), unit: "m" },
          { label: "Worktop length", value: runLength.toFixed(0), unit: "mm" },
        ],
        tables: (one.tables ?? []).map((table) => ({
          ...table,
          title: table.title === "Cut list" ? `Cut list — one ${moduleWidth} mm module` : `${table.title} — one module`,
          note:
            table.title === "Cut list"
              ? `Multiply every quantity by ${n} for the whole run. ${table.note ?? ""}`
              : `Multiply by ${n} for the whole run.`,
        })),
        formula: [
          ...one.formula,
          `Whole run: ${perModule.boardArea.toFixed(3)} m² × ${n} modules = ${round(totalArea, 3).toFixed(3)} m²`,
        ],
        warnings: perModule.warnings,
      };
    },
  },

  {
    slug: "tv-unit",
    title: "TV Unit Calculator",
    category: "furniture",
    summary: "Panels, shelves, doors and a cut list for a media or TV unit.",
    keywords: ["tv unit", "media", "console", "entertainment", "cut list", "sideboard"],
    fields: [
      ...dimensionFields({ width: 1800, height: 500, depth: 400 }),
      { kind: "number", id: "sections", label: "Compartments", suffix: "bays", integer: true, defaultValue: 3, min: 1 },
      { kind: "number", id: "shelves", label: "Shelves per compartment", suffix: "shelves", integer: true, defaultValue: 1, min: 0 },
      { kind: "number", id: "doors", label: "Doors", suffix: "doors", integer: true, defaultValue: 2, min: 0 },
      { kind: "number", id: "drawers", label: "Drawers", suffix: "drawers", integer: true, defaultValue: 1, min: 0 },
      { kind: "number", id: "toeKick", label: "Plinth height", suffix: "mm", defaultValue: 60, optional: true },
      BOARD_THICKNESS,
      BACK_THICKNESS,
    ],
    compute: (values) => carcassOutput(readCarcass(values)),
  },

  {
    slug: "vanity",
    title: "Vanity Calculator",
    category: "furniture",
    summary: "Cut list and hardware for a bathroom vanity, including the worktop.",
    keywords: ["vanity", "bathroom", "washbasin", "sink unit", "cut list"],
    fields: [
      ...dimensionFields({ width: 1200, height: 850, depth: 480 }),
      { kind: "number", id: "sections", label: "Sections", suffix: "bays", integer: true, defaultValue: 2, min: 1 },
      { kind: "number", id: "shelves", label: "Shelves per section", suffix: "shelves", integer: true, defaultValue: 1, min: 0 },
      { kind: "number", id: "doors", label: "Doors", suffix: "doors", integer: true, defaultValue: 2, min: 0 },
      { kind: "number", id: "drawers", label: "Drawers", suffix: "drawers", integer: true, defaultValue: 1, min: 0 },
      { kind: "number", id: "toeKick", label: "Plinth height", suffix: "mm", defaultValue: 100, optional: true },
      { kind: "number", id: "worktop", label: "Worktop thickness", suffix: "mm", defaultValue: 20, optional: true },
      BOARD_THICKNESS,
      BACK_THICKNESS,
    ],
    compute: (values) =>
      carcassOutput(readCarcass(values, { worktopThickness: num(values, "worktop", 20) }), [
        "The basin cut-out is not deducted — mark it from the basin's own template once the top is made.",
      ]),
  },

  {
    slug: "bookshelf",
    title: "Bookshelf Calculator",
    category: "furniture",
    summary: "Sides, shelves, dividers and a back panel for an open bookshelf.",
    keywords: ["bookshelf", "shelving", "shelves", "bookcase", "cut list", "library"],
    fields: [
      ...dimensionFields({ width: 900, height: 1800, depth: 300 }),
      { kind: "number", id: "sections", label: "Vertical sections", suffix: "bays", integer: true, defaultValue: 1, min: 1 },
      { kind: "number", id: "shelves", label: "Shelves per section", suffix: "shelves", integer: true, defaultValue: 4, min: 0 },
      { kind: "number", id: "doors", label: "Doors", suffix: "doors", integer: true, defaultValue: 0, min: 0 },
      { kind: "number", id: "toeKick", label: "Plinth height", suffix: "mm", defaultValue: 80, optional: true },
      BOARD_THICKNESS,
      BACK_THICKNESS,
    ],
    compute: (values) => carcassOutput(readCarcass(values, { drawers: 0 })),
  },

  {
    slug: "cabinet",
    title: "Cabinet & Storage Calculator",
    category: "furniture",
    summary: "A configurable carcass — any width, height, sections, shelves, doors and drawers — with its cut list.",
    keywords: ["cabinet", "storage", "cupboard", "unit", "carcass", "cut list", "office storage"],
    fields: [
      ...dimensionFields({ width: 1200, height: 2000, depth: 450 }),
      { kind: "number", id: "sections", label: "Sections", suffix: "bays", integer: true, defaultValue: 2, min: 1 },
      { kind: "number", id: "shelves", label: "Shelves per section", suffix: "shelves", integer: true, defaultValue: 3, min: 0 },
      { kind: "number", id: "doors", label: "Doors", suffix: "doors", integer: true, defaultValue: 2, min: 0 },
      { kind: "number", id: "drawers", label: "Drawers", suffix: "drawers", integer: true, defaultValue: 0, min: 0 },
      { kind: "number", id: "toeKick", label: "Plinth height", suffix: "mm", defaultValue: 100, optional: true },
      BOARD_THICKNESS,
      BACK_THICKNESS,
    ],
    compute: (values) => carcassOutput(readCarcass(values)),
  },
];
