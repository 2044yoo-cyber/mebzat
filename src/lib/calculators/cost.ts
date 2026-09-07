import { round } from "./units";

/**
 * Money.
 *
 * Two rules run through all of this and both are places people go wrong.
 *
 * **Waste and contingency are not the same thing and do not compound the same
 * way.** Waste is material you buy and throw away, so it applies to the
 * material only. Contingency covers the unknown across the whole job, so it
 * applies to the total after waste. Applying either to the wrong base is how an
 * estimate ends up 8% out before anybody has ordered anything.
 *
 * **Markup and margin are different numbers.** 25% markup on 100 is a price of
 * 125 and a margin of 20%. Quoting a 25% margin when you meant 25% markup gives
 * away the difference on every job, and it is the most expensive arithmetic
 * mistake a small contractor makes.
 */

export const CURRENCIES = [
  { value: "ETB", label: "ETB — Ethiopian birr", symbol: "ETB" },
  { value: "USD", label: "USD — US dollar", symbol: "$" },
  { value: "EUR", label: "EUR — Euro", symbol: "€" },
] as const;

export type CurrencyValue = (typeof CURRENCIES)[number]["value"];

/** Build quality, as a multiplier on a base rate the reader supplies. */
export const BUILD_QUALITY = [
  { value: "basic", label: "Basic — block, plaster, painted", factor: 0.8 },
  { value: "standard", label: "Standard — tiled, fitted joinery", factor: 1 },
  { value: "high", label: "High — imported finishes, AC, lift-ready", factor: 1.35 },
  { value: "luxury", label: "Luxury — bespoke throughout", factor: 1.8 },
] as const;

export function qualityFactor(value: string): number {
  return BUILD_QUALITY.find((q) => q.value === value)?.factor ?? 1;
}

/**
 * Ethiopian cities.
 *
 * The factor is a transport-and-availability adjustment relative to Addis, not
 * a price. Actual material prices come from Medosha's Price Exchange when they
 * exist and are typed in when they do not — nothing here invents a birr figure.
 */
export const CITIES = [
  { value: "addis_ababa", label: "Addis Ababa", factor: 1 },
  { value: "adama", label: "Adama", factor: 1.03 },
  { value: "bahir_dar", label: "Bahir Dar", factor: 1.08 },
  { value: "hawassa", label: "Hawassa", factor: 1.06 },
  { value: "mekelle", label: "Mekelle", factor: 1.12 },
  { value: "dire_dawa", label: "Dire Dawa", factor: 1.1 },
  { value: "gondar", label: "Gondar", factor: 1.1 },
  { value: "jimma", label: "Jimma", factor: 1.09 },
  { value: "other", label: "Elsewhere in Ethiopia", factor: 1.15 },
] as const;

export function cityFactor(value: string): number {
  return CITIES.find((city) => city.value === value)?.factor ?? 1;
}

export function cityLabel(value: string): string {
  return CITIES.find((city) => city.value === value)?.label ?? value;
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export type CostBreakdown = {
  material: number;
  labour: number;
  waste: number;
  contingency: number;
  other: number;
  total: number;
  formula: string[];
};

/**
 * Material, labour, waste, contingency, total — in that order, and with waste
 * on the material only.
 */
export function buildCost(input: {
  material: number;
  labour: number;
  other?: number;
  wastePercent: number;
  contingencyPercent: number;
}): CostBreakdown {
  const other = input.other ?? 0;
  const waste = input.material * (Math.max(0, input.wastePercent) / 100);
  const subtotal = input.material + waste + input.labour + other;
  const contingency = subtotal * (Math.max(0, input.contingencyPercent) / 100);

  return {
    material: round(input.material, 2),
    labour: round(input.labour, 2),
    waste: round(waste, 2),
    contingency: round(contingency, 2),
    other: round(other, 2),
    total: round(subtotal + contingency, 2),
    formula: [
      `Waste applies to material only: ${round(input.material, 2)} × ${input.wastePercent}% = ${round(waste, 2)}`,
      `Subtotal = material ${round(input.material, 2)} + waste ${round(waste, 2)} + labour ${round(input.labour, 2)}${other ? ` + other ${round(other, 2)}` : ""} = ${round(subtotal, 2)}`,
      `Contingency applies to the whole subtotal: ${round(subtotal, 2)} × ${input.contingencyPercent}% = ${round(contingency, 2)}`,
      `Total = ${round(subtotal + contingency, 2)}`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Markup, margin, VAT
// ---------------------------------------------------------------------------

/** Price from cost and markup. Markup is measured against **cost**. */
export function fromMarkup(cost: number, markupPercent: number) {
  const profit = cost * (markupPercent / 100);
  const price = cost + profit;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  return {
    price: round(price, 2),
    profit: round(profit, 2),
    marginPercent: round(margin, 2),
    formula: [
      `Profit = ${round(cost, 2)} × ${markupPercent}% = ${round(profit, 2)}`,
      `Selling price = ${round(cost, 2)} + ${round(profit, 2)} = ${round(price, 2)}`,
      `That is a margin of ${round(profit, 2)} ÷ ${round(price, 2)} = ${round(margin, 2)}% — lower than the markup, always.`,
    ],
  };
}

/** Margin from cost and price. Margin is measured against **price**. */
export function fromPrice(cost: number, price: number) {
  const profit = price - cost;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  const markup = cost > 0 ? (profit / cost) * 100 : 0;
  return {
    profit: round(profit, 2),
    marginPercent: round(margin, 2),
    markupPercent: round(markup, 2),
    formula: [
      `Profit = ${round(price, 2)} − ${round(cost, 2)} = ${round(profit, 2)}`,
      `Margin = ${round(profit, 2)} ÷ ${round(price, 2)} = ${round(margin, 2)}% (of the selling price)`,
      `Markup = ${round(profit, 2)} ÷ ${round(cost, 2)} = ${round(markup, 2)}% (of the cost)`,
    ],
  };
}

/**
 * VAT, both ways.
 *
 * `inclusive` means the amount already has tax in it and the job is to pull it
 * back out — net = gross ÷ (1 + rate), *not* gross × (1 − rate). At 15% those
 * two differ by more than 2% of the invoice.
 */
export function vat(amount: number, ratePercent: number, inclusive: boolean) {
  const rate = Math.max(0, ratePercent) / 100;
  if (inclusive) {
    const net = amount / (1 + rate);
    return {
      net: round(net, 2),
      tax: round(amount - net, 2),
      gross: round(amount, 2),
      formula: [
        `Net = ${round(amount, 2)} ÷ (1 + ${ratePercent}%) = ${round(net, 2)}`,
        `VAT = ${round(amount, 2)} − ${round(net, 2)} = ${round(amount - net, 2)}`,
        `Dividing is the only correct way out of a tax-inclusive figure. Multiplying the gross by (1 − rate) instead lands ${round(rate * rate * 100, 2)}% below the true net.`,
      ],
    };
  }
  const tax = amount * rate;
  return {
    net: round(amount, 2),
    tax: round(tax, 2),
    gross: round(amount + tax, 2),
    formula: [
      `VAT = ${round(amount, 2)} × ${ratePercent}% = ${round(tax, 2)}`,
      `Gross = ${round(amount, 2)} + ${round(tax, 2)} = ${round(amount + tax, 2)}`,
    ],
  };
}

/** Labour from a crew, a wage and a number of days. */
export function labourCost(input: {
  workers: number;
  dailyWage: number;
  days: number;
  hoursPerDay: number;
}) {
  const total = input.workers * input.dailyWage * input.days;
  const manDays = input.workers * input.days;
  const manHours = manDays * input.hoursPerDay;
  return {
    total: round(total, 2),
    manDays: round(manDays, 1),
    manHours: round(manHours, 1),
    perHour: manHours > 0 ? round(total / manHours, 2) : 0,
    formula: [
      `${input.workers} workers × ${round(input.dailyWage, 2)} per day × ${input.days} days = ${round(total, 2)}`,
      `Man-days = ${input.workers} × ${input.days} = ${round(manDays, 1)}`,
      `Man-hours = ${round(manDays, 1)} × ${input.hoursPerDay} = ${round(manHours, 1)}`,
    ],
  };
}
