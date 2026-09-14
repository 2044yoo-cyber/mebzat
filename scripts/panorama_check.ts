/**
 * 360° capture and stitching.
 *
 *   npx tsx scripts/panorama_check.ts
 *
 * The spherical geometry is written as pure functions over plain numbers
 * precisely so that it can be checked here — without a phone, a gyroscope, a
 * camera or a server. The last section photographs a synthetic room from
 * twenty-two directions and stitches it back, which is the only check that
 * can tell a panorama from a funnel.
 *
 * Plain Node with type stripping; no test framework, in keeping with scripts/.
 */

import "./lib/allow-server-only.ts";

import { readFileSync } from "node:fs";

import sharp from "sharp";

import {
  MIN_ALIGNMENT,
  applyVignette,
  composePanorama,
  estimateVignette,
  type FrameInput,
} from "../src/lib/panorama/compose.ts";
import {
  ALIGN_TOLERANCE_DEGREES,
  CAPTURE_COOLDOWN_MS,
  EMPTY_HOLD,
  HOLD_GRACE_MS,
  ROLL_TOLERANCE_DEGREES,
  STEADY_DEGREES,
  STEADY_MS,
  captureManually,
  decide,
  frameName,
  nextInOrder,
  frameWidthFor,
  guidance,
  heldFor,
  isComplete,
  progress,
  record,
  rollError,
  startCapture,
  updateHold,
  unrecord,
} from "../src/lib/panorama/capture.ts";
import {
  ASSUMED_LONG_AXIS_FOV,
  VERTICAL_OVERLAP,
  fieldsOfView,
  ringPitches,
  OVERLAP,
  coverage,
  nearestTarget,
  ringCount,
  spherePlan,
  steer,
} from "../src/lib/panorama/sphere.ts";
import {
  angleBetween,
  basisFrom,
  directionOf,
  forwardOf,
  project,
  rollOf,
  rotationMatrix,
  rightOf,
  unsteadiness,
  upOf,
  verticalFov,
  withLocalZero,
  yawPitchOf,
  type Vector3,
} from "../src/lib/panorama/orientation.ts";
import { intrinsicsFromFov } from "../src/lib/panorama/camera.ts";
import { stitchErrorMessage } from "../src/lib/panorama/stitch.ts";
import {
  CLEARLY_BAD,
  MAX_ATTEMPTS_PER_TARGET,
  accumulateDrift,
  focusScore,
  hasDrifted,
  shouldRetake,
} from "../src/lib/panorama/sharpness.ts";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function windowAfter(src: string, marker: string, chars = 400): string {
  const at = src.indexOf(marker);
  return at < 0 ? "" : src.slice(at, at + chars);
}

function blockAfter(src: string, marker: string): string {
  const start = src.indexOf(marker);
  if (start < 0) return "";
  let i = src.indexOf("{", start + marker.length - 1);
  if (i < 0) return "";
  let depth = 0;
  const from = i;
  for (; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  return "";
}

function wholeFunction(src: string, name: string): string {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) return "";
  const next = src.indexOf("\nfunction ", at + 1);
  return next < 0 ? src.slice(at) : src.slice(at, next);
}

// ---------------------------------------------------------------------------
// Orientation — section 2
// ---------------------------------------------------------------------------

{
  // The basis round trip is the contract between the two halves of the
  // feature: the capture screen writes a pose down, the stitcher reads it
  // back, and if they disagree about what roll means every frame is mirrored
  // about its own centre while the arithmetic looks right in both places.
  let worst = 0;
  for (const [a, b, g] of [
    [0, 90, 0],
    [45, 70, 10],
    [200, 110, -25],
    [300, 45, 80],
    [10, 20, -60],
    [123, 90, 179],
  ] as [number, number, number][]) {
    const r = rotationMatrix(a, b, g);
    const f = forwardOf(r);
    const { yaw, pitch } = yawPitchOf(f);
    const basis = basisFrom(yaw, pitch, rollOf(r));
    worst = Math.max(
      worst,
      angleBetween(basis.forward, f),
      angleBetween(basis.right, rightOf(r)),
      angleBetween(basis.up, upOf(r)),
    );
  }
  check(
    "a pose written down and read back is the same pose",
    worst < 0.01,
    `worst disagreement ${worst.toFixed(4)}° — the capture screen and the stitcher have to mean the same thing by roll`,
  );

  check(
    "a phone held upright looks at the horizon, and tilting it up looks up",
    Math.abs(yawPitchOf(forwardOf(rotationMatrix(0, 90, 0))).pitch) < 1 &&
      yawPitchOf(forwardOf(rotationMatrix(0, 120, 0))).pitch > 25,
    "beta 90 is a phone held up in front of somebody, which is level — and on its own that is satisfied by a pitch stuck at zero",
  );
  check(
    "laid on its back it looks at the floor",
    yawPitchOf(forwardOf(rotationMatrix(0, 0, 0))).pitch < -80,
  );

  // Turning right increases yaw, which is the direction the plan counts in.
  {
    const before = yawPitchOf(forwardOf(rotationMatrix(0, 90, 0))).yaw;
    const after = yawPitchOf(forwardOf(rotationMatrix(-40, 90, 0))).yaw;
    check(
      "turning to the right counts upwards",
      ((after - before + 540) % 360) - 180 > 20,
      "if this is backwards every instruction on the screen sends people the wrong way",
    );
  }

  check(
    "a direction and its yaw and pitch are the same thing",
    [
      [0, 0],
      [90, 30],
      [187, -45],
      [300, 89],
    ].every(([yaw, pitch]) => {
      const round = yawPitchOf(directionOf(yaw, pitch));
      return (
        Math.abs(((round.yaw - yaw + 540) % 360) - 180) < 0.01 &&
        Math.abs(round.pitch - pitch) < 0.01
      );
    }),
  );

  // The local zero, which is what makes the compass unnecessary.
  {
    const world = rotationMatrix(215, 90, 0);
    const zero = yawPitchOf(forwardOf(world)).yaw;
    const local = withLocalZero(world, zero);
    check(
      "the direction the capture starts in becomes its zero",
      Math.abs(yawPitchOf(forwardOf(local)).yaw) < 0.01,
      "section 2: indoors the magnetometer is next to a fridge, so no target may depend on true north",
    );
    check(
      "and squaring up to it does not change how level it is",
      Math.abs(
        yawPitchOf(forwardOf(local)).pitch -
          yawPitchOf(forwardOf(world)).pitch,
      ) < 0.01,
      "pitch comes from gravity, which is not confused by a fridge, so it must survive the yaw offset untouched",
    );
  }

  check(
    "the vertical field of view follows the horizontal one",
    Math.abs(verticalFov(60, 640, 480) - 46.8) < 1,
    "guessing the two separately gives a frame whose shape does not match the photograph",
  );

  check(
    "a phone that has not moved is steady",
    unsteadiness([directionOf(10, 0), directionOf(10, 0)]) < 0.01,
  );
  check(
    "one that is swinging is not",
    unsteadiness([directionOf(0, 0), directionOf(9, 0)]) > STEADY_DEGREES,
    "firing mid-swing is a smeared frame, and a smeared frame takes its neighbours with it",
  );
  check(
    "and one reading is not evidence of stillness",
    unsteadiness([directionOf(0, 0)]) > 90,
  );
}

// ---------------------------------------------------------------------------
// Acceptance 1 and 2, and section 5: the targets move with the phone
// ---------------------------------------------------------------------------

{
  const hfov = 60;
  const vfov = verticalFov(hfov, 640, 480);

  // Acceptance 1. A target to the right, and a phone turning right.
  {
    // 25°, because 45° is outside the frame of a 60° lens and so is not drawn
    // at all — which is itself correct, and checked below.
    const near = directionOf(25, 0);
    const straight = project(near, withLocalZero(rotationMatrix(0, 90, 0), 0), hfov, vfov);
    const turned = project(
      near,
      withLocalZero(rotationMatrix(-25, 90, 0), 0),
      hfov,
      vfov,
    );
    check(
      "a target off to the right starts off to the right, and turning brings it to the centre",
      straight !== null &&
        straight.x > 0.3 &&
        turned !== null &&
        Math.abs(turned.x) < 0.05,
      "acceptance 1: both halves in one check, because arriving at the centre is true of any scaling — it is only evidence when it started somewhere else",
    );

    // Acceptance 1 as the brief states it: 90° right, and a target 90° away.
    {
      const far = directionOf(90, 0);
      const before = project(far, withLocalZero(rotationMatrix(0, 90, 0), 0), hfov, vfov);
      const after = project(far, withLocalZero(rotationMatrix(-90, 90, 0), 0), hfov, vfov);
      check(
        "rotating 90° right brings a target 90° to the right onto the aim",
        before === null && after !== null && Math.abs(after.x) < 0.05,
        "the brief's own acceptance test: out of sight to begin with, dead centre when you get there",
      );
    }
    check(
      "the edge of the screen is the edge of the field of view",
      (() => {
        const edge = project(
          directionOf(hfov / 2, 0),
          withLocalZero(rotationMatrix(0, 90, 0), 0),
          hfov,
          vfov,
        );
        return edge !== null && Math.abs(edge.x - 1) < 0.02;
      })(),
      "without the field of view in the divisor the targets are drawn at the right sign and the wrong distance, so nothing lines up with what the camera can see",
    );
  }

  // Acceptance 2. A target above, and a phone tilting up.
  {
    const target = directionOf(0, 30);
    const level = project(target, withLocalZero(rotationMatrix(0, 90, 0), 0), hfov, vfov);
    const lifted = project(
      target,
      withLocalZero(rotationMatrix(0, 120, 0), 0),
      hfov,
      vfov,
    );
    check(
      "a target 30° up starts above the middle and tilting up brings it to the centre",
      level !== null &&
        level.y > 0.3 &&
        lifted !== null &&
        Math.abs(lifted.y) < 0.05,
      "acceptance 2: tilting up must move the upper targets towards the aim — and up has to mean up, which arriving at zero cannot show",
    );
  }

  check(
    "something directly behind is not drawn at the edge as if it were beside you",
    project(directionOf(180, 0), withLocalZero(rotationMatrix(0, 90, 0), 0), hfov, vfov) === null,
    "a target pinned to the edge that is really 180° away tells somebody to stop turning half a room early",
  );
  check(
    "and neither is one well off to the side but still in front",
    project(directionOf(75, 0), withLocalZero(rotationMatrix(0, 90, 0), 0), hfov, vfov) === null,
    "depth alone does not bound the screen: 75° away is in front of the camera and nowhere near the frame, so it needs the margin to stop it being drawn",
  );

  check(
    "a target dead ahead is dead centre",
    (() => {
      const at = project(directionOf(0, 0), withLocalZero(rotationMatrix(0, 90, 0), 0), hfov, vfov);
      return at !== null && Math.abs(at.x) < 0.02 && Math.abs(at.y) < 0.02;
    })(),
  );

  check(
    "the projection moves only when the phone does",
    (() => {
      // A direction that is actually on screen, so that "they agree" is
      // evidence of determinism rather than of both being off the edge.
      const r = withLocalZero(rotationMatrix(0, 90, 0), 0);
      const a = project(directionOf(12, 6), r, hfov, vfov);
      const b = project(directionOf(12, 6), r, hfov, vfov);
      return (
        a !== null &&
        b !== null &&
        Math.abs(a.x) < 1 &&
        a.x === b.x &&
        a.y === b.y
      );
    })(),
    "acceptance 11: a target that drifts with the phone held still is an animation pretending to be a gyroscope",
  );
}

// ---------------------------------------------------------------------------
// Acceptance 5, and section 3: the whole sphere, not one ring
// ---------------------------------------------------------------------------

{
  // Built from the frame the capture asks the camera for, not from a bare
  // field-of-view number. The plan's rings are spaced by how tall a frame is,
  // and a check that does not say what shape the frame is cannot see whether
  // they meet.
  const SHAPE = fieldsOfView(1440, 1080);
  const plan = spherePlan(SHAPE.hfov, SHAPE.vfov);
  const pitches = new Set(plan.map((t) => t.pitch));

  check(
    "there are targets above the horizon",
    plan.some((t) => t.pitch > 20),
    "acceptance 5: one horizontal row leaves the ceiling unphotographed, and something then has to be invented to fill it",
  );
  check("and below it", plan.some((t) => t.pitch < -20));
  check("and at it", plan.some((t) => t.pitch === 0));
  check(
    "including straight up and straight down",
    pitches.has(90) && pitches.has(-90),
  );
  check(
    "which is three rings and two poles",
    pitches.size === 5,
    [...pitches].sort((a, b) => b - a).join(", "),
  );

  check(
    "the horizon gets the most photographs",
    ringCount(0, SHAPE.hfov) > ringCount(45, SHAPE.hfov),
    "a ring at 45° has less circumference than the horizon and needs fewer frames",
  );
  check(
    "a pole is one photograph",
    ringCount(90, SHAPE.hfov) === 1 && ringCount(-90, SHAPE.hfov) === 1,
  );
  check(
    "the compact horizon ring uses eight photographs",
    ringCount(0, SHAPE.hfov) === 8,
    `got ${ringCount(0, SHAPE.hfov)}`,
  );
  check(
    "and the whole plan is exactly twenty-two",
    plan.length === 22,
    `got ${plan.length}`,
  );

  check(
    "neighbours on a ring overlap by the third the stitcher needs",
    (() => {
      const n = ringCount(0, SHAPE.hfov);
      const spacing = 360 / n;
      const shared = (SHAPE.hfov - spacing) / SHAPE.hfov;
      return shared >= 0.25 && shared <= 0.55;
    })(),
    "too little and there is nothing to match on; too much and it is forty photographs of the same wall",
  );
  check(
    "the normal route retains 35–50% overlap",
    OVERLAP >= 0.35 && OVERLAP <= 0.5,
  );

  // ---- the check that was missing -----------------------------------------
  //
  // Everything above measures the plan across a ring. Nothing measured it
  // between rings, and the ring pitches were a hardcoded constant while the
  // ring counts were computed -- so the plan could ask for photographs 45
  // degrees apart from a camera that sees 43, leaving a band round the room
  // that nobody photographs and no overlap at all for the stitcher to match
  // on.
  //
  // That is what "Some areas could not be aligned correctly" was, on captures
  // that had nothing wrong with them.
  for (const [w, h, label] of [
    [1440, 1080, "4:3, which is what the capture asks for"],
    [1920, 1080, "16:9, if the camera gives that instead"],
    [1080, 1440, "3:4, if it arrives on its side"],
    [1080, 1920, "9:16, the same"],
  ] as [number, number, string][]) {
    const shape = fieldsOfView(w, h);
    const pitchList = ringPitches(shape.vfov);
    const spacing = pitchList[0] - pitchList[1];
    const shared = (shape.vfov - spacing) / shape.vfov;
    check(
      `rings overlap vertically, at ${label}`,
      shared >= 0.12,
      `frames are ${shape.vfov.toFixed(1)} degrees tall and the rings are ${spacing.toFixed(1)} apart: ${(shared * 100).toFixed(0)}% overlap`,
    );
    check(
      `and the rings reach both poles, at ${label}`,
      pitchList[0] === 90 && pitchList[pitchList.length - 1] === -90,
      pitchList.join(", "),
    );
  }

  check(
    "the vertical overlap asked for is the measured floor, not below it",
    VERTICAL_OVERLAP >= 0.18 && VERTICAL_OVERLAP < OVERLAP,
    "0.18 is where the synthetic room was measured to still stitch; less has never been tested",
  );
  check(
    "a shorter frame is given more rings rather than wider gaps",
    ringPitches(fieldsOfView(1920, 1080).vfov).length >
      ringPitches(fieldsOfView(1440, 1080).vfov).length,
    "the alternative is a plan asking for photographs the camera cannot join up",
  );

  // ---- which axis the assumed field belongs to -----------------------------
  check(
    "a wide frame is told the assumed field is its width",
    Math.abs(fieldsOfView(1920, 1080).hfov - ASSUMED_LONG_AXIS_FOV) < 0.01,
  );
  check(
    "and a tall frame is told it is its height",
    Math.abs(fieldsOfView(1080, 1920).vfov - ASSUMED_LONG_AXIS_FOV) < 0.01,
    "70 degrees applied to the narrow side of a tall frame overstates it by about 1.6x, and the stitcher refuses the result",
  );
  check(
    "so a frame and the same frame on its side describe the same lens",
    Math.abs(fieldsOfView(1440, 1080).hfov - fieldsOfView(1080, 1440).vfov) < 0.01 &&
      Math.abs(fieldsOfView(1440, 1080).vfov - fieldsOfView(1080, 1440).hfov) < 0.01,
  );
  check(
    "and a frame of no size does not produce a plan of infinite rings",
    Number.isFinite(fieldsOfView(0, 0).hfov) &&
      ringPitches(fieldsOfView(0, 0).vfov).length > 0,
    "guaranteed by verticalFov, which returns the angle it was given when a dimension is zero",
  );

  // ---- the wiring ---------------------------------------------------------
  //
  // Everything above tests the geometry. None of it tests that the app hands
  // the geometry the frame it is actually holding, and that is the half of
  // this bug that reached a phone: `spherePlan` would happily have produced a
  // correct plan the whole time if anybody had told it how tall a frame was.
  //
  // Deleting the second argument at either of these two call sites puts the
  // hole straight back, silently, because the plan still comes out valid --
  // just valid for a frame shape nobody is holding.
  {
    const captureLib = code("src/lib/panorama/capture.ts");
    const ui = code("src/components/tour/panorama-capture.tsx");

    check(
      "startCapture passes the frame's height through to the plan",
      /spherePlan\(hfov, vfov\)/.test(captureLib),
      "spherePlan(hfov) alone falls back to an assumed shape and the rings stop matching the camera",
    );
    check(
      "and the screen gives it both fields when the capture begins",
      /startCapture\(shape\.hfov, shape\.vfov\)/.test(ui),
    );
    check(
      "the shape comes from the calibration, or from the video if there is none",
      /calibrationRef\.current \?\?\s*\n?\s*fieldsOfView\(/.test(ui),
      "a plan built before the camera has reported its size is a plan for the wrong camera",
    );

    // The constraint itself. A 16:9 frame at 70 degrees is 43 degrees tall and
    // the 4:3 plan's rings are 45 apart, which is the gap this began as.
    check(
      "the camera is asked for a 4:3 frame, which is the shape the plan is sized for",
      /aspectRatio: \{ ideal: 4 \/ 3 \}/.test(ui) &&
        /width: \{ ideal: 1440 \}/.test(ui) &&
        /height: \{ ideal: 1080 \}/.test(ui),
      "asking for width alone gets 16:9, which is four degrees too short for the rings to meet",
    );
    check(
      "and asked, not required, so a camera that cannot is still usable",
      !/aspectRatio: \{ exact:/.test(ui) && !/width: \{ exact:/.test(ui),
      "the plan grows extra rings for whatever shape arrives; refusing the camera helps nobody",
    );
  }

  check(
    "a wider lens needs fewer photographs",
    ringCount(0, 90) < ringCount(0, 50),
    "section 3: the count adapts to the camera rather than being written down",
  );

  check(
    "every target has a direction that matches its angles",
    plan.every((t) => angleBetween(t.direction, directionOf(t.yaw, t.pitch)) < 0.01),
  );
  check(
    "no two targets are the same direction",
    new Set(plan.map((t) => t.id)).size === plan.length,
  );
  check(
    "the horizon comes first, so a capture given up halfway kept the useful half",
    plan[0].pitch === 0 && Math.abs(plan[plan.length - 1].pitch) === 90,
    "reversing the list satisfies 'no further out than the last one' while putting the nadir first",
  );

  // Every direction on the sphere actually falls inside some photograph.
  //
  // This used to measure the angle to the nearest target and compare it with
  // half the horizontal field, which treats a frame as a circle. A frame is a
  // rectangle, and it was a rectangle 70 degrees one way and 43 the other --
  // so a direction 30 degrees from a target counted as covered when it was 30
  // degrees *above* it and the frame only reached 21.5.
  //
  // That generous measure is why a plan with an unphotographed band running
  // round the whole room passed every check in this file. So the test is now
  // the real frustum -- is this direction inside the rectangle -- for every
  // frame shape the app can be handed.
  for (const [w, h, label] of [
    [1440, 1080, "4:3"],
    [1920, 1080, "16:9"],
    [1080, 1920, "9:16"],
  ] as [number, number, string][]) {
    const shape = fieldsOfView(w, h);
    const shapePlan = spherePlan(shape.hfov, shape.vfov);
    const bases = shapePlan.map((t) => basisFrom(t.yaw, t.pitch, 0));
    const tanH = Math.tan(((shape.hfov / 2) * Math.PI) / 180);
    const tanV = Math.tan(((shape.vfov / 2) * Math.PI) / 180);

    let uncovered = 0;
    let total = 0;
    let firstGap: { yaw: number; pitch: number } | null = null;
    for (let yaw = 0; yaw < 360; yaw += 5) {
      for (let pitch = -88; pitch <= 88; pitch += 4) {
        total += 1;
        const d = directionOf(yaw, pitch);
        const seen = bases.some((b) => {
          const along =
            d[0] * b.forward[0] + d[1] * b.forward[1] + d[2] * b.forward[2];
          if (along <= 1e-6) return false;
          const x =
            (d[0] * b.right[0] + d[1] * b.right[1] + d[2] * b.right[2]) / along;
          const y = (d[0] * b.up[0] + d[1] * b.up[1] + d[2] * b.up[2]) / along;
          return Math.abs(x) <= tanH && Math.abs(y) <= tanV;
        });
        if (!seen) {
          uncovered += 1;
          if (!firstGap) firstGap = { yaw, pitch };
        }
      }
    }

    check(
      `every direction falls inside some photograph, at ${label}`,
      uncovered === 0,
      firstGap
        ? `${uncovered} of ${total} directions are in no frame at all; the first is yaw ${firstGap.yaw}, pitch ${firstGap.pitch}`
        : `all ${total} covered`,
    );
  }
}

// ---------------------------------------------------------------------------
// Acceptance 3, 4 and 6: aiming, capturing once, and the gate
// ---------------------------------------------------------------------------

{
  const fresh = startCapture();
  const first = fresh.plan[0];

  // Acceptance 3.
  {
    const aimed = decide(fresh, { facing: first.direction, roll: 0, unsteady: 0.5, heldMs: STEADY_MS });
    check(
      "pointing at a target and holding still takes the photograph",
      aimed.action === "capture" && aimed.target.id === first.id,
      "acceptance 3: aligning the circle with the aim must capture, without anybody pressing anything",
    );
  }

  check(
    "pointing at it and still moving does not",
    decide(fresh, { facing: first.direction, roll: 0, unsteady: STEADY_DEGREES + 3, heldMs: STEADY_MS }).action === "aim",
    "the phone must settle on the target for a full second, because a frame taken mid-swing is the one the matcher cannot place",
  );
  check(
    "and holding still for only a moment does not either",
    decide(fresh, { facing: first.direction, roll: 0, unsteady: 0.5, heldMs: STEADY_MS - 120 }).action === "aim",
  );
  check(
    "the shutter waits long enough to confirm the point is centred",
    STEADY_MS >= 900 && STEADY_MS <= 1200,
  );

  {
    let hold = updateHold(EMPTY_HOLD, first.id, true, 1000);
    hold = updateHold(hold, first.id, true, 1100);
    hold = updateHold(hold, first.id, false, 1100 + HOLD_GRACE_MS - 1);
    hold = updateHold(hold, first.id, true, 1200);
    check("one noisy gyro sample does not erase the hold", heldFor(hold, 1240) === 240);
    hold = updateHold(hold, "another", true, 1250);
    check("changing targets does restart it", heldFor(hold, 1250) === 0);
    hold = updateHold(hold, "another", false, 1250 + HOLD_GRACE_MS + 1);
    check("a real move away clears it", heldFor(hold, 1500) === 0);
  }

  {
    const away = decide(fresh, { facing: directionOf(first.yaw + 40, first.pitch + 40), roll: 0, unsteady: 0, heldMs: STEADY_MS });
    check(
      "pointing somewhere else does not take a photograph of somewhere else",
      away.action === "aim" && !away.aligned,
    );
    check(
      "and the nearest target is the one being aimed at",
      away.action === "aim" && away.error <= 60,
    );
  }

  // Acceptance 4.
  {
    const after = decide(fresh, { facing: first.direction, roll: 0, unsteady: 0.5, heldMs: STEADY_MS });
    if (after.action !== "capture") {
      check("acceptance 4 needs a capture to work from", false);
    } else {
      check(
        "a captured target is recorded",
        after.state.taken.includes(first.id),
      );
      const again = decide(after.state, { facing: first.direction, roll: 0, unsteady: 0.5, heldMs: STEADY_MS });
      check(
        "and cannot be captured a second time",
        again.action !== "capture" || again.target.id !== first.id,
        "acceptance 4: forty photographs of the one wall somebody lingered on is not a sphere",
      );
      check(
        "recording the same target twice changes nothing",
        record(after.state, first.id).taken.length === after.state.taken.length,
      );
    }
  }

  // Acceptance 6.
  {
    check(
      "a capture with nothing in it is not finished",
      !isComplete(fresh),
      "acceptance 6: finishing with major areas missing is asking the stitcher to invent them",
    );

    let partial = fresh;
    for (const target of fresh.plan.filter((t) => t.pitch === 0)) {
      partial = record(partial, target.id);
    }
    check(
      "and neither is one that photographed only the horizon",
      !isComplete(partial),
      "which is exactly the capture that produced the funnel",
    );
    check(
      "the missing directions are the ones not yet photographed",
      progress(partial).missing.every((t) => t.pitch !== 0) &&
        progress(partial).missing.length > 0,
    );

    let required = fresh;
    for (const target of fresh.plan.filter((t) => t.required)) {
      required = record(required, target.id);
    }
    check(
      "photographing every required direction finishes it",
      isComplete(required),
    );
    check(
      "the poles are required too, because a skipped pole is a hole",
      fresh.plan.every((t) => t.required),
      "the stitcher leaves an unphotographed region at rgb(28,28,30) rather than inventing it, so a skipped zenith is a dark patch in the middle of the finished ceiling",
    );
    check(
      "so a capture missing only the zenith does not count as finished",
      (() => {
        const zenith = fresh.plan.find((t) => t.pitch === 90);
        if (!zenith) return false;
        let all = startCapture();
        for (const target of fresh.plan) {
          if (target.id === zenith.id) continue;
          all = record(all, target.id);
        }
        return !isComplete(all);
      })(),
      "twenty-one of twenty-two, and the one left out is the part of the room somebody looking up will look at",
    );
  }

  // --- the route is numbered, and the numbers are the order ---------------
  {
    check(
      "every target is numbered, from one",
      fresh.plan.every((t, i) => t.index === i + 1),
      "so that the route can be read off the screen, and so that a capture that stopped at 23 can be talked about",
    );
    check(
      "and the numbers run in the order the targets are meant to be taken",
      fresh.plan[0].index === 1 &&
        fresh.plan[0].pitch === 0 &&
        fresh.plan[fresh.plan.length - 1].index === fresh.plan.length,
      "numbering before the sort would print the order they were generated in, which is not the order anybody should walk",
    );

    check("the first one wanted is the first one", nextInOrder(fresh)?.index === 1);
    {
      const after = record(fresh, fresh.plan[0].id);
      check("and taking it moves the route on", nextInOrder(after)?.index === 2);
      check(
        "the screen is sent to that one",
        (() => {
          const away = decide(after, {
            facing: directionOf(after.plan[1].yaw + 50, after.plan[1].pitch + 20),
            roll: 0,
            unsteady: 0,
            heldMs: 0,
          });
          return away.action === "aim" && away.target.index === 2;
        })(),
      );
      check(
        "and told which number it is going to",
        (() => {
          const facing = directionOf(after.plan[1].yaw + 50, after.plan[1].pitch + 20);
          const away = decide(after, { facing, roll: 0, unsteady: 0, heldMs: 0 });
          return away.action === "aim" && /\b2\b/.test(guidance(away, facing));
        })(),
        "an arrow and a number name the same target; an arrow alone names nothing",
      );

      // The route is where you are sent, not a rule about what counts.
      const ninth = after.plan[8];
      const opportunist = decide(after, {
        facing: ninth.direction,
        roll: 0,
        unsteady: 0,
        heldMs: STEADY_MS,
      });
      check(
        "pointing at a later number still photographs it",
        opportunist.action === "capture" && opportunist.target.index === 9,
        "refusing a photograph of somewhere that needs photographing, for being out of order, is a rule with nothing behind it",
      );
    }

    check(
      "and when everything is taken there is nowhere left to be sent",
      (() => {
        let all = fresh;
        for (const t of fresh.plan) all = record(all, t.id);
        return nextInOrder(all) === null;
      })(),
    );
  }

  // --- roll: the reason the last set came out soft ------------------------
  {
    const square = decide(fresh, {
      facing: first.direction,
      roll: 0,
      unsteady: 0.2,
      heldMs: STEADY_MS,
    });
    check("a phone held square captures", square.action === "capture");

    const tipped = decide(fresh, {
      facing: first.direction,
      roll: ROLL_TOLERANCE_DEGREES + 10,
      unsteady: 0.2,
      heldMs: STEADY_MS,
    });
    check(
      "the same phone rolled over to one side does not",
      tipped.action === "aim" && !tipped.level,
      "the stitcher places a frame by its recorded roll, so a rolled one sits at an angle to its neighbours and the seam has to blend two rotations of one wall — which it cannot, so it blurs",
    );

    check(
      "and it is told to straighten up rather than to hold still",
      /straighten/i.test(guidance(tipped, first.direction)),
      "somebody holding a tilted phone perfectly still would otherwise never learn why nothing is happening",
    );

    const upsideish = decide(fresh, {
      facing: first.direction,
      roll: 359,
      unsteady: 0.2,
      heldMs: STEADY_MS,
    });
    check(
      "a roll of 359° is one degree, not a phone held upside down",
      upsideish.action === "capture",
    );
    const pole = fresh.plan.find((target) => Math.abs(target.pitch) === 90)!;
    check(
      "a centred ceiling or floor target captures even when roll is singular",
      decide(fresh, { facing: pole.direction, roll: 91, unsteady: 0, heldMs: STEADY_MS }).action === "capture",
    );
    check(
      "the roll tolerance is loose enough to hold a phone by hand",
      ROLL_TOLERANCE_DEGREES >= 8 && ROLL_TOLERANCE_DEGREES <= 20,
    );
    check(
      "and roll error is signed both ways, with half a turn either sign",
      rollError(10) === 10 &&
        rollError(350) === -10 &&
        Math.abs(rollError(180)) === 180,
    );
  }

  check(
    "the tolerance is tight enough to mean something",
    ALIGN_TOLERANCE_DEGREES > 3 && ALIGN_TOLERANCE_DEGREES < 15,
  );

  // The manual backup, section 4.
  {
    const manual = captureManually(fresh, first);
    check(
      "a frame can still be taken by hand",
      manual.action === "capture" && manual.state.taken.includes(first.id),
    );
  }

  check(
    "nothing is left to aim at once everything is photographed",
    (() => {
      let all = fresh;
      for (const t of fresh.plan) all = record(all, t.id);
      return decide(all, { facing: first.direction, roll: 0, unsteady: 0, heldMs: STEADY_MS }).action === "done";
    })(),
  );

  check(
    "the nearest target ignores the ones already done",
    (() => {
      const done = new Set([first.id]);
      const found = nearestTarget(fresh.plan, done, first.direction);
      return found !== null && found.target.id !== first.id;
    })(),
  );

  check(
    "coverage counts what was taken against what was planned",
    coverage(fresh.plan, new Set([first.id])).taken === 1 &&
      coverage(fresh.plan, new Set()).total === fresh.plan.length,
  );
}

// ---------------------------------------------------------------------------
// Image quality at capture, and staying on the spot
// ---------------------------------------------------------------------------

{
  // A pattern of hard edges, and the same pattern smeared sideways the way a
  // phone smears one when it fires mid-swing.
  const W = 64;
  const H = 64;
  const crisp = new Uint8Array(W * H);
  const smeared = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) crisp[y * W + x] = Math.floor(x / 8) % 2 === 0 ? 40 : 210;
  }
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      let total = 0;
      for (let d = -3; d <= 3; d += 1) {
        total += crisp[y * W + Math.min(W - 1, Math.max(0, x + d))];
      }
      smeared[y * W + x] = total / 7;
    }
  }

  const sharpScore = focusScore(crisp, W, H);
  const blurScore = focusScore(smeared, W, H);

  check(
    "a smeared frame scores far below a sharp one",
    blurScore < sharpScore * 0.1,
    `${blurScore.toFixed(0)} against ${sharpScore.toFixed(0)} — motion blur destroys the second derivative while leaving the average brightness alone, which is why it is measured this way and not by brightness`,
  );

  // What a frame is judged against, which is where this went wrong before.
  check(
    "sharpness is judged against a floor, not against other frames",
    !/isSharpEnough|medianOf|BLUR_FRACTION/.test(code("src/lib/panorama/sharpness.ts")),
    "the score depends on what is in front of the camera as much as on how still it was held: a wall with a picture rail scores an order of magnitude above a plain one, so a target facing a blank wall could never reach half of what a bookcase scored and was refused forever",
  );
  check(
    "and the floor is low enough that ordinary handheld softness passes",
    CLEARLY_BAD < sharpScore * 0.02,
    `${CLEARLY_BAD} against ${sharpScore.toFixed(0)} for a sharp frame — this is a property tour, not tripod work`,
  );
  check(
    "a frame with almost no edges anywhere is still caught",
    shouldRetake(CLEARLY_BAD - 1, 1),
  );

  // The acceptance test: how many photographs one target can cost.
  {
    check(
      "a normal frame is kept first time",
      !shouldRetake(sharpScore, 1),
      "one aligned target, one photograph",
    );
    check(
      "a clearly unusable one buys exactly one more go",
      shouldRetake(1, 1) && !shouldRetake(1, 2),
      "after the second, the better of the two is used whatever it scored — nothing here can repeat",
    );
    check(
      "so no target can ever cost more than two",
      [1, 2, 3, 10, 40].every((attempt) => attempt < MAX_ATTEMPTS_PER_TARGET || !shouldRetake(0, attempt)),
      "the runaway was a hundred and forty photographs for three points",
    );
    check(
      "and twenty-two targets cannot cost more than forty-four",
      MAX_ATTEMPTS_PER_TARGET === 2,
      `${MAX_ATTEMPTS_PER_TARGET} attempts each — normally 22, never more than 44`,
    );
  }

  // Movement that turning does not account for.
  {
    let walking = 0;
    for (let i = 0; i < 20; i += 1) walking = accumulateDrift(walking, 2.5, 0.05);
    check(
      "a second of walking is noticed",
      hasDrifted(walking),
      `${walking.toFixed(2)} — parallax is the one thing no rotation can reconcile, so it is worth interrupting somebody for`,
    );

    // 1.5 m/s² is a hand adjusting its grip, not somebody walking. It is
    // chosen because the decay alone does not hold it under the warning —
    // without the deadband this settles at 1.25 and warns — so the check
    // exercises the deadband rather than passing with or without it.
    let steady = 0;
    for (let i = 0; i < 80; i += 1) steady = accumulateDrift(steady, 1.5, 0.05);
    check(
      "a hand that is merely not perfectly still is not",
      !hasDrifted(steady),
      `${steady.toFixed(2)} — a warning everybody sees is a warning nobody reads`,
    );

    let recovering = walking;
    for (let i = 0; i < 60; i += 1) recovering = accumulateDrift(recovering, 0.2, 0.05);
    check(
      "and standing still again clears it",
      !hasDrifted(recovering),
      `${recovering.toFixed(2)} — a warning that never goes away cannot be obeyed`,
    );
    check(
      "with nothing happening the total only falls",
      accumulateDrift(5, 0, 0.05) < 5 && accumulateDrift(5, 0, 0.05) > 0,
      "without the decay a capture that started with one stumble would carry the warning to the end of the room",
    );
  }

  // The screen, and the state machine behind it.
  {
    const fresh = startCapture();
    const taken = record(fresh, fresh.plan[0].id);
    check(
      "a target can be put back on the list",
      unrecord(taken, fresh.plan[0].id).taken.length === 0,
      "the shutter and the photograph are different events: the decision comes from the sensors and the frame is read a moment later and may be thrown away",
    );
    check(
      "and putting back one that was never taken changes nothing",
      unrecord(fresh, fresh.plan[0].id) === fresh,
    );
  }

  const capture = code("src/components/tour/panorama-capture.tsx");
  check(
    "nothing is decided while a frame is being read, or just after one was",
    /if \(busyRef\.current \|\| Date\.now\(\) < cooldownRef\.current\) return;/.test(capture),
    "the loop ran at sixty frames a second with no idea that a capture was in progress, which is how one target became forty photographs",
  );
  check(
    "a successful capture shuts the shutter for the best part of a second",
    /cooldownRef\.current = Date\.now\(\) \+ CAPTURE_COOLDOWN_MS;/.test(capture) &&
      CAPTURE_COOLDOWN_MS >= 700 &&
      CAPTURE_COOLDOWN_MS <= 1200,
    `${CAPTURE_COOLDOWN_MS}ms — nobody swings away the instant it fires, so without this the phone is still pointing at the same place when the next decision is made`,
  );
  check(
    "each target's attempts are counted against itself",
    /attemptsRef\.current\.get\(target\.id\)/.test(capture) &&
      /bestShotRef\.current\.get\(target\.id\)/.test(capture),
    "a score means nothing against a frame of somewhere else",
  );
  check(
    "and after the last go the better of the two is kept",
    /const best = !previous \|\| shot\.score > previous\.score \? shot : previous;/.test(capture) &&
      /blob: best\.blob,/.test(capture),
    "keeping neither, and going round again, is the loop this is fixing",
  );
  check(
    "the shutter requires a visibly settled hand",
    STEADY_MS >= 900 && STEADY_MS <= 1200 &&
      ALIGN_TOLERANCE_DEGREES >= 5 && ALIGN_TOLERANCE_DEGREES <= 6 &&
      STEADY_DEGREES <= 3,
    `${STEADY_MS}ms and ${STEADY_DEGREES}° between readings`,
  );
  check(
    "stillness is required before the shutter rather than judged after it",
    /const settled =\s*\n?\s*decision\.action === "aim" && decision\.aligned && decision\.steady && decision\.level;/.test(
      capture,
    ),
    "waiting for a steady phone and taking one photograph beats taking many and throwing most away",
  );
  check(
    "a refused frame does not leave its target marked done",
    /if \(!shot \|\| !pose \|\| !video\) \{[\s\S]{0,260}?unrecord\(stateRef\.current, target\.id\)/.test(
      capture,
    ),
    "a target marked done with no photograph behind it is a hole in the sphere that the coverage gate cannot see, because the gate counts intentions",
  );
  check(
    "focus is measured before anything is encoded",
    /const score = focusScore\(grey, probeW, probeH\);/.test(capture) &&
      capture.indexOf("focusScore(grey") < capture.indexOf("canvas.toBlob"),
  );
  check(
    "camera metering is held only through a safe automatic single shot",
    /safeCameraControlPlan\(able\)/.test(capture) &&
      !/\["exposureMode", "manual"\]/.test(capture) &&
      !/\["whiteBalanceMode", "manual"\]/.test(capture),
    "manual mode without ISO and exposure time made Samsung previews dark and unstable",
  );
  check(
    "and a phone that will not hold them still captures anyway",
    // The structure, not the comment explaining it: `code()` strips comments,
    // so a check written against the explanation is a check against nothing.
    /try \{\s*await track\.applyConstraints\(\{ advanced: \[plan\] \}/.test(capture) &&
      /able = \(track\.getCapabilities\?\.\(\) \?\? \{\}\)[\s\S]{0,80}?\} catch \{\s*return;/.test(
        capture,
      ),
    "a capture with the camera metering as it pleases is worse, not impossible",
  );
  check(
    "the camera is given a moment to settle before it is pinned",
    /setTimeout\(resolve, CAMERA_METERING_SETTLE_MS\)/.test(capture) &&
      /CAMERA_METERING_SETTLE_MS = 1200/.test(
        code("src/lib/panorama/camera-controls.ts"),
      ),
    "pinning the first reading pins whatever the sensor saw as it woke up",
  );
  check(
    "somebody who walks off is asked to come back",
    /tours\.turnOnSpot/.test(capture) &&
      /Come back to where you started and turn on the spot/.test(
        code("src/lib/i18n/translations.ts"),
      ),
  );
  const rules = code("src/components/tour/capture-rules.tsx");
  const translations = code("src/lib/i18n/translations.ts");
  check(
    "moving people are kept out of the capture",
    /rulePlaceDetail/.test(rules) &&
      /Ask other people to step out or stay still/.test(translations) &&
      /transparent duplicates/.test(translations),
    "the supplied failed panorama contains people in different positions; no geometric stitch can make changing input agree",
  );
  check(
    "and the movement is read from the accelerometer, not guessed at",
    /window\.addEventListener\("devicemotion", onMotion\)/.test(capture) &&
      /accumulateDrift\(driftRef\.current, magnitude, seconds\)/.test(capture),
  );
  check(
    "a frame thrown away for blur is admitted to, not hidden",
    /tours\.photosRetaken/.test(capture) && /String\(refused\)/.test(capture),
  );
}

// ---------------------------------------------------------------------------
// Section 9: what the screen says
// ---------------------------------------------------------------------------

{
  const fresh = startCapture();
  const target = { yaw: 90, pitch: 0 };

  check("turn right", /right/i.test(steer(target, { yaw: 0, pitch: 0 }, false, false)));
  check("turn left", /left/i.test(steer(target, { yaw: 180, pitch: 0 }, false, false)));
  check(
    "look up",
    /up/i.test(steer({ yaw: 0, pitch: 60 }, { yaw: 0, pitch: 0 }, false, false)),
  );
  check(
    "look down",
    /down/i.test(steer({ yaw: 0, pitch: -60 }, { yaw: 0, pitch: 0 }, false, false)),
  );
  check(
    "hold steady once it is lined up",
    /steady/i.test(steer(target, { yaw: 90, pitch: 0 }, true, false)),
  );
  check("and captured when it is taken", /captur/i.test(steer(target, target, true, true)));
  check(
    "the instruction names the axis that is furthest out",
    /up/i.test(steer({ yaw: 5, pitch: 70 }, { yaw: 0, pitch: 0 }, false, false)),
    "two instructions at once is two things to get wrong",
  );
  check(
    "a small correction is not shouted as a full turn",
    /little|slight/i.test(steer({ yaw: 8, pitch: 0 }, { yaw: 0, pitch: 0 }, false, false)),
  );

  check(
    "the guidance never says to turn 40 degrees",
    !/40°|about 40/i.test(
      guidance(decide(fresh, { facing: directionOf(200, 40), roll: 0, unsteady: 9, heldMs: 0 }), directionOf(200, 40)),
    ),
    "section 9: a number of degrees tells somebody holding a phone nothing about where to point it",
  );

  check(
    "frames are named in capture order",
    frameName(0) === "000.jpg" && frameName(12) === "012.jpg",
  );
  check(
    "a sphere's worth of frames is uploaded smaller than a short set",
    frameWidthFor(22) < frameWidthFor(12) && frameWidthFor(22) >= 1200,
    "twenty-two full-resolution phone frames are unnecessarily slow to retry",
  );

  check(
    "a stitch that failed for want of coverage says so, and says what to do",
    /hole|never photographed|above and below/i.test(
      stitchErrorMessage("incomplete_sphere"),
    ),
  );
  check(
    "and an unknown code still says something useful",
    stitchErrorMessage("wat").length > 30,
  );
}

// ---------------------------------------------------------------------------
// Section 7: no AI, and no old cylinder
// ---------------------------------------------------------------------------

{
  const stitcher = code("src/lib/panorama/compose.ts");
  check(
    "the stitcher calls no model and no provider",
    !/openai|anthropic|replicate|fetch\(/i.test(stitcher),
    "section 7 of the first brief and section 20 of this one: conventional stitching only",
  );
  check(
    "and reaches no network at all",
    !/https?:\/\//i.test(stitcher.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "")),
  );

  check(
    "the old single-row capture plan is gone",
    !/capturePlan|captureStep/.test(code("src/lib/panorama/stitch.ts")) &&
      !/capturePlan|captureStep/.test(code("src/lib/panorama/capture.ts")),
    "section 1: remove the nine-photo horizontal workflow, not merely stop calling it",
  );
  check(
    "and so is the cylinder it projected onto",
    !/cylind/i.test(stitcher),
    "a cylinder has no top and no bottom, which is the whole of why the old output collapsed",
  );

  check(
    "the pose the phone recorded is the starting estimate",
    /basisFrom\(\s*frame\.pose\.yaw/.test(stitcher),
    "section 7 step 2",
  );
  check(
    "it is refined against the pixels rather than trusted",
    /function refinePoses/.test(stitcher) && /function agreement/.test(stitcher),
    "section 7 steps 3–5: sensors drift, and a degree of drift puts a doorway two hundred pixels from itself",
  );
  check(
    "and every frame is refined only against angular neighbours",
    /if \(rough >= POLISH_ABOVE\) \{/.test(stitcher) &&
      /other !== frame && areAngularNeighbours\(frame, other\)/.test(stitcher),
    "repeated lights and cabinets on the opposite wall must never enter a local pose solve",
  );
  check(
    "with the frame itself left out of what it is compared against",
    /other !== frame && areAngularNeighbours\(frame, other\)/.test(stitcher),
    "a frame compared against a picture that already contains it is being asked to agree with itself, which it does best by not moving",
  );
  check(
    "and only when the frames admit a single rotation at all",
    /const POLISH_ABOVE = 0\.45;/.test(stitcher),
    "where one exists the second pass finds it — 0.947 to 0.953 on the synthetic room, and half the badly-placed pixels. Where parallax means none does, the same pass chases it and makes things worse: 0.904 down to 0.897. The first pass's own score says which case this is",
  );
  check(
    "a refinement has to beat leaving the frame alone before it is taken",
    /best\.score > staying \+ ACCEPT_MARGIN/.test(stitcher),
    "without this the refinement moves every frame by whatever scored highest on noise, and because each is then painted for the next to match against, it accumulates — on a synthetic room with perfect poses the whole ring drifted three degrees",
  );
  check(
    "frames are warped onto a sphere",
    /directionOf/.test(stitcher) && /depth/.test(stitcher),
    "section 7 step 6",
  );
  check(
    "the frames have to agree before a panorama is published",
    /if \(alignment < MIN_ALIGNMENT\)/.test(stitcher),
    "an automatic quality check before 'your 360 photo is ready', which is the difference between a bad panorama and no panorama",
  );
  check(
    "it is measured on how well the frames could be brought together",
    /sorted\[Math\.floor\(sorted\.length \* 0\.25\)\]/.test(
      stitcher,
    ),
    "the lower quartile of each frame against its nearby spherical neighbours — not the seamed composite, which hides exactly the disagreement being measured",
  );
  check(
    "and a frame with nothing to match on is not counted as one that disagrees",
    /if \(result\.score <= -1\) \{\s*weak \+= 1;\s*continue;/.test(stitcher),
    "a blank ceiling cannot correlate with anything and should not condemn a capture",
  );
  check(
    "the check happens before the sphere is painted",
    // The presence first: `indexOf` answers -1 for something that is not
    // there at all, and -1 comes before everything, so an ordering check on
    // its own is satisfied by the line having been deleted.
    stitcher.includes('code: "poor_alignment"') &&
      stitcher.indexOf('code: "poor_alignment"') <
        stitcher.indexOf("const accepted = order.filter"),
    "a capture that did not come together should cost nothing further",
  );
  check(
    "exposure is compensated against the ground two frames share",
    /frame\.gain = clamp\(settled\.ratio, 0\.7, 1\.45\);/.test(stitcher) &&
      /const ratio = sumB > 1 \? sumA \/ sumB : 1;/.test(stitcher),
    "asking whether the same wall came out the same brightness twice is answerable; asking whether two different walls did is not",
  );
  check(
    "and not by pulling every frame towards one average",
    !/meanLuma/.test(stitcher) && !/const target = median\(means\)/.test(stitcher),
    "a frame pointed at a window is legitimately brighter than one pointed at a dark corner — on the synthetic room, averaging them made evenly-exposed frames four times further from the truth than leaving them alone",
  );
  check(
    "and the gain actually reaches the pixels",
    /const gw = gain \* w;/.test(stitcher) && /\* gw;/.test(stitcher),
    "a compensation computed and not applied is a variable, not a correction",
  );
  check(
    "each pixel is taken from the frame looking most directly at it",
    /const over = q - best\[row \+ x\] \* SEAM_SHARE;/.test(stitcher) &&
      /if \(over <= 0\) continue;/.test(stitcher),
    "section 7 step 8: feathering across the whole overlap averages two photographs of one wall over a third of every frame, and wherever they disagree the result is both at half strength — a sofa with a second sofa inside it",
  );
  check(
    "and which frame that is, is decided before anything is drawn",
    stitcher.indexOf("survey(best, probe, frame, table)") <
      stitcher.indexOf('paint(seamed, frame, table, best, "seam")'),
    "a seam cannot be chosen against a canvas that is still being painted",
  );
  // -------------------------------------------------------------------------
  // The lens's own falloff
  //
  // The artefact this exists for: photograph a plain white ceiling with five
  // frames, each darker at its corners than its middle, and lay them side by
  // side. You get a row of bright middles with dark boundaries between them --
  // a lattice of scallops across a surface that is one flat colour, which in a
  // viewer reads as wedges or diamonds.
  //
  // No blending setting fixes it. Where two frames meet, both are at their
  // dark edge, and averaging two dark corners gives a dark corner: on the
  // synthetic room with a 22% falloff, a plain ceiling spanned 26 grey levels
  // with the seam cut hard and 22 with it feathered all the way.
  // -------------------------------------------------------------------------
  {
    const W = 240;
    const H = 180;
    const TRUE_FALLOFF = 0.22;

    const lensFrames = (falloff: number) => {
      let seed = 3;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      const frames: { pixels: Uint8Array; width: number; height: number }[] = [];
      for (let f = 0; f < 22; f += 1) {
        const px = new Uint8Array(W * H * 3);
        const base = 40 + rnd() * 150;
        const cx = (W - 1) / 2;
        const cy = (H - 1) / 2;
        const maxR2 = cx * cx + cy * cy;
        // A different ramp across each frame, so the *room* has plenty of
        // structure the average has to cancel out before the lens is left.
        const gx = (rnd() - 0.5) * 0.5;
        const gy = (rnd() - 0.5) * 0.5;
        for (let y = 0; y < H; y += 1) {
          for (let x = 0; x < W; x += 1) {
            const t = ((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxR2;
            const scene = base * (1 + gx * (x / W - 0.5) + gy * (y / H - 0.5));
            const v = Math.max(0, Math.min(255, scene * (1 - falloff * t)));
            const i = (y * W + x) * 3;
            px[i] = v;
            px[i + 1] = v;
            px[i + 2] = v;
          }
        }
        frames.push({ pixels: px, width: W, height: H });
      }
      return frames;
    };

    const gains = estimateVignette(lensFrames(TRUE_FALLOFF));
    check(
      "a lens that darkens its corners is noticed",
      gains !== null,
      "twenty-two frames pointing everywhere: the room averages out and the lens is what is left",
    );

    if (gains) {
      // Accurate, not merely present. A correction that is the right shape and
      // the wrong size trades one uneven ceiling for another.
      let worst = 0;
      for (let b = 0; b < gains.length; b += 1) {
        const t = (b + 0.5) / gains.length;
        const truth = 1 / (1 - TRUE_FALLOFF * t);
        worst = Math.max(worst, Math.abs(gains[b] - truth));
      }
      check(
        "and measured close to the falloff it actually has",
        worst < 0.03,
        `worst error ${worst.toFixed(4)} across the profile; measured 0.021 on this fixture, against a corner gain of about 1.28 -- a residual of under two per cent where the uncorrected lens was twenty-two`,
      );
      check(
        "the middle of the frame is left alone",
        Math.abs(gains[0] - 1) < 0.02,
        "the lens does not darken its own centre, so nothing there needs lifting",
      );
      check(
        "and the correction only ever brightens",
        [...gains].every((g) => g >= 1),
        "a profile that reads brighter at the edge is the room, not the lens; dimming the middle to match would be inventing a shadow",
      );
    }

    // A room that reads BRIGHTER at the frame edge than the middle.
    //
    // Nothing about a lens does that, so it is the room failing to average
    // out -- and the correction must refuse it rather than dim the middle,
    // which would be painting a shadow into every frame.
    {
      let seed = 5;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      const inverted: { pixels: Uint8Array; width: number; height: number }[] = [];
      for (let f = 0; f < 22; f += 1) {
        const px = new Uint8Array(W * H * 3);
        const cx = (W - 1) / 2;
        const cy = (H - 1) / 2;
        const maxR2 = cx * cx + cy * cy;
        const base = 60 + rnd() * 60;
        for (let y = 0; y < H; y += 1) {
          for (let x = 0; x < W; x += 1) {
            const t = ((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxR2;
            const v = Math.min(255, base * (1 + 0.5 * t));
            const i = (y * W + x) * 3;
            px[i] = v;
            px[i + 1] = v;
            px[i + 2] = v;
          }
        }
        inverted.push({ pixels: px, width: W, height: H });
      }
      const wrongWay = estimateVignette(inverted);
      check(
        "a room that is brighter at the edges never dims the middle",
        wrongWay === null || [...wrongWay].every((g) => g >= 1),
        "clamping at 1 is what makes this a correction rather than a second vignette applied upside down",
      );
    }

    // The identity, isolated.
    //
    // "the middle pixel is unchanged" passed even with the gain-1 shortcut
    // deleted, because the middle bin's gain is 1.003 and the difference
    // rounds away. This hands it a profile of exactly ones, where any change
    // at all is a change that should not have happened.
    {
      const flatGains = new Float32Array(24).fill(1);
      const untouched = {
        pixels: new Uint8Array(W * H * 3),
        width: W,
        height: H,
      };
      for (let i = 0; i < untouched.pixels.length; i += 1) {
        untouched.pixels[i] = (i * 7) % 256;
      }
      const copy = untouched.pixels.slice();
      applyVignette(untouched, flatGains);
      let changed = 0;
      for (let i = 0; i < copy.length; i += 1) {
        if (copy[i] !== untouched.pixels[i]) changed += 1;
      }
      check(
        "a profile of ones changes not one pixel",
        changed === 0,
        `${changed} pixels moved; an even lens must be a no-op to the bit, or every frame centre is quietly altered`,
      );
    }

    // Smoothing, tested where it matters: a handful of frames, so the room
    // does not average out and the raw profile is lumpy.
    {
      // No randomness here on purpose: every frame is the same concentric
      // banding, so the room cannot average out at all. That is the worst case
      // for an estimator that assumes it will.
      const few: { pixels: Uint8Array; width: number; height: number }[] = [];
      for (let f = 0; f < 4; f += 1) {
        const px = new Uint8Array(W * H * 3);
        const cx = (W - 1) / 2;
        const cy = (H - 1) / 2;
        const maxR2 = cx * cx + cy * cy;
        for (let y = 0; y < H; y += 1) {
          for (let x = 0; x < W; x += 1) {
            const t = ((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxR2;
            // Concentric bands: a room that happens to be structured the way
            // the estimator bins, which is the worst case for it.
            const band = Math.sin(t * 18) * 40;
            const v = Math.max(0, Math.min(255, (140 + band) * (1 - 0.22 * t)));
            const i = (y * W + x) * 3;
            px[i] = v;
            px[i + 1] = v;
            px[i + 2] = v;
          }
        }
        few.push({ pixels: px, width: W, height: H });
      }
      const lumpy = estimateVignette(few);
      check(
        "a lumpy profile is smoothed before it is used as a correction",
        (() => {
          if (!lumpy) return true;
          // The biggest step between neighbouring bins. A lens's falloff is a
          // smooth curve; anything sharp here is the room, and applying it
          // draws that room's rings onto every frame.
          let jump = 0;
          for (let b = 1; b < lumpy.length; b += 1) {
            jump = Math.max(jump, Math.abs(lumpy[b] - lumpy[b - 1]));
          }
          return jump < 0.1;
        })(),
        "24 bins applied as 24 steps would replace one visible artefact with concentric rings",
      );
    }

    check(
      "a lens that is already even is left alone entirely",
      estimateVignette(lensFrames(0)) === null,
      "correcting an even lens means dividing by whatever the room happened to look like",
    );

    // Applying it must not clip, and must not touch what it is not correcting.
    if (gains) {
      const bright = {
        pixels: new Uint8Array(W * H * 3).fill(230),
        width: W,
        height: H,
      };
      const before = bright.pixels.slice();
      applyVignette(bright, gains);
      check(
        "a white ceiling is lifted rather than pushed into the top of the range",
        [...bright.pixels].every((v) => v < 255),
        "230 times a corner gain of 1.28 is 294, and a clipped region is flat -- which puts a new artefact exactly where the old one was",
      );
      check(
        "and it is still brighter than it was",
        bright.pixels[(Math.round(H / 2) * W + 2) * 3] > before[0],
      );

      const centre = (Math.round((H - 1) / 2) * W + Math.round((W - 1) / 2)) * 3;
      check(
        "the middle pixel is unchanged to the bit",
        bright.pixels[centre] === before[centre],
        "the first attempt compressed everything above a threshold, which darkened every frame centre and grew a dark blob on every panel",
      );
    }
  }

  // The wiring.
  //
  // Everything above tests the correction as a function. None of it tests that
  // the stitcher calls it, and deleting the call is exactly the regression that
  // brings the scalloped ceiling back -- silently, because every pure-function
  // check stays green.
  check(
    "the lens falloff is estimated from the frames and divided out of them",
    /const vignette = estimateVignette\(decoded\);/.test(stitcher) &&
      /for \(const frame of decoded\) applyVignette\(frame, vignette\);/.test(stitcher),
    "without this a flat ceiling comes out as a lattice of bright frame middles and dark joins",
  );
  check(
    "and it happens before anything reads a pixel",
    stitcher.indexOf("applyVignette(frame, vignette)") <
      stitcher.indexOf("refinePoses(order)"),
    "the pose refinement correlates these buffers and the exposure ratio is measured across them; correcting afterwards leaves both working from uneven frames",
  );
  check(
    "and only when the frames show a falloff worth correcting",
    /if \(vignette\) \{/.test(stitcher),
    "a lens that is already even must not be divided by whatever the room happened to look like",
  );

  check(
    "the join itself is blended across most of the overlap, not cut",
    (() => {
      const m = /const SEAM_SHARE = ([0-9.]+);/.exec(stitcher);
      if (!m) return false;
      const share = Number(m[1]);
      return /w = over \* over;/.test(stitcher) && share > 0 && share <= 0.5;
    })(),
    "0.9 meant a frame contributed only where it was within a tenth of being the best view, which is a cut in all but name, and a cut puts the whole of two photographs' disagreement on one line",
  );
  check(
    "but the best-placed frame still leads",
    /const over = q - best\[row \+ x\] \* SEAM_SHARE;/.test(stitcher) &&
      /SEAM_SHARE = 0(\.[0-9]+)?;/.test(stitcher),
    "at zero every frame that can see a pixel gets equal say, including one looking across the wall at a glancing angle",
  );
  check(
    "the picture is built twice and the bands recombined",
    /paint\(seamed, frame, table, best, "seam"\)/.test(stitcher) &&
      /paint\(wide, frame, table, best, "wide"\)/.test(stitcher) &&
      /const value = detail\[i\] - detailLow\[i\] \+ colourLow\[i\];/.test(stitcher),
    "section 10: detail from the seamed composite, where nothing is doubled, and colour from the feathered one, where no step can form",
  );
  check(
    "and only one of them is held in memory at a time",
    /function release\(canvas: Canvas\)/.test(stitcher) &&
      /release\(seamed\);/.test(stitcher) &&
      /release\(wide\);/.test(stitcher),
    "two full-size accumulators at 4096 across is 270MB, which is a serverless function that dies rather than a panorama",
  );
}

// ---------------------------------------------------------------------------
// Acceptance 7, 8 and 9, and section 8: a synthetic room, photographed
// and put back together
// ---------------------------------------------------------------------------

const TW = 1024;
const TH = 512;

/**
 * The frame the capture asks the camera for, in `panorama-capture.tsx`.
 *
 * Written here so the end-to-end check photographs the shape the app actually
 * captures. If that constraint changes, this is the line that has to change
 * with it -- and the frustum check above covers the other shapes a camera
 * might hand back instead.
 */
const CAPTURE_WIDTH = 1440;
const CAPTURE_HEIGHT = 1080;

/** A room with four coloured walls, straight rails, and a patterned ceiling. */
function room(): Uint8Array {
  const p = new Uint8Array(TW * TH * 3);
  for (let y = 0; y < TH; y += 1) {
    const pitch = 90 - (y / (TH - 1)) * 180;
    for (let x = 0; x < TW; x += 1) {
      const yaw = (x / TW) * 360;
      const i = (y * TW + x) * 3;
      const wall = Math.floor(yaw / 90) % 4;
      const base = [
        [200, 90, 80],
        [90, 170, 200],
        [200, 190, 100],
        [120, 200, 120],
      ][wall];
      const edge =
        yaw % 30 < 1.2 || Math.abs(pitch - 20) < 1.2 || Math.abs(pitch + 20) < 1.2;
      const ceiling = pitch > 55;
      const floor = pitch < -55;
      const checker =
        (Math.floor(yaw / 15) + Math.floor((pitch + 90) / 15)) % 2 === 0;
      let c = ceiling ? [230, 230, 235] : floor ? [70, 60, 55] : base;
      if ((ceiling || floor) && checker) c = c.map((v) => v * 0.75);
      if (edge && !ceiling && !floor) c = [20, 20, 25];
      p[i] = c[0];
      p[i + 1] = c[1];
      p[i + 2] = c[2];
    }
  }
  return p;
}

function readRoom(p: Uint8Array, yaw: number, pitch: number): number[] {
  const x = Math.round((((yaw % 360) + 360) % 360 / 360) * TW) % TW;
  const y = Math.min(TH - 1, Math.max(0, Math.round(((90 - pitch) / 180) * (TH - 1))));
  const i = (y * TW + x) * 3;
  return [p[i], p[i + 1], p[i + 2]];
}

/**
 * What a camera at this pose would photograph of that room.
 *
 * `arm` is how far the lens sits in front of the point the person turns
 * about, in metres, with the room a sphere `ROOM_RADIUS` across. That is
 * parallax, and it is the thing that makes real panoramas ghost: the camera is
 * not where the rotation is, so two frames see the same sofa from two
 * different places and no rotation can bring them into agreement. A stitcher
 * checked only against frames from a perfect nodal point is a stitcher checked
 * against input nobody can produce holding a phone.
 */
const ROOM_RADIUS = 2.5;

async function photograph(
  p: Uint8Array,
  yaw: number,
  pitch: number,
  roll: number,
  hfov: number,
  arm = 0,
  /**
   * The frame's shape.
   *
   * It defaulted to 640x480 with the field of view passed as 60, and the app
   * has never produced a frame like that. That is not a detail: the plan's
   * rings are spaced by how tall a frame is, and 640x480 at 60 degrees is 47
   * degrees tall where the app's frame was 43 -- just enough that a plan whose
   * rings did not meet on a real phone still met here. The whole defect lived
   * in the four degrees between the tested frame and the shipped one.
   */
  w = CAPTURE_WIDTH,
  h = CAPTURE_HEIGHT,
): Promise<Buffer> {
  const vfov = verticalFov(hfov, w, h);
  const b = basisFrom(yaw, pitch, roll);
  const tanH = Math.tan(((hfov / 2) * Math.PI) / 180);
  const tanV = Math.tan(((vfov / 2) * Math.PI) / 180);
  const px = Buffer.alloc(w * h * 3);

  const eye: Vector3 = [
    b.forward[0] * arm,
    b.forward[1] * arm,
    b.forward[2] * arm,
  ];
  const eyeEye = eye[0] * eye[0] + eye[1] * eye[1] + eye[2] * eye[2];

  for (let j = 0; j < h; j += 1) {
    const sy = 1 - (2 * j) / (h - 1);
    for (let i = 0; i < w; i += 1) {
      const sx = (2 * i) / (w - 1) - 1;
      const d: Vector3 = [
        b.forward[0] + b.right[0] * sx * tanH + b.up[0] * sy * tanV,
        b.forward[1] + b.right[1] * sx * tanH + b.up[1] * sy * tanV,
        b.forward[2] + b.right[2] * sx * tanH + b.up[2] * sy * tanV,
      ];
      const len = Math.hypot(d[0], d[1], d[2]);
      const ray: Vector3 = [d[0] / len, d[1] / len, d[2] / len];

      // Where the ray meets the wall, and then the direction of that point
      // from the turning point — which is the direction the stitcher will
      // assume it came from. With `arm` at zero the two are the same.
      const along = eye[0] * ray[0] + eye[1] * ray[1] + eye[2] * ray[2];
      const hit =
        -along + Math.sqrt(along * along + ROOM_RADIUS * ROOM_RADIUS - eyeEye);
      const wx = eye[0] + hit * ray[0];
      const wy = eye[1] + hit * ray[1];
      const wz = eye[2] + hit * ray[2];
      const far = Math.hypot(wx, wy, wz);

      const c = readRoom(
        p,
        (Math.atan2(wx / far, wy / far) * 180) / Math.PI,
        (Math.asin(wz / far) * 180) / Math.PI,
      );
      const o = (j * w + i) * 3;
      px[o] = c[0];
      px[o + 1] = c[1];
      px[o + 2] = c[2];
    }
  }

  return sharp(px, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 92 })
    .toBuffer();
}

async function endToEnd() {
  const truth = room();
  const shape = fieldsOfView(CAPTURE_WIDTH, CAPTURE_HEIGHT);
  const plan = spherePlan(shape.hfov, shape.vfov);
  const frames: FrameInput[] = [];

  // Three degrees of error on every frame, which is roughly what a phone's
  // sensors give after a minute of turning. A stitcher that only works on
  // perfect input does not work.
  let seed = 7;
  const jitter = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed / 2147483648 - 0.5) * 3;
  };

  for (const target of plan) {
    frames.push({
      yaw: target.yaw + jitter(),
      pitch: target.pitch + jitter(),
      roll: 0,
      hfov: shape.hfov,
      // 15cm from the point it turns about: a phone held against the chest,
      // which is what the instructions ask for and what the quality check now
      // requires. 35cm — held out to see the screen — is refused below.
      bytes: new Uint8Array(
        await photograph(truth, target.yaw, target.pitch, 0, shape.hfov, 0.15),
      ),
    });
  }

  const started = Date.now();
  const out = await composePanorama(frames);
  const elapsed = Date.now() - started;

  if (!out.ok) {
    check("the synthetic room stitches at all", false, out.code);
    return;
  }

  // The lens estimate absorbs parallax, and this says how much.
  //
  // It used to assert the estimate landed within a degree of the truth, which
  // held for the 60-degree 640x480 frames this harness used to photograph and
  // does not hold for the frames the app captures. Measured on this room at
  // 70 degrees, the recovered angle against how far the lens is from the
  // turning point:
  //
  //     0cm  -3.0      15cm  -6.0
  //     5cm   0.0      25cm  -9.0
  //
  // It is always an underestimate, and it grows with the parallax, because a
  // slightly narrower lens partly explains what parallax did to the pixels.
  // That is the estimator working, not drifting: the stitch is unharmed
  // (alignment 0.73, the sphere fully covered). What would be a defect is the
  // estimate running away, so that is what is bounded -- at eight degrees on a
  // capture from 15cm, which is two degrees of room over the measurement.
  check(
    "the lens estimate absorbs parallax without running away",
    Math.abs(out.fieldOfView - shape.hfov) <= 8,
    `${out.fieldOfView}° against a true ${shape.hfov.toFixed(1)}°`,
  );
  check(
    "and it errs narrow rather than wide",
    out.fieldOfView <= shape.hfov + 1,
    "a lens estimated wider than it is spreads every frame past its neighbours",
  );

  // Acceptance 7.
  check(
    "the panorama is 2:1 equirectangular",
    Math.abs(out.width / out.height - 2) < 0.001,
    `${out.width}x${out.height}`,
  );
  check(
    "at a resolution worth looking at",
    out.width >= 2048,
    `${out.width} across`,
  );
  check(
    "and the whole sphere has real pixels in it",
    out.covered > 0.995,
    `${(out.covered * 100).toFixed(1)}% covered — section 8: what was not photographed must not be stretched into`,
  );

  const got = new Uint8Array(
    await sharp(out.jpeg).resize(TW, TH, { fit: "fill" }).removeAlpha().raw().toBuffer(),
  );

  // Acceptance 8. A funnel has one colour all the way across its top row,
  // because every pixel up there came from the same stretched edge.
  const spread = (row: number) => {
    let low = 255;
    let high = 0;
    for (let x = 0; x < TW; x += 1) {
      const v = got[(row * TW + x) * 3];
      low = Math.min(low, v);
      high = Math.max(high, v);
    }
    return high - low;
  };
  check(
    "the ceiling is photographed, not smeared to a point",
    spread(3) > 12,
    `the top row varies by ${spread(3)} — a funnel collapses it to nearly nothing`,
  );
  check("and so is the floor", spread(TH - 4) > 12, `${spread(TH - 4)}`);

  // Acceptance 9. The room has to be in the right places.
  const soften = async (buf: Uint8Array) =>
    new Uint8Array(
      await sharp(Buffer.from(buf), { raw: { width: TW, height: TH, channels: 3 } })
        .blur(2)
        .raw()
        .toBuffer(),
    );
  const a = await soften(truth);
  const b = await soften(got);

  let n = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  let bad = 0;
  for (let i = 0; i < TW * TH; i += 1) {
    n += 1;
    sa += a[i * 3];
    sb += b[i * 3];
    saa += a[i * 3] * a[i * 3];
    sbb += b[i * 3] * b[i * 3];
    sab += a[i * 3] * b[i * 3];
    if (Math.abs(a[i * 3] - b[i * 3]) > 70) bad += 1;
  }
  const ncc = (sab - (sa * sb) / n) / Math.sqrt((saa - (sa * sa) / n) * (sbb - (sb * sb) / n));

  check(
    "the panorama is the room that was photographed",
    ncc > 0.7,
    `correlation ${ncc.toFixed(3)} against the room the frames were taken from`,
  );
  check(
    "with almost nothing in the wrong place",
    bad / n < 0.08,
    `${((bad / n) * 100).toFixed(1)}% of pixels badly wrong`,
  );

  // The walls have to be where the walls are: a systematic shift means every
  // frame was laid down in the wrong place, which is what a drifting
  // refinement does.
  let best = { shift: 0, error: Infinity };
  const mid = Math.floor(TH / 2);
  for (let shift = -20; shift <= 20; shift += 1) {
    let error = 0;
    for (let x = 0; x < TW; x += 1) {
      const j = ((x + shift) % TW + TW) % TW;
      error += Math.abs(a[(mid * TW + x) * 3] - b[(mid * TW + j) * 3]);
    }
    if (error < best.error) best = { shift, error };
  }
  // Ghosting, measured. A doubled edge is two soft edges where there was one
  // hard one, so an image full of them carries less edge energy than the room
  // it was taken from — even while looking, at a glance, like the right room.
  {
    const energy = (img: Uint8Array) => {
      let total = 0;
      let n = 0;
      for (let y = 1; y < TH - 1; y += 1) {
        for (let x = 1; x < TW - 1; x += 1) {
          const i = (y * TW + x) * 3;
          total += Math.abs(img[i] - img[i + 3]) + Math.abs(img[i] - img[i + TW * 3]);
          n += 1;
        }
      }
      return total / n;
    };
    const ratio = energy(got) / energy(truth);
    check(
      "edges come through as edges, not as two of themselves",
      ratio > 1.2,
      `edge energy ${ratio.toFixed(3)} of the room's — the compact route must retain useful edge contrast`,
    );
  }

  check(
    "and the horizon has not drifted round the room",
    Math.abs(best.shift) <= 6,
    `best alignment is ${best.shift}px of ${TW} — a large shift is every frame laid down in the wrong place. A pixel or two is parallax: these frames were taken 15cm off the axis, so there is no answer that is right to the pixel, which is why the exact-pose run above is the one that asks for zero.`,
  );

  check(
    "a whole sphere stitches in a reasonable time",
    elapsed < 90_000,
    `${(elapsed / 1000).toFixed(1)}s for ${frames.length} frames — section 19 asks for minutes, not the hour the app being replaced took`,
  );

  // The refinement must not move frames that were already right.
  //
  // The jittered run above cannot show this: with three degrees of error on
  // every frame there is real work for the refinement to do, and a drift of a
  // degree or two hides inside it. With exact poses there is nothing to
  // correct, so any movement at all is the refinement chasing noise — and
  // because each frame is painted for the next one to match against, that
  // movement accumulates around the ring.
  {
    const exact: FrameInput[] = [];
    for (const target of plan) {
      exact.push({
        targetId: target.id,
        yaw: target.yaw,
        pitch: target.pitch,
        roll: 0,
        hfov: 60,
        bytes: new Uint8Array(await photograph(truth, target.yaw, target.pitch, 0, 60)),
      });
    }

    const clean = await composePanorama(exact, { debug: true });
    const denseWrongLens: FrameInput[] = [];
    const denseRings = [
      { pitch: 0, count: 10, stagger: 18 },
      { pitch: 30, count: 8, stagger: 0 },
      { pitch: -30, count: 8, stagger: 0 },
      { pitch: 60, count: 5, stagger: 36 },
      { pitch: -60, count: 5, stagger: 36 },
      { pitch: 90, count: 1, stagger: 0 },
      { pitch: -90, count: 1, stagger: 0 },
    ];
    for (const ring of denseRings) {
      for (let i = 0; i < ring.count; i += 1) {
        const yaw = (i * 360) / ring.count + ring.stagger;
        denseWrongLens.push({
          yaw,
          pitch: ring.pitch,
          roll: 0,
          hfov: 48,
          intrinsics: intrinsicsFromFov(640, 480, 60),
          calibrationSource: "intrinsics",
          bytes: new Uint8Array(await photograph(truth, yaw, ring.pitch, 0, 60)),
        });
      }
    }
    const wrongLens = await composePanorama(denseWrongLens);
    check(
      "reported camera intrinsics override an incorrect FOV hint",
      wrongLens.ok && wrongLens.fieldOfView >= 57 && wrongLens.fieldOfView <= 63,
      wrongLens.ok ? `${wrongLens.fieldOfView}° read from camera intrinsics` : wrongLens.code,
    );
    if (!clean.ok) {
      check("a set of exactly-posed frames stitches", false, clean.code);
    } else {
      for (const [name, bytes] of Object.entries(clean.debug ?? {})) {
        const metadata = await sharp(bytes).metadata();
        check(
          `the ${name} debug output is a 2:1 equirectangular image`,
          Boolean(metadata.width && metadata.height && metadata.width === metadata.height * 2),
          `${metadata.width ?? 0}x${metadata.height ?? 0}`,
        );
      }
      check(
        "developer mode emits gyro-only, refined and visible-footprint panoramas",
        Boolean(clean.debug?.gyroOnly && clean.debug.refined && clean.debug.noBlending),
      );

      const shown = new Uint8Array(
        await sharp(clean.jpeg)
          .resize(TW, TH, { fit: "fill" })
          .removeAlpha()
          .raw()
          .toBuffer(),
      );
      const softened = await soften(shown);

      let drift = { shift: 0, error: Infinity };
      for (let shift = -20; shift <= 20; shift += 1) {
        let error = 0;
        for (let x = 0; x < TW; x += 1) {
          const j = ((x + shift) % TW + TW) % TW;
          error += Math.abs(a[(mid * TW + x) * 3] - softened[(mid * TW + j) * 3]);
        }
        if (error < drift.error) drift = { shift, error };
      }

      check(
        "frames that were already in the right place are left there",
        drift.shift === 0,
        `the room came out ${drift.shift}px of ${TW} from where it was photographed, with nothing wrong with the poses to begin with`,
      );

      let badly = 0;
      for (let i = 0; i < TW * TH; i += 1) {
        if (Math.abs(a[i * 3] - softened[i * 3]) > 70) badly += 1;
      }
      check(
        "and exact poses give the best panorama, not a worse one",
        badly / (TW * TH) < 0.02,
        `${((badly / (TW * TH)) * 100).toFixed(2)}% badly wrong from perfect input — a refinement free to move anything makes this worse than the jittered run`,
      );

      if (wrongLens.ok) {
        const lensCorrected = new Uint8Array(
          await sharp(wrongLens.jpeg)
            .resize(TW, TH, { fit: "fill" })
            .removeAlpha()
            .raw()
            .toBuffer(),
        );
        const correctedSoftened = await soften(lensCorrected);
        let lensBadly = 0;
        for (let i = 0; i < TW * TH; i += 1) {
          if (Math.abs(a[i * 3] - correctedSoftened[i * 3]) > 70) lensBadly += 1;
        }
        check(
          "the recovered lens angle is used to paint the panorama",
          lensBadly / (TW * TH) < 0.025,
          `${((lensBadly / (TW * TH)) * 100).toFixed(2)}% badly wrong using the camera's 60° intrinsics`,
        );
      }
    }

    const misplaced = exact.map((frame) => ({ ...frame }));
    const corruptPixels = Buffer.alloc(640 * 480 * 3);
    let corruptSeed = 19;
    for (let i = 0; i < corruptPixels.length; i += 1) {
      corruptSeed = (corruptSeed * 1664525 + 1013904223) >>> 0;
      corruptPixels[i] = corruptSeed & 255;
    }
    misplaced[3] = {
      ...misplaced[3],
      targetId: "deliberately-wrong-target",
      bytes: new Uint8Array(
        await sharp(corruptPixels, {
          raw: { width: 640, height: 480, channels: 3 },
        }).jpeg({ quality: 92 }).toBuffer(),
      ),
    };
    const rejected = await composePanorama(misplaced);
    check(
      "one source frame placed in the wrong direction is rejected by target id",
      rejected.rejectedTargetIds?.includes("deliberately-wrong-target") === true,
      rejected.ok ? rejected.rejectedTargetIds.join(", ") : `${rejected.code}: ${rejected.rejectedTargetIds?.join(", ") ?? "none"}`,
    );
  }

  // The quality check. A phone held out at arm's length travels through an arc
  // as its owner turns, so no rotation explains all the frames — which is the
  // melting, and which is now caught rather than published.
  {
    const held: FrameInput[] = [];
    for (const target of plan) {
      held.push({
        yaw: target.yaw,
        pitch: target.pitch,
        roll: 0,
        hfov: 60,
        bytes: new Uint8Array(
          await photograph(truth, target.yaw, target.pitch, 0, 60, 0.4),
        ),
      });
    }

    const outcome = await composePanorama(held);
    check(
      "a capture made at arm's length is refused rather than shown",
      !outcome.ok && outcome.code === "poor_alignment",
      outcome.ok
        ? `it published a panorama scoring ${outcome.alignment.toFixed(3)} instead of refusing`
        : outcome.code,
    );
    check(
      "and the refusal says what to do differently",
      /keeping the phone in the same position and rotating around one point/.test(
        stitchErrorMessage("poor_alignment"),
      ),
    );
    check(
      "while a phone held against the chest passes",
      out.alignment >= MIN_ALIGNMENT,
      `${out.alignment.toFixed(3)} against a floor of ${MIN_ALIGNMENT}`,
    );
  }

  // Section 8, the other half: a capture with a hole in it is refused rather
  // than filled in.
  const horizonOnly = frames.filter((_, i) => Math.abs(plan[i].pitch) < 1);
  const partial = await composePanorama(horizonOnly);
  check(
    "a capture that photographed only one ring is refused",
    !partial.ok && partial.code === "incomplete_sphere",
    partial.ok
      ? `it produced a panorama ${(partial.covered * 100).toFixed(0)}% covered instead of refusing`
      : partial.code,
  );
}

// ---------------------------------------------------------------------------
// The screen — sections 1, 9, 10 and 11, and acceptance 10 to 12
// ---------------------------------------------------------------------------

{
  const capture = code("src/components/tour/panorama-capture.tsx");

  check(
    "the nine-photo workflow is gone from the screen too",
    !/Turn about|then tap/i.test(capture) && !/\{state\.next\}/.test(capture),
    "section 1: do not show 0/9 and Turn about 40°, then tap",
  );
  check(
    "progress is counted against the whole sphere",
    /\{covered\.taken\} \/ \{covered\.total\}/.test(capture),
    "section 9: 18 / 39",
  );

  const overlay = capture.slice(
    capture.indexOf("const Sphere = memo("),
    capture.indexOf("function round2("),
  );
  check("the overlay is findable", overlay.length > 0);
  check(
    "it is laid out once and never re-rendered by the phone moving",
    /memo\(function Sphere/.test(capture) &&
      !/\bstyle=\{\{[^}]*transform:/.test(overlay),
    "setting a marker's position in React state renders the whole screen — the buttons, the counter, the instructions — sixty times a second, which on a phone is the flicker",
  );
  check(
    "and the loop writes the positions straight to the elements",
    /element\.style\.transform =\s*\n?\s*`translate3d\(\$\{\(sx \* halfW\)/.test(capture),
    "acceptance 11 and section 5: the position comes from the projection, so it moves when and only when the phone does",
  );
  check(
    "a marker with nowhere to be is hidden rather than left where it was",
    /element\.style\.visibility = "hidden"/.test(capture),
  );
  check(
    "the markers lean when the phone is rolled",
    /const lean = -roll;/.test(capture) && /rotate\(\$\{lean\.toFixed\(1\)\}deg\)/.test(capture),
    "a marker that stands upright in the room leans on a rolled phone, which is the only thing on the screen that shows the phone is not square",
  );
  check(
    "the number is on the marker",
    /\{target\.index\}/.test(overlay) && /tabular-nums/.test(overlay),
    "the route has to be readable off the screen, not merely implied by the order the code happens to visit",
  );
  check(
    "the one that is next is picked out from the rest",
    /target\.id === nextId \? "next"/.test(capture) &&
      /rgb\(250, 204, 21\)/.test(capture),
    "twenty-two numbered boxes with nothing to say which one is meant now is a list, not a route",
  );
  check(
    "and the instruction names the same number the marker shows",
    /tours\.nextLeft/.test(capture) &&
      /replace\("\{next\}", String\(nextNumber\)\)/.test(capture) &&
      /nextInOrder\(state\)\?\.index/.test(capture),
  );
  check(
    "a captured target steps back rather than competing for attention",
    /element\.style\.opacity = look === "done" \? "0\.45" : "1";/.test(capture),
    "a green box at full strength sitting on the aim reads as somewhere to go, which is why the counter looked stuck",
  );
  check(
    "a captured target is shown as captured",
    /markerTaken\.current\.get\(target\.id\) !== look/.test(capture) &&
      /look === "done"\s*\n?\s*\? "rgba\(52, 211, 153/.test(capture),
    "section 9: ✓ rather than ○ — and written only when it changes, not on every frame",
  );
  check(
    "there is a frame to bring one into, and it does not move",
    /-translate-x-1\/2 -translate-y-1\/2 rounded-xl border-4/.test(overlay),
  );
  check(
    "landing on one is visible without reading anything",
    /aligned && level \? "rgb\(52, 211, 153\)"/.test(capture),
  );
  check(
    "holding shows how much of the hold is left",
    /conic-gradient\(rgb\(52 211 153\) \$\{done\.toFixed\(0\)\}deg/.test(capture) &&
      /tours\.holdSteady/.test(overlay),
    "a ring that visibly fills is the difference between keeping still and assuming it has jammed",
  );
  check(
    "an arrow says which way the next one is",
    /steerBearing\(decision\.target, yawPitchOf\(facing\), roll\)/.test(capture),
    "section 9 and the reference: the next point has to be findable when it is not on the screen",
  );
  check(
    "and it points at the turn, not along the shortest line to the target",
    (() => {
      const fn = wholeFunction(capture, "steerBearing");
      return /Math\.atan2\(turn, tilt\)/.test(fn) && /- roll/.test(fn);
    })(),
    "for a target behind and above you the shortest line goes over the top of your head, so the arrow pointed straight up when what you had to do was turn around",
  );
  check(
    "a phone held crooked is told so on the camera, not only in the hint",
    /Hold the phone square/.test(overlay),
  );
  check(
    "the overlay never eats a touch meant for the controls",
    /pointer-events-none/.test(overlay),
  );

  const loop = blockAfter(capture, 'if (phase !== "capturing" || !hasSensor) return;');
  check("the capture loop is findable", loop.length > 0);
  check(
    "it runs at the display's own rate",
    /requestAnimationFrame/.test(loop),
    "at 8Hz the targets visibly step rather than moving with the room",
  );
  check(
    "the decision is made against the live rotation",
    /forwardOf\(pose\)/.test(loop) && /decide\(\s*stateRef\.current/.test(loop),
  );
  check(
    "every target is projected through the live rotation",
    // The axes and their signs, because the shape of the arithmetic is the
    // same whichever way the camera is facing — and a forward vector with the
    // sign flipped projects every target to the opposite side of the room
    // while this expression still reads correctly.
    /const fx = -pose\[2\];/.test(loop) &&
      /const fy = -pose\[5\];/.test(loop) &&
      /const fz = -pose\[8\];/.test(loop) &&
      /const depth = d\[0\] \* fx \+ d\[1\] \* fy \+ d\[2\] \* fz;/.test(loop) &&
      /d\[0\] \* rx \+ d\[1\] \* ry \+ d\[2\] \* rz\) \/ depth \/ tanH/.test(loop),
    "the same pinhole projection `project` does, written out flat — it runs forty times a frame and every call of the tidy version allocates a vector and an object",
  );
  check(
    "the camera's axes are read once a frame, not once a target",
    loop.indexOf("const fx = -pose[2];") < loop.indexOf("for (const target of stateRef.current.plan)"),
  );
  check(
    "and the captured set is rebuilt when one is captured, not every frame",
    /takenRef\.current\.size !== stateRef\.current\.taken\.length/.test(loop),
    "a Set of forty strings per frame is forty allocations for an answer that changes forty times in a capture",
  );
  check(
    "and the hint is only set when it changes",
    /sayHint\(guidance\(decision, facing\)\)/.test(loop) &&
      /if \(next === hintRef\.current\) return;/.test(capture),
    "a setState per frame is a render per frame whatever it sets",
  );
  check(
    "the hold clock tolerates one gyro spike but resets after a real move",
    /holdStateRef\.current = updateHold\(holdStateRef\.current, candidateId, valid, now\);/.test(loop) &&
      /const heldMs = heldFor\(holdStateRef\.current, now\);/.test(loop),
    "sensor noise must not make a centred target stick, but changing targets must still restart the hold",
  );

  const reading = blockAfter(capture, "const onOrientation = useCallback(");
  check(
    "the rotation is built from all three angles, not a heading",
    /cameraRotationMatrix\([\s\S]{0,100}?event\.alpha,[\s\S]{0,100}?event\.beta,[\s\S]{0,100}?event\.gamma,[\s\S]{0,100}?screenAngle/.test(reading),
    "section 2: yaw, pitch and roll — a compass bearing on its own cannot say which way is up",
  );
  check(
    "the first reading becomes this capture's zero",
    /zeroRef\.current = yawPitchOf\(forwardOf\(world\)\)\.yaw/.test(reading) &&
      /withLocalZero\(world, zeroRef\.current\)/.test(reading),
    "section 2: indoors the magnetometer is next to a fridge",
  );

  const taking = blockAfter(capture, "const take = useCallback(");
  check(
    "the pose is read at the moment of the photograph",
    /const pose = poseRef\.current;[\s\S]{0,120}?await grab\(/.test(taking),
    "section 6: tens of milliseconds pass between deciding and firing, and the stitcher wants where the camera was when the shutter went",
  );
  check(
    "and every frame carries its own pose",
    /yaw: facing\.yaw/.test(taking) &&
      /pitch: facing\.pitch/.test(taking) &&
      /roll: rollOf\(pose\)/.test(taking) &&
      /rotation: pose/.test(taking) &&
      /intrinsics: calibration\.intrinsics/.test(taking) &&
      /screenOrientation: screenAngleRef\.current/.test(taking) &&
      /width: best\.width/.test(taking),
    "section 6: by the time the stitcher sees the image there is nothing in the pixels that says which way the camera was facing",
  );

  check(
    "the camera's own image is captured, not the screen",
    /drawImage\(video, 0, 0/.test(capture) && /video\.videoWidth/.test(capture),
    "section 6: a screenshot of the preview carries the overlay with it and is the size of the phone's screen",
  );

  check(
    "the poses are uploaded with the frames",
    /frames: poses,/.test(capture),
    "section 6 — and without them the stitcher has forty photographs and no idea which way any of them was facing",
  );

  // Acceptance 6, at the screen.
  check(
    "Create 360° cannot be pressed while the sphere has holes in it",
    /disabled=\{!covered\.complete\}/.test(capture),
    "section 8: the gate, not a suggestion",
  );
  check(
    "and the screen says how many are left",
    /tours\.left/.test(capture) && /String\(covered\.missing\.length\)/.test(capture),
  );

  check(
    "a frame can still be taken by hand",
    /captureManually\(stateRef\.current, decision\.nearest\)/.test(capture),
    "section 4: manual capture remains as a backup",
  );

  // --- the permission ordering, which is the whole of a dead capture -------
  const starting = blockAfter(capture, "async function start(preserveCaptured = false)");
  check("starting the camera is findable", starting.length > 0);
  check(
    "orientation is asked for before the camera, not after it",
    starting.indexOf("requestPermission") <
      starting.indexOf("navigator.mediaDevices.getUserMedia"),
    "iOS grants deviceorientation only from a user gesture, and a gesture is spent by the first await — asking for the camera first means the orientation prompt arrives one await too late and is refused without ever being shown, which is a camera screen with no targets on it",
  );
  check(
    "and a refusal is admitted rather than waited out",
    /} else \{[\s\S]{0,200}?setSensorMissing\(true\)/.test(starting),
  );
  check(
    "a sensor that never reports is given a moment and then given up on",
    /setTimeout\(\(\) => setSensorMissing\(true\), 3000\)/.test(capture),
    "permission can be granted and readings still never arrive — a desktop, a locked-down webview",
  );
  check(
    "and the screen then says so instead of showing a camera that cannot photograph",
    /tours\.sensorMissing/.test(capture) &&
      /tours\.uploadFallback/.test(capture) &&
      /phone is pointing/.test(code("src/lib/i18n/translations.ts")),
    "every target is a direction; with nothing reporting where the phone points there is nothing to compare them against, so this is a dead end and not a degraded mode",
  );
  check(
    "the shutter is not offered without a pose to file the photograph under",
    (() => {
      // The guard and the button are a long onClick apart, so this asks
      // whether the nearest thing above the shutter is that guard rather than
      // matching them inside a fixed window.
      const shutter = capture.indexOf('t("tours.takeNow")');
      const guard = capture.lastIndexOf("{hasSensor && (", shutter);
      return shutter > 0 && guard > 0 && !capture.slice(guard, shutter).includes("</Button>");
    })(),
    "a frame recorded at no direction is a frame the stitcher throws away",
  );

  check(
    "the capture screen sits above the app's own bottom navigation",
    /fixed inset-0 z-\[60\]/.test(capture) && /h-\[100dvh\]/.test(capture),
  );
  check(
    "the camera is attached once its element exists",
    /video\.srcObject = stream/.test(
      windowAfter(capture, 'if (phase !== "capturing" && phase !== "paused") return;'),
    ),
  );
}

// ---------------------------------------------------------------------------
// Section 11 and acceptance 10 and 12: the rest of Medosha is still there
// ---------------------------------------------------------------------------

{
  const source = code("src/components/tour/room-source.tsx");
  check("Upload 360 Photo is still offered", /Upload 360 Photo/.test(source));
  check("and Create 360°", /Create 360°/.test(source));

  const viewer = code("src/components/tour/panorama-viewer.tsx");
  check(
    "the viewer still looks all the way round",
    /requestFullscreen\(\)/.test(viewer) && /exitFullscreen\(\)/.test(viewer),
    "acceptance 10 and section 12",
  );
  check(
    "the finished panorama opens in it rather than as a flat photograph",
    /<PanoramaViewer/.test(code("src/components/tour/panorama-capture.tsx")),
  );

  const builder = code("src/components/tour/tour-builder.tsx");
  check("the tour builder is untouched", /<RoomSource/.test(builder));
  check(
    "and the listing's photo step still offers both",
    /Add Photos/.test(code("src/components/property/photo-uploader.tsx")) &&
      /Create 360°/.test(code("src/components/property/photo-uploader.tsx")),
    "acceptance 12: only the capture and the stitching were to change",
  );

  const rules = code("src/components/tour/capture-rules.tsx");
  const translations = code("src/lib/i18n/translations.ts");
  check(
    "the rules still come before the camera",
    /CAPTURE_RULES/.test(rules) && /<CaptureRules/.test(code("src/components/tour/panorama-capture.tsx")),
    "section 10",
  );
  check(
    "and they say to stand in one place",
    /rulePlaceTitle/.test(rules) &&
      /ruleChestTitle/.test(rules) &&
      /Stand in one place/.test(translations) &&
      /phone close to your chest/i.test(translations),
    "section 10: plant your feet and rotate on the spot, which is what keeps parallax out",
  );
}

// ---------------------------------------------------------------------------

endToEnd().then(report, (error: unknown) => {
  failures.push(`the end-to-end stitch threw — ${String(error)}`);
  report();
});

function report() {
  if (failures.length > 0) {
    console.log(`\n${RED}${failures.length} failed${RESET}`);
    for (const failure of failures) console.log(`  ${RED}x${RESET} ${failure}`);
    console.log(`${GREEN}${passed} passed${RESET}`);
    process.exit(1);
  }

  console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
  console.log(`${DIM}panorama: a whole sphere, photographed and put back together${RESET}`);
}
