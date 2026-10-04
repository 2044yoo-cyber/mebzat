import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/types/database.types";

export async function createClient() {
  const cookieStore = await cookies();

  // Through the helpers, not `process.env.X!`. The non-null assertion is a
  // promise the environment does not keep: when it is broken @supabase/ssr
  // answers "Your project's URL and Key are required", which does not say
  // which one, where it goes, or that Vercel needs a rebuild rather than a
  // restart. env.ts was written to say all three and then was not used here —
  // so every page in the application returned the unhelpful version.
  return createServerClient<Database>(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component during render, where cookies
            // can't be set. The proxy refreshes the session on every
            // request, so this is safe to ignore.
          }
        },
      },
    },
  );
}
