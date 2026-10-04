"use server";

import { revalidatePath } from "next/cache";

import { canAdmin } from "@/lib/auth/admin-areas";
import { createClient } from "@/lib/supabase/server";

/**
 * Verifying a price, or rejecting it.
 *
 * `data_status` is the whole of a price's authority. Moving a row to
 * `admin_verified` promotes it above the marketplace average in the resolver,
 * which means it starts appearing on estimates and bills of quantities that
 * people quote from. That is a real act with real consequences, so it is a
 * deliberate server action with an admin check rather than an inline edit.
 *
 * ## Why the check is here as well as in the policy
 *
 * The row-level policy on `material_prices` already restricts writes. This
 * repeats the check because a policy failure returns zero affected rows, which
 * looks exactly like success to a caller that does not inspect the count — and
 * a verification screen that silently does nothing is worse than one that
 * refuses.
 */

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false as const, error: "Sign in first." };

  if (!(await canAdmin("prices"))) {
    return { ok: false as const, error: "Administrators only." };
  }

  return { ok: true as const, supabase, userId: user.id };
}

export async function verifyPrice(id: string) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  // `verified_by` and `verified_at` are not optional: the table has a check
  // constraint requiring both whenever the status is admin_verified, so a
  // partial update is rejected by PostgreSQL rather than producing a verified
  // row nobody signed.
  // `select` after the update so the rows actually changed come back. A policy
  // failure returns an empty array rather than an error, and treating that as
  // success is how a verification screen ends up silently doing nothing.
  const { data, error } = await gate.supabase
    .from("material_prices")
    .update({
      data_status: "admin_verified",
      verified_by: gate.userId,
      verified_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");

  if (error) return { ok: false as const, error: "Could not verify that price." };
  if (!data?.length) {
    return { ok: false as const, error: "That price could not be updated." };
  }

  revalidatePath("/admin/prices");
  return { ok: true as const };
}

/**
 * Sends a price back rather than deleting it.
 *
 * Nothing is removed. A rejected submission is still a record that somebody
 * quoted that figure on that date, and the price book's whole value is that it
 * does not have holes in it. `web_sourced` is the honest resting place for a
 * submission an administrator did not want to stand behind: it stays visible,
 * it stays below the marketplace average in the resolver, and it is labelled
 * as unverified everywhere it appears.
 */
export async function rejectPrice(id: string, note?: string) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const { data, error } = await gate.supabase
    .from("material_prices")
    .update({
      data_status: "web_sourced",
      notes: note?.trim() ? note.trim().slice(0, 500) : null,
    })
    .eq("id", id)
    .select("id");

  if (error) return { ok: false as const, error: "Could not update that price." };
  if (!data?.length) {
    return { ok: false as const, error: "That price could not be updated." };
  }

  revalidatePath("/admin/prices");
  return { ok: true as const };
}
