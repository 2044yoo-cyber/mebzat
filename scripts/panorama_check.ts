/**
 * 360° capture and stitching.
 *
 *   npx tsx scripts/panorama_check.ts
 *
 * The spherical geometry is written as pure functions over plain numbers
 * precisely so that it can be checked here — without a phone, a gyroscope, a
 * camera or a server. The last section photographs a synthetic room from
 * thirty-eight directions and stitches it back, which is the only check that
 * can tell a panorama from a funnel.
 *
 * Plain Node with type stripping; no test framework, in keeping with scripts/.
 */

import "./lib/allow-server-only.ts";

import { readFileSync } from "node:fs";

import sharp from "sharp";

import { composePanorama, type FrameInput } from "../src/lib/panorama/compose.ts";
import {
  ALIGN_TOLERANCE_DEGREES,
  ROLL_TOLERANCE_DEGREES,
  STEADY_DEGREES,
  STEADY_MS,
  captureManually,
  decide,
  frameName,
  frameWidthFor,
  guidance,
  isComplete,
  progress,
  record,
  rollError,
  startCapture,
} from "../src/lib/panorama/capture.ts";
import {
  ASSUMED_HFOV,
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
import { stitchErrorMessage } from "../src/lib/panorama/stitch.ts";

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
  const plan = spherePlan(ASSUMED_HFOV);
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
    "which is five rings and two poles",
    pitches.size === 7,
    [...pitches].sort((a, b) => b - a).join(", "),
  );

  check(
    "the horizon gets the most photographs",
    ringCount(0, ASSUMED_HFOV) > ringCount(30, ASSUMED_HFOV) &&
      ringCount(30, ASSUMED_HFOV) > ringCount(60, ASSUMED_HFOV),
    "a ring at 60° is half the circumference of the horizon and needs half the frames to cover it as well",
  );
  check(
    "a pole is one photograph",
    ringCount(90, ASSUMED_HFOV) === 1 && ringCount(-90, ASSUMED_HFOV) === 1,
  );
  check(
    "the horizon ring is the ten to twelve the brief asks for",
    ringCount(0, ASSUMED_HFOV) >= 10 && ringCount(0, ASSUMED_HFOV) <= 12,
    `got ${ringCount(0, ASSUMED_HFOV)}`,
  );
  check(
    "and the whole plan is around forty, not nine",
    plan.length >= 30 && plan.length <= 48,
    `got ${plan.length}`,
  );

  check(
    "neighbours on a ring overlap by the third the stitcher needs",
    (() => {
      const n = ringCount(0, ASSUMED_HFOV);
      const spacing = 360 / n;
      const shared = (ASSUMED_HFOV - spacing) / ASSUMED_HFOV;
      return shared >= 0.25 && shared <= 0.55;
    })(),
    "too little and there is nothing to match on; too much and it is forty photographs of the same wall",
  );
  check("the overlap asked for is the brief's 30–40%", OVERLAP >= 0.3 && OVERLAP <= 0.4);

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

  // Every direction on the sphere is within reach of some target.
  {
    let worst = 0;
    for (let yaw = 0; yaw < 360; yaw += 7) {
      for (let pitch = -85; pitch <= 85; pitch += 7) {
        const d = directionOf(yaw, pitch);
        let nearest = 180;
        for (const t of plan) nearest = Math.min(nearest, angleBetween(d, t.direction));
        worst = Math.max(worst, nearest);
      }
    }
    check(
      "no part of the room is further than half a frame from a target",
      worst < ASSUMED_HFOV / 2,
      `the loneliest direction is ${worst.toFixed(1)}° from the nearest target — anything beyond half the field of view is a place no photograph reaches`,
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
    "section 4: steady for 300–600ms, because a frame taken mid-swing is the one the matcher cannot place",
  );
  check(
    "and holding still for only a moment does not either",
    decide(fresh, { facing: first.direction, roll: 0, unsteady: 0.5, heldMs: STEADY_MS - 120 }).action === "aim",
  );
  check("the wait is the 300–600ms asked for", STEADY_MS >= 300 && STEADY_MS <= 600);

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
      "and the poles are not held against somebody",
      fresh.plan.some((t) => !t.required) &&
        fresh.plan.filter((t) => !t.required).every((t) => Math.abs(t.pitch) === 90),
      "the nadir is a photograph of your own shoes; everything between the poles is required",
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
    "a sphere's worth of frames is uploaded smaller than a ring's worth",
    frameWidthFor(38) < frameWidthFor(12) && frameWidthFor(38) >= 1200,
    "forty frames at 2200px is a hundred megabytes on a phone connection",
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
  check("and reaches no network at all", !/https?:\/\//i.test(stitcher));

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
    "exposure is compensated",
    /frame\.gain = means\[i\] > 4 \? clamp\(target \/ means\[i\]/.test(stitcher),
    "a phone re-meters between a window and a dark corner, so two frames of one wall differ by a stop — and the word `gain` appearing somewhere is not the same as it being computed",
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
    stitcher.indexOf("survey(best, canvas, frame, table)") <
      stitcher.indexOf("paint(canvas, frame, table, best)"),
    "a seam cannot be chosen against a canvas that is still being painted",
  );
  check(
    "the join itself is still blended, not cut",
    /const w = over \* over;/.test(stitcher) && /SEAM_SHARE = 0\.9/.test(stitcher),
    "section 7 step 9 — a hard boundary between two exposures is a visible line down a wall; the band is narrow, not absent",
  );
}

// ---------------------------------------------------------------------------
// Acceptance 7, 8 and 9, and section 8: a synthetic room, photographed
// and put back together
// ---------------------------------------------------------------------------

const TW = 1024;
const TH = 512;

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
): Promise<Buffer> {
  const w = 640;
  const h = 480;
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
  const plan = spherePlan(60);
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
      hfov: 60,
      bytes: new Uint8Array(
        await photograph(truth, target.yaw, target.pitch, 0, 60, 0.35),
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
      ratio > 1.34,
      `edge energy ${ratio.toFixed(3)} of the room's — averaging the whole overlap instead of seaming it scores about 1.29 on this same input, because every doubled edge is two soft ones where there was a hard one`,
    );
  }

  check(
    "and the horizon has not drifted round the room",
    Math.abs(best.shift) <= 3,
    `best alignment is ${best.shift}px of ${TW} — a non-zero shift is every frame laid down in the wrong place`,
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
        yaw: target.yaw,
        pitch: target.pitch,
        roll: 0,
        hfov: 60,
        bytes: new Uint8Array(await photograph(truth, target.yaw, target.pitch, 0, 60)),
      });
    }

    const clean = await composePanorama(exact);
    if (!clean.ok) {
      check("a set of exactly-posed frames stitches", false, clean.code);
    } else {
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
    }
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
    "a captured target is shown as captured",
    /markerTaken\.current\.get\(target\.id\) !== done/.test(capture) &&
      /rgba\(52, 211, 153/.test(capture),
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
      /HOLD/.test(overlay),
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
    "the hold clock resets the moment the phone leaves a target",
    /heldSinceRef\.current = settled \? \(heldSinceRef\.current \?\? Date\.now\(\)\) : null;/.test(loop),
    "without the reset a phone swinging past a target twice accumulates enough held time to fire while moving",
  );

  const reading = blockAfter(capture, "const onOrientation = useCallback(");
  check(
    "the rotation is built from all three angles, not a heading",
    /rotationMatrix\(event\.alpha, event\.beta, event\.gamma\)/.test(reading),
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
      /fov: ASSUMED_HFOV/.test(taking) &&
      /width: video\.videoWidth/.test(taking),
    "section 6: by the time the stitcher sees the image there is nothing in the pixels that says which way the camera was facing",
  );

  const grabbing = blockAfter(capture, "const grab = useCallback(");
  check(
    "the camera's own image is captured, not the screen",
    /drawImage\(video, 0, 0/.test(grabbing) && /video\.videoWidth/.test(grabbing),
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
    /\{covered\.missing\.length\} left/.test(capture),
  );

  check(
    "a frame can still be taken by hand",
    /captureManually\(stateRef\.current, decision\.target\)/.test(capture),
    "section 4: manual capture remains as a backup",
  );

  // --- the permission ordering, which is the whole of a dead capture -------
  const starting = blockAfter(capture, "async function start()");
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
    /won&apos;t say which way the phone is pointing/.test(capture) &&
      /Upload a 360 photo/.test(capture),
    "every target is a direction; with nothing reporting where the phone points there is nothing to compare them against, so this is a dead end and not a degraded mode",
  );
  check(
    "the shutter is not offered without a pose to file the photograph under",
    (() => {
      // The guard and the button are a long onClick apart, so this asks
      // whether the nearest thing above the shutter is that guard rather than
      // matching them inside a fixed window.
      const shutter = capture.indexOf("Take it now");
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
  check(
    "the rules still come before the camera",
    /CAPTURE_RULES/.test(rules) && /<CaptureRules/.test(code("src/components/tour/panorama-capture.tsx")),
    "section 10",
  );
  check(
    "and they say to stand in one place",
    /Stand in one place/.test(rules) && /chest/i.test(rules),
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
