/**
 * The control room: what it may not do.
 *
 *   npx tsx scripts/admin_check.ts
 *
 * Two rules here fail quietly and are the reason for the file.
 *
 * A dashboard that invents a number is worse than one that shows nothing,
 * because somebody makes a decision on it. So no figure on any admin page may
 * be a literal — every one has to be counted from a live table, and a source
 * that is absent has to say so rather than render a zero.
 *
 * And every server action under /admin has to re-check isAdmin itself. A
 * server action is a public endpoint with a URL; the button living behind the
 * admin layout is not the gate, and an action that trusts the layout is an
 * unauthenticated write with a friendly name.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/**
 * The body of each exported async function, by name.
 *
 * Asserting against a whole file is not enough here and was not: removing the
 * admin check from one action passed, because a sibling in the same file still
 * had one. A guard belongs to a function, so it is checked on the function.
 */
function exportedBodies(source: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const pattern = /export async function (\w+)\s*\([\s\S]*?\)[^{]*\{/g;

  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    let depth = 1;
    let index = match.index! + match[0].length;

    while (index < source.length && depth > 0) {
      if (source[index] === "{") depth += 1;
      else if (source[index] === "}") depth -= 1;
      index += 1;
    }

    bodies.set(name, source.slice(match.index! + match[0].length, index));
  }

  return bodies;
}

/**
 * Private functions in this file that hold an admin check themselves.
 *
 * An exported action may delegate to one of these instead of repeating the
 * guard. Resolved by reading the helper rather than by naming it, so a helper
 * that later loses its check stops satisfying its callers too.
 */
function guardedHelpers(source: string): string[] {
  const names: string[] = [];
  const pattern = /^(?:async )?function (\w+)\s*\([\s\S]*?\)[^{]*\{/gm;

  for (const match of source.matchAll(pattern)) {
    let depth = 1;
    let index = match.index! + match[0].length;
    while (index < source.length && depth > 0) {
      if (source[index] === "{") depth += 1;
      else if (source[index] === "}") depth -= 1;
      index += 1;
    }
    const body = source.slice(match.index! + match[0].length, index);

    // The same three spellings the callers are held to, so a helper and its
    // caller cannot be judged by different rules.
    const guards =
      /isAdmin\(\)/.test(body) ||
      /await operator\(\)/.test(body) ||
      (/select\("is_admin"\)/.test(body) && /!\w+\?\.is_admin/.test(body));

    if (guards) names.push(match[1]);
  }

  return names;
}

/** Comments stripped: an explanation must not satisfy its own assertion. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const adminFiles = walk("src/app/admin");
const adminLib = walk("src/lib/admin");

// ---------------------------------------------------------------------------
// 1. Every action re-checks
// ---------------------------------------------------------------------------

const actionFiles = adminFiles.filter((path) => path.endsWith("actions.ts"));
check("there are admin actions to check", actionFiles.length >= 3, String(actionFiles.length));

for (const path of actionFiles) {
  const source = code(path);
  check(`${path} is a server file`, source.includes('"use server"'));

  // Every exported action, and whether the gate is reachable from it. The
  // moderation actions funnel through `operator()`, which is isAdmin plus the
  // user — that counts.
  const exported = source.match(/export async function (\w+)/g) ?? [];
  check(`${path} exports actions`, exported.length > 0);
  // Three spellings, one property: the caller is confirmed to be an admin
  // before anything is written. `isAdmin()` is the shared helper, `operator()`
  // is the moderation queue's wrapper around it, and prices/actions.ts reads
  // profiles.is_admin inline — older, and gated, so this asks for the guard
  // rather than for one particular way of writing it.
  //
  // Per function, not per file. An action that trusts a sibling's check is an
  // unauthenticated write with a friendly name.
  for (const [name, body] of exportedBodies(source)) {
    const gated =
      /isAdmin\(\)/.test(body) ||
      /await operator\(\)/.test(body) ||
      (/select\("is_admin"\)/.test(body) && /!\w+\?\.is_admin/.test(body)) ||
      // A private helper in the same file may hold the check for its callers,
      // so a delegation counts — but only to a helper that actually has one.
      // Naming the helper explicitly would let this pass for a helper that
      // later lost its check.
      guardedHelpers(source).some((helper) =>
        new RegExp(`\\b${helper}\\s*\\(`).test(body),
      );

    check(`${path}: ${name} confirms the caller is an admin`, gated);
  }
}

for (const path of adminLib) {
  const source = code(path);
  check(`${path} refuses a non-admin`, /isAdmin\(\)/.test(source), path);
}

// ---------------------------------------------------------------------------
// 2. No invented numbers
//
// The failure this prevents: a tile reading "2,483 visitors" on a deployment
// with ten accounts. Every figure has to come from a query.
// ---------------------------------------------------------------------------

const pages = adminFiles.filter((path) => path.endsWith("page.tsx"));
check("there are admin pages", pages.length >= 3, String(pages.length));

for (const path of pages) {
  const source = code(path);

  // A number of three digits or more, formatted as a person reads it, has no
  // business being a literal in a dashboard.
  const suspicious = source.match(/["'>\s]\d{1,3},\d{3}/g) ?? [];
  check(`${path} hard-codes no thousands figure`, suspicious.length === 0, suspicious.join(" "));

  // The overview is the one that shows figures at all.
  if (path.endsWith("admin/page.tsx")) {
    check("the overview gets its figures from a query", /getOverview\(\)/.test(source));
    check(
      "and says so when a source is missing rather than showing zero",
      /Unavailable/.test(source),
    );
  }
}

const overview = code("src/lib/admin/overview.ts");
check("every overview figure is a count or a sum",
  /count: "exact", head: true/.test(overview) && /reduce\(/.test(overview));
check("a missing table reads as unavailable, not as zero",
  /if \(error\) return null;/.test(overview));

// ---------------------------------------------------------------------------
// 3. No admin-only copy of anything
//
// A property in the admin list and the same property on its public page must
// be one record. The way that goes wrong is an admin table, so: there is not
// one.
// ---------------------------------------------------------------------------

for (const path of [...adminLib, ...actionFiles]) {
  const source = code(path);
  check(`${path} writes no admin-only table`,
    !/from\("admin_[a-z_]+"\)/.test(source));
}

const properties = code("src/lib/admin/properties.ts");
check("the admin property list reads the real table",
  /from\("properties"\)/.test(properties));

const propertyActions = code("src/app/admin/properties/actions.ts");
check("withdrawing writes the status the public site already reads",
  /from\("properties"\)/.test(propertyActions) && /status/.test(propertyActions));
check("and uses a status the schema already has, not a new one",
  /"withdrawn"/.test(propertyActions) && /"available"/.test(propertyActions));
check("it does not invent a hidden flag",
  !/is_hidden|admin_hidden|hidden_by_admin/.test(propertyActions));

// ---------------------------------------------------------------------------
// 4. Restricting an account goes through the guarded function
//
// A plain UPDATE would be refused by the trigger from 0063. An action that
// tried one would fail at runtime, which is a worse way to find out.
// ---------------------------------------------------------------------------

const userActions = code("src/app/admin/users/actions.ts");
check("restricting goes through set_account_restriction",
  /rpc\("set_account_restriction"/.test(userActions));
check("and never updates the column directly",
  !/from\("profiles"\)[\s\S]{0,200}\.update\(/.test(userActions));
check("a reason is required before restricting",
  /if \(!trimmed\)/.test(userActions));
check("reinstating passes null rather than a second function",
  /until: null/.test(userActions));

// ---------------------------------------------------------------------------
// 5. The gate is on the layout, not on each page
// ---------------------------------------------------------------------------

const layout = code("src/app/admin/layout.tsx");
check("the admin layout checks isAdmin", /isAdmin\(\)/.test(layout));
check("and a non-admin gets a 404 rather than a 403",
  /notFound\(\)/.test(layout) && !/403|forbidden/i.test(layout));

// ---------------------------------------------------------------------------
// 6. A restriction actually stops a write
// ---------------------------------------------------------------------------

// Per function again: createTour losing its check while updateTour keeps one
// is exactly the shape this missed the first time.
const WRITES_THAT_PUBLISH: [string, string[]][] = [
  ["src/app/tours/actions.ts", ["createTour", "updateTour"]],
  ["src/app/tours/floor-plan-actions.ts", ["addFloorPlan"]],
];

for (const [path, names] of WRITES_THAT_PUBLISH) {
  const bodies = exportedBodies(code(path));
  for (const name of names) {
    const body = bodies.get(name) ?? "";
    check(`${path}: ${name} exists`, body.length > 0);
    check(`${path}: ${name} refuses a restricted account`,
      /accountRestriction\(/.test(body) && /restrictionMessage\(/.test(body));
  }
}

const restriction = code("src/lib/auth/restriction.ts");
check("an expired restriction is not a restriction",
  /getTime\(\) > Date\.now\(\)/.test(restriction));
check("a deployment without the column is not restricted",
  /if \(error \|\| !data\?\.restricted_until\) return CLEAR;/.test(restriction));
check("the message says when it ends",
  /until \? ` until \$\{until\}`/.test(restriction));

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
}

console.log(
  `\n${failures.length === 0 ? GREEN : RED}${passed} passed, ${failures.length} failed${RESET}` +
    `\n${DIM}admin: the real records, and no invented numbers${RESET}\n`,
);

process.exit(failures.length === 0 ? 0 : 1);
