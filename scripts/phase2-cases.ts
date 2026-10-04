/**
 * The five worked examples from the Phase 2 brief, run through the real
 * engines.
 *
 *   npx tsx scripts/phase2-cases.ts
 *
 * Not a check script — it asserts nothing and fails nothing. It runs each
 * example and prints what came back, so a claim about what Berchuma can and
 * cannot do is grounded in output rather than in my reading of the code.
 */

import { buildOpening } from "../src/features/berchuma-studio/services/openings.ts";
import { packLinear } from "../src/features/berchuma-studio/services/linear-stock.ts";
import {
  glassTypes,
  openingSpecSchema,
  profileSystems,
} from "../src/features/berchuma-studio/types/openings.ts";

const BOLD = "[1m";
const DIM = "[2m";
const RESET = "[0m";

function heading(text: string) {
  console.log(`\n${BOLD}${text}${RESET}`);
  console.log(`${DIM}${"─".repeat(text.length)}${RESET}`);
}

// ---------------------------------------------------------------------------
// TEST 2 — 2400 × 2700 mm aluminium sliding door
// ---------------------------------------------------------------------------

heading("TEST 2 — aluminium sliding door, 2400 × 2700 mm");

const door = buildOpening(
  openingSpecSchema.parse({
    version: 1,
    kind: "sliding-door",
    reference: "D-01",
    width: 2400,
    height: 2700,
    given: { width: true, height: true },
    system: Object.keys(profileSystems)[0],
    panels: 2,
    opening: 1,
    glass: Object.keys(glassTypes)[0],
  }),
);

console.log(`  ${door.title}`);
console.log("\n  profile cuts:");
for (const cut of door.profiles) {
  console.log(
    `    ${cut.label.padEnd(22)} ${cut.profileLabel.padEnd(18)} ${String(cut.length).padStart(5)} mm × ${cut.quantity}`,
  );
}
console.log(`\n  glass:`);
for (const pane of door.glass) {
  console.log(
    `    ${pane.label.padEnd(22)} ${pane.typeLabel} ${pane.width} × ${pane.height} mm × ${pane.quantity}` +
      `  = ${(pane.area * pane.quantity).toFixed(2)} m²`,
  );
}
console.log(`\n  hardware:`);
for (const item of door.hardware) {
  console.log(`    ${item.label.padEnd(26)} ${item.quantity} ${item.unit}`);
}
console.log(`\n  stock bars (first-fit-decreasing over 6 m bars):`);
for (const stock of packLinear(door.profiles)) {
  console.log(
    `    ${stock.profileLabel.slice(0, 34).padEnd(36)} ${String(stock.bars).padStart(2)} bars × ${stock.stockLength} mm` +
      `   need ${stock.requiredMetres.toFixed(2)} m, buy ${stock.purchasedMetres.toFixed(2)} m,` +
      ` waste ${(stock.wasteFraction * 100).toFixed(1)}%`,
  );
}
console.log(
  `\n  opening area ${door.openingArea.toFixed(2)} m², glazed ${door.glazedArea.toFixed(2)} m²`,
);
for (const note of door.notes) console.log(`    note: ${note}`);

// ---------------------------------------------------------------------------
// TEST 3 — 1800 × 1500 mm aluminium sliding window
// ---------------------------------------------------------------------------

heading("TEST 3 — aluminium sliding window, 1800 × 1500 mm");

const window = buildOpening(
  openingSpecSchema.parse({
    version: 1,
    kind: "sliding-window",
    reference: "W-01",
    width: 1800,
    height: 1500,
    given: { width: true, height: true },
    system: Object.keys(profileSystems)[0],
    panels: 2,
    opening: 1,
    glass: Object.keys(glassTypes)[0],
  }),
);

console.log(`  ${window.profiles.length} profile cuts, ${window.glass.length} glass panes`);
for (const stock of packLinear(window.profiles)) {
  console.log(
    `    ${stock.profileLabel.slice(0, 34).padEnd(36)} ${String(stock.bars).padStart(2)} bars × ${stock.stockLength} mm` +
      `   need ${stock.requiredMetres.toFixed(2)} m, waste ${(stock.wasteFraction * 100).toFixed(1)}%`,
  );
}
console.log(
  `  glazed area: ${window.glazedArea.toFixed(2)} m² of a ${window.openingArea.toFixed(2)} m² opening`,
);

console.log(
  `\n${DIM}Bars, not metres: the cost of a 6 m stock bar is charged per bar.${RESET}\n`,
);
