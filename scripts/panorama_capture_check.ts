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
import {
  calibrationForSize,
  cameraCalibration,
  horizontalFovFromFx,
} from "../src/lib/panorama/camera";
import {
  cameraRotationMatrix,
  forwardOf,
  isRotationMatrix,
} from "../src/lib/panorama/orientation";

const state = startCapture();
assert.equal(state.plan.length, 22);
assert.equal(startCapture(60).plan.length, 26);
assert.ok(STEADY_MS >= 900 && STEADY_MS <= 1200);
assert.ok(ALIGN_TOLERANCE_DEGREES >= 5 && ALIGN_TOLERANCE_DEGREES <= 6);
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

const track = {
  label: "rear wide camera",
  getSettings: () => ({
    width: 1920,
    height: 1080,
    focalLengthX: 1371.1,
    focalLengthY: 1360,
    principalPointX: 954,
    principalPointY: 537,
  }),
} as unknown as MediaStreamTrack;
const calibration = cameraCalibration(track);
assert.equal(calibration.source, "intrinsics");
assert.ok(Math.abs(calibration.hfov - horizontalFovFromFx(1920, 1371.1)) < 0.01);
assert.equal(calibration.intrinsics.cx, 954);
assert.equal(calibrationForSize(calibration, 960, 540).intrinsics.fx, 685.55);

const portrait = cameraRotationMatrix(12, 90, -4, 0);
const landscape = cameraRotationMatrix(12, 90, -4, 90);
assert.equal(isRotationMatrix(portrait), true);
assert.equal(isRotationMatrix(landscape), true);
assert.deepEqual(
  forwardOf(portrait).map((value) => Math.round(value * 1e6)),
  forwardOf(landscape).map((value) => Math.round(value * 1e6)),
);
assert.equal(isRotationMatrix([-1, 0, 0, 0, 1, 0, 0, 0, 1]), false);
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
assert.match(source, /retryMode === "retake"[\s\S]{0,300}start\(true\)/);
assert.match(source, /rotation: frame\.rotation\.map\(round4\)/);
assert.match(source, /screenOrientation: frame\.screenOrientation/);
assert.match(source, /intrinsics: \{/);
const route = readFileSync(
  new URL("../src/app/api/panorama/stitch/route.ts", import.meta.url),
  "utf8",
);
const compose = readFileSync(
  new URL("../src/lib/panorama/compose.ts", import.meta.url),
  "utf8",
);
assert.match(
  route,
  /job\.status === "ready"[\s\S]{0,220}panoramaUrl: job\.panorama_url/,
);
assert.match(compose, /MAX_GYRO_CORRECTION = 3\.5/);
assert.match(compose, /areAngularNeighbours\(frame, other\)/);
assert.match(compose, /FRAME_REJECT_BELOW = 0\.2/);
assert.match(route, /PANORAMA_DEBUG === "1"/);
assert.match(route, /gyro-only\.jpg/);
assert.match(route, /no-blending-footprints\.jpg/);
console.log(
  "PASS: 22-point capture, deliberate shutter, safe saving retry, completed-job recovery and capture state.",
);
