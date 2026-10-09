"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";

import { PlanCanvas } from "@/features/berchuma-studio/components/plan/plan-canvas";
import { levelChains, wallChain, type WallEnd } from "../services/quick-edit";

import { useHouseUnits } from "./house-units";
import { displayLength, modelLength } from "../services/workspace-options";
import type { HouseCommandId } from "../services/command-registry";
import { roomOutline, type HouseRoomShape } from "../services/model-commands";
import type { ColumnProposal } from "../services/column-suggestions";
import type { HouseProject, HouseSelection } from "../types/project";
import { definitionOf } from "../services/object-library";
import { stairGeometry, stairParams } from "../services/stair-geometry";
import { DoorSymbol, ObjectSymbol, StairSymbol, WindowSymbol } from "./plan-symbols";

export type HousePlanPoint = { x: number; y: number };
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type SnapPoint = HousePlanPoint & { label: string };

const lineTools = new Set<HouseCommandId>(["room", "wall", "structural-wall", "room-separator", "beam", "railing", "grid", "reference-plane", "dimension", "section", "elevation", "strip-footing"]);
const pointTools = new Set<HouseCommandId>(["door", "window", "column", "floor", "structural-slab", "ceiling", "roof", "stair", "opening", "component", "furniture", "kitchen", "wardrobe", "plumbing-fixture", "foundation", "isolated-footing", "foundation-slab", "level", "text", "room-tag", "tag", "move", "split"]);

// Grid-snap lands on the same points the background grid draws, so "snap to
// grid" and "the visible grid" are the same thing rather than two grids that
// happen to coexist.
const MINOR_GRID = 1000;
const MAJOR_GRID = MINOR_GRID * 5;
// Millimetres per screen pixel. The editing fields are drawn in the plan but
// sized for a finger: sized in millimetres they were 8 px tall at a phone's
// fit-to-screen zoom and spilled over the very door they described.
const MmPerPx = createContext(0);
// The editing field is 76 x 30 px. Beside a wall it has to clear the wall by
// its own half-size in that direction — half its width beside a vertical
// wall, half its height beside a horizontal one — or it lies across it.
const FIELD = { width: 76, height: 30, gap: 10 };
function fieldClearance(normal: { x: number; y: number }, px: number) {
  return (Math.abs(normal.x) * FIELD.width / 2 + Math.abs(normal.y) * FIELD.height / 2 + FIELD.gap) * px;
}
const chainTools = new Set<HouseCommandId>(["wall", "structural-wall", "room-separator"]);
const DIRECTIONS = [{ label: "→", x: 1, y: 0 }, { label: "↓", x: 0, y: 1 }, { label: "←", x: -1, y: 0 }, { label: "↑", x: 0, y: -1 }] as const;

export function HousePlanSelectionOverlay({ project, levelId, activeTool, selections, draftStart, snapEnabled, chain, viewRevision, roomShape = "rectangle", sketch = [], onCancelDraft, proposals = null, chosenProposal = null, onProposalChoose, onProposalMove, onMoveSelection, onDraftStart, onDraft, onSelect, onDimensionChange, onGuidance, onSelectionMenu, showGrid = true, pins = [], onPinTap, focus = null, onWallExtend, onWallEnd, onWallLength, onWallDistance, actionBar = null, guide = null, placement = null, onPlacementMove, ghost = null }: {
  project: HouseProject;
  levelId: string;
  activeTool: HouseCommandId | null;
  selections: readonly HouseSelection[];
  draftStart: HousePlanPoint | null;
  snapEnabled: boolean;
  chain: boolean;
  /** Bumped by the "Zoom to Fit" command — re-fits the view on top of the
   * usual reset when switching floors. */
  viewRevision?: number;
  roomShape?: HouseRoomShape;
  /** Walls sketched on an empty floor, not yet a closed outline. */
  sketch?: readonly HousePlanPoint[];
  onCancelDraft?: () => void;
  /** Suggested columns: drawn as outlines, not part of the model until accepted. */
  proposals?: readonly ColumnProposal[] | null;
  chosenProposal?: string | null;
  onProposalChoose?: (id: string) => void;
  onProposalMove?: (id: string, x: number, y: number) => void;
  /** Dragging a selected wall square to itself. */
  onMoveSelection?: (selection: HouseSelection, dx: number, dy: number) => void;
  onDraftStart: (point: HousePlanPoint | null) => void;
  onDraft: (start: HousePlanPoint, end: HousePlanPoint) => void;
  onSelect: (items: HouseSelection[], mode: "replace" | "add" | "remove") => void;
  onDimensionChange: (selection: HouseSelection, patch: Record<string, number>) => void;
  onGuidance: (message: string) => void;
  onSelectionMenu: (point: { x: number; y: number } | null) => void;
  /** The background grid; snapping to it is separate and follows `snapEnabled`. */
  showGrid?: boolean;
  /** Numbered pins on this floor: tapping one opens it. */
  pins?: readonly { id: string; number: string; x: number; y: number; status: "open" | "resolved" }[];
  onPinTap?: (id: string) => void;
  /** A point to bring to the middle — a pin opened from the Agenda. `key` says when it is a new request. */
  focus?: { x: number; y: number; key: string } | null;
  /** A selected wall's + / − at either end: lengthen or shorten it from that end. */
  onWallExtend?: (selection: HouseSelection, end: WallEnd, delta: number) => void;
  /** A selected wall's end dragged to a point. */
  onWallEnd?: (selection: HouseSelection, end: WallEnd, to: HousePlanPoint) => void;
  /** A length typed for the selected wall, kept from the other end. */
  onWallLength?: (selection: HouseSelection, end: WallEnd, length: number) => void;
  /** A distance typed between the selected wall and the next parallel wall. */
  onWallDistance?: (selection: HouseSelection, neighbourId: string, distance: number) => void;
  /** The selection's actions, shown small, beside it. */
  actionBar?: React.ReactNode;
  /** A line drawn over the plan as a preview — where a split will go. */
  guide?: { start: HousePlanPoint; end: HousePlanPoint; label?: string } | null;
  /** A room being placed: its outline follows the finger. */
  placement?: { x: number; y: number; width: number; depth: number } | null;
  onPlacementMove?: (x: number, y: number) => void;
  /** What is being placed, drawn where the finger is until it is put down. */
  ghost?: ((point: HousePlanPoint) => React.ReactNode) | null;
}) {
  const svg = useRef<SVGSVGElement | null>(null);
  const gridId = useId();
  const unit = useHouseUnits();
  const [dragStart, setDragStart] = useState<HousePlanPoint | null>(null);
  const [current, setCurrent] = useState<SnapPoint | null>(null);
  // A room can be dragged out in one press as well as tapped corner-to-corner.
  const roomPress = useRef<{ pointerId: number; start: HousePlanPoint } | null>(null);
  // Which way a typed length runs. On a phone there is no hovering pointer to
  // aim with, so it can be picked; otherwise it follows the pointer.
  const [typedDirection, setTypedDirection] = useState<{ x: number; y: number } | null>(null);
  // A door or window being slid along its wall: the offset it would land at.
  const [proposalDrag, setProposalDrag] = useState<{ pointerId: number; id: string; grab: HousePlanPoint; x: number; y: number; moved: boolean } | null>(null);
  const [wallDrag, setWallDrag] = useState<{ pointerId: number; selection: HouseSelection; origin: HousePlanPoint; normal: HousePlanPoint; distance: number } | null>(null);
  const [openingDrag, setOpeningDrag] = useState<{ pointerId: number; selection: HouseSelection; grab: number; offset: number; from: number } | null>(null);
  // A selected wall's end: dragged, or lengthened with + / − (held, it keeps going).
  const [endDrag, setEndDrag] = useState<{ pointerId: number; end: WallEnd; point: SnapPoint } | null>(null);
  const [hold, setHold] = useState<{ pointerId: number; end: WallEnd; sign: 1 | -1; steps: number; origin: HousePlanPoint; client: { x: number; y: number } } | null>(null);
  const holdTimer = useRef<{ timeout: number; interval: number } | null>(null);
  const [activeEnd, setActiveEnd] = useState<WallEnd>("end");
  const [placementDrag, setPlacementDrag] = useState<{ pointerId: number; grab: HousePlanPoint } | null>(null);
  // Furniture, a column or a stair dragged freely to a new place.
  const [itemDrag, setItemDrag] = useState<{ pointerId: number; selection: HouseSelection; origin: HousePlanPoint; dx: number; dy: number } | null>(null);
  const bounds = useMemo(() => levelBounds(project, levelId), [levelId, project]);
  const objects = useMemo(() => selectableBounds(project, levelId), [levelId, project]);
  const candidates = useMemo(() => snapCandidates(project, levelId), [levelId, project]);

  // The user's own pan/zoom, layered on top of the auto-fit `bounds`. `null`
  // means "follow the auto-fit view" — the common case, and what a floor
  // switch or Zoom to Fit returns to.
  const [view, setView] = useState<Bounds | null>(null);
  const [resetKey, setResetKey] = useState<[string, number]>([levelId, viewRevision ?? 0]);
  if (resetKey[0] !== levelId || resetKey[1] !== (viewRevision ?? 0)) {
    setResetKey([levelId, viewRevision ?? 0]);
    setView(null);
  }
  const [focusKey, setFocusKey] = useState<string | null>(null);
  if (focus && focus.key !== focusKey) {
    setFocusKey(focus.key);
    const span = Math.max(4000, Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2);
    setView({ minX: focus.x - span / 2, minY: focus.y - span / 2, maxX: focus.x + span / 2, maxY: focus.y + span / 2 });
  }
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height }); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // The fitted view leaves a finger's width round the plan, so the handles
  // and + / − at a wall's end are on screen, not under the canvas's edge.
  const fitted = (() => {
    if (!canvasSize || canvasSize.width < 1 || canvasSize.height < 1) return bounds;
    const perPx = Math.max((bounds.maxX - bounds.minX) / canvasSize.width, (bounds.maxY - bounds.minY) / canvasSize.height);
    const pad = 36 * perPx;
    return { minX: bounds.minX - pad, minY: bounds.minY - pad, maxX: bounds.maxX + pad, maxY: bounds.maxY + pad };
  })();
  const effective = view ?? fitted;
  const mmPerPx = canvasSize && canvasSize.width > 0 && canvasSize.height > 0
    ? Math.max((effective.maxX - effective.minX) / canvasSize.width, (effective.maxY - effective.minY) / canvasSize.height)
    : 0;

  // Active touches, keyed by pointerId, so a second finger coming down is
  // recognised as "start pinching" rather than "place a second wall point".
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ midX: number; midY: number; dist: number } | null>(null);
  // Touch: a tap selects, holding still opens the full action menu.
  const longPress = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);
  // Lifting the finger after a long press would otherwise "click" whichever
  // menu item has just appeared under it — Delete, as often as not.
  const swallowRelease = useRef(false);
  function cancelLongPress() {
    if (longPress.current) window.clearTimeout(longPress.current.timer);
    longPress.current = null;
  }

  const margin = Math.max(500, Math.max(effective.maxX - effective.minX, effective.maxY - effective.minY) * 0.08);
  const viewBox = `${effective.minX} ${effective.minY} ${effective.maxX - effective.minX} ${effective.maxY - effective.minY}`;
  // The grid tiles forever, but the plain <rect> painting it has to end
  // somewhere; a generous multiple of the model's own footprint covers any
  // pan a person is likely to make without redrawing it every frame.
  const gridSpan = Math.max(effective.maxX - effective.minX, effective.maxY - effective.minY, 8000) * 4;
  const gridBounds = expand(bounds, gridSpan);
  const selectMode = !activeTool || activeTool === "select";
  const selectedIds = new Set(selections.map((item) => item.id));

  function modelPoint(event: React.PointerEvent<SVGSVGElement>): HousePlanPoint | null {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    const result = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: result.x, y: result.y };
  }

  function pinchState(): { midX: number; midY: number; dist: number } | null {
    const touches = Array.from(pointers.current.values());
    if (touches.length < 2) return null;
    const [a, b] = touches;
    return { midX: (a!.x + b!.x) / 2, midY: (a!.y + b!.y) / 2, dist: Math.max(1, Math.hypot(a!.x - b!.x, a!.y - b!.y)) };
  }

  /** Pinch to zoom, two fingers moving together to pan — the same gesture
   * covers both, since a pan is just a pinch whose distance barely changes. */
  function applyPinch() {
    const next = pinchState();
    const prev = pinch.current;
    pinch.current = next;
    if (!next || !prev || !svg.current) return;
    const rect = svg.current.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    // Two fingers move as two pointer events, usually in one batch, so this
    // has to build on the previous event's result rather than this render's.
    setView((current) => pinchView(current ?? fitted, prev, next, rect));
  }

  function pinchView(base: Bounds, prev: { midX: number; midY: number; dist: number }, next: { midX: number; midY: number; dist: number }, rect: DOMRect): Bounds {
    const width = base.maxX - base.minX;
    const height = base.maxY - base.minY;
    const span = Math.max(width, height, 1);
    const maxSpan = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 8000) * 8;
    const factor = clamp(prev.dist / next.dist, 300 / span, maxSpan / span);
    const newWidth = width * factor;
    const newHeight = height * factor;
    const fracX = (prev.midX - rect.left) / rect.width;
    const fracY = (prev.midY - rect.top) / rect.height;
    const anchorX = base.minX + fracX * width;
    const anchorY = base.minY + fracY * height;
    const panX = (next.midX - prev.midX) * (newWidth / rect.width);
    const panY = (next.midY - prev.midY) * (newHeight / rect.height);
    const minX = anchorX - fracX * newWidth - panX;
    const minY = anchorY - fracY * newHeight - panY;
    return { minX, minY, maxX: minX + newWidth, maxY: minY + newHeight };
  }

  /** Mouse wheel zoom at the cursor; trackpad two-finger scroll pans (and a
   * trackpad pinch arrives as wheel + ctrlKey, same as Google Maps reads it). */
  function wheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    if (!svg.current) return;
    const rect = svg.current.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const { ctrlKey, deltaX, deltaY, clientX, clientY } = event;
    setView((current) => wheelView(current ?? fitted, { ctrlKey, deltaX, deltaY, clientX, clientY }, rect));
  }

  function wheelView(base: Bounds, event: { ctrlKey: boolean; deltaX: number; deltaY: number; clientX: number; clientY: number }, rect: DOMRect): Bounds {
    const width = base.maxX - base.minX;
    const height = base.maxY - base.minY;
    if (event.ctrlKey) {
      const span = Math.max(width, height, 1);
      const maxSpan = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 8000) * 8;
      const factor = clamp(1 + event.deltaY * 0.01, 300 / span, maxSpan / span);
      const fracX = (event.clientX - rect.left) / rect.width;
      const fracY = (event.clientY - rect.top) / rect.height;
      const anchorX = base.minX + fracX * width;
      const anchorY = base.minY + fracY * height;
      const newWidth = width * factor;
      const newHeight = height * factor;
      const minX = anchorX - fracX * newWidth;
      const minY = anchorY - fracY * newHeight;
      return { minX, minY, maxX: minX + newWidth, maxY: minY + newHeight };
    }
    const dx = event.deltaX * (width / rect.width);
    const dy = event.deltaY * (height / rect.height);
    return { minX: base.minX + dx, minY: base.minY + dy, maxX: base.maxX + dx, maxY: base.maxY + dy };
  }

  /**
   * Where a tap lands for the tool in hand. Furniture and stairs are placed
   * finer than walls are drawn: the metre grid would only let a sofa stand
   * on whole metres, so between real snaps they step 50 mm.
   */
  function toolPoint(raw: HousePlanPoint): SnapPoint {
    const point = snapped(raw);
    if (!snapEnabled || point.label !== "Grid" || (activeTool !== "furniture" && activeTool !== "stair")) return point;
    return { x: Math.round(raw.x / 50) * 50, y: Math.round(raw.y / 50) * 50, label: "Grid" };
  }

  function snapped(raw: HousePlanPoint, from: HousePlanPoint | null = draftStart, moving?: string): SnapPoint {
    const draftStart = from;
    if (!snapEnabled) return { ...raw, label: "Nearest" };
    let best: SnapPoint = { x: Math.round(raw.x / MINOR_GRID) * MINOR_GRID, y: Math.round(raw.y / MINOR_GRID) * MINOR_GRID, label: "Grid" };
    let distance = Math.hypot(best.x - raw.x, best.y - raw.y);
    // The sketch's own corners, the first above all, so the outline closes
    // exactly where it began.
    for (const [index, point] of sketch.entries()) { const next = Math.hypot(point.x - raw.x, point.y - raw.y); if (next < distance && next <= Math.max(140, 16 * mmPerPx)) { best = { ...point, label: index === 0 ? "Close outline" : "Endpoint" }; distance = next; } }
    for (const candidate of candidates) {
      const next = Math.hypot(candidate.x - raw.x, candidate.y - raw.y);
      if (next < distance && next <= 140) { best = candidate; distance = next; }
    }
    // Not onto the wall whose end is being dragged: its own face is always
    // within reach, and held the end there whatever else was aimed at.
    for (const wall of project.walls.filter((item) => item.levelId === levelId && item.id !== moving)) {
      const centre = closestPointOnSegment(raw, wall.start, wall.end);
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const candidatesOnWall: SnapPoint[] = [
        { ...centre, label: "Wall Centerline" },
        { x: centre.x - dy / length * wall.thickness / 2, y: centre.y + dx / length * wall.thickness / 2, label: "Wall Face" },
        { x: centre.x + dy / length * wall.thickness / 2, y: centre.y - dx / length * wall.thickness / 2, label: "Wall Face" },
      ];
      for (const candidate of candidatesOnWall) { const next = Math.hypot(candidate.x - raw.x, candidate.y - raw.y); if (next < distance && next <= 140) { best = candidate; distance = next; } }
    }
    // A point on a wall that is also a grid point is the grid point: the same
    // place, without a finger's fraction of a millimetre in its numbers.
    if (best.label.startsWith("Wall")) {
      const grid = { x: Math.round(raw.x / MINOR_GRID) * MINOR_GRID, y: Math.round(raw.y / MINOR_GRID) * MINOR_GRID };
      if (Math.hypot(grid.x - best.x, grid.y - best.y) < 1) best = { ...grid, label: best.label };
    }
    // Parallel: drawing within 3° of an existing wall's direction lands the
    // end exactly on the parallel line. It outranks the grid — the grid is
    // what you get for not aiming — but not a real point on a wall.
    if (draftStart && (best.label === "Grid" || best.label === "Nearest")) {
      const run = Math.hypot(raw.x - draftStart.x, raw.y - draftStart.y);
      let closest = Math.sin((3 * Math.PI) / 180);
      for (const wall of project.walls.filter((item) => item.levelId === levelId)) {
        const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
        if (run < 300 || length < 1) continue;
        const ux = (wall.end.x - wall.start.x) / length;
        const uy = (wall.end.y - wall.start.y) / length;
        const along = (raw.x - draftStart.x) * ux + (raw.y - draftStart.y) * uy;
        const sine = Math.abs((raw.x - draftStart.x) * uy - (raw.y - draftStart.y) * ux) / run;
        if (sine < closest) { closest = sine; best = { x: draftStart.x + ux * along, y: draftStart.y + uy * along, label: "Parallel" }; distance = Math.hypot(best.x - raw.x, best.y - raw.y); }
      }
    }
    if (draftStart) {
      const perpendicular: SnapPoint[] = [{ x: raw.x, y: draftStart.y, label: "Perpendicular" }, { x: draftStart.x, y: raw.y, label: "Perpendicular" }];
      for (const candidate of perpendicular) { const next = Math.hypot(candidate.x - raw.x, candidate.y - raw.y); if (next < distance && next <= 140) { best = candidate; distance = next; } }
    }
    return best;
  }

  function pointerDown(event: React.PointerEvent<SVGSVGElement>) {
    // The first finger of a gesture starts a fresh count. A finger lifted over
    // something drawn on top of the plan — the length field that appears when
    // a wall is selected — never reports back here, and left behind it made the
    // next one-finger touch look like a pinch.
    if (event.isPrimary) pointers.current.clear();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2) {
      // A second finger landing mid-drag means "I want to pan", not "place
      // the next wall point" — the marquee it interrupted was never finished.
      setDragStart(null);
      cancelLongPress();
      pinch.current = pinchState();
      return;
    }
    if (event.button !== 0) return;
    const raw = modelPoint(event);
    if (!raw) return;
    svg.current?.focus();
    if (selectMode && event.pointerType !== "mouse") {
      const { clientX, clientY } = event;
      const entry = { x: clientX, y: clientY, fired: false, timer: 0 };
      entry.timer = window.setTimeout(() => {
        entry.fired = true;
        const hit = pickHouseObject(objects, raw);
        if (!hit) return;
        onSelect([hit], "replace");
        onSelectionMenu({ x: clientX, y: clientY });
      }, 500);
      longPress.current = entry;
    }
    if (placement && onPlacementMove) {
      cancelLongPress();
      svg.current?.setPointerCapture(event.pointerId);
      const inside = raw.x >= placement.x && raw.x <= placement.x + placement.width && raw.y >= placement.y && raw.y <= placement.y + placement.depth;
      const grab = inside ? { x: raw.x - placement.x, y: raw.y - placement.y } : { x: placement.width / 2, y: placement.depth / 2 };
      setPlacementDrag({ pointerId: event.pointerId, grab });
      if (!inside) onPlacementMove(...placementSnap(raw, grab));
      return;
    }
    if (selectMode && selectedWall && selections[0] && onWallExtend) {
      const control = wallControls(selectedWall).find((item) => Math.hypot(raw.x - item.at.x, raw.y - item.at.y) <= 22 * mmPerPx);
      if (control) {
        cancelLongPress();
        svg.current?.setPointerCapture(event.pointerId);
        setActiveEnd(control.end);
        if (control.kind === "handle") { setEndDrag({ pointerId: event.pointerId, end: control.end, point: { ...(control.end === "end" ? selectedWall.end : selectedWall.start), label: "Endpoint" } }); return; }
        const sign = control.kind === "plus" ? 1 : -1;
        setHold({ pointerId: event.pointerId, end: control.end, sign, steps: 1, origin: raw, client: { x: event.clientX, y: event.clientY } });
        // Held, it keeps going — slowly at first, then faster.
        const timeout = window.setTimeout(() => {
          let ticks = 0;
          const interval = window.setInterval(() => { ticks += 1; setHold((current) => current && { ...current, steps: current.steps + (ticks > 15 ? 4 : 1) }); }, 80);
          if (holdTimer.current) holdTimer.current.interval = interval;
        }, 380);
        holdTimer.current = { timeout, interval: 0 };
        return;
      }
    }
    if (selectMode && pins.length && onPinTap) {
      const reach = 22 * mmPerPx;
      const hit = pins.find((pin) => Math.hypot(raw.x - pin.x, raw.y - (pin.y - 14 * mmPerPx)) <= reach);
      if (hit) { cancelLongPress(); onPinTap(hit.id); return; }
    }
    const point = toolPoint(raw);
    setCurrent(point);
    if (selectMode && proposals?.length) {
      const reach = 18 * mmPerPx;
      const hit = proposals.find((item) => Math.abs(raw.x - item.x) <= item.width / 2 + reach && Math.abs(raw.y - item.y) <= item.depth / 2 + reach);
      if (hit) {
        cancelLongPress();
        svg.current?.setPointerCapture(event.pointerId);
        setProposalDrag({ pointerId: event.pointerId, id: hit.id, grab: { x: raw.x - hit.x, y: raw.y - hit.y }, x: hit.x, y: hit.y, moved: false });
        return;
      }
    }
    if (selectMode && selectedOpening && selectedOpeningWall && selections[0]) {
      const centre = pointAlongWall(selectedOpeningWall, selectedOpening.offset + selectedOpening.width / 2);
      const reach = Math.max(selectedOpening.width / 2, 300, 24 * mmPerPx) + selectedOpeningWall.thickness;
      if (Math.hypot(raw.x - centre.x, raw.y - centre.y) <= reach) {
        cancelLongPress();
        svg.current?.setPointerCapture(event.pointerId);
        setOpeningDrag({ pointerId: event.pointerId, selection: selections[0], grab: alongWall(selectedOpeningWall, raw) - selectedOpening.offset, offset: selectedOpening.offset, from: selectedOpening.offset });
        return;
      }
    }
    if (selectMode && selectedItemBounds && selections[0] && onMoveSelection) {
      const reach = Math.max(16 * mmPerPx, 60);
      if (raw.x >= selectedItemBounds.minX - reach && raw.x <= selectedItemBounds.maxX + reach && raw.y >= selectedItemBounds.minY - reach && raw.y <= selectedItemBounds.maxY + reach) {
        cancelLongPress();
        svg.current?.setPointerCapture(event.pointerId);
        setItemDrag({ pointerId: event.pointerId, selection: selections[0], origin: raw, dx: 0, dy: 0 });
        return;
      }
    }
    if (selectMode && selectedWall && selections[0] && onMoveSelection) {
      const length = Math.hypot(selectedWall.end.x - selectedWall.start.x, selectedWall.end.y - selectedWall.start.y);
      const near = Math.hypot(raw.x - closestPointOnSegment(raw, selectedWall.start, selectedWall.end).x, raw.y - closestPointOnSegment(raw, selectedWall.start, selectedWall.end).y);
      if (length > 0 && near <= selectedWall.thickness / 2 + Math.max(16 * mmPerPx, 60)) {
        cancelLongPress();
        svg.current?.setPointerCapture(event.pointerId);
        setWallDrag({ pointerId: event.pointerId, selection: selections[0], origin: raw, normal: { x: -(selectedWall.end.y - selectedWall.start.y) / length, y: (selectedWall.end.x - selectedWall.start.x) / length }, distance: 0 });
        return;
      }
    }
    if (selectMode) {
      svg.current?.setPointerCapture(event.pointerId);
      setDragStart(raw);
      return;
    }
    if (activeTool && lineTools.has(activeTool)) {
      if (!draftStart) {
        onDraftStart(point);
        setTypedDirection(null);
        if (activeTool === "room") {
          roomPress.current = { pointerId: event.pointerId, start: point };
          svg.current?.setPointerCapture(event.pointerId);
          onGuidance("Room · Drag to the opposite corner, tap it, or type the size");
        } else {
          onGuidance(`${toolName(activeTool)} Tool · Pick end point or type length`);
        }
      } else {
        onDraft(draftStart, point);
        onDraftStart(chain && chainTools.has(activeTool) ? point : null);
      }
      return;
    }
    if (activeTool && pointTools.has(activeTool)) onDraft(point, point);
  }

  function moveProposal(event: React.PointerEvent<SVGSVGElement>) {
    if (!proposalDrag || proposalDrag.pointerId !== event.pointerId) return false;
    const raw = modelPoint(event);
    if (!raw) return true;
    const step = snapEnabled ? 50 : 10;
    const x = Math.round((raw.x - proposalDrag.grab.x) / step) * step;
    const y = Math.round((raw.y - proposalDrag.grab.y) / step) * step;
    if (x !== proposalDrag.x || y !== proposalDrag.y) setProposalDrag({ ...proposalDrag, x, y, moved: true });
    return true;
  }

  function moveWall(event: React.PointerEvent<SVGSVGElement>) {
    if (!wallDrag || wallDrag.pointerId !== event.pointerId) return false;
    const raw = modelPoint(event);
    if (!raw) return true;
    const step = snapEnabled ? 50 : 10;
    const distance = Math.round(((raw.x - wallDrag.origin.x) * wallDrag.normal.x + (raw.y - wallDrag.origin.y) * wallDrag.normal.y) / step) * step;
    if (distance !== wallDrag.distance) setWallDrag({ ...wallDrag, distance });
    return true;
  }

  function placementSnap(raw: HousePlanPoint, grab: HousePlanPoint): [number, number] {
    if (!placement) return [raw.x, raw.y];
    const step = snapEnabled ? 50 : 10;
    let x = Math.round((raw.x - grab.x) / step) * step;
    let y = Math.round((raw.y - grab.y) / step) * step;
    if (snapEnabled) {
      // Edges land on the walls already there, so a copy sits against its neighbour.
      const reach = 16 * mmPerPx;
      const near = (value: number, lines: number[]) => lines.find((line) => Math.abs(line - value) <= reach);
      const left = near(x, chains.xs) ?? near(x + placement.width, chains.xs);
      if (left !== undefined) x = near(x, chains.xs) !== undefined ? left : left - placement.width;
      const top = near(y, chains.ys) ?? near(y + placement.depth, chains.ys);
      if (top !== undefined) y = near(y, chains.ys) !== undefined ? top : top - placement.depth;
    }
    return [x, y];
  }

  /** A + or − sits on the wall: pressed and slid before it starts repeating, it is the wall being dragged. */
  function holdSlide(event: React.PointerEvent<SVGSVGElement>) {
    if (!hold || hold.steps > 1 || !selectedWall || !selections[0] || !onMoveSelection) return;
    if (Math.hypot(event.clientX - hold.client.x, event.clientY - hold.client.y) <= 10) return;
    const length = Math.hypot(selectedWall.end.x - selectedWall.start.x, selectedWall.end.y - selectedWall.start.y);
    if (!length) return;
    stopHold();
    setHold(null);
    setWallDrag({ pointerId: event.pointerId, selection: selections[0], origin: hold.origin, normal: { x: -(selectedWall.end.y - selectedWall.start.y) / length, y: (selectedWall.end.x - selectedWall.start.x) / length }, distance: 0 });
  }

  function moveEnd(event: React.PointerEvent<SVGSVGElement>) {
    if (!endDrag || endDrag.pointerId !== event.pointerId || !selectedWall) return false;
    const raw = modelPoint(event);
    if (!raw) return true;
    const anchor = endDrag.end === "end" ? selectedWall.start : selectedWall.end;
    let point = snapped(raw, anchor, selectedWall.id);
    // Straight on from the other end, the length is what was aimed at, in
    // the same steps as + and −.
    const run = Math.hypot(point.x - anchor.x, point.y - anchor.y);
    if ((point.label === "Perpendicular" || point.label === "Parallel") && run > 0) {
      const length = Math.max(holdStep, Math.round(run / holdStep) * holdStep);
      point = { x: anchor.x + (point.x - anchor.x) * length / run, y: anchor.y + (point.y - anchor.y) * length / run, label: point.label };
    }
    setEndDrag({ ...endDrag, point });
    return true;
  }

  function moveItem(event: React.PointerEvent<SVGSVGElement>) {
    if (!itemDrag || itemDrag.pointerId !== event.pointerId) return false;
    const raw = modelPoint(event);
    if (!raw) return true;
    const step = snapEnabled ? 50 : 10;
    const dx = Math.round((raw.x - itemDrag.origin.x) / step) * step;
    const dy = Math.round((raw.y - itemDrag.origin.y) / step) * step;
    if (dx !== itemDrag.dx || dy !== itemDrag.dy) setItemDrag({ ...itemDrag, dx, dy });
    return true;
  }

  function moveOpening(event: React.PointerEvent<SVGSVGElement>) {
    if (!openingDrag || openingDrag.pointerId !== event.pointerId || !selectedOpening || !selectedOpeningWall) return false;
    const raw = modelPoint(event);
    if (!raw) return true;
    const length = Math.hypot(selectedOpeningWall.end.x - selectedOpeningWall.start.x, selectedOpeningWall.end.y - selectedOpeningWall.start.y);
    const step = snapEnabled ? 50 : 10;
    const offset = Math.min(Math.max(0, Math.round((alongWall(selectedOpeningWall, raw) - openingDrag.grab) / step) * step), Math.max(0, length - selectedOpening.width));
    if (offset !== openingDrag.offset) setOpeningDrag({ ...openingDrag, offset });
    return true;
  }

  function pointerUp(event: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
    // A press on the selected wall or opening that never moved is a tap, and
    // a tap picks — otherwise a door in the selected wall could not be chosen.
    if (proposalDrag && proposalDrag.pointerId === event.pointerId) {
      if (proposalDrag.moved) onProposalMove?.(proposalDrag.id, proposalDrag.x, proposalDrag.y);
      onProposalChoose?.(proposalDrag.id);
      setProposalDrag(null);
      return;
    }
    const tapped = () => { const end = modelPoint(event); if (end) onSelect(pickHouseObject(objects, end) ? [pickHouseObject(objects, end)!] : [], "replace"); };
    if (placementDrag && placementDrag.pointerId === event.pointerId) { setPlacementDrag(null); return; }
    if (hold && hold.pointerId === event.pointerId) {
      stopHold();
      if (selections[0]) onWallExtend?.(selections[0], hold.end, hold.sign * hold.steps * holdStep);
      setHold(null);
      return;
    }
    if (endDrag && endDrag.pointerId === event.pointerId) {
      const from = endDrag.end === "end" ? selectedWall?.end : selectedWall?.start;
      if (selections[0] && from && Math.hypot(endDrag.point.x - from.x, endDrag.point.y - from.y) > 0.5) onWallEnd?.(selections[0], endDrag.end, { x: endDrag.point.x, y: endDrag.point.y });
      setEndDrag(null);
      return;
    }
    if (itemDrag && itemDrag.pointerId === event.pointerId) {
      if (itemDrag.dx !== 0 || itemDrag.dy !== 0) onMoveSelection?.(itemDrag.selection, itemDrag.dx, itemDrag.dy);
      else tapped();
      setItemDrag(null);
      return;
    }
    if (wallDrag && wallDrag.pointerId === event.pointerId) {
      if (wallDrag.distance !== 0) onMoveSelection?.(wallDrag.selection, wallDrag.normal.x * wallDrag.distance, wallDrag.normal.y * wallDrag.distance);
      else tapped();
      setWallDrag(null);
      return;
    }
    if (openingDrag && openingDrag.pointerId === event.pointerId) {
      if (openingDrag.offset !== openingDrag.from) onDimensionChange(openingDrag.selection, { offset: openingDrag.offset });
      else tapped();
      setOpeningDrag(null);
      return;
    }
    if (pointers.current.size >= 1) return;
    const press = roomPress.current;
    roomPress.current = null;
    if (press && press.pointerId === event.pointerId && activeTool === "room") {
      const raw = modelPoint(event);
      const end = raw ? snapped(raw) : null;
      // A drag finishes the room; a tap leaves the first corner waiting.
      if (end && Math.hypot(end.x - press.start.x, end.y - press.start.y) > 500) {
        onDraft(press.start, end);
        onDraftStart(null);
      }
      return;
    }
    const held = longPress.current?.fired;
    cancelLongPress();
    if (held) { swallowRelease.current = true; setDragStart(null); return; }
    if (!selectMode || !dragStart) return;
    const end = modelPoint(event) ?? dragStart;
    const distance = Math.hypot(end.x - dragStart.x, end.y - dragStart.y);
    const mode = event.shiftKey ? "remove" : event.ctrlKey || event.metaKey ? "add" : "replace";
    if (distance < Math.max(35, margin * 0.025)) {
      const hit = pickHouseObject(objects, end);
      onSelect(hit ? [hit] : [], mode);
    } else {
      const box = normalized(dragStart, end);
      const crossing = end.x < dragStart.x;
      onSelect(objects.filter((object) => crossing ? intersects(box, object.bounds) : contains(box, object.bounds)).map((object) => object.selection), mode);
    }
    setDragStart(null);
  }

  const selectionBox = dragStart && current ? normalized(dragStart, current) : null;
  const crossing = !!dragStart && !!current && current.x < dragStart.x;
  const selectedWall = selections.length === 1 && selections[0]?.kind === "wall" ? project.walls.find((item) => item.id === selections[0]?.id) : null;
  const selectedOpening = selections.length === 1 && (selections[0]?.kind === "door" || selections[0]?.kind === "window") ? [...project.doors, ...project.windows].find((item) => item.id === selections[0]?.id) : null;
  const selectedOpeningWall = selectedOpening ? project.walls.find((item) => item.id === selectedOpening.wallId) ?? null : null;
  const selectedColumn = selections.length === 1 && selections[0]?.kind === "column" ? project.structuralColumns.find((item) => item.id === selections[0]?.id) : null;
  const holdStep = snapEnabled ? 50 : 10;
  const chains = levelChains(project, levelId);
  function stopHold() {
    if (holdTimer.current) { window.clearTimeout(holdTimer.current.timeout); window.clearInterval(holdTimer.current.interval); }
    holdTimer.current = null;
  }
  /** Where a selected wall's handles and + / − sit, on screen-sized offsets from its ends. */
  function wallControls(wall: HouseProject["walls"][number]) {
    const length = Math.max(1, Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y));
    const ux = (wall.end.x - wall.start.x) / length;
    const uy = (wall.end.y - wall.start.y) / length;
    const gap = 46 * mmPerPx;
    const controls: { end: WallEnd; kind: "handle" | "plus" | "minus"; at: HousePlanPoint }[] = [];
    for (const end of ["start", "end"] as const) {
      const point = end === "end" ? wall.end : wall.start;
      const out = end === "end" ? 1 : -1;
      controls.push({ end, kind: "handle", at: point });
      controls.push({ end, kind: "plus", at: { x: point.x + ux * gap * out, y: point.y + uy * gap * out } });
      // On a short wall there is no room inside for −; it goes beside the end instead.
      const inside = length > gap * 2.6;
      controls.push({ end, kind: "minus", at: inside ? { x: point.x - ux * gap * out, y: point.y - uy * gap * out } : { x: point.x - uy * gap, y: point.y + ux * gap } });
    }
    return controls;
  }
  const selectedItemBounds = selections.length === 1 && ["component", "column", "stair", "room"].includes(selections[0]!.kind) ? objects.find((object) => object.selection.id === selections[0]!.id)?.bounds ?? null : null;

  const plan = project.levels.find((level) => level.id === levelId)?.plan;
  return (
    <>
    {/* The verified plan underneath, in the same frame, so it pans and zooms
        with the model rather than staying put behind it. */}
    {plan ? <div className="pointer-events-none absolute inset-0"><PlanCanvas room={plan} onChange={noop} formatLength={(value) => displayLength(value, project.displayUnits ?? "mm")} openingSymbols={false} viewBox={{ x: effective.minX, y: effective.minY, width: effective.maxX - effective.minX, height: effective.maxY - effective.minY }} /></div> : null}
    <svg ref={svg} tabIndex={0} aria-label="House plan modeling canvas" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 size-full touch-none outline-none" style={{ cursor: selectMode ? "default" : "crosshair" }} onPointerDown={pointerDown} onPointerMove={(event) => { if (placementDrag && placementDrag.pointerId === event.pointerId) { const raw = modelPoint(event); if (raw && onPlacementMove) onPlacementMove(...placementSnap(raw, placementDrag.grab)); return; } if (hold && hold.pointerId === event.pointerId) { holdSlide(event); return; } if (moveEnd(event) || moveProposal(event) || moveItem(event) || moveWall(event) || moveOpening(event)) return; if (longPress.current && Math.hypot(event.clientX - longPress.current.x, event.clientY - longPress.current.y) > 10) cancelLongPress(); if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointers.current.size >= 2) { applyPinch(); return; } const raw = modelPoint(event); if (raw) setCurrent(toolPoint(raw)); }} onPointerUp={pointerUp} onTouchEnd={(event) => {
        if (swallowRelease.current) { swallowRelease.current = false; event.preventDefault(); return; }
        // The canvas has had the tap. The click a browser makes of it after
        // the finger lifts would land on whatever the tap just opened there —
        // the action bar — so it is not made. A field on the canvas still
        // takes its tap; one being typed in elsewhere is let go.
        if ((event.target as Element).closest("foreignObject")) return;
        event.preventDefault();
        const active = document.activeElement;
        if (active instanceof HTMLElement && active !== document.body) active.blur();
      }} onPointerCancel={(event) => { pointers.current.delete(event.pointerId); cancelLongPress(); setDragStart(null); setOpeningDrag(null); setWallDrag(null); setItemDrag(null); setProposalDrag(null); setEndDrag(null); setPlacementDrag(null); stopHold(); setHold(null); }} onWheel={wheel}>
      <defs>
        <pattern id={`${gridId}-minor`} width={MINOR_GRID} height={MINOR_GRID} patternUnits="userSpaceOnUse">
          <path d={`M ${MINOR_GRID} 0 L 0 0 0 ${MINOR_GRID}`} fill="none" strokeWidth={6} className="stroke-slate-300 dark:stroke-[#eef2f7]" />
        </pattern>
        <pattern id={`${gridId}-major`} width={MAJOR_GRID} height={MAJOR_GRID} patternUnits="userSpaceOnUse">
          <rect width={MAJOR_GRID} height={MAJOR_GRID} fill={`url(#${gridId}-minor)`} />
          <path d={`M ${MAJOR_GRID} 0 L 0 0 0 ${MAJOR_GRID}`} fill="none" strokeWidth={10} className="stroke-slate-400 dark:stroke-[#dbe3ec]" />
        </pattern>
      </defs>
      {showGrid ? <rect aria-label="Grid" x={gridBounds.minX} y={gridBounds.minY} width={gridBounds.maxX - gridBounds.minX} height={gridBounds.maxY - gridBounds.minY} fill={`url(#${gridId}-major)`} pointerEvents="none" /> : null}
      <MmPerPx.Provider value={mmPerPx}><Coordinates view={effective} unit={unit} /></MmPerPx.Provider>
      {sketch.length ? <g pointerEvents="none">
        <polyline points={sketch.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#1473e6" strokeWidth={3} vectorEffect="non-scaling-stroke" />
        {sketch.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={Math.max(40, (index === 0 ? 7 : 4) * mmPerPx)} fill={index === 0 ? "#1473e6" : "white"} stroke="#1473e6" strokeWidth={2} vectorEffect="non-scaling-stroke" aria-label={index === 0 ? "Outline start" : undefined} />)}
      </g> : null}
      <ModelPlanGeometry project={project} levelId={levelId} />
      {ghost && current && !selectMode ? <g aria-label="Placing" pointerEvents="none" opacity={0.65} className="text-brand">{ghost(current)}</g> : null}
      {objects.filter((object) => selectedIds.has(object.selection.id)).map((object) => {
        const line = lineGeometry(project, levelId, object.selection);
        if (line) {
          const grip = Math.max(90, margin * 0.07);
          return (
            <g key={object.selection.id} pointerEvents="none">
              <line x1={line.start.x} y1={line.start.y} x2={line.end.x} y2={line.end.y} stroke="#1473e6" strokeOpacity={0.28} strokeWidth={Math.max(line.thickness + 16, 28)} strokeLinecap="round" />
              <line x1={line.start.x} y1={line.start.y} x2={line.end.x} y2={line.end.y} stroke="#1473e6" strokeWidth={4} vectorEffect="non-scaling-stroke" />
              {[line.start, line.end].map((point, index) => <rect key={index} x={point.x - grip / 2} y={point.y - grip / 2} width={grip} height={grip} fill="white" stroke="#1473e6" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
            </g>
          );
        }
        return <rect key={object.selection.id} x={object.bounds.minX} y={object.bounds.minY} width={Math.max(1, object.bounds.maxX - object.bounds.minX)} height={Math.max(1, object.bounds.maxY - object.bounds.minY)} fill="rgba(20,115,230,.10)" stroke="#1473e6" strokeWidth={10} vectorEffect="non-scaling-stroke" />;
      })}
      {project.annotations.filter((item) => item.levelId === levelId).map((item) => item.end ? <g key={item.id}><line x1={item.start.x} y1={item.start.y} x2={item.end.x} y2={item.end.y} stroke={selectedIds.has(item.id) ? "#1473e6" : "#7c3aed"} strokeWidth={2} strokeDasharray={item.kind === "dimension" ? undefined : "80 45"} vectorEffect="non-scaling-stroke" /><text x={(item.start.x + item.end.x) / 2} y={(item.start.y + item.end.y) / 2 - 80} textAnchor="middle" fontSize={Math.max(120, margin * 0.15)} fill="#334155">{item.kind === "dimension" && item.value !== null ? `${displayLength(item.value, project.displayUnits ?? "mm")} ${project.displayUnits ?? "mm"}` : item.text}</text></g> : <text key={item.id} x={item.start.x} y={item.start.y} textAnchor="middle" fontSize={Math.max(120, margin * 0.15)} fill={selectedIds.has(item.id) ? "#1473e6" : "#7c3aed"}>{item.text}</text>)}
      {selectionBox ? <rect x={selectionBox.minX} y={selectionBox.minY} width={selectionBox.maxX - selectionBox.minX} height={selectionBox.maxY - selectionBox.minY} fill={crossing ? "rgba(20,115,230,.10)" : "rgba(20,115,230,.06)"} stroke="#1473e6" strokeWidth={2} strokeDasharray={crossing ? `${margin * 0.08} ${margin * 0.05}` : undefined} vectorEffect="non-scaling-stroke" /> : null}
      {draftStart && current && activeTool === "room" ? <g pointerEvents="none"><polygon points={roomOutline(roomShape, draftStart, current).map((point) => `${point.x},${point.y}`).join(" ")} fill="rgba(20,115,230,.08)" stroke="#1473e6" strokeWidth={2} strokeDasharray="80 40" vectorEffect="non-scaling-stroke" /><text x={(draftStart.x + current.x) / 2} y={Math.min(draftStart.y, current.y) - 100} textAnchor="middle" fontSize={Math.max(120, margin * 0.15)} fill="#1473e6">{displayLength(Math.abs(current.x - draftStart.x), unit)} × {displayLength(Math.abs(current.y - draftStart.y), unit)} {unit}</text></g> : null}
      {draftStart && current && activeTool && activeTool !== "room" && lineTools.has(activeTool) ? <g><line x1={draftStart.x} y1={draftStart.y} x2={current.x} y2={current.y} stroke="#1473e6" strokeWidth={2} strokeDasharray="80 40" vectorEffect="non-scaling-stroke" /><text x={(draftStart.x + current.x) / 2} y={(draftStart.y + current.y) / 2 - 100} textAnchor="middle" fontSize={Math.max(120, margin * 0.15)} fill="#1473e6">{displayLength(Math.hypot(current.x - draftStart.x, current.y - draftStart.y), project.displayUnits ?? "mm")} {project.displayUnits ?? "mm"}</text></g> : null}
      {!selectMode && current ? <g pointerEvents="none"><circle cx={current.x} cy={current.y} r={Math.max(45, margin * 0.035)} fill="white" stroke="#1473e6" strokeWidth={2} vectorEffect="non-scaling-stroke" /><path d={`M ${current.x - 65} ${current.y} H ${current.x + 65} M ${current.x} ${current.y - 65} V ${current.y + 65}`} stroke="#1473e6" strokeWidth={2} vectorEffect="non-scaling-stroke" /><text x={current.x + 100} y={current.y - 80} fontSize={Math.max(100, margin * 0.12)} fill="#1473e6">{current.label}</text></g> : null}
      <MmPerPx.Provider value={mmPerPx}>
      {proposals?.map((item, index) => <ProposalMark key={item.id} proposal={proposalDrag?.id === item.id ? { ...item, x: proposalDrag.x, y: proposalDrag.y } : item} number={index + 1} chosen={chosenProposal === item.id} />)}
      {project.walls.filter((wall) => wall.levelId === levelId && project.objectInstances[wall.id]?.pinned).map((wall) => <LockBadge key={wall.id} wall={wall} />)}
      {pins.map((pin) => {
        const size = 26 * mmPerPx;
        return (
          <g key={pin.id} aria-label={`Pin ${pin.number}`} pointerEvents="none">
            <path d={`M ${pin.x} ${pin.y} l ${-size * 0.45} ${-size * 0.9} a ${size * 0.5} ${size * 0.5} 0 1 1 ${size * 0.9} 0 z`} fill={pin.status === "resolved" ? "#16a34a" : "#e11d48"} stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            <text x={pin.x} y={pin.y - size * 0.95} fontSize={size * 0.5} textAnchor="middle" fill="white" fontWeight={700}>{pin.number.replace(/^PIN-0*/, "")}</text>
          </g>
        );
      })}
      {itemDrag && selectedItemBounds && (itemDrag.dx !== 0 || itemDrag.dy !== 0) ? <rect aria-label="Move preview" x={selectedItemBounds.minX + itemDrag.dx} y={selectedItemBounds.minY + itemDrag.dy} width={selectedItemBounds.maxX - selectedItemBounds.minX} height={selectedItemBounds.maxY - selectedItemBounds.minY} fill="rgba(20,115,230,.12)" stroke="#1473e6" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" pointerEvents="none" /> : null}
      {wallDrag && selectedWall && wallDrag.distance !== 0 ? <WallMovePreview wall={selectedWall} normal={wallDrag.normal} distance={wallDrag.distance} unit={unit} /> : null}
      {/* Editing fields belong to Select. While drawing, they sat where the
          next room or wall was being started and took the touch. */}
      {selectMode && selectedWall && !endDrag && !hold && !wallDrag ? <WallTemporaryDimension wall={selectedWall} margin={margin} selection={selections[0]!} onChange={(selection, length) => onWallLength ? onWallLength(selection, activeEnd, length) : onDimensionChange(selection, { length })} /> : null}
      {selectMode && selectedWall && onWallExtend ? <WallEndControls wall={selectedWall} controls={wallControls(selectedWall)} preview={endDrag ? { end: endDrag.end, point: endDrag.point } : hold ? { end: hold.end, delta: hold.sign * hold.steps * holdStep } : null} unit={unit} /> : null}
      {selectMode && selectedWall && onWallDistance ? <WallChainView project={project} wall={selectedWall} shift={wallDrag ? (Math.abs(wallDrag.normal.x) > Math.abs(wallDrag.normal.y) ? wallDrag.normal.x : wallDrag.normal.y) * wallDrag.distance : 0} editable={!wallDrag && !endDrag && !hold} unit={unit} onDistance={(neighbourId, distance) => onWallDistance(selections[0]!, neighbourId, distance)} /> : null}
      {selectMode && selections.length === 1 && (selectedWall || selections[0]?.kind === "room") || placement ? <LevelChainsView chains={chains} bounds={levelBounds(project, levelId)} unit={unit} /> : null}
      {endDrag ? <g pointerEvents="none"><circle cx={endDrag.point.x} cy={endDrag.point.y} r={9 * mmPerPx} fill="white" stroke="#1473e6" strokeWidth={2} vectorEffect="non-scaling-stroke" /><text x={endDrag.point.x + 14 * mmPerPx} y={endDrag.point.y - 12 * mmPerPx} fontSize={12 * mmPerPx} fill="#1473e6" aria-label="Snap">{endDrag.point.label}</text></g> : null}
      {guide ? <g aria-label="Split preview" pointerEvents="none"><line x1={guide.start.x} y1={guide.start.y} x2={guide.end.x} y2={guide.end.y} stroke="#f59e0b" strokeWidth={4} strokeDasharray="10 6" vectorEffect="non-scaling-stroke" />{guide.label ? <text x={(guide.start.x + guide.end.x) / 2 + 10 * mmPerPx} y={(guide.start.y + guide.end.y) / 2} fontSize={13 * mmPerPx} fontWeight={700} fill="#b45309">{guide.label}</text> : null}</g> : null}
      {placement ? <g aria-label="Room copy" pointerEvents="none"><rect x={placement.x} y={placement.y} width={placement.width} height={placement.depth} fill="rgba(245,158,11,.14)" stroke="#f59e0b" strokeWidth={3} strokeDasharray="10 6" vectorEffect="non-scaling-stroke" /><text x={placement.x + placement.width / 2} y={placement.y + placement.depth / 2} textAnchor="middle" fontSize={13 * mmPerPx} fontWeight={700} fill="#b45309">{shortLength(placement.width, unit)} × {shortLength(placement.depth, unit)}</text></g> : null}
      {selectMode && selectedOpening ? <OpeningTemporaryDimension project={project} opening={openingDrag ? { ...selectedOpening, offset: openingDrag.offset } : selectedOpening} margin={margin} selection={selections[0]!} onChange={onDimensionChange} /> : null}
      {selectMode && selectedColumn ? <ColumnTemporaryDimensions column={selectedColumn} margin={margin} selection={selections[0]!} onChange={onDimensionChange} /> : null}
      </MmPerPx.Provider>
    </svg>
    {actionBar && selectMode && selections.length && !endDrag && !hold && !wallDrag && !itemDrag && !openingDrag && canvasSize ? <FloatingBar bounds={objects.filter((object) => selectedIds.has(object.selection.id)).map((object) => object.bounds)} view={effective} size={canvasSize}>{actionBar}</FloatingBar> : null}
    {current ? <span aria-label="Pointer coordinates" className="pointer-events-none absolute right-2 top-3 z-10 rounded-md border bg-background/90 px-2 py-0.5 font-mono text-[11px] tabular-nums">X {Number(displayLength(current.x, unit).toFixed(unit === "m" ? 2 : unit === "cm" ? 1 : 0))} · Y {Number(displayLength(current.y, unit).toFixed(unit === "m" ? 2 : unit === "cm" ? 1 : 0))} {unit}</span> : null}
    {draftStart && activeTool && (activeTool === "room" || lineTools.has(activeTool)) ? <TypedDraft
      key={`${draftStart.x},${draftStart.y}`}
      room={activeTool === "room"}
      unit={unit}
      live={current ? [Math.abs(current.x - draftStart.x), Math.abs(current.y - draftStart.y), Math.hypot(current.x - draftStart.x, current.y - draftStart.y)] : null}
      direction={typedDirection}
      onDirection={setTypedDirection}
      onCancel={() => (onCancelDraft ?? (() => onDraftStart(null)))()}
      onLength={(length) => {
        const aim = typedDirection ?? (current && Math.hypot(current.x - draftStart.x, current.y - draftStart.y) > 1
          ? { x: (current.x - draftStart.x) / Math.hypot(current.x - draftStart.x, current.y - draftStart.y), y: (current.y - draftStart.y) / Math.hypot(current.x - draftStart.x, current.y - draftStart.y) }
          : DIRECTIONS[0]);
        const end = { x: draftStart.x + aim.x * length, y: draftStart.y + aim.y * length };
        onDraft(draftStart, end);
        onDraftStart(chain && chainTools.has(activeTool) ? end : null);
      }}
      onSize={(width, depth) => {
        const sx = current && current.x < draftStart.x ? -1 : 1;
        const sy = current && current.y < draftStart.y ? -1 : 1;
        onDraft(draftStart, { x: draftStart.x + sx * width, y: draftStart.y + sy * depth });
        onDraftStart(null);
      }}
    /> : null}
    </>
  );
}

/** Exact numbers while drafting: a length for a wall, a size for a room. */
function TypedDraft({ room, unit, live, direction, onDirection, onCancel, onLength, onSize }: {
  room: boolean;
  unit: ReturnType<typeof useHouseUnits>;
  /** Width, depth and length to the pointer, shown until a number is typed —
   * at a size a phone can read, which the drawing's own labels are not. */
  live: [number, number, number] | null;
  direction: { x: number; y: number } | null;
  onDirection: (direction: { x: number; y: number } | null) => void;
  onCancel: () => void;
  onLength: (length: number) => void;
  onSize: (width: number, depth: number) => void;
}) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const a = modelLength(Number(first), unit);
  const b = modelLength(Number(second), unit);
  const ready = first !== "" && Number.isFinite(a) && a > 0 && (!room || second !== "" && Number.isFinite(b) && b > 0);
  const submit = () => { if (!ready) return; if (room) onSize(a, b); else onLength(a); };
  const field = (label: string, value: string, set: (value: string) => void, shown?: number) => (
    <input aria-label={`Typed ${label.toLowerCase()}`} placeholder={shown ? `${displayLength(shown, unit)}` : `${label} ${unit}`} inputMode="decimal" type="number" step="any" min={0} value={value} onChange={(event) => set(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); if (event.key === "Escape") onCancel(); }} className="w-[4.25rem] rounded-md border bg-background px-1.5 py-1.5 text-right text-sm text-foreground" />
  );
  return (
    <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="absolute inset-x-2 top-12 z-10 flex flex-wrap items-center justify-center gap-1 rounded-xl border bg-card/95 p-1 shadow-sm backdrop-blur">
      {room ? <>{field("Width", first, setFirst, live?.[0])}<span className="text-xs text-muted-foreground">×</span>{field("Depth", second, setSecond, live?.[1])}</> : <>
        {field("Length", first, setFirst, live?.[2])}
        <details className="group relative">
          <summary className="cursor-pointer list-none rounded-md border px-2 py-1.5 text-xs text-muted-foreground [&::-webkit-details-marker]:hidden" aria-label="Advanced wall direction">Direction ▾</summary>
          <div className="absolute left-0 top-full z-20 mt-1 flex gap-1 rounded-lg border bg-card p-1 shadow-lg">
            {DIRECTIONS.map((item) => <button key={item.label} type="button" aria-label={`Run ${item.label}`} aria-pressed={direction?.x === item.x && direction?.y === item.y} onClick={() => onDirection(direction?.x === item.x && direction?.y === item.y ? null : { x: item.x, y: item.y })} className="size-9 rounded-md text-base text-muted-foreground aria-pressed:bg-brand/15 aria-pressed:text-brand">{item.label}</button>)}
          </div>
        </details>
      </>}
      <button type="submit" disabled={!ready} className="rounded-md bg-brand px-2.5 py-1.5 text-xs font-medium text-brand-foreground disabled:opacity-40">{room ? "Create" : "Add"}</button>
      <button type="button" onClick={onCancel} aria-label="Cancel drafting" className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted">✕</button>
    </form>
  );
}

/** On the wall itself, a quarter of the way along: clear of the length field
 * and the plan's own label at the middle, and never off the edge of the
 * canvas the way a badge beside an outside wall was on a phone. */
/**
 * Where things are: the origin with its X and Y axes, and the coordinate of
 * each major grid line along the top and left edges of the view — the only
 * things on an empty floor besides the grid.
 */
function Coordinates({ view, unit }: { view: Bounds; unit: ReturnType<typeof useHouseUnits> }) {
  const px = useContext(MmPerPx) || 10;
  const arm = 48 * px;
  const span = Math.max(view.maxX - view.minX, view.maxY - view.minY);
  const step = MAJOR_GRID * Math.max(1, 2 ** Math.ceil(Math.log2(Math.max(1, (span / MAJOR_GRID) / 6))));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = Math.ceil(view.minX / step) * step; x <= view.maxX; x += step) xs.push(x);
  for (let y = Math.ceil(view.minY / step) * step; y <= view.maxY; y += step) ys.push(y);
  const label = (value: number) => `${displayLength(value, unit)}`;
  return <g pointerEvents="none" aria-label="Coordinates">
    <line x1={0} y1={0} x2={arm} y2={0} stroke="#dc2626" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
    <line x1={0} y1={0} x2={0} y2={arm} stroke="#16a34a" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
    <circle cx={0} cy={0} r={3.5 * px} fill="#0f172a" />
    <text x={arm + 4 * px} y={4 * px} fontSize={11 * px} fontWeight={700} fill="#dc2626">X</text>
    <text x={-4 * px} y={arm + 13 * px} fontSize={11 * px} fontWeight={700} fill="#16a34a" textAnchor="end">Y</text>
    <text x={5 * px} y={-6 * px} fontSize={10 * px} fill="#334155">0,0</text>
    {xs.map((x) => <text key={`x${x}`} x={x} y={view.minY + 12 * px} textAnchor="middle" fontSize={10 * px} fill="#475569" aria-label="X coordinate">{label(x)}</text>)}
    {ys.map((y) => <text key={`y${y}`} x={view.minX + 4 * px} y={y + 3.5 * px} fontSize={10 * px} fill="#475569" aria-label="Y coordinate">{label(y)}</text>)}
  </g>;
}

function ProposalMark({ proposal, number, chosen }: { proposal: ColumnProposal; number: number; chosen: boolean }) {
  const px = useContext(MmPerPx) || 10;
  const size = Math.max(proposal.width, 16 * px);
  const colour = chosen ? "#1473e6" : "#d97706";
  return <g pointerEvents="none" aria-label={`Suggested column ${number}`}>
    <rect x={proposal.x - size / 2} y={proposal.y - size / 2} width={size} height={size} fill={chosen ? "rgba(20,115,230,.18)" : "rgba(217,119,6,.14)"} stroke={colour} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
    <circle cx={proposal.x + size / 2} cy={proposal.y - size / 2} r={8 * px} fill={colour} />
    <text x={proposal.x + size / 2} y={proposal.y - size / 2 + 3.5 * px} textAnchor="middle" fontSize={10 * px} fontWeight={700} fill="white">{number}</text>
  </g>;
}

function LockBadge({ wall }: { wall: HouseProject["walls"][number] }) {
  const px = useContext(MmPerPx) || 10;
  const at = { x: wall.start.x + (wall.end.x - wall.start.x) * 0.25, y: wall.start.y + (wall.end.y - wall.start.y) * 0.25 };
  return <g pointerEvents="none"><rect x={at.x - 26 * px} y={at.y - 9 * px} width={52 * px} height={18 * px} rx={9 * px} fill="#0f172a" opacity={0.82} /><text x={at.x} y={at.y + 4 * px} textAnchor="middle" fontSize={11 * px} fontWeight={600} fill="white">Locked</text></g>;
}

function WallMovePreview({ wall, normal, distance, unit }: { wall: HouseProject["walls"][number]; normal: HousePlanPoint; distance: number; unit: ReturnType<typeof useHouseUnits> }) {
  const px = useContext(MmPerPx) || 10;
  const shift = (point: HousePlanPoint) => ({ x: point.x + normal.x * distance, y: point.y + normal.y * distance });
  const a = shift(wall.start);
  const b = shift(wall.end);
  const middle = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  const label = { x: middle.x + normal.x * distance / 2, y: middle.y + normal.y * distance / 2 };
  return <g pointerEvents="none">
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#1473e6" strokeWidth={Math.max(wall.thickness, 4 * px)} strokeOpacity={0.45} strokeDasharray={`${12 * px} ${6 * px}`} />
    <line x1={middle.x} y1={middle.y} x2={shift(middle).x} y2={shift(middle).y} stroke="#1473e6" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    <rect x={label.x - 34 * px} y={label.y - 11 * px} width={68 * px} height={22 * px} rx={6 * px} fill="white" stroke="#1473e6" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    <text x={label.x} y={label.y + 5 * px} textAnchor="middle" fontSize={13 * px} fontWeight={700} fill="#0f172a" aria-label="Wall move distance">{displayLength(Math.abs(distance), unit)}</text>
  </g>;
}

function noop() {}

/**
 * A selected door or window, Revit-style: its width, and how far it sits from
 * each end of its wall — every one of them typeable. The edges are what a
 * builder measures from, so they are what you set, not the centre.
 */
function OpeningTemporaryDimension({ project, opening, margin, selection, onChange }: { project: HouseProject; opening: HouseProject["doors"][number]; margin: number; selection: HouseSelection; onChange: (selection: HouseSelection, patch: Record<string, number>) => void }) {
  const px = useContext(MmPerPx);
  const wall = project.walls.find((item) => item.id === opening.wallId);
  if (!wall) return null;
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  const after = Math.max(0, length - opening.offset - opening.width);
  const normal = { x: -(wall.end.y - wall.start.y) / Math.max(1, length), y: (wall.end.x - wall.start.x) / Math.max(1, length) };
  const away = wall.thickness / 2 + (px ? fieldClearance(normal, px) : Math.max(250, margin * 0.25));
  const shift = (point: HousePlanPoint, by: number) => ({ x: point.x + normal.x * by, y: point.y + normal.y * by });
  const a = pointAlongWall(wall, opening.offset);
  const b = pointAlongWall(wall, opening.offset + opening.width);
  const centre = pointAlongWall(wall, opening.offset + opening.width / 2);
  const run = (from: HousePlanPoint, to: HousePlanPoint) => { const p = shift(from, away); const q = shift(to, away); return <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#1473e6" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />; };
  const mid = (from: HousePlanPoint, to: HousePlanPoint) => shift({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, away);
  const before = mid(wall.start, a);
  const beyond = mid(b, wall.end);
  return <g>
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#1473e6" strokeWidth={Math.max(wall.thickness + 40, 60)} strokeOpacity={0.35} pointerEvents="none" />
    <g pointerEvents="none">{run(wall.start, a)}{run(b, wall.end)}</g>
    <InlineDimensionInput x={centre.x} y={centre.y} margin={margin} label="Width" value={opening.width} onChange={(width) => onChange(selection, { width })} />
    <InlineDimensionInput x={before.x} y={before.y} margin={margin} centred label="Distance from start" value={opening.offset} onChange={(value) => onChange(selection, { offset: value })} />
    <InlineDimensionInput x={beyond.x} y={beyond.y} margin={margin} centred label="Distance to end" value={after} onChange={(value) => onChange(selection, { offset: length - opening.width - value })} />
  </g>;
}

function ColumnTemporaryDimensions({ column, margin, selection, onChange }: { column: HouseProject["structuralColumns"][number]; margin: number; selection: HouseSelection; onChange: (selection: HouseSelection, patch: Record<string, number>) => void }) {
  return <g><InlineDimensionInput x={column.x} y={column.y - column.depth / 2} margin={margin} label="Width" value={column.width} onChange={(width) => onChange(selection, { width })} /><InlineDimensionInput x={column.x + column.width / 2} y={column.y + column.depth / 2} margin={margin} label="Depth" value={column.depth} onChange={(depth) => onChange(selection, { depth })} /></g>;
}

/** A length as typed into a field: to the millimetre, so a point snapped onto a line does not read 4999.999603. */
function fieldLength(mm: number, unit: ReturnType<typeof useHouseUnits>) {
  return Number(displayLength(Math.round(mm), unit).toFixed(unit === "m" ? 3 : unit === "cm" ? 1 : 0));
}

function InlineDimensionInput({ x, y, margin, label, value, onChange, centred = false }: { x: number; y: number; margin: number; label: string; value: number; onChange: (value: number) => void; centred?: boolean }) {
  const unit = useHouseUnits();
  const px = useContext(MmPerPx);
  const fieldWidth = px ? FIELD.width * px : Math.max(700, margin * 0.75);
  const fieldHeight = px ? FIELD.height * px : Math.max(300, margin * 0.3);
  return <foreignObject x={x - fieldWidth / 2} y={centred ? y - fieldHeight / 2 : y - fieldHeight * 1.45} width={fieldWidth} height={fieldHeight}><input key={`${label}-${value}-${unit}`} aria-label={`Selected object temporary ${label.toLowerCase()}`} type="number" step="any" defaultValue={fieldLength(value, unit)} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Enter") { const next = modelLength(Number(event.currentTarget.value), unit); if (Number.isFinite(next) && next > 0) onChange(next); /* A refused edit (a lock, a minimum) must not leave its number showing as if it took; an accepted one re-keys the field anyway. */ event.currentTarget.value = String(fieldLength(value, unit)); event.currentTarget.blur(); } }} style={{ width: "100%", height: "100%", border: "2px solid #1473e6", borderRadius: 8, background: "white", color: "#0f172a", textAlign: "center", fontWeight: 700, fontSize: fieldHeight * 0.45, boxSizing: "border-box", padding: 0, minWidth: 0 }} /></foreignObject>;
}

function ModelPlanGeometry({ project, levelId }: { project: HouseProject; levelId: string }) {
  return <g pointerEvents="none">
    {project.structuralGrid.filter((item) => item.levelId === levelId).map((item) => <line key={item.id} x1={item.start.x} y1={item.start.y} x2={item.end.x} y2={item.end.y} stroke="#64748b" strokeWidth={2} strokeDasharray="90 45" vectorEffect="non-scaling-stroke" />)}
    {project.referencePlanes.filter((item) => item.levelId === levelId).map((item) => <line key={item.id} x1={item.start.x} y1={item.start.y} x2={item.end.x} y2={item.end.y} stroke="#db2777" strokeWidth={2} strokeDasharray="60 35" vectorEffect="non-scaling-stroke" />)}
    {project.structuralBeams.filter((item) => item.levelId === levelId).map((item) => <line key={item.id} x1={item.start.x} y1={item.start.y} x2={item.end.x} y2={item.end.y} stroke="#b7791f" strokeWidth={Math.max(30, item.width)} opacity={0.72} />)}
    {project.railings.filter((item) => item.levelId === levelId).map((item) => <line key={item.id} x1={item.start.x} y1={item.start.y} x2={item.end.x} y2={item.end.y} stroke="#475569" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
    {project.foundations.filter((item) => item.levelId === levelId).map((item) => <rect key={item.id} x={item.x - item.width / 2} y={item.y - item.depth / 2} width={item.width} height={item.depth} fill="rgba(100,116,139,.12)" stroke="#64748b" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
    {project.structuralColumns.filter((item) => item.levelId === levelId).map((item) => <g key={item.id} aria-label="Column" className="text-slate-600 dark:text-slate-300"><ColumnSymbol column={item} /></g>)}
    {project.stairs.filter((item) => item.levelId === levelId).map((item) => <g key={item.id} aria-label={`Stair ${item.type}`} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`} className="text-slate-700 dark:text-slate-200"><StairSymbol geometry={stairGeometry(stairParams(item))} /></g>)}
    {project.components.filter((item) => item.levelId === levelId).map((item) => { const flipped = project.objectInstances[item.id]?.flipped; return <g key={item.id} aria-label={item.name} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})${flipped ? " scale(-1 1)" : ""}`} className="text-slate-700 dark:text-slate-200"><ObjectSymbol definition={definitionOf(item)} width={item.width} depth={item.depth} /></g>; })}
    <OpeningSymbols project={project} levelId={levelId} />
  </g>;
}

/** A column: square or rectangular, turned if it is, or round; filled as cut. */
export function ColumnSymbol({ column }: { column: Pick<HouseProject["structuralColumns"][number], "x" | "y" | "width" | "depth" | "type" | "rotation"> }) {
  if (column.type === "circular") return <circle cx={column.x} cy={column.y} r={column.width / 2} fill="currentColor" fillOpacity={0.55} stroke="currentColor" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />;
  return <g transform={`rotate(${column.rotation ?? 0} ${column.x} ${column.y})`}><rect x={column.x - column.width / 2} y={column.y - column.depth / 2} width={column.width} height={column.depth} fill="currentColor" fillOpacity={0.55} stroke="currentColor" strokeWidth={1.2} vectorEffect="non-scaling-stroke" /><line x1={column.x - column.width / 2} y1={column.y - column.depth / 2} x2={column.x + column.width / 2} y2={column.y + column.depth / 2} stroke="currentColor" strokeWidth={0.8} vectorEffect="non-scaling-stroke" /></g>;
}

/**
 * Doors and windows drawn by type over the holes the plan leaves for them:
 * a door's leaf and swing on the side it opens to, hung on the jamb its
 * swing names; a window's frame and glazing.
 */
function OpeningSymbols({ project, levelId }: { project: HouseProject; levelId: string }) {
  const outline = project.levels.find((level) => level.id === levelId)?.plan?.corners ?? [];
  const cornerIds = new Set(outline.map((corner) => corner.id));
  return <g pointerEvents="none" className="text-slate-800 dark:text-slate-100">
    {[...project.doors, ...project.windows].filter((item) => item.levelId === levelId).map((opening) => {
      const wall = project.walls.find((item) => item.id === opening.wallId);
      if (!wall) return null;
      const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) || 1;
      const u = { x: (wall.end.x - wall.start.x) / length, y: (wall.end.y - wall.start.y) / length };
      const from = { x: wall.start.x + u.x * opening.offset, y: wall.start.y + u.y * opening.offset };
      const to = { x: from.x + u.x * opening.width, y: from.y + u.y * opening.width };
      // "In" is into the house for an outside wall; one side, consistently, for an inside one.
      let inward = { x: -u.y, y: u.x };
      if (wall.sourceWallId && cornerIds.has(wall.sourceWallId)) {
        const mid = { x: (from.x + to.x) / 2 + inward.x * (wall.thickness + 10), y: (from.y + to.y) / 2 + inward.y * (wall.thickness + 10) };
        if (!containsInPolygon(mid, outline)) inward = { x: -inward.x, y: -inward.y };
      }
      if (opening.type === "window") return <WindowSymbol key={opening.id} from={from} to={to} side={inward} style={opening.style} thickness={wall.thickness} />;
      if (opening.type === "passage") return null;
      const out = opening.swing.startsWith("out");
      const side = out ? { x: -inward.x, y: -inward.y } : inward;
      const flipped = Boolean(project.objectInstances[opening.id]?.flipped);
      const hingeAtFrom = opening.swing.endsWith("left") === flipped;
      return <DoorSymbol key={opening.id} from={from} to={to} side={side} hingeAtFrom={hingeAtFrom} style={opening.style} thickness={wall.thickness} />;
    })}
  </g>;
}

function containsInPolygon(point: HousePlanPoint, polygon: readonly HousePlanPoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index]!;
    const b = polygon[previous]!;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function WallTemporaryDimension({ wall, margin, selection, onChange }: { wall: HouseProject["walls"][number]; margin: number; selection: HouseSelection; onChange: (selection: HouseSelection, length: number) => void }) {
  const px = useContext(MmPerPx);
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  // Off the wall's face, not "above" on screen: above a vertical wall is on
  // the wall, where the field took the touches meant for dragging it.
  const normal = { x: -(wall.end.y - wall.start.y) / Math.max(1, length), y: (wall.end.x - wall.start.x) / Math.max(1, length) };
  const away = wall.thickness / 2 + (px ? fieldClearance(normal, px) : Math.max(300, margin * 0.3));
  const at = { x: (wall.start.x + wall.end.x) / 2 + normal.x * away, y: (wall.start.y + wall.end.y) / 2 + normal.y * away };
  return <g><line x1={wall.start.x} y1={wall.start.y} x2={wall.end.x} y2={wall.end.y} stroke="#1473e6" strokeWidth={2} vectorEffect="non-scaling-stroke" /><InlineDimensionInput x={at.x} y={at.y} margin={margin} centred label="Length" value={length} onChange={(value) => { if (value >= 200) onChange(selection, value); }} /></g>;
}

/**
 * The real line a wall, beam, grid line, railing or reference plane was
 * drawn along — not the axis-aligned box around it, which is what made a
 * selected wall look like a slab rather than a highlighted line. `null` for
 * every other kind, which keeps its bounding-box highlight: a room, a door,
 * a column are areas or points, and a box is the right outline for those.
 */
function lineGeometry(project: HouseProject, levelId: string, selection: HouseSelection): { start: HousePlanPoint; end: HousePlanPoint; thickness: number } | null {
  if (selection.kind === "wall") { const item = project.walls.find((wall) => wall.id === selection.id && wall.levelId === levelId); return item ? { start: item.start, end: item.end, thickness: item.thickness } : null; }
  if (selection.kind === "beam") { const item = project.structuralBeams.find((beam) => beam.id === selection.id && beam.levelId === levelId); return item ? { start: item.start, end: item.end, thickness: item.width } : null; }
  if (selection.kind === "railing") { const item = project.railings.find((railing) => railing.id === selection.id && railing.levelId === levelId); return item ? { start: item.start, end: item.end, thickness: 30 } : null; }
  if (selection.kind === "grid") { const item = project.structuralGrid.find((grid) => grid.id === selection.id && grid.levelId === levelId); return item ? { start: item.start, end: item.end, thickness: 20 } : null; }
  if (selection.kind === "reference-plane") { const item = project.referencePlanes.find((plane) => plane.id === selection.id && plane.levelId === levelId); return item ? { start: item.start, end: item.end, thickness: 20 } : null; }
  return null;
}

// What a tap means when several things are under the finger. Area alone let a
// structural grid line — 40 mm wide, drawn exactly on the wall — beat the
// wall a person was actually pointing at.
const PICK_TIER: Partial<Record<HouseSelection["kind"], number>> = {
  door: 0, window: 0, column: 0, component: 0, stair: 0, annotation: 0,
  wall: 1, railing: 1,
  beam: 2, foundation: 2,
  grid: 3, "reference-plane": 3,
  room: 4, slab: 4, ceiling: 4, roof: 4,
};

export function pickHouseObject(objects: readonly { selection: HouseSelection; bounds: Bounds }[], point: HousePlanPoint): HouseSelection | null {
  const tier = (kind: HouseSelection["kind"]) => PICK_TIER[kind] ?? 2;
  const hits = objects
    .filter((object) => containsPoint(expand(object.bounds, 80), point))
    .sort((a, b) => tier(a.selection.kind) - tier(b.selection.kind) || area(a.bounds) - area(b.bounds));
  return hits[0]?.selection ?? null;
}

export function selectableBounds(project: HouseProject, levelId: string): { selection: HouseSelection; bounds: Bounds }[] {
  const result: { selection: HouseSelection; bounds: Bounds }[] = [];
  for (const wall of project.walls.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "wall", id: wall.id }, bounds: expand(pointsBounds([wall.start, wall.end]), wall.thickness / 2) });
  for (const room of project.rooms.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "room", id: room.id }, bounds: pointsBounds(room.boundary) });
  for (const slab of project.slabs.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "slab", id: slab.id }, bounds: pointsBounds(slab.boundary) });
  for (const roof of project.roofs.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "roof", id: roof.id }, bounds: pointsBounds(roof.boundary) });
  for (const ceiling of project.ceilings.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "ceiling", id: ceiling.id }, bounds: pointsBounds(ceiling.boundary) });
  for (const opening of [...project.doors, ...project.windows].filter((item) => item.levelId === levelId)) { const wall = project.walls.find((item) => item.id === opening.wallId); if (!wall) continue; const point = pointAlongWall(wall, opening.offset + opening.width / 2); result.push({ selection: { kind: opening.type === "window" ? "window" : "door", id: opening.id }, bounds: centred(point.x, point.y, Math.max(opening.width, 180), Math.max(opening.width, 180)) }); }
  for (const column of project.structuralColumns.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "column", id: column.id }, bounds: centred(column.x, column.y, column.width, column.depth) });
  for (const foundation of project.foundations.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "foundation", id: foundation.id }, bounds: centred(foundation.x, foundation.y, foundation.width, foundation.depth) });
  for (const stair of project.stairs.filter((item) => item.levelId === levelId)) {
    const turned = Math.abs(Math.round(stair.rotation / 90)) % 2 === 1;
    result.push({ selection: { kind: "stair", id: stair.id }, bounds: centred(stair.x, stair.y, turned ? stair.length : stair.width, turned ? stair.width : stair.length) });
  }
  for (const component of project.components.filter((item) => item.levelId === levelId)) {
    // Turned a quarter, a piece of furniture is as deep as it was wide.
    const turned = Math.abs(Math.round(component.rotation / 90)) % 2 === 1;
    result.push({ selection: { kind: "component", id: component.id }, bounds: centred(component.x, component.y, turned ? component.depth : component.width, turned ? component.width : component.depth) });
  }
  for (const beam of project.structuralBeams.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "beam", id: beam.id }, bounds: expand(pointsBounds([beam.start, beam.end]), beam.width / 2) });
  for (const grid of project.structuralGrid.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "grid", id: grid.id }, bounds: expand(pointsBounds([grid.start, grid.end]), 20) });
  for (const railing of project.railings.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "railing", id: railing.id }, bounds: expand(pointsBounds([railing.start, railing.end]), 40) });
  for (const plane of project.referencePlanes.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "reference-plane", id: plane.id }, bounds: expand(pointsBounds([plane.start, plane.end]), 20) });
  for (const annotation of project.annotations.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "annotation", id: annotation.id }, bounds: expand(pointsBounds(annotation.end ? [annotation.start, annotation.end] : [annotation.start]), 80) });
  return result;
}

function snapCandidates(project: HouseProject, levelId: string): SnapPoint[] {
  const result: SnapPoint[] = [];
  const lines = [...project.walls.filter((item) => item.levelId === levelId), ...project.structuralBeams.filter((item) => item.levelId === levelId), ...project.railings.filter((item) => item.levelId === levelId), ...project.referencePlanes.filter((item) => item.levelId === levelId)];
  for (const line of lines) { result.push({ ...line.start, label: "Endpoint" }, { ...line.end, label: "Endpoint" }, { x: (line.start.x + line.end.x) / 2, y: (line.start.y + line.end.y) / 2, label: "Midpoint" }); }
  for (const column of project.structuralColumns.filter((item) => item.levelId === levelId)) result.push({ x: column.x, y: column.y, label: "Column Center" });
  for (const room of project.rooms.filter((item) => item.levelId === levelId)) for (const point of room.boundary) result.push({ ...point, label: "Room corner" });
  for (let a = 0; a < lines.length; a += 1) for (let b = a + 1; b < lines.length; b += 1) { const point = lineIntersection(lines[a]!.start, lines[a]!.end, lines[b]!.start, lines[b]!.end); if (point) result.push({ ...point, label: "Intersection" }); }
  return result;
}

function levelBounds(project: HouseProject, levelId: string): Bounds {
  const plan = project.levels.find((item) => item.id === levelId)?.plan;
  if (!plan?.corners.length) return { minX: -1440, minY: -1440, maxX: 9440, maxY: 7440 };
  const points = [
    ...plan.corners,
    ...(plan.interiorWalls ?? []).flatMap((item) => [item.start, item.end]),
    ...(plan.zones ?? []).flatMap((item) => item.boundary),
    ...(plan.dimensions ?? []).flatMap((item) => [item.start, item.end]),
    ...(plan.planColumns ?? []).flatMap((item) => [{ x: item.x - item.width / 2, y: item.y - item.depth / 2 }, { x: item.x + item.width / 2, y: item.y + item.depth / 2 }]),
    ...(plan.planStairs ?? []).flatMap((item) => [{ x: item.x - item.width / 2, y: item.y - item.length / 2 }, { x: item.x + item.width / 2, y: item.y + item.length / 2 }]),
    ...(plan.planPlatforms ?? []).flatMap((item) => [{ x: item.x - item.width / 2, y: item.y - item.depth / 2 }, { x: item.x + item.width / 2, y: item.y + item.depth / 2 }]),
  ];
  const xs = points.map((item) => item.x);
  const ys = points.map((item) => item.y);
  const pad = Math.max(...xs, ...ys, 1000) * 0.18;
  return { minX: Math.min(...xs) - pad, minY: Math.min(...ys) - pad, maxX: Math.max(...xs) + pad, maxY: Math.max(...ys) + pad };
}
function alongWall(wall: HouseProject["walls"][number], point: HousePlanPoint) { const dx = wall.end.x - wall.start.x; const dy = wall.end.y - wall.start.y; return ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / Math.max(1, Math.hypot(dx, dy)); }
function pointAlongWall(wall: HouseProject["walls"][number], offset: number) { const length = Math.max(1, Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)); return { x: wall.start.x + (wall.end.x - wall.start.x) * offset / length, y: wall.start.y + (wall.end.y - wall.start.y) * offset / length }; }
function closestPointOnSegment(point: HousePlanPoint, start: HousePlanPoint, end: HousePlanPoint) { const dx = end.x - start.x; const dy = end.y - start.y; const lengthSquared = dx * dx + dy * dy; if (!lengthSquared) return start; const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)); return { x: start.x + dx * t, y: start.y + dy * t }; }
function lineIntersection(a: HousePlanPoint, b: HousePlanPoint, c: HousePlanPoint, d: HousePlanPoint): HousePlanPoint | null { const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x); if (Math.abs(denominator) < 0.001) return null; const x = ((a.x * b.y - a.y * b.x) * (c.x - d.x) - (a.x - b.x) * (c.x * d.y - c.y * d.x)) / denominator; const y = ((a.x * b.y - a.y * b.x) * (c.y - d.y) - (a.y - b.y) * (c.x * d.y - c.y * d.x)) / denominator; return { x, y }; }
function toolName(tool: HouseCommandId) { return tool.split("-").map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" "); }
function pointsBounds(points: HousePlanPoint[]): Bounds { const xs = points.map((item) => item.x); const ys = points.map((item) => item.y); return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }; }
function centred(x: number, y: number, width: number, depth: number): Bounds { return { minX: x - width / 2, minY: y - depth / 2, maxX: x + width / 2, maxY: y + depth / 2 }; }
function expand(bounds: Bounds, amount: number): Bounds { return { minX: bounds.minX - amount, minY: bounds.minY - amount, maxX: bounds.maxX + amount, maxY: bounds.maxY + amount }; }
function clamp(value: number, min: number, max: number): number { return Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max)); }
function normalized(a: HousePlanPoint, b: HousePlanPoint): Bounds { return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) }; }
function contains(a: Bounds, b: Bounds) { return b.minX >= a.minX && b.maxX <= a.maxX && b.minY >= a.minY && b.maxY <= a.maxY; }
function intersects(a: Bounds, b: Bounds) { return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY; }
function containsPoint(bounds: Bounds, point: HousePlanPoint) { return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY; }
function area(bounds: Bounds) { return Math.max(1, bounds.maxX - bounds.minX) * Math.max(1, bounds.maxY - bounds.minY); }

/** Lengths on the drawing, short: 3.20 (m), 320 (cm), 3200 (mm). */
function shortLength(mm: number, unit: ReturnType<typeof useHouseUnits>) {
  if (unit === "m") return (mm / 1000).toFixed(2);
  if (unit === "cm") return String(Math.round(mm / 10));
  return String(Math.round(mm));
}

/** A selected wall's end handles and its small + / −, with the live length while changing. */
function WallEndControls({ wall, controls, preview, unit }: { wall: HouseProject["walls"][number]; controls: { end: WallEnd; kind: "handle" | "plus" | "minus"; at: HousePlanPoint }[]; preview: { end: WallEnd; point: HousePlanPoint } | { end: WallEnd; delta: number } | null; unit: ReturnType<typeof useHouseUnits> }) {
  const px = useContext(MmPerPx);
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  let start: HousePlanPoint = wall.start;
  let end: HousePlanPoint = wall.end;
  if (preview && "point" in preview) {
    if (preview.end === "end") end = preview.point; else start = preview.point;
  } else if (preview) {
    const ux = (wall.end.x - wall.start.x) / Math.max(1, length);
    const uy = (wall.end.y - wall.start.y) / Math.max(1, length);
    if (preview.end === "end") end = { x: wall.end.x + ux * preview.delta, y: wall.end.y + uy * preview.delta };
    else start = { x: wall.start.x - ux * preview.delta, y: wall.start.y - uy * preview.delta };
  }
  const live = Math.hypot(end.x - start.x, end.y - start.y);
  return (
    <g aria-label="Wall ends">
      {preview ? <g pointerEvents="none"><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#f59e0b" strokeWidth={4} vectorEffect="non-scaling-stroke" /><text aria-label="Live length" x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 14 * px} textAnchor="middle" fontSize={15 * px} fontWeight={700} fill="#b45309" paintOrder="stroke" stroke="white" strokeWidth={4 * px}>{shortLength(live, unit)} {unit}</text></g> : null}
      {controls.map((control) => control.kind === "handle"
        ? <circle key={`${control.end}-handle`} aria-label={`Wall ${control.end} handle`} cx={control.at.x} cy={control.at.y} r={8 * px} fill="white" stroke="#1473e6" strokeWidth={3} vectorEffect="non-scaling-stroke" />
        : <g key={`${control.end}-${control.kind}`} aria-label={`${control.kind === "plus" ? "Lengthen" : "Shorten"} from ${control.end}`}><circle cx={control.at.x} cy={control.at.y} r={11 * px} fill={control.kind === "plus" ? "#1473e6" : "white"} stroke="#1473e6" strokeWidth={2} vectorEffect="non-scaling-stroke" /><text x={control.at.x} y={control.at.y + 5 * px} textAnchor="middle" fontSize={16 * px} fontWeight={700} fill={control.kind === "plus" ? "white" : "#1473e6"}>{control.kind === "plus" ? "+" : "−"}</text></g>)}
    </g>
  );
}

/**
 * The selected wall measured against its neighbours: the spaces either side
 * of it along a line across it, and the whole run. The two next to it can be
 * typed — the wall moves, the neighbour stays.
 */
function WallChainView({ project, wall, shift, editable, unit, onDistance }: { project: HouseProject; wall: HouseProject["walls"][number]; shift: number; editable: boolean; unit: ReturnType<typeof useHouseUnits>; onDistance: (neighbourId: string, distance: number) => void }) {
  const px = useContext(MmPerPx);
  const chain = wallChain(project, wall.id, 0.25, shift);
  if (!chain || chain.positions.length < 2) return null;
  const index = chain.positions.findIndex((item) => item.wallId === wall.id);
  const point = (at: number, offset = 0) => (chain.axis === "x" ? { x: at, y: chain.across + offset } : { x: chain.across + offset, y: at });
  const tick = 7 * px;
  const first = chain.positions[0]!.at;
  const last = chain.positions.at(-1)!.at;
  const a = point(first);
  const b = point(last);
  return (
    <g aria-label="Distances">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0f766e" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      {chain.positions.map((item) => { const p = point(item.at); return <line key={item.wallId} x1={p.x - (chain.axis === "x" ? 0 : tick)} y1={p.y - (chain.axis === "x" ? tick : 0)} x2={p.x + (chain.axis === "x" ? 0 : tick)} y2={p.y + (chain.axis === "x" ? tick : 0)} stroke="#0f766e" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />; })}
      {chain.positions.slice(1).map((item, offset) => {
        const previous = chain.positions[offset]!;
        const gap = item.at - previous.at;
        // Beside the line, not across it: centred on it, a field covered the
        // wall next to the one selected, and a tap meant for that wall typed.
        const beside = editable && (offset === index - 1 || offset === index);
        // Two fields either side of a wall in a narrow gap would sit on each
        // other: the second steps out.
        const crowded = offset === index && index > 0 && Math.min(gap, chain.positions[index]!.at - chain.positions[index - 1]!.at) < 56 * px;
        const middle = point((item.at + previous.at) / 2, (chain.axis === "x" ? -18 : 28) * px + (crowded ? (chain.axis === "x" ? -32 : 52) * px : 0));
        const neighbour = offset === index - 1 ? previous.wallId : item.wallId;
        return beside
          ? <DistanceField key={`${previous.wallId}-${item.wallId}`} at={middle} value={gap} label={offset === index - 1 ? "Distance before" : "Distance after"} onChange={(value) => onDistance(neighbour, value)} />
          : <text key={`${previous.wallId}-${item.wallId}`} aria-label="Distance" x={middle.x} y={middle.y} textAnchor="middle" fontSize={13 * px} fontWeight={700} fill="#0f766e" paintOrder="stroke" stroke="white" strokeWidth={4 * px} pointerEvents="none">{shortLength(gap, unit)}</text>;
      })}
      {chain.positions.length > 2 ? (() => { const p = point((first + last) / 2, chain.axis === "x" ? 18 * px : -8 * px); return <text aria-label="Overall" x={p.x} y={p.y} textAnchor={chain.axis === "x" ? "middle" : "end"} fontSize={11 * px} fill="#0f766e" paintOrder="stroke" stroke="white" strokeWidth={4 * px} pointerEvents="none">Overall {shortLength(last - first, unit)}</text>; })() : null}
    </g>
  );
}

/** A distance shown as a number that can be typed over. */
function DistanceField({ at, value, label, onChange }: { at: HousePlanPoint; value: number; label: string; onChange: (value: number) => void }) {
  const unit = useHouseUnits();
  const px = useContext(MmPerPx);
  const width = 48 * px;
  const height = 28 * px;
  const shown = fieldLength(value, unit);
  return <foreignObject x={at.x - width / 2} y={at.y - height / 2} width={width} height={height}><input key={`${label}-${shown}`} aria-label={label} type="number" step="any" inputMode="decimal" defaultValue={shown} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Enter") { const next = modelLength(Number(event.currentTarget.value), unit); if (Number.isFinite(next) && next > 0) onChange(next); event.currentTarget.value = String(shown); event.currentTarget.blur(); } }} style={{ width: "100%", height: "100%", border: "2px solid #0f766e", borderRadius: 6, background: "white", color: "#0f766e", textAlign: "center", fontWeight: 700, fontSize: height * 0.5, boxSizing: "border-box", padding: 0, minWidth: 0 }} /></foreignObject>;
}

/** The floor's X chain along the top and Y chain down the left, while something is being edited. */
function LevelChainsView({ chains, bounds, unit }: { chains: { xs: number[]; ys: number[] }; bounds: Bounds; unit: ReturnType<typeof useHouseUnits> }) {
  const px = useContext(MmPerPx);
  if (chains.xs.length < 2 && chains.ys.length < 2) return null;
  const top = (chains.ys[0] ?? bounds.minY) - 34 * px;
  const left = (chains.xs[0] ?? bounds.minX) - 34 * px;
  const stroke = { stroke: "#64748b", strokeWidth: 1.2, vectorEffect: "non-scaling-stroke" as const };
  const label = { fontSize: 11 * px, fontWeight: 600, fill: "#334155", paintOrder: "stroke" as const, stroke: "white", strokeWidth: 3 * px };
  return (
    <g aria-label="Dimension chains" pointerEvents="none">
      {chains.xs.length > 1 ? <g aria-label="X chain">
        <line x1={chains.xs[0]} y1={top} x2={chains.xs.at(-1)} y2={top} {...stroke} />
        {chains.xs.map((x) => <line key={x} x1={x} y1={top - 5 * px} x2={x} y2={top + 5 * px} {...stroke} />)}
        {chains.xs.slice(1).map((x, index) => <text key={x} x={(x + chains.xs[index]!) / 2} y={top - 6 * px} textAnchor="middle" {...label}>{shortLength(x - chains.xs[index]!, unit)}</text>)}
      </g> : null}
      {chains.ys.length > 1 ? <g aria-label="Y chain">
        <line x1={left} y1={chains.ys[0]} x2={left} y2={chains.ys.at(-1)} {...stroke} />
        {chains.ys.map((y) => <line key={y} x1={left - 5 * px} y1={y} x2={left + 5 * px} y2={y} {...stroke} />)}
        {chains.ys.slice(1).map((y, index) => { const middle = (y + chains.ys[index]!) / 2; return <text key={y} x={left - 6 * px} y={middle} textAnchor="middle" transform={`rotate(-90 ${left - 6 * px} ${middle})`} {...label}>{shortLength(y - chains.ys[index]!, unit)}</text>; })}
      </g> : null}
    </g>
  );
}

/** The selection's actions, small, beside it: above it, or below when it is near the top. */
function FloatingBar({ bounds, view, size, children }: { bounds: Bounds[]; view: Bounds; size: { width: number; height: number }; children: React.ReactNode }) {
  if (!bounds.length) return null;
  const scale = Math.min(size.width / (view.maxX - view.minX), size.height / (view.maxY - view.minY));
  const offsetX = (size.width - (view.maxX - view.minX) * scale) / 2;
  const offsetY = (size.height - (view.maxY - view.minY) * scale) / 2;
  const box = { minX: Math.min(...bounds.map((item) => item.minX)), maxX: Math.max(...bounds.map((item) => item.maxX)), minY: Math.min(...bounds.map((item) => item.minY)), maxY: Math.max(...bounds.map((item) => item.maxY)) };
  const left = offsetX + ((box.minX + box.maxX) / 2 - view.minX) * scale;
  const above = offsetY + (box.minY - view.minY) * scale;
  const below = offsetY + (box.maxY - view.minY) * scale;
  // Clear of the + / − and the dimensions drawn next to the selection. A tall
  // selection — a wall running up the plan — has no room above or below, so
  // the bar sits three quarters of the way down it, away from both its ends,
  // its length field and its dimensions.
  const tall = below - above > size.height * 0.5;
  // Between the length field at its middle and the − near its lower end.
  const top = tall ? ((above + below) / 2 + 18 + below - 58) / 2 - 22 : above > size.height * 0.45 ? above - 104 : below + 56;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-1.5" style={{ top: Math.min(Math.max(top, 44), size.height - 56) }}>
      <div className="pointer-events-auto max-w-full" style={{ transform: `translateX(${Math.max(-size.width / 2 + 120, Math.min(size.width / 2 - 120, left - size.width / 2))}px)` }}>{children}</div>
    </div>
  );
}
