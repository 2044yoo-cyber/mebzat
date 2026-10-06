import { BOARDS, findBoard, findEdgeBand } from "../types/catalogue";
import type { Board, Cabinet, DesignSpec, EdgeBand } from "../types/spec";

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
 * Neutral SketchUp-like modelling colour for the Studio viewport.
 * The cabinet stays clean white, the canvas stays light grey, and the small
 * display filter lifts Three.js' filmic grey cast without flattening all depth.
 * Material selections remain stored in the spec for manufacturing and pricing.
 */
export function boardColour(_board: Board, _spec: DesignSpec): string {
  if (typeof document !== "undefined") {
    requestAnimationFrame(() => {
      document.querySelectorAll<HTMLCanvasElement>("canvas").forEach((canvas) => {
        canvas.style.backgroundColor = "#eeeeee";
        canvas.style.filter = "brightness(1.18) contrast(0.94)";
      });
    });
  }
  return "#ffffff";
}

/** How the 3D view draws boards: the white working model, or the real decors. */
export type SurfaceView = "model" | "material";

/**
 * A board in its own decor, for the material view. Where a board records no
 * appearance the design's finish is the best statement of what it looks like.
 * The working view's display filter is lifted while this is shown: it brightens
 * white board, and would wash a walnut out to something that is not walnut.
 */
export function materialColour(board: Board, spec: DesignSpec): string {
  if (typeof document !== "undefined") {
    requestAnimationFrame(() => {
      document.querySelectorAll<HTMLCanvasElement>("canvas").forEach((canvas) => {
        canvas.style.backgroundColor = "#eeeeee";
        canvas.style.filter = "none";
      });
    });
  }
  return board.appearance?.hex ?? spec.finish.hex ?? "#d9d4cc";
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

/** The board a cabinet's Zekolo is cut from: its own choice, or the design's plinth board. */
export function zekoloBoardOf(spec: DesignSpec, cabinet: Cabinet): Board {
  const own = cabinet.zekolo?.boardId ? findBoard(cabinet.zekolo.boardId) : undefined;
  return own ?? constructionMaterials(spec).plinth;
}
