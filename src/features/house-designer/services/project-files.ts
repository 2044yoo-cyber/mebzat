import type { SupabaseClient } from "@supabase/supabase-js";

import { fileKindOf } from "@/lib/agenda/constants";
import { AGENDA_FILES_BUCKET, agendaFilePath } from "@/lib/agenda/files";
import type { Database } from "@/types/database.types";

/**
 * The project's files, as the House Plan shows them: Agenda's own documents
 * and site photos, sorted into the few groups a person looking for a drawing
 * thinks in. Nothing is stored twice — a file added here is a document or a
 * photo on the project, and Agenda lists it too.
 */
type Client = SupabaseClient<Database>;

export const FILE_CATEGORIES = [
  { id: "drawings", label: "Drawings" },
  { id: "site-photos", label: "Site photos" },
  { id: "pdf", label: "PDF" },
  { id: "cad", label: "CAD" },
  { id: "images", label: "Images" },
  { id: "other", label: "Other" },
] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number]["id"];

export type ProjectFile = {
  id: string;
  name: string;
  category: FileCategory;
  /** What it can be opened as for sketching. DWG cannot be drawn here. */
  opensAs: "image" | "pdf" | "cad" | null;
  path: string;
  createdAt: string;
};

export function opensAs(name: string, mime?: string | null): ProjectFile["opensAs"] {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "dxf") return "cad";
  // A DWG or a model file is often labelled image/vnd.dwg and the like; it is not a picture.
  if (["dwg", "rvt", "rfa", "skp", "ifc", "3ds", "obj"].includes(extension)) return null;
  if (extension === "pdf" || mime === "application/pdf") return "pdf";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(extension) || mime?.startsWith("image/")) return "image";
  return null;
}

function categoryOf(tags: string[], name: string, mime?: string | null): FileCategory {
  const tagged = FILE_CATEGORIES.find((item) => tags.includes(item.id));
  if (tagged) return tagged.id;
  const kind = fileKindOf(name, mime ?? undefined);
  return kind === "pdf" ? "pdf" : kind === "cad" ? "cad" : kind === "image" ? "images" : "other";
}

export async function listProjectFiles(client: Client, projectId: string): Promise<ProjectFile[]> {
  const [documents, versions, photos] = await Promise.all([
    client.from("agenda_documents").select("id, title, tags, current_version_id, created_at").eq("project_id", projectId).is("archived_at", null).order("created_at", { ascending: false }).limit(200),
    client.from("agenda_document_versions").select("id, document_id, storage_path, file_name, mime_type, version").eq("project_id", projectId).order("version", { ascending: false }).limit(500),
    client.from("agenda_photos").select("id, storage_path, caption, taken_at").eq("project_id", projectId).order("taken_at", { ascending: false }).limit(200),
  ]);
  const files: ProjectFile[] = [];
  for (const document of documents.data ?? []) {
    const version = (versions.data ?? []).find((item) => item.id === document.current_version_id) ?? (versions.data ?? []).find((item) => item.document_id === document.id);
    if (!version) continue;
    const name = version.file_name ?? document.title;
    files.push({ id: document.id, name, category: categoryOf(document.tags ?? [], name, version.mime_type), opensAs: opensAs(name, version.mime_type), path: version.storage_path, createdAt: document.created_at });
  }
  for (const photo of photos.data ?? []) {
    if (!photo.storage_path) continue;
    const name = photo.caption || photo.storage_path.split("/").pop() || "Photo";
    files.push({ id: photo.id, name, category: "site-photos", opensAs: "image", path: photo.storage_path, createdAt: photo.taken_at });
  }
  return files;
}

/** A DWG or DXF arrives labelled as all sorts; the bucket takes it as octet-stream. */
function contentType(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["dwg", "dxf", "rvt", "ifc", "skp"].includes(extension)) return "application/octet-stream";
  return file.type || "application/octet-stream";
}

export async function addProjectFile(client: Client, userId: string, projectId: string, file: File, category: FileCategory): Promise<ProjectFile | { error: string }> {
  if (file.size > 26214400) return { error: "That file is over 25 MB." };
  const folder = category === "site-photos" ? "photos" : "documents";
  const path = agendaFilePath(projectId, folder, file.name);
  const upload = await client.storage.from(AGENDA_FILES_BUCKET).upload(path, file, { contentType: contentType(file), upsert: false });
  if (upload.error) return { error: "That file did not upload. Try again." };
  if (category === "site-photos") {
    const { data, error } = await client.from("agenda_photos").insert({ project_id: projectId, storage_path: path, caption: file.name.slice(0, 300), uploaded_by: userId }).select("id, taken_at").single();
    if (error || !data) return { error: "The photo was uploaded but not filed." };
    return { id: data.id, name: file.name, category, opensAs: "image", path, createdAt: data.taken_at };
  }
  const { data: document, error } = await client
    .from("agenda_documents")
    .insert({ project_id: projectId, title: file.name.slice(0, 200), kind: fileKindOf(file.name, file.type), tags: [category], created_by: userId })
    .select("id, created_at")
    .single();
  if (error || !document) return { error: "The file was uploaded but not filed." };
  const version = await client.from("agenda_document_versions").insert({ document_id: document.id, project_id: projectId, version: 1, storage_path: path, file_name: file.name, mime_type: contentType(file), size_bytes: file.size, uploaded_by: userId });
  if (version.error) return { error: "The file was uploaded but not filed." };
  return { id: document.id, name: file.name, category, opensAs: opensAs(file.name, file.type), path, createdAt: document.created_at };
}
