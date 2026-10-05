import { buildParts } from "./geometry";
import { DEFAULT_TRIM } from "./nesting";
import type { Part } from "../types/parts";
import type { Board, Cabinet, DesignSpec } from "../types/spec";

/**
 * A wardrobe's height modules: one carcass floor to top, or a lower carcass
 * with an upper one stacked on it.
 *
 * Whether one carcass can be made is a question about the material, not a
 * rule: a 2700 mm wardrobe on a 100 mm plinth needs 2600 mm side panels and
 * doors, which a 1220 × 2440 sheet cannot give and a 1220 × 2750 one can. So
 * the answer here is found the way a cutter would find it — by making the
 * parts and laying each against the sheet it is cut from, turned where the
 * board has no grain — not by comparing one height with one sheet length.
 *
 * Where it cannot be one carcass, the lower module is made 2100 mm, a height
 * that suits hanging and a reach, and the rest goes above. 2100 is a
 * preference, not a limit: it moves, within what the board allows.
 */

/** The lower module's height when the wardrobe has to be divided, mm. */
export const PREFERRED_LOWER = 2100;
/** The shortest height module still worth a carcass of its own, mm. */
export const MIN_HEIGHT_MODULE = 250;

export type HeightMode = "auto" | "single" | "partitioned";

/** A part too long for its sheet, worded for the person choosing. */
export type MisfitPart = { label: string; length: number; width: number; board: Board };
export type ModuleFit = { ok: boolean; misfit: MisfitPart | null };

export type HeightPlan = {
  /** Module heights from the floor up: one entry, or lower then upper. */
  modules: number[];
  /** What the material allows: the plan Auto would choose. */
  recommended: number[];
  /** Whether the whole height can be one carcass in this material. */
  singleFits: boolean;
  /** Why the chosen modules cannot be made, if they cannot. */
  problems: string[];
};

/** Whether a part can be cut from its sheet: as it lies, or turned where the board has no grain. */
export function partFits(part: Pick<Part, "length" | "width" | "board">, trim = DEFAULT_TRIM): boolean {
  const length = part.board.sheet.length - 2 * trim;
  const width = part.board.sheet.width - 2 * trim;
  if (part.length <= length && part.width <= width) return true;
  return part.board.grain === "none" && part.length <= width && part.width <= length;
}

function noun(part: Part): string {
  switch (part.role) {
    case "gable":
      return "side panel";
    case "door":
      return "door";
    case "divider":
      return "divider";
    case "back":
      return "back panel";
    default:
      return part.label.toLowerCase();
  }
}

/**
 * Whether a cabinet can be made at a height, from its own parts: every cut
 * part laid against its sheet. `upper` asks for it as an upper module —
 * stacked, on no plinth.
 */
export function moduleFit(spec: DesignSpec, cabinetId: string, height: number, upper = false): ModuleFit {
  const partsAt = (at: number): Part[] | null => {
    const draft = structuredClone(spec);
    const cabinet = draft.cabinets.find((entry) => entry.id === cabinetId);
    if (!cabinet) return null;
    cabinet.size.height = at;
    if (upper) cabinet.plinthHeight = 0;
    // Only this cabinet is made; whatever stands on it is another carcass.
    draft.cabinets = [cabinet];
    try {
      return buildParts(draft).parts.filter((part) => part.manufacture !== "purchased");
    } catch {
      return null;
    }
  };
  const parts = partsAt(height);
  if (!parts) return { ok: false, misfit: null };
  // The height is judged on what the height changes. A part that cannot be
  // cut at any height — too deep for the sheet, say — is another question; a
  // part counts when it would be cut at a low height, or when it has grown
  // with the height past the longest the sheet gives.
  const low = new Map((partsAt(MIN_HEIGHT_MODULE * 2) ?? []).map((part) => [part.id, part]));
  const longest = (board: Board) => (board.grain === "none" ? Math.max(board.sheet.length, board.sheet.width) : board.sheet.length) - 2 * DEFAULT_TRIM;
  const heightCaused = (part: Part) => {
    const before = low.get(part.id);
    return !before || partFits(before) || (part.length > before.length && part.length > longest(part.board));
  };
  const worst = parts.filter((part) => !partFits(part) && heightCaused(part)).sort((a, b) => b.length - a.length)[0];
  return worst ? { ok: false, misfit: { label: noun(worst), length: Math.round(worst.length), width: Math.round(worst.width), board: worst.board } } : { ok: true, misfit: null };
}

/** "This module requires a 2600 mm side panel, but the selected board is 2440 mm." */
export function misfitMessage(misfit: MisfitPart): string {
  return `This module requires a ${misfit.length} mm ${misfit.label}, but the selected board is ${misfit.board.sheet.length} mm.`;
}

/**
 * The tallest the cabinet can be made in this material, found from its parts.
 *
 * Straight to the answer rather than by search: the part that does not fit
 * says by how much, and the cabinet comes down by that — then is checked
 * again, because another part (a door, a divider) may be the next to bind.
 */
export function tallestModule(spec: DesignSpec, cabinetId: string, upper = false, ceiling = 2700): number {
  let height = ceiling;
  for (let tries = 0; tries < 8; tries += 1) {
    const fit = moduleFit(spec, cabinetId, height, upper);
    if (fit.ok) return height;
    if (!fit.misfit) return 0;
    const board = fit.misfit.board;
    const longest = board.grain === "none" ? Math.max(board.sheet.length, board.sheet.width) : board.sheet.length;
    const over = fit.misfit.length - (longest - 2 * DEFAULT_TRIM);
    // Too wide rather than too long: no height fixes it.
    if (over <= 0) return 0;
    height = Math.floor(height - over);
    if (height < MIN_HEIGHT_MODULE) return 0;
  }
  return 0;
}

/**
 * The heights for a wardrobe of `total`: one carcass where the material
 * allows it and the mode does not ask otherwise, else a lower module of
 * `lower` (2100 by default, never more than the board allows) and the rest
 * above. `partitioned` with a lower height given is that, checked.
 */
export function planHeights(spec: DesignSpec, cabinetId: string, total: number, mode: HeightMode = "auto", lower = PREFERRED_LOWER): HeightPlan {
  const whole = moduleFit(spec, cabinetId, total);
  const tallestLower = whole.ok ? total : tallestModule(spec, cabinetId);
  const recommendedLower = Math.max(MIN_HEIGHT_MODULE, Math.min(PREFERRED_LOWER, tallestLower, total - MIN_HEIGHT_MODULE));
  const recommended = whole.ok ? [total] : [recommendedLower, total - recommendedLower];
  const problems: string[] = [];
  const check = (heights: number[]) => {
    if (heights.length === 2) {
      if (heights[1]! < MIN_HEIGHT_MODULE) problems.push(`The upper module would be ${Math.round(heights[1]!)} mm; a module needs at least ${MIN_HEIGHT_MODULE} mm.`);
      if (heights[0]! < MIN_HEIGHT_MODULE) problems.push(`The lower module needs at least ${MIN_HEIGHT_MODULE} mm.`);
      const below = moduleFit(spec, cabinetId, heights[0]!);
      if (!below.ok && below.misfit) problems.push(`Lower module: ${misfitMessage(below.misfit)}`);
      const above = moduleFit(spec, cabinetId, heights[1]!, true);
      if (!above.ok && above.misfit && heights[1]! >= MIN_HEIGHT_MODULE) problems.push(`Upper module: ${misfitMessage(above.misfit)}`);
    } else if (!whole.ok && whole.misfit) {
      problems.push(misfitMessage(whole.misfit));
    }
  };
  const modules =
    mode === "single" ? [total]
    : mode === "partitioned" ? [lower, total - lower]
    : recommended;
  check(modules);
  return { modules, recommended, singleFits: whole.ok, problems };
}

/** The cabinets that are one wardrobe's height modules: a lower and what stands on it. */
export function heightStackOf(spec: DesignSpec, cabinetId: string): { lower: Cabinet; upper: Cabinet | null } | null {
  const cabinet = spec.cabinets.find((entry) => entry.id === cabinetId);
  if (!cabinet) return null;
  const lower = cabinet.stackedOn ? spec.cabinets.find((entry) => entry.id === cabinet.stackedOn) ?? null : cabinet;
  if (!lower) return null;
  return { lower, upper: spec.cabinets.find((entry) => entry.stackedOn === lower.id) ?? null };
}
