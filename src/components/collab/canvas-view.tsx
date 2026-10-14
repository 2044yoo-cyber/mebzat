"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical,
  ArrowUpRight, BringToFront, Circle, Copy, Grid3X3, Group, Hand, ImagePlus, Loader2, Magnet, Maximize, MessageSquare,
  Minus, MousePointer2, PenLine, Redo2, RotateCcw, SendToBack, Spline, Square, StickyNote, Trash2, Type, Undo2, Ungroup, ZoomIn, ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import {
  align, between, bounds, connectorEnds, distribute, handlePoint, HANDLES, hit, resize, rotationTowards, segmentDistance, snap,
  toScreen, union, visible, type Alignment, type Box, type Handle, type Point, type Shape,
} from "@/lib/collab/canvas-geometry";
import { COLORS, INKS, type ItemKind } from "@/lib/collab/model";
import type { Board, Item } from "@/lib/collab/queries";
import { cn } from "@/lib/utils";

import { updateBoard } from "@/app/(dashboard)/agenda/projects/[projectId]/collaborate/actions";

import { personColor, SaveStatus, ToolButton } from "./chrome";
import { ACCEPT, isImage, uploadToStudio, useSignedUrl } from "./files";
import { useCan, useStudio } from "./studio-context";
import { useItems } from "./use-items";
import { useViewport } from "./use-viewport";

type Tool = "select" | "hand" | "sticky" | "text" | "rect" | "ellipse" | "line" | "arrow" | "pen" | "connector";

type Gesture =
  | { kind: "move"; start: Point; origins: Map<string, Item>; moved: boolean }
  | { kind: "resize"; id: string; handle: Handle; origin: Item }
  | { kind: "rotate"; id: string; origin: Item }
  | { kind: "marquee"; start: Point; current: Point }
  | { kind: "pan"; last: { x: number; y: number } }
  | { kind: "draw"; tool: "rect" | "ellipse" | "sticky" | "text" | "line" | "arrow"; start: Point; current: Point }
  | { kind: "pen"; points: number[] };

const GRID = 20;
let clipboard: Item[] = [];

/**
 * The infinite canvas, Miro-style.
 *
 * Objects are in world units and drawn through the view's one transform, so
 * zooming, panning, a different screen or reopening the canvas never moves
 * anything. Only objects in view are drawn. On a touch screen a finger on an
 * object that is not selected pans, so scrolling past a sticky note does not
 * drag it; tap it first to select it, then drag.
 */
export function CanvasView({ board, onDiscuss }: { board: Board; onDiscuss: (item: Item) => void }) {
  const studio = useStudio();
  const allowed = useCan();
  const { store, items, status, loading, error, retryLoad } = useItems(board.id);
  const { surfaceRef, ...viewport } = useViewport({ zoom: 1, x: 80, y: 80 });
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [ink, setInk] = useState<string>(INKS[0]);
  const [fill, setFill] = useState<string>(COLORS[0]);
  const [width, setWidth] = useState(3);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const settings = { grid: board.settings.grid ?? true, snap: board.settings.snap ?? false };
  const editable = allowed.edit;
  const fitted = useRef(false);

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const shapes = useMemo(() => items.filter((item) => item.kind !== "connector"), [items]);
  const connectors = useMemo(() => items.filter((item) => item.kind === "connector"), [items]);
  const shown = visible(shapes.filter((item) => item.kind !== "group"), viewport.view, viewport.size, 200);
  const shownIds = new Set(shown.map((item) => item.id));
  const groups = shapes.filter((item) => item.kind === "group");

  // Open on what is there.
  useEffect(() => {
    if (fitted.current || !store) return;
    fitted.current = true;
    const area = union(shapes.map(bounds));
    if (area) viewport.fit(area);
  }, [store, shapes, viewport]);

  /** A click on a grouped object selects its group. */
  const top = (id: string) => {
    let current = byId.get(id);
    while (current?.parentId && byId.get(current.parentId)?.kind === "group") current = byId.get(current.parentId);
    return current?.id ?? id;
  };
  const childrenOf = useMemo(() => {
    const direct = new Map<string, Item[]>();
    for (const item of items) if (item.parentId) direct.set(item.parentId, [...(direct.get(item.parentId) ?? []), item]);
    const all = (id: string, seen = new Set<string>()): Item[] => (direct.get(id) ?? []).flatMap((child) => (seen.has(child.id) ? [] : (seen.add(child.id), [child, ...all(child.id, seen)])));
    return (id: string) => all(id);
  }, [items]);

  const pick = (point: Point): Item | null => {
    const slack = 6 / viewport.view.zoom;
    for (let index = shapes.length - 1; index >= 0; index -= 1) {
      const item = shapes[index]!;
      if (item.kind === "group") continue;
      if ((item.kind === "line" || item.kind === "arrow" || item.kind === "freehand")) {
        const local = localPoints(item);
        for (let p = 0; p < local.length - 1; p += 1) if (segmentDistance(point, local[p]!, local[p + 1]!) <= Math.max(slack, (Number(item.data.strokeWidth) || 3) / 2 + slack)) return item;
        continue;
      }
      if (hit(item, point, slack)) return item;
    }
    for (const item of connectors) {
      const ends = connectorPoints(item, byId);
      if (ends && segmentDistance(point, ends[0], ends[1]) <= slack * 1.5) return item;
    }
    return null;
  };

  // Collaborators' cursors on this canvas.
  const cursors = studio.presence.filter((person) => person.boardId === board.id && person.cursor);
  const { announce } = studio;
  useEffect(() => { announce({ tab: "canvas", boardId: board.id }); return () => announce({ boardId: null, cursor: null }); }, [announce, board.id]);

  if (error) return <div className="p-6 text-center text-sm"><p className="text-destructive">{error}</p><button type="button" onClick={retryLoad} className="mt-2 rounded-lg border px-3 py-1.5">Try again</button></div>;
  if (loading || !store) return <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Opening the canvas…</div>;

  const selection = [...selected].map((id) => byId.get(id)).filter((item): item is Item => Boolean(item));
  const snapTo = (value: number) => (settings.snap ? snap(value, GRID) : value);

  const create = (kind: ItemKind, box: Box, data: Record<string, unknown>, extra: Partial<Item> = {}) => {
    const item = store.create({ kind, x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h), data, ...extra });
    setSelected(new Set([item.id]));
    setTool("select");
    return item;
  };

  const setSetting = async (patch: { grid?: boolean; snap?: boolean }) => {
    const result = await updateBoard(studio.projectId, { id: board.id, revision: board.revision, settings: { ...board.settings, ...patch } });
    if (!result.ok) toast.error(result.error); else studio.upsertBoard(result.board);
  };

  const deleteSelection = () => {
    if (!selection.length) return;
    store.batch(() => {
      for (const item of selection) {
        for (const child of childrenOf(item.id)) store.archive(child.id);
        store.archive(item.id);
      }
      // A connector to nothing is removed with what it joined.
      for (const connector of connectors) if (selected.has(String(connector.data.from)) || selected.has(String(connector.data.to))) store.archive(connector.id);
    });
    setSelected(new Set());
  };

  const copy = () => { clipboard = selection.flatMap((item) => [item, ...childrenOf(item.id)]).concat(connectors.filter((c) => selected.has(String(c.data.from)) && selected.has(String(c.data.to)))); };
  const paste = (offset = 24) => {
    if (!clipboard.length) return;
    const ids = new Map(clipboard.map((item) => [item.id, crypto.randomUUID()]));
    const made: string[] = [];
    store.batch(() => {
      const ordered = [...clipboard].sort((a, b) => Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)));
      for (const item of ordered) {
        const data = item.kind === "connector" ? { ...item.data, from: ids.get(String(item.data.from)), to: ids.get(String(item.data.to)) } : item.data;
        if (item.kind === "connector" && (!data.from || !data.to)) continue;
        store.create({ id: ids.get(item.id), kind: item.kind, x: item.x + offset, y: item.y + offset, w: item.w, h: item.h, rotation: item.rotation, data, parentId: item.parentId ? ids.get(item.parentId) ?? null : null, drawingId: item.drawingId, storagePath: item.storagePath });
        if (!item.parentId || !ids.has(item.parentId)) made.push(ids.get(item.id)!);
      }
    });
    setSelected(new Set(made));
  };

  const groupSelection = () => {
    const roots = selection.filter((item) => item.kind !== "connector");
    if (roots.length < 2) return;
    const area = union(roots.map(bounds))!;
    store.batch(() => {
      const group = store.create({ kind: "group", x: area.x, y: area.y, w: area.w, h: area.h, data: {} });
      for (const item of roots) store.update(item.id, { parentId: group.id });
      setSelected(new Set([group.id]));
    });
  };
  const ungroupSelection = () => {
    store.batch(() => {
      const freed: string[] = [];
      for (const item of selection.filter((entry) => entry.kind === "group")) {
        for (const child of items.filter((entry) => entry.parentId === item.id)) { store.update(child.id, { parentId: null }); freed.push(child.id); }
        store.archive(item.id);
      }
      setSelected(new Set(freed));
    });
  };
  const arrange = (how: Alignment | "x" | "y") => {
    const shapesOnly = selection.filter((item) => item.kind !== "connector");
    const moves = how === "x" || how === "y" ? distribute(shapesOnly, how) : align(shapesOnly, how);
    store.batch(() => { for (const [id, point] of moves) moveWithChildren(id, point.x - byId.get(id)!.x, point.y - byId.get(id)!.y); });
  };
  const order = (front: boolean) => {
    const zs = items.map((item) => item.z);
    store.batch(() => {
      let edge = front ? Math.max(...zs) : Math.min(...zs);
      for (const item of selection) { edge = front ? between(edge, null) : between(null, edge); store.update(item.id, { z: edge }); }
    });
  };
  const moveWithChildren = (id: string, dx: number, dy: number, origins?: Map<string, Item>) => {
    const origin = origins?.get(id) ?? byId.get(id);
    if (!origin) return;
    store.update(id, { x: origin.x + dx, y: origin.y + dy });
    for (const child of childrenOf(id)) {
      const childOrigin = origins?.get(child.id) ?? child;
      store.update(child.id, { x: childOrigin.x + dx, y: childOrigin.y + dy });
    }
  };

  const upload = async (files: FileList | null, at?: Point) => {
    if (!files?.length) return;
    setUploading(true);
    let x = at?.x ?? (viewport.size.width / 2 - viewport.view.x) / viewport.view.zoom;
    const y = at?.y ?? (viewport.size.height / 2 - viewport.view.y) / viewport.view.zoom;
    for (const file of [...files].slice(0, 10)) {
      const result = await uploadToStudio(studio.projectId, file);
      if (!result.ok) { toast.error(result.error); continue; }
      const image = isImage(result.mimeType, result.fileName);
      let size = { w: 360, h: image ? 270 : 120 };
      if (image) {
        const natural = await naturalSize(file);
        if (natural) { const scale = Math.min(1, 480 / Math.max(natural.w, natural.h)); size = { w: Math.round(natural.w * scale), h: Math.round(natural.h * scale) }; }
      }
      create(image ? "image" : "document", { x, y, ...size }, { title: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 200), fileName: result.fileName, mimeType: result.mimeType }, { drawingId: result.drawingId });
      x += size.w + 24;
    }
    setUploading(false);
    await studio.refreshAssets();
  };

  // -------------------------------------------------------------------------
  // Pointer
  // -------------------------------------------------------------------------

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-overlay]")) return;
    if (viewport.pointerDown(event)) {
      // A second finger: this is a pinch, so whatever the first finger began
      // moving goes back where it was.
      if (gesture?.kind === "move" || gesture?.kind === "resize" || gesture?.kind === "rotate") store.cancelStep(); else store.endStep();
      setGesture(null);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = viewport.world(event);
    const touch = event.pointerType === "touch";
    if (tool === "hand" || event.button === 1 || (event.button === 0 && event.altKey)) { setGesture({ kind: "pan", last: { x: event.clientX, y: event.clientY } }); return; }
    if (editable && tool === "pen") { setGesture({ kind: "pen", points: [point.x, point.y] }); return; }
    if (editable && (tool === "rect" || tool === "ellipse" || tool === "sticky" || tool === "text" || tool === "line" || tool === "arrow")) { setGesture({ kind: "draw", tool, start: point, current: point }); return; }
    if (editable && tool === "connector") {
      const target = pick(point);
      if (!target || target.kind === "connector") { setConnectFrom(null); return; }
      const id = top(target.id);
      if (!connectFrom) { setConnectFrom(id); return; }
      if (id !== connectFrom) create("connector", { x: 0, y: 0, w: 0, h: 0 }, { from: connectFrom, to: id, arrow: true, stroke: ink, strokeWidth: 2 });
      setConnectFrom(null);
      return;
    }
    // Select.
    const handle = (event.target as Element).getAttribute?.("data-handle");
    if (editable && handle && selection.length === 1) {
      const origin = selection[0]!;
      store.beginStep();
      setGesture(handle === "rotate" ? { kind: "rotate", id: origin.id, origin } : { kind: "resize", id: origin.id, handle: handle as Handle, origin });
      return;
    }
    const target = pick(point);
    if (!target) {
      if (!event.shiftKey) setSelected(new Set());
      setGesture(touch ? { kind: "pan", last: { x: event.clientX, y: event.clientY } } : { kind: "marquee", start: point, current: point });
      return;
    }
    const id = top(target.id);
    if (touch && !selected.has(id)) {
      // A finger on something not selected: select it, and let the drag pan.
      setSelected(new Set([id]));
      setGesture({ kind: "pan", last: { x: event.clientX, y: event.clientY } });
      return;
    }
    const next = event.shiftKey ? new Set(selected) : selected.has(id) ? new Set(selected) : new Set<string>();
    if (event.shiftKey && selected.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
    if (!editable) return;
    const origins = new Map<string, Item>();
    for (const chosen of next) { const item = byId.get(chosen); if (item) { origins.set(chosen, item); for (const child of childrenOf(chosen)) origins.set(child.id, child); } }
    store.beginStep();
    setGesture({ kind: "move", start: point, origins, moved: false });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = viewport.world(event);
    announce({ cursor: point });
    if (viewport.pointerMove(event) || !gesture) return;
    if (gesture.kind === "pan") { viewport.pan(event.clientX - gesture.last.x, event.clientY - gesture.last.y); setGesture({ ...gesture, last: { x: event.clientX, y: event.clientY } }); return; }
    if (gesture.kind === "marquee" || gesture.kind === "draw") { setGesture({ ...gesture, current: point }); return; }
    if (gesture.kind === "pen") { const last = gesture.points.slice(-2); if (Math.hypot(point.x - last[0]!, point.y - last[1]!) * viewport.view.zoom > 2) setGesture({ ...gesture, points: [...gesture.points, point.x, point.y] }); return; }
    if (gesture.kind === "move") {
      let dx = point.x - gesture.start.x;
      let dy = point.y - gesture.start.y;
      if (settings.snap) {
        const first = gesture.origins.values().next().value as Item | undefined;
        if (first) { dx = snapTo(first.x + dx) - first.x; dy = snapTo(first.y + dy) - first.y; }
      }
      for (const [id, origin] of gesture.origins) store.update(id, { x: origin.x + dx, y: origin.y + dy });
      if (!gesture.moved) setGesture({ ...gesture, moved: true });
      return;
    }
    if (gesture.kind === "resize") {
      const next = resize(gesture.origin, gesture.handle, point, { keepRatio: event.shiftKey || gesture.origin.kind === "image" });
      store.update(gesture.id, { x: snapTo(next.x), y: snapTo(next.y), w: Math.max(8, snapTo(next.w)), h: Math.max(8, snapTo(next.h)) });
      return;
    }
    if (gesture.kind === "rotate") store.update(gesture.id, { rotation: rotationTowards(gesture.origin, point, event.shiftKey ? 15 : 0) });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    viewport.pointerUp(event);
    const current = gesture;
    setGesture(null);
    if (!current) return;
    if (current.kind === "move" || current.kind === "resize" || current.kind === "rotate") { store.endStep(); return; }
    if (current.kind === "marquee") {
      const area = boxOf(current.start, current.current);
      if (area.w * viewport.view.zoom > 4 || area.h * viewport.view.zoom > 4) {
        const inside = shapes.filter((item) => item.kind !== "group" && overlapsBox(bounds(item), area)).map((item) => top(item.id));
        setSelected(new Set(event.shiftKey ? [...selected, ...inside] : inside));
      }
      return;
    }
    if (current.kind === "pen") {
      if (current.points.length < 4) return;
      const xs = current.points.filter((_, index) => index % 2 === 0);
      const ys = current.points.filter((_, index) => index % 2 === 1);
      const x = Math.min(...xs); const y = Math.min(...ys);
      const relative = current.points.map((value, index) => Math.round((value - (index % 2 === 0 ? x : y)) * 10) / 10);
      store.create({ kind: "freehand", x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y), data: { points: relative.slice(0, 8000), stroke: ink, strokeWidth: width } });
      return;
    }
    if (current.kind === "draw") {
      const area = boxOf(current.start, current.current);
      const tapped = area.w * viewport.view.zoom < 6 && area.h * viewport.view.zoom < 6;
      if (current.tool === "line" || current.tool === "arrow") {
        const end = tapped ? { x: current.start.x + 160, y: current.start.y } : current.current;
        const x = Math.min(current.start.x, end.x); const y = Math.min(current.start.y, end.y);
        create(current.tool, { x, y, w: Math.max(1, Math.abs(end.x - current.start.x)), h: Math.max(1, Math.abs(end.y - current.start.y)) }, { points: [current.start.x - x, current.start.y - y, end.x - x, end.y - y], stroke: ink, strokeWidth: width });
        return;
      }
      const size = tapped ? (current.tool === "sticky" ? { w: 200, h: 200 } : current.tool === "text" ? { w: 240, h: 60 } : { w: 200, h: 140 }) : { w: Math.max(20, area.w), h: Math.max(20, area.h) };
      const box = tapped ? { x: snapTo(current.start.x - size.w / 2), y: snapTo(current.start.y - size.h / 2), ...size } : { x: snapTo(area.x), y: snapTo(area.y), w: snapTo(size.w), h: snapTo(size.h) };
      const made = current.tool === "sticky" ? create("sticky", box, { text: "", color: fill })
        : current.tool === "text" ? create("text", box, { text: "", fontSize: 24, color: ink })
          : create(current.tool, box, { fill, stroke: ink, strokeWidth: width });
      if (current.tool === "sticky" || current.tool === "text") setEditingText(made.id);
    }
  };

  const onDoubleClick = (event: React.MouseEvent) => {
    if (!editable) return;
    const target = pick(viewport.world(event));
    if (target && ["sticky", "text", "rect", "ellipse"].includes(target.kind)) { setSelected(new Set([target.id])); setEditingText(target.id); }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.target as HTMLElement).closest("input, textarea, select")) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === "z") { event.preventDefault(); if (event.shiftKey) store.redo(); else store.undo(); return; }
    if (mod && key === "y") { event.preventDefault(); store.redo(); return; }
    if (mod && key === "a") { event.preventDefault(); setSelected(new Set(shapes.filter((item) => !item.parentId || byId.get(item.parentId)?.kind !== "group").map((item) => item.id))); return; }
    if (mod && key === "c") { copy(); return; }
    if (mod && key === "v" && editable) { paste(); return; }
    if (mod && key === "d" && editable) { event.preventDefault(); copy(); paste(); return; }
    if (mod && key === "g" && editable) { event.preventDefault(); if (event.shiftKey) ungroupSelection(); else groupSelection(); return; }
    if ((key === "delete" || key === "backspace") && editable) { event.preventDefault(); deleteSelection(); return; }
    if (key === "escape") { setSelected(new Set()); setTool("select"); setConnectFrom(null); return; }
    if (key.startsWith("arrow") && editable && selection.length) {
      event.preventDefault();
      const step = event.shiftKey ? GRID : 1;
      const [dx, dy] = key === "arrowleft" ? [-step, 0] : key === "arrowright" ? [step, 0] : key === "arrowup" ? [0, -step] : [0, step];
      store.batch(() => { for (const item of selection) moveWithChildren(item.id, dx!, dy!); });
      return;
    }
    if (mod) return;
    const tools: Record<string, Tool> = { v: "select", h: "hand", n: "sticky", t: "text", r: "rect", o: "ellipse", l: "line", a: "arrow", p: "pen", c: "connector" };
    if (tools[key] && (editable || tools[key] === "select" || tools[key] === "hand")) setTool(tools[key]);
    if (key === "+" || key === "=") viewport.zoomBy(1.25);
    if (key === "-") viewport.zoomBy(0.8);
    if (key === "0") viewport.reset();
    if (key === "1" && event.shiftKey) viewport.fit(union(shapes.map(bounds)));
  };

  const single = selection.length === 1 ? selection[0]! : null;
  const editingItem = editingText ? byId.get(editingText) : undefined;
  const v = viewport.view;

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <div className="flex items-center gap-0.5 overflow-x-auto border-b bg-card/80 px-2 py-1.5 [scrollbar-width:none] *:shrink-0 lg:flex-wrap" role="toolbar" aria-label="Canvas tools">
        <ToolButton label="Select" shortcut="V" active={tool === "select"} onClick={() => setTool("select")}><MousePointer2 className="size-4" /></ToolButton>
        <ToolButton label="Pan" shortcut="H" active={tool === "hand"} onClick={() => setTool("hand")}><Hand className="size-4" /></ToolButton>
        {editable ? (
          <>
            <span className="mx-1 h-6 w-px bg-border" aria-hidden />
            <ToolButton label="Sticky note" shortcut="N" active={tool === "sticky"} onClick={() => setTool("sticky")}><StickyNote className="size-4" /></ToolButton>
            <ToolButton label="Text" shortcut="T" active={tool === "text"} onClick={() => setTool("text")}><Type className="size-4" /></ToolButton>
            <ToolButton label="Rectangle" shortcut="R" active={tool === "rect"} onClick={() => setTool("rect")}><Square className="size-4" /></ToolButton>
            <ToolButton label="Ellipse" shortcut="O" active={tool === "ellipse"} onClick={() => setTool("ellipse")}><Circle className="size-4" /></ToolButton>
            <ToolButton label="Line" shortcut="L" active={tool === "line"} onClick={() => setTool("line")}><Minus className="size-4" /></ToolButton>
            <ToolButton label="Arrow" shortcut="A" active={tool === "arrow"} onClick={() => setTool("arrow")}><ArrowUpRight className="size-4" /></ToolButton>
            <ToolButton label="Pen" shortcut="P" active={tool === "pen"} onClick={() => setTool("pen")}><PenLine className="size-4" /></ToolButton>
            <ToolButton label="Connector: tap one object, then another" shortcut="C" active={tool === "connector"} onClick={() => { setTool("connector"); setConnectFrom(null); }}><Spline className="size-4" /></ToolButton>
            <ToolButton label="Upload image, plan or document" onClick={() => fileInput.current?.click()}>{uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}</ToolButton>
            <span className="mx-1 h-6 w-px bg-border" aria-hidden />
            <div className="flex items-center gap-1" role="group" aria-label="Colour and width">
              <select aria-label="Line colour" value={ink} onChange={(event) => { setInk(event.target.value); if (selection.length) store.batch(() => { for (const item of selection) if (item.kind !== "sticky" && item.kind !== "image" && item.kind !== "document") store.update(item.id, { data: { ...item.data, [item.kind === "text" ? "color" : "stroke"]: event.target.value } }); }); }} className="h-8 rounded-md border bg-background px-1 text-xs">
                {INKS.map((value) => <option key={value} value={value}>{inkName(value)}</option>)}
              </select>
              <select aria-label="Fill colour" value={fill} onChange={(event) => { setFill(event.target.value); if (selection.length) store.batch(() => { for (const item of selection) if (item.kind === "sticky") store.update(item.id, { data: { ...item.data, color: event.target.value } }); else if (item.kind === "rect" || item.kind === "ellipse") store.update(item.id, { data: { ...item.data, fill: event.target.value } }); }); }} className="h-8 rounded-md border bg-background px-1 text-xs">
                {COLORS.map((value) => <option key={value} value={value}>{fillName(value)}</option>)}
              </select>
              <select aria-label="Line width" value={width} onChange={(event) => { const next = Number(event.target.value); setWidth(next); if (selection.length) store.batch(() => { for (const item of selection) if (["rect", "ellipse", "line", "arrow", "freehand", "connector"].includes(item.kind)) store.update(item.id, { data: { ...item.data, strokeWidth: next } }); }); }} className="h-8 rounded-md border bg-background px-1 text-xs">
                {[1, 2, 3, 5, 8, 12].map((value) => <option key={value} value={value}>{value} px</option>)}
              </select>
            </div>
            <span className="mx-1 h-6 w-px bg-border" aria-hidden />
            <ToolButton label="Undo" shortcut="Ctrl+Z" disabled={!store.canUndo()} onClick={() => store.undo()}><Undo2 className="size-4" /></ToolButton>
            <ToolButton label="Redo" shortcut="Ctrl+Shift+Z" disabled={!store.canRedo()} onClick={() => store.redo()}><Redo2 className="size-4" /></ToolButton>
            <ToolButton label="Grid" active={settings.grid} onClick={() => void setSetting({ grid: !settings.grid })}><Grid3X3 className="size-4" /></ToolButton>
            <ToolButton label="Snap to grid" active={settings.snap} onClick={() => void setSetting({ snap: !settings.snap })}><Magnet className="size-4" /></ToolButton>
          </>
        ) : <span className="px-2 text-xs text-muted-foreground">View only{allowed.comment ? " · select an object to comment on it" : ""}</span>}
        <span className="ml-auto"><SaveStatus status={status} onRetry={() => void store.retry()} /></span>
        <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(event) => { void upload(event.target.files); event.target.value = ""; }} />
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[color-mix(in_oklab,var(--muted)_35%,var(--background))]">
        <div
          ref={surfaceRef}
          tabIndex={0}
          aria-label={`Canvas ${board.title}. ${items.length} objects.`}
          className={cn("absolute inset-0 touch-none outline-none", tool === "hand" || gesture?.kind === "pan" ? "cursor-grab" : tool === "select" ? "cursor-default" : "cursor-crosshair")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(event) => { viewport.pointerUp(event); setGesture(null); store.endStep(); }}
          onDoubleClick={onDoubleClick}
          onDragOver={(event) => { if (editable) event.preventDefault(); }}
          onDrop={(event) => { if (!editable) return; event.preventDefault(); void upload(event.dataTransfer.files, viewport.world(event)); }}
        >
          <svg className="absolute inset-0 size-full" aria-hidden="true">
            <defs>
              {settings.grid ? (
                <pattern id={`grid-${board.id}`} width={GRID * v.zoom} height={GRID * v.zoom} patternUnits="userSpaceOnUse" x={v.x % (GRID * v.zoom)} y={v.y % (GRID * v.zoom)}>
                  <circle cx={1} cy={1} r={v.zoom > 0.4 ? 1 : 0} fill="var(--border)" />
                </pattern>
              ) : null}
              <marker id={`arrow-${board.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke" /></marker>
            </defs>
            {settings.grid ? <rect width="100%" height="100%" fill={`url(#grid-${board.id})`} /> : null}
            <g transform={`translate(${v.x} ${v.y}) scale(${v.zoom})`}>
              {groups.filter((group) => selected.has(group.id)).map((group) => { const area = union(childrenOf(group.id).map(bounds)); return area ? <rect key={group.id} x={area.x - 6} y={area.y - 6} width={area.w + 12} height={area.h + 12} fill="none" stroke="var(--brand)" strokeDasharray="6 4" strokeWidth={1.5 / v.zoom} rx={6 / v.zoom} /> : null; })}
              {shown.map((item) => <CanvasObject key={item.id} item={item} boardId={board.id} />)}
              {connectors.filter((item) => shownIds.has(String(item.data.from)) || shownIds.has(String(item.data.to))).map((item) => {
                const ends = connectorPoints(item, byId);
                if (!ends) return null;
                return <line key={item.id} x1={ends[0].x} y1={ends[0].y} x2={ends[1].x} y2={ends[1].y} stroke={String(item.data.stroke ?? "#0f172a")} strokeWidth={Number(item.data.strokeWidth ?? 2)} markerEnd={item.data.arrow === false ? undefined : `url(#arrow-${board.id})`} className={cn(selected.has(item.id) && "stroke-[var(--brand)]")} />;
              })}
              {selection.filter((item) => item.kind !== "connector" && item.kind !== "group").map((item) => <SelectionOutline key={item.id} item={item} zoom={v.zoom} handles={editable && selection.length === 1} />)}
              {connectFrom && byId.get(connectFrom) ? <rect x={byId.get(connectFrom)!.x - 4} y={byId.get(connectFrom)!.y - 4} width={byId.get(connectFrom)!.w + 8} height={byId.get(connectFrom)!.h + 8} fill="none" stroke="var(--brand)" strokeWidth={2 / v.zoom} strokeDasharray="4 3" /> : null}
              {gesture?.kind === "marquee" ? (() => { const area = boxOf(gesture.start, gesture.current); return <rect x={area.x} y={area.y} width={area.w} height={area.h} fill="color-mix(in oklab, var(--brand) 10%, transparent)" stroke="var(--brand)" strokeWidth={1 / v.zoom} />; })() : null}
              {gesture?.kind === "draw" ? (() => {
                const area = boxOf(gesture.start, gesture.current);
                if (gesture.tool === "line" || gesture.tool === "arrow") return <line x1={gesture.start.x} y1={gesture.start.y} x2={gesture.current.x} y2={gesture.current.y} stroke={ink} strokeWidth={width} markerEnd={gesture.tool === "arrow" ? `url(#arrow-${board.id})` : undefined} />;
                return gesture.tool === "ellipse" ? <ellipse cx={area.x + area.w / 2} cy={area.y + area.h / 2} rx={area.w / 2} ry={area.h / 2} fill="none" stroke={ink} strokeDasharray="5 4" strokeWidth={1.5 / v.zoom} /> : <rect x={area.x} y={area.y} width={area.w} height={area.h} fill="none" stroke={ink} strokeDasharray="5 4" strokeWidth={1.5 / v.zoom} />;
              })() : null}
              {gesture?.kind === "pen" ? <polyline points={pairs(gesture.points).map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={ink} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" /> : null}
              {cursors.map((person) => (
                <g key={person.userId} transform={`translate(${person.cursor!.x} ${person.cursor!.y}) scale(${1 / v.zoom})`} pointerEvents="none">
                  <path d="M0,0 L0,16 L4.5,12 L8,19 L10.5,18 L7,11 L13,11 z" fill={personColor(person.userId)} stroke="white" strokeWidth={1} />
                  <text x={14} y={22} fontSize={12} fill={personColor(person.userId)} fontWeight={600}>{person.name}</text>
                </g>
              ))}
            </g>
          </svg>

          {editingItem ? (
            <textarea
              data-overlay
              autoFocus
              aria-label="Edit text"
              defaultValue={String(editingItem.data.text ?? "")}
              onBlur={(event) => { store.update(editingItem.id, { data: { ...editingItem.data, text: event.target.value.slice(0, editingItem.kind === "sticky" ? 2000 : 10000) } }); setEditingText(null); }}
              onKeyDown={(event) => { if (event.key === "Escape") (event.target as HTMLTextAreaElement).blur(); event.stopPropagation(); }}
              className="absolute z-10 resize-none rounded border-2 border-brand bg-white/95 p-2 text-slate-900 outline-none"
              style={{ ...screenBox(editingItem, v), fontSize: (Number(editingItem.data.fontSize) || 16) * v.zoom, transform: editingItem.rotation ? `rotate(${editingItem.rotation}deg)` : undefined }}
            />
          ) : null}

          {!items.length ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {editable ? "An empty canvas. Pick a tool above — a sticky note, a shape, the pen — or drop an image here." : "Nothing on this canvas yet."}
            </div>
          ) : null}
        </div>

        {selection.length ? (
          <div data-overlay className="absolute left-1/2 top-2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center gap-0.5 rounded-xl border bg-card/95 p-1 shadow-lg" role="toolbar" aria-label="Selection">
            {allowed.comment && single && single.kind !== "connector" ? <ToolButton label="Comment" onClick={() => onDiscuss(single)}><MessageSquare className="size-4" /></ToolButton> : null}
            {editable ? (
              <>
                <ToolButton label="Duplicate" shortcut="Ctrl+D" onClick={() => { copy(); paste(); }}><Copy className="size-4" /></ToolButton>
                <ToolButton label="Bring to front" onClick={() => order(true)}><BringToFront className="size-4" /></ToolButton>
                <ToolButton label="Send to back" onClick={() => order(false)}><SendToBack className="size-4" /></ToolButton>
                {single && single.rotation ? <ToolButton label="Reset rotation" onClick={() => store.update(single.id, { rotation: 0 })}><RotateCcw className="size-4" /></ToolButton> : null}
                {selection.length > 1 ? (
                  <>
                    <ToolButton label="Group" shortcut="Ctrl+G" onClick={groupSelection}><Group className="size-4" /></ToolButton>
                    <ToolButton label="Align left" onClick={() => arrange("left")}><AlignStartVertical className="size-4" /></ToolButton>
                    <ToolButton label="Align centres" onClick={() => arrange("center")}><AlignCenterVertical className="size-4" /></ToolButton>
                    <ToolButton label="Align right" onClick={() => arrange("right")}><AlignEndVertical className="size-4" /></ToolButton>
                    <ToolButton label="Align top" onClick={() => arrange("top")}><AlignStartHorizontal className="size-4" /></ToolButton>
                    <ToolButton label="Align middles" onClick={() => arrange("middle")}><AlignCenterHorizontal className="size-4" /></ToolButton>
                    <ToolButton label="Align bottom" onClick={() => arrange("bottom")}><AlignEndHorizontal className="size-4" /></ToolButton>
                    {selection.length > 2 ? <ToolButton label="Distribute across" onClick={() => arrange("x")}><span className="text-[10px] font-bold">↔</span></ToolButton> : null}
                    {selection.length > 2 ? <ToolButton label="Distribute down" onClick={() => arrange("y")}><span className="text-[10px] font-bold">↕</span></ToolButton> : null}
                  </>
                ) : null}
                {selection.some((item) => item.kind === "group") ? <ToolButton label="Ungroup" shortcut="Ctrl+Shift+G" onClick={ungroupSelection}><Ungroup className="size-4" /></ToolButton> : null}
                <ToolButton label="Delete" shortcut="Del" onClick={deleteSelection}><Trash2 className="size-4 text-destructive" /></ToolButton>
              </>
            ) : null}
          </div>
        ) : null}

        <div data-overlay className="absolute bottom-3 right-3 z-20 flex items-center gap-0.5 rounded-xl border bg-card/95 p-1 shadow" role="group" aria-label="View">
          <ToolButton label="Zoom out" shortcut="-" onClick={() => viewport.zoomBy(0.8)}><ZoomOut className="size-4" /></ToolButton>
          <button type="button" onClick={() => viewport.reset()} title="Reset to 100% (0)" className="min-w-12 rounded-md px-1 text-xs tabular-nums hover:bg-muted">{Math.round(v.zoom * 100)}%</button>
          <ToolButton label="Zoom in" shortcut="+" onClick={() => viewport.zoomBy(1.25)}><ZoomIn className="size-4" /></ToolButton>
          <ToolButton label="Fit to content" shortcut="Shift+1" onClick={() => viewport.fit(union(shapes.map(bounds)))}><Maximize className="size-4" /></ToolButton>
        </div>
        {tool === "connector" ? <p data-overlay className="absolute bottom-3 left-3 z-20 rounded-lg bg-card/95 px-2 py-1 text-xs shadow">{connectFrom ? "Now tap the object to connect to." : "Tap the first object."}</p> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawing one object
// ---------------------------------------------------------------------------

function CanvasObject({ item, boardId }: { item: Item; boardId: string }) {
  const studio = useStudio();
  const data = item.data;
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  const asset = item.drawingId ? studio.assets.find((entry) => entry.id === item.drawingId) : undefined;
  const revision = asset ? asset.revisions.find((entry) => entry.id === asset.currentRevisionId) ?? asset.revisions.at(-1) : undefined;
  const url = useSignedUrl(item.kind === "image" ? revision?.storagePath ?? item.storagePath : null);
  const stroke = String(data.stroke ?? "#0f172a");
  const strokeWidth = Number(data.strokeWidth ?? 3);
  const label = (text: unknown, color = "#0f172a", size = 16) => text ? (
    <foreignObject x={item.x} y={item.y} width={Math.max(1, item.w)} height={Math.max(1, item.h)} pointerEvents="none">
      <div style={{ width: "100%", height: "100%", padding: 10, color, fontSize: size, lineHeight: 1.3, overflow: "hidden", overflowWrap: "anywhere", whiteSpace: "pre-wrap", display: "flex", alignItems: item.kind === "text" ? "flex-start" : "center", justifyContent: item.kind === "text" ? "flex-start" : "center", textAlign: item.kind === "text" ? "left" : "center" }}>{String(text)}</div>
    </foreignObject>
  ) : null;

  let body: React.ReactNode = null;
  switch (item.kind) {
    case "sticky":
      body = <><rect x={item.x} y={item.y} width={item.w} height={item.h} rx={4} fill={String(data.color ?? "#fef08a")} filter="drop-shadow(0 2px 3px rgb(0 0 0 / 0.15))" />{label(data.text, "#1e293b", 18)}</>;
      break;
    case "text":
      body = label(data.text || "Text", String(data.color ?? "#0f172a"), Number(data.fontSize ?? 24));
      break;
    case "rect":
      body = <><rect x={item.x} y={item.y} width={item.w} height={item.h} rx={6} fill={String(data.fill ?? "#ffffff")} stroke={stroke} strokeWidth={strokeWidth} />{label(data.text)}</>;
      break;
    case "ellipse":
      body = <><ellipse cx={cx} cy={cy} rx={item.w / 2} ry={item.h / 2} fill={String(data.fill ?? "#ffffff")} stroke={stroke} strokeWidth={strokeWidth} />{label(data.text)}</>;
      break;
    case "line":
    case "arrow":
    case "freehand": {
      const points = localPoints(item);
      body = <polyline points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" markerEnd={item.kind === "arrow" ? `url(#arrow-${boardId})` : undefined} />;
      break;
    }
    case "image":
      body = url ? <image href={url} x={item.x} y={item.y} width={item.w} height={item.h} preserveAspectRatio="xMidYMid meet" /> : <rect x={item.x} y={item.y} width={item.w} height={item.h} fill="var(--muted)" />;
      break;
    case "document":
      body = <><rect x={item.x} y={item.y} width={item.w} height={item.h} rx={8} fill="var(--card)" stroke="var(--border)" />{label(`📄 ${String(data.fileName ?? data.title ?? "Document")}`, "var(--foreground)", 14)}</>;
      break;
    default:
      body = null;
  }
  return <g transform={item.rotation ? `rotate(${item.rotation} ${cx} ${cy})` : undefined} data-item={item.id}>{body}</g>;
}

function SelectionOutline({ item, zoom, handles }: { item: Item; zoom: number; handles: boolean }) {
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  const size = 10 / zoom;
  const line = item.kind === "line" || item.kind === "arrow";
  return (
    <g>
      <g transform={item.rotation ? `rotate(${item.rotation} ${cx} ${cy})` : undefined}>
        <rect x={item.x - 3 / zoom} y={item.y - 3 / zoom} width={item.w + 6 / zoom} height={item.h + 6 / zoom} fill="none" stroke="var(--brand)" strokeWidth={1.5 / zoom} pointerEvents="none" />
        {handles && !line ? <line x1={cx} y1={item.y} x2={cx} y2={item.y - 28 / zoom} stroke="var(--brand)" strokeWidth={1.5 / zoom} pointerEvents="none" /> : null}
      </g>
      {handles ? (
        <>
          {HANDLES.map((handle) => { const p = handlePoint(item, handle); return <rect key={handle} data-handle={handle} x={p.x - size / 2} y={p.y - size / 2} width={size} height={size} rx={2 / zoom} fill="white" stroke="var(--brand)" strokeWidth={1.5 / zoom} style={{ cursor: `${handle}-resize` }} />; })}
          {!line ? (() => { const angle = (item.rotation * Math.PI) / 180; const r = item.h / 2 + 28 / zoom; const p = { x: cx + Math.sin(angle) * r, y: cy - Math.cos(angle) * r }; return <circle data-handle="rotate" cx={p.x} cy={p.y} r={size / 1.6} fill="white" stroke="var(--brand)" strokeWidth={1.5 / zoom} style={{ cursor: "grab" }} />; })() : null}
        </>
      ) : null}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pairs(values: readonly number[]): Point[] {
  const out: Point[] = [];
  for (let index = 0; index + 1 < values.length; index += 2) out.push({ x: values[index]!, y: values[index + 1]! });
  return out;
}

/**
 * A line's or stroke's points in the world. They are stored relative to the
 * object and scaled to its box, so resizing the box resizes the drawing.
 */
function localPoints(item: Item): Point[] {
  const points = pairs((item.data.points as number[] | undefined) ?? []);
  if (!points.length) return [];
  const minX = Math.min(...points.map((p) => p.x)); const minY = Math.min(...points.map((p) => p.y));
  const spanX = Math.max(...points.map((p) => p.x)) - minX; const spanY = Math.max(...points.map((p) => p.y)) - minY;
  const sx = spanX > 0.5 ? item.w / spanX : 1; const sy = spanY > 0.5 ? item.h / spanY : 1;
  return points.map((p) => ({ x: item.x + (p.x - minX) * sx, y: item.y + (p.y - minY) * sy }));
}

function connectorPoints(item: Item, byId: Map<string, Item>): [Point, Point] | null {
  const from = byId.get(String(item.data.from));
  const to = byId.get(String(item.data.to));
  if (!from || !to || from.archived || to.archived) return null;
  return connectorEnds(from as Shape, to as Shape);
}

const boxOf = (a: Point, b: Point): Box => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
const overlapsBox = (a: Box, b: Box) => a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
function screenBox(item: Item, view: { zoom: number; x: number; y: number }) {
  const p = toScreen({ x: item.x, y: item.y }, view);
  return { left: p.x, top: p.y, width: Math.max(80, item.w * view.zoom), height: Math.max(40, item.h * view.zoom) };
}

async function naturalSize(file: File): Promise<{ w: number; h: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

const inkName = (value: string) => ({ "#0f172a": "Ink: black", "#1d4ed8": "Ink: blue", "#dc2626": "Ink: red", "#16a34a": "Ink: green", "#9333ea": "Ink: purple", "#ea580c": "Ink: orange", "#64748b": "Ink: grey" } as Record<string, string>)[value] ?? value;
const fillName = (value: string) => ({ "#fef08a": "Fill: yellow", "#bbf7d0": "Fill: green", "#bfdbfe": "Fill: blue", "#fecaca": "Fill: red", "#e9d5ff": "Fill: purple", "#fed7aa": "Fill: orange", "#e5e7eb": "Fill: grey", "#ffffff": "Fill: white" } as Record<string, string>)[value] ?? value;
