/**
 * Browser-only, deterministic first-pass wall centreline detection.
 * Intended for high-contrast orthogonal CAD screenshots, not photographs,
 * handwritten plans or reliable extraction of architectural openings.
 * It returns candidate lines for mandatory visual review, never measured areas.
 */
export type CandidateLine = { x1: number; y1: number; x2: number; y2: number; orientation: "h" | "v" | "diagonal"; support: number; layer?: string };
export const IMAGE_IMPORT_KEY = "medosha:house-image-detection:v1";

type Run = { at: number; lo: number; hi: number };
type Group = { runs: Run[]; lo: number; hi: number; at: number };

function mergeRuns(runs: Run[], thickness: number): Group[] {
  const groups: Group[] = [];
  for (const run of runs) {
    const matches = groups.filter(g =>
      run.at - g.at <= thickness + 2 &&
      Math.min(run.hi, g.hi) - Math.max(run.lo, g.lo) >=
        Math.min(run.hi - run.lo, g.hi - g.lo) * 0.58);
    if (!matches.length) {
      groups.push({ runs: [run], lo: run.lo, hi: run.hi, at: run.at });
      continue;
    }
    const group = matches[0]!;
    group.runs.push(run);
    group.lo = Math.min(group.lo, run.lo);
    group.hi = Math.max(group.hi, run.hi);
    group.at = Math.round(group.runs.reduce((sum, r) => sum + r.at, 0) / group.runs.length);
  }
  return groups;
}

export function detectOrthogonalWalls(data: ImageData, minimumLength = 38): CandidateLine[] {
  const { width: w, height: h } = data;
  if (w < 80 || h < 80) throw new Error("Use an image at least 80 × 80 pixels.");
  const binary = new Uint8Array(w * h);
  for (let i = 0; i < binary.length; i++) {
    const p = i * 4;
    const alpha = data.data[p + 3]! / 255;
    const luminance = (data.data[p]! * 0.299 + data.data[p + 1]! * 0.587 + data.data[p + 2]! * 0.114) * alpha + 255 * (1 - alpha);
    binary[i] = luminance < 115 ? 1 : 0;
  }
  const scan = (horizontal: boolean): Run[] => {
    const rows = horizontal ? h : w, columns = horizontal ? w : h;
    const result: Run[] = [];
    for (let at = 0; at < rows; at++) {
      let begin = -1, last = -1;
      for (let p = 0; p <= columns; p++) {
        const dark = p < columns && binary[horizontal ? at * w + p : p * w + at] === 1;
        if (dark) { if (begin < 0) begin = p; last = p; }
        // Bridge up to 2px gaps caused by antialiasing and dashed lines.
        if (!dark && begin >= 0 && (p - last > 3 || p === columns)) {
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
    .filter(g => g.runs.length >= 2 && g.hi - g.lo >= minimumLength)
    .map(g => {
      const centre = Math.round(g.runs.reduce((sum, run) => sum + run.at, 0) / g.runs.length);
      return g.orientation === "h"
        ? { x1: g.lo, y1: centre, x2: g.hi, y2: centre, orientation: g.orientation, support: g.runs.length }
        : { x1: centre, y1: g.lo, x2: centre, y2: g.hi, orientation: g.orientation, support: g.runs.length };
    });
  // Merge parallel linework close together, including double-line wall faces.
  // Only merge when their longitudinal extents overlap substantially.
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
  return merged.sort((a, b) => (b.orientation === "h" ? b.x2 - b.x1 : b.y2 - b.y1) - (a.orientation === "h" ? a.x2 - a.x1 : a.y2 - a.y1)).slice(0, 80);
}
