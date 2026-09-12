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

  for (const corner of resolved.layout.corners) {
    parts.push(...partsForCorner(spec, corner));
    if (spec.kitchenSetup?.details) {
      const template = spec.cabinets.find((c) => c.kind === "base" || c.kind === "island");
      if (template) for (const p of kitchenConstruction(spec, { ...template, kitchenRole: undefined,
        size: { width: corner.size, height: corner.height, depth: corner.size }, plinthHeight: spec.carcass.plinthHeight }, [])) {
        if (p.role === "plinth") parts.push({ ...p, id: `${corner.id}/${p.id}`, placements: p.placements.map((at) => ({ ...at, x: at.x + corner.x, z: at.z + corner.z })) });
      }
    }
  }

  return parts;
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

  const size = corner.size;
  const height = corner.height;

  // The carcass sits on the plinth like every other base unit, so its panels
  // are shorter than the corner's overall height by it.
  const plinth = spec.carcass.plinthHeight;
  const carcassHeight = Math.max(0, height - plinth);

  // Inside the two gables.
  const inner = Math.max(0, size - 2 * t);
  // Just like a straight wardrobe, every 18 mm shell board stops at the
  // front face of the 6 mm applied back. The old corner builder extended its
  // gables all the way through a back panel at both z = 0 and z = size, which
  // made a convincing front view but generated overlapping boards.
  const shellDepth = Math.max(0, size - backBoard.thickness);
  const doorHeight = Math.max(0, carcassHeight - spec.carcass.doorGap);

  const at = (x: number, y: number, z: number) => ({
    x: corner.x + x,
    y: y + plinth,
    z: corner.z + z,
  });

  const wardrobePlinths: Part[] =
    spec.furnitureType === "wardrobe" && plinth > 0
      ? recessedWardrobePlinthParts({
          width: size,
          depth: size,
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
    corner.kind === "l_corner"
      ? [
          // The return face must remain an actual opening. A full-height right
          // gable would make the second L door decorative: it could be rendered
          // on the outside but would open onto solid board. These two stiles
          // give its hinges and rear joint real 18 mm structure while leaving
          // the middle of the return clear into the corner cabinet.
          {
            id: `${corner.id}/return-hinge-stile`,
            role: "divider",
            label: `${labelFor(corner)} return hinge stile`,
            board,
            length: carcassHeight,
            width: t,
            quantity: 1,
            edges: { front: true, back: false, top: false, bottom: false },
            edgeBand: bodyBand,
            size: { x: t, y: carcassHeight, z: t },
            axis: "x",
            placements: [at(size - t, 0, 0)],
          },
          {
            id: `${corner.id}/return-rear-stile`,
            role: "divider",
            label: `${labelFor(corner)} return rear stile`,
            board,
            length: carcassHeight,
            width: t,
            quantity: 1,
            edges: { front: false, back: false, top: false, bottom: false },
            edgeBand: bodyBand,
            size: { x: t, y: carcassHeight, z: t },
            axis: "x",
            placements: [at(size - t, 0, shellDepth - t)],
          },
        ]
      : corner.kind === "diagonal"
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
              placements: [at(size - t, 0, 0)],
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
      placements: [at(0, 0, 0)],
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
      placements: [at(t, 0, 0)],
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
      placements: [at(t, carcassHeight - t, 0)],
    },
    {
      id: `${corner.id}/back`,
      role: "back",
      label: `${labelFor(corner)} back`,
      board: backBoard,
      length: carcassHeight,
      width: size,
      quantity: 1,
      edges: { front: false, back: false, top: false, bottom: false },
      edgeBand: backBand,
      size: { x: size, y: carcassHeight, z: backBoard.thickness },
      axis: "z",
      // The back is at the rear, never at the door plane. Placing an HDF
      // panel at z = 0 was the source of full-height collisions with every
      // corner door and made a real opening impossible.
      placements: [at(0, 0, shellDepth)],
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
      placements: [at(t, 0, -frontBoard.thickness)],
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
      rotationY: -135,
      placements: [at(size - t, t, size - t)],
    });
  }

  if (corner.kind === "l_corner") {
    // An L-shaped corner is fronted on both perpendicular exterior faces.
    // They must be separate part rows: a quantity-two row cannot carry the
    // return leaf's 90° transform, and used to place both doors in the same
    // plane where they occupied each other's entire volume.
    const leaf = Math.max(0, inner - spec.carcass.doorGap);
    const returnLeaf = Math.max(0, size - 2 * spec.carcass.doorGap);
    parts.push({
      id: `${corner.id}/door-front`,
      role: "door",
      label: `${labelFor(corner)} front door`,
      board: frontBoard,
      length: doorHeight,
      width: leaf,
      quantity: 1,
      edges: { front: true, back: true, top: true, bottom: true },
      edgeBand: frontBand,
      size: {
        x: leaf,
        y: doorHeight,
        z: frontBoard.thickness,
      },
      axis: "z",
      doorStyle: "corner",
      // Applied outside the front gables, exactly as a normal wardrobe door.
      placements: [at(t, 0, -frontBoard.thickness)],
    });
    parts.push({
      id: `${corner.id}/door-return`,
      role: "door",
      label: `${labelFor(corner)} return door`,
      board: frontBoard,
      length: doorHeight,
      width: returnLeaf,
      quantity: 1,
      edges: { front: true, back: true, top: true, bottom: true },
      edgeBand: frontBand,
      size: {
        x: returnLeaf,
        y: doorHeight,
        z: frontBoard.thickness,
      },
      axis: "z",
      doorStyle: "corner",
      // -90° maps local length down the return wall and thickness out past
      // its gable, so this leaf is perpendicular to the front leaf without
      // intersecting either the gable or the front door.
      rotationY: -90,
      placements: [at(size, 0, size - spec.carcass.doorGap)],
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

  for (const corner of resolved.layout.corners) {
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

    if (corner.kind === "l_corner") {
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
