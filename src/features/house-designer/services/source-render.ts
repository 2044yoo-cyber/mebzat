import type { MarkupBackground } from "../components/markup-canvas";

/**
 * Turning a file into a picture to sketch on: an image as it is, a PDF page
 * rendered, a DXF drawn as lines. The engines are loaded only when somebody
 * opens such a file — the plan screen never pays for them.
 *
 * DWG is not drawn: there is no dependable way to read it in a browser
 * without a large, fragile converter, and a wrong drawing is worse than none.
 * It stays a file in the project; saved as DXF from AutoCAD (or the free ODA
 * File Converter), it opens here.
 */
export type RenderedSource = {
  background: MarkupBackground;
  /** Known from the file itself (a DXF's units), or null until calibrated. */
  mmPerUnit: number | null;
};

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image could not be opened."));
    image.src = url;
  });
}

export async function renderImage(url: string): Promise<RenderedSource> {
  const image = await loadImage(url);
  return { background: { url, x: 0, y: 0, width: image.naturalWidth || 1000, height: image.naturalHeight || 750 }, mmPerUnit: null };
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

type PdfDocument = { numPages: number; getPage: (page: number) => Promise<PdfPage> };
type PdfPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
};

const documents = new Map<string, Promise<PdfDocument>>();

async function pdf(url: string): Promise<PdfDocument> {
  let loading = documents.get(url);
  if (!loading) {
    loading = (async () => {
      // The legacy build: the modern one relies on JavaScript only the newest
      // browsers have (Map.getOrInsertComputed), and fails on many phones.
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      }
      return (await pdfjs.getDocument({ url }).promise) as unknown as PdfDocument;
    })();
    documents.set(url, loading);
    loading.catch(() => documents.delete(url));
  }
  return loading;
}

export async function pdfPageCount(url: string): Promise<number> {
  return (await pdf(url)).numPages;
}

/**
 * One page, as a PNG. Its units are the page's own points at 1:1 — the
 * markup's coordinates — rendered sharper underneath so zooming in reads.
 */
export async function renderPdfPage(url: string, page: number, sharpness = 2): Promise<RenderedSource> {
  const document_ = await pdf(url);
  const target = await document_.getPage(Math.min(Math.max(1, page), document_.numPages));
  const base = target.getViewport({ scale: 1 });
  const viewport = target.getViewport({ scale: sharpness });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot draw the page.");
  await target.render({ canvas, canvasContext: context, viewport }).promise;
  return { background: { url: canvas.toDataURL("image/png"), x: 0, y: 0, width: base.width, height: base.height }, mmPerUnit: null };
}

export async function pdfThumbnail(url: string, page: number): Promise<string> {
  const rendered = await renderPdfPage(url, page, 0.25);
  return rendered.background.url;
}

// ---------------------------------------------------------------------------
// DXF
// ---------------------------------------------------------------------------

/** Millimetres per drawing unit, from the DXF's $INSUNITS. 0 is "unitless": calibrate. */
export const DXF_UNITS: Record<number, number> = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 14: 100 };

export type DxfDrawing = {
  layers: string[];
  mmPerUnit: number | null;
  /** Lines, arcs and text, already in picture coordinates (y down). */
  shapes: { layer: string; svg: string }[];
  bounds: { x: number; y: number; width: number; height: number };
  skipped: number;
};

type DxfPoint = { x: number; y: number };
type DxfEntity = {
  type: string;
  layer?: string;
  vertices?: DxfPoint[];
  shape?: boolean;
  center?: DxfPoint;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  text?: string;
  startPoint?: DxfPoint;
  position?: DxfPoint;
  textHeight?: number;
  height?: number;
};

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** Reads a DXF's text into lines, arcs and words. What it cannot draw it counts rather than guesses. */
export async function parseDxf(text: string): Promise<DxfDrawing> {
  const { default: DxfParser } = await import("dxf-parser");
  const parsed = new DxfParser().parseSync(text) as unknown as { header?: Record<string, unknown>; entities?: DxfEntity[]; tables?: { layer?: { layers?: Record<string, unknown> } } } | null;
  if (!parsed) throw new Error("That DXF could not be read.");
  const insunits = Number(parsed.header?.["$INSUNITS"] ?? 0);
  const shapes: DxfDrawing["shapes"] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  let skipped = 0;
  const add = (point: DxfPoint) => { xs.push(point.x); ys.push(-point.y); };
  for (const entity of parsed.entities ?? []) {
    const layer = entity.layer ?? "0";
    switch (entity.type) {
      case "LINE":
      case "LWPOLYLINE":
      case "POLYLINE": {
        const points = entity.vertices ?? [];
        if (points.length < 2) { skipped += 1; break; }
        points.forEach(add);
        const tag = entity.shape ? "polygon" : "polyline";
        shapes.push({ layer, svg: `<${tag} points="${points.map((point) => `${point.x},${-point.y}`).join(" ")}" fill="none"/>` });
        break;
      }
      case "CIRCLE": {
        if (!entity.center || !entity.radius) { skipped += 1; break; }
        add({ x: entity.center.x - entity.radius, y: entity.center.y - entity.radius });
        add({ x: entity.center.x + entity.radius, y: entity.center.y + entity.radius });
        shapes.push({ layer, svg: `<circle cx="${entity.center.x}" cy="${-entity.center.y}" r="${entity.radius}" fill="none"/>` });
        break;
      }
      case "ARC": {
        if (!entity.center || !entity.radius || entity.startAngle === undefined || entity.endAngle === undefined) { skipped += 1; break; }
        const { center, radius } = entity;
        const start = { x: center.x + radius * Math.cos(entity.startAngle), y: center.y + radius * Math.sin(entity.startAngle) };
        const end = { x: center.x + radius * Math.cos(entity.endAngle), y: center.y + radius * Math.sin(entity.endAngle) };
        let sweep = entity.endAngle - entity.startAngle;
        if (sweep < 0) sweep += Math.PI * 2;
        add({ x: center.x - radius, y: center.y - radius });
        add({ x: center.x + radius, y: center.y + radius });
        // Counter-clockwise in the drawing is clockwise once y points down.
        shapes.push({ layer, svg: `<path d="M ${start.x} ${-start.y} A ${radius} ${radius} 0 ${sweep > Math.PI ? 1 : 0} 0 ${end.x} ${-end.y}" fill="none"/>` });
        break;
      }
      case "TEXT":
      case "MTEXT": {
        const at = entity.startPoint ?? entity.position;
        if (!at || !entity.text) { skipped += 1; break; }
        add(at);
        const size = entity.textHeight ?? entity.height ?? 100;
        shapes.push({ layer, svg: `<text x="${at.x}" y="${-at.y}" font-size="${size}" font-family="sans-serif" stroke="none" fill="currentColor">${escape(entity.text.replace(/\\P/g, " ").replace(/\{|\}|\\[A-Za-z][^;]*;/g, ""))}</text>` });
        break;
      }
      default:
        skipped += 1;
    }
  }
  if (!xs.length) throw new Error("There is nothing in that DXF that can be drawn.");
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(1, Math.max(...xs) - minX);
  const height = Math.max(1, Math.max(...ys) - minY);
  const margin = Math.max(width, height) * 0.03;
  const layers = [...new Set(shapes.map((shape) => shape.layer))].sort();
  return { layers, mmPerUnit: DXF_UNITS[insunits] ?? null, shapes, bounds: { x: minX - margin, y: minY - margin, width: width + margin * 2, height: height + margin * 2 }, skipped };
}

/** The drawing as a picture, with only the layers asked for. */
export function renderDxf(drawing: DxfDrawing, visibleLayers: ReadonlySet<string>): RenderedSource {
  const { bounds } = drawing;
  const stroke = Math.max(bounds.width, bounds.height) / 1500;
  const body = drawing.shapes.filter((shape) => visibleLayers.has(shape.layer)).map((shape) => shape.svg).join("");
  const pixels = 2400 / Math.max(bounds.width, bounds.height);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" width="${Math.round(bounds.width * pixels)}" height="${Math.round(bounds.height * pixels)}"><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="#ffffff"/><g stroke="#111827" stroke-width="${stroke}" color="#111827">${body}</g></svg>`;
  return { background: { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, ...bounds }, mmPerUnit: drawing.mmPerUnit };
}
