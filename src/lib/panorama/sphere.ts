import { directionOf, verticalFov, type Vector3 } from "./orientation";

/**
 * Where to point the camera, to photograph a whole sphere.
 *
 * One horizontal ring photographs a band around the walls and nothing else. It
 * leaves the ceiling and the floor unphotographed, and an equirectangular
 * image has to fill those in with something — which, when the something is the
 * nearest row of pixels smeared to the pole, is the funnel collapsing to a
 * point that this replaces.
 *
 * The compact phone route uses a horizon ring, one ring at 45° on each side,
 * and the two poles. Eight + six + six + one + one gives the requested 22
 * photographs while still covering the floor and ceiling.
 */

/** How much of each frame should also appear in the next one round the ring. */
export const OVERLAP = 0.35;

/**
 * How much of each frame should also appear in the ring above it.
 *
 * Deliberately less than the horizontal figure, and measured rather than
 * guessed. On the synthetic room a 4:3 frame — 70° across, 55° tall — with
 * rings 45° apart is 18% vertical overlap, and it stitches at 0.797 from the
 * axis and 0.514 from 15cm out, with the sphere 100% covered. Asking for 35%
 * vertically instead would put the rings 36° apart, which is seven rings and
 * thirty-two photographs for a panorama that is no better.
 *
 * Why the two axes can differ: going round a ring, a frame's neighbour is the
 * only thing holding its yaw, so the overlap there is carrying the whole
 * match. Between rings there is already a chain of frames on each side that
 * agree with each other, and the ring above only has to be pinned to it.
 *
 * Eighteen per cent is the floor this was measured at, not a margin below one.
 * If it is ever lowered further, re-run the end-to-end check at both aspect
 * ratios: the failure it guards against is not a worse panorama, it is a
 * refusal with nothing wrong with the photographs.
 */
export const VERTICAL_OVERLAP = 0.18;

/**
 * What a phone's rear camera sees across its **long** axis, when it will not say.
 *
 * Along the long axis, not "horizontally", and the distinction is the whole of
 * a bug this used to have. A phone's rear camera covers roughly 70° across the
 * wide side of its sensor. Which side of the *frame* that is depends on how
 * the browser hands the video over: a 1920x1080 frame is 70° across and 43°
 * tall, and a 1080x1920 frame is 70° tall and 43° across.
 *
 * Applying 70 as the horizontal field of either one is right for the first and
 * overstates the second by about a factor of 1.6 — and a frame told it is half
 * again as wide as it is gets warped to half again its true size on the
 * sphere, which no amount of pose refinement recovers from. The stitcher
 * refused those captures outright.
 *
 * `fieldsOfView` below reads the frame and says which axis this belongs to.
 */
export const ASSUMED_LONG_AXIS_FOV = 70;

/**
 * Kept for the frames that never say what shape they were.
 *
 * The stitch route reads a field of view out of a stored frame's metadata and
 * needs a number when there is none. That number is the long-axis figure used
 * as a horizontal one, which is the old behaviour and is right for the
 * landscape frames it will mostly meet.
 */
export const ASSUMED_HFOV = ASSUMED_LONG_AXIS_FOV;

/**
 * The horizontal and vertical fields of a frame of this shape.
 *
 * One assumed number, resolved against the frame that actually arrived. The
 * long side gets `ASSUMED_LONG_AXIS_FOV`; the short side follows from the
 * aspect ratio through the same pinhole relation `verticalFov` uses.
 */
export function fieldsOfView(
  width: number,
  height: number,
  longAxisFov: number = ASSUMED_LONG_AXIS_FOV,
): { hfov: number; vfov: number } {
  // No guard for a zero-sized frame: `verticalFov` already returns the angle
  // it was given when either dimension is zero, so both branches below come
  // back with the assumed field on both axes. A second guard here was dead
  // code that read like a safety net.
  if (width >= height) {
    const hfov = longAxisFov;
    return { hfov, vfov: verticalFov(hfov, width, height) };
  }

  // A tall frame: the assumed field is the vertical one, and the horizontal
  // follows. `verticalFov` with the axes swapped is exactly that relation.
  const vfov = longAxisFov;
  return { hfov: verticalFov(vfov, height, width), vfov };
}

/**
 * The pitches photographed, top to bottom.
 *
 * Derived from how tall a frame is, by the same rule `ringCount` uses for how
 * wide one is — which is the symmetry this did not have, and the reason a
 * capture could come back with holes in it.
 *
 * These pitches were a constant: `[90, 45, 0, -45, -90]`, five rings 45° apart,
 * chosen to make the plan come to twenty-two photographs. Twenty-two is a good
 * number to ask somebody for. It is not a number that can be derived from a
 * frame, and a plan has to be.
 *
 * A 16:9 frame at 70° across is **43° tall**. Rings 45° apart, frames 43°
 * tall: every pair of rings has a two-degree band between them that nobody
 * photographs, and no overlap at all for the stitcher to match on. That is a
 * hole in the ceiling of every panorama and a correlation score with nothing
 * behind it, and it is why "Some areas could not be aligned correctly" could
 * come back from a capture somebody had shot perfectly.
 *
 * The way to get twenty-two photographs is not to space the rings further
 * apart than the camera can see. It is to hand the camera a taller frame —
 * which is what the capture now asks for, and which makes three rings and two
 * poles enough.
 */
export function ringPitches(vfov: number): number[] {
  // The same shape of stride as a ring's frames: advance by what a frame
  // covers, less the overlap that lets two of them be matched to each other.
  const step = Math.max(1, vfov * (1 - VERTICAL_OVERLAP));

  // How many rings it takes to get from the horizon to a pole, rounded up so
  // the last one reaches. Spacing is then evened out over that many, rather
  // than leaving a short ring at the top.
  const rings = Math.max(1, Math.ceil(90 / step));
  const spacing = 90 / rings;

  const pitches: number[] = [];
  for (let i = rings; i >= -rings; i -= 1) {
    pitches.push(Math.round(i * spacing * 100) / 100);
  }
  return pitches;
}

/**
 * Rings this far from the horizon may be left out and the capture still
 * counted as complete.
 *
 * Nothing, now. It used to be the poles: the zenith and the nadir are one
 * frame each and the two most awkward to reach, the nadir in particular being
 * a photograph of your own shoes.
 *
 * But a pole that is not photographed is not a missing photograph, it is a
 * **hole**. The stitcher fills small gaps from their neighbours and leaves
 * anything larger at rgb(28, 28, 30), deliberately, because inventing a
 * ceiling nobody photographed is worse than showing that one is missing. A
 * skipped zenith is therefore a dark navy patch in the middle of the ceiling
 * of the finished panorama — and the ceiling is what somebody looking at a
 * room photographed from the middle of it is looking at.
 *
 * So both poles are required. It is two more photographs out of twenty-two,
 * the capture screen already points at each one by number, and the alternative
 * is a finished tour with a hole in it that the person who made it cannot fix
 * without shooting the room again.
 */
export const OPTIONAL_PITCH = 91;

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
 * roughly cos(p) of its frames. Three is the floor: two photographs of a ring meet
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
export function spherePlan(
  hfov: number = ASSUMED_LONG_AXIS_FOV,
  /**
   * How tall a frame is.
   *
   * Defaults to the shape of the frame the capture asks the camera for, so a
   * caller that knows only the horizontal field still gets a plan whose rings
   * meet. A caller that knows the frame should pass `fieldsOfView(w, h).vfov`.
   */
  vfov: number = fieldsOfView(1080, 1920, hfov).vfov,
): Target[] {
  const targets: Target[] = [];

  ringPitches(vfov).forEach((pitch, ring) => {
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
