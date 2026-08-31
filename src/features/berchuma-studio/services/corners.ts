import type { CornerBlock } from "./layout";
import type { ResolvedDesign } from "./resolve";
import type { Part } from "../types/parts";
import type { DesignSpec } from "../types/spec";

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
 *   - a bottom and a top, both `d × d` minus the panels either side
 *   - two gables, on the two *closed* faces, against the walls
 *   - a back in each of the two wall corners
 *
 * A blind corner adds a filler panel across part of one open face — that is
 * what makes it blind, and what makes it cheap. A diagonal replaces the two
 * open faces with one panel across the 45°, which is longer than either.
 */

/** How far a blind corner's face is closed off, as a share of the opening. */
const BLIND_FILLER_SHARE = 0.45;

export function cornerParts(
  spec: DesignSpec,
  resolved: ResolvedDesign,
): Part[] {
  const parts: Part[] = [];

  for (const corner of resolved.layout.corners) {
    parts.push(...partsForCorner(spec, corner));
  }

  return parts;
}

function partsForCorner(spec: DesignSpec, corner: CornerBlock): Part[] {
  const board = spec.carcass.board;
  const backBoard = spec.carcass.backBoard;
  const band = spec.carcass.edgeBand;
  const t = board.thickness;

  const size = corner.size;
  const height = corner.height;

  // The carcass sits on the plinth like every other base unit, so its panels
  // are shorter than the corner's overall height by it.
  const plinth = spec.carcass.plinthHeight;
  const carcassHeight = Math.max(0, height - plinth);

  // Inside the two gables.
  const inner = Math.max(0, size - 2 * t);

  const at = (x: number, y: number, z: number) => ({
    x: corner.x + x,
    y: y + plinth,
    z: corner.z + z,
  });

  const parts: Part[] = [
    {
      id: `${corner.id}/gable-a`,
      role: "gable",
      label: `${labelFor(corner)} gable`,
      board,
      // Along the grain: a gable's length runs vertically.
      length: carcassHeight,
      width: size,
      quantity: 2,
      edges: { front: true, back: false, top: false, bottom: false },
      edgeBand: band,
      size: { x: t, y: carcassHeight, z: size },
      axis: "x",
      placements: [
        // One against each wall, on the two closed faces.
        at(0, 0, 0),
        at(size - t, 0, 0),
      ],
    },
    {
      id: `${corner.id}/bottom`,
      role: "shelf",
      label: `${labelFor(corner)} bottom`,
      board,
      length: inner,
      width: size,
      quantity: 2,
      edges: { front: true, back: false, top: false, bottom: false },
      edgeBand: band,
      size: { x: inner, y: t, z: size },
      axis: "y",
      placements: [at(t, 0, 0), at(t, carcassHeight - t, 0)],
    },
    {
      id: `${corner.id}/back`,
      role: "back",
      label: `${labelFor(corner)} back`,
      board: backBoard,
      length: carcassHeight,
      width: size,
      // Two backs: a corner has two walls behind it, not one.
      quantity: 2,
      edges: { front: false, back: false, top: false, bottom: false },
      edgeBand: band,
      size: { x: size, y: carcassHeight, z: backBoard.thickness },
      axis: "z",
      placements: [at(0, 0, 0), at(0, 0, size - backBoard.thickness)],
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
      board,
      length: carcassHeight,
      width: filler,
      quantity: 1,
      edges: { front: true, back: true, top: true, bottom: true },
      edgeBand: band,
      size: { x: filler, y: carcassHeight, z: t },
      axis: "z",
      placements: [at(t, 0, 0)],
    });
  }

  if (corner.kind === "diagonal") {
    // One panel across the 45° face. Longer than either side by √2, which is
    // the reason a diagonal corner costs more board than it looks like it
    // should — and the reason both runs must be the same depth for it.
    const face = Math.round(inner * Math.SQRT2);
    parts.push({
      id: `${corner.id}/diagonal-face`,
      role: "door",
      label: `${labelFor(corner)} diagonal door`,
      board,
      length: carcassHeight,
      width: face,
      quantity: 1,
      edges: { front: true, back: true, top: true, bottom: true },
      edgeBand: band,
      size: { x: face, y: carcassHeight, z: t },
      axis: "z",
      placements: [at(t, 0, t)],
    });
  }

  if (corner.kind === "l_corner") {
    // An L-shaped corner is fronted on both faces, so it gets a door on each.
    // This is what makes it the dearest and the most usable of the four.
    const leaf = Math.max(0, inner - spec.carcass.doorGap);
    parts.push({
      id: `${corner.id}/door`,
      role: "door",
      label: `${labelFor(corner)} door`,
      board,
      length: carcassHeight - spec.carcass.doorGap,
      width: leaf,
      quantity: 2,
      edges: { front: true, back: true, top: true, bottom: true },
      edgeBand: band,
      size: { x: leaf, y: carcassHeight - spec.carcass.doorGap, z: t },
      axis: "z",
      placements: [at(t, 0, 0), at(0, 0, t)],
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
): { id: string; label: string; quantity: number; unit: string }[] {
  const lines: { id: string; label: string; quantity: number; unit: string }[] =
    [];

  for (const corner of resolved.layout.corners) {
    if (corner.kind === "l_corner") {
      lines.push({
        id: `${corner.id}/hinge`,
        // 165° for a corner: an ordinary 110° hinge will not let the door
        // clear the return, and the door fouls the adjacent run.
        label: "165° corner hinge",
        quantity: 4,
        unit: "pcs",
      });
    }

    if (corner.kind === "diagonal") {
      lines.push({
        id: `${corner.id}/hinge`,
        label: "110° hinge",
        quantity: 2,
        unit: "pcs",
      });
      lines.push({
        id: `${corner.id}/carousel`,
        label: "Corner carousel",
        quantity: 1,
        unit: "set",
      });
    }

    if (corner.kind === "blind") {
      lines.push({
        id: `${corner.id}/pullout`,
        label: "Blind corner pull-out",
        quantity: 1,
        unit: "set",
      });
    }
  }

  return lines;
}
