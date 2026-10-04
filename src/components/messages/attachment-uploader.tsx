"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_BUCKET,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  attachmentKindLabel,
  formatFileSize,
  isAllowedAttachmentType,
} from "@/lib/constants/messaging";
import { createAttachmentUploadPath } from "@/app/(dashboard)/messages/actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { PendingAttachment } from "@/app/(dashboard)/messages/actions";

/**
 * Uploads straight to Supabase Storage under the conversation folder, which
 * the bucket policy restricts to participants. The message row is written
 * afterwards with the returned paths.
 */
export function AttachmentUploader({
  conversationId,
  attachments,
  onChange,
  disabled,
}: {
  conversationId: string;
  attachments: PendingAttachment[];
  onChange: (next: PendingAttachment[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    if (attachments.length + files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      toast.error(`Up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`);
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const uploaded: PendingAttachment[] = [];

    for (const file of files) {
      if (!isAllowedAttachmentType(file.type)) {
        toast.error(`${file.name}: images, PDF, Word and ZIP files only.`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(
          `${file.name} is larger than ${formatFileSize(MAX_ATTACHMENT_BYTES)}.`,
        );
        continue;
      }

      const { path, error: pathError } = await createAttachmentUploadPath(
        conversationId,
        file.name,
      );
      if (!path) {
        toast.error(pathError ?? "Could not prepare that upload.");
        continue;
      }

      const { error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });

      if (error) {
        toast.error(`${file.name}: ${error.message}`);
        continue;
      }

      uploaded.push({
        storagePath: path,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
    }

    setUploading(false);
    if (uploaded.length > 0) onChange([...attachments, ...uploaded]);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        onChange={handleFiles}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
        aria-label="Attach a file"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground",
          "transition-colors hover:bg-muted hover:text-foreground",
          "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        {uploading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Paperclip className="size-4" />
        )}
      </button>
    </>
  );
}

/** Chips for files staged on the current draft, shown above the composer. */
export function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: PendingAttachment[];
  onRemove: (storagePath: string) => void;
}) {
  if (attachments.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2 px-1 pb-2">
      {attachments.map((file) => (
        <li
          key={file.storagePath}
          className="flex items-center gap-2 rounded-lg border bg-muted/40 py-1 pr-1 pl-2.5 text-xs"
        >
          <span className="font-medium text-muted-foreground">
            {attachmentKindLabel(file.mimeType, file.fileName)}
          </span>
          <span className="max-w-40 truncate">{file.fileName}</span>
          <span className="text-muted-foreground">
            {formatFileSize(file.sizeBytes)}
          </span>
          <button
            type="button"
            onClick={() => onRemove(file.storagePath)}
            aria-label={`Remove ${file.fileName}`}
            className="flex size-5 items-center justify-center rounded-md transition-colors hover:bg-muted"
          >
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
