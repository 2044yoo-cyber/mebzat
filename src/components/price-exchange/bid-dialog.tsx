"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Gavel, TrendingDown } from "lucide-react";
import { toast } from "sonner";

import { submitBid } from "@/app/price-exchange/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PriceRow } from "@/lib/data/price-exchange";

/**
 * Places a competing offer against a listing.
 *
 * Controlled by the table rather than a trigger, because the row that opened it
 * is what the dialog needs to render. `listing` doubles as the open state: a
 * row means open, null means closed.
 */

function money(value: number | null, currency: string): string {
  if (value === null) return "—";
  return `${currency} ${Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

export function BidDialog({
  listing,
  viewerId,
  onClose,
}: {
  listing: PriceRow | null;
  viewerId: string | null;
  onClose: () => void;
}) {
  if (!listing) return null;

  // Keyed on the listing so every row opens with an empty form: carrying the
  // previous row's figure over would invite bidding the wrong number on the
  // wrong item.
  return (
    <BidDialogForm
      key={listing.id}
      listing={listing}
      viewerId={viewerId}
      onClose={onClose}
    />
  );
}

function BidDialogForm({
  listing,
  viewerId,
  onClose,
}: {
  listing: PriceRow;
  viewerId: string | null;
  onClose: () => void;
}) {
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ownListing = viewerId !== null && viewerId === listing.supplier_id;
  const entered = Number(price);
  const undercuts =
    Number.isFinite(entered) && entered > 0 && entered < listing.current_price;
  const target = listing.lowest_bid ?? listing.current_price;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const amount = Number(price);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a price above zero.");
      return;
    }

    const listingId = listing.id;
    const unit = listing.unit;
    const item = listing.item;

    startTransition(async () => {
      const result = await submitBid(listingId, amount, unit, note.trim());
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(`Bid placed on ${item}`);
      onClose();
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="size-4 text-brand" />
            Bid on {listing.item}
          </DialogTitle>
          <DialogDescription>
            {listing.specification ?? listing.category} · priced per{" "}
            {listing.unit}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-3 gap-2 rounded-xl border p-3 text-center">
          <div>
            <dt className="text-xs text-muted-foreground">Asking</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">
              {money(listing.current_price, listing.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Lowest bid</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">
              {money(listing.lowest_bid, listing.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Bids</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">
              {listing.bid_count}
            </dd>
          </div>
        </dl>

        {viewerId === null ? (
          <p className="text-sm text-muted-foreground">
            <Link
              href="/login?redirect=/price-exchange"
              className="font-medium text-foreground underline underline-offset-2"
            >
              Sign in
            </Link>{" "}
            to bid on this listing.
          </p>
        ) : ownListing ? (
          <p className="text-sm text-muted-foreground">
            This is your own listing. Update the price from your dashboard
            instead of bidding on it.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="bid-price">
                Your price ({listing.currency} per {listing.unit})
              </Label>
              <Input
                id="bid-price"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                required
                autoFocus
                value={price}
                onChange={(event) => {
                  setPrice(event.target.value);
                  setError(null);
                }}
                placeholder={String(target)}
              />
              {undercuts && (
                <p className="flex items-center gap-1 text-xs text-emerald-500">
                  <TrendingDown className="size-3" />
                  Undercuts the asking price by{" "}
                  {money(listing.current_price - entered, listing.currency)}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bid-note">Note (optional)</Label>
              <Textarea
                id="bid-note"
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Lead time, minimum order, delivery terms…"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              You can hold one open bid per listing. Bidding again replaces it.
            </p>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Placing…" : "Place bid"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
