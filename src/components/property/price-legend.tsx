"use client";

import {
  BAND_STYLES,
  legendRows,
  type PriceScale,
} from "@/lib/map/price-bands";
import { shortPrice } from "@/lib/constants/properties";
import { cn } from "@/lib/utils";

/**
 * The key to the price colours.
 *
 * Without it the colours are decoration: somebody sees red and orange markers
 * and has to work out for themselves that red is dear, which is exactly the
 * work the colours were supposed to save.
 *
 * It shows the actual thresholds rather than only the words, because "High"
 * means nothing on its own and "ETB 75K – 150K" means everything. Those numbers
 * move with the filters, which is also the clearest way of showing that the
 * scale is relative to what is on screen rather than fixed.
 */
export function PriceLegend({
  scale,
  kind,
  className,
}: {
  scale: PriceScale;
  kind: "rent" | "sale";
  className?: string;
}) {
  // Nothing priced, nothing to explain.
  if (scale.basis === "none" || scale.sampleSize === 0) return null;

  const rows = legendRows(scale);
  const period = kind === "rent" ? "month" : null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg border bg-background/92 p-2 text-[11px] shadow-lg backdrop-blur",
        // Narrow enough not to eat a phone screen; the numbers hide below the
        // smallest breakpoint, where the words still carry the ordering.
        "w-[136px] sm:w-[168px]",
        className,
      )}
    >
      <p className="mb-1 font-semibold tracking-wide text-muted-foreground uppercase">
        {kind === "rent" ? "Monthly rent" : "Asking price"}
      </p>

      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.band} className="flex items-center gap-1.5">
            <span
              className="size-2.5 shrink-0 rounded-full border border-white/70"
              style={{ background: BAND_STYLES[row.band].base }}
              aria-hidden="true"
            />
            <span className="flex-1 truncate">{row.style.label}</span>
            {/* The band as bars, mirroring the marker — so somebody who reads
                the marker by its bars can find the same shape in the key. */}
            <span className="hidden shrink-0 items-end gap-px sm:flex" aria-hidden="true">
              {Array.from({ length: 5 }, (_, i) => (
                <i
                  key={i}
                  className={cn(
                    "w-[2px] rounded-[1px]",
                    i < row.style.bars ? "bg-foreground/70" : "bg-foreground/15",
                  )}
                  style={{ height: `${3 + i}px` }}
                />
              ))}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-1.5 hidden text-[10px] leading-tight text-muted-foreground sm:block">
        {scale.basis === "percentile" ? (
          <>
            {shortPrice(scale.min, "ETB", period)} –{" "}
            {shortPrice(scale.max, "ETB", period)} across {scale.sampleSize}{" "}
            listings shown
          </>
        ) : (
          // Said out loud rather than hidden. With four listings the colours
          // come from a fixed ladder, and presenting that as a reading of the
          // market would be a claim the data cannot support.
          <>Standard ranges — too few listings shown to rank them</>
        )}
      </p>
    </div>
  );
}
