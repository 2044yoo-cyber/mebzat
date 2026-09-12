import {
  ASSUMED_HFOV,
  coverage,
  nearestTarget,
  spherePlan,
  steer,
  type Coverage,
  type Target,
} from "./sphere";
import { yawPitchOf, type Vector3 } from "./orientation";

/**
 * The state machine behind the capture screen, with no camera in it.
 *
 * The screen is a React component full of `getUserMedia`, canvases and sensor
 * events, none of which can be checked outside a browser. What decides things
 * is here, as plain functions over plain numbers: which direction is wanted
 * next, whether the phone is pointing at it, whether it has been held still
 * long enough to photograph, and whether enough of the room exists yet to
 * stop.
 */

/** How close to a target the camera has to be pointing before it counts. */
export const ALIGN_TOLERANCE_DEGREES = 9;

/**
 * How far the phone may drift between readings and still be called steady.
 *
 * The shutter firing the instant a target is crossed catches the phone
 * mid-swing, and a smeared frame is worse than no frame: it is the one the
 * matcher cannot align, so it takes its neighbours with it.
 */
export const STEADY_DEGREES = 2.2;

/** How long it has to stay that still. Section 4 asks for 300–600ms. */
export const STEADY_MS = 400;

export type CaptureState = {
  plan: Target[];
  /** The ids already photographed. A target cannot be taken twice. */
  taken: string[];
};

export function startCapture(hfov: number = ASSUMED_HFOV): CaptureState {
  return { plan: spherePlan(hfov), taken: [] };
}

export function takenSet(state: CaptureState): Set<string> {
  return new Set(state.taken);
}

/** What is photographed, what is missing, and whether that is enough. */
export function progress(state: CaptureState): Coverage {
  return coverage(state.plan, takenSet(state));
}

/** Whether the capture may be finished. Section 8 — the gate, not a suggestion. */
export function isComplete(state: CaptureState): boolean {
  return progress(state).complete;
}

/** Record one target as photographed. Doing it twice changes nothing. */
export function record(state: CaptureState, id: string): CaptureState {
  return state.taken.includes(id)
    ? state
    : { ...state, taken: [...state.taken, id] };
}

export type Decision =
  | { action: "capture"; target: Target; state: CaptureState }
  | {
      action: "aim";
      target: Target;
      /** How far off, in degrees. */
      error: number;
      aligned: boolean;
      steady: boolean;
      state: CaptureState;
    }
  | { action: "done"; state: CaptureState };

/**
 * What to do with this reading.
 *
 * `heldMs` is how long the phone has been both aligned and steady, which the
 * screen tracks because it is the only part that needs a clock. Everything
 * else is a function of where the camera is pointing.
 */
export function decide(
  state: CaptureState,
  facing: Vector3,
  unsteady: number,
  heldMs: number,
): Decision {
  const nearest = nearestTarget(state.plan, takenSet(state), facing);
  if (!nearest) return { action: "done", state };

  const aligned = nearest.error <= ALIGN_TOLERANCE_DEGREES;
  const steady = unsteady <= STEADY_DEGREES;

  if (aligned && steady && heldMs >= STEADY_MS) {
    return {
      action: "capture",
      target: nearest.target,
      state: record(state, nearest.target.id),
    };
  }

  return {
    action: "aim",
    target: nearest.target,
    error: nearest.error,
    aligned,
    steady,
    state,
  };
}

/** A frame taken by hand, for the target being aimed at. Section 4's backup. */
export function captureManually(
  state: CaptureState,
  target: Target,
): Decision {
  return {
    action: "capture",
    target,
    state: record(state, target.id),
  };
}

/** What the screen says right now. Short, because the person is turning. */
export function guidance(decision: Decision, facing: Vector3): string {
  if (decision.action === "done") return "That's the whole room";
  if (decision.action === "capture") return "Captured";
  if (decision.aligned && !decision.steady) return "Hold steady…";
  if (decision.aligned) return "Hold steady…";
  return steer(decision.target, yawPitchOf(facing), false, false);
}

/**
 * The frame's name in storage.
 *
 * Zero-padded so a plain lexical listing comes back in capture order. The pose
 * is recorded alongside it rather than in the name — a yaw, a pitch, a roll
 * and a field of view do not fit in a filename without being rounded, and a
 * degree of rounding on every frame is a degree the stitcher has to find again.
 */
export function frameName(index: number): string {
  return `${String(index).padStart(3, "0")}.jpg`;
}

/**
 * How wide a captured frame should be before it is uploaded.
 *
 * A whole sphere is around forty photographs rather than nine, so the ceiling
 * has to come down or the upload is a hundred megabytes on a phone connection.
 * 1280 across still gives the stitcher more detail per degree than the
 * panorama it ends up in: forty frames at 1280 covering 60° each is the
 * equivalent of nearly 8000 pixels around, and the output is capped at 4096.
 */
export function frameWidthFor(frameCount: number): number {
  if (frameCount >= 36) return 1280;
  if (frameCount >= 24) return 1440;
  return 1600;
}

export { spherePlan, steer, type Target };
