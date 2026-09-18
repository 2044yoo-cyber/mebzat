"use server";

import { revalidatePath } from "next/cache";

import { isInProject } from "@/lib/agenda/files";
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
