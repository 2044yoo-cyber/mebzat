"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error to the browser console / monitoring in all
    // environments. Guarded so a reporting failure can never throw out of the
    // boundary that is already handling an error.
    try {
      console.error(error);
    } catch {
      // Reporting is best-effort; the fallback UI below still renders.
    }
  }, [error]);

  return (
    <main className="flex min-h-[70vh] flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border bg-destructive/10 text-destructive">
        <TriangleAlert className="size-7" aria-hidden />
      </div>
      <h1 className="mt-6 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
        Something went wrong
      </h1>
      <p className="mt-3 max-w-md text-balance text-muted-foreground">
        An unexpected error occurred while loading this page. You can try again,
        or head back to the home page.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-muted-foreground/70">
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" onClick={() => reset()}>
          <RotateCcw aria-hidden />
          Try again
        </Button>
        <Link
          href="/"
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
