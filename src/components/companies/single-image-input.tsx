"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MAX_SIZE = 8 * 1024 * 1024;

/** Single-image uploader storing the resulting public URL in a hidden input.
 * Used for a company logo or cover. */
export function SingleImageInput({
  userId,
  name,
  bucket,
  initialUrl,
  aspect = "square",
  label,
}: {
  userId: string;
  name: string;
  bucket: string;
  initialUrl?: string | null;
  aspect?: "square" | "wide";
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(initialUrl ?? null);
  const [uploading, setUploading] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_SIZE) {
      toast.error(`${file.name} is over 8MB`);
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file);
    if (error) {
      toast.error(error.message);
      setUploading(false);
      return;
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(path);
    setUrl(publicUrl);
    setUploading(false);
  }

  return (
    <div>
      <input type="hidden" name={name} value={url ?? ""} />
      <div
        className={cn(
          "group relative overflow-hidden rounded-xl border bg-muted",
          aspect === "square" ? "size-28" : "aspect-[3/1] w-full",
        )}
      >
        {url && (
          <Image src={url} alt={label} fill sizes="400px" className="object-cover" />
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label={url ? `Change ${label}` : `Add ${label}`}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/0 text-xs font-medium text-transparent transition-colors hover:bg-black/40 hover:text-white group-hover:bg-black/40 group-hover:text-white disabled:pointer-events-none"
        >
          {uploading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <ImagePlus className="size-5" />
          )}
          {!uploading && label}
        </button>
        {url && !uploading && (
          <button
            type="button"
            onClick={() => setUrl(null)}
            aria-label={`Remove ${label}`}
            className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-background/90 text-destructive opacity-0 transition-opacity group-hover:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
