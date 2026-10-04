/**
 * The room, and the runs derived from it.
 *
 *   npx tsx scripts/room_check.ts
 *
 * Two things here fail silently and are worth the file on their own.
 *
 * The inward normal depends on which way round the polygon was drawn. A user
 * dragging corners reverses the winding sooner or later, and a room whose
 * cabinets are suddenly *outside* it renders perfectly, raises nothing, and is
 * a bug nobody would guess the cause of. So every wall of every room below is
 * asserted to point at the middle of the room, both windings.
 *
 * And the derived runs are the join to an engine that already works. If they
 * come out in the wrong order the layout solver carves the corner between the
 * wrong two walls — an L-shaped kitchen laid out round the wrong corner, which
 * looks like a design decision rather than a fault.
 */

import {
  floorArea,
  openingClashes,
  openingFaults,
  doorClearance,
  roomTransform,
  roomWalls,
  runsFromRoom,
  signedArea,
  toDesignSpace,
  wallPieces,
} from "../src/features/berchuma-studio/services/room-geometry.ts";
import {
  rectangularRoom,
  wallLabel,
  type Room,
} from "../src/features/berchuma-studio/types/room.ts";
import { designSpecSchema, validateSpec } from "../src/features/berchuma-studio/types/spec.ts";
import { kitchenExample } from "../src/features/berchuma-studio/services/examples.ts";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const RECT = rectangularRoom(4200, 3600);

/** The same room, drawn the other way round. */
function reversed(room: Room): Room {
  return { ...room, corners: [...room.corners].reverse() };
}

const L_SHAPED: Room = {
  ...RECT,
  corners: [
    { id: "c1", x: 0, y: 0 },
    { id: "c2", x: 4200, y: 0 },
    { id: "c3", x: 4200, y: 2000 },
    { id: "c4", x: 2000, y: 2000 },
    { id: "c5", x: 2000, y: 3600 },
    { id: "c6", x: 0, y: 3600 },
  ],
};

// ---------------------------------------------------------------------------
// 1. Walking the polygon
// ---------------------------------------------------------------------------

const walls = roomWalls(RECT);
check("a four-corner room has four walls", walls.length === 4);
check("the first is Wall A", walls[0]?.label === "Wall A");
check("the last is Wall D", walls[3]?.label === "Wall D");
check("Wall A is 4200 long", Math.round(walls[0]?.length ?? 0) === 4200, String(walls[0]?.length));
check("Wall B is 3600 long", Math.round(walls[1]?.length ?? 0) === 3600, String(walls[1]?.length));
check("the walls close the polygon",
  walls[3]?.end.x === walls[0]?.start.x && walls[3]?.end.y === walls[0]?.start.y);

check("an L-shaped room has six walls", roomWalls(L_SHAPED).length === 6);
check("a three-corner room has three walls",
  roomWalls({ ...RECT, corners: RECT.corners.slice(0, 3) }).length === 3);

// Two corners on the same point have no direction, so no wall.
const doubled: Room = {
  ...RECT,
  corners: [...RECT.corners, { id: "c5", x: 0, y: 0 }],
};
check("a repeated corner does not become a zero-length wall",
  roomWalls(doubled).every((wall) => wall.length > 0.5));

check("the area is right", Math.abs(floorArea(RECT) - 15.12) < 0.001, String(floorArea(RECT)));
check("the area does not depend on the winding",
  Math.abs(floorArea(RECT) - floorArea(reversed(RECT))) < 1e-9);
check("an L-shaped room is smaller than its bounding box", floorArea(L_SHAPED) < 4.2 * 3.6);

// ---------------------------------------------------------------------------
// 2. Which way is in
//
// The one that fails silently. Every wall's inward normal must point at the
// middle of the room, whichever way round the polygon was drawn.
// ---------------------------------------------------------------------------

/**
 * Ray casting: is this point inside the polygon?
 *
 * The obvious test — "does the normal point towards the middle of the room" —
 * is wrong for a concave room, and quietly so. Beside the inner corner of an
 * L the correct normal points *away* from the average of the corners, so that
 * test fails a wall that is right. This asks the question that actually
 * matters instead: take a step along the normal, and see whether you are
 * inside the room.
 */
function inside(room: Room, point: { x: number; y: number }): boolean {
  let within = false;
  const corners = room.corners;

  for (let i = 0, j = corners.length - 1; i < corners.length; j = i, i += 1) {
    const a = corners[i];
    const b = corners[j];
    const straddles = a.y > point.y !== b.y > point.y;
    if (!straddles) continue;
    const crossing = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < crossing) within = !within;
  }

  return within;
}

/** A millimetre in from the wall, which is inside the room or it is not. */
const STEP = 1;

for (const [label, room] of [
  ["a rectangle", RECT],
  ["the same rectangle drawn backwards", reversed(RECT)],
  ["an L-shaped room", L_SHAPED],
  ["an L-shaped room drawn backwards", reversed(L_SHAPED)],
] as const) {
  for (const wall of roomWalls(room)) {
    const midpoint = {
      x: (wall.start.x + wall.end.x) / 2,
      y: (wall.start.y + wall.end.y) / 2,
    };
    check(
      `${label}: a step along ${wall.label}'s normal lands inside the room`,
      inside(room, {
        x: midpoint.x + wall.inward.x * STEP,
        y: midpoint.y + wall.inward.y * STEP,
      }),
    );
    check(
      `${label}: and a step the other way lands outside it`,
      !inside(room, {
        x: midpoint.x - wall.inward.x * STEP,
        y: midpoint.y - wall.inward.y * STEP,
      }),
    );
  }
}

check("the winding is measured, not assumed", signedArea(RECT) * signedArea(reversed(RECT)) < 0);

for (const wall of roomWalls(RECT)) {
  check(`${wall.label}'s normal is a unit vector`,
    Math.abs(Math.hypot(wall.inward.x, wall.inward.y) - 1) < 1e-9);
}

// ---------------------------------------------------------------------------
// 3. The runs handed to the layout solver
// ---------------------------------------------------------------------------

const withRuns: Room = { ...RECT, runWalls: ["c1", "c2"] };
const derived = runsFromRoom(withRuns, { depth: 600, height: 2400 });

check("two chosen walls give two runs", derived.length === 2);
check("the first run is the first wall's length", derived[0]?.length === 4200, String(derived[0]?.length));
check("the second is the second wall's", derived[1]?.length === 3600, String(derived[1]?.length));
check("in the order they were chosen", derived[0]?.id === "wall-c1" && derived[1]?.id === "wall-c2");
check("with the design's depth", derived[0]?.depth === 600);
check("and the design's height", derived[0]?.height === 2400);

// Order is the corner the solver carves. Reversing the choice must reverse the
// runs, not silently keep the old corner.
const other = runsFromRoom({ ...RECT, runWalls: ["c2", "c1"] }, { depth: 600, height: 2400 });
check("choosing the walls the other way round reverses the runs",
  other[0]?.length === 3600 && other[1]?.length === 4200);

// A run's own depth survives a corner being dragged.
const kept = runsFromRoom(
  { ...withRuns, corners: [...RECT.corners.slice(0, 1), { id: "c2", x: 4500, y: 0 }, ...RECT.corners.slice(2)] },
  { depth: 600, height: 2400 },
  [{ id: "wall-c1", label: "Wall A", length: 4200, depth: 650, height: 2200 }],
);
check("lengthening a wall lengthens its run", kept[0]?.length === 4500, String(kept[0]?.length));
check("and keeps the depth already set on it", kept[0]?.depth === 650);
check("and its height", kept[0]?.height === 2200);

// No room chosen: today's behaviour, untouched. This is the promise the whole
// design rests on — a design without a room must not change.
const stored = [{ id: "run-1", label: "Wall A", length: 2400, depth: 600, height: 2400 }];
check("a room with no chosen walls leaves the stored runs alone",
  runsFromRoom(RECT, { depth: 600, height: 2400 }, stored) === stored);
check("and with no stored runs either, gives none",
  runsFromRoom(RECT, { depth: 600, height: 2400 }).length === 0);
check("a wall that has been deleted is dropped from the runs",
  runsFromRoom({ ...RECT, runWalls: ["c1", "gone"] }, { depth: 600, height: 2400 }).length === 1);

// ---------------------------------------------------------------------------
// 4. Cabinets where a door is
// ---------------------------------------------------------------------------

const roomWithOpenings: Room = {
  ...RECT,
  runWalls: ["c1"],
  openings: [
    { id: "d1", kind: "door", wallId: "c1", offset: 3000, width: 900, height: 2100, sill: 0, swing: "in-right", label: "Hall door" },
    { id: "w1", kind: "window", wallId: "c1", offset: 600, width: 1200, height: 1200, sill: 900, swing: "none", label: "Over the sink" },
  ],
};

const cabinet = (id: string, offset: number, width: number, height: number) => ({
  id,
  label: id,
  runId: "wall-c1",
  offset,
  size: { width, height },
});

const acrossTheDoor = openingClashes(roomWithOpenings, [cabinet("base", 2800, 600, 900)]);
check("a cabinet in the doorway is caught", acrossTheDoor.length === 1);
check("and it is an error, not a warning", acrossTheDoor[0]?.severity === "error");
check("and it says so plainly",
  acrossTheDoor[0]?.message.includes("doorway"), acrossTheDoor[0]?.message ?? "");

// A base unit under a window is completely normal and must not be nagged about.
const underTheWindow = openingClashes(roomWithOpenings, [cabinet("base", 700, 600, 870)]);
check("a base unit under a window is not a clash", underTheWindow.length === 0);

// A tall unit across one is.
const acrossTheWindow = openingClashes(roomWithOpenings, [cabinet("tall", 700, 600, 2100)]);
check("a tall unit in front of a window is caught", acrossTheWindow.length === 1);
check("but only as a warning", acrossTheWindow[0]?.severity === "warning");

check("a cabinet clear of everything is fine",
  openingClashes(roomWithOpenings, [cabinet("clear", 1900, 600, 2100)]).length === 0);
check("an island belongs to no wall and clashes with nothing",
  openingClashes(roomWithOpenings, [{ id: "i", label: "Island", size: { width: 1200, height: 900 } }]).length === 0);

// Touching edge to edge is not overlapping.
check("a cabinet ending exactly where the door starts is fine",
  openingClashes(roomWithOpenings, [cabinet("tight", 2400, 600, 900)]).length === 0);
check("and one starting exactly where it ends",
  openingClashes(roomWithOpenings, [cabinet("tight", 3900, 300, 900)]).length === 0);

// ---------------------------------------------------------------------------
// 5. Openings that do not fit
// ---------------------------------------------------------------------------

check("an opening past the end of its wall is reported",
  openingFaults({ ...RECT, openings: [{ id: "d", kind: "door", wallId: "c1", offset: 4000, width: 900, height: 2100, sill: 0, swing: "none", label: "" }] }).length === 1);
check("one that fits is not",
  openingFaults({ ...RECT, openings: [{ id: "d", kind: "door", wallId: "c1", offset: 1000, width: 900, height: 2100, sill: 0, swing: "none", label: "" }] }).length === 0);
check("an opening taller than the ceiling is reported",
  openingFaults({ ...RECT, openings: [{ id: "w", kind: "window", wallId: "c1", offset: 100, width: 900, height: 2000, sill: 1000, swing: "none", label: "" }] }).length === 1);
check("an opening on a wall that has gone is reported",
  openingFaults({ ...RECT, openings: [{ id: "w", kind: "window", wallId: "nope", offset: 0, width: 900, height: 1200, sill: 900, swing: "none", label: "" }] }).length === 1);

check("a door hard against a corner is flagged",
  doorClearance({ ...RECT, openings: [{ id: "d", kind: "door", wallId: "c1", offset: 20, width: 900, height: 2100, sill: 0, swing: "none", label: "" }] }).length > 0);
check("a door in the middle of a wall is not",
  doorClearance({ ...RECT, openings: [{ id: "d", kind: "door", wallId: "c1", offset: 1600, width: 900, height: 2100, sill: 0, swing: "none", label: "" }] }).length === 0);

check("wall labels run A, B, C", wallLabel(0) === "Wall A" && wallLabel(2) === "Wall C");

// ---------------------------------------------------------------------------
// 5b. Lining the room up with the cabinets
//
// The layout solver puts the first run at the origin travelling along +x. The
// room is wherever somebody drew it. If the transform between them is wrong
// the walls render beautifully, half a metre from the cabinets that are
// supposed to stand against them, and it looks like a design decision.
// ---------------------------------------------------------------------------

const alignmentCases: [string, Room][] = [
  ["a rectangle, first wall", { ...RECT, runWalls: ["c1"] }],
  ["a rectangle, second wall", { ...RECT, runWalls: ["c2"] }],
  ["a rectangle, third wall", { ...RECT, runWalls: ["c3"] }],
  ["a rectangle, fourth wall", { ...RECT, runWalls: ["c4"] }],
  ["an L-shaped room", { ...L_SHAPED, runWalls: ["c3"] }],
  ["a rectangle drawn backwards", { ...reversed(RECT), runWalls: ["c3"] }],
];

for (const [label, room] of alignmentCases) {
  const wall = roomWalls(room).find((one) => one.id === room.runWalls[0])!;

  const start = toDesignSpace(room, wall.start);
  const end = toDesignSpace(room, wall.end);

  check(`${label}: the run wall starts at the origin`,
    Math.abs(start.x) < 1e-6 && Math.abs(start.y) < 1e-6,
    `${start.x.toFixed(2)}, ${start.y.toFixed(2)}`);
  check(`${label}: and runs along +x`,
    Math.abs(end.x - wall.length) < 1e-6 && Math.abs(end.y) < 1e-6,
    `${end.x.toFixed(2)}, ${end.y.toFixed(2)} for a ${wall.length.toFixed(0)} wall`);

  // Every other corner has to keep its distance from the run wall's start —
  // a transform that rotates and moves must not also stretch the room.
  for (const corner of room.corners) {
    const before = Math.hypot(corner.x - wall.start.x, corner.y - wall.start.y);
    const after = (({ x, y }) => Math.hypot(x, y))(toDesignSpace(room, corner));
    check(`${label}: the room is not stretched at ${corner.id}`,
      Math.abs(before - after) < 1e-6, `${before.toFixed(2)} vs ${after.toFixed(2)}`);
  }
}

check("a room with no chosen wall has no transform",
  roomTransform(RECT) === null);
check("and its points are left where they are",
  toDesignSpace(RECT, { x: 123, y: 456 }).x === 123);

// ---------------------------------------------------------------------------
// 5c. Walls with the holes left out of them
//
// A wall in 3D is boxes with the openings drawn round rather than subtracted
// from it. A wall drawn over its own window still looks like a wall, and
// nothing anywhere reports it — so the arithmetic is asserted instead.
// ---------------------------------------------------------------------------

const plainRoom: Room = { ...RECT, runWalls: ["c1"] };
check("a room with no openings is one piece per wall",
  wallPieces(plainRoom).length === 4, String(wallPieces(plainRoom).length));

for (const piece of wallPieces(plainRoom)) {
  check(`${piece.id} is full height`, piece.height === plainRoom.ceilingHeight);
  check(`${piece.id} has a positive length`, piece.length > 0);
}

// A door: two pieces on that wall, and nothing across the doorway.
const withDoor: Room = {
  ...plainRoom,
  openings: [
    { id: "d1", kind: "door", wallId: "c1", offset: 1000, width: 900, height: 2100, sill: 0, swing: "in-right", label: "" },
  ],
};
const doorPieces = wallPieces(withDoor).filter((piece) => piece.id.startsWith("c1"));
check("a wall with a door becomes two pieces beside it",
  doorPieces.filter((p) => p.height === withDoor.ceilingHeight).length === 2,
  String(doorPieces.length));
check("the full-height pieces add up to the wall minus the door",
  Math.abs(
    doorPieces
      .filter((p) => p.height === withDoor.ceilingHeight)
      .reduce((total, p) => total + p.length, 0) - (4200 - 900),
  ) < 1);

// A window: the stretches either side, the sill wall under it, the head over.
const withWindow: Room = {
  ...plainRoom,
  openings: [
    { id: "w1", kind: "window", wallId: "c1", offset: 1000, width: 1200, height: 1200, sill: 900, swing: "none", label: "" },
  ],
};
const windowPieces = wallPieces(withWindow).filter((piece) => piece.id.startsWith("c1"));
check("a wall with a window becomes four pieces",
  windowPieces.length === 4, String(windowPieces.length));
check("one is the sill wall under the glass",
  windowPieces.some((piece) => piece.id.includes("under") && piece.height === 900));
check("and one is the head above it",
  windowPieces.some(
    (piece) => piece.id.includes("over") && Math.abs(piece.height - (2700 - 2100)) < 1,
  ));
check("nothing full height is drawn across the glass",
  windowPieces.filter((p) => p.height === withWindow.ceilingHeight).length === 2);

// A door reaching the ceiling has no head piece to draw.
const fullHeightDoor: Room = {
  ...plainRoom,
  ceilingHeight: 2100,
  openings: [
    { id: "d1", kind: "door", wallId: "c1", offset: 1000, width: 900, height: 2100, sill: 0, swing: "none", label: "" },
  ],
};
check("a door to the ceiling leaves no head above it",
  !wallPieces(fullHeightDoor).some((piece) => piece.id.includes("over")));

// An opening hard against the corner leaves nothing before it.
const atTheCorner: Room = {
  ...plainRoom,
  openings: [
    { id: "d1", kind: "door", wallId: "c1", offset: 0, width: 900, height: 2100, sill: 0, swing: "none", label: "" },
  ],
};
check("an opening at the corner leaves no sliver before it",
  !wallPieces(atTheCorner).some((piece) => piece.id.includes("before")));

// Two openings in one wall: three full-height stretches between and beside.
const twoHoles: Room = {
  ...plainRoom,
  openings: [
    { id: "d1", kind: "door", wallId: "c1", offset: 500, width: 900, height: 2100, sill: 0, swing: "none", label: "" },
    { id: "w1", kind: "window", wallId: "c1", offset: 2500, width: 1000, height: 1200, sill: 900, swing: "none", label: "" },
  ],
};
const twoPieces = wallPieces(twoHoles).filter((piece) => piece.id.startsWith("c1"));
check("two openings in a wall are both left out",
  twoPieces.filter((piece) => piece.height === twoHoles.ceilingHeight).length === 3,
  String(twoPieces.filter((piece) => piece.height === twoHoles.ceilingHeight).length));

check("every piece has a real size",
  wallPieces(twoHoles).every((piece) => piece.length > 0 && piece.height > 0));

// An opening belongs to one wall. Applying it to all of them punches the same
// hole in four walls, and every assertion above still passes because they all
// look only at the wall the opening is actually on.
for (const wallId of ["c2", "c3", "c4"]) {
  const untouched = wallPieces(withDoor).filter((piece) => piece.id.startsWith(wallId));
  check(`a door on Wall A leaves ${wallId} whole`,
    untouched.length === 1 && untouched[0].height === withDoor.ceilingHeight,
    `${untouched.length} pieces`);
}

// ---------------------------------------------------------------------------
// 6. A design that has never seen a room still parses
//
// The room was added as an optional field rather than a version bump. Had it
// been `z.literal(4)`, every design already stored would have failed to parse
// — hundreds of saved kitchens, rejected by a field none of them has. This is
// the assertion that says the promise held.
// ---------------------------------------------------------------------------

const withoutRoom = kitchenExample();
check("a design with no room is still a valid spec",
  designSpecSchema.safeParse(withoutRoom).success);
check("and it really has no room", withoutRoom.room === undefined);

const withRoom = { ...withoutRoom, room: { ...RECT, runWalls: ["c1", "c2"] } };
check("a design with a room is a valid spec too",
  designSpecSchema.safeParse(withRoom).success,
  JSON.stringify(designSpecSchema.safeParse(withRoom).error?.issues?.[0] ?? ""));

// A room that is not a room must be refused rather than half-stored.
check("a room with two corners is refused",
  !designSpecSchema.safeParse({ ...withoutRoom, room: { ...RECT, corners: RECT.corners.slice(0, 2) } }).success);
check("a room with no version is refused",
  !designSpecSchema.safeParse({ ...withoutRoom, room: { corners: RECT.corners } }).success);

// ---------------------------------------------------------------------------
// 7. A cabinet in a doorway reaches the list the studio already shows
//
// The clash check is worth nothing if its answer stops at a function nobody
// calls. validateSpec is what the workspace renders, so that is where it has
// to arrive — not in a panel of its own that somebody has to know to look at.
// ---------------------------------------------------------------------------

const roomForSpec: Room = {
  ...RECT,
  runWalls: ["c1"],
  openings: [
    { id: "d1", kind: "door", wallId: "c1", offset: 0, width: 4200, height: 2100, sill: 0, swing: "in-right", label: "Hall door" },
  ],
};

// The door spans the whole wall, so every cabinet on it is in the way.
const inTheDoor = validateSpec({
  ...withoutRoom,
  room: roomForSpec,
  cabinets: withoutRoom.cabinets.map((cabinet) => ({
    ...cabinet,
    runId: "wall-c1",
    offset: 0,
  })),
});

check("a cabinet in a doorway reaches the studio's issue list",
  inTheDoor.issues.some((issue) => issue.message.includes("doorway")),
  JSON.stringify(inTheDoor.issues.slice(0, 1)));
check("and as an error",
  inTheDoor.issues.some((issue) => issue.severity === "error" && issue.message.includes("doorway")));

// A design with no room raises none of this — the promise again.
check("a design with no room raises no room issues",
  !validateSpec(withoutRoom).issues.some((issue) => issue.path.startsWith("room")));

const clearRoom = validateSpec({ ...withoutRoom, room: { ...RECT, runWalls: ["c1"] } });
check("a room with no openings raises nothing either",
  !clearRoom.issues.some((issue) => issue.message.includes("doorway")));

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
}

console.log(
  `\n${failures.length === 0 ? GREEN : RED}${passed} passed, ${failures.length} failed${RESET}` +
    `\n${DIM}room: the plan and the cut list are one design${RESET}\n`,
);

process.exit(failures.length === 0 ? 0 : 1);
