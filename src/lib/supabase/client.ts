import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database.types";

/**
 * The browser's Supabase client.
 *
 * These two values used to be read with `!`, which told TypeScript they were
 * definitely present and told a developer nothing when they were not. Missing
 * configuration then surfaced as `createBrowserClient(undefined, undefined)`
 * throwing from inside whatever handler happened to call it — a dead button, a
 * form that does nothing, a page that half-renders. The cause is one variable
 * absent from `.env.local`; the symptom is somewhere else entirely.
 *
 * So the check is explicit and the error names the variable. Both are
 * `NEXT_PUBLIC_`, which means they are meant to reach the browser and there is
 * nothing secret about either — the anon key is public by design and the URL is
 * in every network request. Naming them costs nothing and saves an afternoon.
 *
 * The service-role key is a different matter and never appears here.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new SupabaseConfigError(missing as string[]);
  }

  return createBrowserClient<Database>(url!, anonKey!);
}

/**
 * A named error, so a caller can tell "nothing is configured" apart from
 * "Supabase said no".
 *
 * Those need different responses: one is a developer's `.env.local`, the other
 * is a project setting or a user's own account, and a handler that treats them
 * alike gives the wrong advice to whoever is looking at the screen.
 */
export class SupabaseConfigError extends Error {
  constructor(readonly missing: string[]) {
    super(
      `Supabase is not configured. Missing from .env.local: ${missing.join(", ")}. ` +
        `Restart the dev server after adding them — Next reads env files at startup.`,
    );
    this.name = "SupabaseConfigError";
  }
}
