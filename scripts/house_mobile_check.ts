import assert from "node:assert/strict";
import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { createHouseProject, houseProjectSchema, ensurePhaseTwoProject } from "../src/features/house-designer/types/project";
import { ensureHouseBimState } from "../src/features/house-designer/services/model-state";
import { ensurePhaseFourProject } from "../src/features/house-designer/services/structure";
import { ensurePhaseThreeProject } from "../src/features/house-designer/services/facade";
import { ensureHouseEnvelopeProject } from "../src/features/house-designer/services/envelope";
import { applyModelingOptions, modelingPreset, displayLength, modelLength } from "../src/features/house-designer/services/workspace-options";

const base = createHouseProject({ title: "Mobile", room: rectangularRoom(8000, 6500), style: "modern", strict: false, floorCount: 1, floorToFloorHeight: 3000 });
const reload = (value: typeof base) => {
  const saved = houseProjectSchema.parse(JSON.parse(JSON.stringify(value)));
  return [ensurePhaseTwoProject, ensurePhaseThreeProject, ensurePhaseFourProject, ensureHouseEnvelopeProject, ensureHouseBimState].reduce((project, ensure) => ensure(project), saved);
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
const custom = reload(applyModelingOptions(base, { ...modelingPreset("house"), foundations: false }));
assert.ok(custom.structuralColumns.length);
assert.equal(custom.foundations.length, 0, "Structure without footing must persist");
assert.ok(reload(base).foundations.length, "Legacy full-house behavior remains");
assert.equal(displayLength(8000, "m"), 8);
assert.equal(displayLength(8000, "cm"), 800);
assert.equal(modelLength(4.2, "m"), 4200);
for (const unit of ["mm", "cm", "m"] as const) {
  assert.ok(Math.abs(modelLength(displayLength(1220.25, unit), unit) - 1220.25) < 0.000001);
}
console.log("House mobile setup, reload, optional footings and decimal units passed");
