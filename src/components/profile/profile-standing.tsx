import { ShieldCheck, Star } from "lucide-react";

import { Stars } from "@/components/reviews/review-card";
import type { ProfileRating } from "@/lib/data/professional-profile";

/**
 * What the reviews add up to.
 *
 * Two numbers rather than one, because they answer different questions. The
 * average says how the work was received; the count of *verified* reviews —
 * those attached to a booking or a hire — says how much of that is backed by
 * a transaction that happened. A five-star average from reviews anybody could
 * have written is the number a scammer manufactures, so it is never shown on
 * its own.
 *
 * Nothing is invented when there are no reviews. The brief's rule against
 * fabricated history applies to a rating most of all: a new profile shows that
 * it is new.
 */
export function ProfileStanding({ rating }: { rating: ProfileRating }) {
  if (rating.total === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <Star className="size-4" /> No reviews yet
        </p>
        <p className="mt-1">
          Ratings appear here once clients review the work. Nothing is shown
          until somebody writes one.
        </p>
      </div>
    );
  }

  const most = Math.max(...rating.histogram, 1);

  return (
    <div className="space-y-4 rounded-2xl border p-5">
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-semibold tabular-nums">
          {rating.average.toFixed(1)}
        </span>
        <div className="space-y-1">
          <Stars rating={rating.average} />
          <p className="text-xs text-muted-foreground">
            {rating.total} {rating.total === 1 ? "review" : "reviews"}
            {rating.services > 0 && (
              <>
                {" "}
                across {rating.services}{" "}
                {rating.services === 1 ? "service" : "services"}
              </>
            )}
          </p>
        </div>
      </div>

      {rating.verified > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-500" />
          {rating.verified} backed by a booking or a hire
        </p>
      )}

      <ul className="space-y-1">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = rating.histogram[star - 1] ?? 0;
          return (
            <li key={star} className="flex items-center gap-2 text-xs">
              <span className="w-3 text-right tabular-nums text-muted-foreground">
                {star}
              </span>
              <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />
              <span
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`${count} ${count === 1 ? "review" : "reviews"} at ${star} stars`}
              >
                <span
                  className="block h-full rounded-full bg-amber-400"
                  style={{ width: `${(count / most) * 100}%` }}
                />
              </span>
              <span className="w-6 text-right tabular-nums text-muted-foreground">
                {count}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
