import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Eye } from "lucide-react";

import { TourPlayer } from "@/components/tour/tour-player";
import { getTour } from "@/lib/tour/queries";

/**
 * A tour, as a visitor sees it.
 *
 * There is no visibility check here. `getTour` returns null for a draft
 * somebody else owns, for an archived tour and for an id that never existed
 * alike — the row policies decide, and telling those three apart is exactly
 * what a scraper wants. All of them are a 404.
 */

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const tour = await getTour(id);
  if (!tour) return { title: "Tour not found" };

  return {
    title: `${tour.title} — 360° tour`,
    description:
      tour.description?.slice(0, 160) ??
      `Walk through ${tour.title} in 360°, room by room.`,
    openGraph: {
      title: tour.title,
      description: tour.description?.slice(0, 160) ?? undefined,
      images: tour.thumbnailUrl ? [tour.thumbnailUrl] : undefined,
      type: "article",
    },
    // An unlisted tour is reachable by anyone holding the link, which is not
    // the same as wanting it in a search result.
    robots: tour.visibility === "published" ? undefined : { index: false, follow: false },
  };
}

export default async function TourPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const tour = await getTour(id);
  if (!tour) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:py-6">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/tours"
          className="flex size-10 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Back to tours"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold sm:text-xl">{tour.title}</h1>
          <p className="text-xs text-muted-foreground">
            {tour.scenes.length} {tour.scenes.length === 1 ? "scene" : "scenes"}
            {tour.visibility !== "published" && ` · ${tour.visibility}`}
          </p>
        </div>
      </div>

      {/* Tall on a phone, wider on a desktop. A 360° view needs height more
          than a photograph does — a letterbox of a room is most of a wall. */}
      <TourPlayer
        scenes={tour.scenes}
        className="h-[70vh] min-h-[380px] w-full overflow-hidden rounded-2xl border sm:h-[65vh]"
      />

      {tour.description && (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {tour.description}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        {tour.viewCount > 0 && (
          <span className="flex items-center gap-1.5">
            <Eye className="size-4" />
            {tour.viewCount.toLocaleString()} views
          </span>
        )}
        {tour.propertyId && (
          <Link
            href={`/property/${tour.propertyId}`}
            className="flex items-center gap-1.5 text-foreground underline-offset-4 hover:underline"
          >
            <Building2 className="size-4" />
            See the listing
          </Link>
        )}
        {tour.projectId && (
          <Link
            href={`/projects/${tour.projectId}`}
            className="flex items-center gap-1.5 text-foreground underline-offset-4 hover:underline"
          >
            <Building2 className="size-4" />
            See the project
          </Link>
        )}
      </div>
    </div>
  );
}
