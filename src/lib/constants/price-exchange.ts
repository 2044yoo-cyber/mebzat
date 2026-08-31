import type { PriceSector } from "@/types/database.types";

/**
 * Labels for the Construction Price Exchange.
 *
 * Kept out of the data module so client components can import them without
 * pulling in `server-only`.
 */

export const PRICE_SECTORS = [
  { value: "material", label: "Materials", blurb: "Cement, rebar, blocks, finishes" },
  { value: "labor", label: "Labor", blurb: "Daily and contract rates by trade" },
  { value: "furniture", label: "Furniture", blurb: "Fittings, joinery, fixtures" },
  { value: "project", label: "Projects", blurb: "Rates per m² by building type" },
] as const satisfies readonly { value: PriceSector; label: string; blurb: string }[];

export const DEFAULT_SECTOR: PriceSector = "material";

export function isPriceSector(value: unknown): value is PriceSector {
  return PRICE_SECTORS.some((sector) => sector.value === value);
}

export function sectorLabel(sector: PriceSector): string {
  return PRICE_SECTORS.find((s) => s.value === sector)?.label ?? "Prices";
}

export const PRICE_SORTS = {
  lowest: "Lowest price",
  highest: "Highest price",
  rating: "Best rated",
  newest: "Recently updated",
  popular: "Most viewed",
} as const;

export type PriceSortKey = keyof typeof PRICE_SORTS;

export function isPriceSort(value: unknown): value is PriceSortKey {
  return typeof value === "string" && value in PRICE_SORTS;
}

export const TREND_RANGES = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
] as const;
