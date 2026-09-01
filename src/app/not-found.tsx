import Link from "next/link";
import { Compass, Home } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border bg-muted/40 text-muted-foreground">
        <Compass className="size-7" aria-hidden />
      </div>
      <p className="mt-6 text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
        This page could not be found
      </h1>
      <p className="mt-3 max-w-md text-balance text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
        Let&apos;s get you back on track.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          <Home aria-hidden />
          Back to home
        </Link>
        <Link
          href="/marketplace"
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Browse marketplace
        </Link>
      </div>
    </main>
  );
}
