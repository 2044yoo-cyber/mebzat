/**
 * The manufacturing geometry, from one engine, for any cabinet.
 *
 *   npx tsx scripts/cabinet_geometry_check.ts
 *
 * ## What this is for
 *
 * Every board dimension Medosha produces — on the 3D model, in the cut list, in
 * the PDF and the spreadsheet, in the sheet nesting, in the price — comes from
 * `buildParts`. That is the architecture, and it is worth something only if the
 * formulas inside it are general. A number that happens to be right for the
 * cabinet somebody tested against is not a formula.
 *
 * So this exercises the engine against a reference cabinet whose every
 * dimension is known by hand, and then changes each input in turn and requires
 * the dependent numbers to move. The reference is a test, not a definition:
 * nothing below is allowed to be a constant in the engine, and the sweep is
 * what proves it.
 *
 * ## The reference
 *
 *     1400 × 280 × 500 mm carcass, one bay, one full-width drawer
 *     15 mm board, 4 mm back, 12 mm runner clearance per side
 *
 *     inside width        1400 − 2 × 15   = 1370
 *     drawer box width    1370 − 2 × 12   = 1346
 *     drawer front/back   1346 − 2 × 15   = 1316
 *     drawer bottom       1346 (pinned under the box)
 *     back panel          1400 × 280 (overlaid)
 *
 * and the same cabinet in 18 mm board:
 *
 *     inside width        1400 − 2 × 18   = 1364
 *     drawer box width    1364 − 2 × 12   = 1340
 *     drawer front/back   1340 − 2 × 18   = 1304
 */

import { readFileSync } from "node:fs";

import { buildParts } from "../src/features/berchuma-studio/services/geometry.ts";
import { buildCutList } from "../src/features/berchuma-studio/services/cutlist.ts";
import { tvUnitExample } from "../src/features/berchuma-studio/services/examples.ts";
import { bayLabelSuffix } from "../src/features/berchuma-studio/services/bay-layout.ts";
import {
  DEFAULT_DRAWER_RUNNER,
  resolveDrawerConstruction,
} from "../src/features/berchuma-studio/services/drawer-construction.ts";
import { constructionMethods } from "../src/features/berchuma-studio/services/wardrobe-materials.ts";
import type { DesignSpec } from "../src/features/berchuma-studio/types/spec.ts";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// ---------------------------------------------------------------------------
// A cabinet, built to order
// ---------------------------------------------------------------------------

type Bayspec = { width: number; drawers?: number; shelves?: number };

function cabinet(options: {
  width?: number;
  height?: number;
  depth?: number;
  thickness?: number;
  bays?: Bayspec[];
  backFixing?: "overlay" | "inset";
  drawerBottomFixing?: "under" | "grooved";
  sideClearance?: number;
}): DesignSpec {
  const width = options.width ?? 1400;
  const height = options.height ?? 280;
  const depth = options.depth ?? 500;
  const t = options.thickness ?? 15;

  const spec = structuredClone(tvUnitExample()) as DesignSpec;
  spec.carcass.board = { ...spec.carcass.board, thickness: t };
  if (options.backFixing) spec.carcass.backFixing = options.backFixing;
  if (options.drawerBottomFixing) {
    spec.carcass.drawerBottomFixing = options.drawerBottomFixing;
  }

  if (options.sideClearance !== undefined) {
    // Through the hardware, which is where a runner's clearance lives. Setting
    // it any other way would be testing a path the application never uses.
    spec.hardware = [
      {
        id: "runner-test",
        label: "Test runner",
        kind: "drawer_runner",
        unit: "pair",
        priceKey: "Drawer runner",
        fallbackRate: 280,
        drawerRunner: {
          ...DEFAULT_DRAWER_RUNNER,
          sideClearance: options.sideClearance,
        },
      },
      ...spec.hardware.filter((item) => item.kind !== "drawer_runner"),
    ];
  }

  const bays = options.bays ?? [{ width: width - 2 * t, drawers: 1 }];

  spec.cabinets = [
    {
      ...spec.cabinets[0],
      id: "cab",
      label: "Cabinet",
      position: { x: 0, y: 0, z: 0 },
      size: { width, height, depth },
      plinthHeight: 0,
      runId: undefined,
      offset: undefined,
      bays: bays.map((bay, index) => ({
        id: `bay-${index + 1}`,
        width: bay.width,
        fitting: bay.drawers
          ? { kind: "drawers" as const, count: bay.drawers }
          : { kind: "shelves" as const, count: bay.shelves ?? 1, adjustable: true },
        door: "none" as const,
        doorLeaves: 1,
      })),
    },
  ];
  spec.envelope = { width, height, depth };
  return spec;
}

/** Every part of one role, as `{length, width}` pairs. */
function partsOf(spec: DesignSpec, role: string) {
  return buildParts(spec).parts.filter((part) => part.role === role);
}

function one(spec: DesignSpec, role: string) {
  const found = partsOf(spec, role);
  return found[0] ?? null;
}

// ---------------------------------------------------------------------------
// 1. The reference cabinet, by hand
// ---------------------------------------------------------------------------

for (const [t, insideWidth, boxWidth, endPanel] of [
  [15, 1370, 1346, 1316],
  [18, 1364, 1340, 1304],
] as const) {
  const spec = cabinet({ thickness: t });
  const label = `${t} mm board`;

  const bottom = one(spec, "bottom");
  check(
    `${label}: the inside width is the carcass less two boards`,
    bottom?.length === insideWidth,
    `${bottom?.length}, wanted ${insideWidth}`,
  );

  const base = one(spec, "drawer_base");
  check(
    `${label}: the drawer box is the opening less a runner each side`,
    base?.length === boxWidth,
    `${base?.length}, wanted ${boxWidth}`,
  );

  const ends = one(spec, "drawer_back");
  check(
    `${label}: the drawer front and back fit between the sides`,
    ends?.length === endPanel,
    `${ends?.length}, wanted ${endPanel}`,
  );
  check(
    `${label}: and there are two of them`,
    ends?.quantity === 2,
    `${ends?.quantity}`,
  );

  const sides = one(spec, "drawer_side");
  check(`${label}: the box has two sides`, sides?.quantity === 2);
  check(
    `${label}: whose length is the box depth, not the cabinet's`,
    (sides?.length ?? 0) > 0 && (sides?.length ?? 0) < 500,
    `${sides?.length} in a 500 deep cabinet`,
  );

  const back = one(spec, "back");
  check(
    `${label}: an overlaid back covers the whole carcass`,
    back?.width === 1400 && back?.length === 280,
    `${back?.width} × ${back?.length}`,
  );
  check(
    `${label}: and is cut from the back board, not the carcass board`,
    back?.board.thickness === 4,
    `${back?.board.thickness} mm`,
  );
}

// ---------------------------------------------------------------------------
// 2. Nothing above is a constant in the engine
//
// The reference numbers are expectations, not definitions. If any of them is
// written into the geometry the sweep below cannot fail, so the sweep is what
// this section is.
// ---------------------------------------------------------------------------

{
  const at = (t: number) => one(cabinet({ thickness: t }), "drawer_base")?.length ?? 0;
  const widths = [12, 15, 16, 18, 25].map(at);
  check(
    "a thicker board makes a narrower drawer, every time",
    widths.every((width, i) => i === 0 || width < widths[i - 1]),
    widths.join(" → "),
  );
  check(
    "and the step is exactly two boards",
    at(15) - at(18) === 2 * (18 - 15),
    `${at(15)} − ${at(18)}`,
  );

  const byWidth = [900, 1400, 2400].map(
    (width) => one(cabinet({ width }), "drawer_base")?.length ?? 0,
  );
  check(
    "a wider cabinet makes a wider drawer, one for one",
    byWidth[1] - byWidth[0] === 500 && byWidth[2] - byWidth[1] === 1000,
    byWidth.join(" → "),
  );

  const byClearance = [8, 12, 20].map(
    (sideClearance) =>
      one(cabinet({ sideClearance }), "drawer_base")?.length ?? 0,
  );
  check(
    "a different runner moves the box by twice its clearance",
    byClearance[0] - byClearance[1] === 8 &&
      byClearance[1] - byClearance[2] === 16,
    byClearance.join(" → "),
  );

  const deep = one(cabinet({ depth: 700 }), "drawer_side")?.length ?? 0;
  const shallow = one(cabinet({ depth: 400 }), "drawer_side")?.length ?? 0;
  check(
    "a deeper cabinet takes a longer runner and a longer box side",
    deep > shallow,
    `${shallow} at 400 deep, ${deep} at 700`,
  );

  const engine = [
    code("src/features/berchuma-studio/services/geometry.ts"),
    code("src/features/berchuma-studio/services/drawer-construction.ts"),
  ].join("\n");

  // The reference dimensions, and the ones from the earlier measured cabinet
  // this engine was first written against. None of them belongs in it.
  for (const magic of ["1346", "1316", "1370", "134.6", "131.6", "40.79", "1400"]) {
    check(
      `the engine does not contain the reference number ${magic}`,
      !new RegExp(`\\b${magic.replace(".", "\\.")}\\b`).test(engine),
    );
  }
}

// ---------------------------------------------------------------------------
// 3. A drawer belongs to its bay, not to the cabinet
// ---------------------------------------------------------------------------

{
  const t = 15;
  // Three bays of different widths, each with its own drawers.
  const spec = cabinet({
    thickness: t,
    bays: [
      { width: 400, drawers: 2 },
      { width: 600, shelves: 2 },
      { width: 1400 - 2 * t - 2 * t - 400 - 600, drawers: 3 },
    ],
  });

  const bases = partsOf(spec, "drawer_base");
  check("every drawer in the design gets a bottom", bases.length === 5, `${bases.length}`);

  const inBay = (id: string) => bases.filter((part) => part.bayId?.startsWith(id));
  check(
    "a drawer in the 400 bay is cut from the 400 bay",
    inBay("bay-1").every((part) => part.length === 400 - 2 * 12),
    inBay("bay-1").map((p) => p.length).join(", "),
  );
  check(
    "a drawer in the 340 bay is cut from the 340 bay",
    inBay("bay-3").every((part) => part.length === 340 - 2 * 12),
    inBay("bay-3").map((p) => p.length).join(", "),
  );
  check(
    "no drawer is cut from the whole cabinet",
    bases.every((part) => part.length < 1400 - 2 * t),
    "a drawer sized to the carcass is the fault this exists to catch",
  );

  const shelves = partsOf(spec, "shelf");
  check(
    "a shelf is the clear width of the bay it sits in",
    shelves.length > 0 && shelves.every((part) => part.length === 600),
    shelves.map((p) => p.length).join(", "),
  );

  // Three drawers sharing one bay are not three copies of the first.
  const third = partsOf(spec, "drawer_side").filter((part) =>
    part.bayId?.startsWith("bay-3"),
  );
  check(
    "drawers in one bay are each given their own height",
    new Set(third.map((part) => part.width)).size > 1,
    third.map((p) => p.width).join(", "),
  );

  const backs = partsOf(spec, "back");
  const backWidth = backs.reduce((total, part) => total + part.width, 0);
  check(
    "the back is made in pieces that add up to the cabinet",
    Math.abs(backWidth - 1400) <= backs.length,
    `${backWidth} across ${backs.length} pieces`,
  );
}

// ---------------------------------------------------------------------------
// 4. A bay is named only when there is another one to tell it from
// ---------------------------------------------------------------------------

{
  const single = cabinet({});
  const labels = buildParts(single).parts.map((part) => part.label);
  check(
    "a one-bay cabinet names no bay at all",
    labels.every((label) => !/bay/i.test(label)),
    labels.filter((label) => /bay/i.test(label)).join(" | "),
  );
  check(
    "and it still says what each part is",
    labels.includes("Back panel") && labels.some((l) => l.startsWith("Drawer 1")),
    labels.join(" | ").slice(0, 80),
  );

  const many = cabinet({
    bays: [
      { width: 400, drawers: 1 },
      { width: 400, drawers: 1 },
      { width: 540, shelves: 1 },
    ],
  });
  const manyLabels = buildParts(many).parts.map((part) => part.label);
  check(
    "three bays are named by position",
    manyLabels.includes("Back panel — bay 1") &&
      manyLabels.includes("Back panel — bay 3"),
    manyLabels.filter((l) => l.startsWith("Back panel")).join(" | "),
  );
  check(
    "no label exposes an internal id",
    manyLabels.every((label) => !/bay-\d/.test(label)),
    manyLabels.filter((label) => /bay-\d/.test(label)).join(" | "),
  );

  const cab = many.cabinets[0];
  check(
    "the suffix is empty for a lone bay and positional otherwise",
    bayLabelSuffix({ ...cab, bays: cab.bays.slice(0, 1) }, cab.bays[0].id) === "" &&
      bayLabelSuffix(cab, cab.bays[2].id) === " — bay 3",
    bayLabelSuffix(cab, cab.bays[2].id),
  );
  check(
    "a bay that is not in the cabinet names nothing",
    bayLabelSuffix(cab, "not-a-bay") === "",
  );
}

// ---------------------------------------------------------------------------
// 5. Two constructions, two formulas
// ---------------------------------------------------------------------------

{
  const t = 15;
  const overlaid = one(cabinet({ thickness: t }), "back");
  const inset = one(cabinet({ thickness: t, backFixing: "inset" }), "back");

  check(
    "an inset back is smaller than the carcass, an overlaid one is not",
    (inset?.width ?? 0) < (overlaid?.width ?? 0) &&
      (inset?.length ?? 0) < (overlaid?.length ?? 0),
    `${inset?.width} × ${inset?.length} against ${overlaid?.width} × ${overlaid?.length}`,
  );
  check(
    "by two boards less what it sits into each groove",
    (overlaid?.width ?? 0) - (inset?.width ?? 0) === 2 * (t - 8),
    `${(overlaid?.width ?? 0) - (inset?.width ?? 0)}`,
  );
  // Exactly, not merely smaller. "Smaller" is satisfied by an inset back that
  // has forgotten the groove it sits in, which is a panel 16 mm short of
  // reaching — and that mutation survived a comparison.
  check(
    "the inset back's width is the clear opening plus both grooves",
    inset?.width === 1400 - 2 * t + 2 * 8,
    `${inset?.width}, wanted ${1400 - 2 * t + 2 * 8}`,
  );
  check(
    "and its height is the clear height plus both grooves",
    inset?.length === 280 - 2 * t + 2 * 8,
    `${inset?.length}, wanted ${280 - 2 * t + 2 * 8}`,
  );

  const under = one(cabinet({ thickness: t }), "drawer_base");
  const grooved = one(
    cabinet({ thickness: t, drawerBottomFixing: "grooved" }),
    "drawer_base",
  );
  check(
    "a bottom pinned under the box is the box's own size",
    under?.length === 1346,
    `${under?.length}`,
  );
  check(
    "a grooved bottom is measured between the sides and gains the groove",
    grooved?.length === 1346 - 2 * t + 2 * 6,
    `${grooved?.length}`,
  );
  check(
    "and its depth follows the same rule, not the same number",
    (grooved?.width ?? 0) === (under?.width ?? 0) - 2 * t + 2 * 6,
    `${grooved?.width} against ${under?.width}`,
  );

  check(
    "an old design with no construction settings cuts as it always did",
    constructionMethods({ carcass: {} } as DesignSpec).backFixing === "overlay" &&
      constructionMethods({ carcass: {} } as DesignSpec).drawerBottomFixing ===
        "under",
  );
}

// ---------------------------------------------------------------------------
// 6. Nothing downstream does the arithmetic again
// ---------------------------------------------------------------------------

{
  const spec = cabinet({ thickness: 18 });
  const breakdown = buildParts(spec);
  const cutList = buildCutList(spec, breakdown);

  const boxWidth = one(spec, "drawer_base")?.length ?? 0;
  const inCutList = cutList.rows?.some(
    (row: { length: number }) => Math.round(row.length) === boxWidth,
  );
  check(
    "the cut list prints the dimension the engine calculated",
    Boolean(inCutList),
    `${boxWidth} not found among ${cutList.rows?.length ?? 0} rows`,
  );

  // The consumers, by what they import. A second `buildParts`-shaped function
  // anywhere here would be a second set of formulas free to drift.
  for (const [label, path] of [
    ["the 3D model", "src/features/berchuma-studio/components/viewer/model.tsx"],
    ["the cut-list page", "src/app/designs/[slug]/cut-list/page.tsx"],
    ["the PDF and spreadsheet", "src/features/berchuma-studio/services/exports.ts"],
    ["the quote", "src/features/berchuma-studio/services/quotes.ts"],
    ["the studio itself", "src/features/berchuma-studio/hooks/use-design.ts"],
  ] as const) {
    check(`${label} takes its parts from the engine`, /buildParts\(/.test(code(path)), path);
  }

  const drawerMaths = /openingWidth - 2 \* runner\.sideClearance/;
  const sources = [
    "src/features/berchuma-studio/services/geometry.ts",
    "src/features/berchuma-studio/services/cutlist.ts",
    "src/features/berchuma-studio/services/exports.ts",
    "src/features/berchuma-studio/services/costing.ts",
    "src/features/berchuma-studio/services/nesting.ts",
    "src/features/berchuma-studio/components/viewer/model.tsx",
    "src/features/berchuma-studio/components/viewer/elevation.tsx",
  ].filter((path) => drawerMaths.test(code(path)));
  check(
    "the drawer box width is calculated in exactly one place",
    sources.length === 0,
    `also in ${sources.join(", ")}`,
  );
  check(
    "which is the drawer construction module",
    drawerMaths.test(
      code("src/features/berchuma-studio/services/drawer-construction.ts"),
    ),
  );
}

// ---------------------------------------------------------------------------
// 7. The runner is a purchased product, not a constant
// ---------------------------------------------------------------------------

{
  check(
    "the standard runner leaves 12 mm each side",
    DEFAULT_DRAWER_RUNNER.sideClearance === 12,
    `${DEFAULT_DRAWER_RUNNER.sideClearance}`,
  );

  const narrow = resolveDrawerConstruction({
    openingWidth: 1370,
    openingHeight: 250,
    openingFloor: 0,
    interiorDepth: 496,
    count: 1,
    drawerSideThickness: 15,
    drawerBottomThickness: 4,
    runner: { ...DEFAULT_DRAWER_RUNNER, sideClearance: 25 },
  });
  check(
    "a runner that needs more room gets it",
    narrow.boxWidth === 1370 - 50,
    `${narrow.boxWidth}`,
  );

  const catalogue = code("src/features/berchuma-studio/types/catalogue.ts");
  check(
    "no catalogue runner is still on the old 13 mm clearance",
    !/sideClearance: 13/.test(catalogue),
    "13 takes 2 mm off every drawer box in every design",
  );
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}geometry: one engine, and the reference is only a test${RESET}`);
