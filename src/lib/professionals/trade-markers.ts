import { AVAILABILITY_LABELS, findProfession } from "@/lib/constants/professions";
import type { ProfessionalPoint } from "@/lib/professionals/map-points";
import type { WorkStatus } from "@/types/database.types";

/**
 * What a professional's marker says and what colour it is.
 *
 * Kept apart from the map component for the same reason `markers.ts` is kept
 * apart from `city-canvas.tsx`: a marker's *wording* is the part that is worth
 * checking, and a function that returns a string can be checked without a
 * browser, a canvas or a WebGL context.
 *
 * ## Why the trade is on the pin and the name is not
 *
 * The property map prints the price, because the question somebody scanning a
 * map of houses is asking is "what does this cost". The question somebody
 * scanning a map of tradespeople is asking is "is there an electrician near
 * the site", and a map of twenty pins reading "Abel Kebede", "Marta Tesfaye",
 * "Samuel Bekele" answers it for nobody. Names are on the card that opens when
 * a pin is tapped, where there is room for one.
 */

/**
 * Colour by the category the trade belongs to, not by the trade.
 *
 * Twenty-seven colours is not a legend, it is a paint chart — nobody holds
 * twenty-seven hues apart and there are not twenty-seven distinguishable ones
 * that survive a phone screen in daylight. Twelve categories already exist in
 * `service_categories`, every profession already names one, and "the blue pins
 * are plumbing" is a thing somebody can actually learn in one glance.
 */
const CATEGORY_COLOURS: Record<string, { base: string; dark: string }> = {
  architecture: { base: "#7c3aed", dark: "#6d28d9" },
  structural: { base: "#0f766e", dark: "#115e59" },
  mep: { base: "#0891b2", dark: "#0e7490" },
  surveying: { base: "#4d7c0f", dark: "#3f6212" },
  "general-contracting": { base: "#ea580c", dark: "#c2410c" },
  interior: { base: "#db2777", dark: "#be185d" },
  landscaping: { base: "#16a34a", dark: "#15803d" },
  electrical: { base: "#ca8a04", dark: "#a16207" },
  plumbing: { base: "#2563eb", dark: "#1d4ed8" },
  finishing: { base: "#9333ea", dark: "#7e22ce" },
  joinery: { base: "#b45309", dark: "#92400e" },
  "project-management": { base: "#475569", dark: "#334155" },
};

/** Somebody who has not said what they do. Grey, and deliberately dull. */
const UNKNOWN_TRADE = { base: "#64748b", dark: "#475569" };

/**
 * Which icon a trade gets: the one its category already has.
 *
 * `service_categories` has carried an icon name since 0011 — HardHat for
 * general contracting, Zap for electrical, Hammer for joinery — and those are
 * the icons the rest of the app already draws for those categories. Inventing
 * a second set here would mean an electrician had a plug on the category chip
 * and something else on the map, which is a difference somebody has to learn
 * for no reason.
 *
 * This returns the category slug rather than a component, so the module stays
 * free of React and can be checked without a renderer. The map turns the slug
 * into an icon.
 */
export const TRADE_ICON_CATEGORIES = [
  "architecture",
  "structural",
  "mep",
  "surveying",
  "general-contracting",
  "interior",
  "landscaping",
  "electrical",
  "plumbing",
  "finishing",
  "joinery",
  "project-management",
  "unknown",
] as const;

export type TradeIconCategory = (typeof TRADE_ICON_CATEGORIES)[number];

export function tradeIconCategory(trade: string | null): TradeIconCategory {
  const category = findProfession(trade)?.category;
  return (TRADE_ICON_CATEGORIES as readonly string[]).includes(category ?? "")
    ? (category as TradeIconCategory)
    : "unknown";
}

export function tradeColour(trade: string | null): { base: string; dark: string } {
  const profession = findProfession(trade);
  if (!profession) return UNKNOWN_TRADE;
  return CATEGORY_COLOURS[profession.category] ?? UNKNOWN_TRADE;
}

/**
 * The words in the tooltip that opens on hover.
 *
 * The marker itself is an icon and carries no text: a map of Addis Ababa at
 * city zoom has fifty of these on it, and fifty pills reading "Construction
 * Labourer" cover the city they are supposed to describe. The name of the
 * trade belongs where there is room for it — the hover card and the panel
 * under the map — and this is still where it is shortened when there is not.
 */
export const MAX_PIN_CHARACTERS = 18;

export function pinLabel(trade: string | null): string {
  const value = findProfession(trade)?.label ?? trade?.trim();
  if (!value) return "Professional";
  if (value.length <= MAX_PIN_CHARACTERS) return value;
  return `${value.slice(0, MAX_PIN_CHARACTERS - 1).trimEnd()}…`;
}

/**
 * Where this marker stands, in words.
 *
 * The distinction the owner asked for — workplace or home — is the distinction
 * between the area somebody gave as their own and an area they agreed to travel
 * to. "Based in" covers a workshop and a house without claiming to know which,
 * which is the only honest thing to say about a field nobody was asked to
 * qualify.
 */
export function placeLabel(point: Pick<ProfessionalPoint, "kind" | "areaName">): string {
  return point.kind === "base"
    ? `Based in ${point.areaName}`
    : `Works in ${point.areaName}`;
}

/** "Available now", "Busy", and so on — the same words the card uses. */
export function availabilityLabel(status: WorkStatus): string {
  return AVAILABILITY_LABELS[status] ?? "Availability not given";
}

/** Whether this person is taking work, which is what the green dot means. */
export function isTakingWork(status: WorkStatus): boolean {
  return status === "available" || status === "limited";
}

/**
 * The whole marker, in one sentence, for a screen reader.
 *
 * Everything the sighted user gets from colour, fill and position has to be in
 * here, because none of it survives being read aloud.
 */
export function markerDescription(point: ProfessionalPoint): string {
  const trade = findProfession(point.trade)?.label ?? point.trade;
  return [
    point.name,
    trade ?? "trade not given",
    placeLabel(point),
    availabilityLabel(point.availability),
  ].join(", ");
}
