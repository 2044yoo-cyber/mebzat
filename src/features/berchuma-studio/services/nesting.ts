import type { Board } from "../types/spec";
import type { CutListRow } from "./cutlist";

/**
 * Where each panel actually comes from.
 *
 * Until now "about 9 sheets" was area divided by sheet area with 15% added for
 * offcut — a guess dressed as a number. Nobody can buy against it and nobody
 * can cut from it. This lays the parts out for real, and the sheet count
 * becomes a consequence of the layout rather than an assumption in front of it.
 *
 * The packing is shelf-based, and that is a manufacturing decision rather than
 * a convenience. A panel saw cuts edge to edge: every cut crosses the whole
 * board, so the only layouts that can actually be cut are the ones that
 * decompose into full-width strips and then full-height cuts within a strip.
 * A tighter nest that a nesting library would find is a nest a panel saw
 * cannot produce, and a CNC router with a nested toolpath is not what an
 * Ethiopian joinery has in the corner. Shelves are guillotine-compatible by
 * construction.
 *
 * Pure, and deterministic: the same cut list nests identically every time, so
 * the diagram on screen is the diagram in the workshop.
 */

/** Saw kerf: the width of material the blade turns into dust. */
export const DEFAULT_KERF = 3.2;

/**
 * Trimmed off each edge of a sheet before anything is laid out.
 *
 * Zero by default. Factory practice is to trim 10 mm off all four edges
 * because the mill edge is neither straight nor square; small shops here cut
 * to the edge and accept it. Since it changes the sheet count, it is the
 * shop's call rather than this file's.
 */
export const DEFAULT_TRIM = 0;

export type Placement = {
  /** Which cut list row this piece came from. */
  index: number;
  label: string;
  /** Millimetres from the sheet's left edge, along the sheet's length. */
  x: number;
  /** Millimetres from the sheet's bottom edge, across the sheet's width. */
  y: number;
  /** Size on the sheet, after any rotation. */
  width: number;
  height: number;
  /** True when the piece was turned 90°, which grain-locked board forbids. */
  rotated: boolean;
};

export type NestedSheet = {
  /** 1-based, per board. "Sheet 3 of 9" is how a shop refers to it. */
  number: number;
  /** Usable area after trimming, in mm. */
  length: number;
  width: number;
  placements: Placement[];
  /** Share of the sheet covered by parts, 0–1. */
  utilisation: number;
};

export type BoardNesting = {
  boardId: string;
  boardLabel: string;
  /** The full sheet as bought, before trim. */
  sheet: { length: number; width: number };
  sheets: NestedSheet[];
  /** Pieces that do not fit a sheet at all, with the reason. */
  unplaced: { index: number; label: string; reason: string }[];
  kerf: number;
  trim: number;
  /** Board actually consumed, in m². */
  areaUsed: number;
  /** Board bought, in m². */
  areaBought: number;
  /** Share of what was bought that no part is cut from, 0–1. */
  offcut: number;
};

export type NestOptions = {
  kerf?: number;
  trim?: number;
};

/**
 * One piece as the packer sees it: a rectangle that may or may not be turnable.
 *
 * Quantities are expanded here — a row of six shelves is six rectangles,
 * because six shelves do not go on one sheet just because they share a line on
 * a list.
 */
type Piece = {
  index: number;
  label: string;
  /** Along the grain where the board has one. */
  length: number;
  width: number;
  rotatable: boolean;
};

/** A full-width strip across the sheet, filled left to right. */
type Shelf = {
  y: number;
  height: number;
  used: number;
};

export function nestBoard(
  board: Board,
  rows: CutListRow[],
  options: NestOptions = {},
): BoardNesting {
  const kerf = options.kerf ?? DEFAULT_KERF;
  const trim = options.trim ?? DEFAULT_TRIM;

  // The usable rectangle. x runs along the sheet's length, y across its width,
  // and the grain — when the board has one — runs along x.
  const usableLength = board.sheet.length - trim * 2;
  const usableWidth = board.sheet.width - trim * 2;
  const rotatable = board.grain === "none";

  const pieces: Piece[] = [];
  for (const row of rows) {
    for (let copy = 0; copy < row.quantity; copy += 1) {
      pieces.push({
        index: row.index,
        label: row.label,
        length: row.length,
        width: row.width,
        rotatable,
      });
    }
  }

  // Tallest first. Shelf packing is only as good as its ordering, and putting
  // the deep pieces down first means the shallow ones fill the strips they
  // leave rather than opening strips of their own.
  pieces.sort((a, b) => {
    const aHeight = shortSide(a, rotatable);
    const bHeight = shortSide(b, rotatable);
    if (bHeight !== aHeight) return bHeight - aHeight;
    return longSide(b, rotatable) - longSide(a, rotatable);
  });

  const sheets: NestedSheet[] = [];
  const shelvesBySheet: Shelf[][] = [];
  const unplaced: BoardNesting["unplaced"] = [];

  for (const piece of pieces) {
    const options = orientations(piece, usableLength, usableWidth);

    if (options.length === 0) {
      unplaced.push({
        index: piece.index,
        label: piece.label,
        reason: piece.rotatable
          ? `${piece.length} × ${piece.width} mm does not fit a ${board.sheet.length} × ${board.sheet.width} mm sheet in either direction`
          : `${piece.length} × ${piece.width} mm does not fit a ${board.sheet.length} × ${board.sheet.width} mm sheet, and the grain forbids turning it`,
      });
      continue;
    }

    if (!place(piece, options, sheets, shelvesBySheet, kerf, usableLength, usableWidth)) {
      // A new sheet, and try again. A piece that fits the sheet at all always
      // fits an empty one, so this cannot loop.
      sheets.push({
        number: sheets.length + 1,
        length: usableLength,
        width: usableWidth,
        placements: [],
        utilisation: 0,
      });
      shelvesBySheet.push([]);
      place(piece, options, sheets, shelvesBySheet, kerf, usableLength, usableWidth);
    }
  }

  const sheetArea = (usableLength * usableWidth) / 1_000_000;
  for (const sheet of sheets) {
    const used = sheet.placements.reduce(
      (total, item) => total + (item.width * item.height) / 1_000_000,
      0,
    );
    sheet.utilisation = sheetArea > 0 ? round(used / sheetArea, 4) : 0;
  }

  const areaUsed = sheets.reduce(
    (total, sheet) =>
      total +
      sheet.placements.reduce(
        (inner, item) => inner + (item.width * item.height) / 1_000_000,
        0,
      ),
    0,
  );
  // Bought by the full sheet, not the trimmed one: the trim is paid for.
  const areaBought =
    (sheets.length * board.sheet.length * board.sheet.width) / 1_000_000;

  return {
    boardId: board.id,
    boardLabel: board.label,
    sheet: { length: board.sheet.length, width: board.sheet.width },
    sheets,
    unplaced,
    kerf,
    trim,
    areaUsed: round(areaUsed, 3),
    areaBought: round(areaBought, 3),
    offcut: areaBought > 0 ? round(1 - areaUsed / areaBought, 4) : 0,
  };
}

// ---------------------------------------------------------------------------

/** How a piece may sit on the sheet, best orientation first. */
function orientations(
  piece: Piece,
  usableLength: number,
  usableWidth: number,
): { width: number; height: number; rotated: boolean }[] {
  const asCut = { width: piece.length, height: piece.width, rotated: false };
  const turned = { width: piece.width, height: piece.length, rotated: true };

  const fits = (option: { width: number; height: number }) =>
    option.width <= usableLength && option.height <= usableWidth;

  if (!piece.rotatable) return fits(asCut) ? [asCut] : [];

  const usable = [asCut, turned].filter(fits);
  // Shallower first: a piece laid flat opens a shorter strip, and a shorter
  // strip wastes less of the sheet behind it.
  return usable.sort((a, b) => a.height - b.height);
}

/** Tries every sheet, then every shelf, then a new shelf. */
function place(
  piece: Piece,
  options: { width: number; height: number; rotated: boolean }[],
  sheets: NestedSheet[],
  shelvesBySheet: Shelf[][],
  kerf: number,
  usableLength: number,
  usableWidth: number,
): boolean {
  for (const [sheetIndex, sheet] of sheets.entries()) {
    const shelves = shelvesBySheet[sheetIndex];
    if (!shelves) continue;

    // An existing strip first: filling one costs no new material, opening one
    // costs its full height across the sheet.
    for (const option of options) {
      for (const shelf of shelves) {
        if (option.height > shelf.height) continue;
        const x = shelf.used === 0 ? 0 : shelf.used + kerf;
        if (x + option.width > usableLength) continue;

        sheet.placements.push({
          index: piece.index,
          label: piece.label,
          x,
          y: shelf.y,
          width: option.width,
          height: option.height,
          rotated: option.rotated,
        });
        shelf.used = x + option.width;
        return true;
      }
    }

    // A new strip above the last one.
    const top = shelves.reduce(
      (highest, shelf) => Math.max(highest, shelf.y + shelf.height),
      0,
    );
    for (const option of options) {
      const y = top === 0 ? 0 : top + kerf;
      if (y + option.height > usableWidth) continue;
      if (option.width > usableLength) continue;

      shelves.push({ y, height: option.height, used: option.width });
      sheet.placements.push({
        index: piece.index,
        label: piece.label,
        x: 0,
        y,
        width: option.width,
        height: option.height,
        rotated: option.rotated,
      });
      return true;
    }
  }

  return false;
}

function shortSide(piece: Piece, rotatable: boolean): number {
  return rotatable ? Math.min(piece.length, piece.width) : piece.width;
}

function longSide(piece: Piece, rotatable: boolean): number {
  return rotatable ? Math.max(piece.length, piece.width) : piece.length;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
