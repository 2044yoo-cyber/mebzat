// Medosha — fixes "spawn EFTYPE" on Windows + Node 24.
//
//   node fix-node24.mjs
//
// Run it from the project root (the folder containing package.json).
// It edits three things and prints what it changed:
//   1. package.json  — data scripts run on `node` instead of `tsx`
//   2. scripts/**.ts — relative imports get explicit .ts extensions
//   3. tsconfig.json — allows those .ts import paths for the type-checker
// Safe to re-run: already-correct files are left untouched.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const done = [];
const skipped = [];

function fail(msg) {
  console.error("\n✖ " + msg);
  process.exit(1);
}

if (!existsSync("package.json")) {
  fail("No package.json here.\n  Run this from your project root, e.g.:\n    cd D:\\websites\\FREEDOM\n    node fix-node24.mjs");
}

// --- 1. package.json --------------------------------------------------------
{
  const raw = readFileSync("package.json", "utf8");
  const pkg = JSON.parse(raw);
  pkg.scripts ??= {};
  let touched = false;

  for (const name of ["seed", "import:businesses", "migrate:images"]) {
    const cmd = pkg.scripts[name];
    if (!cmd) continue;
    if (cmd.startsWith("tsx ")) {
      pkg.scripts[name] = cmd.replace(/^tsx\s+/, "node ");
      done.push(`package.json  ${name}: tsx -> node`);
      touched = true;
    } else {
      skipped.push(`package.json  ${name} already uses node`);
    }
  }

  if (!pkg.engines?.node) {
    pkg.engines = { ...(pkg.engines ?? {}), node: ">=22.18.0" };
    done.push("package.json  engines.node = >=22.18.0");
    touched = true;
  }

  if (touched) {
    // Match the file's existing indentation so the diff stays small.
    const indent = /^\s*"name"/m.exec(raw)?.[0].replace(/\r?\n/, "").length ?? 2;
    writeFileSync("package.json", JSON.stringify(pkg, null, indent) + "\n");
  }
}

// --- 2. scripts/**/*.ts imports --------------------------------------------
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}

for (const file of walk("scripts")) {
  const src = readFileSync(file, "utf8");
  // Add .ts to relative specifiers that have no extension yet.
  const out = src.replace(
    /(\bfrom\s*")(\.\.?\/[^"]*)(")/g,
    (whole, pre, spec, post) =>
      /\.(ts|tsx|mjs|cjs|js|json)$/.test(spec) ? whole : `${pre}${spec}.ts${post}`,
  );
  if (out !== src) {
    writeFileSync(file, out);
    done.push(`${file}  imports -> .ts`);
  }
}

// --- 3. tsconfig.json -------------------------------------------------------
if (existsSync("tsconfig.json")) {
  const raw = readFileSync("tsconfig.json", "utf8");
  if (!/allowImportingTsExtensions/.test(raw)) {
    // Insert next to "noEmit" (or after compilerOptions) without reformatting
    // the file — tsconfig.json usually contains comments that JSON.parse eats.
    let out = null;
    if (/"noEmit"\s*:/.test(raw)) {
      out = raw.replace(
        /([ \t]*)"noEmit"\s*:\s*[^,\n]+,?/,
        (m, ind) => `${m}\n${ind}"allowImportingTsExtensions": true,`,
      );
    } else if (/"compilerOptions"\s*:\s*\{/.test(raw)) {
      out = raw.replace(
        /("compilerOptions"\s*:\s*\{)/,
        `$1\n    "allowImportingTsExtensions": true,`,
      );
    }
    if (out && out !== raw) {
      writeFileSync("tsconfig.json", out);
      done.push("tsconfig.json  allowImportingTsExtensions: true");
    } else {
      skipped.push("tsconfig.json  could not edit automatically — add \"allowImportingTsExtensions\": true under compilerOptions");
    }
  } else {
    skipped.push("tsconfig.json  already set");
  }
}

// --- report -----------------------------------------------------------------
console.log("");
if (done.length) {
  console.log("Changed:");
  for (const d of done) console.log("  ✓ " + d);
} else {
  console.log("Nothing to change — this project is already fixed.");
}
if (skipped.length) {
  console.log("\nAlready fine:");
  for (const s of skipped) console.log("  · " + s);
}
console.log("\nNext:  npm run migrate:images\n");
