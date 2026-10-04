import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AdminArea } from "@/types/database.types";

export { ADMIN_AREAS, AREA_HINT, AREA_LABEL } from "@/lib/auth/admin-areas-shape";

/**
 * What this administrator may do.
 *
 * One boolean was the right shape for one operator and the wrong shape the
 * moment a second person helps: somebody brought in to clear the report queue
 * should not also be able to restrict accounts or change prices.
 *
 * The answer comes from the database rather than from anything the browser
 * sends. `my_admin_areas` is a security-definer function reading a table no
 * session can write, so a permission cannot be forged by editing a cookie or
 * a request body.
 *
 * The owner holds everything implicitly — the function returns the full list
 * for them rather than a stored copy, because a stored copy is a second answer
 * to the same question and a chance for the two to disagree.
 */

export type AdminIdentity = {
  isAdmin: boolean;
  isOwner: boolean;
  areas: AdminArea[];
};

const NOBODY: AdminIdentity = { isAdmin: false, isOwner: false, areas: [] };

/** Who the caller is, as far as the control room is concerned. */
export async function adminIdentity(): Promise<AdminIdentity> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NOBODY;

  const [{ data: areas }, { data: owner }] = await Promise.all([
    supabase.rpc("my_admin_areas"),
    supabase.rpc("is_admin_owner"),
  ]);

  // A deployment that has not applied 0064 has neither function. That is not
  // an administrator and must not read as one.
  const held = (areas ?? []) as AdminArea[];
  const isOwner = owner === true;

  return {
    isAdmin: isOwner || held.length > 0,
    isOwner,
    areas: held,
  };
}

/** Whether the caller may act in this area. Asked on the server, every time. */
export async function canAdmin(area: AdminArea): Promise<boolean> {
  const identity = await adminIdentity();
  return identity.isOwner || identity.areas.includes(area);
}
