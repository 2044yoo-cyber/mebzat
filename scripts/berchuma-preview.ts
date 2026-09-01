/**
 * Berchuma Studio — costed preview of a reference design.
 *
 *   npm run berchuma:preview
 *
 * Prints the cut list, the sheet count and the full cost breakdown for the
 * reference wardrobe. The check script asserts the arithmetic; this is for
 * looking at the numbers and asking whether a joiner would recognise them —
 * which is how two real defects were caught: a back panel larger than any
 * sheet it could be cut from, and a labour model that costed a three-bay
 * wardrobe at a day and a half.
 */

import { buildCutList } from "../src/features/berchuma-studio/services/cutlist.ts";
import { calculateCost } from "../src/features/berchuma-studio/services/costing.ts";
import { wardrobeExample } from "../src/features/berchuma-studio/services/examples.ts";
import { buildParts } from "../src/features/berchuma-studio/services/geometry.ts";

const spec = wardrobeExample();
const parts = buildParts(spec);
const cost = calculateCost(spec, parts);
const list = buildCutList(spec, parts);

console.log(`\n${spec.title} — ${spec.envelope.width}×${spec.envelope.height}×${spec.envelope.depth} mm\n`);
console.log(`Pieces: ${list.totals.pieces}   Board: ${list.totals.area} m²   Edge band: ${list.totals.bandMetres} m\n`);
console.log("CUT LIST (top 8 by size)");
for (const row of list.rows.slice(0, 8)) {
  console.log(`  ${String(row.index).padStart(2)}. ${row.length}×${row.width}  ×${row.quantity}  ${row.banding.padEnd(18)} ${row.boardLabel}`);
}
console.log("\nSHEETS");
for (const block of list.byBoard) console.log(`  ${block.sheets} × ${block.boardLabel}  (${block.area} m² of parts)`);
console.log("\nCOST");
for (const line of cost.lines) {
  console.log(`  ${line.label.padEnd(38)} ${String(line.quantity).padStart(7)} ${line.unit.padEnd(11)} @ ${String(line.rate).padStart(8)}  = ${line.amount.toLocaleString().padStart(10)}  ${line.source === "fallback" ? "(est)" : ""}`);
}
console.log(`  ${"".padEnd(38)} ${"".padStart(7)} ${"".padEnd(11)}   ${"".padStart(8)}   ${"".padStart(10)}`);
console.log(`  Production cost${" ".repeat(56)} ${cost.productionCost.toLocaleString().padStart(10)}`);
console.log(`  Margin ${cost.margin.percent}%${" ".repeat(62)} ${cost.margin.amount.toLocaleString().padStart(10)}`);
console.log(`  PRICE${" ".repeat(66)} ${cost.currency} ${cost.price.toLocaleString()}`);
console.log(`\n  Production: ${cost.productionDays} days   Confidence: ${cost.confidence}%`);
console.log("\nASSUMPTIONS");
for (const note of cost.assumptions) console.log(`  · ${note}`);
console.log("");
