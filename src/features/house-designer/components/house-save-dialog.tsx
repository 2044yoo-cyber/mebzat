"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { listProjects, type ProjectOption } from "../services/plan-store";

export type SaveChoice = { project: ProjectOption | { newName: string }; title: string };

/**
 * Which Medosha project the plan belongs to. Asked once — the first save —
 * and after that the plan simply saves where it is. The list is the person's
 * Agenda projects, the same ones the Agenda shows, so there is one kind of
 * project rather than a House Designer project and an Agenda project.
 */
export function HouseSaveDialog({ defaultTitle, preferredProjectId, busy, onSave, onClose }: {
  defaultTitle: string;
  preferredProjectId?: string | null;
  busy: boolean;
  onSave: (choice: SaveChoice) => void;
  onClose: () => void;
}) {
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [chosen, setChosen] = useState<string>("new");
  const [newName, setNewName] = useState(defaultTitle);
  const [title, setTitle] = useState(defaultTitle);

  useEffect(() => {
    let live = true;
    void listProjects(createClient()).then((items) => {
      if (!live) return;
      setProjects(items);
      const preferred = items.find((item) => item.id === preferredProjectId);
      if (preferred) setChosen(preferred.id);
    });
    return () => { live = false; };
  }, [preferredProjectId]);

  const picked = projects?.find((item) => item.id === chosen);
  const ready = title.trim().length > 0 && (chosen === "new" ? newName.trim().length > 0 : Boolean(picked));

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-3 sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form role="dialog" aria-modal="true" aria-label="Save project" onSubmit={(event) => { event.preventDefault(); if (ready) onSave({ project: chosen === "new" ? { newName: newName.trim() } : picked!, title: title.trim() }); }} className="w-full max-w-md space-y-3 rounded-2xl border bg-card p-4 shadow-2xl">
        <div>
          <h2 className="text-base font-semibold">Save project</h2>
          <p className="text-xs text-muted-foreground">The plan is saved in a Medosha project, with its sketches, files and Agenda.</p>
        </div>
        <label className="block space-y-1 text-xs text-muted-foreground">
          <span>Plan name</span>
          <input aria-label="Plan name" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm text-foreground" />
        </label>
        <fieldset className="space-y-1.5">
          <legend className="pb-1 text-xs text-muted-foreground">Project</legend>
          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            <label className={cn("flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm", chosen === "new" && "border-brand bg-brand/5")}>
              <input type="radio" name="project" checked={chosen === "new"} onChange={() => setChosen("new")} />
              <span className="shrink-0">New project</span>
              {chosen === "new" ? <input aria-label="New project name" value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={160} className="min-h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" /> : null}
            </label>
            {projects === null ? <p className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Loading your projects…</p> : null}
            {projects?.map((item) => (
              <label key={item.id} className={cn("flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm", chosen === item.id && "border-brand bg-brand/5")}>
                <input type="radio" name="project" checked={chosen === item.id} onChange={() => setChosen(item.id)} />
                <span className="truncate">{item.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 flex-1 rounded-xl border text-sm font-medium hover:bg-muted">Cancel</button>
          <button type="submit" disabled={!ready || busy} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-brand-foreground disabled:opacity-40">{busy ? <Loader2 className="size-4 animate-spin" /> : null}Save</button>
        </div>
      </form>
    </div>
  );
}
