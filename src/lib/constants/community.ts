import type {
  EventKind,
  ExperienceLevel,
  JobType,
  PostKind,
  ServicePricing,
  WorkMode,
} from "@/types/database.types";

/**
 * Labels for the community, jobs, events and services modules.
 *
 * In `src/lib/constants` so client components can import them without pulling
 * in `server-only`.
 */

export const POST_KIND: Record<PostKind, { label: string; blurb: string }> = {
  post: { label: "Post", blurb: "Share something with the network" },
  question: { label: "Question", blurb: "Ask the community" },
  discussion: { label: "Discussion", blurb: "Open a topic" },
  tip: { label: "Tip", blurb: "Share what works on site" },
  showcase: { label: "Showcase", blurb: "Show your work" },
};

export const POST_KINDS = Object.keys(POST_KIND) as PostKind[];

export const POST_SORTS = {
  recent: "Most recent",
  popular: "Most liked",
  discussed: "Most discussed",
} as const;

export type PostSortKey = keyof typeof POST_SORTS;

export function isPostSort(value: unknown): value is PostSortKey {
  return typeof value === "string" && value in POST_SORTS;
}

export function isPostKind(value: unknown): value is PostKind {
  return typeof value === "string" && value in POST_KIND;
}

export const JOB_TYPE: Record<JobType, string> = {
  full_time: "Full time",
  part_time: "Part time",
  contract: "Contract",
  freelance: "Freelance",
  internship: "Internship",
  temporary: "Temporary",
};

export const WORK_MODE: Record<WorkMode, string> = {
  on_site: "On site",
  hybrid: "Hybrid",
  remote: "Remote",
};

export const EXPERIENCE_LEVEL: Record<ExperienceLevel, string> = {
  entry: "Entry level",
  junior: "Junior",
  mid: "Mid level",
  senior: "Senior",
  lead: "Lead",
};

export const APPLICATION_STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  reviewing: "Under review",
  shortlisted: "Shortlisted",
  interviewing: "Interviewing",
  offered: "Offer made",
  // 0032. The end of the pipeline, and the only status that also creates an
  // agreement, a conversation and two notifications.
  hired: "Hired",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};

export const EVENT_KIND: Record<EventKind, string> = {
  exhibition: "Exhibition",
  trade_fair: "Trade fair",
  training: "Training",
  workshop: "Workshop",
  conference: "Conference",
  webinar: "Webinar",
  site_visit: "Site visit",
};

export const SERVICE_PRICING: Record<ServicePricing, string> = {
  hourly: "per hour",
  daily: "per day",
  weekly: "per week",
  monthly: "per month",
  per_m2: "per m²",
  per_m3: "per m³",
  per_running_meter: "per running metre",
  per_piece: "per piece",
  per_room: "per room",
  per_unit: "per unit",
  per_truck: "per truck",
  per_kg: "per kg",
  per_ton: "per ton",
  per_project: "per project",
  fixed: "fixed price",
  custom: "custom pricing",
  negotiable: "negotiable",
  on_request: "on request",
};

export function isJobType(value: unknown): value is JobType {
  return typeof value === "string" && value in JOB_TYPE;
}

export function isWorkMode(value: unknown): value is WorkMode {
  return typeof value === "string" && value in WORK_MODE;
}

export function isExperienceLevel(value: unknown): value is ExperienceLevel {
  return typeof value === "string" && value in EXPERIENCE_LEVEL;
}

export function isEventKind(value: unknown): value is EventKind {
  return typeof value === "string" && value in EVENT_KIND;
}
