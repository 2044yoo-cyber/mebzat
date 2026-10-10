/**
 * Regression checks: a scanned drawing's confirmed architectural objects
 * must become native editable House Design geometry, never more wall strokes.
 * Run: npm run check:image-objects
 */
import assert from "node:assert/strict";
import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { applyTracedImageSymbols, type ImportedSymbol } from "../src/features/house-designer/services/image-object-import";
import { createHouseProject, houseProjectSchema } from "../src/features/house-designer/types/project";

const project = createHouseProject({
  title: "Imported building",
  room: rectangularRoom(6000, 5000),
  style: "modern",
  strict: false,
  floorCount: 1,
  floorToFloorHeight: 3000,
});
const originalWalls = project.walls.length;
const symbols: ImportedSymbol[] = [
  { id: "entrance", kind: "door", start: { x: 120, y: 0 }, end: { x: 210, y: 0 } },
  { id: "window-1", kind: "window", start: { x: 350, y: 0 }, end: { x: 470, y: 0 } },
  { id: "stairs", kind: "stair", start: { x: 100, y: 180 }, end: { x: 200, y: 450 }, stairType: "straight" },
  { id: "sofa", kind: "furniture", start: { x: 200, y: 100 }, end: { x: 360, y: 180 }, furnitureId: "sofa-2" },
];
const output = applyTracedImageSymbols(project, symbols, 10);
assert.equal(output.warnings.length, 0, JSON.stringify(output.warnings));
assert.deepEqual(output.placed, { door: 1, window: 1, stair: 1, furniture: 1 });
assert.equal(output.project.doors.length, 1);
assert.equal(output.project.windows.length, 1);
assert.equal(output.project.stairs.length, 1);
assert.equal(output.project.components.length, 1);
assert.equal(output.project.walls.length, originalWalls, "furniture and door symbols must not create wall lines");
assert.equal(output.project.levels[0]!.plan!.openings.length, 2, "openings persist in source floor plan");
assert.equal(output.project.components[0]!.family, "sofa-2");
assert.equal(output.project.components[0]!.width, 1600);
assert.equal(output.project.components[0]!.depth, 800);
assert.equal(houseProjectSchema.safeParse(output.project).success, true, "edited plan must be valid for saving and rendering");

// A door too far from its selected wall must NOT be placed in an arbitrary
// wall just because it is nearest in the entire drawing.
const invalid: ImportedSymbol[] = [
  { id: "door-far", kind: "door", start: { x: 120, y: 270 }, end: { x: 200, y: 270 } },
];
const rejected = applyTracedImageSymbols(project, invalid, 10);
assert.equal(rejected.placed.door, 0);
assert.ok(rejected.warnings.some(msg => msg.includes("cannot identify a matching wall")));
assert.equal(rejected.project.doors.length, 0);
console.log("PASS: image-traced openings, stair and furniture create real editable 3D model objects.");
