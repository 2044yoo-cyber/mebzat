import {
  matchMaterial,
  STRONG_MATCH,
  type MatchCandidate,
  type MaterialQuery,
} from "@/lib/pricing/match";
import { normaliseUnit } from "@/lib/pricing/resolve";

import {
  confidenceOf,
  isStale,
  statusRank,
  type Confidence,
  type PriceDataStatus,
} from "./status";

/**
 * Choosing which price in the book answers a question.
 *
 * Pure: records in, an answer out. No database, no network, no clock it does
 * not accept as an argument — so the rules that decide what somebody is told
 * about a price can be checked exhaustively rather than demonstrated once.
 *
 * ## Relevance first, then trust, then recency
 *
 * The brief asks for trust order: verified, then supplier, then web, then
 * estimate; newest within each. That is right, but it cannot be the *first*
 * question, because "which of these is the most trustworthy price" is
 * meaningless until "is this even the material they asked about" has been
 * answered. A verified price for 150 mm block is a worse answer to a question
 * about 200 mm block than an unverified price for the right one — it is not a
 * weaker answer, it is a wrong one.
 *
 * So the scorer runs first and discards the wrong material and the wrong unit.
 * The trust order then decides among what is left, which is what the brief
 * meant.
 */

/** One row of the price book, as the application sees it. */
export type PriceRecord = {
  id: string;
  category: string;
  subcategory: string | null;
  material: string;
  specification: string | null;
  unit: string;
  brand: string | null;
  cityRegion: string;
  priceEtb: number;
  currency: string;
  vatStatus: string;
  supplier: string | null;
  source: string | null;
  /** ISO date, `YYYY-MM-DD`. */
  priceDate: string;
  dataStatus: PriceDataStatus;
  notes: string | null;
};

export type PriceQuestion = {
  /** What the person typed: "MDF 18mm", "200 mm HCB walling". */
  material: string;
  /** Optional. When given, a record in a different unit is not an answer. */
  unit?: string;
  /** Optional. Preferred, never required — a price elsewhere beats no price. */
  city?: string;
  now?: Date;
  validityDays?: number;
};

/** A record that survived scoring, with why. */
export type PriceMatch = {
  record: PriceRecord;
  score: number;
  /** False when the record's unit disagrees with the question's. */
  usable: boolean;
};

export type PriceRange = {
  sampleSize: number;
  lowest: number;
  highest: number;
  average: number;
  median: number;
  unit: string;
  /** Distinct suppliers or sources behind the range. */
  sourceCount: number;
  latestDate: string;
};

export type PriceAnswer = {
  /**
   * `verified` — an administrator stood behind it.
   * `estimate`  — the best available is unverified. Must be labelled as such.
   * `none`      — nothing in the book matches. Must not be filled with a guess.
   */
  kind: "verified" | "estimate" | "none";
  best: PriceRecord | null;
  /** Everything comparable, best first. Empty when `kind` is `none`. */
  matches: PriceMatch[];
  range: PriceRange | null;
  confidence: Confidence | null;
  /** True when the chosen record is older than the validity period. */
  stale: boolean;
  /**
   * What to say. The brief's exact wording for the estimate and the empty
   * case, so the AI, the exchange and the BOQ cannot phrase the same fact
   * three different ways.
   */
  message: string;
};

/** The book's row, described the way the scorer expects a listing. */
function asCandidate(record: PriceRecord): MatchCandidate {
  return {
    id: record.id,
    // Specification carries the size, which is the part that must not be
    // blurred, so it goes into the title rather than being left behind.
    title: [record.material, record.specification].filter(Boolean).join(" "),
    category: record.category,
    brand: record.brand,
    unit: record.unit,
    price: record.priceEtb,
    currency: record.currency,
    supplier: record.supplier,
  };
}

/** ETB 7,200 — one place, so every surface writes money the same way. */
export function formatEtb(amount: number, currency = "ETB"): string {
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Scores the book against a question and keeps what is comparable.
 *
 * Returned best-first by trust then recency, so callers that only want "the
 * price" can take the head.
 */
export function matchPrices(
  question: PriceQuestion,
  records: PriceRecord[],
): PriceMatch[] {
  const query: MaterialQuery = {
    description: question.material,
    // The scorer needs a unit to judge usability. When the caller has not
    // said, every record is usable and the unit stops being a filter.
    unit: question.unit ?? "",
  };

  const byId = new Map(records.map((record) => [record.id, record]));
  const scored = matchMaterial(query, records.map(asCandidate));

  const matches: PriceMatch[] = [];
  for (const match of scored.matches) {
    const record = byId.get(match.candidate.id);
    if (!record) continue;
    matches.push({
      record,
      score: match.score,
      usable: question.unit
        ? normaliseUnit(record.unit) === normaliseUnit(question.unit)
        : true,
    });
  }

  return matches;
}

/**
 * The comparable set: right material, right unit, good enough score.
 *
 * Falls back to every usable match when nothing clears the strong threshold —
 * a weak match honestly labelled beats telling somebody the book is empty when
 * it is not. What it never does is include the wrong unit.
 */
function comparable(matches: PriceMatch[]): PriceMatch[] {
  const usable = matches.filter((match) => match.usable);
  const strong = usable.filter((match) => match.score >= STRONG_MATCH);
  return strong.length > 0 ? strong : usable;
}

/**
 * Orders by the brief's priority: trust, then newest, then how well it matched.
 *
 * Score is the tie-break rather than the lead, because by this point every
 * candidate is already the right material — the scorer saw to that — and among
 * right answers the one somebody stood behind matters more than the one whose
 * wording happened to line up.
 */
function byPriority(a: PriceMatch, b: PriceMatch): number {
  const trust = statusRank(b.record.dataStatus) - statusRank(a.record.dataStatus);
  if (trust !== 0) return trust;

  const date = b.record.priceDate.localeCompare(a.record.priceDate);
  if (date !== 0) return date;

  if (b.score !== a.score) return b.score - a.score;
  // Deterministic: an estimate that changes on a re-run is an estimate nobody
  // trusts, and two records can otherwise be genuinely indistinguishable.
  return a.record.id.localeCompare(b.record.id);
}

/**
 * The range shown above the table.
 *
 * Computed over the *comparable* set, never the raw search. Asking the book for
 * "MDF" legitimately returns 6, 9, 12, 15 and 18 mm board; a range straight off
 * that reads "ETB 5,100 – 9,000 per sheet", which is true of the word and false
 * of every actual product somebody could buy.
 */
export function priceRange(matches: PriceMatch[]): PriceRange | null {
  if (matches.length === 0) return null;

  const prices = matches.map((match) => match.record.priceEtb).sort((a, b) => a - b);
  const middle = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0
      ? ((prices[middle - 1] ?? 0) + (prices[middle] ?? 0)) / 2
      : (prices[middle] ?? 0);

  const sources = new Set(
    matches.map(
      (match) => match.record.supplier ?? match.record.source ?? match.record.id,
    ),
  );

  const latest = matches
    .map((match) => match.record.priceDate)
    .sort()
    .at(-1);

  return {
    sampleSize: prices.length,
    lowest: prices[0] ?? 0,
    highest: prices.at(-1) ?? 0,
    average:
      Math.round((prices.reduce((sum, price) => sum + price, 0) / prices.length) * 100) /
      100,
    median: Math.round(median * 100) / 100,
    unit: matches[0]?.record.unit ?? "",
    sourceCount: sources.size,
    latestDate: latest ?? "",
  };
}

/** The brief's words, in one place. */
export const NO_PRICE_MESSAGE =
  "I don't currently have a verified price for this material.";

export function estimateMessage(amount: number, currency = "ETB"): string {
  return `Initial estimated price: ${formatEtb(amount, currency)}. This price has not yet been verified with a supplier.`;
}

/**
 * Answers a price question from the book.
 *
 * Never invents. When nothing matches, `kind` is `none` and `best` is null —
 * there is no code path here that returns a number the book did not contain.
 */
export function resolvePriceQuestion(
  question: PriceQuestion,
  records: PriceRecord[],
): PriceAnswer {
  const now = question.now ?? new Date();
  const matches = comparable(matchPrices(question, records)).sort(byPriority);

  if (matches.length === 0) {
    return {
      kind: "none",
      best: null,
      matches: [],
      range: null,
      confidence: null,
      stale: false,
      message: NO_PRICE_MESSAGE,
    };
  }

  // The city is a preference applied after trust, not a filter applied before
  // it: an administrator's price in Addis is a better answer for Bahir Dar than
  // an anonymous listing in Bahir Dar, and the record says which city it is
  // from either way.
  const preferred = question.city
    ? [...matches].sort((a, b) => {
        const cityA = matchesCity(a.record.cityRegion, question.city ?? "");
        const cityB = matchesCity(b.record.cityRegion, question.city ?? "");
        const trust =
          statusRank(b.record.dataStatus) - statusRank(a.record.dataStatus);
        if (trust !== 0) return trust;
        if (cityA !== cityB) return cityA ? -1 : 1;
        return byPriority(a, b);
      })
    : matches;

  const best = preferred[0];
  if (!best) {
    return {
      kind: "none",
      best: null,
      matches: [],
      range: null,
      confidence: null,
      stale: false,
      message: NO_PRICE_MESSAGE,
    };
  }

  const range = priceRange(preferred);
  const stale = isStale(best.record.priceDate, question.validityDays, now);
  const confidence = confidenceOf({
    status: best.record.dataStatus,
    sampleSize: range?.sampleSize ?? 1,
    priceDate: best.record.priceDate,
    validityDays: question.validityDays,
    now,
  });

  const verified = best.record.dataStatus === "admin_verified";

  return {
    kind: verified ? "verified" : "estimate",
    best: best.record,
    matches: preferred,
    range,
    confidence,
    stale,
    message: verified
      ? `${formatEtb(best.record.priceEtb, best.record.currency)} per ${best.record.unit}, verified by Medosha.`
      : estimateMessage(best.record.priceEtb, best.record.currency),
  };
}

/** "Addis Ketema, Addis Ababa" answers a question about "Addis Ababa". */
function matchesCity(recordCity: string, wanted: string): boolean {
  if (!wanted) return false;
  const a = recordCity.toLowerCase();
  const b = wanted.toLowerCase().trim();
  return b.length > 0 && (a.includes(b) || b.includes(a));
}
