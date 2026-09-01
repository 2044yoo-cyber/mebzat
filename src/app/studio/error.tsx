"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * The studio's own error boundary.
 *
 * Without one, a failure inside this route falls through to the root boundary
 * and — when that cannot render either — to a bare "Internal Server Error"
 * with the real message left in a terminal. That is the least useful thing a
 * page can say.
 *
 * The digest is the only handle on the server-side message: Next.js
 * deliberately does not send the stack to the browser in production, and the
 * digest is what matches this page to the line in the server log.
 */
export default function StudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[berchuma] studio failed to render", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-lg p-6">
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
        <h1 className="text-lg font-semibold">Berchuma Studio did not load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something failed while building this page. Your saved designs are not
          affected — they live in the database, not in this page.
        </p>

        <p className="mt-3 rounded-lg bg-muted p-2 font-mono text-xs break-words">
          {error.message || "No message was provided."}
          {error.digest ? (
            <>
              <br />
              digest: {error.digest}
            </>
          ) : null}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <Link
            href="/designs"
            className="flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
          >
            Your designs
          </Link>
        </div>
      </div>
    </div>
  );
}
