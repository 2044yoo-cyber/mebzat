"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, CheckSquare, Columns3, Copy, ExternalLink, FileText, GripVertical, ImagePlus, LayoutGrid,
  Link2, Loader2, Maximize, MessageSquare, MoreHorizontal, Pencil, Plus, Redo2, StickyNote, Trash2, Type, Undo2, ZoomIn, ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { between, bounds, visible } from "@/lib/collab/canvas-geometry";
import type { ItemStore } from "@/lib/collab/item-store";
import type { Board, Item } from "@/lib/collab/queries";
import { cn } from "@/lib/utils";

import { updateBoard } from "@/app/(dashboard)/agenda/projects/[projectId]/collaborate/actions";

import { CardEditor } from "./card-editor";
import { SaveStatus, ToolButton } from "./chrome";
import { ACCEPT, isImage, isPdf, uploadToStudio, useSignedUrl } from "./files";
import { useCan, useStudio } from "./studio-context";
import { useItems } from "./use-items";
import { useViewport } from "./use-viewport";

const CARD_KINDS = new Set(["text", "note", "image", "document", "link", "checklist", "section"]);

/**
 * A visual board, Milanote-style: cards of every kind, in columns or laid
 * out freely. Everything here is saved as it is changed — order, columns,
 * positions, sizes, words — and comes back exactly so.
 */
export function BoardView({ board, onDiscuss, onReview }: { board: Board; onDiscuss: (item: Item) => void; onReview: (drawingId: string) => void }) {
  const studio = useStudio();
  const allowed = useCan();
  const { store, items, status, loading, error, retryLoad } = useItems(board.id);
  const [editing, setEditing] = useState<Item | null>(null);
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null);
  const layout = board.layout;

  const columns = useMemo(() => items.filter((item) => item.kind === "column").sort((a, b) => a.z - b.z), [items]);
  const cardsIn = useMemo(() => {
    const map = new Map<string | null, Item[]>();
    const columnIds = new Set(columns.map((column) => column.id));
    for (const item of items) {
      if (!CARD_KINDS.has(item.kind)) continue;
      const key = item.parentId && columnIds.has(item.parentId) ? item.parentId : null;
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    for (const list of map.values()) list.sort((a, b) => a.z - b.z);
    return map;
  }, [items, columns]);
  const threadCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const thread of studio.threads) if (thread.itemId) map.set(thread.itemId, (map.get(thread.itemId) ?? 0) + 1);
    return map;
  }, [studio.threads]);

  if (error) return <div className="p-6 text-center text-sm"><p className="text-destructive">{error}</p><button type="button" onClick={retryLoad} className="mt-2 rounded-lg border px-3 py-1.5">Try again</button></div>;
  if (loading || !store) return <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Opening the board…</div>;

  const add = (kind: Item["kind"], data: Record<string, unknown>, parentId: string | null, extra: Partial<Item> = {}) => {
    const siblings = cardsIn.get(parentId) ?? [];
    const last = siblings.at(-1);
    const size = kind === "image" ? { w: 280, h: 200 } : kind === "checklist" ? { w: 260, h: 180 } : { w: 260, h: 140 };
    const created = store.create({ kind, data, parentId, z: between(last?.z ?? null, null), x: (last?.x ?? 40) + (layout === "free" ? 24 : 0), y: (last?.y ?? 40) + (layout === "free" ? 24 : 0), ...size, ...extra });
    if (kind !== "image" && kind !== "document") setEditing(created);
    return created;
  };
  const addColumn = () => {
    const last = columns.at(-1);
    const created = store.create({ kind: "column", data: { title: "New column" }, z: between(last?.z ?? null, null), x: (last?.x ?? -300) + 300, w: 280 });
    setEditing(created);
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    for (const file of [...files].slice(0, 10)) {
      const result = await uploadToStudio(studio.projectId, file);
      if (!result.ok) { toast.error(result.error); continue; }
      add(isImage(result.mimeType, result.fileName) ? "image" : "document", { title: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 200), fileName: result.fileName, mimeType: result.mimeType }, uploadTarget.current, { drawingId: result.drawingId });
    }
    setUploading(false);
    await studio.refreshAssets();
  };

  const setLayout = async (next: "free" | "columns") => {
    if (next === layout) return;
    const result = await updateBoard(studio.projectId, { id: board.id, revision: board.revision, layout: next });
    if (!result.ok) { toast.error(result.error); return; }
    studio.upsertBoard(result.board);
    // Cards that have never been placed freely are laid out from their columns.
    if (next === "free" && items.filter((item) => CARD_KINDS.has(item.kind)).every((item) => item.x === 0 && item.y === 0 || item.parentId)) {
      store.batch(() => {
        const order: (Item | null)[] = [...columns, null];
        order.forEach((column, columnIndex) => {
          let y = 80;
          for (const card of cardsIn.get(column?.id ?? null) ?? []) {
            store.update(card.id, { x: 40 + columnIndex * 300, y, w: card.w || 260, h: card.h || 140 });
            y += (card.h || 140) + 16;
          }
          if (column) store.update(column.id, { x: 30 + columnIndex * 300, y: 30, w: 280, h: Math.max(200, y - 30) });
        });
      });
    }
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1 border-b bg-card/80 px-2 py-1.5" role="toolbar" aria-label="Board tools">
      {allowed.edit ? (
        <>
          <ToolButton label="Add note" onClick={() => add("note", { title: "", text: "" }, null)}><StickyNote className="size-4" /></ToolButton>
          <ToolButton label="Add text" onClick={() => add("text", { text: "" }, null)}><Type className="size-4" /></ToolButton>
          <ToolButton label="Add checklist" onClick={() => add("checklist", { items: [] }, null)}><CheckSquare className="size-4" /></ToolButton>
          <ToolButton label="Add link" onClick={() => add("link", { url: "https://example.com", title: "" }, null)}><Link2 className="size-4" /></ToolButton>
          <ToolButton label="Upload images or documents" onClick={() => { uploadTarget.current = null; fileInput.current?.click(); }}>{uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}</ToolButton>
          <ToolButton label="Add from project files" onClick={() => setPicking(true)}><FileText className="size-4" /></ToolButton>
          <ToolButton label="Add column" onClick={addColumn}><Columns3 className="size-4" /></ToolButton>
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          <ToolButton label="Undo" shortcut="Ctrl+Z" disabled={!store.canUndo()} onClick={() => store.undo()}><Undo2 className="size-4" /></ToolButton>
          <ToolButton label="Redo" shortcut="Ctrl+Shift+Z" disabled={!store.canRedo()} onClick={() => store.redo()}><Redo2 className="size-4" /></ToolButton>
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          <div className="flex rounded-lg border p-0.5" role="group" aria-label="Layout">
            <button type="button" aria-pressed={layout === "columns"} onClick={() => void setLayout("columns")} className={cn("inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs", layout === "columns" && "bg-brand/15 font-semibold text-brand")}><Columns3 className="size-3.5" />Columns</button>
            <button type="button" aria-pressed={layout === "free"} onClick={() => void setLayout("free")} className={cn("inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs", layout === "free" && "bg-brand/15 font-semibold text-brand")}><LayoutGrid className="size-3.5" />Free</button>
          </div>
        </>
      ) : <span className="px-2 text-xs text-muted-foreground">{allowed.comment ? "You can comment on cards. Editing needs editor access." : "View only."}</span>}
      <span className="ml-auto"><SaveStatus status={status} onRetry={() => void store.retry()} /></span>
      <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(event) => { void upload(event.target.files); event.target.value = ""; }} />
    </div>
  );

  const cardProps = { store, onEdit: setEditing, onDiscuss, onReview, threadCount, columns, editable: allowed.edit, commentable: allowed.comment };

  return (
    <div className="flex h-full min-h-0 flex-col" onKeyDown={(event) => {
      if (!allowed.edit || (event.target as HTMLElement).closest("input, textarea, select")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) store.redo(); else store.undo(); }
    }}>
      {toolbar}
      {layout === "columns" ? (
        <ColumnsLayout cardsIn={cardsIn} onAddCard={(columnId) => add("note", { title: "", text: "" }, columnId)} onUpload={(columnId) => { uploadTarget.current = columnId; fileInput.current?.click(); }} {...cardProps} />
      ) : (
        <FreeLayout items={items.filter((item) => CARD_KINDS.has(item.kind) || item.kind === "column")} {...cardProps} />
      )}
      {editing ? <CardEditor item={store.get(editing.id) ?? editing} onSave={(data) => store.update(editing.id, { data })} onClose={() => setEditing(null)} /> : null}
      {picking ? <FilePicker onClose={() => setPicking(false)} onPick={(asset) => { add(isImage(asset.mime, asset.name) ? "image" : "document", { title: asset.title, fileName: asset.name ?? undefined, mimeType: asset.mime ?? undefined }, null, { drawingId: asset.id }); setPicking(false); }} /> : null}
    </div>
  );
}

type CardProps = {
  store: ItemStore;
  onEdit: (item: Item) => void;
  onDiscuss: (item: Item) => void;
  onReview: (drawingId: string) => void;
  threadCount: Map<string, number>;
  columns: Item[];
  editable: boolean;
  commentable: boolean;
};

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

function ColumnsLayout({ cardsIn, onAddCard, onUpload, ...props }: CardProps & { cardsIn: Map<string | null, Item[]>; onAddCard: (columnId: string | null) => void; onUpload: (columnId: string | null) => void }) {
  const { store, editable, columns } = props;
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; target: { column: string | null; before: string | null } | null } | null>(null);
  const unsorted = cardsIn.get(null) ?? [];
  const lists: { column: Item | null; cards: Item[] }[] = [...columns.map((column) => ({ column, cards: cardsIn.get(column.id) ?? [] })), ...(unsorted.length || !columns.length ? [{ column: null, cards: unsorted }] : [])];

  /** Where a dragged card would land: which column, before which card. */
  const targetAt = (x: number, y: number, dragged: string) => {
    const element = document.elementsFromPoint(x, y).find((node) => (node as HTMLElement).dataset?.dropColumn !== undefined) as HTMLElement | undefined;
    if (!element) return null;
    const column = element.dataset.dropColumn || null;
    const cards = [...element.querySelectorAll<HTMLElement>("[data-card]")].filter((node) => node.dataset.card !== dragged);
    const before = cards.find((node) => { const rect = node.getBoundingClientRect(); return y < rect.top + rect.height / 2; })?.dataset.card ?? null;
    return { column, before };
  };
  const drop = (id: string, target: { column: string | null; before: string | null }) => {
    const list = (target.column ? cardsIn.get(target.column) : cardsIn.get(null))?.filter((card) => card.id !== id) ?? [];
    const index = target.before ? list.findIndex((card) => card.id === target.before) : list.length;
    const z = between(list[index - 1]?.z ?? null, list[index]?.z ?? null);
    store.update(id, { parentId: target.column, z });
  };
  const moveColumn = (column: Item, direction: -1 | 1) => {
    const index = columns.findIndex((entry) => entry.id === column.id);
    const neighbour = columns[index + direction];
    if (!neighbour) return;
    const beyond = columns[index + direction * 2];
    store.update(column.id, { z: direction > 0 ? between(neighbour.z, beyond?.z ?? null) : between(beyond?.z ?? null, neighbour.z) });
  };

  return (
    <div className="flex min-h-0 flex-1 snap-x gap-3 overflow-x-auto overflow-y-hidden p-3" aria-label="Columns">
      {lists.map(({ column, cards }) => (
        <section key={column?.id ?? "unsorted"} aria-label={column ? String(column.data.title ?? "Column") : "Unsorted"} className="flex max-h-full w-[min(85vw,18rem)] shrink-0 snap-start flex-col rounded-xl border bg-muted/30" style={column?.data.color ? { background: `${column.data.color as string}55` } : undefined}>
          <header className="flex items-center gap-1 px-2 py-2">
            <h3 className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{column ? String(column.data.title || "Untitled") : "Unsorted"}<span className="ml-1.5 text-xs font-normal text-muted-foreground">{cards.length}</span></h3>
            {column && editable ? (
              <Menu label={`Column ${String(column.data.title ?? "")}`} items={[
                { label: "Rename", icon: Pencil, run: () => props.onEdit(column) },
                { label: "Move left", icon: ArrowUp, run: () => moveColumn(column, -1) },
                { label: "Move right", icon: ArrowDown, run: () => moveColumn(column, 1) },
                { label: "Delete column (cards stay)", icon: Trash2, run: () => { store.batch(() => { for (const card of cards) store.update(card.id, { parentId: null }); store.archive(column.id); }); } },
              ]} />
            ) : null}
          </header>
          <ol data-drop-column={column?.id ?? ""} className={cn("min-h-16 flex-1 space-y-2 overflow-y-auto px-2 pb-2", drag?.target?.column === (column?.id ?? null) && "rounded-lg bg-brand/5 outline-2 outline-dashed outline-brand/40")}>
            {cards.map((card) => (
              <li key={card.id} data-card={card.id} className={cn(drag?.target?.before === card.id && "border-t-2 border-brand pt-1", drag?.id === card.id && "opacity-40")}>
                <Card item={card} {...props} grip={editable ? (
                  <button
                    type="button"
                    aria-label="Drag to move"
                    className="flex size-7 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
                    onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: card.id, x: event.clientX, y: event.clientY, target: null }); }}
                    onPointerMove={(event) => { if (drag?.id === card.id) setDrag({ ...drag, x: event.clientX, y: event.clientY, target: targetAt(event.clientX, event.clientY, card.id) }); }}
                    onPointerUp={() => { if (drag?.id === card.id && drag.target) drop(card.id, drag.target); setDrag(null); }}
                    onPointerCancel={() => setDrag(null)}
                  ><GripVertical className="size-4" /></button>
                ) : null} menuExtra={editable ? [
                  { label: "Move up", icon: ArrowUp, run: () => { const index = cards.indexOf(card); if (index > 0) store.update(card.id, { z: between(cards[index - 2]?.z ?? null, cards[index - 1]!.z) }); } },
                  { label: "Move down", icon: ArrowDown, run: () => { const index = cards.indexOf(card); if (index < cards.length - 1) store.update(card.id, { z: between(cards[index + 1]!.z, cards[index + 2]?.z ?? null) }); } },
                  ...props.columns.filter((entry) => entry.id !== column?.id).map((entry) => ({ label: `Move to ${String(entry.data.title || "column")}`, icon: Columns3, run: () => store.update(card.id, { parentId: entry.id, z: between((cardsIn.get(entry.id) ?? []).at(-1)?.z ?? null, null) }) })),
                  ...(column ? [{ label: "Move to Unsorted", icon: Columns3, run: () => store.update(card.id, { parentId: null }) }] : []),
                ] : []} />
              </li>
            ))}
          </ol>
          {editable ? (
            <div className="flex gap-1 border-t p-1.5">
              <button type="button" onClick={() => onAddCard(column?.id ?? null)} className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><Plus className="size-3.5" />Card</button>
              <button type="button" onClick={() => onUpload(column?.id ?? null)} className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><ImagePlus className="size-3.5" />Upload</button>
            </div>
          ) : null}
        </section>
      ))}
      {!lists.length ? <p className="m-auto text-sm text-muted-foreground">An empty board. Add a column or a card.</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Free layout
// ---------------------------------------------------------------------------

function FreeLayout({ items, ...props }: CardProps & { items: Item[] }) {
  const { store, editable } = props;
  const { surfaceRef, ...viewport } = useViewport({ zoom: 1, x: 0, y: 0 });
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "resize"; start: { x: number; y: number }; origin: Item } | null>(null);
  const shown = visible(items, viewport.view, viewport.size, 300);
  const content = () => { const boxes = items.map(bounds); if (!boxes.length) return null; const x = Math.min(...boxes.map((b) => b.x)); const y = Math.min(...boxes.map((b) => b.y)); return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y }; };
  const [panning, setPanning] = useState<{ x: number; y: number } | null>(null);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle,_var(--border)_1px,_transparent_1px)] [background-size:24px_24px]">
      <div
        ref={surfaceRef}
        className="absolute inset-0 touch-none"
        onPointerDown={(event) => {
          if (viewport.pointerDown(event)) { setDrag(null); setPanning(null); return; }
          if (event.target === event.currentTarget) { event.currentTarget.setPointerCapture(event.pointerId); setPanning({ x: event.clientX, y: event.clientY }); }
        }}
        onPointerMove={(event) => {
          if (viewport.pointerMove(event)) return;
          if (panning) { viewport.pan(event.clientX - panning.x, event.clientY - panning.y); setPanning({ x: event.clientX, y: event.clientY }); return; }
          if (!drag) return;
          const dx = (event.clientX - drag.start.x) / viewport.view.zoom;
          const dy = (event.clientY - drag.start.y) / viewport.view.zoom;
          if (drag.mode === "move") store.update(drag.id, { x: Math.round(drag.origin.x + dx), y: Math.round(drag.origin.y + dy) });
          else store.update(drag.id, { w: Math.max(140, Math.round(drag.origin.w + dx)), h: Math.max(80, Math.round(drag.origin.h + dy)) });
        }}
        onPointerUp={(event) => { viewport.pointerUp(event); setPanning(null); if (drag) { setDrag(null); } }}
        onPointerCancel={(event) => { viewport.pointerUp(event); setPanning(null); setDrag(null); }}
      >
        <div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${viewport.view.x}px, ${viewport.view.y}px) scale(${viewport.view.zoom})` }}>
          {shown.map((item) => (
            <div key={item.id} className="pointer-events-auto absolute" style={{ left: item.x, top: item.y, width: item.w || 260, height: item.kind === "column" ? item.h || 300 : undefined, zIndex: item.kind === "column" ? 0 : 1 }}>
              {item.kind === "column" ? (
                <div className="h-full rounded-2xl border-2 border-dashed bg-muted/20 p-2 text-sm font-semibold text-muted-foreground" style={item.data.color ? { background: `${item.data.color as string}44` } : undefined}>
                  <div className={cn("flex items-center gap-1", editable && "cursor-move touch-none")} onPointerDown={editable ? (event) => { event.stopPropagation(); if (viewport.pointerDown(event)) return; event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: item.id, mode: "move", start: { x: event.clientX, y: event.clientY }, origin: item }); } : undefined}>
                    {String(item.data.title || "Section")}
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <Card item={item} {...props} grip={editable ? (
                    <span aria-label="Drag to move" role="button" tabIndex={-1} className="flex size-7 cursor-move touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted" onPointerDown={(event) => { event.stopPropagation(); if (viewport.pointerDown(event)) return; event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: item.id, mode: "move", start: { x: event.clientX, y: event.clientY }, origin: item }); }}><GripVertical className="size-4" /></span>
                  ) : null} menuExtra={[]} />
                  {editable ? <span aria-label="Resize" role="button" tabIndex={-1} className="absolute -bottom-1 -right-1 size-4 cursor-nwse-resize touch-none rounded-sm border-2 border-brand bg-card" onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: item.id, mode: "resize", start: { x: event.clientX, y: event.clientY }, origin: item }); }} /> : null}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-3 right-3 flex gap-1 rounded-xl border bg-card/95 p-1 shadow" role="group" aria-label="View">
        <ToolButton label="Zoom out" onClick={() => viewport.zoomBy(1 / 1.25)}><ZoomOut className="size-4" /></ToolButton>
        <span className="flex min-w-12 items-center justify-center text-xs tabular-nums">{Math.round(viewport.view.zoom * 100)}%</span>
        <ToolButton label="Zoom in" onClick={() => viewport.zoomBy(1.25)}><ZoomIn className="size-4" /></ToolButton>
        <ToolButton label="Fit to content" onClick={() => viewport.fit(content())}><Maximize className="size-4" /></ToolButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A card
// ---------------------------------------------------------------------------

function Card({ item, store, onEdit, onDiscuss, onReview, threadCount, editable, commentable, grip, menuExtra }: CardProps & { item: Item; grip: React.ReactNode; menuExtra: MenuItem[] }) {
  const studio = useStudio();
  const data = item.data;
  const asset = item.drawingId ? studio.assets.find((entry) => entry.id === item.drawingId) : undefined;
  const revision = asset ? asset.revisions.find((entry) => entry.id === asset.currentRevisionId) ?? asset.revisions.at(-1) : undefined;
  const url = useSignedUrl(revision?.storagePath ?? item.storagePath);
  const labels = (data.labels as string[] | undefined) ?? [];
  const comments = threadCount.get(item.id) ?? 0;

  return (
    <article aria-label={String(data.title || data.text || item.kind).slice(0, 60)} className="group rounded-xl border bg-card shadow-sm" style={data.color ? { background: data.color as string } : undefined}>
      <div className="flex items-center gap-0.5 px-1 pt-1">
        {grip}
        <span className="min-w-0 flex-1" />
        {commentable || comments ? <button type="button" onClick={() => onDiscuss(item)} aria-label={`Comments (${comments})`} className="inline-flex h-7 items-center gap-0.5 rounded px-1.5 text-xs text-muted-foreground hover:bg-muted"><MessageSquare className="size-3.5" />{comments || null}</button> : null}
        {editable ? <Menu label="Card" items={[
          { label: "Edit", icon: Pencil, run: () => onEdit(item) },
          { label: "Duplicate", icon: Copy, run: () => store.create({ kind: item.kind, data: item.data, parentId: item.parentId, drawingId: item.drawingId, storagePath: item.storagePath, x: item.x + 24, y: item.y + 24, w: item.w, h: item.h, z: item.z + 0.001 }) },
          ...menuExtra,
          { label: "Delete", icon: Trash2, run: () => store.archive(item.id) },
        ]} /> : null}
      </div>
      <div className="space-y-1.5 px-3 pb-3" onDoubleClick={editable ? () => onEdit(item) : undefined}>
        {item.kind === "image" ? (
          <button type="button" onClick={() => item.drawingId && onReview(item.drawingId)} className="block w-full overflow-hidden rounded-lg bg-muted" aria-label="Open in review">
            {/* eslint-disable-next-line @next/next/no-img-element -- a private file through a short-lived signed link */}
            {url ? <img src={url} alt={String(data.title ?? "")} className="max-h-72 w-full object-contain" loading="lazy" draggable={false} /> : <span className="flex h-32 items-center justify-center text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /></span>}
          </button>
        ) : null}
        {item.kind === "document" ? (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
            <FileText className="size-6 shrink-0 text-brand" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm">{String(data.fileName ?? data.title ?? "Document")}</span>
            {item.drawingId && isPdf(String(data.mimeType ?? ""), String(data.fileName ?? "")) ? <button type="button" onClick={() => onReview(item.drawingId!)} className="text-xs font-medium text-brand">Review</button> : null}
            {url ? <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open file" className="text-muted-foreground hover:text-foreground"><ExternalLink className="size-4" /></a> : null}
          </div>
        ) : null}
        {data.title && item.kind !== "column" ? <h4 className="break-words font-semibold leading-snug">{String(data.title)}</h4> : null}
        {item.kind === "text" ? <p className="whitespace-pre-wrap break-words text-base font-medium">{String(data.text || "Text")}</p> : null}
        {item.kind === "note" && data.text ? <p className="whitespace-pre-wrap break-words text-sm">{String(data.text)}</p> : null}
        {item.kind === "link" ? (
          <a href={String(data.url)} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1.5 break-all text-sm text-brand hover:underline"><Link2 className="size-3.5 shrink-0" />{String(data.url).replace(/^https?:\/\//, "")}</a>
        ) : null}
        {item.kind === "checklist" ? (
          <ul className="space-y-1">
            {((data.items as { id: string; text: string; done: boolean }[] | undefined) ?? []).map((line) => (
              <li key={line.id}>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={line.done} disabled={!editable} onChange={(event) => store.update(item.id, { data: { ...data, items: ((data.items as { id: string; text: string; done: boolean }[]) ?? []).map((entry) => (entry.id === line.id ? { ...entry, done: event.target.checked } : entry)) } })} className="mt-0.5 size-4" />
                  <span className={cn(line.done && "text-muted-foreground line-through")}>{line.text}</span>
                </label>
              </li>
            ))}
            {!((data.items as unknown[] | undefined) ?? []).length ? <li className="text-xs text-muted-foreground">No items yet.</li> : null}
          </ul>
        ) : null}
        {data.caption ? <p className="text-xs text-muted-foreground">{String(data.caption)}</p> : null}
        {data.description ? <p className="whitespace-pre-wrap text-xs text-muted-foreground">{String(data.description)}</p> : null}
        {labels.length ? <ul className="flex flex-wrap gap-1" aria-label="Labels">{labels.map((label) => <li key={label} className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">{label}</li>)}</ul> : null}
      </div>
    </article>
  );
}

type MenuItem = { label: string; icon: React.ComponentType<{ className?: string }>; run: () => void };

function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" aria-label={`${label} actions`} aria-expanded={open} onClick={() => setOpen(!open)} className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"><MoreHorizontal className="size-4" /></button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <ul role="menu" className="absolute right-0 top-full z-40 mt-1 w-52 rounded-xl border bg-popover p-1 shadow-xl">
            {items.map((entry) => (
              <li key={entry.label}><button type="button" role="menuitem" onClick={() => { setOpen(false); entry.run(); }} className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted", entry.label.startsWith("Delete") && "text-destructive")}><entry.icon className="size-4" />{entry.label}</button></li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function FilePicker({ onPick, onClose }: { onPick: (asset: { id: string; title: string; name: string | null; mime: string | null }) => void; onClose: () => void }) {
  const studio = useStudio();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Project files">
      <div className="max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-2 flex items-center"><h3 className="flex-1 font-semibold">Project files</h3><button type="button" onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm">Close</button></div>
        {studio.assets.length ? (
          <ul className="divide-y rounded-xl border">
            {studio.assets.map((asset) => { const current = asset.revisions.find((entry) => entry.id === asset.currentRevisionId) ?? asset.revisions.at(-1); return (
              <li key={asset.id}><button type="button" onClick={() => onPick({ id: asset.id, title: asset.title, name: current?.fileName ?? null, mime: current?.mimeType ?? null })} className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/50"><FileText className="size-4 text-brand" /><span className="min-w-0 flex-1 truncate text-sm">{asset.number} · {asset.title}</span><span className="text-xs text-muted-foreground">Rev {current?.label ?? "–"}</span></button></li>
            ); })}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No files on this project yet. Upload one from the board or the Review tab.</p>}
      </div>
    </div>
  );
}
