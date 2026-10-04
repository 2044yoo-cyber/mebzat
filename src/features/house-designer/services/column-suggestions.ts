import type { HouseProject } from "../types/project";

export type ColumnProposal = { id: string; x: number; y: number; width: number; depth: number; reason: string };

const COLUMN = 300;
const NEAR = 250;

/**
 * Where a column is expected and there is none: the house's corners, where
 * an inside wall meets another wall, and along any wall whose span between
 * supports is longer than `maxSpan`. Proposals only — nothing here changes
 * the model, and nothing ever touches a wall, door or window. Preliminary:
 * an engineer sizes and confirms the real structure.
 */
export function suggestColumns(project: HouseProject, levelId: string, maxSpan = 4500): ColumnProposal[] {
  const level = project.levels.find((item) => item.id === levelId);
  if (!level?.plan) return [];
  const walls = project.walls.filter((wall) => wall.levelId === levelId);
  const openings = [...project.doors, ...project.windows].filter((item) => item.levelId === levelId);
  const supports = project.structuralColumns.filter((column) => column.levelId === levelId).map((column) => ({ x: column.x, y: column.y }));
  const proposals: ColumnProposal[] = [];
  const taken = () => [...supports, ...proposals];
  const free = (point: { x: number; y: number }) => !taken().some((other) => Math.hypot(other.x - point.x, other.y - point.y) < NEAR);
  const inOpening = (point: { x: number; y: number }) => openings.some((opening) => {
    const wall = walls.find((item) => item.id === opening.wallId);
    if (!wall) return false;
    const length = Math.max(1, Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y));
    const along = ((point.x - wall.start.x) * (wall.end.x - wall.start.x) + (point.y - wall.start.y) * (wall.end.y - wall.start.y)) / length;
    const across = Math.abs((point.x - wall.start.x) * (wall.end.y - wall.start.y) - (point.y - wall.start.y) * (wall.end.x - wall.start.x)) / length;
    return across <= wall.thickness && along > opening.offset - COLUMN / 2 && along < opening.offset + opening.width + COLUMN / 2;
  });
  const propose = (point: { x: number; y: number }, reason: string) => {
    const rounded = { x: Math.round(point.x), y: Math.round(point.y) };
    if (!free(rounded) || inOpening(rounded)) return;
    proposals.push({ id: `proposal-${proposals.length + 1}`, ...rounded, width: COLUMN, depth: COLUMN, reason });
  };

  for (const corner of level.plan.corners) propose(corner, "Corner");

  // An inside wall's end that lands on another wall carries load into it.
  for (const wall of walls) {
    for (const end of [wall.start, wall.end]) {
      const meets = walls.some((other) => other.id !== wall.id && distanceToSegment(end, other.start, other.end) <= other.thickness / 2 + 30);
      if (meets) propose(end, "Wall junction");
    }
  }

  // Long spans: supports sorted along each wall, extra columns evenly spaced
  // wherever the gap between two of them is longer than allowed.
  for (const wall of walls) {
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    if (length <= maxSpan) continue;
    const ux = (wall.end.x - wall.start.x) / length;
    const uy = (wall.end.y - wall.start.y) / length;
    const stations = taken()
      .filter((point) => distanceToSegment(point, wall.start, wall.end) <= wall.thickness / 2 + NEAR)
      .map((point) => (point.x - wall.start.x) * ux + (point.y - wall.start.y) * uy)
      .concat([0, length])
      .sort((a, b) => a - b);
    for (let index = 1; index < stations.length; index += 1) {
      const from = stations[index - 1]!;
      const gap = stations[index]! - from;
      if (gap <= maxSpan) continue;
      const pieces = Math.ceil(gap / maxSpan);
      for (let piece = 1; piece < pieces; piece += 1) {
        const at = from + (gap * piece) / pieces;
        const point = (station: number) => ({ x: wall.start.x + ux * station, y: wall.start.y + uy * station });
        // Where the ideal spot is a door or window, the nearest edge of the
        // opening that still keeps the span short enough.
        const opening = openings.find((item) => item.wallId === wall.id && at > item.offset - COLUMN / 2 && at < item.offset + item.width + COLUMN / 2);
        const candidates = opening
          ? [opening.offset - COLUMN, opening.offset + opening.width + COLUMN].filter((station) => station > from && station < stations[index]!).sort((a, b) => Math.abs(a - at) - Math.abs(b - at))
          : [at];
        const reason = `${(gap / 1000).toFixed(1)} m span`;
        const before = proposals.length;
        for (const station of candidates) { propose(point(station), reason); if (proposals.length > before) break; }
      }
    }
  }
  return proposals;
}

/** Accepted proposals become ordinary columns — the same as one placed by
 * hand, so editing the plan later never takes them away. */
export function acceptColumnProposals(project: HouseProject, levelId: string, proposals: readonly ColumnProposal[]): HouseProject {
  const level = project.levels.find((item) => item.id === levelId);
  if (!level || !proposals.length) return project;
  const height = level.plan?.ceilingHeight ?? level.floorToFloorHeight;
  return {
    ...project,
    structuralColumns: [
      ...project.structuralColumns,
      ...proposals.map((proposal) => ({ id: `column:${crypto.randomUUID()}`, levelId, x: proposal.x, y: proposal.y, elevation: level.elevation, width: proposal.width, depth: proposal.depth, height, type: "preliminary reinforced concrete", material: "Reinforced concrete" })),
    ],
  };
}

function distanceToSegment(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}
