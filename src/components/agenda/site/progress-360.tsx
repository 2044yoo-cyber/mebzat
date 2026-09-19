"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Rotate3d } from "lucide-react";
import { toast } from "sonner";

import {
  Empty,
  Field,
  PanelHeader,
  inputClass,
  usePanel,
  when,
} from "@/components/agenda/shared";
import { PanoramaViewer } from "@/components/tour/panorama-viewer";
import { groupPhotosByDay, photoPlace } from "@/lib/agenda/records";
import type {
  FinishedPanorama,
  ProgressPanorama,
} from "@/lib/data/agenda-site";
import { pinPanorama } from "@/app/(dashboard)/agenda/projects/[projectId]/site-actions";
import { cn } from "@/lib/utils";

/**
 * 360 progress: the same corner of the site, week after week.
 *
 * Nothing here captures or stitches anything. 0081 to 0083 already built that
 * — capture with orientation guidance, server-side stitching, the viewer —
 * and this points at a finished job rather than starting a second pipeline.
 * A re-stitch that fixes a seam therefore fixes the site record too.
 *
 * Grouped by day like the photo wall, for the same reason: it is read as a
 * diary, and "what did the third floor look like in week 14" is the question.
 */
export function Progress360({
  projectId,
  panoramas,
  available,
}: {
  projectId: string;
  panoramas: ProgressPanorama[];
  /** The viewer's own finished panoramas, to pin one from. */
  available: FinishedPanorama[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<ProgressPanorama | null>(null);
  const [chosen, setChosen] = useState<string>("");

  const days = groupPhotosByDay(panoramas);

  return (
    <div className="space-y-4">
      <PanelHeader
        title="360 progress"
        count={panoramas.length}
        action="Pin a panorama"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {panel.open &&
        (available.length === 0 ? (
          <Empty>
            You have no finished 360 photos yet. Capture one from a tour or a
            listing, and it will appear here to pin.
          </Empty>
        ) : (
          <form
            action={(formData) =>
              start(async () => {
                if (!chosen) {
                  toast.error("Choose which panorama to pin.");
                  return;
                }
                const result = await pinPanorama(projectId, chosen, formData);
                if (result.error) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Pinned");
                setChosen("");
                panel.setOpen(false);
                router.refresh();
              })
            }
            className="space-y-3 rounded-2xl border p-4"
          >
            <p className="text-xs text-muted-foreground">
              The image stays where it is. This records that it shows a place on
              this project on a given day.
            </p>

            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {available.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => setChosen(candidate.id)}
                    aria-pressed={chosen === candidate.id}
                    className={cn(
                      "w-full overflow-hidden rounded-xl border text-left transition-colors",
                      chosen === candidate.id
                        ? "border-brand ring-2 ring-brand/40"
                        : "hover:bg-muted",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element --
                        an equirectangular panorama served by the tour
                        pipeline, shown here at thumbnail size; the optimiser
                        would fetch a 4096-wide image to make a 160px tile. */}
                    <img
                      src={candidate.panoramaUrl}
                      alt=""
                      className="aspect-2/1 w-full object-cover"
                    />
                    <span className="block p-1.5 text-xs text-muted-foreground">
                      {when(candidate.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <Field label="What this shows">
              <input
                name="caption"
                maxLength={300}
                className={inputClass}
                placeholder="Third floor, looking east"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Building">
                <input name="building" maxLength={80} className={inputClass} />
              </Field>
              <Field label="Floor">
                <input name="floor" maxLength={80} className={inputClass} />
              </Field>
              <Field label="Area">
                <input name="area" maxLength={80} className={inputClass} />
              </Field>
            </div>

            <Field label="Taken on">
              <input
                type="date"
                name="takenAt"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className={inputClass}
              />
            </Field>

            <button
              type="submit"
              disabled={pending}
              className="flex h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Pin it
            </button>
          </form>
        ))}

      {open?.panoramaUrl && (
        <div className="space-y-2 rounded-2xl border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-medium">
              {open.caption ?? photoPlace(open) ?? "Panorama"}
            </p>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="h-8 shrink-0 rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted"
            >
              Close
            </button>
          </div>
          <PanoramaViewer
            src={open.panoramaUrl}
            width={open.width}
            height={open.height}
            className="aspect-16/9 w-full overflow-hidden rounded-xl"
          />
        </div>
      )}

      {days.length === 0 ? (
        <Empty>
          No 360 photos have been pinned to this project yet.
        </Empty>
      ) : (
        days.map((group) => (
          <section key={group.day} className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              {when(group.day)}
            </h3>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {group.photos.map((panorama) => {
                const place = photoPlace(panorama);
                return (
                  <li key={panorama.id} className="overflow-hidden rounded-xl border">
                    <button
                      type="button"
                      disabled={!panorama.panoramaUrl}
                      onClick={() => setOpen(panorama)}
                      className="block w-full text-left disabled:opacity-60"
                    >
                      <div className="relative flex aspect-2/1 items-center justify-center bg-muted">
                        {panorama.panoramaUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element --
                             as above: a 4096-wide equirectangular image shown
                             as a tile. */
                          <img
                            src={panorama.panoramaUrl}
                            alt={panorama.caption ?? "Progress panorama"}
                            className="size-full object-cover"
                          />
                        ) : (
                          <Rotate3d className="size-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="space-y-0.5 p-2">
                        <p className="truncate text-xs">
                          {panorama.caption ??
                            (panorama.panoramaUrl ? "Panorama" : "Still stitching")}
                        </p>
                        {place && (
                          <p className="truncate text-xs text-muted-foreground">
                            {place}
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
