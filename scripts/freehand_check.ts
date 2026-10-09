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
