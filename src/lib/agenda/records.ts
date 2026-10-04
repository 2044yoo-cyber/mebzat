/**
 * The vocabulary and the arithmetic Phase 2's records share.
 *
 * RFIs, submittals, schedule activities and photos are four different screens
 * built on one set of words — `agenda_review_status`, `agenda_discipline`,
 * `agenda_priority` — because 0090 deliberately gave them one. Separate
 * spellings per module is how a project ends up with four ways of saying
 * "waiting for the consultant".
 *
 * Client-safe. Nothing here decides who may see a record; the policies do
 * that. A status shown in the wrong colour is a cosmetic bug, and a permission
 * checked in a component is a permission that is not enforced.
 */

import type { StatusTone } from "@/components/agenda/shell/status-chip";

// ---------------------------------------------------------------------------
// Review status
// ---------------------------------------------------------------------------

export type ReviewStatus =
  | "draft"
  | "open"
  | "pending"
  | "answered"
  | "approved"
  | "approved_with_comments"
  | "revise_resubmit"
  | "rejected"
  | "closed";

/**
 * `tone` is a meaning, not a colour: this file decides that a resubmission
 * needs attention, and `StatusChip` decides what that looks like in the
 * current theme. The type is the chip's own, so a tone this file invents but
 * the chip cannot draw is a compile error rather than an untinted badge.
 */
export const REVIEW_STATUSES: {
  value: ReviewStatus;
  label: string;
  tone: StatusTone;
}[] = [
  { value: "draft", label: "Draft", tone: "muted" },
  { value: "open", label: "Open", tone: "info" },
  { value: "pending", label: "Pending review", tone: "info" },
  { value: "answered", label: "Answered", tone: "success" },
  { value: "approved", label: "Approved", tone: "success" },
  {
    value: "approved_with_comments",
    label: "Approved with comments",
    tone: "success",
  },
  { value: "revise_resubmit", label: "Revise and resubmit", tone: "warning" },
  { value: "rejected", label: "Rejected", tone: "danger" },
  { value: "closed", label: "Closed", tone: "neutral" },
];

export function reviewStatusLabel(status: ReviewStatus): string {
  return (
    REVIEW_STATUSES.find((entry) => entry.value === status)?.label ?? status
  );
}

export function reviewStatusTone(status: ReviewStatus): StatusTone {
  return (
    REVIEW_STATUSES.find((entry) => entry.value === status)?.tone ?? "neutral"
  );
}

/**
 * Whether this record is still somebody's problem.
 *
 * The open set is named here rather than at each call site, because the RFI
 * list, the headline count and the overdue badge all need it and three copies
 * is three chances to disagree about whether `draft` is open. It is not: a
 * draft RFI has not been asked of anybody yet.
 */
const SETTLED: readonly ReviewStatus[] = [
  "answered",
  "approved",
  "approved_with_comments",
  "rejected",
  "closed",
];

export function isAwaitingAnswer(status: ReviewStatus): boolean {
  return !SETTLED.includes(status);
}

/**
 * Late, and by how many days.
 *
 * Null when there is no due date — an RFI with no date is not late, it is
 * undated, and drawing a red badge on it teaches people to ignore red badges.
 * Zero on the due date itself: due today is not yet overdue.
 */
export function daysLate(dueDate: string | null, today = new Date()): number | null {
  if (!dueDate) return null;
  const due = new Date(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) return null;
  const now = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Math.floor((now - due.getTime()) / 86_400_000);
}

export function isOverdue(
  dueDate: string | null,
  status: ReviewStatus,
  today = new Date(),
): boolean {
  if (!isAwaitingAnswer(status)) return false;
  const late = daysLate(dueDate, today);
  return late !== null && late > 0;
}

// ---------------------------------------------------------------------------
// Disciplines
// ---------------------------------------------------------------------------

export type Discipline =
  | "architectural"
  | "structural"
  | "electrical"
  | "plumbing"
  | "mechanical"
  | "interior"
  | "landscape"
  | "shop_drawing"
  | "civil"
  | "other";

export const DISCIPLINES: { value: Discipline; label: string }[] = [
  { value: "architectural", label: "Architectural" },
  { value: "structural", label: "Structural" },
  { value: "civil", label: "Civil" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "mechanical", label: "Mechanical" },
  { value: "interior", label: "Interior" },
  { value: "landscape", label: "Landscape" },
  { value: "shop_drawing", label: "Shop drawing" },
  { value: "other", label: "Other" },
];

export function disciplineLabel(value: Discipline | null): string {
  if (!value) return "—";
  return DISCIPLINES.find((entry) => entry.value === value)?.label ?? value;
}

// ---------------------------------------------------------------------------
// Submittal revisions
// ---------------------------------------------------------------------------

/**
 * "Rev 02", which is what is written on the transmittal.
 *
 * Padded to two digits because a list where Rev 9 sorts after Rev 10 is a list
 * somebody misreads, and because that is the convention every drawing register
 * on an Ethiopian site already uses.
 */
export function revisionLabel(revision: number): string {
  return `Rev ${String(Math.max(revision, 0)).padStart(2, "0")}`;
}

/**
 * The revision number a resubmission gets.
 *
 * The next one after the highest already issued, not the count plus one: a
 * revision withdrawn leaves a gap, and reusing its number puts two different
 * documents in two people's inboxes carrying the same one.
 */
export function nextRevision(existing: readonly number[]): number {
  return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

/**
 * How far through an activity's own dates today is, 0 to 100.
 *
 * This is *elapsed*, not progress. The two are shown side by side on purpose:
 * an activity 20% built and 80% elapsed is the one the programme meeting is
 * about, and deriving one from the other would hide exactly that.
 */
export function elapsedPercent(
  start: string | null,
  finish: string | null,
  today = new Date(),
): number | null {
  if (!start || !finish) return null;
  const from = new Date(`${start}T00:00:00Z`).getTime();
  const to = new Date(`${finish}T00:00:00Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return null;
  const now = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Math.max(0, Math.min(100, Math.round(((now - from) / (to - from)) * 100)));
}

/**
 * Behind, ahead, or on track — by percentage points.
 *
 * Null when the activity has no dates to measure against, rather than zero.
 * Zero means "on track", and an undated activity is not on track; it is
 * unplanned, and the two must not look the same.
 */
export function scheduleVariance(
  start: string | null,
  finish: string | null,
  progressPercent: number,
  today = new Date(),
): number | null {
  const elapsed = elapsedPercent(start, finish, today);
  if (elapsed === null) return null;
  return progressPercent - elapsed;
}

export type ScheduleNode<T> = T & { id: string; children: ScheduleNode<T>[] };

/**
 * A flat list of activities as the tree the programme is.
 *
 * Orphans — an activity whose parent is not in the list, because it was
 * archived or because the caller paged — are kept at the top rather than
 * dropped. A programme that silently loses rows is worse than one that shows
 * an activity at the wrong indent.
 */
export function buildScheduleTree<
  T extends { id: string; parentId: string | null; position: number },
>(items: readonly T[]): ScheduleNode<T>[] {
  const byId = new Map<string, ScheduleNode<T>>();
  for (const item of items) byId.set(item.id, { ...item, children: [] });

  const roots: ScheduleNode<T>[] = [];
  for (const item of items) {
    const node = byId.get(item.id);
    if (!node) continue;
    const parent = item.parentId ? byId.get(item.parentId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (nodes: ScheduleNode<T>[]) => {
    nodes.sort((a, b) => a.position - b.position);
    for (const node of nodes) sort(node.children);
  };
  sort(roots);
  return roots;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/**
 * Where a photo was taken, as one line.
 *
 * Building, floor and area are three nullable columns and a site writes
 * whichever of them it knows. Joining the ones that are present beats a
 * template with "—" in the holes.
 */
export function photoPlace(photo: {
  building: string | null;
  floor: string | null;
  area: string | null;
}): string | null {
  const parts = [photo.building, photo.floor, photo.area]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Photos grouped by the day they were taken, newest day first.
 *
 * A site photo library is read as a diary, not as a grid: "what did the third
 * floor look like on the 12th" is the question. Grouping happens here so the
 * screen has no date arithmetic in it.
 */
export function groupPhotosByDay<T extends { takenAt: string }>(
  photos: readonly T[],
): { day: string; photos: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const photo of photos) {
    const day = photo.takenAt.slice(0, 10);
    const bucket = groups.get(day);
    if (bucket) bucket.push(photo);
    else groups.set(day, [photo]);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, items]) => ({ day, photos: items }));
}
