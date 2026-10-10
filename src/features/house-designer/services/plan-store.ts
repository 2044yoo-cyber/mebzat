import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";

import { houseProjectSchema, type HouseProject } from "../types/project";

/**
 * Saving a floor plan into a Medosha project — the same `agenda_projects` row
 * Agenda uses, so the plan, its sketches, its pins and the tasks about them
 * are one project rather than four.
 *
 * Straight from the browser, like the Agenda file uploads: a plan is a large
 * JSON document saved every few seconds while somebody draws, and routing it
 * through a server action would hold it in memory twice and meet a body limit.
 * Row-level security decides who may do what; this shapes the rows.
 */
type Client = SupabaseClient<Database>;

export type ProjectOption = { id: string; name: string };

/** Where a plan lives once saved. `revision` is what the next save is made from. */
export type PlanLink = {
  planId: string;
  projectId: string;
  projectName: string;
  revision: number;
};

export type SaveResult =
  | { ok: true; link: PlanLink }
  | { ok: false; conflict?: boolean; error: string };

export async function listProjects(client: Client): Promise<ProjectOption[]> {
  const { data } = await client
    .from("agenda_projects")
    .select("id, name")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}

export async function createProject(client: Client, userId: string, name: string): Promise<ProjectOption | { error: string }> {
  const trimmed = name.trim().slice(0, 160);
  if (!trimmed) return { error: "Give the project a name." };
  const { data, error } = await client
    .from("agenda_projects")
    .insert({ owner_id: userId, name: trimmed })
    .select("id, name")
    .single();
  if (error || !data) return { error: "The project could not be created." };
  return { id: data.id, name: data.name };
}

function planTitle(project: HouseProject) {
  return project.metadata.title.trim().slice(0, 160) || "Floor plan";
}

export async function insertPlan(client: Client, userId: string, target: ProjectOption, project: HouseProject): Promise<SaveResult> {
  const { data, error } = await client
    .from("agenda_plans")
    .insert({
      project_id: target.id,
      title: planTitle(project),
      data: project as unknown as Json,
      created_by: userId,
      updated_by: userId,
    })
    .select("id, revision")
    .single();
  if (error || !data) return { ok: false, error: refusal(error?.message) };
  return { ok: true, link: { planId: data.id, projectId: target.id, projectName: target.name, revision: data.revision } };
}

/**
 * Saves over the plan, but only over the revision it was opened at. A save
 * from somebody else in between leaves this one refused rather than silently
 * replacing theirs.
 */
export async function updatePlan(client: Client, userId: string, link: PlanLink, project: HouseProject): Promise<SaveResult> {
  const { data, error } = await client
    .from("agenda_plans")
    .update({
      title: planTitle(project),
      data: project as unknown as Json,
      revision: link.revision + 1,
      updated_by: userId,
    })
    .eq("id", link.planId)
    .eq("revision", link.revision)
    .select("revision");
  if (error) return { ok: false, error: refusal(error.message) };
  if (!data?.length) return { ok: false, conflict: true, error: "This plan was changed somewhere else. Reload it to see the latest." };
  return { ok: true, link: { ...link, revision: data[0]!.revision } };
}

export type LoadedPlan = { link: PlanLink; project: HouseProject };

export async function loadPlan(client: Client, planId: string): Promise<LoadedPlan | { error: string }> {
  const { data } = await client
    .from("agenda_plans")
    .select("id, project_id, revision, data, agenda_projects(name)")
    .eq("id", planId)
    .is("archived_at", null)
    .maybeSingle();
  if (!data) return { error: "That plan is not available — it may be on a project you are not part of." };
  const parsed = houseProjectSchema.safeParse(data.data);
  if (!parsed.success) return { error: "That plan could not be read." };
  const owner = data.agenda_projects as unknown as { name: string } | { name: string }[] | null;
  const projectName = (Array.isArray(owner) ? owner[0]?.name : owner?.name) ?? "Project";
  return {
    link: { planId: data.id, projectId: data.project_id, projectName, revision: data.revision },
    project: parsed.data,
  };
}

export type PlanSummary = { id: string; title: string; updatedAt: string; projectName?: string };

/** The plans most recently saved on any of the person's projects. */
export async function listRecentPlans(client: Client): Promise<PlanSummary[]> {
  const { data } = await client
    .from("agenda_plans")
    .select("id, title, updated_at, agenda_projects(name)")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(12);
  return (data ?? []).map((row) => {
    const owner = row.agenda_projects as unknown as { name: string } | { name: string }[] | null;
    return { id: row.id, title: row.title, updatedAt: row.updated_at, projectName: (Array.isArray(owner) ? owner[0]?.name : owner?.name) ?? undefined };
  });
}

export async function listPlans(client: Client, projectId: string): Promise<PlanSummary[]> {
  const { data } = await client
    .from("agenda_plans")
    .select("id, title, updated_at")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((row) => ({ id: row.id, title: row.title, updatedAt: row.updated_at }));
}

function refusal(message?: string) {
  const detail = (message ?? "").toLowerCase();
  if (detail.includes("row-level security") || detail.includes("permission denied")) {
    return "You do not have permission to save this plan to the selected project.";
  }
  if (detail.includes("schema cache") || detail.includes("does not exist") || detail.includes("could not find the table")) {
    return "The project-saving database tables are missing or unavailable. Contact the site administrator to check the Agenda migrations.";
  }
  if (detail.includes("foreign key")) {
    return "The selected project or account could not be found in the database. Try choosing an existing project.";
  }
  if (detail.includes("jwt") || detail.includes("token") || detail.includes("not authenticated")) {
    return "Your sign-in session may have expired. Sign in again, then retry saving.";
  }
  if (detail.includes("fetch") || detail.includes("network") || detail.includes("timeout")) {
    return "The database could not be reached. Check your connection and try again.";
  }
  return message ? `Saving failed: ${message.slice(0, 220)}` : "The plan could not be saved. Please try again.";
}
