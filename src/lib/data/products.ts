import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProductSort } from "@/lib/constants/product-categories";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import type { ProductCardData } from "@/components/products/product-card";

type Client = SupabaseClient<Database>;

const CARD_COLUMNS =
  "id, title, cover_image_url, price, currency, unit, brand, stock_status, status, supplier:profiles!owner_id(full_name, company_name)";

// Supabase .or() is comma/paren-delimited, so strip anything that could
// break the filter grammar out of user search input.
function sanitize(term: string) {
  return term.replace(/[,()%]/g, " ").trim();
}

const SORT_COLUMN: Record<
  ProductSort,
  { column: string; ascending: boolean }
> = {
  price_asc: { column: "price", ascending: true },
  price_desc: { column: "price", ascending: false },
  popular: { column: "views", ascending: false },
  newest: { column: "created_at", ascending: false },
};

/** Reference categories, ordered for display. Empty if 0005 isn't applied. */
export async function getProductCategories() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("product_categories")
    .select("id, slug, name, icon, position")
    .order("position", { ascending: true });
  return data ?? [];
}

export type MarketplaceQuery = {
  q?: string;
  categorySlug?: string;
  sort?: ProductSort;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  pageSize?: number;
};

export type MarketplaceResult = {
  products: ProductCardData[];
  total: number;
  available: boolean;
};

/** Fetches published products for the public marketplace. Resilient to the
 * products table not existing yet (returns empty + available:false) so the
 * app renders before migration 0005 is applied. */
export async function getMarketplaceProducts(
  params: MarketplaceQuery = {},
): Promise<MarketplaceResult> {
  const {
    q,
    categorySlug,
    sort = "newest",
    minPrice,
    maxPrice,
    page = 1,
    pageSize = 24,
  } = params;

  const supabase = await createClient();

  let query = supabase
    .from("products")
    .select(CARD_COLUMNS, { count: "exact" })
    .eq("status", "published");

  if (categorySlug) {
    const { data: category } = await supabase
      .from("product_categories")
      .select("id")
      .eq("slug", categorySlug)
      .maybeSingle();
    if (category) query = query.eq("category_id", category.id);
    else return { products: [], total: 0, available: true };
  }

  const term = q ? sanitize(q) : "";
  if (term) {
    query = query.or(
      `title.ilike.%${term}%,brand.ilike.%${term}%,description.ilike.%${term}%`,
    );
  }
  if (typeof minPrice === "number") query = query.gte("price", minPrice);
  if (typeof maxPrice === "number") query = query.lte("price", maxPrice);

  const order = SORT_COLUMN[sort];
  const from = (page - 1) * pageSize;

  const { data, count, error } = await query
    .order(order.column, { ascending: order.ascending, nullsFirst: false })
    .range(from, from + pageSize - 1);
  if (error) {
    return { products: [], total: 0, available: false };
  }

  return {
    products: (data ?? []) as unknown as ProductCardData[],
    total: count ?? 0,
    available: true,
  };
}

/** Returns which of the given product ids the user has favorited. */
export async function getFavoritedIds(
  supabase: Client,
  userId: string | undefined,
  productIds: string[],
): Promise<Set<string>> {
  if (!userId || productIds.length === 0) return new Set();
  const { data } = await supabase
    .from("product_favorites")
    .select("product_id")
    .eq("user_id", userId)
    .in("product_id", productIds);
  return new Set((data ?? []).map((r) => r.product_id));
}

/** Marks each card with the current user's favorite state in one query. */
export async function withFavorites(
  products: ProductCardData[],
  userId: string | undefined,
): Promise<ProductCardData[]> {
  if (!userId || products.length === 0) return products;
  const supabase = await createClient();
  const favorited = await getFavoritedIds(
    supabase,
    userId,
    products.map((p) => p.id),
  );
  return products.map((p) => ({ ...p, favorited: favorited.has(p.id) }));
}
