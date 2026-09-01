"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Following an investment project.
 *
 * Follows are the only write this module offers a signed-in member, and
 * deliberately so: nothing here commits money, records a holding, or creates
 * anything that could be mistaken for a transaction. A follow subscribes you
 * to the project's updates through the notification system that already
 * exists, and that is all it does.
 */

export type FollowState = { following: boolean; error?: string };

export async function toggleFollowProject(
  projectId: string,
): Promise<FollowState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { following: false, error: "Sign in to follow this project." };
  }

  if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
    return { following: false, error: "Unknown project." };
  }

  const { data: existing } = await supabase
    .from("invest_follows")
    .select("project_id")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("invest_follows")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", user.id);
    if (error) return { following: true, error: "Could not unfollow." };
    revalidatePath("/invest");
    return { following: false };
  }

  const { error } = await supabase
    .from("invest_follows")
    .insert({ project_id: projectId, user_id: user.id });

  if (error) return { following: false, error: "Could not follow." };

  revalidatePath("/invest");
  return { following: true };
}
