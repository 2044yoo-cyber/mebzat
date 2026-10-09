"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Circle,
  Cloud,
  Eraser,
  Highlighter,
  MapPin,
  Minus,
  MousePointer2,
  PenLine,
  Ruler,
  Square,
  Trash2,
  Type,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { formatLength } from "../services/measurements";
import type { DisplayUnits } from "../services/workspace-options";

/**
 * Markup over a picture — the plan, a site photo, a PDF page, a CAD drawing.
 *
 * The picture is never touched. Shapes are kept in the picture's own units
 * (millimetres for the plan, pixels for a photo or a page), so a pin or an
 * arrow stays on the thing it was drawn on at any zoom, and the markup is
 * stored and sent separately from the file it is about.
 */
export type MarkupTool = "select" | "pen" | "highlighter" | "line" | "arrow" | "rect" | "circle" | "cloud" | "text" | "measure" | "dimension" | "pin" | "eraser" | "calibrate";
export type ShapeType = Exclude<MarkupTool, "select" | "eraser" | "calibrate">;

export type MarkupShape = {
  id: string;
  type: ShapeType;
  points: [number, number][];
  color: string;
  /** Text, or a pin's number. */
  text?: string;
  /** Lettering and line weight, in the picture's units, so they scale with it. */
  size: number;
  pinId?: string;
};

export type MarkupBackground = { url: string; x: number; y: number; width: number; height: number };

export type MarkupPin = { id: string; number: string; x: number; y: number; status: "open" | "resolved"; title: string };

const COLORS = ["#e11d48", "#f59e0b", "#16a34a", "#2563eb", "#111827"];

const TOOLS: { id: MarkupTool; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "pen", label: "Pen", icon: PenLine },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight },
  { id: "rect", label: "Shape", icon: Square },
  { id: "text", label: "Text", icon: Type },
  { id: "measure", label: "Measure", icon: Ruler },
  { id: "dimension", label: "Dimension", icon: Minus },
  { id: "pin", label: "Pin", icon: MapPin },
  { id: "eraser", label: "Eraser", icon: Eraser },
];

const SHAPE_VARIANTS: { id: MarkupTool; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "line", label: "Line", icon: Minus },
  { id: "rect", label: "Rectangle", icon: Square },
  { id: "circle", label: "Circle", icon: Circle },
  { id: "cloud", label: "Cloud", icon: Cloud },
];
const PEN_VARIANTS: { id: MarkupTool; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "pen", label: "Pen", icon: PenLine },
  { id: "highlighter", label: "Highlighter", icon: Highlighter },
];

type View = { x: number; y: number; w: number; h: number };

export function MarkupCanvas({
  background,
  shapes,
  onShapes,
  pins = [],
  mmPerUnit,
  onCalibrate,
  unit,
  onPinRequest,
  onPinOpen,
  onDiscussShape,
  focus,
  rotation = 0,
  label = "Sketch canvas",
}: {
  background: MarkupBackground;
  shapes: MarkupShape[];
  onShapes: (shapes: MarkupShape[]) => void;
  pins?: MarkupPin[];
  /** Millimetres per picture unit, once known. */
  mmPerUnit: number | null;
  onCalibrate?: (mmPerUnit: number) => void;
  unit: DisplayUnits;
  onPinRequest?: (point: { x: number; y: number }) => void;
  onPinOpen?: (pinId: string) => void;
  /** Start an Agenda-linked discussion pinned to this exact annotation. */
  onDiscussShape?: (shape: MarkupShape) => void;
  focus?: { x: number; y: number } | null;
  /** Turns the view, not the picture: markup stays in the picture's own frame. */
  rotation?: number;
  label?: string;
}) {
  const svg = useRef<SVGSVGElement | null>(null);
  const content = useRef<SVGGElement | null>(null);
  const arrowId = useId();
  const centre = { x: background.x + background.width / 2, y: background.y + background.height / 2 };
  const fit = useMemo<View>(() => {
    const pad = Math.max(background.width, background.height) * 0.03;
    const turned = rotation % 180 !== 0;
    const w = (turned ? background.height : background.width) + pad * 2;
    const h = (turned ? background.width : background.height) + pad * 2;
    return { x: background.x + background.width / 2 - w / 2, y: background.y + background.height / 2 - h / 2, w, h };
  }, [background, rotation]);
  const [view, setView] = useState<View | null>(null);
  const shown = view ?? fit;
  const [tool, setTool] = useState<MarkupTool>("pen");
  const [variants, setVariants] = useState<"shape" | "pen" | null>(null);
  const [color, setColor] = useState(COLORS[0]!);
  const [draft, setDraft] = useState<MarkupShape | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; from: [number, number]; dx: number; dy: number } | null>(null);
  const [endDrag, setEndDrag] = useState<{ id: string; end: 0 | 1; point: [number, number] } | null>(null);
  // Arrow can be made by dragging, OR tapping its start and end on a phone.
  const [arrowStart, setArrowStart] = useState<[number, number] | null>(null);
  const [typing, setTyping] = useState<{ id?: string; x: number; y: number; value: string } | null>(null);
  const [calibration, setCalibration] = useState<{ points: [number, number][]; value: string } | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ midX: number; midY: number; dist: number } | null>(null);
  const pan = useRef<{ x: number; y: number } | null>(null);

  // A pin or a markup asked for from elsewhere is brought to the middle.
  const [focused, setFocused] = useState<string | null>(null);
  const focusKey = focus ? `${focus.x},${focus.y}` : null;
  if (focus && focusKey !== focused) {
    setFocused(focusKey);
    const w = fit.w / 3;
    const h = fit.h / 3;
    setView({ x: focus.x - w / 2, y: focus.y - h / 2, w, h });
  }

  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setSize({ width: entry.contentRect.width || 1, height: entry.contentRect.height || 1 }); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // Picture units per screen pixel: the view keeps its aspect ("meet").
  const perPx = Math.max(shown.w / size.width, shown.h / size.height);

  // Points are read through the turned group, so they land in the picture's frame.
  function at(event: { clientX: number; clientY: number }): [number, number] {
    const matrix = (content.current ?? svg.current)?.getScreenCTM();
    if (!matrix) return [0, 0];
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return [point.x, point.y];
  }

  /** A point in the view's own frame — what pan and zoom move — before any turn. */
  function viewPoint(event: { clientX: number; clientY: number }): [number, number] {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return [0, 0];
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return [point.x, point.y];
  }

  function zoomAround(base: View, factor: number, cx: number, cy: number): View {
    const span = Math.max(base.w, base.h);
    const limited = Math.min(Math.max(factor, (fit.w / 50) / span), (fit.w * 6) / span);
    const w = base.w * limited;
    const h = base.h * limited;
    return { x: cx - (cx - base.x) * limited, y: cy - (cy - base.y) * limited, w, h };
  }

  function pinchState() {
    const list = [...pointers.current.values()];
    if (list.length < 2) return null;
    const [a, b] = list;
    return { midX: (a!.x + b!.x) / 2, midY: (a!.y + b!.y) / 2, dist: Math.max(1, Math.hypot(a!.x - b!.x, a!.y - b!.y)) };
  }

  function hit(point: [number, number]): MarkupShape | null {
    const reach = 14 * perPx;
    for (const shape of [...shapes].reverse()) {
      if (shapeDistance(shape, point) <= reach + shape.size / 2) return shape;
    }
    return null;
  }

  function measureLabel(points: [number, number][]) {
    const [a, b] = [points[0]!, points.at(-1)!];
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return mmPerUnit ? formatLength(distance * mmPerUnit, unit) : `${Math.round(distance)} px · not calibrated`;
  }

  function down(event: React.PointerEvent<SVGSVGElement>) {
    if (event.isPrimary) pointers.current.clear();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2) {
      setDraft(null);
      setDrag(null);
      setEndDrag(null);
      pan.current = null;
      pinch.current = pinchState();
      return;
    }
    if (event.button !== 0) return;
    setVariants(null);
    svg.current?.setPointerCapture(event.pointerId);
    const point = at(event);
    if (tool === "calibrate") {
      const points = [...(calibration?.points ?? []), point].slice(-2);
      setCalibration({ points, value: calibration?.value ?? "" });
      return;
    }
    if (tool === "text") { setTyping({ x: point[0], y: point[1], value: "" }); return; }
    if (tool === "arrow" && arrowStart) {
      if (Math.hypot(point[0] - arrowStart[0], point[1] - arrowStart[1]) > 6 * perPx) {
        const shape: MarkupShape = { id: crypto.randomUUID(), type: "arrow", points: [arrowStart, point], color, size: 3 * perPx };
        onShapes([...shapes, shape]);
        setSelected(shape.id);
        setTool("select");
      }
      setArrowStart(null);
      return;
    }
    if (tool === "pin") { onPinRequest?.({ x: point[0], y: point[1] }); return; }
    if (tool === "eraser") {
      const target = hit(point);
      if (target) onShapes(shapes.filter((shape) => shape.id !== target.id));
      return;
    }
    if (tool === "select") {
      const target = hit(point);
      if (target?.pinId && onPinOpen) { onPinOpen(target.pinId); return; }
      if (target && target.id === selected && (target.type === "arrow" || target.type === "line" || target.type === "measure" || target.type === "dimension")) {
        const ends = [target.points[0]!, target.points.at(-1)!] as const;
        const end = Math.hypot(point[0] - ends[0][0], point[1] - ends[0][1]) <= 18 * perPx ? 0
          : Math.hypot(point[0] - ends[1][0], point[1] - ends[1][1]) <= 18 * perPx ? 1 : null;
        if (end !== null) {
          setEndDrag({ id: target.id, end, point });
          return;
        }
      }
      setSelected(target?.id ?? null);
      if (target) setDrag({ id: target.id, from: point, dx: 0, dy: 0 });
      else pan.current = { x: event.clientX, y: event.clientY };
      return;
    }
    const weight = (tool === "highlighter" ? 18 : 3) * perPx;
    setDraft({ id: crypto.randomUUID(), type: tool, points: [point, point], color: tool === "highlighter" ? `${color}66` : color, size: weight });
  }

  function move(event: React.PointerEvent<SVGSVGElement>) {
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2) {
      const next = pinchState();
      const prev = pinch.current;
      pinch.current = next;
      const rect = svg.current?.getBoundingClientRect();
      if (!next || !prev || !rect) return;
      setView((current) => {
        const base = current ?? fit;
        const anchor = viewPoint({ clientX: prev.midX, clientY: prev.midY });
        const zoomed = zoomAround(base, prev.dist / next.dist, anchor[0], anchor[1]);
        const unitsPerPx = Math.max(zoomed.w / rect.width, zoomed.h / rect.height);
        return { ...zoomed, x: zoomed.x - (next.midX - prev.midX) * unitsPerPx, y: zoomed.y - (next.midY - prev.midY) * unitsPerPx };
      });
      return;
    }
    if (pan.current) {
      const dx = (event.clientX - pan.current.x) * perPx;
      const dy = (event.clientY - pan.current.y) * perPx;
      pan.current = { x: event.clientX, y: event.clientY };
      setView((current) => { const base = current ?? fit; return { ...base, x: base.x - dx, y: base.y - dy }; });
      return;
    }
    const point = at(event);
    if (endDrag) { setEndDrag({ ...endDrag, point }); return; }
    if (drag) { setDrag({ ...drag, dx: point[0] - drag.from[0], dy: point[1] - drag.from[1] }); return; }
    if (!draft) return;
    if (draft.type === "pen" || draft.type === "highlighter") {
      const last = draft.points.at(-1)!;
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= 2 * perPx) setDraft({ ...draft, points: [...draft.points, point] });
    } else {
      setDraft({ ...draft, points: [draft.points[0]!, point] });
    }
  }

  function up(event: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size >= 1) return;
    pinch.current = null;
    pan.current = null;
    if (endDrag) {
      onShapes(shapes.map((shape) => shape.id === endDrag.id ? {
        ...shape,
        points: shape.points.map((point, index) => index === (endDrag.end === 0 ? 0 : shape.points.length - 1) ? endDrag.point : point),
        text: (shape.type === "measure" || shape.type === "dimension")
          ? measureLabel(shape.points.map((point, index) => index === (endDrag.end === 0 ? 0 : shape.points.length - 1) ? endDrag.point : point)) : shape.text,
      } : shape));
      setEndDrag(null);
      return;
    }
    if (drag) {
      if (drag.dx || drag.dy) onShapes(shapes.map((shape) => shape.id === drag.id ? { ...shape, points: shape.points.map(([x, y]) => [x + drag.dx, y + drag.dy] as [number, number]) } : shape));
      setDrag(null);
      return;
    }
    if (!draft) return;
    const [a, b] = [draft.points[0]!, draft.points.at(-1)!];
    const long = draft.points.length > 2 || Math.hypot(b[0] - a[0], b[1] - a[1]) >= 6 * perPx;
    if (long) {
      const finished = draft.type === "measure" || draft.type === "dimension" ? { ...draft, text: measureLabel(draft.points), size: 13 * perPx } : draft;
      onShapes([...shapes, finished]);
      if (draft.type === "arrow" || draft.type === "line" || draft.type === "rect" || draft.type === "circle" || draft.type === "cloud" || draft.type === "measure" || draft.type === "dimension") {
        setSelected(draft.id);
        setTool("select");
      }
      setArrowStart(null);
    } else if (draft.type === "arrow") {
      setArrowStart(draft.points[0]!);
    }
    setDraft(null);
  }

  function wheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const [cx, cy] = viewPoint(event);
    setView((current) => zoomAround(current ?? fit, 1 + event.deltaY * 0.0015, cx, cy));
  }

  function chooseTool(next: MarkupTool, group: "shape" | "pen" | null = null) {
    setTool(next);
    setSelected(null);
    setArrowStart(null);
    setCalibration(next === "calibrate" ? { points: [], value: "" } : null);
    // Pen and Shape offer their kinds each time they are pressed; drawing puts the choice away.
    setVariants(group);
  }

  const display = shapes.map((shape) =>
    drag && shape.id === drag.id
      ? { ...shape, points: shape.points.map(([x, y]) => [x + drag.dx, y + drag.dy] as [number, number]) }
      : endDrag && shape.id === endDrag.id
        ? { ...shape, points: shape.points.map((point, index) => index === (endDrag.end === 0 ? 0 : shape.points.length - 1) ? endDrag.point : point) }
        : shape);
  const selectedShape = shapes.find((shape) => shape.id === selected) ?? null;
  const calibrated = calibration?.points.length === 2 ? Math.hypot(calibration.points[1]![0] - calibration.points[0]![0], calibration.points[1]![1] - calibration.points[0]![1]) : null;
  const toolGroup = (id: MarkupTool) => (["line", "rect", "circle", "cloud"].includes(id) ? "rect" : id === "highlighter" ? "pen" : id);

  return (
    <div className="space-y-2">
      <nav aria-label="Sketch tools" className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border bg-card p-1">
        {TOOLS.map(({ id, label: name, icon: Icon }) => (
          <button key={id} type="button" aria-label={name} aria-pressed={toolGroup(tool) === id} onClick={() => chooseTool(id === "rect" && toolGroup(tool) === "rect" ? tool : id === "pen" && toolGroup(tool) === "pen" ? tool : id, id === "rect" ? "shape" : id === "pen" ? "pen" : null)} className={cn("flex min-h-12 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 text-[10px] text-muted-foreground", toolGroup(tool) === id && "bg-brand/15 text-brand")}>
            <Icon className="size-[18px]" />
            <span className="leading-none">{name}</span>
          </button>
        ))}
      </nav>
      <div className="relative h-[calc(100dvh-22rem)] min-h-[300px] overflow-hidden rounded-xl border bg-slate-100 dark:bg-slate-900 lg:h-[min(640px,62dvh)]">
        <svg ref={svg} role="img" aria-label={label} viewBox={`${shown.x} ${shown.y} ${shown.w} ${shown.h}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 size-full touch-none select-none" style={{ cursor: tool === "select" ? "default" : "crosshair" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={(event) => { pointers.current.delete(event.pointerId); setDraft(null); setDrag(null); setEndDrag(null); pan.current = null; }} onWheel={wheel}
          // A tap here is all pointer events. Without this the browser follows
          // it with a pretend mouse press — on whatever the tap just opened,
          // the pin dialog's backdrop, which closed it again.
          onTouchEnd={(event) => event.preventDefault()}>
          <defs>
            <marker id={`${arrowId}-head`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker>
          </defs>
          <g ref={content} transform={rotation ? `rotate(${rotation} ${centre.x} ${centre.y})` : undefined}>
          <image aria-label="Source" href={background.url} x={background.x} y={background.y} width={background.width} height={background.height} preserveAspectRatio="none" />
          <g aria-label="Markup">
            {display.map((shape) => <ShapeView key={shape.id} shape={shape} arrowId={`${arrowId}-head`} selected={selected === shape.id} pin={pins.find((pin) => pin.id === shape.pinId)} />)}
            {draft ? <ShapeView shape={draft.type === "measure" || draft.type === "dimension" ? { ...draft, text: measureLabel(draft.points), size: 13 * perPx } : draft} arrowId={`${arrowId}-head`} selected={false} /> : null}
            {arrowStart && tool === "arrow" ? <circle cx={arrowStart[0]} cy={arrowStart[1]} r={7 * perPx} fill="#2563eb" stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" /> : null}
            {selectedShape && tool === "select" && ["arrow", "line", "measure", "dimension"].includes(selectedShape.type)
              ? [selectedShape.points[0]!, selectedShape.points.at(-1)!].map(([x, y], index) => <circle key={index} cx={endDrag && endDrag.end === index ? endDrag.point[0] : x} cy={endDrag && endDrag.end === index ? endDrag.point[1] : y}
                r={8 * perPx} fill="white" stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke" />)
              : null}
            {calibration?.points.map(([x, y], index) => <circle key={index} cx={x} cy={y} r={6 * perPx} fill="#f59e0b" stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
          </g>
          </g>
        </svg>
        {arrowStart && tool === "arrow" ? <div role="status" className="absolute left-2 bottom-12 z-10 flex items-center gap-2 rounded-lg border bg-card/95 p-2 text-xs shadow-sm">Tap arrow end, or <button type="button" onClick={() => setArrowStart(null)} className="underline">Cancel</button></div> : null}
        {variants ? (
          <div role="radiogroup" aria-label={variants === "shape" ? "Shape" : "Pen"} className="absolute left-1/2 top-12 z-10 flex -translate-x-1/2 gap-1 rounded-xl border bg-card/95 p-1 text-xs shadow-sm">
            {(variants === "shape" ? SHAPE_VARIANTS : PEN_VARIANTS).map(({ id, label: name, icon: Icon }) => <button key={id} type="button" role="radio" aria-checked={tool === id} onClick={() => { setTool(id); setVariants(null); }} className={cn("flex min-h-9 items-center gap-1 rounded-lg px-2.5", tool === id ? "bg-brand/15 text-brand" : "text-muted-foreground")}><Icon className="size-3.5" />{name}</button>)}
          </div>
        ) : null}
        <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-full border bg-card/95 p-1">
          {COLORS.map((value) => <button key={value} type="button" aria-label={`Colour ${value}`} aria-pressed={color === value} onClick={() => setColor(value)} className={cn("size-7 rounded-full border-2", color === value ? "border-foreground" : "border-transparent")} style={{ background: value }} />)}
        </div>
        {typing ? (
          <form onSubmit={(event) => { event.preventDefault(); if (typing.value.trim()) {
            const content = typing.value.trim().slice(0, 300);
            if (typing.id) onShapes(shapes.map((shape) => shape.id === typing.id ? { ...shape, text: content } : shape));
            else {
              const shape: MarkupShape = { id: crypto.randomUUID(), type: "text", points: [[typing.x, typing.y]], color, text: content, size: 16 * perPx };
              onShapes([...shapes, shape]); setSelected(shape.id);
            }
            setTool("select");
          } setTyping(null); }} className="absolute inset-x-2 top-12 z-20 flex gap-1 rounded-xl border bg-card p-1.5 shadow-lg">
            <input autoFocus aria-label="Sketch text" value={typing.value} onChange={(event) => setTyping({ ...typing, value: event.target.value })} placeholder="Type a note" className="min-h-10 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm" />
            <button type="submit" className="rounded-lg bg-brand px-3 text-sm font-medium text-brand-foreground">{typing.id ? "Save" : "Add"}</button>
            <button type="button" onClick={() => setTyping(null)} aria-label="Cancel text" className="rounded-lg px-2 text-sm text-muted-foreground">✕</button>
          </form>
        ) : null}
        {tool === "calibrate" ? (
          <form onSubmit={(event) => { event.preventDefault(); const known = Number(calibration?.value); if (calibrated && known > 0) { onCalibrate?.((known * (unit === "m" ? 1000 : unit === "cm" ? 10 : 1)) / calibrated); setTool("measure"); setCalibration(null); } }} className="absolute inset-x-2 bottom-2 z-20 space-y-1.5 rounded-xl border bg-card p-2 text-xs shadow-lg">
            <p className="font-medium">{calibration?.points.length === 2 ? "How long is that, really?" : `Tap the two ends of a length you know (${calibration?.points.length ?? 0}/2)`}</p>
            {calibration?.points.length === 2 ? <div className="flex gap-1.5"><input autoFocus aria-label="Known length" inputMode="decimal" value={calibration.value} onChange={(event) => setCalibration({ ...calibration, value: event.target.value })} placeholder={`e.g. 5000`} className="min-h-10 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm" /><span className="self-center text-muted-foreground">{unit}</span><button type="submit" className="rounded-lg bg-brand px-3 font-medium text-brand-foreground">Set scale</button></div> : null}
          </form>
        ) : null}
        {selectedShape && tool === "select" ? (
          <div className="absolute inset-x-2 bottom-2 z-20 flex flex-wrap items-center gap-1 rounded-xl border bg-card/95 p-1.5 text-xs shadow-lg">
            <span className="min-w-0 flex-1 truncate px-1">{describe(selectedShape)} · Drag to move</span>
            {selectedShape.type === "text" ? <button type="button" onClick={() => setTyping({ id: selectedShape.id, x: selectedShape.points[0]![0], y: selectedShape.points[0]![1], value: selectedShape.text ?? "" })} className="min-h-10 rounded-lg border px-2">Edit</button> : null}
            {onDiscussShape && !selectedShape.pinId ? <button type="button" onClick={() => onDiscussShape(selectedShape)} className="min-h-10 rounded-lg border border-brand/40 px-2 text-brand">Discuss</button> : null}
            <button type="button" onClick={() => { onShapes(shapes.filter((shape) => shape.id !== selected)); setSelected(null); }} className="flex min-h-10 items-center gap-1 rounded-lg border border-destructive/30 px-2 text-destructive"><Trash2 className="size-3.5" />Delete</button>
          </div>
        ) : null}
        <p className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-background/85 px-2.5 py-1 text-[11px] text-muted-foreground" aria-label="Scale">{mmPerUnit ? "Scale set" : "Not calibrated"}</p>
      </div>
      {onCalibrate ? <button type="button" onClick={() => chooseTool("calibrate")} aria-pressed={tool === "calibrate"} className="min-h-10 rounded-lg border px-3 text-xs font-medium hover:bg-muted">Calibrate scale</button> : null}
    </div>
  );
}

function describe(shape?: MarkupShape) {
  if (!shape) return "";
  if (shape.text) return `${shape.type}: ${shape.text}`;
  return shape.type;
}

function ShapeView({ shape, arrowId, selected, pin }: { shape: MarkupShape; arrowId: string; selected: boolean; pin?: MarkupPin }) {
  const [a, b] = [shape.points[0]!, shape.points.at(-1)!];
  const stroke = { stroke: shape.color, strokeWidth: shape.type === "highlighter" ? 14 : 3, vectorEffect: "non-scaling-stroke" as const, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const halo = selected ? <rect x={Math.min(...shape.points.map((p) => p[0])) - shape.size * 2} y={Math.min(...shape.points.map((p) => p[1])) - shape.size * 2} width={Math.max(...shape.points.map((p) => p[0])) - Math.min(...shape.points.map((p) => p[0])) + shape.size * 4} height={Math.max(...shape.points.map((p) => p[1])) - Math.min(...shape.points.map((p) => p[1])) + shape.size * 4} fill="none" stroke="#2563eb" strokeDasharray="6 4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" /> : null;
  const body = (() => {
    switch (shape.type) {
      case "pen":
      case "highlighter":
        return <polyline points={shape.points.map(([x, y]) => `${x},${y}`).join(" ")} {...stroke} />;
      case "line":
        return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...stroke} />;
      case "arrow":
        return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...stroke} markerEnd={`url(#${arrowId})`} />;
      case "rect":
        return <rect x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} {...stroke} />;
      case "circle":
        return <ellipse cx={(a[0] + b[0]) / 2} cy={(a[1] + b[1]) / 2} rx={Math.abs(b[0] - a[0]) / 2} ry={Math.abs(b[1] - a[1]) / 2} {...stroke} />;
      case "cloud":
        return <path d={cloudPath(a, b)} {...stroke} />;
      case "text":
        return <text x={a[0]} y={a[1]} fontSize={shape.size} fill={shape.color} fontFamily="sans-serif" fontWeight={600} paintOrder="stroke" stroke="white" strokeWidth={shape.size * 0.18}>{shape.text}</text>;
      case "measure":
      case "dimension": {
        const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const tick = shape.size * 0.6;
        const nx = -Math.sin(angle) * tick;
        const ny = Math.cos(angle) * tick;
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        const degrees = (angle * 180) / Math.PI;
        const upright = degrees > 90 || degrees < -90 ? degrees + 180 : degrees;
        return <g>
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...stroke} strokeDasharray={shape.type === "measure" ? "8 5" : undefined} />
          {shape.type === "dimension" ? [a, b].map(([x, y], index) => <line key={index} x1={x - nx} y1={y - ny} x2={x + nx} y2={y + ny} {...stroke} />) : null}
          <text x={mx} y={my - shape.size * 0.4} fontSize={shape.size} textAnchor="middle" fill={shape.color} fontFamily="sans-serif" fontWeight={600} paintOrder="stroke" stroke="white" strokeWidth={shape.size * 0.2} transform={`rotate(${upright} ${mx} ${my})`}>{shape.text}</text>
        </g>;
      }
      case "pin":
        return <g aria-label={`Pin ${pin?.number ?? shape.text ?? ""}`}>
          <path d={`M ${a[0]} ${a[1]} l ${-shape.size * 0.6} ${-shape.size * 1.2} a ${shape.size * 0.7} ${shape.size * 0.7} 0 1 1 ${shape.size * 1.2} 0 z`} fill={pin?.status === "resolved" ? "#16a34a" : shape.color} stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <text x={a[0]} y={a[1] - shape.size * 1.25} fontSize={shape.size * 0.62} textAnchor="middle" fill="white" fontFamily="sans-serif" fontWeight={700}>{(pin?.number ?? shape.text ?? "").replace(/^PIN-0*/, "")}</text>
        </g>;
    }
  })();
  return <g data-shape={shape.type}>{body}{halo}</g>;
}

/** A revision cloud round a rectangle: scallops a few per side. */
export function cloudPath(a: [number, number], b: [number, number]) {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const bump = Math.max((x1 - x0 + y1 - y0) / 24, 1);
  let path = `M ${x0} ${y0}`;
  for (let side = 0; side < 4; side += 1) {
    const [sx, sy] = corners[side]!;
    const [ex, ey] = corners[(side + 1) % 4]!;
    const length = Math.hypot(ex - sx, ey - sy);
    const count = Math.max(1, Math.round(length / (bump * 2)));
    for (let step = 1; step <= count; step += 1) {
      const px = sx + ((ex - sx) * step) / count;
      const py = sy + ((ey - sy) * step) / count;
      path += ` A ${length / count / 2} ${length / count / 2} 0 0 1 ${px} ${py}`;
    }
  }
  return `${path} Z`;
}

/** How far a point is from a shape, in picture units: what a tap hits. */
export function shapeDistance(shape: MarkupShape, [px, py]: [number, number]): number {
  const segment = (a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / lengthSq)) : 0;
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  };
  const [a, b] = [shape.points[0]!, shape.points.at(-1)!];
  if (shape.type === "text") {
    const width = (shape.text?.length ?? 1) * shape.size * 0.6;
    const inside = px >= a[0] && px <= a[0] + width && py <= a[1] && py >= a[1] - shape.size;
    return inside ? 0 : Math.hypot(px - Math.max(a[0], Math.min(px, a[0] + width)), py - Math.max(a[1] - shape.size, Math.min(py, a[1])));
  }
  if (shape.type === "pin") return Math.hypot(px - a[0], py - (a[1] - shape.size));
  if (shape.type === "rect" || shape.type === "cloud" || shape.type === "circle") {
    const corners: [number, number][] = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
    return Math.min(...corners.map((corner, index) => segment(corner, corners[(index + 1) % 4]!)));
  }
  let best = Infinity;
  for (let index = 1; index < shape.points.length; index += 1) best = Math.min(best, segment(shape.points[index - 1]!, shape.points[index]!));
  return shape.points.length === 1 ? Math.hypot(px - a[0], py - a[1]) : best;
}

/**
 * The markup drawn over its picture, as one PNG: what an Agenda item shows.
 * The picture is drawn first, then the shapes on top, into a new image — the
 * original is not changed.
 */
export async function renderMarkup(background: MarkupBackground, shapes: MarkupShape[], pins: MarkupPin[] = [], maxSide = 1800): Promise<Blob | null> {
  const scale = maxSide / Math.max(background.width, background.height);
  const width = Math.max(1, Math.round(background.width * scale));
  const height = Math.max(1, Math.round(background.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  const load = (src: string) => new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
  const picture = await load(background.url);
  if (picture) context.drawImage(picture, 0, 0, width, height);
  const markup = markupSvg(background, shapes, pins, width, height);
  const overlay = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
  if (overlay) context.drawImage(overlay, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

/** The shapes alone, as SVG in the picture's frame. Strokes are drawn at a fixed share of the picture so the PNG reads like the screen did. */
export function markupSvg(background: MarkupBackground, shapes: MarkupShape[], pins: MarkupPin[], width: number, height: number): string {
  const unitsPerPx = background.width / width;
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  const parts = shapes.map((shape) => {
    const [a, b] = [shape.points[0]!, shape.points.at(-1)!];
    const weight = (shape.type === "highlighter" ? 14 : 3) * unitsPerPx * 1.5;
    const stroke = `stroke="${shape.color}" stroke-width="${weight}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
    switch (shape.type) {
      case "pen": case "highlighter": return `<polyline points="${shape.points.map(([x, y]) => `${x},${y}`).join(" ")}" ${stroke}/>`;
      case "line": return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" ${stroke}/>`;
      case "arrow": {
        const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const head = weight * 4;
        const left = [b[0] - head * Math.cos(angle - 0.45), b[1] - head * Math.sin(angle - 0.45)];
        const right = [b[0] - head * Math.cos(angle + 0.45), b[1] - head * Math.sin(angle + 0.45)];
        return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" ${stroke}/><polygon points="${b[0]},${b[1]} ${left[0]},${left[1]} ${right[0]},${right[1]}" fill="${shape.color}"/>`;
      }
      case "rect": return `<rect x="${Math.min(a[0], b[0])}" y="${Math.min(a[1], b[1])}" width="${Math.abs(b[0] - a[0])}" height="${Math.abs(b[1] - a[1])}" ${stroke}/>`;
      case "circle": return `<ellipse cx="${(a[0] + b[0]) / 2}" cy="${(a[1] + b[1]) / 2}" rx="${Math.abs(b[0] - a[0]) / 2}" ry="${Math.abs(b[1] - a[1]) / 2}" ${stroke}/>`;
      case "cloud": return `<path d="${cloudPath(a, b)}" ${stroke}/>`;
      case "text": return `<text x="${a[0]}" y="${a[1]}" font-size="${shape.size}" fill="${shape.color}" font-family="sans-serif" font-weight="600" paint-order="stroke" stroke="white" stroke-width="${shape.size * 0.18}">${escape(shape.text ?? "")}</text>`;
      case "measure": case "dimension": {
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" ${stroke}${shape.type === "measure" ? ` stroke-dasharray="${weight * 3} ${weight * 2}"` : ""}/><text x="${mx}" y="${my - shape.size * 0.4}" font-size="${shape.size}" text-anchor="middle" fill="${shape.color}" font-family="sans-serif" font-weight="600" paint-order="stroke" stroke="white" stroke-width="${shape.size * 0.2}">${escape(shape.text ?? "")}</text>`;
      }
      case "pin": {
        const pin = pins.find((item) => item.id === shape.pinId);
        const s = shape.size;
        return `<path d="M ${a[0]} ${a[1]} l ${-s * 0.6} ${-s * 1.2} a ${s * 0.7} ${s * 0.7} 0 1 1 ${s * 1.2} 0 z" fill="${pin?.status === "resolved" ? "#16a34a" : shape.color}" stroke="white" stroke-width="${weight / 2}"/><text x="${a[0]}" y="${a[1] - s * 1.25}" font-size="${s * 0.62}" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="700">${escape((pin?.number ?? shape.text ?? "").replace(/^PIN-0*/, ""))}</text>`;
      }
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${background.x} ${background.y} ${background.width} ${background.height}">${parts.join("")}</svg>`;
}
