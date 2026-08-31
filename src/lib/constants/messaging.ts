// Shared messaging configuration. Used by the client uploader for immediate
// feedback and re-checked server-side before anything is persisted.

/** Maximum size of a single attachment. Configurable via env; 25MB default. */
export const MAX_ATTACHMENT_BYTES = Number(
  process.env.NEXT_PUBLIC_MAX_ATTACHMENT_BYTES ?? 25 * 1024 * 1024,
);

/** Attachments allowed per message. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

/** Longest message body accepted. */
export const MAX_MESSAGE_LENGTH = 4000;

export const ATTACHMENT_BUCKET = "message-attachments";

/** Accepted MIME types — mirrors allowed_mime_types on the storage bucket. */
export const ALLOWED_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "application/x-zip-compressed",
] as const;

/** `accept` attribute for the file input. */
export const ATTACHMENT_ACCEPT = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".pdf",
  ".doc",
  ".docx",
  ".zip",
].join(",");

export function isAllowedAttachmentType(mime: string): boolean {
  return (ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(mime);
}

export function isImageAttachment(mime: string): boolean {
  return mime.startsWith("image/");
}

/** Human-readable size, e.g. "2.4 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Short label for a non-image attachment, e.g. "PDF", "DOCX". */
export function attachmentKindLabel(mime: string, fileName: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("word")) return "DOC";
  if (mime.includes("zip")) return "ZIP";
  const ext = fileName.split(".").pop();
  return ext ? ext.toUpperCase().slice(0, 4) : "FILE";
}
