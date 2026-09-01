/**
 * A spreadsheet, written by hand.
 *
 * An .xlsx file is a zip of XML documents, and the subset a cut list needs is
 * small: a workbook, a sheet per tab, one style for bold headers. That is a
 * few hundred lines here against a dependency measured in hundreds of
 * kilobytes — one that would be pulled into a Next.js route handler, where
 * every byte is cold-start time on a connection that is already slow.
 *
 * The zip is written with method 0, stored. Deflate would need a compressor;
 * stored needs a CRC and some little-endian headers, and Excel, LibreOffice
 * and Google Sheets all read it. A cut list is a few kilobytes of text, so the
 * compression would have saved nothing worth the code.
 *
 * Pure: no Node APIs, no browser APIs. It runs in the route handler and in the
 * check script, which is what lets the check script open its output with a
 * real spreadsheet reader rather than trusting that it looks about right.
 */

export type Cell = string | number | null;

export type Sheet = {
  /** Tab name. Excel forbids : \ / ? * [ ] and more than 31 characters. */
  name: string;
  /** The first row is rendered bold. */
  rows: Cell[][];
  /** Column widths in characters. Optional; Excel's default is unreadable. */
  widths?: number[];
};

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  if (sheets.length === 0) throw new Error("A workbook needs at least one sheet.");

  const files: { name: string; data: Uint8Array }[] = [];
  const add = (name: string, text: string) =>
    files.push({ name, data: encode(text) });

  add(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      sheets
        .map(
          (_, index) =>
            `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("") +
      `</Types>`,
  );

  add(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
  );

  add(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>` +
      sheets
        .map(
          (sheet, index) =>
            `<sheet name="${xml(tabName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
        )
        .join("") +
      `</sheets></workbook>`,
  );

  add(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets
        .map(
          (_, index) =>
            `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
        )
        .join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
  );

  // Two cell formats: 0 is plain, 1 is bold. Both fonts must exist even though
  // only one is styled, because a cellXfs entry indexes into the font list and
  // Excel repairs a file whose index is out of range rather than opening it.
  add(
    "xl/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
      `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
      `<borders count="1"><border/></borders>` +
      `<cellStyleXfs count="1"><xf/></cellStyleXfs>` +
      `<cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" applyFont="1"/></cellXfs>` +
      // Without a named Normal style the file still opens, but readers warn
      // that the workbook has no default and substitute their own — which is a
      // real reader telling you the document is not quite conformant.
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>`,
  );

  for (const [index, sheet] of sheets.entries()) {
    add(`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet));
  }

  return zip(files);
}

// ---------------------------------------------------------------------------
// Worksheet
// ---------------------------------------------------------------------------

function sheetXml(sheet: Sheet): string {
  const columns = sheet.widths
    ? `<cols>${sheet.widths
        .map(
          (width, index) =>
            `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
        )
        .join("")}</cols>`
    : "";

  const rows = sheet.rows
    .map((cells, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const bold = rowIndex === 0;
      const body = cells
        .map((value, columnIndex) => cell(value, columnIndex, rowNumber, bold))
        .filter((text) => text.length > 0)
        .join("");
      return `<row r="${rowNumber}">${body}</row>`;
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    columns +
    `<sheetData>${rows}</sheetData></worksheet>`
  );
}

/**
 * One cell.
 *
 * Strings go inline rather than through a shared-strings table. The table is a
 * size optimisation for spreadsheets with thousands of repeated labels; a cut
 * list has forty rows, and inline strings remove a whole file and its
 * index-keeping from this module.
 */
function cell(
  value: Cell,
  columnIndex: number,
  rowNumber: number,
  bold: boolean,
): string {
  if (value === null || value === "") return "";

  const reference = `${columnName(columnIndex)}${rowNumber}`;
  const style = bold ? ` s="1"` : "";

  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}"${style}><v>${value}</v></c>`;
  }

  return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(String(value))}</t></is></c>`;
}

/** 0 → A, 25 → Z, 26 → AA. */
function columnName(index: number): string {
  let name = "";
  let remaining = index;
  while (remaining >= 0) {
    name = String.fromCharCode(65 + (remaining % 26)) + name;
    remaining = Math.floor(remaining / 26) - 1;
  }
  return name;
}

/** Excel refuses a tab name with these characters, or one over 31 long. */
function tabName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim();
  return (cleaned || "Sheet").slice(0, 31);
}

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Control characters are not legal in XML 1.0 at all, and a stray one
    // makes the whole workbook unopenable rather than one cell wrong.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// ---------------------------------------------------------------------------
// Zip
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A zip archive, stored.
 *
 * Timestamps are fixed rather than taken from the clock, which makes the same
 * cut list produce a byte-identical file every time. That is worth more than
 * an accurate modification date: it means the check script can compare two
 * exports and a difference always means the data changed.
 */
function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  // 1 January 1980, the earliest a DOS timestamp can express.
  const DOS_TIME = 0;
  const DOS_DATE = 33;

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const local = new Uint8Array(30 + name.length + size);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0, true); // flags
    localView.setUint16(8, 0, true); // method: stored
    localView.setUint16(10, DOS_TIME, true);
    localView.setUint16(12, DOS_DATE, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, size, true); // compressed
    localView.setUint32(22, size, true); // uncompressed
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true); // extra
    local.set(name, 30);
    local.set(file.data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, DOS_TIME, true);
    centralView.setUint16(14, DOS_DATE, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true); // extra
    centralView.setUint16(32, 0, true); // comment
    centralView.setUint16(34, 0, true); // disk
    centralView.setUint16(36, 0, true); // internal attrs
    centralView.setUint32(38, 0, true); // external attrs
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const total =
    locals.reduce((sum, part) => sum + part.length, 0) + centralSize + 22;
  const archive = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...locals, ...centrals, end]) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  return archive;
}
