import Link from "next/link";
import { ArrowLeft, DatabaseZap, ServerCrash } from "lucide-react";

/**
 * The Agenda exists but the database cannot serve it.
 *
 * Almost always the migration has not been run. The old page returned
 * `notFound()` here, which told the owner of a project that their own private
 * record does not exist — a confident and wrong answer to a question about
 * schema. This says what is actually wrong and who can fix it.
 */
export function AgendaUnavailable({
  projectId,
  reason,
}: {
  projectId: string;
  reason: "not_installed" | "unavailable";
}) {
  const notInstalled = reason === "not_installed";

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <Link
        href={`/projects/${projectId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to the project
      </Link>

      <div className="space-y-3 rounded-2xl border p-6 text-center">
        {notInstalled ? (
          <DatabaseZap className="mx-auto size-6 text-amber-600 dark:text-amber-400" />
        ) : (
          <ServerCrash className="mx-auto size-6 text-muted-foreground" />
        )}

        <h1 className="text-lg font-medium">
          {notInstalled
            ? "Agenda is not set up on this database yet"
            : "Agenda is temporarily unavailable"}
        </h1>

        <p className="text-sm text-muted-foreground">
          {notInstalled ? (
            <>
              The project is fine — the Agenda tables have not been created.
              Run{" "}
              <code className="rounded bg-muted px-1">
                supabase/migrations/0024_agenda.sql
              </code>{" "}
              in the Supabase SQL editor, then reload this page.
            </>
          ) : (
            "The database did not answer. Nothing has been lost; try again in a moment."
          )}
        </p>

        <Link
          href={`/projects/${projectId}`}
          className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors hover:border-brand"
        >
          Return to the project
        </Link>
      </div>
    </div>
  );
}
