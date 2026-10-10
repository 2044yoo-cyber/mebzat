import assert from "node:assert/strict";

import { buildProjectCutList } from "../src/features/berchuma-studio/services/cabinet-project.ts";
import { buildCutList } from "../src/features/berchuma-studio/services/cutlist.ts";
import { buildParts } from "../src/features/berchuma-studio/services/geometry.ts";
import { validateManufacturingDesign } from "../src/features/berchuma-studio/services/manufacturing-validation.ts";
import { startingDesign } from "../src/features/berchuma-studio/services/starting-designs.ts";
import type { PartsBreakdown } from "../src/features/berchuma-studio/types/parts.ts";

let passed = 0;
function check(name: string, condition: boolean) {
  assert.ok(condition, name);
  passed += 1;
}

const spec = startingDesign("wardrobe");
const parts = buildParts(spec);
const cut = buildCutList(spec, parts);
const validation = validateManufacturingDesign(spec, parts, cut);

check("a standard wardrobe has no blocking manufacturing validation errors",
  !validation.some((entry) => entry.severity === "error"));
check("successful validation emits a readable pass record",
  validation.some((entry) => entry.code === "manufacturing-check-passed"));
check("cut list reports physical board nesting",
  cut.byBoard.length > 0 && cut.byBoard.every((board) => board.nesting.sheets.length === board.sheets));
check("every nested sheet exposes a conservative rectangular offcut inventory",
  cut.byBoard.every((board) => board.nesting.sheets.every((sheet) => Array.isArray(sheet.offcuts))));

// Deliberately corrupt only the test copy: the production geometry stays untouched.
const first = parts.parts[0];
assert.ok(first, "the starter design has generated parts");
const broken = {
  ...parts,
  parts: parts.parts.map((part, index) => index === 0
    ? { ...part, placements: [] }
    : part),
} as PartsBreakdown;
const brokenIssues = validateManufacturingDesign(spec, broken, cut);
check("the checker catches model placement counts that disagree with quantities",
  brokenIssues.some((entry) => entry.code === "placement-count-mismatch" && entry.severity === "error"));

const duplicate = {
  ...parts,
  parts: [...parts.parts, { ...first, id: first.id }],
} as PartsBreakdown;
check("the checker catches duplicate part IDs",
  validateManufacturingDesign(spec, duplicate, cut)
    .some((entry) => entry.code === "duplicate-part-id" && entry.severity === "error"));

const pack = buildProjectCutList(spec);
const workbookText = new TextDecoder().decode(pack.workbook);
check("the combined workbook includes the validation report tab",
  workbookText.includes("Validation report"));
check("the combined workbook includes offcut dimensions and reuse flags",
  workbookText.includes("Offcut inventory") && workbookText.includes("Reusable candidate"));
check("the combined workbook includes workshop assembly steps",
  workbookText.includes("Assembly steps"));
check("the pack keeps a machine-readable validation result",
  pack.validation.some((entry) => entry.code === "manufacturing-check-passed"));

console.log(`${passed} manufacturing checks passed.`);
