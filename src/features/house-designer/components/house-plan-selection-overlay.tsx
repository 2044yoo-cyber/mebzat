"use client";

import { useMemo, useRef, useState } from "react";

import type { HouseProject, HouseSelection } from "../types/project";

type Point = { x: number; y: number };
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function HousePlanSelectionOverlay({ project, levelId, onSelect }: { project: HouseProject; levelId: string; onSelect: (items: HouseSelection[], mode: "replace" | "add" | "remove") => void }) {
  const svg = useRef<SVGSVGElement | null>(null);
  const [start, setStart] = useState<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);
  const bounds = useMemo(() => levelBounds(project, levelId), [levelId, project]);
  const objects = useMemo(() => selectableBounds(project, levelId), [levelId, project]);
  const margin = Math.max(500, Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.08);
  const viewBox = `${bounds.minX - margin} ${bounds.minY - margin} ${bounds.maxX - bounds.minX + margin * 2} ${bounds.maxY - bounds.minY + margin * 2}`;

  function point(event: React.PointerEvent<SVGSVGElement>): Point | null {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    const result = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: result.x, y: result.y };
  }

  function finish(event: React.PointerEvent<SVGSVGElement>) {
    if (!start) return;
    const end = point(event) ?? current ?? start;
    const box = normalized(start, end);
    const crossing = end.x < start.x;
    const chosen = objects.filter((object) => crossing ? intersects(box, object.bounds) : contains(box, object.bounds)).map((object) => object.selection);
    const mode = event.shiftKey ? "remove" : event.ctrlKey || event.metaKey ? "add" : "replace";
    onSelect(chosen, mode);
    setStart(null);
    setCurrent(null);
  }

  const selectionBox = start && current ? normalized(start, current) : null;
  const crossing = !!start && !!current && current.x < start.x;

  return (
    <svg
      ref={svg}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 size-full touch-none"
      onPointerDown={(event) => { if (event.button !== 0) return; const next = point(event); if (!next) return; svg.current?.setPointerCapture(event.pointerId); setStart(next); setCurrent(next); }}
      onPointerMove={(event) => { if (start) setCurrent(point(event)); }}
      onPointerUp={finish}
      onPointerCancel={() => { setStart(null); setCurrent(null); }}
    >
      {selectionBox ? <rect x={selectionBox.minX} y={selectionBox.minY} width={selectionBox.maxX - selectionBox.minX} height={selectionBox.maxY - selectionBox.minY} fill={crossing ? "rgba(20,115,230,.10)" : "rgba(20,115,230,.06)"} stroke="#1473e6" strokeWidth={Math.max(8, margin * 0.02)} strokeDasharray={crossing ? `${margin * 0.08} ${margin * 0.05}` : undefined} vectorEffect="non-scaling-stroke" /> : null}
    </svg>
  );
}

function selectableBounds(project: HouseProject, levelId: string): { selection: HouseSelection; bounds: Bounds }[] {
  const result: { selection: HouseSelection; bounds: Bounds }[] = [];
  for (const wall of project.walls.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "wall", id: wall.id }, bounds: expand(pointsBounds([wall.start, wall.end]), wall.thickness / 2) });
  for (const room of project.rooms.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "room", id: room.id }, bounds: pointsBounds(room.boundary) });
  for (const column of project.structuralColumns.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "column", id: column.id }, bounds: centred(column.x, column.y, column.width, column.depth) });
  for (const foundation of project.foundations.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "foundation", id: foundation.id }, bounds: centred(foundation.x, foundation.y, foundation.width, foundation.depth) });
  for (const stair of project.stairs.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "stair", id: stair.id }, bounds: centred(stair.x, stair.y, stair.width, stair.length) });
  for (const component of project.components.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "component", id: component.id }, bounds: centred(component.x, component.y, component.width, component.depth) });
  for (const beam of project.structuralBeams.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "beam", id: beam.id }, bounds: expand(pointsBounds([beam.start, beam.end]), beam.width / 2) });
  for (const grid of project.structuralGrid.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "grid", id: grid.id }, bounds: expand(pointsBounds([grid.start, grid.end]), 20) });
  for (const plane of project.referencePlanes.filter((item) => item.levelId === levelId)) result.push({ selection: { kind: "reference-plane", id: plane.id }, bounds: expand(pointsBounds([plane.start, plane.end]), 20) });
  return result;
}

function levelBounds(project: HouseProject, levelId: string): Bounds {
  const plan = project.levels.find((item) => item.id === levelId)?.plan;
  return plan?.corners.length ? pointsBounds(plan.corners) : { minX: 0, minY: 0, maxX: 8000, maxY: 6000 };
}

function pointsBounds(points: Point[]): Bounds { const xs = points.map((item) => item.x); const ys = points.map((item) => item.y); return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }; }
function centred(x: number, y: number, width: number, depth: number): Bounds { return { minX: x - width / 2, minY: y - depth / 2, maxX: x + width / 2, maxY: y + depth / 2 }; }
function expand(bounds: Bounds, amount: number): Bounds { return { minX: bounds.minX - amount, minY: bounds.minY - amount, maxX: bounds.maxX + amount, maxY: bounds.maxY + amount }; }
function normalized(a: Point, b: Point): Bounds { return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) }; }
function contains(a: Bounds, b: Bounds) { return b.minX >= a.minX && b.maxX <= a.maxX && b.minY >= a.minY && b.maxY <= a.maxY; }
function intersects(a: Bounds, b: Bounds) { return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY; }
