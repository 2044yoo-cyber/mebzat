import { buildXlsx, type Cell, type Sheet } from "@/features/berchuma-studio/services/xlsx";

import type { PriceBook } from "./price-book";
import type { Report, ReportTable } from "./report";

/**
 * The report as a workbook: a summary sheet, then one sheet for each table of the report, then the whole price book. Numbers stay numbers (a spreadsheet can
 * add them up), the first row of every sheet is its headings, and the same report always gives the same bytes.
 */

const widthOf = (weight: number) => Math.max(8, Math.min(60, Math.round(weight * 12)));

function tableSheet(table: ReportTable): Sheet {
  return {
    name: table.sheet,
    rows: [table.columns.map((c) => c.header), ...table.rows.map((row) => row.map((cell): Cell => cell))],
    widths: table.columns.map((c) => widthOf(c.weight)),
  };
}

export function reportWorkbook(report: Report, book: PriceBook): Uint8Array {
  const sheets: Sheet[] = [
    {
      name: "Summary",
      rows: [
        [report.title, ""],
        ["Building", report.subtitle],
        ["Report made", report.generatedAt],
        ...report.summary.filter(([k]) => k !== "Building").map(([k, v]): Cell[] => [k, v]),
        ["", ""],
        ["Notes", ""],
        ...report.notes.map((n): Cell[] => ["", n]),
      ],
      widths: [44, 90],
    },
    ...report.tables.map(tableSheet),
    {
      name: "Price book",
      rows: [
        ["Work item", "Unit", "Material rate", "Material rate is", "Material source", "Material date", "Labour rate", "Labour rate is", "Labour source", "Labour date", "Included in", "Note"],
        ...Object.values(book.entries).sort((a, b) => a.workItem.localeCompare(b.workItem)).map((e): Cell[] => [
          e.workItem, e.unit, e.material.value, e.includedIn ? "" : e.material.status === "assumed" ? "example" : e.material.status, e.includedIn ? "" : e.material.source, e.includedIn ? "" : e.material.date,
          e.labour.value, e.includedIn ? "" : e.labour.status === "assumed" ? "example" : e.labour.status, e.includedIn ? "" : e.labour.source, e.includedIn ? "" : e.labour.date, e.includedIn, e.note,
        ]),
      ],
      widths: [38, 10, 14, 14, 30, 12, 14, 14, 30, 12, 26, 60],
    },
  ];
  return buildXlsx(sheets);
}
