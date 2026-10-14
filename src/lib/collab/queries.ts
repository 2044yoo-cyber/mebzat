import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";

import type { ItemKind, Level, ThreadStatus } from "./model";

/**
 * The Studio's reads, written once for both clients.
 *
 * The page loads with the server's client; the board, canvas and review
 * screen reload one object or one list with the browser's when realtime says
 * it changed. Either way row-level security decides what comes back — a
 * project somebody is not on returns nothing, never an error that says it
 * exists.
 */

type Client = SupabaseClient<Database>;

export type StudioMember = {
  id: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  role: string;
  level: Level;
};

export type Board = {
  id: string;
  projectId: string;
  kind: "board" | "canvas";
  title: string;
  description: string | null;
  layout: "free" | "columns";
  settings: { grid?: boolean; snap?: boolean; gridSize?: number };
  sortOrder: number;
  revision: number;
  updatedAt: string;
};

export type Item = {
  id: string;
  boardId: string;
  projectId: string;
  kind: ItemKind;
  parentId: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  z: number;
  data: Record<string, unknown>;
  drawingId: string | null;
  storagePath: string | null;
  revision: number;
  archived: boolean;
  updatedBy: string | null;
  updatedAt: string;
};

export type Revision = {
  id: string;
  drawingId: string;
  label: string;
  storagePath: string;
  fileName: string | null;
  mimeType: string | null;
  status: string;
  createdAt: string;
  uploadedBy: string | null;
};

export type Asset = {
  id: string;
  number: string;
  title: string;
  discipline: string;
  currentRevisionId: string | null;
  revisions: Revision[];
};

export type Thread = {
  id: string;
  projectId: string;
  number: string;
  anchorKind: "drawing" | "item" | "project";
  drawingId: string | null;
  revisionId: string | null;
  page: number | null;
  x: number | null;
  y: number | null;
  itemId: string | null;
  title: string | null;
  status: ThreadStatus;
  assignedTo: string | null;
  taskId: string | null;
  revision: number;
  createdBy: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  lastActivityAt: string;
  createdAt: string;
};

export type Comment = {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  mentions: string[];
  editedAt: string | null;
  archived: boolean;
  createdAt: string;
};

export type Annotation = {
  id: string;
  drawingId: string;
  revisionId: string;
  page: number | null;
  threadId: string | null;
  kind: "freehand" | "arrow" | "line" | "rect" | "ellipse" | "text";
  geometry: Record<string, unknown>;
  style: { color?: string; width?: number };
  revision: number;
  createdBy: string | null;
  createdAt: string;
};

export type StudioTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assignedTo: string | null;
  dueAt: string | null;
  createdBy: string;
  updatedAt: string;
};

const object = (value: Json | null | undefined): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

type BoardRow = Database["public"]["Tables"]["collab_boards"]["Row"];
type ItemRow = Database["public"]["Tables"]["collab_items"]["Row"];
type ThreadRow = Database["public"]["Tables"]["collab_threads"]["Row"];
type CommentRow = Database["public"]["Tables"]["collab_comments"]["Row"];
type AnnotationRow = Database["public"]["Tables"]["collab_annotations"]["Row"];

export const toBoard = (row: BoardRow): Board => ({
  id: row.id, projectId: row.project_id, kind: row.kind, title: row.title, description: row.description,
  layout: row.layout, settings: object(row.settings) as Board["settings"], sortOrder: row.sort_order,
  revision: row.revision, updatedAt: row.updated_at,
});

export const toItem = (row: ItemRow): Item => ({
  id: row.id, boardId: row.board_id, projectId: row.project_id, kind: row.kind, parentId: row.parent_id,
  x: row.x, y: row.y, w: row.w, h: row.h, rotation: row.rotation, z: row.z, data: object(row.data),
  drawingId: row.drawing_id, storagePath: row.storage_path, revision: row.revision,
  archived: row.archived_at !== null, updatedBy: row.updated_by, updatedAt: row.updated_at,
});

export const toThread = (row: ThreadRow): Thread => ({
  id: row.id, projectId: row.project_id, number: row.number, anchorKind: row.anchor_kind,
  drawingId: row.drawing_id, revisionId: row.revision_id, page: row.page, x: row.x, y: row.y,
  itemId: row.item_id, title: row.title, status: row.status, assignedTo: row.assigned_to, taskId: row.task_id,
  revision: row.revision, createdBy: row.created_by, resolvedBy: row.resolved_by, resolvedAt: row.resolved_at,
  lastActivityAt: row.last_activity_at, createdAt: row.created_at,
});

export const toComment = (row: CommentRow): Comment => ({
  id: row.id, threadId: row.thread_id, authorId: row.author_id, body: row.body, mentions: row.mentions ?? [],
  editedAt: row.edited_at, archived: row.archived_at !== null, createdAt: row.created_at,
});

export const toAnnotation = (row: AnnotationRow): Annotation => ({
  id: row.id, drawingId: row.drawing_id, revisionId: row.revision_id, page: row.page, threadId: row.thread_id,
  kind: row.kind, geometry: object(row.geometry), style: object(row.style) as Annotation["style"],
  revision: row.revision, createdBy: row.created_by, createdAt: row.created_at,
});

export async function readLevel(client: Client, projectId: string): Promise<Level | null> {
  const { data } = await client.rpc("collab_level", { target_project: projectId });
  return (data as Level | null) ?? null;
}

export async function readMembers(client: Client, projectId: string): Promise<StudioMember[]> {
  const [members, access, project] = await Promise.all([
    client.from("agenda_members").select("user_id, role, status, profile:profiles!agenda_members_user_id_fkey(id, full_name, company_name, username, avatar_url)").eq("project_id", projectId).eq("status", "active"),
    client.from("collab_access").select("user_id, level").eq("project_id", projectId),
    client.from("agenda_projects").select("owner_id").eq("id", projectId).maybeSingle(),
  ]);
  const levels = new Map((access.data ?? []).map((row) => [row.user_id, row.level as Level]));
  const ownerId = project.data?.owner_id ?? null;
  type MemberRow = { user_id: string; role: string; profile: { id: string; full_name: string | null; company_name: string | null; username: string | null; avatar_url: string | null } | null };
  return ((members.data ?? []) as unknown as MemberRow[]).map((row) => ({
    id: row.user_id,
    name: row.profile?.full_name || row.profile?.company_name || row.profile?.username || "Member",
    handle: row.profile?.username ?? null,
    avatarUrl: row.profile?.avatar_url ?? null,
    role: row.role,
    // The same rule as collab_level: owners by role, else the level given, else commenter.
    level: row.user_id === ownerId || row.role === "client" || row.role === "administrator" ? "owner" : levels.get(row.user_id) ?? "commenter",
  }));
}

export async function readBoards(client: Client, projectId: string): Promise<Board[]> {
  const { data } = await client.from("collab_boards").select("*").eq("project_id", projectId).is("archived_at", null).order("sort_order").order("created_at");
  return (data ?? []).map(toBoard);
}

export async function readItems(client: Client, boardId: string): Promise<Item[]> {
  const { data } = await client.from("collab_items").select("*").eq("board_id", boardId).is("archived_at", null).order("z").limit(5000);
  return (data ?? []).map(toItem);
}

export async function readItem(client: Client, id: string): Promise<Item | null> {
  const { data } = await client.from("collab_items").select("*").eq("id", id).maybeSingle();
  return data ? toItem(data) : null;
}

export async function readAssets(client: Client, projectId: string): Promise<Asset[]> {
  const { data } = await client
    .from("agenda_drawings")
    .select("id, drawing_number, title, discipline, current_revision_id, agenda_drawing_revisions(id, drawing_id, revision, storage_path, file_name, mime_type, status, created_at, uploaded_by)")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(300);
  type Row = { id: string; drawing_number: string; title: string; discipline: string; current_revision_id: string | null; agenda_drawing_revisions: { id: string; drawing_id: string; revision: string; storage_path: string; file_name: string | null; mime_type: string | null; status: string; created_at: string; uploaded_by: string | null }[] | null };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    number: row.drawing_number,
    title: row.title,
    discipline: row.discipline,
    currentRevisionId: row.current_revision_id,
    revisions: (row.agenda_drawing_revisions ?? [])
      .map((revision) => ({
        id: revision.id, drawingId: revision.drawing_id, label: revision.revision, storagePath: revision.storage_path,
        fileName: revision.file_name, mimeType: revision.mime_type, status: revision.status, createdAt: revision.created_at,
        uploadedBy: revision.uploaded_by,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  }));
}

export async function readThreads(client: Client, projectId: string): Promise<Thread[]> {
  const { data } = await client.from("collab_threads").select("*").eq("project_id", projectId).is("archived_at", null).order("last_activity_at", { ascending: false }).limit(500);
  return (data ?? []).map(toThread);
}

export async function readComments(client: Client, threadId: string): Promise<Comment[]> {
  const { data } = await client.from("collab_comments").select("*").eq("thread_id", threadId).order("created_at").limit(1000);
  return (data ?? []).map(toComment);
}

export async function readAnnotations(client: Client, revisionId: string): Promise<Annotation[]> {
  const { data } = await client.from("collab_annotations").select("*").eq("revision_id", revisionId).is("archived_at", null).order("created_at").limit(2000);
  return (data ?? []).map(toAnnotation);
}

/** Threads with something newer than the last time I read them. */
export async function readUnread(client: Client, projectId: string, userId: string, threads: readonly Thread[]): Promise<Set<string>> {
  const { data } = await client.from("collab_reads").select("thread_id, read_at").eq("project_id", projectId).eq("user_id", userId);
  const read = new Map((data ?? []).map((row) => [row.thread_id, row.read_at]));
  return new Set(threads.filter((thread) => {
    const at = read.get(thread.id);
    return !at || at < thread.lastActivityAt;
  }).map((thread) => thread.id));
}

/** The Agenda tasks the Studio made, and any others linked to its threads. */
export async function readStudioTasks(client: Client, projectId: string, taskIds: readonly string[]): Promise<StudioTask[]> {
  if (!taskIds.length) return [];
  const { data } = await client.from("agenda_tasks").select("id, title, description, status, assigned_to, due_at, created_by, updated_at").eq("project_id", projectId).in("id", [...taskIds]).is("archived_at", null);
  return (data ?? []).map((row) => ({
    id: row.id, title: row.title, description: row.description, status: row.status, assignedTo: row.assigned_to,
    dueAt: row.due_at, createdBy: row.created_by, updatedAt: row.updated_at,
  }));
}
