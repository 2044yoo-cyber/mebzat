"use client";

import { cn } from "@/lib/utils";

/**
 * The quick filters, above the map.
 *
 * Eight choices a person actually arrives with — am I buying or renting, and
 * roughly what — rather than the full filter set, which lives behind the
 * Filters button and is a different kind of question.
 *
 * One scrolling row at every width. Wrapping to three lines on a phone would
 * push the map below the fold, and the map is what somebody came for; a row
 * that scrolls costs a swipe and no vertical space at all.
 */

export type QuickFilter =
  | { kind: "all" }
  | { kind: "listing"; value: "sale" | "rent" }
  | { kind: "buildings" }
  | { kind: "type"; value: string };

export const QUICK_FILTERS: { id: string; label: string; filter: QuickFilter }[] = [
  { id: "all", label: "All", filter: { kind: "all" } },
  { id: "sale", label: "For sale", filter: { kind: "listing", value: "sale" } },
  { id: "rent", label: "For rent", filter: { kind: "listing", value: "rent" } },
  { id: "buildings", label: "Buildings", filter: { kind: "buildings" } },
  { id: "apartment", label: "Apartments", filter: { kind: "type", value: "apartment" } },
  { id: "villa", label: "Villas", filter: { kind: "type", value: "villa" } },
  { id: "commercial", label: "Commercial", filter: { kind: "type", value: "commercial" } },
  { id: "office", label: "Offices", filter: { kind: "type", value: "office" } },
  { id: "land", label: "Land", filter: { kind: "type", value: "land" } },
];

export function MapFilterBar({
  active,
  onSelect,
  className,
}: {
  active: string;
  onSelect: (id: string, filter: QuickFilter) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0",
        // Hides the scrollbar without disabling the scroll, so the row reads
        // as a row rather than as a windowed list.
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <div className="flex w-max gap-1.5 py-0.5">
        {QUICK_FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={active === entry.id}
            onClick={() => onSelect(entry.id, entry.filter)}
            className={cn(
              // 36px tall: comfortably tappable without eating map.
              "h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
              active === entry.id
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  );
}
