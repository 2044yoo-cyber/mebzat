/**
 * Wardrobes that turn a corner.
 *
 *   npx tsx scripts/wardrobe_shape_check.ts
 *
 * ## What was already there
 *
 * Almost all of it. `layout.ts` solves straight, L and U layouts and carves the
 * `depth × depth` corner square out of the runs; `corners.ts` cuts a real
 * corner carcass for it, wardrobe plinth included; `buildParts` feeds the 3D
 * model, the cut list, the exports, the nesting and the price. What was missing
 * was a way to *make* a wardrobe that used any of it: the wardrobe starter
 * built one straight run and `shell` bound every cabinet to it.
 *
 * So this checks the join rather than re-checking the engine: that a shape goes
 * in, the right runs and carcasses come out, the corner is subtracted once per
 * corner, and — the thing a drawing cannot tell you — that no two boards end up
 * in the same cubic centimetre.
 *
 * ## The overlap test is the point
 *
 * "Do NOT allow boards from two runs to overlap physically." A cut list cannot
 * show that and a screenshot can hide it, so every part is turned into a
 * world-space box and every pair is intersected. It is what found the U defect
 * recorded at the bottom of this file.
 */

import {
  wardrobeShapeDesign,
  wardrobeWalls,
  wardrobeShapes,
} from "../src/features/berchuma-studio/services/starting-designs.ts";
import { startingDesign } from "../src/features/berchuma-studio/services/starting-designs.ts";
import { buildParts } from "../src/features/berchuma-studio/services/geometry.ts";
import { resolveDesign } from "../src/features/berchuma-studio/services/resolve.ts";
import {
  partCentre,
  partRotationRadians,
} from "../src/features/berchuma-studio/services/part-transform.ts";
import { readFileSync } from "node:fs";

import { parseSpec, type DesignSpec } from "../src/features/berchuma-studio/types/spec.ts";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const DEPTH = 600;
const HEIGHT = 2400;

// ---------------------------------------------------------------------------
// Boxes in the room
// ---------------------------------------------------------------------------

type Box = { label: string; min: number[]; max: number[] };

/**
 * Every manufactured part as a world-space box.
 *
 * A part carries its size in its own frame and a rotation about y, so the
 * extents are swapped by the rotation before they mean anything in the room.
 * Purchased pieces are skipped: a hanging rail is bought by the metre and
 * passes through a gable on purpose.
 */
function boxes(spec: DesignSpec): Box[] {
  const out: Box[] = [];

  for (const part of buildParts(spec).parts) {
    if (part.manufacture === "purchased") continue;

    const across = Math.abs(Math.cos(partRotationRadians(part)));
    const along = Math.abs(Math.sin(partRotationRadians(part)));
    const halfX = (part.size.x * across + part.size.z * along) / 2;
    const halfZ = (part.size.x * along + part.size.z * across) / 2;

    for (const placement of part.placements) {
      const centre = partCentre(part, placement);
      out.push({
        label: part.label,
        min: [centre.x - halfX, centre.y - part.size.y / 2, centre.z - halfZ],
        max: [centre.x + halfX, centre.y + part.size.y / 2, centre.z + halfZ],
      });
    }
  }

  return out;
}

/**
 * Shared volume in cubic millimetres, or zero.
 *
 * Half a millimetre of tolerance on each axis, so two panels that meet face to
 * face — which is most of a carcass — do not read as intersecting.
 */
function sharedVolume(a: Box, b: Box): number {
  let volume = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const depth = Math.min(a.max[axis]!, b.max[axis]!) - Math.max(a.min[axis]!, b.min[axis]!);
    if (depth <= 0.5) return 0;
    volume *= depth;
  }
  return volume;
}

/** Pairs sharing more than a cubic centimetre, which is no longer a rounding. */
function clashes(spec: DesignSpec): string[] {
  const all = boxes(spec);
  const found: string[] = [];

  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      const volume = sharedVolume(all[i]!, all[j]!);
      if (volume > 1000) {
        found.push(
          `${all[i]!.label} ∩ ${all[j]!.label} = ${Math.round(volume / 1000)} cm³`,
        );
      }
    }
  }

  return found;
}

function build(shape: "straight" | "l_shaped" | "u_shaped", walls: number[]) {
  return wardrobeShapeDesign({ shape, walls, depth: DEPTH, height: HEIGHT });
}

// ---------------------------------------------------------------------------
// 1. The walls a shape asks for
// ---------------------------------------------------------------------------

{
  check("there are three shapes", wardrobeShapes.length === 3);
  check("a straight wardrobe is one wall", wardrobeWalls("straight").length === 1);
  check("an L is two", wardrobeWalls("l_shaped").length === 2);
  check("a U is three", wardrobeWalls("u_shaped").length === 3);

  // The order is load-bearing: `solveU` reads its runs as left, back, right
  // and anchors each from that. Handed back, left, right it builds a U with
  // the back wall down one side.
  check(
    "and the U's walls are named in the order the solver reads them",
    wardrobeWalls("u_shaped").map((wall) => wall.label).join(", ") ===
      "Left wall, Back wall, Right wall",
    wardrobeWalls("u_shaped").map((wall) => wall.label).join(", "),
  );
}

// ---------------------------------------------------------------------------
// 2. Straight is exactly what it was
// ---------------------------------------------------------------------------

{
  // Ids come from a counter, so they differ between two builds of the same
  // design and are not part of what "the same" means here.
  const anonymise = (spec: DesignSpec) =>
    JSON.stringify(spec.cabinets, (key, value) => (key === "id" ? "·" : value));

  const viaShape = build("straight", [2400]);
  const viaCard = startingDesign("wardrobe", { width: 2400 });

  check(
    "a straight wardrobe from the shape picker is the one from the card",
    anonymise(viaShape) === anonymise(viaCard),
    "two ways to the same wardrobe must not be two wardrobes",
  );
  check(
    "and it is still one straight run",
    viaShape.layout === "straight" && viaShape.runs.length === 1,
  );
}

// ---------------------------------------------------------------------------
// 3. An L, and where the corner goes
// ---------------------------------------------------------------------------

{
  const spec = build("l_shaped", [2400, 1800]);
  const resolved = resolveDesign(spec);

  check("an L is two runs", spec.runs.length === 2, `${spec.runs.length}`);
  check("and two carcasses", spec.cabinets.length === 2);
  check(
    "the runs keep the wall lengths somebody measured",
    spec.runs.map((run) => run.length).join() === "2400,1800",
    spec.runs.map((run) => run.length).join(),
  );

  // The whole arithmetic of a corner: each carcass is its wall less the
  // square it shares. Laid out first and subtracted afterwards this comes out
  // a cabinet too long, which is the failure the ordering exists to prevent.
  check(
    "each carcass is its wall less the corner",
    spec.cabinets.map((cabinet) => cabinet.size.width).join() === "1800,1200",
    spec.cabinets.map((cabinet) => cabinet.size.width).join(),
  );
  check(
    "each carcass is on its own run",
    new Set(spec.cabinets.map((cabinet) => cabinet.runId)).size === 2,
    spec.cabinets.map((cabinet) => cabinet.runId).join(", "),
  );
  check(
    "there is exactly one corner",
    resolved.layout.corners.length === 1,
    `${resolved.layout.corners.length}`,
  );
  check(
    "which is the depth square where the two runs meet",
    resolved.layout.corners[0]?.size === DEPTH,
    `${resolved.layout.corners[0]?.size}`,
  );
  check(
    "the solver has nothing to complain about",
    resolved.issues.length === 0,
    resolved.issues.join(" | "),
  );
  const validated = parseSpec(spec);
  check(
    "and neither does validation",
    validated.ok && validated.issues.length === 0,
    validated.ok
      ? validated.issues.map((issue) => issue.message).join(" | ")
      : validated.error,
  );

  const parts = buildParts(spec).parts;
  const corner = parts.filter((part) => /corner/i.test(part.label));
  check(
    "the corner is cut as real boards, not left to the shop",
    corner.length >= 8,
    `${corner.length} corner pieces`,
  );
  check(
    "including its own gable, top, bottom, back and doors",
    ["gable", "top", "back", "door"].every((role) =>
      corner.some((part) => part.role === role),
    ),
    [...new Set(corner.map((part) => part.role))].join(", "),
  );
  check(
    "and it stands on the wardrobe's own plinth, not bought legs",
    corner.some((part) => part.role === "plinth"),
  );

  check(
    "no two boards occupy the same space",
    clashes(spec).length === 0,
    clashes(spec).slice(0, 3).join(" | "),
  );
}

// ---------------------------------------------------------------------------
// 4. A U loses a corner at both ends of its back wall
// ---------------------------------------------------------------------------

{
  const spec = build("u_shaped", [1800, 3000, 1800]);
  const resolved = resolveDesign(spec);

  check("a U is three runs", spec.runs.length === 3);
  check("and three carcasses", spec.cabinets.length === 3);
  check(
    "the back wall loses a corner at each end, the sides one each",
    spec.cabinets.map((cabinet) => cabinet.size.width).join() === "1200,1800,1200",
    spec.cabinets.map((cabinet) => cabinet.size.width).join(),
  );
  check(
    "there are two corners",
    resolved.layout.corners.length === 2,
    `${resolved.layout.corners.length}`,
  );
  check(
    "each joining a different pair of runs",
    new Set(resolved.layout.corners.map((corner) => corner.between.join("+")))
      .size === 2,
  );
  check(
    "every carcass is on its own run",
    new Set(spec.cabinets.map((cabinet) => cabinet.runId)).size === 3,
    spec.cabinets.map((cabinet) => cabinet.runId).join(", "),
  );
  check(
    "the solver has nothing to complain about",
    resolved.issues.length === 0,
    resolved.issues.join(" | "),
  );
}

// ---------------------------------------------------------------------------
// 4b. The bays fill the carcass they are in
//
// Every run is fitted out by one rule, so the openings plus the boards between
// and beside them come to the carcass width — on the back wall of a U as much
// as on a straight wardrobe. Without this a run could be laid out to some other
// width and the only symptom would be a gap nobody notices until the doors are
// hung.
// ---------------------------------------------------------------------------

for (const [label, shape, walls] of [
  ["straight", "straight", [2400]],
  ["L", "l_shaped", [2400, 1800]],
  ["U", "u_shaped", [1800, 3000, 1800]],
] as const) {
  const spec = build(shape, [...walls]);
  const t = spec.carcass.board.thickness;

  const wrong = spec.cabinets.filter((cabinet) => {
    const openings = cabinet.bays.reduce((total, bay) => total + bay.width, 0);
    const boards = (cabinet.bays.length - 1) * t + 2 * t;
    return Math.abs(openings + boards - cabinet.size.width) > 1;
  });

  check(
    `${label}: the openings and the boards come to the carcass width`,
    wrong.length === 0,
    wrong
      .map(
        (cabinet) =>
          `${cabinet.label}: ${cabinet.bays.reduce((n, bay) => n + bay.width, 0)} + boards vs ${cabinet.size.width}`,
      )
      .join(" | "),
  );
  check(
    `${label}: and every carcass got bays at all`,
    spec.cabinets.every((cabinet) => cabinet.bays.length > 0),
  );
}

// ---------------------------------------------------------------------------
// 5. The drawer formula is the one it always was
// ---------------------------------------------------------------------------

for (const [label, thickness] of [["18 mm", 18], ["15 mm", 15]] as const) {
  const spec = build("l_shaped", [2400, 1800]);

  // All three construction boards, not just the carcass one. A drawer's sides
  // are cut from the *interior* board, which the wardrobe starter sets
  // explicitly — changing only `board` leaves the box at its old thickness and
  // makes this read like an engine fault when it is a fault in the fixture.
  const swap = (board: typeof spec.carcass.board) => ({ ...board, thickness });
  spec.carcass.board = swap(spec.carcass.board);
  spec.carcass.frontBoard = swap(spec.carcass.frontBoard ?? spec.carcass.board);
  spec.carcass.interiorBoard = swap(
    spec.carcass.interiorBoard ?? spec.carcass.board,
  );

  const parts = buildParts(spec).parts;
  const bases = parts.filter((part) => part.role === "drawer_base");
  const ends = parts.filter((part) => part.role === "drawer_back");

  check(`${label}: an L still has drawers`, bases.length > 0);

  // Every drawer in an L is cut by the straight formula, from the bay it is
  // in: box = opening − two runner clearances, ends = box − two boards. There
  // is no L-shaped drawer.
  // A drawer inside a stacked bay carries a synthetic id — the bay's, plus the
  // section's — so the opening is found by the prefix. The section spans the
  // full bay, which is exactly why the width is the bay's width.
  const openings = spec.cabinets.flatMap((cabinet) =>
    cabinet.bays.map((bay) => ({ id: bay.id, width: bay.width })),
  );
  const openingFor = (bayId: string | undefined) =>
    openings.find((bay) => bayId === bay.id || bayId?.startsWith(`${bay.id}-`))
      ?.width;

  check(
    `${label}: the openings are found at all`,
    bases.every((part) => openingFor(part.bayId) !== undefined),
    "a lookup that misses makes every assertion below it vacuous",
  );
  check(
    `${label}: every drawer box is its own bay less a runner each side`,
    bases.every((part) => part.length === (openingFor(part.bayId) ?? 0) - 2 * 12),
    bases.map((part) => `${part.length} in ${openingFor(part.bayId)}`).join(", "),
  );
  check(
    `${label}: and every front and back fits between the sides`,
    ends.every(
      (part) =>
        part.length === (openingFor(part.bayId) ?? 0) - 2 * 12 - 2 * thickness,
    ),
    ends.map((part) => `${part.length} in ${openingFor(part.bayId)}`).join(", "),
  );
}

// ---------------------------------------------------------------------------
// 6. No fake bays, and every piece says where it belongs
// ---------------------------------------------------------------------------

{
  const spec = build("l_shaped", [2400, 1800]);
  const parts = buildParts(spec).parts;

  const realBays = new Set(
    spec.cabinets.flatMap((cabinet) => cabinet.bays.map((bay) => bay.id)),
  );
  const claimed = parts
    .map((part) => part.bayId)
    .filter((id): id is string => Boolean(id));

  check(
    "every part that names a bay names one that exists",
    claimed.every((id) => realBays.has(id) || [...realBays].some((real) => id.startsWith(real))),
    claimed.filter((id) => !realBays.has(id) && ![...realBays].some((real) => id.startsWith(real))).join(", "),
  );
  check(
    "no part id is used twice",
    new Set(parts.map((part) => part.id)).size === parts.length,
    "two parts with one id merge in the cut list and one of them is never cut",
  );
  check(
    "and no label exposes an internal bay id",
    parts.every((part) => !/bay-\d/.test(part.label)),
    parts.filter((part) => /bay-\d/.test(part.label)).map((part) => part.label).join(", "),
  );
}

// ---------------------------------------------------------------------------
// 7. A known defect in the U corner, recorded rather than hidden
//
// The overlap test found it and it is not mine to have caused: the same corner
// code serves U-shaped kitchens and predates this work. A U's *left* corner
// parks its return leaf in the same 18 × 592 × 2298 space as the left run's
// gable — the whole door, inside a board.
//
// It is asserted here as the defect it is, so that the day it is fixed this
// check fails and says so, rather than a silent expectation quietly passing.
// Straight and L are clean, which is why they are the two the picker offers.
// ---------------------------------------------------------------------------

{
  const setup = readFileSync(
    "src/features/berchuma-studio/components/wardrobe-shape-setup.tsx",
    "utf8",
  );

  check(
    "the picker offers the two shapes that are clean",
    /value: "straight"/.test(setup) && /value: "l_shaped"/.test(setup),
  );
  check(
    "and does not offer the one that is not",
    !/\{ value: "u_shaped"/.test(setup),
    "a manufacturing tool should not offer a shape it knows draws two boards in one place",
  );

  const found = clashes(build("u_shaped", [1800, 3000, 1800]));

  check(
    "the U corner defect is still exactly the two pairs it was",
    found.length === 2,
    `${found.length}: ${found.join(" | ")} — if this changed, re-read section 7`,
  );
  check(
    "and it is the corner's return leaf, in the adjacent run's gable",
    found.some((clash) => /return door/.test(clash) && /gable/i.test(clash)),
    found.join(" | "),
  );
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}wardrobe shapes: straight and L are clean; the U corner is not${RESET}`);
