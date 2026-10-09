import assert from "node:assert/strict";

import { sketchSaveError } from "../src/features/house-designer/services/sketch-save-errors.ts";

type SaveError = Parameters<typeof sketchSaveError>[0];
type Formatter = (error: SaveError) => string;

function check(formatter: Formatter) {
  assert.match(formatter({ code: "42703", message: "record has no field revision" }), /database needs an update/i);
  assert.match(formatter({ code: "42501", message: "permission denied" }), /permission to save/i);
  assert.match(formatter({ code: "23503", message: "foreign key violation" }), /no longer available/i);
  assert.equal(formatter({ code: "XX999", message: "connection refused" }), "Sketch save failed (XX999): connection refused");
  assert.equal(formatter({ code: "XX999", message: "x".repeat(300) }).length, "Sketch save failed (XX999): ".length + 220);
}

check(sketchSaveError);

// Mutation check: removing the database-trigger guidance must make this check fail.
const mutant: Formatter = (error) => error.code === "42703" ? "Save failed" : sketchSaveError(error);
assert.throws(() => check(mutant), /database needs an update/i);

console.log("Sketch save error checks passed (including mutation check).");
