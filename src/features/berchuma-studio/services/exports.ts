import { buildCutList, sheetCountsOf, type CutList } from "./cutlist";
import { calculateCost } from "./costing";
import { buildParts } from "./geometry";
import { buildXlsx, type Sheet } from "./xlsx";
import type { CostBreakdown, MarketRate } from "../types/cost";
import { allBays, type DesignSpec } from "../types/spec";

/**
 * The documents a workshop actually receives.
 *
 * This is where a Berchuma design stops being a picture. The cut list, the
 * hardware schedule and the costed summary are what a joinery works from, and
 * they are derived — here, now — from the same spec that drew the model. There
 * is no export pipeline holding its own copy of anything.
 *
 * Every number in these files is rounded exactly once, at the point it is
 * written. Rounding earlier and summing later is how a spreadsheet ends up
 * with a total that disagrees with its own column.
 */

export type ExportInput = {
  spec: DesignSpec;
  /** Live supplier rates, when the caller has them. */
  rates?: MarketRate[];
  /** Who it is for, printed on the summary. */
  preparedFor?: string | null;
  /** The design's public URL, so a paper copy leads back to the live one. */
  url?: string | null;
};

export type ExportBundle = {
  cutList: CutList;
  cost: CostBreakdown;
  workbook: Uint8Array;
  /** A filename stem: no extension, safe on Windows and in a URL. */
  stem: string;
};

export function buildExport(input: ExportInput): ExportBundle {
  const parts = buildParts(input.spec);
  const cutList = buildCutList(input.spec, parts);

  // Priced from the layout, not from an allowance. The order matters: nest
  // first, then cost, so the sheets on the invoice are the sheets on the
  // diagram.
  const cost = calculateCost(input.spec, parts, {
    rates: input.rates ?? [],
    sheetCounts: sheetCountsOf(cutList),
  });

  const workbook = buildXlsx([
    cutSheet(cutList, input.spec),
    layoutSheet(cutList),
    hardwareSheet(parts),
    summarySheet(input, cutList, cost),
  ]);

  return { cutList, cost, workbook, stem: filenameStem(input.spec.title) };
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

/**
 * The cutting list.
 *
 * Ordered by board and then largest first, because that is the order a cutter
 * works in: one trip to the rack per board, and the big panels off the sheet
 * before the offcuts get committed to small ones.
 */
function cutSheet(cutList: CutList, spec: DesignSpec): Sheet {
  const rows: (string | number | null)[][] = [
    [
      "#",
      "Part",
      "Board",
      "Length (mm)",
      "Width (mm)",
      "Thickness",
      "Qty",
      "Edge banding",
      "Band",
      "Grain",
      "Area (m²)",
    ],
  ];

  for (const board of cutList.byBoard) {
    // A blank line and a heading per board. A shop prints this and cuts it
    // into strips; an undivided list of forty rows gets cut in the wrong place.
    rows.push([]);
    rows.push([
      `${board.boardLabel} — ${board.pieces} pieces, ${board.area} m², about ${board.sheets} sheets`,
    ]);

    for (const row of board.rows) {
      rows.push([
        row.index,
        row.label,
        row.boardLabel,
        row.length,
        row.width,
        row.thickness,
        row.quantity,
        row.banding,
        // Naming the banding product on a row that gets no banding is how a
        // shop ends up edging a back panel nobody will ever see.
        row.banding === "—" ? null : row.bandLabel,
        row.grainLocked ? "Do not rotate" : "Any",
        row.area,
      ]);
    }
  }

  rows.push([]);
  rows.push([
    "Total",
    `${cutList.totals.pieces} pieces`,
    null,
    null,
    null,
    null,
    cutList.totals.pieces,
    `${cutList.totals.bandMetres} m of banding`,
    null,
    null,
    cutList.totals.area,
  ]);

  rows.push([]);
  rows.push([`Sheet size: ${spec.carcass.board.sheet.length} × ${spec.carcass.board.sheet.width} mm`]);
  for (const note of cutList.notes) rows.push([note]);

  return {
    name: "Cut list",
    rows,
    widths: [5, 34, 26, 13, 13, 11, 6, 22, 22, 14, 11],
  };
}

/**
 * Where every piece is cut from, as numbers.
 *
 * The diagram is the thing a cutter reads, but a spreadsheet row survives a
 * phone call: "sheet 3, 812 from the left, 0 up" is something one person can
 * say to another. Both come from the same layout, so they cannot disagree.
 *
 * Positions are measured from the bottom-left corner of the sheet, which is
 * where a tape measure starts.
 */
function layoutSheet(cutList: CutList): Sheet {
  const rows: (string | number | null)[][] = [
    [
      "Board",
      "Sheet",
      "#",
      "Part",
      "X (mm)",
      "Y (mm)",
      "Width (mm)",
      "Height (mm)",
      "Turned",
    ],
  ];

  for (const board of cutList.byBoard) {
    const nesting = board.nesting;
    rows.push([]);
    rows.push([
      `${nesting.boardLabel} — ${nesting.sheets.length} sheets of ${nesting.sheet.length} × ${nesting.sheet.width} mm, ${Math.round(nesting.offcut * 100)}% offcut`,
    ]);

    for (const sheet of nesting.sheets) {
      for (const piece of sheet.placements) {
        rows.push([
          nesting.boardLabel,
          sheet.number,
          piece.index,
          piece.label,
          Math.round(piece.x),
          Math.round(piece.y),
          Math.round(piece.width),
          Math.round(piece.height),
          piece.rotated ? "yes" : "",
        ]);
      }
    }

    if (nesting.unplaced.length > 0) {
      rows.push([]);
      rows.push(["Does not fit a sheet"]);
      for (const piece of nesting.unplaced) {
        rows.push([null, null, piece.index, piece.label, null, null, null, null, piece.reason]);
      }
    }

    rows.push([]);
    rows.push([
      `Positions are from the bottom-left corner. Allow ${nesting.kerf} mm for the blade between pieces.`,
    ]);
  }

  return {
    name: "Sheet layout",
    rows,
    widths: [26, 7, 5, 34, 10, 10, 12, 12, 30],
  };
}

function hardwareSheet(parts: ReturnType<typeof buildParts>): Sheet {
  const rows: (string | number | null)[][] = [
    ["Item", "Quantity", "Unit", "What it is for"],
  ];

  for (const line of parts.hardware) {
    rows.push([line.hardware.label, line.quantity, line.hardware.unit, line.note]);
  }

  return { name: "Hardware", rows, widths: [40, 11, 9, 34] };
}

/**
 * The summary, and the honesty page.
 *
 * Every rate that came from a catalogue constant rather than a supplier
 * listing is marked. A workshop reading this is entitled to know which lines
 * were priced and which were assumed, and a spreadsheet that hides it is worse
 * than one that never claimed to know.
 */
function summarySheet(
  input: ExportInput,
  cutList: CutList,
  cost: CostBreakdown,
): Sheet {
  const rows: (string | number | null)[][] = [
    ["Berchuma Studio — cut list and costing", null, null, null],
    [],
    ["Design", input.spec.title],
    ["Type", input.spec.kind.replace(/_/g, " ")],
    [
      "Size (mm)",
      `${input.spec.envelope.width} × ${input.spec.envelope.height} × ${input.spec.envelope.depth}`,
    ],
    ["Cabinets", input.spec.cabinets.length],
    ["Bays", allBays(input.spec).length],
    ["Finish", `${input.spec.finish.colour}, ${input.spec.finish.sheen}`],
  ];

  if (input.preparedFor) rows.push(["Prepared for", input.preparedFor]);
  if (input.url) rows.push(["Live design", input.url]);

  rows.push([]);
  rows.push(["Panels", cutList.totals.pieces]);
  rows.push(["Board area (m²)", cutList.totals.area]);
  rows.push(["Edge banding (m)", cutList.totals.bandMetres]);
  rows.push(["Shop days", cost.productionDays]);
  for (const board of cutList.byBoard) {
    rows.push([
      `${board.boardLabel} — sheets`,
      board.sheets,
      null,
      null,
      null,
      `${Math.round(board.nesting.offcut * 100)}% offcut, from the layout`,
    ]);
  }

  rows.push([]);
  rows.push(["Cost line", "Quantity", "Unit", `Rate (${cost.currency})`, `Amount (${cost.currency})`, "Rate from"]);
  for (const line of cost.lines) {
    rows.push([
      line.label,
      line.quantity,
      line.unit,
      line.rate,
      line.amount,
      line.source === "listing" ? "Supplier listing" : "Catalogue estimate",
    ]);
  }

  rows.push([]);
  rows.push(["Cost to make", null, null, null, cost.productionCost]);
  rows.push([`Margin at ${cost.margin.percent}%`, null, null, null, cost.margin.amount]);
  rows.push(["Price", null, null, null, cost.price]);
  rows.push([
    "Priced from live listings",
    null,
    null,
    null,
    `${Math.round(cost.confidence)}%`,
  ]);

  rows.push([]);
  rows.push(["Assumptions"]);
  for (const line of [...input.spec.meta.assumptions, ...cost.assumptions]) {
    rows.push([line]);
  }

  if (input.spec.meta.corrections.length > 0) {
    rows.push([]);
    rows.push(["Changed to make it buildable"]);
    for (const line of input.spec.meta.corrections) rows.push([line]);
  }

  rows.push([]);
  rows.push([
    "This is an estimate produced from a design, not a quotation. Confirm materials and prices with your supplier.",
  ]);

  return { name: "Summary", rows, widths: [38, 13, 10, 15, 16, 20] };
}

// ---------------------------------------------------------------------------

/**
 * A filename that survives being downloaded.
 *
 * Windows refuses \ / : * ? " < > | and trailing dots, and a name with a comma
 * in it breaks the `filename=` parameter of a Content-Disposition header
 * unless it is quoted — so it is reduced to letters, digits and hyphens and
 * the question does not arise.
 */
export function filenameStem(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "berchuma-design";
}
