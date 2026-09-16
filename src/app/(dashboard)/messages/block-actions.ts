"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ModerationResult = { error?: string; ok?: boolean };

/**
 * Blocking, unblocking and reporting, each through its own RPC.
 *
 * None of these writes a table directly. The functions in 0088 are
 * `security definer` and state `auth.uid()` themselves, which is what lets the
 * block list stay one-sided — the person blocked cannot read the row that
 * refuses them, so the check that reads it cannot run as them.
 */

export async function blockUser(
  targetUserId: string,
  reason?: string,
): Promise<ModerationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("block_user", {
    target_user: targetUserId,
    why: reason ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath("/messages");
  return { ok: true };
}

export async function unblockUser(
  targetUserId: string,
): Promise<ModerationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("unblock_user", {
    target_user: targetUserId,
  });
  if (error) return { error: error.message };

  revalidatePath("/messages");
  return { ok: true };
}

/**
 * Reports somebody to the moderators.
 *
 * `category` is one of `moderation_category`, validated by PostgreSQL when the
 * argument is cast — an invented value fails the call rather than filing a
 * report nobody can triage.
 */
export async function reportUser(
  targetUserId: string,
  category: string,
  note?: string,
): Promise<ModerationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_user", {
    target_user: targetUserId,
    why: category,
    note: note ?? null,
  });
  if (error) return { error: error.message };

  return { ok: true };
}

/** Whether the viewer has blocked this person, for the chat header. */
export async function isBlocked(targetUserId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { count } = await supabase
    .from("user_blocks")
    .select("blocked_id", { count: "exact", head: true })
    .eq("blocker_id", user.id)
    .eq("blocked_id", targetUserId);

  return (count ?? 0) > 0;
}
