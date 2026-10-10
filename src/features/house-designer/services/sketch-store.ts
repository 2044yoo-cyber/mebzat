import type { SupabaseClient } from "@supabase/supabase-js";

import { AGENDA_FILES_BUCKET, agendaFilePath } from "@/lib/agenda/files";
import type { Database, Json } from "@/types/database.types";

import type { MarkupShape } from "../components/markup-canvas";
import { sketchSaveError } from "./sketch-save-errors";

/**
 * Sketches, pins and the Agenda items about them — all on the plan's project.
 *
 * A sketch is markup over something (the plan, a photo, a PDF page, a CAD
 * drawing) kept apart from it. A pin is a numbered point on any of those. An
 * Agenda task made from a pin is the existing Agenda task, in the existing
 * table, with the pin pointing at it; its discussion is the task's comments.
 * Nothing here is a second Agenda.
 */
type Client = SupabaseClient<Database>;

export type SourceKind = "plan" | "image" | "pdf" | "cad";

export type SketchSource = {
  kind: SourceKind;
  /** The file in the project's store, for anything that is not the plan. */
  path: string | null;
  name: string | null;
  /** The plan's floor, for a sketch over the plan. */
  level: string | null;
  page: number | null;
};

export type Sketch = {
  id: string;
  title: string;
  source: SketchSource;
  markup: MarkupShape[];
  mmPerUnit: number | null;
  previewPath: string | null;
  updatedAt: string;
};

export type Pin = {
  id: string;
  number: string;
  sketchId: string | null;
  source: SketchSource;
  x: number;
  y: number;
  title: string;
  note: string | null;
  measurement: string | null;
  status: "open" | "resolved";
  taskId: string | null;
  createdAt: string;
};

export type Comment = { id: string; body: string; author: string; createdAt: string; mine: boolean };

type SketchRow = Database["public"]["Tables"]["agenda_sketches"]["Row"];
type PinRow = Database["public"]["Tables"]["agenda_pins"]["Row"];

function source(row: Pick<SketchRow, "source_kind" | "source_path" | "source_name" | "source_level" | "source_page">): SketchSource {
  return { kind: row.source_kind, path: row.source_path, name: row.source_name, level: row.source_level, page: row.source_page };
}

function toSketch(row: SketchRow): Sketch {
  return {
    id: row.id,
    title: row.title,
    source: source(row),
    markup: Array.isArray(row.markup) ? (row.markup as unknown as MarkupShape[]) : [],
    mmPerUnit: row.scale_mm_per_unit,
    previewPath: row.preview_path,
    updatedAt: row.updated_at,
  };
}

function toPin(row: PinRow): Pin {
  return {
    id: row.id,
    number: row.number,
    sketchId: row.sketch_id,
    source: source(row),
    x: row.x,
    y: row.y,
    title: row.title,
    note: row.note,
    measurement: row.measurement,
    status: row.status,
    taskId: row.task_id,
    createdAt: row.created_at,
  };
}

export async function listSketches(client: Client, planId: string): Promise<Sketch[]> {
  const { data } = await client
    .from("agenda_sketches")
    .select("*")
    .eq("plan_id", planId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  return ((data ?? []) as SketchRow[]).map(toSketch);
}

export async function saveSketch(client: Client, userId: string, target: { projectId: string; planId: string }, sketch: Omit<Sketch, "id" | "updatedAt" | "previewPath"> & { id?: string; previewPath?: string | null }): Promise<{ id: string } | { error: string }> {
  const row = {
    title: sketch.title.slice(0, 160) || "Sketch",
    markup: sketch.markup as unknown as Json,
    scale_mm_per_unit: sketch.mmPerUnit,
    updated_by: userId,
    ...(sketch.previewPath !== undefined ? { preview_path: sketch.previewPath } : {}),
  };
  if (sketch.id) {
    const { data, error } = await client
      .from("agenda_sketches")
      .update(row)
      .eq("id", sketch.id)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("Sketch update failed", { code: error.code, message: error.message, hint: error.hint });
      return { error: sketchSaveError(error) };
    }
    if (!data) return { error: "This sketch was not updated. It may have been removed, or your project access may have changed. Reopen it and try again." };
    return { id: data.id };
  }
  const { data, error } = await client
    .from("agenda_sketches")
    .insert({
      ...row,
      project_id: target.projectId,
      plan_id: target.planId,
      source_kind: sketch.source.kind,
      source_path: sketch.source.path,
      source_name: sketch.source.name,
      source_level: sketch.source.level,
      source_page: sketch.source.page,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    console.error("Sketch insert failed", { code: error.code, message: error.message, hint: error.hint });
    return { error: sketchSaveError(error) };
  }
  return data ? { id: data.id } : { error: "Sketch save failed: the database returned no saved sketch id." };
}

/** Puts a file in the project's store — the bucket Agenda already uses — and says where. */
export async function uploadProjectFile(client: Client, projectId: string, folder: string, file: Blob, name: string): Promise<{ path: string } | { error: string }> {
  const path = agendaFilePath(projectId, folder, name);
  const { error } = await client.storage.from(AGENDA_FILES_BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  return error ? { error: "The file did not upload. Try again." } : { path };
}

export async function signedUrl(client: Client, path: string): Promise<string | null> {
  const { data } = await client.storage.from(AGENDA_FILES_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function listPins(client: Client, planId: string): Promise<Pin[]> {
  const { data } = await client
    .from("agenda_pins")
    .select("*")
    .eq("plan_id", planId)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(500);
  return ((data ?? []) as PinRow[]).map(toPin);
}

export async function createPin(client: Client, userId: string, target: { projectId: string; planId: string }, pin: { sketchId: string | null; source: SketchSource; x: number; y: number; title: string; note?: string; measurement?: string }): Promise<Pin | { error: string }> {
  const { data, error } = await client
    .from("agenda_pins")
    .insert({
      project_id: target.projectId,
      plan_id: target.planId,
      sketch_id: pin.sketchId,
      source_kind: pin.source.kind,
      source_path: pin.source.path,
      source_name: pin.source.name,
      source_level: pin.source.level,
      source_page: pin.source.page,
      x: pin.x,
      y: pin.y,
      title: pin.title.trim().slice(0, 200) || "Pin",
      note: pin.note?.trim().slice(0, 4000) || null,
      measurement: pin.measurement?.trim().slice(0, 200) || null,
      created_by: userId,
    })
    .select("*")
    .single();
  return error || !data ? { error: "The pin could not be saved." } : toPin(data as PinRow);
}

export async function updatePin(client: Client, id: string, patch: Partial<Pick<Pin, "title" | "note" | "measurement" | "status" | "taskId" | "sketchId">>): Promise<{ error?: string }> {
  const { error } = await client
    .from("agenda_pins")
    .update({
      ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, 200) || "Pin" } : {}),
      ...(patch.note !== undefined ? { note: patch.note?.trim().slice(0, 4000) || null } : {}),
      ...(patch.measurement !== undefined ? { measurement: patch.measurement?.trim().slice(0, 200) || null } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.taskId !== undefined ? { task_id: patch.taskId } : {}),
      ...(patch.sketchId !== undefined ? { sketch_id: patch.sketchId } : {}),
    })
    .eq("id", id);
  return error ? { error: "The pin could not be updated." } : {};
}

/** An Agenda task on the project — the same table and shape Agenda's own task form writes. */
export async function createTask(client: Client, userId: string, projectId: string, task: { title: string; description: string }): Promise<{ id: string } | { error: string }> {
  const { data, error } = await client
    .from("agenda_tasks")
    .insert({
      project_id: projectId,
      title: task.title.trim().slice(0, 200).padEnd(2, "."),
      description: task.description.trim().slice(0, 4000) || null,
      created_by: userId,
    })
    .select("id")
    .single();
  return error || !data ? { error: "The Agenda item could not be created." } : { id: data.id };
}

/** Files a picture with a task the way Agenda attaches anything: a row naming the stored file. */
export async function attachToTask(client: Client, userId: string, projectId: string, taskId: string, file: { path: string; name: string; caption?: string }): Promise<void> {
  await client.from("agenda_attachments").insert({
    project_id: projectId,
    entity_table: "agenda_tasks",
    entity_id: taskId,
    url: file.path,
    file_name: file.name,
    file_kind: "image",
    mime_type: "image/png",
    caption: file.caption ?? null,
    uploaded_by: userId,
  });
}

export async function taskStatuses(client: Client, ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const { data } = await client.from("agenda_tasks").select("id, status").in("id", ids);
  return Object.fromEntries((data ?? []).map((row) => [row.id, row.status]));
}

export async function listComments(client: Client, userId: string, taskId: string): Promise<Comment[]> {
  const { data } = await client
    .from("agenda_task_comments")
    .select("id, body, created_at, author_id, author:profiles!author_id(full_name, username)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []).map((row) => {
    const author = row.author as unknown as { full_name: string | null; username: string | null } | { full_name: string | null; username: string | null }[] | null;
    const person = Array.isArray(author) ? author[0] : author;
    return { id: row.id, body: row.body, createdAt: row.created_at, mine: row.author_id === userId, author: row.author_id === userId ? "You" : person?.full_name || person?.username || "Team member" };
  });
}

export async function addComment(client: Client, userId: string, projectId: string, taskId: string, body: string): Promise<{ error?: string }> {
  const text = body.trim().slice(0, 4000);
  if (!text) return { error: "Write something first." };
  const { error } = await client.from("agenda_task_comments").insert({ task_id: taskId, project_id: projectId, author_id: userId, body: text });
  return error ? { error: "The message could not be sent." } : {};
}

/** The address that reopens the plan at a pin, or at a sketch. */
export function pinHref(planId: string, pin: { id: string; sketchId?: string | null }): string {
  return `/house-design?plan=${planId}${pin.sketchId ? `&sketch=${pin.sketchId}` : ""}&pin=${pin.id}`;
}
