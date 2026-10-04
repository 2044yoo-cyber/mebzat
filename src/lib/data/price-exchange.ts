import "server-only";

import type { PriceSortKey } from "@/lib/constants/price-exchange";
import { createClient } from "@/lib/supabase/server";
import type { PriceBid, PriceListing, PriceSector } from "@/types/database.types";

/**
 * Reads for the Construction Price Exchange.
 *
 * The market table is the one screen that has to stay fast with every filter
 * combined, so filtering and sorting happen in Postgres against the indexes in
 * 0009 rather than over a fetched page.
 */

export const PAGE_SIZE = 50;

/** Sort keys live with their labels so the two cannot drift apart. */
export type PriceSort = PriceSortKey;

export type PriceQuery = {
  sector: PriceSector;
  q?: string;
  category?: string;
  city?: string;
  verifiedOnly?: boolean;
  sort?: PriceSort;
  page?: number;
};

export type PriceRow = PriceListing & {
  supplier: {
    id: string;
    full_name: string | null;
    username: string | null;
    company_name: string | null;
  } | null;
  company: { id: string; name: string; slug: string } | null;
};

export type PriceResult = {
  rows: PriceRow[];
  total: number;
  /** False when the tables are not migrated yet, so the page can explain. */
  available: boolean;
};

const COLUMNS = `
  *,
  supplier:profiles!supplier_id(id, full_name, username, company_name),
  company:companies(id, name, slug)
`;

const SORTS: Record<PriceSort, { column: string; ascending: boolean }> = {
  lowest: { column: "current_price", ascending: true },
  highest: { column: "current_price", ascending: false },
  rating: { column: "rating", ascending: false },
  newest: { column: "updated_at", ascending: false },
  popular: { column: "views", ascending: false },
};

/** Strips characters that would break PostgREST's filter grammar. */
function sanitize(term: string): string {
  return term.replace(/[,()%*]/g, " ").replace(/\s+/g, " ").trim();
}

export async function getPrices(query: PriceQuery): Promise<PriceResult> {
  const {
    sector,
    q,
    category,
    city,
    verifiedOnly = false,
    sort = "lowest",
    page = 1,
  } = query;

  const supabase = await createClient();

  let builder = supabase
    .from("price_listings")
    .select(COLUMNS, { count: "exact" })
    .eq("published", true)
    .eq("sector", sector);

  const term = q ? sanitize(q) : "";
  if (term) {
    builder = builder.or(
      `item.ilike.%${term}%,category.ilike.%${term}%,specification.ilike.%${term}%,brand.ilike.%${term}%`,
    );
  }
  if (category) builder = builder.eq("category", category);
  if (city) builder = builder.eq("location_city", city);
  if (verifiedOnly) builder = builder.eq("verified", true);

  const order = SORTS[sort];
  const from = (page - 1) * PAGE_SIZE;

  const { data, count, error } = await builder
    .order(order.column, { ascending: order.ascending, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    // A missing table means migration 0009 has not been applied; the page says
    // so rather than rendering an empty market as though it were real.
    return { rows: [], total: 0, available: false };
  }

  return {
    rows: (data ?? []) as unknown as PriceRow[],
    total: count ?? 0,
    available: true,
  };
}

/** One listing, or null when it is missing or unpublished. */
export async function getListing(id: string): Promise<PriceRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("price_listings")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as PriceRow;
}

export type BidRow = PriceBid & {
  bidder: {
    id: string;
    full_name: string | null;
    username: string | null;
    company_name: string | null;
    avatar_url: string | null;
  } | null;
};

/** Open bids against a listing, cheapest first — the competition, in order. */
export async function getListingBids(listingId: string): Promise<BidRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("price_bids")
    .select(
      "*, bidder:profiles!bidder_id(id, full_name, username, company_name, avatar_url)",
    )
    .eq("listing_id", listingId)
    .eq("status", "open")
    .order("price", { ascending: true })
    .limit(50);

  return (data ?? []) as unknown as BidRow[];
}

/** Whether the viewer follows this listing. False for signed-out visitors. */
export async function isWatching(
  listingId: string,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("price_watchers")
    .select("listing_id")
    .eq("listing_id", listingId)
    .eq("user_id", userId)
    .maybeSingle();
  return data !== null;
}

/** Distinct categories and cities present in a sector, for the filter menus. */
export async function getPriceFacets(sector: PriceSector): Promise<{
  categories: string[];
  cities: string[];
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("price_listings")
    .select("category, location_city")
    .eq("published", true)
    .eq("sector", sector)
    .limit(1000);

  const categories = new Set<string>();
  const cities = new Set<string>();
  for (const row of data ?? []) {
    if (row.category) categories.add(row.category);
    if (row.location_city) cities.add(row.location_city);
  }

  return {
    categories: [...categories].sort(),
    cities: [...cities].sort(),
  };
}

export type MarketStats = {
  average: number | null;
  lowest: number | null;
  highest: number | null;
  sampleSize: number;
};

/** Market average, low and high for comparable listings. */
export async function getMarketStats(
  category: string,
  unit: string,
): Promise<MarketStats> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("price_market_stats", {
    target_category: category,
    target_unit: unit,
  });

  const row = Array.isArray(data) ? data[0] : null;
  return {
    average: row?.average_price ?? null,
    lowest: row?.lowest_price ?? null,
    highest: row?.highest_price ?? null,
    sampleSize: row?.sample_size ?? 0,
  };
}

/** Daily price points for the 30/90/365 day charts. */
export async function getPriceTrend(
  listingId: string,
  days: number,
): Promise<{ day: string; price: number }[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("price_trend", {
    target_listing_id: listingId,
    days,
  });
  return Array.isArray(data) ? data : [];
}
