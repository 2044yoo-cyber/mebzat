/**
 * Breaks the code on purpose and insists the check notices.
 *
 *   node scripts/mutate.mjs "npx tsx scripts/places_check.ts" scripts/mutants/places.json
 *
 * AGENTS.md: every check gets mutation-tested, because a check that passes on
 * broken code is worse than none. This is what does that. A plan is a list of
 * `{ name, file, from, to }` — `from` is replaced with `to`, the check is run,
 * and the file is put back whatever happens.
 *
 * ## It refuses a red baseline
 *
 * If the check already fails, every mutant "fails" too and the run reports a
 * clean sweep while proving nothing. That has happened here, and it is the
 * reason this exits 2 with a message rather than getting on with it.
 *
 * ## A mutant whose text is not found is a survivor
 *
 * Not a skip. A plan that has drifted from the code it mutates is a plan that
 * silently stops testing, which is the same failure in a different coat.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const [checkCmd, planPath] = process.argv.slice(2);
if (!checkCmd || !planPath) {
  console.log('usage: node scripts/mutate.mjs "<check command>" <plan.json>');
  process.exit(2);
}

const plan = JSON.parse(readFileSync(planPath, "utf8"));

function passes() {
  try {
    execSync(checkCmd, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

if (!passes()) {
  console.log("BASELINE IS RED — fix the check before mutating. Nothing was run.");
  process.exit(2);
}
console.log("baseline green\n");

let survived = 0;
for (const { name, file, from, to } of plan) {
  const original = readFileSync(file, "utf8");
  if (!original.includes(from)) {
    console.log(`  STALE     ${name} — the text to mutate is no longer in ${file}`);
    survived += 1;
    continue;
  }
  writeFileSync(file, original.replace(from, to));
  const stillPasses = passes();
  writeFileSync(file, original);
  if (stillPasses) {
    console.log(`  SURVIVED  ${name}`);
    survived += 1;
  } else {
    console.log(`  caught    ${name}`);
  }
}

console.log(
  survived === 0
    ? `\n${plan.length} mutants, all caught`
    : `\n${survived} of ${plan.length} survived`,
);
process.exit(survived === 0 ? 0 : 1);
