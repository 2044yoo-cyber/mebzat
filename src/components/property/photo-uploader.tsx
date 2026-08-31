"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

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

export function PhotoUploader({
  photos,
  onChange,
  onContinue,
}: {
  photos: ListingPhoto[];
  onChange: (photos: ListingPhoto[]) => void;
  onContinue?: () => void;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
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

  return (
    <div className="space-y-4">
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
