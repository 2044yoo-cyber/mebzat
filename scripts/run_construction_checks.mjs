/**
 * Runs every check of the construction learning mode and the building configurator, four at a time, and says which passed.
 *
 *   node scripts/run_construction_checks.mjs            the checks that need no browser
 *   node scripts/run_construction_checks.mjs --browser  and the three browser checks (they need `npm run build` first, and Playwright)
 *
 * It exits 1 if any check fails, with the tail of that check's output, so that a pipeline stops on it. Nothing is skipped quietly: a check whose script is not
 * there is a failure.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const root = new URL("../", import.meta.url).pathname;

/** [name, command, arguments]. The order is the order they are reported in. */
const CHECKS = [
  ["types", "npx", ["tsc", "--noEmit", "-p", "."]],
  ["building configurator", "npx", ["tsx", "scripts/building_config_check.ts"]],
  ["construction model (stages, quantities, services, lessons)", "npx", ["tsx", "scripts/construction_lab_check.ts"]],
  ["construction link from the plan", "npx", ["tsx", "scripts/construction_lab_link_check.ts"]],
  ["construction services", "npx", ["tsx", "scripts/construction_services_check.ts"]],
  ["construction geometry", "npx", ["tsx", "scripts/construction_geometry_check.ts"]],
  ["construction reinforcement and stairs", "npx", ["tsx", "scripts/construction_rebar_check.ts"]],
  ["construction balconies", "npx", ["tsx", "scripts/construction_balcony_check.ts"]],
  ["construction roof and frame faces", "npx", ["tsx", "scripts/construction_roof_check.ts"]],
  ["construction bill of quantities", "npx", ["tsx", "scripts/construction_boq_check.ts"]],
  ["construction cost estimate", "npx", ["tsx", "scripts/construction_estimate_check.ts"]],
  ["construction saving and exports", "npx", ["tsx", "scripts/construction_export_check.ts"]],
  ["acceptance: four buildings, two sizes, every stage", "npx", ["tsx", "scripts/construction_acceptance_check.ts"]],
];
const BROWSER = [
  ["building configurator in a browser", "node", ["scripts/building_config_browser_check.mjs"]],
  ["construction mode in a browser", "node", ["scripts/construction_lab_browser_check.mjs"]],
  ["construction in the phone's menu, in a browser", "node", ["scripts/construction_menu_browser_check.mjs"]],
];

const wantBrowser = process.argv.includes("--browser");
const jobs = [...CHECKS, ...(wantBrowser ? BROWSER : [])];
const width = Math.max(...jobs.map(([name]) => name.length));
const results = new Map();

function run([name, command, args]) {
  return new Promise((resolve) => {
    const script = args.find((a) => a.startsWith("scripts/"));
    if (script && !existsSync(root + script)) { results.set(name, { ok: false, out: `${script} is missing`, seconds: 0 }); resolve(); return; }
    const started = Date.now();
    const child = spawn(command, args, { cwd: root, env: process.env });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (code) => { results.set(name, { ok: code === 0, out, seconds: (Date.now() - started) / 1000 }); resolve(); });
  });
}

// Four at a time: the checks are CPU-bound and a build box has few cores. The browser checks go one by one, after the rest, because they hold a browser.
const queue = jobs.filter(([name]) => !BROWSER.some(([b]) => b === name));
const workers = Array.from({ length: 4 }, async () => { for (let job = queue.shift(); job; job = queue.shift()) await run(job); });
await Promise.all(workers);
if (wantBrowser) for (const job of BROWSER) await run(job);

let failed = 0;
for (const [name] of jobs) {
  const r = results.get(name);
  const last = r.out.trim().split("\n").filter(Boolean).at(-1) ?? "";
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${name.padEnd(width)}  ${r.seconds.toFixed(0).padStart(4)} s  ${r.ok ? last.slice(0, 80) : ""}`);
  if (!r.ok) { failed += 1; console.log(r.out.trim().split("\n").slice(-25).join("\n")); }
}
console.log(failed ? `\n${failed} of ${jobs.length} checks failed.` : `\nAll ${jobs.length} checks passed.`);
process.exit(failed ? 1 : 0);
