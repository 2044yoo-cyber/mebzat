import "server-only";

import { adminIdentity } from "@/lib/auth/admin-areas";
import { createClient } from "@/lib/supabase/server";
import type { AdminArea } from "@/types/database.types";

/**
 * The administrators, and what each of them holds.
 *
 * Only the main administrator can see this. Not because the list is a secret
 * from the others — they can read the table, the policy allows it — but
 * because a page whose only controls are ones you cannot use is a page that
 * teaches people to try the buttons.
 *
 * `admin_members.user_id` references auth.users, not profiles, so there is no
 * foreign key for PostgREST to embed across. The names are fetched in a second
 * query keyed by the ids. That is one extra round trip on a list that is a
 * handful of rows and will stay a handful of rows.
 */

export type TeamMember = {
  userId: string;
  isOwner: boolean;
  areas: AdminArea[];
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  grantedAt: string | null;
};

export async function listTeam(): Promise<TeamMember[] | null> {
  const identity = await adminIdentity();
  if (!identity.isOwner) return null;

  const supabase = await createClient();

  const { data: members, error } = await supabase
    .from("admin_members")
    .select("user_id, is_owner, areas, created_at")
    .order("is_owner", { ascending: false })
    .order("created_at", { ascending: true });

  // A database that cannot answer is not an empty team. An empty list would
  // read as "nobody is an administrator", which is never true here — the
  // person reading it is one.
  if (error) return null;

  const rows = members ?? [];
  if (rows.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url")
    .in("id", rows.map((row) => row.user_id));

  const byId = new Map((profiles ?? []).map((one) => [one.id, one]));

  return rows.map((row) => {
    const profile = byId.get(row.user_id);
    return {
      userId: row.user_id,
      isOwner: row.is_owner,
      areas: row.areas,
      username: profile?.username ?? null,
      fullName: profile?.full_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      grantedAt: row.created_at,
    };
  });
}

export type TeamCandidate = {
  id: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  alreadyAdmin: boolean;
};

/** People the owner could bring in, found by name or handle. */
export async function searchForTeam(term: string): Promise<TeamCandidate[] | null> {
  const identity = await adminIdentity();
  if (!identity.isOwner) return null;

  const query = term.trim();
  if (query.length < 2) return [];

  const supabase = await createClient();

  // Escaped for the pattern so a comma or a bracket in the term cannot change
  // the filter's shape.
  const safe = query.replace(/[%_,()]/g, " ");
  const { data } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url, is_admin")
    .or(`username.ilike.%${safe}%,full_name.ilike.%${safe}%`)
    .limit(8);

  return (data ?? []).map((row) => ({
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    alreadyAdmin: row.is_admin === true,
  }));
}
