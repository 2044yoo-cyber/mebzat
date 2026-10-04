/**
 * Finding the marketplace product a BOQ line actually means.
 *
 * "200 mm HCB walling" has to become a listing somebody sells, or a price is a
 * guess. This is the join between the takeoff and the marketplace, and it is
 * deliberately conservative in one direction: **it will say "no exact match"
 * rather than pick something that is nearly right.**
 *
 * The brief put it plainly — *never invent marketplace products when actual
 * products exist*, and *if no matching product exists, say "No exact Marketplace
 * match" and allow manual selection.* A confident wrong match is worse than an
 * honest gap, because a gap gets filled by a person who knows the job and a
 * wrong match gets multiplied by a quantity.
 *
 * Pure: candidates in, scored matches out. Fetching them is the caller's job,
 * which keeps this testable without a database.
 */

import { normaliseUnit } from "./resolve";

export type MatchCandidate = {
  id: string;
  title: string;
  category?: string | null;
  brand?: string | null;
  unit: string;
  price: number;
  currency?: string;
  supplier?: string | null;
};

export type MaterialQuery = {
  /** The BOQ description, as written. */
  description: string;
  /** The unit the quantity is in. A match in the wrong unit is not a match. */
  unit: string;
  /** Extra terms from the specification: block size, grade, thickness. */
  keywords?: string[];
};

export type Match = {
  candidate: MatchCandidate;
  /** 0–1. Above `STRONG` it is offered as the match; below, as a suggestion. */
  score: number;
  /** Which words did the matching, so a person can see why. */
  matched: string[];
  /** True when the units line up and the price can actually be applied. */
  usable: boolean;
};

export type MatchResult = {
  query: MaterialQuery;
  /** Best first. Empty when nothing scored at all. */
  matches: Match[];
  /** The one to use, or null when nothing was convincing enough. */
  best: Match | null;
  /** Shown when `best` is null. The brief's exact words. */
  message: string | null;
};

/** Above this, a match is good enough to price from without being asked. */
export const STRONG_MATCH = 0.55;

/**
 * Words that carry no information about what a thing is.
 *
 * Dropped before scoring, because "supply and fix 200 mm HCB in cement mortar"
 * and "supply and install 150 mm HCB" share four words that mean nothing and
 * differ on the one that matters.
 */
const NOISE = new Set([
  "supply", "supplying", "fix", "fixing", "install", "installation", "installed",
  "and", "or", "the", "a", "an", "of", "to", "in", "on", "for", "with", "as",
  "per", "including", "incl", "complete", "all", "work", "works", "item",
  "provide", "providing", "approved", "specified", "specification", "quality",
  "type", "size", "mm", "cm", "m", "no", "nos", "pcs",
]);

/**
 * Abbreviations a bill uses and a product listing spells out, or the reverse.
 *
 * Without these the matcher fails on the most ordinary line in an Ethiopian
 * bill: "200 mm HCB walling" never meets "Hollow Concrete Block 200mm", because
 * they share no word at all. Each entry expands to the other form so both
 * spellings score.
 */
const SYNONYMS: Record<string, string[]> = {
  hcb: ["hollow", "concrete", "block"],
  opc: ["ordinary", "portland", "cement"],
  ppc: ["portland", "pozzolana", "cement"],
  rhs: ["rectangular", "hollow", "section"],
  shs: ["square", "hollow", "section"],
  ms: ["mild", "steel"],
  gi: ["galvanised", "iron"],
  pvc: ["polyvinyl", "plastic"],
  mdf: ["medium", "density", "fibreboard"],
  ply: ["plywood"],
  chipboard: ["particleboard"],
  wc: ["toilet", "closet"],
  dpc: ["damp", "proof", "course"],
  dpm: ["damp", "proof", "membrane"],
};

/**
 * Splits a description into the words worth comparing.
 *
 * The split on a digit-letter boundary is what makes "200mm" and "200 mm" the
 * same thing. Without it a listing written "Block 200mm" shares no token with a
 * bill written "200 mm block", and the most common line in the book fails to
 * match.
 */
export function terms(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    // 200mm → 200 mm, and m3 → m 3 is harmless because both halves are noise.
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  const expanded: string[] = [];
  for (const word of words) {
    expanded.push(word);
    const synonym = SYNONYMS[word];
    if (synonym) expanded.push(...synonym);
  }

  return expanded.filter((word) => word.length > 1 && !NOISE.has(word));
}

/**
 * Numbers in a description, which are usually the specification.
 *
 * "200" in "200 mm HCB" is not a word, it is the thing that distinguishes it
 * from every other block, so a number that matches is worth more than a word
 * that does. A number that *mismatches* is worse than nothing — 150 mm HCB is
 * not a slightly worse match for 200 mm HCB, it is the wrong product.
 */
export function numbers(text: string): string[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)].map((match) => match[0]);
}

/**
 * Scores one candidate against a query.
 *
 * Word overlap, weighted by how specific each word is, plus a strong bonus for
 * agreeing numbers and a strong penalty for disagreeing ones.
 */
export function scoreMatch(query: MaterialQuery, candidate: MatchCandidate): Match {
  const wanted = [...terms(query.description), ...(query.keywords ?? []).map((k) => k.toLowerCase())];
  const offered = terms(`${candidate.title} ${candidate.category ?? ""} ${candidate.brand ?? ""}`);

  const matched: string[] = [];
  let hits = 0;

  for (const word of new Set(wanted)) {
    if (offered.includes(word)) {
      hits += 1;
      matched.push(word);
    }
  }

  const wantedNumbers = numbers(query.description);
  const offeredNumbers = numbers(`${candidate.title} ${candidate.category ?? ""}`);

  let numberScore = 0;
  if (wantedNumbers.length > 0 && offeredNumbers.length > 0) {
    const agreeing = wantedNumbers.filter((value) => offeredNumbers.includes(value));
    if (agreeing.length > 0) {
      numberScore = 0.3;
      matched.push(...agreeing);
    } else {
      // Both sides state a size and they differ. That is a different product,
      // not a weaker match for the same one.
      numberScore = -0.5;
    }
  }

  const base = wanted.length === 0 ? 0 : hits / new Set(wanted).size;
  const score = Math.max(0, Math.min(1, base * 0.8 + numberScore));

  return {
    candidate,
    score: Math.round(score * 1000) / 1000,
    matched,
    usable: normaliseUnit(candidate.unit) === normaliseUnit(query.unit),
  };
}

/**
 * Matches a material against what the marketplace has.
 *
 * A candidate whose unit disagrees is kept in the list but never chosen as
 * `best` — the price cannot be applied to the quantity, and offering it as the
 * answer would produce exactly the wrong-by-a-factor-of-six cost the pricing
 * module refuses elsewhere. It stays visible so somebody can pick it and
 * convert deliberately.
 */
export function matchMaterial(
  query: MaterialQuery,
  candidates: MatchCandidate[],
): MatchResult {
  const matches = candidates
    .map((candidate) => scoreMatch(query, candidate))
    .filter((match) => match.score > 0)
    .sort((a, b) => {
      // A usable unit outranks a better score in the wrong unit.
      if (a.usable !== b.usable) return a.usable ? -1 : 1;
      return b.score - a.score;
    });

  const best = matches.find((match) => match.usable && match.score >= STRONG_MATCH) ?? null;

  return {
    query,
    matches,
    best,
    message: best
      ? null
      : matches.length === 0
        ? "No exact Marketplace match. Choose a product or enter a price."
        : "No exact Marketplace match. The closest listings are shown — choose one or enter a price.",
  };
}
