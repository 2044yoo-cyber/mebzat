import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, Globe, Link2, Lock, Plus, Rotate3d } from "lucide-react";

import { SceneThumbnail } from "@/components/tour/scene-thumbnail";
import { listMyTours } from "@/lib/tour/queries";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My 360° tours" };

const VISIBILITY: Record<
  string,
  { label: string; className: string; icon: typeof Globe }
> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground", icon: Lock },
  published: { label: "Public", className: "bg-brand text-brand-foreground", icon: Globe },
  unlisted: { label: "Link only", className: "bg-muted text-muted-foreground", icon: Link2 },
  private: { label: "Private", className: "bg-muted text-muted-foreground", icon: Lock },
  archived: { label: "Archived", className: "bg-muted text-muted-foreground", icon: Lock },
};

export default async function ToursPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=%2Ftours");

  const tours = await listMyTours();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">My 360° tours</h1>
          <p className="text-sm text-muted-foreground">
            Walk a buyer through a property without them leaving the house.
          </p>
        </div>
        <Link
          href="/tours/new"
          className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground"
        >
          <Plus className="size-4" /> New tour
        </Link>
      </div>

      {tours.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <Rotate3d className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No tours yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            A 360° photo is one image, twice as wide as it is tall, taken with the
            panorama mode most phones already have.
          </p>
          <Link
            href="/tours/new"
            className="mt-4 inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Plus className="size-4" /> Make the first one
          </Link>
        </div>
      ) : (
        <ul className="space-y-5">
          {tours.map((tour) => {
            const badge = VISIBILITY[tour.visibility] ?? VISIBILITY.draft;
            const Icon = badge.icon;
            return (
              <li key={tour.id} className="overflow-hidden rounded-2xl border bg-card">
                {/* The picture first and large. A tour is a thing you look at,
                    and a list of names with grey squares beside them gives no
                    reason to open any of them. */}
                <Link href={`/tours/${tour.id}/edit`} className="group block">
                  <div className="relative aspect-[16/9] w-full bg-muted">
                    {tour.thumbnailUrl ? (
                      <SceneThumbnail
                        src={tour.thumbnailUrl}
                        pending={tour.thumbnailPending}
                        sizes="(max-width: 672px) 100vw, 640px"
                      />
                    ) : (
                      <span className="grid size-full place-items-center text-muted-foreground">
                        <Rotate3d className="size-8" />
                      </span>
                    )}

                    <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
                      <Rotate3d className="size-3.5" />
                      360°
                    </span>

                    <span
                      className={cn(
                        "absolute right-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur",
                        badge.className,
                      )}
                    >
                      <Icon className="size-3.5" />
                      {badge.label}
                    </span>

                    {tour.thumbnailPending && (
                      <span className="absolute bottom-3 left-3 rounded-full bg-amber-500/90 px-2.5 py-1 text-[11px] font-medium text-black">
                        In review
                      </span>
                    )}
                  </div>
                </Link>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4">
                  <Link
                    href={`/tours/${tour.id}/edit`}
                    className="min-w-0 flex-1 truncate text-base font-medium hover:underline"
                  >
                    {tour.title}
                  </Link>

                  <span className="text-sm text-muted-foreground">
                    {tour.sceneCount} {tour.sceneCount === 1 ? "room" : "rooms"}
                  </span>

                  {tour.viewCount > 0 && (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Eye className="size-3.5" />
                      {tour.viewCount}
                    </span>
                  )}

                  {tour.sharedToFeed && tour.visibility === "published" && (
                    <span className="text-xs text-muted-foreground">In the feed</span>
                  )}

                  <Link
                    href={`/tour/${tour.id}`}
                    className="rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    Open
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
