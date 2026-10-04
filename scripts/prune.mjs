// Removes files this project has deleted but an archive cannot.
//
//   npm run prune          list what would go
//   npm run prune -- --fix delete it
//
// `tar -xzf` adds files and overwrites files. It never deletes them. So an
// install updated by extracting over the top keeps every file a later version
// removed — and those files still import what they always imported. The build
// then fails on a module that was deleted deliberately, which reads as "the
// archive is missing a file" when the truth is the reverse: the archive is
// correct and the install has something extra.
//
// scripts/removed-files.json is the record. Adding a path there is what makes
// a deletion reach an installed copy.
//
// Plain .mjs with no dependencies, so it runs even when the app does not.

import { readFileSync, existsSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MANIFEST = join(ROOT, "scripts", "removed-files.json");

const RED = "[31m";
const GREEN = "[32m";
const YELLOW = "[33m";
const DIM = "[2m";
const RESET = "[0m";

const fix = process.argv.includes("--fix");

if (!existsSync(MANIFEST)) {
  console.error(`${RED}✗ scripts/removed-files.json is missing.${RESET}`);
  process.exit(1);
}

/** @type {{ removed: { version: string, reason: string, paths: string[] }[] }} */
let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch (error) {
  console.error(`${RED}✗ removed-files.json is not valid JSON: ${error.message}${RESET}`);
  process.exit(1);
}

console.log(`\n${DIM}Medosha prune${RESET}`);
console.log(`${DIM}${"─".repeat(50)}${RESET}`);

let found = 0;
let deleted = 0;

for (const group of manifest.removed ?? []) {
  const present = (group.paths ?? []).filter((path) => {
    const full = join(ROOT, path);
    // A path that escaped the project is a corrupt manifest, not a stale file.
    if (!full.startsWith(ROOT)) return false;
    return existsSync(full) && statSync(full).isFile();
  });

  if (present.length === 0) continue;

  found += present.length;
  console.log(`\n${YELLOW}${group.version}${RESET} — ${group.reason}`);

  for (const path of present) {
    if (fix) {
      rmSync(join(ROOT, path), { force: true });
      deleted += 1;
      console.log(`  ${GREEN}removed${RESET} ${path}`);
    } else {
      console.log(`  ${YELLOW}stale${RESET}   ${path}`);
    }
  }
}

console.log("");

if (found === 0) {
  console.log(`${GREEN}✓ No stale files. This install matches the current version.${RESET}\n`);
  process.exit(0);
}

if (fix) {
  console.log(
    `${GREEN}✓ Removed ${deleted} stale ${deleted === 1 ? "file" : "files"}.${RESET}`,
  );
  console.log(`${DIM}Run npm run doctor to confirm every import resolves.${RESET}\n`);
  process.exit(0);
}

console.log(
  `${YELLOW}${found} stale ${found === 1 ? "file is" : "files are"} still on disk.${RESET}`,
);
console.log(`${DIM}These are files this version deleted. Your archive is not${RESET}`);
console.log(`${DIM}missing anything — your install has something extra.${RESET}\n`);
console.log(`  Remove them:  ${GREEN}npm run prune -- --fix${RESET}\n`);
// Non-zero so it can gate a build step without anyone remembering to look.
process.exit(1);
