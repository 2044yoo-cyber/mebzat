"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Gavel,
  MessageSquare,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { BidDialog } from "@/components/price-exchange/bid-dialog";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { PriceRow } from "@/lib/data/price-exchange";

/**
 * The market table.
 *
 * Rows arrive server-rendered and are then patched in place from Realtime, so
 * a price move or a new bid lands without a refetch. Updates are merged over
 * the server rows rather than replacing them, which keeps a fresh navigation
 * authoritative while live edits still show.
 */

function money(value: number | null, currency: string): string {
  if (value === null) return "—";
  return `${currency} ${Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function relative(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

const AVAILABILITY_LABEL: Record<string, string> = {
  in_stock: "In stock",
  made_to_order: "Made to order",
  out_of_stock: "Out of stock",
  available: "Available",
  booked: "Booked",
};

export function PriceTable({
  rows: serverRows,
  viewerId,
}: {
  rows: PriceRow[];
  viewerId: string | null;
}) {
  // Realtime patches, keyed by listing id and merged over the server rows.
  const [patches, setPatches] = useState<Record<string, Partial<PriceRow>>>({});
  const [bidding, setBidding] = useState<PriceRow | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const rows = useMemo(
    () =>
      serverRows.map((row) =>
        patches[row.id] ? { ...row, ...patches[row.id] } : row,
      ),
    [serverRows, patches],
  );

  useEffect(() => {
    const visible = new Set(serverRows.map((row) => row.id));

    const channel = supabase
      .channel("price-exchange")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "price_listings" },
        (payload) => {
          const row = payload.new as PriceRow;
          // Ignore rows that are not on this page of the market.
          if (!visible.has(row.id)) return;
          setPatches((prev) => ({
            ...prev,
            [row.id]: {
              current_price: row.current_price,
              lowest_bid: row.lowest_bid,
              highest_bid: row.highest_bid,
              bid_count: row.bid_count,
              availability: row.availability,
              updated_at: row.updated_at,
            },
          }));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "price_bids" },
        (payload) => {
          const bid = payload.new as { listing_id: string; price: number };
          if (!visible.has(bid.listing_id)) return;
          const listing = serverRows.find((r) => r.id === bid.listing_id);
          if (listing) toast.message(`New bid on ${listing.item}`);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, serverRows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-16 text-center">
        <p className="font-medium">No prices match those filters</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Widen the search, or clear the verified-only filter.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full border-collapse text-sm">
          {/* Sticky header so the columns stay readable down a long market. */}
          <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-3 font-medium">Supplier</th>
              <th className="px-3 py-3 font-medium">Item</th>
              <th className="px-3 py-3 font-medium">Specification</th>
              <th className="px-3 py-3 text-right font-medium">Current</th>
              <th className="px-3 py-3 text-right font-medium">Lowest bid</th>
              <th className="px-3 py-3 text-right font-medium">Highest bid</th>
              <th className="px-3 py-3 font-medium">Unit</th>
              <th className="px-3 py-3 font-medium">Location</th>
              <th className="px-3 py-3 font-medium">Delivery</th>
              <th className="px-3 py-3 font-medium">Availability</th>
              <th className="px-3 py-3 font-medium">Rating</th>
              <th className="px-3 py-3 font-medium">Updated</th>
              <th className="px-3 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const supplierName =
                row.company?.name ??
                row.supplier?.company_name ??
                row.supplier?.full_name ??
                "Medosha supplier";
              const undercut =
                row.lowest_bid !== null && row.lowest_bid < row.current_price;

              return (
                <tr
                  key={row.id}
                  className="border-b transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-1.5">
                      {row.verified && (
                        <BadgeCheck
                          className="size-3.5 shrink-0 text-brand"
                          aria-label="Verified"
                        />
                      )}
                      {row.company?.slug ? (
                        <Link
                          href={`/companies/${row.company.slug}`}
                          className="truncate hover:underline"
                        >
                          {supplierName}
                        </Link>
                      ) : (
                        <span className="truncate">{supplierName}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/price-exchange/${row.id}`}
                      className="block font-medium hover:underline"
                    >
                      {row.item}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {row.category}
                    </span>
                  </td>
                  <td className="max-w-48 truncate px-3 py-3 text-muted-foreground">
                    {row.specification ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {money(row.current_price, row.currency)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        undercut && "font-medium text-emerald-500",
                      )}
                    >
                      {undercut && <TrendingDown className="size-3" />}
                      {money(row.lowest_bid, row.currency)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      {row.highest_bid !== null &&
                        row.highest_bid > row.current_price && (
                          <TrendingUp className="size-3" />
                        )}
                      {money(row.highest_bid, row.currency)}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                    {row.unit}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                    {row.location_city ?? "—"}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                    {row.delivery_days === null ? "—" : `${row.delivery_days}d`}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        row.availability === "out_of_stock"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-emerald-500/10 text-emerald-500",
                      )}
                    >
                      {AVAILABILITY_LABEL[row.availability] ?? row.availability}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Star className="size-3" />
                      {Number(row.rating).toFixed(1)}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
                    {relative(row.updated_at)}
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setBidding(row)}
                        className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors hover:border-brand hover:text-foreground"
                      >
                        <Gavel className="size-3" />
                        Bid
                        {row.bid_count > 0 && (
                          <span className="text-muted-foreground">
                            ({row.bid_count})
                          </span>
                        )}
                      </button>
                      {row.supplier?.id && (
                        <Link
                          href={`/messages?supplier=${row.supplier.id}`}
                          aria-label={`Message ${supplierName}`}
                          className="flex size-7 items-center justify-center rounded-md border transition-colors hover:border-brand"
                        >
                          <MessageSquare className="size-3" />
                        </Link>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <BidDialog
        listing={bidding}
        viewerId={viewerId}
        onClose={() => setBidding(null)}
      />
    </>
  );
}
