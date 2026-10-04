import type { LengthUnit } from "./units";

/**
 * What a calculator *is*, as data.
 *
 * There are forty-odd calculators here and they differ in three ways only: the
 * fields they ask for, the arithmetic they do, and the lines they print. Making
 * each one a hand-written page would mean forty copies of the same validation,
 * the same unit dropdowns, the same reset button and the same layout — and
 * forty places for one of them to drift.
 *
 * So a calculator is a `CalculatorSpec`: a list of fields and a pure `compute`.
 * One form component renders any of them, one route serves any of them, and a
 * new calculator is a new object rather than a new page.
 *
 * `compute` is deliberately pure and synchronous. Nothing here touches the
 * network — arithmetic does not need a server, and a phone on a bad connection
 * should still be able to work out a slab.
 */

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

type FieldBase = {
  id: string;
  label: string;
  /** Shown under the input. Use for the thing that is easy to get wrong. */
  help?: string;
  placeholder?: string;
  /** Optional fields may be left blank; compute sees the default. */
  optional?: boolean;
  /** Only show this field when another field has one of these values. */
  showWhen?: { field: string; equals: string[] };
};

/**
 * A length. Renders a number plus its own unit dropdown, and `compute` is
 * handed **metres** whatever the reader picked.
 */
export type LengthField = FieldBase & {
  kind: "length";
  defaultUnit?: LengthUnit;
  /** Restrict the dropdown, e.g. thickness in mm/cm/in but not km. */
  units?: LengthUnit[];
  defaultValue?: number;
};

/** A bare number with a fixed suffix: percentages, counts, coats, rates. */
export type NumberField = FieldBase & {
  kind: "number";
  suffix?: string;
  /** Whole numbers only — bars, blocks, doors, workers. */
  integer?: boolean;
  min?: number;
  max?: number;
  defaultValue?: number;
};

/** Money. Rendered with the active currency in front of it. */
export type MoneyField = FieldBase & {
  kind: "money";
  defaultValue?: number;
  /**
   * The Price Exchange material this field can be filled from, when Medosha
   * has a current price for it. Empty means manual entry only.
   */
  priceKey?: string;
};

export type SelectField = FieldBase & {
  kind: "select";
  options: { value: string; label: string }[];
  defaultValue: string;
};

export type Field = LengthField | NumberField | MoneyField | SelectField;

/** What `compute` is handed: lengths in metres, everything else as typed. */
export type Values = Record<string, number | string>;

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** One line of the answer. */
export type ResultLine = {
  label: string;
  /** Already formatted — the calculator decides its own precision. */
  value: string;
  unit?: string;
  /** Quieter line: a sub-total, an input echoed back, a conversion. */
  muted?: boolean;
};

/** A table, for cut lists and bills where lines have columns. */
export type ResultTable = {
  title: string;
  columns: string[];
  rows: string[][];
  /** Printed under the table. */
  note?: string;
};

export type CalcOutput = {
  /** The one number the reader came for. */
  headline: ResultLine;
  lines: ResultLine[];
  /**
   * The working, one step per line, in the units it was done in. This is what
   * "Show calculation" prints, and it is why a professional will trust it.
   */
  formula: string[];
  tables?: ResultTable[];
  /** Shown in an amber panel. Practical range warnings, not errors. */
  warnings?: string[];
};

// ---------------------------------------------------------------------------
// The calculator
// ---------------------------------------------------------------------------

export const CALCULATOR_CATEGORIES = [
  { id: "construction", label: "Construction", blurb: "Budgets, bills and profit" },
  { id: "concrete", label: "Concrete & structure", blurb: "Volumes for every pour" },
  { id: "steel", label: "Rebar & steel", blurb: "Weights and bar counts" },
  { id: "masonry", label: "Masonry", blurb: "Blocks, bricks and mortar" },
  { id: "finishing", label: "Finishing", blurb: "Tile, paint, plaster, screed" },
  { id: "roofing", label: "Roofing", blurb: "Areas, pitch and sheets" },
  { id: "earthwork", label: "Earthwork", blurb: "Digging, filling and hauling" },
  { id: "architecture", label: "Architecture", blurb: "Geometry, stairs and slopes" },
  { id: "furniture", label: "Furniture & cabinets", blurb: "Cut lists from dimensions" },
  { id: "cost", label: "Material & cost", blurb: "What it adds up to" },
  { id: "business", label: "Business", blurb: "Markup, margin and VAT" },
] as const;

export type CategoryId = (typeof CALCULATOR_CATEGORIES)[number]["id"];

export type CalculatorSpec = {
  /** The URL: /calculators/<slug>. Stable — these get bookmarked and indexed. */
  slug: string;
  title: string;
  category: CategoryId;
  /** One line under the title, and the meta description. */
  summary: string;
  /** Search terms beyond the title. */
  keywords: string[];
  /** Empty for the three that carry their own component — see `custom`. */
  fields: Field[];
  /** Absent for the three that carry their own component — see `custom`. */
  compute?: (values: Values) => CalcOutput;
  /**
   * The handful that a field list cannot express: a bill with unlimited rows,
   * a material list with unlimited rows, and the unit converter, which is a
   * grid rather than a form. These name their own component; everything else
   * is rendered by the shared one.
   */
  custom?: "boq" | "materials" | "converter";
  /**
   * Set on anything structural. Prints the notice that a quantity estimate is
   * not a structural design — footings, columns, beams and reinforcement all
   * carry it.
   */
  structural?: boolean;
  /** Shown above the inputs where the method needs a sentence of context. */
  note?: string;
  /** Listed on the hub's front page. */
  popular?: boolean;
};

// ---------------------------------------------------------------------------
// Reading values
//
// `compute` receives whatever survived validation, so these helpers exist to
// keep every calculator from writing its own `Number(x) || 0`.
// ---------------------------------------------------------------------------

export function num(values: Values, id: string, fallback = 0): number {
  const raw = values[id];
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : fallback;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function str(values: Values, id: string, fallback = ""): string {
  const raw = values[id];
  return typeof raw === "string" ? raw : fallback;
}

/** A count: at least zero, and whole. */
export function count(values: Values, id: string, fallback = 1): number {
  return Math.max(0, Math.floor(num(values, id, fallback)));
}

/** A percentage that cannot be negative. */
export function percent(values: Values, id: string, fallback = 0): number {
  return Math.max(0, num(values, id, fallback));
}
