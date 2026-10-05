/**
 * Doors sized by hand: the size that is drawn is the size that is cut.
 *
 *   npx tsx scripts/berchuma_doors_check.ts
 *
 * Automatic sizing stays the default and makes exactly the parts it always
 * made. A door given its own width or height changes the part the cut list
 * cuts, the price, the hinges and the export — not only the picture — and a
 * size that cannot be built is refused with a reason rather than drawn.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildCutList } from "../src/features/berchuma-studio/services/cutlist";
import { calculateCost } from "../src/features/berchuma-studio/services/costing";
import { wardrobeExample } from "../src/features/berchuma-studio/services/examples";
import { startingDesign } from "../src/features/berchuma-studio/services/starting-designs";
import { buildExport } from "../src/features/berchuma-studio/services/exports";
import { buildParts, cabinetFronts, hingesPerLeaf } from "../src/features/berchuma-studio/services/geometry";
import { dragDoorEdge, snapValue } from "../src/features/berchuma-studio/services/door-layout";
import { createKitchenDesign } from "../src/features/berchuma-studio/services/kitchen-setup";
import { visibleKitchenParts } from "../src/features/berchuma-studio/services/kitchen-construction";
import {
  doorLeafOf,
  doorSnapTargetsOf,
  makeDoorsEqual,
  resetDoorSize,
  setBayDoor,
  setBayFitting,
  setDoorManual,
  setDoorSize,
  type DoorRef,
} from "../src/features/berchuma-studio/services/operations";
import { resolveDesign } from "../src/features/berchuma-studio/services/resolve";
import { DEFAULT_KITCHEN_SETUP, REFERENCE_KITCHEN_DETAILS } from "../src/features/berchuma-studio/types/kitchen";
import type { Part } from "../src/features/berchuma-studio/types/parts";
import { validateSpec, type DesignSpec } from "../src/features/berchuma-studio/types/spec";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };

const doors = (spec: DesignSpec, cabinetId?: string) => buildParts(spec).parts.filter((part) => part.role === "door" && (!cabinetId || part.cabinetId === cabinetId));
const fronts = (spec: DesignSpec) => buildParts(spec).parts.filter((part) => part.role === "drawer_front");
const rows = (spec: DesignSpec) => buildCutList(spec, buildParts(spec)).rows;
const strip = (parts: Part[]) => parts.map((part) => { const copy = { ...part }; delete copy.doorLeaf; return copy; });
/** Every placed door as [width, height, x, y], in the design's frame. */
const placed = (parts: Part[]) => parts.flatMap((part) => part.placements.map((at) => [part.size.x, part.size.y, at.x, at.y])).sort((a, b) => a[2]! - b[2]! || a[3]! - b[3]!);

// ---------------------------------------------------------------------------
// Automatic stays the default, and makes the parts it always made.
// ---------------------------------------------------------------------------
// Through the validator, as the editor holds it: that is what pairs a wide bay.
const wardrobe = validateSpec(wardrobeExample()).spec;
const cabinet = wardrobe.cabinets[0]!;
const [bay1, bay2, bay3] = cabinet.bays;
const left: DoorRef = { cabinetId: cabinet.id, bayId: bay1!.id, run: 0, leaf: 0 };
const right: DoorRef = { ...left, leaf: 1 };
const autoDoors = doors(wardrobe);
const pair = autoDoors.find((part) => part.id === `${cabinet.id}/${bay1!.id}-door`)!;
ok(pair, "an automatic pair is still the one part it always was");
equal([pair.quantity, pair.width, pair.length, pair.label], [2, 385, 2296, "Door — bay 1 (pair)"], "two leaves of 385 × 2296, labelled as before");
equal(pair.doorLeaf, { run: 0, first: 0 }, "and it says which leaves it is, for the viewer");
ok(cabinetFronts(wardrobe, cabinet).leaves.every((leaf) => !leaf.manual), "a design with no sizes typed is all automatic");
// A design saved before this existed has no overrides and parses as automatic.
const saved = JSON.parse(JSON.stringify(wardrobe));
for (const bay of saved.cabinets[0].bays) delete bay.doorOverrides;
const reloaded = validateSpec(saved).spec;
equal(strip(doors(reloaded)), strip(autoDoors), "an old saved design makes the same doors");

// ---------------------------------------------------------------------------
// A width typed into one leaf of a pair.
// ---------------------------------------------------------------------------
const narrower = setDoorSize(wardrobe, left, { width: 300 });
equal(narrower.problem, null, "a narrower left leaf is allowed");
ok(narrower.spec !== wardrobe && wardrobe.cabinets[0]!.bays[0]!.doorOverrides === undefined, "the design given is not changed in place");
const split = doors(narrower.spec).filter((part) => part.bayId === bay1!.id);
equal(split.map((part) => [part.id.split("/")[1], part.quantity, part.width, part.length]), [[`${bay1!.id}-door-leaf-0`, 1, 300, 2296], [`${bay1!.id}-door-leaf-1`, 1, 385, 2296]], "the pair is now a part per leaf, each its own size");
equal(split.map((part) => part.label), ["Door — bay 1 1 of 2", "Door — bay 1 2 of 2"], "named leaf by leaf on the cut list");
equal(split.map((part) => part.doorLeaf), [{ run: 0, first: 0 }, { run: 0, first: 1 }], "each knows its leaf");
ok(!doors(narrower.spec).some((part) => part.id.endsWith(`${bay1!.id}-door`)), "and the shared part is gone, not counted twice");
// The model, the cut list and the price all read the same part.
const placedAt = resolveDesign(narrower.spec).cabinets[0]!;
const leaf0 = doorLeafOf(narrower.spec, left)!;
equal([split[0]!.placements[0]!.x, split[0]!.placements[0]!.y], [placedAt.x + leaf0.x, placedAt.y + leaf0.y], "the 3D door stands where the leaf is");
equal([split[0]!.size.x, split[0]!.size.y], [leaf0.width, leaf0.height], "and is the leaf's size");
// The cut list groups identical pieces, so it is counted by size.
const doorSizes = (spec: DesignSpec) => rows(spec).filter((row) => /^Door/.test(row.label)).map((row) => `${row.length}×${row.width}×${row.quantity}`).sort();
equal(doorSizes(wardrobe), ["1582×385×2", "2296×385×4"], "automatically: four tall leaves of 385");
equal(doorSizes(narrower.spec), ["1582×385×2", "2296×300×1", "2296×385×3"], "the cut list cuts one at 300 and three at 385, as drawn");
const area = (spec: DesignSpec) => Object.values(buildParts(spec).totals.areaByBoard).reduce((sum, value) => sum + value, 0);
const band = (spec: DesignSpec) => Object.values(buildParts(spec).totals.bandByEdge).reduce((sum, value) => sum + value, 0);
ok(Math.abs(area(wardrobe) - area(narrower.spec) - (0.385 - 0.3) * 2.296) < 0.001, "board area drops by exactly the strip taken off the door");
ok(Math.abs(band(wardrobe) - band(narrower.spec) - 2 * (0.385 - 0.3)) < 0.01, "edge band drops by the two edges that got shorter");
ok(calculateCost(narrower.spec, buildParts(narrower.spec)).productionCost < calculateCost(wardrobe, buildParts(wardrobe)).productionCost, "and the price follows");
const exported = buildExport({ spec: narrower.spec });
ok(exported.cutList.rows.some((row) => row.label === "Door — bay 1 1 of 2" && row.width === 300 && row.length === 2296), "the export carries the size that was typed");

// Wider runs into the other leaf: its meeting edge gives way, a gap clear.
const wider = setDoorSize(wardrobe, left, { width: 450 });
equal(wider.problem, null, "a wider left leaf pushes its partner");
equal(placed(doors(wider.spec).filter((part) => part.bayId === bay1!.id)).map((entry) => [entry[0], entry[2]]), [[450, 20], [320, 472]], "450 on the left, the right leaf 320 from 472 — the 2 mm gap kept");
// The right leaf's width keeps its right edge.
const rightWider = setDoorSize(wardrobe, right, { width: 450 });
equal(placed(doors(rightWider.spec).filter((part) => part.bayId === bay1!.id)).map((entry) => [entry[0], entry[2]]), [[320, 20], [450, 342]], "the right leaf grows to the left, its outer edge staying on the cabinet side");
// A height on its own.
const shorter = setDoorSize(wardrobe, left, { height: 1500 });
equal(doors(shorter.spec).filter((part) => part.bayId === bay1!.id).map((part) => [part.width, part.length]), [[385, 1500], [385, 2296]], "a shorter left leaf, its partner untouched");
const hinges = (spec: DesignSpec) => buildParts(spec).hardware.filter((line) => line.hardware.kind === "hinge").reduce((sum, line) => sum + line.quantity, 0);
equal(hingesPerLeaf(2296) - hingesPerLeaf(1100), 3, "a 2296 door hangs on three more hinges than an 1100 one");
equal(hinges(setDoorSize(wardrobe, left, { height: 1100 }).spec), hinges(wardrobe) - 3, "so cutting one down to 1100 buys three fewer hinges");

// ---------------------------------------------------------------------------
// What cannot be built is refused, with a reason, and nothing changes.
// ---------------------------------------------------------------------------
const refused = (size: Parameters<typeof setDoorSize>[2], pattern: RegExp, message: string, ref: DoorRef = left) => {
  const result = setDoorSize(wardrobe, ref, size);
  ok(result.problem && pattern.test(result.problem), `${message} (${result.problem})`);
  ok(result.spec === wardrobe, `${message}: the design is left as it was`);
};
refused({ width: 0 }, /at least 100/, "a zero width");
refused({ width: -200 }, /at least 100/, "a negative width");
refused({ height: 60 }, /at least 100/, "a door too short to hang");
refused({ width: Number.NaN }, /not a size/, "not a number");
refused({ width: 2500 }, /Wider than the cabinet/, "wider than the cabinet");
refused({ height: 2500 }, /Taller than the cabinet/, "taller than the cabinet");
refused({ x: -40 }, /outside its cabinet/, "past the cabinet's side");
refused({ y: 1000 }, /outside its cabinet/, "out through the top");
refused({ x: 500, width: 400 }, /overlap/, "over the next bay's door", right);
const stackDoor: DoorRef = { cabinetId: cabinet.id, bayId: bay2!.id, run: 0, leaf: 0 };
const overDrawers = setDoorSize(wardrobe, stackDoor, { y: 300 });
ok(overDrawers.problem && /overlap/.test(overDrawers.problem), "a door pulled down over the drawers is refused");

// A size that got into a saved design some other way is not built either:
// the door keeps its automatic size and the design says why.
const forced = structuredClone(wardrobe);
forced.cabinets[0]!.bays[0]!.doorOverrides = [{ run: 0, leaf: 0, x: 20, y: 102, width: 700, height: 2296 }];
const forcedFronts = cabinetFronts(forced, forced.cabinets[0]!);
equal(forcedFronts.leaves.filter((leaf) => leaf.bayId === bay1!.id).map((leaf) => [leaf.width, leaf.manual]), [[385, false], [385, false]], "an overlapping saved size falls back to automatic");
ok(forcedFronts.warnings.some((warning) => /overlap/.test(warning)), "with a warning that says so");
equal(strip(doors(forced)), strip(autoDoors), "and the cut list cuts the automatic doors");

// ---------------------------------------------------------------------------
// Make Equal, Reset, Manual.
// ---------------------------------------------------------------------------
const equalised = makeDoorsEqual(narrower.spec, left);
equal(equalised.problem, null, "Make Equal on an uneven pair");
equal(placed(doors(equalised.spec).filter((part) => part.bayId === bay1!.id)).map((entry) => [entry[0], entry[2]]), [[385, 20], [385, 407]], "two leaves of 385, the gap between them kept");
const reset = resetDoorSize(narrower.spec, left, true);
equal(strip(doors(reset)), strip(autoDoors), "Reset to Auto gives back exactly the automatic doors");
ok(reset.cabinets[0]!.bays[0]!.doorOverrides === undefined, "and leaves nothing behind in the design");
const onlyLeft = resetDoorSize(wider.spec, left);
equal(cabinetFronts(onlyLeft, onlyLeft.cabinets[0]!).leaves.filter((leaf) => leaf.bayId === bay1!.id).map((leaf) => leaf.manual), [false, true], "resetting one leaf leaves the other as typed");
// The left leaf pushed into the right one, then the left leaf reset: the right
// leaf's typed size would now overlap, so it goes back to automatic as well.
const pushedRight = setDoorSize(wardrobe, right, { width: 450 }).spec;
const resetLeft = resetDoorSize(pushedRight, left);
equal(cabinetFronts(resetLeft, resetLeft.cabinets[0]!).warnings, [], "Reset leaves no size behind that cannot be kept");
equal(resetLeft.cabinets[0]!.bays[0]!.doorOverrides, undefined, "the pushed leaf is automatic again too");
const manual = setDoorManual(wardrobe, left);
equal(doorLeafOf(manual, left)!.manual, true, "Manual keeps the door's size as its own");
equal(placed(doors(manual).filter((part) => part.bayId === bay1!.id)), placed(autoDoors.filter((part) => part.bayId === bay1!.id)), "without moving it");
// Single doors side by side across bays share their row.
const vanity = startingDesign("vanity");
const wall = vanity.cabinets.find((item) => item.kind === "wall")!;
const vanityLeft: DoorRef = { cabinetId: wall.id, bayId: wall.bays[0]!.id, run: 0, leaf: 0 };
const vanityUneven = setDoorSize(vanity, vanityLeft, { width: 400 }).spec;
const vanityEqual = makeDoorsEqual(vanityUneven, vanityLeft);
equal(vanityEqual.problem, null, "two single doors on two bays can be made equal");
equal(cabinetFronts(vanityEqual.spec, vanityEqual.spec.cabinets.find((item) => item.id === wall.id)!).leaves.map((leaf) => [leaf.x, leaf.width]), [[20, 579], [601, 579]], "1160 across them, a gap between, 579 each");
ok(/no other door/.test(makeDoorsEqual(startingDesign("kitchen"), { cabinetId: "base-11", bayId: "bay-6", run: 0, leaf: 0 }).problem ?? ""), "a lone door has nothing to share with");

// Changing the kind of front or the fitting starts the doors over.
equal(setBayDoor(narrower.spec, cabinet.id, bay1!.id, "sliding").cabinets[0]!.bays[0]!.doorOverrides, undefined, "a new door style starts automatic");
equal(setBayFitting(narrower.spec, cabinet.id, bay1!.id, { kind: "shelves", count: 3, adjustable: true }).cabinets[0]!.bays[0]!.doorOverrides, undefined, "a new fitting starts automatic");

// Saved and loaded, a typed size survives.
const roundTrip = validateSpec(JSON.parse(JSON.stringify(narrower.spec))).spec;
equal(strip(doors(roundTrip)), strip(doors(narrower.spec)), "a typed size survives saving and loading");

// ---------------------------------------------------------------------------
// Sliding doors, stacked bays, kitchen base, wall and aligned units.
// ---------------------------------------------------------------------------
const sliding = setBayDoor(wardrobe, cabinet.id, bay3!.id, "sliding");
const slidingRef: DoorRef = { cabinetId: cabinet.id, bayId: bay3!.id, run: 0, leaf: 0 };
const slidingSized = setDoorSize(sliding, slidingRef, { width: 420 });
equal(slidingSized.problem, null, "a sliding leaf can be sized");
equal(doors(slidingSized.spec).filter((part) => part.bayId === bay3!.id).map((part) => [part.doorStyle, part.width, part.quantity]), [["sliding", 420, 1], ["sliding", 350, 1]], "and stays a sliding door, its partner giving way");

const drawersBefore = strip(fronts(wardrobe));
const stackSized = setDoorSize(wardrobe, stackDoor, { height: 1300 });
equal(stackSized.problem, null, "a door over a stack's hanging section can be sized");
equal(doors(stackSized.spec).filter((part) => part.bayId === bay2!.id).map((part) => [part.id.split("/")[1], part.length]), [[`${bay2!.id}-door-0-leaf-0`, 1300], [`${bay2!.id}-door-0-leaf-1`, 1582]], "the stack's door run, leaf by leaf");
equal(strip(fronts(stackSized.spec)), drawersBefore, "and the drawer fronts under it are exactly as they were");

const kitchen = startingDesign("kitchen");
const base: DoorRef = { cabinetId: "base-11", bayId: "bay-6", run: 0, leaf: 0 };
const baseSized = setDoorSize(kitchen, base, { height: 600 });
equal(baseSized.problem, null, "a kitchen base door can be sized");
equal(doors(baseSized.spec, "base-11").map((part) => [part.width, part.length, part.quantity]), [[560, 600, 1]], "560 × 600 on the cut list");
const wallRef: DoorRef = { cabinetId: "wall-14", bayId: "bay-13", run: 0, leaf: 0 };
const wallSized = setDoorSize(kitchen, wallRef, { width: 300 });
equal(doors(wallSized.spec, "wall-14").map((part) => [part.width, part.length]), [[300, 716], [379, 716]], "a wall unit's left leaf at 300");

const detailed = createKitchenDesign({ ...DEFAULT_KITCHEN_SETUP, shape: "l_shaped", wallHeight: 1000, topHeight: 0, details: structuredClone(REFERENCE_KITCHEN_DETAILS) });
const sink = detailed.cabinets.find((item) => item.kitchenRole === "sink")!;
const alignedRef: DoorRef = { cabinetId: sink.id, bayId: sink.bays[0]!.id, run: 0, leaf: 0 };
ok(doorLeafOf(detailed, alignedRef)?.aligned, "a detailed kitchen's sink unit hangs its doors across the whole front");
const alignedSized = setDoorSize(detailed, alignedRef, { width: 350 });
equal(alignedSized.problem, null, "and they can be sized too");
const alignedParts = visibleKitchenParts(buildParts(alignedSized.spec).parts, true).filter((part) => part.cabinetId === sink.id && part.role === "door");
equal(alignedParts.map((part) => [part.id.split("/")[1], part.width]), [["aligned-door-0", 350], ["aligned-door-1", 397]], "the aligned doors are the parts that change, still one panel each");

// ---------------------------------------------------------------------------
// Snap.
// ---------------------------------------------------------------------------
equal(snapValue(403, [405, 0], 12), { value: 405, snapped: true }, "an edge near a target lands on it");
equal(snapValue(380, [405, 0], 12), { value: 380, snapped: false }, "and moves freely away from one");
const targets = doorSnapTargetsOf(narrower.spec, left);
ok(targets.x.includes(405), "the meeting edge snaps to a door gap short of the other leaf");
// With the pair at 450 + 320 the other leaf starts at 472: 470 is a door gap
// short of it, and nothing else is there.
ok(doorSnapTargetsOf(wider.spec, left).x.includes(470), "a gap short of the other leaf, wherever it has been moved to");
ok(targets.x.includes(18) && targets.x.includes(20), "to the gable's face and a gap clear of it");
ok(targets.x.includes(794) && targets.x.includes(812), "to the divider's faces — the bay boundary");
// After the pair was made 450 + 320, the gap targets are at 470 and 472 —
// 405 is only there because that is where two equal leaves would meet.
ok(doorSnapTargetsOf(wider.spec, left).x.includes(405) && !doorSnapTargetsOf(wider.spec, left).x.includes(404), "to where the pair would be equal");
ok(targets.x.includes(1200), "to the cabinet's centre line");
const shelfTops = buildParts(wardrobe).parts.filter((part) => part.cabinetId === cabinet.id && part.role === "shelf" && part.bayId === bay1!.id).map((part) => part.placements[0]!.y + part.size.y);
ok(shelfTops.length > 0 && shelfTops.every((y) => targets.y.includes(y)), "to the shelves inside");
equal(dragDoorEdge(doorLeafOf(narrower.spec, left)!, "right", 401, { targets, snap: true }).rect.width, 385, "dragging the right edge near the gap lands it there");
equal(dragDoorEdge(doorLeafOf(narrower.spec, left)!, "right", 401, { targets, snap: false }).rect.width, 381, "with snap off it goes where it is put");
equal(dragDoorEdge(doorLeafOf(narrower.spec, left)!, "left", 900, { targets, snap: false }).rect.width, 100, "an edge dragged past the other one stops at the smallest door");
const dragged = dragDoorEdge(doorLeafOf(wardrobe, left)!, "top", 1700, { targets, snap: false });
equal([dragged.rect.y, dragged.rect.height], [102, 1598], "dragging the top edge keeps the bottom");

// ---------------------------------------------------------------------------
// The elevation draws the doors the parts are cut from.
// ---------------------------------------------------------------------------
const elevation = readFileSync("src/features/berchuma-studio/components/viewer/elevation.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
ok(/cabinetFronts\(spec, cabinet\)/.test(elevation), "the elevation reads cabinetFronts");
ok(!/\(width - gap \* \(leaves \+ 1\)\) \/ leaves/.test(elevation), "and has no door formula of its own");

console.log(`Berchuma doors: ${checks} checks — automatic unchanged, typed sizes cut, priced, hinged and exported as drawn, bad sizes refused, Make Equal, Reset, snap`);
