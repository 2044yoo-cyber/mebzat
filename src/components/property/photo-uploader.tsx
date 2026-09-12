"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ImagePlus,
  Loader2,
  Rotate3d,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { PanoramaCapture } from "@/components/tour/panorama-capture";
import { PanoramaViewer } from "@/components/tour/panorama-viewer";

import {
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  PHOTO_ACCEPT,
  qualityLabel,
  type PhotoIssue,
} from "@/lib/property/listing";
import { preparePhoto, savedPercent, PHOTO_FORMAT } from "@/lib/property/photos";
import { cn } from "@/lib/utils";

/**
 * Photos, before anything else.
 *
 * The listing form used to open on the location, which is the part a seller
 * has to look up, think about and get right — so that is where most of them
 * stopped. Photos are the part they already have in their hand, and starting
 * there means the listing exists before the tedious bit begins.
 *
 * Every photo is resized, compressed and inspected in the browser. An eight
 * megabyte phone photo becomes about four hundred kilobytes, and "this one is
 * too dark" arrives while the seller is still standing in the room — which is
 * the only moment that advice is any use.
 */

export type ListingPhoto = {
  id: string;
  /** Object URL for the preview. Revoked on removal. */
  preview: string;
  blob: Blob;
  thumbnail: Blob;
  blurDataUrl: string;
  width: number;
  height: number;
  score: number;
  issues: PhotoIssue[];
  originalBytes: number;
  bytes: number;
  name: string;
};

type Pending = { id: string; name: string };

/**
 * A finished 360 panorama attached to this listing.
 *
 * Not a `ListingPhoto`: by the time one of these exists it is already stitched,
 * moderated and in the public bucket, so it has a URL and no blob, and it must
 * not be run through `preparePhoto` — resizing an equirectangular image to
 * 2000px wide would destroy the one property the viewer depends on.
 */
export type ListingPanorama = {
  id: string;
  url: string;
  width: number;
  height: number;
};

/**
 * How many 360 photos one listing may carry.
 *
 * Section 22 asks that a listing be able to hold several, so that rooms can be
 * linked up later. It does not ask for thirty: each one is a minute of
 * standing in a room turning around, and a listing with a panorama of every
 * cupboard is a listing nobody scrolls to the end of.
 */
export const MAX_PANORAMAS = 6;

export function PhotoUploader({
  photos,
  onChange,
  onContinue,
  panoramas,
  onPanoramas,
}: {
  photos: ListingPhoto[];
  onChange: (photos: ListingPhoto[]) => void;
  onContinue?: () => void;
  /**
   * The listing's 360 photos. Both of these together are what turns the plain
   * uploader into the two-way choice; passing neither leaves it exactly as it
   * was, which is what the places that have no listing to attach a panorama to
   * still want.
   */
  panoramas?: ListingPanorama[];
  onPanoramas?: (panoramas: ListingPanorama[]) => void;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef(photos);

  useEffect(() => {
    photosRef.current = photos;
  });

  // Object URLs outlive the component unless revoked, and a seller who adds
  // thirty photos and navigates away would otherwise leak all thirty.
  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.preview);
    };
  }, []);

  const add = useCallback(
    async (files: File[]) => {
      const room = MAX_PHOTOS - photosRef.current.length;
      if (room <= 0) {
        toast.error(`That is the limit — ${MAX_PHOTOS} photos.`);
        return;
      }

      const accepted = files.slice(0, room);
      if (files.length > room) {
        toast.warning(`Only the first ${room} were added. The limit is ${MAX_PHOTOS}.`);
      }

      const queue: Pending[] = accepted.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
      }));
      setPending((current) => [...current, ...queue]);

      for (const [index, file] of accepted.entries()) {
        const entry = queue[index];
        if (!entry) continue;

        if (file.size > MAX_PHOTO_BYTES) {
          toast.error(`${file.name} is over ${MAX_PHOTO_BYTES / 1024 / 1024}MB.`);
          setPending((current) => current.filter((item) => item.id !== entry.id));
          continue;
        }

        try {
          const prepared = await preparePhoto(file);
          const photo: ListingPhoto = {
            id: entry.id,
            preview: URL.createObjectURL(prepared.blob),
            name: file.name,
            ...prepared,
          };
          // Read through the ref: several files finish out of order, and
          // closing over the prop would drop all but the last.
          onChange([...photosRef.current, photo]);
          photosRef.current = [...photosRef.current, photo];
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : `${file.name} could not be read.`,
          );
        } finally {
          setPending((current) => current.filter((item) => item.id !== entry.id));
        }
      }
    },
    [onChange],
  );

  function remove(id: string) {
    const photo = photos.find((entry) => entry.id === id);
    if (photo) URL.revokeObjectURL(photo.preview);
    onChange(photos.filter((entry) => entry.id !== id));
  }

  function makeCover(id: string) {
    const photo = photos.find((entry) => entry.id === id);
    if (!photo) return;
    onChange([photo, ...photos.filter((entry) => entry.id !== id)]);
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...photos];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    onChange(next);
  }

  const weak = photos.filter((photo) => photo.score < 60).length;
  const saved = photos.reduce(
    (total, photo) => total + (photo.originalBytes - photo.bytes),
    0,
  );

  const room = onPanoramas
    ? { list: panoramas ?? [], set: onPanoramas }
    : null;

  // Capture takes the whole field while it is running. It is a camera with
  // instructions over it; a drop zone underneath would be one more thing to
  // hit by accident while turning around holding a phone.
  if (room && capturing) {
    return (
      <PanoramaCapture
        cancelLabel="Add photos instead"
        onCancel={() => setCapturing(false)}
        onSaved={(panorama) => {
          room.set([...room.list, { id: crypto.randomUUID(), ...panorama }]);
          setCapturing(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* ---- Photos, or a 360 of the room ------------------------------ */}
      {room && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors hover:border-brand hover:bg-brand/5"
          >
            <ImagePlus className="size-4" aria-hidden /> Add Photos
          </button>
          <button
            type="button"
            onClick={() => setCapturing(true)}
            disabled={room.list.length >= MAX_PANORAMAS}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors hover:border-brand hover:bg-brand/5 disabled:opacity-50"
          >
            <Rotate3d className="size-4" aria-hidden /> Create 360°
          </button>
        </div>
      )}

      {/* ---- The drop zone --------------------------------------------- */}
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const files = [...(event.dataTransfer.files ?? [])];
          if (files.length > 0) void add(files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed p-10 text-center transition-colors",
          dragging ? "border-brand bg-brand/5" : "hover:border-brand hover:bg-brand/5",
        )}
      >
        <Upload className="size-7 text-muted-foreground" />
        <span className="text-base font-medium">
          Drop your photos here, or choose files
        </span>
        <span className="max-w-md text-sm text-muted-foreground">
          JPG, PNG, WEBP and iPhone HEIC. They are resized and compressed on
          this device before anything is uploaded, so this works on mobile data.
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={PHOTO_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            if (files.length > 0) void add(files);
            event.target.value = "";
          }}
        />
      </label>

      {/* ---- Progress --------------------------------------------------- */}
      {pending.length > 0 && (
        <ul className="space-y-1.5">
          {pending.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-2 rounded-xl border p-2.5 text-sm"
            >
              <Loader2 className="size-4 shrink-0 animate-spin text-brand" />
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                preparing…
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* ---- The grid --------------------------------------------------- */}
      {photos.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-medium">
              {photos.length} {photos.length === 1 ? "photo" : "photos"}
            </span>
            <span className="text-muted-foreground">
              First one is the cover. Drag to reorder.
            </span>
            {saved > 0 && (
              <span className="text-muted-foreground">
                {(saved / 1024 / 1024).toFixed(1)}MB saved before upload
              </span>
            )}
          </div>

          {weak > 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                {weak === 1
                  ? "One photo could be better."
                  : `${weak} photos could be better.`}{" "}
                You can publish anyway — a weak photo of the right property
                still beats none.
              </span>
            </p>
          )}

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo, index) => {
              const quality = qualityLabel(photo.score);
              return (
                <li
                  key={photo.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragIndex !== null) reorder(dragIndex, index);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={cn(
                    "group relative overflow-hidden rounded-2xl border bg-muted",
                    index === 0 && "border-brand ring-1 ring-brand/30",
                    dragIndex === index && "opacity-40",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.preview}
                    alt={photo.name}
                    className="aspect-[4/3] w-full cursor-grab object-cover active:cursor-grabbing"
                    loading="lazy"
                  />

                  {index === 0 && (
                    <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-medium text-brand-foreground">
                      <Star className="size-2.5" />
                      Cover
                    </span>
                  )}

                  <span
                    className={cn(
                      "absolute top-2 right-2 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur",
                      quality.tone,
                    )}
                  >
                    {quality.label}
                  </span>

                  <div className="absolute inset-x-2 bottom-2 flex gap-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    {index !== 0 && (
                      <button
                        type="button"
                        onClick={() => makeCover(photo.id)}
                        className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg bg-background/90 text-[11px] font-medium backdrop-blur hover:bg-background"
                      >
                        <Star className="size-3" />
                        Cover
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(photo.id)}
                      aria-label={`Remove ${photo.name}`}
                      className="flex size-7 items-center justify-center rounded-lg bg-background/90 backdrop-blur hover:bg-background"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>

                  {photo.issues.length > 0 && (
                    <p className="border-t bg-background/95 p-1.5 text-[11px] text-muted-foreground">
                      {photo.issues[0]?.message}
                    </p>
                  )}
                </li>
              );
            })}

            <li>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
              >
                <ImagePlus className="size-5" />
                Add more
              </button>
            </li>
          </ul>

          <p className="text-xs text-muted-foreground">
            Stored as {PHOTO_FORMAT.extension.toUpperCase()} at up to 2000px.
          </p>

          {onContinue && (
            <button
              type="button"
              onClick={onContinue}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
            >
              <Check className="size-4" />
              Continue with {photos.length}{" "}
              {photos.length === 1 ? "photo" : "photos"}
            </button>
          )}
        </>
      )}

      {/* ---- The 360 photos, kept apart from the ordinary ones ----------
          Section 14: a listing may hold both, and they are not to be mixed
          without labels. A panorama in the photo grid would be picked as the
          cover and would look like a bent, smeared photograph in every card
          it appeared in — the two kinds behave differently enough that one
          grid could not describe both honestly. */}
      {room && room.list.length > 0 && (
        <section className="space-y-2 rounded-2xl border p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <Rotate3d className="size-4" aria-hidden />
              360° photos
            </h3>
            <span className="text-xs text-muted-foreground">
              {room.list.length} of {MAX_PANORAMAS}
            </span>
          </div>

          <ul className="space-y-2">
            {room.list.map((panorama, index) => (
              <li key={panorama.id} className="space-y-1.5">
                <div className="relative">
                  <PanoramaViewer
                    src={panorama.url}
                    width={panorama.width}
                    height={panorama.height}
                    className="aspect-[2/1] w-full overflow-hidden rounded-xl border"
                  />
                  <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-[0.6875rem] font-medium backdrop-blur">
                    360°
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Room {index + 1} — drag to look around
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      room.set(room.list.filter((item) => item.id !== panorama.id))
                    }
                    className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden /> Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Saved bytes as a sentence, for the review step. */
export function compressionSummary(photos: ListingPhoto[]): string | null {
  if (photos.length === 0) return null;
  const original = photos.reduce((total, photo) => total + photo.originalBytes, 0);
  const now = photos.reduce((total, photo) => total + photo.bytes, 0);
  const percent = savedPercent(original, now);
  if (percent < 5) return null;
  return `${percent}% smaller than the originals (${(now / 1024 / 1024).toFixed(1)}MB total).`;
}
