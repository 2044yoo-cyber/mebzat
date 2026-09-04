import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, Plus, Rotate3d } from "lucide-react";

import { listMyTours } from "@/lib/tour/queries";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My 360° tours" };

const VISIBILITY: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  published: { label: "Published", className: "bg-brand text-brand-foreground" },
  unlisted: { label: "Link only", className: "bg-muted text-muted-foreground" },
  private: { label: "Private", className: "bg-muted text-muted-foreground" },
  archived: { label: "Archived", className: "bg-muted text-muted-foreground" },
};

export default async function ToursPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=%2Ftours");

  const tours = await listMyTours();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
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
        <ul className="grid gap-3 sm:grid-cols-2">
          {tours.map((tour) => {
            const badge = VISIBILITY[tour.visibility] ?? VISIBILITY.draft;
            return (
              <li key={tour.id}>
                <Link
                  href={`/tours/${tour.id}/edit`}
                  className="group flex gap-3 rounded-2xl border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {tour.thumbnailUrl && (
                      <Image
                        src={tour.thumbnailUrl}
                        alt=""
                        fill
                        sizes="128px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{tour.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {tour.sceneCount} {tour.sceneCount === 1 ? "scene" : "scenes"}
                      {tour.viewCount > 0 && (
                        <>
                          {" · "}
                          <Eye className="inline size-3" /> {tour.viewCount}
                        </>
                      )}
                    </p>
                    <span
                      className={cn(
                        "mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium",
                        badge.className,
                      )}
                    >
                      {badge.label}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
