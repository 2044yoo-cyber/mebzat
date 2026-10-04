"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Camera, ImageOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Empty, Field, inputClass, when } from "@/components/agenda/shared";
import { groupPhotosByDay, photoPlace } from "@/lib/agenda/records";
import { AGENDA_FILES_BUCKET, agendaFilePath } from "@/lib/agenda/files";
import type { SitePhoto } from "@/lib/data/agenda-site";
import { fileSitePhoto } from "@/app/(dashboard)/agenda/projects/[projectId]/site-actions";
import { createClient } from "@/lib/supabase/client";

/** What 0094's bucket accepts, restricted here to the ones that render. */
const ACCEPTED = "image/jpeg,image/png,image/webp,image/heic,image/heif";

/** 25 MB, the bucket's own limit. Checked here so the refusal is a sentence. */
const MAX_BYTES = 26214400;

/**
 * The site photo wall.
 *
 * Grouped by the day the photograph was taken, because a site photo library is
 * read as a diary rather than as a grid — "what did the third floor look like
 * on the twelfth" is the question it is opened to answer.
 *
 * Uploads go straight from the browser to storage. Routing an 8 MB phone
 * photograph through a server action means holding it in memory twice and a
 * body-size limit that refuses exactly the photographs worth keeping.
 */
export function PhotoWall({
  projectId,
  photos,
  urls,
}: {
  projectId: string;
  photos: SitePhoto[];
  /** Signed URLs by storage path. A path missing from it draws a placeholder. */
  urls: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [staged, setStaged] = useState<{ path: string; preview: string } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const days = groupPhotosByDay(photos);

  async function upload(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error("That photo is over 25 MB. Send a smaller one.");
      return;
    }

    setUploading(true);
    // The first path segment is the project id, because that is what the
    // storage policy in 0094 matches on. Built by the shared helper so the
    // uploader and the action that checks it cannot come to disagree.
    const path = agendaFilePath(projectId, "photos", file.name);

    const { error } = await createClient()
      .storage.from(AGENDA_FILES_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });

    setUploading(false);

    if (error) {
      toast.error(
        error.message.includes("row-level security") ||
          error.message.includes("Unauthorized")
          ? "You are not on this project."
          : "That photo did not upload. Try again.",
      );
      return;
    }

    setStaged({ path, preview: URL.createObjectURL(file) });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          Photos
          <span className="ml-1.5 font-normal text-muted-foreground">
            {photos.length}
          </span>
        </h2>
        <button
          type="button"
          disabled={uploading || pending}
          onClick={() => inputRef.current?.click()}
          className="flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Camera className="size-3.5" />
          )}
          Add a photo
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          // `capture` asks a phone for the camera rather than the gallery,
          // which is what somebody standing on the slab wants.
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
      </div>

      {staged && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await fileSitePhoto(
                projectId,
                staged.path,
                formData,
              );
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Filed");
              URL.revokeObjectURL(staged.preview);
              setStaged(null);
              router.refresh();
            })
          }
          className="space-y-3 rounded-2xl border p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob:
              URL from the file the browser is holding; there is nothing for
              the image optimiser to fetch. */}
          <img
            src={staged.preview}
            alt="The photo about to be filed"
            className="max-h-56 w-full rounded-xl object-cover"
          />

          <Field label="What this shows">
            <input
              name="caption"
              maxLength={300}
              className={inputClass}
              placeholder="Slab pour, grid C to E"
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

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="flex h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              File it
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                URL.revokeObjectURL(staged.preview);
                setStaged(null);
              }}
              className="h-9 rounded-xl border px-3.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Discard
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Discarding leaves the upload in the project&rsquo;s file store
            unlisted. Nothing in Agenda is deleted.
          </p>
        </form>
      )}

      {days.length === 0 ? (
        <Empty>No photographs have been filed for this project yet.</Empty>
      ) : (
        days.map((group) => (
          <section key={group.day} className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              {when(group.day)}
            </h3>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {group.photos.map((photo) => {
                const url = urls[photo.storagePath];
                const place = photoPlace(photo);
                return (
                  <li
                    key={photo.id}
                    className="overflow-hidden rounded-xl border"
                  >
                    <div className="relative aspect-4/3 bg-muted">
                      {url ? (
                        <Image
                          src={url}
                          alt={photo.caption ?? "Site photograph"}
                          fill
                          sizes="(max-width: 640px) 50vw, 25vw"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ImageOff className="size-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    {(photo.caption || place) && (
                      <div className="space-y-0.5 p-2">
                        {photo.caption && (
                          <p className="truncate text-xs">{photo.caption}</p>
                        )}
                        {place && (
                          <p className="truncate text-xs text-muted-foreground">
                            {place}
                          </p>
                        )}
                      </div>
                    )}
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
