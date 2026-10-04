"use client";

import { BadgeCheck, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { collectedLabel, useMaterialPrice } from "@/lib/calculators/prices";
import { DEFAULT_VALIDITY_DAYS, PRICE_STATUS_LABELS, PRICE_STATUS_NOTES } from "@/lib/prices/status";
import { formatNumber } from "@/lib/calculators/units";

/**
 * "Medosha has a price for this. Use it?"
 *
 * Offered, never applied. The reader taps to take it, and what they typed
 * themselves is never overwritten by something arriving from the network —
 * a price that changes a number you already entered is worse than no price.
 *
 * ## Everything is stated
 *
 * The figure comes with its trust level, its age and its caveat, all from the
 * price book's own vocabulary in `src/lib/prices/status.ts` rather than wording
 * invented here. Most of what is in that book is `educational_estimate` — the
 * 0042 seed says so in its own notes — and an estimate presented as a market
 * rate is exactly the invented number these calculators were built to avoid.
 * So the caveat is not fine print: it sits under the figure at the same size.
 */
export function PriceOffer({
  material,
  city,
  onUse,
  className,
}: {
  material: string;
  city: string;
  onUse: (price: number) => void;
  className?: string;
}) {
  // Nothing is asked for until there is something to ask about.
  const trimmed = material.trim();
  const lookup = useMaterialPrice(trimmed.length >= 3 ? trimmed : undefined, city);

  if (lookup.state === "asking" || lookup.state === "none") return null;

  if (lookup.state === "unreachable") {
    // Not the same as "no price exists", and saying so stops somebody
    // concluding Medosha has nothing when the truth is we could not ask.
    return (
      <p className={cn("mt-1 text-xs text-muted-foreground", className)}>
        Could not reach the price book. Type a price.
      </p>
    );
  }

  const { price } = lookup;
  const statusNote = PRICE_STATUS_NOTES[price.dataStatus];

  return (
    <div className={cn("mt-1.5 rounded-lg border bg-muted/40 p-2", className)}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <button
          type="button"
          onClick={() => onUse(price.price)}
          className="rounded-md bg-brand px-2 py-1 text-xs font-medium text-brand-foreground"
        >
          Use {price.currency} {formatNumber(price.price)}
        </button>
        <span className="text-xs text-muted-foreground">
          per {price.unit} · {price.city}
        </span>
      </div>

      <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {price.verified ? (
          <BadgeCheck className="size-3.5 text-emerald-600" />
        ) : (
          <Info className="size-3.5" />
        )}
        <span className="font-medium">{PRICE_STATUS_LABELS[price.dataStatus]}</span>
        <span>· {collectedLabel(price.ageDays)}</span>
        {price.supplier && <span>· {price.supplier}</span>}
      </p>

      {statusNote && <p className="mt-1 text-xs text-amber-700 dark:text-amber-500">{statusNote}</p>}

      {price.stale && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-500">
          Older than the price book&rsquo;s {DEFAULT_VALIDITY_DAYS}-day validity window. Confirm before
          you rely on it.
        </p>
      )}
    </div>
  );
}
