import { createElement } from "react";

import { categoryIcon } from "@/lib/constants/product-categories";

/** Renders the lucide icon for a product category slug. Uses createElement so
 * the dynamically-selected icon isn't assigned to a render-scope variable. */
export function CategoryIcon({
  slug,
  className,
}: {
  slug?: string | null;
  className?: string;
}) {
  return createElement(categoryIcon(slug), { className });
}
