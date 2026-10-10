/**
 * Deterministic on-device line detection for raster architectural plans.
 * Supports both light paper plans (dark ink) and dark AutoCAD screenshots
 * (light neutral linework). Colors used for furniture, dimensions and hatches
 * in CAD are deliberately excluded from dark-plan detection.
 *
 * These are CANDIDATES, not authoritative walls or reliable measurements.
 * Users must crop, calibrate and review geometry before House Design/BOQ.
 */
export type CandidateLine = {
  x1: number; y1: number; x2: number; y2: number;
  orientation: "h" | "v" | "diagonal";
  support: number;
  layer?: string;
};
export type DrawingPolarity = "auto" | "light" | "dark";
export const IMAGE_IMPORT_KEY = "medosha:house-image-detection:v1";
export const MAX_RASTER_WALL_CANDIDATES = 400;

type Run = { at: number; lo: number; hi: number };
type Group = { runs: Run[]; lo: number; hi: number; at: number };
function mergeRuns(runs: Run[], thickness: number): Group[] {
  const groups: Group[] = [];
  for (const run of runs) {
    const group = groups.find(g =>
      Math.abs(run.at - g.at) <= thickness + 2 &&
      Math.min(run.hi, g.hi) - Math.max(run.lo, g.lo) >=
        Math.min(run.hi - run.lo, g.hi - g.lo) * 0.58);
    if (group) {
      group.runs.push(run);
      group.lo = Math.min(group.lo, run.lo);
      group.hi = Math.max(group.hi, run.hi);
      group.at = Math.round(group.runs.reduce((sum, r) => sum + r.at, 0) / group.runs.length);
    } else {
      groups.push({ runs: [run], lo: run.lo, hi: run.hi, at: run.at });
    }
  }
  return groups;
}

export function imageBackgroundPolarity(data: ImageData): "light" | "dark" {
  const { width, height } = data;
  let dark = 0, checked = 0;
  // Sample through the entire image: screenshots may include small light UI
  // panels, but the CAD drawing canvas is predominantly black.
  const stride = Math.max(1, Math.floor(Math.sqrt(width * height / 5000)));
  for (let y = 0; y < height; y += stride)
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      const alpha = data.data[i + 3]! / 255;
      const luma = (data.data[i]! * 0.299 + data.data[i + 1]! * 0.587 + data.data[i + 2]! * 0.114) * alpha + 255 * (1 - alpha);
      dark += luma < 80 ? 1 : 0;
      checked++;
    }
  return dark / Math.max(checked, 1) > 0.58 ? "dark" : "light";
}

export function detectOrthogonalWalls(
  data: ImageData,
  minimumLength = 38,
  polarity: DrawingPolarity = "auto",
  structuralOnly = true,
): CandidateLine[] {
  const { width: w, height: h } = data;
  if (w < 80 || h < 80) throw new Error("Use an image at least 80 × 80 pixels.");
  if (!Number.isFinite(minimumLength) || minimumLength < 10 || minimumLength > 1000)
    throw new Error("Choose a line length between 10 and 1,000 pixels.");
  const ink = new Uint8Array(w * h);
  const background = polarity === "auto" ? imageBackgroundPolarity(data) : polarity;
  for (let i = 0; i < ink.length; i++) {
    const p = i * 4;
    const alpha = data.data[p + 3]! / 255;
    const r = data.data[p]! * alpha + 255 * (1 - alpha);
    const g = data.data[p + 1]! * alpha + 255 * (1 - alpha);
    const b = data.data[p + 2]! * alpha + 255 * (1 - alpha);
    const luminance = r * 0.299 + g * 0.587 + b * 0.114;
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);
    // Black AutoCAD canvas is BACKGROUND, not a solid black wall. Detect
    // neutral light structural strokes; exclude typical orange/yellow text,
    // cyan dimensions, green furniture and blue door-swing symbols.
    ink[i] = background === "dark"
      ? luminance >= 105 && saturation <= 58 && Math.min(r, g, b) >= 90 ? 1 : 0
      : luminance < 115 && saturation <= 85 ? 1 : 0;
  }
  const scan = (horizontal: boolean): Run[] => {
    const rows = horizontal ? h : w, columns = horizontal ? w : h;
    const result: Run[] = [];
    for (let at = 0; at < rows; at++) {
      let begin = -1, last = -1;
      for (let p = 0; p <= columns; p++) {
        const marked = p < columns && ink[horizontal ? at * w + p : p * w + at] === 1;
        if (marked) { if (begin < 0) begin = p; last = p; }
        if (!marked && begin >= 0 && (p - last > 3 || p === columns)) {
          if (last - begin + 1 >= minimumLength) result.push({ at, lo: begin, hi: last });
          begin = -1;
        }
      }
    }
    return result;
  };
  const groups = [
    ...mergeRuns(scan(true), 9).map(g => ({ ...g, orientation: "h" as const })),
    ...mergeRuns(scan(false), 9).map(g => ({ ...g, orientation: "v" as const })),
  ];
  const lines = groups
    // CAD geometry is sometimes only a SINGLE pixel. For long, uninterrupted
    // runs it is safe to offer even that thin line for review.
    .filter(g => (g.runs.length >= 2 || g.hi - g.lo >= minimumLength * 2.4) &&
      g.hi - g.lo >= minimumLength &&
      // Light architectural scans usually depict walls with noticeably
      // heavier strokes than furniture outlines, lettering and stairs.
      // Single-pixel CAD vectors remain available with the filter off.
      (!structuralOnly || background === "dark" || g.runs.length >= 4))
    .map(g => {
      const centre = Math.round(g.runs.reduce((sum, run) => sum + run.at, 0) / g.runs.length);
      return g.orientation === "h"
        ? { x1: g.lo, y1: centre, x2: g.hi, y2: centre, orientation: g.orientation, support: g.runs.length }
        : { x1: centre, y1: g.lo, x2: centre, y2: g.hi, orientation: g.orientation, support: g.runs.length };
    });
  // Pair the parallel strokes that represent opposite faces of one wall.
  // Never join side-by-side but longitudinally DISJOINT walls.
  const merged: CandidateLine[] = [];
  for (const line of lines.sort((a, b) => b.support - a.support)) {
    const existing = merged.find(other =>
      other.orientation === line.orientation &&
      Math.abs((line.orientation === "h" ? other.y1 - line.y1 : other.x1 - line.x1)) <= 11 &&
      (line.orientation === "h"
        ? Math.min(other.x2, line.x2) - Math.max(other.x1, line.x1) >= Math.min(other.x2 - other.x1, line.x2 - line.x1) * 0.65
        : Math.min(other.y2, line.y2) - Math.max(other.y1, line.y1) >= Math.min(other.y2 - other.y1, line.y2 - line.y1) * 0.65));
    if (existing) {
      const total = existing.support + line.support;
      if (line.orientation === "h") {
        existing.y1 = existing.y2 = Math.round((existing.y1 * existing.support + line.y1 * line.support) / total);
        existing.x1 = Math.min(existing.x1, line.x1);
        existing.x2 = Math.max(existing.x2, line.x2);
      } else {
        existing.x1 = existing.x2 = Math.round((existing.x1 * existing.support + line.x1 * line.support) / total);
        existing.y1 = Math.min(existing.y1, line.y1);
        existing.y2 = Math.max(existing.y2, line.y2);
      }
      existing.support = total;
    } else merged.push({ ...line });
  }
  // Offer only the most structurally significant candidates, not the first
  // 80 in scan order. Excessive noisy linework must be cropped or filtered
  // manually; never silently treat hundreds of annotations as real walls.
  return merged
    .sort((a, b) =>
      (Math.hypot(b.x2 - b.x1, b.y2 - b.y1) * Math.min(b.support, 8)) -
      (Math.hypot(a.x2 - a.x1, a.y2 - a.y1) * Math.min(a.support, 8)))
    .slice(0, MAX_RASTER_WALL_CANDIDATES);
}
