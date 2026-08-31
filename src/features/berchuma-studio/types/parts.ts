import type { Board, EdgeBand, Hardware } from "./spec";

/**
 * What a design is once it has been taken apart.
 *
 * A `Part` is a piece of board a saw will cut. A `HardwareLine` is a thing
 * bought by the box. Between them they are the entire physical content of a
 * design, and every number the studio quotes is a sum over these two lists.
 *
 * The 3D viewer reads the same list. That is deliberate: if the model on
 * screen were built from anything other than the parts being priced, the two
 * would drift and nobody would notice until a customer had paid.
 */

export type PartRole =
  | "gable"
  | "divider"
  | "top"
  | "bottom"
  | "shelf"
  | "back"
  | "door"
  | "drawer_front"
  | "drawer_side"
  | "drawer_back"
  | "drawer_base"
  | "plinth"
  | "leg"
  | "worktop"
  | "backsplash"
  | "rail";

/** Which edges of a part are visible and therefore banded. */
export type BandedEdges = {
  front: boolean;
  back: boolean;
  top: boolean;
  bottom: boolean;
};

/**
 * A point in the unit's own frame, in millimetres.
 *
 * The origin is the bottom-left-front corner of the envelope: x runs right,
 * y runs up from the floor, z runs *backwards* from the front face. A door
 * therefore sits at a negative z, because it stands proud of the carcass.
 */
export type Vec3 = { x: number; y: number; z: number };

export type Part = {
  id: string;
  role: PartRole;
  label: string;
  /** The cabinet this part came out of. Set for every part. */
  cabinetId?: string;
  /** The bay this part belongs to, when it belongs to one. */
  bayId?: string;
  board: Board;
  /** Cut length in mm — the dimension along the grain where grain matters. */
  length: number;
  /** Cut width in mm. */
  width: number;
  quantity: number;
  edges: BandedEdges;
  edgeBand: EdgeBand;
  /**
   * Where each instance sits — one entry per unit of `quantity`.
   *
   * A list rather than a single point, and that is the whole reason this
   * changed. "Five shelves" is one row on a cut list and five objects in a
   * room; a part carrying one position could describe the row but not the
   * room, so the viewer would have drawn five shelves stacked inside each
   * other. `placements.length === quantity` is checked.
   */
  placements: Vec3[];
  /**
   * How far the whole part is turned about y, in degrees, from the run it is on.
   *
   * Zero for everything on a straight run, which is every design that existed
   * before layouts did. On an L or a U the second and third runs are turned a
   * quarter turn, and their cabinets' panels turn with them.
   *
   * On the part rather than baked into `box`, because the cut list must not see
   * it: a 600 × 720 gable is the same piece of board whichever wall it ends up
   * against, and rotating its dimensions would put a second, phantom panel size
   * on the cutting list.
   */
  rotationY?: number;
  /**
   * The part's bounding box in the unit's frame, in mm.
   *
   * Stated rather than derived, and that is a deliberate reversal. `length` is
   * the dimension along the grain — a manufacturing idea, not an orientation —
   * so a gable's length runs vertically while a drawer side's runs front to
   * back. Working the box out afterwards means a table of exceptions keyed on
   * role, and a table of exceptions is a list of the bugs you have found so
   * far. Each part says its own size where the code that made it still knows.
   *
   * The three components are always a permutation of `length`, `width` and the
   * board thickness. That is checked.
   */
  size: Vec3;
  /** Which axis the part's thickness runs along, for the viewer. */
  axis: "x" | "y" | "z";
};

export type HardwareLine = {
  hardware: Hardware;
  quantity: number;
  /** What it is for, so a cut list reads as instructions rather than a total. */
  note: string;
};

export type PartsBreakdown = {
  parts: Part[];
  hardware: HardwareLine[];
  /** Totals the cost engine and the cut list both want. */
  totals: {
    partCount: number;
    /** Square metres of board, by board id. */
    areaByBoard: Record<string, number>;
    /** Linear metres of edge band, by band id. */
    bandByEdge: Record<string, number>;
  };
};
