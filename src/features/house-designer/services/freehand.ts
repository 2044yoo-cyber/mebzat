import type { HouseProject } from "../types/project";
import { roomSchema } from "@/features/berchuma-studio/types/room";
import { rebuildLevel } from "./project-edit";
import { wallGraph, withDerivedZones } from "./room-topology";
export type Point = { x: number; y: number };
export type Stroke = NonNullable<
  HouseProject["freehandSketch"]
>["strokes"][number];
export type Segment = { start: Point; end: Point; thickness: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function foot(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return { x: a.x + t * dx, y: a.y + t * dy };
}
/** Iterative RDP retains clear corners, including those in closed strokes. */
export function simplify(points: readonly Point[], tolerance: number): Point[] {
  if (points.length < 3) return points.map((p) => ({ ...p }));
  const keep = new Set([0, points.length - 1]),
    stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = tolerance,
      chosen = -1;
    for (let i = a! + 1; i < b!; i++) {
      const d = distance(
        points[i]!,
        foot(points[i]!, points[a!]!, points[b!]!),
      );
      if (d > best) {
        best = d;
        chosen = i;
      }
    }
    if (chosen >= 0) {
      keep.add(chosen);
      stack.push([a!, chosen], [chosen, b!]);
    }
  }
  return [...keep].sort((a, b) => a - b).map((i) => ({ ...points[i]! }));
}
/** Orthogonal least squares: stable for vertical and horizontal lines alike. */
function fitted(points: readonly Point[]): [Point, Point] {
  const mean = points.reduce(
    (m, p) => ({ x: m.x + p.x / points.length, y: m.y + p.y / points.length }),
    { x: 0, y: 0 },
  );
  let xx = 0,
    xy = 0,
    yy = 0;
  for (const p of points) {
    const x = p.x - mean.x,
      y = p.y - mean.y;
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy),
    ux = Math.cos(angle),
    uy = Math.sin(angle);
  const project = (p: Point) => {
    const t = (p.x - mean.x) * ux + (p.y - mean.y) * uy;
    return { x: mean.x + t * ux, y: mean.y + t * uy };
  };
  return [project(points[0]!), project(points.at(-1)!)];
}
export function strokeSegments(
  stroke: Stroke,
  tolerance = 3,
  snap = true,
): Segment[] {
  const raw = stroke.points.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  if (raw.length < 2) return [];
  const sampled = raw.filter(
    (p, i) =>
      i === 0 || i === raw.length - 1 || distance(p, raw[i - 1]!) > 0.25,
  );
  const corners = simplify(sampled, tolerance),
    result: Segment[] = [];
  let from = 0;
  for (let i = 1; i < corners.length; i++) {
    let to = sampled.findIndex(
      (p, index) =>
        index > from && p.x === corners[i]!.x && p.y === corners[i]!.y,
    );
    if (to < 0) to = sampled.length - 1;
    let [start, end] = fitted(sampled.slice(from, to + 1));
    from = to;
    if (distance(start, end) < tolerance * 2) continue;
    if (snap) {
      const angle = Math.atan2(end.y - start.y, end.x - start.x),
        axis = (Math.round(angle / (Math.PI / 2)) * Math.PI) / 2;
      if (Math.abs(angle - axis) <= (5 * Math.PI) / 180) {
        if (Math.abs(Math.cos(axis)) > 0.5) {
          const y = (start.y + end.y) / 2;
          start = { ...start, y };
          end = { ...end, y };
        } else {
          const x = (start.x + end.x) / 2;
          start = { ...start, x };
          end = { ...end, x };
        }
      }
    }
    result.push({ start, end, thickness: stroke.thickness });
  }
  return result;
}
/** Pixel-space snapping then the existing planar graph, including T/X splits. */
export function convertStrokes(
  strokes: readonly Stroke[],
  mmPerUnit: number,
  snapPixels = 12,
  unitsPerPixel = 1,
): Segment[] {
  if (!Number.isFinite(mmPerUnit) || mmPerUnit <= 0)
    throw new Error("Enter a positive drawing scale.");
  const tolerance = snapPixels * unitsPerPixel,
    lines = strokes.flatMap((s) =>
      strokeSegments(s, 3 * unitsPerPixel, snapPixels > 0),
    );
  if (lines.length > 500)
    throw new Error("Convert up to 500 wall segments at a time.");
  if (tolerance > 0) {
    // Square only near-horizontal/vertical walls. Use the SAME coordinate
    // for neighbouring parallel runs, otherwise every stroke remains slightly
    // crooked even when it was meant to share an architectural grid.
    const horizontal = lines.filter(line => Math.abs(line.end.y - line.start.y) <=
      Math.abs(line.end.x - line.start.x) * 0.12);
    const vertical = lines.filter(line => Math.abs(line.end.x - line.start.x) <=
      Math.abs(line.end.y - line.start.y) * 0.12);
    const align = (group: Segment[], axis: "x" | "y") => {
      const positions = group.map(line => (line.start[axis] + line.end[axis]) / 2);
      for (let i = 0; i < group.length; i++) {
        const peers = positions.filter((value, j) => Math.abs(value - positions[i]!) <= tolerance * 0.6 &&
          // Avoid averaging a long run with a much shorter, unrelated nearby wall.
          distance(group[j]!.start, group[j]!.end) > 0);
        const sorted = peers.sort((a, b) => a - b);
        const aligned = sorted[Math.floor(sorted.length / 2)]!;
        group[i]!.start = { ...group[i]!.start, [axis]: aligned };
        group[i]!.end = { ...group[i]!.end, [axis]: aligned };
      }
    };
    align(horizontal, "y");
    align(vertical, "x");
  }
  if (tolerance > 0) {
    // Cluster all close endpoints together, independent of stroke order.
    // A shared coordinate is essential: independently nudging each end
    // leaves tiny gaps and overlapping circular handles at junctions.
    const ends = lines.flatMap((line, lineIndex) => [
      { lineIndex, key: "start" as const, point: { ...line.start } },
      { lineIndex, key: "end" as const, point: { ...line.end } },
    ]);
    const parent = ends.map((_, i) => i);
    const root = (index: number): number => {
      while (parent[index] !== index) {
        parent[index] = parent[parent[index]!]!;
        index = parent[index]!;
      }
      return index;
    };
    const join = (a: number, b: number) => { const ra = root(a), rb = root(b); if (ra !== rb) parent[rb] = ra; };
    for (let a = 0; a < ends.length; a++)
      for (let b = a + 1; b < ends.length; b++) {
        if (ends[a]!.lineIndex === ends[b]!.lineIndex) continue;
        const la = lines[ends[a]!.lineIndex]!, lb = lines[ends[b]!.lineIndex]!;
        const limit = Math.min(tolerance, distance(la.start, la.end) / 4, distance(lb.start, lb.end) / 4);
        if (distance(ends[a]!.point, ends[b]!.point) <= limit) join(a, b);
      }
    const clusters = new Map<number, Point[]>();
    ends.forEach((end, i) => { const id = root(i); clusters.set(id, [...(clusters.get(id) ?? []), end.point]); });
    ends.forEach((end, i) => {
      const group = clusters.get(root(i))!;
      const mean = { x: group.reduce((sum, p) => sum + p.x, 0) / group.length, y: group.reduce((sum, p) => sum + p.y, 0) / group.length };
      lines[end.lineIndex]![end.key] = mean;
    });

    // Snap unmatched endpoints to a nearby wall interior. This closes
    // rough T-junctions and allows wallGraph to split the receiving wall.
    // Never pull an endpoint onto its own wall or across a long gap.
    for (let i = 0; i < lines.length; i++)
      for (const key of ["start", "end"] as const) {
        const line = lines[i]!, p = line[key];
        if (lines.some((other, j) => j !== i &&
          (distance(p, other.start) < 1e-6 || distance(p, other.end) < 1e-6))) continue;
        const limit = Math.min(tolerance, distance(line.start, line.end) / 4);
        let nearest: Point | null = null, nearestDistance = limit;
        for (let j = 0; j < lines.length; j++) {
          if (i === j) continue;
          const other = lines[j]!;
          const q = foot(p, other.start, other.end);
          const d = distance(p, q);
          if (d < nearestDistance) { nearest = q; nearestDistance = d; }
        }
        if (nearest) line[key] = nearest;
      }
  }
  // Fixed disables legacy thickness-based snapping. Exact intersections remain.
  const scaled = lines.map((s) => ({
    ...s,
    fixed: true,
    start: { x: s.start.x * mmPerUnit, y: s.start.y * mmPerUnit },
    end: { x: s.end.x * mmPerUnit, y: s.end.y * mmPerUnit },
  }));
  const graph = wallGraph(scaled);
  return graph.edges.map(([a, b]) => {
    const start = graph.points[a]!,
      end = graph.points[b]!,
      mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const source = scaled.find(
      (s) => distance(mid, foot(mid, s.start, s.end)) < 1,
    );
    return {
      start: { ...start },
      end: { ...end },
      thickness: source?.thickness ?? 200,
    };
  });
}
/** Non-destructive review of the exact geometry that conversion will consume.
 * Degree-one endpoints are warnings, not automatically guessed connections.
 * Short pieces can be intentional; flag them without deleting them.
 */
export type FreehandIssue = {
  id: string;
  kind: "open-end" | "short-wall";
  point: Point;
  detail: string;
};
export function inspectFreehand(
  strokes: readonly Stroke[],
  snapPixels = 12,
  unitsPerPixel = 1,
): { segments: Segment[]; issues: FreehandIssue[] } {
  const segments = convertStrokes(strokes, 1, snapPixels, unitsPerPixel);
  const nodes = new Map<string, { point: Point; degree: number }>();
  const keyOf = (p: Point) => `${p.x.toFixed(3)}:${p.y.toFixed(3)}`;
  for (const segment of segments)
    for (const point of [segment.start, segment.end]) {
      const key = keyOf(point), old = nodes.get(key);
      nodes.set(key, { point, degree: (old?.degree ?? 0) + 1 });
    }
  const issues: FreehandIssue[] = [];
  for (const [key, node] of nodes)
    if (node.degree === 1)
      issues.push({ id: `open-${key}`, kind: "open-end", point: node.point,
        detail: "Open wall endpoint. Join it to another wall if this room should be enclosed." });
  // Ignore very short subdivisions adjacent to junctions; flag genuinely tiny
  // standalone pieces, but never delete any geometry on the user's behalf.
  const small = Math.max(2 * unitsPerPixel, 0.01);
  for (const [i, segment] of segments.entries())
    if (distance(segment.start, segment.end) < small)
      issues.push({ id: `short-${i}`, kind: "short-wall",
        point: { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 },
        detail: "Very short wall piece. Inspect before conversion." });
  return { segments, issues };
}

/** Convert to native level walls; existing editor, save and takeoff consume them. */
export function applyFreehand(
  project: HouseProject,
  sketch: NonNullable<HouseProject["freehandSketch"]>,
  snapPixels = 12,
  unitsPerPixel = 1,
): HouseProject {
  const level = project.levels[0];
  if (!level) throw new Error("A drawing needs a floor.");
  if (level.plan || project.walls.length)
    throw new Error("Convert on a blank plan to preserve existing edits.");
  const segments = convertStrokes(
    sketch.strokes,
    sketch.mmPerUnit,
    snapPixels,
    unitsPerPixel,
  );
  if (!segments.length)
    throw new Error("Draw at least one wall before converting.");
  if (segments.length > 80)
    throw new Error(
      "This editor supports 80 freehand wall pieces. Use separate plans for larger drawings.",
    );
  let plan = roomSchema.parse({
    version: 1,
    freehand: true,
    corners: [],
    wallThickness: 200,
    ceilingHeight: Math.min(6000, level.floorToFloorHeight),
    openings: [],
    runWalls: [],
    interiorWalls: segments.map((s, i) => ({
      ...s,
      id: `interior-freehand-${i + 1}`,
      height: Math.min(6000, level.floorToFloorHeight),
      label: "Wall",
    })),
    zones: [],
  });
  plan = roomSchema.parse(withDerivedZones(plan, plan));
  const next = rebuildLevel(
    { ...project, freehandSketch: sketch },
    level.id,
    plan,
  );
  return sketch.calibrated ? rememberWallLength(next, next.walls[0]!.id) : next;
}

/** Calibrate an axis-aligned single-room rectangle, with centreline dimensions. */
export function dimensionRectangle(
  project: HouseProject,
  width: number,
  depth: number,
): HouseProject {
  const level = project.levels[0],
    plan = level?.plan;
  if (
    !plan?.freehand ||
    project.walls.length !== 4 ||
    project.rooms.length !== 1 ||
    project.doors.length ||
    project.windows.length
  )
    throw new Error(
      "Use this on a four-wall rectangle before adding openings. Other plans use individual wall dimensions.",
    );
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(depth) ||
    width < 200 ||
    depth < 200
  )
    throw new Error("Enter dimensions of at least 0.20 m.");
  const walls = plan.interiorWalls ?? [];
  if (
    walls.some(
      (w) =>
        Math.min(Math.abs(w.end.x - w.start.x), Math.abs(w.end.y - w.start.y)) >
        Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) * 0.03,
    )
  )
    throw new Error(
      "This is not an axis-aligned rectangle. Use individual wall dimensions.",
    );
  const points = walls.flatMap((w) => [w.start, w.end]),
    xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const map = (p: Point) => ({
    x: minX + (p.x < (minX + maxX) / 2 ? 0 : width),
    y: minY + (p.y < (minY + maxY) / 2 ? 0 : depth),
  });
  const nextPlan = {
    ...plan,
    interiorWalls: walls.map((w) => ({
      ...w,
      start: map(w.start),
      end: map(w.end),
    })),
  };
  const next = rebuildLevel(
    project,
    level!.id,
    withDerivedZones(plan, nextPlan),
  );
  return {
    ...next,
    freehandSketch: project.freehandSketch
      ? { ...project.freehandSketch, calibrated: true }
      : undefined,
    measuredWalls: next.walls.map((w) => ({
      id: w.id,
      length: distance(w.start, w.end),
    })),
  };
}
export function dimensionConflicts(project: HouseProject): string[] {
  return (project.measuredWalls ?? [])
    .filter((c) => {
      const w = project.walls.find((w) => w.id === c.id);
      return !w || Math.abs(distance(w.start, w.end) - c.length) > 0.1;
    })
    .map((c) => c.id);
}

/** A first known length sets scale; subsequent entries edit the native wall. */
export function calibrateFromWall(
  project: HouseProject,
  wallId: string,
  length: number,
): HouseProject {
  const wall = project.walls.find((w) => w.id === wallId),
    level = wall && project.levels.find((l) => l.id === wall.levelId);
  if (!wall || !level?.plan?.freehand || !project.freehandSketch)
    return project;
  if (!Number.isFinite(length) || length < 200)
    throw new Error("Enter a wall length of at least 0.20 m.");
  if (
    project.levels.length !== 1 ||
    project.components.length ||
    project.doors.length ||
    project.windows.length
  )
    throw new Error(
      "Set the sketch scale before adding openings, furniture or floors.",
    );
  const ratio = length / distance(wall.start, wall.end),
    origin = wall.start;
  const scale = (p: Point) => ({
    x: origin.x + (p.x - origin.x) * ratio,
    y: origin.y + (p.y - origin.y) * ratio,
  });
  const plan = level.plan;
  const scaled = {
    ...plan,
    interiorWalls: plan.interiorWalls?.map((w) => ({
      ...w,
      start: scale(w.start),
      end: scale(w.end),
    })),
  };
  const next = rebuildLevel(project, level.id, withDerivedZones(plan, scaled));
  return {
    ...next,
    freehandSketch: {
      ...project.freehandSketch,
      mmPerUnit: project.freehandSketch.mmPerUnit * ratio,
      calibrated: true,
    },
    measuredWalls: [{ id: wallId, length }],
  };
}
export function rememberWallLength(
  project: HouseProject,
  wallId: string,
): HouseProject {
  const wall = project.walls.find((w) => w.id === wallId);
  if (!project.freehandSketch || !wall) return project;
  return {
    ...project,
    measuredWalls: [
      ...(project.measuredWalls ?? []).filter((c) => c.id !== wallId),
      { id: wallId, length: distance(wall.start, wall.end) },
    ],
  };
}
