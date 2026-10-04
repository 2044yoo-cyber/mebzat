import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Gavel, LineChart, TrendingDown } from "lucide-react";

import { PriceFilters } from "@/components/price-exchange/price-filters";
import { PriceTable } from "@/components/price-exchange/price-table";
import { SectorTabs } from "@/components/price-exchange/sector-tabs";
import { Pagination } from "@/components/ui/pagination";
import {
  DEFAULT_SECTOR,
  isPriceSector,
  isPriceSort,
  sectorLabel,
  type PriceSortKey,
} from "@/lib/constants/price-exchange";
import { getPriceFacets, getPrices, PAGE_SIZE } from "@/lib/data/price-exchange";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Construction Price Exchange — Live prices and bidding",
  description:
    "Compare live prices for construction materials, labour, furniture and projects across Ethiopia. Bid against published rates and follow price movements.",
};

// Prices move; a cached market is a wrong market.
export const dynamic = "force-dynamic";

export default async function PriceExchangePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const get = (key: string) => (Array.isArray(sp[key]) ? sp[key][0] : sp[key]);

  const sectorParam = get("sector");
  const sector = isPriceSector(sectorParam) ? sectorParam : DEFAULT_SECTOR;
  const q = get("q") ?? "";
  const category = get("category") ?? "";
  const city = get("city") ?? "";
  const verified = get("verified") === "1";
  const sort: PriceSortKey = isPriceSort(get("sort"))
    ? (get("sort") as PriceSortKey)
    : "lowest";
  const page = Math.max(1, Number(get("page")) || 1);

  const supabase = await createClient();
  const [result, facets, { data: auth }] = await Promise.all([
    getPrices({
      sector,
      q,
      category: category || undefined,
      city: city || undefined,
      verifiedOnly: verified,
      sort,
      page,
    }),
    getPriceFacets(sector),
    supabase.auth.getUser(),
  ]);

  function makeHref(nextPage: number) {
    const params = new URLSearchParams();
    if (sector !== DEFAULT_SECTOR) params.set("sector", sector);
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (city) params.set("city", city);
    if (verified) params.set("verified", "1");
    if (sort !== "lowest") params.set("sort", sort);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/price-exchange?${qs}` : "/price-exchange";
  }

  // A snapshot of what is on this page, which is what the numbers describe.
  const prices = result.rows.map((row) => row.current_price);
  const lowest = prices.length > 0 ? Math.min(...prices) : null;
  const average =
    prices.length > 0
      ? prices.reduce((sum, price) => sum + price, 0) / prices.length
      : null;
  const openBids = result.rows.reduce((sum, row) => sum + row.bid_count, 0);
  const currency = result.rows[0]?.currency ?? "ETB";

  return (
    <div className="container-page py-10">
      <header className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LineChart className="size-4" /> Price Exchange
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Construction Price Exchange
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Live prices for materials, labour, furniture and whole projects. Bid
          against any published rate, and follow the ones you care about.
        </p>
      </header>

      <SectorTabs active={sector} />

      {!result.available ? (
        <Notice
          title="The exchange is not set up yet"
          description="Apply migration 0009_price_exchange.sql, then prices will appear here."
        />
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              icon={<Activity className="size-4" />}
              label={`${sectorLabel(sector)} listed`}
              value={String(result.total)}
            />
            <Stat
              icon={<TrendingDown className="size-4" />}
              label="Lowest on this page"
              value={lowest === null ? "—" : format(lowest, currency)}
            />
            <Stat
              icon={<LineChart className="size-4" />}
              label="Average on this page"
              value={average === null ? "—" : format(average, currency)}
            />
            <Stat
              icon={<Gavel className="size-4" />}
              label="Open bids"
              value={String(openBids)}
            />
          </div>

          <div className="mt-6">
            <PriceFilters
              categories={facets.categories}
              cities={facets.cities}
              current={{ q, category, city, verified, sort }}
            />
          </div>

          <div className="mt-5">
            <PriceTable rows={result.rows} viewerId={auth.user?.id ?? null} />
          </div>

          <div className="mt-8">
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={result.total}
              makeHref={makeHref}
            />
          </div>

          <p className="mt-8 text-sm text-muted-foreground">
            Selling any of these?{" "}
            <Link
              href="/products/new"
              className="font-medium text-foreground underline underline-offset-2"
            >
              List your price
            </Link>{" "}
            and let buyers compare it.
          </p>
        </>
      )}
    </div>
  );
}

function format(value: number, currency: string): string {
  return `${currency} ${Math.round(value).toLocaleString()}`;
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Notice({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed p-16 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
