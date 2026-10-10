/**
 * Shelves in a wardrobe's upper module are real, and stay.
 *
 *   npx tsx scripts/upper_module_shelves_check.ts
 *
 * The bug this guards: choosing Shelves for a section of an upper (stacked)
 * module changed the panel and nothing else. `validateSpec` — which runs after
 * every edit — reset every bay of every stacked wardrobe cabinet to "open", so
 * the fitting the operation had just set was gone before geometry saw it, and
 * no shelf was cut, drawn or priced. Here every step of the chain is checked
 * on the upper module's own bay: the operation, validation, the parts and
 * their heights inside the upper carcass, the cut list, the price, the
 * elevation's heights, and a save and reload.
 */
import assert from "node:assert/strict";

import { buildCutList } from "../src/features/berchuma-studio/services/cutlist";
import { calculateCost } from "../src/features/berchuma-studio/services/costing";
import { buildParts, evenShelfHeights } from "../src/features/berchuma-studio/services/geometry";
import { adjustBayCount, applyHeightModules, duplicateCabinet, moveHeightPartition, moveJoint, setWardrobeBayFitting } from "../src/features/berchuma-studio/services/operations";
import { partWorldBounds } from "../src/features/berchuma-studio/services/part-transform";
import { startingDesign } from "../src/features/berchuma-studio/services/starting-designs";
import { parseSpec, validateSpec, type Cabinet, type DesignSpec } from "../src/features/berchuma-studio/types/spec";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };

const shelves = { kind: "shelves" as const, count: 2, adjustable: true };
const cabinetOf = (spec: DesignSpec, id: string) => spec.cabinets.find((cabinet) => cabinet.id === id)!;
const shelfParts = (spec: DesignSpec, cabinetId: string, bayId?: string) =>
  buildParts(spec).parts.filter((part) => part.role === "shelf" && part.cabinetId === cabinetId && (!bayId || part.bayId === bayId));
const count = (spec: DesignSpec, cabinetId: string, bayId?: string) => shelfParts(spec, cabinetId, bayId).reduce((sum, part) => sum + part.quantity, 0);

// A 2400 × 2700 wardrobe: 2100 below, a 600 upper module above.
const base = startingDesign("wardrobe", { width: 2400 });
const stacked = applyHeightModules(base, base.cabinets[0]!.id, [2100, 600]);
const lower = stacked.cabinets.find((cabinet) => !cabinet.stackedOn)!;
const upper = stacked.cabinets.find((cabinet) => cabinet.stackedOn === lower.id)!;
const bay = upper.bays[0]!;
equal(upper.bays.map((entry) => entry.fitting.kind), upper.bays.map(() => "open"), "(the upper module starts open)");
equal(count(stacked, upper.id), 0, "(with no shelves in it)");

// ---------------------------------------------------------------------------
// A — Shelves, count 2: two real shelves inside the upper module.
// ---------------------------------------------------------------------------
const two = setWardrobeBayFitting(stacked, upper.id, bay.id, shelves);
equal(cabinetOf(two, upper.id).bays[0]!.fitting, shelves, "A: the upper module's own bay holds Shelves, count 2, adjustable");
equal(validateSpec(two).spec.cabinets.find((cabinet) => cabinet.id === upper.id)!.bays[0]!.fitting, shelves, "and validating again does not reset it");
equal(count(two, upper.id, bay.id), 2, "A: exactly two shelves are made for that bay");
const t = two.carcass.board.thickness;
const top = cabinetOf(two, upper.id);
for (const part of shelfParts(two, upper.id, bay.id)) {
  for (const at of part.placements) {
    const box = partWorldBounds(part, at);
    ok(box.min.y >= top.position.y + t - 0.5 && box.max.y <= top.position.y + top.size.height - t + 0.5, `a shelf at ${Math.round(box.min.y)} mm is inside the upper carcass (${top.position.y + t}–${top.position.y + top.size.height - t})`);
  }
}
ok(shelfParts(two, upper.id).every((part) => part.cabinetId === upper.id) && !shelfParts(two, lower.id).some((part) => part.bayId === bay.id), "the shelves belong to the upper module, not the wardrobe below");
const shelfWidth = shelfParts(two, upper.id, bay.id)[0]!;
ok(Math.abs(shelfWidth.length - bay.width) <= 2 || Math.abs(shelfWidth.width - bay.width) <= 2, `each as wide as the upper module's bay (${bay.width} mm)`);
// The heights the elevation draws are the heights the geometry cuts.
const ys = shelfParts(two, upper.id, bay.id).flatMap((part) => part.placements.map((at) => Math.round(partWorldBounds(part, at).min.y - (top.position.y + t)))).sort((a, b) => a - b);
equal(ys, evenShelfHeights(2, 0, top.size.height - 2 * t, t).map(Math.round).sort((a, b) => a - b), "F: the elevation's shelf heights are the geometry's");
equal(count(two, lower.id), count(stacked, lower.id), "the wardrobe below is unchanged");

// ---------------------------------------------------------------------------
// B — 2 → 3 at once.
// ---------------------------------------------------------------------------
const three = adjustBayCount(two, upper.id, bay.id, 1);
equal([cabinetOf(three, upper.id).bays[0]!.fitting, count(three, upper.id, bay.id)], [{ ...shelves, count: 3 }, 3], "B: one more: exactly three shelves");
equal(count(adjustBayCount(three, upper.id, bay.id, -2), upper.id, bay.id), 1, "and two fewer: one");

// ---------------------------------------------------------------------------
// C — Two upper modules: only the one chosen changes.
// ---------------------------------------------------------------------------
const pair = duplicateCabinet(stacked, lower.id);
const uppers = pair.cabinets.filter((cabinet) => cabinet.stackedOn);
equal(uppers.length, 2, "(two wardrobes, each with its upper module)");
const [first, second] = uppers as [Cabinet, Cabinet];
const one = setWardrobeBayFitting(pair, second.id, second.bays[0]!.id, shelves);
equal([count(one, second.id), count(one, first.id)], [2, 0], "C: shelves in the chosen upper module only");
equal(cabinetOf(one, first.id).bays.map((entry) => entry.fitting.kind), first.bays.map((entry) => entry.fitting.kind), "the other keeps what it had");

// ---------------------------------------------------------------------------
// D — Hanging below, shelves above.
// ---------------------------------------------------------------------------
const hung = setWardrobeBayFitting(two, lower.id, lower.bays[0]!.id, { kind: "hanging", rails: 1, shelfAbove: true });
equal(cabinetOf(hung, lower.id).bays[0]!.fitting.kind, "hanging", "D: the wardrobe's section is hanging");
ok(buildParts(hung).parts.some((part) => part.role === "rail" && part.cabinetId === lower.id && part.bayId === lower.bays[0]!.id), "with its rail");
equal(count(hung, upper.id, bay.id), 2, "and the upper module still has its two shelves");

// ---------------------------------------------------------------------------
// E — Saved and reopened.
// ---------------------------------------------------------------------------
const reopened = parseSpec(JSON.parse(JSON.stringify(three)));
ok(reopened.ok, "E: it parses");
if (reopened.ok) {
  equal(reopened.spec.cabinets.find((cabinet) => cabinet.id === upper.id)!.bays[0]!.fitting, { ...shelves, count: 3 }, "E: the upper module's shelves come back");
  equal(count(reopened.spec, upper.id, bay.id), 3, "and are made again");
}

// ---------------------------------------------------------------------------
// F — Cut list and price agree with the parts.
// ---------------------------------------------------------------------------
{
  const parts = buildParts(three);
  const rows = buildCutList(three, parts).rows.filter((row) => row.module?.startsWith("Upper module") && /Shelf/.test(row.label));
  equal(rows.reduce((sum, row) => sum + row.quantity, 0), count(three, upper.id), "F: the cut list lists every upper-module shelf");
  ok(rows.every((row) => /^W02-M\d-SH\d*$/.test(row.partId)), `under the upper module's part IDs (${rows.map((row) => row.partId).join(", ")})`);
  ok(calculateCost(three, parts).productionCost > calculateCost(stacked, buildParts(stacked)).productionCost, "and the price includes them");
  ok(parts.hardware.some((line) => line.hardware.kind === "shelf_pin" && line.quantity >= 12), "adjustable shelves get their pins");
}

// ---------------------------------------------------------------------------
// Edits elsewhere do not undo them.
// ---------------------------------------------------------------------------
{
  const jointMoved = moveJoint(three, lower.id, 0, 1500);
  ok(cabinetOf(jointMoved, upper.id).bays.some((entry) => entry.fitting.kind === "shelves" && entry.fitting.count === 3), "moving the width joint keeps the upper module's shelves");
  const taller = moveHeightPartition(three, lower.id, 2000);
  equal([cabinetOf(taller, upper.id).size.height, count(taller, upper.id, bay.id)], [700, 3], "a taller upper module keeps its three shelves, spaced in its new height");
  const legacy = structuredClone(stacked);
  equal(validateSpec(legacy).spec.cabinets.find((cabinet) => cabinet.id === upper.id)!.plinthHeight, 0, "an upper module still never stands on a plinth");
}

console.log(`Upper-module shelves: ${checks} checks — set on the upper module's own bay, kept through validation, cut inside the upper carcass, 2 then 3, one module of two, hanging below, saved and reopened, on the cut list and in the price`);
