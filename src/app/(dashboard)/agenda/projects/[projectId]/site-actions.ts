"use server";

import { revalidatePath } from "next/cache";

import { isInProject } from "@/lib/agenda/files";
import {
  INSPECTION_RESULTS,
  ISSUE_STATUSES,
  OBSERVATION_KINDS,
  missingAnswers,
  parseFieldLines,
  rollUpInspection,
  type FormField,
  type InspectionResult,
  type IssueStatus,
  type ObservationKind,
} from "@/lib/agenda/quality";
import { DISCIPLINES, type Discipline } from "@/lib/agenda/records";
import { TASK_PRIORITIES, type TaskPriority } from "@/lib/agenda/constants";
import { createClient } from "@/lib/supabase/server";

/**
 * Writing to the site record: RFIs, submittals, the programme.
 *
 * As in the older Agenda actions, nothing here checks whether the caller is
 * allowed to do what they are asking. Row-level security refuses the write,
 * and a second check in TypeScript would be a second thing to keep correct and
 * the one that is easier to forget. What these do is shape the row, take a
 * number where a number is needed, and turn a refusal into a sentence.
 *
 * They also never delete. The tables in 0090 have no DELETE policy, so an
 * attempt would fail even if one of these asked for it.
 */

export type Result = { error?: string; ok?: boolean };

function text(value: FormDataEntryValue | null, max = 200): string | null {
  const trimmed = String(value ?? "").trim().slice(0, max);
  return trimmed || null;
}

/**
 * A date the browser sent, or null.
 *
 * `<input type="date">` posts an empty string when nothing was picked, and
 * `new Date("")` is Invalid Date — which PostgreSQL rejects with a message
 * about the input syntax for type date, several fields away from the blank
 * one.
 */
function date(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

/** A whole number in a range, or null. Used for progress and durations. */
function whole(
  value: FormDataEntryValue | null,
  min: number,
  max: number,
): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(Math.round(n), min), max);
}

function discipline(value: FormDataEntryValue | null): Discipline | null {
  const raw = String(value ?? "");
  return DISCIPLINES.some((entry) => entry.value === raw)
    ? (raw as Discipline)
    : null;
}

function priority(value: FormDataEntryValue | null): TaskPriority {
  const raw = String(value ?? "");
  return TASK_PRIORITIES.some((entry) => entry.value === raw)
    ? (raw as TaskPriority)
    : "normal";
}

/** A uuid the form posted, or null — an empty `<select>` posts "". */
function reference(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  return /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

/** Turns a PostgreSQL refusal into a sentence somebody on site can act on. */
function explain(message: string, fallback: string): string {
  if (
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("not on this project")
  ) {
    return "You are not on this project, or not with the access this needs.";
  }
  if (message.includes("duplicate key")) {
    return "That already exists on this project.";
  }
  return fallback;
}

async function actor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Every screen under a project refreshes together.
 *
 * An RFI raised against a drawing changes the drawing's page as well as the
 * RFI register, and a schedule activity marked done changes the overview.
 * Revalidating the workspace rather than one segment costs a re-render and
 * saves a class of bug where the number in the corner is yesterday's.
 */
function refresh(projectId: string) {
  revalidatePath(`/agenda/projects/${projectId}`, "layout");
}

// ---------------------------------------------------------------------------
// RFIs
// ---------------------------------------------------------------------------

/**
 * Raises a question.
 *
 * The number comes from `agenda_next_number` rather than from `count(*) + 1`:
 * two engineers raising an RFI in the same second would otherwise both write
 * RFI-024, and the unique constraint would refuse the loser with an error they
 * cannot act on.
 *
 * `open` rather than `draft`, because the form's only button is "Raise it".
 * A drafts inbox nobody empties is how questions go unasked.
 */
export async function raiseRfi(
  projectId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const subject = text(formData.get("subject"), 200);
  const question = text(formData.get("question"), 4000);
  if (!subject || !question) {
    return { error: "An RFI needs a subject and a question." };
  }

  const { data: number, error: numberError } = await supabase.rpc(
    "agenda_next_number",
    { target_project: projectId, record_kind: "rfi", prefix: "RFI", width: 3 },
  );
  if (numberError || !number) {
    return {
      error: explain(
        numberError?.message ?? "",
        "Could not take a number for that RFI.",
      ),
    };
  }

  const { error } = await supabase.from("agenda_rfis").insert({
    project_id: projectId,
    number,
    subject,
    question,
    discipline: discipline(formData.get("discipline")),
    location: text(formData.get("location"), 120),
    requested_from: reference(formData.get("requestedFrom")),
    created_by: user.id,
    priority: priority(formData.get("priority")),
    due_date: date(formData.get("dueDate")),
    status: "open",
  });

  if (error) return { error: explain(error.message, "That RFI was not saved.") };

  refresh(projectId);
  return { ok: true };
}

/**
 * Answers one, or adds a note on the way to an answer.
 *
 * An official response also settles the RFI. Two writes rather than a trigger:
 * a comment and an answer are the same row with one flag different, and which
 * of them was meant is the author's decision, not something the database can
 * infer.
 */
export async function respondToRfi(
  projectId: string,
  rfiId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const body = text(formData.get("body"), 4000);
  if (!body) return { error: "Write the response first." };

  const isOfficial = formData.get("official") === "on";

  const { error } = await supabase.from("agenda_rfi_responses").insert({
    rfi_id: rfiId,
    project_id: projectId,
    author_id: user.id,
    body,
    is_official: isOfficial,
  });
  if (error) {
    return { error: explain(error.message, "That response was not saved.") };
  }

  if (isOfficial) {
    const { error: closeError } = await supabase
      .from("agenda_rfis")
      .update({ status: "answered", answered_at: new Date().toISOString() })
      .eq("id", rfiId);
    if (closeError) {
      // The response is saved; only the status did not move. Saying so beats
      // a generic failure that makes people write the answer twice.
      return {
        error:
          "The response was saved, but the RFI could not be marked answered.",
      };
    }
  }

  refresh(projectId);
  return { ok: true };
}

/** Closes an RFI out, once the answer has been acted on. */
export async function closeRfi(
  projectId: string,
  rfiId: string,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const { error } = await supabase
    .from("agenda_rfis")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", rfiId);
  if (error) {
    return { error: explain(error.message, "That RFI could not be closed.") };
  }

  refresh(projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Submittals
// ---------------------------------------------------------------------------

/**
 * Opens a submittal and issues Rev 01 of it in one go.
 *
 * A submittal with no revision is a row nobody can review, so the first
 * revision is created here rather than left as a second step somebody forgets.
 * `agenda_submittal_set_current` in 0093 points the submittal at it.
 */
export async function openSubmittal(
  projectId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const title = text(formData.get("title"), 200);
  if (!title) return { error: "A submittal needs a title." };

  const { data: number, error: numberError } = await supabase.rpc(
    "agenda_next_number",
    {
      target_project: projectId,
      record_kind: "submittal",
      prefix: "SUB",
      width: 3,
    },
  );
  if (numberError || !number) {
    return {
      error: explain(
        numberError?.message ?? "",
        "Could not take a number for that submittal.",
      ),
    };
  }

  const { data: submittal, error } = await supabase
    .from("agenda_submittals")
    .insert({
      project_id: projectId,
      number,
      title,
      spec_section: text(formData.get("specSection"), 60),
      discipline: discipline(formData.get("discipline")),
      contractor: text(formData.get("contractor"), 160),
      submitted_by: user.id,
      reviewer_id: reference(formData.get("reviewer")),
      submitted_on: new Date().toISOString().slice(0, 10),
      required_by: date(formData.get("requiredBy")),
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !submittal) {
    return {
      error: explain(error?.message ?? "", "That submittal was not saved."),
    };
  }

  const { error: revisionError } = await supabase
    .from("agenda_submittal_revisions")
    .insert({
      submittal_id: submittal.id,
      project_id: projectId,
      revision: 1,
      status: "pending",
      submitted_by: user.id,
    });
  if (revisionError) {
    return {
      error:
        "The submittal was opened, but Rev 01 was not issued. Resubmit it to try again.",
    };
  }

  refresh(projectId);
  return { ok: true };
}

/**
 * Issues the next revision of an existing submittal.
 *
 * The number is the highest already issued plus one, read here rather than
 * counted: a revision withdrawn leaves a gap, and reusing its number puts two
 * different documents in two people's inboxes carrying the same one.
 */
export async function resubmit(
  projectId: string,
  submittalId: string,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const { data: existing } = await supabase
    .from("agenda_submittal_revisions")
    .select("revision")
    .eq("submittal_id", submittalId)
    .order("revision", { ascending: false })
    .limit(1);

  const highest = existing?.[0]?.revision ?? 0;

  const { error } = await supabase.from("agenda_submittal_revisions").insert({
    submittal_id: submittalId,
    project_id: projectId,
    revision: highest + 1,
    status: "pending",
    submitted_by: user.id,
  });
  if (error) {
    return {
      error: explain(error.message, "That revision could not be issued."),
    };
  }

  const { error: statusError } = await supabase
    .from("agenda_submittals")
    .update({ status: "pending" })
    .eq("id", submittalId);
  if (statusError) {
    return {
      error:
        "The revision was issued, but the submittal still reads as reviewed.",
    };
  }

  refresh(projectId);
  return { ok: true };
}

const REVIEWABLE = [
  "approved",
  "approved_with_comments",
  "revise_resubmit",
  "rejected",
] as const;

type Reviewable = (typeof REVIEWABLE)[number];

/**
 * Records a reviewer's decision on the current revision.
 *
 * The outcome is written to the revision *and* to the submittal. The revision
 * keeps what was decided about that particular issue, which is what a dispute
 * turns on; the submittal carries the latest, which is what the register
 * shows. Deriving one from the other would mean the register changed retro-
 * spectively every time an old revision was corrected.
 */
export async function reviewRevision(
  projectId: string,
  submittalId: string,
  revisionId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const outcome = String(formData.get("outcome") ?? "");
  if (!REVIEWABLE.includes(outcome as Reviewable)) {
    return { error: "Choose an outcome for the review." };
  }

  const comment = text(formData.get("comment"), 2000);

  const { error } = await supabase
    .from("agenda_submittal_revisions")
    .update({
      status: outcome as Reviewable,
      reviewer_comment: comment,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", revisionId);
  if (error) {
    return { error: explain(error.message, "That review was not recorded.") };
  }

  const { error: rollUpError } = await supabase
    .from("agenda_submittals")
    .update({ status: outcome as Reviewable })
    .eq("id", submittalId);
  if (rollUpError) {
    return {
      error:
        "The review was recorded on the revision, but the submittal still reads as pending.",
    };
  }

  refresh(projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

/**
 * Adds an activity to the programme.
 *
 * `position` is the count of what is already there, so a new activity lands at
 * the bottom rather than at an arbitrary place in the middle. Reordering is a
 * later phase; arriving in the order they were planned is the behaviour people
 * expect in the meantime.
 */
export async function addScheduleItem(
  projectId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const name = text(formData.get("name"), 200);
  if (!name) return { error: "The activity needs a name." };

  const start = date(formData.get("startDate"));
  const finish = date(formData.get("finishDate"));
  if (start && finish && finish < start) {
    // The table has the same rule as a check constraint. Catching it here
    // means a sentence rather than a constraint name.
    return { error: "The finish date is before the start date." };
  }

  const { count } = await supabase
    .from("agenda_schedule_items")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { error } = await supabase.from("agenda_schedule_items").insert({
    project_id: projectId,
    parent_id: reference(formData.get("parentId")),
    name,
    start_date: start,
    finish_date: finish,
    duration_days: whole(formData.get("durationDays"), 0, 3650),
    is_milestone: formData.get("milestone") === "on",
    is_critical: formData.get("critical") === "on",
    assigned_to: reference(formData.get("assignedTo")),
    priority: priority(formData.get("priority")),
    position: count ?? 0,
  });

  if (error) {
    return { error: explain(error.message, "That activity was not added.") };
  }

  refresh(projectId);
  return { ok: true };
}

/**
 * Reports how far through an activity is.
 *
 * Reported, not derived. A percentage computed from dates is a number the site
 * did not agree to, and the first argument about it destroys trust in every
 * other figure on the screen — which is why `elapsedPercent` is shown beside
 * this rather than instead of it.
 */
export async function setScheduleProgress(
  projectId: string,
  itemId: string,
  percent: number,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const clamped = Math.min(Math.max(Math.round(percent), 0), 100);

  const { error } = await supabase
    .from("agenda_schedule_items")
    .update({
      progress_percent: clamped,
      // The two statuses that follow from the number are set with it. Leaving
      // an activity at 100% still reading "To do" is how a programme stops
      // being believed.
      status: clamped >= 100 ? "done" : clamped > 0 ? "in_progress" : "todo",
    })
    .eq("id", itemId);

  if (error) {
    return { error: explain(error.message, "That progress was not saved.") };
  }

  refresh(projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Site photos
// ---------------------------------------------------------------------------

/**
 * Files a photograph that has already been uploaded.
 *
 * The upload happens in the browser, straight to storage, because routing a
 * 8 MB phone photograph through a server action means holding it in memory
 * twice and a body-size limit that refuses the ones worth keeping. This writes
 * the row that says what the object is and where it was taken.
 *
 * The path is checked against the project rather than trusted. The storage
 * policy in 0094 already refuses an upload outside the member's own project,
 * so a mismatch here means the row and the object disagree — which would leave
 * a photograph on the wall that nobody can open.
 */
export async function fileSitePhoto(
  projectId: string,
  storagePath: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  if (!isInProject(storagePath, projectId)) {
    return { error: "That file was not uploaded to this project." };
  }

  const takenAt = date(formData.get("takenAt"));

  const { error } = await supabase.from("agenda_photos").insert({
    project_id: projectId,
    storage_path: storagePath,
    caption: text(formData.get("caption"), 300),
    building: text(formData.get("building"), 80),
    floor: text(formData.get("floor"), 80),
    area: text(formData.get("area"), 80),
    // A date with no time is midnight, which sorts a photograph taken today
    // below one taken this morning. Absent means now, which is almost always
    // right for a photograph being filed as it is taken.
    taken_at: takenAt ? `${takenAt}T12:00:00Z` : new Date().toISOString(),
    uploaded_by: user.id,
  });

  if (error) {
    return { error: explain(error.message, "That photo was not filed.") };
  }

  refresh(projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Quality: inspections, observations, punch list
// ---------------------------------------------------------------------------

function issueStatus(value: FormDataEntryValue | null): IssueStatus {
  const raw = String(value ?? "");
  return ISSUE_STATUSES.some((entry) => entry.value === raw)
    ? (raw as IssueStatus)
    : "open";
}

function inspectionResult(
  value: FormDataEntryValue | null,
): InspectionResult {
  const raw = String(value ?? "");
  return INSPECTION_RESULTS.some((entry) => entry.value === raw)
    ? (raw as InspectionResult)
    : "pending";
}

/**
 * Books an inspection, with the checklist it will be walked against.
 *
 * The checklist arrives as one line per check in a textarea rather than as a
 * repeating field set. A site engineer booking a rebar inspection on a phone
 * types the list; making them press "add a row" twelve times is how the
 * checklist ends up empty and the inspection becomes one unexplained word.
 */
export async function bookInspection(
  projectId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const title = text(formData.get("title"), 200);
  if (!title) return { error: "The inspection needs a title." };

  const { data: number } = await supabase.rpc("agenda_next_number", {
    target_project: projectId,
    record_kind: "inspection",
    prefix: "INS",
    width: 3,
  });

  const { data: inspection, error } = await supabase
    .from("agenda_inspections")
    .insert({
      project_id: projectId,
      number,
      title,
      discipline: discipline(formData.get("discipline")),
      location: text(formData.get("location"), 120),
      scheduled_for: date(formData.get("scheduledFor")),
      inspector_id: reference(formData.get("inspector")) ?? user.id,
      notes: text(formData.get("notes"), 2000),
      result: "pending",
    })
    .select("id")
    .single();

  if (error || !inspection) {
    return {
      error: explain(error?.message ?? "", "That inspection was not booked."),
    };
  }

  const checks = String(formData.get("checklist") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100);

  if (checks.length > 0) {
    const { error: itemsError } = await supabase
      .from("agenda_inspection_items")
      .insert(
        checks.map((description, index) => ({
          inspection_id: inspection.id,
          project_id: projectId,
          description: description.slice(0, 500),
          result: "pending" as const,
          position: index,
        })),
      );
    if (itemsError) {
      return {
        error:
          "The inspection was booked, but its checklist was not saved. Open it and add the checks.",
      };
    }
  }

  refresh(projectId);
  return { ok: true };
}

/**
 * Records the result of one check, and rolls the inspection up from its items.
 *
 * The header is derived rather than typed, because one failed item fails the
 * inspection and leaving that to the inspector is how a failed check ends up
 * under a passed heading. `rollUpInspection` is the one definition of that
 * rule and the screen shows the same number it produces.
 */
export async function recordInspectionItem(
  projectId: string,
  inspectionId: string,
  itemId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const { error } = await supabase
    .from("agenda_inspection_items")
    .update({
      result: inspectionResult(formData.get("result")),
      comment: text(formData.get("comment"), 1000),
    })
    .eq("id", itemId);
  if (error) {
    return { error: explain(error.message, "That result was not recorded.") };
  }

  // Read the items back rather than trusting what the form knew: another
  // inspector may have recorded a check on the same walk, and rolling up from
  // a stale page would overwrite their fail with a pass.
  const { data: items } = await supabase
    .from("agenda_inspection_items")
    .select("result")
    .eq("inspection_id", inspectionId);

  const rolled = rollUpInspection(
    (items ?? []).map((item) => ({ result: item.result as InspectionResult })),
  );

  if (rolled) {
    const { error: headerError } = await supabase
      .from("agenda_inspections")
      .update({
        result: rolled,
        // Settled the moment it stops being pending, so "when was this
        // inspected" has an answer without a second button to press.
        inspected_at: rolled === "pending" ? null : new Date().toISOString(),
      })
      .eq("id", inspectionId);
    if (headerError) {
      return {
        error:
          "The check was recorded, but the inspection's own result did not move.",
      };
    }
  }

  refresh(projectId);
  return { ok: true };
}

/**
 * Raises an observation, optionally from the inspection item that found it.
 *
 * `inspectionItemId` is the link the whole section turns on: six months later,
 * "why was this rebuilt" is answered by walking back from the punch item to
 * the observation to the failed check and the inspection it was part of.
 */
export async function raiseObservation(
  projectId: string,
  formData: FormData,
  inspectionItemId?: string,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const description = text(formData.get("description"), 2000);
  if (!description) return { error: "Say what was observed." };

  const kind = String(formData.get("kind") ?? "");

  const { error } = await supabase.from("agenda_observations").insert({
    project_id: projectId,
    kind: OBSERVATION_KINDS.some((entry) => entry.value === kind)
      ? (kind as ObservationKind)
      : "general",
    description,
    location: text(formData.get("location"), 120),
    responsible_company: text(formData.get("company"), 160),
    assigned_to: reference(formData.get("assignedTo")),
    due_date: date(formData.get("dueDate")),
    inspection_item_id: inspectionItemId ?? null,
    created_by: user.id,
    status: "open",
  });

  if (error) {
    return { error: explain(error.message, "That observation was not saved.") };
  }

  refresh(projectId);
  return { ok: true };
}

/**
 * Adds a punch item, optionally from the observation that caused it.
 *
 * Numbered, because a punch list is read out on site — "PL-035 is done" — and
 * a uuid is not something anybody says.
 */
export async function addPunchItem(
  projectId: string,
  formData: FormData,
  observationId?: string,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const description = text(formData.get("description"), 2000);
  if (!description) return { error: "Say what has to be put right." };

  const { data: number } = await supabase.rpc("agenda_next_number", {
    target_project: projectId,
    record_kind: "punch",
    prefix: "PL",
    width: 3,
  });

  const { error } = await supabase.from("agenda_punch_items").insert({
    project_id: projectId,
    number,
    description,
    location: text(formData.get("location"), 120),
    assigned_company: text(formData.get("company"), 160),
    assigned_to: reference(formData.get("assignedTo")),
    due_date: date(formData.get("dueDate")),
    priority: priority(formData.get("priority")),
    observation_id: observationId ?? null,
    created_by: user.id,
    status: "open",
  });

  if (error) {
    return { error: explain(error.message, "That punch item was not added.") };
  }

  refresh(projectId);
  return { ok: true };
}

/** Moves an observation or a punch item along. Both use one status set. */
export async function setIssueStatus(
  projectId: string,
  table: "agenda_observations" | "agenda_punch_items",
  itemId: string,
  status: FormDataEntryValue | null,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const { error } = await supabase
    .from(table)
    .update({ status: issueStatus(status) })
    .eq("id", itemId);

  if (error) {
    return { error: explain(error.message, "That change was not saved.") };
  }

  refresh(projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

/**
 * Fills in a form.
 *
 * The answers are keyed by field id rather than by label, so renaming a
 * question on the template does not orphan every answer already given to it.
 * Required fields are checked here against the template's own list — the
 * `answers` column is jsonb and the database has no opinion about what belongs
 * in it, which is the price of letting a company define its own permit.
 */
export async function submitForm(
  projectId: string,
  templateId: string,
  fields: readonly FormField[],
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const answers: Record<string, string | number | boolean> = {};
  for (const field of fields) {
    const raw = formData.get(`field.${field.id}`);
    if (field.kind === "yes_no") {
      // An unticked checkbox posts nothing, and "no" is an answer. Every
      // yes/no field is written, so a deliberate no is not read as a skip.
      answers[field.id] = raw === "on";
      continue;
    }
    if (typeof raw !== "string" || raw.trim() === "") continue;
    if (field.kind === "number") {
      const n = Number(raw);
      if (Number.isFinite(n)) answers[field.id] = n;
      continue;
    }
    if (field.kind === "choice" && !field.options?.includes(raw)) continue;
    answers[field.id] = raw.slice(0, 2000);
  }

  const missing = missingAnswers(fields, answers);
  if (missing.length > 0) {
    return {
      error: `Still to answer: ${missing.map((field) => field.label).join(", ")}.`,
    };
  }

  const { data: number } = await supabase.rpc("agenda_next_number", {
    target_project: projectId,
    record_kind: "form",
    prefix: "FRM",
    width: 3,
  });

  const { error } = await supabase.from("agenda_form_submissions").insert({
    template_id: templateId,
    project_id: projectId,
    number,
    answers,
    status: "pending",
    submitted_by: user.id,
    submitted_at: new Date().toISOString(),
  });

  if (error) {
    return { error: explain(error.message, "That form was not submitted.") };
  }

  refresh(projectId);
  return { ok: true };
}

/**
 * Saves a form template.
 *
 * The owner is the caller, which is what the policy in 0091 checks — a
 * template with no project is one somebody reuses across their jobs, and
 * membership cannot gate a row with no project on it. `scope` decides which
 * of the two this is.
 *
 * Each field gets a minted id rather than one derived from its label or its
 * position, because answers are keyed by field id and both of those change
 * when somebody corrects a question.
 */
export async function saveFormTemplate(
  projectId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const name = text(formData.get("name"), 160);
  if (!name) return { error: "The form needs a name." };

  const fields = parseFieldLines(
    String(formData.get("questions") ?? "").slice(0, 8000),
  ).map((field) => ({ ...field, id: crypto.randomUUID() }));

  if (fields.length === 0) {
    return { error: "Write at least one question, one per line." };
  }

  const { error } = await supabase.from("agenda_form_templates").insert({
    owner_id: user.id,
    // "everywhere" is a template the owner reuses; anything else belongs to
    // this project and dies with it.
    project_id: formData.get("scope") === "everywhere" ? null : projectId,
    name,
    description: text(formData.get("description"), 500),
    fields,
  });

  if (error) {
    return { error: explain(error.message, "That form was not saved.") };
  }

  refresh(projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 360 progress
// ---------------------------------------------------------------------------

/**
 * Pins a finished panorama to a place on this project.
 *
 * The panorama itself is not copied. 0081 to 0083 captured, stitched and
 * published it, and this writes an `agenda_photos` row that points at that job
 * — so a re-stitch that fixes a seam fixes the site record too, rather than
 * leaving the tour corrected and the progress record wrong.
 *
 * 0095 is what allows the row to exist at all: `storage_path` was `not null`,
 * and a panorama has no file in the site bucket to name.
 */
export async function pinPanorama(
  projectId: string,
  jobId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const takenAt = date(formData.get("takenAt"));

  const { error } = await supabase.from("agenda_photos").insert({
    project_id: projectId,
    panorama_job_id: jobId,
    storage_path: null,
    caption: text(formData.get("caption"), 300),
    building: text(formData.get("building"), 80),
    floor: text(formData.get("floor"), 80),
    area: text(formData.get("area"), 80),
    taken_at: takenAt ? `${takenAt}T12:00:00Z` : new Date().toISOString(),
    uploaded_by: user.id,
  });

  if (error) {
    return { error: explain(error.message, "That panorama was not pinned.") };
  }

  refresh(projectId);
  return { ok: true };
}
