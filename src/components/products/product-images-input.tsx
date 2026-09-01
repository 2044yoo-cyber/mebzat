"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Star, X } from "lucide-react";
import { toast } from "sonner";

import { moderateQuarantinedImage } from "@/app/moderation/upload-actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MAX_SIZE = 10 * 1024 * 1024;
const MAX_IMAGES = 12;

export function ProductImagesInput({
  userId,
  initialUrls = [],
}: {
  userId: string;
  initialUrls?: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>(initialUrls);
  const [uploading, setUploading] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    if (urls.length + files.length > MAX_IMAGES) {
      toast.error(`You can add up to ${MAX_IMAGES} images`);
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const uploaded: string[] = [];
    // Counted rather than announced one by one: a batch of twelve where three
    // are held would otherwise stack three toasts on top of a phone screen.
    let held = 0;
    let refused = 0;

    for (const file of files) {
      if (file.size > MAX_SIZE) {
        toast.error(`${file.name} is over 10MB`);
        continue;
      }
      const ext = file.name.split(".").pop();
      // Quarantine is private and folder-scoped to auth.uid(), so nothing in
      // this batch is fetchable by URL before it has been checked.
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("moderation-quarantine")
        .upload(path, file);
      if (error) {
        toast.error(error.message);
        continue;
      }

      const verdict = await moderateQuarantinedImage({
        quarantinePath: path,
        contentType: "product_image",
        publicBucket: "product-images",
      });

      // One refusal must not cost the rest of the batch — the existing
      // per-file `continue` already had the right shape for this.
      if (verdict.status !== "safe" || !verdict.publicUrl) {
        if (verdict.status === "blocked") refused += 1;
        else held += 1;
        continue;
      }
      uploaded.push(verdict.publicUrl);
    }

    setUrls((prev) => [...prev, ...uploaded]);
    setUploading(false);

    if (refused > 0) {
      toast.error(
        refused === 1
          ? "One image cannot be published because it violates Medosha's content guidelines."
          : `${refused} images cannot be published because they violate Medosha's content guidelines.`,
      );
    }
    if (held > 0) {
      toast.info(
        held === 1 ? "One image is under review." : `${held} images are under review.`,
      );
    }
  }

  function remove(url: string) {
    setUrls((prev) => prev.filter((u) => u !== url));
  }

  function makeCover(url: string) {
    setUrls((prev) => [url, ...prev.filter((u) => u !== url)]);
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="images" value={JSON.stringify(urls)} />

      {urls.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {urls.map((url, i) => (
            <div
              key={url}
              className="group relative aspect-square overflow-hidden rounded-xl border bg-muted"
            >
              <Image
                src={url}
                alt=""
                fill
                sizes="(max-width: 640px) 50vw, 33vw"
                className="object-cover"
              />
              {i === 0 && (
                <span className="absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-brand-foreground">
                  Cover
                </span>
              )}
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                {i !== 0 && (
                  <button
                    type="button"
                    onClick={() => makeCover(url)}
                    aria-label="Set as cover"
                    className="flex size-8 items-center justify-center rounded-full bg-white/90 text-black hover:bg-white"
                  >
                    <Star className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(url)}
                  aria-label="Remove image"
                  className="flex size-8 items-center justify-center rounded-full bg-white/90 text-destructive hover:bg-white"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || urls.length >= MAX_IMAGES}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-sm text-muted-foreground transition-colors hover:border-brand hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        {uploading ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <ImagePlus className="size-5" />
        )}
        {uploading
          ? "Uploading…"
          : urls.length === 0
            ? "Add product images"
            : "Add more images"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
