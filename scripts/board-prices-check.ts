import assert from "node:assert/strict";
import { BOARDS, findBoard } from "../src/features/berchuma-studio/types/catalogue";
import { parseSpec } from "../src/features/berchuma-studio/types/spec";
import { wardrobeExample } from "../src/features/berchuma-studio/services/examples";
import { buildParts } from "../src/features/berchuma-studio/services/geometry";
import { calculateCost } from "../src/features/berchuma-studio/services/costing";
import { wardrobeBackBoards, wardrobeStructuralBoards } from "../src/features/berchuma-studio/services/wardrobe-materials";
import { BOARD_PRICE_LIST } from "../src/lib/constants/board-price-list";

for (const id of ["mdf-18-white", "mdf-18-black", "mdf-18-oak", "mdf-18-walnut"]) {
  assert.equal(findBoard(id)!.fallbackRate, 5700);
  assert.equal(findBoard(id)!.priceKey, "MDF 18mm melamine");
}
assert.deepEqual(BOARD_PRICE_LIST.map((row) => row.price), [5700, 10000, 11000, 2000]);
assert.equal(new Set(BOARDS.map((b) => b.id)).size, BOARDS.length);
for (const [id, expected] of [["mdf-18-uv", 10000], ["mdf-18-solid-uv", 11000]] as const) {
  assert.ok(wardrobeStructuralBoards().some((b) => b.id === id));
  const input = wardrobeExample();
  input.carcass.frontBoard = findBoard(id)!;
  input.carcass.backBoard = findBoard("mdf-6-white")!;
  const parsed = parseSpec(input);
  assert.ok(parsed.ok);
  assert.equal(parsed.spec.carcass.frontBoard?.id, id);
  assert.equal(parsed.spec.carcass.backBoard.id, "mdf-6-white");
  const cost = calculateCost(parsed.spec, buildParts(parsed.spec), { sheetCounts: { [id]: 5, "mdf-6-white": 2 } });
  assert.equal(cost.lines.find((line) => line.id === `board-${id}`)?.amount, 5 * expected);
  assert.equal(cost.lines.find((line) => line.id === "board-mdf-6-white")?.amount, 4000);
}
assert.ok(wardrobeBackBoards().some((b) => b.id === "mdf-6-white"));
const spec = wardrobeExample();
spec.cabinets[0].size.width = 1500;
spec.cabinets[0].size.height = 2000;
const breakdown = buildParts(spec);
const cost = calculateCost(spec, breakdown);
assert.equal(cost.frontAreaSqm, 3);
assert.equal(cost.productionCostPerSqm, Math.round(cost.productionCost / 3 * 100) / 100);
spec.cabinets.push({ ...structuredClone(spec.cabinets[0]), id: "second", position: { x: 5000, y: 0, z: 0 } });
assert.equal(calculateCost(spec, breakdown).frontAreaSqm, 6);
spec.cabinets = [];
assert.equal(calculateCost(spec, breakdown).productionCostPerSqm, undefined);
console.log("PASS: all sheet prices, UV/MDF selectors, validated materials, sheet totals, 3 m² pricing, multiple cabinets and zero area.");
