import type {
  ArticleKind,
  BadgeSlug,
  BriefBidStatus,
  BriefStatus,
  BudgetKind,
  ContractShape,
  ServicePricing,
  ServiceScope,
  TeamRole,
  WorkStatus,
} from "@/types/database.types";

/**
 * Labels for the service ecosystem, project marketplace and reputation.
 *
 * In `src/lib/constants` so client components can import them without pulling
 * in `server-only`.
 */

/**
 * Work status.
 *
 * The dot colour is the whole signal on a card, so it lives here rather than
 * being re-derived in each component that shows one.
 */
export const WORK_STATUS: Record<
  WorkStatus,
  { label: string; dot: string; text: string; blurb: string }
> = {
  available: {
    label: "Available now",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    blurb: "Taking new work and can start soon",
  },
  limited: {
    label: "Limited availability",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    blurb: "Some capacity left",
  },
  busy: {
    label: "Busy",
    dot: "bg-orange-500",
    text: "text-orange-600 dark:text-orange-400",
    blurb: "Working at capacity, quoting ahead",
  },
  fully_booked: {
    label: "Fully booked",
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    blurb: "Not taking work right now",
  },
  offline: {
    label: "Offline",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    blurb: "Not currently active on Medosha",
  },
};

export const WORK_STATUSES = Object.keys(WORK_STATUS) as WorkStatus[];

export function isWorkStatus(value: unknown): value is WorkStatus {
  return typeof value === "string" && value in WORK_STATUS;
}

/** All sixteen pricing methods, grouped the way a provider thinks about them. */
export const PRICING_GROUPS: {
  label: string;
  options: { value: ServicePricing; label: string }[];
}[] = [
  {
    label: "By area or volume",
    options: [
      { value: "per_m2", label: "Per m²" },
      { value: "per_m3", label: "Per m³" },
      { value: "per_running_meter", label: "Per running metre" },
    ],
  },
  {
    label: "By count",
    options: [
      { value: "per_piece", label: "Per piece" },
      { value: "per_unit", label: "Per unit" },
      { value: "per_room", label: "Per room" },
      { value: "per_truck", label: "Per truck" },
    ],
  },
  {
    label: "By weight",
    options: [
      { value: "per_kg", label: "Per kg" },
      { value: "per_ton", label: "Per ton" },
    ],
  },
  {
    label: "By time",
    options: [
      { value: "hourly", label: "Per hour" },
      { value: "daily", label: "Per day" },
      { value: "weekly", label: "Per week" },
      { value: "monthly", label: "Per month" },
    ],
  },
  {
    label: "By job",
    options: [
      { value: "per_project", label: "Per project" },
      { value: "fixed", label: "Fixed price" },
      { value: "custom", label: "Custom pricing" },
      { value: "negotiable", label: "Negotiable" },
      { value: "on_request", label: "On request" },
    ],
  },
];

/** Pricing methods that expect a figure. The rest are a conversation. */
export const PRICING_WITHOUT_FIGURE: ServicePricing[] = [
  "custom",
  "negotiable",
  "on_request",
];

export function pricingNeedsFigure(pricing: ServicePricing): boolean {
  return !PRICING_WITHOUT_FIGURE.includes(pricing);
}

export const SERVICE_SCOPE: Record<
  ServiceScope,
  { label: string; blurb: string }
> = {
  labour_only: {
    label: "Labour only",
    blurb: "You supply the materials, we supply the workforce",
  },
  material_only: {
    label: "Material only",
    blurb: "Supply to site, no installation",
  },
  supply_and_fit: {
    label: "Supply and fit",
    blurb: "Materials and installation included",
  },
  full_contract: {
    label: "Full contract",
    blurb: "Design, materials, labour and management",
  },
};

export const SERVICE_SCOPES = Object.keys(SERVICE_SCOPE) as ServiceScope[];

export const CONTRACT_SHAPE: Record<ContractShape, string> = {
  labour_only: "Labour only",
  material_supplied_by_client: "I supply the materials",
  supply_and_fit: "Supply and fit",
  full_contract: "Complete contract",
};

export const BUDGET_KIND: Record<BudgetKind, string> = {
  fixed: "Fixed budget",
  range: "Budget range",
  open: "Open to quotes",
};

export const BRIEF_STATUS: Record<
  BriefStatus,
  { label: string; tone: "open" | "progress" | "done" | "muted" }
> = {
  draft: { label: "Draft", tone: "muted" },
  open: { label: "Open for bids", tone: "open" },
  reviewing: { label: "Reviewing bids", tone: "progress" },
  awarded: { label: "Awarded", tone: "progress" },
  in_progress: { label: "In progress", tone: "progress" },
  completed: { label: "Completed", tone: "done" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

export const BID_STATUS: Record<BriefBidStatus, string> = {
  submitted: "Submitted",
  shortlisted: "Shortlisted",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export const ARTICLE_KIND: Record<ArticleKind, string> = {
  installation_guide: "Installation guide",
  material_guide: "Material guide",
  tutorial: "Tutorial",
  construction_tip: "Construction tip",
  maintenance_guide: "Maintenance guide",
  video: "Video",
  case_study: "Case study",
};

export const ARTICLE_KINDS = Object.keys(ARTICLE_KIND) as ArticleKind[];

export const BADGE: Record<BadgeSlug, { label: string; blurb: string }> = {
  verified_supplier: {
    label: "Verified Supplier",
    blurb: "Identity and trade licence checked by Medosha",
  },
  verified_professional: {
    label: "Verified Professional",
    blurb: "Qualifications checked by Medosha",
  },
  top_contractor: {
    label: "Top Contractor",
    blurb: "Consistently high ratings across completed contracts",
  },
  market_expert: {
    label: "Market Expert",
    blurb: "Trusted contributor of price data",
  },
  boq_expert: {
    label: "BOQ Expert",
    blurb: "Recognised for bills of quantities",
  },
  interior_expert: {
    label: "Interior Expert",
    blurb: "Recognised for interior work",
  },
  architecture_expert: {
    label: "Architecture Expert",
    blurb: "Recognised for architectural work",
  },
  top_contributor: {
    label: "Top Contributor",
    blurb: "Among the most helpful members",
  },
  trusted_company: {
    label: "Trusted Company",
    blurb: "Long record of delivered work",
  },
};

export const TEAM_ROLE: Record<TeamRole, { label: string; blurb: string }> = {
  owner: { label: "Owner", blurb: "Full control, including billing" },
  manager: { label: "Manager", blurb: "Runs the team and the listings" },
  sales: { label: "Sales", blurb: "Bids and replies to enquiries" },
  engineer: { label: "Engineer", blurb: "Technical services and bids" },
  designer: { label: "Designer", blurb: "Design services and content" },
  estimator: { label: "Estimator", blurb: "Pricing and bids" },
  accountant: { label: "Accountant", blurb: "Finance and reporting only" },
  marketing: { label: "Marketing", blurb: "Content and product listings" },
};

export const TEAM_ROLES = Object.keys(TEAM_ROLE) as TeamRole[];

/** Turns median minutes into the phrase a card actually shows. */
export function responseTimeLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 60) return `Replies in ~${minutes} min`;
  if (minutes < 60 * 24) return `Replies in ~${Math.round(minutes / 60)} h`;
  return `Replies in ~${Math.round(minutes / (60 * 24))} d`;
}
