import "server-only";

import { isAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * The people on the platform, as an operator needs to see them.
 *
 * The same `profiles` rows the public site reads. No copy, no admin-only
 * mirror: an account shown here and on its own profile page is one record, so
 * restricting it here restricts it there.
 */

export type Person = {
  id: string;
  username: string | null;
  fullName: string | null;
  companyName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  restrictedUntil: string | null;
  restrictionReason: string | null;
  createdAt: string | null;
};

export async function listPeople(search = ""): Promise<Person[] | null> {
  if (!(await isAdmin())) return null;

  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select("id, username, full_name, company_name, avatar_url, is_admin, restricted_until, restriction_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const term = search.trim();
  if (term) {
    // Name or handle, which is what an operator has when somebody reports an
    // account. Escaped for the pattern so a comma or a bracket in the term
    // cannot change the filter's shape.
    const safe = term.replace(/[%_,()]/g, " ");
    query = query.or(`username.ilike.%${safe}%,full_name.ilike.%${safe}%,company_name.ilike.%${safe}%`);
  }

  const { data } = await query;

  return (data ?? []).map((row) => ({
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    companyName: row.company_name,
    avatarUrl: row.avatar_url,
    isAdmin: row.is_admin ?? false,
    restrictedUntil: row.restricted_until,
    restrictionReason: row.restriction_reason,
    createdAt: row.created_at,
  }));
}
