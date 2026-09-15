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

/**
 * Stock boards a carcass can be built from, for furniture that is not a
 * wardrobe.
 *
 * ## Why this is not `wardrobeStructuralBoards`
 *
 * It was. Every board picker in the studio called that function, including the
 * one on a TV unit, and it filters to exactly 18 mm — so the only carcass
 * material a TV unit could ever be given was 18 mm, and a board added to the
 * catalogue at any other thickness was invisible to the whole application. The
 * name said what it was for and the code was used for something else.
 *
 * Wardrobes genuinely are restricted: `normaliseWardrobeBoards` resets a
 * carcass that is not 18 mm, so offering anything else there would be offering
 * a choice the validator undoes a moment later. Nothing else is restricted,
 * and a 15 mm foam board shopfitting cabinet is an ordinary thing to want.
 *
 * ## What is excluded, and why it is measurements rather than a list
 *
 * Back panels, by thickness: a 4 mm HDF panel cannot hold a screw in its edge.
 *
 * Worktops, by the shape of the stock. They are sold as strips — 3000 x 650,
 * 3000 x 640 — because a worktop is a strip, and a carcass is cut from a full
 * sheet. Thickness alone does not separate them: a 20 mm quartz worktop sits
 * inside any sensible thickness range for a carcass and is still a worktop,
 * which is how it appeared in the first version of this list.
 *
 * Both expressed as measurements rather than a list of ids, so that the next
 * board added to the catalogue is offered or not on its own merits. That is
 * the property that let the old function keep working as products were added,
 * and it is worth keeping.
 */
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
