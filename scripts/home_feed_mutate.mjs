/**
 * Mutation testing for the Home feed browser check.
 *
 *   node scripts/home_feed_mutate.mjs [scripts/mutants/home_feed_browser.json]
 *
 * As scripts/mutate.mjs, with two differences the real app forces: each
 * mutant needs a production build (the check runs `next start`), and each
 * names the checks aimed at it (`checks`), so only those run. The file is put
 * back whatever happens, and a final build leaves `.next` built from the
 * unmutated code. A mutant whose text is missing counts as a survivor.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { buildApp } from "./home_feed_stack.mjs";

const planPath = process.argv[2] ?? "scripts/mutants/home_feed_browser.json";
const plan = JSON.parse(readFileSync(planPath, "utf8"));

function passes(checks) {
  try {
    execFileSync("node", ["scripts/home_feed_browser_check.mjs"], { env: { ...process.env, CHECKS: checks }, stdio: "pipe", timeout: 900_000 });
    return true;
  } catch {
    return false;
  }
}

// A red baseline makes every mutant look caught. Each set of checks the plan
// aims at must pass on the unmutated build first.
buildApp();
for (const checks of new Set(plan.map((mutant) => mutant.checks))) {
  if (!passes(checks)) {
    console.log(`BASELINE IS RED for checks ${checks} — fix the check before mutating. Nothing was run.`);
    process.exit(2);
  }
}
console.log("baseline green\n");

let survived = 0;
for (const { name, file, from, to, checks } of plan) {
  const original = readFileSync(file, "utf8");
  if (!original.includes(from)) {
    console.log(`  STALE     ${name}`);
    survived += 1;
    continue;
  }
  let stillPasses;
  try {
    writeFileSync(file, original.replace(from, to));
    buildApp();
    stillPasses = passes(checks);
  } catch {
    stillPasses = false; // a mutant that does not build is caught by the build
  } finally {
    writeFileSync(file, original);
  }
  console.log(`  ${stillPasses ? "SURVIVED" : "caught  "}  ${name}  (checks ${checks})`);
  if (stillPasses) survived += 1;
}
buildApp();
console.log(survived ? `\n${survived} of ${plan.length} survived` : `\n${plan.length} mutants, all caught`);
process.exit(survived ? 1 : 0);
