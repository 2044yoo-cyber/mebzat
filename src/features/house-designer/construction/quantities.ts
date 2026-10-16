import type { BoqDraftItem, BoqSectionCode } from "@/lib/takeoff/boq";

import type { ComponentRecord, ConstructionModel, CostFields, ModelOptions, Provenance, QuantityItem, QuantityUnit } from "./types";
import { NO_COST } from "./types";

/**
 * The quantity data foundation. Component quantities are summed into bill
 * lines by work item. Net quantities, allowances and costs are always kept in
 * separate fields: nothing here adds waste to a net figure, and nothing
 * invents a price.
 */

const WORST: Record<Provenance, number> = { measured: 0, calculated: 1, assumed: 2, review: 3, missing: 4 };
export const worstStatus = (a: Provenance, b: Provenance): Provenance => (WORST[a] >= WORST[b] ? a : b);

export type QuantityLine = {
  workItem: string;
  description: string;
  section: BoqSectionCode;
  unit: QuantityUnit;
  /** Sum of the net quantities that have a number; null when none has. */
  net: number | null;
  /** The worst status among the items that make it up. */
  status: Provenance;
  /** Items whose quantity is missing (no number yet). */
  missingItems: number;
  itemCount: number;
  /** Allowance as a percentage when every item agrees on one, else null. */
  allowancePercent: number | null;
  /** Sum of net × percent for the items that state one: kept apart from `net`. */
  allowanceQuantity: number | null;
  allowanceRules: string[];
  componentIds: string[];
  storeys: string[];
  rooms: string[];
  formulas: string[];
  assumptions: string[];
  exclusions: string[];
  materialSpecs: string[];
  /** Always the empty cost fields: prices are never invented. */
  cost: CostFields;
  /** The items, so a line can be traced to the components and formulas behind it. */
  items: QuantityItem[];
};

export type QuantityScope = "building" | "loose" | "all";

function variantIncluded(c: ComponentRecord, options: ModelOptions): boolean {
  if (!c.variant) return true;
  if (c.variant.group === "roof") return options.roofType === c.variant.value;
  if (c.variant.group === "floorFinish") return options.floorFinish === c.variant.value;
  if (c.variant.group === "blockType") return options.blockType === c.variant.value;
  return true;
}

/** The components whose quantities count, given the options and the scope. Both roof alternatives exist in the model; only the chosen one is counted. */
export function countedComponents(model: ConstructionModel, options: ModelOptions = model.options, scope: QuantityScope = "building"): ComponentRecord[] {
  return model.components.filter((c) => variantIncluded(c, options) && (scope === "all" || (scope === "loose") === !!c.loose));
}

export function aggregateQuantities(model: ConstructionModel, options: ModelOptions = model.options, scope: QuantityScope = "building", filter?: (c: ComponentRecord) => boolean): QuantityLine[] {
  const lines = new Map<string, QuantityLine>();
  for (const c of countedComponents(model, options, scope)) {
    if (filter && !filter(c)) continue;
    for (const item of c.quantities) {
      const key = `${item.workItem}|${item.unit}`;
      let line = lines.get(key);
      if (!line) {
        line = {
          workItem: item.workItem, description: item.description, section: item.section, unit: item.unit, net: null, status: "measured", missingItems: 0, itemCount: 0, allowancePercent: null, allowanceQuantity: null, allowanceRules: [],
          componentIds: [], storeys: [], rooms: [], formulas: [], assumptions: [], exclusions: [], materialSpecs: [], cost: { ...NO_COST }, items: [],
        };
        lines.set(key, line);
      }
      line.items.push(item);
      line.itemCount += 1;
      line.status = worstStatus(line.status, item.status);
      if (item.value === null) line.missingItems += 1;
      else line.net = (line.net ?? 0) + item.value;
      if (!line.componentIds.includes(c.id)) line.componentIds.push(c.id);
      const storey = c.storeyName ?? "Site and below ground";
      if (!line.storeys.includes(storey)) line.storeys.push(storey);
      if (item.room && !line.rooms.includes(item.room)) line.rooms.push(item.room);
      if (line.formulas.length < 4 && !line.formulas.includes(item.formula)) line.formulas.push(item.formula);
      for (const a of item.assumptions) if (!line.assumptions.includes(a)) line.assumptions.push(a);
      for (const e of item.exclusions) if (!line.exclusions.includes(e)) line.exclusions.push(e);
      if (!line.materialSpecs.includes(item.materialSpec)) line.materialSpecs.push(item.materialSpec);
      if (item.allowance && !line.allowanceRules.includes(item.allowance.rule)) line.allowanceRules.push(item.allowance.rule);
    }
  }
  for (const line of lines.values()) {
    const pct = new Set(line.items.map((i) => (i.allowance ? i.allowance.percent : null)));
    line.allowancePercent = pct.size === 1 ? ([...pct][0] ?? null) : null;
    const withPct = line.items.filter((i) => i.value !== null && i.allowance && i.allowance.percent !== null);
    line.allowanceQuantity = withPct.length ? withPct.reduce((s, i) => s + i.value! * (i.allowance!.percent! / 100), 0) : null;
    if (line.net !== null) line.net = Math.round(line.net * 1e6) / 1e6;
    if (line.allowanceQuantity !== null) line.allowanceQuantity = Math.round(line.allowanceQuantity * 1e6) / 1e6;
    if (line.missingItems > 0) line.status = "missing";
  }
  return [...lines.values()].sort((a, b) => a.section.localeCompare(b.section) || a.workItem.localeCompare(b.workItem));
}

/** Lines that have no number yet, and why. */
export function missingData(lines: QuantityLine[]): QuantityLine[] {
  return lines.filter((l) => l.net === null || l.missingItems > 0);
}

/** Total of one work item prefix, for cross-checks: `concrete.` gives every concrete line in m³. */
export function totalOf(lines: QuantityLine[], prefix: string, unit: QuantityUnit): number {
  return lines.filter((l) => l.workItem.startsWith(prefix) && l.unit === unit).reduce((s, l) => s + (l.net ?? 0), 0);
}

const CONFIDENCE: Record<Provenance, number> = { measured: 0.95, calculated: 0.8, assumed: 0.5, review: 0.4, missing: 0 };

/**
 * The lines as draft bill items for the existing takeoff bill. Lines with no
 * number are left out (they are listed by `missingData`), allowances ride in
 * the notes rather than the quantity, and no rate is set.
 */
export function toBoqDraft(lines: QuantityLine[]): BoqDraftItem[] {
  return lines
    .filter((l) => l.net !== null)
    .map((l) => ({
      section: l.section,
      description: l.description,
      unit: l.unit,
      quantity: l.net!,
      source: l.status === "measured" ? ("bim" as const) : ("calculated" as const),
      confidence: CONFIDENCE[l.status],
      formula: l.formulas.join(" ; "),
      elementIds: l.componentIds,
      notes: [
        ...(l.allowancePercent !== null ? [`Allowance ${l.allowancePercent}% kept separate: ${l.allowanceQuantity ?? 0} ${l.unit}`] : l.allowanceQuantity !== null ? [`Allowances vary; kept separate: ${l.allowanceQuantity} ${l.unit}`] : []),
        ...l.assumptions.map((a) => `Assumption: ${a}`),
        ...l.exclusions.map((e) => `Excludes ${e}`),
        ...(l.missingItems > 0 ? [`${l.missingItems} item(s) have no quantity yet`] : []),
      ],
    }));
}
