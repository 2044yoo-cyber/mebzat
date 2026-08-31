import "server-only";

import {
  priceMaterials as priceAgainst,
  type PricedMaterial,
} from "@/lib/pricing/catalogue";
import { terms, type MatchCandidate, type MaterialQuery } from "@/lib/pricing/match";
import { createClient } from "@/lib/supabase/server";

/**
 * Finding what the marketplace actually sells for a BOQ line.
 *
 * The matcher next door is pure and knows nothing about the database — it
 * scores candidates somebody hands it. This is the half that goes and gets
 * them, which is what turns "no exact Marketplace match" from a demonstration
 * into a real answer about real listings.
 *
 * The composition of the results lives in `@/lib/pricing/catalogue`, which has
 * no `server-only` and so can be checked without a database. This file is only
 * the query.
 *
 * ## Why the search is broad and the matching is strict
 *
 * Postgres does the cheap, wide part: pull anything whose title or brand
 * mentions one of the significant words. The scoring then does the strict part
 * in TypeScript, where a mismatched size can be made to count against a
 * candidate — something no `ilike` can express, and the difference between
 * 200 mm HCB and 150 mm HCB is exactly the thing that must not be blurred.
 *
 * A wide net is affordable because the strict half runs on twenty rows, not on
 * a table.
 */

/** Published listings only. A draft is not something anybody can buy. */
const PRODUCT_COLUMNS =
  "id, title, brand, price, currency, unit, category:product_categories(name), supplier:profiles!owner_id(full_name, company_name)";

type ProductRow = {
  id: string;
  title: string;
  brand: string | null;
  price: number | null;
  currency: string;
  unit: string | null;
  category: { name: string } | { name: string }[] | null;
  supplier:
    | { full_name: string | null; company_name: string | null }
    | { full_name: string | null; company_name: string | null }[]
    | null;
};

/** How many listings one line is scored against. */
const CANDIDATE_LIMIT = 24;

/**
 * Candidate listings for one material description.
 *
 * Returns them unscored — scoring is the pure matcher's job, and keeping the
 * two apart is what lets the matcher be tested without a database.
 */
export async function findMaterialCandidates(
  description: string,
  limit = CANDIDATE_LIMIT,
): Promise<MatchCandidate[]> {
  const words = searchWords(description);
  if (words.length === 0) return [];

  const supabase = await createClient();

  // `or` with ilike per word: one round trip rather than one per word.
  const filter = words
    .flatMap((word) => [`title.ilike.%${word}%`, `brand.ilike.%${word}%`])
    .join(",");

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("status", "published")
    .not("price", "is", null)
    .or(filter)
    .limit(limit);

  // A failed query is not an empty marketplace, and the two must not look the
  // same. Swallowing this into `[]` tells somebody their materials are not
  // listed when in fact the database was unreachable — they go and re-list
  // products that were there all along. The route turns a throw into a 503 and
  // says so.
  if (error) {
    throw new Error(`marketplace search failed: ${error.message}`);
  }

  if (!data) return [];

  return (data as unknown as ProductRow[])
    .filter((row) => row.price !== null && row.unit)
    .map((row) => ({
      id: row.id,
      title: row.title,
      category: one(row.category)?.name ?? null,
      brand: row.brand,
      unit: row.unit ?? "pc",
      price: Number(row.price),
      currency: row.currency,
      supplier:
        one(row.supplier)?.company_name ?? one(row.supplier)?.full_name ?? null,
    }));
}

/**
 * The words worth searching on.
 *
 * Numbers are the specification and are matched exactly by the scorer, but as a
 * *search* term "200" pulls in every product with 200 anywhere in it. The words
 * do the finding; the numbers do the discriminating.
 *
 * Exported for the check script — a search that drops every term finds nothing,
 * and that failure looks exactly like an empty marketplace.
 */
export function searchWords(description: string, limit = 6): string[] {
  return terms(description)
    .filter((word) => !/^\d/.test(word))
    .slice(0, limit);
}

/** Prices a batch of BOQ lines against the live marketplace. */
export function priceMaterials(
  queries: (MaterialQuery & { key: string })[],
): Promise<PricedMaterial[]> {
  return priceAgainst(queries, (description) => findMaterialCandidates(description));
}

export type { PricedMaterial };

/** PostgREST returns an embedded row as an object or a one-element array. */
function one<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
