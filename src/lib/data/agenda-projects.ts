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
