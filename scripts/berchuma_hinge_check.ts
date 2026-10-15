/**
 * Doors sized from the cabinet opening by hinge type: full overlay, half
 * overlay, inset.
 *
 *   npx tsx scripts/berchuma_hinge_check.ts
 *
 * The expected numbers are worked out here, from the board thickness, the
 * clearance and the bay widths, with the arithmetic written out — not read
 * back from the module that sizes the doors. Everything else reads the lists
 * the shop gets: the parts, the cut list, the hardware, the saved spec.
 *
 *   full   outer edge: the outside face less c/2; shared board: its middle plus c/2
 *   half   every edge: the board's face less (t − c)/2
 *   inset  every edge: the opening's face plus c
 */
import assert from "node:assert/strict";

import { buildCutList } from "../src/features/berchuma-studio/services/cutlist";
import { calculateCost } from "../src/features/berchuma-studio/services/costing";
import { wardrobeExample } from "../src/features/berchuma-studio/services/examples";
import { buildExport } from "../src/features/berchuma-studio/services/exports";
import { buildParts, cabinetFronts, closureReport } from "../src/features/berchuma-studio/services/geometry";
import { boxesOverlap, doorSwingConflict, type ClosureBox } from "../src/features/berchuma-studio/services/closure-panels";
import { setClosureSettings, setDesignGrip } from "../src/features/berchuma-studio/services/closure-operations";
import { manualDoorCount, resetAllDoorSizes, setDoorClearance, setHingeType } from "../src/features/berchuma-studio/services/door-sizing-operations";
import { bayLayout } from "../src/features/berchuma-studio/services/transport-modules";
import { createDetailedKitchen } from "../src/features/berchuma-studio/services/kitchen-detail";
import { doorSnapTargetsOf, makeDoorsEqual, resetDoorSize, setDoorManual, setDoorSize, type DoorRef } from "../src/features/berchuma-studio/services/operations";
import { partWorldBounds } from "../src/features/berchuma-studio/services/part-transform";
import { startingDesign, wardrobeShapeDesign } from "../src/features/berchuma-studio/services/starting-designs";
import { DEFAULT_KITCHEN_SETUP, REFERENCE_KITCHEN_DETAILS } from "../src/features/berchuma-studio/types/kitchen";
import type { Part } from "../src/features/berchuma-studio/types/parts";
import { parseSpec, validateSpec, type DesignSpec, type HingeType } from "../src/features/berchuma-studio/types/spec";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };
const near = (actual: number, expected: number, message: string, tolerance = 0.06) => { assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} is not ${expected}`); checks += 1; };

const HINGES: HingeType[] = ["full", "half", "inset"];
const floor10 = (value: number) => Math.floor(value * 10) / 10;
const sized = (spec: DesignSpec, hinge: HingeType, clearance = 5) => setDoorClearance(setHingeType(spec, hinge), clearance);
const leavesOf = (spec: DesignSpec, cabinetIndex = 0) => cabinetFronts(spec, spec.cabinets[cabinetIndex]!).leaves;
const fronts = (spec: DesignSpec, cabinetIndex = 0) => { const f = cabinetFronts(spec, spec.cabinets[cabinetIndex]!); return [...f.leaves, ...f.drawers]; };
const parts = (spec: DesignSpec) => buildParts(spec).parts;
const doors = (spec: DesignSpec) => parts(spec).filter((part) => part.role === "door");
const worldBox = (part: Part, at: Part["placements"][number]): ClosureBox => { const { min, max } = partWorldBounds(part, at); return { x: min.x, y: min.y, z: min.z, sx: max.x - min.x, sy: max.y - min.y, sz: max.z - min.z }; };

const wardrobe = validateSpec(wardrobeExample()).spec;           // 2400 × 2400, three 776 bays of two leaves, doors over drawers in the middle one
const cabinet = wardrobe.cabinets[0]!;
const t = wardrobe.carcass.board.thickness;
const H = cabinet.size.height;
const W = cabinet.size.width;
const plinth = cabinet.plinthHeight;

// ---------------------------------------------------------------------------
// 1. A design saved before this existed is sized as it was
// ---------------------------------------------------------------------------
ok(!wardrobe.doorSizing, "the example wardrobe, as saved long ago, carries no door sizing");
equal(leavesOf(wardrobe).slice(0, 2).map((leaf) => [leaf.x, leaf.width, leaf.y, leaf.height]), [[20, 385, 102, 2296], [407, 385, 102, 2296]], "and its doors are the old ones: 2 mm gaps, inside the opening, full height");
equal(doors(wardrobe)[0]!.placements[0]!.z, -18, "standing proud, as before");
const reopenedOld = parseSpec(JSON.parse(JSON.stringify(wardrobe)));
ok(reopenedOld.ok && !reopenedOld.spec.doorSizing, "it reopens without door sizing");
equal(parts(reopenedOld.ok ? reopenedOld.spec : wardrobe), parts(wardrobe), "and makes the same parts");
equal(buildParts(wardrobe).hardware.find((line) => line.hardware.kind === "hinge")!.hardware.id, "hinge-soft-close", "with the hinge it always ordered");

const fresh = validateSpec(startingDesign("wardrobe", { width: 1600 })).spec;
equal(fresh.doorSizing, { hinge: "full", clearance: 5 }, "a new design starts as full overlay with a 5 mm clearance");
const detailed = createDetailedKitchen({ ...DEFAULT_KITCHEN_SETUP, details: REFERENCE_KITCHEN_DETAILS });
ok(!detailed.doorSizing && detailed.carcass.doorGap === 3, "the reference kitchen keeps the supplied model's 3 mm gap");

// ---------------------------------------------------------------------------
// 2. The three formulas, from first principles: a pair across one opening
// ---------------------------------------------------------------------------
{
  const single = sized(wardrobe, "full");
  const bay = cabinet.bays[0]!;
  const opening = { a: t, b: t + bay.width };                    // the first bay's clear opening
  for (const c of [5, 3, 8]) {
    const expected: Record<HingeType, { lo: number; hi: number }> = {
      full: { lo: opening.a - (t - c / 2), hi: opening.b + (t / 2 - c / 2) },
      half: { lo: opening.a - (t - c) / 2, hi: opening.b + (t - c) / 2 },
      inset: { lo: opening.a + c, hi: opening.b - c },
    };
    for (const hinge of HINGES) {
      const spec = sized(single, hinge, c);
      const [left, right] = leavesOf(spec).filter((leaf) => leaf.bayId === bay.id);
      const span = expected[hinge];
      const leafWidth = floor10((span.hi - span.lo - c) / 2);
      // The first bay's outer end is the cabinet's edge; its inner end is a divider shared with bay 2.
      const lo = hinge === "full" ? opening.a - (t - c / 2) : span.lo;
      near(left!.x, lo, `${hinge} c=${c}: the left leaf starts at the formula's edge`);
      near(left!.width, leafWidth, `${hinge} c=${c}: and is half the span less half the gap`);
      near(right!.x - (left!.x + left!.width), c, `${hinge} c=${c}: the gap between the pair is the clearance`);
      near(right!.width, left!.width, `${hinge} c=${c}: both leaves are equal`);
    }
  }
}

// The cabinet's outer edges, vertically and across, for every hinge and clearance.
for (const hinge of HINGES) {
  const spec = sized(wardrobe, hinge);
  const c = 5;
  const all = leavesOf(spec);
  const firstLeaf = all[0]!;
  const lastBay = all.filter((leaf) => leaf.bayId === cabinet.bays.at(-1)!.id && leaf.run === 0);
  const reachOuter = hinge === "full" ? t - c / 2 : hinge === "half" ? (t - c) / 2 : -c;
  near(firstLeaf.x, t - reachOuter, `${hinge}: the first door starts at the cabinet's edge as the hinge puts it`);
  const bottomOuter = hinge === "full" ? plinth + c / 2 : hinge === "half" ? plinth + t - (t - c) / 2 : plinth + t + c;
  near(firstLeaf.y, bottomOuter, `${hinge}: and rises from the bottom as the hinge puts it`);
  const topOuter = hinge === "full" ? H - c / 2 : hinge === "half" ? H - t + (t - c) / 2 : H - t - c;
  near(firstLeaf.y + firstLeaf.height, topOuter, `${hinge}: to the top as the hinge puts it`);
  void lastBay;
}
{
  // Full overlay: aligned with the cabinet's edges, left and right, a half clearance in.
  const spec = sized(wardrobe, "full");
  const edges = leavesOf(spec).filter((leaf) => leaf.run === 0 && leaf.bayId !== cabinet.bays[2]!.id);
  near(Math.min(...leavesOf(spec).map((leaf) => leaf.x)), 2.5, "full overlay: the leftmost door is 2.5 mm from the cabinet's edge");
  near(W - Math.max(...leavesOf(spec).map((leaf) => leaf.x + leaf.width)), 2.5, "full overlay: and the rightmost 2.5 mm from the other");
  void edges;
}

// Adjacent doors across a shared divider, and every pair inside a bay: the clearance, exactly.
for (const hinge of ["full", "half"] as const) {
  const spec = sized(wardrobe, hinge);
  const row = leavesOf(spec).sort((a, b) => a.x - b.x);
  equal(row.length, 6, `${hinge}: six doors, two to a bay`);
  for (let index = 1; index < row.length; index += 1) near(row[index]!.x - (row[index - 1]!.x + row[index - 1]!.width), 5, `${hinge}: doors ${index} and ${index + 1} are 5 mm apart, divider or not`);
}
{
  const row = leavesOf(sized(wardrobe, "inset")).sort((a, b) => a.x - b.x);
  near(row[1]!.x - (row[0]!.x + row[0]!.width), 5, "inset: a pair is 5 mm apart");
  near(row[2]!.x - (row[1]!.x + row[1]!.width), 2 * 5 + t, "inset: doors on either side of a divider are the divider and a reveal each apart");
  near(row[4]!.x - (row[3]!.x + row[3]!.width), 2 * 5 + t, "inset: and so at the second divider");
}

// Different hinges, different doors; no one formula.
{
  const widths = HINGES.map((hinge) => leavesOf(sized(wardrobe, hinge))[0]!.width);
  ok(widths[0]! > widths[1]! && widths[1]! > widths[2]!, `full ${widths[0]} > half ${widths[1]} > inset ${widths[2]}`);
  const heights = HINGES.map((hinge) => leavesOf(sized(wardrobe, hinge))[0]!.height);
  ok(heights[0]! > heights[1]! && heights[1]! > heights[2]!, `and likewise tall: ${heights.join(" > ")}`);
  const xs = HINGES.map((hinge) => leavesOf(sized(wardrobe, hinge))[0]!.x);
  ok(xs[0]! < xs[1]! && xs[1]! < xs[2]!, `and starting further in: ${xs.join(" < ")}`);
}

// ---------------------------------------------------------------------------
// 3. Several widths: never overlapping, never closer than the clearance
// ---------------------------------------------------------------------------
for (const width of [500, 600, 800, 1000, 1200, 1600, 2400, 3200]) {
  for (const hinge of HINGES) {
    for (const c of [5, 2, 10]) {
      const spec = sized(validateSpec(startingDesign("wardrobe", { width })).spec, hinge, c);
      for (const [cabinetIndex, one] of spec.cabinets.entries()) {
        const list = fronts(spec, cabinetIndex);
        ok(list.length > 0, `${width} ${hinge}: has doors`);
        for (const [i, a] of list.entries()) {
          ok(a.x >= -0.5 && a.y >= -0.5 && a.x + a.width <= one.size.width + 0.5 && a.y + a.height <= one.size.height + 0.5, `${width} ${hinge} c=${c}: a front stays inside its cabinet`);
          for (const b of list.slice(i + 1)) {
            const apartX = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
            const apartY = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
            ok(Math.max(apartX, apartY) >= c - 0.06, `${width} ${hinge} c=${c}: two fronts are ${Math.round(Math.max(apartX, apartY) * 10) / 10} mm apart, not less than ${c}`);
          }
        }
        const placed = doors(spec).filter((part) => part.cabinetId === one.id);
        equal(new Set(placed.map((part) => part.id)).size, placed.length, `${width} ${hinge}: every door part once`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 4. The parts, the cut list and the hardware follow
// ---------------------------------------------------------------------------
for (const hinge of HINGES) {
  const spec = sized(wardrobe, hinge);
  const made = doors(spec);
  const leaves = leavesOf(spec);
  equal(made.reduce((total, part) => total + part.quantity, 0), leaves.length, `${hinge}: a door part for every leaf`);
  for (const part of made.filter((entry) => entry.quantity === 1 || entry.role === "door")) {
    ok(leaves.some((leaf) => Math.abs(leaf.width - part.width) < 0.01 && Math.abs(leaf.height - part.length) < 0.01), `${hinge}: ${part.label} is cut at a size the drawing has`);
  }
  equal(made.every((part) => part.placements.every((at) => at.z === (hinge === "inset" ? 0 : -18))), true, `${hinge}: doors stand ${hinge === "inset" ? "flush with" : "proud of"} the carcass`);
  const list = buildCutList(spec, buildParts(spec));
  const doorRows = list.rows.filter((row) => /-DR\d*$/.test(row.partId));
  equal(doorRows.reduce((total, row) => total + row.quantity, 0), leaves.length, `${hinge}: the cut list has every door once`);
  ok(doorRows.every((row) => leaves.some((leaf) => Math.round(leaf.width) === row.width && Math.round(leaf.height) === row.length)), `${hinge}: at the drawn sizes, to the millimetre`);
  const hinges = buildParts(spec).hardware.find((line) => line.hardware.kind === "hinge")!;
  equal(hinges.hardware.id, hinge === "full" ? "hinge-soft-close" : hinge === "half" ? "hinge-half-overlay" : "hinge-inset", `${hinge}: ordered with its own hinge`);
  ok(hinges.note.includes(hinge === "full" ? "full overlay" : hinge === "half" ? "half overlay" : "inset"), `${hinge}: and the BOQ line says so`);
  const exported = buildExport({ spec });
  equal(exported.cutList.rows.filter((row) => /-DR\d*$/.test(row.partId)).reduce((total, row) => total + row.quantity, 0), leaves.length, `${hinge}: the export carries every door`);
  ok(exported.cost.lines.some((line) => line.label.includes(hinges.hardware.label)), `${hinge}: and prices the hinge it names`);
  ok(exported.workbook.length > 0, `${hinge}: and the workbook is written`);
}
{
  const counts = HINGES.map((hinge) => buildParts(sized(wardrobe, hinge)).hardware.find((line) => line.hardware.kind === "hinge")!.quantity);
  // The trade's rule, written out: 2 up to 1200 mm, 3 to 1600, 4 to 2000, 5 above.
  const perLeaf = (length: number) => length <= 1200 ? 2 : length <= 1600 ? 3 : length <= 2000 ? 4 : 5;
  HINGES.forEach((hinge, index) => equal(counts[index], doors(sized(wardrobe, hinge)).reduce((total, door) => total + door.quantity * perLeaf(door.length), 0), `${hinge}: hinges follow each door's own height by the trade's rule`));
  HINGES.forEach((hinge, index) => {
    const spec = sized(wardrobe, hinge);
    const made = buildParts(spec).hardware.find((line) => line.hardware.kind === "hinge")!;
    const line = calculateCost(spec, buildParts(spec)).lines.find((entry) => entry.label.includes(made.hardware.label));
    ok(line && line.quantity === counts[index], `${hinge}: the cost sheet prices ${counts[index]} of "${made.hardware.label}"`);
  });
}

// Inset doors stand in the opening: nothing behind them is in the way.
{
  const spec = sized(wardrobe, "inset");
  const all = parts(spec).filter((part) => part.manufacture !== "purchased");
  const door = all.filter((part) => part.role === "door");
  for (const piece of door) for (const at of piece.placements) {
    for (const other of all.filter((part) => part !== piece && part.cabinetId === piece.cabinetId)) for (const there of other.placements) {
      ok(!boxesOverlap(worldBox(piece, at), worldBox(other, there), 0.5), `inset: ${piece.label} meets ${other.label}`);
    }
  }
  const loose = (list: Part[]) => list.filter((part) => part.role === "shelf" && !part.label.startsWith("Fixed shelf")).map((part) => part.placements[0]!.z);
  const fixedAt = (list: Part[]) => list.filter((part) => part.label.startsWith("Fixed shelf")).map((part) => part.placements[0]!.z);
  const shelfSetbacks = loose(all);
  ok(shelfSetbacks.length > 0 && shelfSetbacks.every((z) => z >= 18 + 2), `inset: shelves stop behind the door's back face (${Math.min(...shelfSetbacks)} mm)`);
  ok(fixedAt(all).length > 0 && fixedAt(all).every((z) => z >= 18 + 2), "inset: and so do the fixed shelves between sections");
  const plain = parts(sized(wardrobe, "full"));
  equal(Math.min(...loose(plain)), 10, "overlay doors leave the usual 10 mm setback");
  equal(Math.max(...fixedAt(plain)), 0, "and the fixed shelves are where they always were");
}

// Doors and drawers in one stacked bay: lined up, and a clearance apart.
for (const hinge of ["full", "half"] as const) {
  const spec = sized(wardrobe, hinge);
  const stackBay = cabinet.bays[1]!;
  const f = cabinetFronts(spec, spec.cabinets[0]!);
  const run = f.leaves.filter((leaf) => leaf.bayId === stackBay.id);
  const drawers = f.drawers.filter((drawer) => drawer.bayId === stackBay.id);
  ok(drawers.length > 0 && run.length > 0, `${hinge}: the middle bay has doors over drawers`);
  for (const drawer of drawers) { near(drawer.x, run[0]!.x, `${hinge}: a drawer front starts where the door does`); near(drawer.x + drawer.width, run.at(-1)!.x + run.at(-1)!.width, `${hinge}: and ends where it does`, 0.2); }
  const topDrawer = drawers.reduce((best, d) => (d.y + d.height > best.y + best.height ? d : best));
  near(run[0]!.y - (topDrawer.y + topDrawer.height), 5, `${hinge}: the door run and the drawers below it are 5 mm apart`);
}

// ---------------------------------------------------------------------------
// 5. Changing the hinge changes the model at once; Manual, Make Equal, Snap, Reset
// ---------------------------------------------------------------------------
const first: DoorRef = { cabinetId: cabinet.id, bayId: cabinet.bays[0]!.id, run: 0, leaf: 0 };
const second: DoorRef = { ...first, leaf: 1 };
const doorOf = (spec: DesignSpec, ref: DoorRef) => leavesOf(spec).find((leaf) => leaf.bayId === ref.bayId && leaf.run === ref.run && leaf.leaf === ref.leaf)!;
{
  const full = sized(wardrobe, "full");
  const before = doors(full).map((part) => part.width);
  const after = doors(setHingeType(full, "inset")).map((part) => part.width);
  ok(before.every((value, index) => value !== after[index]), "switching to inset changes every door part at once");
  equal(setHingeType(full, "half").doorSizing, { hinge: "half", clearance: 5 }, "and stores the type, with the clearance it had");
  equal(setDoorClearance(setHingeType(wardrobe, "half"), 3).doorSizing, { hinge: "half", clearance: 3 }, "and a clearance is stored with the type");
  equal(setDoorClearance(full, 99).doorSizing!.clearance, 20, "a clearance is kept within 0 and 20 mm");
  equal(setDoorClearance(full, -4).doorSizing!.clearance, 0, "and not below nothing");
  equal(setHingeType(wardrobe, "full").doorSizing!.clearance, 5, "a design sized the old way takes the 5 mm default when a type is chosen");
}

// Manual sizing keeps what was typed, a clearance from its neighbour.
for (const hinge of HINGES) {
  const base = sized(wardrobe, hinge);
  const lone = doorOf(base, first);
  const typed = setDoorSize(base, first, { width: lone.width - 40 });
  equal(typed.problem, null, `${hinge}: a door can be narrowed by hand`);
  const narrowed = doorOf(typed.spec, first);
  ok(narrowed.manual, `${hinge}: and is Manual`);
  near(narrowed.width, lone.width - 40, `${hinge}: at the width typed`);
  near(doorOf(typed.spec, second).x - (narrowed.x + narrowed.width), 5 + 40, `${hinge}: the 40 mm it gave up opens as the gap to its partner, which stays where it was`);
  ok(!doorOf(typed.spec, second).manual, `${hinge}: and the partner is still automatic`);
  const widened = setDoorSize(base, first, { width: lone.width + 60 });
  equal(widened.problem, null, `${hinge}: or widened`);
  near(doorOf(widened.spec, second).x - (doorOf(widened.spec, first).x + doorOf(widened.spec, first).width), 5, `${hinge}: the partner gives way, keeping 5 mm`);
  ok(doorOf(widened.spec, first).manual && doorOf(widened.spec, second).manual, `${hinge}: both leaves are then sized`);
  // Too close to a door in the next bay: refused with the reason.
  const nextBay = leavesOf(base).find((leaf) => leaf.bayId === cabinet.bays[1]!.id && leaf.leaf === 0 && leaf.y < lone.y + lone.height && leaf.y + leaf.height > lone.y)!;
  const room = nextBay.x - (doorOf(base, second).x + doorOf(base, second).width);
  const crowd = setDoorSize(base, second, { x: doorOf(base, second).x, width: doorOf(base, second).width + room - 3 });
  ok(crowd.problem && /gap|overlap/.test(crowd.problem), `${hinge}: pushing a door within 3 mm of the next bay's is refused (${crowd.problem})`);
  ok(!doorOf(crowd.spec, second).manual, `${hinge}: and the door keeps its size`);

  // Make Equal: widths equal, gaps exactly the clearance.
  const equalised = makeDoorsEqual(typed.spec, first);
  equal(equalised.problem, null, `${hinge}: Make Equal works`);
  near(doorOf(equalised.spec, first).width, doorOf(equalised.spec, second).width, `${hinge}: and the pair is equal`, 0.11);
  near(doorOf(equalised.spec, second).x - (doorOf(equalised.spec, first).x + doorOf(equalised.spec, first).width), 5, `${hinge}: 5 mm apart`);
  // Snap targets are a clearance from the pair's meeting point.
  const targets = doorSnapTargetsOf(base, first).x;
  ok(targets.some((x) => Math.abs(x - (W / 2 - 2.5)) < 0.01) && targets.some((x) => Math.abs(x - (W / 2 + 2.5)) < 0.01), `${hinge}: snap offers the clearance either side of the centre line`);
}

// Reset to Auto uses the hinge now selected.
{
  const typed = setDoorSize(sized(wardrobe, "full"), first, { width: 300 }).spec;
  ok(doorOf(typed, first).manual, "a door sized by hand under full overlay");
  const switched = setHingeType(typed, "inset");
  near(doorOf(switched, first).width, 300, "keeps its size when the hinge changes");
  const reset = resetDoorSize(switched, first, true);
  const reference = leavesOf(sized(wardrobe, "inset"));
  near(doorOf(reset, first).width, reference[0]!.width, "Reset to Auto gives it the inset width");
  near(doorOf(reset, first).x, reference[0]!.x, "and the inset position");
  ok(!doorOf(reset, first).manual && !doorOf(reset, second).manual, "and it is automatic again");
  const all = resetAllDoorSizes(switched);
  equal(leavesOf(all).map((leaf) => [leaf.x, leaf.width, leaf.y, leaf.height]), reference.map((leaf) => [leaf.x, leaf.width, leaf.y, leaf.height]), "Reset all doors does the same for every one");
  // A typed size that cannot fit the new hinge's neighbours goes back, with the reason.
  const wide = setDoorSize(sized(wardrobe, "inset"), first, { width: doorOf(sized(wardrobe, "inset"), first).width + 20 }).spec;
  const crowded = leavesOf(setHingeType(wide, "full"));
  ok(crowded.every((leaf, index) => crowded.every((other, at) => at <= index || Math.max(other.x - (leaf.x + leaf.width), leaf.x - (other.x + other.width), other.y - (leaf.y + leaf.height), leaf.y - (other.y + other.height)) >= 5 - 0.06)), "a manual door never leaves the new hinge's doors closer than the clearance");
}

// ---------------------------------------------------------------------------
// 6. Corners, kitchens, fridge housings, handleless grips and closure panels
// ---------------------------------------------------------------------------
for (const hinge of HINGES) {
  for (const [shape, walls] of [["l_shaped", [2400, 1800]], ["u_shaped", [1800, 3000, 1800]]] as const) {
    const spec = sized(wardrobeShapeDesign({ shape, walls: [...walls], depth: 600, height: 2400 }), hinge);
    const all = parts(spec).filter((part) => part.role === "door" || part.role === "drawer_front");
    const boxes = all.flatMap((part) => part.placements.map((at, index) => ({ id: `${part.id}#${index}`, box: worldBox(part, at) })));
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) ok(!boxesOverlap(a.box, b.box, 0.5), `${hinge} ${shape}: ${a.id} and ${b.id} do not meet`);
    const others = parts(spec).filter((part) => part.role !== "door" && part.manufacture !== "purchased");
    for (const door of all.filter((part) => part.role === "door")) for (const at of door.placements) for (const other of others) for (const there of other.placements) {
      ok(!boxesOverlap(worldBox(door, at), worldBox(other, there), 0.5), `${hinge} ${shape}: ${door.label} does not go through ${other.label}`);
    }
  }
}
{
  const kitchen = validateSpec(detailed).spec;
  for (const hinge of HINGES) {
    const spec = sized(kitchen, hinge);
    for (const [index, one] of spec.cabinets.entries()) {
      const list = fronts(spec, index);
      for (const [i, a] of list.entries()) for (const b of list.slice(i + 1)) ok(Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), b.y - (a.y + a.height), a.y - (b.y + b.height)) >= 5 - 0.06, `${hinge} kitchen: ${one.label}: fronts keep the clearance`);
    }
    const aligned = spec.cabinets.map((_, index) => leavesOf(spec, index)).filter((leaves) => leaves.some((leaf) => leaf.aligned));
    ok(aligned.length > 0, `${hinge} kitchen: has units with doors across their whole front`);
    for (const leaves of aligned) {
      const sorted = [...leaves].sort((a, b) => a.x - b.x);
      for (let index = 1; index < sorted.length; index += 1) near(sorted[index]!.x - (sorted[index - 1]!.x + sorted[index - 1]!.width), 5, `${hinge} kitchen: aligned doors are 5 mm apart`);
    }
    const fridge = parts(spec).filter((part) => part.id.includes("fridge-overhead-door")).sort((a, b) => a.placements[0]!.x - b.placements[0]!.x);
    equal(fridge.length, 2, `${hinge} kitchen: two doors over the fridge`);
    near(fridge[1]!.placements[0]!.x - (fridge[0]!.placements[0]!.x + fridge[0]!.size.x), 5, `${hinge} kitchen: the two doors over the fridge are 5 mm apart`);
  }
}
for (const hinge of HINGES) {
  const spec = setClosureSettings(setDesignGrip(sized(wardrobe, hinge), "channel"), { enabled: true });
  const report = closureReport(spec);
  const swing = leavesOf(spec).map((leaf) => ({ ...leaf, thickness: hinge === "inset" ? 0 : 18, maxAngle: 110 }));
  for (const panel of report.panels) {
    equal(doorSwingConflict(panel.box, swing), null, `${hinge}: ${panel.label} lets the doors open`);
    for (const door of doors(spec)) for (const at of door.placements) ok(!boxesOverlap(panel.box, { x: at.x, y: at.y, z: at.z, sx: door.size.x, sy: door.size.y, sz: door.size.z }, 0.5), `${hinge}: ${panel.label} is clear of the doors`);
  }
  const handles = setClosureSettings(sized(wardrobe, hinge), { enabled: true });
  equal(closureReport(handles).panels.filter((panel) => panel.kind === "masking").length, 0, `${hinge}: the reveal round a door is not an opening to be covered`);
}

// ---------------------------------------------------------------------------
// 7. Saved and reopened
// ---------------------------------------------------------------------------
for (const hinge of HINGES) {
  const typed = setDoorSize(sized(wardrobe, hinge, 4), first, { width: 330 }).spec;
  const reopened = parseSpec(JSON.parse(JSON.stringify(typed)));
  ok(reopened.ok, `${hinge}: reopens`);
  if (!reopened.ok) continue;
  equal(reopened.spec.doorSizing, { hinge, clearance: 4 }, `${hinge}: with its hinge type and clearance`);
  equal(parts(reopened.spec), parts(typed), `${hinge}: and the same parts`);
  equal(buildCutList(reopened.spec, buildParts(reopened.spec)).rows, buildCutList(typed, buildParts(typed)).rows, `${hinge}: and the same cut list`);
  equal(buildParts(reopened.spec).hardware.map((line) => [line.hardware.id, line.quantity]), buildParts(typed).hardware.map((line) => [line.hardware.id, line.quantity]), `${hinge}: and the same hardware`);
  ok(doorOf(reopened.spec, first).manual && Math.abs(doorOf(reopened.spec, first).width - 330) < 0.01, `${hinge}: and the door sized by hand is still 330`);
  // Reset still works after reopening.
  const reset = resetDoorSize(reopened.spec, first, true);
  equal(leavesOf(reset).map((leaf) => leaf.manual), leavesOf(reset).map(() => false), `${hinge}: and Reset to Auto still resets it`);
}
{
  const bad = JSON.parse(JSON.stringify(sized(wardrobe, "full")));
  bad.doorSizing.clearance = 25;
  equal(parseSpec(bad).ok, false, "a clearance beyond 20 mm is refused");
  bad.doorSizing = { hinge: "sliding", clearance: 5 };
  equal(parseSpec(bad).ok, false, "and a hinge type that is not one");
  const bare = JSON.parse(JSON.stringify(sized(wardrobe, "full")));
  bare.doorSizing = {};
  const parsed = parseSpec(bare);
  ok(parsed.ok && parsed.spec.doorSizing!.hinge === "full" && parsed.spec.doorSizing!.clearance === 5, "an empty door sizing reads as full overlay, 5 mm");
}

// ---------------------------------------------------------------------------
// 8. Edges the sizing has to tell apart: open neighbours, joints, clearance past a board
// ---------------------------------------------------------------------------
const reachFor = (hinge: HingeType, board: number, c: number, kind: "outer" | "shared") =>
  hinge === "inset" ? -c : hinge === "half" ? Math.max(0, (board - c) / 2) : kind === "outer" ? board - c / 2 : board / 2 - c / 2;
{
  // A clearance wider than the board: a half-overlay door cannot reach less than the opening's edge.
  equal(leavesOf(sized(wardrobe, "half", 20))[0]!.x, t, "half overlay with a 20 mm clearance stops at the opening, not short of it");
  equal(leavesOf(sized(wardrobe, "half", 20))[0]!.x, t - reachFor("half", t, 20, "outer"), "which is what the formula gives: no reach");
}
{
  // A bay without a front beside a door: the door stops at its own opening, a half clearance short; inset a whole one.
  const niche = structuredClone(wardrobe);
  niche.cabinets[0]!.bays[2]!.door = "none";
  const legacyRight = (spec: DesignSpec, bayIndex: number) => { const own = leavesOf(spec).filter((leaf) => leaf.bayId === cabinet.bays[bayIndex]!.id).sort((a, b) => a.x - b.x); const last = own.at(-1)!; return last.x + last.width + 2; };
  const openingRight = legacyRight(niche, 1);
  for (const hinge of HINGES) {
    const spec = sized(niche, hinge);
    const own = leavesOf(spec).filter((leaf) => leaf.bayId === cabinet.bays[1]!.id).sort((a, b) => a.x - b.x);
    near(own.at(-1)!.x + own.at(-1)!.width, openingRight - (hinge === "inset" ? 5 : 2.5), `${hinge}: beside an open bay a door stops short of the divider by ${hinge === "inset" ? 5 : 2.5} mm`);
  }
}
{
  // Doors over an open display in a stack: the display is not covered; the door stops short of it.
  const stacked = structuredClone(wardrobe);
  (stacked.cabinets[0]!.bays[1]!.fitting as { sections: unknown[] }).sections = [{ id: "s1", kind: "hanging", share: 2, rails: 1 }, { id: "s2", kind: "display", share: 1 }, { id: "s3", kind: "drawers", share: 1, drawers: 2 }];
  const checked = validateSpec(stacked).spec;
  const bottomOf = (hinge: HingeType) => leavesOf(sized(checked, hinge)).filter((leaf) => leaf.bayId === cabinet.bays[1]!.id).reduce((low, leaf) => Math.min(low, leaf.y), Infinity);
  near(bottomOf("inset") - bottomOf("full"), 2.5, "over an open display the door stops a half clearance short (full overlay), a whole one when inset");
  near(bottomOf("half"), bottomOf("full"), "and a half-overlay door the same as a full-overlay one: neither reaches over the display");
}
{
  // A transport joint is a double wall: doors either side reach over half of two boards.
  const wide = validateSpec(startingDesign("wardrobe", { width: 3200 })).spec;
  const wideCabinet = wide.cabinets[0]!;
  const leavesByBay = (spec: DesignSpec, bayId: string) => leavesOf(spec).filter((leaf) => leaf.bayId === bayId).sort((a, b) => a.x - b.x);
  const wideT = wide.carcass.board.thickness;
  const places = bayLayout(wideCabinet, wideT);
  let joints = 0;
  for (let index = 0; index + 1 < places.length; index += 1) {
    const here = places[index]!;
    const next = places[index + 1]!;
    const board = next.x - (here.x + here.width);
    if (Math.abs(board - 2 * wideT) < 0.01) joints += 1;
    ok(Math.abs(board - wideT) < 0.01 || Math.abs(board - 2 * wideT) < 0.01, `the board between bays ${index + 1} and ${index + 2} is one thickness or two (${board})`);
    equal(here.jointRight, board > wideT + 0.01, `bay ${index + 1}: the layout and the geometry agree where the joint is`);
    for (const hinge of HINGES) {
      const spec = sized(wide, hinge);
      const newLeft = leavesByBay(spec, wideCabinet.bays[index]!.id).at(-1)!;
      const newRight = leavesByBay(spec, wideCabinet.bays[index + 1]!.id)[0]!;
      near(newLeft.x + newLeft.width, here.x + here.width + reachFor(hinge, board, 5, "shared"), `${hinge}: the door left of a ${board} mm board reaches as that board says`);
      near(newRight.x, next.x - reachFor(hinge, board, 5, "shared"), `${hinge}: and the door right of it`);
    }
  }
  equal(joints, 1, "a 3200 mm wardrobe has one double wall, at the transport joint");
}
{
  // Drawers whose grip is not a finger gap: a clearance apart, whatever the hinge; and they follow the hinge's face.
  const drawn = structuredClone(wardrobe);
  drawn.cabinets[0]!.bays[2]!.fitting = { kind: "drawers", count: 3, grip: "handle" } as never;
  drawn.cabinets[0]!.bays[2]!.door = "none";
  const checked = validateSpec(drawn).spec;
  for (const hinge of HINGES) {
    const spec = sized(checked, hinge, 6);
    const stack = cabinetFronts(spec, spec.cabinets[0]!).drawers.filter((drawer) => drawer.bayId === cabinet.bays[2]!.id).sort((a, b) => a.y - b.y);
    ok(stack.length >= 3, `${hinge}: drawers drawn in the third bay`);
    for (let index = 1; index < stack.length; index += 1) near(stack[index]!.y - (stack[index - 1]!.y + stack[index - 1]!.height), 6, `${hinge}: drawer fronts with a handle are 6 mm apart`);
  }
  for (const hinge of HINGES) {
    const spec = sized(wardrobe, hinge);
    const made = parts(spec).filter((part) => part.role === "drawer_front" && !part.internal);
    const drawnFronts = cabinetFronts(spec, spec.cabinets[0]!).drawers;
    equal(made.length, drawnFronts.length, `${hinge}: a drawer front part for every drawer drawn`);
    ok(made.every((part) => part.placements.every((at) => at.z === (hinge === "inset" ? 0 : -18))), `${hinge}: drawer fronts stand ${hinge === "inset" ? "flush" : "proud"} like the doors`);
    ok(made.every((part) => drawnFronts.some((front) => Math.abs(front.width - part.width) < 0.51 && Math.abs(front.height - part.length) < 0.51 && part.placements.some((at) => Math.abs(at.x - front.x) < 0.06))), `${hinge}: and are cut at the size and place drawn`);
  }
}
{
  // Sliding leaves run in front of the opening whatever the hinge says.
  const sliding = structuredClone(wardrobe);
  sliding.cabinets[0]!.bays[0]!.door = "sliding";
  const slid = parts(sized(sliding, "inset")).filter((part) => part.role === "door" && part.doorStyle === "sliding");
  ok(slid.length > 0 && slid.every((part) => part.placements.every((at) => at.z === -18)), "sliding doors stay in front of the carcass when the hinge type is inset");
}
{
  // The plinth's recess is measured from the doors' faces: flush doors leave the full recess.
  const front = (hinge: HingeType) => parts(sized(wardrobe, hinge)).find((part) => part.label === "Recessed plinth, front")!.placements[0]!.z;
  equal(front("full"), 2, "full overlay: the plinth is set back 20 mm from the door's face, 2 mm from the carcass");
  equal(front("inset"), 20, "inset: from the carcass front, where the doors stand");
}
{
  // Settings travel with the design and behave.
  const eight = setHingeType(setDoorClearance(wardrobe, 8), "half");
  equal(eight.doorSizing, { hinge: "half", clearance: 8 }, "changing the hinge keeps the clearance chosen");
  equal(manualDoorCount(wardrobe), 0, "no door is sized by hand to begin with");
  equal(manualDoorCount(setDoorSize(sized(wardrobe, "full"), first, { width: 300 }).spec), 1, "one is, once typed");
  const negative = JSON.parse(JSON.stringify(sized(wardrobe, "full")));
  negative.doorSizing.clearance = -1;
  equal(parseSpec(negative).ok, false, "a negative clearance is refused");
}
{
  // A size kept by hand that a larger clearance no longer allows goes back to automatic, with the reason.
  const base = sized(wardrobe, "full");
  const widened = setDoorSize(base, first, { width: doorOf(base, first).width + 60 }).spec;
  ok(doorOf(widened, first).manual && doorOf(widened, second).manual, "a pair sized by hand, 5 mm apart");
  const crowded = setDoorClearance(widened, 20);
  ok(!doorOf(crowded, first).manual && !doorOf(crowded, second).manual, "goes back to automatic when the clearance rises to 20 mm");
  ok(cabinetFronts(crowded, crowded.cabinets[0]!).warnings.some((warning) => /20 mm gap/.test(warning)), "and says why");
  // A door set in a stack, beside a drawer above or below it, is a clearance away and may be resized in place.
  const stackLeaf = leavesOf(base).find((leaf) => leaf.bayId === cabinet.bays[1]!.id)!;
  const ref: DoorRef = { cabinetId: cabinet.id, bayId: stackLeaf.bayId, run: stackLeaf.run, leaf: stackLeaf.leaf };
  equal(setDoorSize(base, ref, { height: stackLeaf.height - 20 }).problem, null, "a door over drawers can be made shorter by hand");
  const drawerTop = cabinetFronts(base, base.cabinets[0]!).drawers.reduce((top, drawer) => Math.max(top, drawer.y + drawer.height), 0);
  const tooLow = setDoorSize(base, ref, { y: drawerTop + 3, height: stackLeaf.y + stackLeaf.height - (drawerTop + 3) });
  ok(tooLow.problem && /gap|overlap/.test(tooLow.problem), `and not within 3 mm of the drawer below it (${tooLow.problem})`);
}
{
  // Snap offers the clearance the design has, not a fixed one.
  const spec = sized(wardrobe, "full", 7.3);
  const x = doorSnapTargetsOf(spec, first).x;
  const offers = (target: number) => x.some((value) => Math.abs(value - target) < 0.01);
  ok([7.3, W - 7.3, W / 2 - 3.65, W / 2 + 3.65].every(offers), "with a 7.3 mm clearance snap offers 7.3 mm in from each edge and half that either side of the centre line");
  ok(![2, W - 2, W / 2 - 1, W / 2 + 1].some(offers), "and not the old 2 mm");
}
{
  // Aligned kitchen doors take their top and bottom from the hinge.
  const kitchen = validateSpec(detailed).spec;
  for (const hinge of HINGES) {
    const spec = sized(kitchen, hinge);
    const aligned = spec.cabinets.flatMap((one, index) => leavesOf(spec, index).filter((leaf) => leaf.aligned).map((leaf) => ({ leaf, one })));
    ok(aligned.length > 0, `${hinge} kitchen: doors across a whole front`);
    for (const { leaf, one } of aligned) {
      const kt = spec.carcass.board.thickness;
      near(leaf.y, one.plinthHeight + kt - reachFor(hinge, kt, 5, "outer"), `${hinge} kitchen: an aligned door starts where the hinge puts the bottom`);
      near(leaf.y + leaf.height, one.size.height - kt + reachFor(hinge, kt, 5, "outer"), `${hinge} kitchen: and ends where it puts the top`);
    }
    const fridge = parts(spec).filter((part) => part.id.includes("fridge-overhead-door"));
    ok(fridge.every((part) => part.placements[0]!.z === parts(sized(kitchen, "full")).find((other) => other.id === part.id)!.placements[0]!.z + (hinge === "inset" ? -18 : 0)), `${hinge} kitchen: the fridge doors stand ${hinge === "inset" ? "flush" : "proud"}`);
  }
}
{
  // The end panel beside the doors is level with them.
  const open = structuredClone(wardrobe);
  open.wardrobePlan = { priority: "balanced", leftEnd: "open", rightEnd: "wall" } as never;
  for (const hinge of HINGES) {
    const end = closureReport(setClosureSettings(sized(open, hinge), { enabled: true })).panels.find((panel) => panel.kind === "decorative_end")!;
    ok(end, `${hinge}: an exposed end gets a decorative panel`);
    equal(end.box.z + 0, hinge === "inset" ? 0 : -18, `${hinge}: level with the doors' faces`);
  }
}

console.log(`Door sizing by hinge type: ${checks} checks passed.`);
