import { findModule } from "./kitchen-modules";
import { LIMITS, validateSpec } from "../types/spec";
import type { Bay, Cabinet, CabinetKind, DesignSpec } from "../types/spec";

/**
 * What somebody can do to a design.
 *
 * Every operation takes a spec and returns a new one, validated. None of them
 * mutate what they are given: the studio holds one immutable design, an edit
 * produces the next one, and undo is therefore a matter of keeping the previous
 * — which is not free but is at least possible, and would not be if these
 * reached into the object the viewer is already rendering.
 *
 * The layout rules live here rather than in the panel that calls them. Deleting
 * a cabinet closes the gap it left; inserting one makes room; widening one
 * pushes its neighbours along. A control that only changed a number and left
 * the run overlapping itself would be a control that produces designs nobody
 * can build.
 */

let sequence = 0;
function freshId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}`;
}

/** Clone, change, validate. The shape of every operation in this file. */
function change(
  spec: DesignSpec,
  mutate: (draft: DesignSpec) => void,
): DesignSpec {
  const draft = structuredClone(spec);
  mutate(draft);
  // Cleared first because the validator appends: without this, twenty edits
  // leave twenty copies of the same line and the panel reads like the design
  // is falling apart.
  draft.meta.corrections = [];
  return validateSpec(draft).spec;
}

/**
 * Cabinets standing at the same height, left to right.
 *
 * A kitchen is two rows — base units on the floor, wall units at 1450 — and an
 * edit to one must not disturb the other. Widening a base unit should push the
 * base units beside it, not the cupboards over its head.
 */
function row(spec: DesignSpec, y: number): Cabinet[] {
  return spec.cabinets
    .filter((cabinet) => Math.abs(cabinet.position.y - y) < 1)
    .sort((a, b) => a.position.x - b.position.x);
}

/**
 * Moves everything to the right of a point along by `delta`.
 *
 * Only the same row, and only what is actually to the right — so a gap
 * somebody left on purpose at the other end of the kitchen stays where they
 * left it.
 */
function shiftAfter(
  spec: DesignSpec,
  y: number,
  fromX: number,
  delta: number,
): void {
  if (delta === 0) return;
  for (const cabinet of spec.cabinets) {
    if (Math.abs(cabinet.position.y - y) >= 1) continue;
    if (cabinet.position.x < fromX - 0.5) continue;
    cabinet.position.x = Math.max(0, cabinet.position.x + delta);
  }
}

function find(spec: DesignSpec, id: string): Cabinet | undefined {
  return spec.cabinets.find((cabinet) => cabinet.id === id);
}

// ---------------------------------------------------------------------------
// Cabinets
// ---------------------------------------------------------------------------

/** Sensible dimensions for a new cabinet of each kind, in millimetres. */
const DEFAULTS: Record<
  CabinetKind,
  { width: number; height: number; depth: number; y: number; plinth: number }
> = {
  base: { width: 600, height: 870, depth: 600, y: 0, plinth: 100 },
  wall: { width: 600, height: 720, depth: 350, y: 1450, plinth: 0 },
  tall: { width: 600, height: 2100, depth: 600, y: 0, plinth: 100 },
  island: { width: 900, height: 870, depth: 700, y: 0, plinth: 100 },
  vanity: { width: 800, height: 500, depth: 500, y: 350, plinth: 0 },
  open: { width: 800, height: 900, depth: 320, y: 0, plinth: 60 },
};

/**
 * Adds a named kitchen module — a sink unit, an oven housing, a fridge space.
 *
 * The same insertion as `addCabinet`, but the caller says what the thing is
 * for rather than how big a box it is, and the module decides the rest.
 */
export function addModule(
  spec: DesignSpec,
  moduleId: string,
  afterId?: string | null,
): DesignSpec {
  const preset = findModule(moduleId);
  if (!preset) return spec;

  return change(spec, (draft) => {
    const t = draft.carcass.board.thickness;
    const defaults = DEFAULTS[preset.kind];
    const width = preset.width;

    const after = afterId ? find(draft, afterId) : undefined;
    // A module joins the row it belongs in, not the row of whatever happened
    // to be selected: adding a wall cupboard while a base unit is selected
    // puts it on the wall, where a wall cupboard goes.
    const y =
      after && after.kind === preset.kind ? after.position.y : defaults.y;
    const x =
      after && after.kind === preset.kind
        ? after.position.x + after.size.width
        : rightEdge(row(draft, y));

    shiftAfter(draft, y, x, width);

    draft.cabinets.push({
      id: freshId(preset.kind),
      label: preset.label,
      kind: preset.kind,
      position: { x, y, z: 0 },
      size: {
        width,
        height: preset.height ?? defaults.height,
        depth: preset.depth ?? defaults.depth,
      },
      bays: preset.bays(width - 2 * t),
      plinthHeight: defaults.plinth,
    });
  });
}

export type AddCabinetOptions = {
  kind: CabinetKind;
  /** Placed immediately after this one. Omitted means at the end of its row. */
  afterId?: string | null;
  width?: number;
  fitting?: Bay["fitting"];
};

export function addCabinet(
  spec: DesignSpec,
  options: AddCabinetOptions,
): DesignSpec {
  return change(spec, (draft) => {
    const preset = DEFAULTS[options.kind];
    const width = Math.max(LIMITS.minWidth, options.width ?? preset.width);
    const t = draft.carcass.board.thickness;

    const after = options.afterId ? find(draft, options.afterId) : undefined;
    // A new cabinet joins the row of the one it was added beside, so "add a
    // cupboard" next to a wall unit produces a wall unit at wall height rather
    // than one on the floor under it.
    const y = after ? after.position.y : preset.y;
    const x = after
      ? after.position.x + after.size.width
      : rightEdge(row(draft, y));

    // Make room before standing in it.
    shiftAfter(draft, y, x, width);

    draft.cabinets.push({
      id: freshId(options.kind),
      label: labelFor(options.kind),
      kind: options.kind,
      position: { x, y, z: after ? after.position.z : 0 },
      size: {
        width,
        height: after && sameRowShape(after, options.kind)
          ? after.size.height
          : preset.height,
        depth: after && sameRowShape(after, options.kind)
          ? after.size.depth
          : preset.depth,
      },
      bays: [
        {
          id: freshId("bay"),
          width: width - 2 * t,
          fitting: options.fitting ?? { kind: "shelves", count: 1, adjustable: true },
          door: options.kind === "open" ? "none" : "hinged",
          doorLeaves: width - 2 * t > LIMITS.hingedLeafWidth ? 2 : 1,
        },
      ],
      plinthHeight: after ? after.plinthHeight : preset.plinth,
    });
  });
}

/**
 * A new cabinet beside an existing one should match it.
 *
 * Only when they are the same kind, though. Adding a tall larder next to a
 * base unit must not make the larder 870 mm high.
 */
function sameRowShape(after: Cabinet, kind: CabinetKind): boolean {
  return after.kind === kind;
}

function rightEdge(cabinets: Cabinet[]): number {
  if (cabinets.length === 0) return 0;
  return Math.max(
    ...cabinets.map((cabinet) => cabinet.position.x + cabinet.size.width),
  );
}

function labelFor(kind: CabinetKind): string {
  switch (kind) {
    case "wall":
      return "Wall unit";
    case "tall":
      return "Tall unit";
    case "island":
      return "Island";
    case "vanity":
      return "Vanity";
    case "open":
      return "Open shelving";
    default:
      return "Base unit";
  }
}

/**
 * Removes a cabinet and closes the gap.
 *
 * The last cabinet cannot be removed — a design with nothing in it is not a
 * design, and the schema refuses it anyway. The panel disables the button
 * rather than letting somebody press it and watch nothing happen.
 */
export function removeCabinet(spec: DesignSpec, id: string): DesignSpec {
  if (spec.cabinets.length <= 1) return spec;

  return change(spec, (draft) => {
    const target = find(draft, id);
    if (!target) return;

    draft.cabinets = draft.cabinets.filter((cabinet) => cabinet.id !== id);
    shiftAfter(draft, target.position.y, target.position.x, -target.size.width);
  });
}

/** Copies a cabinet in beside itself, pushing the rest of the row along. */
export function duplicateCabinet(spec: DesignSpec, id: string): DesignSpec {
  return change(spec, (draft) => {
    const target = find(draft, id);
    if (!target) return;
    if (draft.cabinets.length >= 40) return;

    const copy = structuredClone(target);
    copy.id = freshId(target.kind);
    copy.position = { ...target.position, x: target.position.x + target.size.width };
    // Bay ids must be fresh too. Two bays sharing an id put two parts at the
    // same key in the viewer and one of them stops updating.
    copy.bays = copy.bays.map((bay) => ({ ...bay, id: freshId("bay") }));

    shiftAfter(draft, target.position.y, copy.position.x, target.size.width);
    draft.cabinets.push(copy);
  });
}

export type CabinetSize = Partial<{
  width: number;
  height: number;
  depth: number;
}>;

/**
 * Resizes one cabinet, and moves its neighbours out of the way.
 *
 * The bays are redivided rather than left alone, because a bay is a share of
 * the interior and not an independent number — leaving them would make the
 * validator's rescale fight the slider on every frame of a drag.
 */
export function resizeCabinet(
  spec: DesignSpec,
  id: string,
  size: CabinetSize,
): DesignSpec {
  return change(spec, (draft) => {
    const target = find(draft, id);
    if (!target) return;

    const before = target.size.width;

    if (size.width !== undefined) {
      target.size.width = clamp(size.width, LIMITS.minWidth, 6000);
    }
    if (size.height !== undefined) {
      target.size.height = clamp(size.height, 100, LIMITS.maxHeight);
    }
    if (size.depth !== undefined) {
      target.size.depth = clamp(size.depth, 100, 1200);
    }

    if (size.width !== undefined) {
      redivide(target, draft.carcass.board.thickness);
      shiftAfter(
        draft,
        target.position.y,
        target.position.x + before,
        target.size.width - before,
      );
    }
  });
}

export type MoveOptions = {
  /**
   * Close the row up afterwards, in the new left-to-right order.
   *
   * On by default, and it is what makes dragging a cabinet along a run useful
   * rather than dangerous: without it, dragging the sink two units to the
   * right leaves it standing inside the hob unit and a hole where it was.
   * With it, the two swap places and the run stays tight — which is what
   * somebody dragging a cabinet past its neighbour meant to happen.
   *
   * Turned off for the rare deliberate gap: an island, a run interrupted by a
   * doorway.
   */
  reflow?: boolean;
};

/** Moves a cabinet along its run, or up and down. */
export function moveCabinet(
  spec: DesignSpec,
  id: string,
  to: Partial<{ x: number; y: number; z: number }>,
  options: MoveOptions = {},
): DesignSpec {
  return change(spec, (draft) => {
    const target = find(draft, id);
    if (!target) return;

    const wasAt = target.position.y;

    if (to.x !== undefined) target.position.x = Math.max(0, Math.round(to.x));
    if (to.y !== undefined) target.position.y = Math.max(0, Math.round(to.y));
    if (to.z !== undefined) target.position.z = Math.round(to.z);

    if (options.reflow !== false) {
      reflowRow(draft, target.position.y);
      // Leaving the row it came from also closes that row up.
      if (Math.abs(wasAt - target.position.y) >= 1) reflowRow(draft, wasAt);
    }
  });
}

/**
 * Packs a row end to end, in whatever order the cabinets now stand.
 *
 * The row keeps its own left edge — a kitchen whose base run starts at 600
 * because two tall units stand to the left of it does not slide to the wall
 * because somebody dragged a cupboard.
 */
function reflowRow(spec: DesignSpec, y: number): void {
  const cabinets = row(spec, y);
  if (cabinets.length === 0) return;

  let cursor = Math.min(...cabinets.map((cabinet) => cabinet.position.x));
  for (const cabinet of cabinets) {
    cabinet.position.x = Math.round(cursor);
    cursor += cabinet.size.width;
  }
}

/** Equal bays filling the interior exactly. */
function redivide(cabinet: Cabinet, thickness: number): void {
  const interior =
    cabinet.size.width -
    2 * thickness -
    Math.max(0, cabinet.bays.length - 1) * thickness;
  const each = Math.max(1, Math.round(interior / cabinet.bays.length));

  for (const bay of cabinet.bays) {
    bay.width = each;
    // A leaf that has grown past the practical limit becomes a pair here
    // rather than being corrected a moment later, so dragging a width slider
    // does not print a correction notice on every frame.
    if (bay.door === "hinged" && bay.fitting.kind !== "drawers") {
      bay.doorLeaves = each > LIMITS.hingedLeafWidth ? 2 : 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Inside a cabinet
// ---------------------------------------------------------------------------

export function addBay(spec: DesignSpec, cabinetId: string): DesignSpec {
  return change(spec, (draft) => {
    const target = find(draft, cabinetId);
    if (!target || target.bays.length >= 24) return;

    const last = target.bays[target.bays.length - 1];
    target.bays.push({
      id: freshId("bay"),
      width: 400,
      fitting: { kind: "shelves", count: 1, adjustable: true },
      door: last?.door ?? "hinged",
      doorLeaves: 1,
    });
    redivide(target, draft.carcass.board.thickness);
  });
}

export function removeBay(
  spec: DesignSpec,
  cabinetId: string,
  bayId: string,
): DesignSpec {
  return change(spec, (draft) => {
    const target = find(draft, cabinetId);
    if (!target || target.bays.length <= 1) return;

    target.bays = target.bays.filter((bay) => bay.id !== bayId);
    redivide(target, draft.carcass.board.thickness);
  });
}

export function setBayFitting(
  spec: DesignSpec,
  cabinetId: string,
  bayId: string,
  fitting: Bay["fitting"],
): DesignSpec {
  return change(spec, (draft) => {
    const bay = find(draft, cabinetId)?.bays.find((entry) => entry.id === bayId);
    if (!bay) return;
    bay.fitting = fitting;

    // Drawers are fronted by their own fronts, so a hinged door over them is a
    // door nobody cuts. Switching to drawers switches the front with it.
    if (fitting.kind === "drawers" && bay.door === "hinged") {
      bay.doorLeaves = 1;
    }
  });
}

export function setBayDoor(
  spec: DesignSpec,
  cabinetId: string,
  bayId: string,
  door: Bay["door"],
): DesignSpec {
  return change(spec, (draft) => {
    const target = find(draft, cabinetId);
    const bay = target?.bays.find((entry) => entry.id === bayId);
    if (!bay) return;
    bay.door = door;
    if (door === "hinged") {
      bay.doorLeaves = bay.width > LIMITS.hingedLeafWidth ? 2 : 1;
    }
  });
}

/**
 * Nudges a count up or down — shelves in a bay, drawers in a bank.
 *
 * One function rather than four, because "one more" and "one fewer" is the
 * only interaction any of them needs and a stepper is the only control.
 */
export function adjustBayCount(
  spec: DesignSpec,
  cabinetId: string,
  bayId: string,
  delta: number,
): DesignSpec {
  return change(spec, (draft) => {
    const bay = find(draft, cabinetId)?.bays.find((entry) => entry.id === bayId);
    if (!bay) return;

    if (bay.fitting.kind === "shelves") {
      bay.fitting.count = clamp(bay.fitting.count + delta, 0, 20);
    } else if (bay.fitting.kind === "drawers") {
      bay.fitting.count = clamp(bay.fitting.count + delta, 1, 8);
      // Explicit heights no longer match the count, and a stale array is worse
      // than none: it would size four fronts for a bank of five.
      bay.fitting.frontHeights = undefined;
    } else if (bay.fitting.kind === "hanging") {
      bay.fitting.rails = clamp(bay.fitting.rails + delta, 1, 2);
    }
  });
}

/** Renames a cabinet, which is how a kitchen becomes readable. */
export function renameCabinet(
  spec: DesignSpec,
  id: string,
  label: string,
): DesignSpec {
  return change(spec, (draft) => {
    const target = find(draft, id);
    if (!target) return;
    target.label = label.trim().slice(0, 80) || target.label;
  });
}

export function setCabinetKind(
  spec: DesignSpec,
  id: string,
  kind: CabinetKind,
): DesignSpec {
  return change(spec, (draft) => {
    const target = find(draft, id);
    if (!target) return;

    const preset = DEFAULTS[kind];
    target.kind = kind;
    // Changing a base unit into a wall unit has to move it up and take its
    // plinth away, or it is a wall unit standing on the floor on legs.
    target.plinthHeight = preset.plinth;
    if (kind === "wall" && target.position.y === 0) {
      target.position.y = preset.y;
      target.size.height = preset.height;
      target.size.depth = preset.depth;
    }
    if (kind !== "wall" && kind !== "vanity" && target.position.y > 0) {
      target.position.y = 0;
    }
  });
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, Math.round(value)));
}

// ---------------------------------------------------------------------------
// Individual drawers (Parts 9–14)
// ---------------------------------------------------------------------------

/**
 * Editing one drawer rather than a bay full of them.
 *
 * The model could already say "four drawers" and, through `frontHeights`, "four
 * drawers of these heights" — but nothing in the studio ever wrote that array,
 * so every chest of drawers Medosha produced was four equal fronts. A real one
 * is not: the bottom drawer is deeper because that is where the jumpers go.
 *
 * ## What is editable and what is not
 *
 * A drawer front's **height** is its own, and these operations set it.
 *
 * Its **width** and **thickness** are not, and no control here pretends
 * otherwise. A front is as wide as the bay it closes minus two door gaps, and
 * as thick as the board it is cut from. A "front width" field that let somebody
 * type 400 into a 600 bay would produce a wardrobe with a 200 mm hole in it,
 * and the honest control for that is the bay width, which already exists.
 *
 * Its **material** is the carcass front board, one control for the whole
 * design, which is how these are actually made and bought: nobody orders one
 * sheet of walnut for the third drawer.
 *
 * ## Heights are absolute, and repaired rather than refused
 *
 * A drawer whose heights do not fill the opening is not an error — it is
 * somebody halfway through an edit. `normaliseFronts` scales them back to fit
 * on the way out, so the geometry always gets an array that adds up and the
 * person editing never gets shouted at.
 */

/** The bay's drawers fitting, or undefined if it is not one. */
function drawersIn(
  spec: DesignSpec,
  cabinetId: string,
  bayId: string,
): Extract<Bay["fitting"], { kind: "drawers" }> | undefined {
  const bay = find(spec, cabinetId)?.bays.find((entry) => entry.id === bayId);
  return bay?.fitting.kind === "drawers" ? bay.fitting : undefined;
}

/** The heights as they stand, filled in when the design left them implicit. */
export function frontHeightsOf(
  fitting: Extract<Bay["fitting"], { kind: "drawers" }>,
  opening: number,
): number[] {
  if (fitting.frontHeights?.length === fitting.count) {
    return [...fitting.frontHeights];
  }
  // Equal division is what "four drawers" means to everyone who is not a
  // designer, and it is what the geometry already assumes.
  const each = Math.floor(opening / fitting.count);
  return Array.from({ length: fitting.count }, () => each);
}

/**
 * Heights scaled to fill the opening exactly.
 *
 * Proportional rather than clamped: somebody who made the top drawer twice as
 * tall meant the *others* to give way, and clamping would keep their number and
 * silently shrink the bay's last drawer to nothing.
 */
function normaliseFronts(heights: number[], opening: number): number[] {
  const total = heights.reduce((sum, height) => sum + height, 0);
  if (total <= 0 || opening <= 0) return heights;

  const scale = opening / total;
  const scaled = heights.map((height) => Math.round(height * scale));

  // Rounding leaves a millimetre or two. It goes on the bottom drawer, which is
  // the biggest and where it will never be seen.
  const drift = opening - scaled.reduce((sum, height) => sum + height, 0);
  const last = scaled.length - 1;
  if (last >= 0 && scaled[last] !== undefined) {
    scaled[last] = Math.max(1, scaled[last] + drift);
  }
  return scaled;
}

/** The clear opening a bay's drawers divide, in mm. */
export function openingHeightOf(cabinet: Cabinet, boardThickness: number): number {
  return cabinet.size.height - cabinet.plinthHeight - 2 * boardThickness;
}

/** Sets one drawer's front height, in mm. The rest give way proportionally. */
export function setDrawerHeight(
  spec: DesignSpec,
  cabinetId: string,
  bayId: string,
  index: number,
  height: number,
): DesignSpec {
  return change(spec, (draft) => {
    const cabinet = find(draft, cabinetId);
    const bay = cabinet?.bays.find((entry) => entry.id === bayId);
    if (!cabinet || !bay || bay.fitting.kind !== "drawers") return;

    const opening = openingHeightOf(cabinet, draft.carcass.board.thickness);
    const heights = frontHeightsOf(bay.fitting, opening);
    if (index < 0 || index >= heights.length) return;

    // A floor, not a free number. A 5 mm drawer front is not a drawer, and
    // letting one be typed produces a design the shop returns.
    heights[index] = Math.max(LIMITS.minDrawerFront, Math.round(height));
    bay.fitting.frontHeights = normaliseFronts(heights, opening);
  });
}

/** Adds a drawer below the given one, taking its height from the others. */
export function addDrawer(
  spec: DesignSpec,
  cabinetId: string,
  bayId: string,
  after?: number,
): DesignSpec {
  return change(spec, (draft) => {
    const cabinet = find(draft, cabinetId);
    const bay = cabinet?.bays.find((entry) => entry.id === bayId);
    if (!cabinet || !bay || bay.fitting.kind !== "drawers") return;
    if (bay.fitting.count >= 8) return;

    const opening = openingHeightOf(cabinet, draft.carcass.board.thickness);
    const heights = frontHeightsOf(bay.fitting, opening);
    const at = after === undefined ? heights.length : after + 1;

    // The new one is the average of what is there, so adding a drawer to a
    // chest of unequal drawers produces a plausible one rather than a sliver.
    const average = Math.round(
      heights.reduce((sum, height) => sum + height, 0) / heights.length,
    );
    heights.splice(at, 0, average);

    bay.fitting.count = heights.length;
    bay.fitting.frontHeights = normaliseFronts(heights, opening);
  });
}

/** Removes one drawer. Its height goes back to the others. */
export function removeDrawer(
  spec: DesignSpec,
  cabinetId: string,
  bayId: string,
  index: number,
): DesignSpec {
  return change(spec, (draft) => {
    const cabinet = find(draft, cabinetId);
    const bay = cabinet?.bays.find((entry) => entry.id === bayId);
    if (!cabinet || !bay || bay.fitting.kind !== "drawers") return;
    // One drawer is a chest of drawers; none is a hole.
    if (bay.fitting.count <= 1) return;

    const opening = openingHeightOf(cabinet, draft.carcass.board.thickness);
    const heights = frontHeightsOf(bay.fitting, opening);
    if (index < 0 || index >= heights.length) return;

    heights.splice(index, 1);
    bay.fitting.count = heights.length;
    bay.fitting.frontHeights = normaliseFronts(heights, opening);
  });
}

/** Copies a drawer, inserting the copy directly below it. */
export function duplicateDrawer(
  spec: DesignSpec,
  cabinetId: string,
  bayId: string,
  index: number,
): DesignSpec {
  return change(spec, (draft) => {
    const cabinet = find(draft, cabinetId);
    const bay = cabinet?.bays.find((entry) => entry.id === bayId);
    if (!cabinet || !bay || bay.fitting.kind !== "drawers") return;
    if (bay.fitting.count >= 8) return;

    const opening = openingHeightOf(cabinet, draft.carcass.board.thickness);
    const heights = frontHeightsOf(bay.fitting, opening);
    const source = heights[index];
    if (source === undefined) return;

    heights.splice(index + 1, 0, source);
    bay.fitting.count = heights.length;
    bay.fitting.frontHeights = normaliseFronts(heights, opening);
  });
}

/**
 * Moves a drawer up or down the stack.
 *
 * Swaps heights rather than re-sorting: moving the deep drawer up means the
 * deep drawer is now higher, and the one it passed is now lower. Anything else
 * would be a control that reorders the list and changes nothing visible.
 */
export function moveDrawer(
  spec: DesignSpec,
  cabinetId: string,
  bayId: string,
  index: number,
  direction: -1 | 1,
): DesignSpec {
  return change(spec, (draft) => {
    const cabinet = find(draft, cabinetId);
    const bay = cabinet?.bays.find((entry) => entry.id === bayId);
    if (!cabinet || !bay || bay.fitting.kind !== "drawers") return;

    const opening = openingHeightOf(cabinet, draft.carcass.board.thickness);
    const heights = frontHeightsOf(bay.fitting, opening);
    const target = index + direction;
    if (index < 0 || index >= heights.length) return;
    if (target < 0 || target >= heights.length) return;

    const a = heights[index];
    const b = heights[target];
    if (a === undefined || b === undefined) return;
    heights[index] = b;
    heights[target] = a;

    bay.fitting.frontHeights = normaliseFronts(heights, opening);
  });
}

/** Back to equal fronts. The way out of an edit that went wrong. */
export function evenDrawers(
  spec: DesignSpec,
  cabinetId: string,
  bayId: string,
): DesignSpec {
  return change(spec, (draft) => {
    const bay = find(draft, cabinetId)?.bays.find((entry) => entry.id === bayId);
    if (!bay || bay.fitting.kind !== "drawers") return;
    // Deleting the array *is* the reset: absent means equal division, and
    // writing equal numbers into it would only look the same until the bay was
    // resized.
    delete bay.fitting.frontHeights;
  });
}

/** Whether this bay's drawers have been given heights of their own. */
export function hasCustomFronts(
  spec: DesignSpec,
  cabinetId: string,
  bayId: string,
): boolean {
  const fitting = drawersIn(spec, cabinetId, bayId);
  return (fitting?.frontHeights?.length ?? 0) > 0;
}
