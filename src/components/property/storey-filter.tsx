"use client";

import { StoreyIcon, STOREY_OPTIONS } from "@/components/property/storey-icons";
import { cn } from "@/lib/utils";

/**
 * Storeys, as a row of drawings rather than a dropdown of numbers.
 *
 * A buyer looking for a G+2 knows the shape they want before they know the
 * number, and "3 Storey / G+2" on a card is faster to recognise than "3" in a
 * select. Both labels are shown because listings here are written either way.
 *
 * The row scrolls horizontally instead of wrapping. Ten cards wrapped to three
 * lines is a filter taller than the results it filters, which on a phone means
 * the map disappears behind the controls.
 */

export function StoreyFilter({
  value,
  onChange,
  className,
}: {
  /** Total storeys, or null for any. */
  value: number | null;
  onChange: (storeys: number | null) => void;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="mb-1.5 text-xs text-muted-foreground">Storeys</p>

      {/* Negative margin so the first and last card can sit flush with the
          panel edge while still having scroll padding. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-1">
        <div className="flex w-max gap-1.5">
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-pressed={value === null}
            className={cn(
              "flex h-[68px] w-16 shrink-0 flex-col items-center justify-center rounded-xl border text-xs transition-colors",
              value === null
                ? "border-brand bg-brand/10 text-brand"
                : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            Any
          </button>

          {STOREY_OPTIONS.map((option) => {
            const active = value === option.storeys;
            return (
              <button
                key={option.storeys}
                type="button"
                // Tapping the selected card clears it, so the row needs no
                // separate reset once something is chosen.
                onClick={() => onChange(active ? null : option.storeys)}
                aria-pressed={active}
                aria-label={`${option.label}, ${option.code}`}
                title={`${option.label} (${option.code})`}
                className={cn(
                  "flex h-[68px] w-16 shrink-0 flex-col items-center justify-between rounded-xl border px-1 pt-1 pb-1.5 transition-colors",
                  active
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                <StoreyIcon storeys={option.storeys} className="h-9 w-9" />
                <span
                  className={cn(
                    "text-[10px] leading-none font-medium",
                    active ? "text-brand" : "text-foreground",
                  )}
                >
                  {option.code}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
