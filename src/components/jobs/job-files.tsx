"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Image as ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import { attachJobFile, removeJobFile } from "@/app/jobs/actions";
import { Button } from "@/components/ui/button";
import { JOB_FILES_BUCKET } from "@/lib/constants/jobs";
import { createClient } from "@/lib/supabase/client";
import type { JobAttachment, JobFileKind } from "@/types/database.types";

/**
 * Drawings, tender documents and photographs on a job.
 *
 * The bytes go from the browser straight to storage and never through a server
 * action — a 20 MB floor plan would not fit through one, and would be a poor
 * use of the server if it did. The action that follows only records the row.
 *
 * The path is `<job id>/<name>`, which is what the storage policy reads: only
 * the poster of that job can write into that folder, so a path is not a way in.
 */

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 12;

function kindOf(file: File): JobFileKind {
  if (file.type.startsWith("image/")) return "image";
  if (/\.(dxf|dwg)$/i.test(file.name) || file.type.includes("dxf")) {
    return "drawing";
  }
  return "document";
}

function readableSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function JobFiles({
  jobId,
  attachments,
}: {
  jobId: string;
  attachments: JobAttachment[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState(attachments);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    if (rows.length + files.length > MAX_FILES) {
      toast.error(`Up to ${MAX_FILES} files on a job.`);
      return;
    }

    setUploading(true);
    const supabase = createClient();

    for (const file of files) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is over 20 MB.`);
        continue;
      }

      // The stored name keeps the original for the reader, prefixed so two
      // people uploading "plan.pdf" do not overwrite each other.
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = `${jobId}/${crypto.randomUUID()}-${safe}`;

      const { error } = await supabase.storage
        .from(JOB_FILES_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });

      if (error) {
        toast.error(`${file.name}: ${error.message}`);
        continue;
      }

      const result = await attachJobFile(jobId, {
        path,
        name: file.name,
        kind: kindOf(file),
        sizeBytes: file.size,
      });

      if (result.error || !result.id) {
        // The row failed, so the object is orphaned. Removing it here keeps
        // the bucket honest rather than leaving bytes nobody can reach.
        await supabase.storage.from(JOB_FILES_BUCKET).remove([path]);
        toast.error(result.error ?? "Could not attach that file.");
        continue;
      }

      // The real id, so Remove works without a page reload. A locally
      // generated one would look right and delete nothing.
      const attachmentId = result.id;

      setRows((current) => [
        ...current,
        {
          id: attachmentId,
          job_id: jobId,
          kind: kindOf(file),
          url: path,
          name: file.name,
          size_bytes: file.size,
          position: current.length,
          created_at: new Date().toISOString(),
        },
      ]);
    }

    setUploading(false);
  }

  function remove(attachment: JobAttachment) {
    startTransition(async () => {
      const result = await removeJobFile(attachment.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setRows((current) => current.filter((row) => row.id !== attachment.id));
    });
  }

  return (
    <section className="space-y-4 rounded-2xl border p-5">
      <div>
        <h2 className="text-lg font-semibold">Files</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Drawings, a bill of quantities, a tender document, site photographs.
          Applicants can see them; nobody else can.
        </p>
      </div>

      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              {row.kind === "image" ? (
                <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {readableSize(row.size_bytes)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${row.name}`}
                disabled={pending}
                onClick={() => remove(row)}
                className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.dxf,image/jpeg,image/png,image/webp"
        onChange={upload}
      />

      <Button
        type="button"
        variant="outline"
        disabled={uploading || rows.length >= MAX_FILES}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Paperclip className="size-4" />
        )}
        {uploading ? "Uploading…" : "Add files"}
      </Button>
    </section>
  );
}
