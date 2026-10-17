/**
 * Runs every check script of the repository that needs no browser, three at a time, and says which passed.
 *
 *   node scripts/run_repository_checks.mjs              all of them
 *   node scripts/run_repository_checks.mjs berchuma     only those whose file name has "berchuma" in it
 *
 * It exists because the checks used to be run by whoever remembered to, and a wardrobe check that nobody ran went from 559 passing to 57 failing over a month
 * of deliberate changes without anything noticing. A check that is red on purpose is listed below with the reason: it still runs and is still reported, but it does
 * not fail the run; the moment it passes that is reported too, so that its entry can come out. Anything else that fails exits 1 with the tail of its output.
 */
import { spawn, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const root = new URL("../", import.meta.url).pathname;
const filter = process.argv.slice(2).find((a) => !a.startsWith("-")) ?? "";
const PARALLEL = 3;
const TIMEOUT_MS = 10 * 60 * 1000;

/** Scripts that match the pattern but are not checks that stand alone. */
const NOT_CHECKS = {
  "run_construction_checks.mjs": "runs the construction checks, which this runs too",
  "run_repository_checks.mjs": "this runner",
  "check-routes.mjs": "needs a running server",
};

/**
 * Checks that drive a browser (Playwright), whatever their file is called: they need `npm run build` first and run with the browser checks of their feature.
 * The four house plan ones time out waiting for the "Run →" control when they are run (they did at 2cff67d and at ca799b1 as well); where Playwright is not
 * installed they print SKIP and pass, so a run without it says nothing about them.
 */
const NEEDS_BROWSER = {
  "font_check.mjs": "loads the fonts in Chromium",
  "house_layout_check.mjs": "drives the house plan in Chromium",
  "house_project_check.mjs": "drives the house plan in Chromium",
  "house_sketch_check.mjs": "drives the house plan in Chromium",
  "house_touch_check.mjs": "drives the house plan in Chromium",
};

/**
 * Checks that apply the migrations to a PostgreSQL 16 server that is already running (supabase/tests/run.sh starts one on this socket). Where none answers they are
 * not run, and the run says so: a machine with no server says nothing about them.
 */
const SQL_BIN = process.env.PG_BIN ?? "/usr/lib/postgresql/16/bin";
const SQL_SOCKET = process.env.PG_SOCK ?? "/tmp/pgsock";
const SQL_PORT = process.env.PG_PORT ?? "5599";
const NEEDS_DATABASE = {
  "profile_columns_check.mjs": "applies the migrations to a running PostgreSQL 16",
};
const databaseUp = spawnSync(`${SQL_BIN}/pg_isready`, ["-h", SQL_SOCKET, "-p", SQL_PORT]).status === 0;

/**
 * Red on purpose: not failing the run, and why. Each is a decision for the owner, with the reason found in docs/building_configurator_audit.md. Every other check
 * that was red when this was written (on main as well, e3416e0) was a stale expectation and has been brought up to date.
 */
const KNOWN_RED = {
  "layout-check.ts": "an L layout with a short wall shrinks the corner instead of reporting it (20 mm at a 320 mm wall, no note); a decision for the owner",
  "tour_check.ts": "next.config.ts lets next/image fetch signed storage URLs since Agenda's site photos (311dbff), which the tour's reasoning forbids: the optimiser keeps a copy that outlives the signature; a decision for the owner",
};

const all = readdirSync(root + "scripts")
  .filter((name) => /check/.test(name) && /\.(ts|mjs)$/.test(name) && !/browser/.test(name))
  .filter((name) => !(name in NOT_CHECKS) && !(name in NEEDS_BROWSER) && (databaseUp || !(name in NEEDS_DATABASE)))
  .filter((name) => name.includes(filter))
  .sort();

if (all.length === 0) {
  console.log(`No check script has "${filter}" in its name.`);
  process.exit(1);
}

const results = new Map();
function run(name) {
  return new Promise((resolve) => {
    const [command, args] = name.endsWith(".ts") ? ["npx", ["tsx", `scripts/${name}`]] : ["node", [`scripts/${name}`]];
    const started = Date.now();
    const child = spawn(command, args, { cwd: root, env: process.env });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    const timer = setTimeout(() => { out += `\nstopped after ${TIMEOUT_MS / 60000} minutes`; child.kill("SIGKILL"); }, TIMEOUT_MS);
    child.on("close", (code) => { clearTimeout(timer); results.set(name, { ok: code === 0, out, seconds: (Date.now() - started) / 1000 }); resolve(); });
  });
}

// The mutation checks break a source file in place and put it back, so they run on their own once the others are done: run beside the check of the file they
// break, they make it fail.
const alone = all.filter((name) => /mutation/.test(name));
const queue = all.filter((name) => !alone.includes(name));
await Promise.all(Array.from({ length: PARALLEL }, async () => { for (let name = queue.shift(); name; name = queue.shift()) await run(name); }));
for (const name of alone) await run(name);

const plain = (text) => text.replace(/\u001b\[[0-9;]*m/g, "");
let failed = 0;
let known = 0;
let fixed = 0;
for (const name of all) {
  const r = results.get(name);
  const red = name in KNOWN_RED;
  const lines = plain(r.out).trim().split("\n").filter(Boolean);
  const verdict = r.ok ? (red ? "PASS (listed as red: take it out of KNOWN_RED)" : "PASS") : red ? "known red" : "FAIL";
  console.log(`${verdict.padEnd(11)} ${name.padEnd(46)} ${r.seconds.toFixed(0).padStart(4)} s`);
  if (r.ok && red) fixed += 1;
  if (!r.ok && red) { known += 1; console.log(`            ${KNOWN_RED[name]}`); }
  if (!r.ok && !red) { failed += 1; console.log(lines.slice(-25).map((l) => `    ${l}`).join("\n")); }
}
const passed = all.length - failed - known;
console.log(`\n${all.length} checks: ${passed} passed, ${known} known red, ${failed} failed${fixed ? `, ${fixed} listed as red that now pass` : ""}.`);
// What this run did not run, and why, so that a green run is not read as more than it is.
const notRun = [
  ...Object.entries(NEEDS_BROWSER).filter(([name]) => name.includes(filter)).map(([name, why]) => `${name}: ${why}; npm run build first`),
  ...(databaseUp ? [] : Object.entries(NEEDS_DATABASE).filter(([name]) => name.includes(filter)).map(([name, why]) => `${name}: ${why}; no server answers on ${SQL_SOCKET}:${SQL_PORT}`)),
];
if (notRun.length) console.log(`Not run here:\n${notRun.map((line) => `  ${line}`).join("\n")}`);
process.exit(failed ? 1 : 0);
