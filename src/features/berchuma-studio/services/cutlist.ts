import { nestBoard, type BoardNesting, type NestOptions } from "./nesting";
import type { Part, PartsBreakdown } from "../types/parts";
import type { DesignSpec } from "../types/spec";

/**
 * The paper that goes to the saw.
 *
 * A cut list is not a summary of the design — it is an instruction to a
 * specific person standing at a specific machine, and it fails in specific
 * ways. Two parts of the same size in different materials must not merge. A
 * grain-matched part must not be rotated to save board. The banded edges have
 * to be marked, because banding the wrong edge of a shelf is a part remade.
 *
 * So this groups by *every* attribute that would make two pieces different on
 * the shop floor, sorts largest first — which is both how a cutter works and
 * what a nesting algorithm wants — and states the banding per edge in words.
 */

export type CutListRow = {
  /** Sequence number on the printed sheet. */
  index: number;
  label: string;
  boardId: string;
  boardLabel: string;
  /** Along the grain where grain matters. Millimetres. */
  length: number;
  width: number;
  thickness: number;
  quantity: number;
  /** "Front" / "Front + both ends" / "—" */
  banding: string;
  bandLabel: string;
  /** True when the part may not be rotated during nesting. */
  grainLocked: boolean;
  /** Square metres for this row, all pieces. */
  area: number;
};

export type CutList = {
  title: string;
  rows: CutListRow[];
  /** One block per board type, because that is one trip to the rack. */
  byBoard: {
    boardId: string;
    boardLabel: string;
    rows: CutListRow[];
    pieces: number;
    area: number;
    /** Sheets the layout below actually needs. Not an estimate. */
    sheets: number;
    /** Where every piece sits, and what is left over. */
    nesting: BoardNesting;
  }[];
  hardware: { label: string; quantity: number; unit: string; note: string }[];
  totals: { pieces: number; area: number; bandMetres: number };
  notes: string[];
};

export function buildCutList(
  spec: DesignSpec,
  breakdown: PartsBreakdown,
  // `wastePercent` is gone. It was the allowance that stood in for a layout,
  // and there is a layout now — keeping it would leave a knob that changes a
  // number nothing reads.
  options: { nesting?: NestOptions } = {},
): CutList {

  // Group by everything that makes two pieces genuinely different. Size alone
  // is not enough: a 600×500 shelf in walnut and one in white are two rows.
  const groups = new Map<string, { part: Part; quantity: number }>();

  for (const part of breakdown.parts) {
    const key = [
      part.board.id,
      part.length,
      part.width,
      part.edgeBand.id,
      edgeKey(part),
      part.role,
    ].join("|");

    const existing = groups.get(key);
    if (existing) existing.quantity += part.quantity;
    else groups.set(key, { part, quantity: part.quantity });
  }

  const rows: CutListRow[] = [...groups.values()]
    // Largest first: it is the order a cutter works in, and the order a
    // first-fit-decreasing nester needs.
    .sort((a, b) => b.part.length * b.part.width - a.part.length * a.part.width)
    .map((entry) => ({
      // Filled in below, once the rows are in the order they are read in.
      index: 0,
      label: entry.part.label,
      boardId: entry.part.board.id,
      boardLabel: entry.part.board.label,
      length: Math.round(entry.part.length),
      width: Math.round(entry.part.width),
      thickness: entry.part.board.thickness,
      quantity: entry.quantity,
      banding: describeBanding(entry.part),
      bandLabel: entry.part.edgeBand.label,
      grainLocked: entry.part.board.grain !== "none",
      area: round(
        (entry.part.length * entry.part.width * entry.quantity) / 1_000_000,
        3,
      ),
    }));

  // One block per board, because collecting material is one trip to the rack
  // and a list that interleaves three boards makes four.
  const boardIds = [...new Set(rows.map((row) => row.boardId))];

  // Numbered after grouping, not before.
  //
  // Numbering by size across the whole design and then printing the rows
  // grouped by board gives a sheet that runs 1, 2, 10, 3, 4 — and a cutter
  // holding it reasonably concludes that something is missing. The number is
  // the row's position on the page somebody is reading, so it is assigned once
  // that page exists.
  {
    let sequence = 0;
    for (const boardId of boardIds) {
      for (const row of rows.filter((entry) => entry.boardId === boardId)) {
        sequence += 1;
        row.index = sequence;
      }
    }
  }

  // And the flat list follows the same order, so a reference to "part 7" means
  // the same thing on the screen, in the spreadsheet and in a later nesting.
  rows.sort((a, b) => a.index - b.index);
  const byBoard = boardIds.map((boardId) => {
    const boardRows = rows.filter((row) => row.boardId === boardId);
    const area = boardRows.reduce((total, row) => total + row.area, 0);
    const board =
      spec.carcass.board.id === boardId
        ? spec.carcass.board
        : spec.carcass.backBoard;

    // The sheet count is now a consequence of laying the parts out, not an
    // assumption in front of it. It used to be area ÷ sheet area with a flat
    // 15% added for offcut — a number nobody could buy against, because it
    // ignored that a 2300 mm gable and a 776 mm shelf do not share a strip.
    const nesting = nestBoard(board, boardRows, options.nesting);

    return {
      boardId,
      boardLabel: boardRows[0]?.boardLabel ?? boardId,
      rows: boardRows,
      pieces: boardRows.reduce((total, row) => total + row.quantity, 0),
      area: round(area, 3),
      sheets: nesting.sheets.length,
      nesting,
    };
  });

  const bandMetres = Object.values(breakdown.totals.bandByEdge).reduce(
    (total, metres) => total + metres,
    0,
  );

  const notes = [
    `All dimensions in millimetres. Length runs with the grain where the board has one.`,
    `Sheet counts come from the layout on the following pages, not from an offcut allowance.`,
  ];

  if (rows.some((row) => row.grainLocked)) {
    notes.push(
      "Grain-matched parts are marked and must not be rotated when nesting.",
    );
  }
  if (spec.meta.corrections.length > 0) {
    notes.push(...spec.meta.corrections);
  }

  return {
    title: spec.title,
    rows,
    byBoard,
    hardware: breakdown.hardware.map((line) => ({
      label: line.hardware.label,
      quantity: line.quantity,
      unit: line.hardware.unit,
      note: line.note,
    })),
    totals: {
      pieces: rows.reduce((total, row) => total + row.quantity, 0),
      area: round(
        rows.reduce((total, row) => total + row.area, 0),
        3,
      ),
      bandMetres: round(bandMetres, 2),
    },
    notes,
  };
}

/**
 * Which edges are banded, written the way a shop says it.
 *
 * "L1" and "W2" mean nothing to the person at the bander. "Front + both ends"
 * does.
 */
function describeBanding(part: Part): string {
  const { front, back, top, bottom } = part.edges;
  const all = front && back && top && bottom;
  if (all) return "All four edges";

  const long: string[] = [];
  if (front) long.push("front");
  if (back) long.push("back");

  const ends = [top, bottom].filter(Boolean).length;

  const pieces: string[] = [];
  if (long.length > 0) pieces.push(long.join(" + "));
  if (ends === 2) pieces.push("both ends");
  else if (ends === 1) pieces.push("one end");

  if (pieces.length === 0) return "—";
  return capitalise(pieces.join(" + "));
}

function edgeKey(part: Part): string {
  return `${Number(part.edges.front)}${Number(part.edges.back)}${Number(part.edges.top)}${Number(part.edges.bottom)}`;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Sheets per board id, as the nesting worked them out.
 *
 * Lives here rather than beside the spreadsheet writer because the studio's
 * cost panel needs it on every keystroke, and importing it from `exports.ts`
 * pulled the whole .xlsx writer into the browser bundle for a three-line
 * function.
 */
export function sheetCountsOf(cutList: CutList): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const board of cutList.byBoard) counts[board.boardId] = board.sheets;
  return counts;
}
