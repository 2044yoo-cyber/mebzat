"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Pencil,
  Eraser,
  Undo2,
  Redo2,
  Hand,
  Magnet,
  Save,
  Ruler,
  ZoomIn,
  ZoomOut,
  Check,
} from "lucide-react";
import type { HouseProject } from "../types/project";
import {
  convertStrokes,
  inspectFreehand,
  suggestFreehandRepairs,
  foot,
  strokeSegments,
  type Point,
  type Stroke,
} from "../services/freehand";

type Sketch = NonNullable<HouseProject["freehandSketch"]>;
const empty: Sketch = {
  version: 1,
  strokes: [],
  mmPerUnit: 20,
  calibrated: false,
};
export function FreehandCanvas({
  initial,
  readOnly = false,
  onClose,
  onSave,
  onConvert,
}: {
  initial?: Sketch;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (sketch: Sketch) => void;
  onConvert: (sketch: Sketch, snap: number, unitsPerPixel: number) => void;
}) {
  const [sketch, setSketch] = useState<Sketch>(initial ?? empty);
  const [tool, setTool] = useState<"draw" | "erase" | "pan">(
    readOnly ? "pan" : "draw",
  );
  const [past, setPast] = useState<Sketch[]>([]),
    [future, setFuture] = useState<Sketch[]>([]);
  const [snap, setSnap] = useState(true),
    [thickness, setThickness] = useState(200);
  const [message, setMessage] = useState(
    "Draw walls with one finger. Lift to straighten. Use Hand to pan.",
  );
  const [review, setReview] = useState(false);
  const [focusedIssue, setFocusedIssue] = useState<string | null>(null);
  const [rejectedRepairs, setRejectedRepairs] = useState<string[]>([]);
  const dialog = useRef<HTMLDivElement>(null);
  const preview = useRef<{ strokes: Sketch["strokes"]; snap: boolean; zoom: number; segments: ReturnType<typeof strokeSegments> } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    live = useRef<Point[]>([]);
  const gesture = useRef<{
    id: number;
    last: Point;
    erase: Set<string>;
  } | null>(null);
  const view = useRef({ x: 0, y: 0, zoom: 1 });
  const frame = useRef(0),
    status = useRef<HTMLSpanElement>(null);
  const state = useRef({ sketch, tool, snap, thickness });
  state.current = { sketch, tool, snap, thickness };
  const redraw = useRef<() => void>(() => {});
  function schedule() {
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        redraw.current();
      });
  }
  redraw.current = () => {
    const el = canvas.current,
      ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const { width, height } = el.getBoundingClientRect(),
      dpr = window.devicePixelRatio || 1;
    if (
      el.width !== Math.round(width * dpr) ||
      el.height !== Math.round(height * dpr)
    ) {
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fafbfc";
    ctx.fillRect(0, 0, width, height);
    const v = view.current;
    ctx.translate(v.x, v.y);
    ctx.scale(v.zoom, v.zoom);
    const draw = (
      points: readonly Point[],
      color: string,
      lineWidth: number,
    ) => {
      if (!points.length) return;
      ctx.beginPath();
      ctx.moveTo(points[0]!.x, points[0]!.y);
      for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth / v.zoom;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    };
    for (const stroke of state.current.sketch.strokes) {
      if (!gesture.current?.erase.has(stroke.id)) draw(stroke.points, "#bdc5cf", 1);
    }
    // Preview exactly the same joined, split wall graph used by Convert to Plan.
    // Cache while moving the pointer so drawing stays responsive on phones.
    const visibleStrokes = state.current.sketch.strokes;
    let geometry = preview.current;
    if (!geometry || geometry.strokes !== visibleStrokes || geometry.snap !== state.current.snap || geometry.zoom !== v.zoom) {
      try {
        geometry = { strokes: visibleStrokes, snap: state.current.snap, zoom: v.zoom,
          segments: convertStrokes(visibleStrokes, 1, state.current.snap ? 12 : 0, 1 / v.zoom) };
      } catch {
        geometry = { strokes: visibleStrokes, snap: state.current.snap, zoom: v.zoom, segments: [] };
      }
      preview.current = geometry;
    }
    const points = new Map<string, Point>();
    for (const segment of geometry.segments) {
      draw([segment.start, segment.end], "#233c59", 2);
      for (const p of [segment.start, segment.end])
        points.set(`${p.x.toFixed(3)}:${p.y.toFixed(3)}`, p);
    }
    if (review) {
      const diagnostics = inspectFreehand(visibleStrokes, state.current.snap ? 12 : 0, 1 / v.zoom);
      for (const issue of diagnostics.issues) {
        ctx.beginPath();
        ctx.arc(issue.point.x, issue.point.y, (focusedIssue === issue.id ? 10 : 6) / v.zoom, 0, 2 * Math.PI);
        ctx.fillStyle = issue.kind === "open-end" ? "#dc2626" : "#d97706";
        ctx.fill();
        ctx.lineWidth = 2 / v.zoom;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }
    }
    if (review) {
      const proposals = suggestFreehandRepairs(visibleStrokes, state.current.snap ? 12 : 0, 1 / v.zoom);
      const highlighted = proposals.find(p => p.id === focusedIssue);
      if (highlighted) draw([highlighted.start, highlighted.end], "#16a34a", 5);
    }
    for (const p of points.values()) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 / v.zoom, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = "#4c769a";
      ctx.lineWidth = 1 / v.zoom;
      ctx.stroke();
    }
    draw(live.current, "#63a5f6", 2);
    if (live.current.length > 1) {
      const a = live.current[0]!,
        b = live.current.at(-1)!;
      draw([a, b], "#93b8dc", 1);
      const length =
        (Math.hypot(b.x - a.x, b.y - a.y) * state.current.sketch.mmPerUnit) /
        1000;
      if (status.current)
        status.current.textContent = `≈ ${length.toFixed(2)} m · ${((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI).toFixed(0)}°`;
      if (state.current.snap) {
        const nearby = state.current.sketch.strokes
          .flatMap((s) => strokeSegments(s))
          .flatMap((s) => [s.start, s.end])
          .find((p) => Math.hypot(p.x - b.x, p.y - b.y) < 12 / v.zoom);
        if (nearby) {
          ctx.beginPath();
          ctx.arc(nearby.x, nearby.y, 9 / v.zoom, 0, 2 * Math.PI);
          ctx.strokeStyle = "#17a673";
          ctx.lineWidth = 2 / v.zoom;
          ctx.stroke();
        }
      }
    }
  };
  useEffect(() => {
    const el = canvas.current;
    const points = state.current.sketch.strokes.flatMap(s => s.points);
    if (el && points.length) {
      // Reopening on a different phone size still shows the original drawing.
      const rect = el.getBoundingClientRect();
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for (const p of points) { minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y); }
      const zoom=Math.max(.1,Math.min(2,(rect.width-40)/Math.max(maxX-minX,1),(rect.height-40)/Math.max(maxY-minY,1)));
      view.current={zoom,x:20-minX*zoom,y:20-minY*zoom};
    }
    const observer = new ResizeObserver(schedule);
    if (canvas.current) observer.observe(canvas.current);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, []);
  useEffect(() => {
    preview.current = null;
    schedule();
  }, [sketch, snap, review, focusedIssue]);
  useEffect(() => {
    dialog.current?.focus();
  }, []);
  function commit(next: Sketch) {
    setPast((p) => [...p, sketch].slice(-60));
    setFuture([]);
    setSketch(next);
    setReview(false);
    setRejectedRepairs([]);
    onSave(next);
  }
  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    setFuture((p) => [sketch, ...p]);
    setPast((p) => p.slice(0, -1));
    setSketch(previous);
    onSave(previous);
  }
  function redo() {
    const next = future[0];
    if (!next) return;
    setPast((p) => [...p, sketch]);
    setFuture((p) => p.slice(1));
    setSketch(next);
    onSave(next);
  }
  function point(e: { clientX: number; clientY: number }) {
    const r = canvas.current!.getBoundingClientRect(),
      v = view.current;
    return {
      x: (e.clientX - r.left - v.x) / v.zoom,
      y: (e.clientY - r.top - v.y) / v.zoom,
    };
  }
  function erase(p: Point) {
    for (const s of sketch.strokes)
      for (let i = 1; i < s.points.length; i++) {
        const q = foot(p, s.points[i - 1]!, s.points[i]!);
        if (Math.hypot(p.x - q.x, p.y - q.y) < 14 / view.current.zoom) {
          gesture.current?.erase.add(s.id);
          break;
        }
      }
  }
  function calibrate() {
    const segments = convertStrokes(
      sketch.strokes,
      1,
      snap ? 12 : 0,
      1 / view.current.zoom,
    );
    if (!segments.length) {
      setMessage("Draw a wall first, then set its known length.");
      return;
    }
    // Choose a single, explicitly identified reference: the first converted wall.
    const wall = segments[0]!,
      units = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    const answer = window.prompt(
      "Known length of the FIRST drawn wall (metres). This uniformly scales the whole sketch.",
      sketch.calibrated ? ((units * sketch.mmPerUnit) / 1000).toFixed(3) : "",
    );
    if (answer === null) return;
    const metres = Number(answer);
    if (!Number.isFinite(metres) || metres <= 0) {
      setMessage("Enter a positive length in metres, for example 4.00.");
      return;
    }
    if (
      sketch.calibrated &&
      Math.abs((metres * 1000) / units - sketch.mmPerUnit) > 0.001 &&
      !window.confirm(
        "This replaces your previous scale. Keep the old scale by choosing Cancel.",
      )
    )
      return;
    commit({ ...sketch, mmPerUnit: (metres * 1000) / units, calibrated: true });
    setMessage(
      "Scale set from the first wall. Check every other dimension in Plan mode.",
    );
  }
  function zoom(factor: number) {
    view.current.zoom = Math.max(0.25, Math.min(4, view.current.zoom * factor));
    schedule();
  }
  const button = (
    label: string,
    Icon: typeof Pencil,
    action: () => void,
    active = false,
    disabled = false,
  ) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={action}
      className={`flex size-11 shrink-0 items-center justify-center rounded-lg disabled:opacity-30 ${active ? "bg-blue-100 text-blue-700" : "hover:bg-slate-100"}`}
    >
      <Icon className="size-5" />
    </button>
  );
  return (
    <div
      ref={dialog}
      tabIndex={-1}
      onKeyDownCapture={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          e.stopPropagation();
          if (!readOnly) {
            if (e.shiftKey) redo();
            else undo();
          }
        }
        if (e.key === "Tab") {
          const nodes = dialog.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled)",
          );
          if (nodes?.length) {
            const first = nodes[0]!,
              last = nodes[nodes.length - 1]!;
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === dialog.current)
            ) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Freehand Sketch"
      className="fixed inset-0 z-[100] flex flex-col bg-white text-slate-800"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <header className="flex items-center gap-2 border-b px-2 py-1">
        {button("Back to plan", ArrowLeft, onClose)}
        <div className="flex-1">
          <strong className="text-sm">Freehand Sketch</strong>
          <p className="text-xs text-slate-500">
            {readOnly
              ? "Original sketch · edits are in Plan mode"
              : sketch.calibrated
                ? "Scale calibrated · verify dimensions"
                : "Approximate scale · set a known wall length"}
          </p>
        </div>
        {button("Save sketch", Save, () => {
          onSave(sketch);
          setMessage(
            "Sketch added to your draft. Use Save project to sync it.",
          );
        })}
      </header>
      <div
        className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1"
        role="toolbar"
        aria-label="Sketch tools"
      >
        {button(
          "Draw wall",
          Pencil,
          () => setTool("draw"),
          tool === "draw",
          readOnly,
        )}
        {button(
          "Erase stroke",
          Eraser,
          () => setTool("erase"),
          tool === "erase",
          readOnly,
        )}
        {button(
          "Pan / lock drawing",
          Hand,
          () => setTool("pan"),
          tool === "pan",
        )}
        {button("Undo stroke", Undo2, undo, false, !past.length || readOnly)}
        {button("Redo stroke", Redo2, redo, false, !future.length || readOnly)}
        {button(
          "Toggle snapping",
          Magnet,
          () => setSnap(!snap),
          snap,
          readOnly,
        )}
        {button("Set scale", Ruler, calibrate, false, readOnly)}
        {button("Zoom in", ZoomIn, () => zoom(1.25))}
        {button("Zoom out", ZoomOut, () => zoom(0.8))}
        <label className="flex items-center gap-1 whitespace-nowrap text-xs">
          mm
          <input
            aria-label="Wall thickness in millimetres"
            type="number"
            min="1"
            max="600"
            step="0.1"
            value={thickness}
            disabled={readOnly}
            onChange={(e) =>
              setThickness(
                Math.min(600, Math.max(1, Number(e.target.value) || 200)),
              )
            }
            className="w-16 rounded border p-2"
          />
        </label>
      </div>
      <canvas
        ref={canvas}
        aria-label="Draw freehand walls"
        className="min-h-0 w-full flex-1"
        style={{ touchAction: "none", overscrollBehavior: "none" }}
        onPointerDown={(e) => {
          if (gesture.current || e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          gesture.current = {
            id: e.pointerId,
            last: { x: e.clientX, y: e.clientY },
            erase: new Set(),
          };
          const p = point(e);
          if (tool === "draw") live.current = [p];
          if (tool === "erase") erase(p);
          schedule();
        }}
        onPointerMove={(e) => {
          const g = gesture.current;
          if (!g || g.id !== e.pointerId) return;
          e.preventDefault();
          if (tool === "pan") {
            view.current.x += e.clientX - g.last.x;
            view.current.y += e.clientY - g.last.y;
            g.last = { x: e.clientX, y: e.clientY };
          } else if (tool === "erase") erase(point(e));
          else {
            const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
            for (const sample of events.length ? events : [e]) {
              const p = point(sample),
                last = live.current.at(-1);
              if (
                live.current.length < 10000 &&
                (!last ||
                  Math.hypot(p.x - last.x, p.y - last.y) >
                    0.4 / view.current.zoom)
              )
                live.current.push(p);
            }
          }
          schedule();
        }}
        onPointerUp={(e) => {
          const g = gesture.current;
          if (!g || g.id !== e.pointerId) return;
          if (
            tool === "draw" &&
            live.current.length > 1 &&
            sketch.strokes.length < 500
          ) {
            const stroke = {
              id: crypto.randomUUID(),
              points: [...live.current, point(e)],
              thickness,
            };
            if (strokeSegments(stroke).length)
              commit({ ...sketch, strokes: [...sketch.strokes, stroke] });
          } else if (tool === "erase" && g.erase.size)
            commit({
              ...sketch,
              strokes: sketch.strokes.filter((s) => !g.erase.has(s.id)),
            });
          live.current = [];
          gesture.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
          schedule();
        }}
        onPointerCancel={() => {
          live.current = [];
          gesture.current = null;
          schedule();
        }}
        onLostPointerCapture={() => {
          live.current = [];
          gesture.current = null;
          schedule();
        }}
      />
      <footer className="space-y-2 border-t p-3">
        <p className="text-xs text-slate-500" role="status">
          {message} <span ref={status} />
        </p>
        {review && !readOnly ? (() => {
          const result = inspectFreehand(sketch.strokes, snap ? 12 : 0, 1 / view.current.zoom);
          const open = result.issues.filter(issue => issue.kind === "open-end");
          const short = result.issues.filter(issue => issue.kind === "short-wall");
          const repairs = suggestFreehandRepairs(sketch.strokes, snap ? 12 : 0, 1 / view.current.zoom).filter(p => !rejectedRepairs.includes(p.id));
          return <div className="max-h-[30dvh] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <strong className="block text-sm">Review Plan · {result.segments.length} walls</strong>
            <p>{open.length} open endpoints · {short.length} short pieces</p>
            {repairs.length ? <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-2">
              <strong className="block text-green-900">{repairs.length} suggested endpoint connections</strong>
              {repairs.slice(0, 15).map(proposal => <div key={proposal.id} className="rounded border bg-white p-2">
                <p>{proposal.label} · ~{Math.round(proposal.length * view.current.zoom)} screen px</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="rounded border px-3 py-2 text-blue-800" onClick={() => {
                    setFocusedIssue(proposal.id);
                    const r = canvas.current?.getBoundingClientRect();
                    if (r) {
                      view.current.x = r.width / 2 - ((proposal.start.x + proposal.end.x) / 2) * view.current.zoom;
                      view.current.y = r.height / 2 - ((proposal.start.y + proposal.end.y) / 2) * view.current.zoom;
                    }
                    schedule();
                  }}>Preview</button>
                  <button type="button" className="rounded bg-green-700 px-3 py-2 text-white" onClick={() => {
                    const next: Sketch = {...sketch, strokes: [...sketch.strokes, {
                      id: crypto.randomUUID(), points: [proposal.start, proposal.end],
                      thickness: sketch.strokes[0]?.thickness ?? thickness
                    }]};
                    commit(next);
                    setReview(true);
                    setMessage("Connection added. Undo stroke reverses this repair.");
                  }}>Accept</button>
                  <button type="button" className="rounded border px-3 py-2" onClick={() => {
                    setRejectedRepairs(list => [...list, proposal.id]);
                    setFocusedIssue(null);
                  }}>Reject</button>
                </div>
              </div>)}
            </div> : null}

            {!sketch.calibrated ? <p className="font-medium text-amber-800">Dimensions are approximate. Set a known wall length before estimating costs.</p> : null}
            {result.issues.length === 0 ? <p className="text-green-700">No open endpoints or tiny pieces detected. Verify the rooms after conversion.</p> : result.issues.slice(0, 30).map((issue, index) =>
              <button key={issue.id} type="button" onClick={() => {
                const rect = canvas.current?.getBoundingClientRect();
                if (rect) {
                  view.current.x = rect.width / 2 - issue.point.x * view.current.zoom;
                  view.current.y = rect.height / 2 - issue.point.y * view.current.zoom;
                }
                setFocusedIssue(issue.id);
                schedule();
              }} className="block w-full rounded-lg border bg-white p-2 text-left text-slate-700">
                {index + 1}. {issue.detail} <span className="text-blue-700">Show on drawing</span>
              </button>)}
            {result.issues.length > 30 ? <p>Showing the first 30 warnings.</p> : null}
            <p className="text-slate-500">Red markers need review. No walls are added or removed automatically; use Draw / Erase or Undo to repair them.</p>
          </div>;
        })() : null}
        <button
          type="button"
          onClick={() => {
            if (readOnly) { onClose(); return; }
            try {
              if (!review) { setReview(true); setTool("pan"); schedule(); return; }
              const result = inspectFreehand(sketch.strokes, snap ? 12 : 0, 1 / view.current.zoom);
              if (!result.segments.length) { setMessage("Draw at least one wall."); return; }
              const gaps = result.issues.filter(issue => issue.kind === "open-end").length;
              if (gaps && !window.confirm(`${gaps} open endpoints remain. Convert anyway? Cancel to repair first.`)) return;
              onConvert(sketch, snap ? 12 : 0, 1 / view.current.zoom);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Conversion failed");
            }
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 p-3 text-sm font-semibold text-white"
        >
          <Check className="size-4" />
          {readOnly ? "Return to editable plan" : review ? "Confirm Conversion" : "Review & Repair Plan"}
        </button>
        {review && !readOnly ? <button type="button" onClick={() => { setReview(false); setFocusedIssue(null); setTool("draw"); }} className="w-full rounded-lg border p-2 text-sm">Back to Drawing</button> : null}
        <p className="text-center text-[11px] text-slate-500">
          Select, split, doors/windows and exact dimensions are available in
          Plan mode.
        </p>
      </footer>
    </div>
  );
}
