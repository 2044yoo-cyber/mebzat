import type {
  BandedEdges,
  HardwareLine,
  Part,
  PartsBreakdown,
} from "../types/parts";
import { findHardware } from "../types/catalogue";
import {
  cornerHardware,
  cornerParts,
  hingesPerLeaf as hingesForLeaf,
} from "./corners";
export { hingesPerLeaf } from "./corners";
import { resolveDrawerConstruction } from "./drawer-construction";
import {
  distributeDimension,
  distributeDimensionWithMinimum,
} from "./dimensions";
import { splitSpanAtSupports } from "./panel-segmentation";
import { transformPlanPoint } from "./part-transform";
import { resolveDesign } from "./resolve";
import { ledHardwareLine } from "./lighting";
import {
  constructionMaterials,
  edgeBandForConstructionBoard,
} from "./wardrobe-materials";
import {
  recessedWardrobePlinthParts,
  WARDROBE_PLINTH_VISIBLE_RECESS,
} from "./wardrobe-plinth";
import type {
  Bay,
  Cabinet,
  DesignSpec,
  Hardware,
  StackSection,
} from "../types/spec";

/**
 * A design, taken apart into the pieces somebody has to cut.
 *
 * This is the only place in Berchuma that knows how a cabinet is actually
 * made — that the top and bottom sit between the gables rather than on top of
 * them, that a shelf is set back from the front edge, that a drawer box is
 * narrower than its opening by twice the runner clearance. Everything else
 * consumes the output.
 *
 * It is a pure function of the spec: no React, no database, no clock, no
 * randomness. That is what lets the browser re-run it on every drag of a width
 * slider and the server re-run it months later to reproduce a cut list for a
 * job that has gone to the shop.
 *
 * The construction modelled is the one used almost everywhere in Ethiopian
 * joinery: a butt-jointed melamine carcass with a rebated or pinned back, an
 * applied plinth, and concealed hinges. Frame-and-panel and face-frame
 * construction are different part lists and would be different builders.
 */

/**
 * Where a hanging rail's shelf sits, as a share of the bay's interior height.
 *
 * Exported because the flat elevation draws the same shelves. Two files each
 * holding their own idea of "near the top" is two drawings of two different
 * wardrobes, and the one that gets built is whichever the joiner opened.
 */
export const RAIL_SHELF_HEIGHTS = [0.84, 0.5] as const;

/** Diameter of a hanging rail, in mm. 25 is what every shop in Addis stocks. */
const RAIL_DIAMETER = 25;
export { WARDROBE_PLINTH_VISIBLE_RECESS } from "./wardrobe-plinth";
/**
 * How far the rail hangs below the shelf it is fixed under.
 *
 * The socket has a body, and a rail flush with the underside of the shelf is
 * one no hanger can be lifted onto.
 */
const RAIL_DROP = 45;
/** The rail stops short of each gable so its sockets have something to sit on. */
const RAIL_INSET = 12;

const NO_EDGES: BandedEdges = {
  front: false,
  back: false,
  top: false,
  bottom: false,
};

/**
 * Every part in the design, from every cabinet, in the design's own frame.
 *
 * The carpentry lives one level down, in `cabinetParts`, which knows how to
 * take one box apart and nothing about the rest of the design. This walks the
 * cabinets, asks each one for its parts, and moves them into place.
 *
 * Translating here rather than inside the cabinet builder is what keeps the
 * carpentry honest: a cabinet is designed at the origin, exactly as it would be
 * drawn on its own, and where it stands in the room is somebody else's problem.
 */
export function buildParts(spec: DesignSpec): PartsBreakdown {
  const parts: Part[] = [];

  // Positions come from the layout solver, not from `cabinet.position`. That
  // is the whole of the parametric promise: a cabinet on Wall B moves when
  // Wall A is lengthened, and it moves here, once, rather than in the viewer
  // and again in the cut list and again in the costing.
  const resolved = resolveDesign(spec);

  for (const placed of resolved.cabinets) {
    const { cabinet, rotation } = placed;

    for (const part of cabinetParts(spec, cabinet)) {
      parts.push({
        ...part,
        // Ids must be unique across the design — two base units both containing
        // "gable-left" would collide in the viewer's keys and in the cut list.
        id: `${cabinet.id}/${part.id}`,
        cabinetId: cabinet.id,
        rotationY: rotation === 0 ? undefined : rotation,
        placements: part.placements.map((placement) =>
          // The local offset is turned with the run before it is moved onto
          // it. Translating first and rotating after would swing the whole
          // cabinet about the room's origin instead of about its own corner.
          rotateThenPlace(placement, rotation, placed.x, placed.y, placed.z),
        ),
      });
    }
  }

  parts.push(...cornerParts(spec, resolved));
  parts.push(...worktopParts(spec));

  const lighting = ledHardwareLine(spec);
  return summarise(
    parts,
    lighting
      ? [...hardwareFor(spec, parts, resolved), lighting]
      : hardwareFor(spec, parts, resolved),
  );
}

/**
 * A part's local offset, turned onto its run and then moved to it.
 *
 * The order matters and is the commonest way to get this wrong. A cabinet at
 * x 2400 on a run turned 90° must pivot about its own front-left corner; doing
 * the translation first pivots it about the room's origin and throws it across
 * the kitchen.
 */
function rotateThenPlace(
  local: { x: number; y: number; z: number },
  rotation: number,
  x: number,
  y: number,
  z: number,
): { x: number; y: number; z: number } {
  const plan = transformPlanPoint({ x, z }, rotation, local);
  return {
    x: plan.x,
    y: local.y + y,
    z: plan.z,
  };
}

/**
 * The support beneath one cabinet.
 *
 * Wardrobes use one recessed plinth as their shared visual and physical base.
 * Other furniture keeps its existing legs-or-plinth behaviour: a kitchen base
 * cabinet and a freestanding wardrobe do not need to look the same.
 */
function standParts(
  spec: DesignSpec,
  cabinet: Cabinet,
  envelope: { width: number; height: number; depth: number },
  plinth: number,
  board: DesignSpec["carcass"]["board"],
  t: number,
  frontThickness: number,
  supportJoints: readonly number[],
): Part[] {
  // `furnitureType`, not `kind`, is the durable classification here. `kind`
  // is the starting preset; the type remains wardrobe after an edit or an
  // upgrade of an older saved design.
  if (spec.furnitureType === "wardrobe") {
    return recessedWardrobePlinthParts(
      {
        width: envelope.width,
        depth: envelope.depth,
        height: plinth,
        board,
        edgeBand: edgeBandForConstructionBoard(
          spec,
          board,
          spec.carcass.edgeBand,
        ),
        carcassThickness: t,
        frontThickness,
        supportJoints,
      },
    );
  }

  const legs = spec.legs;

  // No legs configured is not "no support". Every design written before legs
  // existed reserved `plinthHeight` for something to stand on, and Zekolo is
  // what an Ethiopian shop puts there.
  const kind = legs?.kind ?? "zekolo";

  if (kind === "none") {
    // Explicitly none: a plinth on the three visible sides. Still not
    // front-only — the sides are visible on an end unit and a wardrobe with a
    // floating side edge looks unfinished from every angle but one.
    return plinthParts(envelope, plinth, board, spec.carcass.edgeBand, t);
  }

  const section = legs?.thickness ?? 50;
  const inset = legs?.inset ?? 35;
  const height = Math.min(legs?.height ?? plinth, plinth);

  // The four corners, always. Inset from both axes so the leg is under the
  // carcass rather than at its very edge.
  const xs = [inset, envelope.width - inset - section];
  const zs = [inset, envelope.depth - inset - section];

  const placements: { x: number; y: number; z: number }[] = [];
  for (const x of xs) {
    for (const z of zs) {
      placements.push({ x: Math.max(0, x), y: 0, z: Math.max(0, z) });
    }
  }

  // Intermediate pairs on a wide carcass. `- 1` because four corner legs
  // already cover the two ends: a 2700 mm carcass needs two extra pairs, not
  // three.
  const spans = Math.max(0, Math.ceil(envelope.width / 900) - 1);
  for (let i = 1; i <= spans; i += 1) {
    const x = (envelope.width / (spans + 1)) * i - section / 2;
    for (const z of zs) {
      placements.push({ x: Math.max(0, x), y: 0, z: Math.max(0, z) });
    }
  }

  return [
    {
      id: "leg",
      role: "leg",
      label: legLabel(kind),
      board,
      manufacture: "purchased",
      // A leg is bought, not cut from a sheet, so its "length" is its height
      // and the cut list shows it as a piece rather than a panel.
      length: height,
      width: section,
      quantity: placements.length,
      edges: NO_EDGES,
      edgeBand: spec.carcass.edgeBand,
      size: { x: section, y: height, z: section },
      axis: "y",
      placements,
    },
  ];
}

function legLabel(kind: string): string {
  switch (kind) {
    case "zekolo":
      return "Zekolo leg";
    case "adjustable":
      return "Adjustable leg";
    case "standard":
      return "Leg";
    default:
      return "Leg";
  }
}

/** A plinth on the three sides anybody can see. */
function plinthParts(
  envelope: { width: number; depth: number },
  plinth: number,
  board: DesignSpec["carcass"]["board"],
  band: DesignSpec["carcass"]["edgeBand"],
  t: number,
): Part[] {
  const NO: BandedEdges = { front: false, back: false, top: false, bottom: false };

  return [
    {
      id: "plinth-front",
      role: "plinth",
      label: "Plinth, front",
      board,
      length: envelope.width,
      width: plinth,
      quantity: 1,
      edges: { ...NO, top: true },
      edgeBand: band,
      placements: [{ x: 0, y: 0, z: 0 }],
      size: { x: envelope.width, y: plinth, z: t },
      axis: "z",
    },
    {
      id: "plinth-side",
      role: "plinth",
      label: "Plinth, side",
      board,
      length: envelope.depth - t,
      width: plinth,
      quantity: 2,
      edges: { ...NO, top: true },
      edgeBand: band,
      placements: [
        { x: 0, y: 0, z: t },
        { x: envelope.width - t, y: 0, z: t },
      ],
      size: { x: t, y: plinth, z: envelope.depth - t },
      axis: "x",
    },
  ];
}

/**
 * The counter, and the upstand behind it.
 *
 * A worktop is cut per *run*, not per cabinet: three 600 mm base units under
 * one 1800 mm top is one piece with two joints avoided, which is both how a
 * shop cuts it and why a kitchen top is expensive. So adjacent base cabinets
 * are gathered into runs first, and a tall unit standing between them ends one
 * run and starts another — because that is exactly what it does in the room.
 */
function worktopParts(spec: DesignSpec): Part[] {
  const worktop = spec.worktop;
  if (!worktop) return [];

  const carrying = spec.cabinets
    .filter((cabinet) => cabinet.kind === "base" || cabinet.kind === "island")
    .sort((a, b) => a.position.x - b.position.x);

  if (carrying.length === 0) return [];

  const parts: Part[] = [];
  let run: Cabinet[] = [];
  let index = 0;

  const flush = () => {
    if (run.length === 0) return;

    const first = run[0]!;
    const last = run[run.length - 1]!;
    const left = first.position.x;
    const right = last.position.x + last.size.width;
    const depth = Math.max(...run.map((cabinet) => cabinet.size.depth));
    const height = Math.max(
      ...run.map((cabinet) => cabinet.position.y + cabinet.size.height),
    );

    const width = right - left;
    // Forward of the cabinet fronts, so the overhang shows and drips clear of
    // the doors. z is measured backwards from the front plane, so the slab
    // starts at a negative z.
    const slabDepth = depth + worktop.overhang;

    parts.push({
      id: `worktop-${index}`,
      role: "worktop",
      label: run.length === 1 ? `Worktop — ${first.label}` : "Worktop",
      board: worktop.board,
      length: Math.round(width),
      width: Math.round(slabDepth),
      quantity: 1,
      // The front edge and both ends show; the back goes to the wall.
      edges: { front: true, back: false, top: true, bottom: true },
      edgeBand: spec.carcass.edgeBand,
      placements: [{ x: left, y: height, z: -worktop.overhang }],
      size: {
        x: Math.round(width),
        y: worktop.board.thickness,
        z: Math.round(slabDepth),
      },
      axis: "y",
    });

    if (worktop.backsplashHeight > 0) {
      parts.push({
        id: `backsplash-${index}`,
        role: "backsplash",
        label: "Splashback",
        board: worktop.board,
        length: Math.round(width),
        width: Math.round(worktop.backsplashHeight),
        quantity: 1,
        edges: { front: true, back: false, top: true, bottom: true },
        edgeBand: spec.carcass.edgeBand,
        placements: [
          {
            x: left,
            y: height + worktop.board.thickness,
            // Against the back wall, standing up.
            z: depth - worktop.board.thickness,
          },
        ],
        size: {
          x: Math.round(width),
          y: Math.round(worktop.backsplashHeight),
          z: worktop.board.thickness,
        },
        axis: "z",
      });
    }

    index += 1;
    run = [];
  };

  for (const cabinet of carrying) {
    const previous = run[run.length - 1];

    // A gap of more than a millimetre means something stands between them —
    // a tall unit, a fridge space, a doorway — and the top does not bridge it.
    const adjoins =
      previous !== undefined &&
      Math.abs(previous.position.x + previous.size.width - cabinet.position.x) <= 1 &&
      Math.abs(
        previous.position.y +
          previous.size.height -
          (cabinet.position.y + cabinet.size.height),
      ) <= 1;

    if (!adjoins) flush();
    run.push(cabinet);
  }
  flush();

  return parts;
}

/** One cabinet, taken apart, positioned at its own origin. */
function cabinetParts(spec: DesignSpec, cabinet: Cabinet): Part[] {
  const parts: Part[] = [];
  const { carcass } = spec;
  const envelope = cabinet.size;
  const bays = cabinet.bays;
  const materials = constructionMaterials(spec);
  const board = materials.body;
  const bodyBand = edgeBandForConstructionBoard(spec, board, carcass.edgeBand);
  const backBand = edgeBandForConstructionBoard(
    spec,
    materials.back,
    carcass.edgeBand,
  );
  const plinthBand = edgeBandForConstructionBoard(
    spec,
    materials.plinth,
    carcass.edgeBand,
  );
  const t = board.thickness;
  const plinth = cabinet.plinthHeight;

  // The carcass sits on the plinth, so its height is the envelope less the
  // plinth. Everything below is measured inside that box.
  const carcassHeight = envelope.height - plinth;
  const interiorHeight = carcassHeight - 2 * t;
  const depth = envelope.depth;
  const backBoard = materials.back;
  const backThickness = backBoard.thickness;
  // The 6 mm back is applied at the rear of the shell. Carcass boards stop at
  // its front face, so the complete cabinet still keeps its specified depth
  // without the back intersecting gables, dividers or top/bottom boards.
  const shellDepth = depth - backThickness;
  /** Usable depth in front of the applied back panel. */
  const interiorDepth = shellDepth;

  const push = (part: Omit<Part, "edgeBand">, edgeBand = bodyBand) =>
    parts.push({ ...part, edgeBand });

  // ---- Gables ------------------------------------------------------------
  // Full-height outer sides. Only the front edge shows.
  push({
    id: "gable-left",
    role: "gable",
    label: "Left gable",
    board,
    length: carcassHeight,
    width: shellDepth,
    quantity: 1,
    edges: { ...NO_EDGES, front: true },
    placements: [{ x: 0, y: plinth, z: 0 }],
    size: { x: t, y: carcassHeight, z: shellDepth },
    axis: "x",
  });
  push({
    id: "gable-right",
    role: "gable",
    label: "Right gable",
    board,
    length: carcassHeight,
    width: shellDepth,
    quantity: 1,
    edges: { ...NO_EDGES, front: true },
    placements: [{ x: envelope.width - t, y: plinth, z: 0 }],
    size: { x: t, y: carcassHeight, z: shellDepth },
    axis: "x",
  });

  // ---- Top and bottom ----------------------------------------------------
  // Housed between the gables, so their total length is the envelope less
  // both. Wide wardrobes use sections that meet at divider centre lines: each
  // join is carried by a real vertical divider instead of asking a shop to cut
  // one unplaceable 3–6 m board or hiding an unsupported visual seam.
  const spanWidth = envelope.width - 2 * t;
  const dividerCentres = cabinetDividerCentres(cabinet, t);
  const horizontalSections = splitSpanAtSupports(
    spanWidth,
    board,
    dividerCentres.map((centre) => centre - t),
  );
  for (const [index, section] of horizontalSections.entries()) {
    const suffix = horizontalSections.length === 1 ? "" : `-${index + 1}`;
    const sectionLabel = horizontalSections.length === 1 ? "" : ` — section ${index + 1}`;
    push({
      id: `carcass-bottom${suffix}`,
      role: "bottom",
      label: `Bottom${sectionLabel}`,
      board,
      length: section.length,
      width: shellDepth,
      quantity: 1,
      edges: { ...NO_EDGES, front: true },
      placements: [{ x: t + section.offset, y: plinth, z: 0 }],
      size: { x: section.length, y: t, z: shellDepth },
      axis: "y",
    });
    push({
      id: `carcass-top${suffix}`,
      role: "top",
      label: `Top${sectionLabel}`,
      board,
      length: section.length,
      width: shellDepth,
      quantity: 1,
      edges: { ...NO_EDGES, front: true },
      placements: [{ x: t + section.offset, y: envelope.height - t, z: 0 }],
      size: { x: section.length, y: t, z: shellDepth },
      axis: "y",
    });
  }

  // ---- Back --------------------------------------------------------------
  // One piece per bay, not one across the unit.
  //
  // A 2400 × 2300 back is not a part: no 2440 × 1220 sheet can produce it, and
  // a cut list that asks for one sends somebody to the saw with an impossible
  // instruction. Shops fit the back in pieces that land on the dividers, so
  // that is what the parts list says. Each piece is the bay plus half a
  // divider each side, which is where the fixings go.
  {
    let backX = 0;
    for (const [index, bay] of bays.entries()) {
      const first = index === 0;
      const last = index === bays.length - 1;
      // Half a divider at each internal edge, a full gable at each outer edge.
      const width = bay.width + (first ? t : t / 2) + (last ? t : t / 2);

      // The usual 2440 mm sheet cannot make a full back for the tallest
      // valid wardrobe. Split it horizontally when necessary, keeping every
      // emitted panel a real part that can be nested and installed on the
      // carcass. Default 2400 mm wardrobes remain one piece per bay.
      const maximumLength = Math.max(backBoard.sheet.length, backBoard.sheet.width);
      const pieceCount = Math.max(1, Math.ceil(carcassHeight / maximumLength));
      const nominalLength = Math.ceil(carcassHeight / pieceCount);

      for (let piece = 0; piece < pieceCount; piece += 1) {
        const pieceY = plinth + piece * nominalLength;
        const length = Math.min(nominalLength, plinth + carcassHeight - pieceY);

        parts.push({
          id: `back-${bay.id}-${piece}`,
          role: "back",
          label:
            pieceCount === 1
              ? `Back panel — ${bay.id}`
              : `Back panel — ${bay.id}, ${piece === 0 ? "lower" : "upper"}`,
          bayId: bay.id,
          board: backBoard,
          length,
          width: Math.round(width),
          quantity: 1,
          edges: { ...NO_EDGES },
          edgeBand: backBand,
          placements: [{ x: backX, y: pieceY, z: depth - backThickness }],
          size: { x: Math.round(width), y: length, z: backThickness },
          axis: "z",
        });
      }

      backX += width;
    }
  }

  // ---- What it stands on -------------------------------------------------
  //
  // This used to be one board — "plinth-front" — across the front at z = 0 and
  // nothing anywhere else. A wardrobe standing on a single front board is
  // resting on its back edge, and it is exactly what "the legs are only on the
  // front" was describing.
  //
  // The shared support generator chooses the correct construction for the
  // furniture family. Wardrobes use their recessed plinth; other families
  // retain their existing legs-or-plinth behaviour.
  if (plinth > 0) {
    // An open wardrobe has no proud door/drawer face to measure from. Its
    // plinth therefore uses the full 20 mm recess from the carcass plane;
    // enclosed and mixed wardrobes measure the same reveal from their outer
    // front boards.
    const visibleFrontThickness = cabinetHasVisibleFronts(cabinet)
      ? materials.fronts.thickness
      : 0;
    for (const part of standParts(
      spec,
      cabinet,
      envelope,
      plinth,
      materials.plinth,
      t,
      visibleFrontThickness,
      dividerCentres,
    )) {
      push(part, plinthBand);
    }
  }

  // ---- Bays --------------------------------------------------------------
  // Walk left to right, accumulating x. Each bay's interior starts after the
  // gable or the previous divider.
  let x = t;

  for (const [index, bay] of bays.entries()) {
    const isLast = index === bays.length - 1;
    const bayX = x;

    parts.push(
      ...bayParts({
        spec,
        bay,
        x: bayX,
        y: plinth + t,
        interiorHeight,
        interiorDepth,
      }),
    );

    x += bay.width;

    // A divider between this bay and the next.
    if (!isLast) {
      push({
        id: `divider-${index}`,
        role: "divider",
        label: `Divider ${index + 1}`,
        board,
        length: interiorHeight,
        width: shellDepth,
        quantity: 1,
        edges: { ...NO_EDGES, front: true },
        placements: [{ x, y: plinth + t, z: 0 }],
        size: { x: t, y: interiorHeight, z: shellDepth },
        axis: "x",
      });
      x += t;
    }
  }

  // ---- Doors -------------------------------------------------------------
  // Doors are added after the bays so they sit last in the list, which is the
  // order a shop wants them: carcass first, fronts last.
  parts.push(...doorParts(spec, cabinet));

  return parts;
}

/** Whether this cabinet actually generates a proud door or drawer front. */
function cabinetHasVisibleFronts(cabinet: Cabinet): boolean {
  return cabinet.bays.some((bay) => {
    if (bay.fitting.kind === "drawers") return true;
    if (bay.fitting.kind !== "stack") return bay.door !== "none";

    const hasDrawers = bay.fitting.sections.some(
      (section) => section.kind === "drawers",
    );
    const hasDoorableSection = bay.fitting.sections.some(
      (section) => section.kind !== "drawers",
    );
    return hasDrawers || (bay.door !== "none" && hasDoorableSection);
  });
}

/** Divider centre lines are safe structural joints for long horizontal boards. */
function cabinetDividerCentres(cabinet: Cabinet, thickness: number): number[] {
  const centres: number[] = [];
  let x = thickness;

  for (const [index, bay] of cabinet.bays.entries()) {
    x += bay.width;
    if (index < cabinet.bays.length - 1) {
      centres.push(x + thickness / 2);
      x += thickness;
    }
  }

  return centres;
}

// ---------------------------------------------------------------------------
// Bay interiors
// ---------------------------------------------------------------------------

function bayParts(input: {
  spec: DesignSpec;
  bay: Bay;
  x: number;
  y: number;
  interiorHeight: number;
  interiorDepth: number;
}): Part[] {
  const { spec, bay, x, y, interiorHeight, interiorDepth } = input;
  const materials = constructionMaterials(spec);
  const board = materials.interior;
  const interiorBand = edgeBandForConstructionBoard(
    spec,
    board,
    spec.carcass.edgeBand,
  );
  const backBand = edgeBandForConstructionBoard(
    spec,
    materials.back,
    spec.carcass.edgeBand,
  );
  const setback = spec.carcass.shelfSetback;
  const parts: Part[] = [];

  /**
   * A run of shelves at given heights.
   *
   * Heights are absolute, in mm above the floor, one per shelf — so the row on
   * the cut list and the objects in the room are the same thing counted twice
   * rather than two numbers that have to be kept in step.
   */
  const shelf = (
    id: string,
    heights: number[],
    note: string,
    adjustable = false,
  ): Part => ({
    id,
    role: "shelf",
    label: note,
    bayId: bay.id,
    board,
    length: bay.width,
    // A shelf stops short of the front edge and short of the back panel.
    width: interiorDepth - setback,
    quantity: heights.length,
    edges: { ...NO_EDGES, front: true },
    edgeBand: interiorBand,
    adjustable,
    placements: heights.map((shelfY) => ({ x, y: shelfY, z: setback })),
    size: { x: bay.width, y: board.thickness, z: interiorDepth - setback },
    axis: "y",
  });

  switch (bay.fitting.kind) {
    case "shelves": {
      if (bay.fitting.count > 0) {
        // n shelves divide the opening into n + 1 gaps, which is what puts the
        // top one below the ceiling of the bay rather than against it.
        const step = interiorHeight / (bay.fitting.count + 1);
        parts.push(
          shelf(
            `${bay.id}-shelf`,
            Array.from(
              { length: bay.fitting.count },
              (_, index) => y + step * (index + 1),
            ),
            `Shelf — ${bay.id}${bay.fitting.adjustable ? "" : " (fixed)"}`,
            bay.fitting.adjustable,
          ),
        );
      }
      break;
    }

    case "hanging": {
      const rails = bay.fitting.rails;

      /**
       * Where each rail's shelf sits, in mm above the floor.
       *
       * Computed once and used for both the shelf and the rail, because a rail
       * that does not hang from its own shelf is two parts drawn from two ideas
       * of the same height.
       *
       * A hanging section inside a stack has no shelf of its own — the stack's
       * divider is above it — so its rail hangs from the top of its band rather
       * than from a fraction of it. Using the fraction there would put a rail
       * two thirds of the way down a section that is already only a third of
       * the bay, and the coats would be on the floor.
       */
      const shelfHeights = bay.fitting.shelfAbove
        ? RAIL_SHELF_HEIGHTS.slice(0, rails).map(
            (fraction) => y + interiorHeight * fraction,
          )
        : railsInBand(rails, y, interiorHeight);

      // The shelf above a rail is what the rail hangs from.
      if (bay.fitting.shelfAbove) {
        parts.push(
          shelf(
            `${bay.id}-rail-shelf`,
            shelfHeights,
            `Rail shelf — ${bay.id}`,
          ),
        );
      }

      /**
       * The rail itself, as a part rather than as a line on the quote.
       *
       * It used to be neither: the geometry drew a shelf and stopped, and the
       * hardware list counted metres by walking the spec. So the wardrobe
       * rendered with an empty space where the rail goes — and the *only*
       * element of the module the brief asks for by name is the one nobody
       * could see.
       *
       * Bought by the metre, not cut from board, so like a leg its "length" is
       * the piece and it never reaches the sheet nesting.
       */
      const railLength = Math.max(0, bay.width - 2 * RAIL_INSET);
      if (railLength > 0 && shelfHeights.length > 0) {
        parts.push({
          id: `${bay.id}-rail`,
          role: "rail",
          label: `Hanging rail — ${bay.id}`,
          bayId: bay.id,
          board,
          manufacture: "purchased",
          length: railLength,
          width: RAIL_DIAMETER,
          quantity: shelfHeights.length,
          edges: { ...NO_EDGES },
          edgeBand: interiorBand,
          // Centred in the depth of the bay, so a coat hangs clear of both the
          // back panel and the door.
          placements: shelfHeights.map((shelfY) => ({
            x: x + RAIL_INSET,
            y: shelfY - RAIL_DROP,
            z: (interiorDepth - RAIL_DIAMETER) / 2,
          })),
          size: { x: railLength, y: RAIL_DIAMETER, z: RAIL_DIAMETER },
          axis: "x",
        });
      }
      break;
    }

    case "drawers": {
      const construction = drawerConstructionFor(
        spec,
        bay.width,
        interiorHeight,
        y,
        interiorDepth,
        bay.fitting.count,
        bay.fitting.frontHeights,
      );
      const boxX = x + construction.sideClearance;

      for (const [i, face] of construction.faces.entries()) {
        const sideHeight = construction.sideHeights[i] ?? 0;
        const boxFloor = face.floor;
        const sideFloor = boxFloor + construction.bottomThickness;

        parts.push({
          id: `${bay.id}-drawer-${i}-sides`,
          role: "drawer_side",
          label: `Drawer ${i + 1} sides — ${bay.id}`,
          bayId: bay.id,
          board,
          length: construction.boxDepth,
          width: sideHeight,
          quantity: 2,
          edges: { ...NO_EDGES, top: true },
          edgeBand: interiorBand,
          // Left and right, a runner's clearance inside the opening.
          placements: [
            { x: boxX, y: sideFloor, z: construction.frontSetback },
            {
              x: boxX + construction.boxWidth - board.thickness,
              y: sideFloor,
              z: construction.frontSetback,
            },
          ],
          size: {
            x: board.thickness,
            y: sideHeight,
            z: construction.boxDepth,
          },
          axis: "x",
        });

        parts.push({
          id: `${bay.id}-drawer-${i}-endpanels`,
          role: "drawer_back",
          label: `Drawer ${i + 1} front and back — ${bay.id}`,
          bayId: bay.id,
          board,
          length: construction.boxWidth - 2 * board.thickness,
          width: sideHeight,
          quantity: 2,
          edges: { ...NO_EDGES, top: true },
          edgeBand: interiorBand,
          // Between the sides, at each end of the box.
          placements: [
            {
              x: boxX + board.thickness,
              y: sideFloor,
              z: construction.frontSetback,
            },
            {
              x: boxX + board.thickness,
              y: sideFloor,
              z:
                construction.frontSetback +
                construction.boxDepth -
                board.thickness,
            },
          ],
          size: {
            x: construction.boxWidth - 2 * board.thickness,
            y: sideHeight,
            z: board.thickness,
          },
          axis: "z",
        });

        parts.push({
          id: `${bay.id}-drawer-${i}-base`,
          role: "drawer_base",
          label: `Drawer ${i + 1} base — ${bay.id}`,
          bayId: bay.id,
          board: materials.back,
          length: construction.boxWidth,
          width: construction.boxDepth,
          quantity: 1,
          edges: { ...NO_EDGES },
          edgeBand: backBand,
          placements: [
            {
              x: boxX,
              y: boxFloor,
              z: construction.frontSetback,
            },
          ],
          size: {
            x: construction.boxWidth,
            y: materials.back.thickness,
            z: construction.boxDepth,
          },
          axis: "y",
        });
      }
      break;
    }

    case "stack": {
      // A stack is rendered by rendering its sections, each in its own band of
      // the bay's height. Every section delegates back to this same function
      // with a synthetic single-kind bay — so a drawer inside a stack is built
      // by exactly the code that builds a drawer anywhere else, and there is
      // no second implementation to drift.
      //
      // Sections run top to bottom, the way somebody describes a wardrobe, so
      // the walk starts at the top of the bay and works down.
      const bands = sectionBands(
        bay.fitting.sections,
        y,
        interiorHeight,
        board.thickness,
      );

      for (const [index, band] of bands.entries()) {
        const { section, floor: bottom } = band;

        // A shelf between sections. Not for the last one — a shelf under the
        // bottom section would sit on the carcass bottom.
        const isLast = index === bands.length - 1;

        parts.push(
          ...bayParts({
            spec,
            bay: {
              ...bay,
              // Its own id, so two drawer sections in one bay do not collide
              // in the viewer's keys or on the cut list.
              id: `${bay.id}-${section.id}`,
              fitting: sectionFitting(section),
            },
            x,
            y: bottom,
            interiorHeight: band.height,
            interiorDepth,
          }),
        );

        if (!isLast) {
          // The divider between this section and the one below. This is the
          // "SHELF" line in the brief's diagram, and it is structural: it is
          // what the hanging section stands on and what the drawers hang
          // beneath.
          parts.push({
            id: `${bay.id}-${section.id}-divider`,
            role: "shelf",
            label: `Fixed shelf — ${bay.id}`,
            bayId: bay.id,
            board,
            length: Math.round(bay.width),
            width: Math.round(interiorDepth - setback),
            quantity: 1,
            edges: { ...NO_EDGES, front: true },
            edgeBand: interiorBand,
            adjustable: false,
            placements: [{ x, y: bottom - board.thickness, z: 0 }],
            size: {
              x: Math.round(bay.width),
              y: board.thickness,
              z: Math.round(interiorDepth - setback),
            },
            axis: "y",
          });
        }
      }

      break;
    }

    case "open":
    case "appliance":
      break;
  }

  return parts;
}

/**
 * Where each section of a stacked bay sits, in mm above the floor.
 *
 * The single source of truth for the arithmetic, and exported because three
 * things need it: what is *inside* a bay, what is on the *front* of it, and
 * the flat elevation the joiner works from. If each worked the bands out for
 * itself, a drawer front would eventually be drawn in front of a different
 * drawer's box — the kind of error that looks fine in a render and is only
 * found in the workshop.
 *
 * The dividers come out of the height before the shares are applied. Without
 * that the sections claim the whole interior *and* the dividers claim their
 * thickness on top, so the bottom section ends up hanging below the carcass
 * floor by a few millimetres per divider.
 */
export function sectionBands(
  sections: StackSection[],
  openingFloor: number,
  openingHeight: number,
  dividerThickness: number,
): { section: StackSection; floor: number; height: number }[] {
  const totalShare = sections.reduce((total, section) => total + section.share, 0);
  const usable = Math.floor(
    openingHeight - (sections.length - 1) * dividerThickness,
  );

  // Guarded rather than assumed. Shares summing to zero would divide by zero
  // and place every section at NaN, which draws nothing and reports no error;
  // a bay too short for its own dividers would place them upside down.
  if (totalShare <= 0 || usable <= 0) return [];

  const bands: { section: StackSection; floor: number; height: number }[] = [];
  const heights = distributeDimensionWithMinimum(
    sections.map((section) => section.share),
    usable,
    sections.map((section) =>
      section.kind === "drawers" ? 90 : 0,
    ),
  );
  let top = openingFloor + openingHeight;

  for (const [index, section] of sections.entries()) {
    const height = heights[index] ?? 0;
    const floor = top - height;
    bands.push({ section, floor, height });
    top = floor - (index === sections.length - 1 ? 0 : dividerThickness);
  }

  return bands;
}

/**
 * Rail heights inside a band that has no shelf of its own.
 *
 * The band's ceiling is a divider somebody else drew, so the top rail hangs
 * just under it and a second one — double hanging, shirts over jackets — sits
 * at the midpoint. Measured down from the top rather than as a fraction of the
 * whole bay, which is the difference between a rail in the hanging section and
 * a rail floating through the drawers below it.
 */
function railsInBand(rails: number, floor: number, height: number): number[] {
  const top = floor + height;
  if (rails <= 1) return [top];
  // Two rails: the upper under the ceiling, the lower halfway down, which
  // leaves each a bit under half the band — right for shirts and jackets.
  return [top, floor + height / 2];
}

/** One stacked section, as the single-kind fitting the geometry already knows. */
export function sectionFitting(section: {
  kind: "hanging" | "shelves" | "drawers" | "open";
  count?: number;
  rails?: number;
  drawers?: number;
}): Bay["fitting"] {
  switch (section.kind) {
    case "hanging":
      return { kind: "hanging", rails: section.rails ?? 1, shelfAbove: false };
    case "shelves":
      return { kind: "shelves", count: section.count ?? 2, adjustable: true };
    case "drawers":
      return { kind: "drawers", count: section.drawers ?? 2 };
    case "open":
      return { kind: "open" };
  }
}

/**
 * Resolves one drawer bank from its clear opening and selected runner.
 *
 * Both the board box and the visible fronts call this exact function. The
 * result is therefore the shared manufacturing definition, not two similar
 * calculations which can drift by a gap or a board thickness.
 */
function drawerConstructionFor(
  spec: DesignSpec,
  openingWidth: number,
  openingHeight: number,
  openingFloor: number,
  interiorDepth: number,
  count: number,
  frontHeights?: number[],
) {
  const materials = constructionMaterials(spec);
  const selectedRunner = spec.hardware.find(
    (item) => item.kind === "drawer_runner",
  );
  // Persisted legacy specs sometimes retain only a hardware id. Always resolve
  // the same stocked product that hardwareFor will quote rather than silently
  // using soft-close dimensions while pricing a basic runner.
  const runner =
    selectedRunner?.drawerRunner ??
    (selectedRunner ? findHardware(selectedRunner.id)?.drawerRunner : undefined);

  return resolveDrawerConstruction({
    openingWidth,
    openingHeight,
    openingFloor,
    interiorDepth,
    count,
    frontHeights,
    drawerSideThickness: materials.interior.thickness,
    drawerBottomThickness: materials.back.thickness,
    runner,
  });
}

// ---------------------------------------------------------------------------
// Doors
// ---------------------------------------------------------------------------

function doorParts(spec: DesignSpec, cabinet: Cabinet): Part[] {
  const parts: Part[] = [];
  const materials = constructionMaterials(spec);
  const board = materials.fronts;
  const frontBand = edgeBandForConstructionBoard(
    spec,
    board,
    spec.carcass.edgeBand,
  );
  const gap = spec.carcass.doorGap;
  const plinth = cabinet.plinthHeight;
  const t = materials.body.thickness;
  const frontThickness = board.thickness;
  const height = cabinet.size.height;
  const interiorDepth = cabinet.size.depth - materials.back.thickness;

  let x = t;

  for (const bay of cabinet.bays) {
    const bayX = x;
    x += bay.width + t;

    const opening = height - plinth - 2 * t;
    const openingFloor = plinth + t;

    /**
     * The fronts of one run of drawers, filling a given band of the bay.
     *
     * The band is the whole opening for a plain drawer bay and one section's
     * share of it for a stack, which is the only difference between the two —
     * so there is one piece of code that knows what a drawer front is.
     */
    const drawerFronts = (
      idPrefix: string,
      count: number,
      explicit: number[] | undefined,
      bandFloor: number,
      bandHeight: number,
    ) => {
      const construction = drawerConstructionFor(
        spec,
        bay.width,
        bandHeight,
        bandFloor,
        interiorDepth,
        count,
        explicit,
      );

      for (const face of construction.faces) {
        parts.push({
          id: `${idPrefix}-front-${face.index}`,
          role: "drawer_front",
          label: `Drawer front ${face.index + 1} — ${idPrefix}`,
          bayId: bay.id,
          board,
          length: face.height,
          width: bay.width - 2 * gap,
          quantity: 1,
          // A front shows on all four edges.
          edges: { front: true, back: true, top: true, bottom: true },
          edgeBand: frontBand,
          // Stacked on the same floors as the boxes behind them, and standing
          // proud of the carcass — hence the negative z.
          placements: [
            { x: bayX + gap, y: face.floor, z: -frontThickness },
          ],
          size: {
            x: bay.width - 2 * gap,
            y: face.height,
            z: frontThickness,
          },
          axis: "z",
        });
      }
    };

    /** A door leaf, or a pair, filling a given band of the bay. */
    const doorLeaves = (idSuffix: string, bandFloor: number, bandHeight: number) => {
      const leaves = bay.doorLeaves;
      const leafWidth = Math.floor((bay.width - gap * (leaves + 1)) / leaves);
      const leafHeight = bandHeight - 2 * gap;
      if (leafHeight <= 0 || leafWidth <= 0) return;

      parts.push({
        id: `${bay.id}-door${idSuffix}`,
        role: "door",
        label: `Door — ${bay.id}${leaves > 1 ? ` (pair)` : ""}`,
        bayId: bay.id,
        board,
        length: leafHeight,
        width: leafWidth,
        quantity: leaves,
        edges: { front: true, back: true, top: true, bottom: true },
        edgeBand: frontBand,
        doorStyle:
          bay.door === "hinged" || bay.door === "sliding" || bay.door === "bifold"
            ? bay.door
            : undefined,
        // Side by side across the bay, a gap between each and at both ends.
        placements: Array.from({ length: leaves }, (_, leaf) => ({
          x: bayX + gap + leaf * (leafWidth + gap),
          y: bandFloor + gap,
          z: -frontThickness,
        })),
        size: { x: leafWidth, y: leafHeight, z: frontThickness },
        axis: "z",
      });
    };

    if (bay.fitting.kind === "drawers") {
      // Drawers have fronts, not doors. The fronts cover the opening.
      drawerFronts(
        bay.id,
        bay.fitting.count,
        bay.fitting.frontHeights,
        openingFloor,
        opening,
      );
      continue;
    }

    if (bay.fitting.kind === "stack") {
      /**
       * A stacked bay's front is not one thing.
       *
       * A drawer section shows its own fronts; everything else is behind a
       * door. That is what a fitted wardrobe in Addis actually looks like —
       * hanging behind a full door with two drawer fronts showing below it —
       * and it is why a stack cannot simply be given a door like any other
       * bay, which is the bug that produced a wardrobe with drawer boxes and
       * no drawer fronts.
       *
       * Bands come from the same helper the interior used, so a front and the
       * box behind it cannot disagree.
       */
      const bands = sectionBands(bay.fitting.sections, openingFloor, opening, t);

      // Consecutive non-drawer sections share one door rather than getting one
      // each: a rail above a shelf is one opening to reach into, not two.
      let run: { floor: number; top: number } | null = null;
      let runIndex = 0;

      const closeRun = () => {
        if (!run) return;
        if (bay.door !== "none") {
          doorLeaves(`-${runIndex}`, run.floor, run.top - run.floor);
        }
        runIndex += 1;
        run = null;
      };

      for (const band of bands) {
        if (band.section.kind === "drawers") {
          closeRun();
          drawerFronts(
            `${bay.id}-${band.section.id}`,
            band.section.drawers ?? 2,
            undefined,
            band.floor,
            band.height,
          );
          continue;
        }

        const top = band.floor + band.height;
        run = run ? { floor: band.floor, top: run.top } : { floor: band.floor, top };
      }

      closeRun();
      continue;
    }

    if (bay.door === "none") continue;

    // A plain bay's door covers the whole carcass front, which starts at the
    // plinth rather than at the interior floor — the door hides the bottom
    // board too.
    doorLeaves("", plinth, height - plinth);
  }

  return parts;
}

// ---------------------------------------------------------------------------
// Hardware
// ---------------------------------------------------------------------------

/**
 * Hardware follows from the parts, not from the prompt.
 *
 * Counting hinges off the door list rather than asking the model how many
 * hinges it wants is the difference between a quote that adds up and one that
 * does not. The hinge count per leaf is the trade's own rule: two up to
 * 1200 mm, three to 1600, four to 2000, five above.
 */
function hardwareFor(
  spec: DesignSpec,
  parts: Part[],
  resolved: ReturnType<typeof resolveDesign>,
): HardwareLine[] {
  const lines: HardwareLine[] = [];
  const fallbackHardware: Partial<Record<Hardware["kind"], string>> = {
    hinge: "hinge-soft-close",
    handle: "handle-bar",
    drawer_runner: "runner-soft-close",
    shelf_pin: "shelf-pin",
    hanging_rail: "hanging-rail",
    sliding_gear: "sliding-gear",
    leg: "leg-adjustable",
  };
  const pick = (kind: Hardware["kind"]) =>
    spec.hardware.find((item) => item.kind === kind) ??
    (fallbackHardware[kind] ? findHardware(fallbackHardware[kind]!) : undefined);

  const doors = parts.filter((part) => part.role === "door");
  const drawerFronts = parts.filter((part) => part.role === "drawer_front");
  const shelves = parts.filter((part) => part.role === "shelf");

  const hingedDoors = doors.filter(
    (door) => door.doorStyle === undefined || door.doorStyle === "hinged",
  );
  const hinge = pick("hinge");
  if (hinge) {
    const count = hingedDoors.reduce(
      (total, door) => total + door.quantity * hingesForLeaf(door.length),
      0,
    );
    if (count > 0) {
      lines.push({
        hardware: hinge,
        quantity: count,
        note: `${hingedDoors.reduce((n, d) => n + d.quantity, 0)} hinged door leaves`,
      });
    }
  }

  const handle = pick("handle");
  if (handle) {
    const count =
      doors
        .filter((door) => door.doorStyle !== "fixed")
        .reduce(
          (total, door) =>
            total +
            (door.doorStyle === "bifold"
              ? Math.ceil(door.quantity / 2)
              : door.quantity),
          0,
        ) +
      drawerFronts.reduce((total, front) => total + front.quantity, 0);
    if (count > 0) {
      lines.push({ hardware: handle, quantity: count, note: "One per front" });
    }
  }

  const drawerBoxes = parts.filter((part) => part.role === "drawer_base");
  const drawerCount = drawerBoxes.reduce(
    (total, box) => total + box.quantity,
    0,
  );
  // `drawerConstructionFor` uses the soft-close profile when a legacy or AI
  // spec omitted hardware. Quote that same physical runner here; otherwise a
  // cut list can include runner clearances while the hardware order contains
  // zero pairs.
  const runner = drawerCount > 0 ? pick("drawer_runner") : undefined;
  if (runner && drawerCount > 0) {
    lines.push({
      hardware: runner,
      quantity: drawerCount,
      note: `${drawerCount} drawers, one pair each`,
    });
  }

  const pin = pick("shelf_pin");
  const adjustable = shelves
    .filter((part) => part.adjustable === true)
    .reduce((total, part) => total + part.quantity, 0);
  if (pin && adjustable > 0) {
    lines.push({
      hardware: pin,
      quantity: adjustable * 4,
      note: `${adjustable} shelves, four pins each`,
    });
  }

  // Every bay in the design, whichever cabinet it is in. Rails, sliding gear
  // and legs are counted over the whole job, because that is how they are
  // bought — one order for the kitchen, not one per cabinet.
  const allBays = spec.cabinets.flatMap((cabinet) => cabinet.bays);

  const rail = pick("hanging_rail");
  if (rail) {
    /**
     * Metres of rail, counted off the rails that were actually drawn.
     *
     * This used to walk the spec looking for bays whose fitting was `hanging` —
     * which meant a *stacked* bay containing a hanging section was quoted no
     * rail at all, because its fitting is `stack`. The module the brief asks
     * for by name is exactly that shape, so the commonest wardrobe in Ethiopia
     * came with a rail nobody had priced.
     *
     * Counting the parts instead makes the class of bug impossible: any rail
     * the geometry draws is a rail the quote pays for, wherever it came from.
     */
    const metres = parts
      .filter((part) => part.role === "rail")
      .reduce((total, part) => total + (part.length / 1000) * part.quantity, 0);

    if (metres > 0) {
      lines.push({
        hardware: rail,
        quantity: round(metres, 2),
        note: "Hanging rails",
      });
    }
  }

  const leg = pick("leg");
  if (leg && spec.furnitureType !== "wardrobe") {
    // A leg every 500 mm along the front of each cabinet that stands on a
    // plinth, doubled for the back. Counted per cabinet rather than across the
    // run: a wall unit has no legs, and a run measured end to end would buy
    // legs for the gap between two islands.
    const legs = spec.cabinets
      .filter((cabinet) => cabinet.plinthHeight > 0)
      .reduce(
        (total, cabinet) =>
          total + Math.max(2, Math.ceil(cabinet.size.width / 500) + 1) * 2,
        0,
      );
    if (legs > 0) {
      lines.push({
        hardware: leg,
        quantity: legs,
        note: "Front and back rows",
      });
    }
  }

  const sliding = pick("sliding_gear");
  const slidingDoors = doors
    .filter((door) => door.doorStyle === "sliding")
    .reduce((total, door) => total + door.quantity, 0);
  if (sliding && slidingDoors > 0) {
    lines.push({
      hardware: sliding,
      quantity: slidingDoors,
      note: `${slidingDoors} sliding doors`,
    });
  }

  const bifoldDoors = doors.filter((door) => door.doorStyle === "bifold");
  const bifoldPairs = bifoldDoors.reduce(
    (total, door) => total + Math.ceil(door.quantity / 2),
    0,
  );
  if (bifoldPairs > 0) {
    const connectingHinge = findHardware("bifold-connecting-hinge");
    const pivotSet = findHardware("bifold-pivot-set");
    if (connectingHinge) {
      lines.push({
        hardware: connectingHinge,
        quantity: bifoldPairs,
        note: `${bifoldPairs} bi-fold door pairs`,
      });
    }
    if (pivotSet) {
      lines.push({
        hardware: pivotSet,
        quantity: bifoldPairs,
        note: `${bifoldPairs} bi-fold door pairs`,
      });
    }
  }

  // Corner construction has special hardware that cannot be inferred from a
  // generic door leaf: an L return needs 165° hinges, a diagonal needs its
  // carousel, and a blind corner needs a pull-out. The helper reads the same
  // resolved corner blocks that produced the panels above, so those parts can
  // never appear in the scene without their purchased hardware appearing in
  // the order and cost.
  for (const requirement of cornerHardware(resolved, parts)) {
    const hardware = findHardware(requirement.catalogueId);
    if (!hardware) continue;
    lines.push({
      hardware,
      quantity: requirement.quantity,
      note: requirement.label,
    });
  }

  return aggregateHardwareLines(lines);
}

/**
 * One purchased SKU gets one line everywhere downstream.
 *
 * Normal doors and a diagonal corner can both correctly require the stocked
 * soft-close hinge. They are distinct construction rules, but duplicating the
 * same SKU here produces duplicate cost-row identifiers and makes an order
 * look as though it contains two different hinge products. Keep the rule
 * notes, while making the quantity and price a single physical purchase line.
 */
function aggregateHardwareLines(lines: HardwareLine[]): HardwareLine[] {
  const byHardwareId = new Map<string, HardwareLine>();

  for (const line of lines) {
    const existing = byHardwareId.get(line.hardware.id);
    if (!existing) {
      byHardwareId.set(line.hardware.id, { ...line });
      continue;
    }

    existing.quantity += line.quantity;
    const notes = new Set(existing.note.split("; ").filter(Boolean));
    notes.add(line.note);
    existing.note = [...notes].join("; ");
  }

  return [...byHardwareId.values()];
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

function summarise(parts: Part[], hardware: HardwareLine[]): PartsBreakdown {
  const areaByBoard: Record<string, number> = {};
  const bandByEdge: Record<string, number> = {};

  for (const part of parts) {
    // Legs and rails are bought hardware. They remain in `parts` so the same
    // 3D scene can show the real physical component that the hardware list
    // buys, but they are never material cut from a board sheet.
    if (part.manufacture === "purchased") continue;

    // Square metres, from millimetres.
    const area = (part.length * part.width * part.quantity) / 1_000_000;
    areaByBoard[part.board.id] = (areaByBoard[part.board.id] ?? 0) + area;

    // Banding runs along whichever edges are visible. The long edges are the
    // part's length; the short edges are its width.
    const metres =
      ((part.edges.front ? part.length : 0) +
        (part.edges.back ? part.length : 0) +
        (part.edges.top ? part.width : 0) +
        (part.edges.bottom ? part.width : 0)) *
      part.quantity;

    if (metres > 0) {
      bandByEdge[part.edgeBand.id] =
        (bandByEdge[part.edgeBand.id] ?? 0) + metres / 1000;
    }
  }

  for (const key of Object.keys(areaByBoard)) {
    areaByBoard[key] = round(areaByBoard[key] ?? 0, 3);
  }
  for (const key of Object.keys(bandByEdge)) {
    bandByEdge[key] = round(bandByEdge[key] ?? 0, 2);
  }

  return {
    parts,
    hardware,
    totals: {
      partCount: parts
        .filter((part) => part.manufacture !== "purchased")
        .reduce((total, part) => total + part.quantity, 0),
      areaByBoard,
      bandByEdge,
    },
  };
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
