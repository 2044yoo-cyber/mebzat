"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight, Check, ChevronLeft, ChevronRight, Circle, Eye, EyeOff, FilePlus2, FileText, Hand, Loader2,
  MapPin, Maximize, PenLine, Square, ThumbsUp, Trash2, Type, Undo2, Upload, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { isClosed, mentionedIn, normalise } from "@/lib/collab/model";
import { readAnnotations, type Annotation, type Asset, type Revision, type Thread } from "@/lib/collab/queries";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { loadImage, pdfPageCount, renderPdfPage } from "@/features/house-designer/services/source-render";

import { decideRevision, openThread, saveAnnotation } from "@/app/(dashboard)/agenda/projects/[projectId]/collaborate/actions";

import { pinColor, ToolButton, when } from "./chrome";
import { ACCEPT, isImage, isPdf, uploadToStudio, useSignedUrl } from "./files";
import { useCan, useStudio } from "./studio-context";
import { useViewport } from "./use-viewport";

type Tool = "pan" | "pin" | "pen" | "arrow" | "rect" | "ellipse" | "text";
const MARK_COLORS = ["#dc2626", "#1d4ed8", "#16a34a", "#ea580c", "#0f172a"] as const;

/**
 * Drawing review: a render, a plan, a site photo or a PDF page, with
 * comment pins and markup laid over it.
 *
 * The drawing is never painted on. Pins and marks are rows of their own,
 * placed in coordinates normalised to the page — 0 to 1 across and down —
 * so they sit on the same spot at any size, on any screen. A new revision is
 * a new file; the old one stays, with its comments, to compare against.
 */
export function ReviewView({ drawingId, onSelectDrawing }: { drawingId: string | null; onSelectDrawing: (id: string | null) => void }) {
  const studio = useStudio();
  const allowed = useCan();
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const reviewable = studio.assets;
  const asset = reviewable.find((entry) => entry.id === drawingId) ?? null;

  const upload = async (files: FileList | null, revisionOf?: string) => {
    if (!files?.length) return;
    setUploading(true);
    let last: string | null = null;
    for (const file of [...files].slice(0, 10)) {
      const result = await uploadToStudio(studio.projectId, file, { drawingId: revisionOf });
      if (!result.ok) { toast.error(result.error); continue; }
      last = result.drawingId;
      toast.success(revisionOf ? `Revision ${result.label} uploaded. The earlier revision is kept.` : `${file.name} added.`);
    }
    setUploading(false);
    await studio.refreshAssets();
    if (last) onSelectDrawing(last);
  };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <aside className={cn("flex min-h-0 flex-col border-b lg:w-72 lg:border-b-0 lg:border-r", asset && "hidden lg:flex")} aria-label="Drawings">
        <div className="flex items-center gap-2 p-2">
          <h3 className="flex-1 px-1 text-sm font-semibold">Drawings and files</h3>
          {allowed.edit ? <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-brand px-2.5 text-sm font-semibold text-brand-foreground">{uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}Upload</button> : null}
        </div>
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
          {!reviewable.length ? <li className="p-4 text-sm text-muted-foreground">No drawings yet. {allowed.edit ? "Upload a floor plan, render, site photo or PDF to review it with the team." : "When the team uploads one it appears here."}</li> : null}
          {reviewable.map((entry) => {
            const current = entry.revisions.find((revision) => revision.id === entry.currentRevisionId) ?? entry.revisions.at(-1);
            const open = studio.threads.filter((thread) => thread.drawingId === entry.id && !isClosed(thread.status)).length;
            return (
              <li key={entry.id}>
                <button type="button" onClick={() => onSelectDrawing(entry.id)} aria-current={entry.id === drawingId} className={cn("flex w-full items-center gap-2 p-2.5 text-left hover:bg-muted/50", entry.id === drawingId && "bg-brand/5")}>
                  <Thumb revision={current} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{entry.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{entry.number} · Rev {current?.label ?? "–"}{open ? ` · ${open} open` : ""}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(event) => { void upload(event.target.files); event.target.value = ""; }} />
      </aside>
      <div className={cn("min-h-[32rem] min-w-0 flex-1 lg:min-h-0", !asset && "hidden lg:block")}>
        {asset ? <Reviewer key={asset.id} asset={asset} onBack={() => onSelectDrawing(null)} onUploadRevision={(files) => void upload(files, asset.id)} uploading={uploading} /> : <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">Choose a drawing to review it.</div>}
      </div>
    </div>
  );
}

function Thumb({ revision }: { revision: Revision | undefined }) {
  const url = useSignedUrl(revision && isImage(revision.mimeType, revision.fileName) ? revision.storagePath : null);
  // eslint-disable-next-line @next/next/no-img-element -- a private file through a short-lived signed link
  return url ? <img src={url} alt="" className="size-11 shrink-0 rounded-md border object-cover" loading="lazy" /> : <span className="flex size-11 shrink-0 items-center justify-center rounded-md border bg-muted"><FileText className="size-5 text-muted-foreground" /></span>;
}

function Reviewer({ asset, onBack, onUploadRevision, uploading }: { asset: Asset; onBack: () => void; onUploadRevision: (files: FileList | null) => void; uploading: boolean }) {
  const studio = useStudio();
  const allowed = useCan();
  const latest = asset.revisions.find((revision) => revision.id === asset.currentRevisionId) ?? asset.revisions.at(-1);
  const [revisionId, setRevisionId] = useState(() => {
    const thread = studio.openThreadId ? studio.threads.find((entry) => entry.id === studio.openThreadId && entry.drawingId === asset.id) : undefined;
    return thread?.revisionId ?? latest?.id ?? null;
  });
  const [compareId, setCompareId] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const revisionInput = useRef<HTMLInputElement>(null);
  const revision = asset.revisions.find((entry) => entry.id === revisionId) ?? latest;
  const compare = compareId ? asset.revisions.find((entry) => entry.id === compareId) : undefined;

  if (!revision) return <p className="p-6 text-sm text-muted-foreground">This drawing has no file yet.</p>;
  const reviewable = isImage(revision.mimeType, revision.fileName) || isPdf(revision.mimeType, revision.fileName);

  const decide = async (decision: "approved" | "changes_requested") => {
    const comment = decision === "changes_requested" ? window.prompt("What needs to change? (also add pins on the drawing)") ?? undefined : undefined;
    if (decision === "changes_requested" && comment === undefined) return;
    setDeciding(true);
    const result = await decideRevision(studio.projectId, { revisionId: revision.id, decision, comment });
    setDeciding(false);
    if (!result.ok) { toast.error(result.error); return; }
    await studio.refreshAssets();
    toast.success(decision === "approved" ? `Rev ${revision.label} approved.` : `Changes requested on Rev ${revision.label}.`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5">
        <button type="button" onClick={onBack} aria-label="Back to drawings" className="flex size-9 items-center justify-center rounded-lg hover:bg-muted lg:hidden"><ChevronLeft className="size-4" /></button>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{asset.number} · {asset.title}</h3>
          <p className="truncate text-xs text-muted-foreground">Rev {revision.label} · {revision.fileName ?? "file"} · uploaded {when(revision.createdAt)}{revision.id !== latest?.id ? " · an earlier revision" : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Revisions">
          {asset.revisions.map((entry) => (
            <button key={entry.id} type="button" aria-pressed={entry.id === revision.id} onClick={() => setRevisionId(entry.id)} className={cn("min-h-8 rounded-md border px-2 text-xs font-medium", entry.id === revision.id ? "border-brand bg-brand/10 text-brand" : "hover:border-brand/50")}>
              {entry.label}{entry.status === "approved" ? " ✓" : entry.status === "revise_resubmit" ? " ↺" : ""}
            </button>
          ))}
          {asset.revisions.length > 1 ? (
            <select aria-label="Compare with" value={compareId ?? ""} onChange={(event) => setCompareId(event.target.value || null)} className="h-8 rounded-md border bg-background px-1.5 text-xs">
              <option value="">Compare…</option>
              {asset.revisions.filter((entry) => entry.id !== revision.id).map((entry) => <option key={entry.id} value={entry.id}>with Rev {entry.label}</option>)}
            </select>
          ) : null}
          {allowed.edit ? <button type="button" onClick={() => revisionInput.current?.click()} className="inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-xs hover:border-brand">{uploading ? <Loader2 className="size-3.5 animate-spin" /> : <FilePlus2 className="size-3.5" />}New revision</button> : null}
          {allowed.comment ? (
            <>
              <button type="button" disabled={deciding} onClick={() => void decide("approved")} className="inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-xs hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50"><ThumbsUp className="size-3.5" />Approve Rev {revision.label}</button>
              <button type="button" disabled={deciding} onClick={() => void decide("changes_requested")} className="inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-xs hover:border-amber-500 hover:text-amber-700 disabled:opacity-50"><Undo2 className="size-3.5" />Request changes</button>
            </>
          ) : null}
        </div>
        <input ref={revisionInput} type="file" accept={ACCEPT} className="hidden" onChange={(event) => { onUploadRevision(event.target.files); event.target.value = ""; }} />
      </header>
      {revision.status === "approved" ? <p className="flex items-center gap-1.5 border-b bg-emerald-500/10 px-3 py-1 text-xs text-emerald-800 dark:text-emerald-300"><Check className="size-3.5" />Rev {revision.label} is approved.</p> : revision.status === "revise_resubmit" ? <p className="border-b bg-amber-500/10 px-3 py-1 text-xs text-amber-900 dark:text-amber-300">Changes were requested on Rev {revision.label}.</p> : null}
      {reviewable ? (
        <div className={cn("grid min-h-0 flex-1", compare && "grid-rows-2 md:grid-cols-2 md:grid-rows-1")}>
          <Canvas key={revision.id} asset={asset} revision={revision} />
          {compare ? <div className="min-h-0 border-t md:border-l md:border-t-0"><Canvas key={compare.id} asset={asset} revision={compare} compact /></div> : null}
        </div>
      ) : (
        <Download revision={revision} />
      )}
    </div>
  );
}

function Download({ revision }: { revision: Revision }) {
  const url = useSignedUrl(revision.storagePath);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
      <FileText className="size-10 text-brand" />
      <p>{revision.fileName ?? "This file"} cannot be shown in the browser. Open it, or upload a PDF or image of it to review here.</p>
      {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-3 py-1.5 text-foreground hover:border-brand">Open file</a> : null}
    </div>
  );
}

/** One revision, with its pins and markup. */
function Canvas({ asset, revision, compact }: { asset: Asset; revision: Revision; compact?: boolean }) {
  const studio = useStudio();
  const allowed = useCan();
  const url = useSignedUrl(revision.storagePath);
  const pdf = isPdf(revision.mimeType, revision.fileName);
  const [page, setPage] = useState(() => studio.threads.find((thread) => thread.id === studio.openThreadId)?.page ?? 1);
  const [pages, setPages] = useState(1);
  const [picture, setPicture] = useState<{ src: string; width: number; height: number; key: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("pan");
  const [color, setColor] = useState<string>(MARK_COLORS[0]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [draft, setDraft] = useState<{ kind: Tool; points: number[] } | null>(null);
  const [composer, setComposer] = useState<{ x: number; y: number } | null>(null);
  const [selectedMark, setSelectedMark] = useState<string | null>(null);
  const [showEarlier, setShowEarlier] = useState(true);
  const { surfaceRef, ...viewport } = useViewport({ zoom: 1, x: 0, y: 0 });
  const fittedFor = useRef<string | null>(null);
  const pictureKey = `${revision.id}:${pdf ? page : 1}`;

  // The picture: an image as it is, or the PDF page rendered.
  useEffect(() => {
    if (!url) return;
    let live = true;
    (async () => {
      try {
        if (pdf) {
          const count = await pdfPageCount(url);
          const rendered = await renderPdfPage(url, Math.min(page, count), 2);
          if (live) { setPages(count); setPicture({ src: rendered.background.url, width: rendered.background.width, height: rendered.background.height, key: pictureKey }); }
        } else {
          const image = await loadImage(url);
          if (live) setPicture({ src: url, width: image.naturalWidth || 1000, height: image.naturalHeight || 750, key: pictureKey });
        }
      } catch {
        if (live) setFailed(pictureKey);
      }
    })();
    return () => { live = false; };
  }, [url, pdf, page, pictureKey]);

  const ready = picture?.key === pictureKey ? picture : null;
  const { fit } = viewport;
  useEffect(() => {
    if (ready && fittedFor.current !== ready.key) { fittedFor.current = ready.key; fit({ x: 0, y: 0, w: ready.width, h: ready.height }); }
  }, [ready, fit]);

  // Markup for this revision, kept live.
  useEffect(() => {
    let live = true;
    void readAnnotations(createClient(), revision.id).then((list) => { if (live) setAnnotations(list); });
    const off = studio.onAnnotation((annotation) => {
      if (annotation.revisionId !== revision.id) return;
      setAnnotations((list) => [...list.filter((entry) => entry.id !== annotation.id), annotation]);
    });
    return () => { live = false; off(); };
  }, [revision.id, studio]);

  const here = (thread: Thread) => thread.revisionId === revision.id && (thread.page ?? 1) === page;
  const pins = studio.threads.filter((thread) => thread.drawingId === asset.id && thread.anchorKind === "drawing" && here(thread));
  const earlier = showEarlier ? studio.threads.filter((thread) => thread.drawingId === asset.id && thread.anchorKind === "drawing" && thread.revisionId !== revision.id && !isClosed(thread.status) && (thread.page ?? 1) === page) : [];
  const marks = annotations.filter((mark) => (mark.page ?? 1) === page && !("archived" in mark && mark.archived));

  const W = ready?.width ?? 1;
  const H = ready?.height ?? 1;
  const toPage = (event: React.PointerEvent | React.MouseEvent) => { const p = viewport.world(event); return normalise(p, { width: W, height: H }); };

  const addMark = async (kind: Exclude<Tool, "pan" | "pin">, points: number[], text?: string) => {
    const geometry = kind === "pen" ? { points } : kind === "arrow" ? { points: points.slice(0, 2).concat(points.slice(-2)) }
      : kind === "text" ? { x: points[0], y: points[1], text: text ?? "" }
        : { x: Math.min(points[0]!, points.at(-2)!), y: Math.min(points[1]!, points.at(-1)!), w: Math.abs(points.at(-2)! - points[0]!), h: Math.abs(points.at(-1)! - points[1]!) };
    const id = crypto.randomUUID();
    const optimistic: Annotation = { id, drawingId: asset.id, revisionId: revision.id, page: pdf ? page : null, threadId: null, kind: kind === "pen" ? "freehand" : kind, geometry, style: { color, width: 3 }, revision: 1, createdBy: studio.me.id, createdAt: new Date().toISOString() };
    setAnnotations((list) => [...list, optimistic]);
    const result = await saveAnnotation(studio.projectId, { id, drawingId: asset.id, revisionId: revision.id, page: pdf ? page : null, kind: optimistic.kind, geometry, style: { color, width: 3 } });
    if (!result.ok) { toast.error(result.error); setAnnotations((list) => list.filter((entry) => entry.id !== id)); return; }
    setAnnotations((list) => list.map((entry) => (entry.id === id ? result.annotation : entry)));
  };
  const removeMark = async (mark: Annotation) => {
    setAnnotations((list) => list.filter((entry) => entry.id !== mark.id));
    setSelectedMark(null);
    const result = await saveAnnotation(studio.projectId, { id: mark.id, revision: mark.revision, drawingId: mark.drawingId, revisionId: mark.revisionId, page: mark.page, kind: mark.kind, geometry: mark.geometry, style: mark.style, archive: true });
    if (!result.ok) { toast.error(result.error); setAnnotations((list) => [...list, mark]); }
  };

  const tools: { value: Tool; label: string; icon: React.ReactNode }[] = [
    { value: "pan", label: "Pan and select", icon: <Hand className="size-4" /> },
    ...(allowed.comment ? [
      { value: "pin" as Tool, label: "Comment pin", icon: <MapPin className="size-4" /> },
      { value: "pen" as Tool, label: "Freehand markup", icon: <PenLine className="size-4" /> },
      { value: "arrow" as Tool, label: "Arrow", icon: <ArrowUpRight className="size-4" /> },
      { value: "rect" as Tool, label: "Rectangle", icon: <Square className="size-4" /> },
      { value: "ellipse" as Tool, label: "Circle", icon: <Circle className="size-4" /> },
      { value: "text" as Tool, label: "Text note", icon: <Type className="size-4" /> },
    ] : []),
  ];

  const v = viewport.view;
  return (
    <div className="relative flex h-full min-h-[18rem] flex-col">
      {!compact ? (
        <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1" role="toolbar" aria-label="Review tools">
          {tools.map((entry) => <ToolButton key={entry.value} label={entry.label} active={tool === entry.value} onClick={() => setTool(entry.value)}>{entry.icon}</ToolButton>)}
          {allowed.comment ? (
            <span className="ml-1 flex gap-1" role="group" aria-label="Markup colour">
              {MARK_COLORS.map((value) => <button key={value} type="button" aria-label={`Colour ${value}`} aria-pressed={color === value} onClick={() => setColor(value)} className={cn("size-6 rounded-full border-2", color === value ? "border-foreground" : "border-transparent")} style={{ background: value }} />)}
            </span>
          ) : null}
          <ToolButton label={showEarlier ? "Hide open comments from other revisions" : "Show open comments from other revisions"} active={showEarlier} onClick={() => setShowEarlier(!showEarlier)}>{showEarlier ? <Eye className="size-4" /> : <EyeOff className="size-4" />}</ToolButton>
          {selectedMark && (allowed.edit || annotations.find((mark) => mark.id === selectedMark)?.createdBy === studio.me.id) ? <ToolButton label="Delete markup" onClick={() => { const mark = annotations.find((entry) => entry.id === selectedMark); if (mark) void removeMark(mark); }}><Trash2 className="size-4 text-destructive" /></ToolButton> : null}
          {pdf && pages > 1 ? (
            <span className="ml-auto flex items-center gap-1 text-xs">
              <ToolButton label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></ToolButton>
              Page {page} of {pages}
              <ToolButton label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></ToolButton>
            </span>
          ) : null}
        </div>
      ) : <p className="border-b px-2 py-1 text-xs font-medium text-muted-foreground">Rev {revision.label}{revision.id === asset.currentRevisionId ? " (current)" : ""}</p>}

      <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/40">
        <div
          ref={surfaceRef}
          className={cn("absolute inset-0 touch-none", tool === "pan" ? "cursor-grab" : "cursor-crosshair")}
          aria-label={`${asset.title}, revision ${revision.label}${pdf ? `, page ${page}` : ""}`}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("[data-pin], [data-overlay]")) return;
            if (viewport.pointerDown(event)) { setDraft(null); return; }
            event.currentTarget.setPointerCapture(event.pointerId);
            setSelectedMark(null);
            if (!ready) return;
            const p = toPage(event);
            if (tool === "pan" || compact) { setDraft({ kind: "pan", points: [event.clientX, event.clientY] }); return; }
            if (tool === "pin") { setComposer(p); return; }
            if (tool === "text") { const text = window.prompt("Text"); if (text?.trim()) void addMark("text", [p.x, p.y], text.trim().slice(0, 500)); return; }
            setDraft({ kind: tool, points: [p.x, p.y] });
          }}
          onPointerMove={(event) => {
            if (viewport.pointerMove(event) || !draft) return;
            if (draft.kind === "pan") { viewport.pan(event.clientX - draft.points[0]!, event.clientY - draft.points[1]!); setDraft({ kind: "pan", points: [event.clientX, event.clientY] }); return; }
            const p = toPage(event);
            setDraft({ ...draft, points: draft.kind === "pen" ? [...draft.points, p.x, p.y] : [draft.points[0]!, draft.points[1]!, p.x, p.y] });
          }}
          onPointerUp={(event) => {
            viewport.pointerUp(event);
            const done = draft;
            setDraft(null);
            if (!done || done.kind === "pan" || done.points.length < 4) return;
            if (done.kind === "pen" || done.kind === "arrow" || done.kind === "rect" || done.kind === "ellipse") void addMark(done.kind, done.points.slice(0, 8000));
          }}
          onPointerCancel={(event) => { viewport.pointerUp(event); setDraft(null); }}
        >
          {!url || (!ready && failed !== pictureKey) ? <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Opening the drawing…</div> : null}
          {failed === pictureKey && !ready ? <div className="flex h-full items-center justify-center p-6 text-center text-sm text-destructive">This file could not be opened. It may be damaged, or the connection dropped.</div> : null}
          {ready ? (
            <svg className="absolute inset-0 size-full">
              <defs><marker id={`review-arrow-${revision.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke" /></marker></defs>
              <g transform={`translate(${v.x} ${v.y}) scale(${v.zoom})`}>
                <image href={ready.src} x={0} y={0} width={W} height={H} />
                {marks.map((mark) => <Mark key={mark.id} mark={mark} width={W} height={H} zoom={v.zoom} arrowId={`review-arrow-${revision.id}`} selected={selectedMark === mark.id} onSelect={() => setSelectedMark(mark.id)} />)}
                {draft && draft.kind !== "pan" ? <Mark mark={{ id: "draft", drawingId: asset.id, revisionId: revision.id, page, threadId: null, kind: draft.kind === "pen" ? "freehand" : draft.kind === "arrow" ? "arrow" : draft.kind === "ellipse" ? "ellipse" : "rect", geometry: draft.kind === "pen" ? { points: draft.points } : draft.kind === "arrow" ? { points: draft.points } : { x: Math.min(draft.points[0]!, draft.points[2] ?? draft.points[0]!), y: Math.min(draft.points[1]!, draft.points[3] ?? draft.points[1]!), w: Math.abs((draft.points[2] ?? draft.points[0]!) - draft.points[0]!), h: Math.abs((draft.points[3] ?? draft.points[1]!) - draft.points[1]!) }, style: { color }, revision: 1, createdBy: null, createdAt: "" }} width={W} height={H} zoom={v.zoom} arrowId={`review-arrow-${revision.id}`} /> : null}
              </g>
            </svg>
          ) : null}
          {ready ? [...earlier.map((thread) => ({ thread, ghost: true })), ...pins.map((thread) => ({ thread, ghost: false }))].map(({ thread, ghost }) => {
            const x = (thread.x ?? 0) * W * v.zoom + v.x;
            const y = (thread.y ?? 0) * H * v.zoom + v.y;
            const from = ghost ? asset.revisions.find((entry) => entry.id === thread.revisionId)?.label : null;
            return (
              <button
                key={`${thread.id}${ghost ? ":ghost" : ""}`}
                type="button"
                data-pin
                onClick={() => studio.openThread(thread.id)}
                aria-label={`${thread.number}${from ? ` from Rev ${from}` : ""}: ${thread.title ?? "comment"}`}
                title={`${thread.number}${from ? ` (from Rev ${from})` : ""} · ${thread.title ?? ""}`}
                className={cn("absolute z-10 flex size-7 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full rounded-bl-none border-2 border-white text-[10px] font-bold text-white shadow-md", ghost && "border-dashed opacity-70", studio.openThreadId === thread.id && "ring-2 ring-brand ring-offset-1")}
                style={{ left: x, top: y, background: ghost ? "#64748b" : pinColor(thread.status) }}
              >{thread.number.replace(/^C-0*/, "")}</button>
            );
          }) : null}
          {composer && ready ? <PinComposer at={{ x: composer.x * W * v.zoom + v.x, y: composer.y * H * v.zoom + v.y }} onCancel={() => setComposer(null)} onSubmit={async (body) => {
            const result = await openThread(studio.projectId, { anchorKind: "drawing", drawingId: asset.id, revisionId: revision.id, page: pdf ? page : null, x: composer.x, y: composer.y, body, mentions: mentionedIn(body, studio.members) });
            if (!result.ok) { toast.error(result.error); return false; }
            studio.upsertThread(result.thread);
            studio.openThread(result.thread.id);
            setComposer(null);
            setTool("pan");
            return true;
          }} /> : null}
        </div>
        <div data-overlay className="absolute bottom-2 right-2 z-20 flex items-center gap-0.5 rounded-xl border bg-card/95 p-1 shadow" role="group" aria-label="View">
          <ToolButton label="Zoom out" onClick={() => viewport.zoomBy(0.8)}><ZoomOut className="size-4" /></ToolButton>
          <span className="min-w-11 text-center text-xs tabular-nums">{Math.round(v.zoom * 100)}%</span>
          <ToolButton label="Zoom in" onClick={() => viewport.zoomBy(1.25)}><ZoomIn className="size-4" /></ToolButton>
          <ToolButton label="Fit drawing" onClick={() => ready && viewport.fit({ x: 0, y: 0, w: W, h: H })}><Maximize className="size-4" /></ToolButton>
        </div>
        {tool === "pin" && !composer ? <p data-overlay className="absolute left-2 top-2 z-20 rounded-lg bg-card/95 px-2 py-1 text-xs shadow">Tap the drawing where the comment is about.</p> : null}
      </div>
    </div>
  );
}

function Mark({ mark, width, height, zoom, arrowId, selected, onSelect }: { mark: Annotation; width: number; height: number; zoom: number; arrowId: string; selected?: boolean; onSelect?: () => void }) {
  const g = mark.geometry as { points?: number[]; x?: number; y?: number; w?: number; h?: number; text?: string };
  const stroke = mark.style.color ?? "#dc2626";
  const strokeWidth = (mark.style.width ?? 3) / Math.max(zoom, 0.2);
  const common = { stroke, strokeWidth, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, onPointerDown: onSelect ? (event: React.PointerEvent) => { event.stopPropagation(); onSelect(); } : undefined, style: { cursor: onSelect ? "pointer" : undefined }, opacity: selected ? 0.6 : 1 };
  const px = (values: number[]) => { const out: string[] = []; for (let i = 0; i + 1 < values.length; i += 2) out.push(`${values[i]! * width},${values[i + 1]! * height}`); return out.join(" "); };
  if (mark.kind === "freehand" || mark.kind === "line") return <polyline points={px(g.points ?? [])} {...common} />;
  if (mark.kind === "arrow") { const p = g.points ?? []; return <line x1={p[0]! * width} y1={p[1]! * height} x2={(p.at(-2) ?? p[0]!) * width} y2={(p.at(-1) ?? p[1]!) * height} markerEnd={`url(#${arrowId})`} {...common} />; }
  if (mark.kind === "rect") return <rect x={(g.x ?? 0) * width} y={(g.y ?? 0) * height} width={(g.w ?? 0) * width} height={(g.h ?? 0) * height} {...common} />;
  if (mark.kind === "ellipse") return <ellipse cx={((g.x ?? 0) + (g.w ?? 0) / 2) * width} cy={((g.y ?? 0) + (g.h ?? 0) / 2) * height} rx={((g.w ?? 0) / 2) * width} ry={((g.h ?? 0) / 2) * height} {...common} />;
  if (mark.kind === "text") return <text x={(g.x ?? 0) * width} y={(g.y ?? 0) * height} fill={stroke} fontSize={16 / Math.max(zoom, 0.2)} fontWeight={600} paintOrder="stroke" stroke="white" strokeWidth={3 / Math.max(zoom, 0.2)} onPointerDown={common.onPointerDown}>{g.text}</text>;
  return null;
}

function PinComposer({ at, onSubmit, onCancel }: { at: { x: number; y: number }; onSubmit: (body: string) => Promise<boolean>; onCancel: () => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const style = useMemo(() => ({ left: Math.max(8, at.x - 140), top: at.y + 8 }), [at.x, at.y]);
  return (
    <form data-overlay className="absolute z-30 w-72 max-w-[calc(100%-1rem)] space-y-2 rounded-xl border bg-card p-2 shadow-xl" style={style} onSubmit={async (event) => { event.preventDefault(); if (!body.trim()) return; setBusy(true); const ok = await onSubmit(body); setBusy(false); if (ok) setBody(""); }} aria-label="New comment on the drawing">
      <textarea autoFocus value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={4000} aria-label="Comment" placeholder="Change this finish to walnut…" className="w-full rounded-lg border bg-background p-2 text-sm" />
      <div className="flex justify-end gap-1">
        <button type="button" onClick={onCancel} aria-label="Cancel" className="flex size-9 items-center justify-center rounded-lg border"><X className="size-4" /></button>
        <button type="submit" disabled={busy || !body.trim()} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-foreground disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}Pin comment</button>
      </div>
    </form>
  );
}
