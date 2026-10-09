"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, FileImage, FolderOpen, Layers, Loader2, Maximize2, Redo2, RotateCw, Share2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { MarkupCanvas, renderMarkup, type MarkupBackground, type MarkupPin, type MarkupShape } from "./markup-canvas";
import { HousePinDialog } from "./house-pin-sheet";
import { addProjectFile } from "../services/project-files";
import { planSnapshot, svgDataUrl } from "../services/plan-snapshot";
import type { PlanLink } from "../services/plan-store";
import { createPin, listSketches, saveSketch, signedUrl, uploadProjectFile, type Pin, type Sketch, type SketchSource } from "../services/sketch-store";
import type { DxfDrawing } from "../services/source-render";
import type { HouseProject } from "../types/project";

export type SketchRequest = { sketchId?: string; source?: SketchSource; pinId?: string; nonce: number };

type Open = {
  sketch: Omit<Sketch, "updatedAt" | "id"> & { id?: string };
  background: MarkupBackground;
  url: string | null;
  pages: number | null;
  dxf: DxfDrawing | null;
  layers: Set<string>;
};

/**
 * Sketch: markup over the plan, a photo, a PDF page or a CAD drawing. It never
 * changes the plan, and never paints on the file — the markup is stored on its
 * own and drawn over the file when it is opened.
 */
export function HouseSketchPanel({ project, levelId, link, userId, pins, onPinsChanged, request, onOpenFiles, onPin, onAddToAgenda }: {
  project: HouseProject;
  levelId: string;
  link: PlanLink;
  userId: string;
  pins: Pin[];
  onPinsChanged: () => Promise<void>;
  request: SketchRequest | null;
  onOpenFiles: () => void;
  /** A pin tapped on the sketch: the editor shows it. */
  onPin: (pin: Pin) => void;
  onAddToAgenda: (pin: Pin, previewPath: string | null) => Promise<void>;
}) {
  const [sketches, setSketches] = useState<Sketch[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Open | null>(null);
  const [past, setPast] = useState<MarkupShape[][]>([]);
  const [future, setFuture] = useState<MarkupShape[][]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [fitKey, setFitKey] = useState(0);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [pinAt, setPinAt] = useState<{ x: number; y: number } | null>(null);
  const [discussionShape, setDiscussionShape] = useState<MarkupShape | null>(null);
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(null);
  const handled = useRef<number | null>(null);
  const savingRef = useRef(false);
  const openRef = useRef<Open | null>(null);
  useEffect(() => { openRef.current = open; });
  const level = project.levels.find((item) => item.id === levelId);

  async function reload() {
    const client = createClient();
    const items = await listSketches(client, link.planId);
    setSketches(items);
    const urls: Record<string, string> = {};
    await Promise.all(items.filter((item) => item.previewPath).map(async (item) => { const url = await signedUrl(client, item.previewPath!); if (url) urls[item.id] = url; }));
    setPreviews(urls);
    return items;
  }

  useEffect(() => {
    let live = true;
    void listSketches(createClient(), link.planId).then(async (items) => {
      if (!live) return;
      setSketches(items);
      const client = createClient();
      const urls: Record<string, string> = {};
      await Promise.all(items.filter((item) => item.previewPath).map(async (item) => { const url = await signedUrl(client, item.previewPath!); if (url) urls[item.id] = url; }));
      if (live) setPreviews(urls);
    });
    return () => { live = false; };
  }, [link.planId]);

  // Asked from elsewhere — a pin in the Agenda list, a file's "Sketch on it".
  useEffect(() => {
    if (!request || handled.current === request.nonce || sketches === null) return;
    handled.current = request.nonce;
    const existing = request.sketchId ? sketches.find((item) => item.id === request.sketchId) : request.source ? sketches.find((item) => sameSource(item.source, request.source!)) : null;
    const pin = request.pinId ? pins.find((item) => item.id === request.pinId) : null;
    void openSketch(existing ?? null, existing ? existing.source : request.source ?? null, pin ? { x: pin.x, y: pin.y } : null);
    // `openSketch` reads the latest state; only a new request should run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, sketches]);

  // Saved a few seconds after the last stroke. Saving never touches the
  // canvas, so it cannot interrupt the next one.
  useEffect(() => {
    if (!open || !dirty) return;
    const timer = window.setTimeout(() => { void save(); }, 3000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty]);

  async function backgroundFor(source: SketchSource, page: number | null): Promise<Omit<Open, "sketch"> & { mmPerUnit: number | null }> {
    if (source.kind === "plan") {
      const snapshot = planSnapshot(project, source.level ?? levelId);
      return { background: { url: svgDataUrl(snapshot.svg), x: snapshot.x, y: snapshot.y, width: snapshot.width, height: snapshot.height }, mmPerUnit: 1, url: null, pages: null, dxf: null, layers: new Set() };
    }
    const url = source.path ? await signedUrl(createClient(), source.path) : null;
    if (!url) throw new Error("That file could not be opened.");
    const render = await import("../services/source-render");
    if (source.kind === "image") return { ...(await render.renderImage(url)), url, pages: null, dxf: null, layers: new Set() };
    if (source.kind === "pdf") {
      const pages = await render.pdfPageCount(url);
      return { ...(await render.renderPdfPage(url, page ?? 1)), url, pages, dxf: null, layers: new Set() };
    }
    const text = await (await fetch(url)).text();
    const dxf = await render.parseDxf(text);
    const layers = new Set(dxf.layers);
    return { ...render.renderDxf(dxf, layers), url, pages: null, dxf, layers };
  }

  async function openSketch(existing: Sketch | null, source: SketchSource | null, focusAt: { x: number; y: number } | null = null) {
    if (!source) return;
    setLoading(true);
    try {
      const rendered = await backgroundFor(source, existing?.source.page ?? source.page);
      const title = existing?.title ?? (source.kind === "plan" ? `${level?.name ?? "Plan"} sketch` : source.kind === "pdf" ? `${source.name ?? "PDF"} · page ${source.page ?? 1}` : source.name ?? "Sketch");
      const mmPerUnit = existing?.mmPerUnit ?? rendered.mmPerUnit;
      setOpen({ sketch: { id: existing?.id, title, source: { ...source, page: source.kind === "pdf" ? source.page ?? 1 : null }, markup: existing?.markup ?? [], mmPerUnit, previewPath: existing?.previewPath ?? null }, background: rendered.background, url: rendered.url, pages: rendered.pages, dxf: rendered.dxf, layers: rendered.layers });
      setPast([]);
      setFuture([]);
      setDirty(false);
      setRotation(0);
      setFocus(focusAt);
      setPinAt(null);
      setDiscussionShape(null);
      if (source.kind === "pdf" && rendered.url && rendered.pages) void loadThumbs(rendered.url, rendered.pages);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That could not be opened.");
    } finally {
      setLoading(false);
    }
  }

  async function loadThumbs(url: string, count: number) {
    const render = await import("../services/source-render");
    const next: Record<number, string> = {};
    for (let page = 1; page <= Math.min(count, 40); page += 1) {
      try { next[page] = await render.pdfThumbnail(url, page); } catch { /* a page that will not draw is shown as its number */ }
    }
    setThumbs(next);
  }

  function setShapes(shapes: MarkupShape[]) {
    if (!open) return;
    setPast((items) => [...items, open.sketch.markup].slice(-80));
    setFuture([]);
    setOpen({ ...open, sketch: { ...open.sketch, markup: shapes } });
    setDirty(true);
  }

  /** Saves the markup, then the marked-up picture beside it. Returns the sketch's id. */
  async function save(): Promise<{ id: string; previewPath: string | null } | null> {
    const current = openRef.current;
    if (!current || savingRef.current) return current?.sketch.id ? { id: current.sketch.id, previewPath: current.sketch.previewPath } : null;
    savingRef.current = true;
    setSaving(true);
    const client = createClient();
    const target = { projectId: link.projectId, planId: link.planId };
    const saved = await saveSketch(client, userId, target, current.sketch);
    if ("error" in saved) { savingRef.current = false; setSaving(false); toast.error(saved.error); return null; }
    let previewPath = current.sketch.previewPath;
    const blob = await renderMarkup(current.background, current.sketch.markup, pinsOf(pins, current.sketch.markup));
    if (blob) {
      const uploaded = await uploadProjectFile(client, link.projectId, "sketches", blob, "sketch.png");
      if (!("error" in uploaded)) {
        previewPath = uploaded.path;
        await saveSketch(client, userId, target, { ...current.sketch, id: saved.id, previewPath });
      }
    }
    savingRef.current = false;
    setSaving(false);
    setOpen((value) => value && value.sketch === current.sketch ? { ...value, sketch: { ...value.sketch, id: saved.id, previewPath } } : value && { ...value, sketch: { ...value.sketch, id: saved.id, previewPath } });
    if (openRef.current?.sketch.markup === current.sketch.markup) setDirty(false);
    void reload();
    return { id: saved.id, previewPath };
  }

  async function placePin(at: { x: number; y: number }, details: { title: string; note: string; measurement: string; agenda: boolean }) {
    setPinAt(null);
    setDiscussionShape(null);
    if (!open) return;
    const saved = await save();
    if (!saved) return;
    const pin = await createPin(createClient(), userId, { projectId: link.projectId, planId: link.planId }, { sketchId: saved.id, source: open.sketch.source, x: at.x, y: at.y, title: details.title, note: details.note, measurement: details.measurement });
    if ("error" in pin) { toast.error(pin.error); return; }
    const size = Math.max(open.background.width, open.background.height) / 40;
    const shapes = [...(openRef.current?.sketch.markup ?? []), { id: crypto.randomUUID(), type: "pin" as const, points: [[at.x, at.y]] as [number, number][], color: "#e11d48", size, text: pin.number, pinId: pin.id }];
    setShapes(shapes);
    await onPinsChanged();
    const after = await save();
    if (details.agenda) await onAddToAgenda(pin, after?.previewPath ?? null);
    toast.success(`${pin.number} placed`);
  }

  async function shareSketch() {
    // A stable application link, NOT a signed storage URL. The recipient must
    // belong to this Agenda project; database RLS checks that membership.
    const saved = await save();
    if (!saved) { toast.error("Save the sketch before sharing it."); return; }
    const address = new URL("/house-design", window.location.origin);
    address.searchParams.set("plan", link.planId);
    address.searchParams.set("sketch", saved.id);
    try {
      await navigator.clipboard.writeText(address.toString());
      toast.success("Sketch link copied. Only members of this Agenda project can open it.");
    } catch {
      window.prompt("Copy this project-member link", address.toString());
    }
  }

  function discussShape(shape: MarkupShape) {
    const a = shape.points[0];
    if (!a) return;
    const b = shape.points.at(-1) ?? a;
    setDiscussionShape(shape);
    setPinAt({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 });
  }

  async function addImage(file: File) {
    setLoading(true);
    const added = await addProjectFile(createClient(), userId, link.projectId, file, "site-photos");
    setLoading(false);
    if ("error" in added) { toast.error(added.error); return; }
    void openSketch(null, { kind: "image", path: added.path, name: added.name, level: null, page: null });
  }

  const markupPins = useMemo(() => pins.map((pin) => ({ id: pin.id, number: pin.number, x: pin.x, y: pin.y, status: pin.status, title: pin.title })), [pins]);

  if (open) {
    const { sketch } = open;
    return (
      <section aria-label="Sketch" className="space-y-2">
        <div className="flex min-w-0 items-center gap-1 rounded-xl border bg-card p-1">
          <button type="button" aria-label="Back to sketches" onClick={async () => { if (dirty) await save(); setOpen(null); }} className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><ArrowLeft className="size-4" /></button>
          <input aria-label="Sketch name" value={sketch.title} onChange={(event) => { setOpen({ ...open, sketch: { ...sketch, title: event.target.value } }); setDirty(true); }} className="min-w-0 flex-1 truncate bg-transparent px-1 text-sm font-semibold outline-none" />
          <button type="button" aria-label="Undo sketch" disabled={!past.length} onClick={() => { const previous = past.at(-1)!; setPast(past.slice(0, -1)); setFuture([sketch.markup, ...future]); setOpen({ ...open, sketch: { ...sketch, markup: previous } }); setDirty(true); }} className="flex size-10 items-center justify-center rounded-lg text-muted-foreground disabled:opacity-30"><Undo2 className="size-4" /></button>
          <button type="button" aria-label="Redo sketch" disabled={!future.length} onClick={() => { const next = future[0]!; setFuture(future.slice(1)); setPast([...past, sketch.markup]); setOpen({ ...open, sketch: { ...sketch, markup: next } }); setDirty(true); }} className="flex size-10 items-center justify-center rounded-lg text-muted-foreground disabled:opacity-30"><Redo2 className="size-4" /></button>
          <span aria-live="polite" aria-label={`Sketch status: ${saving ? "Saving…" : dirty ? "Unsaved" : sketch.id ? "Saved ✓" : "Not saved"}`} className={cn("shrink-0 px-1 text-[11px]", !dirty && sketch.id ? "text-emerald-600" : "text-muted-foreground")}>{saving ? "Saving…" : dirty ? "Unsaved" : sketch.id ? "Saved ✓" : "Not saved"}</span>
          <button type="button" onClick={() => void save()} className="min-h-10 shrink-0 rounded-lg bg-brand px-3 text-xs font-semibold text-brand-foreground">Save sketch</button>
        </div>
        <MarkupCanvas
          key={`${sketch.source.kind}:${sketch.source.path}:${sketch.source.page}:${fitKey}`}
          background={open.background}
          shapes={sketch.markup}
          onShapes={setShapes}
          pins={markupPins}
          mmPerUnit={sketch.mmPerUnit}
          onCalibrate={sketch.source.kind === "plan" ? undefined : (mmPerUnit) => { setOpen({ ...open, sketch: { ...sketch, mmPerUnit } }); setDirty(true); toast.success("Scale set — Measure now reads real lengths"); }}
          unit={project.displayUnits ?? "mm"}
          onPinRequest={(point) => { setDiscussionShape(null); setPinAt(point); }}
          onDiscussShape={discussShape}
          onPinOpen={(id) => { const pin = pins.find((item) => item.id === id); if (pin) onPin(pin); }}
          focus={focus}
          rotation={rotation}
          label={`Sketch over ${sketch.source.kind === "plan" ? level?.name ?? "the plan" : sketch.source.name ?? "a file"}`}
        />
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setFitKey((value) => value + 1)} className="flex min-h-10 items-center gap-1 rounded-lg border px-3 text-xs"><Maximize2 className="size-3.5" />Fit</button>
          <button type="button" disabled={saving} onClick={() => void shareSketch()} className="flex min-h-10 items-center gap-1 rounded-lg border border-brand/40 px-3 text-xs font-semibold text-brand disabled:opacity-40"><Share2 className="size-3.5" />Share with members</button>
          <a href={`/agenda/projects/${link.projectId}/directory`} className="flex min-h-10 items-center gap-1 rounded-lg border px-3 text-xs"><ExternalLink className="size-3.5" />Invite team</a>
          {sketch.source.kind !== "plan" ? <button type="button" onClick={() => setRotation((value) => (value + 90) % 360)} className="flex min-h-10 items-center gap-1 rounded-lg border px-3 text-xs"><RotateCw className="size-3.5" />Rotate view</button> : null}
        </div>
        {open.pages && open.pages > 1 ? (
          <div role="tablist" aria-label="Pages" className="flex gap-1.5 overflow-x-auto rounded-xl border bg-card p-1.5">
            {Array.from({ length: open.pages }, (_, index) => index + 1).map((page) => (
              <button key={page} type="button" role="tab" aria-selected={sketch.source.page === page} aria-label={`Page ${page}`} onClick={async () => { if (dirty) await save(); const existing = sketches?.find((item) => sameSource(item.source, { ...sketch.source, page })); void openSketch(existing ?? null, { ...sketch.source, page }); }} className={cn("flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-lg border p-1 text-[10px]", sketch.source.page === page && "border-brand bg-brand/10")}>
                {thumbs[page] ? <Picture src={thumbs[page]} alt="" className="h-16 w-full object-contain" /> : <span className="flex h-16 items-center">{page}</span>}
                {page}
              </button>
            ))}
          </div>
        ) : null}
        {open.dxf ? (
          <details className="rounded-xl border bg-card p-2 text-xs">
            <summary className="flex cursor-pointer items-center gap-1.5 font-medium"><Layers className="size-3.5" />Layers · {open.layers.size}/{open.dxf.layers.length}{open.dxf.skipped ? ` · ${open.dxf.skipped} items not drawn` : ""}</summary>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {open.dxf.layers.map((layer) => (
                <label key={layer} className="flex items-center gap-1 rounded-full border px-2 py-1"><input type="checkbox" checked={open.layers.has(layer)} onChange={async (event) => { const layers = new Set(open.layers); if (event.target.checked) layers.add(layer); else layers.delete(layer); const render = await import("../services/source-render"); setOpen({ ...open, layers, background: render.renderDxf(open.dxf!, layers).background }); }} />{layer}</label>
              ))}
            </div>
          </details>
        ) : null}
        {pinAt ? <HousePinDialog
          key={discussionShape?.id ?? "pin"}
          discussionOnly={!!discussionShape}
          initial={{ title: discussionShape ? (discussionShape.type === "text" ? discussionShape.text ?? "Text note" : `${discussionShape.type} — review`) : "", note: "", measurement: "" }}
          onCancel={() => { setPinAt(null); setDiscussionShape(null); }}
          onSave={(details) => void placePin(pinAt, { ...details, agenda: details.agenda || !!discussionShape })}
        /> : null}
      </section>
    );
  }

  return (
    <section aria-label="Sketches" className="space-y-3">
      <div className="rounded-xl border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">New sketch on</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => void openSketch(null, { kind: "plan", path: null, name: level?.name ?? null, level: levelId, page: null })} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-xs font-medium hover:bg-muted"><FileImage className="size-5 text-brand" />{level?.name ?? "This plan"}</button>
          <label className="flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center text-xs font-medium hover:bg-muted">
            <FileImage className="size-5 text-brand" />Photo or image
            <input type="file" accept="image/*" capture="environment" aria-label="Photo to sketch on" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void addImage(file); }} />
          </label>
          <button type="button" onClick={onOpenFiles} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-xs font-medium hover:bg-muted"><FolderOpen className="size-5 text-brand" />PDF, CAD or a file</button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Sketching never changes the plan or the file underneath.</p>
      </div>
      {loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Opening…</p> : null}
      <div>
        <p className="pb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Saved sketches</p>
        {sketches === null ? <p className="text-sm text-muted-foreground">Loading…</p> : sketches.length === 0 ? <p className="text-sm text-muted-foreground">No sketches yet.</p> : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {sketches?.map((item) => (
            <button key={item.id} type="button" onClick={() => void openSketch(item, item.source)} className="overflow-hidden rounded-xl border text-left hover:bg-muted/40">
              {previews[item.id] ? <Picture src={previews[item.id]} alt="" className="h-24 w-full bg-white object-contain" /> : <span className="flex h-24 items-center justify-center bg-muted text-xs text-muted-foreground">{item.source.kind.toUpperCase()}</span>}
              <span className="block truncate px-2 pt-1 text-xs font-medium">{item.title}</span>
              <span className="block truncate px-2 pb-1.5 text-[10px] text-muted-foreground">{item.markup.length} mark{item.markup.length === 1 ? "" : "s"} · {item.source.kind}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function sameSource(a: SketchSource, b: SketchSource) {
  return a.kind === b.kind && (a.kind === "plan" ? a.level === b.level : a.path === b.path && (a.kind !== "pdf" || (a.page ?? 1) === (b.page ?? 1)));
}

function pinsOf(pins: Pin[], shapes: MarkupShape[]): MarkupPin[] {
  return pins.filter((pin) => shapes.some((shape) => shape.pinId === pin.id)).map((pin) => ({ id: pin.id, number: pin.number, x: pin.x, y: pin.y, status: pin.status, title: pin.title }));
}

/** A rendered page or a signed, short-lived URL: nothing for next/image to optimise or cache. */
function Picture(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" {...props} />;
}
