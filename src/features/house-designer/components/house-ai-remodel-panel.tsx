"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, Sparkles } from "lucide-react";

import {
  applyHouseRemodelCommand,
  houseRemodelCommandSchema,
  selectedObjectSnapshot,
} from "../services/remodel";
import type { HouseProject, HouseSelection } from "../types/project";

const suggestions = [
  "Make the façade modern",
  "Use black aluminium windows",
  "Change the roof to flat",
  "Add a balcony above the entrance",
  "Generate four alternatives",
];

export function HouseAiRemodelPanel({
  project,
  selected,
  selections = selected ? [selected] : [],
  onChange,
}: {
  project: HouseProject;
  selected: HouseSelection | null;
  selections?: readonly HouseSelection[];
  onChange: (project: HouseProject) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ project: HouseProject; explanation: string; blocked: string[] } | null>(null);

  async function apply() {
    const requestText = prompt.trim();
    if (!requestText || busy) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    setPreview(null);
    try {
      const response = await fetch("/api/house-design/remodel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: requestText,
          strict: project.originalPlanStrict,
          selection: selected,
          object: selectedObjectSnapshot(project, selected),
          facade: project.facade,
        }),
      });
      const payload = (await response.json()) as { command?: unknown; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "AI remodeling failed.");
      const parsed = houseRemodelCommandSchema.safeParse(payload.command);
      if (!parsed.success) throw new Error("The AI returned an unsafe change, so nothing was applied.");

      let result = applyHouseRemodelCommand(project, selected, parsed.data);
      const blocked = [...result.blockedFields];
      if (parsed.data.action === "patch_object" && selections.length > 1) {
        let next = result.project;
        for (const target of selections.slice(0, -1)) {
          const batch = applyHouseRemodelCommand(next, target, parsed.data);
          next = batch.project;
          blocked.push(...batch.blockedFields);
        }
        result = { project: next, blockedFields: blocked };
      }
      setPreview({ project: result.project, explanation: parsed.data.explanation, blocked });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI remodeling failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand"><Sparkles className="size-4" /></span>
          <div>
            <h3 className="text-sm font-semibold">AI Remodel</h3>
            <p className="text-[11px] text-muted-foreground">{selected ? `Editing selected ${selected.kind}` : "Whole-house appearance"}</p>
          </div>
        </div>
        {project.originalPlanStrict ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"><ShieldCheck className="size-3" /> Plan protected</span>
        ) : null}
      </div>

      <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
        {suggestions.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => setPrompt(suggestion)} className="shrink-0 rounded-full border px-3 py-1.5 text-[11px] hover:border-brand hover:text-brand">{suggestion}</button>
        ))}
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void apply(); }} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          maxLength={1_000}
          placeholder={selected ? `Describe the change to this ${selected.kind}` : "Describe a façade or style change"}
          className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button type="submit" disabled={busy || !prompt.trim()} className="flex items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-medium text-brand-foreground disabled:opacity-45">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {busy ? "Preparing…" : "Preview"}
        </button>
      </form>

      {message ? <p className="rounded-lg bg-emerald-500/10 p-2 text-xs text-emerald-800 dark:text-emerald-300">{message}</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
      {preview ? <div className="rounded-lg border border-brand/30 bg-brand/5 p-3 text-xs"><strong>Review AI change</strong><p className="mt-1 text-muted-foreground">{preview.explanation}{preview.blocked.length ? ` Protected by Strict: ${[...new Set(preview.blocked)].join(", ")}.` : ""}</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => { onChange(preview.project); setMessage("AI change applied to the structured model."); setPreview(null); setPrompt(""); }} className="rounded-lg bg-brand px-3 py-2 font-medium text-brand-foreground">Apply change</button><button type="button" onClick={() => setPreview(null)} className="rounded-lg border px-3 py-2">Cancel</button></div></div> : null}
    </section>
  );
}
