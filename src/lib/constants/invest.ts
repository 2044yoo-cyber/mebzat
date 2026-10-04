import type {
  InvestDocKind,
  InvestMediaKind,
  InvestRisk,
  InvestStage,
} from "@/types/database.types";

/**
 * Labels and copy for Medosha Invest. Client-safe.
 *
 * The disclosure strings live here rather than being typed into each component,
 * because the one thing this module must never do is show a return figure on a
 * surface that forgot its badge.
 */

/** Shown on every card, every page header, and every search result. */
export const DEMO_BADGE = "DEMO PROJECT";
export const DEMO_SUBTITLE = "Illustrative example · Sample data";

export const DEMO_NOTICE =
  "This is a demonstration project built to show how Medosha Invest works. It is not a real investment opportunity, the figures are illustrative, and nothing here is an offer or a solicitation. No money can be committed through this page.";

/** The short form, for places with one line of room. */
export const DEMO_NOTICE_SHORT =
  "Sample data. Not a real investment opportunity.";

export const INVEST_RISK: Record<
  InvestRisk,
  { label: string; blurb: string; dot: string; chip: string }
> = {
  low: {
    label: "Lower risk",
    blurb: "Permits in hand, construction well advanced.",
    dot: "bg-emerald-500",
    chip: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  },
  moderate: {
    label: "Moderate risk",
    blurb: "Funding or construction still in progress.",
    dot: "bg-amber-500",
    chip: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  },
  high: {
    label: "Higher risk",
    blurb: "Large scale, long horizon, or early stage.",
    dot: "bg-rose-500",
    chip: "border-rose-500/40 text-rose-600 dark:text-rose-400",
  },
};

export const INVEST_STAGE: Record<
  InvestStage,
  { label: string; blurb: string }
> = {
  raising: { label: "Raising", blurb: "Open to interest" },
  funded: { label: "Funded", blurb: "Target reached" },
  building: { label: "Building", blurb: "Under construction" },
  completed: { label: "Completed", blurb: "Handed over" },
};

export const INVEST_STAGES = Object.keys(INVEST_STAGE) as InvestStage[];

export function isInvestStage(value: unknown): value is InvestStage {
  return typeof value === "string" && value in INVEST_STAGE;
}

export const INVEST_DOC_KIND: Record<InvestDocKind, string> = {
  prospectus: "Prospectus",
  feasibility: "Feasibility study",
  permit: "Building permit",
  title: "Land title",
  financials: "Financial projections",
  progress_report: "Progress report",
  valuation: "Valuation",
};

export const INVEST_MEDIA_KIND: Record<
  InvestMediaKind,
  { label: string; /** False while no viewer exists for it yet. */ ready: boolean }
> = {
  photo: { label: "Photo", ready: true },
  render: { label: "Render", ready: true },
  drone: { label: "Drone photo", ready: true },
  video: { label: "Video", ready: true },
  floor_plan: { label: "Floor plan", ready: true },
  model_3d: { label: "3D model", ready: false },
};

/** Funding bands for the index filter. */
export const INVEST_SORTS = [
  { value: "funding", label: "Largest first" },
  { value: "roi", label: "Highest expected ROI" },
  { value: "progress", label: "Closest to funded" },
  { value: "newest", label: "Newest" },
] as const;

export type InvestSort = (typeof INVEST_SORTS)[number]["value"];

export function isInvestSort(value: unknown): value is InvestSort {
  return INVEST_SORTS.some((sort) => sort.value === value);
}

/** ETB in millions, because 300,000,000 is unreadable on a card. */
export function compactBirr(amount: number, currency = "ETB"): string {
  if (amount >= 1_000_000_000) {
    return `${currency} ${(amount / 1_000_000_000).toFixed(amount % 1_000_000_000 === 0 ? 0 : 1)}B`;
  }
  if (amount >= 1_000_000) {
    return `${currency} ${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (amount >= 1_000) {
    return `${currency} ${(amount / 1_000).toFixed(0)}K`;
  }
  return `${currency} ${amount.toLocaleString()}`;
}

export function fundingPct(raised: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((raised / goal) * 1000) / 10);
}
