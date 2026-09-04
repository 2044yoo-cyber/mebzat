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
import {
  checkPanorama,
  EQUIRECTANGULAR_RATIO,
  MAX_PANORAMA_WIDTH,
  MIN_PANORAMA_WIDTH,
  PANORAMA_TYPES,
  RATIO_TOLERANCE,
  sceneName,
} from "../src/lib/tour/panorama-image.ts";

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
// 7. What is allowed to become a panorama
//
// An ordinary photograph on a sphere does not error. It renders, smeared, and
// looks like a bug in the viewer rather than the wrong file. The one thing
// this check must never do is let a non-equirectangular image through.
// ---------------------------------------------------------------------------

// Real 360° cameras, and the sizes they write.
for (const [w, h, label] of [
  [5376, 2688, "Ricoh Theta"],
  [4096, 2048, "a stitched panorama"],
  [2048, 1024, "a small panorama"],
  [1024, 512, "the smallest accepted"],
  [11968, 5984, "Insta360 X3"],
  [8192, 4096, "an 8K panorama"],
] as const) {
  check(`${label} (${w}×${h}) is accepted`, checkPanorama(w, h).ok);
}

// Ordinary photographs, screenshots and phone portraits. Every one of these
// would render as a smear.
for (const [w, h, label] of [
  [4032, 3024, "a 4:3 phone photo"],
  [1920, 1080, "a 16:9 screenshot"],
  [1080, 1920, "a portrait photo"],
  [1000, 1000, "a square crop"],
  [3000, 1000, "a 3:1 letterbox"],
  [2000, 1400, "a wide-ish photo"],
] as const) {
  check(`${label} (${w}×${h}) is refused`, !checkPanorama(w, h).ok);
}

check("a zero-sized image is refused", !checkPanorama(0, 0).ok);
check("a negative size is refused", !checkPanorama(-4096, -2048).ok);
check("a non-finite size is refused", !checkPanorama(Number.NaN, 2048).ok);

// The tolerance exists for stitchers that round; it must not be wide enough
// to swallow a real photograph. 2:1 ± 0.04 spans roughly 1.96 to 2.04.
check("the tolerance is small enough to exclude 16:9", RATIO_TOLERANCE < 16 / 9 - 1);
check("the tolerance admits a few pixels of rounding", checkPanorama(4097, 2048).ok);
check("the ratio is two to one", EQUIRECTANGULAR_RATIO === 2);

// Too small to look at.
const tiny = checkPanorama(MIN_PANORAMA_WIDTH - 2, (MIN_PANORAMA_WIDTH - 2) / 2);
check("a panorama under the minimum width is refused", !tiny.ok);
check(
  "and it is refused for its size, not its shape",
  !tiny.ok && tiny.reason.includes("too small"),
  tiny.ok ? "" : tiny.reason,
);

// Too large to display: shrunk rather than refused, because the file is
// perfectly valid and the phone is the constraint.
const huge = checkPanorama(11968, 5984);
check("an oversized panorama is accepted", huge.ok);
check(
  "an oversized panorama is resized to the texture limit",
  huge.ok && huge.resizeTo?.width === MAX_PANORAMA_WIDTH,
  huge.ok ? JSON.stringify(huge.resizeTo) : "",
);
check(
  "and the resize target is exactly two to one",
  huge.ok && huge.resizeTo !== null && huge.resizeTo.width === huge.resizeTo.height * 2,
);
// An oversized panorama that is a few pixels off 2:1 comes out *exactly*
// equirectangular, rather than carrying its rounding error into the stored
// file. Scaling by the source ratio would keep the error, and the check that
// used a perfectly 2:1 source could not tell the two apart.
const skewed = checkPanorama(8200, 4090);
check("an off-square oversized panorama is accepted", skewed.ok);
check(
  "and it is corrected to exactly 2:1, not scaled by its own ratio",
  skewed.ok && skewed.resizeTo?.width === MAX_PANORAMA_WIDTH &&
    skewed.resizeTo?.height === MAX_PANORAMA_WIDTH / 2,
  skewed.ok ? JSON.stringify(skewed.resizeTo) : "",
);

check(
  "a panorama at the limit is not resized",
  checkPanorama(MAX_PANORAMA_WIDTH, MAX_PANORAMA_WIDTH / 2).ok &&
    (checkPanorama(MAX_PANORAMA_WIDTH, MAX_PANORAMA_WIDTH / 2) as { resizeTo: unknown })
      .resizeTo === null,
);

// The accepted types have to be ones the panoramas bucket will take. PNG is
// deliberately absent: 4096 wide and lossless is past the size limit.
check("jpeg is accepted", (PANORAMA_TYPES as readonly string[]).includes("image/jpeg"));
check("webp is accepted", (PANORAMA_TYPES as readonly string[]).includes("image/webp"));
check("png is not", !(PANORAMA_TYPES as readonly string[]).includes("image/png"));

// The refusal has to say what to do, not just that it failed. A message that
// only says "invalid image" sends somebody to support.
const refusal = checkPanorama(4032, 3024);
check(
  "the refusal explains the shape a 360° photo has to be",
  !refusal.ok && refusal.reason.includes("twice as wide"),
  refusal.ok ? "" : refusal.reason,
);
check(
  "the refusal quotes the size that was uploaded",
  !refusal.ok && refusal.reason.includes("4032") && refusal.reason.includes("3024"),
);

// ---------------------------------------------------------------------------
// 8. What a scene is called before anybody renames it
//
// A serial number as a scene title is worse than a placeholder, because it
// looks deliberate. Nobody edits "R0010234", and it ships to the buyer.
// ---------------------------------------------------------------------------

for (const [file, expected] of [
  ["living room.jpg", "Living room"],
  ["master_bedroom.jpg", "Master bedroom"],
  ["kitchen-and-dining.webp", "Kitchen and dining"],
  ["Balcony.JPG", "Balcony"],
  ["  rooftop  .jpg", "Rooftop"],
  ["second floor landing.jpeg", "Second floor landing"],
] as const) {
  check(`"${file}" becomes "${expected}"`, sceneName(file, 0) === expected, sceneName(file, 0));
}

// Camera output, in the shapes the common 360° cameras write.
for (const file of [
  "R0010234.JPG",
  "IMG_2201.jpg",
  "DSC00042.jpg",
  "GS__0198.jpg",
  "20260904.jpg",
  "0001.webp",
  ".jpg",
  "___.jpg",
]) {
  check(`"${file}" falls back to a numbered scene`, sceneName(file, 2) === "Scene 3", sceneName(file, 2));
}

check("the fallback is one-based", sceneName("IMG_0001.jpg", 0) === "Scene 1");

// A real room name that happens to contain digits is not a serial number.
check('"bedroom 2.jpg" keeps its name', sceneName("bedroom 2.jpg", 0) === "Bedroom 2");
check('"unit 401.jpg" keeps its name', sceneName("unit 401.jpg", 0) === "Unit 401");
// Short block-and-unit labels — "B2", "A 12" — are how buildings here are
// signed. A serial number is a long run of digits; two is a door.
check('"B2.jpg" keeps its name', sceneName("B2.jpg", 0) === "B2", sceneName("B2.jpg", 0));
check('"A 12.jpg" keeps its name', sceneName("A 12.jpg", 0) === "A 12", sceneName("A 12.jpg", 0));

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
