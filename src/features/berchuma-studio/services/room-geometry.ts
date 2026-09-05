import type { RunSpec } from "../types/layout";
import {
  wallLabel,
  type Room,
  type RoomOpening,
  type Wall,
} from "../types/room";

/**
 * Walking a room polygon, and handing what comes out to the engine that
 * already works.
 *
 * The whole design rests on one decision: the room does not replace `runs`, it
 * *derives* them. services/layout.ts, buildParts, buildCutList and
 * calculateCost receive exactly what they receive today and are not touched.
 * Lengthening a wall on the plan changes a run length, which moves the
 * cabinets, which changes the cut list, which changes the price — through the
 * path that already exists rather than a second one built beside it.
 *
 * A design with no room keeps its stored runs and behaves exactly as before.
 */

/** Two points closer than this are the same point. */
const EPSILON = 0.5;

/**
 * The walls, in order round the room.
 *
 * `inward` is the tricky part and worth stating: it is the normal pointing
 * into the room, which is what decides which side of a wall a cabinet stands
 * on and which way a door swings. It depends on whether the polygon was drawn
 * clockwise or anticlockwise, so the winding is measured rather than assumed —
 * a user dragging corners will reverse it sooner or later, and a room whose
 * cabinets are suddenly outside it is a bug nobody would guess the cause of.
 */
export function roomWalls(room: Room): Wall[] {
  const corners = room.corners;
  if (corners.length < 3) return [];

  // Positive here means the corners run *clockwise on the drawing*, because y
  // runs down a screen and the shoelace sum flips sign with it. Naming it for
  // the sign rather than for a handedness that inverts between the maths and
  // the drawing is what stops the next person getting this backwards — the
  // first version of this file had the two branches the wrong way round, and
  // every wall's normal pointed out of the room.
  const positiveWinding = signedArea(room) > 0;
  const walls: Wall[] = [];

  for (let index = 0; index < corners.length; index += 1) {
    const start = corners[index];
    const end = corners[(index + 1) % corners.length];

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);

    // A zero-length wall is two corners on top of each other. Dropping it is
    // right: it has no direction, so `inward` would be meaningless, and every
    // consumer would have to guard against it.
    if (length < EPSILON) continue;

    // Rotating the wall direction a quarter turn gives the normal; the
    // winding decides which of the two quarter turns points inwards.
    const inward = positiveWinding
      ? { x: -dy / length, y: dx / length }
      : { x: dy / length, y: -dx / length };

    walls.push({
      id: start.id,
      label: wallLabel(walls.length),
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      length,
      angle: (Math.atan2(-dy, dx) * 180) / Math.PI,
      inward,
    });
  }

  return walls;
}

/**
 * Twice the signed area of the polygon — the shoelace sum.
 *
 * Only its sign is used, to tell a clockwise room from an anticlockwise one.
 * On a drawing where y runs *down*, a clockwise polygon has negative area.
 */
export function signedArea(room: Room): number {
  const corners = room.corners;
  let sum = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const a = corners[index];
    const b = corners[(index + 1) % corners.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Floor area in square metres, as a client asks for it. */
export function floorArea(room: Room): number {
  return Math.abs(signedArea(room)) / 1_000_000;
}

/** The openings in one wall, in order along it. */
export function openingsOn(room: Room, wallId: string): RoomOpening[] {
  return room.openings
    .filter((opening) => opening.wallId === wallId)
    .sort((a, b) => a.offset - b.offset);
}

/**
 * The runs to hand the layout solver.
 *
 * One per wall the person chose to put cabinets against, in the order they
 * chose them — which is what makes the corner between wall A and wall B the
 * corner the solver already knows how to carve out.
 *
 * `depth` and `height` come from the design rather than the room: a wall does
 * not have a depth, a run of cabinets does, and it is the same on every wall
 * unless somebody says otherwise.
 */
export function runsFromRoom(
  room: Room,
  fallback: { depth: number; height: number },
  existing: RunSpec[] = [],
): RunSpec[] {
  const walls = roomWalls(room);
  const byId = new Map(walls.map((wall) => [wall.id, wall]));

  const chosen = room.runWalls
    .map((id) => byId.get(id))
    .filter((wall): wall is Wall => wall !== undefined);

  if (chosen.length === 0) return existing;

  return chosen.map((wall, index) => {
    // Depth and height are kept from the run that was already on this wall, so
    // somebody who set a 650 mm run does not lose it by dragging a corner.
    const previous = existing.find((run) => run.id === `wall-${wall.id}`) ?? existing[index];

    return {
      id: `wall-${wall.id}`,
      label: wall.label,
      length: Math.round(wall.length),
      depth: previous?.depth ?? fallback.depth,
      height: previous?.height ?? fallback.height,
    };
  });
}

export type Clash = {
  severity: "error" | "warning";
  /** The cabinet, and what it is fouling. */
  cabinetId: string;
  cabinetLabel: string;
  openingId: string;
  message: string;
};

/** How much floor a door needs in front of it before it is a nuisance. */
const DOOR_CLEARANCE = 100;

/**
 * Cabinets that have been put where a door or a window is.
 *
 * §10, and the reason it is a warning rather than a refusal: a base unit under
 * a window is completely normal, and a joiner who wants one should not have to
 * argue with the software. A base unit across a doorway is not, and that is
 * the one this raises as an error.
 *
 * The comparison is one-dimensional on purpose. Both the cabinets and the
 * openings are positioned along the same wall, so the question is whether two
 * intervals overlap — no polygons, no projection, and an answer a person can
 * check with a tape measure.
 */
export function openingClashes(
  room: Room,
  cabinets: { id: string; label: string; runId?: string; offset?: number; size: { width: number; height: number } }[],
): Clash[] {
  const clashes: Clash[] = [];

  for (const cabinet of cabinets) {
    // A cabinet with no wall is an island; it cannot foul a wall opening.
    if (!cabinet.runId || cabinet.offset === undefined) continue;

    const wallId = cabinet.runId.replace(/^wall-/, "");
    const left = cabinet.offset;
    const right = cabinet.offset + cabinet.size.width;

    for (const opening of openingsOn(room, wallId)) {
      const from = opening.offset;
      const to = opening.offset + opening.width;

      const overlaps = left < to && right > from;
      if (!overlaps) continue;

      if (opening.kind === "door" || opening.kind === "passage") {
        clashes.push({
          severity: "error",
          cabinetId: cabinet.id,
          cabinetLabel: cabinet.label,
          openingId: opening.id,
          message: `${cabinet.label} blocks the ${opening.kind}${
            opening.label ? ` (${opening.label})` : ""
          }. Nothing can stand in a doorway.`,
        });
        continue;
      }

      // A window. A base unit under one is normal; a tall unit across one is
      // not, and the sill is what tells them apart.
      const tallerThanSill = cabinet.size.height > opening.sill;
      if (tallerThanSill) {
        clashes.push({
          severity: "warning",
          cabinetId: cabinet.id,
          cabinetLabel: cabinet.label,
          openingId: opening.id,
          message: `${cabinet.label} is ${cabinet.size.height} mm tall and the window sill is at ${opening.sill} mm. It will stand in front of the glass.`,
        });
      }
    }
  }

  return clashes;
}

/** Doors with something parked in the space they swing into. */
export function doorClearance(room: Room): string[] {
  const notes: string[] = [];
  const walls = roomWalls(room);

  for (const opening of room.openings) {
    if (opening.kind !== "door") continue;
    const wall = walls.find((one) => one.id === opening.wallId);
    if (!wall) continue;

    if (opening.offset < DOOR_CLEARANCE) {
      notes.push(
        `The door on ${wall.label} is ${Math.round(opening.offset)} mm from the corner. A door needs room for its hinge side.`,
      );
    }
    if (opening.offset + opening.width > wall.length - DOOR_CLEARANCE) {
      notes.push(
        `The door on ${wall.label} reaches the far corner. Check it can open fully.`,
      );
    }
  }

  return notes;
}

/** Openings that do not fit in the wall they are in. */
export function openingFaults(room: Room): string[] {
  const faults: string[] = [];
  const walls = roomWalls(room);

  for (const opening of room.openings) {
    const wall = walls.find((one) => one.id === opening.wallId);
    if (!wall) {
      faults.push(`An opening is on a wall that no longer exists.`);
      continue;
    }
    if (opening.offset + opening.width > wall.length + EPSILON) {
      faults.push(
        `${opening.label || opening.kind} is ${Math.round(
          opening.offset + opening.width - wall.length,
        )} mm wider than the space left on ${wall.label}.`,
      );
    }
    if (opening.sill + opening.height > room.ceilingHeight + EPSILON) {
      faults.push(
        `${opening.label || opening.kind} reaches ${
          opening.sill + opening.height
        } mm, above the ${room.ceilingHeight} mm ceiling.`,
      );
    }
  }

  return faults;
}

/**
 * Where the room sits relative to the design.
 *
 * The layout solver puts the first run at the origin, travelling along +x.
 * The room is drawn wherever somebody happened to draw it. To show both in one
 * scene, one of them has to move — and it has to be the room, because moving
 * the design would mean re-solving every cabinet position and the whole point
 * of deriving runs is that it does not.
 *
 * So this returns the rotation and translation that carry the first chosen
 * wall's start corner onto the origin with the wall running along +x. Applied
 * to the room, the walls land exactly where the cabinets already are.
 *
 * Returning null rather than an identity transform when no wall is chosen: a
 * room with no runs has no relationship to the design at all, and pretending
 * it is aligned would put it somewhere arbitrary and look deliberate.
 */
export function roomTransform(
  room: Room,
): { angle: number; origin: { x: number; y: number } } | null {
  const walls = roomWalls(room);
  const firstId = room.runWalls[0];
  const wall = walls.find((one) => one.id === firstId);
  if (!wall) return null;

  // The wall's own bearing on the plan — not the rotation to apply. The
  // transform rotates by *minus* this to bring the wall onto +x, and a scene
  // that wants to turn the room the same way rotates by minus it too.
  //
  // Storing the bearing rather than the rotation is deliberate: the first
  // version stored the negation and then used rotation formulas that assumed
  // the bearing, which came out right for the two horizontal walls of a
  // rectangle and backwards for the two vertical ones. Half a room correct is
  // exactly the kind of wrong nobody notices.
  const angle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);

  return { angle, origin: { x: wall.start.x, y: wall.start.y } };
}

/**
 * A room point in the design's own coordinates.
 *
 * Millimetres in, millimetres out. `x` runs along the first wall and `y` away
 * from it into the room, which is what the design calls depth.
 */
export function toDesignSpace(
  room: Room,
  point: { x: number; y: number },
): { x: number; y: number } {
  const transform = roomTransform(room);
  if (!transform) return point;

  const dx = point.x - transform.origin.x;
  const dy = point.y - transform.origin.y;
  const cos = Math.cos(transform.angle);
  const sin = Math.sin(transform.angle);

  // Rotating by minus the wall's bearing, which carries it onto +x.
  return {
    x: dx * cos + dy * sin,
    y: -dx * sin + dy * cos,
  };
}

export type WallPiece = {
  id: string;
  /** Centre in design space, millimetres. */
  centre: { x: number; y: number };
  centreY: number;
  length: number;
  height: number;
  rotation: number;
};

/**
 * A wall, minus its holes, as boxes.
 *
 * Out here rather than in the component that draws it, because the arithmetic
 * of leaving a gap is the part that can be quietly wrong — a wall drawn over
 * its own window looks like a wall, and nothing reports it.
 *
 * A wall with a window becomes three pieces — below the sill, above the head,
 * and the full-height stretches either side. A wall with a door becomes two.
 * Sorting the openings along the wall first is what lets this be a single walk
 * from one end to the other.
 */
export function wallPieces(room: Room): WallPiece[] {
  const pieces: WallPiece[] = [];

  for (const wall of roomWalls(room)) {
    const start = toDesignSpace(room, wall.start);
    const end = toDesignSpace(room, wall.end);
    const rotation = -Math.atan2(-(end.y - start.y), end.x - start.x);

    /** A stretch of full-height wall, from `from` to `to` along it. */
    const solid = (id: string, from: number, to: number, bottom: number, top: number) => {
      const length = to - from;
      if (length <= 1 || top - bottom <= 1) return;
      const middle = (from + to) / 2;
      const along = middle / wall.length;
      pieces.push({
        id,
        centre: {
          x: start.x + (end.x - start.x) * along,
          y: start.y + (end.y - start.y) * along,
        },
        centreY: (bottom + top) / 2,
        length,
        height: top - bottom,
        rotation,
      });
    };

    let cursor = 0;
    for (const opening of openingsOn(room, wall.id)) {
      solid(`${wall.id}-before-${opening.id}`, cursor, opening.offset, 0, room.ceilingHeight);

      // Under a window, and over anything that does not reach the ceiling.
      if (opening.sill > 0) {
        solid(`${wall.id}-under-${opening.id}`, opening.offset, opening.offset + opening.width, 0, opening.sill);
      }
      const head = opening.sill + opening.height;
      if (head < room.ceilingHeight) {
        solid(`${wall.id}-over-${opening.id}`, opening.offset, opening.offset + opening.width, head, room.ceilingHeight);
      }

      cursor = Math.max(cursor, opening.offset + opening.width);
    }

    solid(`${wall.id}-end`, cursor, wall.length, 0, room.ceilingHeight);
  }

  return pieces;
}

