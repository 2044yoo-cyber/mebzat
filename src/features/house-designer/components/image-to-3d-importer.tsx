"use client";

import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, FileText, ImageUp, PenLine, RotateCcw, Ruler, ScanLine, Trash2, Undo2 } from "lucide-react";
import { detectOrthogonalWalls, IMAGE_IMPORT_KEY, type CandidateLine } from "../services/image-line-detection";
import { loadImage, pdfPageCount, renderPdfPage } from "../services/source-render";
import { dxfWallPreview, parseDxfWallDrawing, MAX_REVIEWED_WALLS, type DxfWallDrawing } from "../services/dxf-wall-import";

type Point = { x: number; y: number };
const MAX_BYTES = 12 * 1024 * 1024;

export function ImageTo3DImporter() {
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [fileName, setFileName] = useState("");
  const dxfDrawing = useRef<DxfWallDrawing | null>(null);
  const [sourceKind, setSourceKind] = useState<"raster" | "cad">("raster");
  const [cadLayers, setCadLayers] = useState<DxfWallDrawing["layers"]>([]);
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [cadMmPerPixel, setCadMmPerPixel] = useState<number | null>(null);
  const [useCadUnits, setUseCadUnits] = useState(true);
  const [cadTotal, setCadTotal] = useState(0);
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
    dxfDrawing.current = null;
    setSourceKind("raster");
    setCadLayers([]); setSelectedLayers([]); setCadMmPerPixel(null); setCadTotal(0);
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

  function refreshDxf(drawing: DxfWallDrawing, layers: readonly string[]) {
    const selected = new Set(layers);
    const preview = dxfWallPreview(drawing, selected);
    const background = document.createElement("canvas");
    background.width = preview.width; background.height = preview.height;
    const ctx = background.getContext("2d");
    if (!ctx) throw new Error("This phone cannot display CAD linework.");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, background.width, background.height);
    ctx.strokeStyle = "#52525b"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const line of preview.background) {
      const a = preview.toPixel(line.a), b = preview.toPixel(line.b);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    image.current = background;
    setSize({ width: preview.width, height: preview.height });
    setCadMmPerPixel(preview.mmPerPixel);
    setCadTotal(preview.total);
    setSelectedLayers([...layers]);
    setLines(preview.lines);
    setScalePoints([]); setMode("review"); setSelected(null);
    setNewStart(null); setHistory([]); setReviewed(false); setShowLines(true);
    setError(preview.total === 0 ? "Choose at least one layer containing walls." :
      preview.total > MAX_REVIEWED_WALLS
        ? `This layer selection has ${preview.total} segments. Select fewer wall layers (maximum ${MAX_REVIEWED_WALLS} editable segments per import).`
        : "");
  }

  function changeDxfLayer(layer: string, enabled: boolean) {
    const drawing = dxfDrawing.current;
    if (!drawing) return;
    if ((history.length > 0 || reviewed) &&
      !window.confirm("Changing CAD layers resets wall edits and review. Continue?")) return;
    const next = enabled
      ? [...selectedLayers.filter(name => name !== layer), layer]
      : selectedLayers.filter(name => name !== layer);
    refreshDxf(drawing, next);
  }

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setError("");
    const isDxf = /\.dxf$/i.test(file.name) || ["application/dxf", "image/vnd.dxf", "application/x-dxf"].includes(file.type);
    if (!isDxf && !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(file.type)) {
      setError("Upload an ASCII DXF, PNG, JPG, WebP or PDF. DWG must be exported to DXF first.");
      return;
    }
    if (file.size > MAX_BYTES) { setError("Choose a file smaller than 12 MB."); return; }
    if (pdfUrl.current) { URL.revokeObjectURL(pdfUrl.current); pdfUrl.current = null; }
    setPdfPages(0);
    setBusy(true);
    try {
      if (isDxf) {
        const drawing = await parseDxfWallDrawing(await file.text());
        dxfDrawing.current = drawing;
        setSourceKind("cad");
        setUseCadUnits(true);
        setCadLayers(drawing.layers);
        setPdfPages(0);
        setFileName(file.name);
        const suggested = drawing.layers.filter(layer => layer.suggested).map(layer => layer.name);
        refreshDxf(drawing, suggested);
      } else if (file.type === "application/pdf") {
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
      if (lines.length >= MAX_REVIEWED_WALLS || (sourceKind === "cad" && cadTotal > MAX_REVIEWED_WALLS)) {
        setError(`The limit is ${MAX_REVIEWED_WALLS} wall segments. Remove unwanted lines or choose fewer CAD layers.`);
        return;
      }
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
  const manualCalibrated = pixelLength >= 12 && Number.isFinite(metres) && metres >= 0.2 && metres <= 100;
  const automaticCadScale = sourceKind === "cad" && useCadUnits ? cadMmPerPixel : null;
  const calibrated = automaticCadScale !== null || manualCalibrated;

  function openPlan() {
    if (!calibrated || !lines.length || lines.length > MAX_REVIEWED_WALLS ||
      (sourceKind === "cad" && cadTotal > MAX_REVIEWED_WALLS) || !reviewed) {
      setError("Calibrate one known distance, check the detected lines and confirm review before importing.");
      return;
    }
    // Local hand-off: only verified vectors and scale, never the uploaded
    // image itself. Avoids sending sensitive plans to a paid AI service.
    const payload = {
      version: 1,
      createdAt: Date.now(),
      source: fileName,
      mmPerUnit: automaticCadScale ?? metres * 1000 / pixelLength,
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
        Upload a DXF CAD drawing, a floor-plan PDF or a screenshot. DXF uses real vector lines and layer filtering;
        images and PDFs use on-device straight-line detection. No AI service is called.
        Review the wall lines and confirm drawing scale before building the editable 3D plan.
      </p>
      <label className="flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 text-sm font-semibold hover:bg-muted/30">
        <ImageUp className="size-5" />
        {busy ? "Reading drawing…" : fileName ? `Change plan · ${fileName}` : "Upload DXF, PDF, PNG, JPG or WebP floor plan"}
        <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf,.dxf,application/dxf" onChange={event => void loadFile(event)} className="sr-only" />
      </label>
      {sourceKind === "cad" && dxfDrawing.current ? <div className="space-y-3 rounded-xl border p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4 text-brand" /> CAD wall layers</div>
          <span className="text-xs text-muted-foreground">{cadTotal} lines selected</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Only selected layers become editable walls. Turn off dimensions, furniture, hatches and other non-wall layers before continuing.
          Changing layers resets your wall edits.
        </p>
        <div className="grid max-h-60 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
          {cadLayers.map(layer => <label key={layer.name}
            className="flex min-h-11 items-center gap-2 rounded-lg border bg-muted/20 px-2 text-xs">
            <input type="checkbox" checked={selectedLayers.includes(layer.name)}
              onChange={event => changeDxfLayer(layer.name, event.target.checked)} className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate" title={layer.name}>{layer.name}</span>
            <span className="shrink-0 text-muted-foreground">{layer.count}</span>
          </label>)}
        </div>
        <p className="text-xs text-muted-foreground">
          ${cadTotal > MAX_REVIEWED_WALLS
            ? `Too many segments for one editable import (limit ${MAX_REVIEWED_WALLS}). Deselect non-wall or unnecessary CAD layers.`
            : `${Math.max(0, MAX_REVIEWED_WALLS - cadTotal)} more segments allowed in this import.`}
          {dxfDrawing.current.skipped > 0 ? ` ${dxfDrawing.current.skipped} unsupported or curved CAD entities/segments were skipped.` : ""}
        </p>
      </div> : null}
      {pdfPages > 1 && pdfUrl.current ? <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3 text-sm">
        <FileText className="size-5 shrink-0 text-brand" />
        <label className="flex flex-1 items-center gap-2">PDF page
          <select disabled={busy} value={pdfPage} onChange={event => { if (pdfUrl.current) void loadPdfPage(pdfUrl.current, Number(event.target.value), fileName); }}
            className="min-h-11 flex-1 rounded-lg border bg-background px-2">
            {Array.from({ length: pdfPages }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} of {pdfPages}</option>)}
          </select>
        </label>
      </div> : null}
      {image.current ? (
        <>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold">{sourceKind === "cad" ? cadTotal : lines.length} wall candidates · {mode === "calibrate" ? "Scale" : mode === "review" ? "Review" : "Add wall"}</span>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showLines} onChange={e => setShowLines(e.target.checked)} /> Show detected lines</label>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Import editing tool">
              <button type="button" onClick={() => { setMode("calibrate"); setSelected(null); setNewStart(null); }}
                aria-pressed={mode === "calibrate"}
                className={`min-h-11 rounded-lg border px-3 text-xs font-medium ${mode === "calibrate" ? "border-brand bg-brand/10 text-brand" : ""}`}><Ruler className="mr-1 inline size-3.5" />Scale</button>
              <button type="button" onClick={() => { setMode("review"); setNewStart(null); setShowLines(true); }}
                aria-pressed={mode === "review"}
                className={`min-h-11 rounded-lg border px-3 text-xs font-medium ${mode === "review" ? "border-brand bg-brand/10 text-brand" : ""}`}><ScanLine className="mr-1 inline size-3.5" />Review lines</button>
              <button type="button" onClick={() => { setMode("add"); setSelected(null); setShowLines(true); }}
                aria-pressed={mode === "add"}
                className={`min-h-11 rounded-lg border px-3 text-xs font-medium ${mode === "add" ? "border-brand bg-brand/10 text-brand" : ""}`}><PenLine className="mr-1 inline size-3.5" />Add wall</button>
              <button type="button" onClick={undoEdit} disabled={!history.length}
                className="min-h-11 rounded-lg border px-3 text-xs disabled:opacity-30"><Undo2 className="mr-1 inline size-3.5" />Undo</button>
            </div>
            <canvas ref={canvas} width={size.width} height={size.height}
              onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pickPoint}
              onPointerCancel={() => { if (endpointDrag.current) setLines(endpointDrag.current.before); endpointDrag.current = null; }}
              style={{ touchAction: mode === "calibrate" ? "manipulation" : "none" }}
              className="w-full rounded-lg border bg-white"
              aria-label="Floor plan image: calibrate distance, select lines, drag endpoints, or tap two points to add a wall" />
            <p className="text-xs text-muted-foreground">
              {mode === "calibrate" ? "Orange dots: tap two ends of one known dimension." :
                mode === "review" ? "Green: detected walls. Tap a line to select it; drag its blue endpoints to adjust. Remove unwanted dimension or text lines." :
                newStart ? "Tap the second end of the missing wall, or switch to Review to cancel." : "Tap the start and end of a missing wall. Angled walls are allowed."}
            </p>
            {mode === "review" && selected !== null ? <div className="flex items-center justify-between gap-2 rounded-lg border border-brand/30 bg-brand/5 p-2 text-xs">
              <span className="font-medium text-brand">Wall {selected + 1} selected · drag blue endpoints to change its length</span>
              <button type="button" onClick={removeSelected} className="flex min-h-10 items-center gap-1 rounded-md border border-destructive/50 px-3 text-destructive"><Trash2 className="size-4" />Remove</button>
            </div> : null}
          </div>
          <div className="space-y-2 text-sm">
            <span>Minimum detected line length: {minLength} px</span>
            <input type="range" min="25" max="150" step="5" value={minLength}
              onChange={e => setMinLength(Number(e.target.value))}
              className="w-full" />
            {sourceKind === "raster" ? <button type="button" onClick={() => detect(minLength)} className="min-h-10 rounded-lg border px-3 text-xs font-medium"><RotateCcw className="mr-1 inline size-3.5" />Re-scan image (replaces line edits)</button> : null}
          </div>
          <div className="space-y-3 rounded-xl border p-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Ruler className="size-4" /> Drawing scale</h3>
            {sourceKind === "cad" && cadMmPerPixel !== null ? <>
              <label className="flex min-h-11 items-center gap-2 rounded-lg border bg-muted/20 p-3 text-xs">
                <input type="checkbox" checked={useCadUnits}
                  onChange={event => { setUseCadUnits(event.target.checked); setReviewed(false); }}
                  className="size-4" />
                <span className="flex-1">Use the units saved in the DXF file
                  <span className="block text-muted-foreground">{(cadMmPerPixel * 1000).toFixed(2)} mm per 1,000 preview pixels</span>
                </span>
              </label>
              {useCadUnits ? <p className="flex items-center gap-1 text-xs text-emerald-600"><Check className="size-4" /> Read scale from CAD units. Check that the drawing was exported at real scale (1:1).</p> : null}
            </> : null}
            {automaticCadScale === null ? <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Tap both ends of one known printed dimension to calibrate.</p>
                <button type="button" onClick={() => { setMode("calibrate"); setScalePoints([]); setReviewed(false); }} className="min-h-9 text-xs text-brand"><RotateCcw className="mr-1 inline size-3" />Pick again</button>
              </div>
              <label className="flex items-center gap-2 text-sm">
                Real length
                <input type="number" min="0.2" max="100" step="0.01" value={knownMetres}
                  onChange={e => { setKnownMetres(e.target.value); setReviewed(false); }}
                  className="min-h-11 w-28 rounded-lg border bg-background px-3 text-right" />
                metres
              </label>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                {manualCalibrated ? <><Check className="size-4 text-emerald-600" /> {pixelLength.toFixed(0)} px = {metres.toFixed(2)} m</>
                  : `${scalePoints.length}/2 calibration points selected`}
              </p>
            </> : null}
          </div>
          <label className="flex items-start gap-3 rounded-xl border bg-muted/30 p-3 text-xs">
            <input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} className="mt-0.5 size-4" />
            <span><strong>I've reviewed these walls.</strong> Missing or wrongly detected segments will need correction in House Design. I will verify all dimensions, rooms, doors and windows before relying on 3D measurements or BOQ.</span>
          </label>
          {error ? <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p> : null}
          <button type="button" disabled={!calibrated || !lines.length || !reviewed || busy || (sourceKind === "cad" && cadTotal > MAX_REVIEWED_WALLS)} onClick={openPlan}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground disabled:opacity-40">
            Continue to editable Floor Plan & 3D <ArrowRight className="size-4" />
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
