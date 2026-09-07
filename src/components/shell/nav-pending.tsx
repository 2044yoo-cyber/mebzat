"use client";

import { useLinkStatus } from "next/link";

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * "Yes, that tap landed. It is loading."
 *
 * ## The problem this exists for
 *
 * A tap on a phone had no visible reply. Every row in the application styles
 * its feedback with `hover:`, and **`hover:` never fires on a touchscreen** —
 * there is no pointer to hover. So a finger went down, nothing changed, and the
 * only evidence anything had happened arrived when the next page painted a
 * second or two later. People tapped two and three times, which is not a
 * cosmetic complaint: on anything that submits, the second tap is a second
 * submission.
 *
 * The fix has two halves and both are needed.
 *
 * **The press** is `active:` styling on the row itself — instant, and gone the
 * moment the finger lifts.
 *
 * **The wait** is this. The finger lifts, the press styling ends, and the page
 * has not arrived yet; that gap is the part people were re-tapping into.
 * `useLinkStatus` reports the parent `<Link>`'s pending state, so the row can
 * hold a spinner for exactly as long as the navigation actually takes and not
 * a frame longer. A fixed timeout would either flash on a cached route or
 * still be spinning after a slow one.
 *
 * It must be rendered *inside* a `<Link>` — that is how the hook finds the
 * navigation it belongs to.
 */
export function NavPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();

  if (!pending) return null;

  return (
    <>
      <Loader2
        aria-hidden
        className={cn("size-3.5 shrink-0 animate-spin text-brand", className)}
      />
      {/* Announced once, for a reader who cannot see the spinner. */}
      <span role="status" className="sr-only">
        Loading
      </span>
    </>
  );
}

/**
 * The same signal, as a tint over the whole row.
 *
 * A spinner tucked at the end of a row is easy to miss on a bright screen
 * outdoors, which is where a lot of Medosha gets used. This paints the row it
 * sits in, using `:has()` from the row's own class rather than lifting the
 * pending state up into a parent that would have to re-render everything.
 */
export function NavPendingTint() {
  const { pending } = useLinkStatus();
  return pending ? <span aria-hidden data-nav-pending="" className="hidden" /> : null;
}
