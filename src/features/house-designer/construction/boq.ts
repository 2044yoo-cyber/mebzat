import { sectionTitle, type BoqSectionCode } from "@/lib/takeoff/boq";

import { aggregateQuantities, ROOF_FLOOR, SITE_FLOOR, worstStatus, type QuantityLine, type QuantityPart, type QuantityScope } from "./quantities";
import { STAGE_BY_ID } from "./stages";
import { CATEGORY_IDS, CATEGORY_LABELS, STAGE_IDS, type CategoryId, type ComponentRecord, type ConstructionModel, type ModelOptions, type Provenance, type StageId } from "./types";

/**
 * The bill of quantities of a building: every line of work, summed from the components that make it, with the floor, the stage and the category each
 * part of it is from. Nothing is typed in: change the building and the bill is read off it again.
 *
 * The lines are the sum of their parts, and every grouping (by section, floor, stage or category) is a sum of the same parts, so each grouping adds up to
 * the same figures: a quantity is in the bill once however it is looked at.
 */

export type BillLine = QuantityLine & {
  /** "C.03": the section and the place in it. */
  ref: string;
};

export type BillFloor = { key: string; name: string; order: number };

export type Bill = {
  title: string;
  scope: QuantityScope;
  floors: BillFloor[];
  lines: BillLine[];
  /** The lines in the order of a bill: section by section. Empty sections are left out. */
  sections: { code: BoqSectionCode; title: string; lines: BillLine[] }[];
};

/** The floors of a model, from the foundations up: the foundations and site below the building, each storey, and the roof over them. */
export function floorsOf(model: ConstructionModel): BillFloor[] {
  return [
    { key: SITE_FLOOR, name: "Foundations, ground slab and site works", order: -1 },
    ...model.storeys.map((s) => ({ key: s.id, name: s.name, order: s.index })),
    { key: ROOF_FLOOR, name: "Roof", order: model.storeys.length },
  ];
}

const lineKey = (line: Pick<QuantityLine, "workItem" | "unit">): string => `${line.workItem}|${line.unit}`;

/** "C.03": the section and the place in it, counted over a whole bill. */
function numbered(lines: QuantityLine[]): Map<string, string> {
  const counts = new Map<BoqSectionCode, number>();
  const refs = new Map<string, string>();
  for (const line of lines) {
    const n = (counts.get(line.section) ?? 0) + 1;
    counts.set(line.section, n);
    refs.set(lineKey(line), `${line.section}.${String(n).padStart(2, "0")}`);
  }
  return refs;
}

const refCache = new WeakMap<ConstructionModel, Map<string, Map<string, string>>>();

/**
 * The reference of every line of the whole bill. A line keeps its reference whichever part of the building is being looked at (up to a stage, one floor), so
 * "C.03" is the same piece of work in the bill, the estimate and the exports. `whole` is the whole bill's lines when the caller has them already.
 */
function referencesOf(model: ConstructionModel, options: ModelOptions, scope: QuantityScope, whole?: QuantityLine[]): Map<string, string> {
  const perModel = refCache.get(model) ?? new Map<string, Map<string, string>>();
  refCache.set(model, perModel);
  const key = `${scope}|${JSON.stringify(options)}`;
  let refs = perModel.get(key);
  if (!refs) {
    refs = numbered(whole ?? aggregateQuantities(model, options, scope));
    perModel.set(key, refs);
  }
  return refs;
}

export function buildBill(model: ConstructionModel, options: ModelOptions = model.options, scope: QuantityScope = "building", filter?: (c: ComponentRecord) => boolean): Bill {
  const found = aggregateQuantities(model, options, scope, filter);
  const refs = referencesOf(model, options, scope, filter ? undefined : found);
  const lines: BillLine[] = found.map((line) => ({ ...line, ref: refs.get(lineKey(line)) ?? "?" }));
  const codes = [...new Set(lines.map((l) => l.section))].sort();
  return {
    title: model.title,
    scope,
    floors: floorsOf(model),
    lines,
    sections: codes.map((code) => ({ code, title: sectionTitle(code), lines: lines.filter((l) => l.section === code) })),
  };
}

export type BillGrouping = "section" | "floor" | "stage" | "category";

export type BillRow = {
  line: BillLine;
  /** The part of the line that is in this group. */
  net: number | null;
  allowance: number | null;
  status: Provenance;
  componentIds: string[];
  parts: QuantityPart[];
};

export type BillGroup = { key: string; label: string; rows: BillRow[] };

/** The group a part falls in when the bill is taken by floor, stage or category. */
export function groupKeyOf(part: QuantityPart, by: Exclude<BillGrouping, "section">): string {
  if (by === "floor") return part.floor;
  if (by === "stage") return String(part.stage);
  return part.category;
}

/** The keys of the groups, in the order they are read: the floors from the foundations up, the stages from the first, the categories as the model lists them. */
export function groupOrder(bill: Pick<Bill, "floors">, by: Exclude<BillGrouping, "section">): string[] {
  return by === "floor" ? bill.floors.map((f) => f.key) : by === "stage" ? STAGE_IDS.map(String) : [...CATEGORY_IDS];
}

export function groupLabel(bill: Pick<Bill, "floors">, by: Exclude<BillGrouping, "section">, key: string): string {
  if (by === "floor") return bill.floors.find((f) => f.key === key)?.name ?? key;
  if (by === "stage") return `${key}. ${STAGE_BY_ID[Number(key) as StageId]?.title ?? key}`;
  return CATEGORY_LABELS[key as CategoryId] ?? key;
}

/**
 * The bill taken a different way: by floor, by stage or by category, the lines of each with the part of them that is there. The parts of a line over
 * all the groups add up to the line.
 */
export function groupBill(bill: Bill, by: BillGrouping): BillGroup[] {
  if (by === "section") return bill.sections.map((s) => ({ key: s.code, label: `${s.code}. ${s.title}`, rows: s.lines.map((line) => rowOf(line, line.parts)) }));
  const groups = new Map<string, BillRow[]>();
  for (const line of bill.lines) {
    const byKey = new Map<string, QuantityPart[]>();
    for (const part of line.parts) {
      const k = groupKeyOf(part, by);
      byKey.set(k, [...(byKey.get(k) ?? []), part]);
    }
    for (const [k, parts] of byKey) groups.set(k, [...(groups.get(k) ?? []), rowOf(line, parts)]);
  }
  return groupOrder(bill, by).filter((k) => groups.has(k)).map((k) => ({ key: k, label: groupLabel(bill, by, k), rows: groups.get(k)! }));
}

function rowOf(line: BillLine, parts: QuantityPart[]): BillRow {
  const nets = parts.filter((p) => p.net !== null);
  const allowances = parts.filter((p) => p.allowance !== null);
  return {
    line,
    net: nets.length ? Math.round(nets.reduce((s, p) => s + p.net!, 0) * 1e6) / 1e6 : null,
    allowance: allowances.length ? Math.round(allowances.reduce((s, p) => s + p.allowance!, 0) * 1e6) / 1e6 : null,
    status: parts.reduce<Provenance>((w, p) => worstStatus(w, p.status), "measured"),
    componentIds: [...new Set(parts.map((p) => p.componentId))],
    parts,
  };
}
