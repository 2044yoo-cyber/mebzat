"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isInProject } from "@/lib/agenda/files";
import {
  annotationGeometry,
  can,

  itemChange,
  nextRevisionLabel,
  parseItemData,
  STARTER_SECTIONS,
  TASK_COLUMNS,
  uuid,
  type AnnotationKind,
  type ItemChange,
  type Level,
  type ThreadStatus,
} from "@/lib/collab/model";
import { toAnnotation, toBoard, toComment, toItem, toThread, type Annotation, type Board, type Comment, type Item, type Thread } from "@/lib/collab/queries";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database.types";

/**
 * Writing to a project's Collaborative Studio.
 *
 * Two checks, deliberately. Every action first asks the database for the
 * caller's Studio level (`collab_level`, 0104) and refuses in words when the
 * level does not allow it — that is what a person reads. Then it writes, and
 * row-level security on every table refuses it again if the level was wrong
 * or changed in between — that is what makes it safe. Neither trusts the
 * browser: an id in the request is a request, not permission.
 *
 * Saves name the revision they were made from. One that was overtaken is not
 * applied: the action returns the object as it now is, and the screen shows
 * that instead of overwriting somebody's change.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

async function context(projectId: unknown) {
  const id = uuid.safeParse(projectId);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!id.success || !user) return { supabase, user: null, projectId: "", level: null as Level | null };
  const { data } = await supabase.rpc("collab_level", { target_project: id.data });
  return { supabase, user, projectId: id.data, level: (data as Level | null) ?? null };
}

function denied(level: Level | null, need: "view" | "comment" | "edit" | "manage"): string | null {
  if (level === null) return "You are not on this project.";
  if (can[need](level)) return null;
  return {
    view: "You are not on this project.",
    comment: "You can view this project but not comment. Ask the owner for commenter access.",
    edit: "You can comment but not change boards. Ask the owner for editor access.",
    manage: "Only the project owner can do that.",
  }[need];
}

/** A Postgres refusal, in words. */
function explain(message: string | undefined, fallback: string): string {
  const text = message ?? "";
  if (text.includes("row-level security") || text.includes("permission denied")) return "You do not have access to do that here.";
  if (text.includes("changed by somebody else") || text.includes("Somebody else changed")) return "Somebody else changed this a moment ago. It has been reloaded.";
  if (text.includes("on another project") || text.includes("not on this project") || text.includes("another board")) return "That belongs to another project.";
  if (text.includes("assigned to somebody on the project")) return "Work can only be assigned to somebody on the project.";
  if (text.includes("Only an editor") || text.includes("Only the person")) return text;
  if (text.includes("This board is full")) return text;
  return fallback;
}

const refresh = (projectId: string) => revalidatePath(`/agenda/projects/${projectId}/collaborate`);

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

const boardInput = z.object({
  kind: z.enum(["board", "canvas"]),
  title: z.string().trim().min(1, "Give it a name.").max(120),
  layout: z.enum(["free", "columns"]).optional(),
  starterSections: z.boolean().optional(),
});

export async function createBoard(projectId: string, input: z.input<typeof boardInput>): Promise<Result<{ board: Board }>> {
  const { supabase, user, level, projectId: project } = await context(projectId);
  const refusal = denied(level, "edit");
  if (!user || refusal) return fail(refusal ?? "Sign in first.");
  const parsed = boardInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "That board is not valid.");
  const { kind, title, layout, starterSections } = parsed.data;

  const { data, error } = await supabase
    .from("collab_boards")
    .insert({ project_id: project, kind, title, layout: kind === "canvas" ? "free" : layout ?? "columns", sort_order: Date.now() })
    .select("*")
    .single();
  if (error || !data) return fail(explain(error?.message, "That board was not created."));

  // The architecture sections, as columns — a starting point, not a rule.
  if (kind === "board" && starterSections) {
    const { error: sectionsError } = await supabase.from("collab_items").insert(
      STARTER_SECTIONS.map((section, index) => ({
        board_id: data.id, project_id: project, kind: "column" as const,
        x: index * 300, y: 0, w: 280, h: 0, z: index, data: { title: section } as Json,
      })),
    );
    if (sectionsError) return fail(explain(sectionsError.message, "The board was created, but its sections were not."));
  }
  refresh(project);
  return { ok: true, board: toBoard(data) };
}

export async function updateBoard(projectId: string, input: { id: string; revision: number; title?: string; layout?: "free" | "columns"; settings?: { grid?: boolean; snap?: boolean; gridSize?: number } }): Promise<Result<{ board: Board }>> {
  const { supabase, user, level, projectId: project } = await context(projectId);
  const refusal = denied(level, "edit");
  if (!user || refusal) return fail(refusal ?? "Sign in first.");
  const parsed = z.object({
    id: uuid, revision: z.number().int().min(1),
    title: z.string().trim().min(1).max(120).optional(),
    layout: z.enum(["free", "columns"]).optional(),
    settings: z.object({ grid: z.boolean().optional(), snap: z.boolean().optional(), gridSize: z.number().int().min(4).max(200).optional() }).strict().optional(),
  }).safeParse(input);
  if (!parsed.success) return fail("That change is not valid.");
  const { id, revision, ...patch } = parsed.data;
  const { data, error } = await supabase.from("collab_boards").update({ ...patch, revision: revision + 1 }).eq("id", id).eq("project_id", project).eq("revision", revision).select("*").maybeSingle();
  if (error) return fail(explain(error.message, "That change was not saved."));
  if (!data) return fail("Somebody else changed this board a moment ago. It has been reloaded.");
  refresh(project);
  return { ok: true, board: toBoard(data) };
}

export async function archiveBoard(projectId: string, id: string, revision: number): Promise<Result> {
  const { supabase, user, level, projectId: project } = await context(projectId);
  const refusal = denied(level, "edit");
  if (!user || refusal) return fail(refusal ?? "Sign in first.");
  if (!uuid.safeParse(id).success) return fail("That board is not on this project.");
  const { data, error } = await supabase.from("collab_boards").update({ archived_at: new Date().toISOString(), revision: revision + 1 }).eq("id", id).eq("project_id", project).eq("revision", revision).select("id").maybeSingle();
  if (error) return fail(explain(error.message, "That board was not deleted."));
  if (!data) return fail("Somebody else changed this board a moment ago. Reload and try again.");
  refresh(project);
  return { ok: true };
}

/** A copy of a board and everything on it, with new ids and the same arrangement. */
export async function duplicateBoard(projectId: string, id: string): Promise<Result<{ board: Board }>> {
  const { supabase, user, level, projectId: project } = await context(projectId);
  const refusal = denied(level, "edit");
  if (!user || refusal) return fail(refusal ?? "Sign in first.");
  if (!uuid.safeParse(id).success) return fail("That board is not on this project.");
  const { data: source } = await supabase.from("collab_boards").select("*").eq("id", id).eq("project_id", project).maybeSingle();
  if (!source) return fail("That board is not on this project.");
  const { data: items } = await supabase.from("collab_items").select("*").eq("board_id", id).is("archived_at", null).limit(5000);
  const { data: copy, error } = await supabase
    .from("collab_boards")
    .insert({ project_id: project, kind: source.kind, title: `${source.title} (copy)`.slice(0, 120), layout: source.layout, settings: source.settings, sort_order: Date.now() })
    .select("*")
    .single();
  if (error || !copy) return fail(explain(error?.message, "That board was not copied."));
  const ids = new Map((items ?? []).map((item) => [item.id, crypto.randomUUID()]));
  // Parents before children, so a card's column exists when the card arrives.
  const ordered = [...(items ?? [])].sort((a, b) => Number(a.parent_id !== null) - Number(b.parent_id !== null));
  const remap = (data: Json): Json => {
    const value = data && typeof data === "object" && !Array.isArray(data) ? { ...(data as Record<string, Json>) } : data;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const key of ["from", "to"]) if (typeof value[key] === "string" && ids.has(value[key] as string)) value[key] = ids.get(value[key] as string)!;
    }
    return value;
  };
  for (let start = 0; start < ordered.length; start += 500) {
    const { error: itemsError } = await supabase.from("collab_items").insert(ordered.slice(start, start + 500).map((item) => ({
      id: ids.get(item.id)!, board_id: copy.id, project_id: project, kind: item.kind,
      parent_id: item.parent_id ? ids.get(item.parent_id) ?? null : null,
      x: item.x, y: item.y, w: item.w, h: item.h, rotation: item.rotation, z: item.z,
      data: remap(item.data), drawing_id: item.drawing_id, storage_path: item.storage_path,
    })));
    if (itemsError) return fail(explain(itemsError.message, "The board was copied, but not everything on it."));
  }
  refresh(project);
  return { ok: true, board: toBoard(copy) };
}

// ---------------------------------------------------------------------------
// Items: one batch of changes, each applied or refused on its own
// ---------------------------------------------------------------------------

export type ItemResult = { id: string; ok: true; item: Item } | { id: string; ok: false; error: string; current: Item | null };

export async function saveItems(projectId: string, boardId: string, changes: ItemChange[]): Promise<Result<{ results: ItemResult[] }>> {
  const { supabase, user, level, projectId: project } = await context(projectId);
  const refusal = denied(level, "edit");
  if (!user || refusal) return fail(refusal ?? "Sign in first.");
  if (!uuid.safeParse(boardId).success) return fail("That board is not on this project.");
  const parsed = z.array(itemChange).max(200, "Too many changes at once.").safeParse(changes);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Those changes are not valid.");
  const { data: board } = await supabase.from("collab_boards").select("id").eq("id", boardId).eq("project_id", project).is("archived_at", null).maybeSingle();
  if (!board) return fail("That board is not on this project.");

  const results: ItemResult[] = [];
  const current = async (id: string) => {
    const { data } = await supabase.from("collab_items").select("*").eq("id", id).maybeSingle();
    return data ? toItem(data) : null;
  };

  // Creates first, parents before children; then everything else in order.
  const creates = parsed.data.filter((change): change is Extract<ItemChange, { op: "create" }> => change.op === "create")
    .sort((a, b) => Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)));
  for (const change of creates) {
    const data = parseItemData(change.kind, change.data);
    if (!data.ok) { results.push({ id: change.id, ok: false, error: data.error, current: null }); continue; }
    if (change.storagePath && !isInProject(change.storagePath, project)) {
      results.push({ id: change.id, ok: false, error: "That file was not uploaded to this project.", current: null });
      continue;
    }
    const { data: row, error } = await supabase.from("collab_items").insert({
      id: change.id, board_id: boardId, project_id: project, kind: change.kind,
      parent_id: change.parentId ?? null, drawing_id: change.drawingId ?? null, storage_path: change.storagePath ?? null,
      x: change.x ?? 0, y: change.y ?? 0, w: change.w ?? 0, h: change.h ?? 0, rotation: change.rotation ?? 0, z: change.z ?? 0,
      data: data.data as Json,
    }).select("*").single();
    results.push(row ? { id: change.id, ok: true, item: toItem(row) } : { id: change.id, ok: false, error: explain(error?.message, "That was not added."), current: null });
  }

  for (const change of parsed.data) {
    if (change.op === "create") continue;
    let patch: Database["public"]["Tables"]["collab_items"]["Update"];
    if (change.op === "archive") patch = { archived_at: new Date().toISOString() };
    else if (change.op === "restore") patch = { archived_at: null };
    else {
      const before = await current(change.id);
      if (!before || before.boardId !== boardId) { results.push({ id: change.id, ok: false, error: "That is not on this board.", current: null }); continue; }
      patch = {};
      for (const key of ["x", "y", "w", "h", "rotation", "z"] as const) if (change[key] !== undefined) patch[key] = change[key];
      if (change.parentId !== undefined) patch.parent_id = change.parentId;
      if (change.data !== undefined) {
        const data = parseItemData(before.kind, change.data);
        if (!data.ok) { results.push({ id: change.id, ok: false, error: data.error, current: before }); continue; }
        patch.data = data.data as Json;
      }
    }
    const { data: row, error } = await supabase.from("collab_items").update({ ...patch, revision: change.revision + 1 })
      .eq("id", change.id).eq("board_id", boardId).eq("revision", change.revision).select("*").maybeSingle();
    if (row) { results.push({ id: change.id, ok: true, item: toItem(row) }); continue; }
    const now = await current(change.id);
    results.push({
      id: change.id, ok: false, current: now,
      error: now && now.revision !== change.revision ? "Somebody else changed this a moment ago. It has been reloaded." : explain(error?.message, "That change was not saved."),
    });
  }
  return { ok: true, results };
}

// ---------------------------------------------------------------------------
// Files: a render, plan or document in the project's drawing register
// ---------------------------------------------------------------------------

const assetInput = z.object({
  storagePath: z.string().min(3).max(400),
  fileName: z.string().max(200),
  mimeType: z.string().max(120),
  size: z.number().int().min(1).max(26214400, "That file is over 25 MB."),
  title: z.string().trim().max(200).optional(),
  /** A new revision of this drawing, rather than a new drawing. */
  drawingId: uuid.optional(),
  discipline: z.enum(["architectural", "interior", "structural", "landscape", "other"]).optional(),
});

/** What a Studio file may be: images, PDFs, office documents and drawings. */
const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf|application\/octet-stream|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet))|application\/vnd\.ms-excel)$/;

export async function registerAsset(projectId: string, input: z.input<typeof assetInput>): Promise<Result<{ drawingId: string; revisionId: string; label: string }>> {
  const { supabase, user, level, projectId: project } = await context(projectId);
  const refusal = denied(level, "edit");
  if (!user || refusal) return fail(refusal ?? "Sign in first.");
  const parsed = assetInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "That file is not valid.");
  const file = parsed.data;
  if (!isInProject(file.storagePath, project)) return fail("That file was not uploaded to this project.");
  if (!ALLOWED_TYPES.test(file.mimeType)) return fail("That kind of file cannot be added. Use an image, a PDF or a document.");

  let drawingId = file.drawingId ?? null;
  let label = "A";
  if (drawingId) {
    const { data: existing } = await supabase.from("agenda_drawing_revisions").select("revision, drawing_id").eq("drawing_id", drawingId).eq("project_id", project);
    if (!existing?.length) return fail("That drawing is not on this project.");
    label = nextRevisionLabel(existing.map((row) => row.revision));
  } else {
    const { data: number, error: numberError } = await supabase.rpc("agenda_next_number", { target_project: project, record_kind: "studio_asset", prefix: "ST", width: 3 });
    if (numberError || !number) return fail(explain(numberError?.message, "That file was not registered."));
    const { data: drawing, error } = await supabase.from("agenda_drawings").insert({
      project_id: project, drawing_number: number as string,
      title: (file.title || file.fileName.replace(/\.[a-z0-9]+$/i, "") || "Untitled").slice(0, 200),
      discipline: file.discipline ?? "architectural", created_by: user.id,
    }).select("id").single();
    if (error || !drawing) return fail(explain(error?.message, "That file was not registered."));
    drawingId = drawing.id;
  }
  const { data: revision, error } = await supabase.from("agenda_drawing_revisions").insert({
    drawing_id: drawingId, project_id: project, revision: label, storage_path: file.storagePath,
    file_name: file.fileName, mime_type: file.mimeType, size_bytes: file.size,
    issued_on: new Date().toISOString().slice(0, 10), uploaded_by: user.id,
  }).select("id").single();
  if (error || !revision) return fail(explain(error?.message, "That revision was not saved."));
  refresh(project);
  return { ok: true, drawingId, revisionId: revision.id, label };
}

/** The client's decision on a revision: approved, or changes requested. */
export async function decideRevision(projectId: string, input: { revisionId: string; decision: "approved" | "changes_requested"; comment?: string }): Promise<Result> {
  const { supabase, user, level, projectId: project } = await context(projectId);
  const refusal = denied(level, "comment");
  if (!user || refusal) return fail(refusal ?? "Sign in first.");
  const parsed = z.object({ revisionId: uuid, decision: z.enum(["approved", "changes_requested"]), comment: z.string().trim().max(2000).optional() }).safeParse(input);
  if (!parsed.success) return fail("That decision is not valid.");
  const { data: revision } = await supabase.from("agenda_drawing_revisions").select("id").eq("id", parsed.data.revisionId).eq("project_id", project).maybeSingle();
  if (!revision) return fail("That revision is not on this project.");
  const approved = parsed.data.decision === "approved";
  const { error } = await supabase.from("agenda_approvals").upsert({
    project_id: project, subject_type: "drawing_revision", subject_id: revision.id, step: 1,
    approver_id: user.id, decision: approved ? "approved" : "rejected", comment: parsed.data.comment || null,
    decided_at: new Date().toISOString(),
  }, { onConflict: "subject_type,subject_id,step" });
  if (error) return fail(explain(error.message, "That decision was not saved."));
  const { error: statusError } = await supabase.from("agenda_drawing_revisions").update({ status: approved ? "approved" : "revise_resubmit" }).eq("id", revision.id);
  if (statusError) return fail(explain(statusError.message, "The decision was recorded, but the revision's status was not updated."));
  refresh(project);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Threads and comments
// ---------------------------------------------------------------------------

const threadInput = z.discriminatedUnion("anchorKind", [
  z.object({ anchorKind: z.literal("drawing"), drawingId: uuid, revisionId: uuid, page: z.number().int().min(1).nullable().optional(), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  z.object({ anchorKind: z.literal("item"), itemId: uuid }),
  z.object({ anchorKind: z.literal("project") }),
]);

const body = z.string().trim().min(1, "Write something first.").max(4000, "That is over 4000 characters.");
const mentions = z.array(uuid).max(20).optional();

export async function openThread(projectId: string, input: z.input<typeof threadInput> & { title?: string; body: string; mentions?: string[] }): Promise<Result<{ thread: Thread; comment: Comment }>> {
  const { supabase, user, level, projectId: project } = await context(projectId);
  const refusal = denied(level, "comment");
  if (!user || refusal) return fail(refusal ?? "Sign in first.");
  const anchor = threadInput.safeParse(input);
  const text = body.safeParse(input.body);
  const named = mentions.safeParse(input.mentions);
  if (!anchor.success) return fail("Place the comment on the drawing, an item, or the project.");
  if (!text.success) return fail(text.error.issues[0]!.message);
  if (!named.success) return fail("Too many people mentioned.");
  const a = anchor.data;
  const { data: thread, error } = await supabase.from("collab_threads").insert({
    project_id: project, anchor_kind: a.anchorKind,
    drawing_id: a.anchorKind === "drawing" ? a.drawingId : null,
    revision_id: a.anchorKind === "drawing" ? a.revisionId : null,
    page: a.anchorKind === "drawing" ? a.page ?? null : null,
    x: a.anchorKind === "drawing" ? a.x : null, y: a.anchorKind === "drawing" ? a.y : null,
    item_id: a.anchorKind === "item" ? a.itemId : null,
    title: (input.title?.trim() || text.data.split("\n")[0]!).slice(0, 200),
  }).select("*").single();
  if (error || !thread) return fail(explain(error?.message, "That comment was not posted."));
  const { data: comment, error: commentError } = await supabase.from("collab_comments").insert({
    thread_id: thread.id, project_id: project, author_id: user.id, body: text.data, mentions: named.data ?? [],
  }).select("*").single();
  if (commentError || !comment) {
    // The thread without its first message is noise; take it back out.
    await supabase.from("collab_threads").update({ archived_at: new Date().toISOString(), revision: thread.revision + 1 }).eq("id", thread.id);
    return fail(explain(commentError?.message, "That comment was not posted."));
  }
  refresh(project);
  return { ok: true, thread: toThread(thread), comment: toComment(comment) };
}

export async function postComment(projectId: string, input: { threadId: string; body: string; mentions?: string[] }): Promise<Result<{ comment: Comment }>> {
  const { supabase, user, level, projectId: project } = await context(projectId);
  const refusal = denied(level, "comment");
  if (!user || refusal) return fail(refusal ?? "Sign in first.");
  const parsed = z.object({ threadId: uuid, body, mentions }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "That reply is not valid.");
  const { data: thread } = await supabase.from("collab_threads").select("id").eq("id", parsed.data.threadId).eq("project_id", project).maybeSingle();
  if (!thread) return fail("That discussion is not on this project.");
  const { data, error } = await supabase.from("collab_comments").insert({
    thread_id: thread.id, project_id: project, author_id: user.id, body: parsed.data.body, mentions: parsed.data.mentions ?? [],
  }).select("*").single();
  if (error || !data) return fail(explain(error?.message, "That reply was not posted."));
  return { ok: true, comment: toComment(data) };
}

export async function editComment(projectId: string, input: { id: string; body?: string; archive?: boolean }): Promise<Result<{ comment: Comment }>> {
  const { supabase, user, level, projectId: project } = await context(projectId);
  const refusal = denied(level, "comment");
  if (!user || refusal) return fail(refusal ?? "Sign in first.");
  const parsed = z.object({ id: uuid, body: body.optional(), archive: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "That edit is not valid.");
  const patch: Database["public"]["Tables"]["collab_comments"]["Update"] = {};
  if (parsed.data.body) patch.body = parsed.data.body;
  if (parsed.data.archive) patch.archived_at = new Date().toISOString();
  const { data, error } = await supabase.from("collab_comments").update(patch).eq("id", parsed.data.id).eq("project_id", project).eq("author_id", user.id).select("*").maybeSingle();
  if (error) return fail(explain(error.message, "That edit was not saved."));
  if (!data) return fail("Only the person who wrote a comment can change it.");
  return { ok: true, comment: toComment(data) };
}

/** Status, assignment and position of a thread, from the revision it was read at. */
export async function updateThread(projectId: string, input: { id: string; revision: number; status?: ThreadStatus; assignedTo?: string | null; x?: number; y?: number }): Promise<Result<{ thread: Thread }>> {
  const { supabase, user, level, projectId: project } = await context(projectId);
  const parsed = z.object({
    id: uuid, revision: z.number().int().min(1),
    status: z.enum(["open", "ready_for_review", "resolved", "approved", "changes_requested"]).optional(),
    assignedTo: uuid.nullable().optional(),
    x: z.number().min(0).max(1).optional(), y: z.number().min(0).max(1).optional(),
  }).safeParse(input);
  if (!parsed.success) return fail("That change is not valid.");
  const editorOnly = parsed.data.assignedTo !== undefined || parsed.data.status === "ready_for_review";
  const refusal = denied(level, editorOnly ? "edit" : "comment");
  if (!user || refusal) return fail(refusal ?? "Sign in first.");
  const patch: Database["public"]["Tables"]["collab_threads"]["Update"] = { revision: parsed.data.revision + 1 };
  if (parsed.data.status) patch.status = parsed.data.status;
  if (parsed.data.assignedTo !== undefined) patch.assigned_to = parsed.data.assignedTo;
  if (parsed.data.x !== undefined) patch.x = parsed.data.x;
  if (parsed.data.y !== undefined) patch.y = parsed.data.y;
  const { data, error } = await supabase.from("collab_threads").update(patch).eq("id", parsed.data.id).eq("project_id", project).eq("revision", parsed.data.revision).select("*").maybeSingle();
  if (error) return fail(explain(error.message, "That change was not saved."));
  if (!data) return fail("Somebody else changed this a moment ago. It has been reloaded.");
  refresh(project);
  return { ok: true, thread: toThread(data) };
}

/**
 * A comment becomes an Agenda task, assigned, and stays linked both ways: the
 * thread names the task, and the task's description names the thread.
 */
export async function convertToTask(projectId: string, input: { threadId: string; revision: number; title: string; assignedTo?: string | null; dueAt?: string | null; description?: string }): Promise<Result<{ thread: Thread; taskId: string }>> {
  const { supabase, user, level, projectId: project } = await context(projectId);
  const refusal = denied(level, "edit");
  if (!user || refusal) return fail(refusal ?? "Sign in first.");
  const parsed = z.object({
    threadId: uuid, revision: z.number().int().min(1), title: z.string().trim().min(2, "Give the task a title.").max(200),
    assignedTo: uuid.nullable().optional(), dueAt: z.string().datetime({ offset: true }).nullable().optional().or(z.literal("").transform(() => null)),
    description: z.string().trim().max(4000).optional(),
  }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "That task is not valid.");
  const { data: thread } = await supabase.from("collab_threads").select("*").eq("id", parsed.data.threadId).eq("project_id", project).maybeSingle();
  if (!thread) return fail("That discussion is not on this project.");
  if (thread.task_id) return fail("This comment is already a task.");
  const link = `/agenda/projects/${project}/collaborate?thread=${thread.id}`;
  const { data: task, error } = await supabase.from("agenda_tasks").insert({
    project_id: project, title: parsed.data.title, created_by: user.id,
    assigned_to: parsed.data.assignedTo ?? null, due_at: parsed.data.dueAt ?? null,
    description: [parsed.data.description, `From Studio comment ${thread.number}: ${link}`].filter(Boolean).join("\n\n"),
  }).select("id").single();
  if (error || !task) return fail(explain(error?.message, "That task was not created."));
  const { data: updated, error: linkError } = await supabase.from("collab_threads")
    .update({ task_id: task.id, assigned_to: parsed.data.assignedTo ?? thread.assigned_to, revision: parsed.data.revision + 1 })
    .eq("id", thread.id).eq("revision", parsed.data.revision).select("*").maybeSingle();
  if (linkError || !updated) return fail(explain(linkError?.message, "The task was created, but somebody changed the comment meanwhile. Link it again from the task list."));
  refresh(project);
  return { ok: true, thread: toThread(updated), taskId: task.id };
}

/** Moves a Studio task between Open, In Progress, In Review and Done. */
export async function setTaskStatus(projectId: string, input: { taskId: string; status: string }): Promise<Result> {
  const { supabase, user, level, projectId: project } = await context(projectId);
  if (!user || level === null) return fail("You are not on this project.");
  const parsed = z.object({ taskId: uuid, status: z.enum(TASK_COLUMNS.map((column) => column.value) as [string, ...string[]]) }).safeParse(input);
  if (!parsed.success) return fail("That status is not valid.");
  const { data: task } = await supabase.from("agenda_tasks").select("id, assigned_to").eq("id", parsed.data.taskId).eq("project_id", project).maybeSingle();
  if (!task) return fail("That task is not on this project.");
  // Editors move any task; anybody moves the task that is theirs.
  if (!can.edit(level) && task.assigned_to !== user.id) return fail("Only an editor, or the person it is assigned to, moves a task.");
  const status = parsed.data.status as "todo" | "in_progress" | "review" | "done";
  const now = new Date().toISOString();
  const { error } = await supabase.from("agenda_tasks").update({
    status, ...(status === "in_progress" ? { started_at: now } : {}), ...(status === "done" ? { completed_at: now } : { completed_at: null }),
  }).eq("id", task.id);
  if (error) return fail(explain(error.message, "That status was not saved."));
  refresh(project);
  return { ok: true };
}

export async function markRead(projectId: string, threadId: string): Promise<Result> {
  const { supabase, user, level, projectId: project } = await context(projectId);
  if (!user || level === null || !uuid.safeParse(threadId).success) return fail("You are not on this project.");
  const { error } = await supabase.from("collab_reads").upsert({ user_id: user.id, thread_id: threadId, project_id: project, read_at: new Date().toISOString() }, { onConflict: "user_id,thread_id" });
  if (error) return fail(explain(error.message, "Could not mark it read."));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Markup on a drawing
// ---------------------------------------------------------------------------

export async function saveAnnotation(projectId: string, input: { id?: string; revision?: number; drawingId: string; revisionId: string; page?: number | null; threadId?: string | null; kind: AnnotationKind; geometry: unknown; style?: { color?: string; width?: number }; archive?: boolean }): Promise<Result<{ annotation: Annotation }>> {
  const { supabase, user, level, projectId: project } = await context(projectId);
  const refusal = denied(level, "comment");
  if (!user || refusal) return fail(refusal ?? "Sign in first.");
  const parsed = z.object({
    id: uuid.optional(), revision: z.number().int().min(1).optional(), drawingId: uuid, revisionId: uuid,
    page: z.number().int().min(1).nullable().optional(), threadId: uuid.nullable().optional(),
    kind: z.enum(["freehand", "arrow", "line", "rect", "ellipse", "text"]),
    style: z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), width: z.number().min(0.5).max(40).optional() }).strict().optional(),
    archive: z.boolean().optional(),
  }).safeParse(input);
  if (!parsed.success) return fail("That markup is not valid.");
  const shape = annotationGeometry[parsed.data.kind].safeParse(input.geometry);
  if (!shape.success) return fail("That markup is off the drawing.");
  const a = parsed.data;
  if (a.id && a.revision) {
    const patch: Database["public"]["Tables"]["collab_annotations"]["Update"] = { geometry: shape.data as Json, style: (a.style ?? {}) as Json, revision: a.revision + 1 };
    if (a.archive) patch.archived_at = new Date().toISOString();
    const { data, error } = await supabase.from("collab_annotations").update(patch).eq("id", a.id).eq("project_id", project).eq("revision", a.revision).select("*").maybeSingle();
    if (error) return fail(explain(error.message, "That markup was not saved."));
    if (!data) return fail("Only its author or an editor changes that markup, and it may have just changed.");
    return { ok: true, annotation: toAnnotation(data) };
  }
  const { data, error } = await supabase.from("collab_annotations").insert({
    ...(a.id ? { id: a.id } : {}),
    project_id: project, drawing_id: a.drawingId, revision_id: a.revisionId, page: a.page ?? null, thread_id: a.threadId ?? null,
    kind: a.kind, geometry: shape.data as Json, style: (a.style ?? {}) as Json,
  }).select("*").single();
  if (error || !data) return fail(explain(error?.message, "That markup was not saved."));
  return { ok: true, annotation: toAnnotation(data) };
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export async function setAccess(projectId: string, input: { userId: string; level: "editor" | "commenter" | "viewer" }): Promise<Result> {
  const { supabase, user, level, projectId: project } = await context(projectId);
  const refusal = denied(level, "manage");
  if (!user || refusal) return fail(refusal ?? "Sign in first.");
  const parsed = z.object({ userId: uuid, level: z.enum(["editor", "commenter", "viewer"]) }).safeParse(input);
  if (!parsed.success) return fail("That level is not valid.");
  const { error } = await supabase.from("collab_access").upsert({ project_id: project, user_id: parsed.data.userId, level: parsed.data.level }, { onConflict: "project_id,user_id" });
  if (error) return fail(error.message.includes("not on this project") ? "That person is not on this project. Invite them from the project's team first." : explain(error.message, "That level was not saved."));
  refresh(project);
  return { ok: true };
}

