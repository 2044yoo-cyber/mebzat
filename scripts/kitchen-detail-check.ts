import assert from "node:assert/strict";
import { createKitchenDesign, addKitchenUpper } from "../src/features/berchuma-studio/services/kitchen-setup";
import { DEFAULT_KITCHEN_SETUP, REFERENCE_KITCHEN_DETAILS, kitchenSetupError, type KitchenSetup } from "../src/features/berchuma-studio/types/kitchen";
import { resolveDesign } from "../src/features/berchuma-studio/services/resolve";
import { buildParts } from "../src/features/berchuma-studio/services/geometry";
import { kitchenConstruction, visibleKitchenParts } from "../src/features/berchuma-studio/services/kitchen-construction";
import { rotatedRectBounds, partWorldBounds } from "../src/features/berchuma-studio/services/part-transform";
import { validateSpec } from "../src/features/berchuma-studio/types/spec";

const options = (shape: KitchenSetup["shape"]): KitchenSetup => ({ ...DEFAULT_KITCHEN_SETUP, shape, wallHeight: 1000, topHeight: 0, details: structuredClone(REFERENCE_KITCHEN_DETAILS) });
for (const shape of ["straight", "l_shaped", "u_shaped", "g_shaped", "island"] as const) {
  const input = options(shape);
  const spec = createKitchenDesign(input);
  const restored = validateSpec(JSON.parse(JSON.stringify(spec))).spec;
  assert.equal(restored.kitchenSetup?.details?.fridgeHeight, 1800);
  const resolved = resolveDesign(spec);
  assert.equal(resolved.issues.length, 0, resolved.issues.join("; "));
  for (const role of ["fridge", "sink", "stove"] as const) {
    const c = spec.cabinets.find((c) => c.kitchenRole === role)!;
    assert.ok(c, role);
    assert.equal(c.offset, input.details![role].offset);
    assert.equal(c.size.width, input.details![role].width);
  }
  // Upper runs meet at their edges rather than overlapping or leaving the
  // base corner's depth as an empty gap.
  const upperRuns = resolved.layout.placements.filter((r) => r.runId.startsWith("upper-"));
  for (const run of upperRuns) assert.equal(run.depth, 300);
  const back = upperRuns.find((r) => r.runId === "upper-kitchen-back")!;
  const backBox = rotatedRectBounds(back.origin, { width: back.usableLength, depth: back.depth }, back.rotation);
  for (const side of upperRuns.filter((r) => r !== back)) {
    const sideBox = rotatedRectBounds(side.origin, { width: side.usableLength, depth: side.depth }, side.rotation);
    assert.ok(Math.abs(backBox.maxZ - sideBox.minZ) < 0.001);
  }
  const uppers = resolved.cabinets.filter((p) => p.cabinet.kind === "wall");
  for (const [i, a] of uppers.entries()) {
    assert.equal(a.y + a.cabinet.size.height, 2500);
    const box = rotatedRectBounds(a, a.cabinet.size, a.rotation);
    for (const b of uppers.slice(i + 1)) {
      const other = rotatedRectBounds(b, b.cabinet.size, b.rotation);
      assert.ok(Math.min(box.maxX, other.maxX) - Math.max(box.minX, other.minX) < 0.01 || Math.min(box.maxZ, other.maxZ) - Math.max(box.minZ, other.minZ) < 0.01, `${shape}: upper carcasses overlap`);
    }
  }
  const all = buildParts(spec);
  const upperIds = new Set(uppers.map((p) => p.cabinet.id));
  const upperParts = all.parts.filter((p) => p.cabinetId && upperIds.has(p.cabinetId));
  for (const door of upperParts.filter((p) => p.role === "door")) for (const other of upperParts) {
    if (other.cabinetId === door.cabinetId) continue;
    for (const at of door.placements) for (const there of other.placements) {
      const a = partWorldBounds(door, at), b = partWorldBounds(other, there);
      assert.ok(["x", "y", "z"].some((axis) => Math.min(a.max[axis as "x"], b.max[axis as "x"]) - Math.max(a.min[axis as "x"], b.min[axis as "x"]) < 0.01), `${shape}: ${door.id} intersects ${other.id}`);
    }
  }
  assert.ok(all.parts.some((p) => p.role === "worktop"));
  assert.ok(visibleKitchenParts(all.parts, true).every((p) => p.role !== "worktop" && p.role !== "backsplash"));
  assert.equal(visibleKitchenParts(all.parts, false).length, all.parts.length);
  assert.ok(!all.hardware.some((line) => line.hardware.kind === "hanging_rail"), "Cut MDF stretchers are not charged as hanging rails");
  assert.equal(new Set(all.parts.map((p) => p.id)).size, all.parts.length);
  for (const p of all.parts) {
    assert.equal(p.quantity, p.placements.length);
    if (p.role === "worktop" || p.role === "backsplash") continue;
    assert.ok(p.length > 0 && p.width > 0);
    assert.ok(Math.max(p.length, p.width) <= Math.max(p.board.sheet.length, p.board.sheet.width), `${p.id}: fits stock sheet length`);
    assert.ok(Math.min(p.length, p.width) <= Math.min(p.board.sheet.length, p.board.sheet.width), `${p.id}: fits stock sheet width`);
  }
  const fridge = spec.cabinets.find((c) => c.kitchenRole === "fridge")!;
  const enclosure = kitchenConstruction(spec, fridge, []);
  assert.equal(enclosure.filter((p) => p.role === "door").length, 2);
  for (const p of enclosure) for (const at of p.placements) {
    if (at.y < 1800) assert.ok(at.x + p.size.x <= 18 || at.x >= fridge.size.width - 18, "Fridge clear opening has no blocking boards");
  }
  const sink = spec.cabinets.find((c) => c.kitchenRole === "sink")!;
  const sinkParts = all.parts.filter((p) => p.cabinetId === sink.id);
  assert.equal(sinkParts.filter((p) => p.id.includes("top-stretcher")).length, 2);
  assert.ok(sinkParts.every((p) => !["shelf", "top", "leg"].includes(p.role)));
  assert.equal(sinkParts.filter((p) => p.role === "plinth").length, 4);
  assert.ok(sinkParts.filter((p) => p.role === "plinth").every((p) => p.size.y === 70));
  const doors = kitchenConstruction(spec, sink, []).filter((p) => p.role === "door");
  const zekolo = kitchenConstruction(spec, sink, []).find((p) => p.id === "zekolo-front")!;
  assert.equal(zekolo.placements[0].z, 40);
  assert.equal(doors[0].placements[0].x, 1.5);
  assert.equal(doors.at(-1)!.placements[0].x + doors.at(-1)!.size.x, sink.size.width - 1.5);
  assert.equal(addKitchenUpper(spec, sink.id).cabinets.length, spec.cabinets.length, "Existing connected upper is not duplicated");
}
const moved = options("island");
moved.details!.sink = { runId: "kitchen-island", offset: 0, width: 600 };
const changed = createKitchenDesign(moved);
assert.equal(changed.cabinets.find((c) => c.kitchenRole === "sink")?.runId, "kitchen-island");
assert.ok(!changed.cabinets.some((c) => c.runId === "upper-kitchen-island"));
const overlap = options("l_shaped"); overlap.details!.sink.offset = 100;
assert.ok(kitchenSetupError(overlap)); assert.throws(() => createKitchenDesign(overlap));
const outside = options("l_shaped"); outside.details!.stove.offset = 9000;
assert.ok(kitchenSetupError(outside));
const stacked = createKitchenDesign({ ...options("g_shaped"), topHeight: 300 });
assert.ok(stacked.cabinets.some((c) => c.stackedOn));
assert.equal(resolveDesign(stacked).issues.length, 0);
assert.ok(stacked.cabinets.every((c) => c.position.y + c.size.height <= 2800));
console.log("PASS: reference kitchen construction, connected uppers, appliance locations, fridge opening, Zekolo, sheet fit, door alignment and countertop visibility.");
