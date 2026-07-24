import type { Metadata } from "next";
import { PackageOpen, Store } from "lucide-react";

import { ProductCard } from "@/components/products/product-card";
import { MarketplaceFilters } from "@/components/products/marketplace-filters";
import { Pagination } from "@/components/ui/pagination";
import { isProductSort, type ProductSort } from "@/lib/constants/product-categories";
import {
  getMarketplaceProducts,
  getProductCategories,
  withFavorites,
} from "@/lib/data/products";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Marketplace — Construction materials, furniture & more",
  description:
    "Browse construction materials, furniture, fixtures, and equipment from verified suppliers on Medosha.",
};

const PAGE_SIZE = 24;

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export default async function MarketplacePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);

  const q = get("q") ?? "";
  const category = get("category") ?? "";
  const sort: ProductSort = isProductSort(get("sort")) ? (get("sort") as ProductSort) : "newest";
  const minPrice = get("minPrice") ?? "";
  const maxPrice = get("maxPrice") ?? "";
  const page = Math.max(1, Number(get("page")) || 1);

  const [categories, result, { data: auth }] = await Promise.all([
    getProductCategories(),
    getMarketplaceProducts({
      q,
      categorySlug: category || undefined,
      sort,
      minPrice: toNumber(minPrice),
      maxPrice: toNumber(maxPrice),
      page,
      pageSize: PAGE_SIZE,
    }),
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
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/marketplace?${qs}` : "/marketplace";
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Store className="size-4" /> Marketplace
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Everything for your build
        </h1>
        <p className="mt-1 text-muted-foreground">
          Materials, furniture, fixtures, and equipment from suppliers across
          the network.
        </p>
      </div>

      <MarketplaceFilters
        categories={categories}
        current={{ q, category, sort, minPrice, maxPrice }}
      />

      <div className="mt-6">
        {!result.available ? (
          <EmptyState
            icon={<Store className="size-8" />}
            title="The marketplace is being set up"
            description="Products will appear here as soon as suppliers start listing them."
          />
        ) : products.length === 0 ? (
          <EmptyState
            icon={<PackageOpen className="size-8" />}
            title="No products found"
            description={
              q || category || minPrice || maxPrice
                ? "Try adjusting your filters or search."
                : "Be the first supplier to list a product."
            }
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {result.total} {result.total === 1 ? "product" : "products"}
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
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-16 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
