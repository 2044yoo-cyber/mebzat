"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { GripVertical, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { moderateQuarantinedImage } from "@/app/moderation/upload-actions";
import { createClient } from "@/lib/supabase/client";
import {
  checkPanorama,
  MAX_PANORAMA_WIDTH,
  PANORAMA_TYPES,
  sceneName,
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
  panoramaUrl: string;
  width: number;
  height: number;
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

      if (verdict.status !== "safe" || !verdict.publicUrl) {
        if (verdict.status === "blocked") refused += 1;
        else held += 1;
        continue;
      }

      added.push({
        key: crypto.randomUUID(),
        // A first guess from the file name, which is usually "living room.jpg"
        // and occasionally "R0010234.JPG". Either way it is editable.
        title: sceneName(file.name, scenes.length + added.length),
        panoramaUrl: verdict.publicUrl,
        width: prepared.width,
        height: prepared.height,
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
        held === 1 ? "One panorama is under review." : `${held} panoramas are under review.`,
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
            <Image
              src={scene.panoramaUrl}
              alt=""
              fill
              sizes="112px"
              className="object-cover"
            />
          </div>

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
): Promise<{ blob: Blob; width: number; height: number } | { reason: string }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { reason: `${file.name} could not be read as an image.` };
  }

  try {
    const verdict = checkPanorama(bitmap.width, bitmap.height);
    if (!verdict.ok) return { reason: verdict.reason };

    if (!verdict.resizeTo) {
      return { blob: file, width: bitmap.width, height: bitmap.height };
    }

    const { width, height } = verdict.resizeTo;
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

    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
