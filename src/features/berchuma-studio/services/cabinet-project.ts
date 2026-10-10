import type { DesignSpec, DesignKind } from "../types/spec";
import { parseSpec } from "../types/spec";
import { startingDesign } from "./starting-designs";
import { buildParts } from "./geometry";
import { buildCutList, type CutListRow } from "./cutlist";
import { nestBoard, type BoardNesting } from "./nesting";
import { findBoard } from "../types/catalogue";
import { buildXlsx, type Cell, type Sheet } from "./xlsx";

/**
 * A collection is saved in the existing design's spec JSON. Every additional
 * cabinet remains an independent DesignSpec, so wardrobe construction rules
 * cannot accidentally get applied to a vanity or kitchen.
 */
export type ProjectItem = { id: string; spec: DesignSpec };

export function projectDesigns(primary: DesignSpec): ProjectItem[] {
  return [
    { id: "primary", spec: primary },
    ...(primary.projectItems ?? []).map(item => ({
      id: item.id, spec: item.spec as DesignSpec,
    })),
  ];
}

export function addProjectDesign(
  primary: DesignSpec, id: string, kind: DesignKind,
): DesignSpec {
  if (!id || id === "primary" || primary.projectItems?.some(item => item.id === id))
    throw new Error("This cabinet already exists in the project.");
  if ((primary.projectItems?.length ?? 0) >= 12)
    throw new Error("A project supports up to 13 independent cabinet designs.");
  const created = startingDesign(kind);
  return {
    ...primary,
    projectItems: [...(primary.projectItems ?? []), { id, spec: created }],
  };
}

/** Duplicate an entire independently editable design without losing its
 * configured doors, fittings, materials or internal partitions.
 */
export function duplicateProjectDesign(
  primary: DesignSpec, sourceId: string, id: string,
): DesignSpec {
  if (!id || id === "primary" || primary.projectItems?.some(item => item.id === id))
    throw new Error("This cabinet already exists in the project.");
  if ((primary.projectItems?.length ?? 0) >= 12)
    throw new Error("A project supports up to 13 independent cabinet designs.");
  const source = projectDesigns(primary).find(item => item.id === sourceId);
  if (!source) throw new Error("The cabinet to duplicate could not be found.");
  // Only the primary object may own the collection. A copied cabinet is a
  // complete standalone design and must never recursively embed its siblings.
  const clone = structuredClone(source.spec);
  const { projectItems: _siblings, ...individual } = clone;
  individual.title = `${individual.title.slice(0, 153)} (copy)`;
  return {
    ...primary,
    projectItems: [...(primary.projectItems ?? []), { id, spec: individual }],
  };
}

export function updateProjectDesign(
  primary: DesignSpec, id: string, next: DesignSpec,
): DesignSpec {
  if (id === "primary") {
    // The parent owns the collection even when its own cabinet is edited.
    return { ...next, projectItems: primary.projectItems };
  }
  if (!primary.projectItems?.some(item => item.id === id))
    throw new Error("This cabinet is not in the project.");
  // Never embed a collection inside another collection.
  const { projectItems: _discard, ...individual } = next;
  return {
    ...primary,
    projectItems: primary.projectItems.map(item =>
      item.id === id ? { id, spec: individual } : item),
  };
}

export function removeProjectDesign(primary: DesignSpec, id: string): DesignSpec {
  if (id === "primary") throw new Error("The project's first design cannot be removed.");
  return {
    ...primary,
    projectItems: primary.projectItems?.filter(item => item.id !== id),
  };
}

/** Fail closed rather than export a cutting diagram with missing, overlapping,
 * or off-sheet parts. Coordinates are in millimetres on the usable sheet.
 */
function assertSafeNesting(nesting: BoardNesting, rows: CutListRow[], boardLabel: string): void {
  if (nesting.unplaced.length) {
    throw new Error(`Some parts do not fit ${boardLabel}: ${nesting.unplaced.map(p => p.label).join(", ")}`);
  }
  const expected = new Map<number, number>();
  rows.forEach(row => expected.set(row.index, (expected.get(row.index) ?? 0) + row.quantity));
  const actual = new Map<number, number>();
  for (const sheet of nesting.sheets) {
    for (const place of sheet.placements) {
      if (place.x < 0 || place.y < 0 ||
          place.x + place.width > nesting.sheet.length - nesting.trim * 2 + 0.001 ||
          place.y + place.height > nesting.sheet.width - nesting.trim * 2 + 0.001) {
        throw new Error(`Cut ${place.label} exceeds the usable ${boardLabel} sheet boundary.`);
      }
      actual.set(place.index, (actual.get(place.index) ?? 0) + 1);
    }
    for (let i = 0; i < sheet.placements.length; i++) {
      const a = sheet.placements[i]!;
      for (let j = i + 1; j < sheet.placements.length; j++) {
        const b = sheet.placements[j]!;
        const separated = a.x + a.width <= b.x || b.x + b.width <= a.x ||
          a.y + a.height <= b.y || b.y + b.height <= a.y;
        if (!separated) throw new Error(`Cutting layout overlaps: ${a.label} and ${b.label} on sheet ${sheet.number}.`);
      }
    }
  }
  for (const [index, quantity] of expected) {
    if ((actual.get(index) ?? 0) !== quantity) {
      const row = rows.find(item => item.index === index);
      throw new Error(`Cutting layout quantity mismatch for ${row?.label ?? index} on ${boardLabel}.`);
    }
  }
  for (const index of actual.keys()) {
    if (!expected.has(index)) throw new Error(`Unexpected part in cutting layout for ${boardLabel}.`);
  }
}

/** Parse every independent design at the export boundary, never trust raw JSON. */
function validProjectDesigns(primary: DesignSpec): ProjectItem[] {
  return projectDesigns(primary).map((item) => {
    const { projectItems: _nested, ...raw } = item.spec;
    const parsed = parseSpec(raw);
    if (!parsed.ok) throw new Error(`Cannot export "${item.spec.title}": ${parsed.error}`);
    return { id: item.id, spec: parsed.spec };
  });
}

export type ProjectProductionSummary = {
  designs: number;
  pieces: number;
  sheets: { board: string; sheets: number; separateSheets: number; pieces: number; area: number }[];
  workbook: Uint8Array;
  layouts: { board: string; sheet: number; length: number; width: number; utilisation: number; parts: { label: string; design: string; x: number; y: number; width: number; height: number; rotated: boolean }[] }[];
  rows: { design: string; partId: string; cabinet: string; label: string; board: string;
    length: number; width: number; thickness: number; quantity: number; banding: string }[];
};

export function buildProjectCutList(primary: DesignSpec): ProjectProductionSummary {
  const designs = validProjectDesigns(primary);
  const cuts = designs.map(item => ({
    title: item.spec.title,
    cut: buildCutList(item.spec, buildParts(item.spec)),
  }));
  for (const item of cuts) {
    if (!item.cut.buildable)
      throw new Error(`"${item.title}" contains panels that do not fit the stock sheet. Fix that design first.`);
  }

  const printable: ProjectProductionSummary["rows"] = [];
  const cutting: Cell[][] = [[
    "Project #", "Design", "Part ID", "Cabinet", "Part", "Board",
    "Length (mm)", "Width (mm)", "Thickness (mm)", "Quantity",
    "Banding", "Band product", "Grain locked", "Area (m²)"
  ]];
  const boards = new Map<string, { board: string; sheets: number; pieces: number; area: number }>();
  // Keep parts labeled by design. Their board types may share one cutting
  // layout without merging separately identifiable manufactured pieces.
  const sharedInputs = new Map<string, {
    rows: CutListRow[];
    separate: { design: string; nesting: BoardNesting }[];
  }>();
  let globallyUniqueRow = 0;
  const hardware: Cell[][] = [["Design", "Hardware", "Qty", "Unit", "Note"]];
  const summary: Cell[][] = [["Design", "Category", "Pieces", "Area (m²)", "Sheets"]];
  cuts.forEach(({ title, cut }, index) => {
    cut.rows.forEach(row => {
      printable.push({
        design: title, partId: `${index + 1}-${row.partId}`,
        cabinet: row.cabinet, label: row.label, board: row.boardLabel,
        length: row.length, width: row.width, thickness: row.thickness,
        quantity: row.quantity, banding: row.banding,
      });
      cutting.push([
      index + 1, title, `${index + 1}-${row.partId}`, row.cabinet, row.label,
      row.boardLabel, row.length, row.width, row.thickness, row.quantity,
      row.banding, row.bandLabel, row.grainLocked ? "Yes" : "No", row.area,
      ]);
    });
    cut.byBoard.forEach(board => {
      const entry = boards.get(board.boardId) ?? {
        board: board.boardLabel, sheets: 0, pieces: 0, area: 0,
      };
      entry.sheets += board.sheets;
      entry.pieces += board.pieces;
      entry.area += board.area;
      boards.set(board.boardId, entry);
      const grouped = sharedInputs.get(board.boardId) ?? { rows: [], separate: [] };
      for (const row of board.rows) {
        grouped.rows.push({
          ...row,
          index: ++globallyUniqueRow,
          label: `${title} — ${row.partId} — ${row.label}`,
        });
      }
      grouped.separate.push({ design: title, nesting: board.nesting });
      sharedInputs.set(board.boardId, grouped);
    });
    cut.hardware.forEach(item => hardware.push([
      title, item.label, item.quantity, item.unit, item.note,
    ]));
    summary.push([
      title, designs[index]!.spec.kind, cut.totals.pieces,
      cut.totals.area, cut.byBoard.reduce((sum, b) => sum + b.sheets, 0),
    ]);
  });
  const sheetSummary: Cell[][] = [[
    "Board", "Shared sheets to buy", "Separate-sheet baseline", "Sheets saved", "Pieces", "Area (m²)"
  ]];
  const layout: Cell[][] = [["Board", "Sheet", "Part / source design", "X (mm)", "Y (mm)", "Cut width (mm)", "Cut height (mm)", "Rotated"]];
  const layouts: ProjectProductionSummary["layouts"] = [];
  const sheets = [...boards.entries()].map(([id, item]) => {
    const group = sharedInputs.get(id);
    if (!group) throw new Error(`Missing manufacturing rows for board: ${id}`);
    // Custom/legacy boards may not exist in the stock catalogue. Their own
    // original nesting is still valid; retain that rather than reject export.
    const board = findBoard(id);
    const shared = board ? nestBoard(board, group.rows) : null;
    if (shared) assertSafeNesting(shared, group.rows, item.board);
    // Shelf packing is a heuristic: with more pieces, it can occasionally
    // choose a worse arrangement. Keep the separate verified plans whenever
    // shared nesting does not improve the sheet count.
    const useShared = !!shared && shared.unplaced.length === 0 && shared.sheets.length <= item.sheets;
    if (useShared) {
      for (const sheet of shared!.sheets) for (const place of sheet.placements) {
        const source = group.rows.find(row => row.index === place.index);
        layout.push([item.board, sheet.number, source?.label ?? place.label,
          place.x, place.y, place.width, place.height, place.rotated ? "Yes" : "No"]);
      }
    } else {
      let sheetOffset = 0;
      for (const source of group.separate) {
        for (const sheet of source.nesting.sheets) for (const place of sheet.placements) {
          layout.push([item.board, sheet.number + sheetOffset,
            `${source.design} — ${place.label}`,
            place.x, place.y, place.width, place.height,
            place.rotated ? "Yes" : "No"]);
        }
        sheetOffset += source.nesting.sheets.length;
      }
    }
    const selectedLayouts = useShared ? shared!.sheets : [];
    if (useShared) {
      for (const sheet of selectedLayouts) {
        layouts.push({
          board: item.board, sheet: sheet.number,
          length: shared!.sheet.length, width: shared!.sheet.width,
          utilisation: sheet.utilisation,
          parts: sheet.placements.map(place => ({
            label: group.rows.find(row => row.index === place.index)?.label ?? place.label,
            design: group.rows.find(row => row.index === place.index)?.cabinet ?? "",
            x: place.x, y: place.y, width: place.width, height: place.height,
            rotated: place.rotated,
          })),
        });
      }
    } else {
      for (const source of group.separate) {
        for (const sheet of source.nesting.sheets) {
          layouts.push({
            board: item.board, sheet: sheet.number,
            length: source.nesting.sheet.length, width: source.nesting.sheet.width,
            utilisation: sheet.utilisation,
            parts: sheet.placements.map(place => ({
              label: place.label, design: source.design, x: place.x, y: place.y,
              width: place.width, height: place.height, rotated: place.rotated,
            })),
          });
        }
      }
    }
    return {
      board: item.board,
      sheets: useShared ? shared!.sheets.length : item.sheets,
      separateSheets: item.sheets,
      pieces: item.pieces,
      area: Math.round(item.area * 1000) / 1000,
    };
  });
  sheets.forEach(item => sheetSummary.push([
    item.board, item.sheets, item.separateSheets,
    item.separateSheets - item.sheets, item.pieces, item.area,
  ]));
  sheetSummary.push([]);
  sheetSummary.push(["Sheet layouts are calculated across matching board materials where doing so saves sheets."]);
  sheetSummary.push(["Cut part IDs and source cabinet names remain distinct for assembly."]);
  sheetSummary.push(["Offcuts shared between unrelated board types or grain directions are never assumed."]);
  const workbookSheets: Sheet[] = [
    { name: "Combined cut list", rows: cutting, widths: [11, 32, 22, 32, 25, 23, 16, 16, 17, 12, 24, 20, 14, 14] },
    { name: "Board totals", rows: sheetSummary, widths: [36, 21, 25, 16, 14, 19] },
    { name: "Cutting layout", rows: layout, widths: [32, 10, 55, 12, 12, 18, 19, 12] },
    { name: "Hardware", rows: hardware, widths: [34, 32, 12, 12, 50] },
    { name: "Design summary", rows: summary, widths: [35, 17, 15, 19, 13] },
  ];
  return {
    designs: designs.length,
    pieces: cuts.reduce((sum, item) => sum + item.cut.totals.pieces, 0),
    sheets,
    workbook: buildXlsx(workbookSheets),
    layouts,
    rows: printable,
  };
}
