"use client";

import { useEffect, useState } from "react";

import { AGENDA_FILES_BUCKET, agendaFilePath } from "@/lib/agenda/files";
import { createClient } from "@/lib/supabase/client";

import { registerAsset } from "@/app/(dashboard)/agenda/projects/[projectId]/collaborate/actions";

/**
 * Files in the Studio are the project's files: uploaded straight from the
 * browser into the private `agenda-files` bucket under the project's folder
 * (the storage policy refuses anything else), then registered as a drawing —
 * or a new revision of one — in the project's register. A board card, a
 * canvas image and a review all point at that one record.
 */

export const MAX_BYTES = 26214400;
export const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf";

const KINDS = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet))|application\/vnd\.ms-excel)$/;

export function checkFile(file: File): string | null {
  if (file.size > MAX_BYTES) return `${file.name} is over 25 MB.`;
  if (file.size === 0) return `${file.name} is empty.`;
  const drawing = /\.(dwg|dxf)$/i.test(file.name);
  if (!drawing && !KINDS.test(file.type)) return `${file.name} is not an image, a PDF or a document.`;
  return null;
}

export async function uploadToStudio(projectId: string, file: File, options: { drawingId?: string; title?: string } = {}) {
  const problem = checkFile(file);
  if (problem) return { ok: false as const, error: problem };
  const path = agendaFilePath(projectId, "studio", file.name);
  const type = file.type || "application/octet-stream";
  const { error } = await createClient().storage.from(AGENDA_FILES_BUCKET).upload(path, file, { contentType: type, upsert: false });
  if (error) {
    return { ok: false as const, error: /row-level security|Unauthorized|403/.test(error.message) ? "You are not on this project." : "That file did not upload. Check the connection and try again." };
  }
  const registered = await registerAsset(projectId, { storagePath: path, fileName: file.name.slice(0, 200), mimeType: type, size: file.size, title: options.title, drawingId: options.drawingId });
  if (!registered.ok) return registered;
  return { ...registered, ok: true as const, path, mimeType: type, fileName: file.name };
}

// ---------------------------------------------------------------------------
// Signed links, re-signed before they run out
// ---------------------------------------------------------------------------

const cache = new Map<string, { url: string; expires: number }>();
const TTL = 3600;

export function primeSignedUrls(urls: Record<string, string>) {
  // Signed on the server moments ago for an hour; trust them for 50 minutes.
  const expires = Date.now() + 50 * 60 * 1000;
  for (const [path, url] of Object.entries(urls)) cache.set(path, { url, expires });
}

export async function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data } = await createClient().storage.from(AGENDA_FILES_BUCKET).createSignedUrl(path, TTL);
  if (!data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, expires: Date.now() + (TTL - 600) * 1000 });
  return data.signedUrl;
}

export function cachedUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const hit = cache.get(path);
  return hit && hit.expires > Date.now() ? hit.url : null;
}

export const isImage = (mime: string | null | undefined, name?: string | null) => Boolean(mime?.startsWith("image/")) || /\.(jpe?g|png|webp|gif)$/i.test(name ?? "");
export const isPdf = (mime: string | null | undefined, name?: string | null) => mime === "application/pdf" || /\.pdf$/i.test(name ?? "");

/** A file's signed link, signed again when it runs out. */
export function useSignedUrl(path: string | null | undefined): string | null {
  const [signed, setSigned] = useState<{ path: string; url: string | null } | null>(() => (path ? { path, url: cachedUrl(path) } : null));
  useEffect(() => {
    if (!path) return;
    let live = true;
    void signedUrl(path).then((url) => { if (live) setSigned({ path, url }); });
    return () => { live = false; };
  }, [path]);
  if (!path) return null;
  return signed?.path === path ? signed.url : cachedUrl(path);
}
