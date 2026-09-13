import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ALIGN_TOLERANCE_DEGREES,
  EMPTY_HOLD,
  HOLD_GRACE_MS,
  STEADY_MS,
  decide,
  heldFor,
  startCapture,
  updateHold,
} from "../src/lib/panorama/capture";

const state = startCapture();
assert.equal(state.plan.length, 22);
assert.ok(STEADY_MS >= 400);
assert.ok(ALIGN_TOLERANCE_DEGREES <= 8);
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
assert.match(
  source,
  /retryMode === "upload"[\s\S]{0,300}onClick=\{\(\) => void upload\(\)\}/,
);
assert.match(source, /const \{ error: finalizeError \} = await supabase/);
const route = readFileSync(
  new URL("../src/app/api/panorama/stitch/route.ts", import.meta.url),
  "utf8",
);
assert.match(
  route,
  /job\.status === "ready"[\s\S]{0,220}panoramaUrl: job\.panorama_url/,
);
console.log(
  "PASS: 22-point capture, deliberate shutter, safe saving retry, completed-job recovery and capture state.",
);
