import Link from "next/link";

import { PRICE_SECTORS } from "@/lib/constants/price-exchange";
import { cn } from "@/lib/utils";
import type { PriceSector } from "@/types/database.types";

/**
 * The four market tabs.
 *
 * Links rather than a Tabs widget, because the sector belongs in the URL: a
 * shared link should open the same market, and switching sectors should be a
 * fresh server render with the right facets rather than a client filter over
 * rows that were never fetched.
 */
export function SectorTabs({ active }: { active: PriceSector }) {
  return (
    <nav
      aria-label="Price sectors"
      className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {PRICE_SECTORS.map((sector) => {
        const current = sector.value === active;
        return (
          <Link
            key={sector.value}
            href={`/price-exchange?sector=${sector.value}`}
            aria-current={current ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-xl border px-4 py-2.5 text-left transition-colors",
              current
                ? "border-brand bg-brand/5"
                : "hover:border-brand hover:bg-brand/5",
            )}
          >
            <span
              className={cn(
                "block text-sm font-medium",
                current && "text-brand",
              )}
            >
              {sector.label}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {sector.blurb}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
