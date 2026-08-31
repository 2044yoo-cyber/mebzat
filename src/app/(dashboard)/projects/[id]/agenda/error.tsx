"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowLeft, RotateCcw, ServerCrash } from "lucide-react";

/**
 * When the Agenda throws.
 *
 * Deliberately says nothing about *what* threw. This is a private record and
 * the message could name a table, a policy or a column; the digest is enough
 * for the operator to find it in the server log, and the reader gets a way
 * back rather than a stack trace.
 */
export default function AgendaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[medosha:agenda] page error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <div className="space-y-3 rounded-2xl border p-6 text-center">
        <ServerCrash className="mx-auto size-6 text-muted-foreground" />
        <h1 className="text-lg font-medium">This Agenda could not be opened</h1>
        <p className="text-sm text-muted-foreground">
          Something went wrong loading the record. Nothing has been changed —
          Agenda never deletes, so whatever is stored is still stored.
        </p>

        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
          >
            <RotateCcw className="size-4" />
            Try again
          </button>
          <Link
            href="/projects"
            className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors hover:border-brand"
          >
            <ArrowLeft className="size-4" />
            All projects
          </Link>
        </div>

        {error.digest && (
          <p className="pt-1 font-mono text-xs text-muted-foreground">
            Reference {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
