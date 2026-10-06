/**
 * The Zekolo — the plinth a cabinet stands on — on or off, per cabinet.
 *
 *   npx tsx scripts/zekolo_check.ts
 *
 * On is the base Medosha has always made, now with its own height, setback
 * and board per cabinet. Off is no base at all: no plinth parts, no legs, no
 * gap — the carcass comes down to the floor, its sides and doors grow by what
 * the plinth took, and the overall height is kept. The parts come and go in
 * the cut list, the sheets, the hardware and the price. Upper modules never
 * stand on one, nor wall units. Designs saved before this keep their plinth.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildCutList } from "../src/features/berchuma-studio/services/cutlist";
import { calculateCost } from "../src/features/berchuma-studio/services/costing";
import { buildParts } from "../src/features/berchuma-studio/services/geometry";
import { createKitchenDesign } from "../src/features/berchuma-studio/services/kitchen-setup";
import { addSideDisplay, applyHeightModules, resizeCabinet, setAllZekolo, setCornerZekolo, setZekolo, zekoloApplies } from "../src/features/berchuma-studio/services/operations";
import { partWorldBounds } from "../src/features/berchuma-studio/services/part-transform";
import { resolveDesign } from "../src/features/berchuma-studio/services/resolve";
import { startingDesign, wardrobeShapeDesign } from "../src/features/berchuma-studio/services/starting-designs";
import { DEFAULT_KITCHEN_SETUP, REFERENCE_KITCHEN_DETAILS } from "../src/features/berchuma-studio/types/kitchen";
import type { Part } from "../src/features/berchuma-studio/types/parts";
import { parseSpec, validateSpec, type DesignSpec } from "../src/features/berchuma-studio/types/spec";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}
function functionText(source: string, name: string): string {
  const at = source.search(new RegExp(`function ${name}[(<]`));
  if (at === -1) return "";
  const end = source.slice(at).search(/\n\}(\n|$)/);
  return end === -1 ? source.slice(at) : source.slice(at, at + end + 2);
}

const parts = (spec: DesignSpec, cabinetId?: string) => buildParts(spec).parts.filter((part) => !cabinetId || part.cabinetId === cabinetId);
const plinths = (spec: DesignSpec, cabinetId?: string) => parts(spec, cabinetId).filter((part) => part.role === "plinth" || part.role === "leg");
const lowest = (list: Part[]) => Math.min(...list.flatMap((part) => part.placements.map((at) => partWorldBounds(part, at).min.y)));
const cost = (spec: DesignSpec) => calculateCost(spec, buildParts(spec)).productionCost;

// ---------------------------------------------------------------------------
// 1 — On: the Zekolo Medosha always made, by default.
// ---------------------------------------------------------------------------
const wardrobe = startingDesign("wardrobe", { width: 2400 });
const id = wardrobe.cabinets[0]!.id;
{
  const base = plinths(wardrobe, id);
  ok(base.some((part) => /front/.test(part.label)) && base.some((part) => /side/.test(part.label)) && base.some((part) => /rear/.test(part.label)), "on: a real four-sided recessed plinth");
  ok(base.every((part) => part.board.id === "mdf-18-black" && part.width === 100), "100 mm high, in the design's black 18 mm board");
  const front = base.find((part) => /front/.test(part.label))!;
  equal(front.placements[0]!.z, 2, "its face 20 mm behind the 18 mm doors");
  equal(wardrobe.cabinets[0]!.zekolo, undefined, "a design that never touched it has no Zekolo setting");
}

// ---------------------------------------------------------------------------
// 2 — Off: no plinth, no gap, no spacer — the carcass on the floor.
// ---------------------------------------------------------------------------
const off = setZekolo(wardrobe, id, { on: false });
{
  const cabinet = off.cabinets[0]!;
  equal([cabinet.plinthHeight, cabinet.zekolo?.on], [0, false], "off: no plinth height, recorded as off");
  equal(plinths(off).length, 0, "no plinth parts and no legs at all");
  equal([cabinet.size.height, off.envelope.height], [2100, 2100], "the overall height kept");
  equal(lowest(parts(off, id)), 0, "the carcass comes down to the floor — nothing left floating over a gap");
  const bottom = parts(off, id).find((part) => part.role === "bottom")!;
  equal(partWorldBounds(bottom, bottom.placements[0]!).min.y, 0, "its bottom panel on the floor");
  const gables = parts(off, id).filter((part) => part.role === "gable");
  ok(gables.every((part) => part.length === 2100), "the sides run the full 2100 mm");
  const onGables = parts(wardrobe, id).filter((part) => part.role === "gable");
  ok(onGables.every((part) => part.length === 2000), "(they were 2000 on the plinth)");
  const doors = (spec: DesignSpec) => Math.max(...parts(spec, id).filter((part) => part.role === "door").map((part) => part.length));
  ok(doors(off) > doors(wardrobe), "the doors grow down to the floor too");
  const cut = buildCutList(off, buildParts(off));
  ok(!cut.rows.some((row) => /plinth/i.test(row.label)) && !cut.byBoard.some((board) => board.boardId === "mdf-18-black"), "the cut list has no plinth rows and no black board to buy");
  ok(!buildParts(off).totals.areaByBoard["mdf-18-black"], "no black board in the material quantities");
  ok(calculateCost(off, buildParts(off)).lines.every((line) => line.id !== "board-mdf-18-black"), "nor in the price");
  ok(cost(off) !== cost(wardrobe), "and the price is worked out again");
  ok(cut.buildable, "everything still cut from its sheets");
}

// ---------------------------------------------------------------------------
// 3 — On again, and its dimensions: height, setback, thickness, material.
// ---------------------------------------------------------------------------
{
  const back = setZekolo(off, id, { on: true });
  equal([back.cabinets[0]!.plinthHeight, plinths(back, id).length], [100, plinths(wardrobe, id).length], "on again: the same 100 mm Zekolo back");
  const tall = setZekolo(wardrobe, id, { height: 150 });
  equal(tall.cabinets[0]!.plinthHeight, 150, "height 150");
  ok(plinths(tall, id).every((part) => part.width === 150) && parts(tall, id).filter((part) => part.role === "gable").every((part) => part.length === 1950), "150 mm plinth panels, sides 1950 above it");
  equal(setZekolo(setZekolo(tall, id, { on: false }), id, { on: true }).cabinets[0]!.plinthHeight, 150, "off and on again remembers 150");
  equal(setZekolo(off, id, { height: 120 }).cabinets[0]!.plinthHeight, 120, "typing a height turns it on");
  const set = setZekolo(wardrobe, id, { setback: 40 });
  equal(plinths(set, id).find((part) => /front/.test(part.label))!.placements[0]!.z, 22, "setback 40: the face 40 behind the doors");
  const pvc = setZekolo(wardrobe, id, { boardId: "pvc-foam-15-white" });
  const pvcParts = plinths(pvc, id);
  ok(pvcParts.every((part) => part.board.id === "pvc-foam-15-white"), "material: PVC foam");
  ok(pvcParts.every((part) => Math.min(part.size.x, part.size.y, part.size.z) === 15), "and its panels 15 mm thick, as the board is");
  ok(buildCutList(pvc, buildParts(pvc)).rows.some((row) => row.boardId === "pvc-foam-15-white" && /plinth/i.test(row.label)), "cut from PVC on the cut list");
  ok(calculateCost(pvc, buildParts(pvc)).lines.some((line) => line.id === "board-pvc-foam-15-white"), "and priced as PVC");
  equal(setZekolo(wardrobe, id, { height: 1000 }).cabinets[0]!.plinthHeight, 300, "height kept to 300 at most");
  equal(setZekolo(wardrobe, id, { setback: -5 }).cabinets[0]!.zekolo?.setback, 0, "setback never in front of the doors");
}

// ---------------------------------------------------------------------------
// 4 — Per cabinet and module: wardrobe on, side off, upper never.
// ---------------------------------------------------------------------------
{
  let grid = applyHeightModules(wardrobe, id, [2100, 600]);
  grid = addSideDisplay(grid, id, { side: "right", width: 300 });
  const side = grid.cabinets.find((cabinet) => cabinet.kind === "open" && !cabinet.stackedOn)!;
  const upper = grid.cabinets.find((cabinet) => cabinet.stackedOn === id)!;
  const mixed = setZekolo(grid, side.id, { on: false });
  ok(plinths(mixed, id).length > 0 && plinths(mixed, side.id).length === 0, "main wardrobe on, side display off");
  ok(grid.cabinets.filter((cabinet) => cabinet.stackedOn).every((cabinet) => cabinet.plinthHeight === 0 && plinths(grid, cabinet.id).length === 0), "upper modules: off by default");
  equal(setZekolo(grid, upper.id, { on: true }), grid, "and an upper module cannot be given one");
  ok(!zekoloApplies(upper) && zekoloApplies(side) && zekoloApplies(grid.cabinets[0]!), "only cabinets standing on the floor have the choice");
  const lowerOff = setZekolo(grid, id, { on: false });
  const upperParts = parts(lowerOff, upper.id);
  equal(lowest(upperParts), 2100, "the lower module off: the upper still stands on its top, at 2100");
  ok(!plinths(lowerOff).some((part) => part.cabinetId === upper.id), "with no Zekolo put between the two modules");
  // Stacked carcasses refuse one even when told directly.
  const forced = structuredClone(grid);
  forced.cabinets.find((cabinet) => cabinet.id === upper.id)!.zekolo = { on: true, height: 100 };
  equal(validateSpec(forced).spec.cabinets.find((cabinet) => cabinet.id === upper.id)!.plinthHeight, 0, "a Zekolo setting on an upper module is ignored");
}

// ---------------------------------------------------------------------------
// 5 — The whole design: all on, all off.
// ---------------------------------------------------------------------------
{
  let grid = applyHeightModules(wardrobe, id, [2100, 600]);
  grid = addSideDisplay(grid, id, { side: "right", width: 300 });
  const allOff = setAllZekolo(grid, false);
  ok(allOff.cabinets.every((cabinet) => cabinet.plinthHeight === 0) && plinths(allOff).length === 0, "All OFF: no Zekolo anywhere");
  const allOn = setAllZekolo(allOff, true);
  ok(allOn.cabinets.filter((cabinet) => !cabinet.stackedOn).every((cabinet) => cabinet.plinthHeight === 100) && allOn.cabinets.filter((cabinet) => cabinet.stackedOn).every((cabinet) => cabinet.plinthHeight === 0), "All ON: every floor cabinet back on its 100 mm, the uppers still without");

  const kitchen = createKitchenDesign({ ...DEFAULT_KITCHEN_SETUP, shape: "l_shaped", wallHeight: 1000, topHeight: 0, details: structuredClone(REFERENCE_KITCHEN_DETAILS) });
  ok(plinths(kitchen).length > 0, "(the kitchen stands on Zekolo panels)");
  const kitchenOff = setAllZekolo(kitchen, false);
  equal(plinths(kitchenOff).length, 0, "kitchen All OFF: every Zekolo panel gone, the corner unit's too");
  ok(kitchenOff.cabinets.filter((cabinet) => cabinet.kind === "wall").every((cabinet, index) => cabinet.position.y === kitchen.cabinets.filter((entry) => entry.kind === "wall")[index]!.position.y), "wall units untouched");
  const base = kitchen.cabinets.find((cabinet) => cabinet.kind === "base")!;
  const kSet = setZekolo(kitchen, base.id, { setback: 60, boardId: "mdf-18-white" });
  const kFront = plinths(kSet, base.id).find((part) => /front/.test(part.id))!;
  const kBefore = plinths(kitchen, base.id).find((part) => /front/.test(part.id))!;
  // Placed in the room, along its wall: 20 mm further back than the standard 40.
  const moved = Math.hypot(kFront.placements[0]!.x - kBefore.placements[0]!.x, kFront.placements[0]!.z - kBefore.placements[0]!.z);
  equal([Math.round(moved), kFront.board.id], [20, "mdf-18-white"], "a kitchen unit's Zekolo set back 60 instead of 40, in white");
  const wall = kitchen.cabinets.find((cabinet) => cabinet.kind === "wall")!;
  equal(setZekolo(kitchen, wall.id, { on: true }), kitchen, "a wall unit has no Zekolo to turn on");
  const corner = resolveDesign(kitchen).layout.corners.find((entry) => !entry.baseY)!;
  const cornerOff = setCornerZekolo(kitchen, corner.id, false);
  ok(plinths(cornerOff).length < plinths(kitchen).length && !plinths(cornerOff).some((part) => part.cabinetId === corner.id), "a corner unit's Zekolo off on its own");

  const tv = startingDesign("tv_unit", { width: 1800 });
  const legs = (spec: DesignSpec) => buildParts(spec).hardware.find((line) => line.hardware.kind === "leg")?.quantity ?? 0;
  ok(legs(tv) > 0, "(a TV unit stands on Zekolo legs)");
  const tvOff = setAllZekolo(tv, false);
  equal([legs(tvOff), plinths(tvOff).length], [0, 0], "off: no legs to buy, none drawn");
  const l = wardrobeShapeDesign({ shape: "l_shaped", walls: [2400, 1800], depth: 600, height: 2400 });
  ok(plinths(setAllZekolo(l, false)).length === 0, "an L wardrobe all off");
}

// ---------------------------------------------------------------------------
// 6 — Saved projects keep what they had; the setting saves and reopens.
// ---------------------------------------------------------------------------
{
  const legacy = structuredClone(wardrobe);
  legacy.cabinets[0]!.plinthHeight = 0;
  equal(validateSpec(legacy).spec.cabinets[0]!.plinthHeight, 100, "a saved wardrobe without the setting keeps its continuous 100 mm plinth, as before");
  const saved = setZekolo(setZekolo(wardrobe, id, { height: 130, setback: 30, boardId: "mdf-18-oak" }), id, { on: false });
  const reopened = parseSpec(JSON.parse(JSON.stringify(saved)));
  ok(reopened.ok && JSON.stringify(reopened.spec.cabinets[0]!.zekolo) === JSON.stringify({ on: false, height: 130, setback: 30, boardId: "mdf-18-oak" }) && reopened.spec.cabinets[0]!.plinthHeight === 0, "off, with its remembered 130 mm, setback and board, saved and reopened");
  ok(!parseSpec({ ...JSON.parse(JSON.stringify(saved)), cabinets: [{ ...saved.cabinets[0], zekolo: { on: true, height: 5000 } }] }).ok, "an impossible height is refused");
  // A wardrobe whose sides cannot grow to the floor in this board is made
  // shorter, and says so — the panel warns before the switch is pressed.
  const full = resizeCabinet(wardrobe, id, { height: 2540 });
  const fullOff = setZekolo(full, id, { on: false });
  equal(fullOff.cabinets[0]!.size.height, 2440, "a 2540 wardrobe off in a 2440 sheet is made 2440 tall");
  ok(fullOff.meta.corrections.some((line) => /capped to 2440/.test(line)), "and the design says why");
}

// ---------------------------------------------------------------------------
// 7 — Wired by call syntax.
// ---------------------------------------------------------------------------
{
  const panel = code("src/features/berchuma-studio/components/editor/control-panel.tsx");
  ok(/<ZekoloDesignPanel spec=\{spec\} onChange=\{onChange\} \/>/.test(panel) && /<ZekoloPanel spec=\{spec\} cabinet=\{selected\} onChange=\{onChange\} \/>/.test(panel), "the design-wide and the per-cabinet Zekolo are in the panel");
  const zekolo = code("src/features/berchuma-studio/components/editor/zekolo-panel.tsx");
  const one = functionText(zekolo, "ZekoloPanel");
  ok(/onChange=\{\(next\) => onChange\(setZekolo\(spec, cabinet\.id, \{ on: next \}\)\)\}/.test(one), "ON / OFF");
  ok(/onChange=\{\(height\) => onChange\(setZekolo\(spec, cabinet\.id, \{ height \}\)\)\}/.test(one) && /onChange\(setZekolo\(spec, cabinet\.id, \{ setback: value \}\)\)/.test(one) && /onChange\(setZekolo\(spec, cabinet\.id, \{ boardId: next\.id \}\)\)/.test(one) && /onChange\(setZekolo\(spec, cabinet\.id, \{ boardId: event\.target\.value \}\)\)/.test(one), "height, setback, thickness and material");
  ok(/target\.plinthHeight = 0;\s*const fit = moduleFit\(draft, cabinet\.id, cabinet\.size\.height\);/.test(one), "the panel warns when the sides could not reach the floor");
  const all = functionText(zekolo, "ZekoloDesignPanel");
  ok(/onChange\(setAllZekolo\(spec, true\)\)/.test(all) && /onChange\(setAllZekolo\(spec, false\)\)/.test(all) && /onChange\(setCornerZekolo\(spec, corner\.id, next\)\)/.test(all), "All ON, All OFF, and each cabinet and corner under Customize");
  const geometry = code("src/features/berchuma-studio/services/geometry.ts");
  ok(/const plinthBoard = zekoloBoardOf\(spec, cabinet\);/.test(geometry) && /carcassThickness: board\.thickness,/.test(geometry) && /recess: cabinet\.zekolo\.setback/.test(geometry), "the parts are made from the cabinet's own Zekolo");
  ok(/fill=\{boardColour\(zekoloBoardOf\(spec, cabinet\), spec\)\}/.test(code("src/features/berchuma-studio/components/viewer/elevation.tsx")), "and the elevation draws it in its board");
  ok(/if \(cabinet\.zekolo\) cabinet\.zekolo = \{ \.\.\.cabinet\.zekolo, on: plinthHeight > 0/.test(code("src/features/berchuma-studio/components/config/config-rail.tsx")), "the rail's plinth box keeps the setting in step");
}

console.log(`Zekolo: ${checks} checks — on by default, off with no gap and the carcass on the floor, height/setback/thickness/material per cabinet, uppers and wall units never, all on/off, cut, priced, saved, old designs unchanged`);
