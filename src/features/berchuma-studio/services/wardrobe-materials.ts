import { BOARDS, findEdgeBand } from "../types/catalogue";
import type { Board, DesignSpec, EdgeBand } from "../types/spec";

/**
 * The board assigned to each manufactured zone.
 *
 * These fallbacks are deliberate compatibility behaviour. Existing saved
 * designs had one carcass board, so reading one must still produce the same
 * physical material for every zone until its owner chooses a different board.
 * New wardrobes write all four assignments, which lets a body, fronts,
 * interior and plinth be priced, nested and rendered independently.
 */
export type ConstructionMaterials = {
  body: Board;
  fronts: Board;
  interior: Board;
  back: Board;
  plinth: Board;
};

/**
 * Stock boards compatible with the shared 18 mm wardrobe construction.
 *
 * Keeping this beside the construction rules means the material picker cannot
 * offer a finish that the validator will later repair away. New coloured MDF
 * products become selectable automatically once they are added to `BOARDS`.
 */
export function wardrobeStructuralBoards(): Board[] {
  return BOARDS.filter((board) => Math.abs(board.thickness - 18) < 0.1);
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

/**
 * Uses a stocked matching PVC edge for a coloured board when one exists.
 *
 * Edge banding is a physical manufacturing finish, not a viewer tint: an oak
 * door with a white cut-list edge band is an instruction to manufacture the
 * wrong part. The design-level band remains the fallback for materials that
 * do not have a stocked match yet.
 */
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

/**
 * Coloured edge matching is part of the new wardrobe construction system.
 * Other furniture retains its established explicit edge-band selection.
 */
export function edgeBandForConstructionBoard(
  spec: DesignSpec,
  board: Board,
  fallback: EdgeBand,
): EdgeBand {
  return spec.furnitureType === "wardrobe"
    ? edgeBandForBoard(board, fallback)
    : fallback;
}

/** The material colour used by both the 3D and elevation renderers. */
export function boardColour(board: Board, spec: DesignSpec): string {
  return spec.furnitureType === "wardrobe"
    ? board.appearance?.hex ?? spec.finish.hex
    : spec.finish.hex;
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
