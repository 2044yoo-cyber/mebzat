/**
 * A cabinet measured like a wardrobe drawing, from the parts the cut list cuts.
 *
 *   npx tsx scripts/berchuma_dimensions_check.ts
 */
import assert from "node:assert/strict";

import { wardrobeExample, tvUnitExample } from "../src/features/berchuma-studio/services/examples";
import { DRAWER_FRONT_GAP } from "../src/features/berchuma-studio/services/dimensions";
import { buildParts, evenShelfHeights } from "../src/features/berchuma-studio/services/geometry";
import { readFileSync } from "node:fs";
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
// The drawer faces of the 660 mm band are 218 each (3 × 218 + 2 × 3 mm between them), and a drawer with no grip chosen has a 25 mm finger gap between fronts:
// the faces' 654 mm less two such gaps is 604, which is 201.33 for each.
assert.deepEqual(stack!.drawers.map((drawer) => drawer.size), [201, 201, 201], "every drawer front's height");
assert.deepEqual(stack!.drawers.slice(1).map((drawer, index) => Math.round(drawer.from - stack!.drawers[index]!.to)), [25, 25], "with a finger gap between one and the next");
assert.deepEqual(stack!.gaps.map((gap) => gap.size), [1140, 428], "a bank of drawers is one block: hanging over it, storage at the top");
assert.deepEqual(stack!.rails.map((rail) => rail.hang?.size), [1095], "hanging down to the shelf over the drawers");
// Right: five shelves, six equal spaces.
assert.equal(shelves!.gaps.length, 6, "five shelves make six spaces");
// (2264 opening − 5 × 18 shelves) / 6 = 362.3: every space the same, the bottom one included.
assert.deepEqual(shelves!.gaps.map((gap) => gap.size), [362, 362, 362, 362, 362, 362], "five shelves, six equal spaces");
assert.deepEqual(evenShelfHeights(3, 0, 1054, 18), [250, 518, 786], "three shelves in 1054: four spaces of 250");
const cut = parts.find((part) => part.bayId === wardrobe.bays[2]!.id && part.role === "shelf")!;
assert.deepEqual(cut.placements.map((at) => Math.round(at.y * 1000) / 1000), evenShelfHeights(5, 118, 2264, 18).map((value) => Math.round(value * 1000) / 1000), "the cut list's shelves are where the rule puts them");
// The elevation draws its shelves by the same rule, not a second formula.
const elevation = readFileSync("src/features/berchuma-studio/components/viewer/elevation.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const branch = elevation.slice(elevation.indexOf('if (fitting.kind === "shelves")'), elevation.indexOf('if (fitting.kind === "hanging")'));
assert.ok(branch.length > 100, "the elevation's shelves branch was found");
assert.match(branch, /evenShelfHeights\(fitting\.count, 0, height, board\)/, "the elevation places shelves with evenShelfHeights");
assert.doesNotMatch(branch, /\/ \(fitting\.count \+ 1\)/, "and not by dividing the opening");

// Every chain adds up to the opening it divides, boards and all. A design sized the old way (this one is, it names no door sizing) shares its drawer fronts out over
// the 654 mm that the three faces add up to, in a band of 660: the two 3 mm gaps between the faces stay behind as a 6 mm reveal between the top front and the board
// above it. That is neither a clear space (those are reported from 20 mm) nor a drawer, so it is counted here as what it is, and is the faces' own gaps and no more.
for (const column of measured.columns) {
  const boardsHere = parts
    .filter((part) => part.cabinetId === wardrobe.id && ["shelf", "top", "bottom"].includes(part.role))
    .flatMap((part) => part.placements.filter((at) => at.x <= (column.from + column.to) / 2 && at.x + part.size.x >= (column.from + column.to) / 2).map((at) => ({ y: at.y, size: part.size.y })));
  const boards = boardsHere.reduce((sum, board) => sum + board.size, 0);
  const drawers = column.drawers.length ? column.drawers.at(-1)!.to - column.drawers[0]!.from : 0;
  const above = column.drawers.length ? Math.min(...boardsHere.filter((board) => board.y >= column.drawers.at(-1)!.to - 0.5).map((board) => board.y)) : 0;
  const reveal = column.drawers.length ? above - column.drawers.at(-1)!.to : 0;
  if (column.drawers.length) assert.equal(Math.round(reveal), (column.drawers.length - 1) * DRAWER_FRONT_GAP, `column at ${column.from}: the reveal above the top front is the faces' own gaps, ${column.drawers.length - 1} × ${DRAWER_FRONT_GAP} mm`);
  const total = column.gaps.reduce((sum, gap) => sum + gap.to - gap.from, 0) + boards + drawers + reveal;
  assert.ok(Math.abs(total - 2300) < 1, `column at ${column.from}: spaces, boards, drawers and the reveal fill the 2300 above the plinth (${total})`);
}

// A turned cabinet is not measured here; a TV unit is, its way.
assert.equal(cabinetDimensions({ ...wardrobe }, parts.map((part) => ({ ...part, rotationY: 90 }))), null, "a cabinet turned on an L is measured on its own elevation");
const tv = tvUnitExample();
const tvMeasured = cabinetDimensions(tv.cabinets[0]!, buildParts(tv).parts);
assert.ok(tvMeasured && tvMeasured.columns.length >= 1, "a TV unit is measured too");

console.log(`Berchuma dimensions: a wardrobe's columns (${measured.columns.map((column) => column.width).join(" · ")}), clear heights, rails with hanging heights and drawer fronts, all from the cut-list parts`);
