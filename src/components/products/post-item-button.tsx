import Link from "next/link";
import { Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProductCondition } from "@/types/database.types";

/**
 * "Post an item", on the page somebody is already looking at.
 *
 * Listing something was reachable from the sidebar, the dashboard, the feed
 * composer and the floating button — everywhere except the marketplace itself.
 * Somebody browsing Used Items who decides to sell their own sofa had to leave
 * the page and find the form somewhere else, which is the moment most people
 * do not bother.
 *
 * `condition` carries through to the form, so arriving from Used Items opens
 * the form already set to Used. That is the difference between two taps and
 * five, and it is also what stops second-hand goods being posted as new by
 * somebody who did not notice the field.
 */
export function PostItemButton({
  condition = "new",
  label,
  className,
  variant = "default",
}: {
  condition?: ProductCondition;
  label?: string;
  className?: string;
  variant?: "default" | "outline" | "secondary";
}) {
  const href =
    condition === "new"
      ? "/products/new"
      : `/products/new?condition=${condition}`;

  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant }),
        "min-h-11 w-full sm:w-auto",
        className,
      )}
    >
      <Plus data-icon="inline-start" />
      {label ?? (condition === "new" ? "Post an item" : "Sell something used")}
    </Link>
  );
}
