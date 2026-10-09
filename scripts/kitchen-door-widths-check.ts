import assert from "node:assert/strict";
import { buildParts, cabinetFronts, preferredKitchenDoorLeaves } from "../src/features/berchuma-studio/services/geometry";
import { createKitchenDesign } from "../src/features/berchuma-studio/services/kitchen-setup";
import { DEFAULT_KITCHEN_SETUP, REFERENCE_KITCHEN_DETAILS, type KitchenSetup } from "../src/features/berchuma-studio/types/kitchen";
import { validateSpec } from "../src/features/berchuma-studio/types/spec";

const options = (details: boolean): KitchenSetup => ({
  ...DEFAULT_KITCHEN_SETUP,
  wallHeight: 1000,
  topHeight: 0,
  ...(details ? { details: structuredClone(REFERENCE_KITCHEN_DETAILS) } : { details: undefined }),
});

assert.equal(preferredKitchenDoorLeaves(1990, 3, 0), 5, "a wide aligned front is split into five practical doors");
assert.equal(preferredKitchenDoorLeaves(600, 3, 1), 2, "a 600 mm bay uses two doors in the preferred range");
assert.equal(preferredKitchenDoorLeaves(220, 3, 1), 1, "a narrow opening remains one door when the preference cannot fit");

for (const details of [false, true]) {
  const spec = createKitchenDesign(options(details));
  const parts = buildParts(spec).parts;
  const bases = spec.cabinets.filter((cabinet) => cabinet.kind !== "wall" && cabinet.kitchenRole !== "fridge");
  const uppers = spec.cabinets.filter((cabinet) => cabinet.kind === "wall" && cabinet.kitchenRole !== "fridge");
  assert.ok(bases.length > 0, "base cabinets exist");
  assert.ok(uppers.length > 0, "upper cabinets exist");

  for (const cabinet of [...bases, ...uppers]) {
    const doors = cabinetFronts(spec, cabinet).leaves;
    for (const bay of cabinet.bays.filter((item) => item.door === "hinged")) {
      const bayDoors = doors.filter((door) => door.bayId === bay.id);
      const byRun = new Map<number, typeof bayDoors>();
      for (const door of bayDoors) byRun.set(door.run, [...(byRun.get(door.run) ?? []), door]);
      for (const run of byRun.values()) {
        const count = run[0]!.leaves;
        assert.equal(run.length, count, `${cabinet.id}/${bay.id}: all generated leaves are represented`);
        const outerGaps = run[0]!.aligned ? 0 : 1;
        const frontWidth = run.reduce((total, leaf) => total + leaf.width, 0) + 3 * (count + outerGaps);
        assert.equal(count, preferredKitchenDoorLeaves(frontWidth, 3, outerGaps), `${cabinet.id}/${bay.id}: geometry uses the preferred split`);
        const canFitPreferredWidth = Array.from({ length: 12 }, (_, index) => index + 1).some((candidate) => {
          const width = (frontWidth - 3 * (candidate + outerGaps)) / candidate;
          return width >= 250 && width <= 450;
        });
        if (canFitPreferredWidth) assert.ok(run.every((leaf) => leaf.width >= 250 && leaf.width <= 450), `${cabinet.id}/${bay.id}: uses the preferred range when physically possible`);
      }
    }
    const doorParts = parts.filter((part) => part.role === "door" && part.cabinetId === cabinet.id);
    const frontWidths = doorsForCabinet(spec, cabinet).map((door) => door.width).sort((a, b) => a - b);
    const cutWidths = doorParts.flatMap((part) => Array.from({ length: part.quantity }, () => part.size.x)).sort((a, b) => a - b);
    assert.deepEqual(cutWidths, frontWidths, `${cabinet.id}: cut parts use the preferred visible widths`);
  }

  const saved = validateSpec(JSON.parse(JSON.stringify(spec))).spec;
  for (const cabinet of saved.cabinets) {
    if (cabinet.kitchenRole === "fridge") continue;
    const before = cabinetFronts(spec, spec.cabinets.find((item) => item.id === cabinet.id)!).leaves.map((leaf) => leaf.width);
    const after = cabinetFronts(saved, cabinet).leaves.map((leaf) => leaf.width);
    assert.deepEqual(after, before, "saved and reopened kitchen keeps generated door widths");
  }
}

const detailed = createKitchenDesign(options(true));
const aligned = detailed.cabinets.find((cabinet) => cabinet.kitchenRole === "sink")!;
aligned.size.width = 1990;
aligned.bays[0]!.width = 1990 - 2 * detailed.carcass.board.thickness;
const alignedDoors = cabinetFronts(detailed, aligned).leaves;
assert.equal(alignedDoors.length, 5, "aligned detailed cabinet doors use the whole front width");
assert.ok(alignedDoors.every((door) => door.width >= 250 && door.width <= 450));

console.log("PASS: preferred kitchen door widths for base and upper cabinets, detailed aligned fronts, narrow fallback, and saved designs.");

function doorsForCabinet(spec: ReturnType<typeof createKitchenDesign>, cabinet: (typeof spec.cabinets)[number]) {
  return cabinetFronts(spec, cabinet).leaves;
}
