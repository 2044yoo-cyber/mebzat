/**
 * Height modules: a wardrobe's height in one carcass or two, decided by the
 * material.
 *
 *   npx tsx scripts/height_modules_check.ts
 *
 * The board decides what one carcass can be: a 2700 mm wardrobe on a 100 mm
 * plinth needs 2600 mm side panels, which a 1220 × 2440 sheet cannot give and
 * a 1220 × 2750 one can. Where it must be divided, the lower module is 2100 by
 * default — a preference that moves — and the upper takes the rest. Width and
 * height modules make one grid of real carcasses, each with its own sides,
 * top, bottom and back, cut, banded, joined, priced and listed by module.
 * Wardrobes saved before this keep exactly what they had.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildTemplate, sheetVariants, withMaterial } from "../src/features/berchuma-studio/services/cabinet-templates";
import { buildCutList } from "../src/features/berchuma-studio/services/cutlist";
import { calculateCost } from "../src/features/berchuma-studio/services/costing";
import { assemblySheet } from "../src/features/berchuma-studio/services/exports";
import { buildParts } from "../src/features/berchuma-studio/services/geometry";
import { MIN_HEIGHT_MODULE, PREFERRED_LOWER, misfitMessage, moduleFit, planHeights, tallestModule } from "../src/features/berchuma-studio/services/height-modules";
import {
  addSideDisplay,
  addTopCabinet,
  applyHeightModules,
  copyCabinet,
  divideHeight,
  duplicateCabinet,
  lockHeightPartition,
  moveHeightPartition,
  pasteCabinet,
  removeHeightPartition,
  resetHeightModules,
  setHeightAlign,
  setOverallHeight,
  setUpperModuleHeight,
} from "../src/features/berchuma-studio/services/operations";
import { partWorldBounds } from "../src/features/berchuma-studio/services/part-transform";
import { startingDesign } from "../src/features/berchuma-studio/services/starting-designs";
import { jointsOf } from "../src/features/berchuma-studio/services/transport-modules";
import { findBoard } from "../src/features/berchuma-studio/types/catalogue";
import { parseSpec, type Cabinet, type DesignSpec } from "../src/features/berchuma-studio/types/spec";

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

const wardrobe = (board = "mdf-18-white", width = 2400) => withMaterial(startingDesign("wardrobe", { width }), board);
const first = (spec: DesignSpec) => spec.cabinets.find((cabinet) => !cabinet.stackedOn)!;
const upperOf = (spec: DesignSpec, lower: Cabinet) => spec.cabinets.find((cabinet) => cabinet.stackedOn === lower.id);
const heights = (spec: DesignSpec) => { const lower = first(spec); const upper = upperOf(spec, lower); return upper ? [lower.size.height, upper.size.height] : [lower.size.height]; };

// ---------------------------------------------------------------------------
// 1 — The material decides: one carcass where its panels can be cut.
// ---------------------------------------------------------------------------
{
  const white = wardrobe();
  const id = first(white).id;
  equal(planHeights(white, id, 2300).modules, [2300], "2300 high, 2440 sheet: a single module");
  equal(planHeights(white, id, 2700).modules, [2100, 600], "2700 high, 2440 sheet: 2100 + 600 recommended");
  ok(!planHeights(white, id, 2700).singleFits, "and one carcass is not possible");
  const misfit = moduleFit(white, id, 2700).misfit!;
  equal(misfitMessage(misfit), "This module requires a 2600 mm side panel, but the selected board is 2440 mm.", "the reason, in the words of the panel that does not fit");
  equal(tallestModule(white, id), 2540, "the tallest lower module in 2440 board: 2440 of side panel on the 100 mm plinth");
  equal(tallestModule(white, id, true), 2440, "the tallest upper module: no plinth under it");

  for (const board of ["mdf-18-white-2750", "mdf-18-oak-2750", "mdf-18-white-2800"]) {
    const long = wardrobe(board);
    equal(planHeights(long, first(long).id, 2700).modules, [2700], `2700 high, ${findBoard(board)!.sheet.length} sheet: a single module — the board is not wasted`);
  }
  // Found from the parts, not from one height and one sheet: a taller plinth
  // leaves shorter side panels, so the same board makes a taller wardrobe.
  const plinthed = structuredClone(white);
  first(plinthed).plinthHeight = 150;
  equal(tallestModule(plinthed, first(plinthed).id), 2590, "on a 150 mm plinth the same sheet makes a 2590 mm carcass");
  ok(planHeights(plinthed, first(plinthed).id, 2580).singleFits && !planHeights(white, id, 2580).singleFits, "so 2580 is one carcass on the tall plinth and two on the standard one");

  // Partitioned by choice, and checked.
  equal(planHeights(white, id, 2700, "partitioned", 2200), { modules: [2200, 500], recommended: [2100, 600], singleFits: false, problems: [] }, "2200 + 500 chosen: fine");
  ok(planHeights(white, id, 2700, "partitioned", 2600).problems.some((line) => /Lower module: This module requires a 2500 mm side panel, but the selected board is 2440 mm\./.test(line)), "2600 + 100 refused with the panel that does not fit");
  ok(planHeights(white, id, 2700, "partitioned", 2500).problems.some((line) => /upper module would be 200 mm/.test(line)), "and an upper module shorter than 250 mm refused");
  ok(planHeights(white, id, 2700, "single").problems.some((line) => /2600 mm side panel/.test(line)), "a single module asked for where it cannot be made is refused, saying why");
  equal(planHeights(white, id, 2300, "partitioned", 2100).modules, [2100, 200], "partitioned at 2100 in a 2300 room is what was asked for…");
  ok(planHeights(white, id, 2300, "partitioned", 2100).problems.length === 1, "…and is flagged");
  equal(planHeights(white, id, 2350).recommended, [2350], "Auto never divides what can be one carcass");
  equal(planHeights(white, id, 2600).recommended, [2100, 500], "2600 in 2440 board: 2100 + 500");
  equal(PREFERRED_LOWER, 2100, "2100 is the default lower module");
  equal(MIN_HEIGHT_MODULE, 250, "and 250 the shortest module");
}

// ---------------------------------------------------------------------------
// 2 — Width and height modules: one grid of real carcasses.
// ---------------------------------------------------------------------------
{
  const spec = applyHeightModules(wardrobe(), first(wardrobe()).id, [2100, 600], { auto: true });
  const lower = first(spec);
  const upper = upperOf(spec, lower)!;
  equal([lower.size.height, upper.size.height, spec.envelope.height], [2100, 600, 2700], "2100 + 600 = 2700");
  equal([jointsOf(lower), jointsOf(upper)], [[1600], [1600]], "1600 + 800 below and above: four carcasses");
  equal(lower.heightModules, { auto: true, align: true }, "the lower records its height modules, on Auto");
  equal(upper.label, "Upper module", "the stacked carcass is an upper module, not a top cabinet");
  const parts = buildParts(spec).parts;
  const of = (cabinet: Cabinet, role: string) => parts.filter((part) => part.cabinetId === cabinet.id && part.role === role);
  equal(of(lower, "gable").length + of(upper, "gable").length, 8, "every module has its own two side panels — eight in all");
  ok(of(lower, "top").length === 2 && of(upper, "bottom").length === 2, "the lower modules' tops and the upper modules' bottoms are separate boards");
  const lowerTop = Math.max(...of(lower, "top").map((part) => partWorldBounds(part, part.placements[0]!).max.y));
  const upperBottom = Math.min(...of(upper, "bottom").map((part) => partWorldBounds(part, part.placements[0]!).min.y));
  ok(lowerTop <= upperBottom + 0.5 && upperBottom - lowerTop < 1, `the upper's bottom stands on the lower's top (${Math.round(lowerTop)} / ${Math.round(upperBottom)})`);
  ok(of(upper, "back").length >= 2 && of(lower, "back").length >= 2, "each has its own backs");
  const cut = buildCutList(spec, buildParts(spec));
  ok(cut.buildable, "every panel fits a 2440 sheet: that is what the division was for");
  for (const name of ["Lower module 1 — left side", "Lower module 2 — right side", "Upper module 1 — left side", "Upper module 2 — top", "Lower module 1 — top", "Upper module 1 — bottom"]) ok(cut.rows.some((row) => row.label === name), `the cut list has ${name}`);
  ok(cut.rows.some((row) => row.partId === "W01-M1-LS") && cut.rows.some((row) => row.partId === "W02-M2-RS"), "part IDs by cabinet and module: W01 below, W02 above");
  const joiners = buildParts(spec).hardware.find((line) => line.hardware.kind === "connector")!;
  ok(/2 joints, 2 lower-to-upper joints/.test(joiners.note ?? ""), `connectors for the width joints below and above, and both height joints (${joiners.note})`);
  const single = buildParts(wardrobe()).hardware.find((line) => line.hardware.kind === "connector")!;
  ok(joiners.quantity > single.quantity, "more connectors than the wardrobe in one height");
  ok(calculateCost(spec, buildParts(spec)).productionCost > calculateCost(wardrobe(), buildParts(wardrobe())).productionCost, "and the price includes the upper modules");
  const sheet = assemblySheet(spec)!;
  ok(sheet.rows.some((row) => row[1] === "Upper module 2" && row[3] === 800 && row[6] === 600) && sheet.rows.some((row) => row[1] === "Lower module 1" && row[6] === 2100), "the Assembly sheet lists each module with its width and height");
  ok(sheet.rows.some((row) => typeof row[0] === "string" && /Height modules: set each upper module on the lower/.test(row[0])), "and how the height modules go together");
  // A wardrobe narrower than one width module divided in height only.
  const narrow = applyHeightModules(wardrobe("mdf-18-white", 1200), first(wardrobe("mdf-18-white", 1200)).id, [2100, 600]);
  ok(buildCutList(narrow, buildParts(narrow)).rows.some((row) => row.label === "Upper module — left side"), "a height-only division names its parts Lower/Upper module");
}

// ---------------------------------------------------------------------------
// 3 — The boundary: moved, typed, locked, reset, removed.
// ---------------------------------------------------------------------------
{
  let spec = applyHeightModules(wardrobe(), first(wardrobe()).id, [2100, 600], { auto: true });
  const id = first(spec).id;
  spec = moveHeightPartition(spec, id, 2200);
  equal(heights(spec), [2200, 500], "lower 2100 → 2200: upper 600 → 500, total kept");
  equal(first(spec).heightModules?.auto, false, "a moved boundary is no longer Auto");
  equal(heights(setUpperModuleHeight(spec, id, 400)), [2300, 400], "upper typed 400: lower 2300");
  equal(heights(moveHeightPartition(spec, id, 2690)), [2450, 250], "never past the shortest upper module");
  equal(heights(setOverallHeight(spec, id, 2800)), [2200, 600], "a new overall height: the upper takes the change");
  const locked = lockHeightPartition(spec, id, true);
  equal(first(locked).heightModules?.locked, true, "locked");
  equal(moveHeightPartition(locked, id, 2000), locked, "a locked boundary does not move");
  equal(heights(setOverallHeight(locked, id, 2900)), [2200, 700], "and the lower keeps its height when the total changes");
  const reset = resetHeightModules(locked, id);
  equal([heights(reset), first(reset).heightModules?.auto, first(reset).heightModules?.locked], [[2100, 600], true, undefined], "Reset to Recommended: 2100 + 600, Auto, unlocked");
  equal(heights(setOverallHeight(reset, id, 2300)), [2300], "on Auto, a lower ceiling makes it one carcass again");
  equal(removeHeightPartition(spec, id), spec, "Remove Partition refused where one 2700 carcass cannot be cut");
  const one = wardrobe();
  equal(heights(setOverallHeight(one, first(one).id, 2800)), [2100, 700], "one carcass typed to 2800 in 2440 board: divided 2100 + 700, not cut short");
  equal(heights(setOverallHeight(one, first(one).id, 2400)), [2400], "typed to 2400: still one carcass");
  const long = withMaterial(spec, "mdf-18-white-2750");
  equal(heights(removeHeightPartition(long, id)), [2700], "and done where the long sheet can make it");
  equal(heights(divideHeight(removeHeightPartition(long, id), id)), [2100, 600], "Divide height: 2100 + the rest");
  equal(heights(divideHeight(removeHeightPartition(long, id), id, 2300)), [2300, 400], "or where asked");
}

// ---------------------------------------------------------------------------
// 4 — Side cabinets follow the same division, unless told not to.
// ---------------------------------------------------------------------------
{
  const template = buildTemplate("wardrobe-side-display", { width: 2400, height: 2700, depth: 600 }, { heights: [2100, 600] })!;
  const floor = template.cabinets.filter((cabinet) => !cabinet.stackedOn);
  ok(floor.length === 2 && floor.every((cabinet) => cabinet.size.height === 2100 && upperOf(template, cabinet)?.size.height === 600), "wardrobe and side shelves both 2100 + 600");
  ok(upperOf(template, floor.find((cabinet) => cabinet.kind === "open")!)!.bays[0]!.display, "the side's upper module is open shelving too");
  let spec = applyHeightModules(wardrobe(), first(wardrobe()).id, [2100, 600]);
  spec = addSideDisplay(spec, first(spec).id, { side: "right", width: 300 });
  const side = spec.cabinets.find((cabinet) => cabinet.kind === "open" && !cabinet.stackedOn)!;
  equal([side.size.height, upperOf(spec, side)?.size.height], [2100, 600], "a side display added later: 300 × 2100 below, 300 × 600 above");
  const moved = moveHeightPartition(spec, first(spec).id, 2000);
  equal([moved.cabinets.find((cabinet) => cabinet.id === side.id)!.size.height, upperOf(moved, side)!.size.height], [2000, 700], "moving the wardrobe's boundary moves the side's");
  const apart = moveHeightPartition(setHeightAlign(spec, first(spec).id, false), first(spec).id, 2000);
  equal(apart.cabinets.find((cabinet) => cabinet.id === side.id)!.size.height, 2100, "with the alignment off, the side keeps its own");
}

// ---------------------------------------------------------------------------
// 5 — Saved and reopened exactly; old wardrobes unchanged.
// ---------------------------------------------------------------------------
{
  let spec = buildTemplate("wardrobe-4-door", { width: 2400, height: 2700, depth: 600 }, { heights: [2200, 500], joints: [1200], boardId: "mdf-18-oak" })!;
  spec = lockHeightPartition(spec, first(spec).id, true);
  const reopened = parseSpec(JSON.parse(JSON.stringify(spec)));
  ok(reopened.ok, "a divided wardrobe parses");
  if (reopened.ok) {
    equal(reopened.spec.cabinets.map((cabinet) => [cabinet.size.height, cabinet.stackedOn ? "upper" : "lower", cabinet.heightModules ?? null, jointsOf(cabinet)]), spec.cabinets.map((cabinet) => [cabinet.size.height, cabinet.stackedOn ? "upper" : "lower", cabinet.heightModules ?? null, jointsOf(cabinet)]), "heights, the lock, Auto/manual and the width joints all come back");
    equal(reopened.spec.carcass.board.sheet, { length: 2440, width: 1220 }, "with the board's sheet");
    equal(buildCutList(reopened.spec, buildParts(reopened.spec)).rows, buildCutList(spec, buildParts(spec)).rows, "and the same cut list");
  }
  const old = addTopCabinet(startingDesign("wardrobe", { width: 2400 }), startingDesign("wardrobe", { width: 2400 }).cabinets[0]!.id, 600);
  equal(first(old).heightModules, undefined, "a top cabinet from before height modules is left as it was");
  ok(!/lower-to-upper/.test(buildParts(old).hardware.find((line) => line.hardware.kind === "connector")?.note ?? ""), "and is not given connectors it never had");
  const parsedOld = parseSpec(JSON.parse(JSON.stringify(startingDesign("wardrobe", { width: 2400 }))));
  ok(parsedOld.ok && parsedOld.spec.cabinets.every((cabinet) => cabinet.heightModules === undefined), "a wardrobe saved without height modules reads without them");
}

// ---------------------------------------------------------------------------
// 6 — Duplicate, copy and paste take the whole module stack.
// ---------------------------------------------------------------------------
{
  const spec = applyHeightModules(wardrobe("mdf-18-white", 1200), first(wardrobe("mdf-18-white", 1200)).id, [2100, 600]);
  const twice = duplicateCabinet(spec, first(spec).id);
  equal(twice.cabinets.filter((cabinet) => cabinet.stackedOn).length, 2, "Duplicate: the copy comes with its upper module");
  ok(twice.cabinets.every((cabinet) => !cabinet.stackedOn || twice.cabinets.some((other) => other.id === cabinet.stackedOn)), "each standing on its own lower");
  const clip = copyCabinet(spec, upperOf(spec, first(spec))!.id)!;
  equal([clip.cabinet.id, clip.upper?.size.height], [first(spec).id, 600], "Copy on the upper module copies the whole stack");
  const pasted = pasteCabinet(spec, clip, first(spec).id);
  equal([pasted.cabinets.length, pasted.envelope.width, pasted.envelope.height], [4, 2400, 2700], "Paste: a second 1200 × 2700 stack beside the first");
  equal(new Set(pasted.cabinets.map((cabinet) => cabinet.id)).size, 4, "with ids of its own");
}

// ---------------------------------------------------------------------------
// 7 — Templates, long sheets and the cut list.
// ---------------------------------------------------------------------------
{
  const single = buildTemplate("wardrobe-4-door", { width: 2400, height: 2700, depth: 600 }, { heights: [2700], boardId: "mdf-18-white-2750", heightAuto: true })!;
  equal([heights(single), single.meta.corrections, first(single).heightModules?.auto], [[2700], [], true], "2700 in one carcass from a 2750 sheet: nothing for the validator to correct");
  const cut = buildCutList(single, buildParts(single));
  ok(cut.buildable && cut.byBoard.some((board) => board.boardId === "mdf-18-white-2750" && board.nesting.sheet.length === 2750), "cut and nested on 2750 sheets");
  ok(cut.rows.some((row) => row.length === 2600 && /side/.test(row.label)), "with its 2600 mm side panels");
  const variants = sheetVariants("mdf-18-white").map((board) => board.sheet.length);
  equal(variants, [2440, 2750, 2800], "white MDF in three sheet lengths");
  equal(sheetVariants("ply-18-birch").length, 1, "a board with no long sheet has one");
  const long = findBoard("mdf-18-white-2750")!;
  ok(long.priceKey !== findBoard("mdf-18-white")!.priceKey && long.fallbackRate > findBoard("mdf-18-white")!.fallbackRate, "a long sheet is priced as a long sheet, not as a standard one");
  const divided = buildTemplate("wardrobe-sliding", { width: 3000, height: 2700, depth: 600 }, { heights: [2100, 600] })!;
  ok(buildCutList(divided, buildParts(divided)).buildable && heights(divided).join() === "2100,600", "a sliding wardrobe divided in height too");
  const l = buildTemplate("wardrobe-l", { width: 2400, height: 2700, depth: 600 }, { layout: "l_shaped", heights: [2100, 600] })!;
  ok(l.cabinets.every((cabinet) => !cabinet.stackedOn && cabinet.size.height === 2540) && l.meta.assumptions.some((line) => /made in one height module/.test(line)), "an L wardrobe stays one height module and says so");
}

// ---------------------------------------------------------------------------
// 8 — The controls are wired, by call syntax.
// ---------------------------------------------------------------------------
{
  const wizard = code("src/features/berchuma-studio/components/cabinet-start.tsx");
  ok(/<MaterialPicker boardId=\{boardId\} onChange=\{setBoardId\} \/>/.test(wizard) && /<ModulePartition space=\{space\} construction=\{construction\} plan=\{plan\}/.test(wizard), "the wardrobe's first page asks for the material and the module partition");
  ok(/heights: plan\.plan\.modules, heightAuto: construction\.heightMode === "auto", joints: construction\.joints \?\? undefined/.test(wizard), "and builds what was decided");
  ok(/disabled=\{!template \|\| blocked\.length > 0\}/.test(wizard), "Create waits while the modules cannot be made");
  ok(/<ConstructionDecision space=\{space\} construction=\{construction\} plan=\{plan\}/.test(functionText(wizard, "CabinetStart").slice(wizard.indexOf('step === "review"') - wizard.indexOf("function CabinetStart"))), "the review shows the decision before generating");
  const construction = code("src/features/berchuma-studio/components/wardrobe-construction.tsx");
  ok(/const plan = planHeights\(probe, id, space\.height, heightMode, lowerHeight\);/.test(construction), "the decision is the planner's, for the chosen board and mode");
  ok(/onClick=\{\(\) => onChange\(\{ \.\.\.construction, boardId: longer\.id, heightMode: "auto" \}\)\}/.test(functionText(construction, "ConstructionDecision")), "Change Material offers the long sheet that makes it one module");
  const panel = code("src/features/berchuma-studio/components/editor/control-panel.tsx");
  ok(/spec\.furnitureType === "wardrobe" \? \(\s*<HeightModulesPanel/.test(panel) && /spec\.furnitureType === "kitchen" && \["wall", "tall"\]\.includes\(selected\.kind\) \? <TopCabinet/.test(panel), "a wardrobe gets height modules; a kitchen unit keeps its extra top row");
  const heightPanel = code("src/features/berchuma-studio/components/editor/height-modules-panel.tsx");
  ok(/onChange=\{\(value\) => onChange\(moveHeightPartition\(spec, lower\.id, value\)\)\}/.test(heightPanel) && /onChange=\{\(value\) => onChange\(setUpperModuleHeight\(spec, lower\.id, value\)\)\}/.test(heightPanel), "lower and upper typed");
  ok(/disabled=\{!plan\.singleFits\}/.test(heightPanel) && /onChange\(removeHeightPartition\(spec, lower\.id\)\)/.test(heightPanel), "Remove Partition only where one carcass can be made");
  ok(/onChange\(lockHeightPartition\(spec, lower\.id, !locked\)\)/.test(heightPanel) && /onChange\(resetHeightModules\(spec, lower\.id\)\)/.test(heightPanel), "Lock and Reset to Recommended");
  const elevation = code("src/features/berchuma-studio/components/viewer/elevation.tsx");
  ok(/<HeightPartitions\s+spec=\{spec\}/.test(elevation) && /onMove\(state\.lowerId, lower\)/.test(functionText(elevation, "HeightPartitions")), "the elevation draws the boundary and drags it");
  const editor = code("src/features/berchuma-studio/components/editor/design-editor.tsx");
  ok(/onPartitionMove=\{\(lowerId, height\) => onChange\(moveHeightPartition\(spec, lowerId, height\)\)\}/.test(editor), "a drag moves the partition");
  ok(/<QuickAction label="Copy" onClick=\{\(\) => setClip\(copyCabinet\(spec, selected\.id\)\)\}/.test(editor) && /onChange\(pasteCabinet\(spec, clip, selected\.id\)\)/.test(editor), "Copy and Paste quick actions");
}

console.log(`Height modules: ${checks} checks — the board decides one carcass or two, 2100 + rest by default and movable, a grid with the width modules, real carcasses cut, joined and priced, side cabinets aligned, saved and reopened, old wardrobes unchanged`);
