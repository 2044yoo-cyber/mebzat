/**
 * DXF vectors -> the same reviewable wall candidates used by Image to 3D.
 *
 * Reads CAD geometry locally, without a vision model, OCR, cloud upload or
 * image rasterisation. Import only the user-approved layers. CAD drawings can
 * also contain furniture, dimension lines, symbols and multiple floors, so
 * layers MUST be verified before creating 3D walls.
 */
import type { CandidateLine } from "./image-line-detection";
import { DXF_UNITS } from "./source-render";

export type DxfWallSegment = {
  layer: string;
  a: { x: number; y: number };
  b: { x: number; y: number };
};
export type DxfWallDrawing = {
  segments: DxfWallSegment[];
  layers: { name: string; count: number; suggested: boolean }[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Millimetres per original CAD drawing unit, or null if DXF is unitless. */
  mmPerDrawingUnit: number | null;
  skipped: number;
};
export type DxfWallPreview = {
  lines: CandidateLine[];
  total: number;
  width: number;
  height: number;
  /** Real millimetres per preview pixel, or null pending calibration. */
  mmPerPixel: number | null;
  background: DxfWallSegment[];
  toPixel: (point: { x: number; y: number }) => { x: number; y: number };
};

type Point = { x: number; y: number; z?: number };
type DxfEntity = {
  type: string;
  layer?: string;
  vertices?: Array<Point & { bulge?: number }>;
  shape?: boolean;
  closed?: boolean;
};
type ParsedDxf = { header?: Record<string, unknown>; entities?: DxfEntity[] };

const ANNOTATION_LAYER = /(?:^|[-_ .])(dim(?:ension)?s?|text|anno(?:tation)?s?|title|hatch|grid|axis|symbol|furn(?:iture)?|electrical|plumb(?:ing)?|ceiling)(?:$|[-_ .])/i;
const WALL_LAYER = /wall|partition|masonry|brick|a[-_]?wall|structural|outline|exterior|interior/i;
const MAX_DXF_SEGMENTS = 30_000;
export const MAX_REVIEWED_WALLS = 400;

function valid(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) &&
    (point.z === undefined || Number.isFinite(point.z));
}

export function extractDxfWallDrawing(parsed: ParsedDxf): DxfWallDrawing {
  const segments: DxfWallSegment[] = [];
  const counts = new Map<string, number>();
  let skipped = 0;

  for (const entity of parsed.entities ?? []) {
    const vertices = entity.vertices;
    if (!["LINE", "LWPOLYLINE", "POLYLINE"].includes(entity.type) || !vertices?.length || vertices.length < 2) {
      skipped++;
      continue;
    }
    const name = entity.layer?.trim() || "0";
    // Bent polylines are split into real straight segments. An arc's bulge
    // is NOT a straight wall, so skip that curved segment rather than guess.
    const closed = (entity.shape === true || entity.closed === true) && entity.type !== "LINE";
    const pairs = closed ? vertices.length : vertices.length - 1;
    for (let i = 0; i < pairs; i++) {
      const a = vertices[i]!, b = vertices[(i + 1) % vertices.length]!;
      if (!valid(a) || !valid(b) || (a.bulge && Math.abs(a.bulge) > 0.00001) ||
        Math.abs((a.z ?? 0) - (b.z ?? 0)) > 0.001 ||
        Math.hypot(b.x - a.x, b.y - a.y) < 0.001) {
        skipped++;
        continue;
      }
      if (segments.length >= MAX_DXF_SEGMENTS)
        throw new Error("This DXF has too many CAD segments to process safely. Export just the floor-plan wall layers.");
      segments.push({ layer: name, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  if (!segments.length) throw new Error("No LINE or straight POLYLINE wall segments found. Use a floor-plan DXF, not a 3D model or DWG.");
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const line of segments) {
    for (const p of [line.a, line.b]) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
  }
  const units = Number(parsed.header?.["$INSUNITS"] ?? 0);
  const layers = [...counts].map(([name, count]) => ({
    name, count, suggested: WALL_LAYER.test(name) && !ANNOTATION_LAYER.test(name),
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // If no recognizable wall layer exists, prefer geometric layers that do
  // not explicitly say dimensions/annotations; the user still confirms.
  if (!layers.some(layer => layer.suggested)) {
    for (const layer of layers) layer.suggested = !ANNOTATION_LAYER.test(layer.name);
  }
  return {
    segments,
    layers,
    bounds: { minX, minY, maxX, maxY },
    mmPerDrawingUnit: DXF_UNITS[units] ?? null,
    skipped,
  };
}

export async function parseDxfWallDrawing(contents: string): Promise<DxfWallDrawing> {
  if (contents.length > 12 * 1024 * 1024) throw new Error("Choose a DXF smaller than 12 MB.");
  const { default: DxfParser } = await import("dxf-parser");
  const parsed = new DxfParser().parseSync(contents) as unknown as ParsedDxf | null;
  if (!parsed) throw new Error("Could not read this CAD drawing. Export an ASCII DXF from your CAD application.");
  return extractDxfWallDrawing(parsed);
}

export function dxfWallPreview(drawing: DxfWallDrawing, visibleLayers: ReadonlySet<string>): DxfWallPreview {
  const { minX, maxX, minY, maxY } = drawing.bounds;
  const maxSpan = Math.max(maxX - minX, maxY - minY);
  if (!Number.isFinite(maxSpan) || maxSpan <= 0) throw new Error("DXF drawing extents are invalid.");
  const pixelsPerUnit = 1050 / maxSpan;
  const width = Math.ceil((maxX - minX) * pixelsPerUnit + 50);
  const height = Math.ceil((maxY - minY) * pixelsPerUnit + 50);
  const toPixel = (p: { x: number; y: number }) => ({
    x: (p.x - minX) * pixelsPerUnit + 25,
    y: (maxY - p.y) * pixelsPerUnit + 25,
  });
  const selectedSegments = drawing.segments.filter(segment => visibleLayers.has(segment.layer));
  // Render only the first few thousand geometry lines as a visual reference;
  // require layer filtering before making >400 editable wall candidates.
  const background = selectedSegments.slice(0, 4_000);
  const lines: CandidateLine[] = selectedSegments.slice(0, MAX_REVIEWED_WALLS + 1).map(segment => {
    const a = toPixel(segment.a), b = toPixel(segment.b);
    const dx = b.x - a.x, dy = b.y - a.y;
    const orientation: CandidateLine["orientation"] =
      Math.abs(dy) <= Math.abs(dx) * 0.08 ? "h" :
      Math.abs(dx) <= Math.abs(dy) * 0.08 ? "v" : "diagonal";
    return {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      layer: segment.layer, orientation,
      support: 1,
    };
  }).filter(line => Math.hypot(line.x2 - line.x1, line.y2 - line.y1) >= 2);
  return { lines, total: selectedSegments.length, width, height, toPixel, background,
    mmPerPixel: drawing.mmPerDrawingUnit === null ? null : drawing.mmPerDrawingUnit / pixelsPerUnit };
}
