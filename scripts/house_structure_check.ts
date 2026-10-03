import assert from "node:assert/strict";

import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { acceptColumnProposals, suggestColumns } from "../src/features/house-designer/services/column-suggestions";
import { createHouseObjectFromGesture, createRoomFromGesture, moveHouseSelections } from "../src/features/house-designer/services/model-commands";
import { ensureHouseBimState } from "../src/features/house-designer/services/model-state";
import { patchHouseObject } from "../src/features/house-designer/services/project-edit";
import { generatePreliminaryStructure } from "../src/features/house-designer/services/structure";
import { applyModelingOptions, modelingPreset } from "../src/features/house-designer/services/workspace-options";
import { createHouseProject, houseProjectSchema } from "../src/features/house-designer/types/project";

const house = ensureHouseBimState(createHouseProject({ title: "Structure", room: rectangularRoom(8000, 6500), style: "modern", strict: false, floorCount: 1, floorToFloorHeight: 3000 }));
const level = house.levels[0]!.id;
const apartment = applyModelingOptions(house, modelingPreset("apartment"));
const slideDoor = (project: typeof house) => {
  const door = createHouseObjectFromGesture(project, "door", level, { x: 4000, y: 0 });
  return patchHouseObject(door.project, door.selections[0]!, { offset: 1000 });
};

// ---------------------------------------------------------------------------
// A plan edit rebuilds the automatic structure — and only that.
// ---------------------------------------------------------------------------
{
  const placed = createHouseObjectFromGesture(house, "column", level, { x: 4000, y: 3250 });
  const id = placed.selections[0]!.id;
  assert.ok(slideDoor(placed.project).structuralColumns.some((column) => column.id === id), "a column placed by hand survives the next plan edit");
  assert.ok(generatePreliminaryStructure(placed.project).structuralColumns.some((column) => column.id === id), "and Regenerate");

  const edited = slideDoor(apartment);
  assert.equal(edited.structuralColumns.length, 0, "an apartment never grows columns from an edit");
  assert.equal(edited.structuralBeams.length, 0, "nor beams");
  assert.equal(edited.structuralGrid.length, 0, "nor grid lines");

  // An extension's own floor and roof keep their shape when the house's
  // outline changes; the house's own follow it.
  const extension = createRoomFromGesture(house, level, { x: 8000, y: 0 }, { x: 11000, y: 3000 }, "rectangle", { wallThickness: 120 }).project;
  const covered = createHouseObjectFromGesture(createHouseObjectFromGesture(extension, "floor", level, { x: 9500, y: 1500 }).project, "roof", level, { x: 9500, y: 1500 }).project;
  const top = covered.walls.find((wall) => wall.levelId === level && wall.start.y === 0 && wall.end.y === 0 && wall.start.x < 8000)!;
  const moved = moveHouseSelections(covered, [{ kind: "wall", id: top.id }], 0, -500, { footprintEditable: true }).project;
  const ownSlab = moved.slabs.at(-1)!;
  const ownRoof = moved.roofs.at(-1)!;
  assert.deepEqual(ownSlab.boundary.map((point) => [point.x, point.y]), [[8000, 0], [11000, 0], [11000, 3000], [8000, 3000]], "an extension's floor keeps its shape");
  assert.deepEqual(ownRoof.boundary.map((point) => [point.x, point.y]), [[8000, 0], [11000, 0], [11000, 3000], [8000, 3000]], "and its roof");
  assert.ok(moved.slabs.some((slab) => slab.boundary.some((point) => point.y === -500)), "while the house's own slab follows the moved wall");
}

// ---------------------------------------------------------------------------
// Suggest Columns proposes; only Accept changes the model.
// ---------------------------------------------------------------------------
{
  const bare = suggestColumns(apartment, level);
  const corners = bare.filter((item) => item.reason === "Corner");
  const spans = bare.filter((item) => item.reason.endsWith("span"));
  assert.equal(corners.length, 4, "an unsupported house is offered a column at each corner");
  assert.deepEqual(spans.map((item) => [item.x, item.y]).sort(), [[0, 3250], [4000, 0], [4000, 6500], [8000, 3250]].sort(), "and one mid-span on every wall longer than 4.5 m");
  assert.equal(spans.find((item) => item.x === 4000 && item.y === 0)!.reason, "8.0 m span", "each says why");

  const supported = suggestColumns(house, level);
  assert.equal(supported.filter((item) => item.reason === "Corner").length, 0, "corners that already have columns are not offered again");
  assert.equal(supported.length, 4, "only the long spans are");
  assert.equal(suggestColumns(apartment, level, 3000).filter((item) => item.y === 0 && item.reason.endsWith("span")).length, 2, "a shorter allowed span asks for more columns");

  // A door where the mid-span column would go: the column moves beside it.
  const withDoor = createHouseObjectFromGesture(house, "door", level, { x: 4000, y: 0 }, { x: 4000, y: 0 }, { width: 900 });
  const door = withDoor.project.doors.find((item) => item.id === withDoor.selections[0]!.id)!;
  const topSpan = suggestColumns(withDoor.project, level).filter((item) => item.y === 0);
  assert.equal(topSpan.length, 1, "the span over a door is still supported");
  assert.ok(topSpan[0]!.x <= door.offset - 150 || topSpan[0]!.x >= door.offset + door.width + 150, `but not in the doorway (${topSpan[0]!.x})`);

  // Never in an opening, whatever the reason: an inside wall meeting the
  // outside wall right at a doorway gets no column in the doorway.
  const doorway = createHouseObjectFromGesture(withDoor.project, "wall", level, { x: 4000, y: 0 }, { x: 4000, y: 6500 }, { wallThickness: 120 }).project;
  assert.ok(!suggestColumns(doorway, level).some((item) => item.y === 0 && item.x > door.offset - 150 && item.x < door.offset + door.width + 150), "no column is ever offered in a doorway");

  // An inside wall meeting the outside walls is a junction.
  const divided = createHouseObjectFromGesture(house, "wall", level, { x: 3000, y: 0 }, { x: 3000, y: 6500 }, { wallThickness: 120 }).project;
  const junctions = suggestColumns(divided, level).filter((item) => item.reason === "Wall junction");
  assert.deepEqual(junctions.map((item) => [item.x, item.y]).sort(), [[3000, 0], [3000, 6500]].sort(), "where an inside wall meets another wall");

  const before = JSON.stringify(divided);
  suggestColumns(divided, level);
  assert.equal(JSON.stringify(divided), before, "suggesting changes nothing");
  const accepted = acceptColumnProposals(divided, level, junctions);
  assert.equal(accepted.structuralColumns.length, divided.structuralColumns.length + 2, "accepting adds exactly the columns accepted");
  assert.deepEqual(accepted.walls, divided.walls, "and never touches a wall");
  assert.deepEqual(accepted.doors, divided.doors);
  assert.ok(houseProjectSchema.safeParse(accepted).success);
  assert.equal(suggestColumns(accepted, level).filter((item) => item.reason === "Wall junction").length, 0, "accepted columns count as support");
  const kept = slideDoor(accepted);
  assert.equal(kept.structuralColumns.filter((column) => column.id.startsWith("column:")).length, 2, "and survive the next plan edit");
}

console.log("House structure: rebuilds keep what you placed; suggestions propose, accept adds, nothing else moves");
