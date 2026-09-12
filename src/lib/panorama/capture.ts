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

export type Reading = {
  /** Where the phone is pointing now, 0–360. */
  heading: number;
};

export type Decision =
  | { action: "capture"; angle: number; state: CaptureState }
  | { action: "wait"; turnBy: number; state: CaptureState }
  | { action: "done"; state: CaptureState };

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
      return { action: "wait", turnBy: delta, state: { ...state, armed: true } };
    }
    return { action: "wait", turnBy: delta, state };
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

  return { action: "wait", turnBy: delta, state };
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
  return Math.abs(decision.turnBy) > 90
    ? "Keep turning"
    : decision.turnBy > 0
      ? "Turn a little more"
      : "Back a little";
}

export { captureStep, capturePlan };
