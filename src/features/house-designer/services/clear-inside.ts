import type { HouseProject } from "../types/project";

type Point = { x: number; y: number };

/**
 * The finished floor of a room.
 *
 * A room's boundary runs along wall centre-lines (a native 4000 x 5000 room
 * has a boundary of exactly 4000 x 5000 with 150 mm walls), so its area counts
 * half of every wall that surrounds it. Floor finishes are laid between the
 * wall faces: each edge is moved inwards by half the thickness of the wall that
 * stands on it, and an edge with no wall on it (open space) stays where it is.
 *
 * When the offset cannot be trusted (a room too small for its walls, a result
 * that turns inside out) the answer is `exact: false` and the boundary itself,
 * so a caller can say the figure is centre-line rather than quietly shrink it
 * to nonsense.
 */
export function clearInsideBoundary(
  boundary: readonly Point[],
  walls: readonly Pick<HouseProject["walls"][number], "start" | "end" | "thickness">[],
): { polygon: Point[]; exact: boolean } {
  const original = boundary.map((point) => ({ x: point.x, y: point.y }));
  const count = original.length;
  if (count < 3) return { polygon: original, exact: false };

  const orientation = Math.sign(signedArea(original));
  if (orientation === 0) return { polygon: original, exact: false };

  // Inward unit normal and offset of every edge.
  const lines = original.map((from, index) => {
    const to = original[(index + 1) % count]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < 1e-6) return null;
    const direction = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
    // For a counter-clockwise polygon the interior is to the left of travel.
    const normal = { x: -direction.y * orientation, y: direction.x * orientation };
    const half = wallThicknessOn(from, to, walls) / 2;
    return { point: { x: from.x + normal.x * half, y: from.y + normal.y * half }, direction };
  });
  if (lines.some((line) => line === null)) return { polygon: original, exact: false };

  const polygon: Point[] = [];
  for (let index = 0; index < count; index += 1) {
    const previous = lines[(index + count - 1) % count]!;
    const next = lines[index]!;
    const cross = previous.direction.x * next.direction.y - previous.direction.y * next.direction.x;
    if (Math.abs(cross) < 1e-9) {
      // Two edges in a straight line: the corner slides along with them.
      polygon.push({ x: next.point.x, y: next.point.y });
      continue;
    }
    const along =
      ((next.point.x - previous.point.x) * next.direction.y - (next.point.y - previous.point.y) * next.direction.x) / cross;
    polygon.push({ x: previous.point.x + previous.direction.x * along, y: previous.point.y + previous.direction.y * along });
  }

  // An edge that ends up running backwards means the walls ate the room: the
  // offset rectangle of a 300 mm room with 400 mm walls is "-100 mm" wide and
  // still has a positive area, so the sign of the area alone does not catch it.
  const reversed = polygon.some((from, index) => {
    const to = polygon[(index + 1) % count]!;
    const line = lines[index]!;
    return (to.x - from.x) * line.direction.x + (to.y - from.y) * line.direction.y < -1e-6;
  });
  if (reversed) return { polygon: original, exact: false };

  const area = signedArea(polygon);
  const before = Math.abs(signedArea(original));
  const turnedInsideOut = Math.sign(area) !== orientation;
  if (turnedInsideOut || Math.abs(area) <= 0 || Math.abs(area) > before + 1e-6 || !polygon.every(isFinitePoint)) {
    return { polygon: original, exact: false };
  }
  return { polygon, exact: true };
}

/** Area in m² of the finished floor, and whether it is measured to the wall faces. */
export function clearInsideArea(
  boundary: readonly Point[],
  walls: readonly Pick<HouseProject["walls"][number], "start" | "end" | "thickness">[],
): { area: number; exact: boolean } {
  const { polygon, exact } = clearInsideBoundary(boundary, walls);
  return { area: Math.abs(signedArea(polygon)) / 1_000_000, exact };
}

/** The thickest wall whose centre-line carries the whole edge, or 0 for open space. */
function wallThicknessOn(
  from: Point,
  to: Point,
  walls: readonly Pick<HouseProject["walls"][number], "start" | "end" | "thickness">[],
): number {
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  let best = 0;
  for (const wall of walls) {
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    if (length < 1) continue;
    const direction = { x: (wall.end.x - wall.start.x) / length, y: (wall.end.y - wall.start.y) / length };
    const offset = Math.abs((middle.x - wall.start.x) * -direction.y + (middle.y - wall.start.y) * direction.x);
    const along = (middle.x - wall.start.x) * direction.x + (middle.y - wall.start.y) * direction.y;
    // Within a millimetre of the centre-line, and the edge's midpoint on the wall.
    if (offset <= 1 && along >= -1 && along <= length + 1) best = Math.max(best, wall.thickness);
  }
  return best;
}

function signedArea(points: readonly Point[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function isFinitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}
