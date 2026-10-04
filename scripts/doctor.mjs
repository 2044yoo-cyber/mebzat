// Checks that the project on this machine is complete and consistent.
//
//   npm run doctor
//
// Written for the case where files arrive as archives rather than through git:
// a drop that half-applies leaves imports pointing at files that are not
// there, and Turbopack reports that as one opaque failure with the dev server
// already dead. This resolves every local import in the source tree and names
// the missing files instead.
//
// Plain .mjs with no dependencies, so it runs even when the app does not.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

const RED = "[31m";
const GREEN = "[32m";
const YELLOW = "[33m";
const DIM = "[2m";
const RESET = "[0m";

/** Extensions Next resolves, in the order it tries them. */
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".css"];

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (/\.(ts|tsx|mjs)$/.test(entry)) files.push(path);
  }
  return files;
}

/** Does this import specifier resolve to a file on disk? */
function resolves(target) {
  if (existsSync(target) && statSync(target).isFile()) return true;
  for (const extension of EXTENSIONS) {
    if (existsSync(target + extension)) return true;
  }
  // A directory import resolves to its index file.
  for (const extension of EXTENSIONS) {
    if (existsSync(join(target, `index${extension}`))) return true;
  }
  return false;
}

const IMPORT_PATTERN =
  /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;
const DYNAMIC_PATTERN = /import\(\s*["']([^"']+)["']\s*\)/g;

const files = walk(SRC);
const broken = [];
let checked = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");

  for (const pattern of [IMPORT_PATTERN, DYNAMIC_PATTERN]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const specifier = match[1];

      // Only local imports can be missing from an archive; packages are
      // npm's problem and npm reports them clearly already.
      let target;
      if (specifier.startsWith("@/")) {
        target = join(SRC, specifier.slice(2));
      } else if (specifier.startsWith(".")) {
        target = resolve(dirname(file), specifier);
      } else {
        continue;
      }

      checked += 1;
      if (!resolves(target)) {
        broken.push({
          from: relative(ROOT, file),
          specifier,
          expected: relative(ROOT, target),
        });
      }
    }
  }
}

// --- Files this version deleted on purpose --------------------------------
//
// An archive extracted over an existing install cannot delete anything, so a
// file removed in a later version survives — and goes on importing something
// that is now correctly absent. The build then blames the missing file, which
// sends everyone looking for the wrong problem.

const MANIFEST = join(ROOT, "scripts", "removed-files.json");
/** Repo-relative paths that should not exist. */
const removedPaths = new Set();

if (existsSync(MANIFEST)) {
  try {
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
    for (const group of manifest.removed ?? []) {
      for (const path of group.paths ?? []) removedPaths.add(path);
    }
  } catch {
    // A malformed manifest must not stop the rest of the diagnosis.
  }
}

/** Manifest entries still on disk. Each one is a leftover. */
const stale = [...removedPaths].filter((path) =>
  existsSync(join(ROOT, path)),
);

/** Was this broken import pointing at something deleted deliberately? */
function wasRemovedOnPurpose(expected) {
  const normalised = expected.split("\\").join("/");
  for (const path of removedPaths) {
    // The manifest carries extensions; `expected` may not.
    if (path === normalised || path.startsWith(`${normalised}.`)) return true;
  }
  return false;
}

// --- Packages the app cannot start without -------------------------------
//
// Read from package.json rather than listed here. A hand-written list is a
// second copy of the truth, and this one drifted: it named eight packages and
// was never updated when `three` and `@react-three/fiber` were added, so a
// project missing them was told "Every required package is installed" while
// /studio returned 500 on every request. The check that should have named the
// problem was the reason it stayed hidden.
//
// Every runtime dependency counts. A devDependency missing is a broken build
// script; a dependency missing is a broken page.

let declaredPackages = [];
try {
  const manifest = JSON.parse(
    readFileSync(join(ROOT, "package.json"), "utf8"),
  );
  declaredPackages = Object.keys(manifest.dependencies ?? {});
} catch {
  // No package.json is a much louder problem than this script solves.
  declaredPackages = [];
}

const missingPackages = declaredPackages.filter(
  (name) => !existsSync(join(ROOT, "node_modules", name, "package.json")),
);

// --- A corrupted build cache ---------------------------------------------
//
// The failure that is hardest to read: `.next` half-written because two Next
// processes ran at once, or because files changed under a running dev server.
// It reports as "Cannot find module '../chunks/ssr/[turbopack]_runtime.js'"
// with every route 500ing and no error in the source at all.

const nextDir = join(ROOT, ".next");
const cacheProblems = [];

if (existsSync(nextDir)) {
  const devServer = join(nextDir, "dev", "server");
  const hasDocument = existsSync(join(devServer, "pages", "_document.js"));
  const hasRuntime =
    existsSync(join(nextDir, "dev", "chunks", "ssr")) ||
    existsSync(join(nextDir, "static"));

  // A server bundle with no chunks behind it is the corrupted shape.
  if (hasDocument && !hasRuntime) {
    cacheProblems.push(
      "the .next build cache is incomplete (server bundle without its chunks)",
    );
  }
}

// --- Report ---------------------------------------------------------------

console.log(`\n${DIM}Medosha doctor${RESET}`);
console.log(`${DIM}${"─".repeat(50)}${RESET}`);
console.log(`Source files scanned : ${files.length}`);
console.log(`Local imports checked: ${checked}`);

if (missingPackages.length > 0) {
  console.log(
    `\n${RED}✗ ${missingPackages.length} package(s) not installed${RESET}`,
  );
  for (const name of missingPackages) console.log(`  ${RED}•${RESET} ${name}`);
  console.log(`\n  ${YELLOW}Fix:${RESET} npm install`);
}

if (broken.length > 0) {
  console.log(`\n${RED}✗ ${broken.length} import(s) point at missing files${RESET}\n`);

  // Grouped by the file that is missing, because one absent file usually
  // explains several broken imports at once.
  const byTarget = new Map();
  for (const entry of broken) {
    const list = byTarget.get(entry.expected) ?? [];
    list.push(entry.from);
    byTarget.set(entry.expected, list);
  }

  // Two very different causes wear the same symptom, so they are reported
  // separately. One means a file failed to arrive; the other means a file
  // failed to leave.
  const absent = [];
  const deletedOnPurpose = [];
  for (const [expected, importers] of byTarget) {
    (wasRemovedOnPurpose(expected) ? deletedOnPurpose : absent).push([
      expected,
      importers,
    ]);
  }

  for (const [expected, importers] of deletedOnPurpose) {
    console.log(`  ${YELLOW}REMOVED${RESET}  ${expected}`);
    console.log(`           ${DIM}deleted on purpose by a later version${RESET}`);
    for (const importer of importers) {
      console.log(`           ${DIM}still imported by ${importer} — a leftover${RESET}`);
    }
    console.log("");
  }

  for (const [expected, importers] of absent) {
    console.log(`  ${RED}MISSING${RESET}  ${expected}`);
    for (const importer of importers) {
      console.log(`           ${DIM}needed by ${importer}${RESET}`);
    }
    console.log("");
  }

  if (deletedOnPurpose.length > 0) {
    console.log(`  ${YELLOW}Fix:${RESET} your install has files this version deleted. The`);
    console.log(`       archive is not missing anything — extracting cannot`);
    console.log(`       remove a file. Clear them out:\n`);
    console.log(`         ${GREEN}npm run prune -- --fix${RESET}\n`);
  }

  if (absent.length > 0) {
    console.log(
      `  ${YELLOW}Fix:${RESET} those files did not extract. Re-extract the archive`,
    );
    console.log(`       they came in, then run npm run doctor again.\n`);
  }
}

if (stale.length > 0 && broken.length === 0) {
  // Present but harmless today. Still worth removing: it will bite the moment
  // something references it, and it is dead weight until then.
  console.log(`\n${YELLOW}! ${stale.length} file(s) this version deleted are still on disk${RESET}\n`);
  for (const path of stale) console.log(`  ${YELLOW}stale${RESET}  ${path}`);
  console.log(`\n  ${YELLOW}Fix:${RESET} npm run prune -- --fix\n`);
}

if (cacheProblems.length > 0) {
  console.log(`\n${RED}✗ Build cache looks corrupted${RESET}`);
  for (const problem of cacheProblems) {
    console.log(`  ${RED}•${RESET} ${problem}`);
  }
  console.log(`\n  ${YELLOW}Fix:${RESET} stop every running dev server, then:`);
  console.log(`       npm run clean && npm run dev\n`);
}

// ---------------------------------------------------------------------------
// A second copy of the project inside itself
//
// `tar -xzf` extracts relative to the current directory, and the archive's
// paths start at the project root — `src/`, `package.json`, `supabase/`. Run it
// from anywhere other than the root and the whole project lands *there*, one
// level down, as a complete second copy.
//
// It is quiet in the worst way. Nothing overwrites anything, so no file is
// lost and no error is printed; the update simply never reaches the project,
// and the next run reports that the fix did not work. The giveaway is a second
// package.json somewhere below the root.
// ---------------------------------------------------------------------------

const strayRoots = [];

function findStrays(dir, depth = 0) {
  if (depth > 4) return;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const path = join(dir, entry);
    if (!statSync(path).isDirectory()) continue;
    if (existsSync(join(path, "package.json"))) {
      strayRoots.push(relative(ROOT, path));
      // Do not descend: a stray copy contains the whole tree, and reporting
      // every nested folder inside it buries the one line that matters.
      continue;
    }
    findStrays(path, depth + 1);
  }
}

findStrays(ROOT);

if (strayRoots.length > 0) {
  console.log(`\n${RED}✗ A second copy of the project is nested inside itself${RESET}\n`);
  for (const path of strayRoots) {
    console.log(`  ${RED}•${RESET} ${path}`);
  }
  console.log(`\n  ${YELLOW}Cause:${RESET} an archive was extracted from that folder rather than`);
  console.log(`         from the project root, so every file landed one level down.`);
  console.log(`         Nothing was overwritten and nothing was lost — but the`);
  console.log(`         update never reached the project.\n`);
  console.log(`  ${YELLOW}Fix:${RESET}   delete the folder(s) above, then extract again with an`);
  console.log(`         explicit destination so the current directory cannot matter:\n`);
  console.log(`           ${GREEN}tar -xzf <archive> -C "${ROOT}"${RESET}\n`);
}

// ---------------------------------------------------------------------------
// Configuration
//
// The one failure this file was written for that has nothing to do with files.
// `.env.local` is not in any archive — it holds keys, so it is gitignored and
// cannot be — which means a fresh extract into a clean folder starts with no
// configuration at all. Every page then dies in the proxy, before any of them
// can say why.
//
// Read as a file rather than from process.env: `npm run doctor` does not load
// .env.local, so process.env would report every variable missing on a perfectly
// healthy install.
// ---------------------------------------------------------------------------

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

const envPath = join(ROOT, ".env.local");
const envProblems = [];

if (!existsSync(envPath)) {
  envProblems.push(".env.local does not exist");
} else {
  const envText = readFileSync(envPath, "utf8");
  for (const name of REQUIRED_ENV) {
    // Anchored per line, and requiring something after the `=`: a variable
    // present but blank fails exactly like one that is absent, and reads the
    // same way at runtime.
    //
    // `[^\S\r\n]` — horizontal whitespace only — rather than `\s`. In
    // JavaScript `\s` matches newlines, so `=\s*\S` happily stepped over the
    // line break and matched the first character of the *next* line: a blank
    // value was reported as set, which is the one case this check exists for.
    const horizontal = "[^\\S\\r\\n]*";
    const set = new RegExp(
      `^${horizontal}${name}${horizontal}=${horizontal}\\S`,
      "m",
    ).test(envText);
    if (!set) envProblems.push(`${name} is missing or empty in .env.local`);
  }
}

// Payments are optional in a way Supabase is not: the app runs perfectly well
// without a Chapa key, right up until somebody clicks Upgrade and gets "the
// payment page could not be opened". Reported separately so a missing key reads
// as what it is — one feature unconfigured, not a broken install.
const paymentProblems = [];
if (existsSync(envPath)) {
  const envText = readFileSync(envPath, "utf8");
  const horizontal = "[^\\S\\r\\n]*";
  const keyLine = envText.match(
    new RegExp(`^${horizontal}CHAPA_SECRET_KEY${horizontal}=${horizontal}(\\S+)`, "m"),
  );

  if (!keyLine) {
    paymentProblems.push("CHAPA_SECRET_KEY is missing or empty in .env.local");
  } else if (!keyLine[1].startsWith("CHASECK")) {
    // The usual mistake is pasting the public key, which looks equally like a
    // key and fails only at checkout.
    paymentProblems.push(
      "CHAPA_SECRET_KEY does not begin with CHASECK — that is the public key, not the secret one",
    );
  }
}

if (paymentProblems.length > 0) {
  console.log(`\n${YELLOW}! Payments are not configured${RESET}\n`);
  for (const problem of paymentProblems) {
    console.log(`  ${YELLOW}•${RESET} ${problem}`);
  }
  console.log(`\n  ${DIM}Everything else works. Upgrading to Pro will fail with${RESET}`);
  console.log(`  ${DIM}"the payment page could not be opened" until this is set.${RESET}\n`);
  console.log(`  ${YELLOW}Fix:${RESET} Chapa dashboard -> Settings -> API -> secret key,`);
  console.log(`       then:  npm run check:chapa\n`);
}

if (envProblems.length > 0) {
  console.log(`\n${RED}✗ Supabase is not configured${RESET}\n`);
  for (const problem of envProblems) {
    console.log(`  ${RED}•${RESET} ${problem}`);
  }
  console.log(`\n  ${YELLOW}Fix:${RESET} copy .env.example to .env.local and fill in the two`);
  console.log(`       values from your Supabase dashboard:`);
  console.log(`         Project Settings -> API -> Project URL and anon public key\n`);
  console.log(`       Then restart the dev server. Next.js reads .env.local only`);
  console.log(`       at startup, so editing it while the server runs changes`);
  console.log(`       nothing.\n`);
  console.log(`  ${DIM}Without these, every page fails in the proxy with${RESET}`);
  console.log(`  ${DIM}"Your project's URL and Key are required to create a Supabase client".${RESET}\n`);
}

if (
  broken.length === 0 &&
  missingPackages.length === 0 &&
  cacheProblems.length === 0 &&
  stale.length === 0 &&
  envProblems.length === 0 &&
  strayRoots.length === 0
) {
  console.log(`\n${GREEN}✓ Every local import resolves.${RESET}`);
  console.log(`${GREEN}✓ Every required package is installed.${RESET}`);
  console.log(`${GREEN}✓ No files left over from an earlier version.${RESET}`);
  console.log(`${GREEN}✓ Supabase is configured.${RESET}`);
  console.log(`\n${DIM}If the app still fails, the problem is not a missing`);
  console.log(`file — run npm run build and send the output.${RESET}\n`);
}

process.exit(
  broken.length > 0 ||
    missingPackages.length > 0 ||
    cacheProblems.length > 0 ||
    stale.length > 0
    ? 1
    : 0,
);
