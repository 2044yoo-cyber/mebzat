"use server";

import { revalidatePath } from "next/cache";

import { inviteToken } from "@/lib/collab/model";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

/**
 * Using an invitation link. Both actions hand the token to the database,
 * which hashes it and decides (0107's `collab_invite_preview` and
 * `collab_accept_invite`); nothing here grants anything by itself.
 */

export type InvitePreview = Database["public"]["Functions"]["collab_invite_preview"]["Returns"][number];
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** The database's refusals are written to be read; anything else is said plainly. */
function readable(message: string | undefined): string {
  const text = message ?? "";
  if (/^(This invitation link|Your access to this project|Sign in)/.test(text)) return text;
  if (text.includes("permission denied")) return "Sign in to accept the invitation.";
  return "The invitation could not be checked. Try again in a moment.";
}

async function signedIn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function previewInviteLink(token: string): Promise<Result<{ preview: InvitePreview | null }>> {
  if (!inviteToken.safeParse(token).success) return { ok: true, preview: null };
  const { supabase, user } = await signedIn();
  if (!user) return { ok: false, error: "Sign in to accept the invitation." };
  const { data, error } = await supabase.rpc("collab_invite_preview", { invite_token: token });
  if (error) return { ok: false, error: readable(error.message) };
  return { ok: true, preview: (data as InvitePreview[] | null)?.[0] ?? null };
}

export async function acceptInviteLink(token: string): Promise<Result<{ projectId: string }>> {
  if (!inviteToken.safeParse(token).success) return { ok: false, error: "This invitation link is not valid." };
  const { supabase, user } = await signedIn();
  if (!user) return { ok: false, error: "Sign in to accept the invitation." };
  const { data, error } = await supabase.rpc("collab_accept_invite", { invite_token: token });
  if (error || !data) return { ok: false, error: readable(error?.message) };
  revalidatePath(`/agenda/projects/${data}/collaborate`);
  return { ok: true, projectId: String(data) };
}
