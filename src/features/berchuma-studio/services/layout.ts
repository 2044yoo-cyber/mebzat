import {
  cornerKinds,
  type CornerKind,
  type LayoutKind,
  type RunPlacement,
  type RunSpec,
  type WallRunId,
} from "../types/layout";

/**
 * Where the cabinet runs actually sit.
 *
 * This is the file that makes an L-shaped kitchen an L-shaped kitchen rather
 * than two straight kitchens drawn near each other. Every position below is
 * *computed* from the wall lengths and the depth — nothing is stored, so
 * changing Wall A moves the corner and the whole of Wall B without anybody
 * having to remember to.
 *
 * ## The corner is the whole problem
 *
 * Two runs of depth `d` meeting at a right angle overlap in a `d × d` square.
 * Drawing both runs at their full wall length puts two carcasses in the same
 * cubic half-metre: the doors foul each other, the cut list counts two side
 * panels that cannot both exist, and the BOQ charges for both.
 *
 * So the corner square is carved out and owned by exactly one thing — a corner
 * module — and the two runs stop short of it:
 *
 *     ┌─────────────────────────┬───────┐   z = 0  (back wall)
 *     │      Run A  (La − d)    │corner │
 *     └─────────────────────────┼───────┤   z = d
 *                               │       │
 *                               │ Run B │
 *                               │(Lb−d) │
 *                               └───────┘
 *                             x = La−d   x = La
 *
 * `La` and `Lb` are the *wall* lengths, which is what somebody measures and
 * what the brief's example gives. The runs are shorter than their walls by the
 * depth, and that difference is the corner.
 *
 * ## Coordinates
 *
 * Plan only: x runs right, z runs away from the viewer into the room. Heights
 * are not this file's business — a wall unit and a base unit share a footprint
 * and differ in y, which the cabinet's own `position.y` carries.
 *
 * `rotation` is degrees anticlockwise about the y axis, so 0 means the run
 * travels along +x with its back at low z, and 90 means it travels along +z
 * with its back at high x. Only right angles are produced here; the type
 * allows any angle so a custom layout can be drawn later without a schema
 * change.
 *
 * Pure. No React, no three.js, no database — the check script runs it under
 * plain Node and the viewer, the cut list and the costing all read the same
 * numbers.
 */

/** The corner square, once, owned by nobody's run. */
export type CornerBlock = {
  id: string;
  kind: CornerKind;
  /** Plan position of the square's minimum corner. */
  x: number;
  z: number;
  /** Always the run depth: a corner between two `d`-deep runs is `d × d`. */
  size: number;
  /** The two runs it joins, in order. */
  between: [WallRunId, WallRunId];
  height: number;
};

export type SolvedLayout = {
  kind: LayoutKind;
  placements: RunPlacement[];
  corners: CornerBlock[];
  /** Overall footprint, for the camera and the envelope. */
  extent: { width: number; depth: number };
  /**
   * Anything the solver had to do to keep the geometry buildable.
   *
   * Shown to the user rather than applied silently: a wall shorter than the
   * cabinet depth cannot hold a corner, and quietly producing a zero-length
   * run would look like a bug in the viewer.
   */
  notes: string[];
};

/**
 * The smallest run worth drawing.
 *
 * Below this there is no cabinet that fits, and a 40 mm sliver of carcass in
 * the corner is a fabrication error rather than a design.
 */
const MIN_RUN = 300;

/**
 * Solves a layout into placements.
 *
 * `runs` is the authored input — wall lengths, depth, height. Everything
 * returned is derived from it.
 */
export function solveLayout(
  kind: LayoutKind,
  runs: RunSpec[],
  options: { cornerKind?: CornerKind } = {},
): SolvedLayout {
  const cornerKind = options.cornerKind ?? "l_corner";

  switch (kind) {
    case "straight":
      return solveStraight(runs);
    case "l_shaped":
      return solveL(runs, cornerKind);
    case "u_shaped":
      return solveU(runs, cornerKind);
    case "custom":
      return solveCustom(runs);
  }
}

/* -------------------------------------------------------------------------- */
/* Straight                                                                   */
/* -------------------------------------------------------------------------- */

function solveStraight(runs: RunSpec[]): SolvedLayout {
  const run = runs[0];

  if (!run) {
    return {
      kind: "straight",
      placements: [],
      corners: [],
      extent: { width: 0, depth: 0 },
      notes: ["No run was given, so there is nothing to place."],
    };
  }

  // One run, no corner, and the usable length is the whole wall. This is the
  // case that must stay exactly as it was before runs existed — every wardrobe
  // Berchuma has ever produced is this shape.
  return {
    kind: "straight",
    placements: [
      {
        runId: run.id,
        label: run.label,
        origin: { x: 0, z: 0 },
        rotation: 0,
        wallLength: run.length,
        usableLength: run.length,
        depth: run.depth,
        height: run.height,
      },
    ],
    corners: [],
    extent: { width: run.length, depth: run.depth },
    notes: [],
  };
}

/* -------------------------------------------------------------------------- */
/* L                                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Run A along the back wall, Run B down the right wall.
 *
 * Run A keeps its origin at (0, 0) whatever happens to Run B, which is what
 * makes "changing Wall A must not incorrectly change Wall B" true in both
 * directions: B's length only ever sets B's own extent, and A's length moves
 * the corner and therefore B's *origin* — which is correct, because the corner
 * is where the walls meet and moving one wall moves the meeting point.
 */
function solveL(runs: RunSpec[], cornerKind: CornerKind): SolvedLayout {
  const a = runs[0];
  const b = runs[1];
  const notes: string[] = [];

  if (!a || !b) {
    return {
      kind: "l_shaped",
      placements: a ? solveStraight([a]).placements : [],
      corners: [],
      extent: a ? { width: a.length, depth: a.depth } : { width: 0, depth: 0 },
      notes: ["An L needs two runs. Falling back to what was given."],
    };
  }

  // The corner is square and takes the deeper of the two runs, so neither run
  // pokes out past it. Two different depths meeting is unusual but legal — a
  // 600 base run into a 350 wall-unit return, for instance.
  const corner = Math.max(a.depth, b.depth);

  const usableA = a.length - corner;
  const usableB = b.length - corner;

  if (usableA < MIN_RUN) {
    notes.push(
      `${a.label} is ${a.length} mm and the corner needs ${corner} mm of it, ` +
        `leaving too little for a cabinet. Lengthen it past ${corner + MIN_RUN} mm.`,
    );
  }
  if (usableB < MIN_RUN) {
    notes.push(
      `${b.label} is ${b.length} mm and the corner needs ${corner} mm of it, ` +
        `leaving too little for a cabinet. Lengthen it past ${corner + MIN_RUN} mm.`,
    );
  }

  const placements: RunPlacement[] = [
    {
      runId: a.id,
      label: a.label,
      origin: { x: 0, z: 0 },
      rotation: 0,
      wallLength: a.length,
      usableLength: Math.max(0, usableA),
      depth: a.depth,
      height: a.height,
    },
    {
      runId: b.id,
      label: b.label,
      // Starts where the corner ends, against the right-hand wall.
      origin: { x: a.length - corner, z: corner },
      rotation: 90,
      wallLength: b.length,
      usableLength: Math.max(0, usableB),
      depth: b.depth,
      height: b.height,
    },
  ];

  return {
    kind: "l_shaped",
    placements,
    corners: [
      {
        id: "corner-ab",
        kind: cornerKind,
        x: a.length - corner,
        z: 0,
        size: corner,
        between: [a.id, b.id],
        height: Math.max(a.height, b.height),
      },
    ],
    extent: { width: a.length, depth: b.length },
    notes,
  };
}

/* -------------------------------------------------------------------------- */
/* U                                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Left wall, back wall, right wall — and two corners.
 *
 * The back run loses depth at *both* ends, which is the thing a U gets wrong
 * if it is built by bolting two Ls together: one corner is subtracted twice
 * and the back run comes out short by a cabinet.
 */
function solveU(runs: RunSpec[], cornerKind: CornerKind): SolvedLayout {
  const left = runs[0];
  const back = runs[1];
  const right = runs[2];
  const notes: string[] = [];

  if (!left || !back || !right) {
    const available = [left, back].filter(Boolean) as RunSpec[];
    return {
      ...solveL(available, cornerKind),
      kind: "u_shaped",
      notes: ["A U needs three runs. Falling back to what was given."],
    };
  }

  const leftCorner = Math.max(left.depth, back.depth);
  const rightCorner = Math.max(right.depth, back.depth);

  const usableBack = back.length - leftCorner - rightCorner;
  const usableLeft = left.length - leftCorner;
  const usableRight = right.length - rightCorner;

  if (usableBack < MIN_RUN) {
    notes.push(
      `${back.label} is ${back.length} mm and its two corners need ` +
        `${leftCorner + rightCorner} mm between them, leaving too little for a ` +
        `cabinet. Lengthen it past ${leftCorner + rightCorner + MIN_RUN} mm.`,
    );
  }
  if (usableLeft < MIN_RUN) {
    notes.push(`${left.label} leaves too little after its corner.`);
  }
  if (usableRight < MIN_RUN) {
    notes.push(`${right.label} leaves too little after its corner.`);
  }

  const placements: RunPlacement[] = [
    {
      runId: left.id,
      label: left.label,
      // Down the left wall, starting below the left corner.
      origin: { x: 0, z: leftCorner },
      rotation: 90,
      wallLength: left.length,
      usableLength: Math.max(0, usableLeft),
      depth: left.depth,
      height: left.height,
    },
    {
      runId: back.id,
      label: back.label,
      // Between the two corners.
      origin: { x: leftCorner, z: 0 },
      rotation: 0,
      wallLength: back.length,
      usableLength: Math.max(0, usableBack),
      depth: back.depth,
      height: back.height,
    },
    {
      runId: right.id,
      label: right.label,
      origin: { x: back.length - rightCorner, z: rightCorner },
      rotation: 90,
      wallLength: right.length,
      usableLength: Math.max(0, usableRight),
      depth: right.depth,
      height: right.height,
    },
  ];

  return {
    kind: "u_shaped",
    placements,
    corners: [
      {
        id: "corner-left",
        kind: cornerKind,
        x: 0,
        z: 0,
        size: leftCorner,
        between: [left.id, back.id],
        height: Math.max(left.height, back.height),
      },
      {
        id: "corner-right",
        kind: cornerKind,
        x: back.length - rightCorner,
        z: 0,
        size: rightCorner,
        between: [back.id, right.id],
        height: Math.max(back.height, right.height),
      },
    ],
    extent: {
      width: back.length,
      depth: Math.max(left.length, right.length),
    },
    notes,
  };
}

/* -------------------------------------------------------------------------- */
/* Custom                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Runs placed exactly where they were authored.
 *
 * The escape hatch for a room that is not a rectangle. No corners are inferred
 * — two runs that happen to meet are the author's business, and guessing at a
 * corner between arbitrary runs would produce a carcass in the middle of a
 * doorway.
 */
function solveCustom(runs: RunSpec[]): SolvedLayout {
  const placements: RunPlacement[] = runs.map((run) => ({
    runId: run.id,
    label: run.label,
    origin: run.origin ?? { x: 0, z: 0 },
    rotation: run.rotation ?? 0,
    wallLength: run.length,
    usableLength: run.length,
    depth: run.depth,
    height: run.height,
  }));

  let width = 0;
  let depth = 0;
  for (const placement of placements) {
    const alongX = placement.rotation % 180 === 0;
    width = Math.max(
      width,
      placement.origin.x + (alongX ? placement.wallLength : placement.depth),
    );
    depth = Math.max(
      depth,
      placement.origin.z + (alongX ? placement.depth : placement.wallLength),
    );
  }

  return {
    kind: "custom",
    placements,
    corners: [],
    extent: { width, depth },
    notes:
      runs.length === 0 ? ["No runs were given, so there is nothing to place."] : [],
  };
}

/* -------------------------------------------------------------------------- */
/* Placing a cabinet on a run                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A cabinet's position in the design frame, from its run and its offset.
 *
 * This is what replaces a stored `position`. The offset is how far along the
 * run the cabinet's left edge sits, measured from the run's start — a number
 * that stays true when the run moves, which a world coordinate does not.
 *
 * The rotation is returned rather than baked into the position, because a
 * cabinet on a run heading +z is turned a quarter turn and its width runs
 * along z. Everything downstream — the viewer, the worktop, the cut list's
 * panel sizes — needs to know which.
 */
export function placeOnRun(
  placement: RunPlacement,
  offset: number,
): { x: number; z: number; rotation: number } {
  const radians = (placement.rotation * Math.PI) / 180;

  // cos/sin rather than a switch on 0/90/180/270, so a custom layout at 45°
  // works without this function needing to change.
  const dx = Math.cos(radians);
  const dz = Math.sin(radians);

  return {
    x: placement.origin.x + dx * offset,
    z: placement.origin.z + dz * offset,
    rotation: placement.rotation,
  };
}

/**
 * How much of a run is already taken.
 *
 * Used to place the next module and to warn when a run is over-filled. Sums
 * widths rather than reading the last cabinet's offset, so a gap left
 * deliberately between two modules is not counted as occupied.
 */
export function usedLength(modules: { width: number }[]): number {
  return modules.reduce((total, module) => total + module.width, 0);
}

/**
 * Whether a corner kind can be built between two runs.
 *
 * A diagonal corner needs both runs at least as deep as the corner square, or
 * the diagonal face runs off the end of the shallower one. Reported rather
 * than corrected: silently swapping to a blind corner would change what the
 * customer is being quoted for.
 */
export function cornerFits(
  kind: CornerKind,
  depthA: number,
  depthB: number,
): { ok: true } | { ok: false; reason: string } {
  if (!(cornerKinds as readonly string[]).includes(kind)) {
    return { ok: false, reason: `${kind} is not a corner Berchuma builds.` };
  }

  if (kind === "diagonal" && Math.abs(depthA - depthB) > 1) {
    return {
      ok: false,
      reason:
        "A diagonal corner needs both runs at the same depth — its face spans " +
        "from one to the other, and a step in the depth leaves a gap behind it.",
    };
  }

  return { ok: true };
}
