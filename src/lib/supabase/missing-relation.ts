import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Whether this failure is simply a migration that has not been applied yet.
 *
 * A feature added behind a new table has to render as absent on a deployment
 * that has not run its migration — the convention this codebase already
 * follows in src/lib/data/buildings.ts, so a listing without the buildings
 * table shows as a standalone listing rather than an error.
 *
 * Buildings does it by discarding every error, which is the habit that cost
 * several rounds of debugging a 404 whose cause was sitting in the error
 * object. This separates the two: an absent table is expected and silent, and
 * every other failure is still reported.
 *
 * Postgres says 42P01 for a relation that does not exist. PostgREST says
 * PGRST205 when it is not in the schema cache, which is what an unapplied
 * migration looks like through the API. The text check is a fallback for the
 * clients that return neither — one of which reported an error with no fields
 * set at all, printing as `{}` and saying nothing.
 *
 * Deliberately not in errors.ts: that module is `server-only`, and this is a
 * pure predicate that the checks need to be able to import.
 */
export function isMissingRelation(error: PostgrestError | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;

  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`
    .toLowerCase();

  return (
    text.includes("does not exist") ||
    text.includes("schema cache") ||
    text.includes("could not find the table")
  );
}
