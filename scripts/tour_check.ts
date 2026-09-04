/**
 * The geometry behind Medosha 360°.
 *
 *   npx tsx scripts/tour_check.ts
 *
 * A tour fails quietly. A hotspot placed a hundred pixels from the doorway it
 * labels still looks like a working tour to whoever built it, and only the
 * buyer clicking the wrong wall finds out. So the projection is asserted here
 * against positions worked out by hand, not judged by eye in a browser.
 *
 * Two of these assertions exist because the failure is invisible rather than
 * loud: a marker for what is *behind* you gets drawn mirrored on the wall in
 * front of you, and a pitch of exactly straight up flips the whole horizon.
 */

import * as THREE from "three";

import {
  clampFov,
  clampPitch,
  dragSpeed,
  lookTarget,
  MAX_FOV,
  MIN_FOV,
  PITCH_LIMIT,
  projectHotspot,
} from "../src/lib/tour/panorama-math.ts";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const W = 800;
const H = 600;

/** A camera turned to a given yaw and pitch in degrees, as the viewer aims it. */
function cameraLooking(yawDegrees: number, pitchDegrees: number, fov = 75) {
  const camera = new THREE.PerspectiveCamera(fov, W / H, 0.1, 1000);
  camera.lookAt(lookTarget((yawDegrees * Math.PI) / 180, (pitchDegrees * Math.PI) / 180));
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

// ---------------------------------------------------------------------------
// 1. A hotspot dead ahead is in the middle of the screen
//
// If this is wrong, every marker in every tour is wrong together, which is the
// one failure obvious enough to catch by eye — so it is the cheapest to pin
// down and the one everything below depends on.
// ---------------------------------------------------------------------------

for (const yaw of [0, 45, 90, 180, 270, 359]) {
  const at = projectHotspot(cameraLooking(yaw, 0), yaw, 0, W, H);
  check(
    `a hotspot at yaw ${yaw}° is centred when the camera faces it`,
    at.visible && Math.abs(at.x - W / 2) < 0.5 && Math.abs(at.y - H / 2) < 0.5,
    `${at.x.toFixed(1)}, ${at.y.toFixed(1)}`,
  );
}

for (const pitch of [-60, -30, 0, 30, 60]) {
  const at = projectHotspot(cameraLooking(0, pitch), 0, pitch, W, H);
  check(
    `a hotspot at pitch ${pitch}° is centred when the camera faces it`,
    at.visible && Math.abs(at.x - W / 2) < 0.5 && Math.abs(at.y - H / 2) < 0.5,
    `${at.x.toFixed(1)}, ${at.y.toFixed(1)}`,
  );
}

// ---------------------------------------------------------------------------
// 2. Which way is which
//
// A sign flip here is the mistake that survives review: the markers move, they
// move smoothly, and they move the wrong way. Yaw increases anticlockwise in
// the spherical convention, so a hotspot at a *higher* yaw than the camera sits
// to the left; a positive pitch is up, which is a *smaller* y in screen space.
// ---------------------------------------------------------------------------

const rightOfCentre = projectHotspot(cameraLooking(0, 0), -20, 0, W, H);
check(
  "a hotspot 20° clockwise of the view is on the right",
  rightOfCentre.visible && rightOfCentre.x > W / 2,
  `x = ${rightOfCentre.x.toFixed(1)}`,
);

const leftOfCentre = projectHotspot(cameraLooking(0, 0), 20, 0, W, H);
check(
  "a hotspot 20° anticlockwise of the view is on the left",
  leftOfCentre.visible && leftOfCentre.x < W / 2,
  `x = ${leftOfCentre.x.toFixed(1)}`,
);

const above = projectHotspot(cameraLooking(0, 0), 0, 20, W, H);
check(
  "a hotspot 20° above the horizon is above the middle",
  above.visible && above.y < H / 2,
  `y = ${above.y.toFixed(1)}`,
);

const below = projectHotspot(cameraLooking(0, 0), 0, -20, W, H);
check(
  "a hotspot 20° below the horizon is below the middle",
  below.visible && below.y > H / 2,
  `y = ${below.y.toFixed(1)}`,
);

// ---------------------------------------------------------------------------
// 3. What is behind you stays behind you
//
// Past the camera the perspective divide flips sign, so a marker for the door
// behind the viewer would be drawn on the wall in front of them — in the wrong
// place, mirrored, and looking entirely legitimate.
// ---------------------------------------------------------------------------

for (const yaw of [120, 150, 180, 210, 240]) {
  const at = projectHotspot(cameraLooking(0, 0), yaw, 0, W, H);
  check(`a hotspot ${yaw}° round is hidden`, !at.visible);
}

for (const yaw of [-40, -20, 0, 20, 40]) {
  const at = projectHotspot(cameraLooking(0, 0), yaw, 0, W, H);
  check(`a hotspot ${yaw}° from the view is shown`, at.visible);
}

// A narrow fov sees less of the room, but "visible" is about the hemisphere in
// front of the camera, not the frame — a marker just outside the edge should
// still be positioned, so that panning towards it does not make it pop in.
const narrow = projectHotspot(cameraLooking(0, 0, MIN_FOV), 40, 0, W, H);
check("zoomed in, a hotspot outside the frame is still placed", narrow.visible);
check(
  "zoomed in, that hotspot is off the left of the frame",
  narrow.x < 0,
  `x = ${narrow.x.toFixed(1)}`,
);

// ---------------------------------------------------------------------------
// 4. The poles
//
// `lookAt` has no roll to fall back on when the target is parallel to the up
// vector, so a pitch of exactly ±90° rolls the whole panorama on its side.
// The clamp is what stops a drag reaching it.
// ---------------------------------------------------------------------------

check("the pitch limit stops short of straight up", PITCH_LIMIT < Math.PI / 2);
check("a drag far past the top is clamped", clampPitch(10) === PITCH_LIMIT);
check("a drag far past the bottom is clamped", clampPitch(-10) === -PITCH_LIMIT);
check("a pitch inside the limit is left alone", clampPitch(0.5) === 0.5);

// Straight up is the failure the clamp exists to prevent. `lookAt` cannot
// build a basis when the target is parallel to the up vector, and the
// degenerate matrix that comes out throws every hotspot behind the camera —
// so the whole tour loses its markers, silently, at one particular angle.
const rolled = cameraLooking(0, 90);
const rolledA = projectHotspot(rolled, 45, 0, W, H);
const rolledB = projectHotspot(rolled, -45, 0, W, H);
check(
  "straight up loses the hotspots (this is why pitch is clamped)",
  !rolledA.visible && !rolledB.visible,
  `${rolledA.y.toFixed(1)} vs ${rolledB.y.toFixed(1)}`,
);

// Clamped, the horizon stays level: two hotspots the same distance either side
// of the view sit at the same height, and mirrored about the middle.
const atLimit = cameraLooking(0, (PITCH_LIMIT * 180) / Math.PI);
const limitA = projectHotspot(atLimit, 30, 0, W, H);
const limitB = projectHotspot(atLimit, -30, 0, W, H);
check(
  "at the clamped limit the hotspots are still there",
  limitA.visible && limitB.visible,
);
check(
  "at the clamped limit the horizon is still level",
  Math.abs(limitA.y - limitB.y) < 0.5,
  `${limitA.y.toFixed(1)} vs ${limitB.y.toFixed(1)}`,
);
check(
  "at the clamped limit the two are mirrored about the middle",
  Math.abs(limitA.x - W / 2 + (limitB.x - W / 2)) < 0.5,
  `${limitA.x.toFixed(1)} vs ${limitB.x.toFixed(1)}`,
);

// ---------------------------------------------------------------------------
// 5. Zoom
// ---------------------------------------------------------------------------

check("zooming in stops at the minimum", clampFov(1) === MIN_FOV);
check("zooming out stops at the maximum", clampFov(1000) === MAX_FOV);
check("a fov inside the range is left alone", clampFov(60) === 60);
check("the range is the right way round", MIN_FOV < MAX_FOV);

// Zoomed in, the same hotspot must sit further from the centre — that is what
// zoom *is*. A clamp applied to the wrong variable would leave it still.
const wide = projectHotspot(cameraLooking(0, 0, MAX_FOV), 20, 0, W, H);
const tight = projectHotspot(cameraLooking(0, 0, MIN_FOV), 20, 0, W, H);
check(
  "zooming in pushes a hotspot further from the centre",
  Math.abs(tight.x - W / 2) > Math.abs(wide.x - W / 2),
  `${Math.abs(tight.x - W / 2).toFixed(1)} vs ${Math.abs(wide.x - W / 2).toFixed(1)}`,
);

// Drag speed tracks fov, so a drag covers the same amount of image at any
// zoom. Equal at the reference fov, smaller when zoomed in.
check("drag speed is the reference at fov 75", dragSpeed(75) === 0.0025);
check("zoomed in, a drag turns the view less", dragSpeed(MIN_FOV) < dragSpeed(75));
check("zoomed out, a drag turns the view more", dragSpeed(MAX_FOV) > dragSpeed(75));

// ---------------------------------------------------------------------------
// 6. The camera target is a direction, not a position
//
// `lookAt` takes a point in world space and the camera sits at the origin, so
// the target has to be a unit vector in the direction being faced. A target
// that drifts off the unit sphere still works until something else reads it.
// ---------------------------------------------------------------------------

for (const [yaw, pitch] of [
  [0, 0],
  [Math.PI / 2, 0],
  [Math.PI, PITCH_LIMIT],
  [-Math.PI / 3, -PITCH_LIMIT],
] as const) {
  const target = lookTarget(yaw, pitch);
  check(
    `the target for yaw ${yaw.toFixed(2)}, pitch ${pitch.toFixed(2)} is a unit vector`,
    Math.abs(target.length() - 1) < 1e-9,
    `length ${target.length()}`,
  );
}

check("looking at the horizon does not tilt the target", Math.abs(lookTarget(0, 0).y) < 1e-9);
check("looking up puts the target above the horizon", lookTarget(0, 1).y > 0);
check("looking down puts the target below the horizon", lookTarget(0, -1).y < 0);

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
}

console.log(
  `\n${failures.length === 0 ? GREEN : RED}${passed} passed, ${failures.length} failed${RESET}` +
    `\n${DIM}360°: the marker is on the door, or it is not shown at all${RESET}\n`,
);

process.exit(failures.length === 0 ? 0 : 1);
