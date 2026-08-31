"use server";

import { revalidatePath } from "next/cache";

import {
  directionFor,
  fileKindOf,
  type AgendaRole,
  type Confidentiality,
  type LedgerKind,
  type ReminderKind,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/agenda/constants";
import { createClient } from "@/lib/supabase/server";
import type { AgendaMemberRow } from "@/types/database.types";

/**
 * Writing to a project's Agenda.
 *
 * Nothing here checks whether the caller is allowed to do what they are
 * asking. That is not an oversight — row-level security refuses the write, and
 * a second check in TypeScript would be a second thing to keep correct and the
 * one that is easier to forget. What these functions do is shape the row,
 * report the failure in words, and revalidate the page.
 *
 * They also never delete. `archive` sets a timestamp; the database has no
 * DELETE policy and does not grant the privilege, so an attempt would fail
 * even if one of these functions asked for it.
 */

type Result = { error?: string };

async function actor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Turns a Postgres refusal into a sentence a site manager can act on. */
function explain(message: string, fallback: string): string {
  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "You do not have access to that part of this Agenda. Ask the client to grant it.";
  }
  if (message.includes("Agenda permissions")) {
    return "Only the client or an administrator can change Agenda permissions.";
  }
  if (message.includes("duplicate key") && message.includes("daily_logs")) {
    return "There is already a log for that date. Open it and edit it instead — the change is recorded.";
  }
  if (message.includes("duplicate key")) {
    return "That already exists.";
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export async function inviteMember(input: {
  projectId: string;
  email: string;
  role: AgendaRole;
  canViewFinance?: boolean;
  canViewMeetings?: boolean;
  canViewContracts?: boolean;
  canApprove?: boolean;
}): Promise<Result & { id?: string }> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Sign in first." };

  const { data: invitee } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", input.email.trim().toLowerCase())
    .maybeSingle();

  if (!invitee) {
    return {
      error:
        "Nobody with that email is on Medosha yet. Ask them to sign up, then invite them.",
    };
  }

  const { data, error } = await supabase
    .from("agenda_members")
    .insert({
      project_id: input.projectId,
      user_id: invitee.id,
      role: input.role,
      // Invited, not active: being added to a private record is something you
      // should know about rather than discover.
      status: "invited",
      can_view_finance: input.canViewFinance ?? false,
      can_view_meetings: input.canViewMeetings ?? false,
      can_view_contracts: input.canViewContracts ?? false,
      can_approve: input.canApprove ?? false,
      invited_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    return { error: explain(error.message, "That invitation could not be sent.") };
  }

  await supabase.from("notifications").insert({
    user_id: invitee.id,
    kind: "agenda_invite",
    title: "You have been invited to a project Agenda",
    body: "Open the project to accept.",
    href: `/projects/${input.projectId}/agenda`,
  });

  revalidatePath(`/projects/${input.projectId}/agenda`);
  return { id: data.id };
}

export async function updateMember(input: {
  projectId: string;
  memberId: string;
  role?: AgendaRole;
  canViewFinance?: boolean;
  canViewMeetings?: boolean;
  canViewContracts?: boolean;
  canApprove?: boolean;
  status?: "invited" | "active" | "suspended" | "removed";
}): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Sign in first." };

  const patch: Partial<AgendaMemberRow> = {};
  if (input.role !== undefined) patch.role = input.role;
  if (input.canViewFinance !== undefined) patch.can_view_finance = input.canViewFinance;
  if (input.canViewMeetings !== undefined) patch.can_view_meetings = input.canViewMeetings;
  if (input.canViewContracts !== undefined) patch.can_view_contracts = input.canViewContracts;
  if (input.canApprove !== undefined) patch.can_approve = input.canApprove;
  if (input.status !== undefined) {
    patch.status = input.status;
    if (input.status === "active") patch.accepted_at = new Date().toISOString();
    if (input.status === "removed") patch.removed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("agenda_members")
    .update(patch)
    .eq("id", input.memberId);

  if (error) {
    return { error: explain(error.message, "That change could not be saved.") };
  }

  revalidatePath(`/projects/${input.projectId}/agenda`);
  return {};
}

/** Accepting your own invitation. */
export async function acceptInvite(projectId: string): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase
    .from("agenda_members")
    .update({ status: "active", accepted_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("user_id", user.id);

  if (error) return { error: explain(error.message, "Could not accept.") };
  revalidatePath(`/projects/${projectId}/agenda`);
  return {};
}

// ---------------------------------------------------------------------------
// Daily log
// ---------------------------------------------------------------------------

export async function saveDailyLog(input: {
  projectId: string;
  id?: string;
  logDate: string;
  weather?: string;
  temperatureC?: number | null;
  workersPresent?: number | null;
  workCompleted?: string;
  materialsDelivered?: string;
  equipmentUsed?: string;
  problems?: string;
  safetyIssues?: string;
  visitors?: string;
  notes?: string;
}): Promise<Result & { id?: string }> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Sign in first." };

  const row = {
    project_id: input.projectId,
    log_date: input.logDate,
    weather: input.weather?.trim() || null,
    temperature_c: input.temperatureC ?? null,
    workers_present: input.workersPresent ?? null,
    work_completed: input.workCompleted?.trim() || null,
    materials_delivered: input.materialsDelivered?.trim() || null,
    equipment_used: input.equipmentUsed?.trim() || null,
    problems: input.problems?.trim() || null,
    safety_issues: input.safetyIssues?.trim() || null,
    visitors: input.visitors?.trim() || null,
    notes: input.notes?.trim() || null,
    author_id: user.id,
  };

  const query = input.id
    ? supabase.from("agenda_daily_logs").update(row).eq("id", input.id).select("id").single()
    : supabase.from("agenda_daily_logs").insert(row).select("id").single();

  const { data, error } = await query;
  if (error) {
    return { error: explain(error.message, "That log could not be saved.") };
  }

  revalidatePath(`/projects/${input.projectId}/agenda`);
  return { id: data.id };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function saveTask(input: {
  projectId: string;
  id?: string;
  title: string;
  description?: string;
  assignedTo?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueAt?: string | null;
}): Promise<Result & { id?: string }> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Sign in first." };
  if (!input.title.trim()) return { error: "Give the task a title." };

  const row = {
    project_id: input.projectId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    assigned_to: input.assignedTo || null,
    priority: input.priority ?? "normal",
    status: input.status ?? "todo",
    due_at: input.dueAt || null,
    // The timestamps follow the status rather than being set by hand, so a
    // task marked done always carries when it was done.
    ...(input.status === "in_progress"
      ? { started_at: new Date().toISOString() }
      : input.status === "done"
        ? { completed_at: new Date().toISOString() }
        : {}),
  };

  const query = input.id
    ? supabase.from("agenda_tasks").update(row).eq("id", input.id).select("id").single()
    : supabase
        .from("agenda_tasks")
        .insert({ ...row, created_by: user.id })
        .select("id")
        .single();

  const { data, error } = await query;
  if (error) {
    return { error: explain(error.message, "That task could not be saved.") };
  }

  if (!input.id && input.assignedTo && input.assignedTo !== user.id) {
    await supabase.from("notifications").insert({
      user_id: input.assignedTo,
      kind: "agenda_task",
      title: "A task was assigned to you",
      body: input.title.trim(),
      href: `/projects/${input.projectId}/agenda?tab=tasks`,
    });
  }

  revalidatePath(`/projects/${input.projectId}/agenda`);
  return { id: data.id };
}

export async function commentOnTask(input: {
  projectId: string;
  taskId: string;
  body: string;
}): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Sign in first." };
  if (!input.body.trim()) return { error: "Write something first." };

  const { error } = await supabase.from("agenda_task_comments").insert({
    task_id: input.taskId,
    project_id: input.projectId,
    author_id: user.id,
    body: input.body.trim(),
  });

  if (error) return { error: explain(error.message, "Could not add that comment.") };
  revalidatePath(`/projects/${input.projectId}/agenda`);
  return {};
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export async function recordLedgerEntry(input: {
  projectId: string;
  id?: string;
  kind: LedgerKind;
  amount: number;
  currency?: string;
  status?: "paid" | "outstanding" | "void";
  description: string;
  counterparty?: string;
  reference?: string;
  supplierId?: string | null;
  occurredOn?: string;
  dueOn?: string | null;
}): Promise<Result & { id?: string }> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Sign in first." };
  if (!input.description.trim()) return { error: "Say what the money was for." };
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    return { error: "Enter an amount." };
  }

  const row = {
    project_id: input.projectId,
    kind: input.kind,
    // Derived from the kind, so a client payment cannot be filed as a cost by
    // getting one dropdown wrong.
    direction: directionFor(input.kind),
    amount: input.amount,
    currency: input.currency ?? "ETB",
    status: input.status ?? "paid",
    description: input.description.trim(),
    counterparty: input.counterparty?.trim() || null,
    reference: input.reference?.trim() || null,
    supplier_id: input.supplierId || null,
    occurred_on: input.occurredOn ?? new Date().toISOString().slice(0, 10),
    due_on: input.dueOn || null,
    recorded_by: user.id,
  };

  const query = input.id
    ? supabase.from("agenda_ledger").update(row).eq("id", input.id).select("id").single()
    : supabase.from("agenda_ledger").insert(row).select("id").single();

  const { data, error } = await query;
  if (error) {
    return {
      error: explain(error.message, "That entry could not be recorded."),
    };
  }

  revalidatePath(`/projects/${input.projectId}/agenda`);
  return { id: data.id };
}

// ---------------------------------------------------------------------------
// Meetings and decisions
// ---------------------------------------------------------------------------

export async function saveMeeting(input: {
  projectId: string;
  id?: string;
  title: string;
  heldAt?: string;
  location?: string;
  attendees?: string;
  minutes?: string;
  clientDecisions?: string;
  designChanges?: string;
  approvals?: string;
  inspectionResult?: string;
  nextActions?: string;
}): Promise<Result & { id?: string }> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Sign in first." };
  if (!input.title.trim()) return { error: "Give the meeting a title." };

  const row = {
    project_id: input.projectId,
    title: input.title.trim(),
    held_at: input.heldAt ?? new Date().toISOString(),
    location: input.location?.trim() || null,
    attendees: input.attendees?.trim() || null,
    minutes: input.minutes?.trim() || null,
    client_decisions: input.clientDecisions?.trim() || null,
    design_changes: input.designChanges?.trim() || null,
    approvals: input.approvals?.trim() || null,
    inspection_result: input.inspectionResult?.trim() || null,
    next_actions: input.nextActions?.trim() || null,
    author_id: user.id,
  };

  const query = input.id
    ? supabase.from("agenda_meetings").update(row).eq("id", input.id).select("id").single()
    : supabase.from("agenda_meetings").insert(row).select("id").single();

  const { data, error } = await query;
  if (error) {
    return { error: explain(error.message, "That meeting could not be saved.") };
  }

  revalidatePath(`/projects/${input.projectId}/agenda`);
  return { id: data.id };
}

export async function recordDecision(input: {
  projectId: string;
  id?: string;
  title: string;
  detail?: string;
  status?: "proposed" | "approved" | "rejected" | "superseded";
  decidedByName?: string;
  decidedOn?: string | null;
  meetingId?: string | null;
  supersedes?: string | null;
}): Promise<Result & { id?: string }> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Sign in first." };
  if (!input.title.trim()) return { error: "What was decided?" };

  const row = {
    project_id: input.projectId,
    title: input.title.trim(),
    detail: input.detail?.trim() || null,
    status: input.status ?? "proposed",
    decided_by: user.id,
    decided_by_name: input.decidedByName?.trim() || null,
    decided_on: input.decidedOn || new Date().toISOString().slice(0, 10),
    meeting_id: input.meetingId || null,
    supersedes: input.supersedes || null,
    created_by: user.id,
  };

  const query = input.id
    ? supabase.from("agenda_decisions").update(row).eq("id", input.id).select("id").single()
    : supabase.from("agenda_decisions").insert(row).select("id").single();

  const { data, error } = await query;
  if (error) {
    return { error: explain(error.message, "That decision could not be saved.") };
  }

  revalidatePath(`/projects/${input.projectId}/agenda`);
  return { id: data.id };
}

// ---------------------------------------------------------------------------
// Attachments and reminders
// ---------------------------------------------------------------------------

export async function attachFile(input: {
  projectId: string;
  entityTable: string;
  entityId: string;
  url: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  caption?: string;
  confidentiality?: Confidentiality;
}): Promise<Result & { id?: string }> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Sign in first." };

  const { data, error } = await supabase
    .from("agenda_attachments")
    .insert({
      project_id: input.projectId,
      entity_table: input.entityTable,
      entity_id: input.entityId,
      url: input.url,
      file_name: input.fileName,
      // Worked out from the name, because a DWG arrives as
      // application/octet-stream and the browser has no idea what it is.
      file_kind: fileKindOf(input.fileName, input.mimeType),
      mime_type: input.mimeType ?? null,
      size_bytes: input.sizeBytes ?? null,
      caption: input.caption?.trim() || null,
      confidentiality: input.confidentiality ?? "members",
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    return { error: explain(error.message, "That file could not be attached.") };
  }

  revalidatePath(`/projects/${input.projectId}/agenda`);
  return { id: data.id };
}

export async function saveReminder(input: {
  projectId: string;
  id?: string;
  kind: ReminderKind;
  title: string;
  detail?: string;
  dueAt: string;
  assignedTo?: string | null;
  confidentiality?: Confidentiality;
}): Promise<Result & { id?: string }> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Sign in first." };
  if (!input.title.trim()) return { error: "What is the reminder for?" };

  const row = {
    project_id: input.projectId,
    kind: input.kind,
    title: input.title.trim(),
    detail: input.detail?.trim() || null,
    due_at: input.dueAt,
    assigned_to: input.assignedTo || null,
    confidentiality: input.confidentiality ?? "members",
    created_by: user.id,
  };

  const query = input.id
    ? supabase.from("agenda_reminders").update(row).eq("id", input.id).select("id").single()
    : supabase.from("agenda_reminders").insert(row).select("id").single();

  const { data, error } = await query;
  if (error) {
    return { error: explain(error.message, "That reminder could not be saved.") };
  }

  revalidatePath(`/projects/${input.projectId}/agenda`);
  return { id: data.id };
}

export async function completeReminder(input: {
  projectId: string;
  id: string;
}): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase
    .from("agenda_reminders")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", input.id);

  if (error) return { error: explain(error.message, "Could not update that.") };
  revalidatePath(`/projects/${input.projectId}/agenda`);
  return {};
}

/**
 * Withdrawing a record.
 *
 * The nearest thing Agenda has to a delete. The row stays readable, the audit
 * trail records who withdrew it and when, and the timeline entry it created
 * remains — because a record that can be made to disappear is not a record.
 */
export async function archiveRecord(input: {
  projectId: string;
  table:
    | "agenda_daily_logs"
    | "agenda_tasks"
    | "agenda_ledger"
    | "agenda_meetings"
    | "agenda_attachments";
  id: string;
}): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase
    .from(input.table)
    .update({ archived_at: new Date().toISOString() })
    .eq("id", input.id);

  if (error) return { error: explain(error.message, "Could not withdraw that.") };
  revalidatePath(`/projects/${input.projectId}/agenda`);
  return {};
}
