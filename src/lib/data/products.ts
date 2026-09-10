import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProductSort } from "@/lib/constants/product-categories";
import type {
  DigitalKind,
  ProductCondition,
  UsedGrade,
} from "@/types/database.types";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import type { ProductCardData } from "@/components/products/product-card";

type Client = SupabaseClient<Database>;

const CARD_COLUMNS =
  "id, title, cover_image_url, price, currency, unit, brand, stock_status, status, condition, used_grade, location_city, location_area, fulfilment, digital_kind, file_format, license, is_sample, supplier:profiles!owner_id(full_name, company_name)";

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
  /**
   * Which section of the marketplace is being read.
   *
   * Two columns, three disjoint sections. "digital" is `fulfilment =
   * 'digital'`; the other two are physical, split by condition — "new" is
   * `condition = 'new'`, "used" is everything else, so refurbished and
   * open-box listings land in the second-hand section the day the form offers
   * them. Undefined reads all three, which is what a global search wants.
   *
   * New Items narrows on fulfilment as well as condition. A digital product is
   * always `condition = 'new'`, so a rule of "condition is new" alone would
   * list every course and floor plan among the cement bags.
   */
  section?: "new" | "used" | "digital";
  /** Only meaningful within the used section. */
  usedGrade?: UsedGrade;
  city?: string;
  area?: string;
  /** Only meaningful within the digital section. */
  digitalKind?: DigitalKind;
};

/** The conditions the used section covers. Anything that is not new. */
const SECOND_HAND: ProductCondition[] = [
  "used",
  "refurbished",
  "open_box",
  "for_parts",
];

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
    section,
    usedGrade,
    city,
    area,
    digitalKind,
  } = params;

  const supabase = await createClient();

  let query = supabase
    .from("products")
    .select(CARD_COLUMNS, { count: "exact" })
    .eq("status", "published");

  // The condition column is the only thing that decides the section. Nothing
  // is copied into a second table and nothing is tagged by hand, so a listing
  // cannot be in the wrong one.
  if (section === "digital") {
    query = query.eq("fulfilment", "digital");
  } else if (section === "new") {
    query = query.eq("fulfilment", "physical").eq("condition", "new");
  } else if (section === "used") {
    query = query.eq("fulfilment", "physical").in("condition", SECOND_HAND);
  }

  if (digitalKind) query = query.eq("digital_kind", digitalKind);

  if (usedGrade) query = query.eq("used_grade", usedGrade);
  if (city) query = query.ilike("location_city", city);
  if (area) query = query.ilike("location_area", `%${sanitize(area)}%`);

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
