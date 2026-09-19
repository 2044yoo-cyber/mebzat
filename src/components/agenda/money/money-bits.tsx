"use client";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/agenda/projects";

/**
 * The pieces the money screens share.
 *
 * Seven sections showing figures is seven chances to format a number
 * differently, so the formatting lives here once. `formatMoney` itself is
 * `lib/agenda/projects`' — the dashboard already uses it, and a second money
 * formatter is a second answer to "how many decimals".
 */

/** One figure with its name, right-aligned and tabular so columns line up. */
export function Figure({
  label,
  amount,
  currency,
  tone = "plain",
  className,
}: {
  label: string;
  amount: number | null;
  currency: string;
  /** `signed` colours a negative red — over budget — and a positive green. */
  tone?: "plain" | "signed" | "muted";
  className?: string;
}) {
  const text = formatMoney(amount, currency) ?? "—";
  return (
    <div className={cn("space-y-0.5", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-sm font-medium tabular-nums",
          tone === "muted" && "text-muted-foreground",
          tone === "signed" &&
            (amount === null
              ? "text-muted-foreground"
              : amount < 0
                ? "text-destructive"
                : "text-emerald-600 dark:text-emerald-400"),
        )}
      >
        {text}
      </p>
    </div>
  );
}

/** Money inline, in a list or a cell. */
export function Amount({
  value,
  currency,
  className,
}: {
  value: number | null;
  currency: string;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", className)}>
      {formatMoney(value, currency) ?? "—"}
    </span>
  );
}

/**
 * How much of a budget is spoken for.
 *
 * The bar is clamped at full width and the number is not. A line 130% spent
 * is the most important thing on the screen and a bar that stops at 100 hides
 * it, so the bar turns red and the figure says 130%.
 */
export function SpendBar({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <p className="text-xs text-muted-foreground">No budget set</p>;
  }
  const over = percent > 100;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            over ? "bg-destructive" : "bg-brand",
          )}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <span
        className={cn(
          "w-12 shrink-0 text-right text-xs tabular-nums",
          over ? "font-medium text-destructive" : "text-muted-foreground",
        )}
      >
        {percent}%
      </span>
    </div>
  );
}
