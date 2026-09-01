import {
  matchMaterial,
  type MatchCandidate,
  type MaterialQuery,
  type MatchResult,
} from "@/lib/pricing/match";
import { averageMarketPrice, type PriceCandidate } from "@/lib/pricing/resolve";

/**
 * Turning marketplace listings into prices a bill can use.
 *
 * Split from `@/lib/data/materials`, which is `server-only` because it holds a
 * Supabase query, the same way `chapa-protocol` is split from `chapa`. Nothing
 * here touches a database or a secret: it takes a way of finding candidates and
 * does the batching, the caching and the composition. That is the half that can
 * quietly go wrong, and it is the half worth checking.
 */

export type PricedMaterial = {
  /** Echoed back so the caller can line results up with what it asked. */
  key: string;
  match: MatchResult;
  /**
   * Ready for `refreshCandidates`.
   *
   * A chosen product and a market average, and nothing else — no AI figure is
   * invented here. When nothing matches this is empty, and the estimate keeps
   * whatever it already had, which is the correct outcome rather than a
   * fallback price nobody can trace.
   */
  candidates: PriceCandidate[];
};

/** How candidates for one description are found. */
export type FindCandidates = (description: string) => Promise<MatchCandidate[]>;

/**
 * Prices a batch of BOQ lines against a catalogue.
 *
 * Batched because a bill is forty lines and forty round trips is a page that
 * takes ten seconds. Sequential rather than parallel: the queries are cheap and
 * hammering the database with forty concurrent `or` filters to save two hundred
 * milliseconds is the kind of optimisation that gets a project rate-limited.
 */
export async function priceMaterials(
  queries: (MaterialQuery & { key: string })[],
  find: FindCandidates,
): Promise<PricedMaterial[]> {
  const out: PricedMaterial[] = [];

  // The same description appears on many lines of a real bill — "200 mm HCB
  // walling" once per storey. Searching for it once and reusing the answer cuts
  // a forty-line bill to a handful of queries.
  const cache = new Map<string, MatchCandidate[]>();

  for (const query of queries) {
    const cacheKey = query.description.toLowerCase().trim();
    let candidates = cache.get(cacheKey);

    if (!candidates) {
      candidates = await find(query.description);
      cache.set(cacheKey, candidates);
    }

    out.push({
      key: query.key,
      ...priceOne(query, candidates),
    });
  }

  return out;
}

/** One line, against candidates already in hand. */
export function priceOne(
  query: MaterialQuery,
  candidates: MatchCandidate[],
): { match: MatchResult; candidates: PriceCandidate[] } {
  const match = matchMaterial(query, candidates);
  const priceCandidates: PriceCandidate[] = [];

  if (match.best) {
    priceCandidates.push({
      source: "product",
      price: match.best.candidate.price,
      unit: match.best.candidate.unit,
      productId: match.best.candidate.id,
      productTitle: match.best.candidate.title,
      currency: match.best.candidate.currency,
    });
  }

  // The market average over the listings that are usable for this quantity.
  // Computed from the same rows the match was scored against, so the two cannot
  // disagree about what the market is.
  //
  // Two listings is the minimum: one listing is not a market, it is that
  // listing, and it is already offered as the product price above.
  const usable = match.matches.filter((entry) => entry.usable);
  if (usable.length > 1) {
    const average = averageMarketPrice(
      usable.map((entry) => ({
        price: entry.candidate.price,
        unit: entry.candidate.unit,
      })),
    );
    if (average) {
      priceCandidates.push({
        source: "market",
        price: average.price,
        unit: average.unit,
        sampleSize: average.sampleSize,
      });
    }
  }

  return { match, candidates: priceCandidates };
}
