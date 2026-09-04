import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Reporting a database failure so somebody can act on it.
 *
 * Every write in this application used to end the same way:
 *
 *     if (error) return { error: "Could not create that listing." };
 *
 * That sentence is true and worthless. It cannot distinguish a missing
 * migration from a rejected policy from a bad enum value, and all three have
 * completely different fixes. The information needed to tell them apart was in
 * the `error` object, and was thrown away one line after arriving.
 *
 * ## The two audiences
 *
 * A stranger who fails to create a listing should be told the listing was not
 * created, not the name of a column. A developer needs the column.
 *
 * So the full error is *always* logged on the server, where only the operator
 * can read it, and the detail is put in front of the user only when
 * `NODE_ENV !== "production"`. Nothing here depends on the caller remembering
 * to do either — passing the error to this function is the whole contract.
 */

/** What Postgres said, kept together so nothing is dropped in transit. */
export type DatabaseFailure = {
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
};

export function toFailure(error: PostgrestError | null): DatabaseFailure | null {
  if (!error) return null;
  return {
    message: error.message,
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
}

/**
 * The plain-English cause, where the code is unambiguous.
 *
 * Not a translation of every SQLSTATE — only the handful where the generic
 * message actively misleads. `42501` in particular reads as though the data
 * was wrong when the data was fine and the *policy* refused it, and those two
 * send you to opposite ends of the codebase.
 */
function explain(failure: DatabaseFailure): string | null {
  switch (failure.code) {
    case "42501":
      return "The database refused this write under its row-level security policies. The payload is fine; the current user is not allowed to insert this row.";
    case "42703":
      return "The database does not have a column this code writes to. A migration has not been applied.";
    case "42P01":
      return "The table does not exist. A migration has not been applied.";
    case "PGRST204":
      return "PostgREST does not know about a column this code writes to — usually a migration applied but the schema cache not yet reloaded.";
    case "PGRST205":
      return "PostgREST does not know about this table. A migration has not been applied, or the schema cache is stale.";
    case "23502":
      return "A required column was sent as null.";
    case "23503":
      return "A referenced row does not exist (foreign key).";
    case "23505":
      return "A row with this unique value already exists.";
    case "23514":
      return "A check constraint rejected one of the values.";
    case "22P02":
      return "A value was not of the type the column expects — often an object where a string was wanted, or an invalid UUID.";
    default:
      return null;
  }
}

/**
 * Logs the failure and returns what to show.
 *
 * `label` names the operation, so a log line is greppable without a stack:
 * "CREATE LISTING ERROR" beats "error" in a production log with a thousand
 * lines a minute.
 */
export function reportFailure(
  label: string,
  error: PostgrestError | null,
  fallback: string,
): string {
  const failure = toFailure(error);

  if (!failure) {
    // A write that reports no error and no row is its own bug, and one that is
    // very easy to stare past — so it gets a log line of its own rather than
    // being folded into the generic message.
    console.error(`${label}: no error was returned, and no row came back.`);
    return fallback;
  }

  console.error(`${label}:`, {
    message: failure.message,
    code: failure.code,
    details: failure.details,
    hint: failure.hint,
    // Some clients return an error with none of those set, which printed as
    // `{}` and said nothing at all. The original is kept so there is always
    // something to read.
    ...(failure.message || failure.code || failure.details || failure.hint
      ? {}
      : { raw: error }),
  });

  if (process.env.NODE_ENV === "production") {
    // The code is safe to show and turns a support conversation from "it
    // didn't work" into something searchable. It reveals nothing about the
    // schema on its own.
    return failure.code ? `${fallback} (${failure.code})` : fallback;
  }

  return [
    fallback,
    "",
    explain(failure),
    `message: ${failure.message}`,
    failure.code ? `code: ${failure.code}` : null,
    failure.details ? `details: ${failure.details}` : null,
    failure.hint ? `hint: ${failure.hint}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}
