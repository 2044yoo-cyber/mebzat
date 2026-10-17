import { buildPdf, type PdfBlock } from "./pdf";
import type { Report, ReportCell, ReportTable } from "./report";

/**
 * The report as a PDF: the building and its totals first, what could not be priced next, then the cost and the bill in their tables, then the rules behind
 * the figures. The tables are the report's own, so the PDF and the workbook say the same thing.
 */

/** The order the tables are printed in. */
const ORDER = ["cost-summary", "problems", "cost-groups", "bill", "bill-floor", "bill-stage", "bill-category", "cost-lines", "rates", "assumptions"];

/** Rows printed in bold: the lines that are totals. */
const BOLD_FIRST_CELLS: Record<string, string[]> = {
  "cost-summary": ["Direct cost", "Additional costs", "Subtotal", "Taxes", "TOTAL"],
  "cost-lines": ["Total"],
};

const show = (cell: ReportCell, digits: number | undefined): string => {
  if (cell === null) return "";
  if (typeof cell === "string") return cell;
  return cell.toLocaleString("en", { minimumFractionDigits: digits ?? 0, maximumFractionDigits: digits ?? 0 });
};

function tableBlock(table: ReportTable): PdfBlock {
  const bold = BOLD_FIRST_CELLS[table.id] ?? [];
  const rows = table.rows.map((row) => row.map((cell, i) => show(cell, table.columns[i]?.digits)));
  return {
    t: "table",
    title: table.title,
    ...(table.note ? { note: table.note } : {}),
    columns: table.columns.map((c) => ({ header: c.header, align: c.align, weight: c.weight })),
    rows,
    ...(table.groupBy !== undefined ? { groupBy: table.groupBy } : {}),
    // Eight columns or more are too many for a portrait page.
    landscape: table.columns.length >= 8,
    boldRows: rows.flatMap((r, i) => (bold.includes(r[0] ?? "") ? [i] : [])),
  };
}

export function reportPdf(report: Report): Uint8Array {
  const byId = new Map(report.tables.map((t) => [t.id, t]));
  const blocks: PdfBlock[] = [
    { t: "title", text: report.title },
    { t: "keyvalue", rows: [["Building", report.subtitle], ["Report made", report.generatedAt.slice(0, 10)], ...report.summary.filter(([k]) => k !== "Building")] },
    { t: "heading", text: "Read this first" },
    ...report.notes.map((text): PdfBlock => ({ t: "paragraph", text })),
    ...ORDER.flatMap((id) => { const t = byId.get(id); return t ? [tableBlock(t)] : []; }),
  ];
  return buildPdf({ title: report.title, footer: `Medosha · ${report.subtitle} · indicative estimate, not a quotation`, date: report.generatedAt, blocks });
}
