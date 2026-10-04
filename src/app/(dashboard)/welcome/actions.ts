"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isMedoshaRole } from "@/lib/profile/roles";
import { createClient } from "@/lib/supabase/server";
import type { MedoshaRole } from "@/types/database.types";

/**
 * Answering "how will you use Medosha?".
 *
 * Written once, and the screen is never shown again — `onboarding_completed`
 * is what decides that, and it is set in the same statement as the role so the
 * two cannot come apart. A half-answered onboarding that keeps reappearing is
 * worse than not asking.
 *
 * The role is not a lock. `roles` is an array and this writes one into it;
 * adding a second later is an update, not a migration, which is the whole
 * reason 0097 chose an array over a column.
 */
export async function chooseRole(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/welcome");

  const raw = String(formData.get("role") ?? "");
  // Falling back to `client` rather than refusing: somebody who reached this
  // screen has signed up, and the smallest claim the platform can make about
  // them is that they are here to hire somebody.
  const role: MedoshaRole = isMedoshaRole(raw) ? raw : "client";

  const { error } = await supabase
    .from("profiles")
    .update({
      roles: [role],
      primary_role: role,
      onboarding_completed: true,
    })
    .eq("id", user.id);

  if (error) {
    // Nothing is half-written: the update is one statement. Sending them on
    // anyway would mean an account with no role and the screen gone.
    redirect("/welcome?error=1");
  }

  revalidatePath("/", "layout");
  redirect(role === "client" ? "/dashboard" : "/profile/edit");
}
