"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Coins, X } from "lucide-react";

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
 *
 * ## Why it folds on a phone
 *
 * At 136px wide and six rows tall it covered most of a 360px screen's bottom
 * left corner — and the corner of a property map is not empty space, it is
 * markers. A key that hides the thing it is explaining has stopped being a key.
 *
 * So below `sm` it starts as a single chip and opens on a tap. It is not
 * hidden: every row is still reachable, in one gesture, and the chip says what
 * it is rather than being a mystery icon. Above `sm` there is room, and it
 * stays open exactly as it was — the desktop layout is unchanged.
 *
 * The whole thing had `pointer-events-none` before, which is why it could not
 * simply be given a button. Pointer events are now enabled on the panel and
 * disabled on nothing else, so the map still receives every drag that does not
 * begin on the key itself.
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
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Tap the map, the key folds away. Registered only while it is open, so the
  // map does not carry a document listener for the whole session.
  //
  // `pointerdown` rather than `click`: a drag that starts on the map is a pan,
  // and a pan should close the key at the moment it begins rather than at the
  // end, by which point the reader has been dragging around an open panel.
  useEffect(() => {
    if (!open) return;

    function away(event: PointerEvent) {
      const node = panelRef.current;
      if (node && !node.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  // Nothing priced, nothing to explain.
  if (scale.basis === "none" || scale.sampleSize === 0) return null;

  const rows = legendRows(scale);
  const period = kind === "rent" ? "month" : null;
  const title = kind === "rent" ? "Monthly rent" : "Asking price";

  return (
    <div
      ref={panelRef}
      className={cn(
        // `max-w` in viewport units, not a fixed pixel width: at 320px the
        // panel gives the map back the space it cannot spare, and it can never
        // be wider than the screen it is sitting on.
        "absolute bottom-3 left-3 z-10 max-w-[calc(100vw-1.5rem)]",
        className,
      )}
    >
      {/* --- the chip, below sm only ------------------------------------- */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls={panelId}
          className="flex items-center gap-1.5 rounded-full border bg-background/92 py-1.5 pl-2 pr-3 text-[11px] font-medium shadow-lg backdrop-blur sm:hidden"
        >
          <Coins className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {kind === "rent" ? "Rent" : "Price"}
        </button>
      )}

      {/* --- the key itself ----------------------------------------------- */}
      <div
        id={panelId}
        className={cn(
          "rounded-lg border bg-background/92 p-2 text-[11px] shadow-lg backdrop-blur",
          "w-[136px] sm:w-[168px]",
          // Open on a tap below sm; always open from sm up, where the chip is
          // hidden and there is room for the full key.
          open ? "block" : "hidden sm:block",
        )}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="font-semibold tracking-wide text-muted-foreground uppercase">
            {title}
          </p>
          {open && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close the price key"
              className="-mr-1 -mt-1 rounded p-1 text-muted-foreground sm:hidden"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

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
                  the marker by its bars can find the same shape in the key.
                  Shown once the key is open on a phone too: it is the part that
                  works without colour, which is the reader who needs it most. */}
              <span
                className={cn(
                  "shrink-0 items-end gap-px sm:flex",
                  open ? "flex" : "hidden",
                )}
                aria-hidden="true"
              >
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

        <p
          className={cn(
            "mt-1.5 text-[10px] leading-tight text-muted-foreground sm:block",
            open ? "block" : "hidden",
          )}
        >
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
    </div>
  );
}
