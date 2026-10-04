import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Operator access.
 *
 * There is exactly one privilege in Medosha: reading the operational view of
 * the deployment — which provider keys are rejected, which accounts are out of
 * credit, what each provider last failed with. That is infrastructure detail
 * about the server, not about the reader, so it is gated.
 *
 * The flag is a column on `profiles` that no authenticated session can write
 * (a trigger refuses it), so an admin is made by someone with database access
 * and never by a request.
 */

export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  // A database that cannot answer is not permission to proceed.
  if (error) return false;
  return data?.is_admin === true;
}
