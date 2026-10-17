import { sectionTitle, type BoqSectionCode } from "@/lib/takeoff/boq";

import { groupKeyOf, groupLabel, groupOrder, type Bill, type BillGrouping, type BillLine } from "./boq";
import { CURRENCY, type PriceBook, type PriceEntry, type Rate, type RateStatus } from "./price-book";
import type { Provenance, QuantityUnit } from "./types";

/**
 * The cost of the bill: each line priced from the price book, and the costs round it that are not work on site.
 *
 * ## The sum
 *
 * For every part of every line, the material is (net quantity + allowance for waste) × the material rate, and the labour is the net quantity × the labour rate.
 * The materials and the labour added up are the direct cost. On top of that go the additional costs (site overheads, transport, profit and the like), each a
 * percentage of the materials, the labour, the direct cost or the running total, or a fixed sum; then the contingency, a percentage of the lot; and last the
 * taxes, each a percentage of that. The cost per square metre is the total over the gross floor area.
 *
 * ## What it says about itself
 *
 * A line is priced, partly priced (one of its two rates is missing), unpriced, included in another line's rate, or without a quantity. Nothing is counted as
 * nothing quietly: a line that could not be priced is listed with the reason, and the summary says how much of the direct cost rests on example rates, on rates
 * somebody entered, on rates a supplier quoted, and how much on quantities that are assumptions. A cost is only as good as the weakest rate under it.
 *
 * The estimate is a function of the bill and the price book. Change a rate and it is worked out again; the building is not drawn again.
 */

export type AdditionalBasis = "materials" | "labour" | "direct" | "running" | "fixed";

export const ADDITIONAL_BASIS_LABELS: Record<AdditionalBasis, string> = {
  materials: "% of materials",
  labour: "% of labour",
  direct: "% of direct cost",
  running: "% of the total so far",
  fixed: "a fixed sum, ETB",
};

export type AdditionalCost = {
  id: string;
  name: string;
  basis: AdditionalBasis;
  /** A percentage, or birr when the basis is `fixed`. */
  value: number;
  enabled: boolean;
  note: string;
};

export type Tax = { id: string; name: string; percent: number; enabled: boolean; note: string };

export type CostRules = {
  additional: AdditionalCost[];
  /** Percent of the direct cost and the additional costs. */
  contingencyPercent: number;
  taxes: Tax[];
};

export const DEFAULT_COST_RULES: CostRules = {
  additional: [
    { id: "prelims", name: "Preliminaries and site overheads", basis: "direct", value: 8, enabled: true, note: "Site office and stores, supervision, insurance, water and power for the works (an example)." },
    { id: "transport", name: "Transport and haulage of materials", basis: "materials", value: 4, enabled: true, note: "From the supplier to the site (an example)." },
    { id: "equipment", name: "Equipment and scaffolding hire", basis: "direct", value: 3, enabled: true, note: "Mixer, vibrator, scaffolding and props (an example)." },
    { id: "profit", name: "Contractor's overhead and profit", basis: "running", value: 10, enabled: true, note: "On the direct cost and the items above (an example)." },
    { id: "fees", name: "Design, supervision and permit fees", basis: "direct", value: 0, enabled: false, note: "Left off until they are known." },
  ],
  contingencyPercent: 5,
  taxes: [{ id: "vat", name: "Value added tax", percent: 15, enabled: true, note: "The statutory rate at the time of writing: check it before relying on it." }],
};

const finite = (n: unknown, fallback: number, min = 0, max = 1000000000): number => (typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback);

/** Cost rules read back from something saved, repaired from the defaults where they are not right. */
export function readCostRules(raw: unknown): CostRules {
  const base = DEFAULT_COST_RULES;
  if (typeof raw !== "object" || raw === null) return structuredClone(base);
  const r = raw as Record<string, unknown>;
  const bases: AdditionalBasis[] = ["materials", "labour", "direct", "running", "fixed"];
  const additional = Array.isArray(r.additional)
    ? (r.additional as unknown[]).flatMap((a, i) => {
        if (typeof a !== "object" || a === null) return [];
        const x = a as Record<string, unknown>;
        const basis = bases.includes(x.basis as AdditionalBasis) ? (x.basis as AdditionalBasis) : "direct";
        return [{ id: typeof x.id === "string" && x.id ? x.id.slice(0, 40) : `extra-${i}`, name: typeof x.name === "string" ? x.name.slice(0, 80) : "Additional cost", basis, value: finite(x.value, 0, 0, basis === "fixed" ? 1e10 : 1000), enabled: x.enabled !== false, note: typeof x.note === "string" ? x.note.slice(0, 200) : "" }];
      })
    : structuredClone(base.additional);
  const taxes = Array.isArray(r.taxes)
    ? (r.taxes as unknown[]).flatMap((t, i) => {
        if (typeof t !== "object" || t === null) return [];
        const x = t as Record<string, unknown>;
        return [{ id: typeof x.id === "string" && x.id ? x.id.slice(0, 40) : `tax-${i}`, name: typeof x.name === "string" ? x.name.slice(0, 80) : "Tax", percent: finite(x.percent, 0, 0, 100), enabled: x.enabled !== false, note: typeof x.note === "string" ? x.note.slice(0, 200) : "" }];
      })
    : structuredClone(base.taxes);
  return { additional, contingencyPercent: finite(r.contingencyPercent, base.contingencyPercent, 0, 100), taxes };
}

/** How a line came to be priced, or not. */
export type Pricing = "priced" | "partial" | "unpriced" | "included" | "no-quantity";

export type CostFlag =
  | "no-price-entry" | "unit-differs" | "material-price-missing" | "labour-price-missing"
  | "example-rate" | "entered-rate" | "quoted-rate"
  | "quantity-assumed" | "quantity-review" | "quantity-incomplete" | "no-quantity" | "included";

export const COST_FLAG_LABELS: Record<CostFlag, string> = {
  "no-price-entry": "No price entry for this work",
  "unit-differs": "The price is per a different unit",
  "material-price-missing": "Material price missing",
  "labour-price-missing": "Labour price missing",
  "example-rate": "Example rate",
  "entered-rate": "Rate entered by you",
  "quoted-rate": "Quoted rate",
  "quantity-assumed": "Quantity is an assumption",
  "quantity-review": "Quantity needs review",
  "quantity-incomplete": "Some items have no quantity",
  "no-quantity": "No quantity",
  included: "Priced with another line",
};

export type CostPart = {
  componentId: string;
  floor: string;
  stage: number;
  category: string;
  net: number | null;
  allowance: number | null;
  material: number;
  labour: number;
  quantityStatus: Provenance;
};

export type EstimateLine = {
  ref: string;
  section: BoqSectionCode;
  workItem: string;
  description: string;
  unit: QuantityUnit;
  net: number | null;
  allowance: number | null;
  quantityStatus: Provenance;
  materialRate: number | null;
  labourRate: number | null;
  materialRateStatus: RateStatus | null;
  labourRateStatus: RateStatus | null;
  material: number;
  labour: number;
  total: number;
  pricing: Pricing;
  includedIn: string | null;
  flags: CostFlag[];
  parts: CostPart[];
};

export type EstimateGroup = { key: string; label: string; material: number; labour: number; total: number; lines: number };

export type Problem = { ref: string; workItem: string; description: string; flag: CostFlag; detail: string };

export type Estimate = {
  currency: typeof CURRENCY;
  lines: EstimateLine[];
  materials: number;
  labour: number;
  direct: number;
  additional: { id: string; name: string; basis: AdditionalBasis; value: number; base: number; amount: number; enabled: boolean }[];
  additionalTotal: number;
  subtotal: number;
  contingency: { percent: number; base: number; amount: number };
  taxable: number;
  taxes: { id: string; name: string; percent: number; amount: number; enabled: boolean }[];
  taxTotal: number;
  total: number;
  area: { grossFloor: number; totalSlab: number; perM2: number | null; directPerM2: number | null; perM2Slab: number | null };
  groups: Record<BillGrouping, EstimateGroup[]>;
  summary: {
    lines: number;
    byPricing: Record<Pricing, number>;
    /** The direct cost that rests on each kind of rate, and on each kind of quantity. */
    directByRate: Record<RateStatus, number>;
    directByQuantity: Record<Provenance, number>;
    /** The share of the direct cost resting on example rates, 0 to 1. */
    exampleShare: number;
    problems: Problem[];
  };
};

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
/** What a rate is worth in the estimate: its figure, or nothing when it has none. */
const figure = (rate: Rate | undefined): number | null => (rate && rate.value !== null ? rate.value : null);

export type Areas = { grossFloor: number; totalSlab: number };

function priceLine(line: BillLine, entry: PriceEntry | undefined): EstimateLine {
  const flags: CostFlag[] = [];
  const base = { ref: line.ref, section: line.section, workItem: line.workItem, description: line.description, unit: line.unit, net: line.net, allowance: line.allowanceQuantity, quantityStatus: line.status };
  const quantityFlags = (): void => {
    if (line.status === "assumed") flags.push("quantity-assumed");
    if (line.status === "review") flags.push("quantity-review");
    if (line.net !== null && line.missingItems > 0) flags.push("quantity-incomplete");
  };
  const empty = (pricing: Pricing, extra: CostFlag[], includedIn: string | null = null): EstimateLine => ({
    ...base, materialRate: null, labourRate: null, materialRateStatus: null, labourRateStatus: null, material: 0, labour: 0, total: 0, pricing, includedIn, flags: [...extra, ...flags],
    parts: line.parts.map((p) => ({ componentId: p.componentId, floor: p.floor, stage: p.stage, category: p.category, net: p.net, allowance: p.allowance, material: 0, labour: 0, quantityStatus: p.status })),
  });
  if (!entry) { quantityFlags(); return empty("unpriced", ["no-price-entry"]); }
  if (entry.includedIn) return empty("included", ["included"], entry.includedIn);
  if (entry.unit !== line.unit) { quantityFlags(); return empty("unpriced", ["unit-differs"]); }
  if (line.net === null) return empty("no-quantity", ["no-quantity"]);
  quantityFlags();
  const mat = figure(entry.material);
  const lab = figure(entry.labour);
  const parts: CostPart[] = line.parts.map((p) => ({
    componentId: p.componentId, floor: p.floor, stage: p.stage, category: p.category, net: p.net, allowance: p.allowance,
    // Waste is bought, so the material is priced on the quantity and its allowance; labour builds only the net.
    material: p.net === null || mat === null ? 0 : (p.net + (p.allowance ?? 0)) * mat,
    labour: p.net === null || lab === null ? 0 : p.net * lab,
    quantityStatus: p.status,
  }));
  const material = sum(parts.map((p) => p.material));
  const labour = sum(parts.map((p) => p.labour));
  // A rate of nought is a price (nothing to pay for); a rate that is missing is not.
  const materialRateStatus = mat !== null && mat > 0 ? entry.material.status : null;
  const labourRateStatus = lab !== null && lab > 0 ? entry.labour.status : null;
  const rateFlags: CostFlag[] = [];
  if (mat === null) rateFlags.push("material-price-missing");
  if (lab === null) rateFlags.push("labour-price-missing");
  for (const status of [materialRateStatus, labourRateStatus]) if (status) { const f: CostFlag = status === "assumed" ? "example-rate" : status === "entered" ? "entered-rate" : "quoted-rate"; if (!rateFlags.includes(f)) rateFlags.push(f); }
  return {
    ...base, materialRate: mat, labourRate: lab, materialRateStatus, labourRateStatus, material, labour, total: material + labour,
    pricing: mat === null && lab === null ? "unpriced" : mat === null || lab === null ? "partial" : "priced", includedIn: null, flags: [...rateFlags, ...flags], parts,
  };
}

const PROBLEM_DETAIL: Partial<Record<CostFlag, (l: EstimateLine) => string>> = {
  "no-price-entry": () => "The price book has no entry for this work.",
  "unit-differs": (l) => `The bill measures it in ${l.unit}; the price book prices a different unit.`,
  "material-price-missing": () => "There is no material rate.",
  "labour-price-missing": () => "There is no labour rate.",
  "no-quantity": () => "The bill has no quantity for it yet.",
  "quantity-incomplete": () => "Some of its items have no quantity yet, so only the rest is priced.",
};

/**
 * The estimate of a bill. `areas` give the cost per square metre; the bill's parts say which floor, stage and category each cost belongs to, so every grouping
 * adds up to the same direct cost.
 */
export function estimateCost(bill: Bill, book: PriceBook, rules: CostRules = DEFAULT_COST_RULES, areas: Areas = { grossFloor: 0, totalSlab: 0 }): Estimate {
  const lines = bill.lines.map((line) => priceLine(line, book.entries[line.workItem]));
  const materials = sum(lines.map((l) => l.material));
  const labour = sum(lines.map((l) => l.labour));
  const direct = materials + labour;

  let running = direct;
  const additional = rules.additional.map((a) => {
    const base = a.basis === "materials" ? materials : a.basis === "labour" ? labour : a.basis === "direct" ? direct : a.basis === "running" ? running : 1;
    const amount = !a.enabled ? 0 : a.basis === "fixed" ? a.value : (base * a.value) / 100;
    running += amount;
    return { id: a.id, name: a.name, basis: a.basis, value: a.value, base: a.basis === "fixed" ? 0 : base, amount, enabled: a.enabled };
  });
  const additionalTotal = sum(additional.map((a) => a.amount));
  const subtotal = direct + additionalTotal;
  const contingency = { percent: rules.contingencyPercent, base: subtotal, amount: (subtotal * rules.contingencyPercent) / 100 };
  const taxable = subtotal + contingency.amount;
  const taxes = rules.taxes.map((t) => ({ id: t.id, name: t.name, percent: t.percent, amount: t.enabled ? (taxable * t.percent) / 100 : 0, enabled: t.enabled }));
  const taxTotal = sum(taxes.map((t) => t.amount));
  const total = taxable + taxTotal;

  const groups = {} as Record<BillGrouping, EstimateGroup[]>;
  for (const by of ["section", "floor", "stage", "category"] as BillGrouping[]) {
    const sums = new Map<string, EstimateGroup>();
    const add = (key: string, label: string, material: number, labour: number, counted: boolean) => {
      const g = sums.get(key) ?? { key, label, material: 0, labour: 0, total: 0, lines: 0 };
      g.material += material;
      g.labour += labour;
      g.total += material + labour;
      if (counted) g.lines += 1;
      sums.set(key, g);
    };
    bill.lines.forEach((billLine, li) => {
      const l = lines[li]!;
      const seen = new Set<string>();
      l.parts.forEach((p, i) => {
        const part = billLine.parts[i]!;
        const key = by === "section" ? l.section : groupKeyOf(part, by);
        const label = by === "section" ? `${l.section}. ${sectionTitle(l.section)}` : groupLabel(bill, by, key);
        add(key, label, p.material, p.labour, !seen.has(key));
        seen.add(key);
      });
    });
    const order = by === "section" ? [...new Set(bill.lines.map((l) => l.section))] : groupOrder(bill, by);
    groups[by] = order.filter((k) => sums.has(k)).map((k) => sums.get(k)!);
  }

  const byPricing: Record<Pricing, number> = { priced: 0, partial: 0, unpriced: 0, included: 0, "no-quantity": 0 };
  const directByRate: Record<RateStatus, number> = { assumed: 0, entered: 0, quoted: 0 };
  const directByQuantity: Record<Provenance, number> = { measured: 0, calculated: 0, assumed: 0, review: 0, missing: 0 };
  const problems: Problem[] = [];
  for (const l of lines) {
    byPricing[l.pricing] += 1;
    if (l.materialRateStatus) directByRate[l.materialRateStatus] += l.material;
    if (l.labourRateStatus) directByRate[l.labourRateStatus] += l.labour;
    for (const p of l.parts) directByQuantity[p.quantityStatus] += p.material + p.labour;
    for (const flag of l.flags) { const detail = PROBLEM_DETAIL[flag]; if (detail) problems.push({ ref: l.ref, workItem: l.workItem, description: l.description, flag, detail: detail(l) }); }
  }
  return {
    currency: CURRENCY, lines, materials, labour, direct, additional, additionalTotal, subtotal, contingency, taxable, taxes, taxTotal, total,
    area: {
      grossFloor: areas.grossFloor, totalSlab: areas.totalSlab,
      perM2: areas.grossFloor > 0 ? total / areas.grossFloor : null, directPerM2: areas.grossFloor > 0 ? direct / areas.grossFloor : null, perM2Slab: areas.totalSlab > 0 ? total / areas.totalSlab : null,
    },
    groups,
    summary: { lines: lines.length, byPricing, directByRate, directByQuantity, exampleShare: direct > 0 ? directByRate.assumed / direct : 0, problems },
  };
}
