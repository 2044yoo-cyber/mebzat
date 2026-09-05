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
    if (isGuarded(body)) names.push(match[1]);
  }

  return names;
}

/**
 * Whether this body confirms the caller before it does anything.
 *
 * Four spellings, one property. `canAdmin("area")` is the per-area check that
 * replaced the blunt boolean; `adminIdentity()` is what the owner-only paths
 * read; `operator()` is the moderation queue's wrapper; `isAdmin()` remains
 * for anything that legitimately means "any administrator".
 *
 * Deliberately not a check for the *right* area — that is asserted separately,
 * against the menu, because a call to canAdmin("prices") inside the people
 * page satisfies this one and is still wrong.
 */
function isGuarded(body: string): boolean {
  return (
    /canAdmin\(/.test(body) ||
    /adminIdentity\(\)/.test(body) ||
    /isAdmin\(\)/.test(body) ||
    /await operator\(\)/.test(body)
  );
}

/** Comments stripped: an explanation must not satisfy its own assertion. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * The file that serves a menu href.
 *
 * Not `src/app${href}/page.tsx`: a route group directory — `(dashboard)` —
 * is part of the path on disk and not part of the URL, and the diagnostics
 * page lives in one. Guessing the path would report that page as missing and
 * quietly stop checking which area it asks for.
 */
function pageFor(href: string): string | null {
  const wanted = href === "/admin" ? "/admin" : href;
  for (const path of walk("src/app")) {
    if (!path.endsWith("page.tsx")) continue;
    const route =
      "/" +
      path
        .slice("src/app/".length, -"/page.tsx".length)
        .split("/")
        .filter((part) => !part.startsWith("("))
        .join("/");
    if (route === wanted) return path;
  }
  return null;
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
      isGuarded(body) ||
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

// Only the modules that actually reach the database. A module holding a type
// and a URL has nothing to guard, and demanding a guard of it teaches people
// to add one that does nothing.
for (const path of adminLib) {
  const source = code(path);
  if (!/createClient\(\)/.test(source)) continue;
  check(`${path} refuses a non-admin`, isGuarded(source), path);
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

// `admin_members` is the one table that is legitimately the control room's
// own: it holds who may do what, which is not a copy of anything on the site
// and has nowhere else to live. Every other `admin_*` table would be a second
// copy of a record the public pages already read, so the rule stands for them.
const OWN_TABLE = "admin_members";

for (const path of [...adminLib, ...actionFiles]) {
  const source = code(path);
  const tables = [...source.matchAll(/from\("(admin_[a-z_]+)"\)/g)].map((m) => m[1]);
  check(`${path} keeps no admin-only copy of site content`,
    tables.every((table) => table === OWN_TABLE),
    tables.filter((table) => table !== OWN_TABLE).join(" "));
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
check("the admin layout checks who the caller is", isGuarded(layout));
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
// 7. One main administrator, and what the others may touch
//
// The failure this prevents is quiet and total: a page gated on *an* area
// rather than on *its* area. `canAdmin("prices")` at the top of the people
// page reads as a permission check, satisfies every generic assertion above,
// and lets the price verifier restrict accounts. So the area each page asks
// for is compared against the area the menu says that page needs, and the menu
// is read from the layout rather than restated here — two lists would drift.
// ---------------------------------------------------------------------------

const layoutSource = code("src/app/admin/layout.tsx");

/** The menu, as the layout declares it: href and the area it needs. */
const menu = [...layoutSource.matchAll(
  /\{\s*href:\s*"([^"]+)",[^}]*?area:\s*(?:"(\w+)"|null)\s*,?\s*\}/g,
)].map((match) => ({ href: match[1], area: match[2] ?? null }));

check("the layout declares a menu", menu.length >= 8, String(menu.length));
check("the overview needs no particular area",
  menu.some((entry) => entry.href === "/admin" && entry.area === null));

for (const entry of menu) {
  if (entry.area === null) continue;

  const pagePath = pageFor(entry.href);
  check(`${entry.href} exists`, pagePath !== null, entry.href);
  if (!pagePath) continue;
  const page = code(pagePath);

  // Call syntax, not the bare word: an import line, a type or a comment
  // mentioning the area would otherwise satisfy this while the call is wrong.
  check(`${entry.href} asks for its own area, not just for some area`,
    new RegExp(`canAdmin\\("${entry.area}"\\)`).test(page),
    entry.area);

  // And the actions behind it, where the writes actually happen.
  const actionPath = pagePath.replace(/page\.tsx$/, "actions.ts");
  const actions = actionFiles.includes(actionPath) ? code(actionPath) : "";
  if (actions) {
    check(`${entry.href} actions ask for the same area`,
      new RegExp(`canAdmin\\(([A-Z_]+\\[kind\\]|"${entry.area}")\\)`).test(actions),
      entry.area);
  }
}

check("the menu is filtered by what the person holds",
  /identity\.areas\.includes\(/.test(layoutSource));
check("and the owner is not filtered out of their own platform",
  /identity\.isOwner/.test(layoutSource));

// The team page is the one that hands out access, so it is the owner's alone
// — in the page, in the library behind it, and in every action.
// Per function. `searchForTeam` holding the owner check is not `listTeam`
// holding it, and a file-level assertion cannot tell the two apart — which is
// exactly how this passed on a listTeam that had been loosened to any
// administrator.
const teamLib = code("src/lib/admin/team.ts");
const teamReaders = exportedBodies(teamLib);
check("the team library exports its readers", teamReaders.size >= 2, String(teamReaders.size));
for (const [name, body] of teamReaders) {
  check(`team: ${name} is the owner's alone`,
    /identity\.isOwner/.test(body) && /return null;/.test(body), name);
}

const teamActions = code("src/app/admin/team/actions.ts");
for (const [name, body] of exportedBodies(teamActions)) {
  check(`team: ${name} is the owner's alone`, /identity\.isOwner/.test(body), name);
}

check("granting goes through set_admin_member",
  /rpc\("set_admin_member"/.test(teamActions));
check("removing goes through remove_admin_member",
  /rpc\("remove_admin_member"/.test(teamActions));
check("and profiles.is_admin is never written from here",
  !/from\("profiles"\)[\s\S]{0,200}\.update\(/.test(teamActions));
check("an administrator with no areas is refused rather than stored",
  /chosen\.length === 0/.test(teamActions));

// Anything the browser sends that is not an area is dropped before it reaches
// the database. Membership, not a length check: a list of eleven strings that
// happen to be the wrong eleven would pass a count.
check("only real areas are passed on",
  /new Set<string>\(ADMIN_AREAS\)/.test(teamActions) && /allowed\.has\(one\)/.test(teamActions));

// ---------------------------------------------------------------------------
// 8. The areas in the code are the areas in the database
//
// The enum is what PostgreSQL will accept. A list in TypeScript that has
// drifted from it produces a checkbox that saves and then fails, or an area
// that exists in the database and can never be granted.
// ---------------------------------------------------------------------------

const areasModule = code("src/lib/auth/admin-areas.ts");
const areaNames = code("src/lib/auth/admin-areas-shape.ts");
const declared = [...(areaNames.match(/export const ADMIN_AREAS = \[([\s\S]*?)\] as const;/) ?? ["", ""])[1]
  .matchAll(/"(\w+)"/g)].map((match) => match[1]);

const migration = readFileSync("supabase/migrations/0064_admin_team.sql", "utf8");
const enumBody = (migration.match(/create type public\.admin_area as enum \(([\s\S]*?)\);/) ?? ["", ""])[1];
const inDatabase = [...enumBody.matchAll(/'(\w+)'/g)].map((match) => match[1]);

check("the migration declares the areas", inDatabase.length >= 8, String(inDatabase.length));
check("every area in the database can be granted",
  inDatabase.every((area) => declared.includes(area)),
  inDatabase.filter((area) => !declared.includes(area)).join(" "));
check("and no area is offered that the database would refuse",
  declared.every((area) => inDatabase.includes(area)),
  declared.filter((area) => !inDatabase.includes(area)).join(" "));

// Every area needs a name and a sentence, or the tick box is a word nobody can
// act on. Asserted per area rather than by counting entries.
const labels = (areaNames.match(/AREA_LABEL[\s\S]*?\n\};/) ?? [""])[0];
for (const area of declared) {
  check(`${area} has a label`, new RegExp(`\\b${area}: "`).test(labels), area);
}
const hints = (areaNames.match(/AREA_HINT[\s\S]*?\n\};/) ?? [""])[0];
for (const area of declared) {
  check(`${area} says what it lets somebody do`, new RegExp(`\\b${area}: "`).test(hints), area);
}

// The ticks offer exactly the stored areas — no twelfth pseudo-permission.
const boxes = code("src/components/admin/area-checkboxes.tsx");
check("the ticks come from the one list", /ADMIN_AREAS\.map\(/.test(boxes));
check("“everything” sets the ticks rather than storing a word",
  /\[\.\.\.ADMIN_AREAS\]/.test(boxes) && !/"everything"|'everything'/.test(boxes));

// ---------------------------------------------------------------------------
// 9. A deployment without the migration is not an administrator
//
// my_admin_areas does not exist until 0064 is applied. An rpc that errors
// returns null data, and treating null as "no restrictions" would open the
// control room to everybody on exactly the deployments that have not yet run
// the migration.
// ---------------------------------------------------------------------------

check("a missing grant table means no areas, not all of them",
  /\(areas \?\? \[\]\)/.test(areasModule));
check("and owner is only true when the database says true",
  /owner === true/.test(areasModule));
check("the owner holds every area without a stored copy",
  /identity\.isOwner \|\| identity\.areas\.includes\(area\)/.test(areasModule));

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
