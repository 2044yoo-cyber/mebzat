"use server";

import { revalidatePath } from "next/cache";

import { canAdmin } from "@/lib/auth/admin-areas";
import { reportFailure } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import type { PropertyStatus } from "@/types/database.types";

/**
 * Taking a listing down, and putting it back.
 *
 * There is no admin-only "hidden" flag, and adding one would have been the
 * mistake: `properties.status` already decides whether a listing is public,
 * and the public queries already read it. `withdrawn` is the value the site
 * already understands as "not on the market", so an operator withdrawing a
 * listing here is the same state a seller reaches by withdrawing it
 * themselves — one record, one meaning, no second vocabulary.
 *
 * Restoring puts it back to `available`. The previous status is not
 * remembered: a listing that was `under_offer` before it was withdrawn should
 * not silently return to that, because the offer is months stale by then and
 * nobody restoring it means "and reinstate the offer".
 */

export type PropertyResult = { ok: boolean; message: string };

const DENIED: PropertyResult = { ok: false, message: "Not permitted." };

async function setStatus(
  id: string,
  status: PropertyStatus,
  message: string,
): Promise<PropertyResult> {
  if (!(await canAdmin("properties"))) return DENIED;

  const supabase = await createClient();
  const { error } = await supabase
    .from("properties")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return {
      ok: false,
      message: reportFailure("adminSetPropertyStatus", error, "Could not do that."),
    };
  }

  revalidatePath("/admin/properties");
  revalidatePath(`/property/${id}`);
  revalidatePath("/city");
  return { ok: true, message };
}

export async function withdrawProperty(id: string): Promise<PropertyResult> {
  return setStatus(id, "withdrawn", "Taken off the market.");
}

export async function restoreProperty(id: string): Promise<PropertyResult> {
  return setStatus(id, "available", "Back on the market.");
}
