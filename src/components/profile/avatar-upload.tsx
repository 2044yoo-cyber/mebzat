"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";

const MAX_SIZE = 5 * 1024 * 1024;

export function AvatarUpload({
  userId,
  avatarUrl,
  displayName,
}: {
  userId: string;
  avatarUrl: string | null;
  displayName: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(avatarUrl);

  const initials = displayName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_SIZE) {
      toast.error("Image must be under 5MB");
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${userId}/avatar-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error(uploadError.message);
      setUploading(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", userId);

    setUploading(false);

    if (updateError) {
      toast.error(updateError.message);
      return;
    }

    setPreview(publicUrl);
    router.refresh();
  }

  return (
    <div className="relative">
      <Avatar className="size-24 border-4 border-background sm:size-28">
        <AvatarImage src={preview ?? undefined} alt={displayName} />
        <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
      </Avatar>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label="Change profile picture"
        className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-transparent transition-colors hover:bg-black/40 hover:text-white disabled:pointer-events-none"
      >
        {uploading ? (
          <Loader2 className="size-5 animate-spin text-white" />
        ) : (
          <Camera className="size-5" />
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
