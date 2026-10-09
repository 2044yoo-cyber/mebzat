/**
 * Regression checks for Medosha's opt-in wall connections.
 *
 * Run locally: npx tsx scripts/wall_joint_check.ts
 *
 * A wall sharing a coordinate with another is NOT automatically joined for
 * editing. Only explicitly linked endpoints may move a neighbour. These
 * tests exercise real project objects and the existing editing engine.
 */
import assert from "node:assert/strict";
import { rectangularRoom, roomSchema } from "../src/features/berchuma-studio/types/room";
import { moveHouseSelections } from "../src/features/house-designer/services/model-commands";
import { rebuildLevel } from "../src/features/house-designer/services/project-edit";
import { moveWallEnd, toggleWallJoints, wallJointLinked, wallJointsLinked } from "../src/features/house-designer/services/quick-edit";
import { createHouseProject, houseProjectSchema, type HouseProject } from "../src/features/house-designer/types/project";

type Point = { x: number; y: number };
type WallId = "a" | "b" | "c" | "d";
const P = (x: number, y: number): Point => ({ x, y });
function fixture(): HouseProject {
  const plan = roomSchema.parse({
    ...rectangularRoom(6000, 5000),
    interiorWalls: [
      { id: "a", start: P(1000, 1200), end: P(3000, 1200), thickness: 120, height: 2700 },
      { id: "b", start: P(1000, 1200), end: P(1000, 3200), thickness: 120, height: 2700 },
      { id: "c", start: P(3000, 1200), end: P(3000, 3200), thickness: 120, height: 2700 },
      { id: "d", start: P(2000, 1200), end: P(2000, 3200), thickness: 120, height: 2700 },
    ],
    zones: [],
  });
  const original = createHouseProject({
    title: "Wall joints regression",
    room: plan,
    style: "modern",
    strict: false,
    floorCount: 1,
    floorToFloorHeight: 3000,
  });
  return rebuildLevel(original, original.levels[0]!.id, plan);
}

function wall(project: HouseProject, source: WallId) {
  const result = project.walls.find((item) => item.sourceWallId === source);
  assert.ok(result, `Missing wall ${source}`);
  return result;
}
function move(project: HouseProject, dx: number, dy: number) {
  const selection = { kind: "wall" as const, id: wall(project, "a").id };
  return moveHouseSelections(project, [selection], dx, dy);
}
function checkSaved(project: HouseProject) {
  assert.equal(houseProjectSchema.safeParse(JSON.parse(JSON.stringify(project))).success, true, "project must serialize and parse");
}
function joints(project: HouseProject) {
  return { a: wall(project, "a"), b: wall(project, "b"), c: wall(project, "c") };
}

const original = fixture();
const initially = joints(original);
assert.equal(wallJointsLinked(original, initially.a.id), false, "connections default off");
assert.equal(wallJointLinked(original, initially.a.id, "start"), false);
assert.equal(wallJointLinked(original, initially.a.id, "end"), false);

// 1. Selecting and moving one wall never relocates unrelated wall geometry.
{
  const result = move(original, 0, 500);
  assert.deepEqual(result.blocked, []);
  const next = joints(result.project);
  assert.deepEqual(next.a.start, P(1000, 1700));
  assert.deepEqual(next.a.end, P(3000, 1700));
  assert.deepEqual(next.b, initially.b, "left neighbour stayed exactly where it was");
  assert.deepEqual(next.c, initially.c, "right neighbour stayed exactly where it was");
  assert.deepEqual(wall(result.project, "d"), wall(original, "d"), "midpoint T must not follow an independent move");
  assert.deepEqual(result.project.rooms[0]!.boundary, original.rooms[0]!.boundary, "existing exterior room is not dragged");
  checkSaved(result.project);
}

// 2. A linked START moves only the wall meeting that particular endpoint.
{
  const startOnly = toggleWallJoints(original, initially.a.id, "start");
  assert.equal(wallJointLinked(startOnly, initially.a.id, "start"), true);
  assert.equal(wallJointLinked(startOnly, initially.a.id, "end"), false);
  const result = move(startOnly, 0, 500);
  assert.deepEqual(result.blocked, []);
  assert.deepEqual(wall(result.project, "b").start, P(1000, 1700));
  assert.deepEqual(wall(result.project, "c").start, P(3000, 1200), "unlinked END must not follow");
  assert.deepEqual(wall(result.project, "d").start, P(2000, 1200), "linking just the START does not move a midpoint T");
  assert.deepEqual(wall(result.project, "b").end, initially.b.end, "the neighbour's far endpoint stays anchored");
  checkSaved(result.project);
}

// 3. The END can be linked independently; turning the START off persists.
{
  const start = toggleWallJoints(original, initially.a.id, "start");
  const both = toggleWallJoints(start, initially.a.id, "end");
  assert.equal(wallJointsLinked(both, initially.a.id), true);
  const endOnly = toggleWallJoints(both, initially.a.id, "start");
  assert.equal(wallJointLinked(endOnly, initially.a.id, "start"), false);
  assert.equal(wallJointLinked(endOnly, initially.a.id, "end"), true);
  const moved = move(endOnly, 0, 350);
  assert.deepEqual(moved.blocked, []);
  assert.deepEqual(wall(moved.project, "b").start, initially.b.start);
  assert.deepEqual(wall(moved.project, "c").start, P(3000, 1550));
  checkSaved(endOnly);
}

// 4. Linking both moves only the immediate, exact shared endpoints.
// Releasing both restores independent editing and survives a save/reload.
{
  const linked = toggleWallJoints(original, initially.a.id);
  assert.equal(wallJointsLinked(linked, initially.a.id), true);
  const moved = move(linked, 0, 450);
  assert.deepEqual(moved.blocked, []);
  assert.deepEqual(wall(moved.project, "b").start, P(1000, 1650));
  assert.deepEqual(wall(moved.project, "c").start, P(3000, 1650));
  assert.deepEqual(wall(moved.project, "d").start, P(2000, 1650), "linking BOTH ends intentionally includes a true midpoint T");
  const released = toggleWallJoints(linked, initially.a.id);
  assert.equal(wallJointsLinked(released, initially.a.id), false);
  checkSaved(released);
}

// 5. Endpoint handles change ONLY the selected wall unless linked.
{
  const free = moveWallEnd(original, initially.a.id, "start", P(1200, 1200));
  assert.deepEqual(free.blocked, []);
  assert.deepEqual(wall(free.project, "a").start, P(1200, 1200));
  assert.deepEqual(wall(free.project, "b").start, initially.b.start);
  const linked = toggleWallJoints(original, initially.a.id, "start");
  const moved = moveWallEnd(linked, initially.a.id, "start", P(1200, 1200));
  assert.deepEqual(moved.blocked, []);
  assert.deepEqual(wall(moved.project, "b").start, P(1200, 1200));
  assert.deepEqual(wall(moved.project, "c").start, initially.c.start);
}

// 6. Locked neighbouring geometry blocks a linked edit, but not an
// independent one. An invalid wall length never makes a mutation.
{
  const instance = original.objectInstances[initially.b.id] ?? {
    typeId: null, mark: "", pinned: false, groupId: null, flipped: false, properties: {},
  };
  const locked = {
    ...original,
    objectInstances: {
      ...original.objectInstances,
      [initially.b.id]: { ...instance, pinned: true },
    },
  };
  const free = move(locked, 0, 300);
  assert.deepEqual(free.blocked, [], "a locked unrelated wall must not block an unlinked wall");
  const attached = toggleWallJoints(locked, initially.a.id, "start");
  const blocked = move(attached, 0, 300);
  assert.ok(blocked.blocked.length > 0, "a linked pinned endpoint cannot be moved");
  const tooShort = moveWallEnd(original, initially.a.id, "start", P(2900, 1200));
  assert.ok(tooShort.blocked.length > 0);
  assert.equal(tooShort.project, original);
}

// 7. Dragging a selected exterior WALL is an explicit edit. The two shared
// footprint corner vertices shift, but unrelated interior endpoints do not.
// End-HANDLE drags still require their endpoint link to be enabled.
{
  const exterior = original.walls.find((item) =>
    original.levels[0]!.plan!.corners.some((corner) => corner.id === item.sourceWallId),
  )!;
  assert.ok(exterior);
  const result = moveHouseSelections(original, [{ kind: "wall", id: exterior.id }], 0, 200, { footprintEditable: true });
  assert.deepEqual(result.blocked, [], "dragging an explicitly selected outside wall is allowed");
  const movedWall = result.project.walls.find((item) => item.id === exterior.id)!;
  assert.equal(movedWall.start.y, exterior.start.y + 200);
  assert.equal(movedWall.end.y, exterior.end.y + 200);
  assert.deepEqual(wall(result.project, "b").start, initially.b.start, "unselected interior walls do not follow exterior movement");
  const endMove = moveWallEnd(original, exterior.id, "start", { x: exterior.start.x, y: exterior.start.y + 200 });
  assert.ok(endMove.blocked.length, "a shared footprint CORNER still requires its link toggle");
}

console.log("Wall connections: 7 regression groups passed.");
