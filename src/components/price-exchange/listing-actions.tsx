"use client";

import { useState, useTransition } from "react";
import { Bell, BellOff, Gavel } from "lucide-react";
import { toast } from "sonner";

import { toggleWatch } from "@/app/price-exchange/actions";
import { BidDialog } from "@/components/price-exchange/bid-dialog";
import { Button } from "@/components/ui/button";
import type { PriceRow } from "@/lib/data/price-exchange";

/** Bid and follow, for the listing page. */
export function ListingActions({
  listing,
  viewerId,
  watching: initialWatching,
}: {
  listing: PriceRow;
  viewerId: string | null;
  watching: boolean;
}) {
  const [bidding, setBidding] = useState(false);
  const [watching, setWatching] = useState(initialWatching);
  const [pending, startTransition] = useTransition();

  function follow() {
    // Flip first, revert if the server disagrees — following is cheap and the
    // button should not feel like a form submit.
    const next = !watching;
    setWatching(next);
    startTransition(async () => {
      const result = await toggleWatch(listing.id);
      if (result.error) {
        setWatching(!next);
        toast.error(result.error);
        return;
      }
      toast.success(next ? "Following this price" : "Stopped following");
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={() => setBidding(true)}>
          <Gavel className="size-4" />
          Place a bid
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={pending}
          aria-pressed={watching}
          onClick={follow}
        >
          {watching ? (
            <>
              <BellOff className="size-4" /> Following
            </>
          ) : (
            <>
              <Bell className="size-4" /> Follow price
            </>
          )}
        </Button>
      </div>

      <BidDialog
        listing={bidding ? listing : null}
        viewerId={viewerId}
        onClose={() => setBidding(false)}
      />
    </>
  );
}
