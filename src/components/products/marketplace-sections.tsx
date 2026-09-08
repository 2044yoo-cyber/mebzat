import Link from "next/link";

import { MARKETPLACE_SECTIONS, type MarketplaceSection } from "@/lib/constants/product-categories";
import { cn } from "@/lib/utils";

/**
 * New Items · Used Items · Digital Marketplace.
 *
 * Three links, not three product systems. New and Used are the same table read
 * with a different `condition`; Digital is Berchuma's design catalogue, which
 * already existed — pointing at it beats building a fourth marketplace to sit
 * beside three that work.
 */
export function MarketplaceSections({
  active,
  className,
}: {
  active: MarketplaceSection;
  className?: string;
}) {
  return (
    <nav
      aria-label="Marketplace sections"
      className={cn("flex gap-1 overflow-x-auto rounded-full border p-1", className)}
    >
      {MARKETPLACE_SECTIONS.map((section) => (
        <Link
          key={section.key}
          href={section.href}
          aria-current={section.key === active ? "page" : undefined}
          className={cn(
            "flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm transition-colors",
            section.key === active
              ? "bg-brand text-brand-foreground font-medium"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
