"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type NotificationResult = { error?: string; ok?: boolean };

/**
 * Marks one notification read.
 *
 * Through the RPC rather than a direct update, because the RPC states `user_id
 * = auth.uid()` itself. The table's policy says the same thing, and both
 * saying it is the point: a policy relaxed in some later migration, for some
 * unrelated reason, must not quietly turn this into "mark anybody's read".
 */
export async function markRead(id: string): Promise<NotificationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notification_read", {
    target_notification: id,
  });
  if (error) return { error: "Could not mark that as read." };

  revalidatePath("/notifications");
  return { ok: true };
}

/** Removes one notification from the tray, for its owner only. */
export async function removeNotification(
  id: string,
): Promise<NotificationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_notification", {
    target_notification: id,
  });
  if (error) return { error: "Could not remove that." };

  revalidatePath("/notifications");
  return { ok: true };
}

/** Marks everything read, in both notification tables. */
export async function markAllRead(): Promise<NotificationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/notifications");

  const now = new Date().toISOString();

  const [general, price] = await Promise.all([
    supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null),
    supabase
      .from("price_notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null),
  ]);

  if (general.error || price.error) {
    return { error: "Could not mark those as read." };
  }

  revalidatePath("/notifications");
  return { ok: true };
}
