"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";

import { ACCEPTED_FILES } from "@/lib/agenda/constants";
import { AGENDA_FILES_BUCKET, agendaFilePath } from "@/lib/agenda/files";
import { createClient } from "@/lib/supabase/client";

/** 25 MB, the bucket's own limit. Checked here so the refusal is a sentence. */
const MAX_BYTES = 26214400;

/**
 * Uploads a file to the project's store and hands back where it went.
 *
 * Straight from the browser, like the photo wall: a scanned drawing set
 * routed through a server action is held in memory twice and meets a body
 * limit that refuses exactly the files worth keeping.
 *
 * The caller decides what the upload *means* — a drawing revision, a document
 * version — and writes the row. This only puts the bytes somewhere and reports
 * the path, the name and the type, which is everything a row needs.
 */
export function FileDrop({
  projectId,
  folder,
  label = "Choose a file",
  onUploaded,
  disabled,
}: {
  projectId: string;
  /** The second path segment: `drawings`, `documents`. */
  folder: string;
  label?: string;
  onUploaded: (file: {
    path: string;
    name: string;
    type: string;
    size: number;
  }) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error("That file is over 25 MB.");
      return;
    }

    setBusy(true);
    const path = agendaFilePath(projectId, folder, file.name);
    const { error } = await createClient()
      .storage.from(AGENDA_FILES_BUCKET)
      .upload(path, file, {
        // A DWG or an RVT arrives as an empty type, and the bucket allows
        // octet-stream precisely so those are not refused.
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    setBusy(false);

    if (error) {
      toast.error(
        error.message.includes("row-level security") ||
          error.message.includes("Unauthorized")
          ? "You are not on this project."
          : "That file did not upload. Try again.",
      );
      return;
    }

    onUploaded({
      path,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => inputRef.current?.click()}
        className="flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Paperclip className="size-3.5" />
        )}
        {busy ? "Uploading" : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_FILES}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
    </>
  );
}
