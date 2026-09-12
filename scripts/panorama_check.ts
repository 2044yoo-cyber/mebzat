/**
 * 360° capture and stitching.
 *
 *   npx tsx scripts/panorama_check.ts
 *
 * The stitching maths is written as pure functions over plain arrays precisely
 * so that it can be checked here — without a camera, a browser, a GPU or a
 * server. What is checked is the part that decides whether a panorama comes
 * out straight: where the frames are placed, how the overlap is matched, and
 * what happens when the match is worthless.
 *
 * The warping and compositing are not here. They need an image library and
 * live in the route; what this can do is make sure the numbers handed to them
 * are right.
 *
 * Plain Node with type stripping; no test framework, in keeping with the rest
 * of scripts/.
 */

import "./lib/allow-server-only.ts";

import { readFileSync } from "node:fs";

import sharp from "sharp";

import { composePanorama } from "../src/lib/panorama/compose.ts";
import {
  CAPTURE_TOLERANCE_DEGREES,
  REARM_DEGREES,
  advance,
  captureManually,
  frameName,
  frameWidthFor,
  guidance,
  isComplete,
  progress,
  startCapture,
  targetAngle,
} from "../src/lib/panorama/capture.ts";

import {
  DEFAULT_FRAMES,
  EQUIRECT_RATIO,
  MAX_FRAMES,
  MIN_CONFIDENCE,
  MIN_FRAMES,
  angleDelta,
  bestSeam,
  capturePlan,
  captureStep,
  columnAngles,
  columnProfile,
  correlate,
  exposureGains,
  featherWeights,
  hasUsableOverlap,
  matchOffset,
  outputSize,
  overlapWindow,
  solvePlacements,
  stitchErrorMessage,
} from "../src/lib/panorama/stitch.ts";

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

// ---------------------------------------------------------------------------
// The capture plan — section 4
// ---------------------------------------------------------------------------

{
  const plan = capturePlan(9);
  check("nine frames is nine angles", plan.length === 9);
  check("starting at zero", plan[0] === 0);
  check(
    "evenly spaced around one turn",
    plan.every((a, i) => Math.abs(a - i * 40) < 0.05),
    plan.join(", "),
  );
  check(
    "and none of them is a full turn, which is the first frame again",
    plan.every((a) => a < 360),
  );

  check("eight to twelve frames, as the brief says", MIN_FRAMES === 8 && MAX_FRAMES === 12);
  check(
    "the default sits inside that",
    DEFAULT_FRAMES >= MIN_FRAMES && DEFAULT_FRAMES <= MAX_FRAMES,
  );
  check(
    "too few frames is clamped up rather than accepted",
    capturePlan(2).length === MIN_FRAMES,
    "three photographs cannot cover a room, and pretending they can produces a smear",
  );
  check("and too many clamped down", capturePlan(40).length === MAX_FRAMES);

  check(
    "the spacing lands in the 30–45° the brief asks for",
    [8, 9, 10, 11, 12].every((n) => {
      const step = captureStep(n);
      return step >= 30 && step <= 45;
    }),
    "every frame count the form can produce has to leave enough overlap",
  );
}

// ---------------------------------------------------------------------------
// Angles wrap
// ---------------------------------------------------------------------------

{
  check("a small turn is a small number", angleDelta(10, 40) === 30);
  check(
    "crossing north is +20, not -340",
    angleDelta(350, 10) === 20,
    "the capture screen reads the sign as 'keep turning'",
  );
  check("and the other way is -20", angleDelta(10, 350) === -20);
  check("no turn is zero", angleDelta(90, 90) === 0);
  check("half a turn stays positive", angleDelta(0, 180) === 180);
  check(
    "and is never reported as a full turn",
    Math.abs(angleDelta(0, 360)) < 1e-9,
  );
}

// ---------------------------------------------------------------------------
// Overlap — section 17's most useful error
// ---------------------------------------------------------------------------

{
  check(
    "frames 40° apart on a 65° lens overlap plenty",
    hasUsableOverlap(40),
  );
  check(
    "frames 70° apart share nothing",
    !hasUsableOverlap(70),
    "no amount of cleverness recovers a gap; the answer is to say so",
  );
  check(
    "and the boundary is where the brief puts it",
    hasUsableOverlap(53) && !hasUsableOverlap(54),
    "65° of view less 12° of required overlap",
  );

  const window = overlapWindow(40)!;
  check("an overlap has a width", window.fraction > 0);
  check(
    "the shared strip is the right-hand end of one frame",
    window.leftStart > 0.5 && window.leftStart < 1,
  );
  check(
    "and the left-hand end of the next",
    window.rightEnd > 0 && window.rightEnd < 0.5,
  );
  check(
    "the two strips are the same width",
    Math.abs((1 - window.leftStart) - window.rightEnd) < 1e-9,
  );
  check("no overlap, no window", overlapWindow(90) === null);
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

{
  // A synthetic wall: a few features at known columns.
  const wall = (width: number, shift: number) => {
    const out = new Float64Array(width);
    for (let x = 0; x < width; x += 1) {
      const t = x + shift;
      out[x] = 120 + 60 * Math.sin(t / 9) + 25 * Math.sin(t / 31);
    }
    return out;
  };

  const left = wall(300, 0);
  // The same wall, seen 37 columns further round. The sign matters and is the
  // matcher's, not the eye's: `matchOffset` compares left[i] against
  // right[i - shift], so the frame that continues the wall to the right is
  // `wall(width, +37)`. The first version of this fixture had it backwards and
  // the check failed on a correct matcher.
  const right = wall(300, 37);

  const match = matchOffset(left, right, 40, 40);
  check(
    "the matcher finds the real offset, not the one the angle guessed",
    match.offset === 37,
    `got ${match.offset}`,
  );
  check("and is confident about it", match.confidence > 0.9);

  // The reason the search is bounded: a repeating pattern has many peaks, and
  // an unbounded search picks whichever is highest by luck.
  const bounded = matchOffset(left, right, 40, 5);
  check(
    "the search only looks near where the angle said",
    Math.abs(bounded.offset - 40) <= 5,
    "an unconstrained search finds a false peak in a tiled floor or a row of windows",
  );

  // A blank wall.
  const flat = new Float64Array(300).fill(180);
  const flatMatch = matchOffset(flat, new Float64Array(300).fill(180), 40, 20);
  check(
    "a featureless wall reports no confidence, rather than perfect confidence",
    flatMatch.confidence === 0,
    "'I cannot tell' must not read as 'a perfect match', or blank walls win every alignment",
  );

  check(
    "a strip correlates perfectly with itself",
    Math.abs(correlate(left, left) - 1) < 1e-9,
  );
  check(
    "and not at all with its own negative",
    correlate([1, 2, 3, 4], [4, 3, 2, 1]) < -0.99,
  );
  check("nothing to compare is zero", correlate([], []) === 0);
  check(
    "and a constant has no correlation to give",
    correlate([5, 5, 5], [1, 2, 3]) === 0,
  );
}

// ---------------------------------------------------------------------------
// Column profiles
// ---------------------------------------------------------------------------

{
  // Three columns, two rows: [10 20 30 / 30 40 50] → means 20, 30, 40.
  const profile = columnProfile([10, 20, 30, 30, 40, 50], 3, 2);
  check(
    "a column's value is the mean down that column",
    profile[0] === 20 && profile[1] === 30 && profile[2] === 40,
    [...profile].join(", "),
  );
  check("one value per column", profile.length === 3);
}

// ---------------------------------------------------------------------------
// Placement — where every frame lands
// ---------------------------------------------------------------------------

{
  const width = 3600;
  const n = 9;
  const step = width / n; // 400
  const matches = Array.from({ length: n - 1 }, () => ({
    offset: step,
    confidence: 0.9,
  }));

  const placed = solvePlacements(matches, step, width);
  check("one placement per frame", placed.length === n);
  check("the first frame is at the origin", placed[0].x === 0);
  check(
    "a perfect ring needs no correction",
    placed.every((p, i) => Math.abs(p.x - i * step) < 1e-6),
    placed.map((p) => Math.round(p.x)).join(", "),
  );

  // Now every match is 10 columns long, so the ring over-runs by 80.
  const drifting = Array.from({ length: n - 1 }, () => ({
    offset: step + 10,
    confidence: 0.9,
  }));
  const corrected = solvePlacements(drifting, step, width);
  check(
    "a ring that does not close is corrected",
    Math.abs(corrected[n - 1].x - (width * (n - 1)) / n) < 1e-6,
    `last frame at ${corrected[n - 1].x}, wanted ${(width * (n - 1)) / n}`,
  );
  check(
    "and the correction is spread over every frame, not dumped on the last seam",
    corrected.every((p, i) => i === 0 || p.x < i * (step + 10)),
    "one visibly wrong join is exactly where a viewer's eye goes; every join slightly soft is not",
  );
  check(
    "the frames stay in order",
    corrected.every((p, i) => i === 0 || p.x > corrected[i - 1].x),
  );

  // A match nobody should trust.
  const untrusted = [
    { offset: 4000, confidence: 0.05 },
    ...Array.from({ length: n - 2 }, () => ({ offset: step, confidence: 0.9 })),
  ];
  const fallback = solvePlacements(untrusted, step, width);
  check(
    "a worthless match falls back to the angle the phone recorded",
    fallback[1].x < step * 2,
    `a 4000-column jump would have thrown the panorama apart; got ${fallback[1].x}`,
  );
  check(
    "the confidence threshold is what decides that",
    MIN_CONFIDENCE > 0 && MIN_CONFIDENCE < 1,
  );
  check(
    "and the confidence is carried through so a weak stitch can be reported",
    fallback[1].confidence === 0.05,
  );
}

// ---------------------------------------------------------------------------
// Exposure — section 7 step 6
// ---------------------------------------------------------------------------

{
  const gains = exposureGains([100, 200, 100, 200]);
  check("four frames, four gains", gains.length === 4);
  check(
    "a dark frame is brightened and a bright one dimmed",
    gains[0] > 1 && gains[1] < 1,
    gains.map((g) => g.toFixed(2)).join(", "),
  );
  check(
    "but only partly, because lens falloff at the edges is real",
    gains[0] < 200 / 100,
    "flattening it completely costs more than the banding it fixes",
  );

  const even = exposureGains([150, 150, 150]);
  check(
    "frames that already match are left alone",
    even.every((g) => Math.abs(g - 1) < 1e-9),
  );

  const extreme = exposureGains([1, 250]);
  check(
    "a nearly-black frame is not multiplied into noise",
    extreme.every((g) => g >= 0.5 && g <= 2),
    extreme.map((g) => g.toFixed(2)).join(", "),
  );
  check("no frames, no crash", exposureGains([]).length === 0);
}

// ---------------------------------------------------------------------------
// Seam and blend — steps 7 and 8
// ---------------------------------------------------------------------------

{
  const a = new Float64Array([10, 10, 50, 10, 10]);
  const b = new Float64Array([90, 90, 50, 90, 90]);
  check(
    "the seam goes where the two frames already agree",
    bestSeam(a, b, 0, 5) === 2,
    "cutting at a fixed midpoint puts the join through whoever walked past",
  );
  check("an empty range returns its start", bestSeam(a, b, 3, 3) === 3);

  const weights = featherWeights(4);
  check("a blend band has one weight per column", weights.length === 4);
  check(
    "it rises from left to right",
    weights.every((w, i) => i === 0 || w > weights[i - 1]),
  );
  check(
    "and never reaches a hard 0 or 1, which is a hard cut by another name",
    weights[0] > 0 && weights[weights.length - 1] < 1,
    [...weights].map((w) => w.toFixed(2)).join(", "),
  );
  check("a band of nothing is still a band of one", featherWeights(0).length === 1);
}

// ---------------------------------------------------------------------------
// The output
// ---------------------------------------------------------------------------

{
  const angles = columnAngles(360);
  check("the first column is due west", angles[0] === -180);
  check("the middle is dead ahead", Math.abs(angles[180] - 0) < 1e-9);
  check(
    "and the last stops short of a full turn",
    angles[359] === 179,
    "column 0 and column `width` are the same longitude, so the last column is one step short of +180",
  );

  const size = outputSize(2000, 9);
  check(
    "the output is twice as wide as it is tall",
    size.width === size.height * EQUIRECT_RATIO,
    `${size.width}x${size.height}`,
  );
  check(
    "and is capped where the bucket and the viewer already cap it",
    size.width <= 4096,
    "section 19: a reliable medium-resolution panorama beats a slow large one",
  );
  check(
    "a small capture still produces a usable panorama",
    outputSize(600, 8).width >= 2048,
  );
  check("the width is even, so the halves are equal", size.width % 2 === 0);
}

// ---------------------------------------------------------------------------
// Section 17 — messages somebody can act on
// ---------------------------------------------------------------------------

{
  check(
    "not enough overlap says what to do differently",
    /rotate more slowly/i.test(stitchErrorMessage("no_overlap")),
  );
  check(
    "an unknown failure says the photos are safe",
    /try again/i.test(stitchErrorMessage("unknown")),
  );
  check(
    "and a code nobody recognises still gets a sentence",
    stitchErrorMessage("something_new").length > 0 &&
      stitchErrorMessage(null).length > 0,
    "a generic error is still better than an empty dialog",
  );
  check(
    "no message is a raw code or a stack",
    !/[_]{1}[a-z]+_[a-z]/.test(stitchErrorMessage("no_overlap")),
  );
}

// ---------------------------------------------------------------------------
// The capture state machine — sections 3, 4 and 5
// ---------------------------------------------------------------------------

{
  let state = startCapture(9);
  check("a fresh capture wants nine angles", state.plan.length === 9);
  check("and the first is zero", targetAngle(state) === 0);
  check("nothing captured yet", progress(state) === 0 && !isComplete(state));

  // Standing still at 0° fires the first frame.
  let decision = advance(state, { heading: 0 });
  check("pointing at the first angle captures", decision.action === "capture");
  state = decision.state;
  check("and moves on to the next", targetAngle(state) === 40);

  // The hand shakes back onto the same angle. It must not fire again.
  decision = advance(state, { heading: 1 });
  check(
    "a hand shaking on the boundary does not capture twice",
    decision.action === "wait",
    "four photographs of one wall and none of the opposite one",
  );
  state = decision.state;

  // Turning past the re-arm distance but not yet to the next target.
  decision = advance(state, { heading: 20 });
  check("turning away re-arms without capturing", decision.action === "wait");
  state = decision.state;
  check("and it is armed again", state.armed);

  decision = advance(state, { heading: 39 });
  check(
    "close enough to the next angle captures",
    decision.action === "capture",
    `tolerance is ${CAPTURE_TOLERANCE_DEGREES} degrees`,
  );
  state = decision.state;

  check(
    "the re-arm distance is wider than the capture tolerance",
    REARM_DEGREES > CAPTURE_TOLERANCE_DEGREES,
    "otherwise a reading sitting just outside the tolerance re-arms and fires forever",
  );

  // Walk the rest of the ring.
  for (const target of [80, 120, 160, 200, 240, 280, 320]) {
    state = advance(state, { heading: target - 20 }).state;
    const fired = advance(state, { heading: target });
    check(`the ring reaches ${target}`, fired.action === "capture");
    state = fired.state;
  }

  check("nine captures completes the ring", isComplete(state));
  check("and progress is full", progress(state) === 1);
  check("with nothing left to point at", targetAngle(state) === null);
  check(
    "a reading after the ring is done says so",
    advance(state, { heading: 10 }).action === "done",
  );
  check("all nine angles were recorded", state.taken.length === 9);
}

{
  // Section 3: no gyroscope is not a dead end.
  let state = startCapture(8);
  for (let i = 0; i < 8; i += 1) {
    const decision = captureManually(state);
    check(`manual capture ${i + 1} fires`, decision.action === "capture");
    state = decision.state;
  }
  check("a manual ring completes too", isComplete(state));
  check(
    "and the angles are the planned ones, not wherever the phone was",
    state.taken.every((a, i) => Math.abs(a - i * 45) < 0.05),
    state.taken.join(", "),
  );
  check(
    "a manual capture past the end does nothing",
    captureManually(state).action === "done",
  );
}

{
  // Section 6: the upload size.
  check("twelve frames go up smaller", frameWidthFor(12) === 1600);
  check("nine go up larger", frameWidthFor(9) === 2200);
  check(
    "every choice sits in the 1600–2500 the brief asks for",
    [8, 9, 10, 11, 12].every((n) => {
      const w = frameWidthFor(n);
      return w >= 1600 && w <= 2500;
    }),
  );

  check(
    "a frame's name carries its angle",
    frameName(3, 120) === "003_120.jpg",
    "the stitcher reads the angle off the listing rather than out of a second table",
  );
  check(
    "and sorts lexically into capture order",
    ["003_120.jpg", "010_040.jpg", "001_000.jpg"].sort()[0] === "001_000.jpg",
  );
  check("a full turn is named as zero", frameName(0, 360) === "000_000.jpg");
  check("and angles are padded", frameName(1, 40) === "001_040.jpg");

  check(
    "the guidance is short, because the person is turning",
    guidance({ action: "wait", turnBy: 30, state: startCapture() }).length < 24,
  );
  check(
    "turning too far says to come back",
    /back/i.test(guidance({ action: "wait", turnBy: -20, state: startCapture() })),
  );
}

// ---------------------------------------------------------------------------
// End to end: nine photographs in, one panorama out
//
// The arithmetic above can all be right while the thing that assembles the
// pixels is wrong, so this builds a synthetic room, cuts nine overlapping
// frames out of it the way a phone would see them, and stitches them back.
// A correct stitch puts the room back together; a broken one produces a blank
// canvas, a smear, or the wrong shape — and every one of those passes the
// unit checks above.
// ---------------------------------------------------------------------------


async function endToEnd() {
  const SRC_W = 3600;
  const SRC_H = 900;

  const raw = Buffer.alloc(SRC_W * SRC_H * 3);
  for (let y = 0; y < SRC_H; y += 1) {
    for (let x = 0; x < SRC_W; x += 1) {
      const i = (y * SRC_W + x) * 3;
      // Vertical features at two irregular spacings, so the matcher has
      // something to lock onto that does not repeat, and a horizon band, so a
      // vertical misalignment would be visible as a step.
      const stripe = Math.sin(x / 17) * 60 + Math.sin(x / 53) * 40;
      const horizon = y < SRC_H * 0.45 ? 40 : -20;
      raw[i] = Math.max(0, Math.min(255, 128 + stripe + horizon));
      raw[i + 1] = Math.max(0, Math.min(255, 120 + stripe * 0.7));
      raw[i + 2] = Math.max(0, Math.min(255, 110 - stripe * 0.4 + horizon));
    }
  }

  const source = await sharp(raw, {
    raw: { width: SRC_W, height: SRC_H, channels: 3 },
  })
    .jpeg()
    .toBuffer();

  const frameW = Math.round(SRC_W * (65 / 360));
  const wrapStrip = await sharp(source)
    .extract({ left: 0, top: 0, width: frameW, height: SRC_H })
    .toBuffer();
  // The room wraps, so the strip past the right-hand edge is the left-hand
  // edge again. Without this the last frame would be half black.
  const wrapped = await sharp(source)
    .extend({ right: frameW, background: { r: 0, g: 0, b: 0 } })
    .composite([{ input: wrapStrip, left: SRC_W, top: 0 }])
    .toBuffer();

  const frames = [];
  for (const yaw of capturePlan(9)) {
    const left = Math.round((yaw / 360) * SRC_W);
    const bytes = await sharp(wrapped)
      .extract({ left, top: 0, width: frameW, height: SRC_H })
      .jpeg({ quality: 92 })
      .toBuffer();
    frames.push({ yaw, bytes: new Uint8Array(bytes) });
  }

  const started = Date.now();
  const result = await composePanorama(frames);
  const elapsed = Date.now() - started;

  check("nine frames stitch into something", result.ok, result.ok ? "" : result.code);

  if (result.ok) {
    const meta = await sharp(result.jpeg).metadata();
    const stats = await sharp(result.jpeg).stats();

    check(
      "the output is equirectangular",
      meta.width === meta.height! * EQUIRECT_RATIO,
      `${meta.width}x${meta.height}`,
    );
    check(
      "the panorama has real detail in it",
      stats.channels[0].stdev > 10,
      `luminance stdev ${stats.channels[0].stdev.toFixed(1)} — a blank canvas would be near zero`,
    );
    check(
      "every seam matched confidently",
      result.weakSeams === 0,
      `${result.weakSeams} weak seams on a synthetic room with plenty of features`,
    );

    // The horizon in the source is a hard step at 45% height. If the frames
    // were assembled with a vertical error, the step would be at different
    // heights in different columns, and a column-wise check of where it falls
    // would disagree across the image.
    const { data, info } = await sharp(result.jpeg)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const stepRows: number[] = [];
    for (let x = 20; x < info.width - 20; x += Math.floor(info.width / 24)) {
      let bestRow = 0;
      let bestJump = 0;
      for (let y = 1; y < info.height; y += 1) {
        const jump = Math.abs(
          data[y * info.width + x] - data[(y - 1) * info.width + x],
        );
        if (jump > bestJump) {
          bestJump = jump;
          bestRow = y;
        }
      }
      stepRows.push(bestRow);
    }
    const spread = Math.max(...stepRows) - Math.min(...stepRows);
    check(
      "the horizon comes out level across the whole panorama",
      spread <= 4,
      `the strongest horizontal edge moves ${spread} rows between columns; a tilted or stepped stitch moves far more`,
    );

    check(
      "and it does not take an hour",
      elapsed < 30_000,
      `${elapsed}ms for nine frames — section 19 asks for minutes, not the hour the app being replaced took`,
    );
  }
}

// ---------------------------------------------------------------------------
// The capture screen's wiring — sections 5, 16 and 23
// ---------------------------------------------------------------------------

/**
 * The body of the first `{ … }` at or after `marker`, brace-balanced.
 *
 * Scoped rather than whole-file on purpose: this component has several
 * callbacks that all read the same refs, and a check against the whole file
 * passes because a sibling still has the line the mutation removed.
 */
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

{
  const capture = code("src/components/tour/panorama-capture.tsx");

  const tick = blockAfter(capture, "tick = window.setInterval(");
  check("the sensor loop is findable at all", tick.length > 0);
  check(
    "the loop decides against the live state, not a stale closure",
    /advance\(\s*stateRef\.current/.test(tick),
    "an effect that reads `state` decides with whatever was true when it last ran",
  );
  check(
    "the loop does not decide while a frame is still being read",
    /if\s*\(\s*busyRef\.current\s*\)\s*return/.test(tick),
    "without this the plan advances past an angle whose photograph `take` drops, leaving a hole in the ring",
  );
  check(
    "and it takes the photograph the decision asked for",
    /take\(\s*decision\.angle\s*\)/.test(tick),
  );

  check(
    "nothing in the screen calls `advance` inside a setState updater",
    !/setState\(\s*\(/.test(capture),
    "an updater that fires the camera runs twice under StrictMode and once per replay",
  );
  check(
    "and no effect watches the frame count to start the upload",
    !/\[\s*phase\s*,\s*state\.next\s*\]/.test(capture),
    "reacting to your own render to start an upload races two ticks into two uploads",
  );

  const finish = blockAfter(capture, "const finish = useCallback(");
  check("the ring-closing step is findable", finish.length > 0);
  check(
    "and it uploads only once the ring is actually closed",
    /if\s*\(\s*!isComplete\(\s*next\s*\)\s*\)\s*return/.test(finish),
    "without the guard every frame starts an upload of a half-finished room",
  );

  const upload = blockAfter(capture, "const upload = useCallback(");
  check("the upload is findable", upload.length > 0);
  check(
    "the frames are uploaded before the stitch is asked for",
    upload.indexOf("panorama-frames") < upload.indexOf("stitch("),
    "asking the server to stitch frames that are not in storage yet fails as `too_few_frames`",
  );
  const remembered = upload.indexOf("setUploadedJob(job.id)");
  check(
    "and the job is remembered before the stitch is asked for, not after it",
    remembered > 0 && remembered < upload.indexOf("await stitch("),
    "section 16 keeps the frames for a day so a failed stitch can be retried; remembering the id only after the stitch returns means the one case that needs it — the stitch failing — is the one case it is missing",
  );

  const stitch = blockAfter(capture, "const stitch = useCallback(");
  check("the stitch request is its own step", stitch.length > 0);
  check(
    "it posts the job id it was given, not one of its own",
    /body:\s*JSON\.stringify\(\{\s*jobId\s*\}\)/.test(stitch),
  );
  check(
    "a failed stitch is retried without turning around the room again",
    /void stitch\(\s*uploadedJob\s*\)/.test(capture),
    "the screen tells people their photos are saved; Try again has to mean it",
  );
  check(
    "and re-shooting is still offered, as the second choice",
    /Shoot the room again/.test(capture),
  );
  check(
    "starting over forgets the finished job",
    /setUploadedJob\(null\)/.test(blockAfter(capture, "function restart(")),
    "otherwise Try again re-stitches the room somebody just abandoned",
  );

  check(
    "leaving the screen stops the camera",
    /stopCamera\(\)/.test(blockAfter(capture, "const teardown = useCallback(")),
    "a live camera behind a closed screen is a light left on somebody's phone",
  );
}

{
  const builder = code("src/components/tour/tour-builder.tsx");
  check(
    "the tour builder offers both ways in",
    /<RoomSource\b/.test(builder),
    "section 23: capture is reached from the place panoramas are already added",
  );

  const source = code("src/components/tour/room-source.tsx");
  check(
    "uploading a 360 photo is still there",
    /<PanoramaInput\b/.test(source),
    "capture is offered, not imposed — a Ricoh owner has nothing to capture",
  );
  check("and capture is the other half", /<PanoramaCapture\b/.test(source));
  check(
    "a captured panorama is declared equirectangular rather than guessed at",
    /kind:\s*"equirectangular"/.test(source),
    "the compositor builds 2:1 by construction, so there is nothing to warn about",
  );

  const viewer = code("src/components/tour/panorama-viewer.tsx");
  check(
    "the viewer can go fullscreen",
    /requestFullscreen\(\)/.test(viewer),
    "section 12 asks for it, and a 360 photo in a card is a keyhole",
  );
  check(
    "and it exits as well as enters",
    /exitFullscreen\(\)/.test(viewer),
  );
}

// ---------------------------------------------------------------------------
// No AI — section 20
// ---------------------------------------------------------------------------

{
  const stitcher = code("src/lib/panorama/stitch.ts");
  check(
    "the stitcher calls no model and no provider",
    !/openai|anthropic|replicate|fetch\(/i.test(stitcher),
    "section 20: conventional stitching only",
  );
  check(
    "and reaches no network at all",
    !/http/i.test(stitcher.replace(/https?:\/\/[^\s"']*/g, "")),
  );
}

// ---------------------------------------------------------------------------

// The synthetic stitch is the only asynchronous part, so it runs last and the
// summary waits for it. `tsx` compiles this file to CommonJS, which has no
// top-level await.
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
  console.log(`${DIM}panorama: nine photographs, one equirectangular image${RESET}`);
}
