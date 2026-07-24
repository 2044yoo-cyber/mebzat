"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Star, X } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MAX_SIZE = 10 * 1024 * 1024;
const MAX_IMAGES = 12;

export function ProjectImagesInput({
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

    for (const file of files) {
      if (file.size > MAX_SIZE) {
        toast.error(`${file.name} is over 10MB`);
        continue;
      }
      const ext = file.name.split(".").pop();
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("project-images")
        .upload(path, file);
      if (error) {
        toast.error(error.message);
        continue;
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from("project-images").getPublicUrl(path);
      uploaded.push(publicUrl);
    }

    setUrls((prev) => [...prev, ...uploaded]);
    setUploading(false);
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
              className="group relative aspect-4/3 overflow-hidden rounded-xl border bg-muted"
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
            ? "Add project images"
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
