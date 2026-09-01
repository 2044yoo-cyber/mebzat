/**
 * Every internal link, checked against the routes that exist.
 *
 * A broken `href` is invisible until somebody clicks it: Next does not warn at
 * build time, and TypeScript sees a string. This walks the App Router tree,
 * builds the set of routes it actually serves, then extracts every internal
 * href, router.push and redirect in the source and asks whether any route
 * matches it.
 *
 * Route groups — the `(dashboard)` folders — are stripped, because they shape
 * the file tree and not the URL. Getting that wrong is what makes people
 * believe a working route is missing.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const APP = "src/app";
const routes = [];

function walk(dir, segments) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // (group) folders and @slots do not appear in the URL.
      if (entry.startsWith("(") || entry.startsWith("@")) walk(full, segments);
      else walk(full, [...segments, entry]);
    } else if (entry === "page.tsx" || entry === "page.ts") {
      routes.push("/" + segments.join("/"));
    } else if (entry === "route.ts" || entry === "route.tsx") {
      routes.push("/" + segments.join("/"));
    }
  }
}
walk(APP, []);

/** Turns /projects/[id]/agenda into a matcher. */
const matchers = routes.map((route) => ({
  route,
  test: new RegExp(
    "^" +
      route
        .replace(/\[\.\.\.[^\]]+\]/g, ".+")
        .replace(/\[\[\.\.\.[^\]]+\]\]/g, ".*")
        .replace(/\[[^\]]+\]/g, "[^/]+")
        .replace(/\/$/, "") +
      "/?$",
  ),
}));

function resolves(path) {
  const clean = path.split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
  return matchers.some((m) => m.test.test(clean));
}

// ---- Collect links from the source -------------------------------------
const files = [];
function collect(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full);
    else if (/\.(tsx?|mts)$/.test(entry)) files.push(full);
  }
}
collect("src");

const PATTERNS = [
  /href=\{?["'`](\/[^"'`\s{}]*)["'`]/g,
  /href=\{`(\/[^`]*)`\}/g,
  /router\.(?:push|replace)\(\s*[`"'](\/[^`"']*)[`"']/g,
  /redirect\(\s*[`"'](\/[^`"']*)[`"']/g,
];

const broken = new Map();
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const pattern of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      let href = match[1];
      // Template holes become a wildcard segment.
      href = href.replace(/\$\{[^}]*\}/g, "x");
      if (!href.startsWith("/") || href.startsWith("//")) continue;
      if (/^\/(api|_next)\b/.test(href) && resolves(href)) continue;
      if (resolves(href)) continue;
      const key = href;
      if (!broken.has(key)) broken.set(key, new Set());
      broken.get(key).add(relative(process.cwd(), file));
    }
  }
}

console.log(`${routes.length} routes, ${files.length} files scanned.\n`);
if (broken.size === 0) {
  console.log("✓ Every internal link resolves to a route.");
  process.exit(0);
}
console.log(`✗ ${broken.size} link target(s) resolve to nothing:\n`);
for (const [href, where] of [...broken].sort()) {
  console.log(`  ${href}`);
  for (const file of where) console.log(`      ${file}`);
}
process.exit(1);
