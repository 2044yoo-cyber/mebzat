import assert from "node:assert/strict";

import {
  addSketchObject,
  createSketchObject,
  duplicateSketchObject,
  pushPullSketchObject,
  snapMillimetres,
  updateSketchObject,
} from "../src/features/berchuma-studio/services/sketch";
import { startingDesign } from "../src/features/berchuma-studio/services/starting-designs";
import { designSpecSchema } from "../src/features/berchuma-studio/types/spec";

let spec = startingDesign("custom", { width: 1200 });
const rectangle = createSketchObject(spec, "face", { x: 300, y: 0.5, z: 250 });
assert.deepEqual(rectangle.size, { width: 600, height: 1, depth: 500 });
spec = addSketchObject(spec, rectangle);
spec = pushPullSketchObject(spec, rectangle.id, 400);

for (let index = 0; index < 4; index += 1) {
  spec = duplicateSketchObject(spec, rectangle.id);
}
assert.equal(spec.sketchObjects.length, 5);

for (const [index, object] of spec.sketchObjects.entries()) {
  spec = updateSketchObject(spec, object.id, {
    position: { x: index * 650, y: 200, z: 250 },
  });
}
spec = updateSketchObject(spec, spec.sketchObjects[2]!.id, {
  size: { width: 500.5, height: 450.25, depth: 500 },
  boardId: "mdf-18-walnut",
  materialHex: "#6b4a32",
});

const restored = designSpecSchema.parse(JSON.parse(JSON.stringify(spec)));
assert.equal(restored.sketchObjects.length, 5);
assert.deepEqual(restored.sketchObjects.map((object) => object.position.x), [0, 650, 1300, 1950, 2600]);
assert.equal(restored.sketchObjects[2]!.size.width, 500.5);
assert.equal(restored.sketchObjects[2]!.boardId, "mdf-18-walnut");

const wardrobe = startingDesign("wardrobe", { width: 2400 });
const manual = createSketchObject(wardrobe, "box", { x: 2700, y: 200, z: 300 });
const combined = designSpecSchema.parse(addSketchObject(wardrobe, manual));
assert.ok(combined.cabinets.length > 0);
assert.equal(combined.sketchObjects.length, 1);
assert.equal(snapMillimetres(500.5), 500);

console.log("Sketch 3D: rectangle, extrusion, five boxes, exact edit, material, persistence, and generated coexistence passed.");
