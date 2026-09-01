import { placeOnRun, solveLayout, type SolvedLayout } from "./layout";
import type { Cabinet, DesignSpec } from "../types/spec";
import type { RunPlacement } from "../types/layout";

/**
 * Turning a spec into placed geometry.
 *
 * The one function between "what the customer said" and "where the boxes are".
 * Everything downstream — the viewer, the cut list, the worktop, the costing —
 * reads its output rather than the spec's stored positions, which is what
 * makes Part 59 true: change a wall length and every consequence follows from
 * this one recomputation.
 *
 * ## Stored positions are a fallback, not the truth
 *
 * A cabinet with a `runId` is placed by its run. A cabinet without one keeps
 * the position it was given — that is the island, the free-standing dresser,
 * and every design authored before runs existed and not yet migrated.
 *
 * Both are legitimate, and the distinction is visible in the result so the
 * editor can say "this module is on Wall B at 900 mm" for one and "this island
 * is at x 2100" for the other. Presenting a run-placed cabinet's coordinates
 * as though somebody had chosen them is how a person ends up dragging a box
 * that will snap back on the next edit.
 *
 * Pure. Runs under plain Node in the check script.
 */

export type PlacedCabinet = {
  cabinet: Cabinet;
  /** Plan position of the cabinet's left-front corner, in the design frame. */
  x: number;
  z: number;
  /** Floor to the cabinet's underside. Straight from the spec. */
  y: number;
  /** Degrees anticlockwise about y. Zero for anything not on a turned run. */
  rotation: number;
  /** The run it belongs to, or null when it is placed by hand. */
  runId: string | null;
  /** How far along its run it sits. Null for a hand-placed cabinet. */
  offset: number | null;
};

export type ResolvedDesign = {
  layout: SolvedLayout;
  cabinets: PlacedCabinet[];
  /**
   * Problems that are about the arrangement rather than about one cabinet.
   *
   * Kept separate from the spec's own validation issues because they are
   * recomputed on every edit and are often transient — a run is briefly
   * over-filled while somebody is typing a new wall length.
   */
  issues: string[];
};

export function resolveDesign(spec: DesignSpec): ResolvedDesign {
  const layout = solveLayout(spec.layout, spec.runs, {
    cornerKind: spec.cornerKind,
  });

  const byRun = new Map<string, RunPlacement>(
    layout.placements.map((placement) => [placement.runId, placement]),
  );

  const cabinets: PlacedCabinet[] = [];
  const issues: string[] = [...layout.notes];

  // How much of each run is spoken for, so an over-filled run is reported
  // once with a number rather than once per cabinet.
  const filled = new Map<string, number>();

  for (const cabinet of spec.cabinets) {
    const placement = cabinet.runId ? byRun.get(cabinet.runId) : undefined;

    if (!placement) {
      if (cabinet.runId) {
        // A dangling run reference. The cabinet still has to appear somewhere
        // — dropping it would delete a customer's module because a run was
        // renamed — so it falls back to its stored position and says so.
        issues.push(
          `${cabinet.label} refers to a run that no longer exists, so it is shown where it was last placed.`,
        );
      }

      cabinets.push({
        cabinet,
        x: cabinet.position.x,
        z: cabinet.position.z,
        y: cabinet.position.y,
        rotation: 0,
        runId: null,
        offset: null,
      });
      continue;
    }

    const offset = cabinet.offset ?? 0;
    const placed = placeOnRun(placement, offset);

    cabinets.push({
      cabinet,
      x: placed.x,
      z: placed.z,
      y: cabinet.position.y,
      rotation: placed.rotation,
      runId: placement.runId,
      offset,
    });

    // Wall units sit above base units on the same run and share its length —
    // counting both would report every kitchen as twice over-filled. Fill is
    // measured per kind, and only the fullest kind is reported.
    const key = `${placement.runId}:${cabinet.kind}`;
    filled.set(key, (filled.get(key) ?? 0) + cabinet.size.width);
  }

  for (const placement of layout.placements) {
    let worst = 0;
    for (const [key, used] of filled) {
      if (key.startsWith(`${placement.runId}:`)) worst = Math.max(worst, used);
    }

    if (worst > placement.usableLength + 1) {
      issues.push(
        `${placement.label} holds ${Math.round(worst)} mm of cabinets but only ` +
          `${Math.round(placement.usableLength)} mm is free after the corner. ` +
          `Lengthen the wall or narrow a module.`,
      );
    }
  }

  return { layout, cabinets, issues };
}

/**
 * The next free offset on a run, for "+ Module".
 *
 * Measured per cabinet kind for the same reason the fill check is: adding a
 * wall unit to a kitchen should place it above the base units, at its own
 * offset, not after them.
 */
export function nextOffset(
  spec: DesignSpec,
  runId: string,
  kind: Cabinet["kind"],
): number {
  let end = 0;

  for (const cabinet of spec.cabinets) {
    if (cabinet.runId !== runId || cabinet.kind !== kind) continue;
    end = Math.max(end, (cabinet.offset ?? 0) + cabinet.size.width);
  }

  return end;
}

/**
 * How much room is left on a run for another cabinet of this kind.
 *
 * Negative when the run is already over-filled, which the caller shows rather
 * than clamping — a person who has typed a wall length that no longer fits
 * their kitchen needs to see by how much.
 */
export function remainingOn(
  spec: DesignSpec,
  runId: string,
  kind: Cabinet["kind"],
): number {
  const layout = solveLayout(spec.layout, spec.runs, {
    cornerKind: spec.cornerKind,
  });

  const placement = layout.placements.find((entry) => entry.runId === runId);
  if (!placement) return 0;

  return placement.usableLength - nextOffset(spec, runId, kind);
}

/**
 * The worktop's path, as a polyline along the fronts of the base runs.
 *
 * Follows the layout rather than being drawn per run, so an L gets one
 * continuous worktop with a mitre at the corner instead of two slabs that
 * happen to meet. The corner squares are included: a worktop with a hole where
 * the corner cabinet is would be a worktop nobody could put a kettle on.
 *
 * Returns plan rectangles rather than a single polygon. A rectangle per run
 * plus one per corner tiles the same area, is trivially correct, and is what
 * both the viewer and the sheet-goods calculation want — the alternative is a
 * polygon that has to be triangulated before either can use it.
 */
export function worktopSections(
  resolved: ResolvedDesign,
  options: { overhang?: number } = {},
): { x: number; z: number; width: number; depth: number }[] {
  const overhang = options.overhang ?? 0;
  const sections: { x: number; z: number; width: number; depth: number }[] = [];

  for (const placement of resolved.layout.placements) {
    const alongX = placement.rotation % 180 === 0;

    sections.push({
      x: placement.origin.x,
      z: placement.origin.z,
      width: alongX ? placement.usableLength : placement.depth + overhang,
      depth: alongX ? placement.depth + overhang : placement.usableLength,
    });
  }

  for (const corner of resolved.layout.corners) {
    sections.push({
      x: corner.x,
      z: corner.z,
      width: corner.size,
      depth: corner.size,
    });
  }

  return sections;
}

/** Total worktop area in square metres, for the BOQ. */
export function worktopArea(
  sections: { width: number; depth: number }[],
): number {
  const mm2 = sections.reduce(
    (total, section) => total + section.width * section.depth,
    0,
  );
  return Math.round((mm2 / 1_000_000) * 1000) / 1000;
}
