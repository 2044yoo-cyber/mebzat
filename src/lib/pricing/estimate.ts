import {
  resolvePrice,
  sourceLabel,
  type PriceCandidate,
  type PriceSource,
} from "./resolve";

/**
 * The estimate a professional actually owns.
 *
 * Medosha works out a first cost. From then on the person costing the job is in
 * charge, and the rule the brief was most insistent about is the one this file
 * exists to guarantee:
 *
 *   **A price the user typed is never silently replaced.**
 *
 * Not on a recalculation, not when a marketplace listing changes, not when the
 * model runs again. Somebody who sets an aluminium profile to ETB 4,000 and
 * watches it snap back to 3,000 stops using the estimator that afternoon, and
 * they are right to. An override is removed when they remove it, and at no
 * other time.
 *
 * Everything else follows from that: the AI and marketplace figures are kept
 * beside the override rather than replaced by it, so "reset to marketplace" is
 * always available and always means something.
 */

/** Anything a person can change on a line. */
export type EditableField =
  | "quantity"
  | "unit"
  | "unitPrice"
  | "waste"
  | "labour"
  | "fabrication"
  | "installation"
  | "transport"
  | "margin"
  | "description"
  | "product";

export type CostExtra = {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
};

export type EstimateLine = {
  id: string;
  description: string;
  unit: string;
  quantity: number;

  /** Everything on offer from AI, the market and any chosen product. */
  candidates: PriceCandidate[];

  /**
   * What the person changed, and nothing else.
   *
   * Held separately from the candidates rather than merged into them, which is
   * what makes "reset" possible and what stops a recalculation overwriting an
   * edit — the recalculation replaces candidates, and never touches this.
   */
  override?: {
    quantity?: number;
    unit?: string;
    unitPrice?: number;
    description?: string;
    /** A marketplace listing chosen by hand. */
    productId?: string;
  };

  /** Percentages, applied in the order they appear in {@link computeLine}. */
  wastePercent?: number;
  marginPercent?: number;

  /** Per-unit additions that are part of the rate, not separate lines. */
  labour?: number;
  fabrication?: number;
  installation?: number;
  transport?: number;

  /** Whole costs that are not per unit: a lorry, a crane day, a permit. */
  extras?: CostExtra[];

  /** Which building elements this line covers. The traceability link. */
  elementIds?: string[];
};

export type ComputedLine = {
  line: EstimateLine;
  quantity: number;
  unit: string;
  /** The material rate actually used, before the additions. */
  unitPrice: number;
  source: PriceSource;
  sourceLabel: string;
  /** True when the person set this price by hand. */
  edited: boolean;

  quantityWithWaste: number;
  materialCost: number;
  labourCost: number;
  fabricationCost: number;
  installationCost: number;
  transportCost: number;
  extrasCost: number;

  /** Everything before margin. */
  cost: number;
  margin: number;
  /** What the client is quoted. */
  sellingPrice: number;

  /** The arithmetic, line by line, so a reader can check the total. */
  workings: string[];

  /** What the price would be from each source, for the reset buttons. */
  alternatives: { source: PriceSource; label: string; price: number; unit: string }[];
};

/**
 * Works out one line.
 *
 * Order matters and is fixed: waste inflates the quantity, the additions are
 * per final unit, and margin goes on the whole cost last. Applying margin
 * before the additions quietly under-quotes every line that has labour on it.
 */
export function computeLine(line: EstimateLine): ComputedLine {
  const quantity = line.override?.quantity ?? line.quantity;
  const unit = line.override?.unit ?? line.unit;

  // The override is a candidate like any other, at the top of the precedence
  // order — which is how it wins without any special case in the resolver.
  const candidates: PriceCandidate[] =
    line.override?.unitPrice !== undefined
      ? [
          { source: "user", price: line.override.unitPrice, unit },
          ...line.candidates,
        ]
      : line.candidates;

  const resolved = resolvePrice(candidates);
  const unitPrice = resolved?.price ?? 0;

  const waste = Math.max(0, line.wastePercent ?? 0);
  const quantityWithWaste = round(quantity * (1 + waste / 100));

  const materialCost = round(quantityWithWaste * unitPrice);
  const labourCost = round(quantityWithWaste * (line.labour ?? 0));
  const fabricationCost = round(quantityWithWaste * (line.fabrication ?? 0));
  const installationCost = round(quantityWithWaste * (line.installation ?? 0));
  const transportCost = round(quantityWithWaste * (line.transport ?? 0));
  const extrasCost = round(
    (line.extras ?? []).reduce(
      (sum, extra) => sum + extra.quantity * extra.unitPrice,
      0,
    ),
  );

  const cost = round(
    materialCost + labourCost + fabricationCost + installationCost + transportCost + extrasCost,
  );
  const marginPercent = Math.max(0, line.marginPercent ?? 0);
  const margin = round(cost * (marginPercent / 100));

  const workings: string[] = [];
  if (waste > 0) {
    workings.push(`${quantity} ${unit} + ${waste}% waste = ${quantityWithWaste} ${unit}`);
  }
  workings.push(`${quantityWithWaste} ${unit} × ${unitPrice} = ${materialCost}`);
  for (const [label, value] of [
    ["Labour", labourCost],
    ["Fabrication", fabricationCost],
    ["Installation", installationCost],
    ["Transport", transportCost],
  ] as const) {
    if (value > 0) workings.push(`${label}: ${quantityWithWaste} × rate = ${value}`);
  }
  for (const extra of line.extras ?? []) {
    workings.push(
      `${extra.label}: ${extra.quantity} × ${extra.unitPrice} = ${round(extra.quantity * extra.unitPrice)}`,
    );
  }
  if (marginPercent > 0) workings.push(`Margin ${marginPercent}% of ${cost} = ${margin}`);

  return {
    line,
    quantity,
    unit,
    unitPrice,
    source: resolved?.source ?? "ai",
    sourceLabel: resolved ? resolved.sourceLabel : "No price",
    edited: line.override?.unitPrice !== undefined,
    quantityWithWaste,
    materialCost,
    labourCost,
    fabricationCost,
    installationCost,
    transportCost,
    extrasCost,
    cost,
    margin,
    sellingPrice: round(cost + margin),
    workings,
    alternatives: (resolved?.alternatives ?? []).map((candidate) => ({
      source: candidate.source,
      label: sourceLabel(candidate.source),
      price: candidate.price,
      unit: candidate.unit,
    })),
  };
}

/** One recorded change, for the calculation history the brief asked for. */
export type EstimateChange = {
  lineId: string;
  field: EditableField;
  from: string | number | null;
  to: string | number | null;
  at: string;
  /** Set when the change was a reset rather than a typed value. */
  reset?: PriceSource;
};

export type EstimateEdit =
  | { field: "quantity"; value: number }
  | { field: "unit"; value: string }
  | { field: "unitPrice"; value: number }
  | { field: "description"; value: string }
  | { field: "waste"; value: number }
  | { field: "margin"; value: number }
  | { field: "labour"; value: number }
  | { field: "fabrication"; value: number }
  | { field: "installation"; value: number }
  | { field: "transport"; value: number };

/**
 * Applies one change and records it.
 *
 * Returns a new line rather than mutating, so undo is keeping the old one and
 * the history is a list of what happened rather than a reconstruction of it.
 */
export function applyEdit(
  line: EstimateLine,
  edit: EstimateEdit,
  at = new Date().toISOString(),
): { line: EstimateLine; change: EstimateChange } {
  const before = computeLine(line);
  const next: EstimateLine = { ...line, override: { ...line.override } };
  let from: string | number | null = null;

  switch (edit.field) {
    case "quantity":
      from = before.quantity;
      next.override = { ...next.override, quantity: edit.value };
      break;
    case "unit":
      from = before.unit;
      next.override = { ...next.override, unit: edit.value };
      break;
    case "unitPrice":
      from = before.unitPrice;
      next.override = { ...next.override, unitPrice: edit.value };
      break;
    case "description":
      from = line.override?.description ?? line.description;
      next.override = { ...next.override, description: edit.value };
      break;
    case "waste":
      from = line.wastePercent ?? 0;
      next.wastePercent = edit.value;
      break;
    case "margin":
      from = line.marginPercent ?? 0;
      next.marginPercent = edit.value;
      break;
    case "labour":
      from = line.labour ?? 0;
      next.labour = edit.value;
      break;
    case "fabrication":
      from = line.fabrication ?? 0;
      next.fabrication = edit.value;
      break;
    case "installation":
      from = line.installation ?? 0;
      next.installation = edit.value;
      break;
    case "transport":
      from = line.transport ?? 0;
      next.transport = edit.value;
      break;
  }

  return {
    line: next,
    change: { lineId: line.id, field: edit.field, from, to: edit.value, at },
  };
}

/**
 * Puts a line back to what a given source says.
 *
 * Resetting to `user` makes no sense and is refused; everything else drops the
 * price override so the resolver falls through to that source naturally. The
 * chosen product is cleared too when resetting past it, because leaving a
 * selected listing in place while claiming to have reset to the market average
 * would be a lie the UI then repeats.
 */
export function resetPrice(
  line: EstimateLine,
  to: Exclude<PriceSource, "user">,
  at = new Date().toISOString(),
): { line: EstimateLine; change: EstimateChange } {
  const before = computeLine(line);
  const override = { ...line.override };
  delete override.unitPrice;
  if (to !== "product") delete override.productId;

  const next: EstimateLine = {
    ...line,
    override: Object.keys(override).length > 0 ? override : undefined,
  };

  return {
    line: next,
    change: {
      lineId: line.id,
      field: "unitPrice",
      from: before.unitPrice,
      to: computeLine(next).unitPrice,
      at,
      reset: to,
    },
  };
}

/** Chooses a marketplace listing by hand. */
export function chooseProduct(
  line: EstimateLine,
  product: { id: string; title: string; price: number; unit: string },
  at = new Date().toISOString(),
): { line: EstimateLine; change: EstimateChange } {
  const before = computeLine(line);

  const next: EstimateLine = {
    ...line,
    override: { ...line.override, productId: product.id },
    candidates: [
      // Replaces any previously chosen product, keeps everything else.
      ...line.candidates.filter((candidate) => candidate.source !== "product"),
      {
        source: "product",
        price: product.price,
        unit: product.unit,
        productId: product.id,
        productTitle: product.title,
      },
    ],
  };

  return {
    line: next,
    change: {
      lineId: line.id,
      field: "product",
      from: before.line.override?.productId ?? null,
      to: product.title,
      at,
    },
  };
}

/**
 * Refreshes what the AI and the market say, without touching what the user set.
 *
 * This is the function the whole file is arranged around. A recalculation, a
 * price refresh, a re-run of the model — all of them come through here, and all
 * of them leave `override` alone.
 */
export function refreshCandidates(
  line: EstimateLine,
  candidates: PriceCandidate[],
): EstimateLine {
  const chosenProduct = line.candidates.find(
    (candidate) =>
      candidate.source === "product" &&
      candidate.productId === line.override?.productId,
  );

  return {
    ...line,
    candidates: chosenProduct
      ? [chosenProduct, ...candidates.filter((c) => c.source !== "product")]
      : candidates,
  };
}

export type EstimateTotals = {
  cost: number;
  margin: number;
  sellingPrice: number;
  lines: number;
  editedLines: number;
  /** Lines with no price at all, which make the total incomplete. */
  unpricedLines: number;
};

export function totalEstimate(lines: EstimateLine[]): EstimateTotals {
  const computed = lines.map(computeLine);

  return {
    cost: round(computed.reduce((sum, line) => sum + line.cost, 0)),
    margin: round(computed.reduce((sum, line) => sum + line.margin, 0)),
    sellingPrice: round(computed.reduce((sum, line) => sum + line.sellingPrice, 0)),
    lines: computed.length,
    editedLines: computed.filter((line) => line.edited).length,
    unpricedLines: computed.filter((line) => line.unitPrice === 0).length,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
