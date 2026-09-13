import { directionOf, type Vector3 } from "./orientation";

/**
 * Where to point the camera, to photograph a whole sphere.
 *
 * One horizontal ring photographs a band around the walls and nothing else. It
 * leaves the ceiling and the floor unphotographed, and an equirectangular
 * image has to fill those in with something — which, when the something is the
 * nearest row of pixels smeared to the pole, is the funnel collapsing to a
 * point that this replaces.
 *
 * So: rings at several pitches, each with as many frames as that ring needs.
 * A ring at 60° up is half the circumference of the one at the horizon, so it
 * needs about half as many photographs to be covered to the same standard, and
 * the poles need exactly one each.
 */

/** How much of each frame should also appear in its neighbour. */
export const OVERLAP = 0.35;

/** What a phone's rear camera sees across, in degrees, when it will not say. */
export const ASSUMED_HFOV = 60;

/** The pitches photographed, top to bottom. */
export const RING_PITCHES = [90, 60, 30, 0, -30, -60, -90] as const;

/**
 * Rings this far from the horizon may be left out and the capture still
 * counted as complete.
 *
 * The zenith and the nadir are one frame each and they are the two most
 * awkward to reach — the nadir in particular is a photograph of your own
 * shoes. Everything between is required, because a gap there is a hole in a
 * wall at eye level, which is the part anybody looking at the room will look
 * at.
 */
export const OPTIONAL_PITCH = 90;

export type Target = {
  id: string;
  /**
   * Where this one comes in the intended order, counting from 1.
   *
   * The plan has an order — the horizon first, then outwards — and until now
   * it was only implied. Putting the number on the marker means the route is
   * something the person can read off the screen and follow, and something
   * that can be talked about afterwards: "it stopped at 23" says where.
   */
  index: number;
  yaw: number;
  pitch: number;
  direction: Vector3;
  /** False for the poles, which are nice to have rather than required. */
  required: boolean;
};

/**
 * How many frames one ring needs.
 *
 * The ring at pitch p has cos(p) of the horizon's circumference, so it needs
 * cos(p) of its frames. Three is the floor: two photographs of a ring meet
 * themselves at both ends with no overlap to spare, and one is a pole.
 */
export function ringCount(pitch: number, hfov: number): number {
  if (Math.abs(pitch) >= 89) return 1;
  const step = hfov * (1 - OVERLAP);
  const circumference = 360 * Math.cos((pitch * Math.PI) / 180);
  return Math.max(3, Math.ceil(circumference / step));
}

/**
 * Every direction the capture wants a photograph of.
 *
 * Rings are staggered by half a step against the ring above, so that the gaps
 * between frames on one ring sit over the middles of the frames on the next
 * rather than lining up into a seam running from pole to pole.
 */
export function spherePlan(hfov: number = ASSUMED_HFOV): Target[] {
  const targets: Target[] = [];

  RING_PITCHES.forEach((pitch, ring) => {
    const count = ringCount(pitch, hfov);
    const stagger = ring % 2 === 0 ? 0 : 180 / count;

    for (let i = 0; i < count; i += 1) {
      const yaw = count === 1 ? 0 : ((i * 360) / count + stagger) % 360;
      targets.push({
        id: `${pitch}_${Math.round(yaw)}`,
        index: 0,
        yaw,
        pitch,
        direction: directionOf(yaw, pitch),
        required: Math.abs(pitch) < OPTIONAL_PITCH,
      });
    }
  });

  // The horizon first, then outwards: it is the part of a room people look at,
  // and a capture abandoned halfway should have got the useful half.
  const ordered = targets.sort((a, b) => Math.abs(a.pitch) - Math.abs(b.pitch));

  // Numbered after sorting, so the numbers run in the order they are meant to
  // be photographed rather than the order they were generated in.
  return ordered.map((target, i) => ({ ...target, index: i + 1 }));
}

/** The target nearest to where the camera is pointing, of those still wanted. */
export function nearestTarget(
  plan: readonly Target[],
  taken: ReadonlySet<string>,
  facing: Vector3,
): { target: Target; error: number } | null {
  // Compared by cosine rather than by angle, and only the winner is converted.
  //
  // This runs on every animation frame against every target, and `angleBetween`
  // normalises both vectors and takes an arccosine — three allocations and a
  // transcendental function, forty times, sixty times a second. Both vectors
  // here are already unit length: a target's direction is built that way and
  // the camera's comes out of a rotation matrix. Cosine decreases as the angle
  // grows, so the nearest target is simply the largest dot product.
  let bestTarget: Target | null = null;
  let bestCos = -2;

  for (const target of plan) {
    if (taken.has(target.id)) continue;
    const d = target.direction;
    const cos = facing[0] * d[0] + facing[1] * d[1] + facing[2] * d[2];
    if (cos > bestCos) {
      bestCos = cos;
      bestTarget = target;
    }
  }

  if (!bestTarget) return null;
  return {
    target: bestTarget,
    error: (Math.acos(Math.max(-1, Math.min(1, bestCos))) * 180) / Math.PI,
  };
}

export type Coverage = {
  taken: number;
  total: number;
  /** Required targets still missing, nearest the horizon first. */
  missing: Target[];
  /** True when every required direction has been photographed. */
  complete: boolean;
};

/**
 * What has been photographed and what has not.
 *
 * `complete` is what the Finish button is allowed to depend on. Section 8: an
 * area of the sphere that was not captured does not become captured by being
 * asked for politely, and letting somebody finish with a hole in the room
 * means the stitcher has to invent that part or stretch something into it.
 */
export function coverage(
  plan: readonly Target[],
  taken: ReadonlySet<string>,
): Coverage {
  const missing = plan.filter((t) => t.required && !taken.has(t.id));
  return {
    taken: taken.size,
    total: plan.length,
    missing,
    complete: missing.length === 0,
  };
}

/** What the screen should be telling somebody to do to reach this target. */
export function steer(
  target: { yaw: number; pitch: number },
  facing: { yaw: number; pitch: number },
  aligned: boolean,
  steady: boolean,
): string {
  if (aligned && steady) return "Captured";
  if (aligned) return "Hold steady…";

  const turn = ((target.yaw - facing.yaw + 540) % 360) - 180;
  const tilt = target.pitch - facing.pitch;

  // Whichever is further out is the one worth naming. Two instructions at once
  // is two things to get wrong.
  if (Math.abs(turn) >= Math.abs(tilt)) {
    return Math.abs(turn) < 20
      ? turn > 0
        ? "A little right"
        : "A little left"
      : turn > 0
        ? "Turn right"
        : "Turn left";
  }
  return Math.abs(tilt) < 20
    ? tilt > 0
      ? "Look slightly up"
      : "Look slightly down"
    : tilt > 0
      ? "Look up"
      : "Look down";
}
