"use client";

import Image from "next/image";
import Link from "next/link";
import { useTransition } from "react";
import { Clock, Eye, EyeOff, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { archiveTour, restoreTour } from "@/app/admin/tours/actions";
import { PROJECT_PLACEHOLDER } from "@/lib/constants/placeholders";
import type { AdminTour } from "@/lib/admin/tours";

/**
 * One tour.
 *
 * The count of scenes still waiting on review is shown separately from the
 * total, because they are the reason a visitor opens a published tour and
 * finds a room missing. A tour whose every scene is in quarantine reads here
 * as "0 of 4 ready" rather than as four rooms that are not there.
 */
export function TourRow({ tour }: { tour: AdminTour }) {
  const [busy, start] = useTransition();
  const archived = tour.visibility === "archived";
  const ready = tour.sceneCount - tour.awaitingReview;

  function act(action: () => Promise<{ ok: boolean; message: string }>) {
    start(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  return (
    <li className="flex items-center gap-3 rounded-xl border p-3">
      <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
        <Image
          src={tour.thumbnailUrl || PROJECT_PLACEHOLDER}
          alt=""
          fill
          sizes="64px"
          className="object-cover"
        />
      </div>

      <div className="min-w-0 flex-1">
        <Link
          href={`/tour/${tour.id}`}
          className="block truncate text-sm font-medium hover:underline"
        >
          {tour.title}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {[
            tour.ownerName,
            `${ready} of ${tour.sceneCount} ${tour.sceneCount === 1 ? "room" : "rooms"} ready`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {tour.awaitingReview > 0 && (
        <span className="hidden shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 sm:flex dark:text-amber-400">
          <Clock className="size-3" />
          {tour.awaitingReview} in review
        </span>
      )}

      <span className="hidden shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground sm:flex">
        <Eye className="size-3.5" />
        {tour.viewCount}
      </span>

      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
        {tour.visibility}
      </span>

      {archived ? (
        <button
          type="button"
          onClick={() => act(() => restoreTour(tour.id))}
          disabled={busy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          <RotateCcw className="size-3.5" />
          Restore
        </button>
      ) : (
        <button
          type="button"
          onClick={() => act(() => archiveTour(tour.id))}
          disabled={busy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          <EyeOff className="size-3.5" />
          Archive
        </button>
      )}
    </li>
  );
}
