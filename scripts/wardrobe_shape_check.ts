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
  wardrobeCornerKind,
} from "../src/features/berchuma-studio/services/starting-designs.ts";
import { startingDesign } from "../src/features/berchuma-studio/services/starting-designs.ts";
import { buildParts } from "../src/features/berchuma-studio/services/geometry.ts";
import { resolveDesign } from "../src/features/berchuma-studio/services/resolve.ts";
import {
  partCentre,
  partRotationRadians,
  rotatedRectBounds,
} from "../src/features/berchuma-studio/services/part-transform.ts";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Plan } from "../src/features/berchuma-studio/components/viewer/plan.tsx";

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
  check(
    "both L runs face the usable inside",
    resolved.cabinets.map((cabinet) => cabinet.rotation).join() === "180,270",
    resolved.cabinets.map((cabinet) => cabinet.rotation).join(),
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
    "including its own gable, top, bottom, back and shelves",
    ["gable", "top", "back", "shelf"].every((role) =>
      corner.some((part) => part.role === role),
    ),
    [...new Set(corner.map((part) => part.role))].join(", "),
  );
  check(
    "and it stands on the wardrobe's own plinth, not bought legs",
    corner.some((part) => part.role === "plinth"),
  );
  check(
    "the default wardrobe corner is open shelving, not an exterior door",
    corner.filter((part) => part.role === "door").length === 0 &&
      corner.filter((part) => part.role === "shelf").reduce((sum, part) => sum + part.quantity, 0) >= 4,
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
  check(
    "left, back and right U runs face the centre",
    resolved.cabinets.map((cabinet) => cabinet.rotation).join() === "90,180,270",
    resolved.cabinets.map((cabinet) => cabinet.rotation).join(),
  );
  const cornerIds = new Set(resolved.layout.corners.map((corner) => corner.id));
  const cornerDoors = buildParts(spec).parts.filter((part) =>
    part.role === "door" && cornerIds.has(part.id.split("/")[0]!),
  );
  check(
    "both U corner fronts face the centre",
    cornerDoors.every((part) =>
      part.rotationY === (part.id.startsWith("corner-left/") ? 135 : -135)),
  );
  const resized = resolveDesign(build("u_shaped", [2200, 3600, 2000]));
  check(
    "resizing keeps every U run inward",
    resized.cabinets.map((cabinet) => cabinet.rotation).join() === "90,180,270",
    resized.cabinets.map((cabinet) => cabinet.rotation).join(),
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
// 7. The corner construction follows the shape, and nothing overlaps
//
// A diagonal opening stays inside the carved-out corner square and faces the
// usable centre. Putting square doors on those inner faces crosses the end
// gables of the neighbouring runs.
//
// The cut list is correct either way. It is the placement that is impossible,
// which is why this is found by intersecting parts and not by reading code.
// ---------------------------------------------------------------------------

{
  check(
    "an L wardrobe defaults to full corner shelving",
    wardrobeCornerKind("l_shaped") === "l_corner",
    wardrobeCornerKind("l_shaped"),
  );
  check(
    "a U wardrobe uses the same full corner default",
    wardrobeCornerKind("u_shaped") === "l_corner",
    wardrobeCornerKind("u_shaped"),
  );
  check(
    "and the design carries the kind it was solved with",
    build("l_shaped", [2400, 1800]).cornerKind === "l_corner" &&
      build("u_shaped", [1800, 3000, 1800]).cornerKind === "l_corner",
    "solved one way and stored another, every later edit re-solves it differently",
  );

  for (const [label, shape, walls] of [
    ["straight", "straight", [2400]],
    ["L", "l_shaped", [2400, 1800]],
    ["U", "u_shaped", [1800, 3000, 1800]],
  ] as const) {
    const found = clashes(build(shape, [...walls]));
    check(
      `${label}: no two boards occupy the same space`,
      found.length === 0,
      found.slice(0, 3).join(" | "),
    );
  }

  const shelving = buildParts(build("u_shaped", [1800, 3000, 1800])).parts.filter(
    (part) => /corner/i.test(part.label),
  );
  check(
    "a U's corners are cut as real boards",
    shelving.length >= 16,
    `${shelving.length} pieces across two corners`,
  );
  check(
    "including usable shelves in both corners",
    shelving.filter((part) => part.role === "shelf").reduce((sum, part) => sum + part.quantity, 0) >= 8,
    [...new Set(shelving.map((part) => part.label))].join(" / "),
  );
  check(
    "and a structural gable in each corner",
    shelving.filter((part) => part.role === "gable").length >= 2,
    `${shelving.filter((part) => part.role === "gable").length} gables across two corners`,
  );

  const mixed = build("u_shaped", [1800, 3000, 1800]);
  mixed.cornerKinds = { "corner-left": "hanging", "corner-right": "diagonal" };
  const mixedResolved = resolveDesign(mixed);
  const mixedParts = buildParts(mixed).parts;
  check(
    "each U corner can keep its own edited type",
    mixedResolved.layout.corners.map((corner) => corner.kind).join() === "hanging,diagonal",
  );
  check(
    "a hanging corner produces a real rail and a diagonal produces its face",
    mixedParts.some((part) => part.id === "corner-left/hanging-rail") &&
      mixedParts.some((part) => part.id === "corner-right/diagonal-face"),
  );
  check(
    "edited corner types remain collision free",
    clashes(mixed).length === 0,
    clashes(mixed).slice(0, 3).join(" | "),
  );
}

{
  const setup = readFileSync(
    "src/features/berchuma-studio/components/wardrobe-shape-setup.tsx",
    "utf8",
  );

  for (const shape of wardrobeShapes) {
    check(
      `the picker offers ${shape}`,
      new RegExp(`value: "${shape}"`).test(setup),
    );
  }
}

// ---------------------------------------------------------------------------
// 9. The plan, which is the only view an L is an L in
//
// An elevation projects two runs at a right angle onto one another: the leg
// coming towards you is a sliver the width of its depth and the corner is not
// visible at all. So there is a third view.
//
// It is *rendered* here rather than read. Three source-text assertions were
// written first and all three survived mutation — `usableLength` still appeared
// in the label offset after the polygon was changed to `wallLength`, and
// `resolveDesign` still appeared after a statement was appended beside it. The
// identifier outliving the call, three times in one section. Rendering it and
// measuring the markup cannot be fooled that way.
// ---------------------------------------------------------------------------

{
  const markup = (shape: "l_shaped" | "u_shaped", walls: number[]) =>
    renderToStaticMarkup(
      createElement(Plan, { spec: build(shape, walls) }),
    );

  const l = markup("l_shaped", [2400, 1800]);
  const u = markup("u_shaped", [1800, 3000, 1800]);

  /** Every `points="…"` polygon in the markup, as numbers. */
  const polygons = (svg: string) =>
    [...svg.matchAll(/points="([^"]+)"/g)].map((match) =>
      match[1]!.split(" ").map((pair) => pair.split(",").map(Number)),
    );

  const extentOf = (corners: number[][]) => ({
    width: Math.max(...corners.map((c) => c[0]!)) - Math.min(...corners.map((c) => c[0]!)),
    depth: Math.max(...corners.map((c) => c[1]!)) - Math.min(...corners.map((c) => c[1]!)),
  });

  const lShapes = polygons(l).map(extentOf);

  check(
    "the plan draws something for every run and every carcass",
    lShapes.length === 4,
    `${lShapes.length} polygons for an L's two runs and two carcasses`,
  );

  // 2400 − 600 and 1800 − 600. A run drawn at its wall length would be 2400
  // and 1800 and would run straight through the corner it stops for.
  check(
    "each run is drawn at the length left after its corners",
    lShapes.some((box) => Math.round(box.width) === 1800 && Math.round(box.depth) === 600) &&
      lShapes.some((box) => Math.round(box.width) === 600 && Math.round(box.depth) === 1200),
    lShapes.map((box) => `${Math.round(box.width)}×${Math.round(box.depth)}`).join(", "),
  );
  check(
    "and nothing is drawn at a wall length",
    !lShapes.some((box) => Math.round(box.width) === 2400 || Math.round(box.depth) === 1800),
    lShapes.map((box) => `${Math.round(box.width)}×${Math.round(box.depth)}`).join(", "),
  );

  check(
    "the wall lengths are still written down, because they are what people know",
    /Wall A · 2400 mm/.test(l) && /Wall B · 1800 mm/.test(l),
  );
  check(
    "and the U names its three walls",
    /Left wall · 1800 mm/.test(u) &&
      /Back wall · 3000 mm/.test(u) &&
      /Right wall · 1800 mm/.test(u),
  );

  // The corner squares are `<rect>`s filled with the hatch pattern.
  const cornerRects = (svg: string) =>
    [...svg.matchAll(/<rect[^>]*url\(#plan-corner\)[^>]*>/g)].length;

  check(
    "an L draws its one corner",
    cornerRects(l) === 1,
    `${cornerRects(l)}`,
  );
  check(
    "and a U draws both of its corners",
    cornerRects(u) === 2,
    `${cornerRects(u)}`,
  );

  // At the size it is, not merely present. A zero-width rect is still a rect
  // and still counted, which is what a count alone cannot tell you.
  const cornerWidths = [...l.matchAll(/<rect[^>]*url\(#plan-corner\)[^>]*>/g)]
    .map((match) => Number(/width="(\d+)"/.exec(match[0]!)?.[1] ?? 0));
  check(
    "at the depth it actually takes out of both walls",
    cornerWidths.every((width) => width === 600),
    cornerWidths.join(", "),
  );
  check(
    "the corner is labelled with the depth it takes out of both walls",
    /<text[^>]*>600<\/text>/.test(l),
    "the gap between a wall and its carcass is the number people are surprised by",
  );

  check(
    "each carcass says how many bays it has",
    /3 bays/.test(l) && /2 bays/.test(l),
  );
  check(
    "and the footprint is stated once",
    /2400 × 1800 mm on the floor/.test(l) &&
      /3000 × 1800 mm on the floor/.test(u),
  );

  // Selection is shared with the other two views, so a cabinet picked in the
  // plan is still picked after switching.
  //
  // Compared against the unpicked drawing rather than searched for a class.
  // `stroke-brand` is on the corner square and the corner's label too, so a
  // search for it passes on a plan that shows no selection at all.
  const spec = build("l_shaped", [2400, 1800]);
  const unpicked = renderToStaticMarkup(createElement(Plan, { spec }));
  const picked = renderToStaticMarkup(
    createElement(Plan, { spec, selectedCabinetId: spec.cabinets[0]!.id }),
  );

  check(
    "a selected carcass is drawn differently from an unselected one",
    picked !== unpicked,
    "the plan has to show the same selection the 3D view and the elevation do",
  );
  // Both, because either alone survives losing the other: dropping the colour
  // leaves the weight, and a drawing that still shows the selection is not a
  // drawing that shows it properly.
  check(
    "by a heavier outline",
    /<polygon[^>]*stroke-width="22"/.test(picked) &&
      !/<polygon[^>]*stroke-width="22"/.test(unpicked),
  );
  check(
    "and in the selection colour",
    /<polygon[^>]*stroke-brand/.test(picked) &&
      !/<polygon[^>]*stroke-brand/.test(unpicked),
    "the corner square is stroke-brand too, so this has to be the polygon",
  );

  const clickable = renderToStaticMarkup(
    createElement(Plan, { spec, onSelectCabinet: () => {} }),
  );
  check(
    "a carcass shows as clickable when the view can select",
    /cursor-pointer/.test(clickable) && !/cursor-pointer/.test(unpicked),
  );

  // A rendered handler leaves no trace in static markup, so this one is read.
  // Scoped to the carcass loop: `onSelectCabinet` appears in the props and in
  // the cursor class, and a search of the file passes with the click gone.
  const plan = readFileSync(
    "src/features/berchuma-studio/components/viewer/plan.tsx",
    "utf8",
  );
  const carcassLoop = plan.slice(
    plan.indexOf("{resolved.cabinets.map("),
  );
  check(
    "and pressing it actually selects",
    /onClick=\{\s*onSelectCabinet\s*\?\s*\(\) =>\s*onSelectCabinet\(selected \? null : placed\.cabinet\.id\)/.test(
      carcassLoop,
    ),
    "a cursor that promises a click over nothing is worse than no cursor",
  );
}

{
  const editor = readFileSync(
    "src/features/berchuma-studio/components/editor/design-editor.tsx",
    "utf8",
  );

  check(
    "the editor offers a third view",
    /type View = "solid" \| "flat" \| "plan";/.test(editor) && /<Plan\b/.test(editor),
  );
  check(
    "only where there is a corner to look at",
    /\{spec\.layout !== "straight" \? \(/.test(editor),
    "on a straight wardrobe the plan is one rectangle and says nothing the elevation does not",
  );
}

// ---------------------------------------------------------------------------

// Exercise the actual boards consumed by Model, including access into corners.
for (const shape of ["l_shaped", "u_shaped"] as const) {
  const spec = build(shape, shape === "u_shaped" ? [1800, 3000, 1800] : [3000, 1800]);
  const resolved = resolveDesign(spec);
  const parts = buildParts(spec).parts;
  const count = shape === "u_shaped" ? 2 : 1;
  const moduleBoxes = [
    ...resolved.cabinets.map((c) => rotatedRectBounds(c, c.cabinet.size, c.rotation)),
    ...resolved.layout.corners.map((c) => rotatedRectBounds(c, { width: c.size, depth: c.size }, 0)),
  ];
  check(`${shape}: cabinet and corner footprints never overlap`, moduleBoxes.every((a, i) => moduleBoxes.slice(i + 1).every((b) =>
    Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) < 0.01 || Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) < 0.01)));
  check(`${shape}: physical corner shelf modules`, parts.filter((p) => p.id.endsWith("/corner-shelves")).length === count);
  check(`${shape}: both adjacent ends open into every corner`, parts.filter((p) => p.label === "Corner access rear support" && p.size.z === 60).length === count * 2);
  for (const corner of resolved.layout.corners) {
    const gable = parts.find((p) => p.id === `${corner.id}/gable-left`)!;
    const exteriorX = corner.id === "corner-left" ? corner.x : corner.x + corner.size - gable.size.x;
    check(`${corner.id}: closed side lies on exterior`, Math.abs(gable.placements[0]!.x - exteriorX) < 0.01);
    check(`${corner.id}: full usable shelf reaches open side`, parts.find((p) => p.id === `${corner.id}/corner-shelves`)!.size.x === corner.size - gable.size.x);
  }
  check(`${shape}: exact requested dimensions have no board overlaps`, clashes(spec).length === 0, clashes(spec).slice(0, 3).join("; "));
  if (shape === "u_shaped") check("3000 × 1800 U reserves two 600 mm corners", resolved.layout.placements.map((p) => p.usableLength).join() === "1200,1800,1200");
}

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  throw new Error(`${failures.length} wardrobe shape checks failed`);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}wardrobe shapes: straight, L and U, and no two boards in one place${RESET}`);
