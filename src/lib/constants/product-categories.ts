import {
  Armchair,
  CookingPot,
  DoorOpen,
  Grid2x2,
  Grid3x3,
  House,
  Lightbulb,
  Package,
  PaintRoller,
  ShowerHead,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { StockStatus } from "@/types/database.types";

/** Mirrors the product_categories seed in 0005_marketplace.sql. The DB is the
 * source of truth for category_id; this map supplies the icon + display order
 * for the homepage and filter chips without a per-icon DB lookup. */
export const PRODUCT_CATEGORY_ICONS: Record<string, LucideIcon> = {
  furniture: Armchair,
  kitchen: CookingPot,
  bathroom: ShowerHead,
  lighting: Lightbulb,
  doors: DoorOpen,
  windows: Grid2x2,
  roofing: House,
  paint: PaintRoller,
  flooring: Grid3x3,
  electrical: Zap,
  "construction-materials": Package,
};

export function categoryIcon(slug: string | null | undefined): LucideIcon {
  return (slug && PRODUCT_CATEGORY_ICONS[slug]) || Package;
}

export const STOCK_STATUS: Record<
  StockStatus,
  { label: string; tone: "positive" | "muted" | "negative" }
> = {
  in_stock: { label: "In stock", tone: "positive" },
  made_to_order: { label: "Made to order", tone: "muted" },
  out_of_stock: { label: "Out of stock", tone: "negative" },
};

export const PRODUCT_SORTS = {
  popular: "Most popular",
  newest: "Newest",
  price_asc: "Price: Low to High",
  price_desc: "Price: High to Low",
} as const;

export type ProductSort = keyof typeof PRODUCT_SORTS;

export function isProductSort(value: string | null | undefined): value is ProductSort {
  return !!value && value in PRODUCT_SORTS;
}
