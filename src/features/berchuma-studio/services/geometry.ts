import { doorRectProblem, type FaceBoard, type FrontRect } from "./door-layout";
import type {
  BandedEdges,
  HardwareLine,
  Part,
  PartsBreakdown,
} from "../types/parts";
import { findBoard, findHardware } from "../types/catalogue";
import {
  cornerHardware,
  cornerParts,
  hingesPerLeaf as hingesForLeaf,
} from "./corners";
export { hingesPerLeaf } from "./corners";
import { bayLabelSuffix } from "./bay-layout";
import { bayLayout, connectorsPerJoint, jointsOf, modulesOf } from "./transport-modules";
import { resolveDrawerConstruction } from "./drawer-construction";
import {
  distributeDimension,
  distributeDimensionWithMinimum,
} from "./dimensions";
import { splitSpanAtSupports } from "./panel-segmentation";
import { transformPlanPoint } from "./part-transform";
import { resolveDesign } from "./resolve";
import { kitchenConstruction } from "./kitchen-construction";
import { ledHardwareLine } from "./lighting";
import {
  constructionMaterials,
  constructionMethods,
  edgeBandForConstructionBoard,
} from "./wardrobe-materials";
import {
  recessedWardrobePlinthParts,
  WARDROBE_PLINTH_VISIBLE_RECESS,
} from "./wardrobe-plinth";
import type {
  Bay,
  Board,
  Cabinet,
  DesignSpec,
  DisplayOptions,
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

/**
 * How far an internal drawer bank stands behind the carcass's front edge, mm:
 * clear of the door's hinge cups when the door is shut.
 */
export const INTERNAL_DRAWER_SETBACK = 25;
/** An LED strip's section, mm: an aluminium profile with its diffuser. */
const LED_SECTION = { width: 12, height: 8 };

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
    const cornerBaySelections = resolved.layout.corners
      .filter((corner) => corner.ownerRunId === placed.runId)
      .map((corner) => {
        const centre = { x: corner.x + (corner.width ?? corner.size) / 2, z: corner.z + (corner.depth ?? corner.size) / 2 };
        const start = { x: placed.x, z: placed.z };
        const finish = rotateThenPlace({ x: cabinet.size.width, y: 0, z: 0 }, rotation, placed.x, 0, placed.z);
        const distance = (point: { x: number; z: number }) => (point.x - centre.x) ** 2 + (point.z - centre.z) ** 2;
        return { cornerId: corner.id, bayId: cabinet.bays[distance(start) <= distance(finish) ? 0 : cabinet.bays.length - 1]?.id };
      });

    for (const part of kitchenConstruction(spec, cabinet, cabinetParts(spec, cabinet))) {
      // Open the adjoining end panel into the dedicated shelf corner. A full
      // gable here seals the corner behind two ordinary cabinet boxes.
      const endX = part.id === "gable-left" ? 0 : part.id === "gable-right" ? cabinet.size.width : null;
      const end = endX === null ? null : rotateThenPlace({ x: endX, y: 0, z: cabinet.size.depth / 2 }, rotation, placed.x, 0, placed.z);
      const joinsWardrobeCorner = spec.furnitureType === "wardrobe" && end && resolved.layout.corners.some((corner) =>
        (!corner.ownerRunId || (corner.kind === "connected_l" && corner.ownerRunId !== placed.runId)) &&
        corner.between.includes(placed.runId ?? "") &&
        end.x >= corner.x - 0.01 && end.x <= corner.x + (corner.width ?? corner.size) + 0.01 &&
        end.z >= corner.z - 0.01 && end.z <= corner.z + (corner.depth ?? corner.size) + 0.01);
      if (joinsWardrobeCorner) {
        // Retain a rear support stile; the remaining depth is a real opening.
        const supportDepth = Math.min(60, part.size.z);
        part.placements = part.placements.map((at) => ({ ...at, z: at.z + part.size.z - supportDepth }));
        part.size = { ...part.size, z: supportDepth };
        part.width = supportDepth;
        part.label = "Corner access rear support";
      }
      parts.push({
        ...part,
        // Ids must be unique across the design — two base units both containing
        // "gable-left" would collide in the viewer's keys and in the cut list.
        id: `${cabinet.id}/${part.id}`,
        cabinetId: cornerBaySelections.find((entry) => entry.bayId && (part.bayId === entry.bayId || part.bayId?.startsWith(`${entry.bayId}-`)))?.cornerId ?? cabinet.id,
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
    if (plinth <= 0) return [];
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
  if (!spec.worktop) return [];
  // Legacy straight designs also support authored world-position edits.
  if (spec.layout === "straight" && !spec.kitchenSetup) return straightWorktopParts(spec);
  const resolved = resolveDesign(spec);
  const groups = new Map<string, typeof resolved.cabinets>();
  for (const placed of resolved.cabinets) {
    if (placed.cabinet.kind !== "base" && placed.cabinet.kind !== "island") continue;
    const key = placed.runId ?? `free:${placed.z}:${placed.rotation}`;
    const group = groups.get(key) ?? [];
    group.push(placed);
    groups.set(key, group);
  }
  const parts: Part[] = [];
  let groupIndex = 0;
  for (const placed of groups.values()) {
    const first = placed[0];
    const run = resolved.layout.placements.find((p) => p.runId === first.runId);
    const origin = run?.origin ?? { x: 0, z: first.z };
    const rotation = run?.rotation ?? first.rotation;
    const cabinets = placed.map((p) => ({
      ...p.cabinet,
      position: { x: p.offset ?? p.x, y: p.y, z: 0 },
    }));
    for (const part of straightWorktopParts({ ...spec, cabinets })) {
      // Islands and peninsulas have no wall behind them for an upstand.
      if (part.role === "backsplash" && cabinets.every((c) => c.kind === "island")) continue;
      parts.push({ ...part,
        id: groupIndex === 0 ? part.id : `run-${groupIndex}-${part.id}`,
        rotationY: rotation || undefined,
        placements: part.placements.map((p) => rotateThenPlace(p, rotation, origin.x, 0, origin.z)),
      });
    }
    groupIndex++;
  }
  for (const corner of resolved.layout.corners) {
    parts.push({
      id: `${corner.id}-worktop`, role: "worktop", label: "Corner worktop",
      board: spec.worktop.board, length: corner.width ?? corner.size, width: corner.depth ?? corner.size, quantity: 1,
      edges: { front: true, back: false, top: true, bottom: false }, edgeBand: spec.carcass.edgeBand,
      placements: [{ x: corner.x, y: corner.height, z: corner.z }],
      size: { x: corner.width ?? corner.size, y: spec.worktop.board.thickness, z: corner.depth ?? corner.size }, axis: "y",
    });
  }
  return parts;
}

function straightWorktopParts(spec: DesignSpec): Part[] {
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
  // A side display is a shelving unit of its own, its whole carcass the
  // display: cut from its accent board when it has one.
  const sideDisplay = isSideDisplay(cabinet) ? cabinet.bays[0]!.display! : null;
  const board = sideDisplay?.boardId ? displayBoard(spec, sideDisplay) : materials.body;
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
  const methods = constructionMethods(spec);
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

  // ---- Transport modules ------------------------------------------------
  // A wardrobe made in several carcasses has a complete cabinet per module:
  // its own sides, top, bottom and back. One with no joints is one carcass,
  // built exactly as it always was.
  const modules = modulesOf(cabinet);
  const modular = modules.length > 1;
  const layout = bayLayout(cabinet, t);
  const moduleName = (index: number) => `${cabinet.stackedOn ? "Top" : "Base"} module ${index + 1}`;
  const moduleTag = (index: number): Pick<Part, "module"> =>
    modular ? { module: { name: moduleName(index), index, width: modules[index]!.width } } : {};

  // ---- Gables ------------------------------------------------------------
  // Full-height outer sides. Only the front edge shows. At a transport joint
  // there are two: the right side of one module against the left side of the
  // next, screwed together on site.
  for (const carcassModule of modules) {
    const first = carcassModule.index === 0;
    const last = carcassModule.index === modules.length - 1;
    push({
      id: first ? "gable-left" : `module-${carcassModule.index + 1}-gable-left`,
      role: "gable",
      label: modular ? `${moduleName(carcassModule.index)} — left side` : "Left gable",
      board,
      length: carcassHeight,
      width: shellDepth,
      quantity: 1,
      edges: { ...NO_EDGES, front: true },
      placements: [{ x: carcassModule.from, y: plinth, z: 0 }],
      size: { x: t, y: carcassHeight, z: shellDepth },
      axis: "x",
      ...moduleTag(carcassModule.index),
    });
    push({
      id: last ? "gable-right" : `module-${carcassModule.index + 1}-gable-right`,
      role: "gable",
      label: modular ? `${moduleName(carcassModule.index)} — right side` : "Right gable",
      board,
      length: carcassHeight,
      width: shellDepth,
      quantity: 1,
      edges: { ...NO_EDGES, front: true },
      placements: [{ x: carcassModule.to - t, y: plinth, z: 0 }],
      size: { x: t, y: carcassHeight, z: shellDepth },
      axis: "x",
      ...moduleTag(carcassModule.index),
    });
  }

  // ---- Top and bottom ----------------------------------------------------
  // Housed between the gables, so their total length is the envelope less
  // both. Wide wardrobes use sections that meet at divider centre lines: each
  // join is carried by a real vertical divider instead of asking a shop to cut
  // one unplaceable 3–6 m board or hiding an unsupported visual seam.
  const dividerCentres = cabinetDividerCentres(cabinet, t);
  for (const carcassModule of modules) {
    const spanWidth = carcassModule.width - 2 * t;
    const horizontalSections = splitSpanAtSupports(
      spanWidth,
      board,
      dividerCentres
        .filter((centre) => centre > carcassModule.from && centre < carcassModule.to)
        .map((centre) => centre - carcassModule.from - t),
    );
    const prefix = modular ? `module-${carcassModule.index + 1}-` : "carcass-";
    for (const [index, section] of horizontalSections.entries()) {
      const suffix = horizontalSections.length === 1 ? "" : `-${index + 1}`;
      const sectionLabel = horizontalSections.length === 1 ? "" : ` — section ${index + 1}`;
      push({
        id: `${prefix}bottom${suffix}`,
        role: "bottom",
        label: modular ? `${moduleName(carcassModule.index)} — bottom${sectionLabel}` : `Bottom${sectionLabel}`,
        board,
        length: section.length,
        width: shellDepth,
        quantity: 1,
        edges: { ...NO_EDGES, front: true },
        placements: [{ x: carcassModule.from + t + section.offset, y: plinth, z: 0 }],
        size: { x: section.length, y: t, z: shellDepth },
        axis: "y",
        ...moduleTag(carcassModule.index),
      });
      push({
        id: `${prefix}top${suffix}`,
        role: "top",
        label: modular ? `${moduleName(carcassModule.index)} — top${sectionLabel}` : `Top${sectionLabel}`,
        board,
        length: section.length,
        width: shellDepth,
        quantity: 1,
        edges: { ...NO_EDGES, front: true },
        placements: [{ x: carcassModule.from + t + section.offset, y: envelope.height - t, z: 0 }],
        size: { x: section.length, y: t, z: shellDepth },
        axis: "y",
        ...moduleTag(carcassModule.index),
      });
    }
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
      // A back's outer edges are its module's sides: each module is backed
      // on its own, so it can be carried and stood up as a cabinet.
      const place = layout[index]!;
      const first = index === 0 || place.jointLeft;
      const last = index === bays.length - 1 || place.jointRight;
      if (place.jointLeft) backX = modules[place.module]!.from;
      // An open display with its back off is open to the wall behind it.
      const openBacked = bay.display?.back === false;
      /*
       * How wide this piece of back is, which depends on how it is fixed.
       *
       * `bay.width` is already the clear opening, so both constructions start
       * from it and differ only in what they add at an outer edge. Overlaid,
       * the panel is pinned across the back edges and covers the gable, so it
       * gains the whole board and the pieces add up to the cabinet's own
       * width. Inset, it drops into a groove machined in that gable, so it
       * gains only the depth it sits in.
       *
       * An internal edge is the same either way: the piece lands on a divider
       * and takes half of it, and its neighbour takes the other half.
       *
       * The same distinction applies to the height below, and to the drawer
       * bottoms. One formula for both constructions makes a panel that either
       * cannot reach its groove or cannot enter it, and the cut list says
       * nothing about which.
       */
      const inset = methods.backFixing === "inset";
      const outerEdge = (isOuter: boolean) =>
        isOuter ? (inset ? methods.backGrooveDepth : t) : t / 2;
      const width = bay.width + outerEdge(first) + outerEdge(last);

      // The usual 2440 mm sheet cannot make a full back for the tallest
      // valid wardrobe. Split it horizontally when necessary, keeping every
      // emitted panel a real part that can be nested and installed on the
      // carcass. Default 2400 mm wardrobes remain one piece per bay.
      const maximumLength = Math.max(backBoard.sheet.length, backBoard.sheet.width);
      // An inset back is the clear height between the top and bottom, plus
      // what it sits into each of them; an overlaid one covers both.
      const backHeight = inset
        ? carcassHeight - 2 * t + 2 * methods.backGrooveDepth
        : carcassHeight;
      const pieceCount = Math.max(1, Math.ceil(backHeight / maximumLength));
      const nominalLength = Math.ceil(backHeight / pieceCount);

      for (let piece = 0; piece < pieceCount && !openBacked; piece += 1) {
        const backFloor = plinth + (inset ? t - methods.backGrooveDepth : 0);
        const pieceY = backFloor + piece * nominalLength;
        const length = Math.min(nominalLength, backFloor + backHeight - pieceY);

        parts.push({
          id: `back-${bay.id}-${piece}`,
          role: "back",
          label:
            pieceCount === 1
              ? `Back panel${bayLabelSuffix(cabinet, bay.id)}`
              : `Back panel${bayLabelSuffix(cabinet, bay.id)}${
                  bayLabelSuffix(cabinet, bay.id) ? "," : " —"
                } ${piece === 0 ? "lower" : "upper"}`,
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
          ...moduleTag(place.module),
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
      // A transport joint is a support line for the plinth as well.
      [...dividerCentres, ...jointsOf(cabinet)].sort((a, b) => a - b),
    )) {
      push(part, plinthBand);
    }
  }

  // ---- Bays --------------------------------------------------------------
  // Walk left to right, accumulating x. Each bay's interior starts after the
  // gable or the previous divider.
  for (const [index, bay] of bays.entries()) {
    const place = layout[index]!;
    // The last bay of a module is followed by the module's own side, not a divider.
    const isLast = index === bays.length - 1 || place.jointRight;
    const bayX = place.x;

    parts.push(
      ...bayParts({
        spec,
        bay,
        bayName: bayLabelSuffix(cabinet, bay.id),
        x: bayX,
        y: plinth + t,
        interiorHeight,
        interiorDepth,
      }).map((part) => ({ ...part, ...moduleTag(place.module) })),
    );

    const x = bayX + bay.width;

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
        ...moduleTag(place.module),
      });
    }
  }

  // ---- Doors -------------------------------------------------------------
  // Doors are added after the bays so they sit last in the list, which is the
  // order a shop wants them: carcass first, fronts last.
  // Each front is hung on the module its bay is in.
  const moduleOfBay = (bayId: string | undefined) => layout.find((place) => bayId === place.bay.id || bayId?.startsWith(`${place.bay.id}-`))?.module ?? 0;
  parts.push(...doorParts(spec, cabinet).map((part) => ({ ...part, ...moduleTag(moduleOfBay(part.bayId)) })));

  return parts;
}

/** Whether this cabinet actually generates a proud door or drawer front. */
function cabinetHasVisibleFronts(cabinet: Cabinet): boolean {
  return cabinet.bays.some((bay) => {
    if (bay.display) return false;
    if (bay.fitting.kind === "drawers" && !bay.fitting.internal) return true;
    if (bay.fitting.kind !== "stack") return bay.door !== "none";

    const hasDrawers = bay.fitting.sections.some(
      (section) => section.kind === "drawers" && !section.internal,
    );
    const hasDoorableSection = bay.fitting.sections.some(
      (section) => doorSection(section),
    );
    return hasDrawers || (bay.door !== "none" && hasDoorableSection);
  });
}

/**
 * Whether a zone of a stacked bay sits behind the bay's door. Exterior
 * drawers have fronts of their own and an open display has nothing over it;
 * everything else — internal drawers included — is closed by the door.
 */
export function doorSection(section: Pick<StackSection, "kind" | "internal">): boolean {
  if (section.kind === "display") return false;
  if (section.kind === "drawers") return section.internal === true;
  return true;
}

/** A shelving unit beside a wardrobe, every bay of it an open display. */
export function isSideDisplay(cabinet: Cabinet): boolean {
  return cabinet.bays.length > 0 && cabinet.bays.every((bay) => bay.display?.style === "side");
}

/**
 * Divider centre lines are safe structural joints for long horizontal boards.
 * Only the dividers inside a module: at a transport joint the two modules'
 * own sides stand, and nothing spans it.
 */
function cabinetDividerCentres(cabinet: Cabinet, thickness: number): number[] {
  const layout = bayLayout(cabinet, thickness);
  return layout.slice(0, -1).filter((place) => !place.jointRight).map((place) => place.x + place.width + thickness / 2);
}

// ---------------------------------------------------------------------------
// Bay interiors
// ---------------------------------------------------------------------------

function bayParts(input: {
  spec: DesignSpec;
  bay: Bay;
  /**
   * What this bay is called on a label, or "" when the cabinet has one bay.
   *
   * Passed in rather than derived here, because a bay built as one band of a
   * stack is still a part of the bay the stack is in, and only the caller
   * knows which that is.
   */
  bayName: string;
  x: number;
  y: number;
  interiorHeight: number;
  interiorDepth: number;
  /**
   * An open display zone of a stacked bay. A whole-bay display comes from the
   * bay's own `display`; a zone of a stack is passed here, `partial` marking
   * that the carcass back behind it is shared with the closed zones.
   */
  zoneDisplay?: (DisplayOptions & { partial: boolean }) | null;
  /** What a shelf is called here — "Shoe shelf" in a shoe zone. */
  shelfLabel?: string;
}): Part[] {
  const { spec, bay, bayName, x, y, interiorHeight, interiorDepth } = input;
  const zone = input.zoneDisplay ?? (bay.display ? { ...bay.display, partial: false } : null);
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
    // An open display's shelves are cut from its accent board, and stop at
    // its own back rather than the carcass's.
    shelfBoard = board,
    shelfDepth = interiorDepth - setback,
    shelfBand = interiorBand,
  ): Part => ({
    id,
    role: "shelf",
    label: note,
    bayId: bay.id,
    board: shelfBoard,
    length: bay.width,
    // A shelf stops short of the front edge and short of the back panel.
    width: shelfDepth,
    quantity: heights.length,
    edges: { ...NO_EDGES, front: true },
    edgeBand: shelfBand,
    adjustable,
    placements: heights.map((shelfY) => ({ x, y: shelfY, z: setback })),
    size: { x: bay.width, y: shelfBoard.thickness, z: shelfDepth },
    axis: "y",
  });

  switch (bay.fitting.kind) {
    case "shelves": {
      if (!zone) {
        if (bay.fitting.count > 0) {
          // n shelves make n + 1 spaces, equal and clear of the boards — the top
          // one below the ceiling of the bay rather than against it.
          parts.push(
            shelf(
              `${bay.id}-shelf`,
              evenShelfHeights(bay.fitting.count, y, interiorHeight, board.thickness),
              `${input.shelfLabel ?? "Shelf"}${bayName}${bay.fitting.adjustable ? "" : " (fixed)"}`,
              bay.fitting.adjustable,
            ),
          );
        }
        break;
      }
      parts.push(...displayParts({ spec, bay, bayName, x, y, interiorHeight, interiorDepth, zone, count: bay.fitting.count, adjustable: bay.fitting.adjustable, shelf }));
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
            `Rail shelf${bayName}`,
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
          label: `Hanging rail${bayName}`,
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
      // Behind the doors: packers on both sides bring the runners clear of
      // the hinge plates, the bank stands back from the front edge, and each
      // drawer is closed by a plain inner front.
      const internal = bay.fitting.internal === true;
      const innerBoard = internal ? (findBoard(bay.fitting.frontBoardId ?? "") ?? board) : board;
      const packer = internal ? board.thickness : 0;
      const innerSetback = internal ? INTERNAL_DRAWER_SETBACK + innerBoard.thickness : 0;
      const openingWidth = bay.width - 2 * packer;
      const usableDepth = internal
        ? Math.min(interiorDepth - innerSetback, bay.fitting.boxDepth ? bay.fitting.boxDepth + 50 : Number.POSITIVE_INFINITY)
        : interiorDepth;
      const construction = drawerConstructionFor(
        spec,
        openingWidth,
        interiorHeight,
        y,
        usableDepth,
        bay.fitting.count,
        bay.fitting.frontHeights,
      );
      const boxX = x + packer + construction.sideClearance;

      for (const [i, face] of construction.faces.entries()) {
        const sideHeight = construction.sideHeights[i] ?? 0;
        const boxFloor = face.floor;
        const sideFloor = boxFloor + construction.bottomThickness;

        parts.push({
          id: `${bay.id}-drawer-${i}-sides`,
          role: "drawer_side",
          label: `Drawer ${i + 1} sides${bayName}`,
          bayId: bay.id,
          board,
          length: construction.boxDepth,
          width: sideHeight,
          quantity: 2,
          edges: { ...NO_EDGES, top: true },
          edgeBand: interiorBand,
          // Left and right, a runner's clearance inside the opening.
          placements: [
            { x: boxX, y: sideFloor, z: innerSetback + construction.frontSetback },
            {
              x: boxX + construction.boxWidth - board.thickness,
              y: sideFloor,
              z: innerSetback + construction.frontSetback,
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
          label: `Drawer ${i + 1} front and back${bayName}`,
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
              z: innerSetback + construction.frontSetback,
            },
            {
              x: boxX + board.thickness,
              y: sideFloor,
              z:
                innerSetback +
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
          label: `Drawer ${i + 1} base${bayName}`,
          bayId: bay.id,
          board: materials.back,
          length: construction.bottomWidth,
          width: construction.bottomDepth,
          quantity: 1,
          edges: { ...NO_EDGES },
          edgeBand: backBand,
          placements: [
            {
              x: boxX,
              y: boxFloor,
              z: innerSetback + construction.frontSetback,
            },
          ],
          size: {
            x: construction.bottomWidth,
            y: materials.back.thickness,
            z: construction.bottomDepth,
          },
          axis: "y",
        });
      }
      if (internal) {
        const innerBand = edgeBandForConstructionBoard(spec, innerBoard, spec.carcass.edgeBand);
        const gap = spec.carcass.doorGap;
        const bankDepth = innerSetback + construction.frontSetback + construction.boxDepth - INTERNAL_DRAWER_SETBACK;
        // The packers: a strip of board on each side for the runners to
        // screw to, the bank's height and depth.
        parts.push({
          id: `${bay.id}-drawer-packers`,
          role: "drawer_side",
          label: `Runner packer${bayName}`,
          bayId: bay.id,
          board,
          length: Math.round(interiorHeight),
          width: Math.round(bankDepth),
          quantity: 2,
          edges: { ...NO_EDGES, front: true },
          edgeBand: interiorBand,
          placements: [
            { x, y, z: INTERNAL_DRAWER_SETBACK },
            { x: x + bay.width - packer, y, z: INTERNAL_DRAWER_SETBACK },
          ],
          size: { x: packer, y: Math.round(interiorHeight), z: Math.round(bankDepth) },
          axis: "x",
        });
        for (const [i, face] of construction.faces.entries()) {
          parts.push({
            id: `${bay.id}-drawer-${i}-inner-front`,
            role: "drawer_front",
            internal: true,
            label: `Inner drawer front ${i + 1}${bayName}`,
            bayId: bay.id,
            board: innerBoard,
            length: face.height,
            width: openingWidth - 2 * gap,
            quantity: 1,
            edges: { front: true, back: true, top: true, bottom: true },
            edgeBand: innerBand,
            placements: [{ x: x + packer + gap, y: face.floor, z: INTERNAL_DRAWER_SETBACK }],
            size: { x: openingWidth - 2 * gap, y: face.height, z: innerBoard.thickness },
            axis: "z",
          });
        }
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
              display: undefined,
            },
            zoneDisplay: section.kind === "display" ? { back: true, lighting: "off", ...section.display, partial: true } : null,
            shelfLabel: section.kind === "shoes" ? "Shoe shelf" : undefined,
            // The enclosing bay's name, carried down unchanged: a drawer in
            // the lower half of bay 2 is still in bay 2. The synthetic id
            // above exists so two sections cannot collide in the viewer's
            // keys, and is deliberately not what the label says.
            bayName,
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
            label: `Fixed shelf${bayName}`,
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

/** The board an open display shows: its accent board, or the wardrobe's interior. */
export function displayBoard(spec: DesignSpec, display: { boardId?: string } | null | undefined): Board {
  return (display?.boardId ? findBoard(display.boardId) : undefined) ?? constructionMaterials(spec).interior;
}

/**
 * An open display, as parts: its shelves in its own board, a back panel of
 * its own when it has one in another board or at another depth, and its LED
 * strips. A display that is a whole bay keeps the carcass back behind it
 * unless its back is off (see cabinetParts); a zone of a stacked bay shares
 * the carcass back with the closed zones, so its own back is a panel in front.
 */
function displayParts(input: {
  spec: DesignSpec;
  bay: Bay;
  bayName: string;
  x: number;
  y: number;
  interiorHeight: number;
  interiorDepth: number;
  zone: DisplayOptions & { partial: boolean };
  count: number;
  adjustable: boolean;
  shelf: (id: string, heights: number[], note: string, adjustable: boolean, board: Board, depth: number, band: Part["edgeBand"]) => Part;
}): Part[] {
  const { spec, bay, bayName, x, y, interiorHeight, interiorDepth, zone, count } = input;
  const parts: Part[] = [];
  const accent = displayBoard(spec, zone);
  const band = edgeBandForConstructionBoard(spec, accent, spec.carcass.edgeBand);
  const setback = spec.carcass.shelfSetback;
  // Where the display's back stands, from the front edge.
  const backAt = zone.depth ? Math.min(zone.depth, interiorDepth) : interiorDepth;
  const ownBack = zone.back && (Boolean(zone.boardId) || zone.depth !== undefined);
  const backThickness = ownBack ? accent.thickness : 0;
  const shelfDepth = Math.max(50, backAt - backThickness - setback);
  const heights = evenShelfHeights(count, y, interiorHeight, accent.thickness);

  if (count > 0) parts.push(input.shelf(`${bay.id}-display-shelf`, heights, `Display shelf${bayName}`, input.adjustable, accent, shelfDepth, band));
  if (ownBack) {
    parts.push({
      id: `${bay.id}-display-back`,
      role: "back",
      label: `Display back${bayName}`,
      bayId: bay.id,
      board: accent,
      length: Math.round(interiorHeight),
      width: Math.round(bay.width),
      quantity: 1,
      edges: { ...NO_EDGES },
      edgeBand: band,
      placements: [{ x, y, z: backAt - backThickness }],
      size: { x: Math.round(bay.width), y: Math.round(interiorHeight), z: backThickness },
      axis: "z",
    });
  }

  // The light: a strip under the top, under every shelf, or up both sides.
  if (zone.lighting !== "off") {
    const front = setback + 20;
    const across = Math.max(0, bay.width - 2 * RAIL_INSET);
    const strips: { length: number; placements: Part["placements"]; size: Part["size"]; axis: Part["axis"] }[] =
      zone.lighting === "vertical"
        ? [{ length: Math.round(interiorHeight), axis: "y", size: { x: LED_SECTION.height, y: Math.round(interiorHeight), z: LED_SECTION.width }, placements: [{ x, y, z: front }, { x: x + bay.width - LED_SECTION.height, y, z: front }] }]
        : [{
            length: Math.round(across),
            axis: "x",
            size: { x: Math.round(across), y: LED_SECTION.height, z: LED_SECTION.width },
            placements: (zone.lighting === "shelf" && heights.length ? heights : [y + interiorHeight]).map((under) => ({ x: x + RAIL_INSET, y: under - LED_SECTION.height, z: front })),
          }];
    for (const [index, strip] of strips.entries()) {
      parts.push({
        id: `${bay.id}-display-led${index ? `-${index}` : ""}`,
        role: "led",
        label: `LED strip${bayName}, ${zone.lighting === "vertical" ? "vertical" : zone.lighting === "shelf" ? "under the shelves" : "under the top"}`,
        bayId: bay.id,
        board: accent,
        manufacture: "purchased",
        length: strip.length,
        width: LED_SECTION.width,
        quantity: strip.placements.length,
        edges: { ...NO_EDGES },
        edgeBand: band,
        placements: strip.placements,
        size: strip.size,
        axis: strip.axis,
      });
    }
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
export function sectionFitting(section: Omit<StackSection, "id" | "share">): Bay["fitting"] {
  switch (section.kind) {
    case "hanging":
      return { kind: "hanging", rails: section.rails ?? 1, shelfAbove: false };
    case "shelves":
      return { kind: "shelves", count: section.count ?? 2, adjustable: true };
    case "drawers":
      return section.internal
        ? { kind: "drawers", count: section.drawers ?? 2, internal: true, boxDepth: section.boxDepth, frontBoardId: section.frontBoardId }
        : { kind: "drawers", count: section.drawers ?? 2 };
    case "open":
      return { kind: "open" };
    // An open display zone is shelves on show; its board, back and light come
    // with the zone (see bayParts).
    case "display":
      return { kind: "shelves", count: section.count ?? 1, adjustable: true };
    case "shoes":
      return { kind: "shelves", count: section.count ?? 3, adjustable: false };
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
  const methods = constructionMethods(spec);
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
    bottomFixing: methods.drawerBottomFixing,
    bottomGrooveDepth: methods.drawerBottomGrooveDepth,
  });
}

// ---------------------------------------------------------------------------
// Doors
// ---------------------------------------------------------------------------

/**
 * The width a bay's fronts share. A bay's own opening, except at a transport
 * joint: there the double wall is two boards, so the fronts either side each
 * reach over half of it, and the gap between them is what it is at an
 * ordinary divider. The facade does not show where the modules meet.
 */
export function frontSpanOf(place: { x: number; width: number; jointLeft: boolean; jointRight: boolean }, t: number): { x: number; width: number } {
  const left = place.jointLeft ? t / 2 : 0;
  const right = place.jointRight ? t / 2 : 0;
  return { x: place.x - left, width: place.width + left + right };
}

/** A door leaf as it will be cut: where its face is in the cabinet, and how it came to be that size. */
export type DoorLeaf = FrontRect & {
  bayId: string;
  /** A stacked bay's door runs, counted from the bottom; 0 on a plain bay. */
  run: number;
  /** Left to right within its run. */
  leaf: number;
  /** How many leaves its run has. */
  leaves: number;
  style: Bay["door"];
  /** Sized by hand — and the size passed the checks; otherwise the automatic size. */
  manual: boolean;
  /** What the automatic sizing gives, for Reset and for the panel. */
  auto: FrontRect;
  /** A single-bay kitchen door spanning the whole unit front, as kitchen units are hung. */
  aligned: boolean;
};

export type CabinetFronts = {
  leaves: DoorLeaf[];
  drawers: (FrontRect & { bayId: string })[];
  /** A size somebody typed that could not be kept, and why. */
  warnings: string[];
};

/** Whether a kitchen unit's doors span its whole front rather than its bay. */
function alignedKitchenDoors(spec: DesignSpec, cabinet: Cabinet): boolean {
  const bay = cabinet.bays.length === 1 ? cabinet.bays[0] : null;
  return Boolean(spec.kitchenSetup?.details) && cabinet.kitchenRole !== "fridge" && bay?.door === "hinged" && !["drawers", "stack"].includes(bay.fitting.kind);
}

/**
 * Every door and drawer front of a cabinet, as rectangles on its face — the
 * one place a door's size comes from. The automatic sizes first, exactly as
 * they have always been made; then a leaf sized by hand takes its own size,
 * if it fits: inside the cabinet, at least a door, over nothing else. One
 * that does not keeps the automatic size and says why, rather than producing
 * a part nobody can cut. The parts, the elevation and the viewer's handles
 * all read this, so the door that is drawn is the door that is cut.
 */
export function cabinetFronts(spec: DesignSpec, cabinet: Cabinet): CabinetFronts {
  const materials = constructionMaterials(spec);
  const gap = spec.carcass.doorGap;
  const plinth = cabinet.plinthHeight;
  const t = materials.body.thickness;
  const height = cabinet.size.height;
  const interiorDepth = cabinet.size.depth - materials.back.thickness;
  const leaves: DoorLeaf[] = [];
  const drawers: CabinetFronts["drawers"] = [];

  for (const place of bayLayout(cabinet, t)) {
    const bay = place.bay;
    const span = frontSpanOf(place, t);
    const opening = height - plinth - 2 * t;
    const openingFloor = plinth + t;

    const drawerFaces = (count: number, explicit: number[] | undefined, bandFloor: number, bandHeight: number) => {
      const construction = drawerConstructionFor(spec, bay.width, bandHeight, bandFloor, interiorDepth, count, explicit);
      for (const face of construction.faces) drawers.push({ bayId: bay.id, x: span.x + gap, y: face.floor, width: span.width - 2 * gap, height: face.height });
    };
    const doorRun = (run: number, bandFloor: number, bandHeight: number) => {
      const count = bay.doorLeaves;
      const leafWidth = Math.floor((span.width - gap * (count + 1)) / count);
      const leafHeight = bandHeight - 2 * gap;
      if (leafHeight <= 0 || leafWidth <= 0) return;
      for (let leaf = 0; leaf < count; leaf += 1) {
        const auto = { x: span.x + gap + leaf * (leafWidth + gap), y: bandFloor + gap, width: leafWidth, height: leafHeight };
        leaves.push({ ...auto, bayId: bay.id, run, leaf, leaves: count, style: bay.door, manual: false, auto, aligned: false });
      }
    };

    // An open display has no door, whatever the bay's door says.
    if (bay.display) continue;
    if (bay.fitting.kind === "drawers" && !bay.fitting.internal) {
      drawerFaces(bay.fitting.count, bay.fitting.frontHeights, openingFloor, opening);
      continue;
    }
    if (bay.fitting.kind === "stack") {
      const bands = sectionBands(bay.fitting.sections, openingFloor, opening, t);
      let run: { floor: number; top: number } | null = null;
      let runIndex = 0;
      const closeRun = () => {
        if (!run) return;
        if (bay.door !== "none") doorRun(runIndex, run.floor, run.top - run.floor);
        runIndex += 1;
        run = null;
      };
      for (const band of bands) {
        if (!doorSection(band.section)) {
          closeRun();
          if (band.section.kind === "drawers") drawerFaces(band.section.drawers ?? 2, undefined, band.floor, band.height);
          continue;
        }
        const top = band.floor + band.height;
        run = run ? { floor: band.floor, top: run.top } : { floor: band.floor, top };
      }
      closeRun();
      continue;
    }
    if (bay.door === "none") continue;
    doorRun(0, plinth, height - plinth);
  }

  // A kitchen unit with its details set hangs its doors across the whole
  // front, insets and all, rather than inside its one bay.
  if (alignedKitchenDoors(spec, cabinet)) {
    const bay = cabinet.bays[0]!;
    const count = bay.doorLeaves;
    const frontWidth = cabinet.size.width - (cabinet.frontInsets?.start ?? 0) - (cabinet.frontInsets?.end ?? 0);
    const leafWidth = (frontWidth - count * gap) / count;
    leaves.length = 0;
    for (let leaf = 0; leaf < count && leafWidth > 0; leaf += 1) {
      const auto = { x: (cabinet.frontInsets?.start ?? 0) + gap / 2 + leaf * (leafWidth + gap), y: plinth + gap / 2, width: leafWidth, height: height - plinth - gap };
      leaves.push({ ...auto, bayId: bay.id, run: 0, leaf, leaves: count, style: "hinged", manual: false, auto, aligned: true });
    }
  }

  // Sizes typed or dragged, each kept only if it fits beside everything else.
  const warnings: string[] = [];
  for (const leaf of leaves) {
    const override = cabinet.bays.find((bay) => bay.id === leaf.bayId)?.doorOverrides?.find((entry) => entry.run === leaf.run && entry.leaf === leaf.leaf);
    if (override) Object.assign(leaf, { x: override.x, y: override.y, width: override.width, height: override.height, manual: true });
  }
  for (let pass = 0; pass < leaves.length + 1; pass += 1) {
    let changed = false;
    for (const leaf of leaves.filter((entry) => entry.manual)) {
      const others = [...drawers, ...leaves.filter((entry) => entry !== leaf)];
      const problem = doorRectProblem(leaf, cabinet.size, others);
      if (!problem) continue;
      warnings.push(`${cabinet.label || "Cabinet"}, door ${leaf.leaf + 1}: ${problem} — kept at its automatic size`);
      Object.assign(leaf, { ...leaf.auto, manual: false });
      changed = true;
    }
    if (!changed) break;
  }
  return { leaves, drawers, warnings };
}

/**
 * The boards a dragged door edge can line up with — gables, dividers,
 * shelves, top, bottom and plinth — as their faces show in the cabinet's own
 * frame. Read off the same parts the cut list cuts, before the cabinet is
 * placed in the room.
 */
export function cabinetFaceBoards(spec: DesignSpec, cabinet: Cabinet): FaceBoard[] {
  const roles = new Set<Part["role"]>(["gable", "divider", "top", "bottom", "shelf", "plinth"]);
  return kitchenConstruction(spec, cabinet, cabinetParts(spec, cabinet))
    .filter((part) => roles.has(part.role))
    .flatMap((part) => part.placements.map((at) => ({ minX: at.x, maxX: at.x + part.size.x, minY: at.y, maxY: at.y + part.size.y, upright: part.role === "gable" || part.role === "divider" })));
}

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

  // Doors: every leaf from cabinetFronts, automatic or sized by hand. A run
  // whose leaves are all automatic stays the one part it always was, a pair
  // counted twice; a run with a leaf sized by hand is a part per leaf, each
  // its own size on the cut list. Emitted where the bay always put its doors,
  // so the cut list reads in the order it always has.
  const fronts = cabinetFronts(spec, cabinet);
  const doorRun = (bay: Bay, run: number) => {
    const leavesOfRun = fronts.leaves.filter((leaf) => leaf.bayId === bay.id && leaf.run === run);
    const first = leavesOfRun[0];
    if (!first) return;
    const idSuffix = bay.fitting.kind === "stack" ? `-${run}` : "";
    const doorStyle = bay.door === "hinged" || bay.door === "sliding" || bay.door === "bifold" ? bay.door : undefined;

    if (first.aligned) {
      // A kitchen unit's doors across its whole front: one panel per leaf.
      for (const leaf of leavesOfRun) {
        parts.push({
          id: `aligned-door-${leaf.leaf}`, role: "door", label: `aligned door ${leaf.leaf}`, board, edgeBand: spec.carcass.edgeBand,
          length: leaf.height, width: leaf.width, quantity: 1,
          edges: { front: true, back: false, top: true, bottom: false },
          size: { x: leaf.width, y: leaf.height, z: frontThickness },
          placements: [{ x: leaf.x, y: leaf.y, z: -frontThickness }], axis: "z",
          doorStyle: "hinged", bayId: bay.id, doorLeaf: { run: leaf.run, first: leaf.leaf },
        });
      }
      return;
    }

    const shared = (leaf: DoorLeaf, id: string, label: string, quantity: number, placements: Part["placements"]): Part => ({
      id, role: "door", label, bayId: bay.id, board,
      length: leaf.height, width: leaf.width, quantity,
      edges: { front: true, back: true, top: true, bottom: true },
      edgeBand: frontBand, doorStyle, placements,
      size: { x: leaf.width, y: leaf.height, z: frontThickness }, axis: "z",
      doorLeaf: { run: leaf.run, first: leaf.leaf },
    });
    if (leavesOfRun.every((leaf) => !leaf.manual)) {
      // Side by side across the bay, a gap between each and at both ends.
      parts.push(shared(first, `${bay.id}-door${idSuffix}`, `Door${bayLabelSuffix(cabinet, bay.id)}${leavesOfRun.length > 1 ? ` (pair)` : ""}`, leavesOfRun.length, leavesOfRun.map((leaf) => ({ x: leaf.x, y: leaf.y, z: -frontThickness }))));
      return;
    }
    for (const leaf of leavesOfRun) {
      parts.push(shared(leaf, `${bay.id}-door${idSuffix}-leaf-${leaf.leaf}`, `Door${bayLabelSuffix(cabinet, bay.id)}${leavesOfRun.length > 1 ? ` ${leaf.leaf + 1} of ${leavesOfRun.length}` : ""}`, 1, [{ x: leaf.x, y: leaf.y, z: -frontThickness }]));
    }
  };

  for (const place of bayLayout(cabinet, t)) {
    const bay = place.bay;
    const span = frontSpanOf(place, t);

    const opening = height - plinth - 2 * t;
    const openingFloor = plinth + t;

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
          label: `Drawer front ${face.index + 1}${bayLabelSuffix(cabinet, bay.id)}`,
          bayId: bay.id,
          board,
          length: face.height,
          width: span.width - 2 * gap,
          quantity: 1,
          // A front shows on all four edges.
          edges: { front: true, back: true, top: true, bottom: true },
          edgeBand: frontBand,
          // Stacked on the same floors as the boxes behind them, and standing
          // proud of the carcass — hence the negative z.
          placements: [
            { x: span.x + gap, y: face.floor, z: -frontThickness },
          ],
          size: {
            x: span.width - 2 * gap,
            y: face.height,
            z: frontThickness,
          },
          axis: "z",
        });
      }
    };

    if (bay.display) continue;
    if (bay.fitting.kind === "drawers" && !bay.fitting.internal) {
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
      // A drawer section shows its own fronts; everything else is behind a
      // door (see cabinetFronts). Bands come from the same helper the
      // interior used, so a front and the box behind it cannot disagree.
      const bands = sectionBands(bay.fitting.sections, openingFloor, opening, t);
      // Consecutive non-drawer sections share one door run, counted as cabinetFronts counts them.
      let inRun = false;
      let runIndex = 0;
      const closeRun = () => {
        if (!inRun) return;
        if (bay.door !== "none") doorRun(bay, runIndex);
        runIndex += 1;
        inRun = false;
      };
      for (const band of bands) {
        if (doorSection(band.section)) { inRun = true; continue; }
        closeRun();
        // An open display zone closes the door run and has no front at all.
        if (band.section.kind !== "drawers") continue;
        drawerFronts(
          `${bay.id}-${band.section.id}`,
          band.section.drawers ?? 2,
          undefined,
          band.floor,
          band.height,
        );
      }
      closeRun();
      continue;
    }

    if (bay.door === "none") continue;
    doorRun(bay, 0);
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
  // An inner front behind a door is pulled by a finger-grip, not a handle.
  const drawerFronts = parts.filter((part) => part.role === "drawer_front" && !part.internal);
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
      .filter((part) => part.role === "rail" && part.manufacture !== "cut")
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

  // Joining transport modules: connectors along every joint's height, base
  // and top cabinets alike, of the kind each cabinet says.
  const connectorIds = { confirmat: "connector-confirmat", bolt: "connector-bolt", dowel_screw: "connector-dowel-screw", cam: "connector-cam" } as const;
  const connectors = new Map<string, { count: number; joints: number }>();
  for (const cabinet of spec.cabinets) {
    const joints = jointsOf(cabinet).length;
    if (!joints || !cabinet.transport) continue;
    const id = connectorIds[cabinet.transport.connector ?? "confirmat"];
    const entry = connectors.get(id) ?? { count: 0, joints: 0 };
    entry.count += joints * connectorsPerJoint(cabinet.size.height - cabinet.plinthHeight);
    entry.joints += joints;
    connectors.set(id, entry);
  }
  for (const [id, entry] of connectors) {
    const connector = spec.hardware.find((item) => item.id === id) ?? findHardware(id);
    if (connector) lines.push({ hardware: connector, quantity: entry.count, note: `Joining transport modules — ${entry.joints} joint${entry.joints === 1 ? "" : "s"}, screwed together from inside` });
  }

  // Open-display lighting, by the metre the geometry lays.
  const ledMetres = parts.filter((part) => part.role === "led").reduce((total, part) => total + (part.length / 1000) * part.quantity, 0);
  const led = ledMetres > 0 ? (spec.hardware.find((item) => item.id === "led-strip") ?? findHardware("led-strip")) : undefined;
  if (led) {
    lines.push({ hardware: led, quantity: round(ledMetres, 2), note: "Open display lighting" });
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
  for (const requirement of cornerHardware(resolved, parts, spec)) {
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

/**
 * Where n shelves go so the n + 1 spaces between them are equal, in mm above
 * the floor — each height the shelf's underside.
 *
 * The clear spaces are what is equal, so each shelf's own thickness is taken
 * out first. Dividing the opening by n + 1 and standing a shelf on each mark
 * made the bottom space a board thicker than every other: 377 mm under a
 * stack of 359s in a 2.3 m wardrobe.
 */
export function evenShelfHeights(count: number, floor: number, height: number, thickness: number): number[] {
  const space = (height - count * thickness) / (count + 1);
  return Array.from({ length: count }, (_, index) => floor + space * (index + 1) + thickness * index);
}
