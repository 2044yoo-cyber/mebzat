import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

/**
 * Reading the material price book.
 *
 * `material_prices` is the table the Excel workbook seeded and the resolver
 * ranks against. It has been queried by the AI, the BOQ engine and the takeoff
 * since migration 0041 — and by none of the pages a member actually opens.
 *
 * The Price Exchange in particular reads `price_listings`, which is the bidding
 * marketplace: what suppliers are asking today. Useful, and not the same fact
 * as what a material costs. Somebody deciding whether ETB 1,850 for a bag of
 * cement is a good bid has no way to tell without the reference, and Medosha
 * has had the reference all along.
 *
 * ## Status is never flattened
 *
 * A row is either something an administrator stood behind or something nobody
 * has looked at, and those two must never render identically. Every function
 * here carries `data_status` through, and the components that display it say
 * which they are showing. A verified figure and a teaching baseline from the
 * seed workbook live in the same table and are not the same claim.
 */

type PriceRow = Database["public"]["Tables"]["material_prices"]["Row"];

export type ReferencePrice = {
  id: string;
  material: string;
  specification: string | null;
  unit: string;
  brand: string | null;
  region: string;
  priceEtb: number;
  vatStatus: PriceRow["vat_status"];
  status: PriceRow["data_status"];
  verified: boolean;
  supplier: string | null;
  source: string | null;
  priceDate: string;
  notes: string | null;
};

function toReference(row: PriceRow): ReferencePrice {
  return {
    id: row.id,
    material: row.material,
    specification: row.specification,
    unit: row.unit,
    brand: row.brand,
    region: row.city_region,
    priceEtb: Number(row.price_etb),
    vatStatus: row.vat_status,
    status: row.data_status,
    // Nullable in the column, never optional in the record: an unset flag
    // means the figure has not been verified.
    verified: row.verified ?? false,
    supplier: row.supplier,
    source: row.source,
    priceDate: row.price_date,
    notes: row.notes,
  };
}

/**
 * The reference prices that match a listing's material, best first.
 *
 * "Best" means most trustworthy, then most recent — `data_status` is declared
 * weakest-first in the enum precisely so this ordering is the enum's own order
 * rather than a second opinion about it kept in TypeScript.
 *
 * Superseded rows are excluded. A price that has been replaced is history, and
 * showing it beside the row that replaced it would present one material at two
 * prices with no way to tell which is current.
 */
export async function referencePricesFor(
  material: string,
  options: { region?: string; limit?: number } = {},
): Promise<ReferencePrice[]> {
  const supabase = await createClient();

  let query = supabase
    .from("material_prices")
    .select("*")
    .is("superseded_by", null)
    // Case-insensitive contains. A listing titled "Cement — Dangote 42.5N"
    // should find the book's "Cement" without anybody normalising by hand.
    .ilike("material", `%${material.slice(0, 60)}%`)
    .order("data_status", { ascending: false })
    .order("price_date", { ascending: false })
    .limit(options.limit ?? 5);

  if (options.region) query = query.eq("city_region", options.region);

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(toReference);
}

/**
 * The single figure worth showing beside a listing, or nothing.
 *
 * Nothing is a real answer and the common one. The book covers a few hundred
 * materials and the marketplace carries anything anybody wants to sell, so most
 * listings have no reference — and inventing one, or stretching a loose match
 * to fill the space, would be worse than the blank.
 */
export async function referenceFor(
  material: string,
  region?: string,
): Promise<ReferencePrice | null> {
  const matches = await referencePricesFor(material, { region, limit: 1 });
  return matches[0] ?? null;
}

/**
 * The queue an administrator works through.
 *
 * Supplier submissions first, because those are somebody waiting on an answer.
 * Web-sourced rows after them. Educational baselines are excluded entirely —
 * there are hundreds from the seed workbook, none of them is waiting on a
 * decision, and putting them in the queue would bury the rows that are.
 */
export async function pendingVerification(
  limit = 50,
): Promise<ReferencePrice[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("material_prices")
    .select("*")
    .in("data_status", ["supplier_submitted", "web_sourced"])
    .is("superseded_by", null)
    .order("data_status", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !data) return [];
  return data.map(toReference);
}

/** How many are waiting, for the badge on the admin nav. */
export async function pendingCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("material_prices")
    .select("id", { count: "exact", head: true })
    .in("data_status", ["supplier_submitted", "web_sourced"])
    .is("superseded_by", null);
  return count ?? 0;
}
