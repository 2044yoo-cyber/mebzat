"use client";

import { BadgeCheck, Sparkles } from "lucide-react";

import {
  listingBadges,
  type SellerKind,
} from "@/lib/property/listing";
import { cn } from "@/lib/utils";

/**
 * Who is selling and what has been checked.
 *
 * The same component on the property page, the map hover card and the search
 * result, so a listing cannot look verified in one place and not another.
 */
export function ListingBadges({
  sellerKind,
  listingVerified = false,
  sellerVerified = false,
  isPremium = false,
  isCompany = false,
  isSample = false,
  size = "normal",
  className,
}: {
  sellerKind: SellerKind | null;
  listingVerified?: boolean;
  sellerVerified?: boolean;
  isPremium?: boolean;
  isCompany?: boolean;
  isSample?: boolean;
  size?: "small" | "normal";
  className?: string;
}) {
  const badges = listingBadges({
    sellerKind,
    listingVerified,
    sellerVerified,
    isPremium,
    isCompany,
    isSample,
  });

  if (badges.length === 0) return null;

  return (
    <ul className={cn("flex flex-wrap gap-1", className)}>
      {badges.map((badge) => (
        <li
          key={badge.id}
          title={badge.title}
          className={cn(
            "flex items-center gap-1 rounded-full border font-medium",
            size === "small" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-[11px]",
            badge.tone === "verified" &&
              "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
            badge.tone === "premium" &&
              "border-amber-500/40 text-amber-600 dark:text-amber-400",
            badge.tone === "seller" && "text-muted-foreground",
            // Filled rather than outlined, unlike every other badge. A sample
            // listing has to be distinguishable at a glance in a grid, and an
            // outline reads as one more attribute rather than as a warning.
            badge.tone === "demo" &&
              "border-transparent bg-amber-500 text-amber-950 tracking-wide",
          )}
        >
          {badge.tone === "verified" && <BadgeCheck className="size-3" />}
          {badge.tone === "premium" && <Sparkles className="size-3" />}
          {badge.label}
        </li>
      ))}
    </ul>
  );
}
