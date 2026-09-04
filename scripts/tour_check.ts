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

import { readFileSync } from "node:fs";

import * as THREE from "three";

import {
  clampFov,
  clampPitch,
  dragSpeed,
  lookTarget,
  MAX_FOV,
  MIN_FOV,
  normaliseDegrees,
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
import type { ValidatableHotspot, ValidatableScene } from "../src/lib/tour/validate.ts";
import { toSceneInputs, type DraftTourScene } from "../src/lib/tour/draft.ts";
import {
  fromOurStorage,
  ownsQuarantinePath,
  MAX_HOTSPOTS_PER_SCENE,
  MAX_SCENES,
  validateTour,
} from "../src/lib/tour/validate.ts";

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
// 6b. The same direction, expressed once
//
// JavaScript's % keeps the sign of its left operand, so -370 % 360 is -10.
// A hotspot stored at -10° and one stored at 350° are on the same wall, and a
// tour built by dragging anticlockwise must not hold different numbers from
// one built by dragging the other way.
// ---------------------------------------------------------------------------

for (const [given, expected] of [
  [0, 0],
  [90, 90],
  [359, 359],
  [360, 0],
  [370, 10],
  [720, 0],
  [-10, 350],
  [-370, 350],
  [-360, 0],
  [-720, 0],
  [1085, 5],
  [-1085, 355],
] as const) {
  check(
    `${given}° normalises to ${expected}°`,
    normaliseDegrees(given) === expected,
    String(normaliseDegrees(given)),
  );
}

// Whatever comes in, what comes out is a bearing.
for (const value of [0, 1, -1, 180, -180, 359.9, -359.9, 12345, -12345]) {
  const out = normaliseDegrees(value);
  check(`${value}° lands inside one turn`, out >= 0 && out < 360, String(out));
}

// Turning right round is a no-op, at any starting angle.
for (const value of [0, 37, 180, 359, -45]) {
  check(
    `${value}° and ${value + 360}° are the same direction`,
    normaliseDegrees(value) === normaliseDegrees(value + 360),
  );
}

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
// 9. A tour that is safe to write
//
// A validation gap does not throw. It writes a tour that looks fine until a
// visitor clicks a door that opens nothing.
// ---------------------------------------------------------------------------

/** Hotspots are optional on a scene, but every tour built here has some, and
 * the assertions below reach into them. */
type CheckScene = ValidatableScene & { hotspots: ValidatableHotspot[] };

/** The shape of a tour that should save without complaint. */
function goodTour(): { title: string; scenes: CheckScene[] } {
  return {
    title: "Two bedroom in Bole",
    scenes: [
      {
        key: "a",
        title: "Living room",
        panoramaUrl: "https://abc123.supabase.co/storage/v1/object/public/panoramas/u/1.jpg",
        hotspots: [
          { kind: "scene", yaw: 90, pitch: 0, title: "To the kitchen", targetSceneKey: "b" },
          { kind: "info", yaw: -30, pitch: 10, title: "South facing" },
        ],
      },
      {
        key: "b",
        title: "Kitchen",
        panoramaUrl: "https://abc123.supabase.co/storage/v1/object/public/panoramas/u/2.jpg",
        hotspots: [{ kind: "scene", yaw: -90, pitch: 0, title: "Back", targetSceneKey: "a" }],
      },
    ],
  };
}

check("a complete tour is accepted", validateTour(goodTour()) === null, validateTour(goodTour()) ?? "");

// The name.
check("a tour with no name is refused", validateTour({ ...goodTour(), title: "" }) !== null);
check("a tour named with spaces is refused", validateTour({ ...goodTour(), title: "   " }) !== null);
check("a two-letter name is refused", validateTour({ ...goodTour(), title: "2b" }) !== null);
check("a three-letter name is accepted", validateTour({ ...goodTour(), title: "G+4" }) === null);
check(
  "an absurdly long name is refused",
  validateTour({ ...goodTour(), title: "x".repeat(201) }) !== null,
);

// The scenes.
check("a tour with no scenes is refused", validateTour({ ...goodTour(), scenes: [] }) !== null);
check(
  "a tour past the scene limit is refused",
  validateTour({
    ...goodTour(),
    scenes: Array.from({ length: MAX_SCENES + 1 }, (_, i) => ({
      key: `k${i}`,
      title: `Scene ${i}`,
      panoramaUrl: "https://abc123.supabase.co/storage/v1/object/public/panoramas/u/1.jpg",
    })),
  }) !== null,
);
check(
  "a tour at the scene limit is accepted",
  validateTour({
    ...goodTour(),
    scenes: Array.from({ length: MAX_SCENES }, (_, i) => ({
      key: `k${i}`,
      title: `Scene ${i}`,
      panoramaUrl: "https://abc123.supabase.co/storage/v1/object/public/panoramas/u/1.jpg",
    })),
  }) === null,
);

// Duplicate keys would make one scene's hotspots land on another, because the
// key is what pairs a scene with the uuid it was given.
// No scene hotspots here: with a door in play the duplicate would be refused
// for pointing at a key that no longer resolves, and the duplicate check
// itself would never be reached.
const duplicated = goodTour();
duplicated.scenes[1].key = "a";
duplicated.scenes[0].hotspots = [{ kind: "info", yaw: 0, pitch: 0, title: "Note" }];
duplicated.scenes[1].hotspots = [];
check("two scenes sharing a key are refused", validateTour(duplicated) !== null);
check(
  "and it is refused for the duplicate, not for a broken door",
  validateTour(duplicated)?.includes("same id") === true,
  validateTour(duplicated) ?? "",
);

const unnamed = goodTour();
unnamed.scenes[1].title = "  ";
check("a scene with no name is refused", validateTour(unnamed) !== null);

const photoless = goodTour();
photoless.scenes[1].panoramaUrl = "";
check("a scene with no photo is refused", validateTour(photoless) !== null);

// The dead end: the failure this whole function exists to prevent.
const dangling = goodTour();
dangling.scenes[0].hotspots[0].targetSceneKey = "does-not-exist";
check("a door pointing at a scene not in the tour is refused", validateTour(dangling) !== null);

check(
  "and it is refused for pointing at a missing scene",
  validateTour(dangling)?.includes("not in this tour") === true,
  validateTour(dangling) ?? "",
);

const targetless = goodTour();
dangling.scenes[0].hotspots[0].targetSceneKey = "b";
targetless.scenes[0].hotspots[0].targetSceneKey = null;
check("a door pointing nowhere is refused", validateTour(targetless) !== null);
// A different sentence from the one above, because they are different
// mistakes: one door was never given a destination, the other lost it.
check(
  "and it says the door has no scene to open",
  validateTour(targetless)?.includes("no scene to open") === true,
  validateTour(targetless) ?? "",
);

// An info hotspot has nothing to point at, and must not be held to the rule.
const info = goodTour();
info.scenes[0].hotspots = [{ kind: "info", yaw: 0, pitch: 0, title: "Balcony" }];
check("an info hotspot needs no target", validateTour(info) === null);

const unlabelled = goodTour();
unlabelled.scenes[0].hotspots[1].title = "";
check("a hotspot with no label is refused", validateTour(unlabelled) !== null);

const nowhere = goodTour();
nowhere.scenes[0].hotspots[1].yaw = Number.NaN;
check("a hotspot with no position is refused", validateTour(nowhere) !== null);

const crowded = goodTour();
crowded.scenes[0].hotspots = Array.from({ length: MAX_HOTSPOTS_PER_SCENE + 1 }, () => ({
  kind: "info",
  yaw: 0,
  pitch: 0,
  title: "Note",
}));
check("a scene past the hotspot limit is refused", validateTour(crowded) !== null);

// ---------------------------------------------------------------------------
// 10. Where a panorama is allowed to come from
//
// The browser sends a URL, not a file — a server action cannot receive a Blob.
// So an unchecked URL would let a tour embed an image from anywhere, bypassing
// the moderation the upload path exists to enforce, and point Medosha's viewer
// at a stranger's server.
// ---------------------------------------------------------------------------

const OURS = "https://abc123.supabase.co";
const ok = (url: string) => fromOurStorage(url, OURS);

check(
  "a published panorama is accepted",
  ok("https://abc123.supabase.co/storage/v1/object/public/panoramas/user/a.jpg"),
);

// Another host entirely.
check("a foreign host is refused", !ok("https://evil.example/panoramas/a.jpg"));
check(
  "a foreign host imitating the path is refused",
  !ok("https://evil.example/storage/v1/object/public/panoramas/a.jpg"),
);
check(
  "a subdomain of ours is refused",
  !ok("https://abc123.supabase.co.evil.example/storage/v1/object/public/panoramas/a.jpg"),
);
check(
  "the same host over http is refused",
  !ok("http://abc123.supabase.co/storage/v1/object/public/panoramas/a.jpg"),
);

// Our host, wrong bucket. Quarantine is the one that matters: those files are
// the ones that have *not* been checked yet.
check(
  "a file still in quarantine is refused",
  !ok("https://abc123.supabase.co/storage/v1/object/public/moderation-quarantine/u/a.jpg"),
);
check(
  "another public bucket is refused",
  !ok("https://abc123.supabase.co/storage/v1/object/public/avatars/u/a.jpg"),
);
check(
  "a bucket whose name merely starts the same is refused",
  !ok("https://abc123.supabase.co/storage/v1/object/public/panoramas-staging/u/a.jpg"),
);
// An uploader picks the object name inside their own quarantine folder, so
// they can name a file after the panoramas path. Matching the path anywhere
// in the URL rather than at its start would publish an unchecked image.
check(
  "a quarantine file named after the panoramas path is refused",
  !ok(
    "https://abc123.supabase.co/storage/v1/object/public/moderation-quarantine/" +
      "user/storage/v1/object/public/panoramas/x.jpg",
  ),
);

check(
  "the private object route is refused",
  !ok("https://abc123.supabase.co/storage/v1/object/panoramas/u/a.jpg"),
);

// Nonsense.
check("an empty url is refused", !ok(""));
check("a relative path is refused", !ok("/storage/v1/object/public/panoramas/a.jpg"));
check("a javascript url is refused", !ok("javascript:alert(1)"));
check(
  "a data url is refused",
  !ok("data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA=="),
);
check(
  "no configured supabase url refuses everything",
  !fromOurStorage(
    "https://abc123.supabase.co/storage/v1/object/public/panoramas/u/a.jpg",
    undefined,
  ),
);

// ---------------------------------------------------------------------------
// 11. A scene that is still being reviewed
//
// It stays in the tour — the person carries on building — but its image is in
// quarantine, which is private, and the path comes from the browser. Adopting
// a path outside the caller's own folder would let somebody attach a
// stranger's unreviewed file to their tour and have it published when it
// cleared.
// ---------------------------------------------------------------------------

const ME = "11111111-2222-3333-4444-555555555555";
const THEM = "99999999-8888-7777-6666-555555555555";

check("my own folder is mine", ownsQuarantinePath(`${ME}/a.jpg`, ME));
check("a nested path in my folder is mine", ownsQuarantinePath(`${ME}/deep/a.jpg`, ME));
check("somebody else's folder is not", !ownsQuarantinePath(`${THEM}/a.jpg`, ME));
check("a bare filename is not", !ownsQuarantinePath("a.jpg", ME));
check("an empty path is not", !ownsQuarantinePath("", ME));
check("a leading slash is not", !ownsQuarantinePath(`/${ME}/a.jpg`, ME));
check("a path climbing out is not", !ownsQuarantinePath(`${ME}/../${THEM}/a.jpg`, ME));
check("my id appearing later does not count", !ownsQuarantinePath(`${THEM}/${ME}/a.jpg`, ME));
check("no user id matches nothing", !ownsQuarantinePath(`${ME}/a.jpg`, ""));
// Both empty is the one pair that compares equal without the guard, and it is
// reachable: a signed-out caller and a scene whose path never got written.
check("an empty path and no user id is not a match", !ownsQuarantinePath("", ""));

// A pending scene is validated on its path, a cleared one on its URL.
const pendingTour = goodTour();
pendingTour.scenes[1] = {
  key: "b",
  title: "Kitchen",
  panoramaUrl: "https://abc123.supabase.co/storage/v1/object/sign/moderation-quarantine/x",
  pending: true,
  quarantinePath: `${ME}/k.jpg`,
  hotspots: [],
};
check("a tour with a scene in review is accepted", validateTour(pendingTour) === null,
  validateTour(pendingTour) ?? "");

const pendingNoPath = goodTour();
pendingNoPath.scenes[1] = {
  key: "b",
  title: "Kitchen",
  panoramaUrl: "https://abc123.supabase.co/storage/v1/object/sign/moderation-quarantine/x",
  pending: true,
  hotspots: [],
};
check("a scene in review with no path is refused", validateTour(pendingNoPath) !== null);

// A signed quarantine link must never pass as a published panorama.
check(
  "a signed quarantine link is not a published panorama",
  !ok("https://abc123.supabase.co/storage/v1/object/sign/moderation-quarantine/u/a.jpg"),
);

// ---------------------------------------------------------------------------
// 11b. Everything the builder holds reaches the server
//
// This conversion is a hand-written field list that has to stay in step with
// two other types, and it has already fallen behind once: `pending`,
// `quarantinePath` and `moderationItemId` were added to the types and not to
// the copy, so a room waiting on review arrived looking like an attempt to
// smuggle in a foreign image and the save was refused. The check counts the
// fields rather than naming a few, so the next one that is added and forgotten
// fails here.
// ---------------------------------------------------------------------------

const draftScene: DraftTourScene = {
  key: "a",
  title: "Living room",
  panoramaUrl: "https://abc123.supabase.co/storage/v1/object/sign/x",
  width: 4096,
  height: 2048,
  pending: true,
  quarantinePath: `${ME}/a.jpg`,
  moderationItemId: "cafe0000-0000-0000-0000-000000000001",
  initialYaw: 90,
  initialPitch: -10,
  initialZoom: 60,
  hotspots: [
    {
      key: "local-only",
      kind: "scene",
      yaw: 45,
      pitch: 5,
      title: "To the kitchen",
      description: null,
      targetSceneKey: "b",
    },
  ],
};

const [converted] = toSceneInputs([draftScene]);

// Every field the builder holds, except the ones deliberately left behind.
const carried = Object.keys(draftScene).filter((field) => field !== "hotspots");
for (const field of carried) {
  check(
    `the builder's "${field}" reaches the server`,
    converted[field as keyof typeof converted] ===
      draftScene[field as keyof DraftTourScene],
    `${String(converted[field as keyof typeof converted])} vs ${String(
      draftScene[field as keyof DraftTourScene],
    )}`,
  );
}

check("the scene's hotspots come across", converted.hotspots?.length === 1);
check(
  "a hotspot's local key does not",
  converted.hotspots !== undefined && !("key" in converted.hotspots[0]),
  JSON.stringify(converted.hotspots?.[0]),
);
check(
  "a hotspot's target survives",
  converted.hotspots?.[0].targetSceneKey === "b",
);
check(
  "a hotspot's angles survive",
  converted.hotspots?.[0].yaw === 45 && converted.hotspots?.[0].pitch === 5,
);

// A cleared scene carries no pending state at all.
const clearedDraft: DraftTourScene = {
  key: "c",
  title: "Kitchen",
  panoramaUrl: "https://abc123.supabase.co/storage/v1/object/public/panoramas/u/1.jpg",
  width: 4096,
  height: 2048,
  initialYaw: 0,
  initialPitch: 0,
  initialZoom: 75,
  hotspots: [],
};
const [clearedOut] = toSceneInputs([clearedDraft]);
check("a cleared scene is not marked pending", !clearedOut.pending);
check("and carries no quarantine path", !clearedOut.quarantinePath);

check("the whole list is converted", toSceneInputs([draftScene, clearedDraft]).length === 2);

// ---------------------------------------------------------------------------
// 12. next/image must not be pointed at quarantine
//
// The obvious fix for "Invalid src prop" on a signed preview is to add the
// /object/sign/ path to remotePatterns. It is the wrong fix: Next's optimiser
// caches by URL and serves the result from /_next/image with no auth, so the
// optimised copy of an unreviewed panorama would outlive the signature that
// was protecting it and be fetchable by anyone. A pending room uses a plain
// <img> instead. This is here so that reasoning survives the next person who
// meets that error message.
// ---------------------------------------------------------------------------

const nextConfig = readFileSync("next.config.ts", "utf8");

check(
  "next/image allows the public storage path",
  nextConfig.includes("/storage/v1/object/public/**"),
);
check(
  "next/image is not allowed to fetch signed storage URLs",
  !nextConfig.includes("/object/sign"),
);
check(
  "next/image is not allowed to fetch quarantine",
  !nextConfig.includes("moderation-quarantine"),
);

// Comments are stripped first: the explanation above mentions <img>, and a
// check that matched its own prose would pass whatever the code did.
const thumbnail = readFileSync("src/components/tour/scene-thumbnail.tsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

check(
  "a pending room is rendered with a plain img",
  /<img\s/.test(thumbnail),
);
check(
  "a cleared room still goes through next/image",
  /<Image\s/.test(thumbnail),
);
check(
  "and the two are chosen by the pending flag",
  /if\s*\(\s*pending\s*\)/.test(thumbnail),
);

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
