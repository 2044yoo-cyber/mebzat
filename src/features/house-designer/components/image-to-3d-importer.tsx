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
  const [mode, setMode] = useState<"calibrate" | "review">("calibrate");

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
      ctx.strokeStyle = "#16a34a";
      for (const line of lines) {
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
      }
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
  useEffect(draw, [lines, scalePoints, showLines, size]);

  function detect(min: number) {
    const original = image.current;
    if (!original) return;
    const ctx = original.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    try {
      const result = detectOrthogonalWalls(ctx.getImageData(0, 0, original.width, original.height), min);
      setLines(result);
      setError(result.length ? "" : "No long, straight wall candidates found. Try a clean CAD screenshot or lower the minimum line length.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not inspect the image."); }
  }

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("This first version reads PNG, JPG and WebP. For PDF, export the drawing page to PNG first.");
      return;
    }
    if (file.size > MAX_BYTES) { setError("Choose an image smaller than 12 MB."); return; }
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
      const width = Math.round(bitmap.width * scale), height = Math.round(bitmap.height * scale);
      const original = document.createElement("canvas");
      original.width = width; original.height = height;
      const ctx = original.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Your browser cannot process this image.");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      image.current = original;
      setSize({ width, height });
      setScalePoints([]);
      setMode("calibrate");
      setFileName(file.name);
      const detected = detectOrthogonalWalls(ctx.getImageData(0, 0, width, height), minLength);
      setLines(detected);
      if (!detected.length) setError("No straight walls detected. Use a clearer image or lower the line-length setting.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the image."); }
    finally { setBusy(false); }
  }

  function pickPoint(event: PointerEvent<HTMLCanvasElement>) {
    if (mode !== "calibrate") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) * size.width / rect.width,
      y: (event.clientY - rect.top) * size.height / rect.height,
    };
    setScalePoints(previous => previous.length >= 2 ? [point] : [...previous, point]);
  }

  const pixelLength = scalePoints.length === 2
    ? Math.hypot(scalePoints[1]!.x - scalePoints[0]!.x, scalePoints[1]!.y - scalePoints[0]!.y)
    : 0;
  const metres = Number(knownMetres);
  const calibrated = pixelLength >= 12 && Number.isFinite(metres) && metres >= 0.2 && metres <= 100;

  function openPlan() {
    if (!calibrated || !lines.length) { setError("Mark two points on a known dimension and confirm its length."); return; }
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
