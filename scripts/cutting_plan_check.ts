/**
 * The visual cutting plan against the cut list it is drawn from.
 *
 *   npx tsx scripts/cutting_plan_check.ts
 *
 * Every panel on a sheet must be the cut-list part it says it is: same id,
 * same size (either way round), same banding, counted once. Banding is drawn
 * only where the cut list's words fix the side.
 */
import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CuttingPlanPreview } from "../src/features/berchuma-studio/components/cutting-plan-preview";
import { bandedSides } from "../src/features/berchuma-studio/services/banding-edges";
import { addProjectDesign, buildProjectCutList } from "../src/features/berchuma-studio/services/cabinet-project";
import { startingDesign } from "../src/features/berchuma-studio/services/starting-designs";
import { parseSpec, type DesignSpec } from "../src/features/berchuma-studio/types/spec";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };

const project = (kinds: string[]): DesignSpec => {
  let spec = startingDesign("wardrobe");
  kinds.forEach((kind, i) => { spec = addProjectDesign(spec, `design-${i}`, kind as never); });
  return spec;
};

for (const kinds of [[], ["vanity"], ["wardrobe", "vanity"], ["kitchen", "wardrobe"], ["tv_unit", "vanity", "kitchen"]]) {
  const name = `[${["wardrobe", ...kinds].join(" + ")}]`;
  const out = buildProjectCutList(project(kinds));
  const byId = new Map<string, typeof out.rows>();
  for (const row of out.rows) byId.set(row.partId, [...(byId.get(row.partId) ?? []), row]);
  equal([...byId.values()].filter((rows) => rows.length > 1).length, 0, `${name}: exported part ids are unique across designs`);

  const placed = new Map<string, number>();
  for (const layout of out.layouts) {
    for (const part of layout.parts) {
      const row = byId.get(part.partId)?.[0];
      ok(part.partId !== "" && row, `${name}: sheet panel "${part.label}" is a part on the exported cut list (id ${part.partId || "missing"})`);
      if (!row) continue;
      equal(layout.board, row.board, `${name}: ${part.partId} is on its own board's sheet`);
      equal(part.banding, row.banding, `${name}: ${part.partId} carries the cut list's banding`);
      const sheetSize = [Math.round(part.width), Math.round(part.height)].sort((a, b) => a - b);
      const cutSize = [row.length, row.width].sort((a, b) => a - b);
      ok(Math.abs(sheetSize[0]! - cutSize[0]!) <= 1 && Math.abs(sheetSize[1]! - cutSize[1]!) <= 1, `${name}: ${part.partId} is drawn at its cut size (${sheetSize.join("×")} vs ${cutSize.join("×")})`);
      ok(part.label.includes(row.label.split(" — ")[0]!) || part.label.length > 0, `${name}: ${part.partId} has a name`);
      placed.set(part.partId, (placed.get(part.partId) ?? 0) + 1);
    }
  }
  // Every piece once: none duplicated, none left off.
  for (const row of out.rows) equal(placed.get(row.partId) ?? 0, row.quantity, `${name}: ${row.partId} appears ${row.quantity} time(s) on the sheets`);
  equal([...placed.values()].reduce((s, n) => s + n, 0), out.rows.reduce((s, r) => s + r.quantity, 0), `${name}: the sheets carry exactly the pieces on the cut list`);
  equal(out.pieces, out.rows.reduce((s, r) => s + r.quantity, 0), `${name}: the piece count agrees`);

  // Sheets are numbered once per board, and utilisation is the used area over the sheet.
  const numbers = new Map<string, number[]>();
  for (const layout of out.layouts) {
    numbers.set(layout.board, [...(numbers.get(layout.board) ?? []), layout.sheet]);
    const used = layout.parts.reduce((s, p) => s + p.width * p.height, 0);
    ok(Math.abs(used / (layout.length * layout.width) - layout.utilisation) < 0.0006, `${name}: ${layout.board} sheet ${layout.sheet} utilisation ${layout.utilisation} matches its panels`);
    ok(used <= layout.length * layout.width + 1, `${name}: panels fit inside the sheet`);
  }
  for (const [board, list] of numbers) equal(new Set(list).size, list.length, `${name}: ${board} has no repeated sheet number`);
  for (const sheet of out.sheets) equal(out.layouts.filter((l) => l.board === sheet.board).length, sheet.sheets, `${name}: ${sheet.board} shows as many sheets as it buys`);
  // Offcuts sit on sheets that exist.
  for (const offcut of out.offcuts) ok(numbers.get(offcut.board)?.includes(offcut.sheet), `${name}: an offcut of ${offcut.board} is on sheet ${offcut.sheet}, which exists`);
}

// Banding: only what the words fix is drawn, turned with the panel.
{
  const sides = (text: string, rotated = false) => bandedSides(text, rotated);
  const drawn = (s: ReturnType<typeof bandedSides>) => [s.top && "top", s.bottom && "bottom", s.left && "left", s.right && "right"].filter(Boolean);
  equal(drawn(sides("All four edges")), ["top", "bottom", "left", "right"], "all four edges are all four sides");
  equal(drawn(sides("All four edges", true)), ["top", "bottom", "left", "right"], "turned, still all four");
  equal(drawn(sides("Front + back")), ["top", "bottom"], "both long edges of a panel laid as cut are its top and bottom");
  equal(drawn(sides("Front + back", true)), ["left", "right"], "turned, the long edges are left and right");
  equal(drawn(sides("Both ends")), ["left", "right"], "both ends of a panel laid as cut are its left and right");
  equal(drawn(sides("Both ends", true)), ["top", "bottom"], "turned, the ends are top and bottom");
  equal(drawn(sides("Front + both ends")), ["left", "right"], "front + both ends: only the ends are fixed");
  equal(sides("Front + both ends").ambiguous, ["one long edge"], "and the single long edge is reported as not fixed");
  equal(drawn(sides("Front")), [], "front alone is not drawn on a guessed side");
  equal(sides("Front").ambiguous, ["one long edge"], "it is reported as ambiguous");
  equal(sides("Back").ambiguous, ["one long edge"], "back likewise");
  equal(sides("One end").ambiguous, ["one end"], "one end is ambiguous");
  equal(drawn(sides("—")), [], "no banding draws nothing");
  ok(sides("—").recognised && sides("—").ambiguous.length === 0, "and is a recognised statement of no banding");
  for (const odd of ["Unknown", "Top edge", "left + right", "All edges", "Front + front + back", "Both ends + both ends", "All four edges + front"]) {
    const s = sides(odd);
    ok(!s.recognised && drawn(s).length === 0, `"${odd}" is not in the cut list's words: nothing is drawn and it is flagged`);
  }
  equal(drawn(sides("  front + back ")), ["top", "bottom"], "spacing and case do not matter");
}

// The drawing itself: red edges where the words fix them, the part id on every panel, no doubled hash.
{
  const out = buildProjectCutList(project(["vanity", "kitchen"]));
  const sheetsWithBanding = out.layouts.filter((l) => l.parts.some((p) => bandedSides(p.banding, p.rotated).top || bandedSides(p.banding, p.rotated).left));
  ok(sheetsWithBanding.length > 0, "there are sheets with drawable banding");
  for (const layout of out.layouts.slice(0, 6)) {
    const html = renderToStaticMarkup(createElement(CuttingPlanPreview, { layouts: [layout] }));
    const red = (html.match(/stroke="#e11d48"/g) ?? []).length;
    const expected = layout.parts.reduce((n, p) => { const s = bandedSides(p.banding, p.rotated); return n + [s.top, s.bottom, s.left, s.right].filter(Boolean).length; }, 0);
    equal(red, expected, `sheet ${layout.sheet} of ${layout.board}: ${expected} red edges are drawn, one for each side the cut list fixes`);
    ok(!html.includes("##"), "no doubled hash in a panel label");
    for (const part of layout.parts) ok(html.includes(part.partId), `${part.partId} is shown`);
  }
  const unknown = { ...out.layouts[0]!, parts: [{ ...out.layouts[0]!.parts[0]!, banding: "Left edge please" }] };
  const html = renderToStaticMarkup(createElement(CuttingPlanPreview, { layouts: [unknown] }));
  equal((html.match(/stroke="#e11d48"/g) ?? []).length, 0, "banding the cut list does not state in its words draws no edge");
  ok(html.includes("not drawn: check the cut list"), "and says so");
}

// Exact drawing of crafted panels: which edges, where, and the small-panel label.
{
  const base = buildProjectCutList(project([])).layouts[0]!;
  const scale = Math.min(560 / base.length, 340 / base.width);
  const place = { x: 100, y: 50, width: 600, height: 300 };
  const lines = (banding: string, rotated: boolean) => {
    const part = { label: "Test panel", design: "D", partId: "T-1", banding, rotated, ...place };
    const html = renderToStaticMarkup(createElement(CuttingPlanPreview, { layouts: [{ ...base, parts: [part] }] }));
    const found = [...html.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" stroke="#e11d48"/g)].map((m) => ({ x1: +m[1]!, y1: +m[2]!, x2: +m[3]!, y2: +m[4]! }));
    return { horizontal: found.filter((l) => Math.abs(l.y1 - l.y2) < 0.01), vertical: found.filter((l) => Math.abs(l.x1 - l.x2) < 0.01), total: found.length };
  };
  const top = 20 + place.y * scale;
  const bottom = top + place.height * scale;
  const left = 20 + place.x * scale;
  const right = left + place.width * scale;
  const at = (a: number, b: number) => Math.abs(a - b) < 1.1;
  const all = lines("All four edges", false);
  equal([all.horizontal.length, all.vertical.length], [2, 2], "all four edges: two horizontal and two vertical red lines");
  ok(all.horizontal.some((l) => at(l.y1, top)) && all.horizontal.some((l) => at(l.y1, bottom)) && all.vertical.some((l) => at(l.x1, left)) && all.vertical.some((l) => at(l.x1, right)), "on the four sides of the panel, where the panel is");
  const long = lines("Front + back", false);
  equal([long.horizontal.length, long.vertical.length], [2, 0], "front + back as cut: the long sides, top and bottom");
  ok(long.horizontal.some((l) => at(l.y1, top)) && long.horizontal.some((l) => at(l.y1, bottom)), "at the panel's top and bottom edges");
  equal([lines("Front + back", true).horizontal.length, lines("Front + back", true).vertical.length], [0, 2], "front + back turned: left and right");
  equal([lines("Both ends", false).horizontal.length, lines("Both ends", false).vertical.length], [0, 2], "both ends as cut: left and right");
  equal([lines("Both ends", true).horizontal.length, lines("Both ends", true).vertical.length], [2, 0], "both ends turned: top and bottom");
  equal(lines("Front", false).total, 0, "front alone: no line on a guessed side");
  equal(lines("—", false).total, 0, "no banding: no line");
  const tiny = { label: "Tiny", design: "D", partId: "TINY-1", banding: "—", rotated: false, x: 5, y: 5, width: 20, height: 15 };
  const html = renderToStaticMarkup(createElement(CuttingPlanPreview, { layouts: [{ ...base, parts: [tiny] }] }));
  ok(html.includes("#1 · TINY-1") && !html.includes("##"), "a panel too small for its dimensions is labelled '#1 · id', not '##1'");
}

// Saved designs still open and save.
{
  const spec = project(["vanity", "kitchen"]);
  const reopened = parseSpec(JSON.parse(JSON.stringify(spec)));
  ok(reopened.ok, "a saved multi-design project reopens");
  if (reopened.ok) equal(buildProjectCutList(reopened.spec).rows.map((r) => r.partId), buildProjectCutList(spec).rows.map((r) => r.partId), "and gives the same cut list");
}

console.log(`Cutting plan: ${checks} checks passed.`);
