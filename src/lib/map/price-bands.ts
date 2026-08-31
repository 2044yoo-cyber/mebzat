/**
 * Colouring map markers by price, relative to what is on screen.
 *
 * A renter scanning Addis wants one thing from a map before they read a single
 * listing: where is expensive, and where is not. Colour answers that in a
 * glance; a column of numbers does not.
 *
 * ## The scale is computed, never written down
 *
 * "ETB 50,000 is green" is true of Addis this year and wrong the moment rents
 * move or somebody filters to Bole, where 50,000 is the cheap end. So the bands
 * come from the prices actually being displayed — the same set the list is
 * showing, after every filter — and are recomputed when that set changes.
 *
 * Quintiles rather than equal-width buckets. Rents are not evenly spread: most
 * cluster low with a long tail of villas, so equal-width bands would paint
 * ninety markers blue and leave four colours for the rest. Quintiles guarantee
 * each colour means "a fifth of what you are looking at", which is the
 * comparison somebody is actually making.
 *
 * ## Rent and sale never share a scale
 *
 * ETB 45,000 a month and ETB 45,000,000 outright are both ordinary. Mixed into
 * one distribution every rental is "lowest" and every sale is "highest", and
 * the map says nothing. The caller passes one kind at a time.
 *
 * Pure: prices in, thresholds out. No DOM, no map, no clock.
 */

/** Weakest to strongest, so the array index is the rank. */
export const PRICE_BANDS = [
  "lowest",
  "low",
  "medium",
  "high",
  "highest",
] as const;

export type PriceBand = (typeof PRICE_BANDS)[number];

export type BandStyle = {
  band: PriceBand;
  label: string;
  /** Marker fill. */
  base: string;
  /** The darker edge that gives the pin its raised look. */
  dark: string;
  /** The ring. Strongest at the top of the market, which is what stands out. */
  ring: string;
  /**
   * A shape as well as a colour.
   *
   * Colour alone fails for roughly one man in twelve, and red-versus-green is
   * the common case — the exact two ends of this scale. The bar count reads as
   * a level without any colour vision at all, and the price itself is never
   * replaced.
   */
  bars: number;
};

export const BAND_STYLES: Record<PriceBand, BandStyle> = {
  lowest: {
    band: "lowest",
    label: "Lowest",
    base: "#2563eb",
    dark: "#1d4ed8",
    ring: "rgba(37, 99, 235, 0.35)",
    bars: 1,
  },
  low: {
    band: "low",
    label: "Low",
    base: "#16a34a",
    dark: "#15803d",
    ring: "rgba(22, 163, 74, 0.35)",
    bars: 2,
  },
  medium: {
    band: "medium",
    label: "Medium",
    // Amber rather than a pure yellow: yellow on white is unreadable, and the
    // price sits on top of this.
    base: "#d97706",
    dark: "#b45309",
    ring: "rgba(217, 119, 6, 0.35)",
    bars: 3,
  },
  high: {
    band: "high",
    label: "High",
    base: "#ea580c",
    dark: "#c2410c",
    ring: "rgba(234, 88, 12, 0.45)",
    bars: 4,
  },
  highest: {
    band: "highest",
    label: "Highest",
    base: "#dc2626",
    dark: "#b91c1c",
    // Opaque and wider than the rest. The top of the market is what somebody
    // is looking for when they scan for red, so it gets the loudest ring —
    // drawn outside the body, so it never covers the price.
    ring: "rgba(220, 38, 38, 0.75)",
    bars: 5,
  },
};

/** What the scale was built from, which the legend says out loud. */
export type ScaleBasis = "percentile" | "fixed" | "none";

export type PriceScale = {
  basis: ScaleBasis;
  /**
   * Four thresholds, ascending, splitting prices into the five bands. A price
   * below `thresholds[0]` is `lowest`; at or above `thresholds[3]`, `highest`.
   */
  thresholds: number[];
  /** How many priced listings the scale was computed from. */
  sampleSize: number;
  min: number | null;
  max: number | null;
};

/**
 * Below this, quintiles describe the sample rather than the market.
 *
 * With six listings each band is one property, so "highest" means "the dearest
 * of six" — which is a fact about the filter, not about Addis. The fixed
 * ladders below are used instead, and the legend says so.
 */
export const MIN_SAMPLE_FOR_PERCENTILES = 12;

/**
 * The fallback ladders, in ETB.
 *
 * Only reached when there is too little data to compute a scale. Chosen to
 * bracket the ordinary range of the Addis market rather than to be precise:
 * their job is to keep the five colours meaningful on a screen showing four
 * listings.
 */
export const FIXED_THRESHOLDS: Record<"rent" | "sale", number[]> = {
  rent: [20_000, 35_000, 60_000, 120_000],
  sale: [3_000_000, 8_000_000, 20_000_000, 50_000_000],
};

/** Rent and lease share a ladder; sale and auction share the other. */
export function scaleKindFor(listingKind: string): "rent" | "sale" {
  return listingKind === "rent" || listingKind === "lease" ? "rent" : "sale";
}

/**
 * The value at a percentile of an ascending array, interpolating between
 * neighbours.
 *
 * Nearest-rank would do, but it makes thresholds jump by a whole listing when
 * one is added, and a marker changing colour because somebody else published
 * a flat looks like a bug.
 */
function quantile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;

  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;

  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

/**
 * Builds the scale from the prices on screen.
 *
 * Nulls and non-positive numbers are dropped rather than treated as zero: a
 * listing with no price is "on request", and counting it as free would drag
 * the bottom band down and mislabel the cheapest real listings.
 */
export function buildPriceScale(
  prices: (number | null | undefined)[],
  kind: "rent" | "sale" = "rent",
): PriceScale {
  const usable = prices
    .filter((price): price is number => typeof price === "number" && Number.isFinite(price) && price > 0)
    .sort((a, b) => a - b);

  if (usable.length === 0) {
    return { basis: "none", thresholds: FIXED_THRESHOLDS[kind], sampleSize: 0, min: null, max: null };
  }

  const min = usable[0]!;
  const max = usable[usable.length - 1]!;

  if (usable.length < MIN_SAMPLE_FOR_PERCENTILES) {
    return {
      basis: "fixed",
      thresholds: FIXED_THRESHOLDS[kind],
      sampleSize: usable.length,
      min,
      max,
    };
  }

  const thresholds = [0.2, 0.4, 0.6, 0.8].map((fraction) => quantile(usable, fraction));

  // Quintiles collapse when many listings share a price — forty flats all at
  // 25,000 puts several thresholds on the same number, and every band between
  // them becomes unreachable. The scale is still correct (nothing lands in an
  // empty band) but it is no longer five colours, so the caller is told the
  // truth about what it got rather than being given a ladder with rungs
  // missing pretending otherwise.
  const distinct = new Set(thresholds).size;
  if (distinct < thresholds.length) {
    return {
      basis: "fixed",
      thresholds: FIXED_THRESHOLDS[kind],
      sampleSize: usable.length,
      min,
      max,
    };
  }

  return { basis: "percentile", thresholds, sampleSize: usable.length, min, max };
}

/**
 * The band a price falls in.
 *
 * Null for a listing with no price — it gets the neutral marker, because
 * "on request" is not cheap and is not dear.
 *
 * Monotone by construction: the thresholds ascend and the comparison is a
 * single `>=` walk, so a higher price can never be given a lower band. That is
 * the one property the whole feature rests on.
 */
export function bandFor(
  price: number | null | undefined,
  scale: PriceScale,
): PriceBand | null {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  let rank = 0;
  for (const threshold of scale.thresholds) {
    if (price >= threshold) rank += 1;
    else break;
  }

  return PRICE_BANDS[Math.min(rank, PRICE_BANDS.length - 1)]!;
}

export type LegendRow = {
  band: PriceBand;
  style: BandStyle;
  /** Inclusive lower bound, or null for the bottom band. */
  from: number | null;
  /** Exclusive upper bound, or null for the top band. */
  to: number | null;
};

/** The legend's rows, strongest first — the order somebody reads a key. */
export function legendRows(scale: PriceScale): LegendRow[] {
  return [...PRICE_BANDS]
    .map((band, index) => ({
      band,
      style: BAND_STYLES[band],
      from: index === 0 ? null : (scale.thresholds[index - 1] ?? null),
      to: index === PRICE_BANDS.length - 1 ? null : (scale.thresholds[index] ?? null),
    }))
    .reverse();
}
