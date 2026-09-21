import {
  cornerKinds,
  type CornerKind,
  type CornerSettings,
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
  width?: number;
  depth?: number;
  /** The two runs it joins, in order. */
  between: [WallRunId, WallRunId];
  /** Wardrobe run whose ordinary carcass continues through this corner. */
  ownerRunId?: WallRunId;
  height: number;
  /** Optional vertical placement for wall/upper corner modules. */
  baseY?: number;
  /** Wall corners have no floor plinth. */
  plinthHeight?: number;
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
  options: { cornerKind?: CornerKind; cornerKinds?: Record<string, CornerKind>; cornerSettings?: Record<string, CornerSettings>; kitchenFacing?: boolean; wardrobeOwnership?: boolean } = {},
): SolvedLayout {
  const solved = solveLayoutFrame(kind, runs, options);
  if (!options.kitchenFacing) return solved;
  // The legacy frame is useful for general joinery. A kitchen's back and
  // right runs must face into the room, while keeping the same footprints.
  const placements = solved.placements.map((placement, index) => {
    const flip = kind === "straight" || kind === "island" ? index === 0
      : kind === "l_shaped" ? true : index === 1 || index === 2;
    if (!flip) return placement;
    const end = placeOnRun(placement, placement.usableLength);
    const radians = placement.rotation * Math.PI / 180;
    return { ...placement, rotation: (placement.rotation + 180) % 360,
      origin: { x: end.x - placement.depth * Math.sin(radians), z: end.z + placement.depth * Math.cos(radians) } };
  });
  for (const run of runs.filter((r) => r.id.startsWith("upper-") && r.origin && !placements.some((p) => p.runId === r.id))) {
    placements.push({ runId: run.id, label: run.label, origin: run.origin!, rotation: run.rotation ?? 0,
      wallLength: run.length, usableLength: run.length, depth: run.depth, height: run.height });
  }
  return { ...solved, placements };
}

function solveLayoutFrame(
  kind: LayoutKind,
  runs: RunSpec[],
  options: { cornerKind?: CornerKind; cornerKinds?: Record<string, CornerKind>; cornerSettings?: Record<string, CornerSettings>; wardrobeOwnership?: boolean } = {},
): SolvedLayout {
  const cornerKind = options.cornerKind ?? "l_corner";

  switch (kind) {
    case "straight":
      return solveStraight(runs);
    case "l_shaped":
      return solveL(runs, cornerKind, options.cornerKinds, options.cornerSettings, options.wardrobeOwnership);
    case "u_shaped":
      return solveU(runs, cornerKind, options.cornerKinds, options.cornerSettings, options.wardrobeOwnership);
    case "g_shaped": {
      const solved = solveU(runs.slice(0, 3), cornerKind, options.cornerKinds, options.cornerSettings, options.wardrobeOwnership);
      const peninsula = runs[3];
      if (!peninsula || !runs[0]) return { ...solved, kind, notes: [...solved.notes, "A G layout needs a peninsula run."] };
      return {
        ...solved,
        kind,
        placements: [...solved.placements, {
          runId: peninsula.id, label: peninsula.label,
          origin: { x: runs[0].depth, z: runs[0].length - peninsula.depth },
          rotation: 0, wallLength: peninsula.length, usableLength: peninsula.length,
          depth: peninsula.depth, height: peninsula.height,
        }],
      };
    }
    case "island":
      return { ...solveCustom(runs), kind };
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
function solveL(runs: RunSpec[], cornerKind: CornerKind, cornerKinds?: Record<string, CornerKind>, cornerSettings?: Record<string, CornerSettings>, wardrobeOwnership = false): SolvedLayout {
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
  const fallback = Math.max(a.depth, b.depth);
  const settings = cornerSettings?.["corner-ab"];
  const kind = cornerKinds?.["corner-ab"] ?? cornerKind;
  const hosted = wardrobeOwnership && ["l_corner", "hanging", "custom"].includes(kind);
  const ownerRunId = hosted ? (a.length <= b.length ? a.id : b.id) : undefined;
  const cornerWidth = hosted ? fallback : Math.min(a.length - MIN_RUN, Math.max(b.depth, settings?.width ?? fallback));
  const cornerDepth = hosted ? fallback : Math.min(b.length - MIN_RUN, Math.max(a.depth, settings?.depth ?? fallback));

  const usableA = a.length - (ownerRunId === a.id ? 0 : cornerWidth);
  const usableB = b.length - (ownerRunId === b.id ? 0 : cornerDepth);

  if (usableA < MIN_RUN) {
    notes.push(
      `${a.label} is ${a.length} mm and the corner needs ${cornerWidth} mm of it, ` +
        `leaving too little for a cabinet. Lengthen it past ${cornerWidth + MIN_RUN} mm.`,
    );
  }
  if (usableB < MIN_RUN) {
    notes.push(
      `${b.label} is ${b.length} mm and the corner needs ${cornerDepth} mm of it, ` +
        `leaving too little for a cabinet. Lengthen it past ${cornerDepth + MIN_RUN} mm.`,
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
      // A +90° local depth projects towards -x. Anchor its front-right
      // corner at the wall so the returned carcass fills x = La-d…La below
      // the corner, rather than floating one depth to the left of it.
      origin: { x: a.length, z: ownerRunId === b.id ? 0 : cornerDepth },
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
        kind,
        x: a.length - cornerWidth,
        z: 0,
        size: Math.max(cornerWidth, cornerDepth),
        width: cornerWidth,
        depth: cornerDepth,
        between: [a.id, b.id],
        ownerRunId,
        height: settings?.height ?? Math.max(a.height, b.height),
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
function solveU(runs: RunSpec[], cornerKind: CornerKind, cornerKinds?: Record<string, CornerKind>, cornerSettings?: Record<string, CornerSettings>, wardrobeOwnership = false): SolvedLayout {
  const left = runs[0];
  const back = runs[1];
  const right = runs[2];
  const notes: string[] = [];

  if (!left || !back || !right) {
    const available = [left, back].filter(Boolean) as RunSpec[];
    return {
      ...solveL(available, cornerKind, cornerKinds, cornerSettings, wardrobeOwnership),
      kind: "u_shaped",
      notes: ["A U needs three runs. Falling back to what was given."],
    };
  }

  const leftFallback = Math.max(left.depth, back.depth);
  const rightFallback = Math.max(right.depth, back.depth);
  const leftSettings = cornerSettings?.["corner-left"];
  const rightSettings = cornerSettings?.["corner-right"];
  const leftKind = cornerKinds?.["corner-left"] ?? cornerKind;
  const rightKind = cornerKinds?.["corner-right"] ?? cornerKind;
  const leftHosted = wardrobeOwnership && ["l_corner", "hanging", "custom"].includes(leftKind);
  const rightHosted = wardrobeOwnership && ["l_corner", "hanging", "custom"].includes(rightKind);
  const leftOwner = leftHosted ? (left.length <= back.length ? left.id : back.id) : undefined;
  const rightOwner = rightHosted ? (right.length <= back.length ? right.id : back.id) : undefined;
  const leftWidth = leftHosted ? leftFallback : Math.max(left.depth, leftSettings?.width ?? leftFallback);
  const rightWidth = rightHosted ? rightFallback : Math.max(right.depth, rightSettings?.width ?? rightFallback);
  const totalWidth = leftWidth + rightWidth;
  const widthScale = totalWidth > back.length - MIN_RUN ? (back.length - MIN_RUN) / totalWidth : 1;
  // A hosted wardrobe corner is a real depth × depth square. Never squeeze it
  // into a rectangle merely to hide an undersized room; report the short run.
  const leftCorner = leftHosted ? leftWidth : leftWidth * widthScale;
  const rightCorner = rightHosted ? rightWidth : rightWidth * widthScale;
  const leftCornerDepth = leftHosted ? leftFallback : Math.min(left.length - MIN_RUN, Math.max(back.depth, leftSettings?.depth ?? leftFallback));
  const rightCornerDepth = rightHosted ? rightFallback : Math.min(right.length - MIN_RUN, Math.max(back.depth, rightSettings?.depth ?? rightFallback));

  const backStopsAtLeft = !leftHosted || leftOwner === left.id;
  const backStopsAtRight = !rightHosted || rightOwner === right.id;
  const usableBack = back.length - (backStopsAtLeft ? leftCorner : 0) - (backStopsAtRight ? rightCorner : 0);
  const usableLeft = left.length - (leftOwner === left.id ? 0 : leftCornerDepth);
  const usableRight = right.length - (rightOwner === right.id ? 0 : rightCornerDepth);

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
      origin: { x: left.depth, z: leftOwner === left.id ? 0 : leftCornerDepth },
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
      origin: { x: backStopsAtLeft ? leftCorner : 0, z: 0 },
      rotation: 0,
      wallLength: back.length,
      usableLength: Math.max(0, usableBack),
      depth: back.depth,
      height: back.height,
    },
    {
      runId: right.id,
      label: right.label,
      // Same +90° convention as the L return: local depth reaches left from
      // the anchor, so the right wall is anchored at the room's outer edge.
      origin: { x: back.length, z: rightOwner === right.id ? 0 : rightCornerDepth },
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
        kind: leftKind,
        x: 0,
        z: 0,
        size: leftCorner,
        width: leftCorner,
        depth: leftCornerDepth,
        between: [left.id, back.id],
        ownerRunId: leftOwner,
        height: leftSettings?.height ?? Math.max(left.height, back.height),
      },
      {
        id: "corner-right",
        kind: rightKind,
        x: back.length - rightCorner,
        z: 0,
        size: rightCorner,
        width: rightCorner,
        depth: rightCornerDepth,
        between: [back.id, right.id],
        ownerRunId: rightOwner,
        height: rightSettings?.height ?? Math.max(back.height, right.height),
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
  cabinetDepth = placement.depth,
): { x: number; z: number; rotation: number } {
  const radians = (placement.rotation * Math.PI) / 180;

  // cos/sin rather than a switch on 0/90/180/270, so a custom layout at 45°
  // works without this function needing to change.
  const dx = Math.cos(radians);
  const dz = Math.sin(radians);

  return {
    x: placement.origin.x + dx * offset - dz * (placement.depth - cabinetDepth),
    z: placement.origin.z + dz * offset + dx * (placement.depth - cabinetDepth),
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
