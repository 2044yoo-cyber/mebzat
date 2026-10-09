/**
 * Multi-cabinet project + large-step movement regression.
 * Run with: npx tsx scripts/cabinet_project_check.ts
 */
import assert from "node:assert/strict";
import { startingDesign } from "../src/features/berchuma-studio/services/starting-designs";
import { parseSpec } from "../src/features/berchuma-studio/types/spec";
import { buildParts } from "../src/features/berchuma-studio/services/geometry";
import { buildCutList } from "../src/features/berchuma-studio/services/cutlist";
import {
  addProjectDesign, buildProjectCutList, projectDesigns,
  removeProjectDesign, updateProjectDesign,
} from "../src/features/berchuma-studio/services/cabinet-project";
import { nudgeTo, nudgeBlocked } from "../src/features/berchuma-studio/services/nudge";

const first = startingDesign("wardrobe");
const two = addProjectDesign(first, "vanity-2", "vanity");
const three = addProjectDesign(two, "wardrobe-3", "wardrobe");
assert.deepEqual(projectDesigns(three).map(x => x.spec.kind), ["wardrobe", "vanity", "wardrobe"]);
assert.equal(first.projectItems, undefined, "the original design remains untouched");
assert.equal(three.projectItems?.length, 2, "additional cabinet designs persist in primary spec");
const parsed = parseSpec(JSON.parse(JSON.stringify(three)));
assert.ok(parsed.ok, "existing saved design parser accepts mixed-cabinet project");
const reopened = projectDesigns(parsed.spec);
assert.equal(reopened.length, 3, "all three cabinets reopen after JSON save and parse");
assert.equal(reopened[0]!.spec.carcass.board.id, first.carcass.board.id,
  "the original wardrobe's board remains unchanged");
const modified = structuredClone(reopened[1]!.spec);
modified.title = "Guest bathroom vanity";
const edited = updateProjectDesign(parsed.spec, "vanity-2", modified);
assert.equal(projectDesigns(edited)[1]!.spec.title, "Guest bathroom vanity",
  "editing the vanity is saved in its own entry");
assert.equal(projectDesigns(edited)[0]!.spec.title, first.title,
  "editing a vanity does not replace the primary wardrobe");
const removed = removeProjectDesign(edited, "wardrobe-3");
assert.equal(projectDesigns(removed).length, 2);
assert.equal(projectDesigns(three).length, 3, "removal leaves previous state immutable");
assert.throws(() => addProjectDesign(three, "vanity-2", "vanity"), /already exists/);
const invalid = structuredClone(three);
invalid.projectItems![0]!.spec = { ...first, projectItems: [{ id: "cycle", spec: first }] };
assert.equal(parseSpec(invalid).ok, false, "nested project bundles are not allowed");

const workbook = buildProjectCutList(parsed.spec);
const expected = reopened.reduce((total, item) => total +
  buildCutList(item.spec, buildParts(item.spec)).totals.pieces, 0);
assert.equal(workbook.pieces, expected, "every cabinet contributes all its cut pieces");
assert.equal(workbook.designs, 3);
assert.ok(workbook.sheets.every(board => board.sheets <= board.separateSheets),
  "combined cutting layout must never use more sheets than separate layouts");
assert.ok(workbook.sheets.every(board => board.pieces > 0 && board.sheets >= 1),
  "all nonempty board groups have physical parts and a valid cutting plan");
assert.equal(workbook.rows.reduce((total, row) => total + row.quantity, 0), expected);
assert.ok(workbook.rows.some(row => row.design.includes("Vanity")) ||
  workbook.rows.some(row => row.design === reopened[1]!.spec.title),
  "vanity parts are present in the same cut list as wardrobes");
const totalBoards = workbook.sheets.reduce((n, board) => n + board.sheets, 0);
const separateBoards = workbook.sheets.reduce((n, board) => n + board.separateSheets, 0);
assert.ok(totalBoards <= separateBoards, "joint job optimizes without overestimating cutting sheets");
assert.deepEqual([...workbook.workbook.slice(0, 2)], [0x50, 0x4b],
  "combined workbook is a ZIP-based XLSX file");

const cabinet = first.cabinets[0]!;
assert.equal(nudgeTo(cabinet, "x", 1, 500).x, cabinet.position.x + 500,
  "a phone step can move 500 mm rather than only 10 mm");
assert.equal(nudgeBlocked(cabinet, "z", 1, 500), "Depth is set by the run this cabinet stands on",
  "run-bound cabinet depth remains protected");
console.log("Cabinet project: independent designs, save/restore, combined XLSX, cut quantities and fast moves passed");
