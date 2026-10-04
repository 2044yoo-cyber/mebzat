import type { Metadata } from "next";
import { FileDown } from "lucide-react";

import { MarketplaceSections } from "@/components/products/marketplace-sections";
import { PostItemButton } from "@/components/products/post-item-button";
import { ProductCard } from "@/components/products/product-card";
import { Pagination } from "@/components/ui/pagination";
import {
  DIGITAL_KINDS,
  isProductSort,
  type ProductSort,
} from "@/lib/constants/product-categories";
import {
  getMarketplaceProducts,
  withFavorites,
} from "@/lib/data/products";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { DigitalKind } from "@/types/database.types";

export const metadata: Metadata = {
  title: "Digital Marketplace — Courses, SketchUp files, 3D models, floor plans",
  description:
    "Buy and sell files on Medosha: construction courses, SketchUp component libraries, 3D models, floor plans and templates.",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function isDigitalKind(value: string | undefined): value is DigitalKind {
  return Boolean(value && value in DIGITAL_KINDS);
}

export default async function DigitalMarketplacePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const get = (key: string) => (Array.isArray(sp[key]) ? sp[key][0] : sp[key]);

  const q = get("q") ?? "";
  const kindParam = get("kind") ?? "";
  const sort: ProductSort = isProductSort(get("sort"))
    ? (get("sort") as ProductSort)
    : "newest";
  const minPrice = get("minPrice") ?? "";
  const maxPrice = get("maxPrice") ?? "";
  const page = Math.max(1, Number(get("page")) || 1);

  const [result, { data: auth }] = await Promise.all([
    getMarketplaceProducts({
      q,
      sort,
      minPrice: toNumber(minPrice),
      maxPrice: toNumber(maxPrice),
      page,
      pageSize: PAGE_SIZE,
      // One column decides the section. A digital product is always
      // `condition = 'new'`, which is why New Items narrows on fulfilment too
      // rather than on condition alone.
      section: "digital",
      digitalKind: isDigitalKind(kindParam) ? kindParam : undefined,
    }),
    (await createClient()).auth.getUser(),
  ]);

  const products = await withFavorites(result.products, auth.user?.id);

  function hrefFor(nextKind: string | null, nextPage = 1) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (nextKind) params.set("kind", nextKind);
    if (sort !== "newest") params.set("sort", sort);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/marketplace/digital?${qs}` : "/marketplace/digital";
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Digital
        </h1>
        <PostItemButton condition="new" />
      </div>

      <MarketplaceSections active="digital" className="mb-4" />

      {/* The kind is the filter rail here, where the category is for physical
          goods. A course and a SketchUp library are not sorted by "lighting". */}
      <nav
        aria-label="Kinds of file"
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible"
      >
        <Chip href={hrefFor(null)} active={!kindParam}>
          All
        </Chip>
        {Object.entries(DIGITAL_KINDS).map(([key, kind]) => (
          <Chip
            key={key}
            href={hrefFor(key)}
            active={kindParam === key}
            title={kind.detail}
          >
            {kind.label}
          </Chip>
        ))}
      </nav>

      <div className="mt-6">
        {!result.available ? (
          <Empty
            title="The digital marketplace is being set up"
            description="Files will appear here shortly."
          />
        ) : products.length === 0 ? (
          <Empty
            title="Nothing here yet"
            description={
              q || kindParam
                ? "Try a wider search."
                : "Selling a course, a model or a plan? Post it here."
            }
            action={<PostItemButton condition="new" />}
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {result.total} {result.total === 1 ? "file" : "files"}
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
                makeHref={(nextPage) => hrefFor(kindParam || null, nextPage)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Chip({
  href,
  active,
  title,
  children,
}: {
  href: string;
  active: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      title={title}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm whitespace-nowrap transition-colors",
        active
          ? "border-brand bg-brand text-brand-foreground font-medium"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </a>
  );
}

function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-12 text-center sm:p-16">
      <span className="text-muted-foreground">
        <FileDown className="size-8" />
      </span>
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
