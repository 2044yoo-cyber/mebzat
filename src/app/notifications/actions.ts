"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type NotificationResult = { error?: string; ok?: boolean };

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
