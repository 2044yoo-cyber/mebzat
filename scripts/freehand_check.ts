import { planSnapshot } from "../src/features/house-designer/services/plan-snapshot";
import { createHouseTakeoffPackage } from "../src/features/house-designer/services/takeoff-adapter";
import assert from "node:assert/strict";
import {
  rectangularRoom,
  roomSchema,
} from "../src/features/berchuma-studio/types/room";
import {
  createHouseProject,
  houseProjectSchema,
} from "../src/features/house-designer/types/project";
import {
  dimensionRectangle,
  dimensionConflicts,
  applyFreehand,
  convertStrokes,
  cleanFreehandStrokes,
  inspectFreehand,
  suggestFreehandRepairs,
  suggestFreehandTrims,
  strokeSegments,
  type Stroke,
} from "../src/features/house-designer/services/freehand";
import {
  openSpace,
  patchHouseObject,
} from "../src/features/house-designer/services/project-edit";
import { signedArea } from "../src/features/house-designer/services/room-topology";
import {
  splitHouseSelection,
  moveHouseSelections,
  createHouseObjectFromGesture,
} from "../src/features/house-designer/services/model-commands";
import { ensureHouseBimState } from "../src/features/house-designer/services/model-state";
import {
  readHouseDraft,
  writeHouseDraft,
} from "../src/features/house-designer/services/draft";
import { PlanCanvas } from "../src/features/berchuma-studio/components/plan/plan-canvas";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const stroke = (points: number[][], id = "s"): Stroke => ({
  id,
  points: points.map(([x, y]) => ({ x: x!, y: y! })),
  thickness: 200,
});
const base = createHouseProject({
  title: "Test",
  room: rectangularRoom(4000, 5000),
  style: "modern",
  strict: false,
  floorCount: 1,
  floorToFloorHeight: 3000,
});
const empty = openSpace(base);
const rectangle = [
  stroke([
    [0, 0],
    [40, 1],
    [90, -1],
    [150, 1],
    [200, 0],
  ]),
  stroke([
    [201, 2],
    [200, 250],
  ]),
  stroke([
    [200, 249],
    [0, 250],
  ]),
  stroke([
    [1, 249],
    [0, 4],
  ]),
];
const convert = (strokes: Stroke[]) =>
  ensureHouseBimState(
    applyFreehand(empty, {
      version: 1,
      strokes,
      mmPerUnit: 20,
      calibrated: true,
    }),
  );
const plan = convert(rectangle);
assert.equal(plan.walls.length, 4, "rough rectangle has four native walls");
assert.equal(plan.rooms.length, 1, "almost closed rectangle forms room");
assert.ok(Math.abs(signedArea(plan.rooms[0]!.boundary) / 1e6 - 20) < 0.3);
assert.equal(
  convertStrokes(
    [
      stroke([
        [0, 0],
        [200, 0],
      ]),
      stroke([
        [100, 100],
        [100, 2],
      ]),
    ],
    20,
  ).length,
  3,
  "T is split",
);
assert.equal(
  convertStrokes(
    [
      stroke([
        [0, 100],
        [200, 100],
      ]),
      stroke([
        [100, 0],
        [100, 200],
      ]),
    ],
    20,
  ).length,
  4,
  "X is split",
);
// Stroke order must not matter when rough corners almost touch.
const separatedCorners = [
  stroke([[0, 0], [200, 0]], "top"),
  stroke([[206, 5], [200, 200]], "right"),
  stroke([[200, 204], [0, 200]], "bottom"),
  stroke([[-4, 197], [0, -3]], "left"),
];
const connected = convertStrokes(separatedCorners, 20);
assert.equal(connected.length, 4, "nearby endpoints become one four-wall outline");
const reversed = convertStrokes([...separatedCorners].reverse(), 20);
assert.equal(reversed.length, 4, "joining does not depend on stroke order");
const nearT = convertStrokes([
  stroke([[0, 0], [200, 0]], "base"),
  stroke([[100, 100], [103, 6]], "branch"),
], 20);
assert.equal(nearT.length, 3, "near T endpoint snaps onto a wall and splits it");
const nearAxis = convertStrokes([
  stroke([[0, 0], [200, 8]], "slanted-top"),
  stroke([[203, 0], [204, 200]], "near-vertical"),
], 20);
assert.ok(nearAxis.some(w => Math.abs(w.start.y - w.end.y) < 1),
  "rough horizontal line squares onto one axis");
assert.ok(nearAxis.some(w => Math.abs(w.start.x - w.end.x) < 1),
  "rough vertical line squares onto one axis");
const closedReview = inspectFreehand(rectangle);
assert.equal(closedReview.issues.filter(issue => issue.kind === "open-end").length, 0,
  "a nearly closed rectangle has no open-end warnings");
const openReview = inspectFreehand([stroke([[0, 0], [200, 0]], "open")]);
assert.equal(openReview.issues.filter(issue => issue.kind === "open-end").length, 2,
  "a single isolated wall has two repair warnings");
const teeReview = inspectFreehand([
  stroke([[0, 0], [200, 0]], "base"),
  stroke([[100, 100], [100, 2]], "branch"),
]);
assert.equal(teeReview.issues.filter(issue => issue.kind === "open-end").length, 3,
  "T junction is connected while three outer ends remain open");
// A wavering finger movement remains ONE wall, not a chain of false corners.
const fingerJitter = stroke(Array.from({ length: 61 }, (_, i) => [
  i * 4, i === 21 ? 8 : i === 39 ? -7 : Math.sin(i * 1.4) * 2.5,
]), "shaky-finger");
assert.equal(strokeSegments(fingerJitter).length, 1,
  "finger tremor and isolated spikes cannot manufacture wall junctions");
const fingerL = stroke([
  ...Array.from({ length: 26 }, (_, i) => [i * 4, Math.sin(i) * 2]),
  ...Array.from({ length: 25 }, (_, i) => [100 + Math.sin(i) * 2, (i + 1) * 4]),
], "finger-L");
assert.equal(strokeSegments(fingerL).length, 2,
  "sustained right-angle change still makes exactly two walls");
const fingerRectangle = stroke([
  ...Array.from({ length: 26 }, (_, i) => [i * 4, Math.sin(i) * 1.5]),
  ...Array.from({ length: 25 }, (_, i) => [100 + Math.sin(i) * 1.5, (i + 1) * 4]),
  ...Array.from({ length: 25 }, (_, i) => [100 - (i + 1) * 4, 100 + Math.sin(i) * 1.5]),
  ...Array.from({ length: 25 }, (_, i) => [Math.sin(i) * 1.5, 100 - (i + 1) * 4]),
], "finger-rectangle");
assert.equal(strokeSegments(fingerRectangle).length, 4,
  "one shaky continuous rectangle retains four architectural sides");
const duplicateSource = stroke([[0, 0], [200, 0]], "duplicate");
const dedupedSketch = cleanFreehandStrokes([
  duplicateSource, stroke([[0, 0], [200, 0]], "copy"),
  stroke([[200, 0], [0, 0]], "reverse"),
  stroke([[1, 1], [1, 1]], "empty"),
  stroke([[0, 2], [200, 2]], "parallel"),
]);
assert.equal(dedupedSketch.removed, 3, "exact duplicates and empty strokes are removed");
assert.equal(dedupedSketch.strokes.length, 2, "nearby parallel wall remains independent");
assert.equal(dedupedSketch.strokes[0], duplicateSource, "the original stroke is preserved");
const proposedBridge = suggestFreehandRepairs([
  stroke([[0, 0], [100, 0]], "bridge-a"),
  stroke([[120, 0], [220, 0]], "bridge-b"),
]);
assert.ok(proposedBridge.some(item => Math.abs(item.length - 20) < 1),
  "nearby disconnected wall ends receive an explicit repair proposal");
const noBridge = suggestFreehandRepairs([
  stroke([[0, 0], [100, 0]], "far-a"),
  stroke([[240, 0], [340, 0]], "far-b"),
]);
assert.equal(noBridge.length, 0, "far apart strokes are not joined by a repair suggestion");
const tailFixture = inspectFreehand([
  stroke([[-100, 0], [100, 0]], "long-base"),
  stroke([[0, -100], [0, 0]], "vertical-arm"),
  stroke([[0, 0], [0, 15]], "short-tail"),
]);
assert.ok(tailFixture.issues.some(issue => issue.kind === "dangling-extension"),
  "short dangling extension connected to a junction is flagged for review");
const trimCandidates = suggestFreehandTrims([
  stroke([[-100, 0], [100, 0]], "trim-base"),
  stroke([[0, -100], [0, 0]], "trim-arm"),
  stroke([[0, 0], [0, 15]], "trim-short"),
]);
assert.ok(trimCandidates.some(item => item.strokeId === "trim-short"),
  "isolated short tail is offered as confirmable trim");
const complexTailCandidates = suggestFreehandTrims([
  stroke([[-100, 0], [100, 0]], "complex-base"),
  stroke([[0, -100], [0, 0]], "complex-arm"),
  stroke([[0, 0], [0, 15], [0, 40]], "complex-source"),
]);
assert.equal(complexTailCandidates.length, 0,
  "do not suggest deleting a multi-point stroke for a local trim");
const intentionalProjection = inspectFreehand([
  stroke([[-100, 0], [100, 0]], "base-long"),
  stroke([[0, -100], [0, 0]], "arm-long"),
  stroke([[0, 0], [0, 85]], "long-projection"),
]);
assert.equal(intentionalProjection.issues.filter(issue => issue.kind === "dangling-extension").length, 0,
  "long projecting walls are not marked as short dangling tails");
const forkChoice = [
  stroke([[0, 0], [100, 0]], "ambiguous-base"),
  stroke([[120, 8], [170, 8]], "ambiguous-upper"),
  stroke([[120, -8], [170, -8]], "ambiguous-lower"),
];
const ambiguousReview = inspectFreehand(forkChoice);
assert.ok(ambiguousReview.issues.some(issue => issue.kind === "ambiguous-junction"),
  "near-equidistant open endpoints require user review");
const ambiguousProposals = suggestFreehandRepairs(forkChoice);
assert.equal(ambiguousProposals.filter(repair => Math.hypot(repair.start.x - 100, repair.start.y) < 1 ||
  Math.hypot(repair.end.x - 100, repair.end.y) < 1).length, 0,
  "ambiguous endpoint does not receive an automatic bridge suggestion");
const shortExistingWall = [stroke([[0, 0], [20, 0]], "already-connected")];
assert.equal(suggestFreehandRepairs(shortExistingWall).length, 0,
  "two ends of a short existing wall must not be connected again");
assert.equal(inspectFreehand(shortExistingWall).issues.filter(issue =>
  issue.kind === "ambiguous-junction").length, 0,
  "the ends of one existing short wall are not ambiguous junctions");
const diagonal = convertStrokes(
  [
    stroke([
      [0, 0],
      [50, 30],
      [100, 60],
    ]),
  ],
  20,
)[0]!;
assert.ok(
  Math.abs(
    (diagonal.end.y - diagonal.start.y) / (diagonal.end.x - diagonal.start.x) -
      0.6,
  ) < 0.01,
  "diagonal retained",
);
assert.equal(
  strokeSegments(
    stroke([
      [0, 0],
      [50, 1],
      [95, 0],
      [100, 4],
      [101, 50],
      [100, 100],
    ]),
    5,
  ).length,
  2,
  "clear corner becomes two segments",
);
const single = convert([
  stroke([
    [0, 0],
    [200, 0],
  ]),
]);
assert.equal(single.rooms.length, 0, "open wall invents no room");
assert.ok(houseProjectSchema.safeParse(single).success);
const before = JSON.stringify(plan);
const wall = plan.walls[0]!;
const moved = moveHouseSelections(
  plan,
  [{ kind: "wall", id: wall.id }],
  0,
  -500,
  { footprintEditable: true },
).project;
assert.equal(JSON.stringify(plan), before, "immutable edits support undo");
assert.equal(moved.rooms.length, 1, "connected move retains room");
const split = splitHouseSelection(plan, { kind: "wall", id: wall.id }).project;
assert.equal(split.walls.length, 5);
assert.equal(split.rooms.length, 1);
const lengthened = patchHouseObject(
  plan,
  { kind: "wall", id: wall.id },
  { length: 5000 },
);
assert.ok(
  Math.abs(
    Math.hypot(
      lengthened.walls[0]!.end.x - lengthened.walls[0]!.start.x,
      lengthened.walls[0]!.end.y - lengthened.walls[0]!.start.y,
    ) - 5000,
  ) < 0.01,
);
assert.ok(houseProjectSchema.safeParse(lengthened).success);
// disable snap for explicit unconnected parallel walls
const unsnapped = applyFreehand(
  empty,
  {
    version: 1,
    strokes: [
      stroke([
        [0, 0],
        [200, 0],
      ]),
      stroke([
        [0, 8],
        [200, 8],
      ]),
    ],
    mmPerUnit: 20,
    calibrated: true,
  },
  0,
);
const other = unsnapped.walls[1]!;
const isolated = patchHouseObject(
  unsnapped,
  { kind: "wall", id: unsnapped.walls[0]!.id },
  { startY: -500, endY: -500 },
);
assert.deepEqual(isolated.walls[1], other, "nearby unconnected wall stays put");
const door = createHouseObjectFromGesture(plan, "door", plan.levels[0]!.id, {
  x: 2000,
  y: 0,
});
assert.equal(door.project.doors.length, 1, "native doors attach");
const precise = dimensionRectangle(plan, 4000, 5000);
assert.equal(
  (Math.abs(signedArea(precise.rooms[0]!.boundary)) / 1e6).toFixed(2),
  "20.00",
  "4 x 5 m produces exactly 20 m²",
);
assert.equal(dimensionConflicts(precise).length, 0);
assert.ok(
  dimensionConflicts(
    patchHouseObject(
      precise,
      { kind: "wall", id: precise.walls[0]!.id },
      { length: 6000 },
    ),
  ).length > 0,
  "conflicting dimension is reported",
);
const fractional = splitHouseSelection(
  precise,
  { kind: "wall", id: precise.walls[0]!.id },
  0.3,
).project;
assert.equal(
  (Math.abs(signedArea(fractional.rooms[0]!.boundary)) / 1e6).toFixed(2),
  "20.00",
  "split preserves exact room area",
);
assert.equal(
  dimensionConflicts(fractional).length,
  0,
  "split distributes dimension constraint",
);
assert.equal(fractional.walls.length, 5);
const roundtrip = houseProjectSchema.parse(
  JSON.parse(JSON.stringify(door.project)),
);
assert.deepEqual(roundtrip.freehandSketch, plan.freehandSketch);
assert.equal(roundtrip.walls.length, 4);
assert.equal(roundtrip.rooms.length, 1);
const data = new Map<string, string>();
const storage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => {
    data.set(key, value);
  },
} as Storage;
assert.ok(writeHouseDraft(storage, "test", roundtrip));
assert.equal(readHouseDraft(storage, "test")!.project.walls.length, 4);
assert.ok(houseProjectSchema.safeParse(base).success, "legacy project loads");
assert.ok(
  !roomSchema.safeParse({ ...rectangularRoom(4000, 5000), corners: [] })
    .success,
  "legacy empty outline rejected",
);
for (const project of [plan, single, empty])
  if (project.levels[0]!.plan) {
    const markup = renderToStaticMarkup(
      createElement(PlanCanvas, {
        room: project.levels[0]!.plan!,
        onChange: () => {},
      }),
    );
    assert.ok(!/NaN|Infinity/.test(markup), "finite renderer");
  }
assert.throws(
  () => applyFreehand(plan, plan.freehandSketch!),
  /blank plan/,
  "never overwrite edited plan",
);
console.log(
  "Freehand: geometry, intersections, editing, openings, serialization, draft, legacy and renderer checks passed",
);

const approximate=applyFreehand(empty,{...plan.freehandSketch!,calibrated:false});
assert.ok(planSnapshot(approximate,approximate.levels[0]!.id).svg.includes("SCALE NOT VERIFIED"));
const quantities=createHouseTakeoffPackage(approximate);
assert.ok(quantities.warnings.some(w=>w.includes("UNSCALED")));
assert.equal(quantities.elements.filter(e=>e.kind==="wall").length,4);
