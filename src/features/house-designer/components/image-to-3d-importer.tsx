"use client";

import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, FileText, ImageUp, PenLine, RotateCcw, Ruler, ScanLine, Trash2, Undo2 } from "lucide-react";
import { detectOrthogonalWalls, IMAGE_IMPORT_KEY, type CandidateLine } from "../services/image-line-detection";
import { loadImage, pdfPageCount, renderPdfPage } from "../services/source-render";

type Point = { x: number; y: number };
const MAX_BYTES = 12 * 1024 * 1024;

export function ImageTo3DImporter() {
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [fileName, setFileName] = useState("");
  const [lines, setLines] = useState<CandidateLine[]>([]);
  const [minLength, setMinLength] = useState(42);
  const [scalePoints, setScalePoints] = useState<Point[]>([]);
  const [knownMetres, setKnownMetres] = useState("3.00");
  const [showLines, setShowLines] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"calibrate" | "review" | "add">("calibrate");
  const pdfUrl = useRef<string | null>(null);
  const [pdfPages, setPdfPages] = useState(0);
  const [pdfPage, setPdfPage] = useState(1);
  const [reviewed, setReviewed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [newStart, setNewStart] = useState<Point | null>(null);
  const [history, setHistory] = useState<CandidateLine[][]>([]);
  const endpointDrag = useRef<{ pointerId: number; index: number; end: "first" | "last"; before: CandidateLine[]; moved: boolean } | null>(null);
  useEffect(() => () => { if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current); }, []);
  function checkpoint() {
    setHistory(previous => [...previous.slice(-19), lines.map(line => ({ ...line }))]);
  }
  function undoEdit() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory(current => current.slice(0, -1));
    setLines(previous);
    setSelected(null);
    setReviewed(false);
    setNewStart(null);
  }

  function draw() {
    const el = canvas.current, original = image.current;
    if (!el || !original) return;
    el.width = original.width;
    el.height = original.height;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(original, 0, 0);
    if (showLines) {
      ctx.lineWidth = 2.5;
      for (const [index, line] of lines.entries()) {
        ctx.strokeStyle = index === selected ? "#2563eb" : "#16a34a";
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
      }
      if (selected !== null && lines[selected]) {
        ctx.fillStyle = "#2563eb";
        const line = lines[selected]!;
        for (const point of [{ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }]) {
          ctx.beginPath(); ctx.arc(point.x, point.y, 8, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    if (newStart) {
      ctx.beginPath(); ctx.arc(newStart.x, newStart.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = "#2563eb"; ctx.fill();
    }
    ctx.strokeStyle = "#f97316";
    ctx.fillStyle = "#f97316";
    ctx.lineWidth = 2;
    for (let i = 0; i < scalePoints.length; i++) {
      const p = scalePoints[i]!;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
      if (i === 1) {
        ctx.beginPath();
        ctx.moveTo(scalePoints[0]!.x, scalePoints[0]!.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }
  }
  useEffect(draw, [lines, scalePoints, showLines, size, selected, newStart]);

  function detect(min: number) {
    const original = image.current;
    if (!original) return;
    const ctx = original.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    try {
      const result = detectOrthogonalWalls(ctx.getImageData(0, 0, original.width, original.height), min);
      setLines(result);
      setHistory([]);
      setSelected(null);
      setReviewed(false);
      setNewStart(null);
      setError(result.length ? "" : "No long, straight wall candidates found. Try a clean CAD screenshot or lower the minimum line length.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not inspect the image."); }
  }

  async function loadRaster(source: HTMLImageElement | ImageBitmap, label: string) {
    const scale = Math.min(1, 1100 / Math.max(source.width, source.height));
    const width = Math.max(80, Math.round(source.width * scale));
    const height = Math.max(80, Math.round(source.height * scale));
    const original = document.createElement("canvas");
    original.width = width; original.height = height;
    const ctx = original.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Your browser cannot process this image.");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    if ("close" in source && typeof source.close === "function") source.close();
    image.current = original;
    setSize({ width, height });
    setScalePoints([]);
    setMode("calibrate");
    setFileName(label);
    const detected = detectOrthogonalWalls(ctx.getImageData(0, 0, width, height), minLength);
    setLines(detected);
    setSelected(null); setNewStart(null); setHistory([]); setReviewed(false);
    setError(detected.length ? "" : "No straight walls detected. Use a clearer image, add the walls by hand, or lower minimum line length.");
  }

  async function loadPdfPage(url: string, page: number, label: string) {
    setBusy(true);
    setError("");
    try {
      const rendered = await renderPdfPage(url, page, 2);
      const bitmap = await loadImage(rendered.background.url);
      await loadRaster(bitmap, label);
      setPdfPage(page);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not render the selected PDF page.");
    } finally { setBusy(false); }
  }

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setError("");
    if (!["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(file.type)) {
      setError("Upload a PNG, JPG, WebP or PDF file. For CAD files, first export to PDF or an image.");
      return;
    }
    if (file.size > MAX_BYTES) { setError("Choose a file smaller than 12 MB."); return; }
    if (pdfUrl.current) { URL.revokeObjectURL(pdfUrl.current); pdfUrl.current = null; }
    setPdfPages(0);
    setBusy(true);
    try {
      if (file.type === "application/pdf") {
        const url = URL.createObjectURL(file);
        pdfUrl.current = url;
        const pages = await pdfPageCount(url);
        if (pages < 1) throw new Error("This PDF contains no pages.");
        setPdfPages(pages);
        await loadPdfPage(url, 1, file.name);
      } else {
        const bitmap = await createImageBitmap(file);
        await loadRaster(bitmap, file.name);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not load the floor plan.");
    } finally { setBusy(false); }
  }

  function at(event: PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(size.width, (event.clientX - rect.left) * size.width / rect.width)),
      y: Math.max(0, Math.min(size.height, (event.clientY - rect.top) * size.height / rect.height)),
    };
  }
  function distanceToLine(point: Point, line: CandidateLine) {
    const dx = line.x2 - line.x1, dy = line.y2 - line.y1;
    const t = Math.max(0, Math.min(1, ((point.x - line.x1) * dx + (point.y - line.y1) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(point.x - line.x1 - t * dx, point.y - line.y1 - t * dy);
  }
  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (mode !== "review" || selected === null || !lines[selected]) return;
    const p = at(event);
    const line = lines[selected]!;
    const rect = event.currentTarget.getBoundingClientRect();
    const tolerance = 24 * size.width / (rect.width || 1);
    const dFirst = Math.hypot(line.x1 - p.x, line.y1 - p.y);
    const dLast = Math.hypot(line.x2 - p.x, line.y2 - p.y);
    const end = dFirst < dLast ? "first" : "last";
    if (Math.min(dFirst, dLast) > tolerance) return;
    endpointDrag.current = { pointerId: event.pointerId, index: selected, end, before: lines.map(l => ({ ...l })), moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const drag = endpointDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const p = at(event);
    const line = drag.before[drag.index];
    if (!line) return;
    const changed = drag.end === "first"
      ? { ...line, x1: p.x, y1: p.y }
      : { ...line, x2: p.x, y2: p.y };
    // Candidate line edits may be diagonal; the existing freehand converter
    // preserves intentional diagonals when it generates editable walls.
    setLines(current => current.map((l, index) => index === drag.index ? changed : l));
    drag.moved = true;
  }
  function pickPoint(event: PointerEvent<HTMLCanvasElement>) {
    const p = at(event);
    const drag = endpointDrag.current;
    if (drag && drag.pointerId === event.pointerId) {
      if (drag.moved) {
        const line = lines[drag.index];
        const length = line ? Math.hypot(line.x2 - line.x1, line.y2 - line.y1) : 0;
        if (length < 10) setLines(drag.before);
        else { setHistory(previous => [...previous.slice(-19), drag.before]); setReviewed(false); }
      }
      endpointDrag.current = null;
      return;
    }
    if (mode === "calibrate") {
      setScalePoints(previous => previous.length >= 2 ? [p] : [...previous, p]);
      return;
    }
    if (mode === "add") {
      if (!newStart) { setNewStart(p); return; }
      if (Math.hypot(p.x - newStart.x, p.y - newStart.y) < 12) {
        setError("Choose an endpoint at least 12 pixels away.");
        return;
      }
      if (lines.length >= 80) { setError("This import supports up to 80 walls. Delete unwanted detections first."); return; }
      const dx = p.x - newStart.x, dy = p.y - newStart.y;
      const orientation: CandidateLine["orientation"] = Math.abs(dx) < Math.abs(dy) * 0.08 ? "v" : Math.abs(dy) < Math.abs(dx) * 0.08 ? "h" : "diagonal";
      checkpoint();
      setLines(current => [...current, { x1: newStart.x, y1: newStart.y, x2: p.x, y2: p.y, orientation, support: 1 }]);
      setSelected(lines.length);
      setNewStart(null);
      setMode("review");
      setReviewed(false);
      setError("");
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const tolerance = Math.max(12, 18 * size.width / Math.max(1, rect.width));
    let closest = -1, best = tolerance;
    for (const [index, line] of lines.entries()) {
      const d = distanceToLine(p, line);
      if (d < best) { closest = index; best = d; }
    }
    setSelected(closest >= 0 ? closest : null);
  }

  function removeSelected() {
    if (selected === null || !lines[selected]) return;
    checkpoint();
    setLines(previous => previous.filter((_, index) => index !== selected));
    setSelected(null);
    setReviewed(false);
  }

  const pixelLength = scalePoints.length === 2
    ? Math.hypot(scalePoints[1]!.x - scalePoints[0]!.x, scalePoints[1]!.y - scalePoints[0]!.y)
    : 0;
  const metres = Number(knownMetres);
  const calibrated = pixelLength >= 12 && Number.isFinite(metres) && metres >= 0.2 && metres <= 100;

  function openPlan() {
    if (!calibrated || !lines.length || lines.length > 80 || !reviewed) {
      setError("Calibrate one known distance, check the detected lines and confirm review before importing.");
      return;
    }
    // Local hand-off: only verified vectors and scale, never the uploaded
    // image itself. Avoids sending sensitive plans to a paid AI service.
    const payload = {
      version: 1,
      createdAt: Date.now(),
      source: fileName,
      mmPerUnit: metres * 1000 / pixelLength,
      lines: lines.map(l => ({ start: { x: l.x1, y: l.y1 }, end: { x: l.x2, y: l.y2 } })),
    };
    try {
      sessionStorage.setItem(IMAGE_IMPORT_KEY, JSON.stringify(payload));
      router.push("/house-design?import=image");
    } catch {
      setError("Could not hand off the detected plan. Free device storage and retry.");
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <ScanLine className="size-5 text-brand" />
        <h2 className="text-lg font-semibold">Detect walls without AI</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        First version: straight horizontal and vertical walls from clean, high-contrast CAD screenshots.
        Everything runs in your browser. Check the green lines before opening the editable 3D plan.
      </p>
      <label className="flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 text-sm font-semibold hover:bg-muted/30">
        <ImageUp className="size-5" />
        {busy ? "Reading image…" : fileName ? `Change image · ${fileName}` : "Choose PNG, JPG or WebP floor plan"}
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void loadFile(event)} className="sr-only" />
      </label>
      {image.current ? (
        <>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold">{lines.length} wall candidates detected</span>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showLines} onChange={e => setShowLines(e.target.checked)} /> Show detected lines</label>
            </div>
            <canvas ref={canvas} width={size.width} height={size.height}
              onPointerUp={pickPoint} style={{ touchAction: "manipulation" }}
              className="w-full rounded-lg border bg-white" aria-label="Floor plan image; tap two ends of a known dimension to calibrate" />
            <p className="text-xs text-muted-foreground">Green = detected wall candidates. Orange = calibration points. Walls and openings must be reviewed after import.</p>
          </div>
          <label className="block space-y-2 text-sm">
            <span>Minimum detected line length: {minLength} px</span>
            <input type="range" min="25" max="150" step="5" value={minLength}
              onChange={e => { const value = Number(e.target.value); setMinLength(value); detect(value); }}
              className="w-full" />
          </label>
          <div className="space-y-3 rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Ruler className="size-4" /> Calibrate real scale</h3>
              <button type="button" onClick={() => { setMode("calibrate"); setScalePoints([]); }} className="flex items-center gap-1 text-xs text-brand"><RotateCcw className="size-3" /> Pick again</button>
            </div>
            <p className="text-xs text-muted-foreground">Tap the two ends of one known length in the image (for example, a printed 3.00 m wall dimension).</p>
            <label className="flex items-center gap-2 text-sm">
              Real length
              <input type="number" min="0.2" max="100" step="0.01" value={knownMetres}
                onChange={e => setKnownMetres(e.target.value)} className="min-h-11 w-28 rounded-lg border bg-background px-3 text-right" />
              metres
            </label>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {calibrated ? <><Check className="size-4 text-emerald-600" /> Calibrated: {pixelLength.toFixed(0)} px = {metres.toFixed(2)} m</> : `${scalePoints.length}/2 points selected — select two points to continue`}
            </p>
          </div>
          {error ? <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p> : null}
          <button type="button" disabled={!calibrated || !lines.length} onClick={openPlan}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground disabled:opacity-40">
            Open detected walls in House Design <ArrowRight className="size-4" />
          </button>
          <p className="text-xs text-muted-foreground">
            This is a candidate geometry import, not a guaranteed accurate 3D conversion. Confirm wall positions,
            wall thickness, doors, windows and enclosed rooms before measuring m² or estimating materials.
          </p>
        </>
      ) : error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
