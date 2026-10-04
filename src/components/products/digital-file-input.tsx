"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * The file being sold.
 *
 * Goes straight into `digital-goods`, which is private and folder-scoped to
 * the seller. Not a public bucket: the file *is* the product, and a
 * marketplace that serves it to anybody who reads the listing's HTML is not
 * selling anything.
 *
 * What this does not do is deliver it. Medosha has no checkout — no orders
 * table, no payment against a listing — so today a buyer messages the seller
 * and the seller sends the file. Storing it here means the listing can state
 * the format and size honestly, and that the delivery step has somewhere to
 * read from when it is built.
 */
const MAX_SIZE = 500 * 1024 * 1024;

export function DigitalFileInput({
  userId,
  initialPath = "",
  initialName = "",
}: {
  userId: string;
  initialPath?: string;
  initialName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState(initialPath);
  const [name, setName] = useState(initialName);
  const [size, setSize] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_SIZE) {
      toast.error("That file is over 500MB");
      return;
    }

    setUploading(true);
    const supabase = createClient();
    // The seller's own folder, which is the whole of the access rule: the
    // storage policy checks the first path segment against auth.uid().
    const key = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error } = await supabase.storage
      .from("digital-goods")
      .upload(key, file);
    setUploading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    // The old file is left rather than deleted. A seller who replaces one by
    // mistake has not lost the first, and nothing serves it.
    setPath(key);
    setName(file.name);
    setSize(file.size);
    toast.success("File attached");
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="digitalFilePath" value={path} />
      <input type="hidden" name="digitalFileName" value={name} />

      {path ? (
        <div className="flex items-center gap-3 rounded-xl border p-3">
          <FileUp className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">
              {size !== null
                ? `${(size / (1024 * 1024)).toFixed(1)} MB · attached`
                : "Attached"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setPath("");
              setName("");
              setSize(null);
            }}
            aria-label="Remove file"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            "flex min-h-24 w-full flex-col items-center justify-center gap-2",
            "rounded-xl border border-dashed text-sm text-muted-foreground",
            "transition-colors hover:border-brand hover:text-foreground",
            uploading && "opacity-60",
          )}
        >
          {uploading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <FileUp className="size-5" />
          )}
          {uploading ? "Uploading…" : "Attach the file you are selling"}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        onChange={handleChange}
        className="hidden"
      />
      <p className="text-xs text-muted-foreground">
        Kept privately — buyers never get the link from the listing. Medosha
        does not take payment yet, so a buyer messages you and you send it.
      </p>
    </div>
  );
}
