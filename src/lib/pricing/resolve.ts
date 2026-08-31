/**
 * Which price wins.
 *
 * A material on a bill of quantities can be priced six ways, and they are not
 * equal. The order is fixed and applies everywhere in Medosha:
 *
 *   1. **The user's own price.** They typed it. It wins over everything,
 *      including a marketplace product that disagrees, and it is never quietly
 *      replaced — that is the single most important rule in this file. A
 *      professional who changes a rate to ETB 4,000 and watches it snap back to
 *      3,000 on the next recalculation stops using the estimator.
 *   2. **A marketplace product they chose.** They picked a specific listing;
 *      that supplier's price is the price.
 *   3. **A verified reference price.** An administrator reviewed a figure in
 *      the material price book and stood behind it. Medosha's own word, above
 *      an anonymous average and below a listing somebody deliberately picked.
 *   4. **The marketplace average.** Several listings match and none was chosen,
 *      so the market says what it says.
 *   5. **An unverified reference price.** The price book holds something — a
 *      supplier's submission, a figure read off a public listing, or a planning
 *      baseline from the seed workbook — but nobody has confirmed it. Better
 *      than a guess, and labelled so nobody mistakes it for a quotation.
 *   6. **An AI suggestion.** Nothing on Medosha matches at all. This is a guess
 *      and is labelled as one.
 *
 * The price book occupies two rungs rather than one because its rows are not
 * one kind of fact. An administrator's verified figure and a teaching baseline
 * from the seed live in the same table and must not carry the same weight: the
 * first should beat a marketplace average, and the second must not. Collapsing
 * them to a single rank would either promote 439 unreviewed baselines above
 * real listings or bury the verified prices beneath them.
 *
 * Every resolved price carries where it came from, because "ETB 4,000/m" and
 * "ETB 4,000/m, because you typed it" are different numbers to a person
 * deciding whether to trust a total.
 *
 * ## The unit matters as much as the number
 *
 * A profile sold in 6 m bars at ETB 4,000 is not ETB 4,000 per metre. The
 * fabrication engine works out that a door needs four bars; this file has to
 * carry "bar" through to the cost line so that four is what gets multiplied.
 * Losing the unit here is how a quotation comes out four times too big, and it
 * is the reason `unit` is not optional anywhere below.
 */

export const PRICE_SOURCES = [
  "user",
  "product",
  "verified",
  "market",
  "reference",
  "ai",
] as const;

export type PriceSource = (typeof PRICE_SOURCES)[number];

/** Lower is stronger. Exported so a UI can sort or compare without guessing. */
export function sourceRank(source: PriceSource): number {
  return PRICE_SOURCES.indexOf(source);
}

export function sourceLabel(source: PriceSource): string {
  switch (source) {
    case "user":
      return "User edited";
    case "product":
      return "Marketplace product";
    case "verified":
      return "Medosha verified";
    case "market":
      return "Marketplace average";
    case "reference":
      return "Reference estimate";
    case "ai":
      return "AI suggested";
  }
}

/** True when the figure is nobody's confirmed price and must be labelled. */
export function isEstimatedSource(source: PriceSource): boolean {
  return source === "ai" || source === "reference";
}

/** One offer, from wherever. */
export type PriceCandidate = {
  source: PriceSource;
  /** Price for one `unit`. */
  price: number;
  /** "bar", "m", "m²", "pc", "kg", "bag". Never assumed. */
  unit: string;
  /** The listing or supplier this came from, when there is one. */
  productId?: string | null;
  productTitle?: string | null;
  currency?: string;
  /** How many listings the average was taken over. Only meaningful for market. */
  sampleSize?: number;
  /** When it was captured, so a stale market price can be shown as stale. */
  asOf?: string | null;
};

export type ResolvedPrice = {
  price: number;
  unit: string;
  currency: string;
  source: PriceSource;
  sourceLabel: string;
  productId: string | null;
  productTitle: string | null;
  sampleSize: number | null;
  /** Everything that was on offer, best first. Drives "reset to…" actions. */
  alternatives: PriceCandidate[];
  /** True when nothing on Medosha matched and this is a guess. */
  estimated: boolean;
};

/**
 * Picks the price.
 *
 * Candidates arrive in any order and from any mix of sources. Anything without
 * a usable number is dropped rather than treated as free — a null price is
 * missing information, and a zero is a line that silently costs nothing.
 */
export function resolvePrice(
  candidates: PriceCandidate[],
  currency = "ETB",
): ResolvedPrice | null {
  const usable = candidates.filter(
    (candidate) =>
      Number.isFinite(candidate.price) &&
      candidate.price > 0 &&
      typeof candidate.unit === "string" &&
      candidate.unit.length > 0,
  );

  if (usable.length === 0) return null;

  const ordered = [...usable].sort((a, b) => {
    const rank = sourceRank(a.source) - sourceRank(b.source);
    if (rank !== 0) return rank;
    // Two candidates of the same rank: the one backed by more listings, then
    // the cheaper. Deterministic either way, which matters because a quotation
    // that changes on a re-run is a quotation nobody trusts.
    const sample = (b.sampleSize ?? 0) - (a.sampleSize ?? 0);
    if (sample !== 0) return sample;
    return a.price - b.price;
  });

  const best = ordered[0]!;

  return {
    price: best.price,
    unit: best.unit,
    currency: best.currency ?? currency,
    source: best.source,
    sourceLabel: sourceLabel(best.source),
    productId: best.productId ?? null,
    productTitle: best.productTitle ?? null,
    sampleSize: best.sampleSize ?? null,
    alternatives: ordered,
    // An unverified reference price is as much an estimate as a model's guess.
    // It came from a real record rather than thin air, which is why it ranks
    // higher — but nobody has confirmed it, so a total resting on it is not a
    // quotation and the UI has to keep saying so.
    estimated: isEstimatedSource(best.source),
  };
}

/**
 * The marketplace average, over listings that agree about the unit.
 *
 * Averaging ETB 4,000 per bar with ETB 700 per metre produces ETB 2,350 per
 * nothing. So listings are grouped by unit and the largest group wins — that
 * being the unit the market actually trades in — and the others are reported
 * rather than blended away.
 */
export function averageMarketPrice(
  listings: { price: number; unit: string; currency?: string }[],
): { price: number; unit: string; sampleSize: number; ignored: number } | null {
  const usable = listings.filter(
    (listing) => Number.isFinite(listing.price) && listing.price > 0 && listing.unit,
  );
  if (usable.length === 0) return null;

  const byUnit = new Map<string, number[]>();
  for (const listing of usable) {
    const unit = normaliseUnit(listing.unit);
    byUnit.set(unit, [...(byUnit.get(unit) ?? []), listing.price]);
  }

  let bestUnit = "";
  let bestPrices: number[] = [];
  for (const [unit, prices] of byUnit) {
    if (
      prices.length > bestPrices.length ||
      (prices.length === bestPrices.length && unit < bestUnit)
    ) {
      bestUnit = unit;
      bestPrices = prices;
    }
  }

  // The median, not the mean. One supplier who has typed an extra zero moves a
  // mean of four listings by 25% and a median not at all, and mis-keyed prices
  // are common enough on any marketplace to design around.
  const sorted = [...bestPrices].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const price =
    sorted.length % 2 === 0
      ? (sorted[middle - 1]! + sorted[middle]!) / 2
      : sorted[middle]!;

  return {
    price: Math.round(price * 100) / 100,
    unit: bestUnit,
    sampleSize: bestPrices.length,
    ignored: usable.length - bestPrices.length,
  };
}

/**
 * The same unit written five ways.
 *
 * Marketplace listings are typed by people. "m2", "M²", "sqm" and "sq.m" are
 * one unit, and treating them as four means four averages of one listing each
 * instead of one average of four.
 */
export function normaliseUnit(unit: string): string {
  const value = unit.trim().toLowerCase().replace(/\s+/g, "");

  if (["m2", "m²", "sqm", "sq.m", "squaremetre", "squaremeter"].includes(value)) {
    return "m²";
  }
  if (["m3", "m³", "cbm", "cum", "cubicmetre", "cubicmeter"].includes(value)) {
    return "m³";
  }
  if (["m", "lm", "rm", "metre", "meter", "linearmetre", "linearmeter"].includes(value)) {
    return "m";
  }
  if (["pc", "pcs", "piece", "pieces", "no", "nos", "each", "ea", "unit"].includes(value)) {
    return "pc";
  }
  if (["bar", "bars", "length", "lengths", "stick", "sticks"].includes(value)) {
    return "bar";
  }
  if (["sheet", "sheets", "board", "boards", "panel", "panels"].includes(value)) {
    return "sheet";
  }
  if (["kg", "kgs", "kilo", "kilogram", "kilograms"].includes(value)) return "kg";
  if (["ton", "tonne", "tons", "tonnes", "mt"].includes(value)) return "tonne";
  if (["bag", "bags", "sack", "sacks"].includes(value)) return "bag";
  if (["l", "lt", "ltr", "litre", "liter", "litres", "liters"].includes(value)) {
    return "L";
  }
  if (["set", "sets", "kit", "kits"].includes(value)) return "set";

  return value;
}

/**
 * Whether a price can be applied to a quantity at all.
 *
 * The check that stops the four-times-too-big quotation: a quantity in bars
 * priced per metre is not a multiplication, it is a mistake. Rather than
 * silently converting — which needs a bar length this function does not have —
 * it says no, and the caller either finds a compatible price or asks.
 */
export function unitsAgree(quantityUnit: string, priceUnit: string): boolean {
  return normaliseUnit(quantityUnit) === normaliseUnit(priceUnit);
}

export type CostLine = {
  quantity: number;
  unit: string;
  unitPrice: number;
  currency: string;
  total: number;
  source: PriceSource;
  sourceLabel: string;
  /** The arithmetic, in words, so a reader can check it without the code. */
  formula: string;
};

/**
 * Quantity × price, with the units checked first.
 *
 * Returns null rather than a wrong number when the units do not match. A cost
 * line that is absent is a problem somebody fixes; a cost line that is wrong by
 * a factor of six is a problem somebody signs.
 */
export function costLine(
  quantity: number,
  quantityUnit: string,
  price: ResolvedPrice,
): CostLine | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  if (!unitsAgree(quantityUnit, price.unit)) return null;

  const total = Math.round(quantity * price.price * 100) / 100;

  return {
    quantity,
    unit: normaliseUnit(quantityUnit),
    unitPrice: price.price,
    currency: price.currency,
    total,
    source: price.source,
    sourceLabel: price.sourceLabel,
    formula: `${quantity} ${normaliseUnit(quantityUnit)} × ${price.currency} ${price.price} = ${price.currency} ${total}`,
  };
}
