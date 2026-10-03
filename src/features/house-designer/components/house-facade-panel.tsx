"use client";

import { useState } from "react";
import { ImageIcon, Loader2, Palette, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

import type { SpaceAnalysis } from "@/lib/ai/vision.types";
import { cn } from "@/lib/utils";

import {
  activateFacadeAlternative,
  applyFacadeReference,
  applyFacadeStyle,
  generateFacadeAlternatives,
  patchFacade,
} from "../services/facade";
import { HOUSE_STYLE_LABELS, houseStyles, type HouseProject, type HouseStyle } from "../types/project";

export function HouseFacadePanel({ project, onChange }: { project: HouseProject; onChange: (project: HouseProject) => void }) {
  const [count, setCount] = useState<2 | 3 | 4>(3);
  const [analysing, setAnalysing] = useState(false);
  const facadeReference = project.referenceImages.find((image) => image.kind === "facade" && image.mediaType === "image");

  async function analyseReference() {
    if (!facadeReference) return;
    setAnalysing(true);
    try {
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: facadeReference.url }),
      });
      const result = await response.json() as { analysis?: SpaceAnalysis; error?: string };
      if (!response.ok || !result.analysis) throw new Error(result.error || "The reference could not be analysed.");
      onChange(applyFacadeReference(project, facadeReference.id, result.analysis));
      toast.success("Reference appearance applied without changing the floor plan.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The reference could not be analysed.");
    } finally {
      setAnalysing(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">Façade designer</p>
          <p className="text-xs text-muted-foreground">Appearance changes remain separate from verified plan geometry.</p>
        </div>
        {project.originalPlanStrict ? (
          <span className="flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand"><ShieldCheck className="size-3.5" /> Plan strict</span>
        ) : null}
      </div>

      <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
        <label className="shrink-0 space-y-1 text-[11px] text-muted-foreground">
          <span>Style</span>
          <select value={project.designStyle} onChange={(event) => onChange(applyFacadeStyle(project, event.target.value as HouseStyle))} className="block min-w-44 rounded-lg border bg-background px-3 py-2 text-sm capitalize text-foreground">
            {houseStyles.map((style) => <option key={style} value={style}>{HOUSE_STYLE_LABELS[style]}</option>)}
          </select>
        </label>
        <ColourField label="Main" value={project.facade.primaryColor} onChange={(primaryColor) => onChange(patchFacade(project, { primaryColor }))} />
        <ColourField label="Secondary" value={project.facade.secondaryColor} onChange={(secondaryColor) => onChange(patchFacade(project, { secondaryColor }))} />
        <ColourField label="Accent" value={project.facade.accentColor} onChange={(accentColor) => onChange(patchFacade(project, { accentColor }))} />
        <ColourField label="Roof" value={project.facade.roofColor} onChange={(roofColor) => onChange(patchFacade(project, { roofColor }))} />
        <ColourField label="Frames" value={project.facade.windowFrameColor} onChange={(windowFrameColor) => onChange(patchFacade(project, { windowFrameColor }))} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={analyseReference} disabled={!facadeReference || analysing} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-40">
          {analysing ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
          {project.facadeReferenceAnalysis ? "Reanalyse reference" : "Use façade reference"}
        </button>
        <select value={count} onChange={(event) => setCount(Number(event.target.value) as 2 | 3 | 4)} className="rounded-lg border bg-background px-2 py-2 text-xs">
          <option value={2}>2 options</option><option value={3}>3 options</option><option value={4}>4 options</option>
        </select>
        <button type="button" onClick={() => onChange(generateFacadeAlternatives(project, count))} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-medium text-brand-foreground">
          <Sparkles className="size-3.5" /> Generate alternatives
        </button>
      </div>

      {project.facadeReferenceAnalysis ? (
        <p className="rounded-lg bg-muted/60 p-2 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Reference:</strong> {project.facadeReferenceAnalysis.summary}</p>
      ) : null}

      {project.designAlternatives.length > 0 ? (
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
          {project.designAlternatives.map((alternative) => (
            <button key={alternative.id} type="button" onClick={() => onChange(activateFacadeAlternative(project, alternative.id))} className={cn("min-w-44 rounded-xl border p-3 text-left hover:border-brand", project.designStyle === alternative.style && "border-brand bg-brand/5")}>
              <span className="mb-2 flex gap-1">{[alternative.facade.primaryColor, alternative.facade.secondaryColor, alternative.facade.accentColor].map((color) => <i key={color} className="size-4 rounded-full border" style={{ backgroundColor: color }} />)}</span>
              <strong className="block text-xs">{alternative.name}</strong>
              <span className="text-[11px] text-muted-foreground">Same verified plan</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="shrink-0 space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <span className="flex h-9 items-center gap-2 rounded-lg border bg-background px-2">
        <Palette className="size-3.5" />
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="size-6 cursor-pointer border-0 bg-transparent p-0" />
      </span>
    </label>
  );
}
