"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Last line of defence for the map page.
 *
 * The map is built so that no failed request can reach here — tiles, the
 * vector style and the property fetch are all handled where they happen. This
 * exists so that if something unforeseen does throw, the page shows a way
 * forward instead of a blank screen.
 */
export default function CityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[medosha:city] unhandled error:", error);
  }, [error]);

  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
        <AlertTriangle className="size-6" />
      </span>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          The map could not start
        </h1>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          Something failed while loading this page. The rest of Medosha is
          unaffected.
        </p>
      </div>

      {/* The message is shown rather than hidden: on a self-hosted install the
          person seeing this is usually the person who can fix it. */}
      <code className="max-w-lg overflow-x-auto rounded-lg bg-muted px-3 py-2 text-left text-xs">
        {error.message}
        {error.digest ? ` (${error.digest})` : ""}
      </code>

      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>
          <RotateCw className="size-4" />
          Try again
        </Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Back to Medosha
        </Link>
      </div>
    </div>
  );
}
