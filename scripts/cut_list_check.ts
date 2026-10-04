/**
 * The cut list, when the design cannot be cut.
 *
 *   npx tsx scripts/cut_list_check.ts
 *
 * A design with a panel bigger than any stocked sheet is not a broken design.
 * It is a thing a person is allowed to draw and a thing a workshop needs
 * telling about — most easily by naming the piece. `buildExport` says so by
 * throwing, which is reasonable for a function that returns a workbook, and
 * the pages that call it have to catch it. One of them did not, so pressing
 * Cut list returned a 500 and the reader got "Something went wrong" and a
 * reference number.
 */

import { readFileSync } from "node:fs";

import { buildCutList } from "../src/features/berchuma-studio/services/cutlist.ts";
import { buildExport } from "../src/features/berchuma-studio/services/exports.ts";
import { buildParts } from "../src/features/berchuma-studio/services/geometry.ts";
import { duplicateCabinet } from "../src/features/berchuma-studio/services/operations.ts";
import { startingDesign } from "../src/features/berchuma-studio/services/starting-designs.ts";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// ---------------------------------------------------------------------------
// A kitchen long enough that its worktop will not come off a sheet
// ---------------------------------------------------------------------------

const kitchen = startingDesign("kitchen");
const cabinets = (kitchen as unknown as { cabinets: { id: string }[] }).cabinets;

/** The first edit that makes a run too long to cut. */
const oversized = (() => {
  for (const cabinet of cabinets) {
    const next = duplicateCabinet(kitchen, cabinet.id);
    const list = buildCutList(next, buildParts(next));
    if (!list.buildable) return { spec: next, list };
  }
  return null;
})();

check(
  "adding a unit to a kitchen can make a run too long to cut",
  oversized !== null,
  "if this stops being reachable the rest of this file is checking nothing — a worktop is one piece and a sheet is 3000mm, so a long enough run has to overflow",
);

if (oversized) {
  check(
    "and the cut list says so rather than pretending",
    oversized.list.buildable === false,
  );

  const stuck = oversized.list.byBoard.flatMap((board) =>
    board.nesting.unplaced.map((piece) => piece),
  );

  check(
    "it names the pieces that will not fit",
    stuck.length > 0,
    `${stuck.length} of them`,
  );
  check(
    "and says why each one will not, in millimetres",
    stuck.every((piece) => /\d+ × \d+ mm/.test(piece.reason)),
    stuck[0]?.reason ?? "",
  );
  check(
    "the piece is named in a way somebody can find it",
    stuck.every((piece) => (piece.label?.length ?? 0) > 2),
    stuck.map((p) => p.label).join(", "),
  );

  // The precondition for everything below.
  let threw = false;
  try {
    buildExport({ spec: oversized.spec, rates: [], preparedFor: "check" });
  } catch {
    threw = true;
  }
  check(
    "building the export throws for such a design",
    threw,
    "which is fine for a function that returns a workbook, and is why its callers have to ask first",
  );
}

// ---------------------------------------------------------------------------
// The page that used to return a 500
// ---------------------------------------------------------------------------

{
  const page = code("src/app/designs/[slug]/cut-list/page.tsx");

  check(
    "the page asks whether the design can be cut before exporting it",
    // Presence before ordering. `indexOf` answers -1 for a guard that has been
    // deleted, and -1 comes before everything, so the comparison on its own is
    // satisfied by the very change it exists to catch.
    page.includes("if (!draft.buildable)") &&
      page.indexOf("if (!draft.buildable)") < page.indexOf("buildExport({"),
    "calling buildExport first and nothing else is a 500 and a reference number",
  );
  check(
    "and returns something to read when it cannot",
    /return <CannotBeCut design=\{design\} cutList=\{draft\} \/>;/.test(page),
  );

  const panel = page.slice(page.indexOf("function CannotBeCut"));
  check("the explanation is findable", panel.length > 0);
  check(
    "it lists the pieces the nesting could not place",
    /board\.nesting\.unplaced\.map/.test(panel),
    "the information was always computed — it was being thrown away with the exception",
  );
  check(
    "each line says which piece, on which board, and why",
    /\{piece\.label\}[\s\S]{0,60}?\{piece\.board\}[\s\S]{0,40}?\{piece\.reason\}/.test(panel),
  );
  check(
    "and it offers the one action that helps",
    /Open in the studio/.test(panel) && /Make the piece smaller/.test(panel),
    "a Try again button on a deterministic failure does the same thing twice",
  );
  check(
    "it is not dressed up as a crash",
    !/Something went wrong|unexpected error/i.test(panel),
    "nothing has gone wrong with the software; somebody has drawn a panel bigger than a sheet",
  );
}

// ---------------------------------------------------------------------------
// The workbook the same design cannot produce
// ---------------------------------------------------------------------------

{
  const route = code("src/app/api/studio/designs/[slug]/cut-list/route.ts");
  check(
    "the download answers with the reason rather than a 500",
    /status: 422/.test(route) && /catch \(error\)/.test(route),
    "a 500 on a download is a browser offering to retry something that cannot succeed",
  );
  check(
    "and passes on the sentence the exporter wrote",
    /error instanceof Error\s*\n?\s*\? error\.message/.test(route),
  );
}

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}x${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}cut list: a panel too big for a sheet is a sentence, not a 500${RESET}`);
