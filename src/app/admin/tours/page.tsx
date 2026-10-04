import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Rotate3d } from "lucide-react";

import { TourRow } from "@/components/admin/tour-row";
import { listToursForAdmin } from "@/lib/admin/tours";
import { canAdmin } from "@/lib/auth/admin-areas";
import type { TourVisibility } from "@/types/database.types";

export const metadata: Metadata = { title: "3D & 360° — control room" };
export const dynamic = "force-dynamic";

/** The visibilities the tours table already uses. */
const FILTERS: { id: TourVisibility | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "published", label: "Published" },
  { id: "unlisted", label: "Link only" },
  { id: "draft", label: "Draft" },
  { id: "private", label: "Private" },
  { id: "archived", label: "Archived" },
];

export default async function AdminToursPage(props: {
  searchParams: Promise<{ visibility?: string }>;
}) {
  // The layout hides the menu entry; this is the gate. A page that trusts
  // the menu is a page anyone can open by typing the address.
  if (!(await canAdmin("tours"))) notFound();

  const { visibility } = await props.searchParams;
  const filter = FILTERS.find((one) => one.id === visibility)?.id;

  const tours = await listToursForAdmin(
    filter && filter !== "all" ? filter : undefined,
  );
  if (!tours) notFound();

  const waiting = tours.reduce((sum, tour) => sum + tour.awaitingReview, 0);

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1">
        {FILTERS.map((one) => (
          <Link
            key={one.id}
            href={one.id === "all" ? "/admin/tours" : `/admin/tours?visibility=${one.id}`}
            className={
              (filter ?? "all") === one.id
                ? "rounded-full bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground"
                : "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
            }
          >
            {one.label}
          </Link>
        ))}
      </nav>

      {waiting > 0 && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
          {waiting} panorama{waiting === 1 ? "" : "s"} across these tours are
          still in quarantine and visible only to their owners. They clear from
          the moderation queue.
        </p>
      )}

      {tours.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <Rotate3d className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No tours here</p>
          <p className="mt-1 text-sm text-muted-foreground">
            360° tours appear here as people build them.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {tours.map((tour) => (
            <TourRow key={tour.id} tour={tour} />
          ))}
        </ul>
      )}
    </div>
  );
}
