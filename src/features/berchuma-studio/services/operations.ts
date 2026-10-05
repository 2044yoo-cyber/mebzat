import { MIN_HEIGHT_MODULE, PREFERRED_LOWER, heightStackOf, planHeights } from "./height-modules";
import { findModule } from "./kitchen-modules";
import { placeOnRun, solveLayout } from "./layout";
import { LIMITS, practicalDrawerCount, validateSpec } from "../types/spec";
import type { Bay, Cabinet, CabinetKind, DesignSpec } from "../types/spec";
import { drawerFrontHeights } from "./drawer-construction";
import { cabinetFaceBoards, cabinetFronts, isSideDisplay, sectionBands as sectionBandsOf, type DoorLeaf } from "./geometry";
import { doorRectProblem, doorSnapTargets, equalLeaves, MIN_DOOR, type FrontRect } from "./door-layout";
import { bayLayout, bayModules, carcassInterior, defaultJoints, jointSnapTargets, MIN_MODULE, moduleInterior, modulesOf } from "./transport-modules";

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
  syncStackedCabinets(draft);
  // `position.x`/`position.z` are snapshots for run-bound cabinets. Keep them
  // in sync after an operation so legacy readers and the derived envelope see
  // the same layout as the resolver; the operation arithmetic itself still
  // reads and writes the authoritative run offset below.
  syncRunBoundPositions(draft);
  // Cleared first because the validator appends: without this, twenty edits
  // leave twenty copies of the same line and the panel reads like the design
  // is falling apart.
  draft.meta.corrections = [];
  return validateSpec(draft).spec;
}

function syncStackedCabinets(spec: DesignSpec): void {
  for (const top of spec.cabinets) {
    if (!top.stackedOn) continue;
    const lower = find(spec, top.stackedOn);
    if (!lower) continue;
    top.position.x = lower.position.x;
    top.position.y = lower.position.y + lower.size.height;
    top.position.z = lower.position.z;
    top.runId = lower.runId;
    top.offset = lower.offset;
  }
}

/**
 * Cabinets standing in the same editable row, left to right.
 *
 * A kitchen is two rows — base units on the floor, wall units at 1450 — and an
 * edit to one must not disturb the other. A run-bound row additionally belongs
 * to one wall run: an edit on Wall B must never push a cabinet on Wall A just
 * because their stored y coordinates match. A free-standing cabinet continues
 * to use its own stored x coordinate and does not join a wall row by accident.
 */
type CabinetRow = {
  runId: string | null;
  y: number;
};

function rowOf(cabinet: Cabinet): CabinetRow {
  return { runId: cabinet.runId ?? null, y: cabinet.position.y };
}

function sameRow(cabinet: Cabinet, target: CabinetRow): boolean {
  return (
    Math.abs(cabinet.position.y - target.y) < 1 &&
    (target.runId === null
      ? !cabinet.runId
      : cabinet.runId === target.runId)
  );
}

/** The coordinate that is authoritative for the cabinet's kind of placement. */
function along(cabinet: Cabinet): number {
  return cabinet.runId ? (cabinet.offset ?? 0) : cabinet.position.x;
}

/**
 * Move a cabinet along its own placement axis.
 *
 * `position.x` is deliberately not updated here for a run-bound cabinet:
 * callers must not be able to make an L/U layout overlap by treating a world
 * x coordinate as a distance along a turned wall. `syncRunBoundPositions`
 * writes the derived snapshot once the run arithmetic is complete.
 */
function setAlong(cabinet: Cabinet, value: number): void {
  const next = Math.max(0, Math.round(value));
  if (cabinet.runId) {
    cabinet.offset = next;
  } else {
    cabinet.position.x = next;
  }
}

function row(spec: DesignSpec, target: CabinetRow): Cabinet[] {
  return spec.cabinets
    .filter((cabinet) => sameRow(cabinet, target))
    .sort((a, b) => along(a) - along(b));
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
  target: CabinetRow,
  fromX: number,
  delta: number,
): void {
  if (delta === 0) return;
  for (const cabinet of row(spec, target)) {
    if (along(cabinet) < fromX - 0.5) continue;
    setAlong(cabinet, along(cabinet) + delta);
  }
}

/**
 * Refresh derived world-coordinate snapshots for valid run bindings.
 *
 * The resolver intentionally ignores these snapshots for normal rendering,
 * but validation still derives the envelope from them and old integrations may
 * display them. A missing run remains a true fallback and is left untouched.
 */
function syncRunBoundPositions(spec: DesignSpec): void {
  const layout = solveLayout(spec.layout, spec.runs, {
    cornerKind: spec.cornerKind,
    cornerKinds: spec.cornerKinds,
    cornerSettings: spec.cornerSettings,
    kitchenFacing: !!spec.kitchenSetup,
  });
  const placements = new Map(
    layout.placements.map((placement) => [placement.runId, placement]),
  );

  for (const cabinet of spec.cabinets) {
    if (!cabinet.runId) continue;
    const placement = placements.get(cabinet.runId);
    if (!placement) continue;

    const point = placeOnRun(placement, cabinet.offset ?? 0, spec.kitchenSetup ? cabinet.size.depth : undefined);
    cabinet.position.x = point.x;
    cabinet.position.z = point.z;
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
    const targetRow = after
      ? { runId: after.runId ?? null, y }
      : defaultRow(draft, preset.kind, y);
    const x =
      after && after.kind === preset.kind
        ? along(after) + after.size.width
        : rightEdge(row(draft, targetRow));

    const added: Cabinet = {
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
    };
    bindToRow(added, targetRow, x);
    shiftAfter(draft, targetRow, x, width);
    draft.cabinets.push(added);
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
    const targetRow = after
      ? rowOf(after)
      : defaultRow(draft, options.kind, y);
    const x = after
      ? along(after) + after.size.width
      : rightEdge(row(draft, targetRow));

    // Make room before standing in it.
    shiftAfter(draft, targetRow, x, width);

    const added: Cabinet = {
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
    };
    bindToRow(added, targetRow, x);
    draft.cabinets.push(added);
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
    ...cabinets.map((cabinet) => along(cabinet) + cabinet.size.width),
  );
}

/**
 * Choose the natural destination for an add with no selected neighbour.
 *
 * A single matching run is unambiguous, so the new cabinet joins it. More than
 * one run is intentionally left free-standing: silently choosing Wall A for a
 * cabinet added to an L/U plan is worse than asking the caller to provide an
 * `afterId`.
 */
function defaultRow(
  spec: DesignSpec,
  kind: CabinetKind,
  y: number,
): CabinetRow {
  const runIds = new Set(
    spec.cabinets
      .filter(
        (cabinet) =>
          cabinet.kind === kind &&
          Math.abs(cabinet.position.y - y) < 1 &&
          Boolean(cabinet.runId),
      )
      .map((cabinet) => cabinet.runId!),
  );

  return {
    runId: runIds.size === 1 ? [...runIds][0]! : null,
    y,
  };
}

/** Apply a row binding to a freshly-created cabinet without copying stale x. */
function bindToRow(cabinet: Cabinet, target: CabinetRow, offset: number): void {
  if (target.runId) {
    cabinet.runId = target.runId;
    cabinet.offset = Math.max(0, Math.round(offset));
  } else {
    delete cabinet.runId;
    delete cabinet.offset;
    cabinet.position.x = Math.max(0, Math.round(offset));
  }
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

    const targetRow = rowOf(target);
    const targetStart = along(target);
    draft.cabinets = draft.cabinets.filter(
      (cabinet) => cabinet.id !== id && cabinet.stackedOn !== id,
    );
    shiftAfter(draft, targetRow, targetStart, -target.size.width);
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
    const insertAt = along(target) + target.size.width;
    bindToRow(copy, rowOf(target), insertAt);
    // Bay ids must be fresh too. Two bays sharing an id put two parts at the
    // same key in the viewer and one of them stops updating.
    copy.bays = copy.bays.map((bay) => ({ ...bay, id: freshId("bay") }));

    shiftAfter(draft, rowOf(target), insertAt, target.size.width);
    draft.cabinets.push(copy);
    // A wardrobe module is copied with what stands on it: the copy is the
    // same height, made the same way, not a lower module on its own.
    copyUpper(draft, target.id, copy.id);
  });
}

function copyUpper(draft: DesignSpec, fromId: string, toId: string, upper = draft.cabinets.find((cabinet) => cabinet.stackedOn === fromId)): void {
  if (!upper || draft.furnitureType !== "wardrobe") return;
  const top = structuredClone(upper);
  top.id = freshId(upper.kind);
  top.stackedOn = toId;
  top.bays = top.bays.map((bay) => ({ ...bay, id: freshId("bay") }));
  draft.cabinets.push(top);
}

/** A copied cabinet, and the upper module standing on it when it has one. */
export type CabinetClip = { cabinet: Cabinet; upper?: Cabinet };

/** What Copy keeps: the cabinet as it is now, with its upper module. */
export function copyCabinet(spec: DesignSpec, id: string): CabinetClip | null {
  const target = find(spec, id);
  if (!target) return null;
  const lower = target.stackedOn ? find(spec, target.stackedOn) ?? target : target;
  const upper = spec.cabinets.find((cabinet) => cabinet.stackedOn === lower.id);
  return { cabinet: structuredClone(lower), ...(upper ? { upper: structuredClone(upper) } : {}) };
}

/**
 * A copied cabinet put in after `afterId` — or at the end of the floor row —
 * pushing the rest along: a fresh cabinet, its bays and upper module new.
 */
export function pasteCabinet(spec: DesignSpec, clip: CabinetClip, afterId?: string | null): DesignSpec {
  return change(spec, (draft) => {
    if (draft.cabinets.length >= 40) return;
    const picked = afterId ? find(draft, afterId) : undefined;
    const anchorBase = picked?.stackedOn ? find(draft, picked.stackedOn) : picked;
    const floor = draft.cabinets.filter((cabinet) => !cabinet.stackedOn && cabinet.kind !== "wall");
    const anchor = anchorBase ?? floor.sort((a, b) => along(b) + b.size.width - (along(a) + a.size.width))[0];
    const copy = structuredClone(clip.cabinet);
    copy.id = freshId(copy.kind);
    copy.bays = copy.bays.map((bay) => ({ ...bay, id: freshId("bay") }));
    delete copy.stackedOn;
    if (anchor) {
      const insertAt = along(anchor) + anchor.size.width;
      bindToRow(copy, rowOf(anchor), insertAt);
      shiftAfter(draft, rowOf(anchor), insertAt, copy.size.width);
    }
    draft.cabinets.push(copy);
    copyUpper(draft, clip.cabinet.id, copy.id, clip.upper);
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
        rowOf(target),
        along(target) + before,
        target.size.width - before,
      );
    }
  });
}

/** Add a separate overhead wardrobe carcass without changing the lower one. */
export function addTopCabinet(spec: DesignSpec, lowerId: string, height = 700): DesignSpec {
  return change(spec, (draft) => {
    const lower = find(draft, lowerId);
    if (!lower || lower.stackedOn || draft.cabinets.some((cabinet) => cabinet.stackedOn === lower.id)) return;
    if (draft.furnitureType === "kitchen" && draft.kitchenSetup && lower.position.y + lower.size.height + height > draft.kitchenSetup.roomHeight) return;
    pushUpper(draft, lower, height);
  });
}

/**
 * A carcass stacked on another: the same width, depth and door layout, its
 * own sides, top, bottom and back. On a wardrobe it is the upper height
 * module; on a kitchen unit, an extra top row.
 */
function pushUpper(draft: DesignSpec, lower: Cabinet, height: number): Cabinet {
  const width = lower.size.width;
  const upper: Cabinet = {
      id: freshId("top-cabinet"),
      label: draft.furnitureType === "wardrobe" ? (isSideDisplay(lower) ? `${lower.label}, upper module` : "Upper module") : "Top cabinet",
      kind: lower.kind,
      position: { x: lower.position.x, y: lower.position.y + lower.size.height, z: lower.position.z },
      runId: lower.runId,
      offset: lower.offset,
      size: { width, height: clamp(height, 200, LIMITS.maxHeight), depth: lower.size.depth },
      // Keep only the lower cabinet's vertical and door layout upstairs. An
      // open display stays one: shelves, about one every 350 mm.
      bays: lower.bays.map((bay) => ({
        ...bay,
        id: freshId("bay"),
        fitting: bay.display && bay.fitting.kind === "shelves" ? { ...bay.fitting, count: Math.max(1, Math.floor(height / 350)) } : { kind: "open" as const },
      })),
      plinthHeight: 0,
      stackedOn: lower.id,
  };
  draft.cabinets.push(upper);
  return upper;
}

/** Remove only the independently built overhead cabinet. */
export function removeTopCabinet(spec: DesignSpec, lowerId: string): DesignSpec {
  return change(spec, (draft) => {
    draft.cabinets = draft.cabinets.filter((cabinet) => cabinet.stackedOn !== lowerId);
  });
}

// ---- Height modules -----------------------------------------------------------
//
// A wardrobe divided in height is a lower carcass with an upper one stacked on
// it — each with its own sides, top, bottom and back, joined on site through
// the lower's top and the upper's bottom. The division runs across the
// cabinets standing beside it at the same height — a side display, a second
// wardrobe — unless the owner turns that off, so the whole front reads as one
// grid of modules. See `height-modules.ts` for what the material allows.

/** The lower cabinets one height division runs across. */
function heightGroup(draft: DesignSpec, lower: Cabinet): Cabinet[] {
  if (draft.furnitureType !== "wardrobe" || lower.heightModules?.align === false) return [lower];
  const total = (cabinet: Cabinet) => cabinet.size.height + (draft.cabinets.find((other) => other.stackedOn === cabinet.id)?.size.height ?? 0);
  const row = rowOf(lower);
  return draft.cabinets.filter(
    (cabinet) =>
      cabinet.id === lower.id ||
      (!cabinet.stackedOn && cabinet.kind !== "wall" && cabinet.heightModules?.align !== false && (cabinet.runId ?? null) === row.runId && cabinet.position.y === row.y && Math.abs(total(cabinet) - total(lower)) < 0.5),
  );
}

function lowerOf(draft: DesignSpec, cabinetId: string): Cabinet | undefined {
  const cabinet = find(draft, cabinetId);
  return cabinet?.stackedOn ? find(draft, cabinet.stackedOn) : cabinet;
}

/**
 * The heights of a wardrobe's modules, floor up: one height for one carcass,
 * two for a lower and an upper. Applied across its height group; the overall
 * height is whatever they add up to.
 */
export function applyHeightModules(spec: DesignSpec, cabinetId: string, heights: number[], options: { auto?: boolean; locked?: boolean } = {}): DesignSpec {
  return change(spec, (draft) => {
    const lower = lowerOf(draft, cabinetId);
    if (!lower || !heights.length) return;
    for (const member of heightGroup(draft, lower)) {
      const upper = draft.cabinets.find((cabinet) => cabinet.stackedOn === member.id);
      member.heightModules = { auto: options.auto ?? member.heightModules?.auto ?? false, align: member.heightModules?.align ?? true, ...(options.locked ?? member.heightModules?.locked ? { locked: true } : {}) };
      if (heights.length === 1) {
        member.size.height = clamp(heights[0]!, 100, LIMITS.maxHeight);
        if (upper) draft.cabinets = draft.cabinets.filter((cabinet) => cabinet.id !== upper.id);
        continue;
      }
      member.size.height = clamp(heights[0]!, MIN_HEIGHT_MODULE, LIMITS.maxHeight);
      if (upper) upper.size.height = clamp(heights[1]!, MIN_HEIGHT_MODULE, LIMITS.maxHeight);
      else pushUpper(draft, member, heights[1]!);
    }
  });
}

/**
 * The boundary between the lower and upper module moved: the lower module
 * becomes `lowerHeight`, the upper takes the rest, and the overall height
 * stays what it was. Refused while the boundary is locked.
 */
export function moveHeightPartition(spec: DesignSpec, cabinetId: string, lowerHeight: number): DesignSpec {
  const stack = heightStackOf(spec, cabinetId);
  if (!stack?.upper || stack.lower.heightModules?.locked) return spec;
  const total = stack.lower.size.height + stack.upper.size.height;
  const lower = Math.min(total - MIN_HEIGHT_MODULE, Math.max(MIN_HEIGHT_MODULE, lowerHeight));
  return applyHeightModules(spec, stack.lower.id, [lower, total - lower], { auto: false });
}

/** The upper module's height typed: the lower takes the difference, the total kept. */
export function setUpperModuleHeight(spec: DesignSpec, cabinetId: string, upperHeight: number): DesignSpec {
  const stack = heightStackOf(spec, cabinetId);
  if (!stack?.upper) return spec;
  return moveHeightPartition(spec, cabinetId, stack.lower.size.height + stack.upper.size.height - upperHeight);
}

/**
 * A new overall height. A locked boundary keeps the lower module and the
 * upper takes the change; on Auto the material decides again; otherwise the
 * upper module takes the change while it can, and the lower gives way below
 * the shortest upper module.
 */
export function setOverallHeight(spec: DesignSpec, cabinetId: string, total: number): DesignSpec {
  const stack = heightStackOf(spec, cabinetId);
  if (!stack) return spec;
  const { lower, upper } = stack;
  if (lower.heightModules?.auto) return applyHeightModules(spec, lower.id, planHeights(spec, lower.id, total).recommended, { auto: true });
  // One carcass taller than its board can make is divided as recommended,
  // rather than quietly cut short.
  if (!upper) {
    const plan = planHeights(spec, lower.id, total);
    return applyHeightModules(spec, lower.id, plan.singleFits ? [total] : plan.recommended);
  }
  if (lower.heightModules?.locked) return total - lower.size.height >= MIN_HEIGHT_MODULE ? applyHeightModules(spec, lower.id, [lower.size.height, total - lower.size.height]) : spec;
  const below = Math.min(lower.size.height, total - MIN_HEIGHT_MODULE);
  return applyHeightModules(spec, lower.id, [below, total - below]);
}

/** Back to what the material recommends, on Auto, the lock released. */
export function resetHeightModules(spec: DesignSpec, cabinetId: string): DesignSpec {
  const stack = heightStackOf(spec, cabinetId);
  if (!stack) return spec;
  const total = stack.lower.size.height + (stack.upper?.size.height ?? 0);
  const next = applyHeightModules(spec, stack.lower.id, planHeights(spec, stack.lower.id, total).recommended, { auto: true });
  return lockHeightPartition(next, stack.lower.id, false);
}

/** One carcass again — refused where the material cannot make the whole height in one. */
export function removeHeightPartition(spec: DesignSpec, cabinetId: string): DesignSpec {
  const stack = heightStackOf(spec, cabinetId);
  if (!stack?.upper) return spec;
  const total = stack.lower.size.height + stack.upper.size.height;
  if (!planHeights(spec, stack.lower.id, total, "single").singleFits) return spec;
  return applyHeightModules(spec, stack.lower.id, [total], { auto: false });
}

/** Divided at the recommended height, or `lowerHeight`. */
export function divideHeight(spec: DesignSpec, cabinetId: string, lowerHeight?: number): DesignSpec {
  const stack = heightStackOf(spec, cabinetId);
  if (!stack || stack.upper) return spec;
  const total = stack.lower.size.height;
  const plan = planHeights(spec, stack.lower.id, total, "partitioned", lowerHeight ?? Math.min(PREFERRED_LOWER, total - MIN_HEIGHT_MODULE));
  if (plan.modules[1]! < MIN_HEIGHT_MODULE) return spec;
  return applyHeightModules(spec, stack.lower.id, plan.modules, { auto: false });
}

export function lockHeightPartition(spec: DesignSpec, cabinetId: string, locked: boolean): DesignSpec {
  return change(spec, (draft) => {
    const lower = lowerOf(draft, cabinetId);
    if (!lower) return;
    for (const member of heightGroup(draft, lower)) {
      member.heightModules = { auto: locked ? false : member.heightModules?.auto ?? false, align: member.heightModules?.align ?? true, ...(locked ? { locked: true } : {}) };
    }
  });
}

/** Whether this cabinet's height division runs across its neighbours. */
export function setHeightAlign(spec: DesignSpec, cabinetId: string, align: boolean): DesignSpec {
  return change(spec, (draft) => {
    const lower = lowerOf(draft, cabinetId);
    if (lower) lower.heightModules = { auto: lower.heightModules?.auto ?? false, ...lower.heightModules, align };
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

    const previousRow = rowOf(target);

    if (target.runId) {
      const offset = moveOffsetOnRun(draft, target, to);
      if (offset !== undefined) setAlong(target, offset);
    } else {
      if (to.x !== undefined) target.position.x = Math.max(0, Math.round(to.x));
      if (to.z !== undefined) target.position.z = Math.round(to.z);
    }
    if (to.y !== undefined) target.position.y = Math.max(0, Math.round(to.y));

    if (options.reflow !== false) {
      reflowRow(draft, rowOf(target));
      // Leaving the row it came from also closes that row up.
      if (
        previousRow.runId !== target.runId ||
        Math.abs(previousRow.y - target.position.y) >= 1
      ) {
        reflowRow(draft, previousRow);
      }
    }
  });
}

/**
 * Turn a requested world point back into the distance along a run.
 *
 * Drag handles historically supplied only x, which is enough on a straight
 * wall. Passing x and z is exact for a turned/custom run: the dot product
 * projects the point onto the wall direction and deliberately ignores any
 * perpendicular pointer wobble. If the run was removed, there is no honest
 * coordinate system to project through, so the offset is retained rather than
 * falling back to stale raw coordinates.
 */
function moveOffsetOnRun(
  spec: DesignSpec,
  cabinet: Cabinet,
  to: Partial<{ x: number; y: number; z: number }>,
): number | undefined {
  if (!cabinet.runId || (to.x === undefined && to.z === undefined)) {
    return undefined;
  }

  const layout = solveLayout(spec.layout, spec.runs, {
    cornerKind: spec.cornerKind,
    cornerKinds: spec.cornerKinds,
    cornerSettings: spec.cornerSettings,
    kitchenFacing: !!spec.kitchenSetup,
  });
  const placement = layout.placements.find(
    (entry) => entry.runId === cabinet.runId,
  );
  if (!placement) return undefined;

  const current = placeOnRun(placement, along(cabinet));
  const x = to.x ?? current.x;
  const z = to.z ?? current.z;
  const radians = (placement.rotation * Math.PI) / 180;
  const alongRun =
    (x - placement.origin.x) * Math.cos(radians) +
    (z - placement.origin.z) * Math.sin(radians);

  return Math.max(0, Math.round(alongRun));
}

/**
 * Separates a row, in whatever order the cabinets now stand.
 *
 * The row keeps its own left edge — a kitchen whose base run starts at 600
 * because two tall units stand to the left of it does not slide to the wall
 * because somebody dragged a cupboard.
 *
 * ## It used to pack them end to end, and that was the bug
 *
 * `cursor += cabinet.size.width` with nothing between: every cabinet was
 * dragged up against its neighbour on every move, so a gap between two
 * cabinets could not be made and could not survive being made. Dragging one
 * aside to leave 200 mm of air put it straight back.
 *
 * Which was at odds with the rest of the file and with the geometry. Two
 * doors down, `shiftAfter` says "a gap somebody left on purpose at the other
 * end of the kitchen stays where they left it". And `straightWorktopParts`
 * treats a gap as meaningful in as many words — "a gap of more than a
 * millimetre means something stands between them: a tall unit, a fridge
 * space, a doorway — and the top does not bridge it", and it cuts two
 * worktops rather than one. Every part of the design understood gaps except
 * the one function that could create them.
 *
 * ## What it does instead
 *
 * Each cabinet keeps where it was put, unless that would put it inside the
 * one before it — in which case it is pushed just clear. So:
 *
 * - Dragging a cabinet aside leaves the space, and it stays.
 * - Dragging one *past* another still swaps them, because `row` hands them
 *   back sorted by position and the one now on the left is walked first.
 * - A kitchen built flush stays flush: every cabinet already clears the
 *   previous one, so nothing moves.
 *
 * Overlaps are still impossible, which is the part that had to be kept: two
 * cabinets occupying the same 400 mm is not a design, it is a drawing.
 */
function reflowRow(spec: DesignSpec, target: CabinetRow): void {
  const cabinets = row(spec, target);
  if (cabinets.length === 0) return;

  // Starting at zero rather than at the row's left edge, and it comes to the
  // same thing: `row` sorts by position, `setAlong` never writes a negative
  // one, so the leftmost cabinet's own position always wins the `Math.max`
  // below and the row keeps its left edge by itself. Seeding the cursor with
  // `Math.min(...)` of the same numbers was left over from the packing version,
  // where the cursor was assigned rather than compared and the seed did the
  // work.
  let cursor = 0;
  for (const cabinet of cabinets) {
    const at = Math.max(cursor, along(cabinet));
    setAlong(cabinet, at);
    cursor = at + cabinet.size.width;
  }
}

/** Equal bays filling the interior exactly. */
function redivide(cabinet: Cabinet, thickness: number): void {
  const interior = carcassInterior(cabinet, thickness);
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

/**
 * The clear width a cabinet's sections divide between them, in mm.
 *
 * Carcass sides at each end, and one divider between each neighbouring pair.
 * Exactly what `redivide` shares out, named so a control can show somebody how
 * much is left rather than making them work it out from the outside width.
 */
export function interiorWidthOf(cabinet: Cabinet, boardThickness: number): number {
  // Two side panels per transport module, where a cabinet is made in modules.
  return carcassInterior(cabinet, boardThickness);
}

/**
 * Sets one section's width. The rest give way proportionally.
 *
 * ## Why this did not exist
 *
 * Every section was the same width, because `redivide` is the only thing that
 * ever set one and it divides the interior equally. The width was printed in
 * the panel as a label — "Section 1  443 mm" — and the drawer panel's own
 * comment pointed at it as "the honest control for that, which is already
 * above this". It was not above this. It was not anywhere.
 *
 * Real furniture is not in equal sections: a wardrobe is a 900 mm hanging bay
 * beside a 450 mm bank of drawers, and a kitchen run is whatever the sink
 * needs beside whatever is left.
 *
 * ## What "the rest give way" means
 *
 * The interior is fixed by the carcass, so widening one section has to take
 * the width from the others — the same bargain `setDrawerHeight` makes with
 * drawer fronts, and for the same reason: the parts have to add up to the
 * opening, and making the person do that arithmetic is making them do the
 * computer's job.
 *
 * Taken proportionally, so a wide neighbour gives more than a narrow one and
 * the shape of what somebody has already set up survives having one section
 * changed. Every other section keeps at least `minBayWidth`, and the request
 * is clamped to whatever that leaves rather than refused: typing 5000 into a
 * 1400 mm cabinet gives the widest section the cabinet can hold, which is what
 * the person meant by typing a number bigger than the cabinet.
 */
export function setBayWidth(
  spec: DesignSpec,
  cabinetId: string,
  bayId: string,
  width: number,
): DesignSpec {
  return change(spec, (draft) => {
    const cabinet = find(draft, cabinetId);
    if (!cabinet) return;
    const index = cabinet.bays.findIndex((entry) => entry.id === bayId);
    if (index < 0) return;

    // In a cabinet made in transport modules the width is shared inside the
    // bay's own module: the joints stay where they are.
    const owners = bayModules(cabinet, draft.carcass.board.thickness);
    const modular = modulesOf(cabinet).length > 1;
    const others = cabinet.bays.filter((_, i) => i !== index && (!modular || owners[i] === owners[index]));
    if (others.length === 0) return;

    const interior = modular
      ? moduleInterior(modulesOf(cabinet)[owners[index]!]!, others.length + 1, draft.carcass.board.thickness)
      : interiorWidthOf(cabinet, draft.carcass.board.thickness);
    const floor = LIMITS.minBayWidth;

    // What this section may become: no narrower than the floor, and no wider
    // than the interior less a floor's worth for each of its neighbours.
    const ceiling = Math.max(floor, interior - others.length * floor);
    const target = Math.min(ceiling, Math.max(floor, Math.round(width)));

    const remaining = interior - target;

    // Shared out proportionally, but the floor has to be paid for.
    //
    // The first version simply raised any share that came out below the floor,
    // and took the difference from nowhere — so the widths summed to more than
    // the interior, and `validateSpec` rescaled all of them proportionally to
    // fit. That included the one that had just been typed: asking for 300
    // produced 291, which reads as the box not working.
    //
    // So a section pinned at the floor is removed from the pool along with its
    // width, and what is left is re-shared among the rest. Repeated until
    // nobody is under, which terminates because `target` is already clamped to
    // leave a floor's worth for every neighbour.
    const pinned = new Set<string>();
    let pool = remaining;
    let free = others;

    for (;;) {
      const shared = free.reduce((sum, bay) => sum + bay.width, 0);
      const under = free.filter((bay) => {
        const share =
          shared > 0 ? (bay.width / shared) * pool : pool / free.length;
        return share < floor;
      });
      if (under.length === 0 || free.length === 0) break;

      for (const bay of under) {
        pinned.add(bay.id);
        pool -= floor;
      }
      free = free.filter((bay) => !pinned.has(bay.id));
      if (free.length === 0) break;
    }

    const shared = free.reduce((sum, bay) => sum + bay.width, 0);
    let handed = 0;
    free.forEach((bay, i) => {
      // The last free one takes the rounding, so the sections add up to the
      // interior exactly rather than to within a millimetre of it — which is
      // the difference between a silent normalisation and none at all.
      const next =
        i === free.length - 1
          ? Math.max(floor, pool - handed)
          : Math.max(
              floor,
              Math.round(shared > 0 ? (bay.width / shared) * pool : pool / free.length),
            );
      handed += next;
      bay.width = next;
    });
    for (const bay of others) {
      if (pinned.has(bay.id)) bay.width = floor;
    }

    cabinet.bays[index].width = target;

    // A leaf that has just grown past the practical limit becomes a pair here,
    // the same way `redivide` does it, rather than being corrected a moment
    // later by validation.
    for (const bay of cabinet.bays) {
      if (bay.door === "hinged" && bay.fitting.kind !== "drawers") {
        bay.doorLeaves = bay.width > LIMITS.hingedLeafWidth ? 2 : 1;
      }
    }
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
    // Doors sized by hand belong to the fronts this fitting had.
    delete bay.doorOverrides;

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
    delete bay.doorOverrides;
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
      bay.fitting.count = clamp(bay.fitting.count + delta, 1, 12);
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

/** Within limits, to a tenth of a millimetre: 782.5 mm is a size people measure. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, Math.round(value * 10) / 10));
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
  return drawerFrontHeights(
    fitting.count,
    opening,
    fitting.frontHeights,
  );
}

/**
 * Heights scaled to fill the opening exactly.
 *
 * Proportional rather than clamped: somebody who made the top drawer twice as
 * tall meant the *others* to give way, and clamping would keep their number and
 * silently shrink the bay's last drawer to nothing.
 */
function normaliseFronts(heights: number[], opening: number): number[] {
  return drawerFrontHeights(heights.length, opening, heights);
}

/** The clear opening a bay's drawers divide, in mm. */
export function openingHeightOf(cabinet: Cabinet, boardThickness: number): number {
  return cabinet.size.height - cabinet.plinthHeight - 2 * boardThickness;
}

/**
 * The only drawer-count range exposed to editing controls.
 *
 * The schema still has an absolute cap of twelve, while this adds the physical
 * limit from the cabinet's actual clear opening. A short drawer module should
 * stop offering “add” at five fronts, not let the user create a sixth sliver
 * and wait for validation to undo it.
 */
export function drawerCountRangeOf(
  cabinet: Cabinet,
  boardThickness: number,
): { minimum: number; maximum: number } {
  const range = practicalDrawerCount(openingHeightOf(cabinet, boardThickness));
  return {
    minimum: Math.min(12, range.minimum),
    maximum: Math.min(12, range.maximum),
  };
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
    heights[index] = Math.min(
      LIMITS.maxDrawerFront,
      Math.max(LIMITS.minDrawerFront, Math.round(height)),
    );
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
    const opening = openingHeightOf(cabinet, draft.carcass.board.thickness);
    if (
      bay.fitting.count >=
      drawerCountRangeOf(cabinet, draft.carcass.board.thickness).maximum
    ) {
      return;
    }
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
    const opening = openingHeightOf(cabinet, draft.carcass.board.thickness);
    // One is not always the physical floor: a 514 mm opening needs at least
    // two fronts because one 514 mm slab is neither realistic nor cuttable.
    if (
      bay.fitting.count <=
      drawerCountRangeOf(cabinet, draft.carcass.board.thickness).minimum
    ) {
      return;
    }
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
    const opening = openingHeightOf(cabinet, draft.carcass.board.thickness);
    if (
      bay.fitting.count >=
      drawerCountRangeOf(cabinet, draft.carcass.board.thickness).maximum
    ) {
      return;
    }
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

// ---------------------------------------------------------------------------
// Doors sized by hand
// ---------------------------------------------------------------------------

/** Which door: its cabinet, its bay, the run of the bay it closes, the leaf. */
export type DoorRef = { cabinetId: string; bayId: string; run: number; leaf: number };

/** A cabinet's doors and drawer fronts as they will be cut. */
export function doorFrontsOf(spec: DesignSpec, cabinetId: string) {
  const cabinet = find(spec, cabinetId);
  return cabinet ? cabinetFronts(spec, cabinet) : null;
}

export function doorLeafOf(spec: DesignSpec, ref: DoorRef): DoorLeaf | null {
  return doorFrontsOf(spec, ref.cabinetId)?.leaves.find((leaf) => leaf.bayId === ref.bayId && leaf.run === ref.run && leaf.leaf === ref.leaf) ?? null;
}

const sameLeaf = (leaf: DoorLeaf, ref: Pick<DoorRef, "bayId" | "run" | "leaf">) => leaf.bayId === ref.bayId && leaf.run === ref.run && leaf.leaf === ref.leaf;

/**
 * Doors given new sizes at once, all or nothing: each must fit inside its
 * cabinet and clear of every other door and drawer front, as they will all
 * stand afterwards. Returns why not instead of a model with a door through
 * another one.
 */
function setDoorRects(spec: DesignSpec, cabinetId: string, changes: { ref: Pick<DoorRef, "bayId" | "run" | "leaf">; rect: FrontRect }[]): { spec: DesignSpec; problem: string | null } {
  const cabinet = find(spec, cabinetId);
  const fronts = cabinet ? cabinetFronts(spec, cabinet) : null;
  if (!cabinet || !fronts) return { spec, problem: "That door is not on the design" };
  const after = fronts.leaves.map((leaf) => changes.find((entry) => sameLeaf(leaf, entry.ref))?.rect ?? leaf);
  for (const entry of changes) {
    const index = fronts.leaves.findIndex((leaf) => sameLeaf(leaf, entry.ref));
    if (index < 0) return { spec, problem: "That door is not on the design" };
    const problem = doorRectProblem(entry.rect, cabinet.size, [...fronts.drawers, ...after.filter((_, other) => other !== index)]);
    if (problem) return { spec, problem };
  }
  const next = change(spec, (draft) => {
    const target = find(draft, cabinetId);
    for (const entry of changes) {
      const bay = target?.bays.find((item) => item.id === entry.ref.bayId);
      if (!bay) continue;
      const round = (value: number) => Math.round(value * 10) / 10;
      const rect = { x: round(entry.rect.x), y: round(entry.rect.y), width: round(entry.rect.width), height: round(entry.rect.height) };
      bay.doorOverrides = [...(bay.doorOverrides ?? []).filter((item) => !(item.run === entry.ref.run && item.leaf === entry.ref.leaf)), { run: entry.ref.run, leaf: entry.ref.leaf, ...rect }];
    }
  });
  return { spec: next, problem: null };
}

/**
 * One door to a size and place — typed, or dragged edge by edge. A width
 * that is typed keeps the door's outer edge where it is (its left edge, or
 * for the right leaf of a pair its right edge), a height keeps its bottom
 * edge. When the change runs into the other leaf of its pair, that leaf's
 * meeting edge gives way, a door gap clear — the pair shares its opening,
 * each leaf its own size — as long as it stays a door.
 */
export function setDoorSize(spec: DesignSpec, ref: DoorRef, size: Partial<FrontRect>): { spec: DesignSpec; problem: string | null } {
  const fronts = doorFrontsOf(spec, ref.cabinetId);
  const leaf = fronts?.leaves.find((item) => sameLeaf(item, ref));
  if (!fronts || !leaf) return { spec, problem: "That door is not on the design" };
  const partners = fronts.leaves.filter((item) => item.bayId === leaf.bayId && item.run === leaf.run && item !== leaf);
  const partnerLeft = partners.find((item) => item.x < leaf.x);
  const width = size.width ?? leaf.width;
  const x = size.x ?? (size.width !== undefined && partnerLeft ? leaf.x + leaf.width - width : leaf.x);
  const rect = { x, y: size.y ?? leaf.y, width, height: size.height ?? leaf.height };
  const gap = spec.carcass.doorGap;
  const changes: { ref: Pick<DoorRef, "bayId" | "run" | "leaf">; rect: FrontRect }[] = [{ ref, rect }];
  for (const partner of partners) {
    const sharesHeight = Math.min(partner.y + partner.height, rect.y + rect.height) > Math.max(partner.y, rect.y);
    if (!sharesHeight) continue;
    if (partner.x > leaf.x && rect.x + rect.width + gap > partner.x) {
      const right = partner.x + partner.width;
      const start = rect.x + rect.width + gap;
      if (right - start >= MIN_DOOR) changes.push({ ref: partner, rect: { ...partner, x: start, width: right - start } });
    } else if (partner.x < leaf.x && partner.x + partner.width + gap > rect.x) {
      const width = rect.x - gap - partner.x;
      if (width >= MIN_DOOR) changes.push({ ref: partner, rect: { ...partner, width } });
    }
  }
  return setDoorRects(spec, ref.cabinetId, changes.map(({ ref: target, rect: next }) => ({ ref: target, rect: { x: next.x, y: next.y, width: next.width, height: next.height } })));
}

/** Where a dragged edge of this door can snap to, in its cabinet's frame. */
export function doorSnapTargetsOf(spec: DesignSpec, ref: DoorRef): { x: number[]; y: number[] } {
  const cabinet = find(spec, ref.cabinetId);
  const fronts = cabinet ? cabinetFronts(spec, cabinet) : null;
  const leaf = fronts?.leaves.find((item) => sameLeaf(item, ref));
  if (!cabinet || !fronts || !leaf) return { x: [], y: [] };
  const row = doorRowOf(spec, ref);
  return doorSnapTargets({
    cabinet: cabinet.size,
    gap: spec.carcass.doorGap,
    boards: cabinetFaceBoards(spec, cabinet),
    others: [...fronts.drawers, ...fronts.leaves.filter((item) => item !== leaf)],
    row: row.length > 1 ? { left: row[0]!.x, right: row.at(-1)!.x + row.at(-1)!.width, count: row.length } : null,
  });
}

/** Manual sizing switched on: the door keeps the size it has, now as its own. */
export function setDoorManual(spec: DesignSpec, ref: DoorRef): DesignSpec {
  const leaf = doorLeafOf(spec, ref);
  if (!leaf || leaf.manual) return spec;
  return setDoorRects(spec, ref.cabinetId, [{ ref, rect: leaf }]).spec;
}

/**
 * Back to the automatic size: one door, or with `wholeRun` every leaf of its
 * run. A door beside it that was sized into the space this one takes back
 * cannot keep its size either, so it goes back too — Reset never leaves a size
 * behind that the cut list would refuse.
 */
export function resetDoorSize(spec: DesignSpec, ref: DoorRef, wholeRun = false): DesignSpec {
  return change(spec, (draft) => {
    const cabinet = find(draft, ref.cabinetId);
    const bay = cabinet?.bays.find((item) => item.id === ref.bayId);
    if (!cabinet || !bay?.doorOverrides) return;
    bay.doorOverrides = bay.doorOverrides.filter((item) => !(item.run === ref.run && (wholeRun || item.leaf === ref.leaf)));
    const fronts = cabinetFronts(draft, cabinet);
    for (const other of cabinet.bays) {
      if (!other.doorOverrides) continue;
      other.doorOverrides = other.doorOverrides.filter((item) => fronts.leaves.some((leaf) => leaf.bayId === other.id && leaf.run === item.run && leaf.leaf === item.leaf && leaf.manual));
      if (!other.doorOverrides.length) delete other.doorOverrides;
    }
  });
}

/**
 * The doors that share this one's row: its pair, or — for a single leaf —
 * the doors beside it across the cabinet at the same height. Left to right.
 */
export function doorRowOf(spec: DesignSpec, ref: DoorRef): DoorLeaf[] {
  const fronts = doorFrontsOf(spec, ref.cabinetId);
  const leaf = fronts?.leaves.find((item) => sameLeaf(item, ref));
  if (!fronts || !leaf) return [];
  const pair = fronts.leaves.filter((item) => item.bayId === leaf.bayId && item.run === leaf.run);
  if (pair.length > 1) return pair.sort((a, b) => a.x - b.x);
  const overlapsInHeight = (item: DoorLeaf) => Math.min(item.y + item.height, leaf.y + leaf.height) - Math.max(item.y, leaf.y) > Math.min(item.height, leaf.height) * 0.5;
  return fronts.leaves.filter(overlapsInHeight).sort((a, b) => a.x - b.x);
}

/**
 * Make Equal: the row shares its span equally, a door gap between each — the
 * outer edges stay, the meeting edges move.
 */
export function makeDoorsEqual(spec: DesignSpec, ref: DoorRef): { spec: DesignSpec; problem: string | null } {
  const row = doorRowOf(spec, ref);
  if (row.length < 2) return { spec, problem: "There is no other door beside this one to share with" };
  const left = row[0]!.x;
  const right = row.at(-1)!.x + row.at(-1)!.width;
  const shares = equalLeaves(left, right, row.length, spec.carcass.doorGap);
  return setDoorRects(spec, ref.cabinetId, row.map((leaf, index) => ({ ref: leaf, rect: { x: shares[index]!.x, y: leaf.y, width: shares[index]!.width, height: leaf.height } })));
}

// ---------------------------------------------------------------------------
// Internal drawers, open displays and zones
// ---------------------------------------------------------------------------

/**
 * An open display: a whole bay (a niche, or the one bay of a side display),
 * or — with `sectionId` — one zone of a stacked bay.
 */
export type DisplayRef = { cabinetId: string; bayId: string; sectionId?: string };

const DISPLAY_DEFAULTS = { back: true, lighting: "off" as const };

function leavesFor(bay: Bay): void {
  if (bay.door === "hinged") bay.doorLeaves = bay.width > LIMITS.hingedLeafWidth ? 2 : 1;
}

/**
 * Drawers behind the doors (`internal`) or on the face. Behind the doors the
 * bay keeps — or gets — its door, which then runs the full height in front
 * of them; on the face the fronts are the front, as drawers always were.
 */
export function setBayInternalDrawers(spec: DesignSpec, cabinetId: string, bayId: string, internal: boolean): DesignSpec {
  return change(spec, (draft) => {
    const bay = find(draft, cabinetId)?.bays.find((entry) => entry.id === bayId);
    if (!bay || bay.fitting.kind !== "drawers") return;
    delete bay.doorOverrides;
    if (internal) {
      bay.fitting.internal = true;
      if (bay.door === "none") bay.door = "hinged";
      leavesFor(bay);
    } else {
      delete bay.fitting.internal;
      delete bay.fitting.boxDepth;
      delete bay.fitting.frontBoardId;
    }
  });
}

/** Box depth and inner-front board for internal drawers, whole bay or zone. */
export function setInternalDrawerOptions(spec: DesignSpec, ref: DisplayRef, options: { boxDepth?: number | null; frontBoardId?: string | null }): DesignSpec {
  return change(spec, (draft) => {
    const bay = find(draft, ref.cabinetId)?.bays.find((entry) => entry.id === ref.bayId);
    if (!bay) return;
    const target = ref.sectionId && bay.fitting.kind === "stack" ? bay.fitting.sections.find((section) => section.id === ref.sectionId) : bay.fitting.kind === "drawers" ? bay.fitting : null;
    if (!target) return;
    if (options.boxDepth !== undefined) {
      if (options.boxDepth === null) delete target.boxDepth;
      else target.boxDepth = clamp(Math.round(options.boxDepth), 250, 700);
    }
    if (options.frontBoardId !== undefined) {
      if (options.frontBoardId === null) delete target.frontBoardId;
      else target.frontBoardId = options.frontBoardId;
    }
  });
}

/**
 * A whole bay as an open display — a niche between the other bays — or, with
 * null, back to a closed bay with its doors. Becoming a display, the bay is
 * shelves (four, unless it already had shelves) and has no door; closing it
 * hangs hinged doors on it again, a pair if it is wide.
 */
export function setBayDisplay(spec: DesignSpec, cabinetId: string, bayId: string, display: Partial<Omit<NonNullable<Bay["display"]>, "style">> | null): DesignSpec {
  return change(spec, (draft) => {
    const bay = find(draft, cabinetId)?.bays.find((entry) => entry.id === bayId);
    if (!bay) return;
    delete bay.doorOverrides;
    if (display === null) {
      if (!bay.display) return;
      delete bay.display;
      bay.door = "hinged";
      leavesFor(bay);
      return;
    }
    bay.display = { ...DISPLAY_DEFAULTS, ...bay.display, ...display, style: bay.display?.style ?? "niche" };
    if (bay.fitting.kind !== "shelves") bay.fitting = { kind: "shelves", count: 4, adjustable: true };
    bay.door = "none";
  });
}

/** A display's options: back, accent board, depth, light, shelf count. */
export function updateDisplay(spec: DesignSpec, ref: DisplayRef, patch: { back?: boolean; boardId?: string | null; depth?: number | null; lighting?: NonNullable<Bay["display"]>["lighting"]; shelves?: number }): DesignSpec {
  return change(spec, (draft) => {
    const cabinet = find(draft, ref.cabinetId);
    const bay = cabinet?.bays.find((entry) => entry.id === ref.bayId);
    if (!cabinet || !bay) return;
    const section = ref.sectionId && bay.fitting.kind === "stack" ? bay.fitting.sections.find((entry) => entry.id === ref.sectionId) : null;
    if (ref.sectionId && (!section || section.kind !== "display")) return;
    if (!section && !bay.display) return;
    const display = section ? (section.display ??= { ...DISPLAY_DEFAULTS }) : bay.display!;
    if (patch.back !== undefined) display.back = patch.back;
    if (patch.lighting !== undefined) display.lighting = patch.lighting;
    if (patch.boardId !== undefined) {
      if (patch.boardId === null) delete display.boardId;
      else display.boardId = patch.boardId;
    }
    if (patch.depth !== undefined) {
      if (patch.depth === null) delete display.depth;
      else display.depth = clamp(Math.round(patch.depth), 150, cabinet.size.depth);
    }
    if (patch.shelves !== undefined) {
      const count = clamp(Math.round(patch.shelves), 0, 20);
      if (section) section.count = count;
      else if (bay.fitting.kind === "shelves") bay.fitting.count = count;
    }
  });
}

/**
 * The narrowest bay worth building: a wardrobe's validator repairs anything
 * under 300 mm, so a wardrobe's operations stop there.
 */
function bayFloor(spec: DesignSpec): number {
  return spec.furnitureType === "wardrobe" ? 300 : LIMITS.minBayWidth;
}

/** The bays share `total` in proportion to the widths they have, each at least the floor. */
function shareWidths(bays: Bay[], total: number, floor: number = LIMITS.minBayWidth): void {
  const sum = bays.reduce((acc, bay) => acc + bay.width, 0);
  let handed = 0;
  bays.forEach((bay, index) => {
    const next = index === bays.length - 1 ? total - handed : Math.max(floor, Math.round(sum > 0 ? (bay.width / sum) * total : total / bays.length));
    bay.width = Math.max(floor, next);
    handed += bay.width;
    leavesFor(bay);
  });
}

/**
 * A narrow open niche between the wardrobe's bays: a new bay of its own,
 * `width` wide, at `index` (the middle when not given). The other bays give
 * up the width in proportion, so the wardrobe stays the size it was.
 */
export function addNiche(spec: DesignSpec, cabinetId: string, options: { width?: number; index?: number; shelves?: number; boardId?: string; lighting?: NonNullable<Bay["display"]>["lighting"] } = {}): DesignSpec {
  return change(spec, (draft) => {
    const cabinet = find(draft, cabinetId);
    if (!cabinet || cabinet.bays.length >= 24) return;
    const t = draft.carcass.board.thickness;
    // The interior once the niche's divider is added.
    const interior = carcassInterior(cabinet, t) - t;
    const floor = bayFloor(draft);
    const width = clamp(Math.round(options.width ?? 450), floor, Math.max(floor, interior - cabinet.bays.length * floor));
    const others = cabinet.bays;
    shareWidths(others, interior - width, floor);
    const index = clamp(options.index ?? Math.ceil(others.length / 2), 0, others.length);
    const niche: Bay = {
      id: freshId("niche"),
      width,
      fitting: { kind: "shelves", count: options.shelves ?? 4, adjustable: true },
      door: "none",
      doorLeaves: 1,
      display: { ...DISPLAY_DEFAULTS, style: "niche", ...(options.boardId ? { boardId: options.boardId } : {}), ...(options.lighting ? { lighting: options.lighting } : {}) },
    };
    cabinet.bays.splice(index, 0, niche);
    for (const bay of cabinet.bays) delete bay.doorOverrides;
  });
}

/** A bay to another place in its cabinet — Left, Center, Right, or one step. */
export function moveBay(spec: DesignSpec, cabinetId: string, bayId: string, to: "left" | "center" | "right" | -1 | 1): DesignSpec {
  return change(spec, (draft) => {
    const cabinet = find(draft, cabinetId);
    const from = cabinet?.bays.findIndex((bay) => bay.id === bayId) ?? -1;
    if (!cabinet || from < 0) return;
    const [bay] = cabinet.bays.splice(from, 1);
    const last = cabinet.bays.length;
    const index = to === "left" ? 0 : to === "right" ? last : to === "center" ? Math.ceil(last / 2) : clamp(from + to, 0, last);
    cabinet.bays.splice(index, 0, bay!);
    for (const entry of cabinet.bays) delete entry.doorOverrides;
  });
}

/** A copy of a niche beside it; the other bays give up its width. */
export function duplicateBay(spec: DesignSpec, cabinetId: string, bayId: string): DesignSpec {
  const cabinet = find(spec, cabinetId);
  const index = cabinet?.bays.findIndex((bay) => bay.id === bayId) ?? -1;
  const bay = index >= 0 ? cabinet!.bays[index]! : null;
  if (!bay?.display) return spec;
  return addNiche(spec, cabinetId, { width: bay.width, index: index + 1, shelves: bay.fitting.kind === "shelves" ? bay.fitting.count : 4, boardId: bay.display.boardId, lighting: bay.display.lighting });
}

/** A niche taken out: its width goes back to the bays either side of it. */
export function removeNiche(spec: DesignSpec, cabinetId: string, bayId: string): DesignSpec {
  return change(spec, (draft) => {
    const cabinet = find(draft, cabinetId);
    if (!cabinet || cabinet.bays.length <= 1) return;
    const t = draft.carcass.board.thickness;
    cabinet.bays = cabinet.bays.filter((bay) => bay.id !== bayId);
    shareWidths(cabinet.bays, carcassInterior(cabinet, t), bayFloor(draft));
    for (const bay of cabinet.bays) delete bay.doorOverrides;
  });
}

/** The wardrobe a side display stands beside, and which end. */
export function sideDisplayOf(spec: DesignSpec, cabinetId: string): { wardrobe: Cabinet | null; side: "left" | "right" } | null {
  const cabinet = find(spec, cabinetId);
  const display = cabinet?.bays[0]?.display;
  if (!cabinet || display?.style !== "side") return null;
  return { wardrobe: display.attachedTo ? find(spec, display.attachedTo) ?? null : null, side: display.side ?? "right" };
}

/**
 * Open shelves beside a wardrobe: a shelving unit of its own on the same
 * run, standing against the wardrobe's left or right end, as tall as it and
 * on the same plinth. On the left, the wardrobe and everything after it move
 * along to make room. Its width and depth can be changed afterwards like any
 * cabinet's.
 */
export function addSideDisplay(spec: DesignSpec, wardrobeId: string, options: { side: "left" | "right"; width?: number; depth?: number; shelves?: number; boardId?: string; lighting?: NonNullable<Bay["display"]>["lighting"] }): DesignSpec {
  return change(spec, (draft) => {
    const wardrobe = find(draft, wardrobeId);
    if (!wardrobe) return;
    const lower = wardrobe.stackedOn ? find(draft, wardrobe.stackedOn) ?? wardrobe : wardrobe;
    const top = draft.cabinets.find((cabinet) => cabinet.stackedOn === lower.id);
    const t = draft.carcass.board.thickness;
    const width = clamp(Math.round(options.width ?? 450), LIMITS.minWidth, 1200);
    const depth = clamp(Math.round(options.depth ?? lower.size.depth), 200, lower.size.depth);
    // Beside a wardrobe divided in height, the shelves are divided the same
    // way — a lower module and an upper — so the front is one grid. Kept
    // whole only where the wardrobe's own division is not shared.
    const divided = draft.furnitureType === "wardrobe" && top && lower.heightModules?.align !== false;
    const height = divided ? lower.size.height : lower.size.height + (top?.size.height ?? 0);
    const targetRow = rowOf(lower);
    const x = options.side === "left" ? along(lower) : along(lower) + lower.size.width;
    shiftAfter(draft, targetRow, x, width);
    const added: Cabinet = {
      id: freshId("display"),
      label: options.side === "left" ? "Side display, left" : "Side display, right",
      kind: "open",
      position: { x, y: lower.position.y, z: lower.position.z },
      size: { width, height, depth },
      bays: [{
        id: freshId("bay"),
        width: width - 2 * t,
        fitting: { kind: "shelves", count: options.shelves ?? 5, adjustable: true },
        door: "none",
        doorLeaves: 1,
        display: { ...DISPLAY_DEFAULTS, style: "side", side: options.side, attachedTo: lower.id, ...(options.boardId ? { boardId: options.boardId } : {}), ...(options.lighting ? { lighting: options.lighting } : {}) },
      }],
      plinthHeight: lower.plinthHeight,
    };
    bindToRow(added, targetRow, x);
    draft.cabinets.push(added);
    if (divided) {
      added.heightModules = { auto: lower.heightModules?.auto ?? false, align: true, ...(lower.heightModules?.locked ? { locked: true } : {}) };
      pushUpper(draft, added, top!.size.height);
    }
  });
}

/** A side display moved to the wardrobe's other end. */
export function setSideDisplaySide(spec: DesignSpec, cabinetId: string, side: "left" | "right"): DesignSpec {
  const info = sideDisplayOf(spec, cabinetId);
  const cabinet = find(spec, cabinetId);
  if (!info?.wardrobe || !cabinet || info.side === side) return spec;
  const bay = cabinet.bays[0]!;
  const removed = removeCabinet(spec, cabinetId);
  return addSideDisplay(removed, info.wardrobe.id, { side, width: cabinet.size.width, depth: cabinet.size.depth, shelves: bay.fitting.kind === "shelves" ? bay.fitting.count : 5, boardId: bay.display?.boardId, lighting: bay.display?.lighting });
}

// ---- Zones of a stacked bay -------------------------------------------------

export type ZoneKind = "door" | "display" | "internal_drawers" | "drawers" | "shelves" | "hanging" | "shoes";
type Section = Extract<Bay["fitting"], { kind: "stack" }>["sections"][number];

/** What a zone is, as the panel names it. */
export function zoneKindOf(section: Section): ZoneKind {
  if (section.kind === "open") return "door";
  if (section.kind === "drawers") return section.internal ? "internal_drawers" : "drawers";
  return section.kind;
}

function sectionFor(kind: ZoneKind, id: string, share: number): Section {
  switch (kind) {
    case "door": return { id, kind: "open", share };
    case "display": return { id, kind: "display", share, count: 1, display: { ...DISPLAY_DEFAULTS } };
    case "internal_drawers": return { id, kind: "drawers", share, drawers: 2, internal: true };
    case "drawers": return { id, kind: "drawers", share, drawers: 2 };
    case "shelves": return { id, kind: "shelves", share, count: 2 };
    case "hanging": return { id, kind: "hanging", share, rails: 1 };
    case "shoes": return { id, kind: "shoes", share, count: 3 };
  }
}

/**
 * Zones given heights in mm. `sectionBands` gives a drawer zone a 90 mm floor
 * before sharing out the rest, so a zone's share is its height less that
 * floor — which is what makes a typed height come out exactly.
 */
function withHeights(zones: Section[], heights: Map<string, number>): Section[] {
  return zones.map((zone) => {
    const height = heights.get(zone.id);
    return height === undefined ? zone : { ...zone, share: Math.max(1, Math.round(height - (zone.kind === "drawers" ? 90 : 0))) };
  });
}

/** The bay's zones, top to bottom: its stack, or the bay as one zone. */
function zonesOf(bay: Bay): Section[] {
  if (bay.fitting.kind === "stack") return bay.fitting.sections;
  const fitting = bay.fitting;
  switch (fitting.kind) {
    case "hanging": return [{ id: "zone-1", kind: "hanging", share: 1, rails: fitting.rails }];
    case "drawers": return [{ id: "zone-1", kind: "drawers", share: 1, drawers: fitting.count, ...(fitting.internal ? { internal: true } : {}) }];
    case "shelves": return [bay.display ? { id: "zone-1", kind: "display", share: 1, count: fitting.count, display: { back: bay.display.back, lighting: bay.display.lighting, ...(bay.display.boardId ? { boardId: bay.display.boardId } : {}) } } : { id: "zone-1", kind: "shelves", share: 1, count: fitting.count }];
    default: return [{ id: "zone-1", kind: "open", share: 1 }];
  }
}

/** Writes zones back: two or more make a stack; one is the bay's own fitting. */
function writeZones(bay: Bay, sections: Section[]): void {
  delete bay.doorOverrides;
  if (sections.length >= 2) {
    bay.fitting = { kind: "stack", sections: sections.slice(0, 6) };
    delete bay.display;
    if (bay.door === "none") bay.door = "hinged";
    leavesFor(bay);
    return;
  }
  const only = sections[0]!;
  delete bay.display;
  if (bay.door === "none") bay.door = "hinged";
  switch (only.kind) {
    case "hanging": bay.fitting = { kind: "hanging", rails: only.rails ?? 1, shelfAbove: true }; break;
    case "drawers": bay.fitting = { kind: "drawers", count: only.drawers ?? 3, ...(only.internal ? { internal: true } : {}) }; break;
    case "shelves": case "shoes": bay.fitting = { kind: "shelves", count: only.count ?? 3, adjustable: only.kind === "shelves" }; break;
    case "display": bay.fitting = { kind: "shelves", count: only.count ?? 4, adjustable: true }; bay.display = { ...DISPLAY_DEFAULTS, ...only.display, style: "niche" }; bay.door = "none"; break;
    default: bay.fitting = { kind: "open" };
  }
  leavesFor(bay);
}

function editZones(spec: DesignSpec, cabinetId: string, bayId: string, edit: (zones: Section[], bay: Bay, cabinet: Cabinet) => Section[] | void): DesignSpec {
  return change(spec, (draft) => {
    const cabinet = find(draft, cabinetId);
    const bay = cabinet?.bays.find((entry) => entry.id === bayId);
    if (!cabinet || !bay) return;
    const zones = structuredClone(zonesOf(bay));
    const next = edit(zones, bay, cabinet) ?? zones;
    if (next.length) writeZones(bay, next);
  });
}

/**
 * A partial opening: the bay divided into closed / open display / closed —
 * a door over the top, an open zone across the middle, a door over the rest.
 * What the bay held is kept in the lower closed zone.
 */
export function addPartialOpening(spec: DesignSpec, cabinetId: string, bayId: string): DesignSpec {
  return editZones(spec, cabinetId, bayId, (zones) => {
    if (zones.length > 1) return [...zones.slice(0, 5), sectionFor("display", freshId("zone"), 2)];
    const kept = zones[0]!.kind === "display" ? sectionFor("shelves", freshId("zone"), 6) : { ...zones[0]!, id: freshId("zone"), share: 6 };
    return [sectionFor("door", freshId("zone"), 3), sectionFor("display", freshId("zone"), 3), kept];
  });
}

/**
 * A zone added at the bottom of the bay, a height that suits it — two
 * drawers, an open shelf, a shoe rack — the zones above giving way in
 * proportion. Heights are written as the shares, so they are exact.
 */
export function addZone(spec: DesignSpec, cabinetId: string, bayId: string, kind: ZoneKind = "shelves"): DesignSpec {
  const heights = zoneHeightsOf(spec, cabinetId, bayId);
  const usable = heights.reduce((sum, zone) => sum + zone.height, 0) - spec.carcass.board.thickness;
  const wanted = kind === "drawers" || kind === "internal_drawers" ? 460 : kind === "display" ? 420 : kind === "shoes" ? 520 : 600;
  const height = clamp(wanted, 100, Math.max(100, usable - heights.length * 100));
  const rest = heights.reduce((sum, zone) => sum + zone.height, 0);
  return editZones(spec, cabinetId, bayId, (zones) => {
    if (zones.length >= 6) return zones;
    const added = sectionFor(kind, freshId("zone"), 1);
    const sized = new Map(zones.map((zone) => [zone.id, ((heights.find((entry) => entry.id === zone.id)?.height ?? 1) / rest) * (usable - height)]));
    sized.set(added.id, height);
    return withHeights([...zones, added], sized);
  });
}

export function removeZone(spec: DesignSpec, cabinetId: string, bayId: string, sectionId: string): DesignSpec {
  return editZones(spec, cabinetId, bayId, (zones) => (zones.length <= 1 ? zones : zones.filter((zone) => zone.id !== sectionId)));
}

export function moveZone(spec: DesignSpec, cabinetId: string, bayId: string, sectionId: string, by: -1 | 1): DesignSpec {
  return editZones(spec, cabinetId, bayId, (zones) => {
    const from = zones.findIndex((zone) => zone.id === sectionId);
    const to = from + by;
    if (from < 0 || to < 0 || to >= zones.length) return zones;
    const [zone] = zones.splice(from, 1);
    zones.splice(to, 0, zone!);
    return zones;
  });
}

/** A zone becomes another kind, keeping its height. */
export function setZoneKind(spec: DesignSpec, cabinetId: string, bayId: string, sectionId: string, kind: ZoneKind): DesignSpec {
  return editZones(spec, cabinetId, bayId, (zones) => zones.map((zone) => (zone.id === sectionId ? sectionFor(kind, zone.id, zone.share) : zone)));
}

/** A zone's count: shelves, rails or drawers, whichever it has. */
export function setZoneCount(spec: DesignSpec, cabinetId: string, bayId: string, sectionId: string, count: number): DesignSpec {
  return editZones(spec, cabinetId, bayId, (zones) => zones.map((zone) => {
    if (zone.id !== sectionId) return zone;
    if (zone.kind === "hanging") return { ...zone, rails: clamp(count, 1, 2) };
    if (zone.kind === "drawers") return { ...zone, drawers: clamp(count, 1, 12) };
    return { ...zone, count: clamp(count, 0, 20) };
  }));
}

/** The zones' clear heights, mm, top to bottom, as they will be built. */
export function zoneHeightsOf(spec: DesignSpec, cabinetId: string, bayId: string): { id: string; floor: number; height: number }[] {
  const cabinet = find(spec, cabinetId);
  const bay = cabinet?.bays.find((entry) => entry.id === bayId);
  if (!cabinet || !bay) return [];
  const t = spec.carcass.board.thickness;
  const opening = cabinet.size.height - cabinet.plinthHeight - 2 * t;
  return sectionBandsOf(zonesOf(bay), cabinet.plinthHeight + t, opening, t).map((band) => ({ id: band.section.id, floor: band.floor, height: band.height }));
}

/**
 * One zone to a height in mm; the others give way in proportion, so the
 * zones still fill the bay. The height is kept to what leaves every other
 * zone at least 100 mm.
 */
export function setZoneHeight(spec: DesignSpec, cabinetId: string, bayId: string, sectionId: string, height: number): DesignSpec {
  const heights = zoneHeightsOf(spec, cabinetId, bayId);
  const usable = heights.reduce((sum, zone) => sum + zone.height, 0);
  const others = heights.filter((zone) => zone.id !== sectionId);
  if (!others.length || others.length === heights.length) return spec;
  const target = clamp(Math.round(height), 100, usable - others.length * 100);
  const rest = others.reduce((sum, zone) => sum + zone.height, 0);
  return editZones(spec, cabinetId, bayId, (zones) => withHeights(zones, new Map(zones.map((zone) => {
    const now = heights.find((entry) => entry.id === zone.id)?.height ?? 0;
    return [zone.id, zone.id === sectionId ? target : (now / rest) * (usable - target)];
  }))));
}

// ---- Selecting and resizing an open display --------------------------------

/** The open display a part belongs to, when it belongs to one. */
export function displayOfPart(spec: DesignSpec, part: { cabinetId?: string; bayId?: string }): DisplayRef | null {
  const cabinet = part.cabinetId ? find(spec, part.cabinetId) : undefined;
  if (!cabinet || !part.bayId) return null;
  for (const bay of cabinet.bays) {
    if (bay.display && (part.bayId === bay.id || part.bayId.startsWith(`${bay.id}-`))) return { cabinetId: cabinet.id, bayId: bay.id };
    if (bay.fitting.kind !== "stack") continue;
    const section = bay.fitting.sections.find((entry) => part.bayId === `${bay.id}-${entry.id}`);
    if (section?.kind === "display") return { cabinetId: cabinet.id, bayId: bay.id, sectionId: section.id };
  }
  return null;
}

/** Whether a reference still names an open display on the design. */
export function displayExists(spec: DesignSpec, ref: DisplayRef): boolean {
  const bay = find(spec, ref.cabinetId)?.bays.find((entry) => entry.id === ref.bayId);
  if (!bay) return false;
  if (!ref.sectionId) return Boolean(bay.display);
  return bay.fitting.kind === "stack" && bay.fitting.sections.some((section) => section.id === ref.sectionId && section.kind === "display");
}

/** The left edge of each bay's clear opening, in its cabinet's frame. */
function bayStarts(cabinet: Cabinet, t: number): number[] {
  return bayLayout(cabinet, t).map((place) => place.x);
}

/** The display's opening, in its cabinet's frame (x from the left side, y up from the floor). */
export function displayRectOf(spec: DesignSpec, ref: DisplayRef): FrontRect | null {
  const cabinet = find(spec, ref.cabinetId);
  const index = cabinet?.bays.findIndex((bay) => bay.id === ref.bayId) ?? -1;
  if (!cabinet || index < 0) return null;
  const t = spec.carcass.board.thickness;
  const bay = cabinet.bays[index]!;
  const x = bayStarts(cabinet, t)[index]!;
  if (ref.sectionId) {
    const zone = zoneHeightsOf(spec, cabinet.id, bay.id).find((entry) => entry.id === ref.sectionId);
    return zone ? { x, y: zone.floor, width: bay.width, height: zone.height } : null;
  }
  return { x, y: cabinet.plinthHeight + t, width: bay.width, height: cabinet.size.height - cabinet.plinthHeight - 2 * t };
}

/**
 * Which edges of a display can be pulled: a niche's sides (its neighbour
 * gives or takes the width), a zone's top and bottom (the zone beyond gives
 * way), a side display's edge away from its own outer end.
 */
export function displayEdgesOf(spec: DesignSpec, ref: DisplayRef): ("left" | "right" | "top" | "bottom")[] {
  const cabinet = find(spec, ref.cabinetId);
  const index = cabinet?.bays.findIndex((bay) => bay.id === ref.bayId) ?? -1;
  if (!cabinet || index < 0) return [];
  if (ref.sectionId) {
    const bay = cabinet.bays[index]!;
    const zones = bay.fitting.kind === "stack" ? bay.fitting.sections : [];
    const at = zones.findIndex((zone) => zone.id === ref.sectionId);
    return [...(at > 0 ? (["top"] as const) : []), ...(at >= 0 && at < zones.length - 1 ? (["bottom"] as const) : [])];
  }
  if (cabinet.bays[index]!.display?.style === "side") return ["right"];
  return [...(index > 0 ? (["left"] as const) : []), ...(index < cabinet.bays.length - 1 ? (["right"] as const) : [])];
}

/**
 * A display's edge pulled to where `rect` puts it. A niche's side moves the
 * boundary with the bay beside it, and only that bay changes; a zone's top
 * or bottom moves the boundary with the zone beyond; a side display's width
 * changes as a cabinet's does, the wardrobe moving along with it.
 */
export function resizeDisplayEdge(spec: DesignSpec, ref: DisplayRef, edge: "left" | "right" | "top" | "bottom", rect: FrontRect): DesignSpec {
  const cabinet = find(spec, ref.cabinetId);
  const index = cabinet?.bays.findIndex((bay) => bay.id === ref.bayId) ?? -1;
  if (!cabinet || index < 0 || !displayEdgesOf(spec, ref).includes(edge)) return spec;
  const t = spec.carcass.board.thickness;
  const bay = cabinet.bays[index]!;
  if (bay.display?.style === "side") return resizeCabinet(spec, cabinet.id, { width: Math.round(rect.width + 2 * t) });

  if (ref.sectionId) {
    const zones = zoneHeightsOf(spec, cabinet.id, bay.id);
    const at = zones.findIndex((zone) => zone.id === ref.sectionId);
    const beyond = zones[edge === "top" ? at - 1 : at + 1];
    const zone = zones[at];
    if (!zone || !beyond) return spec;
    const pair = zone.height + beyond.height;
    const height = clamp(Math.round(rect.height), 100, pair - 100);
    return editZones(spec, cabinet.id, bay.id, (sections) => withHeights(sections, new Map(sections.map((section) => {
      const now = zones.find((entry) => entry.id === section.id)?.height ?? 1;
      return [section.id, section.id === zone.id ? height : section.id === beyond.id ? pair - height : now];
    }))));
  }

  const neighbour = cabinet.bays[edge === "left" ? index - 1 : index + 1];
  if (!neighbour) return spec;
  const pair = bay.width + neighbour.width;
  const floor = bayFloor(spec);
  const width = clamp(Math.round(rect.width), floor, pair - floor);
  return change(spec, (draft) => {
    const target = find(draft, cabinet.id)!;
    const own = target.bays[index]!;
    const other = target.bays.find((entry) => entry.id === neighbour.id)!;
    own.width = width;
    other.width = pair - width;
    leavesFor(other);
    delete other.doorOverrides;
  });
}

/**
 * Where a display's dragged edge can land: the wardrobe's sides and centre
 * line, the bay boundaries and partitions, shelf levels and the top of the
 * carcass, and — for a niche — the places that would centre it.
 */
export function displaySnapTargetsOf(spec: DesignSpec, ref: DisplayRef): { x: number[]; y: number[] } {
  const cabinet = find(spec, ref.cabinetId);
  const rect = displayRectOf(spec, ref);
  if (!cabinet || !rect) return { x: [], y: [] };
  const fronts = cabinetFronts(spec, cabinet);
  const targets = doorSnapTargets({ cabinet: cabinet.size, gap: 0, boards: cabinetFaceBoards(spec, cabinet), others: [...fronts.drawers, ...fronts.leaves], row: null });
  const middle = cabinet.size.width / 2;
  targets.x.push(middle - rect.width / 2, middle + rect.width / 2);
  for (const zone of zoneHeightsOf(spec, cabinet.id, ref.bayId)) targets.y.push(zone.floor, zone.floor + zone.height);
  return targets;
}

// ---------------------------------------------------------------------------
// Transport modules
// ---------------------------------------------------------------------------

/** The cabinet whose joints a cabinet's modules follow: a top cabinet aligned to the one below follows that one. */
export function jointOwnerOf(spec: DesignSpec, cabinetId: string): Cabinet | null {
  const cabinet = find(spec, cabinetId);
  if (!cabinet) return null;
  const lower = cabinet.stackedOn ? find(spec, cabinet.stackedOn) : undefined;
  return lower?.transport && lower.transport.alignTop !== false ? lower : cabinet;
}

function editTransport(spec: DesignSpec, cabinetId: string, edit: (transport: NonNullable<Cabinet["transport"]>, cabinet: Cabinet) => void): DesignSpec {
  const owner = jointOwnerOf(spec, cabinetId);
  if (!owner) return spec;
  return change(spec, (draft) => {
    const cabinet = find(draft, owner.id)!;
    cabinet.transport ??= { joints: [], auto: true, alignTop: true, connector: "confirmat" };
    edit(cabinet.transport, cabinet);
    cabinet.transport.joints.sort((a, b) => a.at - b.at);
    for (const bay of cabinet.bays) delete bay.doorOverrides;
  });
}

/**
 * Made in transport modules. With no joints given, by the rule — 1600 mm
 * modules from the left, the rest in the last one — and kept to the rule as
 * the width changes. With joints given, exactly there, by hand.
 */
export function divideForTransport(spec: DesignSpec, cabinetId: string, joints?: number[]): DesignSpec {
  return editTransport(spec, cabinetId, (transport, cabinet) => {
    transport.auto = joints === undefined;
    transport.joints = (joints ?? defaultJoints(cabinet.size.width)).map((at) => ({ at: Math.round(at) }));
  });
}

/** Back to one carcass. */
export function removeTransport(spec: DesignSpec, cabinetId: string): DesignSpec {
  const owner = jointOwnerOf(spec, cabinetId);
  if (!owner) return spec;
  return change(spec, (draft) => {
    for (const cabinet of draft.cabinets) {
      if (cabinet.id === owner.id || cabinet.stackedOn === owner.id) {
        if (cabinet.id !== owner.id && owner.transport?.alignTop === false) continue;
        delete cabinet.transport;
        redivide(cabinet, draft.carcass.board.thickness);
      }
    }
  });
}

/** The partition centres a joint can sit on — where two side panels replace one divider. */
export function partitionCentresOf(spec: DesignSpec, cabinetId: string): number[] {
  const cabinet = find(spec, cabinetId);
  if (!cabinet) return [];
  const t = spec.carcass.board.thickness;
  const layout = bayLayout(cabinet, t);
  return layout.slice(0, -1).map((place, index) => (place.x + place.width + layout[index + 1]!.x) / 2);
}

/** Where a joint can usefully go: partitions, door boundaries, the centre line, the 1600 mm positions. */
export function transportSnapTargetsOf(spec: DesignSpec, cabinetId: string): number[] {
  const cabinet = find(spec, cabinetId);
  if (!cabinet) return [];
  const t = spec.carcass.board.thickness;
  const leaves = cabinetFronts(spec, cabinet).leaves;
  const doorEdges = leaves.slice(0, -1).map((leaf, index) => (leaf.x + leaf.width + leaves[index + 1]!.x) / 2);
  return jointSnapTargets(cabinet, t, doorEdges);
}

/**
 * One joint to a new place, by hand: the rule stops applying, the modules
 * either side change width, and the bays in them are refitted — real
 * geometry, not a line on the drawing. Kept to a buildable module either
 * side. A top cabinet aligned to this one follows.
 */
export function moveJoint(spec: DesignSpec, cabinetId: string, index: number, at: number): DesignSpec {
  return editTransport(spec, cabinetId, (transport, cabinet) => {
    const joint = transport.joints[index];
    if (!joint || joint.locked) return;
    const before = transport.joints[index - 1]?.at ?? 0;
    const after = transport.joints[index + 1]?.at ?? cabinet.size.width;
    transport.auto = false;
    joint.at = clamp(Math.round(at), before + MIN_MODULE, after - MIN_MODULE);
  });
}

export function addJoint(spec: DesignSpec, cabinetId: string, at: number): DesignSpec {
  return editTransport(spec, cabinetId, (transport, cabinet) => {
    const position = clamp(Math.round(at), MIN_MODULE, cabinet.size.width - MIN_MODULE);
    if (transport.joints.some((joint) => Math.abs(joint.at - position) < MIN_MODULE)) return;
    transport.auto = false;
    transport.joints.push({ at: position });
  });
}

export function removeJoint(spec: DesignSpec, cabinetId: string, index: number): DesignSpec {
  return editTransport(spec, cabinetId, (transport) => {
    if (!transport.joints[index] || transport.joints[index]!.locked) return;
    transport.auto = false;
    transport.joints.splice(index, 1);
  });
}

/** A locked joint stays put: the rule, a drag and Delete all leave it alone. */
export function lockJoint(spec: DesignSpec, cabinetId: string, index: number, locked: boolean): DesignSpec {
  return editTransport(spec, cabinetId, (transport) => {
    const joint = transport.joints[index];
    if (!joint) return;
    if (locked) {
      joint.locked = true;
      transport.auto = false;
    } else delete joint.locked;
  });
}

/** A joint onto the nearest partition, so it replaces a divider rather than resizing the bays around it. */
export function snapJointToPartition(spec: DesignSpec, cabinetId: string, index: number): DesignSpec {
  const owner = jointOwnerOf(spec, cabinetId);
  const joint = owner?.transport?.joints[index];
  if (!owner || !joint) return spec;
  // The partitions as they would be with this joint gone.
  const without = structuredClone(owner);
  without.transport!.joints = without.transport!.joints.filter((_, at) => at !== index);
  const candidates = partitionCentresOf({ ...spec, cabinets: spec.cabinets.map((cabinet) => (cabinet.id === owner.id ? without : cabinet)) }, owner.id).filter((centre) => !owner.transport!.joints.some((other, at) => at !== index && Math.abs(other.at - centre) < MIN_MODULE));
  if (!candidates.length) return spec;
  const nearest = candidates.reduce((best, centre) => (Math.abs(centre - joint.at) < Math.abs(best - joint.at) ? centre : best));
  return moveJoint(spec, owner.id, index, nearest);
}

/** The last two modules made equal — the "Adjust division" answer to a narrow last module. */
export function balanceLastModules(spec: DesignSpec, cabinetId: string): DesignSpec {
  const owner = jointOwnerOf(spec, cabinetId);
  const joints = owner ? modulesOf(owner) : [];
  if (!owner || joints.length < 2) return spec;
  const lastTwo = joints.slice(-2);
  return moveJoint(spec, owner.id, joints.length - 2, (lastTwo[0]!.from + lastTwo[1]!.to) / 2);
}

/** Top modules over the base modules, or — off — a top cabinet with joints of its own. */
export function setAlignTop(spec: DesignSpec, lowerId: string, align: boolean): DesignSpec {
  return change(spec, (draft) => {
    const lower = find(draft, lowerId);
    if (!lower?.transport) return;
    lower.transport.alignTop = align;
    // Turned off, the top keeps the joints it had, now its own to change.
    for (const top of draft.cabinets) {
      if (top.stackedOn === lower.id && !align && top.transport) top.transport.auto = false;
    }
  });
}

export function setConnector(spec: DesignSpec, cabinetId: string, connector: NonNullable<Cabinet["transport"]>["connector"]): DesignSpec {
  return change(spec, (draft) => {
    const cabinet = find(draft, cabinetId);
    if (!cabinet?.transport) return;
    cabinet.transport.connector = connector;
    for (const top of draft.cabinets) if (top.stackedOn === cabinet.id && top.transport) top.transport.connector = connector;
  });
}

/** What a narrow last module, or a joint through a bay, is worth saying. */
export function transportWarnings(spec: DesignSpec, cabinetId: string): string[] {
  const cabinet = find(spec, cabinetId);
  if (!cabinet) return [];
  const modules = modulesOf(cabinet);
  const warnings: string[] = [];
  const last = modules.at(-1);
  // Kept on purpose — the last joint locked where it is — it is not worth saying again.
  const kept = cabinet.transport?.joints.at(-1)?.locked === true;
  if (modules.length > 1 && last && last.width < 600 && !kept) warnings.push(`Final module is only ${Math.round(last.width)} mm wide.`);
  return warnings;
}

/**
 * What dividing a one-carcass cabinet by the rule would do to it, before it
 * is done: the modules, and any joint that would not land on a partition —
 * where the bays either side would be resized, or a module given a bay of
 * its own because none of the existing ones falls in it.
 */
export function transportProposal(spec: DesignSpec, cabinetId: string): { joints: number[]; widths: number[]; offPartition: number[]; snapped: number[] } {
  const cabinet = find(spec, cabinetId);
  if (!cabinet) return { joints: [], widths: [], offPartition: [], snapped: [] };
  const joints = defaultJoints(cabinet.size.width);
  const partitions = partitionCentresOf(spec, cabinetId);
  const near = (at: number) => partitions.some((centre) => Math.abs(centre - at) <= 25);
  const snapped: number[] = [];
  for (const at of joints) {
    const options = partitions.filter((centre) => centre - (snapped.at(-1) ?? 0) >= MIN_MODULE && cabinet.size.width - centre >= MIN_MODULE && !snapped.includes(centre));
    const best = options.length ? options.reduce((a, b) => (Math.abs(b - at) < Math.abs(a - at) ? b : a)) : at;
    if (!snapped.includes(best)) snapped.push(best);
  }
  const edges = [0, ...joints, cabinet.size.width];
  return { joints, widths: edges.slice(1).map((edge, index) => edge - edges[index]!), offPartition: joints.filter((at) => !near(at)), snapped };
}

