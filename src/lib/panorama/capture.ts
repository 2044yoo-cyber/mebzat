import {
  DEFAULT_FRAMES,
  angleDelta,
  capturePlan,
  captureStep,
} from "./stitch";

/**
 * The state machine behind the capture screen, with no camera in it.
 *
 * The screen itself is a React component full of `getUserMedia`, canvases and
 * sensor events, none of which can be checked outside a browser. What *can* be
 * checked is the part that decides things: which angle is wanted next, whether
 * the phone has reached it, when the ring is complete, and what happens when
 * somebody turns the wrong way or stops halfway. So that part is here, as
 * plain functions over plain numbers.
 */

/** How close to the target angle the phone has to be before a frame is taken. */
export const CAPTURE_TOLERANCE_DEGREES = 8;

/**
 * How far the phone must move away from a captured angle before the next one
 * can fire.
 *
 * Without this, a hand shaking on the boundary fires the same frame over and
 * over: the reading crosses the tolerance, captures, drifts back, and captures
 * again. The ring ends up with four photographs of one wall and none of the
 * opposite one.
 */
export const REARM_DEGREES = 12;

export type CaptureState = {
  /** The angles still wanted, in order. */
  plan: number[];
  /** Index into `plan` of the next one. */
  next: number;
  /** Angles already captured, parallel to the frames themselves. */
  taken: number[];
  /** True once the phone has left the last captured angle far enough behind. */
  armed: boolean;
};

export function startCapture(frames = DEFAULT_FRAMES): CaptureState {
  return { plan: capturePlan(frames), next: 0, taken: [], armed: true };
}

export function isComplete(state: CaptureState): boolean {
  return state.next >= state.plan.length;
}

export function progress(state: CaptureState): number {
  return state.plan.length === 0 ? 0 : state.next / state.plan.length;
}

/** The angle the screen should be pointing the person towards, or null when done. */
export function targetAngle(state: CaptureState): number | null {
  return isComplete(state) ? null : state.plan[state.next];
}

/**
 * How far the phone may be tilted off the height it started at.
 *
 * The brief's second instruction is to keep the phone at the same height while
 * rotating, and it is not politeness: the stitcher assumes every frame shares
 * a horizon. A frame shot ten degrees lower does not line up with its
 * neighbours anywhere, and the seam between them is the smear that makes a
 * panorama look melted.
 */
export const LEVEL_TOLERANCE_DEGREES = 14;

/** Half the horizontal field of view of a typical phone's rear camera. */
export const HALF_FOV_DEGREES = 33;

export type Reading = {
  /** Where the phone is pointing now, 0–360. */
  heading: number;
  /**
   * How far the phone is tilted off the height it started at, in degrees.
   * Absent where there is no sensor to say, in which case the tilt is not
   * checked rather than assumed to be wrong.
   */
  tilt?: number | null;
};

export type Decision =
  | { action: "capture"; angle: number; state: CaptureState }
  | {
      action: "wait";
      turnBy: number;
      /** What is being waited for: the turn, or the phone being put back level. */
      reason: "turn" | "level";
      state: CaptureState;
    }
  | { action: "done"; state: CaptureState };

/**
 * The heading this sensor reading is reporting, or null if it reports none.
 *
 * Three sources, because no two browsers agree:
 *
 *  - `webkitCompassHeading` is what iOS Safari gives, and it is already a true
 *    compass bearing clockwise from north. iOS does *not* fire
 *    `deviceorientationabsolute` and its `alpha` is measured from wherever the
 *    page happened to load, so reading `alpha` on an iPhone — which is what
 *    this used to do — produces a number that looks like a heading, changes
 *    like a heading, and points nowhere in particular.
 *  - `alpha` from `deviceorientationabsolute`, which is anticlockwise from
 *    north and so is flipped here.
 *  - `alpha` from plain `deviceorientation`, which is relative to an arbitrary
 *    zero. Usable, but only once it has been zeroed — see `relativeHeading`.
 */
export function headingFrom(sample: {
  alpha?: number | null;
  compass?: number | null;
}): number | null {
  if (typeof sample.compass === "number" && Number.isFinite(sample.compass)) {
    return ((sample.compass % 360) + 360) % 360;
  }
  if (typeof sample.alpha === "number" && Number.isFinite(sample.alpha)) {
    return ((360 - sample.alpha) % 360 + 360) % 360;
  }
  return null;
}

/**
 * The heading, measured from wherever the person was standing when they began.
 *
 * The plan counts 0, 40, 80 … and those used to be read as compass bearings,
 * which meant the first frame was only taken when the phone happened to face
 * the zero of whatever the sensor was reporting. On a browser with a relative
 * `alpha` that zero is arbitrary, so the ring filled at arbitrary true
 * directions while the frames were *labelled* 0, 40, 80 — and the stitcher,
 * which believes the labels, laid them out in an order the room was never in.
 *
 * Zeroing to the first reading makes the plan what it always described: a
 * series of turns from where you are standing. Nobody has to face north.
 */
export function relativeHeading(heading: number, origin: number): number {
  return ((heading - origin) % 360 + 360) % 360;
}

/** How far off level the phone is now, against where it was held at the start. */
export function tiltOff(beta: number | null, origin: number | null): number | null {
  if (beta === null || origin === null) return null;
  if (!Number.isFinite(beta) || !Number.isFinite(origin)) return null;
  return beta - origin;
}

export function isLevel(off: number | null): boolean {
  return off === null || Math.abs(off) <= LEVEL_TOLERANCE_DEGREES;
}

/**
 * Where the next target sits across the screen: -1 at the left edge, +1 at the
 * right, 0 dead centre. Null when it is not on screen at all, which is when
 * the screen should be showing an arrow instead of a target.
 *
 * This is what turns "160°" — a number that tells somebody holding a phone
 * nothing — into a thing on the screen to go and put the ring over.
 */
export function targetOffset(
  turnBy: number,
  halfFov: number = HALF_FOV_DEGREES,
): number | null {
  if (halfFov <= 0) return null;
  const offset = turnBy / halfFov;
  return Math.abs(offset) > 1 ? null : offset;
}

/**
 * What to do with this sensor reading.
 *
 * Pure, so the screen has no branching of its own: it feeds in a heading and
 * either takes a photograph or draws an arrow.
 */
export function advance(state: CaptureState, reading: Reading): Decision {
  if (isComplete(state)) return { action: "done", state };

  const target = state.plan[state.next];
  const delta = angleDelta(reading.heading, target);

  if (!state.armed) {
    // Re-arm once the phone has moved decisively off the last capture.
    const last = state.taken[state.taken.length - 1];
    const moved = Math.abs(angleDelta(last ?? reading.heading, reading.heading));
    if (moved >= REARM_DEGREES) {
      return {
        action: "wait",
        turnBy: delta,
        reason: "turn",
        state: { ...state, armed: true },
      };
    }
    return { action: "wait", turnBy: delta, reason: "turn", state };
  }

  // Pointing the right way but held at the wrong height. Taking the frame
  // anyway is worse than waiting for it: it lands in the panorama at an angle
  // its neighbours do not share, and there is no seam that can rescue it.
  if (!isLevel(reading.tilt ?? null)) {
    return { action: "wait", turnBy: delta, reason: "level", state };
  }

  if (Math.abs(delta) <= CAPTURE_TOLERANCE_DEGREES) {
    return {
      action: "capture",
      angle: target,
      state: {
        ...state,
        next: state.next + 1,
        taken: [...state.taken, target],
        armed: false,
      },
    };
  }

  return { action: "wait", turnBy: delta, reason: "turn", state };
}

/** A frame taken by hand, when there is no usable sensor. */
export function captureManually(state: CaptureState): Decision {
  if (isComplete(state)) return { action: "done", state };
  const angle = state.plan[state.next];
  return {
    action: "capture",
    angle,
    state: {
      ...state,
      next: state.next + 1,
      taken: [...state.taken, angle],
      armed: true,
    },
  };
}

/**
 * The frame's name in storage, which is also where its angle is recorded.
 *
 * Zero-padded so a plain lexical listing comes back in capture order, and the
 * angle is in the name so the stitcher needs one listing and no second table.
 */
export function frameName(index: number, angle: number): string {
  const i = String(index).padStart(3, "0");
  const a = String(Math.round(angle) % 360).padStart(3, "0");
  return `${i}_${a}.jpg`;
}

/**
 * How wide a captured frame should be before it is uploaded.
 *
 * Section 6 asks for 1600–2500px and warns against both extremes: a full
 * camera frame is several megabytes for no benefit, and squeezing too hard
 * costs the matcher the detail it aligns on. This picks inside that range
 * based on how many frames there are, because twelve frames at 2500px is
 * thirty megapixels of upload on a phone connection.
 */
export function frameWidthFor(frameCount: number): number {
  if (frameCount >= 12) return 1600;
  if (frameCount >= 10) return 2000;
  return 2200;
}

/** What the screen tells somebody to do right now. Short, because they are turning. */
export function guidance(decision: Decision): string {
  if (decision.action === "done") return "That's the full circle";
  if (decision.action === "capture") return "Hold still";
  if (decision.reason === "level") return "Hold the phone level";
  return Math.abs(decision.turnBy) > 90
    ? "Keep turning"
    : Math.abs(decision.turnBy) <= HALF_FOV_DEGREES
      ? "Line the circle up with the box"
      : decision.turnBy > 0
        ? "Turn a little more"
        : "Back a little";
}

export { captureStep, capturePlan };
