import assert from "node:assert/strict";
import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { createHouseProject, houseProjectSchema, ensurePhaseTwoProject } from "../src/features/house-designer/types/project";
import { ensureHouseBimState } from "../src/features/house-designer/services/model-state";
import { withoutStructure } from "../src/features/house-designer/services/structure";
import { ensurePhaseThreeProject } from "../src/features/house-designer/services/facade";
import { ensureHouseEnvelopeProject } from "../src/features/house-designer/services/envelope";
import { applyModelingOptions, modelingPreset, displayLength, modelLength } from "../src/features/house-designer/services/workspace-options";

const base = createHouseProject({ title: "Mobile", room: rectangularRoom(8000, 6500), style: "modern", strict: false, floorCount: 1, floorToFloorHeight: 3000 });
const reload = (value: typeof base) => {
  const saved = houseProjectSchema.parse(JSON.parse(JSON.stringify(value)));
  // The same steps, in the same order, as restoring a draft.
  return [ensurePhaseTwoProject, ensurePhaseThreeProject, ensureHouseEnvelopeProject, withoutStructure, ensureHouseBimState].reduce((project, ensure) => ensure(project), saved);
};
for (const mode of ["apartment", "room"] as const) {
  const project = reload({ ...applyModelingOptions(base, modelingPreset(mode)), displayUnits: "m" });
  assert.equal(project.foundations.length, 0, "No unwanted footings after reload");
  assert.equal(project.structuralColumns.length, 0);
  assert.equal(project.structuralBeams.length, 0);
  assert.equal(project.roofs.length, 0);
  assert.equal(project.site, null);
  assert.equal(project.facadeElements.length, 0);
  assert.ok(project.walls.length && project.slabs.length && project.ceilings.length);
  assert.equal(project.displayUnits, "m");
  assert.deepEqual(project.walls, base.walls, "Setup preserves actual dimensions");
}
// Structure is not generated automatically: a draft saved with generated
// columns, beams, grid and footings comes back without them, hand-placed
// columns kept.
assert.ok(base.structuralColumns.length && base.structuralBeams.length, "fixture: a legacy house with generated structure");
for (const saved of [base, applyModelingOptions(base, modelingPreset("house")), applyModelingOptions(base, { ...modelingPreset("house"), foundations: false })]) {
  const restored = reload(saved);
  assert.equal(restored.structuralColumns.length + restored.structuralBeams.length + restored.structuralGrid.length + restored.foundations.length, 0, "No generated structure after reload");
}
const handPlaced = { ...base, structuralColumns: [...base.structuralColumns, { ...base.structuralColumns[0]!, id: "column:by-hand" }] };
assert.deepEqual(reload(handPlaced).structuralColumns.map((column) => column.id), ["column:by-hand"], "a column placed by hand survives reload");
assert.equal(reload(handPlaced).foundations.length, 0, "and no footing is made up for it");
assert.equal(displayLength(8000, "m"), 8);
assert.equal(displayLength(8000, "cm"), 800);
assert.equal(modelLength(4.2, "m"), 4200);
for (const unit of ["mm", "cm", "m"] as const) {
  assert.ok(Math.abs(modelLength(displayLength(1220.25, unit), unit) - 1220.25) < 0.000001);
}
console.log("House mobile setup, reload, optional footings and decimal units passed");
