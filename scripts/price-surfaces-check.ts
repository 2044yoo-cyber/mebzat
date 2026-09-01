/**
 * The price book, where members can finally see it.
 *
 *   npx tsx scripts/price-surfaces-check.ts
 *
 * Distinct from `price-book-check.ts`, which covers the resolver and the
 * matching. This one is about the two places the book is now *shown*: the
 * reference beside a Price Exchange listing, and the queue an administrator
 * verifies from.
 *
 * `material_prices` has been queried by the AI, the BOQ engine and the takeoff
 * since migration 0041, and by none of the pages a member opens. Two things
 * follow from wiring it up, and both are about honesty rather than plumbing:
 * a verified figure and a planning baseline from the seed workbook must never
 * render identically, and verifying a price must be an act somebody performs
 * rather than something that happens.
 */

import "./lib/allow-server-only.ts";

import { readFileSync } from "node:fs";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const reader = readFileSync("src/lib/data/price-book.ts", "utf8");
const note = readFileSync("src/components/pricing/reference-price.tsx", "utf8");
const actions = readFileSync("src/app/admin/prices/actions.ts", "utf8");
const page = readFileSync("src/app/admin/prices/page.tsx", "utf8");
const listing = readFileSync("src/app/price-exchange/[id]/page.tsx", "utf8");
const queue = readFileSync("src/components/pricing/verification-queue.tsx", "utf8");

/* -------------------------------------------------------------------------- */
/* The Price Exchange actually reads the book                                 */
/* -------------------------------------------------------------------------- */

check(
  "the listing page reads the price book",
  /referenceFor\(/.test(listing),
  "this is the wiring that was missing since 0041",
);
check(
  "and renders the reference beside the asking price",
  /<ReferencePriceNote/.test(listing),
);
check(
  "the reference is narrowed by city",
  /listing\.location_city/.test(listing),
  "cement in Addis and cement in Mekelle are different prices",
);
check(
  "the reader is server-only",
  /^import "server-only";/m.test(reader),
);

/* -------------------------------------------------------------------------- */
/* A baseline is never dressed up as a market price                           */
/* -------------------------------------------------------------------------- */

// The seed workbook contributed hundreds of planning baselines. Rendering one
// as though an administrator had checked it would turn teaching numbers into
// what look like Medosha's official prices.
check(
  "every status has its own wording",
  ["admin_verified", "supplier_submitted", "web_sourced", "educational_estimate", "expired"].every(
    (status) => note.includes(status),
  ),
);
check(
  "a planning baseline says so",
  /Planning baseline only — not a market price/.test(note),
);
check(
  "an unverified submission says so",
  /not yet verified/.test(note),
);
check(
  "a verified price is the only one that claims Medosha checked it",
  /Verified by Medosha/.test(note) &&
    (note.match(/Verified by Medosha/g) ?? []).length === 1,
);
check(
  "the provenance line is never optional",
  !/statusNote\([\s\S]{0,80}\?\s/.test(note),
  "a member acting on one of these should know whether a person checked it",
);

// A comparison is a fact, not a verdict.
// Comments stripped: the component explains *why* it does not say "overpriced",
// and matching that explanation fails the check on the sentence documenting why
// it passes.
const noteCode = note
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

check(
  "the comparison states a percentage, not a judgement",
  /above|below/.test(noteCode) &&
    !/overpriced|too expensive|bad deal|rip.?off/i.test(noteCode),
  "Medosha does not know the supplier's costs",
);

/* -------------------------------------------------------------------------- */
/* Superseded and educational rows stay out of the way                        */
/* -------------------------------------------------------------------------- */

check(
  "superseded prices are excluded",
  (reader.match(/\.is\("superseded_by", null\)/g) ?? []).length >= 3,
  "one material at two prices with no way to tell which is current",
);
// Scoped to `pendingVerification`. `pendingCount` filters identically, so a
// whole-file match passes while the list itself has lost its filter — and the
// badge would then be right about a queue full of the wrong rows.
const queueFn = reader.slice(
  reader.indexOf("export async function pendingVerification"),
  reader.indexOf("export async function pendingCount"),
);

check(
  "the verification queue excludes planning baselines",
  /\.in\("data_status", \["supplier_submitted", "web_sourced"\]\)/.test(queueFn),
  "hundreds of seed rows would bury the submissions that are actually waiting",
);
check(
  "and the count agrees with the list",
  /\.in\("data_status", \["supplier_submitted", "web_sourced"\]\)/.test(
    reader.slice(reader.indexOf("export async function pendingCount")),
  ),
  "a badge counting different rows from the list is worse than no badge",
);
check(
  "the queue is oldest first",
  /\.order\("created_at", \{ ascending: true \}\)/.test(reader),
  "somebody has been waiting longest",
);

/* -------------------------------------------------------------------------- */
/* Verifying is guarded, and rejecting destroys nothing                       */
/* -------------------------------------------------------------------------- */

check(
  "the actions check for an administrator",
  /is_admin/.test(actions),
);
check(
  "and the page checks too",
  /is_admin/.test(page),
  "a page that renders the queue to anyone has already leaked it",
);
check(
  "a non-admin gets a 404, not a redirect",
  /notFound\(\)/.test(page) && !/redirect\(/.test(page),
  "a redirect tells somebody probing the URL that the page is worth returning to",
);
check(
  "verifying records who and when",
  /verified_by: gate\.userId/.test(actions) && /verified_at:/.test(actions),
  "the table's own constraint requires both",
);
// Both functions, separately. `rejectPrice` carries the same guard, so a check
// against the whole file passes while `verifyPrice` has silently lost it —
// which is the half that matters, because it is the one that grants authority.
const fn = (name: string) => {
  const start = actions.indexOf(`export async function ${name}`);
  const rest = actions.slice(start + 1);
  const next = rest.indexOf("\nexport async function");
  return next === -1 ? rest : rest.slice(0, next);
};

for (const name of ["verifyPrice", "rejectPrice"]) {
  check(
    `${name} treats an empty update as a failure`,
    /if \(!data\?\.length\)/.test(fn(name)),
    "a policy failure returns zero rows and looks exactly like success",
  );
}

// Nothing is deleted, ever.
check(
  "rejecting deletes nothing",
  !/\.delete\(\)/.test(actions),
  "a rejected submission is still a record of what somebody quoted that day",
);
check(
  "rejecting demotes rather than removes",
  /data_status: "web_sourced"/.test(actions),
);
check(
  "the queue offers no delete",
  !/delete/i.test(queue.replace(/\/\*[\s\S]*?\*\//g, "")),
);

/* -------------------------------------------------------------------------- */

if (failures.length > 0) {
  console.error(`\n${failures.length} failed:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passed} passed, ${failures.length} failed\n`);
  process.exit(1);
}

console.log(`\n✓ ${passed} price surface checks passed\n`);
