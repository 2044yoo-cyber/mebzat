/**
 * A cabinet measured like a wardrobe drawing, from the parts the cut list cuts.
 *
 *   npx tsx scripts/berchuma_dimensions_check.ts
 */
import assert from "node:assert/strict";

import { wardrobeExample, tvUnitExample } from "../src/features/berchuma-studio/services/examples";
import { buildParts } from "../src/features/berchuma-studio/services/geometry";
import { cabinetDimensions } from "../src/features/berchuma-studio/services/interior-dimensions";

const spec = wardrobeExample();
const wardrobe = spec.cabinets[0]!;
const parts = buildParts(spec).parts;
const measured = cabinetDimensions(wardrobe, parts)!;
assert.ok(measured, "a wardrobe on a straight run is measured");
assert.deepEqual([measured.left, measured.right, measured.bottom, measured.top], [0, 2400, 0, 2400], "its overall width and height");
assert.equal(measured.front, -18, "measured on the face of its doors");
assert.deepEqual(measured.columns.map((column) => column.width), [776, 776, 776], "the clear width of each column between its boards");
assert.equal(measured.columns.reduce((sum, column) => sum + column.width, 0) + 4 * 18, 2400, "columns and boards add up to the whole");

const [hanging, stack, shelves] = measured.columns;
// Left: a rail under a shelf, the hanging space below it.
assert.deepEqual(hanging!.gaps.map((gap) => gap.size), [1902, 344], "the hanging space under the shelf, and above it");
assert.deepEqual(hanging!.rails.map((rail) => [rail.length, rail.hang?.size]), [[752, 1857]], "the rail's length, and how far a coat hangs under it");
// Middle: drawers, a hanging section, storage over it.
assert.deepEqual(stack!.drawers.map((drawer) => drawer.size), [218, 218, 218], "every drawer front's height");
assert.deepEqual(stack!.gaps.map((gap) => gap.size), [1140, 428], "a bank of drawers is one block: hanging over it, storage at the top");
assert.deepEqual(stack!.rails.map((rail) => rail.hang?.size), [1095], "hanging down to the shelf over the drawers");
// Right: five shelves, six equal spaces.
assert.equal(shelves!.gaps.length, 6, "five shelves make six spaces");
// As built: the first space is taller (the shelves are spaced from the carcass
// base, under the bottom board), the rest are equal — the drawing says what is cut.
assert.deepEqual(shelves!.gaps.map((gap) => gap.size), [377, 359, 359, 359, 359, 359], "the spaces as the shelves are placed");
// Every chain adds up to the opening it divides, boards and all.
for (const column of measured.columns) {
  const boards = parts.filter((part) => part.cabinetId === wardrobe.id && ["shelf", "top", "bottom"].includes(part.role)).flatMap((part) => part.placements.filter((at) => at.x <= (column.from + column.to) / 2 && at.x + part.size.x >= (column.from + column.to) / 2).map(() => part.size.y)).reduce((sum, value) => sum + value, 0);
  const drawers = column.drawers.length ? column.drawers.at(-1)!.to - column.drawers[0]!.from : 0;
  const total = column.gaps.reduce((sum, gap) => sum + gap.to - gap.from, 0) + boards + drawers;
  assert.ok(Math.abs(total - 2300) < 1, `column at ${column.from}: spaces, boards and drawers fill the 2300 above the plinth (${total})`);
}

// A turned cabinet is not measured here; a TV unit is, its way.
assert.equal(cabinetDimensions({ ...wardrobe }, parts.map((part) => ({ ...part, rotationY: 90 }))), null, "a cabinet turned on an L is measured on its own elevation");
const tv = tvUnitExample();
const tvMeasured = cabinetDimensions(tv.cabinets[0]!, buildParts(tv).parts);
assert.ok(tvMeasured && tvMeasured.columns.length >= 1, "a TV unit is measured too");

console.log(`Berchuma dimensions: a wardrobe's columns (${measured.columns.map((column) => column.width).join(" · ")}), clear heights, rails with hanging heights and drawer fronts, all from the cut-list parts`);
