import { CLEARANCE_LIMITS, DEFAULT_CLEARANCE } from "./door-sizing";
import type { DesignSpec, HingeType } from "../types/spec";

/**
 * The edits behind the hinge-type selector and the clearance field.
 *
 * Each returns a new spec and changes only what it names. Doors sized by hand
 * keep the size typed — Manual means the size is theirs — and one that no
 * longer fits beside its automatic neighbours goes back to its automatic size
 * with the reason, as `cabinetFronts` does for any manual door that does not
 * fit. Reset to Auto, on one door or all, drops the sizes and lets the
 * formulas of the hinge now selected work them out again.
 */

/** The hinge doors hang on. A design sized the old way takes the default clearance with it. */
export function setHingeType(spec: DesignSpec, hinge: HingeType): DesignSpec {
  return { ...spec, doorSizing: { hinge, clearance: spec.doorSizing?.clearance ?? DEFAULT_CLEARANCE } };
}

/** The gap between adjacent doors, mm: kept within what a door can have, to a tenth. */
export function setDoorClearance(spec: DesignSpec, clearance: number): DesignSpec {
  const value = Math.round(Math.min(CLEARANCE_LIMITS.max, Math.max(CLEARANCE_LIMITS.min, Number.isFinite(clearance) ? clearance : DEFAULT_CLEARANCE)) * 10) / 10;
  return { ...spec, doorSizing: { hinge: spec.doorSizing?.hinge ?? "full", clearance: value } };
}

/** Every door of every cabinet back to its automatic size. */
export function resetAllDoorSizes(spec: DesignSpec): DesignSpec {
  return {
    ...spec,
    cabinets: spec.cabinets.map((cabinet) => ({
      ...cabinet,
      bays: cabinet.bays.map(({ doorOverrides: _dropped, ...bay }) => { void _dropped; return bay; }),
    })),
  };
}

/** How many doors in the design have a size of their own. */
export function manualDoorCount(spec: DesignSpec): number {
  return spec.cabinets.reduce((total, cabinet) => total + cabinet.bays.reduce((sum, bay) => sum + (bay.doorOverrides?.length ?? 0), 0), 0);
}
