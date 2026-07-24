import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Server-friendly, URL-driven pagination. `makeHref` builds the href for a
 * given page so callers control how the page param merges into their URL. */
export function Pagination({
  page,
  pageSize,
  total,
  makeHref,
}: {
  page: number;
  pageSize: number;
  total: number;
  makeHref: (page: number) => string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  const pages = pageRange(page, pageCount);

  return (
    <nav
      className="flex items-center justify-center gap-1"
      aria-label="Pagination"
    >
      {page > 1 ? (
        <Link
          href={makeHref(page - 1)}
          className={buttonVariants({ variant: "outline", size: "icon" })}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Link>
      ) : (
        <span
          className={cn(
            buttonVariants({ variant: "outline", size: "icon" }),
            "pointer-events-none opacity-50",
          )}
          aria-hidden
        >
          <ChevronLeft className="size-4" />
        </span>
      )}

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-2 text-muted-foreground">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={makeHref(p)}
            aria-current={p === page ? "page" : undefined}
            className={buttonVariants({
              variant: p === page ? "default" : "outline",
              size: "icon",
            })}
          >
            {p}
          </Link>
        ),
      )}

      {page < pageCount ? (
        <Link
          href={makeHref(page + 1)}
          className={buttonVariants({ variant: "outline", size: "icon" })}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span
          className={cn(
            buttonVariants({ variant: "outline", size: "icon" }),
            "pointer-events-none opacity-50",
          )}
          aria-hidden
        >
          <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  );
}

function pageRange(current: number, count: number): (number | "…")[] {
  const delta = 1;
  const range: (number | "…")[] = [];
  const left = Math.max(2, current - delta);
  const right = Math.min(count - 1, current + delta);

  range.push(1);
  if (left > 2) range.push("…");
  for (let i = left; i <= right; i++) range.push(i);
  if (right < count - 1) range.push("…");
  if (count > 1) range.push(count);

  return range;
}
