import type { DrawerRunner } from "../types/spec";
import { DRAWER_FRONT_GAP, distributeDimension } from "./dimensions";

export { DRAWER_FRONT_GAP } from "./dimensions";

/** A practical drawer side never needs to be taller than this in 18 mm board. */
export const MAX_DRAWER_SIDE_HEIGHT = 160;

/** The reference box side is roughly three quarters of its 176 mm front. */
const DRAWER_SIDE_RATIO = 0.75;

/**
 * A generic full-extension runner profile used when a legacy design has no
 * runner selected. A 500 mm runner creates a 480 mm box side, matching the
 * measured OBJ while still leaving real clearance to the 6 mm back.
 */
export const DEFAULT_DRAWER_RUNNER: DrawerRunner = {
  nominalLengths: [300, 350, 400, 450, 500, 550, 600],
  sideClearance: 13,
  frontSetback: 20,
  rearClearance: 20,
  boxLengthAllowance: 20,
};

/** The shortest stocked runner in a profile. */
export function shortestRunnerLength(runner?: DrawerRunner): number {
  const lengths = runner?.nominalLengths ?? DEFAULT_DRAWER_RUNNER.nominalLengths;
  return Math.min(...lengths);
}

/**
 * Minimum clear internal depth for a real stocked drawer runner and box.
 *
 * A 300 mm runner needs its own nominal length plus the front/rear clearances
 * and the drawer-box allowance. Below this point a fake short runner is not a
 * useful fallback — it is an unmanufacturable part — so validation deepens the
 * wardrobe before geometry is generated.
 */
export function minimumDrawerInteriorDepth(runner?: DrawerRunner): number {
  const profile = runner ?? DEFAULT_DRAWER_RUNNER;
  return (
    shortestRunnerLength(profile) +
    profile.frontSetback +
    profile.rearClearance +
    profile.boxLengthAllowance
  );
}

export type DrawerFace = {
  index: number;
  /** Visible front height in millimetres. */
  height: number;
  /** Height of the front's bottom edge above the design floor. */
  floor: number;
};

export type DrawerConstruction = {
  faces: DrawerFace[];
  runner: DrawerRunner;
  /** Selected nominal runner length, or the available custom length if shallow. */
  runnerLength: number;
  sideClearance: number;
  frontSetback: number;
  rearClearance: number;
  boxWidth: number;
  boxDepth: number;
  /** Actual space between the back of the box and the inside of the back panel. */
  actualRearClearance: number;
  /** One side height for each matching drawer front. */
  sideHeights: number[];
  bottomThickness: number;
  sideThickness: number;
};

export type DrawerConstructionInput = {
  openingWidth: number;
  openingHeight: number;
  openingFloor: number;
  interiorDepth: number;
  count: number;
  frontHeights?: number[];
  drawerSideThickness: number;
  drawerBottomThickness: number;
  runner?: DrawerRunner;
};

/**
 * Resolves the front bands of a drawer bank.
 *
 * This is deliberately shared by the box builder, front builder and elevation
 * renderer. If those consumers made their own equal-division calculation, a
 * front could look aligned while being assigned to a different box in the cut
 * list.
 */
export function resolveDrawerFaces(input: {
  count: number;
  openingHeight: number;
  openingFloor: number;
  frontHeights?: number[];
  gap?: number;
}): DrawerFace[] {
  const count = Math.max(1, Math.floor(input.count));
  const gap = Math.max(0, input.gap ?? DRAWER_FRONT_GAP);
  // Board parts are cut in whole millimetres. Flooring a fractional shared
  // stack band is deliberately conservative: a front may leave less than a
  // millimetre of tolerance, but it can never grow past its physical opening.
  const available = Math.max(
    0,
    Math.floor(input.openingHeight - (count - 1) * gap),
  );
  const heights = proportionalHeights(input.frontHeights, count, available);

  const faces: DrawerFace[] = [];
  let ceiling = input.openingFloor + input.openingHeight;

  for (const [index, height] of heights.entries()) {
    ceiling -= height;
    faces.push({ index, height, floor: ceiling });
    ceiling -= gap;
  }

  return faces;
}

/** The exact visible heights, normalised to the opening after inter-front gaps. */
export function drawerFrontHeights(
  count: number,
  openingHeight: number,
  declared?: number[],
): number[] {
  return resolveDrawerFaces({
    count,
    openingHeight,
    openingFloor: 0,
    frontHeights: declared,
  }).map((face) => face.height);
}

/**
 * Converts a drawer face from the construction frame (measured upward from an
 * opening's floor) into SVG's downward-facing frame. The elevation uses this
 * instead of its own stack arithmetic, so an unequal top/bottom pair cannot
 * be shown in reverse order from the manufactured fronts.
 */
export function drawerFaceSvgTop(
  face: DrawerFace,
  openingTop: number,
  openingHeight: number,
): number {
  return openingTop + openingHeight - (face.floor + face.height);
}

/**
 * The shared drawer construction rule used for actual board parts.
 *
 * All dimensions come from the clear opening and selected runner profile. It
 * returns cut dimensions only; placement remains with geometry.ts, where the
 * enclosing bay's x/z origin is known.
 */
export function resolveDrawerConstruction(
  input: DrawerConstructionInput,
): DrawerConstruction {
  const runner = input.runner ?? DEFAULT_DRAWER_RUNNER;
  const faces = resolveDrawerFaces(input);
  const availableBoxDepth = Math.max(
    0,
    input.interiorDepth - runner.frontSetback - runner.rearClearance,
  );
  // A runner's nominal length includes the allowance occupied by the drawer's
  // front/rear members. Subtract it before selecting a stocked runner: at a
  // 600 mm cabinet this selects a 500 mm runner and the measured 480 mm box
  // side, rather than an over-long 550 mm runner.
  const availableRunnerDepth = Math.max(
    0,
    availableBoxDepth - runner.boxLengthAllowance,
  );
  const supported = [...runner.nominalLengths]
    .filter((length) => length <= availableRunnerDepth)
    .sort((a, b) => a - b);
  const runnerLength = supported.at(-1);
  if (runnerLength === undefined) {
    throw new RangeError(
      `Drawer opening is ${Math.round(input.interiorDepth)} mm deep; ${Math.round(minimumDrawerInteriorDepth(runner))} mm is required for the shortest stocked runner.`,
    );
  }
  const boxDepth = Math.max(
    0,
    Math.min(
      availableBoxDepth,
      runnerLength - runner.boxLengthAllowance,
    ),
  );
  const boxWidth = Math.max(0, input.openingWidth - 2 * runner.sideClearance);

  return {
    faces,
    runner,
    runnerLength,
    sideClearance: runner.sideClearance,
    frontSetback: runner.frontSetback,
    rearClearance: runner.rearClearance,
    boxWidth,
    boxDepth,
    actualRearClearance: Math.max(
      0,
      input.interiorDepth - runner.frontSetback - boxDepth,
    ),
    sideHeights: faces.map((face) =>
      Math.max(
        0,
        Math.min(
          Math.round(face.height * DRAWER_SIDE_RATIO),
          MAX_DRAWER_SIDE_HEIGHT,
          face.height - input.drawerBottomThickness,
        ),
      ),
    ),
    bottomThickness: input.drawerBottomThickness,
    sideThickness: input.drawerSideThickness,
  };
}

function proportionalHeights(
  declared: number[] | undefined,
  count: number,
  available: number,
): number[] {
  const weights =
    declared?.length === count && declared.every((height) => height > 0)
      ? declared
      : Array.from({ length: count }, () => 1);
  return distributeDimension(weights, available);
}
