"use server";

import { revalidatePath } from "next/cache";

import { ADMIN_AREAS } from "@/lib/auth/admin-areas-shape";
import { adminIdentity } from "@/lib/auth/admin-areas";
import { reportFailure } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import type { AdminArea } from "@/types/database.types";

/**
 * Adding, changing and removing administrators.
 *
 * The owner check here is the second of three. The layout hides the link, this
 * refuses the call, and `set_admin_member` in the database refuses it again —
 * and only the last of those is the one that matters, because a server action
 * is a public endpoint with a URL and nothing about the button that points at
 * it is a gate. The two in front exist so the honest path gives a sensible
 * message instead of a database error.
 *
 * There is no path here that writes `profiles.is_admin` directly. A trigger
 * keeps that column in step with membership, so the flag and the grant cannot
 * drift apart into two answers to the same question.
 */

export type TeamResult = { ok: boolean; message: string };

const DENIED: TeamResult = { ok: false, message: "Not permitted." };

/** Only the areas that exist, and each of them once. Anything a browser sends
 * that is not in the list is dropped rather than passed to the database. */
function cleanAreas(input: string[]): AdminArea[] {
  const allowed = new Set<string>(ADMIN_AREAS);
  return [...new Set(input)].filter((one): one is AdminArea => allowed.has(one));
}

export async function saveAdminMember(
  target: string,
  areas: string[],
): Promise<TeamResult> {
  const identity = await adminIdentity();
  if (!identity.isOwner) return DENIED;

  const chosen = cleanAreas(areas);
  if (chosen.length === 0) {
    return {
      ok: false,
      message: "Choose at least one area, or remove them from the team.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_admin_member", {
    target,
    areas: chosen,
  });

  if (error) {
    return {
      ok: false,
      message: reportFailure("saveAdminMember", error, "Could not save that."),
    };
  }

  revalidatePath("/admin/team");
  revalidatePath("/admin");
  return { ok: true, message: "Saved." };
}

export async function removeAdminMember(target: string): Promise<TeamResult> {
  const identity = await adminIdentity();
  if (!identity.isOwner) return DENIED;

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_admin_member", { target });

  if (error) {
    return {
      ok: false,
      message: reportFailure("removeAdminMember", error, "Could not remove them."),
    };
  }

  revalidatePath("/admin/team");
  revalidatePath("/admin");
  return { ok: true, message: "Removed from the team." };
}

export type CandidateResult = {
  id: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  alreadyAdmin: boolean;
};

/**
 * Search, called from the add form as the owner types.
 *
 * Guarded here as well as inside searchForTeam. This is a public endpoint that
 * returns account names for a search term, and "it only reads" is how a people
 * search ends up available to anybody who knows the URL.
 */
export async function findForTeam(term: string): Promise<CandidateResult[]> {
  const identity = await adminIdentity();
  if (!identity.isOwner) return [];

  const { searchForTeam } = await import("@/lib/admin/team");
  return (await searchForTeam(term)) ?? [];
}
