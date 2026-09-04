"use client";

import { useRef, useState } from "react";
import { GripVertical, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  moderateQuarantinedImage,
  signQuarantinePreview,
} from "@/app/moderation/upload-actions";
import { SceneThumbnail } from "@/components/tour/scene-thumbnail";
import { createClient } from "@/lib/supabase/client";
import type { PanoramaReading } from "@/lib/tour/panorama-image";
import {
  MAX_PANORAMA_WIDTH,
  PANORAMA_KIND_LABEL,
  PANORAMA_TYPES,
  readPanorama,
  sceneName,
  type PanoramaKind,
} from "@/lib/tour/panorama-image";

/**
 * Adding 360° photos to a tour.
 *
 * Same three-step path as every other upload in the app — quarantine, check,
 * publish — because the guidelines do not change because an image is spherical.
 * The file lands in `moderation-quarantine`, which is private and folder-scoped
 * to the uploader, and only reaches the public `panoramas` bucket once a
 * verdict of `safe` comes back.
 *
 * What is specific to 360° happens before any of that: an image that is not
 * equirectangular is refused in the browser, with a message saying what to do,
 * rather than uploaded and then displayed as a smear.
 */

export type DraftScene = {
  /** Local only, until the tour is saved. */
  key: string;
  title: string;
  /**
   * Where the image is. Either a published URL in the `panoramas` bucket, or —
   * while it waits on review — a signed link into quarantine that only its
   * uploader can open. `pending` says which, because a signed URL expires and
   * must never be stored as if it were permanent.
   */
  panoramaUrl: string;
  width: number;
  height: number;
  /** Set while the panorama is waiting to be reviewed. */
  pending?: boolean;
  /** The quarantine path, kept so the saved scene can point at the file. */
  quarantinePath?: string;
  /** The moderation record, so approval knows which scene to publish into. */
  moderationItemId?: string;
  /** What the proportions say this is. Shown beside the room, not enforced. */
  kind?: PanoramaKind;
  /** "1.78:1", as read off the file. */
  ratioLabel?: string;
};

/** The `panoramas` bucket's limit. */
const MAX_SIZE = 25 * 1024 * 1024;
const MAX_SCENES = 40;

export function PanoramaInput({
  userId,
  scenes,
  onChange,
}: {
  userId: string;
  scenes: DraftScene[];
  onChange: (scenes: DraftScene[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  // An image whose proportions are closer to a photograph than a panorama is
  // put to the person rather than refused. Held here with the promise that the
  // upload loop is waiting on, so the answer resumes it.
  const [asking, setAsking] = useState<{
    name: string;
    note: string;
    label: string;
    decide: (useIt: boolean) => void;
  } | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    if (scenes.length + files.length > MAX_SCENES) {
      toast.error(`A tour can hold up to ${MAX_SCENES} scenes`);
      return;
    }

    const supabase = createClient();
    const added: DraftScene[] = [];
    let held = 0;
    let refused = 0;

    for (const [index, file] of files.entries()) {
      setBusy(`${index + 1} of ${files.length}`);

      if (!(PANORAMA_TYPES as readonly string[]).includes(file.type)) {
        toast.error(`${file.name} is not a JPEG or WebP.`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        toast.error(`${file.name} is over 25MB.`);
        continue;
      }

      const prepared = await prepare(file);
      if ("reason" in prepared) {
        toast.error(prepared.reason);
        continue;
      }

      if (prepared.reading.needsConfirmation) {
        const useIt = await new Promise<boolean>((resolve) =>
          setAsking({
            name: file.name,
            note: prepared.reading.note ?? "",
            label: prepared.reading.label,
            decide: (answer) => {
              setAsking(null);
              resolve(answer);
            },
          }),
        );
        if (!useIt) continue;
      }

      const extension = prepared.blob.type === "image/webp" ? "webp" : "jpg";
      // Folder-scoped to auth.uid(), so nothing here is fetchable by URL
      // before it has been checked.
      const path = `${userId}/${crypto.randomUUID()}.${extension}`;

      const upload = await supabase.storage
        .from("moderation-quarantine")
        .upload(path, prepared.blob, { contentType: prepared.blob.type });

      if (upload.error) {
        toast.error(upload.error.message);
        continue;
      }

      const verdict = await moderateQuarantinedImage({
        quarantinePath: path,
        contentType: "panorama",
        publicBucket: "panoramas",
      });

      if (verdict.status === "blocked") {
        refused += 1;
        continue;
      }

      // A first guess at the name from the file, which is usually "living
      // room.jpg" and occasionally "R0010234.JPG". Either way it is editable.
      const title = sceneName(file.name, scenes.length + added.length);

      if (verdict.status === "safe" && verdict.publicUrl) {
        added.push({
          key: crypto.randomUUID(),
          title,
          panoramaUrl: verdict.publicUrl,
          width: prepared.width,
          height: prepared.height,
          kind: prepared.reading.kind,
          ratioLabel: prepared.reading.label,
        });
        continue;
      }

      // Waiting on review. The room stays in the tour and the person carries
      // on building it — the alternative was an empty list and a toast, which
      // looks exactly like a failed upload. The file stays private; this is a
      // signed link only its uploader can open.
      if (prepared.reading.note && prepared.reading.kind === "wide") {
        toast.info(prepared.reading.note);
      }

      held += 1;
      const preview = await signQuarantinePreview(path);
      if (!preview) {
        toast.error(`${file.name} was uploaded but cannot be shown yet.`);
        continue;
      }

      added.push({
        key: crypto.randomUUID(),
        title,
        panoramaUrl: preview,
        width: prepared.width,
        height: prepared.height,
        pending: true,
        quarantinePath: path,
        moderationItemId: verdict.itemId,
        kind: prepared.reading.kind,
        ratioLabel: prepared.reading.label,
      });
    }

    setBusy(null);
    if (added.length > 0) onChange([...scenes, ...added]);

    if (refused > 0) {
      toast.error(
        refused === 1
          ? "One panorama cannot be published because it violates Medosha's content guidelines."
          : `${refused} panoramas cannot be published because they violate Medosha's content guidelines.`,
      );
    }
    if (held > 0) {
      toast.info(
        held === 1
          ? "One panorama is being reviewed. It is in your tour — visitors will see it once it is cleared."
          : `${held} panoramas are being reviewed. They are in your tour — visitors will see them once they are cleared.`,
      );
    }
  }

  function rename(key: string, title: string) {
    onChange(scenes.map((scene) => (scene.key === key ? { ...scene, title } : scene)));
  }

  function remove(key: string) {
    onChange(scenes.filter((scene) => scene.key !== key));
  }

  function moveTo(from: number, to: number) {
    if (from === to) return;
    const next = [...scenes];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {scenes.map((scene, index) => (
        <div
          key={scene.key}
          draggable
          onDragStart={() => setDragging(index)}
          onDragEnd={() => setDragging(null)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (dragging !== null) moveTo(dragging, index);
            setDragging(null);
          }}
          className="flex items-center gap-3 rounded-xl border bg-card p-2"
        >
          <span className="cursor-grab text-muted-foreground" aria-hidden>
            <GripVertical className="size-4" />
          </span>

          <div className="relative h-14 w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
            <SceneThumbnail
              src={scene.panoramaUrl}
              pending={scene.pending}
              sizes="112px"
            />
          </div>

          {scene.ratioLabel && (
            <span
              className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground"
              title={
                scene.kind
                  ? `${PANORAMA_KIND_LABEL[scene.kind]} — a full 360° photo is 2:1`
                  : undefined
              }
            >
              {scene.ratioLabel}
            </span>
          )}

          {scene.pending && (
            <span
              className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
              title="Only you can see this room until it has been reviewed"
            >
              In review
            </span>
          )}

          <label className="min-w-0 flex-1">
            <span className="sr-only">Name of scene {index + 1}</span>
            <input
              value={scene.title}
              onChange={(event) => rename(scene.key, event.target.value)}
              placeholder="Living room"
              maxLength={80}
              className="w-full rounded-lg border-0 bg-transparent px-1 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </label>

          {/* The keyboard route to what dragging does with a mouse. */}
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => moveTo(index, index - 1)}
              disabled={index === 0}
              aria-label={`Move ${scene.title || `scene ${index + 1}`} earlier`}
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveTo(index, index + 1)}
              disabled={index === scenes.length - 1}
              aria-label={`Move ${scene.title || `scene ${index + 1}`} later`}
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => remove(scene.key)}
              aria-label={`Remove ${scene.title || `scene ${index + 1}`}`}
              className="flex size-9 items-center justify-center rounded-lg text-destructive hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy !== null || scenes.length >= MAX_SCENES}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-sm text-muted-foreground transition-colors hover:border-brand hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
        {busy
          ? `Uploading ${busy}…`
          : scenes.length === 0
            ? "Add a 360° photo"
            : "Add another scene"}
        <span className="text-xs">
          JPEG or WebP, twice as wide as it is tall, up to 25MB
        </span>
      </button>

      {asking && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border bg-background p-5 shadow-lg">
            <p className="text-sm font-medium">{asking.name}</p>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              Panorama ratio: {asking.label} · Recommended for full 360°: 2.00:1
            </p>
            <p className="mt-3 text-sm text-muted-foreground">{asking.note}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => asking.decide(true)}
                className="flex-1 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground"
              >
                Use anyway
              </button>
              <button
                type="button"
                onClick={() => asking.decide(false)}
                className="rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                Choose another
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}

/**
 * Decode the image, check it is a panorama, and shrink it if it is larger than
 * a phone's GPU will take.
 *
 * The bitmap is closed on every path. They hold decoded pixel data — a 12,000
 * pixel panorama is around 280MB of it — and a batch of twenty that were only
 * closed on success would exhaust a phone long before the uploads finished.
 */
async function prepare(
  file: File,
): Promise<
  | { blob: Blob; width: number; height: number; reading: PanoramaReading }
  | { reason: string }
> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { reason: `${file.name} could not be read as an image.` };
  }

  try {
    const reading = readPanorama(bitmap.width, bitmap.height);
    // Only the two hard refusals reach here: unreadable, or too small to look
    // at. Proportions are reported, never refused.
    if (reading.refusal) return { reason: reading.refusal };

    if (!reading.resizeTo) {
      return { blob: file, width: bitmap.width, height: bitmap.height, reading };
    }

    const { width, height } = reading.resizeTo;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      return { reason: `${file.name} is too large for this browser to resize.` };
    }
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob) {
      return {
        reason:
          `${file.name} is wider than ${MAX_PANORAMA_WIDTH} pixels and could ` +
          `not be resized. Export it smaller and try again.`,
      };
    }

    return { blob, width, height, reading };
  } finally {
    bitmap.close();
  }
}
