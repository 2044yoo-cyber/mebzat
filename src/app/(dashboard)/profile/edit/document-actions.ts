"use server";

import { revalidatePath } from "next/cache";

import {
  PROFILE_DOCUMENTS_BUCKET,
  type DocumentKind,
} from "@/lib/constants/profile-documents";
import { createClient } from "@/lib/supabase/server";

type DocumentState = { error?: string; savedAt?: number };

/**
 * The columns each kind writes, spelled out per kind.
 *
 * A computed key — `{ [columns.path]: path }` — is what this was, and the
 * generated `Update` type rejects it: an index signature cannot be checked
 * against a closed set of optional columns, so every key widens to `never`.
 * Losing that check on the one function that writes a storage path into a
 * profile is not a trade worth making, so the two shapes are written out.
 */
function documentPatch(
  kind: DocumentKind,
  value: { path: string; filename: string } | null,
) {
  const stamp = value ? new Date().toISOString() : null;
  return kind === "cv"
    ? {
        cv_path: value?.path ?? null,
        cv_filename: value?.filename ?? null,
        cv_updated_at: stamp,
      }
    : {
        portfolio_path: value?.path ?? null,
        portfolio_filename: value?.filename ?? null,
        portfolio_updated_at: stamp,
      };
}

/**
 * Records a document the browser has already uploaded.
 *
 * The bytes go straight from the browser to storage, as they do everywhere
 * else here — routing a 10 MB PDF through a server action to put it in the
 * same bucket costs a round trip and buys nothing. What this does is write the
 * row, and it is also where the path is checked: storage policy or not, a
 * profile must not end up holding a path into somebody else's folder, because
 * the *reader* of that column does not re-check it.
 */
export async function saveProfileDocument(
  kind: DocumentKind,
  path: string,
  filename: string,
): Promise<DocumentState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session expired. Log in again." };

  // The path convention the storage policy reads: <profile_id>/<filename>.
  if (!path.startsWith(`${user.id}/`) || path.includes("..")) {
    return { error: "That file does not belong to this profile." };
  }

  const { error } = await supabase
    .from("profiles")
    .update(documentPatch(kind, { path, filename: filename.slice(0, 120) }))
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profile");
  revalidatePath("/profile/edit");
  return { savedAt: Date.now() };
}

/**
 * Takes a document off the profile, and out of storage.
 *
 * Both, in that order. Clearing the column alone leaves the file readable by
 * every employer who already has an application offering it — the storage
 * policy is written against the application, not against the column — so
 * "remove my CV" would remove it from the screen and from nowhere else.
 */
export async function removeProfileDocument(
  kind: DocumentKind,
): Promise<DocumentState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session expired. Log in again." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("cv_path, portfolio_path")
    .eq("id", user.id)
    .maybeSingle();

  const existing = kind === "cv" ? profile?.cv_path : profile?.portfolio_path;

  const { error } = await supabase
    .from("profiles")
    .update(documentPatch(kind, null))
    .eq("id", user.id);

  if (error) return { error: error.message };

  if (existing) {
    await supabase.storage.from(PROFILE_DOCUMENTS_BUCKET).remove([existing]);
  }

  revalidatePath("/profile");
  revalidatePath("/profile/edit");
  return { savedAt: Date.now() };
}

/**
 * A link to a stored document that works for the length of a sitting.
 *
 * An hour, not a year. The column holds a path precisely so that the URL is
 * minted per reader per visit — a link with a year on it is a CV on the open
 * internet the moment it is forwarded, and the storage policy stops mattering.
 * Returns null rather than throwing: a missing document is a normal state.
 */
export async function signedDocumentUrl(
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(PROFILE_DOCUMENTS_BUCKET)
    .createSignedUrl(path, 60 * 60);

  return data?.signedUrl ?? null;
}
