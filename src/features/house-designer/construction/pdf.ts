/**
 * A PDF, written by hand.
 *
 * What a bill and a cost report need is small: pages of text in two weights of a standard font, rules and shaded rows, and tables whose rows wrap and whose
 * headings repeat on every page. That is a few hundred lines here against a dependency of hundreds of kilobytes, in code that runs in the browser and in the
 * check script alike. The fonts are the two standard ones every reader has (Helvetica and Helvetica-Bold), so none is embedded; text is in WinAnsi, which has
 * the superscripts and the multiplication sign a bill of quantities needs.
 *
 * Pure: no Node APIs, no browser APIs, no clock. The same document always gives the same bytes.
 */

export type PdfColumn = { header: string; align: "left" | "right"; weight: number };

export type PdfBlock =
  | { t: "title"; text: string }
  | { t: "heading"; text: string }
  | { t: "paragraph"; text: string }
  | { t: "keyvalue"; rows: [string, string][] }
  | { t: "table"; columns: PdfColumn[]; rows: string[][]; /** A column whose value heads each run of rows; it is left out of the table. */ groupBy?: number; landscape?: boolean; title?: string; note?: string; /** Rows in bold, by index (a total). */ boldRows?: number[] };

export type PdfDoc = {
  title: string;
  /** In the footer of every page. */
  footer: string;
  /** ISO time, for the document's date. */
  date: string;
  blocks: PdfBlock[];
};

const PORTRAIT = { w: 595.28, h: 841.89 };
const LANDSCAPE = { w: 841.89, h: 595.28 };
const MARGIN = { left: 36, right: 36, top: 46, bottom: 46 };

// ---------------------------------------------------------------------------
// Text: WinAnsi, and the widths of Helvetica
// ---------------------------------------------------------------------------

/** Widths of Helvetica for 32…126, in thousandths of the type size. */
const REGULAR = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
/** Widths of Helvetica-Bold for 32…126. */
const BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

/** The code of a character in WinAnsi, or null when it has none. */
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e,
  0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
const FALLBACK: Record<string, string> = { "−": "-", "≥": ">=", "≤": "<=", "→": "->", "←": "<-", "≈": "~", "∑": "Sum", " ": " ", " ": " ", " ": " " };

/** A string as WinAnsi: one character for each code, so that the length of the string is the length in bytes. */
export function winAnsi(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code === 9 || code === 10 || code === 13) out += " ";
    else if (code >= 32 && code < 127) out += ch;
    else if (code >= 0xa0 && code <= 0xff) out += ch;
    else if (CP1252[code] !== undefined) out += String.fromCharCode(CP1252[code]!);
    else if (FALLBACK[ch] !== undefined) out += FALLBACK[ch];
    else out += "?";
  }
  return out;
}

const WIDE: Record<number, number> = { 0xb2: 333, 0xb3: 333, 0xd7: 584, 0xb0: 400, 0xb1: 584, 0xb7: 278, 0x96: 556, 0x97: 1000, 0x95: 350, 0x85: 1000, 0x92: 222, 0x91: 222, 0x93: 333, 0x94: 333, 0x80: 556 };

function charWidth(code: number, bold: boolean): number {
  if (code >= 32 && code < 127) return (bold ? BOLD : REGULAR)[code - 32]!;
  return WIDE[code] ?? 556;
}

/** The width of WinAnsi text, in points. */
export function textWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (let i = 0; i < text.length; i += 1) w += charWidth(text.charCodeAt(i), bold);
  return (w * size) / 1000;
}

/** Text broken into lines no wider than `max` points: at spaces where it can be, inside a word where it must. */
export function wrapText(text: string, size: number, max: number, bold = false): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size, bold) <= max) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      let rest = word;
      while (textWidth(rest, size, bold) > max && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && textWidth(rest.slice(0, n), size, bold) > max) n -= 1;
        lines.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

const literal = (text: string) => `(${text.replace(/[\\()]/g, (c) => `\\${c}`)})`;
/** A string for the document's information, which is not in WinAnsi but in PDFDocEncoding or UTF-16: plain when it is plain, UTF-16 with a byte order mark when not. */
const infoString = (text: string): string => {
  if (/^[\x20-\x7e]*$/.test(text)) return literal(text);
  let hex = "FEFF";
  for (let i = 0; i < text.length; i += 1) hex += text.charCodeAt(i).toString(16).padStart(4, "0");
  return `<${hex.toUpperCase()}>`;
};
const num = (n: number) => (Math.round(n * 100) / 100).toString();

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

type PageState = { w: number; h: number; ops: string[] };

const GREY = "0.93 g";
const TINT = "0.86 0.91 0.97 rg";
const STRIPE = "0.975 g";

/** Every string is turned into WinAnsi once, where it comes in; from there on it is measured and set as it is. */
export function buildPdf(doc: PdfDoc): Uint8Array {
  const pages: PageState[] = [];
  let page: PageState = { ...PORTRAIT, ops: [] };
  let y = 0;
  let landscape = false;

  const startPage = (wide: boolean): void => {
    landscape = wide;
    page = { ...(wide ? LANDSCAPE : PORTRAIT), ops: [] };
    pages.push(page);
    y = page.h - MARGIN.top;
  };
  const usable = () => page.w - MARGIN.left - MARGIN.right;
  const room = (needed: number): boolean => y - needed >= MARGIN.bottom;
  const ensure = (needed: number): void => { if (!room(needed)) startPage(landscape); };
  /** Text set with its left edge at `x`, or, right-aligned, ending at `x`. */
  const text = (x: number, baseline: number, str: string, size: number, bold = false, align: "left" | "right" = "left"): void => {
    const at = align === "right" ? x - textWidth(str, size, bold) : x;
    page.ops.push(`BT /${bold ? "F2" : "F1"} ${num(size)} Tf ${num(at)} ${num(baseline)} Td ${literal(str)} Tj ET`);
  };
  const rect = (x: number, top: number, w: number, h: number, fill: string): void => { page.ops.push(`q ${fill} ${num(x)} ${num(top - h)} ${num(w)} ${num(h)} re f Q`); };
  const rule = (x1: number, x2: number, at: number, grey = 0.6): void => { page.ops.push(`q ${grey} G 0.5 w ${num(x1)} ${num(at)} m ${num(x2)} ${num(at)} l S Q`); };

  startPage(false);

  const drawTable = (block: Extract<PdfBlock, { t: "table" }>): void => {
    const size = 7.5;
    const lineH = size * 1.3;
    const padY = 2.4;
    const padX = 3;
    const group = block.groupBy;
    const cols = block.columns.map((c, i) => ({ ...c, i, header: winAnsi(c.header) })).filter((c) => c.i !== group);
    const total = cols.reduce((sum, c) => sum + c.weight, 0);
    const width = usable();
    const widths = cols.map((c) => (c.weight / total) * width);
    const xs: number[] = [];
    let at = MARGIN.left;
    for (const w of widths) { xs.push(at); at += w; }
    /** One line of a cell, on its baseline: in from the left edge, or in from the right. */
    const put = (k: number, line: string, baseline: number, bold: boolean): void => {
      if (cols[k]!.align === "right") text(xs[k]! + widths[k]! - padX, baseline, line, size, bold, "right");
      else text(xs[k]! + padX, baseline, line, size, bold);
    };

    const heading = (): void => {
      const lines = cols.map((c, k) => wrapText(c.header, size, widths[k]! - 2 * padX, true));
      const h = Math.max(...lines.map((l) => l.length)) * lineH + 2 * padY;
      ensure(h + 30);
      rect(MARGIN.left, y, width, h, GREY);
      lines.forEach((ls, k) => ls.forEach((l, j) => put(k, l, y - padY - lineH * (j + 1) + 2.2, true)));
      y -= h;
      rule(MARGIN.left, MARGIN.left + width, y, 0.4);
    };

    if (block.title) {
      ensure(60);
      y -= 18;
      for (const line of wrapText(winAnsi(block.title), 11, usable(), true)) { text(MARGIN.left, y, line, 11, true); y -= 14; }
      y += 2;
    }
    if (block.note) {
      for (const line of wrapText(winAnsi(block.note), 8, usable())) { ensure(14); y -= 11; text(MARGIN.left, y, line, 8); }
      y -= 3;
    }
    heading();

    let lastGroup: string | null = null;
    block.rows.forEach((row, ri) => {
      const bold = !!block.boldRows?.includes(ri);
      const cells = cols.map((c, k) => wrapText(winAnsi(row[c.i] ?? ""), size, widths[k]! - 2 * padX, bold).slice(0, 8));
      const h = Math.max(...cells.map((l) => l.length), 1) * lineH + 2 * padY;
      const g = group === undefined ? null : winAnsi(row[group] ?? "");
      const headingH = lineH + 2 * padY;
      if (!room(h + (g !== null && g !== lastGroup ? headingH : 0) + 2)) { startPage(landscape); heading(); lastGroup = null; }
      if (g !== null && g !== lastGroup) {
        rect(MARGIN.left, y, width, headingH, TINT);
        text(MARGIN.left + padX, y - padY - lineH + 2.2, g, size + 0.5, true);
        y -= headingH;
        lastGroup = g;
      }
      if (ri % 2 === 1) rect(MARGIN.left, y, width, h, STRIPE);
      cells.forEach((lines, k) => lines.forEach((l, j) => put(k, l, y - padY - lineH * (j + 1) + 2.2, bold)));
      y -= h;
      rule(MARGIN.left, MARGIN.left + width, y, 0.88);
    });
    y -= 12;
  };

  for (const block of doc.blocks) {
    if (block.t === "title") {
      ensure(40);
      for (const line of wrapText(winAnsi(block.text), 17, usable(), true)) { y -= 21; text(MARGIN.left, y, line, 17, true); }
      y -= 8;
      rule(MARGIN.left, MARGIN.left + usable(), y, 0.2);
      y -= 8;
    } else if (block.t === "heading") {
      ensure(48);
      y -= 20;
      for (const line of wrapText(winAnsi(block.text), 12, usable(), true)) { text(MARGIN.left, y, line, 12, true); y -= 15; }
      y += 4;
    } else if (block.t === "paragraph") {
      for (const line of wrapText(winAnsi(block.text), 9, usable())) { ensure(14); y -= 12; text(MARGIN.left, y, line, 9); }
      y -= 4;
    } else if (block.t === "keyvalue") {
      const labelW = Math.min(usable() * 0.5, 230);
      for (const [label, value] of block.rows) {
        const valueLines = wrapText(winAnsi(value), 9, usable() - labelW - 8, true);
        const labelLines = wrapText(winAnsi(label), 9, labelW - 6);
        const n = Math.max(valueLines.length, labelLines.length);
        ensure(n * 12 + 4);
        labelLines.forEach((l, i) => text(MARGIN.left, y - 12 * (i + 1), l, 9));
        valueLines.forEach((l, i) => text(MARGIN.left + labelW + 8, y - 12 * (i + 1), l, 9, true));
        y -= n * 12 + 2;
        rule(MARGIN.left, MARGIN.left + usable(), y, 0.85);
      }
      y -= 6;
    } else if (block.t === "table") {
      // A table meant for a wide page starts on one.
      if (!!block.landscape !== landscape) startPage(!!block.landscape);
      else if (!room(80)) startPage(landscape);
      drawTable(block);
    }
  }

  // ---- Footers, and the file ------------------------------------------------------------------------------------------------------------------------
  const count = pages.length;
  const footer = winAnsi(doc.footer);
  pages.forEach((p, i) => {
    const save = page;
    page = p;
    rule(MARGIN.left, p.w - MARGIN.right, MARGIN.bottom - 10, 0.75);
    text(MARGIN.left, MARGIN.bottom - 22, footer, 7.5);
    text(p.w - MARGIN.right, MARGIN.bottom - 22, `Page ${i + 1} of ${count}`, 7.5, false, "right");
    page = save;
  });

  return assemble(doc, pages);
}

function assemble(doc: PdfDoc, pages: PageState[]): Uint8Array {
  const parts: string[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (s: string) => { parts.push(s); length += s.length; };
  push("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");
  const object = (n: number, body: string) => { offsets[n] = length; push(`${n} 0 obj\n${body}\nendobj\n`); };

  const firstPage = 6;
  const kids = pages.map((_, i) => `${firstPage + 2 * i} 0 R`).join(" ");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  object(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  object(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const stamp = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/.exec(doc.date);
  const created = stamp ? `D:${stamp[1]}${stamp[2]}${stamp[3]}${stamp[4] ?? "00"}${stamp[5] ?? "00"}${stamp[6] ?? "00"}Z` : "D:19800101000000Z";
  object(5, `<< /Title ${infoString(doc.title)} /Producer (Medosha) /Creator (Medosha house designer) /CreationDate (${created}) >>`);
  pages.forEach((p, i) => {
    const pageNo = firstPage + 2 * i;
    const content = p.ops.join("\n");
    object(pageNo, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(p.w)} ${num(p.h)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageNo + 1} 0 R >>`);
    object(pageNo + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  const size = firstPage + 2 * pages.length;
  const xref = length;
  push(`xref\n0 ${size}\n0000000000 65535 f \n`);
  for (let n = 1; n < size; n += 1) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${size} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = parts.join("");
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i += 1) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}
