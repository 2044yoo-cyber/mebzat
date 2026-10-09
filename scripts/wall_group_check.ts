/**
 * Medosha Plan — deliberate multi-wall movement regression checks.
 * Run: npx tsx scripts/wall_group_check.ts
 */
import assert from "node:assert/strict";
import { rectangularRoom, roomSchema } from "../src/features/berchuma-studio/types/room";
import { moveHouseSelections } from "../src/features/house-designer/services/model-commands";
import { rebuildLevel } from "../src/features/house-designer/services/project-edit";
import { createHouseProject, houseProjectSchema, type HouseProject } from "../src/features/house-designer/types/project";

function sample(freehand = false): HouseProject {
  const rect = rectangularRoom(9000, 7000);
  const plan = roomSchema.parse({
    ...rect,
    freehand,
    corners: freehand ? [] : rect.corners,
    interiorWalls: [
      { id: "w1", start: { x: 800, y: 900 }, end: { x: 3600, y: 900 }, thickness: 120, height: 2700 },
      { id: "w2", start: { x: 3600, y: 900 }, end: { x: 3600, y: 4100 }, thickness: 120, height: 2700 },
      { id: "w3", start: { x: 3600, y: 4100 }, end: { x: 800, y: 4100 }, thickness: 120, height: 2700 },
      { id: "other", start: { x: 5000, y: 800 }, end: { x: 5000, y: 5200 }, thickness: 120, height: 2700 },
    ],
    zones: [],
  });
  const project = createHouseProject({
    title: "Multiple walls test",
    room: rectangularRoom(9000, 7000),
    style: "modern",
    strict: false,
    floorCount: 1,
    floorToFloorHeight: 3000,
  });
  return rebuildLevel(project, project.levels[0]!.id, plan);
}

function source(project: HouseProject, id: string) {
  const wall = project.walls.find((item) => item.sourceWallId === id);
  assert.ok(wall, `Missing wall ${id}`);
  return wall;
}
const xy = (point: { x: number; y: number }, dx: number, dy: number) => ({ x: point.x + dx, y: point.y + dy });
const selection = (project: HouseProject, ids: string[]) => ids.map((id) => ({ kind: "wall" as const, id: source(project, id).id }));

// Move three walls at once. Even when they share endpoints their relative
// geometry must not drift, and an unrelated wall must remain bit-for-bit fixed.
for (const freehand of [false, true]) {
  const original = sample(freehand);
  const snapshot = JSON.stringify(original);
  const ids = ["w1", "w2", "w3"];
  const targets = selection(original, ids);
  const result = moveHouseSelections(original, targets, 1200, -450, { footprintEditable: true });
  assert.deepEqual(result.blocked, [], "a three-wall group should move");
  assert.deepEqual(result.selections, targets, "selection must survive");
  for (const id of ids) {
    assert.deepEqual(source(result.project, id).start, xy(source(original, id).start, 1200, -450));
    assert.deepEqual(source(result.project, id).end, xy(source(original, id).end, 1200, -450));
  }
  assert.deepEqual(source(result.project, "other"), source(original, "other"), "an unselected wall never moves");
  assert.equal(JSON.stringify(original), snapshot, "the previous undo snapshot must not mutate");
  assert.equal(houseProjectSchema.safeParse(JSON.parse(JSON.stringify(result.project))).success, true, "moved project must remain saveable");

  // Move the very same wall back by a single drag. A single wall must be
  // movable without requiring its connection-toggle button.
  const one = selection(result.project, ["w1"]);
  const next = moveHouseSelections(result.project, one, -200, 200, { footprintEditable: true });
  assert.deepEqual(next.blocked, []);
  assert.deepEqual(source(next.project, "w1").start, xy(source(result.project, "w1").start, -200, 200));
  assert.deepEqual(source(next.project, "w2"), source(result.project, "w2"), "single wall move does not drag the other selected wall");
}

// A pinned wall in the group prevents partial translation of the other two.
{
  const original = sample();
  const locked = source(original, "w2");
  const copy = { ...original, objectInstances: { ...original.objectInstances, [locked.id]: {
    typeId: null, mark: "", pinned: true, groupId: null, flipped: false, properties: {},
  } } };
  const result = moveHouseSelections(copy, selection(copy, ["w1", "w2", "w3"]), 700, 0);
  assert.ok(result.blocked.length > 0);
  assert.equal(result.project, copy);
}

// A single selected exterior wall can slide across the footprint without
// moving unrelated interior-wall geometry.
{
  const original = sample();
  const exterior = original.walls.find((item) => original.levels[0]!.plan!.corners.some((corner) => corner.id === item.sourceWallId))!;
  assert.ok(exterior);
  const result = moveHouseSelections(original, [{ kind: "wall", id: exterior.id }], 0, -200, { footprintEditable: true });
  assert.deepEqual(result.blocked, []);
  const shifted = result.project.walls.find((item) => item.id === exterior.id)!;
  assert.deepEqual(shifted.start, xy(exterior.start, 0, -200));
  assert.deepEqual(shifted.end, xy(exterior.end, 0, -200));
  assert.deepEqual(source(result.project, "other"), source(original, "other"));
}

console.log("Wall group move: multiple, single, freehand, locked and exterior cases passed.");
