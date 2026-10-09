import { formatLength, polygonArea } from "./measurements";
import type { HouseProject } from "../types/project";

/**
 * A floor of the plan as a picture, in millimetres: what Sketch draws over.
 *
 * The coordinates are the plan's own, so a pin or an arrow drawn on it lands
 * on the same wall in the plan itself. It is a drawing of the plan, not the
 * plan: nothing drawn on it can change a wall.
 */
export type PlanSnapshot = {
  svg: string;
  /** The picture's extent, in plan millimetres. */
  x: number;
  y: number;
  width: number;
  height: number;
};

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function planSnapshot(project: HouseProject, levelId: string): PlanSnapshot {
  const on = <T extends { levelId: string }>(items: readonly T[]) => items.filter((item) => item.levelId === levelId);
  const walls = on(project.walls);
  const rooms = on(project.rooms);
  const points = [
    ...walls.flatMap((wall) => [wall.start, wall.end]),
    ...rooms.flatMap((room) => room.boundary),
    ...on(project.components).flatMap((item) => [{ x: item.x - item.width / 2, y: item.y - item.depth / 2 }, { x: item.x + item.width / 2, y: item.y + item.depth / 2 }]),
  ];
  const xs = points.length ? points.map((point) => point.x) : [0, 8000];
  const ys = points.length ? points.map((point) => point.y) : [0, 6000];
  const margin = 1200;
  const x = Math.min(...xs) - margin;
  const y = Math.min(...ys) - margin;
  const width = Math.max(...xs) - Math.min(...xs) + margin * 2;
  const height = Math.max(...ys) - Math.min(...ys) + margin * 2;
  const unit = project.displayUnits ?? "mm";
  const text = Math.max(140, Math.min(width, height) / 45);
  const parts: string[] = [];

  parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff"/>`);
  if (project.freehandSketch && !project.freehandSketch.calibrated) parts.push(`<text x="${x + 100}" y="${y + text}" font-size="${text}" fill="#92400e">APPROXIMATE SKETCH — SCALE NOT VERIFIED</text>`);
  for (const room of rooms) {
    const centre = room.boundary.reduce((sum, point) => ({ x: sum.x + point.x / room.boundary.length, y: sum.y + point.y / room.boundary.length }), { x: 0, y: 0 });
    parts.push(`<polygon points="${room.boundary.map((point) => `${point.x},${point.y}`).join(" ")}" fill="#e0f2fe"/>`);
    parts.push(`<text x="${centre.x}" y="${centre.y}" font-size="${text}" text-anchor="middle" fill="#0f172a" font-family="sans-serif">${escape(room.name)}</text>`);
    parts.push(`<text x="${centre.x}" y="${centre.y + text * 1.2}" font-size="${text * 0.8}" text-anchor="middle" fill="#475569" font-family="sans-serif">${polygonArea(room.boundary).toFixed(2)} m²</text>`);
  }
  for (const wall of walls) {
    parts.push(`<line x1="${wall.start.x}" y1="${wall.start.y}" x2="${wall.end.x}" y2="${wall.end.y}" stroke="#1f2937" stroke-width="${wall.thickness}" stroke-linecap="square"/>`);
  }
  for (const opening of [...on(project.doors), ...on(project.windows)]) {
    const wall = walls.find((item) => item.id === opening.wallId);
    if (!wall) continue;
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) || 1;
    const ux = (wall.end.x - wall.start.x) / length;
    const uy = (wall.end.y - wall.start.y) / length;
    const a = { x: wall.start.x + ux * opening.offset, y: wall.start.y + uy * opening.offset };
    const b = { x: a.x + ux * opening.width, y: a.y + uy * opening.width };
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#ffffff" stroke-width="${wall.thickness + 4}"/>`);
    if (opening.type === "window") {
      parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#0284c7" stroke-width="${Math.max(30, wall.thickness / 3)}"/>`);
    } else {
      // A door: the leaf drawn open, and the arc it swings through.
      const nx = -uy;
      const ny = ux;
      const leaf = { x: a.x + nx * opening.width, y: a.y + ny * opening.width };
      parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${leaf.x}" y2="${leaf.y}" stroke="#7c2d12" stroke-width="30"/>`);
      parts.push(`<path d="M ${leaf.x} ${leaf.y} A ${opening.width} ${opening.width} 0 0 ${ux * ny - uy * nx > 0 ? 0 : 1} ${b.x} ${b.y}" fill="none" stroke="#7c2d12" stroke-width="15" stroke-dasharray="60 40"/>`);
    }
  }
  for (const column of on(project.structuralColumns)) {
    parts.push(`<rect x="${column.x - column.width / 2}" y="${column.y - column.depth / 2}" width="${column.width}" height="${column.depth}" fill="#475569"/>`);
  }
  for (const stair of on(project.stairs)) {
    parts.push(`<g transform="rotate(${stair.rotation} ${stair.x} ${stair.y})"><rect x="${stair.x - stair.width / 2}" y="${stair.y - stair.length / 2}" width="${stair.width}" height="${stair.length}" fill="none" stroke="#334155" stroke-width="20"/>${Array.from({ length: stair.steps - 1 }, (_, index) => { const step = stair.y - stair.length / 2 + (stair.length / stair.steps) * (index + 1); return `<line x1="${stair.x - stair.width / 2}" y1="${step}" x2="${stair.x + stair.width / 2}" y2="${step}" stroke="#94a3b8" stroke-width="10"/>`; }).join("")}</g>`);
  }
  for (const item of on(project.components)) {
    parts.push(`<g transform="rotate(${item.rotation} ${item.x} ${item.y})"><rect x="${item.x - item.width / 2}" y="${item.y - item.depth / 2}" width="${item.width}" height="${item.depth}" rx="${Math.min(item.width, item.depth) * 0.06}" fill="#dbeafe" stroke="#1d4ed8" stroke-width="15"/><text x="${item.x}" y="${item.y}" font-size="${Math.max(90, Math.min(item.width, item.depth) * 0.22)}" text-anchor="middle" dominant-baseline="middle" fill="#1e3a8a" font-family="sans-serif">${escape(item.name)}</text></g>`);
  }
  // Each outside wall's length beside it, the way a measured sketch is written.
  for (const wall of walls) {
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    if (length < 600) continue;
    const nx = -(wall.end.y - wall.start.y) / length;
    const ny = (wall.end.x - wall.start.x) / length;
    const offset = wall.thickness / 2 + text * 0.9;
    const mx = (wall.start.x + wall.end.x) / 2 + nx * offset;
    const my = (wall.start.y + wall.end.y) / 2 + ny * offset;
    const angle = (Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180) / Math.PI;
    const upright = angle > 90 || angle < -90 ? angle + 180 : angle;
    parts.push(`<text x="${mx}" y="${my}" font-size="${text * 0.85}" text-anchor="middle" dominant-baseline="middle" fill="#334155" font-family="sans-serif" transform="rotate(${upright} ${mx} ${my})">${escape(formatLength(length, unit))}</text>`);
  }
  for (const item of on(project.annotations)) {
    if (!item.end) continue;
    parts.push(`<line x1="${item.start.x}" y1="${item.start.y}" x2="${item.end.x}" y2="${item.end.y}" stroke="#7c3aed" stroke-width="15"/>`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${Math.round(width / 5)}" height="${Math.round(height / 5)}">${parts.join("")}</svg>`;
  return { svg, x, y, width, height };
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
