"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { ChevronRight } from "lucide-react";

import { breadcrumbsFor } from "@/lib/workspace/navigation";

/**
 * The trail across the top of the workspace.
 *
 * Derived from the manifest rather than stored, so it can never disagree with
 * the sidebar about where the user is. On narrow screens everything but the
 * last two crumbs is dropped — the trail's job there is to say "you are here",
 * not to draw the whole path.
 */
export function Breadcrumbs() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();

  const crumbs = useMemo(
    () => breadcrumbsFor(pathname, searchParams),
    [pathname, searchParams],
  );

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          const early = index < crumbs.length - 2;
          return (
            <li
              key={`${crumb.label}-${index}`}
              className={early ? "hidden min-w-0 items-center md:flex" : "flex min-w-0 items-center"}
            >
              {index > 0 && (
                <ChevronRight
                  aria-hidden
                  className="mr-1 size-3.5 shrink-0 text-muted-foreground/60"
                />
              )}
              {crumb.href && !last ? (
                <Link
                  href={crumb.href}
                  className="truncate text-muted-foreground transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={
                    last
                      ? "truncate font-medium text-foreground"
                      : "truncate text-muted-foreground"
                  }
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
