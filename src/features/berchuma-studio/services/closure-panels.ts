import type { Part, Vec3 } from "../types/parts";
import { findBoard } from "../types/catalogue";
import type { Board, ClosurePanelKind, DesignSpec } from "../types/spec";
import { fingerPullOf, gripEdgeOf, hingeSideOf } from "./door-grip";
import { doorFrontOffset, doorSizingOf } from "./door-sizing";
import type { FrontRect } from "./door-layout";
import type { PlacedCabinet, ResolvedDesign } from "./resolve";
import { constructionMaterials } from "./wardrobe-materials";

/**
 * Smart Closure Panels: what a cabinet leaves open, found from its geometry,
 * and the MDF that closes it.
 *
 * Nothing here is a list of panels to add. Each kind is a question asked of
 * the cabinet as it is built:
 *
 *  - Inside: each door run's clear opening, less the doors, drawer fronts and
 *    boards that stand in front of it. Whatever is left would show the inside
 *    with the doors shut. A strip left above a channel-grip door is the
 *    channel, closed by a finger-pull rail set back behind it; anything else
 *    is closed by a masking panel in the opening.
 *  - Ends: an end against nothing — open floor, a gap of more than a filler
 *    to the next cabinet or the wall — gets a cover panel. A narrow gap gets
 *    one filler, made once, by the cabinet on its left.
 *  - Up to a ceiling the room states, from a tall or wall unit with nothing
 *    above it: a top closure.
 *  - Under a carcass that stands on legs with no plinth board: a kickboard.
 *  - Behind an island: a rear panel.
 *
 * Every panel is placed so that no door, opened as far as its hinge allows,
 * touches it (see `doorSwingConflict`), and so that it overlaps no other part.
 * One that would — a size typed by hand, say — keeps its worked-out size and
 * says why, as a door sized by hand does.
 *
 * Pure: the same spec gives the same panels, with the same ids, which is what
 * lets a panel switched off or resized stay so across edits.
 */

/** Above this a gap to the next cabinet or the wall is open floor, not a filler. */
export const FILLER_MAX = 100;
/** Smaller than this a sliver of opening is a reveal, not an opening. */
const MIN_OPENING = 6;
/** Up to this a gap above a tall or wall unit is closed to the ceiling; more is a shelf. */
const TOP_CLOSURE_MAX = 600;
/**
 * The clearance a flush panel needs beside a hinged door's hinge edge. An
 * 18 mm door on a 110° full-overlay concealed hinge swings clear of a panel
 * flush with its face from about 2 mm; less, and its back edge rubs.
 */
export const HINGE_SIDE_CLEARANCE = 2;

export type ClosureBox = { x: number; y: number; z: number; sx: number; sy: number; sz: number };

export type ClosurePanel = {
  /** Stable: `${cabinetId}/closure-…`. The part's id, and the key its settings are stored under. */
  id: string;
  cabinetId: string;
  kind: ClosurePanelKind;
  label: string;
  /** Where it is, in the cabinet's own frame. */
  box: ClosureBox;
  /** The axis its thickness runs along. */
  axis: "x" | "z";
  /** Its face, as the user sizes it: across and up for a front panel, deep and up for an end. */
  width: number;
  height: number;
  auto: { width: number; height: number };
  enabled: boolean;
  hidden: boolean;
  manual: boolean;
  /** The local part it is fixed to, and where. */
  fixedTo: string;
  join: Vec3;
  /** Why it is there, for the panel list. */
  reason: string;
};

export type ClosureResult = { panels: ClosurePanel[]; warnings: string[] };

/** The board closure panels are cut from: the one chosen, else the fronts'. */
export function closureBoardOf(spec: DesignSpec): Board {
  const chosen = spec.closurePanels?.boardId ? findBoard(spec.closurePanels.boardId) : undefined;
  return chosen ?? constructionMaterials(spec).fronts;
}

const LABELS: Record<ClosurePanelKind, string> = {
  rail: "Finger-pull rail",
  masking: "Masking panel",
  filler: "Filler panel",
  end: "Side cover panel",
  decorative_end: "Decorative end panel",
  top: "Top closure panel",
  bottom: "Bottom closure (kickboard)",
  rear: "Rear closure panel",
};

// ---------------------------------------------------------------------------
// Rectangles
// ---------------------------------------------------------------------------

type Rect = { x: number; y: number; width: number; height: number };

/**
 * A rectangle less a set of others, as the fewest rectangles of what is left.
 *
 * Exact rather than sampled: the cut is at every edge any rectangle has, so
 * the pieces are the cells of that grid, and cells that are left are merged
 * along rows and then down columns. Openings here are a handful of boards and
 * doors, so the grid is tens of cells, not thousands.
 */
export function subtractRects(region: Rect, covers: Rect[]): Rect[] {
  const xs = [region.x, region.x + region.width];
  const ys = [region.y, region.y + region.height];
  for (const cover of covers) {
    for (const x of [cover.x, cover.x + cover.width]) if (x > region.x && x < region.x + region.width) xs.push(x);
    for (const y of [cover.y, cover.y + cover.height]) if (y > region.y && y < region.y + region.height) ys.push(y);
  }
  const ux = [...new Set(xs.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
  const uy = [...new Set(ys.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
  const open: boolean[][] = [];
  for (let j = 0; j < uy.length - 1; j += 1) {
    const row: boolean[] = [];
    for (let i = 0; i < ux.length - 1; i += 1) {
      const cx = (ux[i]! + ux[i + 1]!) / 2;
      const cy = (uy[j]! + uy[j + 1]!) / 2;
      row.push(!covers.some((c) => cx > c.x && cx < c.x + c.width && cy > c.y && cy < c.y + c.height));
    }
    open.push(row);
  }
  // Runs along each row, then runs of identical spans down the rows.
  const spans: { i0: number; i1: number; j0: number; j1: number }[] = [];
  let previous: { i0: number; i1: number; j0: number; j1: number }[] = [];
  for (let j = 0; j < open.length; j += 1) {
    const current: { i0: number; i1: number; j0: number; j1: number }[] = [];
    let i = 0;
    while (i < open[j]!.length) {
      if (!open[j]![i]) { i += 1; continue; }
      const i0 = i;
      while (i < open[j]!.length && open[j]![i]) i += 1;
      const above = previous.find((span) => span.i0 === i0 && span.i1 === i);
      if (above) { above.j1 = j + 1; current.push(above); }
      else { const span = { i0, i1: i, j0: j, j1: j + 1 }; spans.push(span); current.push(span); }
    }
    previous = current;
  }
  return spans.map((span) => ({ x: ux[span.i0]!, y: uy[span.j0]!, width: ux[span.i1]! - ux[span.i0]!, height: uy[span.j1]! - uy[span.j0]! }));
}

// ---------------------------------------------------------------------------
// Boxes, overlaps and the door swing
// ---------------------------------------------------------------------------

function boxOfPart(part: Part, at: Vec3): ClosureBox {
  return { x: at.x, y: at.y, z: at.z, sx: part.size.x, sy: part.size.y, sz: part.size.z };
}

/** Whether two boxes share volume — touching is not overlapping. */
export function boxesOverlap(a: ClosureBox, b: ClosureBox, tolerance = 0.5): boolean {
  return a.x < b.x + b.sx - tolerance && b.x < a.x + a.sx - tolerance
    && a.y < b.y + b.sy - tolerance && b.y < a.y + a.sy - tolerance
    && a.z < b.z + b.sz - tolerance && b.z < a.z + a.sz - tolerance;
}

export type SwingLeaf = FrontRect & { leaf: number; leaves: number; style: string; thickness: number; maxAngle: number };

/**
 * Whether a panel stands where a door goes as it opens.
 *
 * Two rules, because a concealed hinge does two things. Its door moves out
 * and round, so a panel flush with the door's face beside its hinge edge is
 * clear only from HINGE_SIDE_CLEARANCE; and its face sweeps an arc about the
 * hinge edge, out to the hinge's angle, so anything standing proud of the
 * doors in that arc is hit. Modelled on the door's front face turning about
 * its hinge-side front edge — the conservative end of how such hinges move.
 * Sliding doors do not swing.
 */
export function doorSwingConflict(box: ClosureBox, leaves: SwingLeaf[]): string | null {
  for (const leaf of leaves) {
    if (leaf.style !== "hinged" && leaf.style !== "bifold") continue;
    if (box.y >= leaf.y + leaf.height || box.y + box.sy <= leaf.y) continue;
    const side = hingeSideOf(leaf);
    const hinge = side === "left" ? leaf.x : leaf.x + leaf.width;
    const face = -leaf.thickness;
    const minX = box.x;
    const maxX = box.x + box.sx;
    const minZ = box.z;
    const name = `door ${leaf.leaf + 1}`;
    // Beside the hinge edge, within the door's own depth.
    if (minZ < 0 && box.z + box.sz > face) {
      const near = side === "left"
        ? maxX > hinge - HINGE_SIDE_CLEARANCE && minX < hinge
        : minX < hinge + HINGE_SIDE_CLEARANCE && maxX > hinge;
      if (near) return `closer than ${HINGE_SIDE_CLEARANCE} mm to the hinge side of ${name}`;
    }
    // Proud of the doors, in the arc the face sweeps.
    if (minZ < face) {
      for (let angle = 5; angle <= leaf.maxAngle; angle += 5) {
        const radians = (angle * Math.PI) / 180;
        for (let step = 1; step <= 10; step += 1) {
          const s = (leaf.width * step) / 10;
          const x = hinge + (side === "left" ? 1 : -1) * s * Math.cos(radians);
          const z = face - s * Math.sin(radians);
          if (x > minX && x < maxX && z > minZ && z < box.z + box.sz) return `in the way of ${name} as it opens`;
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The cabinet's surroundings
// ---------------------------------------------------------------------------

type Side = { gap: number; against: "wall" | "cabinet" | "nothing" };

/** What is beside each end of a placed cabinet, at its own height. */
function surroundings(spec: DesignSpec, resolved: ResolvedDesign, placed: PlacedCabinet): { left: Side; right: Side } {
  const cabinet = placed.cabinet;
  const width = cabinet.size.width;
  const bottom = placed.y;
  const top = placed.y + cabinet.size.height;
  const level = (other: PlacedCabinet) => other.y < top - 1 && other.y + other.cabinet.size.height > bottom + 1;
  const open = { gap: Number.POSITIVE_INFINITY, against: "nothing" as const };
  if (cabinet.kind === "island") return { left: open, right: open };

  if (placed.runId !== null && placed.offset !== null) {
    const run = resolved.layout.placements.find((entry) => entry.runId === placed.runId);
    const start = placed.offset;
    const end = placed.offset + width;
    const others = resolved.cabinets.filter((other) => other !== placed && other.runId === placed.runId && other.offset !== null && level(other));
    const before = others.filter((other) => other.offset! + other.cabinet.size.width <= start + 1);
    const after = others.filter((other) => other.offset! >= end - 1);
    const wardrobe = spec.furnitureType === "wardrobe";
    const leftOpen = wardrobe && spec.wardrobePlan?.leftEnd === "open";
    const rightOpen = wardrobe && spec.wardrobePlan?.rightEnd === "open";
    const left: Side = before.length
      ? { gap: start - Math.max(...before.map((other) => other.offset! + other.cabinet.size.width)), against: "cabinet" }
      : leftOpen ? open : { gap: start, against: "wall" };
    const right: Side = after.length
      ? { gap: Math.min(...after.map((other) => other.offset!)) - end, against: "cabinet" }
      : rightOpen || !run ? open : { gap: run.usableLength - end, against: "wall" };
    return { left, right };
  }

  // Placed by hand: against another cabinet only if one stands beside it.
  const square = resolved.cabinets.filter((other) => other !== placed && level(other) && placed.rotation === 0 && other.rotation === 0
    && other.z < placed.z + cabinet.size.depth && other.z + other.cabinet.size.depth > placed.z);
  const leftOf = square.filter((other) => other.x + other.cabinet.size.width <= placed.x + 1);
  const rightOf = square.filter((other) => other.x >= placed.x + width - 1);
  const nearest = (gaps: number[]): Side => gaps.length ? { gap: Math.min(...gaps), against: "cabinet" } : open;
  return {
    left: nearest(leftOf.map((other) => placed.x - (other.x + other.cabinet.size.width))),
    right: nearest(rightOf.map((other) => other.x - (placed.x + width))),
  };
}

// ---------------------------------------------------------------------------
// The panels
// ---------------------------------------------------------------------------

export type ClosureInput = {
  spec: DesignSpec;
  resolved: ResolvedDesign;
  placed: PlacedCabinet;
  /** The cabinet's own parts, in its frame — the boards closure panels must clear. */
  parts: Part[];
  /** Its door leaves and drawer fronts, as cabinetFronts gives them. */
  leaves: (FrontRect & { leaf: number; leaves: number; style: string; frontGrip: string; bayId: string; run: number })[];
  drawers: FrontRect[];
  /** Its door runs' clear openings. */
  regions: { bayId: string; run: number; x: number; width: number; floor: number; top: number }[];
};

/** Every closure panel a cabinet needs, enabled or not, at its settled size. */
export function closurePanelsFor(input: ClosureInput): ClosureResult {
  const { spec, resolved, placed, parts, leaves, drawers, regions } = input;
  const cabinet = placed.cabinet;
  const settings = spec.closurePanels;
  const board = closureBoardOf(spec);
  const tc = board.thickness;
  const materials = constructionMaterials(spec);
  const ft = materials.fronts.thickness;
  const t = materials.body.thickness;
  const { width: W, height: H, depth: D } = cabinet.size;
  const plinth = cabinet.plinthHeight;
  const warnings: string[] = [];
  const panels: ClosurePanel[] = [];
  const name = cabinet.label || "Cabinet";
  const hingeAngle = spec.hardware.some((item) => item.kind === "hinge" && /165/.test(item.id)) ? 165 : 110;
  // How far a hinged door's face stands in front of the carcass: its
  // thickness, or nothing for an inset door, which is flush with it.
  const doorProud = doorFrontOffset(spec, ft, "hinged");
  const sizing = doorSizingOf(spec);
  const swing: SwingLeaf[] = leaves.map((leaf) => ({ ...leaf, thickness: leaf.style === "hinged" ? doorProud : ft, maxAngle: hingeAngle }));
  const boxes = parts.flatMap((part) => part.placements.map((at) => ({ part, box: boxOfPart(part, at) })));
  const clashes = (box: ClosureBox) => boxes.find((entry) => boxesOverlap(entry.box, box));
  const sideBoard = (side: "left" | "right") => {
    const gables = parts.filter((part) => part.role === "gable");
    const pick = side === "left"
      ? gables.reduce<Part | undefined>((best, part) => (!best || part.placements[0]!.x < best.placements[0]!.x ? part : best), undefined)
      : gables.reduce<Part | undefined>((best, part) => (!best || part.placements[0]!.x > best.placements[0]!.x ? part : best), undefined);
    return pick?.id ?? `gable-${side}`;
  };
  const add = (kind: ClosurePanelKind, key: string, box: ClosureBox, axis: "x" | "z", fixedTo: string, join: Vec3, reason: string) => {
    const width = axis === "x" ? box.sz : box.sx;
    const height = box.sy;
    panels.push({
      id: `${cabinet.id}/closure-${kind}-${key}`, cabinetId: cabinet.id, kind,
      label: `${LABELS[kind]} — ${name}`, box, axis, width, height, auto: { width, height },
      enabled: true, hidden: false, manual: false, fixedTo, join, reason,
    });
  };

  // ---- Inside: what the doors leave open ---------------------------------
  const frontBoards = boxes.filter(({ part, box }) =>
    box.z < t + 1 && part.manufacture !== "purchased" && part.role !== "door" && part.role !== "drawer_front"
    && ["gable", "divider", "top", "bottom", "rail", "plinth", "shelf"].includes(part.role)
    && (part.role !== "shelf" || box.sy >= 40));
  const gripEdge = gripEdgeOf(cabinet);
  // A G or J profile stands on the door's grip edge, where the board was cut
  // back for it: door and profile together cover the leaf's place.
  const profileOf = (leaf: ClosureInput["leaves"][number]) =>
    leaf.frontGrip === "g-profile" || leaf.frontGrip === "j-profile" ? fingerPullOf(spec, leaf.frontGrip, ft).height : 0;
  const covers: Rect[] = [
    ...leaves.map((leaf) => {
      const profile = profileOf(leaf);
      return gripEdge === "top"
        ? { x: leaf.x, y: leaf.y, width: leaf.width, height: leaf.height + profile }
        : { x: leaf.x, y: leaf.y - profile, width: leaf.width, height: leaf.height + profile };
    }),
    ...drawers.map((front) => ({ x: front.x, y: front.y, width: front.width, height: front.height })),
    ...frontBoards.map(({ box }) => ({ x: box.x, y: box.y, width: box.sx, height: box.sy })),
  ];
  for (const region of regions) {
    // The reveal a door stands back by is not an opening: an inset door leaves
    // its clearance round it, and a sliver that narrow is what makes a door
    // a door and not a hole.
    const sliver = sizing.legacy ? MIN_OPENING : Math.max(MIN_OPENING, 2 * sizing.clearance + 1);
    const exposed = subtractRects({ x: region.x, y: region.floor, width: region.width, height: region.top - region.floor }, covers)
      .filter((rect) => rect.width >= sliver && rect.height >= sliver);
    exposed.forEach((rect, index) => {
      // A strip along the grip edge of a channel-grip leaf of this run is the channel.
      const channel = leaves.some((leaf) => leaf.bayId === region.bayId && leaf.run === region.run && leaf.frontGrip === "channel"
        && rect.x < leaf.x + leaf.width && rect.x + rect.width > leaf.x
        && (gripEdge === "top" ? Math.abs(rect.y - (leaf.y + leaf.height)) <= sizing.clearance + 1 : Math.abs(rect.y + rect.height - leaf.y) <= sizing.clearance + 1));
      let setback = channel ? fingerPullOf(spec, "channel", ft).depth : 0;
      let box: ClosureBox = { x: rect.x, y: rect.y, z: setback, sx: rect.width, sy: rect.height, sz: tc };
      if (setback > 0 && clashes(box)) {
        setback = 0;
        box = { ...box, z: 0 };
      }
      const blocking = clashes(box);
      if (blocking) {
        warnings.push(`${name}: the ${channel ? "finger-pull rail" : "masking panel"} for an opening of ${Math.round(rect.width)} × ${Math.round(rect.height)} mm would run into ${blocking.part.label.toLowerCase()} — left open`);
        return;
      }
      add(channel ? "rail" : "masking", `${region.bayId}-${region.run}-${index}`, box, "z", sideBoard("left"),
        { x: rect.x, y: rect.y + rect.height / 2, z: setback + tc / 2 },
        channel ? "Closes the channel above the doors" : `An opening of ${Math.round(rect.width)} × ${Math.round(rect.height)} mm the doors do not cover`);
    });
  }

  // ---- Ends ---------------------------------------------------------------
  const around = surroundings(spec, resolved, placed);
  const rear = cabinet.kind === "island";
  for (const side of ["left", "right"] as const) {
    const { gap, against } = around[side];
    if (gap <= 1) continue;
    if (gap <= FILLER_MAX && against !== "nothing") {
      // One filler per gap: the cabinet on its left makes the one between two.
      if (against === "cabinet" && side === "left") continue;
      const x = side === "left" ? -gap : W;
      add("filler", side, { x, y: 0, z: 0, sx: gap, sy: H, sz: tc }, "z", sideBoard(side),
        { x: side === "left" ? 0 : W, y: H / 2, z: tc / 2 },
        `A ${Math.round(gap)} mm gap to the ${against === "wall" ? "wall" : "next cabinet"}`);
      continue;
    }
    // Side cover panels are optional add-ons, not automatic closures.
    // Leave exposed cabinet ends uncovered unless the user explicitly adds a panel.
  }

  // ---- Up to the ceiling --------------------------------------------------
  const ceiling = spec.room?.ceilingHeight;
  const topY = placed.y + H;
  if (ceiling && topY >= 1800) {
    const gap = ceiling - topY;
    const above = resolved.cabinets.some((other) => other !== placed && other.y >= topY - 1
      && (placed.runId !== null ? other.runId === placed.runId && other.offset !== null && placed.offset !== null
        && other.offset < placed.offset + W && other.offset + other.cabinet.size.width > placed.offset
        : other.x < placed.x + W && other.x + other.cabinet.size.width > placed.x));
    if (!above && gap >= MIN_OPENING && gap <= TOP_CLOSURE_MAX) {
      add("top", "0", { x: 0, y: H, z: 0, sx: W, sy: gap, sz: tc }, "z", parts.find((part) => part.role === "top")?.id ?? "top",
        { x: W / 2, y: H, z: tc / 2 }, `A ${Math.round(gap)} mm gap to the ceiling`);
    }
  }

  // ---- Under it -----------------------------------------------------------
  if (plinth > 0 && cabinet.kind !== "wall" && !parts.some((part) => part.role === "plinth" && part.manufacture !== "purchased")) {
    // In front of the legs, clipped to them.
    const legs = boxes.filter(({ part }) => part.role === "leg");
    const frontLeg = legs.length ? Math.min(...legs.map(({ box }) => box.z)) : 40 + tc;
    const setback = Math.max(0, Math.min(40, frontLeg - tc));
    add("bottom", "0", { x: 0, y: 0, z: setback, sx: W, sy: plinth, sz: tc }, "z", legs[0]?.part.id ?? "carcass",
      { x: W / 2, y: plinth / 2, z: setback + tc }, "The cabinet stands on legs with nothing in front of them");
  }

  // ---- Behind an island ---------------------------------------------------
  if (rear) {
    add("rear", "0", { x: 0, y: 0, z: D, sx: W, sy: H, sz: tc }, "z", parts.find((part) => part.role === "back")?.id ?? "back",
      { x: W / 2, y: H / 2, z: D }, "The back of an island is seen");
  }

  // ---- What the user changed ----------------------------------------------
  const manual = settings?.sizing === "manual";
  for (const panel of panels) {
    const saved = settings?.panels.find((entry) => entry.id === panel.id);
    if (!saved) continue;
    panel.enabled = saved.enabled !== false;
    panel.hidden = saved.hidden === true;
    if (!manual || (saved.width === undefined && saved.height === undefined)) continue;
    const width = saved.width ?? panel.width;
    const height = saved.height ?? panel.height;
    // Sized from where it is fixed: a front panel from its lower left, an end from its back.
    const box: ClosureBox = panel.axis === "x"
      ? { ...panel.box, z: panel.box.z + panel.box.sz - width, sz: width, sy: height }
      : { ...panel.box, sx: width, sy: height };
    const problem = width < 5 || height < 5
      ? "smaller than a board can be cut"
      : Math.max(width, height) > Math.max(board.sheet.length, board.sheet.width) || Math.min(width, height) > Math.min(board.sheet.length, board.sheet.width)
        ? "larger than a sheet"
        : doorSwingConflict(box, swing)
          ?? (clashes(box) ? `into ${clashes(box)!.part.label.toLowerCase()}` : null)
          ?? (panels.some((other) => other !== panel && other.enabled && boxesOverlap(other.box, box)) ? "over another closure panel" : null);
    if (problem) {
      warnings.push(`${panel.label}: ${Math.round(width)} × ${Math.round(height)} mm is ${problem} — kept at ${Math.round(panel.auto.width)} × ${Math.round(panel.auto.height)} mm`);
      continue;
    }
    Object.assign(panel, { box, width, height, manual: true });
  }

  // What is left open with the panels off, said rather than silently shown.
  if (!settings?.enabled) {
    const open = panels.filter((panel) => panel.kind === "rail" || panel.kind === "masking");
    if (open.length) warnings.push(`${name}: ${open.length === 1 ? "an opening shows" : `${open.length} openings show`} the inside with the doors shut — turn on Smart Closure Panels to close ${open.length === 1 ? "it" : "them"}`);
  }
  return { panels, warnings };
}

/** The enabled panels as parts, in the cabinet's frame, ready for buildParts to place. */
export function closurePartsOf(spec: DesignSpec, panels: ClosurePanel[]): Part[] {
  const board = closureBoardOf(spec);
  const band = spec.carcass.edgeBand;
  return panels.filter((panel) => panel.enabled).map((panel) => {
    const { box } = panel;
    const localId = panel.id.slice(panel.cabinetId.length + 1);
    return {
      id: localId,
      role: "closure",
      label: panel.label,
      board,
      manufacture: "cut",
      // Its height runs with the grain, as a gable's does.
      length: Math.round(panel.height),
      width: Math.round(panel.width),
      quantity: 1,
      edges: panel.kind === "masking" || panel.kind === "rear"
        ? { front: false, back: false, top: false, bottom: false }
        : panel.axis === "x"
          ? { front: true, back: false, top: true, bottom: false }
          : { front: true, back: true, top: false, bottom: false },
      edgeBand: band,
      placements: [{ x: box.x, y: box.y, z: box.z }],
      size: { x: box.sx, y: box.sy, z: box.sz },
      axis: panel.axis,
      closure: { id: panel.id, kind: panel.kind, auto: panel.auto, manual: panel.manual, hidden: panel.hidden, fixedTo: panel.fixedTo, join: panel.join },
    } satisfies Part;
  });
}
