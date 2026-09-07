import { round } from "./units";

/**
 * Tiling.
 *
 * Paint, plaster and screed live elsewhere — paint in the takeoff engine's
 * `paintQuantity`, the two cement-sand ones in `mixes.ts` — because they were
 * already written and correct. Tiles were not, so they are here.
 */

export type TileResult = {
  area: number;
  tileArea: number;
  tiles: number;
  tilesWithWaste: number;
  boxes: number;
  spare: number;
  formula: string[];
  warnings: string[];
};

/**
 * Tiles for an area.
 *
 * Two things are rounded up and both matter. Tiles, because half a tile is
 * still a tile off the pallet; and boxes, because that is the unit of sale.
 * The leftover is reported rather than hidden — it is the reader's attic stock
 * for future breakages, and knowing it is 23 tiles rather than 2 changes
 * whether they buy another box.
 */
export function tileQuantity(input: {
  area: number;
  tileLength: number;
  tileWidth: number;
  wastePercent: number;
  perBox: number;
}): TileResult {
  const warnings: string[] = [];
  const tileArea = input.tileLength * input.tileWidth;

  if (tileArea <= 0 || input.area <= 0) {
    return {
      area: round(input.area, 3),
      tileArea: 0,
      tiles: 0,
      tilesWithWaste: 0,
      boxes: 0,
      spare: 0,
      formula: ["Check the room and tile sizes — one of them is zero."],
      warnings,
    };
  }

  const tiles = Math.ceil(input.area / tileArea);
  const tilesWithWaste = Math.ceil(tiles * (1 + Math.max(0, input.wastePercent) / 100));
  const perBox = Math.max(1, Math.floor(input.perBox));
  const boxes = Math.ceil(tilesWithWaste / perBox);
  const spare = boxes * perBox - tiles;

  if (input.wastePercent < 5) {
    warnings.push(
      "Under 5% waste is optimistic for anything but a plain square room. Diagonal or patterned laying needs 10–15%.",
    );
  }

  return {
    area: round(input.area, 3),
    tileArea: round(tileArea, 4),
    tiles,
    tilesWithWaste,
    boxes,
    spare,
    formula: [
      `Tile area = ${round(tileArea, 4).toFixed(4)} m² each`,
      `${round(input.area, 3).toFixed(3)} m² ÷ ${round(tileArea, 4).toFixed(4)} m² = ${tiles} tiles`,
      `+ ${input.wastePercent}% cutting waste = ${tilesWithWaste} tiles`,
      `⌈${tilesWithWaste} ÷ ${perBox} per box⌉ = ${boxes} boxes (${boxes * perBox} tiles)`,
      `Leaves ${spare} spare over the ${tiles} the floor needs.`,
    ],
    warnings,
  };
}

/**
 * Net wall area: the walls, less the holes in them.
 *
 * Shared by paint, plaster and wall tiling. Openings are subtracted once, and
 * the guard against a negative result is deliberate — somebody typing a 20 m²
 * window into a 15 m² wall should get zero and a warning, not a negative litre
 * count that quietly cancels out another room.
 */
export function netWallArea(input: {
  length: number;
  height: number;
  walls: number;
  openingArea: number;
}): { gross: number; net: number; formula: string[]; warnings: string[] } {
  const gross = input.length * input.height * input.walls;
  const net = gross - input.openingArea;
  const warnings: string[] = [];

  if (net <= 0 && gross > 0) {
    warnings.push("The openings are bigger than the walls. Check both figures.");
  }

  return {
    gross: round(gross, 3),
    net: round(Math.max(0, net), 3),
    formula: [
      `${input.length} × ${input.height} × ${input.walls} walls = ${round(gross, 3).toFixed(3)} m² gross`,
      `− ${round(input.openingArea, 3).toFixed(3)} m² of openings = ${round(Math.max(0, net), 3).toFixed(3)} m² net`,
    ],
    warnings,
  };
}
