import type { Metadata } from "next";
import { PackageOpen, Truck } from "lucide-react";

import { MarketplaceFilters } from "@/components/products/marketplace-filters";
import { MarketplaceSections } from "@/components/products/marketplace-sections";
import { PostItemButton } from "@/components/products/post-item-button";
import { ProductCard } from "@/components/products/product-card";
import { Pagination } from "@/components/ui/pagination";
import {
  isProductSort,
  type ProductSort,
} from "@/lib/constants/product-categories";
import {
  getMarketplaceProducts,
  getProductCategories,
  withFavorites,
} from "@/lib/data/products";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Rental — Tools, equipment and things to hire",
  description:
    "Hire rather than buy: tools, ladders, scaffolding and equipment from people near you on Medosha.",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** The cities things are actually available in. */
async function citiesWithRentals(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("location_city")
    .eq("status", "published")
    .eq("fulfilment", "rental")
    .not("location_city", "is", null)
    .limit(500);

  const seen = new Set<string>();
  for (const row of data ?? []) {
    const city = (row.location_city ?? "").trim();
    if (city) seen.add(city);
  }
  return [...seen].sort((a, b) => a.localeCompare(b)).slice(0, 60);
}

export default async function RentalPage(props: {
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
      // One column again. A rental is neither New nor Used — whether the
      // scaffold is worn matters to whoever hires it, but it does not decide
      // which section the listing is in.
      section: "rental",
      city: city || undefined,
      area: area || undefined,
    }),
    citiesWithRentals(),
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
    if (city) params.set("city", city);
    if (area) params.set("area", area);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/marketplace/rental?${qs}` : "/marketplace/rental";
  }

  const filtered = Boolean(q || category || minPrice || maxPrice || city || area);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Rental
        </h1>
        <PostItemButton condition="new" />
      </div>

      <MarketplaceSections active="rental" className="mb-4" />

      <MarketplaceFilters
        categories={categories}
        current={{ q, category, sort, minPrice, maxPrice, city, area }}
        searchPlaceholder="Scaffold, mixer, ladder…"
        showUsedFilters
        cities={cities}
      />

      <div className="mt-6">
        {!result.available ? (
          <Empty
            icon={<Truck className="size-8" />}
            title="Rental is being set up"
            description="Things to hire will appear here shortly."
          />
        ) : products.length === 0 ? (
          <Empty
            icon={<PackageOpen className="size-8" />}
            title="Nothing to hire matches that yet"
            description={
              filtered
                ? "Try a wider search — fewer filters, or a different city."
                : "Have something people could hire? Post it and set a rate."
            }
            action={<PostItemButton condition="new" />}
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {result.total} {result.total === 1 ? "listing" : "listings"}
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

function Empty({
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
