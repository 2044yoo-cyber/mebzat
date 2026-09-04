/**
 * The geometry behind a panorama view.
 *
 * This lives outside the viewer component because it is the part that can be
 * wrong in a way nobody notices: a hotspot half a screen from the door it
 * labels still *looks* like a working tour. Inside a React effect it can only
 * be checked by eye in a browser; out here it can be asserted.
 *
 * Angles crossing this boundary are degrees, because that is what the database
 * stores and what a person typing a heading means. Radians appear only inside.
 */

import * as THREE from "three";

/** Fully zoomed in, and fully out. Beyond either the view distorts badly. */
export const MIN_FOV = 25;
export const MAX_FOV = 100;

/**
 * Straight up and straight down are the two directions that flip the horizon,
 * because `lookAt` has no roll to fall back on when the target is parallel to
 * the up vector. Stopping just short of the poles avoids it.
 */
export const PITCH_LIMIT = Math.PI / 2 - 0.02;

const DEG = Math.PI / 180;

export function clampFov(value: number) {
  return Math.max(MIN_FOV, Math.min(MAX_FOV, value));
}

export function clampPitch(radians: number) {
  return Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, radians));
}

/**
 * How far the view turns per pixel dragged.
 *
 * Scaled by fov so a drag moves the same amount of *image* whether zoomed in
 * or out. Without it, zooming in makes the panorama feel like it is on ice.
 */
export function dragSpeed(fov: number) {
  return (fov / 75) * 0.0025;
}

/**
 * The point the camera looks at, given where the viewer has turned.
 *
 * Spherical coordinates take a polar angle measured down from +Y, so a pitch
 * of zero — the horizon — is a quarter turn from the top.
 */
export function lookTarget(yaw: number, pitch: number, out = new THREE.Vector3()) {
  return out.setFromSphericalCoords(1, Math.PI / 2 - pitch, yaw);
}

export type Projected = { x: number; y: number; visible: boolean };

/**
 * Where a hotspot lands on the screen, in CSS pixels from the top-left.
 *
 * `visible` is false behind the camera. Past z = 1 the perspective divide
 * flips sign, and a marker for the door behind you would be drawn on the wall
 * in front of you — mirrored, and pointing the wrong way.
 */
export function projectHotspot(
  camera: THREE.PerspectiveCamera,
  yawDegrees: number,
  pitchDegrees: number,
  width: number,
  height: number,
  scratch = new THREE.Vector3(),
): Projected {
  // The radius is arbitrary: the projection only cares about direction, and
  // anything inside the sphere and outside the near plane behaves the same.
  scratch.setFromSphericalCoords(10, Math.PI / 2 - pitchDegrees * DEG, yawDegrees * DEG);
  scratch.project(camera);

  return {
    x: ((scratch.x + 1) / 2) * width,
    y: ((1 - scratch.y) / 2) * height,
    visible: scratch.z < 1,
  };
}

/**
 * The same direction, expressed once.
 *
 * A yaw of -370° and one of 350° point at the same wall. Stored angles are
 * kept in 0–360 so a hotspot's coordinates mean the same thing whether the
 * person dragged clockwise or anticlockwise to reach it — and so two tours
 * built the same way do not hold different numbers for the same door.
 *
 * The doubled modulo is not redundant: JavaScript's `%` keeps the sign of its
 * left operand, so -370 % 360 is -10, not 350.
 */
export function normaliseDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}
