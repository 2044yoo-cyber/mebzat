import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EMPTY_HOLD,
  HOLD_GRACE_MS,
  STEADY_MS,
  decide,
  heldFor,
  startCapture,
  updateHold,
} from "../src/lib/panorama/capture";

const state = startCapture();
const pole = state.plan.find((target) => Math.abs(target.pitch) === 90)!;
assert.equal(
  decide(state, {
    facing: pole.direction,
    roll: 91,
    unsteady: 0,
    heldMs: STEADY_MS,
  }).action,
  "capture",
);
let hold = updateHold(EMPTY_HOLD, state.plan[0].id, true, 1000);
hold = updateHold(hold, state.plan[0].id, false, 1000 + HOLD_GRACE_MS - 1);
hold = updateHold(hold, state.plan[0].id, true, 1000 + HOLD_GRACE_MS);
assert.equal(heldFor(hold, 1000 + STEADY_MS), STEADY_MS);
hold = updateHold(hold, state.plan[1].id, true, 1300);
assert.equal(heldFor(hold, 1300), 0);
const source = readFileSync(
  new URL("../src/components/tour/panorama-capture.tsx", import.meta.url),
  "utf8",
).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
assert.match(source, /captureManually\(stateRef\.current, decision\.nearest\)/);
assert.ok((source.match(/recentRef\.current = \[\];/g) ?? []).length >= 3);
assert.match(
  source,
  /holdStateRef\.current = updateHold\(holdStateRef\.current, candidateId, valid, now\)/,
);
console.log(
  "PASS: quick capture, pole aiming, gyro grace, target reset, manual target and cleared motion history.",
);
