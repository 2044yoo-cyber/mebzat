import Link from "next/link";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PriceRow } from "@/lib/data/price-exchange";

/**
 * The materials people are actually pricing right now.
 *
 * Reads from the Price Exchange rather than the marketplace, because a
 * material's interesting number is its current rate and how it moved, not a
 * product listing.
 */
export function TrendingMaterials({ rows }: { rows: PriceRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((row) => {
        const undercut =
          row.lowest_bid !== null && row.lowest_bid < row.current_price;

        return (
          <Link
            key={row.id}
            href={`/price-exchange/${row.id}`}
            className="group flex flex-col justify-between rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-md"
          >
            <div>
              <p className="text-xs text-muted-foreground">{row.category}</p>
              <h3 className="mt-0.5 line-clamp-2 font-medium leading-snug">
                {row.item}
              </h3>
            </div>

            <div className="mt-4">
              <p className="text-lg font-semibold tabular-nums">
                {row.currency}{" "}
                {Number(row.current_price).toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {row.unit}
                </span>
              </p>

              <p
                className={cn(
                  "mt-1 flex items-center gap-1 text-xs",
                  undercut ? "text-emerald-500" : "text-muted-foreground",
                )}
              >
                {row.bid_count === 0 ? (
                  "No bids yet"
                ) : undercut ? (
                  <>
                    <TrendingDown className="size-3" />
                    Bid from {row.currency}{" "}
                    {Number(row.lowest_bid).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </>
                ) : (
                  <>
                    <TrendingUp className="size-3" />
                    {row.bid_count} {row.bid_count === 1 ? "bid" : "bids"}
                  </>
                )}
              </p>
            </div>

            <span className="mt-3 flex items-center gap-1 text-xs font-medium text-brand">
              See the market
              <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
