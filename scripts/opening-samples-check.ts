/**
 * The window and door samples.
 *
 *   npx tsx scripts/opening-samples-check.ts
 *
 * A sample is only a sample if picking it produces something buildable. Every
 * size in the catalogue is run through the real engine here — the schema, the
 * frame arithmetic and the bar packing — because "Sliding window 2400 × 1500"
 * on a tile is a promise that a fabricator can cut it.
 */

import { readFileSync } from "node:fs";

import {
  OPENING_SAMPLES,
  firstSize,
  openingSample,
  referenceFor,
  sampleFor,
  sampleTitle,
  statedSize,
} from "../src/features/berchuma-studio/services/opening-samples.ts";
import { buildOpening } from "../src/features/berchuma-studio/services/openings.ts";
import { packLinear } from "../src/features/berchuma-studio/services/linear-stock.ts";
import {
  openingKinds,
  openingSpecSchema,
  profileSystems,
  type OpeningKind,
} from "../src/features/berchuma-studio/types/openings.ts";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/* -------------------------------------------------------------------------- */
/* The catalogue covers what the engine can build                              */
/* -------------------------------------------------------------------------- */

for (const kind of openingKinds) {
  check(
    `${kind} has a sample`,
    sampleFor(kind) !== undefined,
    "the engine builds it but nothing offers it",
  );
}

check(
  "no sample names a kind the engine does not know",
  OPENING_SAMPLES.every((sample) =>
    (openingKinds as readonly string[]).includes(sample.kind),
  ),
);

check(
  "windows come before doors",
  OPENING_SAMPLES.findIndex((s) => s.kind === "sliding-window") <
    OPENING_SAMPLES.findIndex((s) => s.kind === "sliding-door"),
  "a villa has fourteen windows and two doors",
);

check(
  "every sample offers at least three sizes",
  OPENING_SAMPLES.every((sample) => sample.sizes.length >= 3),
);

check(
  "no sample repeats a size",
  OPENING_SAMPLES.every(
    (sample) =>
      new Set(sample.sizes.map((s) => `${s.width}x${s.height}`)).size ===
      sample.sizes.length,
  ),
);

/* -------------------------------------------------------------------------- */
/* Every offered size actually builds                                          */
/* -------------------------------------------------------------------------- */

for (const sample of OPENING_SAMPLES) {
  for (const size of sample.sizes) {
    const label = `${sample.kind} ${size.width}×${size.height}`;

    const spec = openingSample(sample.kind, {
      width: size.width,
      height: size.height,
    });

    // The schema is the gate the UI goes through, so the sample has to pass it
    // rather than merely look like a spec.
    const parsed = openingSpecSchema.safeParse(spec);
    check(`${label} passes the schema`, parsed.success, formatIssues(parsed));
    if (!parsed.success) continue;

    const breakdown = buildOpening(parsed.data);

    check(`${label} produces cuts`, breakdown.profiles.length > 0);
    check(
      `${label} cuts are all positive`,
      breakdown.profiles.every((cut) => cut.length > 0 && cut.quantity > 0),
    );
    check(
      `${label} glazed area is under the opening area`,
      breakdown.glazedArea < breakdown.openingArea,
      `${breakdown.glazedArea} vs ${breakdown.openingArea}`,
    );

    // Every pane has to fit inside the hole it goes in. A pane wider than the
    // opening is the arithmetic having gone the wrong way round.
    check(
      `${label} panes fit the opening`,
      breakdown.glass.every(
        (pane) => pane.width < size.width && pane.height < size.height,
      ),
    );

    const stock = packLinear(breakdown.profiles);
    check(`${label} packs into bars`, stock.length > 0);
    check(
      `${label} has no piece longer than a bar`,
      stock.every((entry) => entry.unplaced.length === 0),
      stock
        .flatMap((entry) => entry.unplaced.map((piece) => piece.label))
        .join(", "),
    );
    check(
      `${label} buys at least what it needs`,
      stock.every((entry) => entry.purchasedMetres >= entry.requiredMetres),
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Picked is not measured                                                      */
/* -------------------------------------------------------------------------- */

const picked = openingSample("sliding-window", { width: 1800, height: 1500 });

check(
  "a size picked from the list is not marked as the customer's",
  !picked.given.width && !picked.given.height,
  "a standard size is a catalogue fact, not a wall",
);

check(
  "and the engine says so",
  buildOpening(picked).notes.some((note) => /estimat/i.test(note)),
);

const typedWidth = statedSize(picked, "width", 1460);

check("typing a width marks it stated", typedWidth.given.width);
check("and leaves the height alone", !typedWidth.given.height);
check("and uses the number typed", typedWidth.width === 1460);
check("and does not disturb the height", typedWidth.height === picked.height);

const measured = statedSize(statedSize(picked, "width", 1460), "height", 1180);

check(
  "an opening measured on both axes carries no estimate warning",
  !buildOpening(measured).notes.some((note) => /estimat/i.test(note)),
);

/* -------------------------------------------------------------------------- */
/* The details the samples fill in                                             */
/* -------------------------------------------------------------------------- */

check("windows are marked W", referenceFor("casement-window") === "W-01");
check("doors are marked D", referenceFor("hinged-door") === "D-01");
check("partitions are marked P", referenceFor("glass-partition") === "P-01");
check(
  "no sample is left with the schema's placeholder reference",
  OPENING_SAMPLES.every(
    (sample) => openingSample(sample.kind).reference !== "Opening",
  ),
);

// The panel count comes from `defaultOpening`, not from the sample. A fixed
// light with two panels has an interlock down the middle of a window that does
// not open, which is the exact failure this indirection avoids.
check(
  "a fixed light has one panel and none of it opens",
  openingSample("fixed-window").panels === 1 &&
    openingSample("fixed-window").opening === 0,
);
check(
  "a casement window opens",
  openingSample("casement-window").opening > 0,
);

check(
  "every sample picks a system that can build its kind",
  OPENING_SAMPLES.every((sample) => {
    const spec = openingSample(sample.kind);
    const system = profileSystems[spec.system];
    return (system.kinds as readonly OpeningKind[]).includes(sample.kind);
  }),
);

check(
  "the first size is the one the catalogue lists first",
  OPENING_SAMPLES.every((sample) => {
    const first = firstSize(sample.kind);
    return (
      first.width === sample.sizes[0]?.width &&
      first.height === sample.sizes[0]?.height
    );
  }),
);

check(
  "the title carries the size a fabricator needs to see",
  sampleTitle(openingSample("sliding-door", { width: 2400, height: 2700 })) ===
    "Sliding door, 2400 × 2700 mm",
  sampleTitle(openingSample("sliding-door", { width: 2400, height: 2700 })),
);

/* -------------------------------------------------------------------------- */
/* Quantity                                                                    */
/* -------------------------------------------------------------------------- */

// Six windows cut from shared bars waste less than six windows cut separately.
// That is the reason quantity lives on the spec rather than being a multiplier
// applied to the answer afterwards.
//
// Measured in metres bought, not bars. Bar count is the wrong yardstick: the
// packer chooses the stock length that wastes least, and a batch that switches
// from 5.8 m bars to 3 m bars buys *more* bars and less aluminium. Six windows
// come to 38 bars against 36 for six separate orders, and are still cheaper.
const oneWindow = packLinear(
  buildOpening(openingSample("sliding-window", { quantity: 1 })).profiles,
);
const sixWindows = packLinear(
  buildOpening(openingSample("sliding-window", { quantity: 6 })).profiles,
);

const metres = (stock: typeof oneWindow) =>
  stock.reduce((sum, entry) => sum + entry.purchasedMetres, 0);
const waste = (stock: typeof oneWindow) => {
  const bought = metres(stock);
  const needed = stock.reduce((sum, entry) => sum + entry.requiredMetres, 0);
  return (bought - needed) / bought;
};

check(
  "six windows buy more aluminium than one",
  metres(sixWindows) > metres(oneWindow),
  `${metres(sixWindows).toFixed(2)} vs ${metres(oneWindow).toFixed(2)}`,
);
check(
  "but less than six separate orders",
  metres(sixWindows) < metres(oneWindow) * 6,
  `${metres(sixWindows).toFixed(2)} vs ${(metres(oneWindow) * 6).toFixed(2)}`,
);
check(
  "and waste a smaller share of it",
  waste(sixWindows) < waste(oneWindow),
  `${(waste(sixWindows) * 100).toFixed(1)}% vs ${(waste(oneWindow) * 100).toFixed(1)}%`,
);

/* -------------------------------------------------------------------------- */
/* The panel reaches the engine                                                */
/* -------------------------------------------------------------------------- */

// The whole point of this change. The engine existed and no component imported
// it, so it shipped in every bundle and was reachable from nothing.
const panel = readFileSync(
  "src/features/berchuma-studio/components/openings/opening-panel.tsx",
  "utf8",
);

// Matched as calls, not as words. The first version of these looked for the
// bare identifier and a mutation that deleted both call sites survived, because
// the name was still sitting in a comment two lines above.
check(
  "the opening panel calls buildOpening",
  /\bbuildOpening\(/.test(panel),
);
check("the opening panel packs bars", /\bpackLinear\(/.test(panel));
check(
  "the opening panel offers the samples",
  /\bOPENING_SAMPLES\.map\(/.test(panel),
);
check(
  "typing a dimension goes through statedSize",
  /\bstatedSize\(/.test(panel),
  "otherwise a picked size gets marked as measured",
);
check(
  "both dimensions do",
  (panel.match(/\bstatedSize\(/g) ?? []).length >= 2,
  "width and height are separate fields and each has to mark itself",
);

const start = readFileSync(
  "src/features/berchuma-studio/components/start-panel.tsx",
  "utf8",
);
check(
  "the start panel offers the window route",
  /OpeningPanel/.test(start) && /Window or door/.test(start),
);

function formatIssues(result: { success: boolean; error?: { issues: unknown[] } }) {
  return result.success ? "" : JSON.stringify(result.error?.issues ?? []);
}

/* -------------------------------------------------------------------------- */

if (failures.length > 0) {
  console.error(`\n${failures.length} failed:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passed} passed, ${failures.length} failed\n`);
  process.exit(1);
}

console.log(`\n✓ ${passed} opening-sample checks passed\n`);
