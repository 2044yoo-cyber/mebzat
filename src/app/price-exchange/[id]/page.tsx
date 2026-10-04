import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, MapPin, Star, Truck } from "lucide-react";

import { ListingActions } from "@/components/price-exchange/listing-actions";
import { PriceChart } from "@/components/price-exchange/price-chart";
import { sectorLabel } from "@/lib/constants/price-exchange";
import {
  getListing,
  getListingBids,
  getMarketStats,
  getPriceTrend,
  isWatching,
} from "@/lib/data/price-exchange";
import { ReferencePriceNote } from "@/components/pricing/reference-price";
import { referenceFor } from "@/lib/data/price-book";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const listing = await getListing(id);
  if (!listing) return { title: "Price not found" };

  return {
    title: `${listing.item} — ${listing.currency} ${listing.current_price} per ${listing.unit}`,
    description: `Live price, bids and history for ${listing.item} on the Medosha Construction Price Exchange.`,
  };
}

function money(value: number | null, currency: string): string {
  if (value === null) return "—";
  return `${currency} ${Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

export default async function PriceListingPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const listing = await getListing(id);
  if (!listing) notFound();

  // What Medosha's own book says about this material. A second query, after the
  // null check — the column is `location_city`, and narrowing by it matters:
  // cement in Addis and cement in Mekelle are different prices and showing one
  // as the reference for the other would be worse than showing neither.
  const reference = await referenceFor(
    listing.item,
    listing.location_city ?? undefined,
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [bids, stats, trend, watching] = await Promise.all([
    getListingBids(listing.id),
    getMarketStats(listing.category, listing.unit),
    // A year of history; the chart windows it for the shorter ranges.
    getPriceTrend(listing.id, 365),
    isWatching(listing.id, user?.id ?? null),
  ]);

  const supplierName =
    listing.company?.name ??
    listing.supplier?.company_name ??
    listing.supplier?.full_name ??
    "Medosha supplier";

  const versusMarket =
    stats.average !== null && stats.average !== 0
      ? ((listing.current_price - stats.average) / stats.average) * 100
      : null;

  return (
    <div className="container-page py-10">
      <Link
        href={`/price-exchange?sector=${listing.sector}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to {sectorLabel(listing.sector)}
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <header>
            <p className="text-sm text-muted-foreground">{listing.category}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              {listing.item}
            </h1>
            {listing.specification && (
              <p className="mt-2 max-w-2xl text-muted-foreground">
                {listing.specification}
              </p>
            )}

            {/*
              What Medosha's own book says, beside what this supplier is asking.
              Absent for most listings and that is correct — the book covers a
              few hundred materials and the marketplace carries anything anybody
              wants to sell. A stretched match would be worse than the blank.
            */}
            {reference ? (
              <div className="mt-4 max-w-sm">
                <ReferencePriceNote
                  reference={reference}
                  listingPrice={Number(listing.current_price)}
                />
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                {listing.verified && (
                  <BadgeCheck className="size-4 text-brand" aria-label="Verified" />
                )}
                {listing.company?.slug ? (
                  <Link
                    href={`/companies/${listing.company.slug}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {supplierName}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">
                    {supplierName}
                  </span>
                )}
              </span>
              {listing.location_city && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  {listing.location_city}
                </span>
              )}
              {listing.delivery_days !== null && (
                <span className="flex items-center gap-1.5">
                  <Truck className="size-4" />
                  {listing.delivery_days} day delivery
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Star className="size-4" />
                {Number(listing.rating).toFixed(1)}
              </span>
            </div>
          </header>

          <PriceChart
            points={trend}
            currency={listing.currency}
            unit={listing.unit}
            asOf={new Date().toISOString()}
          />

          <section className="rounded-2xl border">
            <div className="border-b p-4">
              <h2 className="font-medium">
                Open bids{" "}
                <span className="text-muted-foreground">({bids.length})</span>
              </h2>
              <p className="text-sm text-muted-foreground">
                Competing offers against this price, cheapest first.
              </p>
            </div>

            {bids.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted-foreground">
                No bids yet. Be the first to offer a price.
              </p>
            ) : (
              <ul className="divide-y">
                {bids.map((bid) => {
                  const name =
                    bid.bidder?.company_name ??
                    bid.bidder?.full_name ??
                    "A supplier";
                  return (
                    <li
                      key={bid.id}
                      className="flex items-start justify-between gap-4 p-4"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{name}</p>
                        {bid.note && (
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {bid.note}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(bid.created_at).toLocaleDateString()}
                          {bid.delivery_days !== null &&
                            ` · ${bid.delivery_days} day delivery`}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold tabular-nums">
                        {money(bid.price, bid.currency)}
                        <span className="block text-right text-xs font-normal text-muted-foreground">
                          per {bid.unit}
                        </span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border p-5">
            <p className="text-sm text-muted-foreground">Asking price</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {money(listing.current_price, listing.currency)}
            </p>
            <p className="text-sm text-muted-foreground">per {listing.unit}</p>

            {versusMarket !== null && (
              <p
                className={cn(
                  "mt-3 text-sm",
                  versusMarket > 0 ? "text-destructive" : "text-emerald-500",
                )}
              >
                {versusMarket > 0 ? "+" : ""}
                {versusMarket.toFixed(1)}% versus the market average
              </p>
            )}

            <dl className="mt-4 space-y-2 border-t pt-4 text-sm">
              <Row label="Lowest bid" value={money(listing.lowest_bid, listing.currency)} />
              <Row label="Highest bid" value={money(listing.highest_bid, listing.currency)} />
              <Row
                label="Market average"
                value={money(stats.average, listing.currency)}
              />
              <Row
                label="Market range"
                value={
                  stats.lowest === null
                    ? "—"
                    : `${money(stats.lowest, listing.currency)} – ${money(stats.highest, listing.currency)}`
                }
              />
              <Row
                label="Comparable listings"
                value={String(stats.sampleSize)}
              />
            </dl>

            <div className="mt-5">
              <ListingActions
                listing={listing}
                viewerId={user?.id ?? null}
                watching={watching}
              />
            </div>
          </div>

          {listing.product_id && (
            <Link
              href={`/marketplace/${listing.product_id}`}
              className="block rounded-2xl border p-4 text-sm transition-colors hover:border-brand"
            >
              <span className="font-medium">View in the marketplace</span>
              <span className="mt-0.5 block text-muted-foreground">
                Photos, full specification and ordering.
              </span>
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
