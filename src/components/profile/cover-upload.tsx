"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { moderateQuarantinedImage } from "@/app/moderation/upload-actions";
import { createClient } from "@/lib/supabase/client";

const MAX_SIZE = 8 * 1024 * 1024;

export function CoverUpload({
  userId,
  coverUrl,
}: {
  userId: string;
  coverUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(coverUrl);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_SIZE) {
      toast.error("Image must be under 8MB");
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${userId}/cover-${Date.now()}.${ext}`;

    // Quarantine first. The bucket is private and folder-scoped to auth.uid(),
    // so the file is not fetchable by URL between here and a verdict.
    const { error: uploadError } = await supabase.storage
      .from("moderation-quarantine")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error(uploadError.message);
      setUploading(false);
      return;
    }

    const verdict = await moderateQuarantinedImage({
      quarantinePath: path,
      contentType: "profile_cover",
      publicBucket: "covers",
    });

    // Only `safe` writes the profile, and only with the URL the server built.
    // A refused upload leaves the existing cover exactly where it was.
    if (verdict.status !== "safe" || !verdict.publicUrl) {
      setUploading(false);
      if (verdict.status === "blocked") toast.error(verdict.message);
      else toast.info(verdict.message);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ cover_url: verdict.publicUrl })
      .eq("id", userId);

    setUploading(false);

    if (updateError) {
      toast.error(updateError.message);
      return;
    }

    setPreview(verdict.publicUrl);
    toast.success(verdict.message);
    router.refresh();
  }

  return (
    <div
      className="group relative h-40 w-full overflow-hidden rounded-t-2xl bg-muted sm:h-56"
      style={
        preview
          ? {
              backgroundImage: `url(${preview})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 text-sm font-medium text-transparent transition-colors group-hover:bg-black/40 group-hover:text-white disabled:pointer-events-none"
      >
        {uploading ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <>
            <Camera className="size-4" /> Change cover photo
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
