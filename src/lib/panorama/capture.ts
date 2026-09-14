import {
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
export const ALIGN_TOLERANCE_DEGREES = 6;

/**
 * How far the phone may drift between readings and still be called steady.
 *
 * The shutter firing the instant a target is crossed catches the phone
 * mid-swing, and a smeared frame is worse than no frame: it is the one the
 * matcher cannot align, so it takes its neighbours with it.
 */
export const STEADY_DEGREES = 3;

/**
 * Deliberate confirmation hold after the target turns green.
 *
 * 450ms still caught the phone while the person was settling onto the point.
 * A full second makes the ring meaningful: centred first, then steady, then
 * capture. It adds about twelve seconds over the original setting for a
 * normal 22-photo room, which is cheaper than rebuilding a broken panorama.
 */
export const STEADY_MS = 1000;

/** One noisy sensor sample may not erase an otherwise steady hold. */
export const HOLD_GRACE_MS = 140;

export type HoldState = { targetId: string | null; since: number | null; lastValid: number };
export const EMPTY_HOLD: HoldState = { targetId: null, since: null, lastValid: 0 };

/** Keep a real hold through one short gyro spike, but never through changing targets. */
export function updateHold(
  current: HoldState,
  targetId: string | null,
  valid: boolean,
  now: number,
): HoldState {
  if (valid && targetId) {
    return current.targetId === targetId
      ? { ...current, lastValid: now }
      : { targetId, since: now, lastValid: now };
  }
  return now - current.lastValid <= HOLD_GRACE_MS
    ? current
    : { ...EMPTY_HOLD };
}

export function heldFor(current: HoldState, now: number): number {
  return current.since === null ? 0 : Math.max(0, now - current.since);
}

/**
 * How far the phone may be rolled about its own line of sight.
 *
 * A rolled frame is not merely untidy. The stitcher places it by its recorded
 * roll, so a wrong one puts the whole photograph at an angle to its
 * neighbours, and the seam between them has to blend two different rotations
 * of the same wall — which it cannot, so it blurs. Holding the phone square is
 * the cheapest sharpness there is, and it is the one thing the screen never
 * asked for.
 */
export const ROLL_TOLERANCE_DEGREES = 18;

/**
 * How long the shutter stays shut after a target is taken.
 *
 * Nobody swings away from a target the instant it fires, so for the best part
 * of a second afterwards the phone is still pointing at roughly the same
 * place — near enough to whatever target is next in that direction to start
 * capturing it from a position nobody chose. Waiting is also what makes the
 * green marker and the number readable as a confirmation rather than a flicker.
 */
export const CAPTURE_COOLDOWN_MS = 900;

export type CaptureState = {
  plan: Target[];
  /** The ids already photographed. A target cannot be taken twice. */
  taken: string[];
};

export function startCapture(
  hfov?: number,
  /** How tall a frame is. The rings are spaced by it. */
  vfov?: number,
): CaptureState {
  return { plan: spherePlan(hfov, vfov), taken: [] };
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

/**
 * The lowest-numbered target still wanted — the one the screen points at.
 *
 * The route and the shutter are deliberately not the same question. This is
 * where somebody is being sent; the shutter fires for whichever target they
 * are actually pointing at. Being steered to 7 and landing on 12 photographs
 * 12, because refusing a photograph of somewhere that needs photographing,
 * for being out of order, is a rule with nothing behind it.
 */
export function nextInOrder(state: CaptureState): Target | null {
  const taken = takenSet(state);
  for (const target of state.plan) {
    if (!taken.has(target.id)) return target;
  }
  return null;
}

/** Record one target as photographed. Doing it twice changes nothing. */
export function record(state: CaptureState, id: string): CaptureState {
  return state.taken.includes(id)
    ? state
    : { ...state, taken: [...state.taken, id] };
}

/**
 * Put a target back on the list.
 *
 * The shutter and the photograph are not the same event: the decision to
 * capture is made from the sensors, and the frame is read off the video a
 * moment later and can be thrown away for being blurred. A target left marked
 * as done with no photograph behind it is a hole in the sphere that the
 * coverage gate cannot see, because the gate counts intentions.
 */
export function unrecord(state: CaptureState, id: string): CaptureState {
  return state.taken.includes(id)
    ? { ...state, taken: state.taken.filter((taken) => taken !== id) }
    : state;
}

export type Decision =
  | { action: "capture"; target: Target; state: CaptureState }
  | {
      action: "aim";
      /** Where the person is being sent: the lowest number still wanted. */
      target: Target;
      /** The one the shutter would fire for, which may not be the same. */
      nearest: Target;
      /** How far off `nearest` is, in degrees. */
      error: number;
      /** Pointing at it. */
      aligned: boolean;
      /** Not moving. */
      steady: boolean;
      /** Held square, rather than rolled over to one side. */
      level: boolean;
      state: CaptureState;
    }
  | { action: "done"; state: CaptureState };

/** One reading of where the phone is and what it has been doing. */
export type Reading = {
  /** Where the camera is pointing. */
  facing: Vector3;
  /** How far it is rolled about that line of sight, in degrees. */
  roll: number;
  /** The most it has moved between recent readings, in degrees. */
  unsteady: number;
  /** How long it has been aligned, steady and level together. */
  heldMs: number;
};

/**
 * What to do with this reading.
 *
 * `heldMs` is how long the phone has been both aligned and steady, which the
 * screen tracks because it is the only part that needs a clock. Everything
 * else is a function of where the camera is pointing.
 */
export function decide(state: CaptureState, reading: Reading): Decision {
  const nearest = nearestTarget(state.plan, takenSet(state), reading.facing);
  if (!nearest) return { action: "done", state };

  const aligned = nearest.error <= ALIGN_TOLERANCE_DEGREES;
  const steady = reading.unsteady <= STEADY_DEGREES;
  // Roll has no stable meaning when the camera points almost vertically: yaw
  // and roll collapse onto the same axis there. Requiring a level reading at
  // the two pole targets makes a perfectly centred circle impossible to hold.
  const level =
    Math.abs(nearest.target.pitch) >= 75 ||
    Math.abs(rollError(reading.roll)) <= ROLL_TOLERANCE_DEGREES;

  if (aligned && steady && level && reading.heldMs >= STEADY_MS) {
    return {
      action: "capture",
      target: nearest.target,
      state: record(state, nearest.target.id),
    };
  }

  return {
    action: "aim",
    target: nextInOrder(state) ?? nearest.target,
    nearest: nearest.target,
    error: nearest.error,
    aligned,
    steady,
    level,
    state,
  };
}

/**
 * How far from square the phone is, as a signed number between -180 and 180.
 *
 * Wrapped, because a roll of 359° is one degree the other way and not a phone
 * held upside down.
 */
export function rollError(roll: number): number {
  return ((roll + 540) % 360) - 180;
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
  // Said before "hold steady", because somebody holding a tilted phone
  // perfectly still will never be told why nothing is happening.
  if (!decision.level) return "Straighten the phone";
  if (decision.aligned) return "Hold still";
  return `${steer(decision.target, yawPitchOf(facing), false, false)} to ${decision.target.index}`;
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
  if (frameCount >= 20) return 1440;
  return 1600;
}

export { spherePlan, steer, type Target };
