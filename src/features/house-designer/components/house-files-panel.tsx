"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, Loader2, PenLine, Plus } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { addProjectFile, FILE_CATEGORIES, listProjectFiles, type FileCategory, type ProjectFile } from "../services/project-files";
import { signedUrl, type SketchSource } from "../services/sketch-store";

/**
 * The project's files: drawings, site photos, PDFs, CAD. A file is opened as
 * itself, or opened to sketch on — the file stays as it was.
 */
export function HouseFilesPanel({ projectId, userId, onSketch }: { projectId: string; userId: string; onSketch: (source: SketchSource) => void }) {
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [filter, setFilter] = useState<FileCategory | "all">("all");
  const [category, setCategory] = useState<FileCategory>("drawings");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void listProjectFiles(createClient(), projectId).then((items) => { if (live) setFiles(items); });
    return () => { live = false; };
  }, [projectId]);

  async function add(file: File) {
    setBusy(true);
    const added = await addProjectFile(createClient(), userId, projectId, file, category);
    setBusy(false);
    if ("error" in added) { toast.error(added.error); return; }
    setFiles((items) => [added, ...(items ?? [])]);
    toast.success(`${added.name} added to the project`);
  }

  async function openFile(file: ProjectFile) {
    const url = await signedUrl(createClient(), file.path);
    if (url) window.open(url, "_blank", "noopener");
    else toast.error("That file could not be opened.");
  }

  const shown = (files ?? []).filter((file) => filter === "all" || file.category === filter);

  return (
    <section aria-label="Files" className="space-y-3">
      <div className="space-y-2 rounded-xl border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">Add to
            <select aria-label="File category" value={category} onChange={(event) => setCategory(event.target.value as FileCategory)} className="min-h-10 rounded-lg border bg-background px-2 text-sm text-foreground">
              {FILE_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className={cn("flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-foreground", busy && "opacity-50")}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Add file
            <input type="file" aria-label="Add a file" className="sr-only" disabled={busy} accept="image/*,.pdf,.dxf,.dwg,.doc,.docx,.xls,.xlsx" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void add(file); }} />
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground">PDFs, DXF drawings and images open to sketch on. A DWG is kept as a file — save it as DXF to sketch on it here.</p>
      </div>
      <div role="tablist" aria-label="File groups" className="flex gap-1 overflow-x-auto">
        {[{ id: "all" as const, label: "All" }, ...FILE_CATEGORIES].map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)} className={cn("min-h-9 shrink-0 rounded-full border px-3 text-xs", filter === item.id ? "border-brand bg-brand/10 text-brand" : "text-muted-foreground")}>{item.label}</button>
        ))}
      </div>
      {files === null ? <p className="text-sm text-muted-foreground">Loading…</p> : shown.length === 0 ? <p className="text-sm text-muted-foreground">No files here yet.</p> : null}
      <ul className="divide-y rounded-xl border bg-card">
        {shown.map((file) => (
          <li key={file.id} className="flex items-center gap-2 px-3 py-2">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{file.name}</span><span className="block text-[11px] text-muted-foreground">{FILE_CATEGORIES.find((item) => item.id === file.category)?.label} · {new Date(file.createdAt).toLocaleDateString()}</span></span>
            {file.opensAs ? <button type="button" aria-label={`Sketch on ${file.name}`} onClick={() => onSketch({ kind: file.opensAs!, path: file.path, name: file.name, level: null, page: file.opensAs === "pdf" ? 1 : null })} className="flex min-h-10 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium hover:bg-muted"><PenLine className="size-3.5" />Sketch</button> : null}
            <button type="button" aria-label={`Open ${file.name}`} onClick={() => void openFile(file)} className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><ExternalLink className="size-4" /></button>
          </li>
        ))}
      </ul>
    </section>
  );
}
