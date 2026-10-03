"use client";

import { useId, useMemo, useRef, useState } from "react";

import { useHouseUnits } from "./house-units";
import { displayLength, modelLength } from "../services/workspace-options";
import type { HouseCommandId } from "../services/command-registry";
import type { HouseProject, HouseSelection } from "../types/project";

export type HousePlanPoint = { x: number; y: number };
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type SnapPoint = HousePlanPoint & { label: string };

const lineTools = new Set<HouseCommandId>(["wall", "structural-wall", "room-separator", "beam", "railing", "grid", "reference-plane", "dimension", "section", "elevation", "strip-footing"]);
const pointTools = new Set<HouseCommandId>(["door", "window", "column", "room", "floor", "structural-slab", "ceiling", "roof", "stair", "opening", "component", "furniture", "kitchen", "wardrobe", "plumbing-fixture", "foundation", "isolated-footing", "foundation-slab", "level", "text", "room-tag", "tag", "move"]);

export function HousePlanSelectionOverlay({ project, levelId, activeTool, selections, draftStart, snapEnabled, chain, onDraftStart, onDraft, onSelect, onDimensionChange, onGuidance, onSelectionMenu }: {
  project: HouseProject;
  levelId: string;
  activeTool: HouseCommandId | null;
  selections: readonly HouseSelection[];
  draftStart: HousePlanPoint | null;
  snapEnabled: boolean;
  chain: boolean;
  onDraftStart: (point: HousePlanPoint | null) => void;
  onDraft: (start: HousePlanPoint, end: HousePlanPoint) => void;
  onSelect: (items: HouseSelection[], mode: "replace" | "add" | "remove") => void;
  onDimensionChange: (selection: HouseSelection, patch: Record<string, number>) => void;
  onGuidance: (message: string) => void;
  onSelectionMenu: (point: { x: number; y: number } | null) => void;
}) {
  const svg = useRef<SVGSVGElement | null>(null);
  const gridId = useId();
  const [dragStart, setDragStart] = useState<HousePlanPoint | null>(null);
  const [current, setCurrent] = useState<SnapPoint | null>(null);
  const bounds = useMemo(() => levelBounds(project, levelId), [levelId, project]);
  const objects = useMemo(() => selectableBounds(project, levelId), [levelId, project]);
  const candidates = useMemo(() => snapCandidates(project, levelId), [levelId, project]);
  const margin = Math.max(500, Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.08);
  const viewBox = `${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`;
  const selectMode = !activeTool || activeTool === "select";
  const selectedIds = new Set(selections.map((item) => item.id));

  function modelPoint(event: React.PointerEvent<SVGSVGElement>): HousePlanPoint | null {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    const result = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: result.x, y: result.y };
  }

  function snapped(raw: HousePlanPoint): SnapPoint {
    if (!snapEnabled) return { ...raw, label: "Nearest" };
    let best: SnapPoint = { x: Math.round(raw.x / 100) * 100, y: Math.round(raw.y / 100) * 100, label: "Grid" };
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
    if (event.button !== 0) return;
    const raw = modelPoint(event);
    if (!raw) return;
    svg.current?.focus();
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
        onGuidance(`${toolName(activeTool)} Tool · Pick end point or type length`);
      } else {
        onDraft(draftStart, point);
        onDraftStart(chain && ["wall", "structural-wall", "room-separator"].includes(activeTool) ? point : null);
      }
      return;
    }
    if (activeTool && pointTools.has(activeTool)) onDraft(point, point);
  }

  function pointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (!selectMode || !dragStart) return;
    const end = modelPoint(event) ?? dragStart;
    const distance = Math.hypot(end.x - dragStart.x, end.y - dragStart.y);
    const mode = event.shiftKey ? "remove" : event.ctrlKey || event.metaKey ? "add" : "replace";
    if (distance < Math.max(35, margin * 0.025)) {
      const hits = objects.filter((object) => containsPoint(expand(object.bounds, 80), end)).sort((a, b) => area(a.bounds) - area(b.bounds));
      onSelect(hits[0] ? [hits[0].selection] : [], mode);
      if (event.pointerType !== "mouse") onSelectionMenu(hits.length ? { x: event.clientX, y: event.clientY } : null);
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

  return (
    <svg ref={svg} tabIndex={0} aria-label="House plan modeling canvas" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 size-full touch-none outline-none" style={{ cursor: selectMode ? "default" : "crosshair" }} onPointerDown={pointerDown} onPointerMove={(event) => { const raw = modelPoint(event); if (raw) setCurrent(snapped(raw)); }} onPointerUp={pointerUp} onPointerCancel={() => setDragStart(null)}>
      <defs>
        <pattern id={`${gridId}-minor`} width={1000} height={1000} patternUnits="userSpaceOnUse">
          <path d="M 1000 0 L 0 0 0 1000" fill="none" stroke="#eef2f7" strokeWidth={6} />
        </pattern>
        <pattern id={`${gridId}-major`} width={5000} height={5000} patternUnits="userSpaceOnUse">
          <rect width={5000} height={5000} fill={`url(#${gridId}-minor)`} />
          <path d="M 5000 0 L 0 0 0 5000" fill="none" stroke="#dbe3ec" strokeWidth={10} />
        </pattern>
      </defs>
      <rect x={bounds.minX} y={bounds.minY} width={bounds.maxX - bounds.minX} height={bounds.maxY - bounds.minY} fill={`url(#${gridId}-major)`} pointerEvents="none" />
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
      {draftStart && current && activeTool && lineTools.has(activeTool) ? <g><line x1={draftStart.x} y1={draftStart.y} x2={current.x} y2={current.y} stroke="#1473e6" strokeWidth={2} strokeDasharray="80 40" vectorEffect="non-scaling-stroke" /><text x={(draftStart.x + current.x) / 2} y={(draftStart.y + current.y) / 2 - 100} textAnchor="middle" fontSize={Math.max(120, margin * 0.15)} fill="#1473e6">{displayLength(Math.hypot(current.x - draftStart.x, current.y - draftStart.y), project.displayUnits ?? "mm")} {project.displayUnits ?? "mm"}</text></g> : null}
      {!selectMode && current ? <g pointerEvents="none"><circle cx={current.x} cy={current.y} r={Math.max(45, margin * 0.035)} fill="white" stroke="#1473e6" strokeWidth={2} vectorEffect="non-scaling-stroke" /><path d={`M ${current.x - 65} ${current.y} H ${current.x + 65} M ${current.x} ${current.y - 65} V ${current.y + 65}`} stroke="#1473e6" strokeWidth={2} vectorEffect="non-scaling-stroke" /><text x={current.x + 100} y={current.y - 80} fontSize={Math.max(100, margin * 0.12)} fill="#1473e6">{current.label}</text></g> : null}
      {selectedWall ? <WallTemporaryDimension wall={selectedWall} margin={margin} selection={selections[0]!} onChange={(selection, length) => onDimensionChange(selection, { length })} /> : null}
      {selectedOpening ? <OpeningTemporaryDimension project={project} opening={selectedOpening} margin={margin} selection={selections[0]!} onChange={onDimensionChange} /> : null}
      {selectedColumn ? <ColumnTemporaryDimensions column={selectedColumn} margin={margin} selection={selections[0]!} onChange={onDimensionChange} /> : null}
    </svg>
  );
}

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

function selectableBounds(project: HouseProject, levelId: string): { selection: HouseSelection; bounds: Bounds }[] {
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
function normalized(a: HousePlanPoint, b: HousePlanPoint): Bounds { return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) }; }
function contains(a: Bounds, b: Bounds) { return b.minX >= a.minX && b.maxX <= a.maxX && b.minY >= a.minY && b.maxY <= a.maxY; }
function intersects(a: Bounds, b: Bounds) { return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY; }
function containsPoint(bounds: Bounds, point: HousePlanPoint) { return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY; }
function area(bounds: Bounds) { return Math.max(1, bounds.maxX - bounds.minX) * Math.max(1, bounds.maxY - bounds.minY); }
