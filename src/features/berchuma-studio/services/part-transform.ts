import type { Part, Vec3 } from "../types/parts";

/** A generated placement is the rotated local box's lower/front/left pivot. */
export type PartPlacement = Vec3;

export type PlanPoint = { x: number; z: number };

export type PlanBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

/** Transforms a local plan point with the same +y rotation convention as parts. */
export function transformPlanPoint(
  origin: PlanPoint,
  rotationDegrees: number,
  local: PlanPoint,
): PlanPoint {
  const radians = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: origin.x + local.x * cos - local.z * sin,
    z: origin.z + local.x * sin + local.z * cos,
  };
}

/** Axis-aligned world footprint of a rotated local rectangle. */
export function rotatedRectBounds(
  origin: PlanPoint,
  size: { width: number; depth: number },
  rotationDegrees = 0,
): PlanBounds {
  const corners = [
    transformPlanPoint(origin, rotationDegrees, { x: 0, z: 0 }),
    transformPlanPoint(origin, rotationDegrees, { x: size.width, z: 0 }),
    transformPlanPoint(origin, rotationDegrees, { x: 0, z: size.depth }),
    transformPlanPoint(origin, rotationDegrees, { x: size.width, z: size.depth }),
  ];
  return {
    minX: Math.min(...corners.map((corner) => corner.x)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    minZ: Math.min(...corners.map((corner) => corner.z)),
    maxZ: Math.max(...corners.map((corner) => corner.z)),
  };
}

/** Union of plan footprints, including arbitrary custom rotations. */
export function unionPlanBounds(bounds: readonly PlanBounds[]): PlanBounds {
  if (bounds.length === 0) {
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  }
  return {
    minX: Math.min(...bounds.map((bound) => bound.minX)),
    maxX: Math.max(...bounds.map((bound) => bound.maxX)),
    minZ: Math.min(...bounds.map((bound) => bound.minZ)),
    maxZ: Math.max(...bounds.map((bound) => bound.maxZ)),
  };
}

export function partRotationRadians(part: Pick<Part, "rotationY">): number {
  return ((part.rotationY ?? 0) * Math.PI) / 180;
}

/**
 * Centre of a possibly rotated part in design millimetres.
 *
 * `buildParts` has already rotated the local placement into the room frame;
 * the half-size offset still has to rotate around that placement before a 3D
 * mesh can be centred. Applying only a mesh rotation twists an asymmetric
 * gable around the wrong point and shifts it off its cut-list geometry.
 */
export function partCentre(
  part: Pick<Part, "size" | "rotationY">,
  placement: PartPlacement,
): Vec3 {
  const centre = transformPlanPoint(
    placement,
    part.rotationY ?? 0,
    { x: part.size.x / 2, z: part.size.z / 2 },
  );

  return {
    x: centre.x,
    y: placement.y + part.size.y / 2,
    z: centre.z,
  };
}

/** Axis-aligned world bounds used by collision checks for rotated L/U runs. */
export function partWorldBounds(
  part: Pick<Part, "size" | "rotationY">,
  placement: PartPlacement,
): { min: Vec3; max: Vec3 } {
  const centre = partCentre(part, placement);
  const radians = partRotationRadians(part);
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const halfX = (cos * part.size.x + sin * part.size.z) / 2;
  const halfZ = (sin * part.size.x + cos * part.size.z) / 2;

  return {
    min: {
      x: centre.x - halfX,
      y: centre.y - part.size.y / 2,
      z: centre.z - halfZ,
    },
    max: {
      x: centre.x + halfX,
      y: centre.y + part.size.y / 2,
      z: centre.z + halfZ,
    },
  };
}
