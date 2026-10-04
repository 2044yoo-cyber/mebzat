"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  RefreshCw,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { moderateQuarantinedImage } from "@/app/moderation/upload-actions";
import { compressImage } from "@/lib/images/compress";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export const MAX_PROJECT_IMAGES = 6;

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
/** The bucket's own ceiling. Anything over it is refused by storage. */
const MAX_SIZE = 10 * 1024 * 1024;

type Slot = {
  /** Stable across re-renders and retries; the URL is not, and is absent while uploading. */
  key: string;
  name: string;
  status: "uploading" | "done" | "failed";
  url?: string;
  /** Kept only for a failed slot, so Retry has something to send. */
  file?: File;
  error?: string;
};

export type ProjectImagesValue = {
  urls: string[];
  primary: string | null;
};

/**
 * A generic message, always.
 *
 * Storage errors say things like `new row violates row-level security policy`
 * and `mime type image/heic is not supported`. Neither is actionable by the
 * person holding the phone, and the first is a description of our access
 * rules. The real text goes to the console for whoever is reading logs.
 */
function reportUploadFailure(where: string, detail: unknown): string {
  console.error(`[project-images] ${where}:`, detail);
  return "Upload failed. Tap retry.";
}

export function ProjectImagesInput({
  userId,
  initialUrls = [],
  initialPrimary = null,
  onChange,
}: {
  userId: string;
  initialUrls?: string[];
  initialPrimary?: string | null;
  /** Called whenever the set or the cover changes, so a draft can be saved. */
  onChange?: (value: ProjectImagesValue) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replacingKey = useRef<string | null>(null);

  const [slots, setSlots] = useState<Slot[]>(() =>
    initialUrls.map((url) => ({
      key: url,
      name: "",
      status: "done" as const,
      url,
    })),
  );
  const [primary, setPrimary] = useState<string | null>(
    initialPrimary && initialUrls.includes(initialPrimary)
      ? initialPrimary
      : (initialUrls[0] ?? null),
  );
  const [busy, setBusy] = useState(0);
  const [finished, setFinished] = useState(0);

  const urls = slots
    .filter((s) => s.status === "done" && s.url)
    .map((s) => s.url as string);

  // The cover has to stay one of the project's own images. Removing the cover
  // without this leaves `primary` pointing at a URL that is no longer in the
  // list, and the action falls back to position zero while the badge is drawn
  // on nothing.
  const effectivePrimary =
    primary && urls.includes(primary) ? primary : (urls[0] ?? null);

  // Reported to the parent rather than only held here, so an upload that
  // succeeded is written to the draft immediately. Images that live only in
  // this component's state are the ones that vanish on refresh.
  const notify = useCallback(
    (value: ProjectImagesValue) => onChange?.(value),
    [onChange],
  );
  const fingerprint = urls.join(" ");
  useEffect(() => {
    notify({ urls: fingerprint ? fingerprint.split(" ") : [], primary: effectivePrimary });
  }, [fingerprint, effectivePrimary, notify]);

  function patch(key: string, next: Partial<Slot>) {
    setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, ...next } : s)));
  }

  /**
   * One file, start to finish.
   *
   * Every failure ends in the slot rather than in a thrown error: the server
   * action is a network call and can reject for reasons that have nothing to
   * do with this image, and an uncaught rejection here used to leave the whole
   * control stuck on "Uploading" with no message and no way back.
   */
  async function upload(key: string, file: File) {
    patch(key, { status: "uploading", error: undefined });

    try {
      const { blob, mime, extension } = await compressImage(file);

      if (blob.size > MAX_SIZE) {
        patch(key, {
          status: "failed",
          file,
          error: "That photo is too large, even after shrinking.",
        });
        return;
      }

      const supabase = createClient();
      const path = `${userId}/${crypto.randomUUID()}.${extension}`;

      // Quarantine is private and folder-scoped to auth.uid(), so nothing here
      // is fetchable by URL before it has been checked.
      const { error } = await supabase.storage
        .from("moderation-quarantine")
        .upload(path, blob, { contentType: mime });

      if (error) {
        patch(key, {
          status: "failed",
          file,
          error: reportUploadFailure("quarantine upload", error.message),
        });
        return;
      }

      const verdict = await moderateQuarantinedImage({
        quarantinePath: path,
        contentType: "project_image",
        publicBucket: "project-images",
      });

      if (!verdict.publicUrl) {
        // A refusal is not a retry. Saying "tap retry" to somebody whose image
        // was turned down for its content sends them round the same loop.
        const refused = verdict.status === "blocked";
        patch(key, {
          status: "failed",
          file: refused ? undefined : file,
          error: refused
            ? "This image cannot be published under Medosha's content guidelines."
            : "Could not publish that image. Tap retry.",
        });
        return;
      }

      patch(key, { status: "done", url: verdict.publicUrl, file: undefined });
    } catch (cause) {
      patch(key, {
        status: "failed",
        file,
        error: reportUploadFailure("upload", cause),
      });
    }
  }

  async function runBatch(files: File[]) {
    setBusy(files.length);
    setFinished(0);

    // Sequential. Six parallel uploads from a phone share one uplink, each
    // finishes later than if they had queued, and the progress count reads
    // "6 of 6" from the first second.
    for (const [i, file] of files.entries()) {
      const key = `${Date.now()}-${i}-${file.name}`;
      setSlots((prev) => [
        ...prev,
        { key, name: file.name, status: "uploading" },
      ]);
      await upload(key, file);
      setFinished((n) => n + 1);
    }

    setBusy(0);
    setFinished(0);
  }

  function chosen(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;

    const room = MAX_PROJECT_IMAGES - slots.length;
    if (room <= 0) {
      toast.error(`You can add up to ${MAX_PROJECT_IMAGES} images`);
      return;
    }

    const usable: File[] = [];
    let wrongType = 0;
    for (const file of picked.slice(0, room)) {
      if (!ACCEPTED.includes(file.type)) {
        wrongType += 1;
        continue;
      }
      usable.push(file);
    }

    if (wrongType > 0) {
      toast.error(
        wrongType === 1
          ? "That file is not a JPG, PNG or WEBP."
          : `${wrongType} files are not JPG, PNG or WEBP.`,
      );
    }
    if (picked.length > room) {
      toast.info(`Only ${room} more ${room === 1 ? "image" : "images"} fit.`);
    }
    if (usable.length > 0) void runBatch(usable);
  }

  function replaced(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const key = replacingKey.current;
    e.target.value = "";
    replacingKey.current = null;
    if (!file || !key) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error("That file is not a JPG, PNG or WEBP.");
      return;
    }
    setBusy(1);
    setFinished(0);
    void upload(key, file).finally(() => {
      setBusy(0);
      setFinished(0);
    });
  }

  function startReplace(key: string) {
    replacingKey.current = key;
    replaceRef.current?.click();
  }

  function remove(key: string) {
    // Only this image. A failed upload used to be indistinguishable from a
    // lost draft because there was nothing to press that removed just the one.
    setSlots((prev) => prev.filter((s) => s.key !== key));
  }

  function move(index: number, by: -1 | 1) {
    setSlots((prev) => {
      const to = index + by;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  const dragging = useRef<number | null>(null);
  function dropOn(index: number) {
    const from = dragging.current;
    dragging.current = null;
    if (from === null || from === index) return;
    setSlots((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      return next;
    });
  }

  const full = slots.length >= MAX_PROJECT_IMAGES;

  return (
    <div className="space-y-3">
      <input type="hidden" name="images" value={JSON.stringify(urls)} />
      <input type="hidden" name="primaryImage" value={effectivePrimary ?? ""} />

      {slots.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {slots.map((slot, i) => {
            const isPrimary = !!slot.url && slot.url === effectivePrimary;
            return (
              <li
                key={slot.key}
                draggable={slot.status === "done"}
                onDragStart={() => {
                  dragging.current = i;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropOn(i)}
                className={cn(
                  "group relative aspect-4/3 overflow-hidden rounded-xl border bg-muted",
                  isPrimary && "ring-2 ring-brand",
                )}
              >
                {slot.url ? (
                  <Image
                    src={slot.url}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
                    {slot.status === "uploading" ? (
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    ) : (
                      <AlertCircle className="size-5 text-destructive" />
                    )}
                    <span className="line-clamp-3 text-xs text-muted-foreground">
                      {slot.status === "uploading" ? "Uploading" : slot.error}
                    </span>
                  </div>
                )}

                {isPrimary && (
                  <span className="absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold uppercase text-brand-foreground">
                    Primary
                  </span>
                )}

                {/* Always visible, not hover-only: a phone has no hover, and
                    these controls were unreachable there. */}
                <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                  {slot.status === "done" && (
                    <>
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        aria-label="Move earlier"
                        className="flex size-8 items-center justify-center rounded-full bg-white/90 text-black disabled:opacity-30"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={i === slots.length - 1}
                        aria-label="Move later"
                        className="flex size-8 items-center justify-center rounded-full bg-white/90 text-black disabled:opacity-30"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                      {!isPrimary && (
                        <button
                          type="button"
                          onClick={() => setPrimary(slot.url ?? null)}
                          aria-label="Set as primary"
                          className="flex size-8 items-center justify-center rounded-full bg-white/90 text-black"
                        >
                          <Star className="size-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => startReplace(slot.key)}
                        aria-label="Replace image"
                        className="flex size-8 items-center justify-center rounded-full bg-white/90 text-black"
                      >
                        <RefreshCw className="size-4" />
                      </button>
                    </>
                  )}
                  {slot.status === "failed" && slot.file && (
                    <button
                      type="button"
                      onClick={() => void upload(slot.key, slot.file as File)}
                      aria-label="Retry upload"
                      className="flex size-8 items-center justify-center rounded-full bg-white/90 text-black"
                    >
                      <RefreshCw className="size-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(slot.key)}
                    aria-label="Remove image"
                    className="flex size-8 items-center justify-center rounded-full bg-white/90 text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy > 0 || full}
        className="flex min-h-14 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground transition-colors hover:border-brand hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        {busy > 0 ? (
          <>
            <Loader2 className="size-5 animate-spin" />
            {`Uploading ${Math.min(finished + 1, busy)} of ${busy}`}
          </>
        ) : (
          <>
            <ImagePlus className="size-5" />
            {full
              ? `${MAX_PROJECT_IMAGES} of ${MAX_PROJECT_IMAGES} added`
              : slots.length === 0
                ? "Add images"
                : `Add images (${slots.length} of ${MAX_PROJECT_IMAGES})`}
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={chosen}
      />
      <input
        ref={replaceRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={replaced}
      />
    </div>
  );
}
