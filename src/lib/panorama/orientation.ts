/**
 * Where the phone is pointing, and where a point in the room lands on screen.
 *
 * This is the whole of the gyroscope interaction, written as arithmetic over
 * plain numbers so that it can be checked without a phone. Nothing here
 * animates anything: a target moves across the screen because the projection
 * of a fixed direction changes when the camera's rotation changes, which is
 * the same reason the room moves.
 *
 * ## The frames of reference
 *
 * `deviceorientation` reports three angles in the W3C convention: a rotation
 * about Z (alpha), then about the new X (beta), then about the new Y (gamma) —
 * intrinsic Z-X'-Y''. The world frame is East-North-Up, so Z is up and gravity
 * is -Z. The device frame is x to the right of the screen, y towards its top,
 * z out of the glass towards the face. A phone's rear camera therefore looks
 * along the device's -z.
 *
 * ## Why not the compass
 *
 * Indoors, a magnetometer sits inside a steel-reinforced building next to a
 * fridge, and its idea of north wanders. Every yaw here is measured from
 * wherever the phone was pointing when the capture began — `withLocalZero`
 * does that — so the absolute bearing is never relied on. Pitch is left
 * absolute because it comes from gravity, which is not confused by a fridge.
 */

export type Matrix3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export type Vector3 = readonly [number, number, number];

export type YawPitch = { yaw: number; pitch: number };

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/**
 * The device-to-world rotation for one sensor reading.
 *
 * Multiplied out rather than composed from three matrices: this runs on every
 * animation frame on a phone, and the compiler cannot do this arithmetic for
 * us.
 */
export function rotationMatrix(
  alpha: number,
  beta: number,
  gamma: number,
): Matrix3 {
  const a = alpha * RAD;
  const b = beta * RAD;
  const g = gamma * RAD;

  const cA = Math.cos(a);
  const sA = Math.sin(a);
  const cB = Math.cos(b);
  const sB = Math.sin(b);
  const cG = Math.cos(g);
  const sG = Math.sin(g);

  // R = Rz(alpha) · Rx(beta) · Ry(gamma), the W3C Z-X'-Y'' composition.
  return [
    cA * cG - sA * sB * sG, -sA * cB, cA * sG + sA * sB * cG,
    sA * cG + cA * sB * sG, cA * cB, sA * sG - cA * sB * cG,
    -cB * sG, sB, cB * cG,
  ];
}

/** Multiply a direction in the device frame into the world frame. */
export function apply(r: Matrix3, v: Vector3): Vector3 {
  return [
    r[0] * v[0] + r[1] * v[1] + r[2] * v[2],
    r[3] * v[0] + r[4] * v[1] + r[5] * v[2],
    r[6] * v[0] + r[7] * v[1] + r[8] * v[2],
  ];
}

/** The rear camera's line of sight: the device's -z, in world coordinates. */
export function forwardOf(r: Matrix3): Vector3 {
  return [-r[2], -r[5], -r[8]];
}

/** Screen-right, in world coordinates. */
export function rightOf(r: Matrix3): Vector3 {
  return [r[0], r[3], r[6]];
}

/** Screen-up, in world coordinates. */
export function upOf(r: Matrix3): Vector3 {
  return [r[1], r[4], r[7]];
}

export function dot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function normalise(v: Vector3): Vector3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length === 0 ? [0, 1, 0] : [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * A direction as a compass-style yaw and a gravity-referenced pitch.
 *
 * Yaw is measured from +Y (north, or the local zero) and increases towards +X,
 * which is the direction somebody turning to their right goes. Pitch is
 * positive upwards, ±90° at the poles.
 */
export function yawPitchOf(v: Vector3): YawPitch {
  const [x, y, z] = normalise(v);
  return {
    yaw: ((Math.atan2(x, y) * DEG) % 360 + 360) % 360,
    pitch: Math.asin(Math.max(-1, Math.min(1, z))) * DEG,
  };
}

/** The unit direction a yaw and pitch name. The inverse of `yawPitchOf`. */
export function directionOf(yaw: number, pitch: number): Vector3 {
  const y = yaw * RAD;
  const p = pitch * RAD;
  const flat = Math.cos(p);
  return [flat * Math.sin(y), flat * Math.cos(y), Math.sin(p)];
}

/**
 * Re-express a rotation so that `zeroYaw` becomes yaw 0.
 *
 * This is what makes the first frame's direction the origin of the capture
 * rather than magnetic north: a yaw-only rotation applied on the world side,
 * which leaves pitch and roll — the gravity-referenced parts — untouched.
 */
export function withLocalZero(r: Matrix3, zeroYaw: number): Matrix3 {
  // Positive, not negative. Yaw here is atan2(x, y), and a rotation of +t
  // about Z carries +Y towards -X — so Rz(+t) *decreases* yaw by t, which is
  // what subtracting the starting yaw means. Written the intuitive way round
  // it doubled the yaw instead of cancelling it, and every target sat in a
  // mirror image of where it belonged.
  const a = zeroYaw * RAD;
  const c = Math.cos(a);
  const s = Math.sin(a);
  // Rz(-zeroYaw) · r, with the zero row and column of Rz written out.
  return [
    c * r[0] - s * r[3], c * r[1] - s * r[4], c * r[2] - s * r[5],
    s * r[0] + c * r[3], s * r[1] + c * r[4], s * r[2] + c * r[5],
    r[6], r[7], r[8],
  ];
}

/** How far apart two directions are, in degrees. */
export function angleBetween(a: Vector3, b: Vector3): number {
  const cosine = Math.max(-1, Math.min(1, dot(normalise(a), normalise(b))));
  return Math.acos(cosine) * DEG;
}

/** The signed shortest way round from `from` to `to`, in degrees. */
export function yawError(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export type Screen = { x: number; y: number };

/**
 * Where a direction in the room lands on the screen.
 *
 * -1 is the left edge and +1 the right; -1 is the bottom and +1 the top. Null
 * when the direction is behind the camera or outside the frame, which is the
 * difference between a target to aim at and an arrow pointing off-screen.
 *
 * This is an ordinary pinhole projection. It is the reason the interaction
 * cannot be faked with an animation: the number that comes out depends on the
 * rotation matrix and on nothing else, so if the phone does not move the
 * target does not move, and if it turns 90° a target 90° away arrives dead
 * centre.
 */
export function project(
  direction: Vector3,
  r: Matrix3,
  hfov: number,
  vfov: number,
  margin = 1.6,
): Screen | null {
  const forward = forwardOf(r);
  const depth = dot(direction, forward);
  if (depth <= 1e-6) return null;

  const x = dot(direction, rightOf(r)) / depth / Math.tan((hfov / 2) * RAD);
  const y = dot(direction, upOf(r)) / depth / Math.tan((vfov / 2) * RAD);

  // A little past the edge is still drawable — a target creeping in from the
  // side is how somebody knows which way to keep turning.
  if (Math.abs(x) > margin || Math.abs(y) > margin) return null;
  return { x, y };
}

/**
 * The vertical field of view implied by a horizontal one and an aspect ratio.
 *
 * Phones report neither, so the horizontal figure is an assumption and this
 * keeps the vertical one consistent with it rather than guessing twice.
 */
export function verticalFov(hfov: number, width: number, height: number): number {
  if (width <= 0 || height <= 0) return hfov;
  const half = Math.tan((hfov / 2) * RAD) * (height / width);
  return Math.atan(half) * 2 * DEG;
}

/**
 * How still the phone has been, as the largest angle it has moved through
 * across the readings held.
 *
 * Auto-capture waits for this to be small, because the shutter firing the
 * instant the target is crossed catches the phone mid-swing and every frame
 * comes out smeared.
 */
export function unsteadiness(recent: readonly Vector3[]): number {
  if (recent.length < 2) return 180;
  let worst = 0;
  for (let i = 1; i < recent.length; i += 1) {
    worst = Math.max(worst, angleBetween(recent[i - 1], recent[i]));
  }
  return worst;
}

export type Basis = { forward: Vector3; right: Vector3; up: Vector3 };

/**
 * The camera's axes for a yaw and pitch, with no roll.
 *
 * At the poles `forward` is parallel to world up and the cross product that
 * normally gives "right" collapses, so the yaw is used directly to pick one —
 * which is the right answer anyway: at the zenith, yaw is the only thing that
 * says which way up the photograph is.
 */
export function levelBasis(yaw: number, pitch: number): Basis {
  const forward = directionOf(yaw, pitch);
  const right: Vector3 =
    Math.abs(forward[2]) > 0.999
      ? [Math.cos(yaw * RAD), -Math.sin(yaw * RAD), 0]
      : normalise([forward[1], -forward[0], 0]);
  const up: Vector3 = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  return { forward, right, up: normalise(up) };
}

/**
 * How far the phone is rolled about its own line of sight.
 *
 * Recorded at capture and replayed at stitch, which is the only reason the two
 * agree: a sign convention invented separately in two files is a panorama
 * where every frame is mirrored about its own centre, and the arithmetic looks
 * right in both places.
 */
export function rollOf(r: Matrix3): number {
  const forward = forwardOf(r);
  const { yaw, pitch } = yawPitchOf(forward);
  const level = levelBasis(yaw, pitch);
  const up = upOf(r);
  return Math.atan2(dot(up, level.right), dot(up, level.up)) * DEG;
}

/** The camera's axes for a recorded pose. The inverse of `rollOf`. */
export function basisFrom(yaw: number, pitch: number, roll: number): Basis {
  const level = levelBasis(yaw, pitch);
  const c = Math.cos(roll * RAD);
  const s = Math.sin(roll * RAD);
  return {
    forward: level.forward,
    right: [
      level.right[0] * c - level.up[0] * s,
      level.right[1] * c - level.up[1] * s,
      level.right[2] * c - level.up[2] * s,
    ],
    up: [
      level.right[0] * s + level.up[0] * c,
      level.right[1] * s + level.up[1] * c,
      level.right[2] * s + level.up[2] * c,
    ],
  };
}
