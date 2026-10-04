/**
 * Quality and safety: what was inspected, what was wrong, and whether it was
 * put right.
 *
 * The chain 0090 built the tables for runs one way and is the point of the
 * whole section:
 *
 *   inspection → a failed item → an observation → a punch item →
 *   reinspection → closed
 *
 * Each step points back at the one before it — `observation.inspection_item_id`,
 * `punch_item.observation_id` — so a snag can always be traced to the check
 * that found it. That is what settles the argument six months later.
 *
 * Client-safe. Nothing here decides who may see a record; the policies do.
 */

import type { StatusTone } from "@/components/agenda/shell/status-chip";

// ---------------------------------------------------------------------------
// Inspections
// ---------------------------------------------------------------------------

export type InspectionResult =
  | "pending"
  | "pass"
  | "fail"
  | "conditional"
  | "not_applicable";

export const INSPECTION_RESULTS: {
  value: InspectionResult;
  label: string;
  tone: StatusTone;
}[] = [
  { value: "pending", label: "Not yet inspected", tone: "muted" },
  { value: "pass", label: "Pass", tone: "success" },
  { value: "conditional", label: "Pass with conditions", tone: "warning" },
  { value: "fail", label: "Fail", tone: "danger" },
  { value: "not_applicable", label: "Not applicable", tone: "neutral" },
];

export function inspectionResultLabel(result: InspectionResult): string {
  return (
    INSPECTION_RESULTS.find((entry) => entry.value === result)?.label ?? result
  );
}

export function inspectionResultTone(result: InspectionResult): StatusTone {
  return (
    INSPECTION_RESULTS.find((entry) => entry.value === result)?.tone ?? "neutral"
  );
}

/**
 * What an inspection's result is, from its items.
 *
 * One failed item fails the inspection. That is the rule a site actually
 * works to — you do not pass a slab because nineteen of twenty checks were
 * fine — and stating it here rather than leaving the inspector to set the
 * header by hand is what stops a failed item hiding under a passed heading.
 *
 * `not_applicable` items are ignored rather than counted as passes: a check
 * that did not apply is not evidence of anything.
 *
 * Null when there is nothing to judge — no items, or none that applied. The
 * caller shows the result the inspector recorded instead, because an
 * inspection can be a single judgement with no checklist behind it.
 */
export function rollUpInspection(
  items: readonly { result: InspectionResult }[],
): InspectionResult | null {
  const judged = items.filter((item) => item.result !== "not_applicable");
  if (judged.length === 0) return null;
  if (judged.some((item) => item.result === "fail")) return "fail";
  if (judged.some((item) => item.result === "pending")) return "pending";
  if (judged.some((item) => item.result === "conditional")) return "conditional";
  return "pass";
}

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

export type ObservationKind =
  | "quality"
  | "safety"
  | "design"
  | "workmanship"
  | "material"
  | "environmental"
  | "general";

export const OBSERVATION_KINDS: {
  value: ObservationKind;
  label: string;
}[] = [
  { value: "safety", label: "Safety" },
  { value: "quality", label: "Quality" },
  { value: "workmanship", label: "Workmanship" },
  { value: "material", label: "Material" },
  { value: "design", label: "Design" },
  { value: "environmental", label: "Environmental" },
  { value: "general", label: "General" },
];

export function observationKindLabel(kind: ObservationKind): string {
  return (
    OBSERVATION_KINDS.find((entry) => entry.value === kind)?.label ?? kind
  );
}

// ---------------------------------------------------------------------------
// Issues: observations and punch items share one status vocabulary
// ---------------------------------------------------------------------------

export type IssueStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "ready_for_inspection"
  | "rejected"
  | "resolved"
  | "closed";

export const ISSUE_STATUSES: {
  value: IssueStatus;
  label: string;
  tone: StatusTone;
}[] = [
  { value: "open", label: "Open", tone: "info" },
  { value: "assigned", label: "Assigned", tone: "info" },
  { value: "in_progress", label: "Being fixed", tone: "active" },
  {
    value: "ready_for_inspection",
    label: "Ready for reinspection",
    tone: "warning",
  },
  { value: "rejected", label: "Rejected", tone: "danger" },
  { value: "resolved", label: "Resolved", tone: "success" },
  { value: "closed", label: "Closed", tone: "neutral" },
];

export function issueStatusLabel(status: IssueStatus): string {
  return ISSUE_STATUSES.find((entry) => entry.value === status)?.label ?? status;
}

export function issueStatusTone(status: IssueStatus): StatusTone {
  return (
    ISSUE_STATUSES.find((entry) => entry.value === status)?.tone ?? "neutral"
  );
}

/**
 * The statuses that mean somebody still has work to do.
 *
 * `rejected` is open, and that is the one worth stating. A rejected fix is
 * not a finished item — it is an item the inspector sent back — and counting
 * it as done is how a punch list reaches zero with snags still on site.
 */
const SETTLED: readonly IssueStatus[] = ["resolved", "closed"];

export function isIssueOpen(status: IssueStatus): boolean {
  return !SETTLED.includes(status);
}

/**
 * How much of a punch list is done, 0 to 100.
 *
 * Null for an empty list rather than 100. A list with nothing on it is not a
 * list that has been worked through, and showing a complete bar for a snagging
 * inspection nobody has carried out yet is the worst answer available.
 */
export function punchProgress(
  items: readonly { status: IssueStatus }[],
): number | null {
  if (items.length === 0) return null;
  const done = items.filter((item) => !isIssueOpen(item.status)).length;
  return Math.round((done / items.length) * 100);
}

/**
 * The open items, worst first: overdue before undated, then by due date.
 *
 * An undated snag sorts after every dated one rather than before. It has no
 * deadline to have missed, and putting it at the top pushes the genuinely late
 * work off the screen.
 */
export function byUrgency<T extends { status: IssueStatus; dueDate: string | null }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    const aOpen = isIssueOpen(a.status) ? 0 : 1;
    const bOpen = isIssueOpen(b.status) ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    if (a.dueDate === b.dueDate) return 0;
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  });
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export type FormFieldKind = "text" | "long_text" | "number" | "date" | "yes_no" | "choice";

export const FORM_FIELD_KINDS: { value: FormFieldKind; label: string }[] = [
  { value: "text", label: "Short answer" },
  { value: "long_text", label: "Long answer" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "yes_no", label: "Yes or no" },
  { value: "choice", label: "One of a list" },
];

export type FormField = {
  id: string;
  label: string;
  kind: FormFieldKind;
  required: boolean;
  options?: string[];
};

/**
 * A template's fields, from the jsonb column.
 *
 * `fields` is jsonb precisely so a company can define its own permit or site
 * instruction without a migration — which means nothing in the database
 * validates its shape, and this is the only thing standing between a hand-
 * edited row and a form that throws while rendering. Anything that is not a
 * field is dropped rather than rendered as `undefined`.
 */
export function parseFormFields(value: unknown): FormField[] {
  if (!Array.isArray(value)) return [];

  const fields: FormField[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.label !== "string") continue;
    if (!FORM_FIELD_KINDS.some((kind) => kind.value === row.kind)) continue;

    const options = Array.isArray(row.options)
      ? row.options.filter((option): option is string => typeof option === "string")
      : undefined;

    // A one-of-a-list field with no list is a select nobody can answer.
    if (row.kind === "choice" && (!options || options.length === 0)) continue;

    fields.push({
      id: row.id,
      label: row.label,
      kind: row.kind as FormFieldKind,
      required: row.required === true,
      options,
    });
  }
  return fields;
}

/**
 * Which required fields a submission has not answered.
 *
 * Returned as the fields themselves rather than as a boolean, so the form can
 * say which ones. A checkbox answered "no" is answered: `false` and the empty
 * string are not the same thing, and treating them as one is how a safety
 * question that was answered honestly reads as skipped.
 */
export function missingAnswers(
  fields: readonly FormField[],
  answers: Record<string, unknown>,
): FormField[] {
  return fields.filter((field) => {
    if (!field.required) return false;
    const answer = answers[field.id];
    if (answer === undefined || answer === null) return true;
    if (typeof answer === "string") return answer.trim() === "";
    return false;
  });
}

/**
 * A template written as one question per line.
 *
 *   Permit number*
 *   Gas tested [yes/no]
 *   Readings taken at [date]
 *   Depth reached [number]
 *   Method [hand dig | machine | both]
 *   What was found [long]
 *
 * A trailing `*` makes the question required; a trailing bracket says what
 * kind of answer it takes, and a bracket containing `|` is a list to pick
 * from. Everything else is a short answer.
 *
 * A line-based syntax rather than a drag-and-drop builder because the people
 * who write a permit-to-dig are writing it on a phone on site, and a builder
 * that takes eleven taps per question is a builder nobody finishes. It is also
 * one pure function, which is a thing a check can hold.
 *
 * Ids are not assigned here. Answers are keyed by field id, so an id has to be
 * stable against the label being corrected — which rules out deriving it from
 * the label — and unique, which rules out the position. The caller mints one
 * per field when the template is saved.
 */
export function parseFieldLines(source: string): Omit<FormField, "id">[] {
  const fields: Omit<FormField, "id">[] = [];

  for (const raw of source.split("\n")) {
    let line = raw.trim();
    if (!line) continue;

    let kind: FormFieldKind = "text";
    let options: string[] | undefined;

    const bracket = line.match(/\[([^\]]*)\]$/);
    if (bracket) {
      const inside = bracket[1].trim();
      line = line.slice(0, bracket.index).trim();

      if (inside.includes("|")) {
        options = inside
          .split("|")
          .map((option) => option.trim())
          .filter(Boolean);
        kind = "choice";
      } else {
        const named = inside.toLowerCase();
        if (named === "number") kind = "number";
        else if (named === "date") kind = "date";
        else if (named === "yes/no" || named === "yes-no" || named === "yesno") {
          kind = "yes_no";
        } else if (named === "long") kind = "long_text";
        // An unrecognised bracket leaves the kind as a short answer rather
        // than dropping the question. Losing a line somebody typed because
        // they wrote `[текст]` is worse than rendering it as a text box.
      }
    }

    const required = line.endsWith("*");
    if (required) line = line.slice(0, -1).trim();
    if (!line) continue;

    // A list with no options is a select nobody can answer.
    if (kind === "choice" && (!options || options.length === 0)) continue;

    fields.push({
      label: line.slice(0, 200),
      kind,
      required,
      ...(options ? { options } : {}),
    });
  }

  return fields;
}
