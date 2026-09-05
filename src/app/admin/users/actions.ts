"use server";

import { revalidatePath } from "next/cache";

import { isAdmin } from "@/lib/auth/admin";
import { reportFailure } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Restricting and reinstating an account.
 *
 * The write goes through `set_account_restriction`, the security-definer
 * function from 0063, rather than an UPDATE from here. That is deliberate: a
 * trigger refuses the column to any API session, so there is exactly one path
 * that can set it and that path checks the caller is an admin itself. An
 * UPDATE from this file would be refused — which is the point.
 *
 * isAdmin is re-checked here as well. A server action is a public endpoint
 * with a URL; the button living behind the admin layout is not the gate.
 */

export type AdminResult = { ok: boolean; message: string };

const DENIED: AdminResult = { ok: false, message: "Not permitted." };

/** A week is long enough to matter and short enough to be a mistake somebody
 * can wait out while an appeal is read. */
const DEFAULT_DAYS = 7;

export async function restrictAccount(
  userId: string,
  reason: string,
  days = DEFAULT_DAYS,
): Promise<AdminResult> {
  if (!(await isAdmin())) return DENIED;

  const trimmed = reason.trim();
  if (!trimmed) {
    // Without one the person cannot tell what to stop doing, and the appeal is
    // an argument with nothing to argue about.
    return { ok: false, message: "Give a reason. The account holder is told it." };
  }

  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_account_restriction", {
    target: userId,
    until,
    reason: trimmed,
  });

  if (error) {
    return { ok: false, message: reportFailure("restrictAccount", error, "Could not do that.") };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: `Restricted for ${days} days.` };
}

export async function reinstateAccount(userId: string): Promise<AdminResult> {
  if (!(await isAdmin())) return DENIED;

  const supabase = await createClient();
  // Null lifts it. The generated signature types `until` as a string because
  // the function's parameter has no default; the database takes null and
  // treats it as "not restricted", which is the whole of reinstating.
  const { error } = await supabase.rpc("set_account_restriction", {
    target: userId,
    until: null as unknown as string,
    reason: null as unknown as string,
  });

  if (error) {
    return { ok: false, message: reportFailure("reinstateAccount", error, "Could not do that.") };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: "Reinstated." };
}
