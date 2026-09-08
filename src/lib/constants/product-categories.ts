import {
  Armchair,
  Briefcase,
  CookingPot,
  DoorOpen,
  Grid2x2,
  Grid3x3,
  House,
  Lightbulb,
  Package,
  PaintRoller,
  ShowerHead,
  Tractor,
  Tv,
  WashingMachine,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type {
  ProductCondition,
  StockStatus,
  UsedGrade,
} from "@/types/database.types";

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
  appliances: WashingMachine,
  electronics: Tv,
  tools: Wrench,
  machinery: Tractor,
  office: Briefcase,
  home: House,
  other: Package,
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

/**
 * Condition.
 *
 * The column decides which section of the marketplace a listing appears in, so
 * this is the vocabulary and not a display preference. Five values exist in
 * the database; two are offered on the form today, and `SELLABLE_CONDITIONS`
 * is the list the form reads — adding "Refurbished" later is one entry here
 * and no migration.
 */
export const CONDITIONS: Record<
  ProductCondition,
  { label: string; short: string; detail: string }
> = {
  new: {
    label: "New",
    short: "New",
    detail: "Unused, in its original condition.",
  },
  used: {
    label: "Used",
    short: "Used",
    detail: "Second-hand. The seller describes the wear.",
  },
  refurbished: {
    label: "Refurbished",
    short: "Refurbished",
    detail: "Repaired or restored, and tested before sale.",
  },
  open_box: {
    label: "Open box",
    short: "Open box",
    detail: "Unused, but the packaging has been opened.",
  },
  for_parts: {
    label: "For parts",
    short: "For parts",
    detail: "Not working. Sold for the parts that are.",
  },
};

/** What the listing form offers today. */
export const SELLABLE_CONDITIONS: ProductCondition[] = ["new", "used"];

export const USED_GRADES: Record<UsedGrade, { label: string; detail: string }> = {
  like_new: {
    label: "Like new",
    detail: "Barely used, no visible wear.",
  },
  good: {
    label: "Good",
    detail: "Used, works properly, light marks.",
  },
  fair: {
    label: "Fair",
    detail: "Clear signs of use, still does its job.",
  },
  needs_repair: {
    label: "Needs repair",
    detail: "Faulty or incomplete. Say what is wrong.",
  },
};

/**
 * Which marketplace section a listing belongs to.
 *
 * "Not new" rather than "is used", so refurbished, open-box and for-parts
 * listings land in the second-hand section the day the form offers them,
 * without a second rule to keep in step with this one.
 */
export function isSecondHand(condition: ProductCondition): boolean {
  return condition !== "new";
}

export const MARKETPLACE_SECTIONS = [
  { key: "new", label: "New Items", href: "/marketplace" },
  { key: "used", label: "Used Items", href: "/marketplace/used" },
  { key: "digital", label: "Digital Marketplace", href: "/designs" },
] as const;

export type MarketplaceSection = (typeof MARKETPLACE_SECTIONS)[number]["key"];
