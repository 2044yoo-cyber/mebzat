import type { DesignSpec, HingeType } from "../types/spec";
import { constructionMaterials } from "./wardrobe-materials";

/**
 * How automatic doors are sized from the cabinet opening.
 *
 * A door is a span laid across an opening whose two ends are boards of the
 * carcass: a gable at the cabinet's edge, a divider between two bays, a double
 * wall at a transport joint, the top, the bottom, a shelf between two
 * sections. What the door does at each end depends on the hinge:
 *
 *  - Full overlay. The door covers the board. At the edge of the cabinet it
 *    reaches the outside face less half the clearance, so doors of cabinets
 *    that stand side by side are a whole clearance apart. Where it shares a
 *    board with the door on its other side, each takes half the board less
 *    half the clearance, so the two are a clearance apart.
 *  - Half overlay. The door reaches over half the board less half the
 *    clearance, at every end, shared or not — which is what makes the hinge a
 *    half-overlay hinge: it is the hinge, not the position, that is shared
 *    between two doors on one board, and an end with nothing beyond it keeps
 *    the same reach, leaving the other half of the board showing.
 *  - Inset. The door stands inside the opening, flush with the carcass front
 *    (see `doorFrontOffset`), a clearance from each board.
 *
 * Between leaves of one opening the gap is the clearance exactly. Three
 * formulas, then, and a width that is the same for all of them: opening, plus
 * what each end reaches, less the gaps between leaves, shared out.
 *
 * Millimetres throughout, in the cabinet's frame, as `cabinetFronts` has it.
 * Pure: no spec is changed and nothing is rounded except the leaf width, to a
 * tenth of a millimetre downwards, so the leaves never need more than the
 * opening gives them and the gap stays exact.
 */

export const hingeTypes = ["full", "half", "inset"] as const;
export const HINGE_LABELS: Record<HingeType, string> = {
  full: "Full overlay",
  half: "Half overlay",
  inset: "Inset",
};

/** The clearance a new design starts with, mm. */
export const DEFAULT_CLEARANCE = 5;
export const CLEARANCE_LIMITS = { min: 0, max: 20 } as const;
export const DEFAULT_DOOR_SIZING = { hinge: "full", clearance: DEFAULT_CLEARANCE } as const;

export type DoorSizing = {
  /**
   * A design saved before door sizing was stored. Its doors are sized as they
   * always were, from `carcass.doorGap`, so it reopens and cuts exactly as it
   * did; choosing a hinge type is what moves it onto the formulas here.
   */
  legacy: boolean;
  hinge: HingeType;
  /** The gap between adjacent doors, and half the reveal at the edge of a cabinet. */
  clearance: number;
};

export function doorSizingOf(spec: Pick<DesignSpec, "doorSizing" | "carcass">): DoorSizing {
  const stored = spec.doorSizing;
  if (!stored) return { legacy: true, hinge: "full", clearance: spec.carcass.doorGap };
  return { legacy: false, hinge: stored.hinge, clearance: stored.clearance };
}

/** The gap between two doors, whichever way the design is sized. */
export function doorGapOf(spec: Pick<DesignSpec, "doorSizing" | "carcass">): number {
  return doorSizingOf(spec).clearance;
}

/**
 * What lies beyond one end of an opening: the cabinet's own edge (`outer`), a
 * board another front also meets (`shared`), or a board with no front on its
 * other side (`open`) — a niche, an open display, the open bay of a corner.
 * `board` is that board's thickness: one at a gable or divider, two at a
 * transport joint.
 *
 * An open end is not the cabinet's edge. What stands beyond it is not known
 * here — in a corner it is the other run's own side — so a door there stops at
 * the opening, a reveal short of the board, and never reaches over it.
 */
export type Edge = { kind: "outer" | "shared" | "open"; board: number };

/**
 * How far a door reaches past its opening's edge, mm. Positive onto the
 * board, negative when it stands back from it (inset).
 */
export function reachAt(sizing: Pick<DoorSizing, "hinge" | "clearance">, edge: Edge): number {
  const { clearance: c } = sizing;
  const board = edge.board;
  let reach: number;
  switch (sizing.hinge) {
    case "full":
      reach = edge.kind === "outer" ? board - c / 2 : board / 2 - c / 2;
      break;
    case "half":
      reach = Math.max(0, (board - c) / 2);
      break;
    case "inset":
      reach = -c;
      break;
  }
  return edge.kind === "open" ? Math.min(reach, -c / 2) : reach;
}

/** The span a door run covers across an opening [a, b], between its two ends. */
export function frontExtent(sizing: Pick<DoorSizing, "hinge" | "clearance">, a: number, b: number, low: Edge, high: Edge): { lo: number; hi: number } {
  return { lo: a - reachAt(sizing, low), hi: b + reachAt(sizing, high) };
}

/** `count` leaves across a span, the clearance between each, equal widths. */
export function leavesAcross(clearance: number, extent: { lo: number; hi: number }, count: number): { x: number; width: number }[] {
  const width = Math.floor(((extent.hi - extent.lo - clearance * (count - 1)) / count) * 10) / 10;
  return Array.from({ length: count }, (_, index) => ({ x: extent.lo + index * (width + clearance), width }));
}

/**
 * Where a door's face stands, from the carcass front, as the z the part is
 * placed at: back from the front by the door's thickness for the overlays
 * (it stands proud), at the front for inset (it sits in the opening, flush).
 */
export function doorFrontOffset(spec: Pick<DesignSpec, "doorSizing" | "carcass">, thickness: number, style?: string): number {
  // Only a hinged door sits in the opening; a sliding leaf runs in front of it.
  return doorsAreInset(spec) && (style === undefined || style === "hinged") ? 0 : thickness;
}

/** Whether doors sit inside the carcass: they need room in front of the shelves. */
export function doorsAreInset(spec: Pick<DesignSpec, "doorSizing" | "carcass">): boolean {
  const sizing = doorSizingOf(spec);
  return !sizing.legacy && sizing.hinge === "inset";
}

/**
 * How far a shelf is set back from the carcass front. With inset doors the
 * door stands in that space, so a shelf stops behind its back face and a
 * little more: 2 mm of air, or the standard setback where that is more.
 */
export function shelfSetbackOf(spec: DesignSpec): number {
  return doorsAreInset(spec) ? Math.max(spec.carcass.shelfSetback, constructionMaterials(spec).fronts.thickness + 2) : spec.carcass.shelfSetback;
}
