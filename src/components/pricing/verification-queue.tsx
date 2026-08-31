"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Undo2 } from "lucide-react";

import { rejectPrice, verifyPrice } from "@/app/admin/prices/actions";
import type { ReferencePrice } from "@/lib/data/price-book";
import { cn } from "@/lib/utils";

/**
 * One row per price, with the two decisions an administrator can make.
 *
 * Verify, or send back. There is no delete, and that is deliberate: a rejected
 * submission is still a record that somebody quoted that figure on that date,
 * and the price book's value is that it has no holes in it. Sending back moves
 * a row to `web_sourced`, where it stays visible, stays below the marketplace
 * average, and is labelled unverified everywhere it appears.
 *
 * A row disappears from the list once decided, because it is no longer waiting.
 * Nothing is reordered underneath somebody mid-review.
 */
export function VerificationQueue({ prices }: { prices: ReferencePrice[] }) {
  const [decided, setDecided] = useState<Record<string, "verified" | "sent-back">>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const decide = (id: string, action: "verify" | "reject") => {
    setBusyId(id);
    setError(null);
    startTransition(async () => {
      const result =
        action === "verify" ? await verifyPrice(id) : await rejectPrice(id);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDecided((current) => ({
        ...current,
        [id]: action === "verify" ? "verified" : "sent-back",
      }));
    });
  };

  const waiting = prices.filter((price) => !decided[price.id]);

  return (
    <div className="space-y-2">
      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {Object.keys(decided).length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {Object.values(decided).filter((v) => v === "verified").length} verified,{" "}
          {Object.values(decided).filter((v) => v === "sent-back").length} sent back
          this session.
        </p>
      ) : null}

      {waiting.map((price) => (
        <div
          key={price.id}
          className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {price.material}
              {price.specification ? (
                <span className="font-normal text-muted-foreground">
                  {" "}· {price.specification}
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {price.brand ? `${price.brand} · ` : ""}
              {price.region} ·{" "}
              {new Date(price.priceDate).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              {price.supplier ? ` · ${price.supplier}` : ""}
              {price.source ? ` · ${price.source}` : ""}
            </p>
          </div>

          <p className="shrink-0 text-right">
            <span className="text-base font-semibold tabular-nums">
              ETB {Math.round(price.priceEtb).toLocaleString("en-US")}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              per {price.unit} · VAT {price.vatStatus}
            </span>
          </p>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              disabled={pending}
              onClick={() => decide(price.id, "verify")}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                "border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400",
                pending && "opacity-50",
              )}
            >
              {busyId === price.id && pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Verify
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => decide(price.id, "reject")}
              title="Keeps the record, marks it unverified"
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors",
                "text-muted-foreground hover:border-brand hover:text-foreground",
                pending && "opacity-50",
              )}
            >
              <Undo2 className="size-3.5" />
              Send back
            </button>
          </div>
        </div>
      ))}

      {waiting.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Queue cleared.
        </p>
      ) : null}
    </div>
  );
}
