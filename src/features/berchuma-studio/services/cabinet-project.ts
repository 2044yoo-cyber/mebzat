import type { DesignSpec, DesignKind } from "../types/spec";
import { parseSpec } from "../types/spec";
import { startingDesign } from "./starting-designs";
import { buildParts } from "./geometry";
import { buildCutList } from "./cutlist";
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
  sheets: { board: string; sheets: number; pieces: number; area: number }[];
  workbook: Uint8Array;
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
    });
    cut.hardware.forEach(item => hardware.push([
      title, item.label, item.quantity, item.unit, item.note,
    ]));
    summary.push([
      title, designs[index]!.spec.kind, cut.totals.pieces,
      cut.totals.area, cut.byBoard.reduce((sum, b) => sum + b.sheets, 0),
    ]);
  });
  const sheetSummary: Cell[][] = [["Board", "Sheets", "Pieces", "Area (m²)"]];
  const sheets = [...boards.values()].map(item => ({
    ...item, area: Math.round(item.area * 1000) / 1000,
  }));
  sheets.forEach(item => sheetSummary.push([
    item.board, item.sheets, item.pieces, item.area,
  ]));
  sheetSummary.push([]);
  sheetSummary.push(["Sheet counts are the sum of each design's verified nesting."]);
  sheetSummary.push(["No shared offcut optimization across separate designs is assumed."]);
  const workbookSheets: Sheet[] = [
    { name: "Combined cut list", rows: cutting, widths: [11, 32, 22, 32, 25, 23, 16, 16, 17, 12, 24, 20, 14, 14] },
    { name: "Board totals", rows: sheetSummary, widths: [36, 14, 14, 19] },
    { name: "Hardware", rows: hardware, widths: [34, 32, 12, 12, 50] },
    { name: "Design summary", rows: summary, widths: [35, 17, 15, 19, 13] },
  ];
  return {
    designs: designs.length,
    pieces: cuts.reduce((sum, item) => sum + item.cut.totals.pieces, 0),
    sheets,
    workbook: buildXlsx(workbookSheets),
    rows: printable,
  };
}
