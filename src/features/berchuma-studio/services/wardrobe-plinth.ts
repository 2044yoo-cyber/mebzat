import type { BandedEdges, Part } from "../types/parts";
import type { Board, EdgeBand } from "../types/spec";
import { splitSpanAtSupports } from "./panel-segmentation";

/** The plinth face sits this far behind the outer door/drawer face. */
export const WARDROBE_PLINTH_VISIBLE_RECESS = 20;

export type WardrobePlinthOptions = {
  width: number;
  depth: number;
  height: number;
  board: Board;
  edgeBand: EdgeBand;
  carcassThickness: number;
  /** Thickness of a proud door/drawer face; zero for an open wardrobe. */
  frontThickness: number;
  /** Divider centre lines, measured from the cabinet's left outer edge. */
  supportJoints?: readonly number[];
};

/**
 * A real, four-sided recessed plinth shared by every wardrobe shape.
 *
 * Long fascias are divided only where a cabinet divider already supports the
 * joint. If an imported legacy design has no such divider, a cross member is
 * generated under the fallback joint as real board geometry, so a long black
 * line is never a visual-only strip or an uncuttable panel.
 */
export function recessedWardrobePlinthParts(
  options: WardrobePlinthOptions,
): Part[] {
  const {
    width,
    depth,
    height,
    board,
    edgeBand,
    carcassThickness: t,
    frontThickness,
    supportJoints = [],
  } = options;
  const noEdges: BandedEdges = {
    front: false,
    back: false,
    top: false,
    bottom: false,
  };
  const safeWidth = Math.max(0, Math.round(width));
  const safeDepth = Math.max(0, Math.round(depth));
  const safeHeight = Math.max(0, Math.round(height));

  // Door boards already project in front of the carcass plane, so convert the
  // visible reference reveal into the plinth's local coordinate. Otherwise an
  // 18 mm door would accidentally make a 38 mm reveal.
  const frontRecess = Math.min(
    Math.max(0, WARDROBE_PLINTH_VISIBLE_RECESS - frontThickness),
    Math.max(0, safeDepth - 2 * t),
  );
  const sideDepth = Math.max(0, safeDepth - frontRecess - t);
  const innerWidth = Math.max(0, safeWidth - 2 * t);
  const innerDepth = Math.max(0, sideDepth - t);

  const frontSpans = splitSpanAtSupports(safeWidth, board, supportJoints);
  const rearSpans = splitSpanAtSupports(
    innerWidth,
    board,
    supportJoints
      .filter((joint) => joint > t && joint < safeWidth - t)
      .map((joint) => joint - t),
  );

  const parts: Part[] = [
    ...frontSpans.map((span, index) => ({
      id: frontSpans.length === 1 ? "wardrobe-plinth-front" : `wardrobe-plinth-front-${index + 1}`,
      role: "plinth" as const,
      label:
        frontSpans.length === 1
          ? "Recessed plinth, front"
          : `Recessed plinth, front section ${index + 1}`,
      board,
      length: span.length,
      width: safeHeight,
      quantity: 1,
      edges: { ...noEdges, top: true },
      edgeBand,
      placements: [{ x: span.offset, y: 0, z: frontRecess }],
      size: { x: span.length, y: safeHeight, z: t },
      axis: "z" as const,
    })),
    {
      id: "wardrobe-plinth-side",
      role: "plinth",
      label: "Recessed plinth, side",
      board,
      length: sideDepth,
      width: safeHeight,
      quantity: 2,
      edges: { ...noEdges, top: true },
      edgeBand,
      placements: [
        { x: 0, y: 0, z: frontRecess + t },
        { x: safeWidth - t, y: 0, z: frontRecess + t },
      ],
      size: { x: t, y: safeHeight, z: sideDepth },
      axis: "x",
    },
    ...rearSpans.map((span, index) => ({
      id: rearSpans.length === 1 ? "wardrobe-plinth-rear" : `wardrobe-plinth-rear-${index + 1}`,
      role: "plinth" as const,
      label:
        rearSpans.length === 1
          ? "Recessed plinth, rear"
          : `Recessed plinth, rear section ${index + 1}`,
      board,
      length: span.length,
      width: safeHeight,
      quantity: 1,
      edges: { ...noEdges, top: true },
      edgeBand,
      placements: [{ x: t + span.offset, y: 0, z: safeDepth - t }],
      size: { x: span.length, y: safeHeight, z: t },
      axis: "z" as const,
    })),
  ];

  // Every actual fascia join is carried through the plinth depth. When the
  // join matches a wardrobe divider it is directly below that divider; for a
  // legacy unsupported span it creates the support the cut construction needs.
  const jointXs = [...new Set([
    ...frontSpans.slice(0, -1).map((span) => span.offset + span.length),
    ...rearSpans
      .slice(0, -1)
      .map((span) => t + span.offset + span.length),
  ])].filter((joint) => joint > 0 && joint < safeWidth);

  if (innerDepth > 0) {
    for (const [index, joint] of jointXs.entries()) {
      parts.push({
        id: `wardrobe-plinth-cross-support-${index + 1}`,
        role: "plinth",
        label: `Recessed plinth, internal support ${index + 1}`,
        board,
        length: innerDepth,
        width: safeHeight,
        quantity: 1,
        edges: { ...noEdges, top: true },
        edgeBand,
        placements: [{ x: joint - t / 2, y: 0, z: frontRecess + t }],
        size: { x: t, y: safeHeight, z: innerDepth },
        axis: "x",
      });
    }
  }

  return parts;
}
