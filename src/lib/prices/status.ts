/**
 * How far a material price can be trusted.
 *
 * No `server-only`: client components render these badges, and the AI, the BOQ
 * and the exchange all have to agree about what "verified" means. One list.
 *
 * The order here is the order declared in `price_data_status` in migration
 * 0041, weakest first, and the two must not drift — the database sorts by the
 * enum's ordinal and this module sorts by array index, so a disagreement would
 * put the exchange and the AI on different answers for the same material. The
 * check script asserts this list; `supabase/tests/price-book.sql` asserts the
 * database's.
 */

export const PRICE_STATUSES = [
  "expired",
  "educational_estimate",
  "web_sourced",
  "supplier_submitted",
  "admin_verified",
] as const;

export type PriceDataStatus = (typeof PRICE_STATUSES)[number];

export function isPriceDataStatus(value: unknown): value is PriceDataStatus {
  return (
    typeof value === "string" &&
    (PRICE_STATUSES as readonly string[]).includes(value)
  );
}

/** Higher is more trustworthy. Matches the enum's ordinal in Postgres. */
export function statusRank(status: PriceDataStatus): number {
  return PRICE_STATUSES.indexOf(status);
}

/**
 * What the badge says.
 *
 * Deliberately plain. "Initial estimate" tells somebody what they are looking
 * at; "EDUCATIONAL_ESTIMATE" tells them the column name.
 */
export const PRICE_STATUS_LABELS: Record<PriceDataStatus, string> = {
  expired: "Expired",
  educational_estimate: "Initial estimate",
  web_sourced: "Web sourced",
  supplier_submitted: "Supplier submitted",
  admin_verified: "Verified",
};

/**
 * The one-line caveat shown under the figure.
 *
 * Every status except `admin_verified` gets one, because every status except
 * `admin_verified` is somebody's guess about what something costs.
 */
export const PRICE_STATUS_NOTES: Record<PriceDataStatus, string | null> = {
  expired: "This price is older than the validity period and may be well out of date.",
  educational_estimate:
    "A planning baseline, not a market price. It has not been verified with a supplier.",
  web_sourced:
    "Read from a public listing. Nobody at Medosha has confirmed it with the seller.",
  supplier_submitted:
    "Submitted by a member and waiting for review. Not yet an official Medosha price.",
  admin_verified: null,
};

/** Colour intent for the badge, mapped to the design system's variants. */
export const PRICE_STATUS_TONE: Record<
  PriceDataStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  expired: "destructive",
  educational_estimate: "outline",
  web_sourced: "secondary",
  supplier_submitted: "secondary",
  admin_verified: "default",
};

/** Only an administrator's word makes a price official. */
export function isVerified(status: PriceDataStatus): boolean {
  return status === "admin_verified";
}

export type Confidence = "low" | "medium" | "high";

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** Days after which a price stops being treated as current. */
export const DEFAULT_VALIDITY_DAYS = 180;

export function ageInDays(priceDate: string, now = new Date()): number {
  const then = new Date(`${priceDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(then)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

export function isStale(
  priceDate: string,
  validityDays = DEFAULT_VALIDITY_DAYS,
  now = new Date(),
): boolean {
  return ageInDays(priceDate, now) > validityDays;
}

/**
 * How much to trust the answer as a whole.
 *
 * Three things move it, and they are not interchangeable:
 *
 *   * **Who stood behind it.** An administrator's word is worth more than any
 *     number of anonymous listings, so a verified price starts high and a
 *     baseline can never get there however many of them agree.
 *   * **How many agree.** One listing is an anecdote.
 *   * **How old it is.** Ethiopian material prices move fast enough that a
 *     figure from last year is a different fact, not a slightly worse one.
 *
 * A single educational baseline — which is what most of the seeded book is —
 * comes out `low`, and it should.
 */
export function confidenceOf(input: {
  status: PriceDataStatus;
  sampleSize: number;
  priceDate: string;
  validityDays?: number;
  now?: Date;
}): Confidence {
  const { status, sampleSize, priceDate } = input;
  const validity = input.validityDays ?? DEFAULT_VALIDITY_DAYS;
  const now = input.now ?? new Date();

  if (status === "expired" || isStale(priceDate, validity, now)) return "low";
  if (status === "educational_estimate") return "low";

  if (status === "admin_verified") {
    return sampleSize >= 2 ? "high" : "medium";
  }

  // Supplier submissions and web listings: a lone one is an anecdote, three
  // that agree is a market.
  if (sampleSize >= 3) return "medium";
  return "low";
}
