import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../src/types/database.types";

export type Admin = SupabaseClient<Database>;

/** Service-role client for scripts. Requires env from .env.local — run the
 * scripts with `tsx --env-file=.env.local`. */
export function adminClient(): Admin {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run with `tsx --env-file=.env.local`.",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Verifies the tables a script needs actually exist, so a missing migration
 * fails fast with a clear message instead of a confusing partial run. */
export async function requireTables(admin: Admin, tables: string[]) {
  for (const table of tables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await admin.from(table as any).select("id").limit(1);
    // 42P01 = Postgres undefined_table; PGRST205 = PostgREST schema-cache miss.
    const missing =
      error &&
      (error.code === "42P01" ||
        error.code === "PGRST205" ||
        /does not exist|schema cache/i.test(error.message));
    if (missing) {
      throw new Error(
        `Table "${table}" not found. Apply the SQL migrations in supabase/migrations (see SETUP.md) before running this script.`,
      );
    }
  }
}

export async function listAllUserEmails(admin: Admin) {
  const emailToId = new Map<string, string>();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    for (const user of data.users) {
      if (user.email) emailToId.set(user.email.toLowerCase(), user.id);
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  return emailToId;
}
