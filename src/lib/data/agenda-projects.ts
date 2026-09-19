import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  AgendaProjectStatus,
  AgendaProjectType,
} from "@/lib/agenda/projects";

/**
 * Reads for Agenda's construction projects.
 *
 * Nothing in this file filters by membership, and that is deliberate. The
 * policies in 0089 to 0091 already do it — `agenda_is_member`, and the finance
 * and contracts permissions on top — so a second check in TypeScript would be
 * a second place for the rule to be wrong, and the one that drifts is always
 * the copy. An empty result here means "you are not on this project", which is
 * the correct answer to give somebody who is not.
 */

export type AgendaProjectSummary = {
  id: string;
  name: string;
  projectNumber: string | null;
  type: AgendaProjectType;
  status: AgendaProjectStatus;
  location: string | null;
  clientName: string | null;
  mainContractor: string | null;
  startDate: string | null;
  targetCompletionDate: string | null;
  contractValue: number | null;
  currency: string;
  imageUrl: string | null;
  progressPercent: number;
  description: string | null;
  updatedAt: string;
};

const SUMMARY_COLUMNS = `
  id, name, project_number, project_type, status, location, client_name,
  main_contractor, start_date, target_completion_date, contract_value,
  currency, image_url, progress_percent, description, updated_at
`;

type SummaryRow = {
  id: string;
  name: string;
  project_number: string | null;
  project_type: string;
  status: string;
  location: string | null;
  client_name: string | null;
  main_contractor: string | null;
  start_date: string | null;
  target_completion_date: string | null;
  contract_value: number | null;
  currency: string;
  image_url: string | null;
  progress_percent: number;
  description: string | null;
  updated_at: string;
};

function toSummary(row: SummaryRow): AgendaProjectSummary {
  return {
    id: row.id,
    name: row.name,
    projectNumber: row.project_number,
    type: row.project_type as AgendaProjectType,
    status: row.status as AgendaProjectStatus,
    location: row.location,
    clientName: row.client_name,
    mainContractor: row.main_contractor,
    startDate: row.start_date,
    targetCompletionDate: row.target_completion_date,
    contractValue: row.contract_value,
    currency: row.currency,
    imageUrl: row.image_url,
    progressPercent: row.progress_percent,
    description: row.description,
    updatedAt: row.updated_at,
  };
}

/** Every project the viewer is a member of, most recently touched first. */
export async function getAgendaProjects(): Promise<AgendaProjectSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agenda_projects")
    .select(SUMMARY_COLUMNS)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error || !data) return [];
  return (data as unknown as SummaryRow[]).map(toSummary);
}

/**
 * One project, or null when the viewer is not on it.
 *
 * Null rather than a thrown error: row-level security hides other people's
 * projects, so "no row" and "no access" are the same result here, and the
 * caller renders a not-found either way. Telling somebody a project exists but
 * is not theirs is a leak dressed as a helpful message.
 */
export async function getAgendaProject(
  id: string,
): Promise<AgendaProjectSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_projects")
    .select(SUMMARY_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  return data ? toSummary(data as unknown as SummaryRow) : null;
}

export type AgendaHeadline = {
  activeProjects: number;
  tasksDue: number;
  openRfis: number;
  pendingSubmittals: number;
  openPunchItems: number;
  overdueTasks: number;
};

/**
 * The figures across the top of the Agenda home screen.
 *
 * Counted with `head: true`, so the database returns a number and not two
 * hundred rows nobody renders. Each count is scoped by the policies rather
 * than by a project list passed in — a member of four jobs gets the totals for
 * four jobs without this file knowing which four.
 */
export async function getAgendaHeadline(): Promise<AgendaHeadline> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  /**
   * One count, for one table, with the filters that define it.
   *
   * `head: true` so the database returns a number rather than two hundred rows
   * nobody renders. The filters are applied by the caller because each figure
   * means something different — "due" and "overdue" are the same table and not
   * the same question.
   */
  async function countWhere(
    table: "agenda_projects" | "agenda_tasks" | "agenda_rfis"
      | "agenda_submittals" | "agenda_punch_items",
    statuses: readonly string[],
  ): Promise<number> {
    const { count } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      // `as never`: each of these tables types `status` as its own enum, and
      // one function serving five of them cannot satisfy all five at once.
      // The values are literals a line above, and the database rejects an
      // unknown one — so the cast loses a check that is being made anyway.
      .in("status", statuses as never);
    return count ?? 0;
  }

  // "Live work" is the same three statuses the dashboard filter calls Active,
  // and they are named in `lib/agenda/projects` so the card and the filter
  // cannot come to mean different things.
  const OPEN_TASK = ["todo", "in_progress", "review"] as const;

  const [
    activeProjects,
    tasksDue,
    openRfis,
    pendingSubmittals,
    openPunchItems,
    overdueTasks,
  ] = await Promise.all([
    countWhere("agenda_projects", ["planning", "tender", "construction"]),
    countWhere("agenda_tasks", OPEN_TASK),
    countWhere("agenda_rfis", ["open", "pending"]),
    countWhere("agenda_submittals", ["draft", "pending"]),
    countWhere("agenda_punch_items", [
      "open", "assigned", "in_progress", "ready_for_inspection",
    ]),
    // Overdue is the one figure that needs a second condition, so it is asked
    // for on its own rather than bending `countWhere` into a shape that serves
    // one caller.
    supabase
      .from("agenda_tasks")
      .select("id", { count: "exact", head: true })
      .in("status", OPEN_TASK as never)
      .lt("due_at", today)
      .then(({ count }) => count ?? 0),
  ]);

  return {
    activeProjects,
    tasksDue,
    openRfis,
    pendingSubmittals,
    openPunchItems,
    overdueTasks,
  };
}

// ---------------------------------------------------------------------------
// Across every project
// ---------------------------------------------------------------------------

export type MyTask = {
  id: string;
  projectId: string;
  projectName: string | null;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
};

/**
 * Every open task assigned to the viewer, across every project they are on.
 *
 * Not filtered by project: the policies already limit this to projects the
 * viewer is a member of, so asking for "my tasks" is one query rather than one
 * per project, and a member added to a fifth job sees its tasks without this
 * file knowing the job exists.
 *
 * Assigned to *me* specifically, which is the one filter that is this screen's
 * job rather than a policy's — being on a project does not make its tasks
 * mine.
 */
export async function getMyTasks(userId: string): Promise<MyTask[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_tasks")
    .select(
      `id, project_id, title, status, priority, due_at,
       project:agenda_projects!agenda_tasks_project_id_fkey(name)`,
    )
    .eq("assigned_to", userId)
    .in("status", ["todo", "in_progress", "blocked", "review"])
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(200);

  if (!data) return [];

  return (
    data as unknown as {
      id: string;
      project_id: string;
      title: string;
      status: string;
      priority: string;
      due_at: string | null;
      project: { name: string } | { name: string }[] | null;
    }[]
  ).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    projectName: Array.isArray(row.project)
      ? (row.project[0]?.name ?? null)
      : (row.project?.name ?? null),
    title: row.title,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at,
  }));
}

export type DiaryEntry = {
  id: string;
  projectId: string;
  projectName: string | null;
  kind: "task" | "meeting" | "inspection" | "milestone" | "rfi" | "invoice";
  title: string;
  /** The day it lands on, as YYYY-MM-DD. */
  on: string;
};

/**
 * Everything dated, across every project, in one list.
 *
 * Six separate reads rather than a view, because the six tables have six
 * different permissions — an invoice is finance-gated and a meeting needs
 * `can_view_meetings`, and a view would have to reproduce all of that or
 * leak. Asking each table separately lets each one's policy answer for itself,
 * and a table the viewer may not read simply returns nothing.
 */
export async function getDiary(
  userId: string,
  fromDay: string,
  toDay: string,
): Promise<DiaryEntry[]> {
  const supabase = await createClient();

  const name = (value: unknown): string | null => {
    if (Array.isArray(value)) {
      return (value[0] as { name?: string })?.name ?? null;
    }
    return (value as { name?: string } | null)?.name ?? null;
  };

  const [tasks, meetings, inspections, milestones, rfis, invoices] =
    await Promise.all([
      supabase
        .from("agenda_tasks")
        .select(`id, project_id, title, due_at,
                 project:agenda_projects!agenda_tasks_project_id_fkey(name)`)
        .eq("assigned_to", userId)
        .gte("due_at", `${fromDay}T00:00:00Z`)
        .lte("due_at", `${toDay}T23:59:59Z`)
        .limit(200),
      supabase
        .from("agenda_meetings")
        .select(`id, project_id, title, held_at,
                 project:agenda_projects!agenda_meetings_project_id_fkey(name)`)
        .gte("held_at", `${fromDay}T00:00:00Z`)
        .lte("held_at", `${toDay}T23:59:59Z`)
        .limit(200),
      supabase
        .from("agenda_inspections")
        .select(`id, project_id, title, scheduled_for,
                 project:agenda_projects!agenda_inspections_project_id_fkey(name)`)
        .gte("scheduled_for", fromDay)
        .lte("scheduled_for", toDay)
        .limit(200),
      supabase
        .from("agenda_schedule_items")
        .select(`id, project_id, name, finish_date,
                 project:agenda_projects!agenda_schedule_items_project_id_fkey(name)`)
        .eq("is_milestone", true)
        .gte("finish_date", fromDay)
        .lte("finish_date", toDay)
        .limit(200),
      supabase
        .from("agenda_rfis")
        .select(`id, project_id, subject, due_date,
                 project:agenda_projects!agenda_rfis_project_id_fkey(name)`)
        .gte("due_date", fromDay)
        .lte("due_date", toDay)
        .limit(200),
      supabase
        .from("agenda_invoices")
        .select(`id, project_id, number, company_name, due_on,
                 project:agenda_projects!agenda_invoices_project_id_fkey(name)`)
        .gte("due_on", fromDay)
        .lte("due_on", toDay)
        .limit(200),
    ]);

  const entries: DiaryEntry[] = [];

  for (const row of (tasks.data ?? []) as Record<string, unknown>[]) {
    entries.push({
      id: `task-${String(row.id)}`,
      projectId: String(row.project_id),
      projectName: name(row.project),
      kind: "task",
      title: String(row.title),
      on: String(row.due_at).slice(0, 10),
    });
  }
  for (const row of (meetings.data ?? []) as Record<string, unknown>[]) {
    entries.push({
      id: `meeting-${String(row.id)}`,
      projectId: String(row.project_id),
      projectName: name(row.project),
      kind: "meeting",
      title: String(row.title),
      on: String(row.held_at).slice(0, 10),
    });
  }
  for (const row of (inspections.data ?? []) as Record<string, unknown>[]) {
    entries.push({
      id: `inspection-${String(row.id)}`,
      projectId: String(row.project_id),
      projectName: name(row.project),
      kind: "inspection",
      title: String(row.title),
      on: String(row.scheduled_for),
    });
  }
  for (const row of (milestones.data ?? []) as Record<string, unknown>[]) {
    entries.push({
      id: `milestone-${String(row.id)}`,
      projectId: String(row.project_id),
      projectName: name(row.project),
      kind: "milestone",
      title: String(row.name),
      on: String(row.finish_date),
    });
  }
  for (const row of (rfis.data ?? []) as Record<string, unknown>[]) {
    entries.push({
      id: `rfi-${String(row.id)}`,
      projectId: String(row.project_id),
      projectName: name(row.project),
      kind: "rfi",
      title: String(row.subject),
      on: String(row.due_date),
    });
  }
  for (const row of (invoices.data ?? []) as Record<string, unknown>[]) {
    entries.push({
      id: `invoice-${String(row.id)}`,
      projectId: String(row.project_id),
      projectName: name(row.project),
      kind: "invoice",
      title: `${String(row.number)} — ${String(row.company_name)}`,
      on: String(row.due_on),
    });
  }

  return entries.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
}
