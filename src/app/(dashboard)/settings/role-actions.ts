"use server";

import { revalidatePath } from "next/cache";

import { isMedoshaRole } from "@/lib/profile/roles";
import { createClient } from "@/lib/supabase/server";
import type { MedoshaRole } from "@/types/database.types";

export type RoleResult = { error?: string; ok?: boolean };

/**
 * Changing or adding how somebody uses Medosha.
 *
 * The first answer is not a lock — a client who takes up a trade becomes a
 * professional, an architect who starts selling fittings adds a seller role —
 * and this is where that happens. Nothing is deleted when a role is dropped:
 * an agent who stops being one keeps their `agent_profiles` row, so taking the
 * role back later finds everything where they left it.
 *
 * At least one role always remains. An account with none is an account no
 * screen knows what to ask for, and the welcome question is gone by then.
 */
export async function setRoles(formData: FormData): Promise<RoleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Log in again." };

  const chosen = formData
    .getAll("roles")
    .map(String)
    .filter(isMedoshaRole);

  if (chosen.length === 0) {
    return { error: "Keep at least one — it decides what you are asked for." };
  }

  // The primary is the one they asked for if it is still among them, and
  // otherwise the first they kept. A primary role that is not in `roles` is
  // the kind of disagreement that shows up as a blank label months later.
  const asked = String(formData.get("primary") ?? "");
  const primary: MedoshaRole =
    isMedoshaRole(asked) && chosen.includes(asked) ? asked : chosen[0];

  const { error } = await supabase
    .from("profiles")
    .update({ roles: chosen, primary_role: primary })
    .eq("id", user.id);

  if (error) return { error: "Those changes were not saved." };

  revalidatePath("/", "layout");
  return { ok: true };
}
