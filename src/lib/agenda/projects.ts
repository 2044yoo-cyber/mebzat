/**
 * The construction project's vocabulary, and the arithmetic the screens share.
 *
 * Client-safe, on the same terms as `constants.ts`: these are labels and
 * derivations, and nothing here decides who may see anything. Access is a
 * membership, enforced in the database, and a permission checked in a
 * component is a permission that is not enforced.
 */

export const AGENDA_PROJECT_TYPES = [
  { value: "residential", label: "Residential" },
  { value: "apartment", label: "Apartment" },
  { value: "commercial", label: "Commercial" },
  { value: "office", label: "Office" },
  { value: "hotel", label: "Hotel" },
  { value: "industrial", label: "Industrial" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "interior", label: "Interior" },
  { value: "renovation", label: "Renovation" },
  { value: "mixed_use", label: "Mixed Use" },
  { value: "other", label: "Other" },
] as const;

export type AgendaProjectType = (typeof AGENDA_PROJECT_TYPES)[number]["value"];

/**
 * The states a job is in, and the tone each one carries.
 *
 * `tone` names a meaning rather than a colour — "a job that has stopped" — and
 * the badge maps it onto Medosha's existing palette. Writing `bg-amber-500`
 * here would put this module's colours outside the design system the rest of
 * the site shares.
 */
export const AGENDA_PROJECT_STATUSES = [
  { value: "planning", label: "Planning", tone: "neutral" },
  { value: "tender", label: "Tender", tone: "info" },
  { value: "construction", label: "Construction", tone: "active" },
  { value: "on_hold", label: "On Hold", tone: "warning" },
  { value: "completed", label: "Completed", tone: "success" },
  { value: "cancelled", label: "Cancelled", tone: "muted" },
] as const;

export type AgendaProjectStatus =
  (typeof AGENDA_PROJECT_STATUSES)[number]["value"];
export type AgendaStatusTone =
  (typeof AGENDA_PROJECT_STATUSES)[number]["tone"];

export function isAgendaProjectType(value: unknown): value is AgendaProjectType {
  return AGENDA_PROJECT_TYPES.some((type) => type.value === value);
}

export function isAgendaProjectStatus(
  value: unknown,
): value is AgendaProjectStatus {
  return AGENDA_PROJECT_STATUSES.some((status) => status.value === value);
}

/** The dashboard's filter, which is the statuses plus "everything". */
export const AGENDA_PROJECT_FILTERS = [
  { value: "all", label: "All Projects" },
  { value: "active", label: "Active" },
  ...AGENDA_PROJECT_STATUSES.map(({ value, label }) => ({ value, label })),
] as const;

/**
 * "Active" is not a status, it is a question about one.
 *
 * A job in planning, in tender or under construction is live work; one on
 * hold, finished or cancelled is not. Defined here so the dashboard filter and
 * the "Active Projects" figure cannot disagree about what the word means —
 * which they would, written out separately in two components.
 */
const LIVE: readonly AgendaProjectStatus[] = ["planning", "tender", "construction"];

export function isLiveProject(status: AgendaProjectStatus): boolean {
  return LIVE.includes(status);
}

/**
 * Days between now and the target date, or null when there is no target.
 *
 * Null rather than zero, because "no completion date set" and "due today" are
 * different facts and a screen showing 0 for the first is lying. Negative is a
 * real answer: a job three days past its date is at −3, and the caller decides
 * whether to render that as "overdue".
 */
export function daysRemaining(
  targetDate: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!targetDate) return null;
  const target = new Date(`${targetDate}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return null;

  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.round((target.getTime() - today) / 86_400_000);
}

/**
 * How far through the *programme* a project is by the calendar.
 *
 * Deliberately not the same number as `progress_percent`, which is what the
 * site reported. Showing the two together is the point: a job 80% through its
 * time and 40% built is the single most useful thing this screen can say, and
 * a system that derives one from the other cannot say it.
 */
export function elapsedPercent(
  startDate: string | null | undefined,
  targetDate: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!startDate || !targetDate) return null;

  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${targetDate}T00:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;

  const share = ((now.getTime() - start) / (end - start)) * 100;
  return Math.min(Math.max(Math.round(share), 0), 100);
}

/**
 * Money, written the way a contract writes it.
 *
 * `Intl.NumberFormat` with the currency the project stores rather than a
 * hard-coded birr symbol: Medosha serves Ethiopian companies and some of their
 * contracts are in dollars, and a figure labelled with the wrong currency is
 * worse than one with none.
 */
export function formatMoney(
  amount: number | null | undefined,
  currency = "ETB",
  language = "en",
): string | null {
  // `typeof` first, because `Number.isFinite` is not a type guard: it returns
  // false for null at run time and TypeScript still sees `number | null`
  // afterwards. Written as one condition rather than two so there is no null
  // check that no test can tell apart from the finiteness check beside it.
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;

  try {
    return new Intl.NumberFormat(language === "en" ? "en-ET" : language, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // An unknown currency code makes the constructor throw. The number is
    // still worth showing.
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}
