/**
 * The parametric layout solver.
 *
 *   npx tsx scripts/layout-check.ts
 *
 * Everything here is plan geometry, and plan geometry is the part of a
 * configurator that is either right or produces furniture that cannot be
 * built. The checks are written as the questions a fabricator would ask: do
 * the two runs touch, do they overlap, does the corner fill the gap exactly
 * once, and does changing one wall move the right things.
 */

import {
  cornerFits,
  placeOnRun,
  solveLayout,
  usedLength,
  type CornerBlock,
} from "../src/features/berchuma-studio/services/layout.ts";
import {
  parseSpec,
  upgradeSpec,
} from "../src/features/berchuma-studio/types/spec.ts";
import {
  nextOffset,
  remainingOn,
  resolveDesign,
  worktopArea,
  worktopSections,
} from "../src/features/berchuma-studio/services/resolve.ts";
import { startingDesign } from "../src/features/berchuma-studio/services/starting-designs.ts";
import { buildParts } from "../src/features/berchuma-studio/services/geometry.ts";
import {
  cornerHardware,
  cornerParts,
} from "../src/features/berchuma-studio/services/corners.ts";
import {
  defaultRuns,
  furnitureLabel,
  furnitureTypes,
  layoutKinds,
  layoutLabel,
  runLabelsFor,
  type RunSpec,
} from "../src/features/berchuma-studio/types/layout.ts";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

function near(a: number, b: number, tolerance = 0.001): boolean {
  return Math.abs(a - b) <= tolerance;
}

/** The plan rectangle a run's cabinets occupy. */
function runRect(placement: {
  origin: { x: number; z: number };
  rotation: number;
  usableLength: number;
  depth: number;
}) {
  const alongX = placement.rotation % 180 === 0;
  return {
    x0: placement.origin.x,
    z0: placement.origin.z,
    x1: placement.origin.x + (alongX ? placement.usableLength : placement.depth),
    z1: placement.origin.z + (alongX ? placement.depth : placement.usableLength),
  };
}

function cornerRect(corner: CornerBlock) {
  return {
    x0: corner.x,
    z0: corner.z,
    x1: corner.x + corner.size,
    z1: corner.z + corner.size,
  };
}

type Rect = { x0: number; z0: number; x1: number; z1: number };

/** Overlapping area of two plan rectangles. Zero when they only touch. */
function overlapArea(a: Rect, b: Rect): number {
  const width = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const depth = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return width > 0 && depth > 0 ? width * depth : 0;
}

/* -------------------------------------------------------------------------- */
/* Straight                                                                   */
/* -------------------------------------------------------------------------- */

const straight = solveLayout("straight", defaultRuns("straight", "wardrobe"));

check("straight: one run", straight.placements.length === 1);
check("straight: no corner", straight.corners.length === 0);
check(
  "straight: the whole wall is usable",
  straight.placements[0]!.usableLength === straight.placements[0]!.wallLength,
  "a straight run loses nothing to a corner",
);
check("straight: starts at the origin", straight.placements[0]!.origin.x === 0);
check("straight: no notes", straight.notes.length === 0);

/* -------------------------------------------------------------------------- */
/* L — the brief's own example                                                */
/* -------------------------------------------------------------------------- */

const lRuns: RunSpec[] = [
  { id: "a", label: "Wall A", length: 3000, depth: 600, height: 2400 },
  { id: "b", label: "Wall B", length: 2400, depth: 600, height: 2400 },
];

const l = solveLayout("l_shaped", lRuns);

check("L: two runs", l.placements.length === 2);
check("L: one corner", l.corners.length === 1);

const [la, lb] = l.placements;

check("L: Wall A starts at the origin", la!.origin.x === 0 && la!.origin.z === 0);
check("L: Wall A runs along +x", la!.rotation === 0);
check("L: Wall B turns 90°", lb!.rotation === 90);

check(
  "L: Wall A loses exactly the corner",
  la!.usableLength === 3000 - 600,
  `${la!.usableLength}`,
);
check(
  "L: Wall B loses exactly the corner",
  lb!.usableLength === 2400 - 600,
  `${lb!.usableLength}`,
);
check(
  "L: the corner sits at the end of Wall A",
  l.corners[0]!.x === 3000 - 600 && l.corners[0]!.z === 0,
  `${l.corners[0]!.x},${l.corners[0]!.z}`,
);
check("L: the corner is square", l.corners[0]!.size === 600);

// The property that matters most: no two carcasses in the same place.
check(
  "L: the two runs do not overlap",
  overlapArea(runRect(la!), runRect(lb!)) === 0,
  `${overlapArea(runRect(la!), runRect(lb!))} mm²`,
);
check(
  "L: neither run overlaps the corner",
  overlapArea(runRect(la!), cornerRect(l.corners[0]!)) === 0 &&
    overlapArea(runRect(lb!), cornerRect(l.corners[0]!)) === 0,
  "the corner square is owned by the corner module alone",
);

// And the complement: no gap either. The corner must exactly fill what the
// runs leave, or there is a hole in the kitchen.
check(
  "L: Wall A ends exactly where the corner begins",
  near(runRect(la!).x1, cornerRect(l.corners[0]!).x0),
);
check(
  "L: the corner ends exactly where Wall B begins",
  near(cornerRect(l.corners[0]!).z1, runRect(lb!).z0),
);
check(
  "L: Wall B is against the same wall the corner is",
  near(runRect(lb!).x0, cornerRect(l.corners[0]!).x0),
);

check(
  "L: the footprint is both walls",
  l.extent.width === 3000 && l.extent.depth === 2400,
  `${l.extent.width}×${l.extent.depth}`,
);

/* -------------------------------------------------------------------------- */
/* L — parametric behaviour (Part 42, Part 59)                                */
/* -------------------------------------------------------------------------- */

const lWiderA = solveLayout("l_shaped", [
  { ...lRuns[0]!, length: 4000 },
  lRuns[1]!,
]);

check(
  "changing Wall A does not change Wall B's usable length",
  lWiderA.placements[1]!.usableLength === l.placements[1]!.usableLength,
  "Wall B's own wall did not move",
);
check(
  "but it does move Wall B's origin",
  lWiderA.placements[1]!.origin.x === 4000 - 600,
  "the corner is where the walls meet, so lengthening one moves the meeting point",
);
check(
  "and it moves the corner",
  lWiderA.corners[0]!.x === 4000 - 600,
);
check(
  "Wall A's own usable length grows by the whole change",
  lWiderA.placements[0]!.usableLength - l.placements[0]!.usableLength === 1000,
);

const lWiderB = solveLayout("l_shaped", [
  lRuns[0]!,
  { ...lRuns[1]!, length: 3200 },
]);

check(
  "changing Wall B does not change Wall A at all",
  lWiderB.placements[0]!.usableLength === l.placements[0]!.usableLength &&
    lWiderB.placements[0]!.origin.x === l.placements[0]!.origin.x,
);
check(
  "nor the corner",
  lWiderB.corners[0]!.x === l.corners[0]!.x,
);

const lDeeper = solveLayout("l_shaped", [
  { ...lRuns[0]!, depth: 700 },
  lRuns[1]!,
]);

check(
  "a deeper run makes a bigger corner",
  lDeeper.corners[0]!.size === 700,
  "the corner takes the deeper of the two",
);
check(
  "and the shallower run loses the bigger corner too",
  lDeeper.placements[1]!.usableLength === 2400 - 700,
  "otherwise the shallow run pokes out past the deep one",
);

/* -------------------------------------------------------------------------- */
/* U — the brief's own example                                                */
/* -------------------------------------------------------------------------- */

const uRuns: RunSpec[] = [
  { id: "l", label: "Left wall", length: 2400, depth: 600, height: 2400 },
  { id: "b", label: "Back wall", length: 3000, depth: 600, height: 2400 },
  { id: "r", label: "Right wall", length: 2400, depth: 600, height: 2400 },
];

const u = solveLayout("u_shaped", uRuns);

check("U: three runs", u.placements.length === 3);
check("U: two corners", u.corners.length === 2);

const [ul, ub, ur] = u.placements;

check(
  "U: the back wall loses BOTH corners",
  ub!.usableLength === 3000 - 600 - 600,
  `${ub!.usableLength} — subtracting one corner is how a U built from two Ls goes wrong`,
);
check("U: the left wall loses one", ul!.usableLength === 2400 - 600);
check("U: the right wall loses one", ur!.usableLength === 2400 - 600);

check("U: left and right both run away from the back", ul!.rotation === 90 && ur!.rotation === 90);
check("U: the back wall runs along +x", ub!.rotation === 0);

check(
  "U: the back wall starts after the left corner",
  ub!.origin.x === 600,
);
check(
  "U: the right wall is at the far end",
  ur!.origin.x === 3000 - 600,
);

// Every pair, in both directions.
const uRects = u.placements.map(runRect);
let uOverlap = 0;
for (let i = 0; i < uRects.length; i += 1) {
  for (let j = i + 1; j < uRects.length; j += 1) {
    uOverlap += overlapArea(uRects[i]!, uRects[j]!);
  }
}
check("U: no two runs overlap", uOverlap === 0, `${uOverlap} mm²`);

let uCornerOverlap = 0;
for (const rect of uRects) {
  for (const corner of u.corners) {
    uCornerOverlap += overlapArea(rect, cornerRect(corner));
  }
}
check("U: no run overlaps a corner", uCornerOverlap === 0, `${uCornerOverlap} mm²`);
check(
  "U: the two corners do not overlap each other",
  overlapArea(cornerRect(u.corners[0]!), cornerRect(u.corners[1]!)) === 0,
);

// No gaps: the back wall must meet both corners exactly.
check(
  "U: the left corner ends where the back wall begins",
  near(cornerRect(u.corners[0]!).x1, runRect(ub!).x0),
);
check(
  "U: the back wall ends where the right corner begins",
  near(runRect(ub!).x1, cornerRect(u.corners[1]!).x0),
);
check(
  "U: the left corner meets the left wall",
  near(cornerRect(u.corners[0]!).z1, runRect(ul!).z0),
);
check(
  "U: the right corner meets the right wall",
  near(cornerRect(u.corners[1]!).z1, runRect(ur!).z0),
);

/* -------------------------------------------------------------------------- */
/* U — parametric behaviour (Part 43, Part 59)                                */
/* -------------------------------------------------------------------------- */

const uWiderBack = solveLayout("u_shaped", [
  uRuns[0]!,
  { ...uRuns[1]!, length: 4200 },
  uRuns[2]!,
]);

check(
  "changing the back wall updates BOTH corner connections",
  uWiderBack.corners[0]!.x === 0 && uWiderBack.corners[1]!.x === 4200 - 600,
  "the left corner stays and the right one moves — the brief asked for exactly this",
);
check(
  "and the right wall follows the right corner",
  uWiderBack.placements[2]!.origin.x === 4200 - 600,
);
check(
  "while the left wall does not move",
  uWiderBack.placements[0]!.origin.x === u.placements[0]!.origin.x,
);
check(
  "and neither side wall changes length",
  uWiderBack.placements[0]!.usableLength === u.placements[0]!.usableLength &&
    uWiderBack.placements[2]!.usableLength === u.placements[2]!.usableLength,
);

const uShorterLeft = solveLayout("u_shaped", [
  { ...uRuns[0]!, length: 1800 },
  uRuns[1]!,
  uRuns[2]!,
]);

check(
  "shortening the left wall leaves the back wall alone",
  uShorterLeft.placements[1]!.usableLength === u.placements[1]!.usableLength &&
    uShorterLeft.placements[1]!.origin.x === u.placements[1]!.origin.x,
);
check(
  "and the right wall alone",
  uShorterLeft.placements[2]!.origin.x === u.placements[2]!.origin.x,
);

/* -------------------------------------------------------------------------- */
/* Walls too short to hold a corner                                           */
/* -------------------------------------------------------------------------- */

const tooShort = solveLayout("l_shaped", [
  { id: "a", label: "Wall A", length: 700, depth: 600, height: 900 },
  { id: "b", label: "Wall B", length: 2400, depth: 600, height: 900 },
]);

check(
  "a wall barely longer than the corner is reported",
  tooShort.notes.length > 0,
  "silently producing a 100 mm run would look like a viewer bug",
);
check(
  "and the note names the wall and the fix",
  /Wall A/.test(tooShort.notes[0] ?? "") && /\d+ mm/.test(tooShort.notes[0] ?? ""),
  tooShort.notes[0],
);
check(
  "usable length never goes negative",
  solveLayout("l_shaped", [
    { id: "a", label: "A", length: 400, depth: 600, height: 900 },
    { id: "b", label: "B", length: 400, depth: 600, height: 900 },
  ]).placements.every((placement) => placement.usableLength >= 0),
  "a negative run would place cabinets behind the origin",
);

const shortBack = solveLayout("u_shaped", [
  uRuns[0]!,
  { ...uRuns[1]!, length: 1300 },
  uRuns[2]!,
]);
check(
  "a back wall too short for two corners is reported",
  shortBack.notes.some((note) => /Back wall/.test(note)),
);
check(
  "and the note accounts for both corners",
  shortBack.notes.some((note) => /1200 mm between them/.test(note)),
  shortBack.notes.join(" | "),
);

/* -------------------------------------------------------------------------- */
/* Missing runs                                                               */
/* -------------------------------------------------------------------------- */

check(
  "an L with one run does not crash",
  solveLayout("l_shaped", [lRuns[0]!]).placements.length === 1,
);
check(
  "and says what is missing",
  /needs two runs/.test(solveLayout("l_shaped", [lRuns[0]!]).notes[0] ?? ""),
);
check(
  "a U with two runs falls back to an L",
  solveLayout("u_shaped", [uRuns[0]!, uRuns[1]!]).placements.length === 2,
);
check(
  "a straight layout with no runs does not crash",
  solveLayout("straight", []).placements.length === 0,
);

/* -------------------------------------------------------------------------- */
/* Placing cabinets on runs                                                   */
/* -------------------------------------------------------------------------- */

const along = placeOnRun(la!, 900);
check(
  "a cabinet on a +x run moves along x",
  near(along.x, 900) && near(along.z, 0),
  `${along.x},${along.z}`,
);

const turned = placeOnRun(lb!, 900);
check(
  "a cabinet on a +z run moves along z",
  near(turned.x, lb!.origin.x) && near(turned.z, lb!.origin.z + 900),
  `${turned.x},${turned.z}`,
);
check("and carries the run's rotation", turned.rotation === 90);

check(
  "a cabinet at offset zero sits at the run's origin",
  (() => {
    const at = placeOnRun(lb!, 0);
    return near(at.x, lb!.origin.x) && near(at.z, lb!.origin.z);
  })(),
);

// The parametric promise, at the level a cabinet cares about: a module keeps
// its offset when the wall it is not on changes.
const movedRun = solveLayout("l_shaped", [
  { ...lRuns[0]!, length: 4000 },
  lRuns[1]!,
]).placements[1]!;

check(
  "a module on Wall B keeps its offset when Wall A grows",
  near(placeOnRun(movedRun, 900).z, placeOnRun(lb!, 900).z),
  "its position along its own wall is unchanged",
);
check(
  "but moves with the corner in x",
  placeOnRun(movedRun, 900).x - placeOnRun(lb!, 900).x === 1000,
);

check("usedLength sums module widths", usedLength([{ width: 600 }, { width: 900 }]) === 1500);
check("and is zero for an empty run", usedLength([]) === 0);

/* -------------------------------------------------------------------------- */
/* Corners                                                                    */
/* -------------------------------------------------------------------------- */

check("an L corner fits equal depths", cornerFits("l_corner", 600, 600).ok);
check("a blind corner fits unequal depths", cornerFits("blind", 600, 350).ok);
check(
  "a diagonal corner refuses unequal depths",
  !cornerFits("diagonal", 600, 350).ok,
  "its face spans from one run to the other",
);
check("but accepts equal ones", cornerFits("diagonal", 600, 600).ok);
check(
  "an unknown corner kind is refused",
  !cornerFits("trapezoid" as never, 600, 600).ok,
);

/* -------------------------------------------------------------------------- */
/* Defaults                                                                   */
/* -------------------------------------------------------------------------- */

for (const kind of layoutKinds) {
  check(`${kind} has a label`, layoutLabel(kind).length > 0);
  const labels = runLabelsFor(kind);
  check(`${kind} names its runs`, labels.length > 0);

  for (const type of furnitureTypes) {
    const runs = defaultRuns(kind, type);
    check(
      `${kind}/${type} makes one run per label`,
      runs.length === labels.length,
    );
    check(
      `${kind}/${type} runs all have positive dimensions`,
      runs.every(
        (run) => run.length > 0 && run.depth > 0 && run.height > 0,
      ),
    );
    check(
      `${kind}/${type} run ids are unique`,
      new Set(runs.map((run) => run.id)).size === runs.length,
    );

    // The defaults must themselves be buildable — a starting point that opens
    // with a warning on it is a bad starting point.
    const solved = solveLayout(kind, runs);
    check(
      `${kind}/${type} defaults solve without a warning`,
      solved.notes.length === 0,
      solved.notes.join(" | "),
    );
  }
}

for (const type of furnitureTypes) {
  check(`${type} has a label`, furnitureLabel(type).length > 0);
}

/* -------------------------------------------------------------------------- */
/* The spec: v2 designs must survive                                          */
/* -------------------------------------------------------------------------- */

// The migration matters more than any new feature. Every design Berchuma has
// ever produced is a v2 spec sitting in somebody's account, and an upgrade
// that loses one is worse than never shipping runs at all.
// Built from a real design rather than hand-written. A hand-written fixture
// drifts from the schema — mine had `sheet: {width, height}` where the board
// schema says `{width, length}` — and then tests a shape the application never
// produces.
const v3Source = startingDesign("wardrobe", { width: 1800 });

const v2 = {
  ...v3Source,
  version: 2,
  cabinets: v3Source.cabinets.map(({ runId: _runId, offset: _offset, ...rest }) => rest),
  furnitureType: undefined,
  layout: undefined,
  runs: undefined,
  cornerKind: undefined,
} as unknown as Record<string, unknown> & {
  cabinets: { position: { x: number } }[];
};

const upgraded = upgradeSpec(v2) as Record<string, unknown>;

check("a v2 spec upgrades to v3", upgraded.version === 3, `${upgraded.version}`);
check("and gains a straight layout", upgraded.layout === "straight");
check(
  "and one run the width of the envelope",
  Array.isArray(upgraded.runs) &&
    (upgraded.runs as { length: number }[])[0]!.length === 1800,
);
check(
  "and a furniture type derived from its kind",
  upgraded.furnitureType === "wardrobe",
);

const upgradedCabinets = upgraded.cabinets as {
  runId?: string;
  offset?: number;
}[];

check(
  "every cabinet is bound to the run",
  upgradedCabinets.every((cabinet) => cabinet.runId === "run-1"),
  "an unbound cabinet keeps its stored position and stops being parametric",
);
check(
  "at the offset each stored x implied",
  upgradedCabinets.every(
    (cabinet, index) =>
      cabinet.offset ===
      Math.max(0, (v2.cabinets as { position: { x: number } }[])[index]!.position.x),
  ),
  "the offset is the x it already had, so nothing moves during the migration",
);

const reparsed = parseSpec(v2);
check("and the upgraded spec still parses", reparsed.ok, reparsed.ok ? "" : reparsed.error);

// Upgrading twice must not change anything.
check(
  "the upgrade is idempotent",
  JSON.stringify(upgradeSpec(upgraded)) === JSON.stringify(upgraded),
  "a second migration must not rebuild the runs and lose the offsets",
);

// An island belongs to no wall and must not be dragged onto one.
const withIsland = upgradeSpec({
  ...v2,
  cabinets: [
    ...v2.cabinets,
    { ...v2.cabinets[0], id: "c3", kind: "island", position: { x: 2400, y: 0, z: 1200 } },
  ],
}) as { cabinets: { kind: string; runId?: string }[] };

check(
  "an island is left off the run",
  withIsland.cabinets.find((cabinet) => cabinet.kind === "island")?.runId === undefined,
  "binding it would drag it to the wall on the next edit",
);

/* -------------------------------------------------------------------------- */
/* Resolving a design                                                         */
/* -------------------------------------------------------------------------- */

const wardrobe = startingDesign("wardrobe", { width: 2400 });

check("a starting design is v3", wardrobe.version === 3);
check("with a run", wardrobe.runs.length === 1);
check(
  "and cabinets bound to it",
  wardrobe.cabinets.every((cabinet) => cabinet.runId === "run-1"),
  "a starting design that is not parametric is the worst place to find out",
);

const resolvedWardrobe = resolveDesign(wardrobe);
check("it resolves without issues", resolvedWardrobe.issues.length === 0,
  resolvedWardrobe.issues.join(" | "));
check(
  "every cabinet is placed",
  resolvedWardrobe.cabinets.length === wardrobe.cabinets.length,
);

// The parametric promise at the spec level: widen the wall, the modules stay
// where they are relative to it and nothing has to be re-authored.
const widened = { ...wardrobe, runs: [{ ...wardrobe.runs[0]!, length: 3600 }] };
const resolvedWide = resolveDesign(widened);

check(
  "widening the run does not move the modules along it",
  resolvedWide.cabinets.every(
    (placed, index) => placed.x === resolvedWardrobe.cabinets[index]!.x,
  ),
  "they keep their offsets; the free space appears at the end",
);
check(
  "and more room becomes available",
  remainingOn(widened, "run-1", "tall") >
    remainingOn(wardrobe, "run-1", "tall"),
);

const narrowed = { ...wardrobe, runs: [{ ...wardrobe.runs[0]!, length: 900 }] };
check(
  "narrowing a run below its contents is reported",
  resolveDesign(narrowed).issues.some((issue) => /only .* is free|holds/.test(issue)),
  resolveDesign(narrowed).issues.join(" | "),
);

check(
  "nextOffset lands after the existing modules",
  nextOffset(wardrobe, "run-1", "tall") ===
    wardrobe.cabinets
      .filter((cabinet) => cabinet.kind === "tall")
      .reduce((total, cabinet) => total + cabinet.size.width, 0),
);

// A dangling run reference must not delete somebody's module.
const dangling = {
  ...wardrobe,
  cabinets: wardrobe.cabinets.map((cabinet) => ({ ...cabinet, runId: "gone" })),
};
const resolvedDangling = resolveDesign(dangling);
check(
  "a cabinet on a missing run is still shown",
  resolvedDangling.cabinets.length === wardrobe.cabinets.length,
);
check(
  "and the problem is reported rather than swallowed",
  resolvedDangling.issues.some((issue) => /no longer exists/.test(issue)),
);

/* -------------------------------------------------------------------------- */
/* Worktop follows the layout                                                 */
/* -------------------------------------------------------------------------- */

const lSpec = {
  ...wardrobe,
  layout: "l_shaped" as const,
  runs: [
    { id: "run-1", label: "Wall A", length: 3000, depth: 600, height: 900 },
    { id: "run-2", label: "Wall B", length: 2400, depth: 600, height: 900 },
  ],
};

const resolvedL = resolveDesign(lSpec);
const sections = worktopSections(resolvedL);

check(
  "an L worktop has a section per run plus the corner",
  sections.length === 3,
  `${sections.length}`,
);
check(
  "and its area is the two runs plus the corner, counted once",
  (() => {
    const expected =
      (3000 - 600) * 600 + (2400 - 600) * 600 + 600 * 600;
    return Math.abs(worktopArea(sections) * 1_000_000 - expected) < 1;
  })(),
  `${worktopArea(sections)} m²`,
);

// The property that distinguishes a real L worktop from two overlapping slabs.
const worktopRects = sections.map((section) => ({
  x0: section.x,
  z0: section.z,
  x1: section.x + section.width,
  z1: section.z + section.depth,
}));

let worktopOverlap = 0;
for (let i = 0; i < worktopRects.length; i += 1) {
  for (let j = i + 1; j < worktopRects.length; j += 1) {
    worktopOverlap += overlapArea(worktopRects[i]!, worktopRects[j]!);
  }
}
check(
  "no two worktop sections overlap",
  worktopOverlap === 0,
  `${worktopOverlap} mm² — overlapping sections double-charge the stone`,
);

const uSpec = {
  ...wardrobe,
  layout: "u_shaped" as const,
  runs: uRuns.map((run) => ({ ...run, height: 900 })),
};
const uSections = worktopSections(resolveDesign(uSpec));
check("a U worktop has five sections", uSections.length === 5, `${uSections.length}`);

check(
  "the worktop grows when a wall does",
  worktopArea(
    worktopSections(
      resolveDesign({
        ...lSpec,
        runs: [{ ...lSpec.runs[0]!, length: 4000 }, lSpec.runs[1]!],
      }),
    ),
  ) > worktopArea(sections),
  "Part 51: the countertop follows the cabinet layout",
);

/* -------------------------------------------------------------------------- */
/* Corner carcasses (Parts 44, 58, 68)                                        */
/* -------------------------------------------------------------------------- */

const lKitchen = {
  ...wardrobe,
  furnitureType: "kitchen" as const,
  layout: "l_shaped" as const,
  cornerKind: "l_corner" as const,
  runs: [
    { id: "run-1", label: "Wall A", length: 3000, depth: 600, height: 900 },
    { id: "run-2", label: "Wall B", length: 2400, depth: 600, height: 900 },
  ],
};

const resolvedKitchen = resolveDesign(lKitchen);
const corner = cornerParts(lKitchen, resolvedKitchen);

check("an L corner produces panels", corner.length > 0);
check(
  "including two gables",
  corner.find((part) => part.role === "gable")?.quantity === 2,
  "a corner has two closed faces, against the two walls",
);
check(
  "and two backs",
  corner.find((part) => part.role === "back")?.quantity === 2,
  "a corner has two walls behind it, not one",
);
check(
  "and a door on each open face",
  corner.find((part) => part.role === "door")?.quantity === 2,
);
check(
  "every corner panel has a real size",
  corner.every(
    (part) => part.size.x > 0 && part.size.y > 0 && part.size.z > 0,
  ),
);
check(
  "every corner panel is placed as many times as it is cut",
  corner.every((part) => part.placements.length === part.quantity),
  "a part with one placement and quantity two draws one and charges for two",
);
check(
  "the corner panels sit inside the corner square",
  corner.every((part) =>
    part.placements.every(
      (placement) =>
        placement.x >= resolvedKitchen.layout.corners[0]!.x - 1 &&
        placement.x <= resolvedKitchen.layout.corners[0]!.x + 600 + 1,
    ),
  ),
  "a corner panel outside its square is a panel in the middle of the kitchen",
);

const blind = cornerParts(
  { ...lKitchen, cornerKind: "blind" },
  resolveDesign({ ...lKitchen, cornerKind: "blind" }),
);
check(
  "a blind corner has a filler",
  blind.some((part) => /blind filler/.test(part.label)),
);
check(
  "and no pair of doors",
  !blind.some((part) => part.role === "door" && part.quantity === 2),
  "one face is closed off — that is what blind means",
);

const diagonal = cornerParts(
  { ...lKitchen, cornerKind: "diagonal" },
  resolveDesign({ ...lKitchen, cornerKind: "diagonal" }),
);
const diagonalFace = diagonal.find((part) => /diagonal door/.test(part.label));
check("a diagonal corner has one face", diagonalFace?.quantity === 1);
check(
  "and that face is longer than the square's side",
  (diagonalFace?.width ?? 0) > 600,
  `${diagonalFace?.width} — a 45° face spans √2 times the side`,
);

check(
  "an L corner is given wide-opening hinges",
  cornerHardware(resolvedKitchen).some((line) => /165/.test(line.label)),
  "a 110° hinge will not let a corner door clear the return",
);
check(
  "a diagonal corner gets a carousel",
  cornerHardware(resolveDesign({ ...lKitchen, cornerKind: "diagonal" })).some(
    (line) => /carousel/i.test(line.label),
  ),
);
check(
  "a blind corner gets a pull-out",
  cornerHardware(resolveDesign({ ...lKitchen, cornerKind: "blind" })).some(
    (line) => /pull-out/i.test(line.label),
  ),
);
check(
  "a straight layout has no corner hardware",
  cornerHardware(resolveDesign(wardrobe)).length === 0,
);

/* -------------------------------------------------------------------------- */
/* Parts follow the runs (Part 66)                                            */
/* -------------------------------------------------------------------------- */

const straightParts = buildParts(wardrobe);
check("a straight design still builds parts", straightParts.parts.length > 0);
check(
  "and none of them is rotated",
  straightParts.parts.every((part) => !part.rotationY),
  "every design that existed before layouts is a straight run",
);

const lParts = buildParts(lKitchen);
check(
  "an L design includes the corner's panels",
  lParts.parts.some((part) => /corner/i.test(part.label)),
  "a corner drawn but not cut is a corner the shop has to improvise",
);

// A cabinet on the turned run must actually be turned.
const turnedSpec = {
  ...lKitchen,
  cabinets: lKitchen.cabinets.map((cabinet) => ({
    ...cabinet,
    runId: "run-2",
    offset: 0,
  })),
};
const turnedParts = buildParts(turnedSpec);
check(
  "a cabinet on the second run is rotated",
  turnedParts.parts.some((part) => part.rotationY === 90),
);

// And the rotation must pivot about the cabinet, not the room.
const onRunB = turnedParts.parts.find(
  (part) => part.rotationY === 90 && part.placements.length > 0,
);
const runBOrigin = resolvedKitchen.layout.placements[1]!.origin;
check(
  "and it pivots about its own corner, not the room's origin",
  onRunB !== undefined &&
    onRunB.placements.every(
      (placement) =>
        placement.x >= runBOrigin.x - 700 && placement.z >= runBOrigin.z - 1,
    ),
  "translating before rotating throws the cabinet across the kitchen",
);

// The parametric promise, all the way through to the cut list.
const beforeWiden = buildParts(lKitchen).totals.partCount;
const afterWiden = buildParts({
  ...lKitchen,
  runs: [{ ...lKitchen.runs[0]!, length: 4200 }, lKitchen.runs[1]!],
}).totals.partCount;
check(
  "widening a wall does not lose parts",
  afterWiden >= beforeWiden,
  `${beforeWiden} then ${afterWiden}`,
);

/* -------------------------------------------------------------------------- */

if (failures.length > 0) {
  console.error(`\n${failures.length} failed:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passed} passed, ${failures.length} failed\n`);
  process.exit(1);
}

console.log(`\n✓ ${passed} layout checks passed\n`);
