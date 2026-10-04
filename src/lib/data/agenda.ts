import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  AgendaRole,
  Confidentiality,
  EventKind,
  FileKind,
  LedgerKind,
  LedgerStatus,
  ReminderKind,
  TaskPriority,
  TaskStatus,
} from "@/lib/agenda/constants";

/**
 * Reading a project's Agenda.
 *
 * Every function here is a plain query with no permission check in it, which
 * is deliberate: the checks live in row-level security, so a member without
 * finance access gets an empty ledger rather than an error, and a non-member
 * gets nothing at all. Putting the rule in TypeScript as well would mean two
 * places to keep in step and one of them not enforced.
 *
 * The one thing the caller does need is `agendaOverview`, which reports
 * whether the reader is a member at all — used to decide between showing the
 * workspace and showing a 404.
 */

type Person = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

const PERSON = "id, username, full_name, avatar_url";

export type AgendaOverview = {
  is_member: boolean;
  can_view_finance: boolean;
  member_count: number;
  open_tasks: number;
  overdue_tasks: number;
  logs_this_week: number;
  last_log_date: string | null;
  open_reminders: number;
  /** Null — not zero — when the reader may not see money. */
  total_spent: number | null;
  total_received: number | null;
  outstanding: number | null;
};

/**
 * Why the Agenda could not be opened.
 *
 * "Not a member" and "the database cannot answer" are different facts and
 * need different pages, but the old version returned null for both — so a
 * deployment that had not run the Agenda migration showed its owner a bare
 * 404 on their own project, which is a lie about what is wrong.
 */
export type AgendaAccess =
  | { ok: true; overview: AgendaOverview }
  | { ok: false; reason: "not_member" }
  | { ok: false; reason: "not_installed"; detail: string }
  | { ok: false; reason: "unavailable"; detail: string };

/** Postgres's code for "no such function". */
const UNDEFINED_FUNCTION = "42883";

export async function agendaAccess(projectId: string): Promise<AgendaAccess> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agenda_overview", {
    target_project: projectId,
  });

  if (error) {
    // The migration has not been run. This is the single most likely reason
    // the page 404s on a fresh install, and it is worth saying out loud
    // rather than dressing up as "this does not exist".
    const missing =
      error.code === UNDEFINED_FUNCTION ||
      /could not find the function|schema cache/i.test(error.message);

    console.error("[medosha:agenda] overview failed:", error.message);

    return missing
      ? { ok: false, reason: "not_installed", detail: error.message }
      : { ok: false, reason: "unavailable", detail: error.message };
  }

  const overview = data?.[0] as AgendaOverview | undefined;
  // The function returns no rows for a non-member — that is the access rule,
  // not a failure.
  if (!overview?.is_member) return { ok: false, reason: "not_member" };

  return { ok: true, overview };
}

/** Kept for callers that only need the numbers. */
export async function agendaOverview(
  projectId: string,
): Promise<AgendaOverview | null> {
  const access = await agendaAccess(projectId);
  return access.ok ? access.overview : null;
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export type AgendaMember = {
  id: string;
  project_id: string;
  user_id: string;
  role: AgendaRole;
  status: "invited" | "active" | "suspended" | "removed";
  can_view_finance: boolean;
  can_view_meetings: boolean;
  can_view_contracts: boolean;
  can_approve: boolean;
  invited_at: string;
  accepted_at: string | null;
  user: Person | null;
};

export async function agendaMembers(
  projectId: string,
): Promise<AgendaMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_members")
    .select(`*, user:profiles!user_id(${PERSON})`)
    .eq("project_id", projectId)
    .neq("status", "removed")
    .order("role");
  return (data ?? []) as unknown as AgendaMember[];
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export type AgendaEvent = {
  id: string;
  kind: EventKind;
  title: string;
  detail: string | null;
  entity_table: string | null;
  entity_id: string | null;
  confidentiality: Confidentiality;
  occurred_at: string;
  actor: Person | null;
};

export async function agendaTimeline(
  projectId: string,
  limit = 60,
): Promise<AgendaEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_events")
    .select(`*, actor:profiles!actor_id(${PERSON})`)
    .eq("project_id", projectId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as AgendaEvent[];
}

// ---------------------------------------------------------------------------
// Daily logs
// ---------------------------------------------------------------------------

export type DailyLog = {
  id: string;
  project_id: string;
  log_date: string;
  weather: string | null;
  temperature_c: number | null;
  workers_present: number | null;
  work_completed: string | null;
  materials_delivered: string | null;
  equipment_used: string | null;
  problems: string | null;
  safety_issues: string | null;
  visitors: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  author: Person | null;
};

export async function agendaLogs(
  projectId: string,
  limit = 30,
): Promise<DailyLog[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_daily_logs")
    .select(`*, author:profiles!author_id(${PERSON})`)
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("log_date", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as DailyLog[];
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type AgendaTask = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  assignee: Person | null;
  creator: Person | null;
};

export async function agendaTasks(projectId: string): Promise<AgendaTask[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_tasks")
    .select(
      `*, assignee:profiles!assigned_to(${PERSON}), creator:profiles!created_by(${PERSON})`,
    )
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(200);
  return (data ?? []) as unknown as AgendaTask[];
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export type LedgerEntry = {
  id: string;
  project_id: string;
  kind: LedgerKind;
  direction: -1 | 1;
  amount: number;
  currency: string;
  status: LedgerStatus;
  description: string;
  counterparty: string | null;
  reference: string | null;
  occurred_on: string;
  due_on: string | null;
  created_at: string;
  recorder: Person | null;
};

/**
 * The ledger.
 *
 * Returns an empty list for a member without finance access rather than
 * throwing — that is row-level security doing its job, and the page shows a
 * "you do not have access to this" panel instead of an error. The distinction
 * between the two comes from `agendaOverview().can_view_finance`.
 */
export async function agendaLedger(projectId: string): Promise<LedgerEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_ledger")
    .select(`*, recorder:profiles!recorded_by(${PERSON})`)
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("occurred_on", { ascending: false })
    .limit(300);
  return (data ?? []) as unknown as LedgerEntry[];
}

// ---------------------------------------------------------------------------
// Meetings and decisions
// ---------------------------------------------------------------------------

export type Meeting = {
  id: string;
  project_id: string;
  title: string;
  held_at: string;
  location: string | null;
  attendees: string | null;
  minutes: string | null;
  client_decisions: string | null;
  design_changes: string | null;
  approvals: string | null;
  inspection_result: string | null;
  next_actions: string | null;
  created_at: string;
  author: Person | null;
};

export async function agendaMeetings(projectId: string): Promise<Meeting[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_meetings")
    .select(`*, author:profiles!author_id(${PERSON})`)
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("held_at", { ascending: false })
    .limit(100);
  return (data ?? []) as unknown as Meeting[];
}

export type Decision = {
  id: string;
  project_id: string;
  title: string;
  detail: string | null;
  status: "proposed" | "approved" | "rejected" | "superseded";
  decided_by_name: string | null;
  decided_on: string | null;
  created_at: string;
  decider: Person | null;
};

export async function agendaDecisions(
  projectId: string,
): Promise<Decision[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_decisions")
    .select(`*, decider:profiles!decided_by(${PERSON})`)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as unknown as Decision[];
}

// ---------------------------------------------------------------------------
// Attachments and reminders
// ---------------------------------------------------------------------------

export type Attachment = {
  id: string;
  entity_table: string;
  entity_id: string;
  url: string;
  file_name: string | null;
  file_kind: FileKind;
  mime_type: string | null;
  size_bytes: number | null;
  caption: string | null;
  confidentiality: Confidentiality;
  created_at: string;
};

export async function agendaAttachments(
  projectId: string,
  entity?: { table: string; ids: string[] },
): Promise<Attachment[]> {
  const supabase = await createClient();
  let query = supabase
    .from("agenda_attachments")
    .select("*")
    .eq("project_id", projectId)
    .is("archived_at", null);

  if (entity) {
    if (entity.ids.length === 0) return [];
    query = query.eq("entity_table", entity.table).in("entity_id", entity.ids);
  }

  const { data } = await query.order("created_at", { ascending: false }).limit(400);
  return (data ?? []) as unknown as Attachment[];
}

export type Reminder = {
  id: string;
  kind: ReminderKind;
  title: string;
  detail: string | null;
  due_at: string;
  completed_at: string | null;
  entity_table: string | null;
  entity_id: string | null;
  assignee: Person | null;
};

export async function agendaReminders(
  projectId: string,
): Promise<Reminder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_reminders")
    .select(`*, assignee:profiles!assigned_to(${PERSON})`)
    .eq("project_id", projectId)
    .is("completed_at", null)
    .order("due_at", { ascending: true })
    .limit(60);
  return (data ?? []) as unknown as Reminder[];
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export type AuditEntry = {
  id: number;
  table_name: string;
  row_id: string;
  action: "insert" | "update" | "archive";
  changes: Record<string, { from: unknown; to: unknown }> | null;
  created_at: string;
  actor: Person | null;
};

/**
 * The edit history.
 *
 * The point of Agenda: a site log rewritten a month later looks identical to
 * one written on the day, unless the change itself is on the record.
 */
export async function agendaHistory(
  projectId: string,
  limit = 100,
): Promise<AuditEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_audit")
    .select(`*, actor:profiles!actor_id(${PERSON})`)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as AuditEntry[];
}

/** Every Agenda the reader belongs to. */
export async function myAgendas(): Promise<
  {
    project_id: string;
    title: string;
    role: AgendaRole;
    open_tasks: number;
    last_activity: string | null;
  }[]
> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_agendas");
  return (data ?? []) as {
    project_id: string;
    title: string;
    role: AgendaRole;
    open_tasks: number;
    last_activity: string | null;
  }[];
}
