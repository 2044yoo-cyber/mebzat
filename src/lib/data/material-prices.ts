import "server-only";

import type { PriceCandidate } from "@/lib/pricing/resolve";
import {
  resolvePriceQuestion,
  type PriceAnswer,
  type PriceQuestion,
  type PriceRecord,
} from "@/lib/prices/resolve";
import { isPriceDataStatus } from "@/lib/prices/status";
import { createClient } from "@/lib/supabase/server";
import type { MaterialPriceRow } from "@/types/database.types";

/**
 * Reading the material price book.
 *
 * The only module that knows the book is in Postgres. The resolver next door is
 * pure and knows nothing about a database; this fetches rows and hands them
 * over, which is what lets every rule about trust be tested without one.
 *
 * Retrieval goes through `material_price_lookup`, which is deliberately broad —
 * it matches any significant word so that a fuller description finds more
 * rather than less. Narrowing is the resolver's job, and it can only narrow
 * what retrieval handed it.
 */

/** How many rows one question is scored against. */
const LOOKUP_LIMIT = 40;

function toRecord(row: MaterialPriceRow): PriceRecord | null {
  // A status the application does not know about is not a status it can rank,
  // and guessing would put an unknown row somewhere in the trust order by
  // accident. Dropping it is the safe direction: the answer gets narrower,
  // never falsely more confident.
  if (!isPriceDataStatus(row.data_status)) return null;

  const price = Number(row.price_etb);
  if (!Number.isFinite(price) || price <= 0) return null;

  return {
    id: row.id,
    category: row.category,
    subcategory: row.subcategory,
    material: row.material,
    specification: row.specification,
    unit: row.unit,
    brand: row.brand,
    cityRegion: row.city_region,
    priceEtb: price,
    currency: row.currency,
    vatStatus: row.vat_status,
    supplier: row.supplier,
    source: row.source,
    priceDate: row.price_date,
    dataStatus: row.data_status,
    notes: row.notes,
  };
}

/**
 * Candidate prices for a phrase.
 *
 * Throws when the database cannot be reached. A failed query is not an empty
 * price book, and returning `[]` for both would tell somebody their material
 * is not priced when in fact nothing was asked — they would go and enter a
 * price that already existed. Callers turn the throw into an honest failure.
 */
export async function findPriceRecords(
  search: string,
  options: { city?: string; unit?: string; limit?: number } = {},
): Promise<PriceRecord[]> {
  if (!search.trim()) return [];

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("material_price_lookup", {
    search,
    target_city: options.city ?? null,
    target_unit: options.unit ?? null,
    max_rows: options.limit ?? LOOKUP_LIMIT,
  });

  if (error) {
    throw new Error(`price book lookup failed: ${error.message}`);
  }

  return (data ?? [])
    .map(toRecord)
    .filter((record): record is PriceRecord => record !== null);
}

/** Asks the book a question and resolves it in one call. */
export async function askPriceBook(question: PriceQuestion): Promise<PriceAnswer> {
  const records = await findPriceRecords(question.material, {
    city: question.city,
    // Deliberately not passed as a filter: the resolver drops the wrong unit
    // itself, and it can say "the book has this, but per piece" rather than
    // returning nothing and implying the material is unpriced.
  });

  return resolvePriceQuestion(question, records);
}

/**
 * The book's contribution to a bill of quantities line.
 *
 * One candidate at most: the verified figure if there is one, otherwise the
 * best unverified one. Never both — they describe the same material, and
 * offering two reference prices for one line is a choice nobody can make on the
 * evidence shown.
 *
 * Empty when the book holds nothing. The estimate then keeps whatever it had,
 * which is the correct outcome rather than a number nobody can trace.
 */
export async function bookCandidates(
  description: string,
  unit: string,
  city?: string,
): Promise<PriceCandidate[]> {
  const answer = await askPriceBook({ material: description, unit, city });
  if (!answer.best) return [];

  const record = answer.best;

  return [
    {
      source: answer.kind === "verified" ? "verified" : "reference",
      price: record.priceEtb,
      unit: record.unit,
      currency: record.currency,
      productId: record.id,
      productTitle: [record.material, record.specification]
        .filter(Boolean)
        .join(" "),
      sampleSize: answer.range?.sampleSize,
      asOf: record.priceDate,
    },
  ];
}
