import type { CornerBlock } from "./layout";
import type { ResolvedDesign } from "./resolve";
import type { Part } from "../types/parts";
import type { DesignSpec } from "../types/spec";
import {
  constructionMaterials,
  edgeBandForConstructionBoard,
} from "./wardrobe-materials";
import { recessedWardrobePlinthParts } from "./wardrobe-plinth";
import { kitchenConstruction } from "./kitchen-construction";

/**
 * The carcass that fills a corner.
 *
 * Part 68: "Do NOT create L-shaped or U-shaped furniture by simply overlapping
 * straight models." The solver already guarantees the runs stop short of the
 * corner square; this file is what goes in the hole they leave.
 *
 * Every kind below fills the same `d × d` footprint and differs in what is
 * inside it. They are real panels with real sizes, so the cut list and the BOQ
 * count them like any other — a corner that is drawn but not cut is a corner
 * the shop has to improvise, and improvised corners are where a kitchen
 * install goes wrong.
 *
 * ## Why the panels are what they are
 *
 * A corner box is not a square cabinet. Its two open faces meet the two runs,
 * so it has:
 *
 *   - a bottom and a top, both `d × d` minus the supporting panels
 *   - one closed-face gable; an L return uses hinge/rear stiles instead of a
 *     full gable so its second leaf opens into real usable space
 *   - one rear 6 mm back, never an HDF panel at the front/door plane
 *
 * A blind corner adds a filler panel across part of one open face — that is
 * what makes it blind, and what makes it cheap. A diagonal replaces the two
 * open faces with one panel across the 45°, which is longer than either.
 */

/** How far a blind corner's face is closed off, as a share of the opening. */
const BLIND_FILLER_SHARE = 0.45;

/** Shared trade rule for every manufactured hinged leaf, including corners. */
export function hingesPerLeaf(height: number): number {
  if (height <= 1200) return 2;
  if (height <= 1600) return 3;
  if (height <= 2000) return 4;
  return 5;
}

export function cornerParts(
  spec: DesignSpec,
  resolved: ResolvedDesign,
): Part[] {
  const parts: Part[] = [];

  for (const corner of manufacturedCorners(spec, resolved)) {
    parts.push(...partsForCorner(spec, corner).map((part) => ({ ...part, cabinetId: corner.id })));
    if (spec.kitchenSetup?.details && !corner.baseY) {
      const template = spec.cabinets.find((c) => c.kind === "base" || c.kind === "island");
      if (template) for (const p of kitchenConstruction(spec, { ...template, kitchenRole: undefined,
        size: { width: corner.width ?? corner.size, height: corner.height, depth: corner.depth ?? corner.size }, plinthHeight: spec.carcass.plinthHeight }, [])) {
        if (p.role === "plinth") parts.push({ ...p, id: `${corner.id}/${p.id}`, cabinetId: corner.id, placements: p.placements.map((at) => ({ ...at, x: at.x + corner.x, z: at.z + corner.z })) });
      }
    }
  }

  return parts;
}

/** Base corners plus the separately owned wall-cabinet corner volumes. */
function manufacturedCorners(spec: DesignSpec, resolved: ResolvedDesign): CornerBlock[] {
  const base = resolved.layout.corners;
  const setup = spec.kitchenSetup;
  if (spec.furnitureType !== "kitchen" || !setup?.wallCabinets || base.length === 0) return base;
  const upperDepth = setup.details?.upperDepth ?? 350;
  const upperBottom = setup.details?.upperBottom ?? 1450;
  const height = setup.wallHeight + setup.topHeight;
  return [...base, ...base.map((corner): CornerBlock => ({
    id: `upper-${corner.id}`,
    // Blind is a base-cabinet economy choice; upper corners are accessible
    // L modules unless the user explicitly selected a diagonal corner.
    kind: spec.cornerKinds?.[`upper-${corner.id}`] ?? (corner.kind === "diagonal" ? "diagonal" : "l_corner"),
    x: corner.id.endsWith("corner-left") ? 0 : setup.roomWidth - upperDepth,
    z: 0,
    size: upperDepth,
    width: spec.cornerSettings?.[`upper-${corner.id}`]?.width ?? upperDepth,
    depth: spec.cornerSettings?.[`upper-${corner.id}`]?.depth ?? upperDepth,
    between: [`upper-${corner.between[0]}`, `upper-${corner.between[1]}`],
    height: spec.cornerSettings?.[`upper-${corner.id}`]?.height ?? height,
    baseY: upperBottom,
    plinthHeight: 0,
  }))];
}

function partsForCorner(spec: DesignSpec, corner: CornerBlock): Part[] {
  const materials = constructionMaterials(spec);
  const board = materials.body;
  const backBoard = materials.back;
  const frontBoard = materials.fronts;
  const bodyBand = edgeBandForConstructionBoard(spec, board, spec.carcass.edgeBand);
  const backBand = edgeBandForConstructionBoard(
    spec,
    backBoard,
    spec.carcass.edgeBand,
  );
  const frontBand = edgeBandForConstructionBoard(
    spec,
    frontBoard,
    spec.carcass.edgeBand,
  );
  const t = board.thickness;

  const sizeX = corner.width ?? corner.size;
  const sizeZ = corner.depth ?? corner.size;
  const height = corner.height;
  const wardrobeCorner = spec.furnitureType === "wardrobe";
  const wardrobeShelving = wardrobeCorner && (corner.kind === "l_corner" || corner.kind === "custom");
  const exteriorRight = wardrobeShelving && corner.id !== "corner-left";

  // The carcass sits on the plinth like every other base unit, so its panels
  // are shorter than the corner's overall height by it.
  const plinth = corner.plinthHeight ?? spec.carcass.plinthHeight;
  const carcassHeight = Math.max(0, height - plinth);

  // Inside the two gables.
  const inner = Math.max(0, sizeX - (wardrobeShelving ? t : 2 * t));
  const shelfX = exteriorRight ? 0 : t;
  // Just like a straight wardrobe, every 18 mm shell board stops at the
  // front face of the 6 mm applied back. The old corner builder extended its
  // gables all the way through a back panel at both z = 0 and z = size, which
  // made a convincing front view but generated overlapping boards.
  const inwardOpening =
    ((corner.kind === "l_corner" || corner.kind === "custom") && spec.furnitureType === "wardrobe") ||
    corner.kind === "blind";
  const shellDepth = Math.max(0, sizeZ - backBoard.thickness);
  const storageZ = inwardOpening ? backBoard.thickness : 0;
  const doorHeight = Math.max(0, carcassHeight - spec.carcass.doorGap);

  const at = (x: number, y: number, z: number) => ({
    x: corner.x + x,
    y: y + plinth + (corner.baseY ?? 0),
    z: corner.z + z,
  });

  const wardrobePlinths: Part[] =
    spec.furnitureType === "wardrobe" && plinth > 0
      ? recessedWardrobePlinthParts({
          width: sizeX,
          depth: sizeZ,
          height: plinth,
          board: materials.plinth,
          edgeBand: edgeBandForConstructionBoard(
            spec,
            materials.plinth,
            spec.carcass.edgeBand,
          ),
          carcassThickness: t,
          frontThickness: frontBoard.thickness,
        }).map((part) => ({
          ...part,
          id: `${corner.id}/${part.id}`,
          label: `${labelFor(corner)} ${part.label}`,
          placements: part.placements.map((placement) => ({
            x: corner.x + placement.x,
            y: placement.y,
            z: corner.z + placement.z,
          })),
        }))
      : [];

  const sideStructures: Part[] =
    corner.kind === "l_corner" || corner.kind === "hanging" || corner.kind === "diagonal" || corner.kind === "custom"
        ? []
        : [
            // A blind/custom corner has only one front opening, so it retains
            // the ordinary right gable. A diagonal corner is different: its
            // angled face needs a triangular clear opening, so no rectangular
            // return gable is allowed to cut through it.
            {
              id: `${corner.id}/gable-right`,
              role: "gable",
              label: `${labelFor(corner)} right gable`,
              board,
              length: carcassHeight,
              width: shellDepth,
              quantity: 1,
              edges: { front: true, back: false, top: false, bottom: false },
              edgeBand: bodyBand,
              size: { x: t, y: carcassHeight, z: shellDepth },
              axis: "x",
              placements: [at(sizeX - t, 0, storageZ)],
            },
          ];

  const parts: Part[] = [
    ...wardrobePlinths,
    {
      id: `${corner.id}/gable-left`,
      role: "gable",
      label: `${labelFor(corner)} left gable`,
      board,
      // Along the grain: a gable's length runs vertically.
      length: carcassHeight,
      width: shellDepth,
      quantity: 1,
      edges: { front: true, back: false, top: false, bottom: false },
      edgeBand: bodyBand,
      size: { x: t, y: carcassHeight, z: shellDepth },
      axis: "x",
      placements: [at(exteriorRight ? sizeX - t : 0, 0, storageZ)],
    },
    ...sideStructures,
    {
      id: `${corner.id}/bottom`,
      role: "shelf",
      label: `${labelFor(corner)} bottom`,
      board,
      length: inner,
      width: shellDepth,
      quantity: 1,
      edges: { front: true, back: false, top: false, bottom: false },
      edgeBand: bodyBand,
      size: { x: inner, y: t, z: shellDepth },
      axis: "y",
      placements: [at(shelfX, 0, storageZ)],
    },
    {
      id: `${corner.id}/top`,
      role: "top",
      label: `${labelFor(corner)} top`,
      board,
      length: inner,
      width: shellDepth,
      quantity: 1,
      edges: { front: true, back: false, top: false, bottom: false },
      edgeBand: bodyBand,
      size: { x: inner, y: t, z: shellDepth },
      axis: "y",
      placements: [at(shelfX, carcassHeight - t, storageZ)],
    },
    {
      id: `${corner.id}/back`,
      role: "back",
      label: `${labelFor(corner)} back`,
      board: backBoard,
      length: carcassHeight,
      width: sizeX,
      quantity: 1,
      edges: { front: false, back: false, top: false, bottom: false },
      edgeBand: backBand,
      size: { x: sizeX, y: carcassHeight, z: backBoard.thickness },
      axis: "z",
      // The back is at the rear, never at the door plane. Placing an HDF
      // panel at z = 0 was the source of full-height collisions with every
      // corner door and made a real opening impossible.
      placements: [at(0, 0, inwardOpening ? 0 : shellDepth)],
    },
  ];

  if (corner.kind === "blind") {
    // The filler that makes it blind: a fixed panel across part of one open
    // face, behind which the space is reachable but not fronted.
    const filler = Math.round(inner * BLIND_FILLER_SHARE);
    parts.push({
      id: `${corner.id}/blind-filler`,
      role: "door",
      label: `${labelFor(corner)} blind filler`,
      board: frontBoard,
      length: carcassHeight,
      width: filler,
      quantity: 1,
      edges: { front: true, back: true, top: true, bottom: true },
      edgeBand: frontBand,
      size: { x: filler, y: carcassHeight, z: frontBoard.thickness },
      axis: "z",
      // This closes the blind return; it is not an operable leaf and must not
      // receive a handle or hinge in the hardware schedule.
      doorStyle: "fixed",
      placements: [at(t, 0, sizeZ)],
    });
    const opening = Math.max(0, inner - filler - spec.carcass.doorGap);
    parts.push({
      id: `${corner.id}/blind-door`, role: "door", label: `${labelFor(corner)} door`,
      board: frontBoard, length: doorHeight, width: opening, quantity: 1,
      edges: { front: true, back: true, top: true, bottom: true }, edgeBand: frontBand,
      size: { x: opening, y: doorHeight, z: frontBoard.thickness }, axis: "z",
      doorStyle: "hinged", placements: [at(t + filler + spec.carcass.doorGap, 0, sizeZ)],
    });
  }

  if (corner.kind === "diagonal") {
    // One panel across the 45° face. Longer than either side by √2, which is
    // the reason a diagonal corner costs more board than it looks like it
    // should — and the reason both runs must be the same depth for it.
    // Floor rather than round: a 564 mm clear diagonal is 797.616 mm. Rounding
    // up to 798 drives the rotated endpoint a fraction of a millimetre through
    // the 18 mm left gable; flooring keeps a real saw/door clearance instead
    // of introducing invisible z-fighting at the joint.
    const face = Math.floor(inner * Math.SQRT2);
    parts.push({
      id: `${corner.id}/diagonal-face`,
      role: "door",
      label: `${labelFor(corner)} diagonal door`,
      board: frontBoard,
      // A diagonal leaf lives inside the clear opening rather than cutting
      // through the top and bottom boards. It remains a real 45° panel and
      // the carousel/hinge hardware still follows this same part definition.
      length: Math.max(0, carcassHeight - 2 * t),
      width: face,
      quantity: 1,
      edges: { front: true, back: true, top: true, bottom: true },
      edgeBand: frontBand,
      size: { x: face, y: Math.max(0, carcassHeight - 2 * t), z: frontBoard.thickness },
      axis: "z",
      doorStyle: "corner",
      // The leaf runs from the rear-right clear corner back toward the
      // front-left clear corner. -135° gives it the same 45° line but pushes
      // its thickness toward the open side of the triangular cabinet instead
      // of into the left gable and rear HDF panel.
      rotationY: corner.id.endsWith("corner-left") ? 135 : -135,
      placements: corner.id.endsWith("corner-left")
        ? [at(sizeX, t, t)]
        : [at(sizeX - t, t, sizeZ - t)],
    });
  }

  if ((corner.kind === "l_corner" && spec.furnitureType === "kitchen") || corner.kind === "hanging") {
    // A folding inner leaf reaches the corner without occupying either
    // neighbouring run's end gable.
    const leaf = Math.floor(inner * Math.SQRT2);
    parts.push({
      id: `${corner.id}/door-front`,
      role: "door",
      label: `${labelFor(corner)} folding door`,
      board: frontBoard,
      length: Math.max(0, carcassHeight - 2 * t),
      width: leaf,
      quantity: 1,
      edges: { front: true, back: true, top: true, bottom: true },
      edgeBand: frontBand,
      size: {
        x: leaf,
        y: Math.max(0, carcassHeight - 2 * t),
        z: frontBoard.thickness,
      },
      axis: "z",
      doorStyle: "corner",
      rotationY: corner.id.endsWith("corner-left") ? 135 : -135,
      placements: corner.id.endsWith("corner-left")
        ? [at(sizeX, t, t)]
        : [at(sizeX - t, t, sizeZ - t)],
    });
  }

  if (corner.kind === "l_corner" || corner.kind === "custom") {
    const count = spec.cornerSettings?.[corner.id]?.shelves ?? 3;
    const shelfYs = Array.from({ length: count }, (_, index) => Math.round((carcassHeight - t) * (index + 1) / (count + 1)));
    parts.push({
      id: `${corner.id}/corner-shelves`, role: "shelf", label: `${labelFor(corner)} shelves`,
      board, length: inner, width: shellDepth, quantity: shelfYs.length,
      edges: { front: true, back: false, top: false, bottom: false }, edgeBand: bodyBand,
      adjustable: true, size: { x: inner, y: t, z: shellDepth }, axis: "y",
      placements: shelfYs.map((y) => at(shelfX, y, storageZ)),
    });
  }

  if (corner.kind === "hanging") {
    const railLength = Math.max(0, inner - 80);
    parts.push({
      id: `${corner.id}/hanging-rail`, role: "rail", label: `${labelFor(corner)} rail`,
      board, manufacture: "purchased", length: railLength, width: 25, quantity: 1,
      edges: { front: false, back: false, top: false, bottom: false }, edgeBand: bodyBand,
      size: { x: railLength, y: 25, z: 25 }, axis: "x",
      placements: [at(t + 40, Math.round(carcassHeight * 0.68), shellDepth / 2)],
    });
  }

  return parts;
}

function labelFor(corner: CornerBlock): string {
  switch (corner.kind) {
    case "l_corner":
      return "L corner";
    case "blind":
      return "Blind corner";
    case "diagonal":
      return "Diagonal corner";
    case "hanging":
      return "Hanging corner";
    case "custom":
      return "Corner";
  }
}

/**
 * Hinges, runners and the carousel a corner needs.
 *
 * Returned separately from the panels because hardware is counted per fitting
 * rather than per board, and because a corner's hardware is the part a shop is
 * most likely to forget to order.
 */
export function cornerHardware(
  resolved: ResolvedDesign,
  parts: readonly Part[] = [],
  spec?: DesignSpec,
): {
  id: string;
  catalogueId: string;
  label: string;
  quantity: number;
  unit: string;
  }[] {
  const lines: {
    id: string;
    catalogueId: string;
    label: string;
    quantity: number;
    unit: string;
  }[] = [];

  for (const corner of spec ? manufacturedCorners(spec, resolved) : resolved.layout.corners) {
    // Corner hinges must follow the same actual leaf part used by the model,
    // cut list and price. Overall corner height includes a plinth/top clear
    // space and can sit on the opposite side of a hinge threshold from the
    // door itself, so using it here over-orders at 1200/1600/2000 mm.
    const leaves = parts.filter(
      (part) =>
        part.role === "door" &&
        part.doorStyle === "corner" &&
        part.id.startsWith(`${corner.id}/`),
    );
    const hingesForLeaves = (fallbackLeafCount: number) =>
      leaves.length > 0
        ? leaves.reduce(
            (total, leaf) =>
              total + leaf.quantity * hingesPerLeaf(leaf.length),
            0,
          )
        : fallbackLeafCount * hingesPerLeaf(corner.height);

    if (corner.kind === "l_corner" || corner.kind === "hanging") {
      lines.push({
        id: `${corner.id}/hinge`,
        catalogueId: "hinge-corner-165",
        // 165° for a corner: an ordinary 110° hinge will not let the door
        // clear the return, and the door fouls the adjacent run.
        label: "165° corner hinge",
        quantity: hingesForLeaves(2),
        unit: "pcs",
      });
    }

    if (corner.kind === "diagonal") {
      lines.push({
        id: `${corner.id}/hinge`,
        catalogueId: "hinge-soft-close",
        label: "110° hinge",
        quantity: hingesForLeaves(1),
        unit: "pcs",
      });
      lines.push({
        id: `${corner.id}/carousel`,
        catalogueId: "corner-carousel",
        label: "Corner carousel",
        quantity: 1,
        unit: "set",
      });
    }

    if (corner.kind === "blind") {
      lines.push({
        id: `${corner.id}/pullout`,
        catalogueId: "blind-corner-pullout",
        label: "Blind corner pull-out",
        quantity: 1,
        unit: "set",
      });
    }
  }

  return lines;
}
