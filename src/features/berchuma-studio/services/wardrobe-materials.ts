import { BOARDS, findEdgeBand } from "../types/catalogue";
import type { Board, DesignSpec, EdgeBand } from "../types/spec";

/** The board assigned to each manufactured zone. */
export type ConstructionMaterials = {
  body: Board;
  fronts: Board;
  interior: Board;
  back: Board;
  plinth: Board;
};

/** Stock boards compatible with the shared 18 mm wardrobe construction. */
export function wardrobeStructuralBoards(): Board[] {
  return BOARDS.filter((board) => Math.abs(board.thickness - 18) < 0.1);
}

/** Stock full-sheet boards usable as a furniture carcass. */
export function carcassBoards(): Board[] {
  return BOARDS.filter(
    (board) =>
      board.thickness >= 12 &&
      board.thickness <= 30 &&
      Math.min(board.sheet.length, board.sheet.width) >= 900,
  );
}

/** Stock boards valid for the wardrobe's required 6 mm rear panel. */
export function wardrobeBackBoards(): Board[] {
  return BOARDS.filter((board) => Math.abs(board.thickness - 6) < 0.1);
}

export function constructionMaterials(spec: DesignSpec): ConstructionMaterials {
  const body = spec.carcass.board;
  return {
    body,
    fronts: spec.carcass.frontBoard ?? body,
    interior: spec.carcass.interiorBoard ?? body,
    back: spec.carcass.backBoard,
    plinth: spec.carcass.plinthBoard ?? body,
  };
}

export function constructionMethods(spec: DesignSpec): ConstructionMethods {
  const carcass = spec.carcass;
  return {
    backFixing: carcass.backFixing ?? "overlay",
    backGrooveDepth: carcass.backGrooveDepth ?? 8,
    drawerBottomFixing: carcass.drawerBottomFixing ?? "under",
    drawerBottomGrooveDepth: carcass.drawerBottomGrooveDepth ?? 6,
  };
}

export type ConstructionMethods = {
  backFixing: "overlay" | "inset";
  backGrooveDepth: number;
  drawerBottomFixing: "under" | "grooved";
  drawerBottomGrooveDepth: number;
};

/** Uses a stocked matching PVC edge for a coloured board when one exists. */
export function edgeBandForBoard(board: Board, fallback: EdgeBand): EdgeBand {
  const colour = board.appearance?.colour.toLowerCase();
  const matchingId =
    colour === "black"
      ? "pvc-2-black"
      : colour === "walnut"
        ? "pvc-2-walnut"
        : colour === "oak"
          ? "pvc-2-oak"
          : colour === "birch"
            ? "pvc-2-birch"
            : colour === "white"
              ? "pvc-1-white"
              : undefined;
  return (matchingId ? findEdgeBand(matchingId) : undefined) ?? fallback;
}

export function edgeBandForConstructionBoard(
  spec: DesignSpec,
  board: Board,
  fallback: EdgeBand,
): EdgeBand {
  return spec.furnitureType === "wardrobe"
    ? edgeBandForBoard(board, fallback)
    : fallback;
}

/**
 * Neutral modelling colour for the Studio viewport.
 * Material selections remain stored in the spec for manufacturing and pricing.
 */
export function boardColour(_board: Board, _spec: DesignSpec): string {
  if (typeof document !== "undefined") {
    requestAnimationFrame(() => {
      document.querySelectorAll<HTMLCanvasElement>("canvas").forEach((canvas) => {
        canvas.style.backgroundColor = "#e5e5e5";
      });
    });
  }
  return "#ffffff";
}

/** The board's own sheen wins; legacy designs retain their recorded finish. */
export function boardSheen(
  board: Board,
  spec: DesignSpec,
): "matt" | "satin" | "gloss" {
  return spec.furnitureType === "wardrobe"
    ? board.appearance?.sheen ?? spec.finish.sheen
    : spec.finish.sheen;
}
