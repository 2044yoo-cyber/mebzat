/**
 * The Supabase connection details, checked before they are used.
 *
 * Every client factory in this folder used to read `process.env.X!` — a
 * non-null assertion over a variable that is very often null. When it is,
 * `@supabase/ssr` throws "Your project's URL and Key are required to create a
 * Supabase client!", which is true and useless: it does not say which of the
 * two is missing, which file it should be in, or that the dev server has to be
 * restarted after you add it.
 *
 * Worse, the proxy creates a client on *every* request, so one missing variable
 * takes down every page in the application with that message — including the
 * pages that would have explained how to fix it.
 *
 * No `server-only`: the browser client needs these too.
 *
 * ## Why the reads are written out literally
 *
 * `process.env.NEXT_PUBLIC_SUPABASE_URL` is substituted for its value at build
 * time. That substitution is textual — it only happens where the full property
 * access appears in the source. `process.env[name]` with a variable `name`
 * survives into the bundle as a lookup against an object that does not exist in
 * the browser, and reads as `undefined` no matter what is in `.env.local`. So
 * each variable is spelled out, once, and the tidier loop is not available.
 * It is also why the two accepted spellings below are written as an explicit
 * `??` of two literal reads rather than a list to iterate.
 *
 * ## Two names for the same key
 *
 * Supabase renamed its API keys: `anon` became `publishable`, `service_role`
 * became `secret`. Both work with @supabase/ssr — the change is what they are
 * called, not what they do. A project created before the rename hands out the
 * old names; the Vercel integration installs the new ones. Reading both means
 * the same code runs against either, which is the difference between a
 * deployment that works and one that answers every request with "Your
 * project's URL and Key are required" until somebody copies a secret between
 * two dashboards by hand.
 */

/** Where the answer lives, on every platform. */
const FIX =
  "Add it to .env.local in the project root, then stop and restart the dev server — Next.js only reads .env.local at startup. On Vercel, add it under Settings → Environment Variables and redeploy: NEXT_PUBLIC_ values are compiled into the bundle, so an existing build will not pick it up.";

function missing(name: string): never {
  throw new Error(
    `Supabase is not configured: ${name} is missing or empty. ${FIX}`,
  );
}

/** The project URL. Public — it appears in the browser bundle by design. */
export function supabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) missing("NEXT_PUBLIC_SUPABASE_URL");
  return value;
}

/**
 * The anon key. Public, and safe to be: it carries no privileges beyond what
 * row-level security grants an anonymous visitor.
 */
export function supabaseAnonKey(): string {
  const value =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!value) {
    missing("NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)");
  }
  return value;
}

/**
 * The service-role key, which bypasses row-level security entirely.
 *
 * Never `NEXT_PUBLIC_`. If this ever appears in a browser bundle, anybody can
 * read and write every table in the project, so the name is checked rather than
 * assumed: reading it through the same helper as the others would make it one
 * careless rename away from being public.
 */
export function supabaseServiceRoleKey(): string {
  const value =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!value) missing("SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)");
  return value;
}

/**
 * True when the two public variables are both set.
 *
 * For pages that would rather show a configuration notice than throw. Does not
 * check the service-role key — a page has no business knowing whether that is
 * present.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  );
}
