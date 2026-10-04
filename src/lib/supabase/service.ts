import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/types/database.types";

/** Service-role client that bypasses RLS. Server-only — never import into a
 * client component. Used for privileged operations like approving a verified
 * business claim (grants ownership, which owner-only RLS would otherwise
 * block). */
export function createServiceClient() {
  return createSupabaseClient<Database>(
    supabaseUrl(),
    supabaseServiceRoleKey(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
