import assert from "node:assert/strict";
import { createKitchenDesign, addKitchenUpper } from "../src/features/berchuma-studio/services/kitchen-setup";
import { DEFAULT_KITCHEN_SETUP, kitchenSetupError, type KitchenSetup } from "../src/features/berchuma-studio/types/kitchen";
import { resolveDesign } from "../src/features/berchuma-studio/services/resolve";
import { buildParts } from "../src/features/berchuma-studio/services/geometry";
import { rotatedRectBounds, partWorldBounds } from "../src/features/berchuma-studio/services/part-transform";
import { addTopCabinet, removeTopCabinet } from "../src/features/berchuma-studio/services/operations";
import { validateSpec } from "../src/features/berchuma-studio/types/spec";

const options = (shape: KitchenSetup["shape"]): KitchenSetup => ({ ...DEFAULT_KITCHEN_SETUP, shape });
for (const [shape, runs, corners] of [["straight", 1, 0], ["l_shaped", 2, 1], ["u_shaped", 3, 2], ["g_shaped", 4, 2], ["island", 2, 0]] as const) {
  const spec = createKitchenDesign(options(shape));
  assert.equal(validateSpec(JSON.parse(JSON.stringify(spec))).spec.kitchenSetup?.shape, shape);
  const resolved = resolveDesign(spec);
  assert.equal(resolved.layout.placements.length, runs);
  assert.equal(resolved.layout.corners.length, corners);
  assert.equal(resolved.issues.length, 0, resolved.issues.join("; "));
  const bases = resolved.cabinets.filter((p) => p.cabinet.kind !== "wall");
  const bounds = bases.map((p) => rotatedRectBounds(p, p.cabinet.size, p.rotation));
  for (const [i, a] of bounds.entries()) {
    assert.ok(a.minX >= -0.01 && a.maxX <= spec.kitchenSetup!.roomWidth + 0.01);
    assert.ok(a.minZ >= -0.01 && a.maxZ <= spec.kitchenSetup!.roomDepth + 0.01);
    for (const b of bounds.slice(i + 1)) assert.ok(Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) < 0.01 || Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) < 0.01, `${shape}: overlapping base cabinets`);
  }
  const back = resolved.cabinets.find((p) => p.runId === "kitchen-back")!;
  assert.equal(back.rotation, 180, "Back run faces into the room");
  const right = resolved.cabinets.find((p) => p.runId === "kitchen-right");
  if (right) assert.equal(right.rotation, 270, "Right run faces into the room");
  const wall = resolved.cabinets.find((p) => p.runId === "kitchen-back" && p.cabinet.kind === "wall")!;
  assert.ok(Math.abs(rotatedRectBounds(wall, wall.cabinet.size, wall.rotation).minZ) < 0.01, "Upper back rests against wall");
  assert.ok(spec.cabinets.some((c) => c.stackedOn && c.size.height === 400));
  assert.ok(spec.cabinets.every((c) => c.position.y + c.size.height <= 2800));
  assert.ok(!spec.cabinets.some((c) => /island|peninsula/.test(c.runId ?? "") && c.kind === "wall"));
  const parts = buildParts(spec).parts;
  const tops = parts.filter((p) => p.role === "worktop");
  assert.equal(tops.length, runs + corners);
  assert.equal(parts.filter((p) => p.role === "backsplash").length, shape === "g_shaped" ? 3 : shape === "island" ? 1 : runs);
  for (const base of bases) {
    const box = rotatedRectBounds(base, base.cabinet.size, base.rotation);
    assert.ok(tops.some((p) => p.placements.some((at) => {
      const top = partWorldBounds(p, at);
      return top.min.x <= box.minX + 0.01 && top.max.x >= box.maxX - 0.01 && top.min.z <= box.minZ + 0.01 && top.max.z >= box.maxZ - 0.01;
    })), `${shape}: each base has a worktop over its footprint`);
  }
  if (shape === "island") {
    const island = tops.find((p) => p.rotationY !== 180)!;
    const wallTop = tops.find((p) => p.rotationY === 180)!;
    assert.ok(partWorldBounds(island, island.placements[0]).min.z - partWorldBounds(wallTop, wallTop.placements[0]).max.z >= 900 - 0.01);
  }
}
assert.ok(kitchenSetupError({ ...options("island"), roomDepth: 3000 }));
assert.ok(kitchenSetupError({ ...options("g_shaped"), islandWidth: 2500 }));
assert.ok(kitchenSetupError({ ...options("l_shaped"), roomHeight: 2200 }));
assert.throws(() => createKitchenDesign({ ...options("island"), roomWidth: 1800 }));
let spec = createKitchenDesign({ ...options("l_shaped"), wallCabinets: false });
assert.ok(spec.cabinets.every((c) => c.kind !== "wall"));
const base = spec.cabinets[0];
const count = spec.cabinets.length;
spec = addKitchenUpper(spec, base.id);
assert.equal(spec.cabinets.length, count + 1);
assert.equal(addKitchenUpper(spec, base.id).cabinets.length, count + 1);
const wall = spec.cabinets.at(-1)!;
spec = addTopCabinet(spec, wall.id, 400);
assert.equal(spec.cabinets.at(-1)?.stackedOn, wall.id);
spec = removeTopCabinet(spec, wall.id);
assert.equal(spec.cabinets.length, count + 1);
assert.equal(addTopCabinet(spec, wall.id, 1000).cabinets.length, count + 1);
const interrupted = createKitchenDesign({ ...options("straight"), wallCabinets: false });
interrupted.cabinets[2].kind = "tall";
interrupted.cabinets[2].size.height = 2100;
assert.equal(buildParts(interrupted).parts.filter((p) => p.role === "worktop").length, 2, "Tall cabinet splits the worktop");
console.log("PASS: five kitchen shapes, room fit, inward fronts, wall alignment, both upper rows, worktop coverage, clearances and ceiling guards.");
