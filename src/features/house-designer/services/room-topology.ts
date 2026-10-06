import type { Room } from "@/features/berchuma-studio/types/room";

/**
 * Rooms come from walls.
 *
 *   walls → junctions → planar graph → closed faces → rooms → floors
 *
 * A room's outline is never stored against a wall and dragged with it. After
 * every wall edit the walls' centrelines are joined where they meet — end to
 * end, an end on a wall (a T), two walls crossing (an X), each within a small
 * snap distance — the graph's closed faces are traced, and each face is a
 * room. The rooms there were before are matched to the new faces by how much
 * they overlap, so a room keeps its id, name and finishes when its walls
 * move; one whose walls no longer close is kept aside as not enclosed (no
 * floor, no ceiling) and comes back by itself when they close again. The
 * floor and ceiling meshes are built from these outlines and are never the
 * source of anything.
 */

type Point = { x: number; y: number };
type Zone = NonNullable<Room["zones"]>[number];

/** A wall's centreline and how far its face is from it. */
export type WallLine = { start: Point; end: Point; thickness: number; fixed?: boolean };

/** Faces thinner than this are slivers between walls drawn nearly on top of each other, not rooms. */
const MIN_FACE_WIDTH = 100;
/** Points closer than this are one point. */
const MERGE = 1;

/** The level's walls as centrelines: the outline's sides, then the inside walls. */
export function planWallLines(plan: Room): WallLine[] {
  const corners = plan.corners;
  return [
    ...corners.map((corner, index) => ({ start: { x: corner.x, y: corner.y }, end: { x: corners[(index + 1) % corners.length]!.x, y: corners[(index + 1) % corners.length]!.y }, thickness: plan.wallThickness, fixed: true })),
    ...(plan.interiorWalls ?? []).map((wall) => ({ start: { ...wall.start }, end: { ...wall.end }, thickness: wall.thickness })),
  ];
}

/** How near an end must come to another wall to be joined to it: inside that wall, and a little. */
const reachOf = (line: WallLine) => line.thickness / 2 + 5;

/**
 * Snaps each loose end onto what it touches: another wall's end first, else
 * the nearest point on another wall's centreline (a T). The outline's corners
 * stay where they are; only inside walls' ends move, and only by less than
 * the wall they meet is thick.
 */
export function joinWallEnds(lines: readonly WallLine[]): WallLine[] {
  const out = lines.map((line) => ({ ...line, start: { ...line.start }, end: { ...line.end } }));
  const ends = (index: number) => [out[index]!.start, out[index]!.end] as const;
  endToEnd(out);
  // An end on a wall: a T.
  for (let index = 0; index < out.length; index += 1) {
    if (out[index]!.fixed) continue;
    for (const end of ends(index)) {
      if (out.some((line, other) => other !== index && (samePoint(line.start, end) || samePoint(line.end, end)))) continue;
      let best: { point: Point; distance: number } | null = null;
      for (let other = 0; other < out.length; other += 1) {
        if (other === index) continue;
        const line = out[other]!;
        const foot = projectOnto(end, line.start, line.end);
        if (!foot || foot.t <= 0 || foot.t >= 1) continue;
        const distance = Math.hypot(foot.point.x - end.x, foot.point.y - end.y);
        if (distance <= reachOf(line) && (!best || distance < best.distance)) best = { point: foot.point, distance };
      }
      if (best && best.distance > 0) { end.x = best.point.x; end.y = best.point.y; }
    }
  }
  // Two ends that met at a third, which then moved onto a wall, meet again.
  endToEnd(out);
  return out;
}

function endToEnd(out: WallLine[]) {
  const ends = (index: number) => [out[index]!.start, out[index]!.end] as const;
  for (let index = 0; index < out.length; index += 1) {
    if (out[index]!.fixed) continue;
    for (const end of ends(index)) {
      let best: { point: Point; distance: number; fixed: boolean } | null = null;
      for (let other = 0; other < out.length; other += 1) {
        if (other === index) continue;
        const reach = Math.max(reachOf(out[index]!), reachOf(out[other]!));
        for (const candidate of ends(other)) {
          const distance = Math.hypot(candidate.x - end.x, candidate.y - end.y);
          if (distance > reach) continue;
          const fixed = Boolean(out[other]!.fixed);
          // The outline's corners win; then the nearest.
          if (!best || (fixed && !best.fixed) || (fixed === best.fixed && distance < best.distance)) best = { point: candidate, distance, fixed };
        }
      }
      if (best && best.distance > 0) { end.x = best.point.x; end.y = best.point.y; }
    }
  }
}

type Graph = { points: Point[]; edges: [number, number][] };

/**
 * The walls as a planar graph: a vertex wherever walls meet or cross, an edge
 * for each stretch of wall between two vertices.
 */
export function wallGraph(lines: readonly WallLine[]): Graph {
  const joined = joinWallEnds(lines).filter((line) => !samePoint(line.start, line.end));
  const points: Point[] = [];
  const vertex = (point: Point) => {
    const found = points.findIndex((item) => samePoint(item, point, MERGE));
    if (found >= 0) return found;
    points.push({ x: point.x, y: point.y });
    return points.length - 1;
  };
  const keys = new Set<string>();
  const edges: [number, number][] = [];
  for (let index = 0; index < joined.length; index += 1) {
    const line = joined[index]!;
    const cuts: { t: number; point: Point }[] = [{ t: 0, point: line.start }, { t: 1, point: line.end }];
    for (let other = 0; other < joined.length; other += 1) {
      if (other === index) continue;
      const second = joined[other]!;
      // The other wall's ends where they lie on this one.
      for (const end of [second.start, second.end]) {
        const foot = projectOnto(end, line.start, line.end);
        if (foot && foot.t > 0 && foot.t < 1 && Math.hypot(foot.point.x - end.x, foot.point.y - end.y) <= MERGE) cuts.push({ t: foot.t, point: end });
      }
      // Where the two cross.
      const crossing = intersection(line.start, line.end, second.start, second.end);
      if (crossing && crossing.t > 0 && crossing.t < 1) cuts.push(crossing);
    }
    cuts.sort((a, b) => a.t - b.t);
    for (let cut = 0; cut < cuts.length - 1; cut += 1) {
      const a = vertex(cuts[cut]!.point);
      const b = vertex(cuts[cut + 1]!.point);
      if (a === b) continue;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (keys.has(key)) continue;
      keys.add(key);
      edges.push([a, b]);
    }
  }
  return { points, edges };
}

/**
 * The closed faces of the walls' graph: every region the walls enclose, as a
 * polygon without repeated or straight-through corners, anticlockwise in plan
 * coordinates (positive signed area, as the outline is drawn). The unbounded
 * region outside is not a face; neither is a sliver.
 */
export function wallFaces(lines: readonly WallLine[]): Point[][] {
  const graph = wallGraph(lines);
  let edges = graph.edges;
  for (let guard = 0; guard < 50; guard += 1) {
    const { faces, bridges } = traceFaces(graph.points, edges);
    if (!bridges.size) {
      return faces
        .map((face) => tidy(face.map((index) => graph.points[index]!)))
        .filter((face) => face.length >= 3 && signedArea(face) > 0 && (2 * signedArea(face)) / perimeter(face) >= MIN_FACE_WIDTH / 2)
        .map(startAtTopLeft);
    }
    // A stretch of wall with the same space on both sides — a loose end, a
    // wall standing free, one joining an island to the walls round it —
    // bounds nothing; out it goes, and the faces are traced again.
    edges = edges.filter((_, index) => !bridges.has(index));
  }
  return [];
}

function traceFaces(points: readonly Point[], edges: readonly [number, number][]) {
  // Outgoing half-edges at each vertex, by angle.
  const around = new Map<number, { to: number; edge: number; angle: number }[]>();
  edges.forEach(([a, b], edge) => {
    for (const [from, to] of [[a, b], [b, a]] as const) {
      const list = around.get(from) ?? [];
      list.push({ to, edge, angle: Math.atan2(points[to]!.y - points[from]!.y, points[to]!.x - points[from]!.x) });
      around.set(from, list);
    }
  });
  for (const list of around.values()) list.sort((p, q) => p.angle - q.angle);
  const used = new Set<string>();
  const faces: number[][] = [];
  const faceOfEdge = new Map<number, number[]>();
  for (const [a, b] of edges) {
    for (const [from, to] of [[a, b], [b, a]] as const) {
      if (used.has(`${from}>${to}`)) continue;
      const face: number[] = [];
      const faceIndex = faces.length;
      let u = from;
      let v = to;
      for (let guard = 0; guard <= edges.length * 2 + 1; guard += 1) {
        const key = `${u}>${v}`;
        if (used.has(key)) break;
        used.add(key);
        face.push(u);
        const list = around.get(v)!;
        const back = list.findIndex((item) => item.to === u);
        const turn = list[(back - 1 + list.length) % list.length]!;
        const edge = list[back]!.edge;
        faceOfEdge.set(edge, [...(faceOfEdge.get(edge) ?? []), faceIndex]);
        u = v;
        v = turn.to;
      }
      faces.push(face);
    }
  }
  const bridges = new Set<number>();
  for (const [edge, sides] of faceOfEdge) if (sides.length === 2 && sides[0] === sides[1]) bridges.add(edge);
  return { faces, bridges };
}

/**
 * A plan's rooms after its walls have changed, from the rooms it had before.
 *
 * `before` is the plan as it was — walls and rooms — and `after` the plan
 * with its new walls (its rooms are ignored). Each room that was a closed
 * face of the old walls (or more than one face, drawn before the wall that
 * divided it) is followed to the new face it overlaps most; a face left
 * unclaimed that was part of a room, or that encloses ground nothing
 * enclosed before, is a new room. A room drawn over part of a space, with no
 * walls of its own, is left as it was.
 */
export function deriveZones(before: Room, after: Room): Room["zones"] {
  const zones = before.zones;
  if (!zones?.length) return after.zones;
  const oldFaces = wallFaces(planWallLines(before));
  const newFaces = wallFaces(planWallLines(after));

  // Which rooms follow the walls.
  const tracked = new Set<Zone>();
  for (const zone of zones) {
    if (zone.enclosed === false) { tracked.add(zone); continue; }
    const area = Math.abs(signedArea(zone.boundary));
    if (!area) continue;
    if (oldFaces.some((face) => iou(zone.boundary, face) >= 0.9)) { tracked.add(zone); continue; }
    // A room the walls divide, but drawn as one: every face it covers lies in it.
    const inside = oldFaces.filter((face) => overlapArea(face, zone.boundary) >= 0.9 * signedArea(face));
    if (inside.length && inside.reduce((sum, face) => sum + signedArea(face), 0) >= 0.9 * area) tracked.add(zone);
  }
  const fixedZones = zones.filter((zone) => !tracked.has(zone));

  // Best matches first: the pair that is most nearly the same shape.
  const pairs: { zone: Zone; face: number; score: number }[] = [];
  for (const zone of tracked) {
    const area = Math.abs(signedArea(zone.boundary));
    newFaces.forEach((face, index) => {
      const shared = overlapArea(zone.boundary, face);
      if (shared < 0.5 * Math.min(area, signedArea(face))) return;
      pairs.push({ zone, face: index, score: shared / (area + signedArea(face) - shared) });
    });
  }
  // At a tie, a room that is enclosed keeps its space before one coming back.
  pairs.sort((a, b) => b.score - a.score || Number(a.zone.enclosed === false) - Number(b.zone.enclosed === false));
  const faceOf = new Map<Zone, number>();
  const claimed = new Set<number>();
  for (const pair of pairs) {
    if (faceOf.has(pair.zone) || claimed.has(pair.face)) continue;
    faceOf.set(pair.zone, pair.face);
    claimed.add(pair.face);
  }

  // Then by where it is and how big, for a room whose walls all moved
  // together farther than it is wide: about the same size, its centre the
  // nearest, and no farther than twice across.
  for (const zone of [...tracked].sort((a, b) => Number(a.enclosed === false) - Number(b.enclosed === false))) {
    if (faceOf.has(zone)) continue;
    const area = Math.abs(signedArea(zone.boundary));
    const centre = centroid(zone.boundary);
    const reach = 2 * diagonal(zone.boundary);
    let best: { index: number; distance: number } | null = null;
    newFaces.forEach((face, index) => {
      const faceArea = signedArea(face);
      if (claimed.has(index) || faceArea < 0.8 * area || faceArea > 1.25 * area) return;
      const at = centroid(face);
      const distance = Math.hypot(at.x - centre.x, at.y - centre.y);
      if (distance <= reach && (!best || distance < best.distance)) best = { index, distance };
    });
    if (best) { faceOf.set(zone, (best as { index: number }).index); claimed.add((best as { index: number }).index); }
  }

  const result: Zone[] = zones.map((zone) => {
    if (!tracked.has(zone)) return zone;
    const face = faceOf.get(zone);
    const { enclosed: _enclosed, ...rest } = zone;
    void _enclosed;
    // Its walls no longer close: kept as it last was, without a floor, until they do.
    if (face === undefined) return { ...rest, enclosed: false };
    return { ...rest, boundary: newFaces[face]!.map(micronPoint) };
  });

  // Faces nobody claimed.
  const owned = oldFaces.filter((face) => [...tracked].some((zone) => zone.enclosed !== false && overlapArea(face, zone.boundary) >= 0.5 * signedArea(face)));
  const names = new Set(result.map((zone) => zone.name));
  newFaces.forEach((face, index) => {
    if (claimed.has(index)) return;
    const area = signedArea(face);
    if (fixedZones.reduce((sum, zone) => sum + overlapArea(face, zone.boundary), 0) >= 0.5 * area) return;
    const wasRoom = owned.reduce((sum, old) => sum + overlapArea(face, old), 0) >= 0.5 * area;
    const wasEnclosed = oldFaces.reduce((sum, old) => sum + overlapArea(face, old), 0) >= 0.05 * area;
    if (!wasRoom && wasEnclosed) return;
    let number = result.length + 1;
    while (names.has(`Room ${number}`)) number += 1;
    names.add(`Room ${number}`);
    result.push({ id: `zone-${crypto.randomUUID()}`, name: `Room ${number}`, boundary: face.map(micronPoint), floorMaterial: "Unspecified", wallMaterial: "Paint", ceilingMaterial: "Gypsum board" });
  });
  return result;
}

/** A plan whose rooms are rebuilt from its walls, given the plan before the walls changed. */
export function withDerivedZones(before: Room, after: Room): Room {
  const zones = deriveZones(before, after);
  return zones === after.zones ? after : { ...after, zones };
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function samePoint(a: Point, b: Point, tolerance = MERGE) { return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance; }

function projectOnto(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return null;
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
  return { t, point: { x: a.x + dx * t, y: a.y + dy * t } };
}

function intersection(a: Point, b: Point, c: Point, d: Point) {
  const rx = b.x - a.x; const ry = b.y - a.y;
  const sx = d.x - c.x; const sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denominator;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denominator;
  if (u <= 0 || u >= 1) return null;
  return { t, point: { x: a.x + rx * t, y: a.y + ry * t } };
}

export function signedArea(points: readonly Point[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) { const p = points[index]!; const q = points[(index + 1) % points.length]!; sum += p.x * q.y - q.x * p.y; }
  return sum / 2;
}

function centroid(points: readonly Point[]): Point {
  const area = signedArea(points);
  if (!area) return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
  let x = 0;
  let y = 0;
  points.forEach((point, index) => { const next = points[(index + 1) % points.length]!; const cross = point.x * next.y - next.x * point.y; x += (point.x + next.x) * cross; y += (point.y + next.y) * cross; });
  return { x: x / (6 * area), y: y / (6 * area) };
}

function diagonal(points: readonly Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

function perimeter(points: readonly Point[]) {
  return points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]!; return sum + Math.hypot(next.x - point.x, next.y - point.y); }, 0);
}

/** Without repeated corners, or corners in the middle of a straight run. */
function tidy(points: readonly Point[]): Point[] {
  let out = points.filter((point, index) => !samePoint(point, points[(index + 1) % points.length]!));
  for (let changed = true; changed && out.length > 3;) {
    changed = false;
    for (let index = 0; index < out.length; index += 1) {
      const before = out[(index - 1 + out.length) % out.length]!;
      const point = out[index]!;
      const after = out[(index + 1) % out.length]!;
      const length = Math.hypot(after.x - before.x, after.y - before.y) || 1;
      if (Math.abs((point.x - before.x) * (after.y - before.y) - (point.y - before.y) * (after.x - before.x)) / length < 0.5) {
        out = out.filter((_, other) => other !== index);
        changed = true;
        break;
      }
    }
  }
  return out;
}

function startAtTopLeft(points: Point[]): Point[] {
  let first = 0;
  points.forEach((point, index) => { const best = points[first]!; if (point.y < best.y - 0.5 || (Math.abs(point.y - best.y) <= 0.5 && point.x < best.x)) first = index; });
  return [...points.slice(first), ...points.slice(0, first)];
}

function micronPoint(point: Point): Point { return { x: Math.round(point.x * 1000) / 1000, y: Math.round(point.y * 1000) / 1000 }; }

export function pointInPolygon(point: Point, polygon: readonly Point[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index]!;
    const b = polygon[previous]!;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * The area two polygons share, measured on a fine grid over the box they
 * share — enough to tell which room became which face, and robust for any
 * simple polygon, convex or not.
 */
export function overlapArea(a: readonly Point[], b: readonly Point[]) {
  const box = (points: readonly Point[]) => ({ minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)), minY: Math.min(...points.map((p) => p.y)), maxY: Math.max(...points.map((p) => p.y)) });
  const p = box(a);
  const q = box(b);
  const minX = Math.max(p.minX, q.minX); const maxX = Math.min(p.maxX, q.maxX);
  const minY = Math.max(p.minY, q.minY); const maxY = Math.min(p.maxY, q.maxY);
  if (maxX <= minX || maxY <= minY) return 0;
  const steps = 64;
  const cellX = (maxX - minX) / steps;
  const cellY = (maxY - minY) / steps;
  let hits = 0;
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const point = { x: minX + (i + 0.5) * cellX, y: minY + (j + 0.5) * cellY };
      if (pointInPolygon(point, a) && pointInPolygon(point, b)) hits += 1;
    }
  }
  return hits * cellX * cellY;
}

function iou(a: readonly Point[], b: readonly Point[]) {
  const shared = overlapArea(a, b);
  return shared / (Math.abs(signedArea(a)) + Math.abs(signedArea(b)) - shared || 1);
}
