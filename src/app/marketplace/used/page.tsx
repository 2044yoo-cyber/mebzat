import type { Metadata } from "next";
import { PackageOpen, Recycle } from "lucide-react";

import { MarketplaceFilters } from "@/components/products/marketplace-filters";
import { MarketplaceSections } from "@/components/products/marketplace-sections";
import { PostItemButton } from "@/components/products/post-item-button";
import { ProductCard } from "@/components/products/product-card";
import { Pagination } from "@/components/ui/pagination";
import {
  isProductSort,
  USED_GRADES,
  type ProductSort,
} from "@/lib/constants/product-categories";
import {
  getMarketplaceProducts,
  getProductCategories,
  withFavorites,
} from "@/lib/data/products";
import { createClient } from "@/lib/supabase/server";
import type { UsedGrade } from "@/types/database.types";

export const metadata: Metadata = {
  title: "Used Items — Second-hand furniture, appliances and materials",
  description:
    "Buy and sell second-hand goods on Medosha: furniture, appliances, electronics, tools, doors, windows and leftover construction materials across Ethiopia.",
};

const PAGE_SIZE = 24;

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function isUsedGrade(value: string | undefined): value is UsedGrade {
  return Boolean(value && value in USED_GRADES);
}

/**
 * The cities second-hand goods are actually in.
 *
 * Read from the listings rather than a fixed list: somebody in Hawassa
 * offering a fridge should not have to hope their town was anticipated, and a
 * town with nothing in it should not be offered as a filter that returns
 * nothing.
 */
async function citiesWithUsedItems(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("location_city")
    .eq("status", "published")
    .neq("condition", "new")
    .not("location_city", "is", null)
    .limit(500);

  const seen = new Set<string>();
  for (const row of data ?? []) {
    const city = (row.location_city ?? "").trim();
    if (city) seen.add(city);
  }
  return [...seen].sort((a, b) => a.localeCompare(b)).slice(0, 60);
}

export default async function UsedItemsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const get = (key: string) => (Array.isArray(sp[key]) ? sp[key][0] : sp[key]);

  const q = get("q") ?? "";
  const category = get("category") ?? "";
  const sort: ProductSort = isProductSort(get("sort"))
    ? (get("sort") as ProductSort)
    : "newest";
  const minPrice = get("minPrice") ?? "";
  const maxPrice = get("maxPrice") ?? "";
  const gradeParam = get("grade") ?? "";
  const city = get("city") ?? "";
  const area = get("area") ?? "";
  const page = Math.max(1, Number(get("page")) || 1);

  const [categories, result, cities, { data: auth }] = await Promise.all([
    getProductCategories(),
    getMarketplaceProducts({
      q,
      categorySlug: category || undefined,
      sort,
      minPrice: toNumber(minPrice),
      maxPrice: toNumber(maxPrice),
      page,
      pageSize: PAGE_SIZE,
      // Everything that is not new. One table, one column, no second listing.
      section: "used",
      usedGrade: isUsedGrade(gradeParam) ? gradeParam : undefined,
      city: city || undefined,
      area: area || undefined,
    }),
    citiesWithUsedItems(),
    (await createClient()).auth.getUser(),
  ]);

  const products = await withFavorites(result.products, auth.user?.id);

  function makeHref(nextPage: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (sort !== "newest") params.set("sort", sort);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (gradeParam) params.set("grade", gradeParam);
    if (city) params.set("city", city);
    if (area) params.set("area", area);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/marketplace/used?${qs}` : "/marketplace/used";
  }

  const filtered = Boolean(
    q || category || minPrice || maxPrice || gradeParam || city || area,
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Recycle className="size-4" /> Marketplace
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Used Items
          </h1>
          <p className="mt-1 text-muted-foreground">
            Second-hand furniture, appliances, electronics, tools, doors,
            windows and leftover materials. Anyone can sell here — you do not
            need to be in construction.
          </p>
        </div>
        {/* Carries `condition=used` through, so the form opens already set to
            Used rather than asking somebody who came from this page to find
            the field and change it. */}
        <PostItemButton condition="used" className="shrink-0" />
      </div>

      <MarketplaceSections active="used" className="mb-4" />

      <MarketplaceFilters
        categories={categories}
        current={{
          q,
          category,
          sort,
          minPrice,
          maxPrice,
          usedGrade: gradeParam,
          city,
          area,
        }}
        searchPlaceholder="Used sofa, used ceramic, used MDF…"
        showUsedFilters
        cities={cities}
      />

      <div className="mt-6">
        {!result.available ? (
          <EmptyState
            icon={<Recycle className="size-8" />}
            title="Used Items is being set up"
            description="Second-hand listings will appear here shortly."
          />
        ) : products.length === 0 ? (
          <EmptyState
            icon={<PackageOpen className="size-8" />}
            title="Nothing second-hand matches that yet"
            description={
              filtered
                ? "Try a wider search — fewer filters, or a different city."
                : "Have something to sell? Post it here — it takes a photo and a price."
            }
            action={<PostItemButton condition="used" />}
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {result.total} {result.total === 1 ? "item" : "items"}
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            <div className="mt-10">
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={result.total}
                makeHref={makeHref}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-12 text-center sm:p-16">
      <span className="text-muted-foreground">{icon}</span>
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
