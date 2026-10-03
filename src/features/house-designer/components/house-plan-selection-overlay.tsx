"use client";

import { useId, useMemo, useRef, useState } from "react";

import { PlanCanvas } from "@/features/berchuma-studio/components/plan/plan-canvas";

import { useHouseUnits } from "./house-units";
import { displayLength, modelLength } from "../services/workspace-options";
import type { HouseCommandId } from "../services/command-registry";
import { roomOutline, type HouseRoomShape } from "../services/model-commands";
import type { HouseProject, HouseSelection } from "../types/project";

export type HousePlanPoint = { x: number; y: number };
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type SnapPoint = HousePlanPoint & { label: string };

const lineTools = new Set<HouseCommandId>(["room", "wall", "structural-wall", "room-separator", "beam", "railing", "grid", "reference-plane", "dimension", "section", "elevation", "strip-footing"]);
const pointTools = new Set<HouseCommandId>(["door", "window", "column", "floor", "structural-slab", "ceiling", "roof", "stair", "opening", "component", "furniture", "kitchen", "wardrobe", "plumbing-fixture", "foundation", "isolated-footing", "foundation-slab", "level", "text", "room-tag", "tag", "move"]);

// Grid-snap lands on the same points the background grid draws, so "snap to
// grid" and "the visible grid" are the same thing rather than two grids that
// happen to coexist.
const MINOR_GRID = 1000;
const MAJOR_GRID = MINOR_GRID * 5;
const chainTools = new Set<HouseCommandId>(["wall", "structural-wall", "room-separator"]);
const DIRECTIONS = [{ label: "→", x: 1, y: 0 }, { label: "↓", x: 0, y: 1 }, { label: "←", x: -1, y: 0 }, { label: "↑", x: 0, y: -1 }] as const;

export function HousePlanSelectionOverlay({ project, levelId, activeTool, selections, draftStart, snapEnabled, chain, viewRevision, roomShape = "rectangle", onDraftStart, onDraft, onSelect, onDimensionChange, onGuidance, onSelectionMenu }: {
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
  onDraftStart: (point: HousePlanPoint | null) => void;
  onDraft: (start: HousePlanPoint, end: HousePlanPoint) => void;
  onSelect: (items: HouseSelection[], mode: "replace" | "add" | "remove") => void;
  onDimensionChange: (selection: HouseSelection, patch: Record<string, number>) => void;
  onGuidance: (message: string) => void;
  onSelectionMenu: (point: { x: number; y: number } | null) => void;
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
  const effective = view ?? bounds;

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
    setView((current) => pinchView(current ?? bounds, prev, next, rect));
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
    setView((current) => wheelView(current ?? bounds, { ctrlKey, deltaX, deltaY, clientX, clientY }, rect));
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

  function snapped(raw: HousePlanPoint): SnapPoint {
    if (!snapEnabled) return { ...raw, label: "Nearest" };
    let best: SnapPoint = { x: Math.round(raw.x / MINOR_GRID) * MINOR_GRID, y: Math.round(raw.y / MINOR_GRID) * MINOR_GRID, label: "Grid" };
    let distance = Math.hypot(best.x - raw.x, best.y - raw.y);
    for (const candidate of candidates) {
      const next = Math.hypot(candidate.x - raw.x, candidate.y - raw.y);
      if (next < distance && next <= 140) { best = candidate; distance = next; }
    }
    for (const wall of project.walls.filter((item) => item.levelId === levelId)) {
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
    if (draftStart) {
      const perpendicular: SnapPoint[] = [{ x: raw.x, y: draftStart.y, label: "Perpendicular" }, { x: draftStart.x, y: raw.y, label: "Perpendicular" }];
      for (const candidate of perpendicular) { const next = Math.hypot(candidate.x - raw.x, candidate.y - raw.y); if (next < distance && next <= 140) { best = candidate; distance = next; } }
    }
    return best;
  }

  function pointerDown(event: React.PointerEvent<SVGSVGElement>) {
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
    const point = snapped(raw);
    setCurrent(point);
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

  function pointerUp(event: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
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
  const selectedColumn = selections.length === 1 && selections[0]?.kind === "column" ? project.structuralColumns.find((item) => item.id === selections[0]?.id) : null;

  const plan = project.levels.find((level) => level.id === levelId)?.plan;
  return (
    <>
    {/* The verified plan underneath, in the same frame, so it pans and zooms
        with the model rather than staying put behind it. */}
    {plan ? <div className="pointer-events-none absolute inset-0"><PlanCanvas room={plan} onChange={noop} formatLength={(value) => displayLength(value, project.displayUnits ?? "mm")} viewBox={{ x: effective.minX, y: effective.minY, width: effective.maxX - effective.minX, height: effective.maxY - effective.minY }} /></div> : null}
    <svg ref={svg} tabIndex={0} aria-label="House plan modeling canvas" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 size-full touch-none outline-none" style={{ cursor: selectMode ? "default" : "crosshair" }} onPointerDown={pointerDown} onPointerMove={(event) => { if (longPress.current && Math.hypot(event.clientX - longPress.current.x, event.clientY - longPress.current.y) > 10) cancelLongPress(); if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointers.current.size >= 2) { applyPinch(); return; } const raw = modelPoint(event); if (raw) setCurrent(snapped(raw)); }} onPointerUp={pointerUp} onTouchEnd={(event) => { if (swallowRelease.current) { swallowRelease.current = false; event.preventDefault(); } }} onPointerCancel={(event) => { pointers.current.delete(event.pointerId); cancelLongPress(); setDragStart(null); }} onWheel={wheel}>
      <defs>
        <pattern id={`${gridId}-minor`} width={MINOR_GRID} height={MINOR_GRID} patternUnits="userSpaceOnUse">
          <path d={`M ${MINOR_GRID} 0 L 0 0 0 ${MINOR_GRID}`} fill="none" strokeWidth={6} className="stroke-slate-300 dark:stroke-[#eef2f7]" />
        </pattern>
        <pattern id={`${gridId}-major`} width={MAJOR_GRID} height={MAJOR_GRID} patternUnits="userSpaceOnUse">
          <rect width={MAJOR_GRID} height={MAJOR_GRID} fill={`url(#${gridId}-minor)`} />
          <path d={`M ${MAJOR_GRID} 0 L 0 0 0 ${MAJOR_GRID}`} fill="none" strokeWidth={10} className="stroke-slate-400 dark:stroke-[#dbe3ec]" />
        </pattern>
      </defs>
      <rect x={gridBounds.minX} y={gridBounds.minY} width={gridBounds.maxX - gridBounds.minX} height={gridBounds.maxY - gridBounds.minY} fill={`url(#${gridId}-major)`} pointerEvents="none" />
      <ModelPlanGeometry project={project} levelId={levelId} />
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
      {selectedWall ? <WallTemporaryDimension wall={selectedWall} margin={margin} selection={selections[0]!} onChange={(selection, length) => onDimensionChange(selection, { length })} /> : null}
      {selectedOpening ? <OpeningTemporaryDimension project={project} opening={selectedOpening} margin={margin} selection={selections[0]!} onChange={onDimensionChange} /> : null}
      {selectedColumn ? <ColumnTemporaryDimensions column={selectedColumn} margin={margin} selection={selections[0]!} onChange={onDimensionChange} /> : null}
    </svg>
    {draftStart && activeTool && (activeTool === "room" || lineTools.has(activeTool)) ? <TypedDraft
      key={`${draftStart.x},${draftStart.y}`}
      room={activeTool === "room"}
      unit={unit}
      live={current ? [Math.abs(current.x - draftStart.x), Math.abs(current.y - draftStart.y), Math.hypot(current.x - draftStart.x, current.y - draftStart.y)] : null}
      direction={typedDirection}
      onDirection={setTypedDirection}
      onCancel={() => onDraftStart(null)}
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
        <span className="flex">{DIRECTIONS.map((item) => <button key={item.label} type="button" aria-label={`Run ${item.label}`} aria-pressed={direction?.x === item.x && direction?.y === item.y} onClick={() => onDirection(direction?.x === item.x && direction?.y === item.y ? null : { x: item.x, y: item.y })} className="size-7 rounded-md text-sm text-muted-foreground aria-pressed:bg-brand/15 aria-pressed:text-brand">{item.label}</button>)}</span>
      </>}
      <button type="submit" disabled={!ready} className="rounded-md bg-brand px-2.5 py-1.5 text-xs font-medium text-brand-foreground disabled:opacity-40">{room ? "Create" : "Add"}</button>
      <button type="button" onClick={onCancel} aria-label="Cancel drafting" className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted">✕</button>
    </form>
  );
}

function noop() {}

function OpeningTemporaryDimension({ project, opening, margin, selection, onChange }: { project: HouseProject; opening: HouseProject["doors"][number]; margin: number; selection: HouseSelection; onChange: (selection: HouseSelection, patch: Record<string, number>) => void }) {
  const wall = project.walls.find((item) => item.id === opening.wallId);
  if (!wall) return null;
  const point = pointAlongWall(wall, opening.offset + opening.width / 2);
  return <InlineDimensionInput x={point.x} y={point.y} margin={margin} label="Width" value={opening.width} onChange={(width) => onChange(selection, { width })} />;
}

function ColumnTemporaryDimensions({ column, margin, selection, onChange }: { column: HouseProject["structuralColumns"][number]; margin: number; selection: HouseSelection; onChange: (selection: HouseSelection, patch: Record<string, number>) => void }) {
  return <g><InlineDimensionInput x={column.x} y={column.y - column.depth / 2} margin={margin} label="Width" value={column.width} onChange={(width) => onChange(selection, { width })} /><InlineDimensionInput x={column.x + column.width / 2} y={column.y + column.depth / 2} margin={margin} label="Depth" value={column.depth} onChange={(depth) => onChange(selection, { depth })} /></g>;
}

function InlineDimensionInput({ x, y, margin, label, value, onChange }: { x: number; y: number; margin: number; label: string; value: number; onChange: (value: number) => void }) {
  const unit = useHouseUnits();
  const fieldWidth = Math.max(700, margin * 0.75);
  const fieldHeight = Math.max(300, margin * 0.3);
  return <foreignObject x={x - fieldWidth / 2} y={y - fieldHeight * 1.45} width={fieldWidth} height={fieldHeight}><input key={`${label}-${value}-${unit}`} aria-label={`Selected object temporary ${label.toLowerCase()}`} type="number" step="any" defaultValue={displayLength(value, unit)} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Enter") { const next = modelLength(Number(event.currentTarget.value), unit); if (Number.isFinite(next) && next > 0) onChange(next); event.currentTarget.blur(); } }} style={{ width: "100%", height: "100%", border: "2px solid #1473e6", borderRadius: 8, background: "white", color: "#0f172a", textAlign: "center", fontWeight: 700, fontSize: fieldHeight * 0.45 }} /></foreignObject>;
}

function ModelPlanGeometry({ project, levelId }: { project: HouseProject; levelId: string }) {
  return <g pointerEvents="none">
    {project.structuralGrid.filter((item) => item.levelId === levelId).map((item) => <line key={item.id} x1={item.start.x} y1={item.start.y} x2={item.end.x} y2={item.end.y} stroke="#64748b" strokeWidth={2} strokeDasharray="90 45" vectorEffect="non-scaling-stroke" />)}
    {project.referencePlanes.filter((item) => item.levelId === levelId).map((item) => <line key={item.id} x1={item.start.x} y1={item.start.y} x2={item.end.x} y2={item.end.y} stroke="#db2777" strokeWidth={2} strokeDasharray="60 35" vectorEffect="non-scaling-stroke" />)}
    {project.structuralBeams.filter((item) => item.levelId === levelId).map((item) => <line key={item.id} x1={item.start.x} y1={item.start.y} x2={item.end.x} y2={item.end.y} stroke="#b7791f" strokeWidth={Math.max(30, item.width)} opacity={0.72} />)}
    {project.railings.filter((item) => item.levelId === levelId).map((item) => <line key={item.id} x1={item.start.x} y1={item.start.y} x2={item.end.x} y2={item.end.y} stroke="#475569" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
    {project.foundations.filter((item) => item.levelId === levelId).map((item) => <rect key={item.id} x={item.x - item.width / 2} y={item.y - item.depth / 2} width={item.width} height={item.depth} fill="rgba(100,116,139,.12)" stroke="#64748b" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
    {project.structuralColumns.filter((item) => item.levelId === levelId).map((item) => <rect key={item.id} x={item.x - item.width / 2} y={item.y - item.depth / 2} width={item.width} height={item.depth} fill="#64748b" />)}
    {project.stairs.filter((item) => item.levelId === levelId).map((item) => <rect key={item.id} x={item.x - item.width / 2} y={item.y - item.length / 2} width={item.width} height={item.length} fill="rgba(71,85,105,.16)" stroke="#475569" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
    {project.components.filter((item) => item.levelId === levelId).map((item) => <rect key={item.id} x={item.x - item.width / 2} y={item.y - item.depth / 2} width={item.width} height={item.depth} fill="rgba(20,115,230,.10)" stroke="#1473e6" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
  </g>;
}

function WallTemporaryDimension({ wall, margin, selection, onChange }: { wall: HouseProject["walls"][number]; margin: number; selection: HouseSelection; onChange: (selection: HouseSelection, length: number) => void }) {
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  const middle = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  return <g><line x1={wall.start.x} y1={wall.start.y} x2={wall.end.x} y2={wall.end.y} stroke="#1473e6" strokeWidth={2} vectorEffect="non-scaling-stroke" /><InlineDimensionInput x={middle.x} y={middle.y} margin={margin} label="Length" value={length} onChange={(value) => { if (value >= 200) onChange(selection, value); }} /></g>;
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
  door: 0, window: 0, column: 0, component: 0, stair: 0, annotation: 0, foundation: 0,
  wall: 1, railing: 1,
  beam: 2,
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
  for (const stair of project.stairs.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "stair", id: stair.id }, bounds: centred(stair.x, stair.y, stair.width, stair.length) });
  for (const component of project.components.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "component", id: component.id }, bounds: centred(component.x, component.y, component.width, component.depth) });
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
