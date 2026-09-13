/**
 * The main menu and the + button.
 *
 *   npx tsx scripts/navigation_check.ts
 *
 * Two things a menu has to get right and neither is visible from reading it:
 * that every row goes somewhere that exists, and that no row appears twice.
 * Both have been wrong here before — a duplicate Professionals entry was
 * removed from the manifest earlier, and a create action pointing at a route
 * nobody built is a button that opens a 404.
 */

import { readFileSync, readdirSync } from "node:fs";

import { NAV_ITEMS, NAV_SECTIONS } from "../src/lib/workspace/navigation.ts";
import { QUICK_CREATE } from "../src/components/shell/quick-actions.tsx";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** Every page in the app, as its URL path, found once. */
const PAGES = (() => {
  const found = new Set<string>();

  const walk = (dir: string, url: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        // A bracketed folder is one of Next's route groups: it shares a layout
        // without adding a URL segment, which is why `/products/new` lives at
        // `src/app/(dashboard)/products/new` and a plain path lookup calls it
        // missing. A square-bracketed one is a parameter and matches anything.
        const grouped = entry.name.startsWith("(") && entry.name.endsWith(")");
        walk(`${dir}/${entry.name}`, grouped ? url : `${url}/${entry.name}`);
      } else if (entry.name === "page.tsx") {
        found.add(url === "" ? "/" : url);
      }
    }
  };

  walk("src/app", "");
  return found;
})();

/** Whether a link goes to a page that exists. */
function routeExists(href: string): boolean {
  const path = href.split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
  if (PAGES.has(path)) return true;

  // A parameterised page — /property/[id] serves /property/anything.
  const wanted = path.split("/");
  for (const page of PAGES) {
    const parts = page.split("/");
    if (parts.length !== wanted.length) continue;
    if (parts.every((part, i) => part === wanted[i] || /^\[.+\]$/.test(part))) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// The main menu
// ---------------------------------------------------------------------------

{
  const ids = NAV_SECTIONS.map((section) => section.id);
  check(
    "Professionals is a section of its own",
    ids.includes("professionals"),
    "it used to be a row under Marketplace, three clicks from Post a Job under Construction — the two halves of one market in two different sections",
  );

  check(
    "the sections are all distinct",
    new Set(ids).size === ids.length,
    ids.join(", "),
  );

  const itemIds = NAV_ITEMS.map((item) => item.id);
  check(
    "and no menu row appears twice",
    new Set(itemIds).size === itemIds.length,
    itemIds.filter((id, i) => itemIds.indexOf(id) !== i).join(", ") || "",
  );

  const hrefs = NAV_ITEMS.filter((item) => item.href).map((item) => item.href!);
  check(
    "no destination is reachable from two rows",
    new Set(hrefs).size === hrefs.length,
    hrefs.filter((href, i) => hrefs.indexOf(href) !== i).join(", ") || "",
    );

  const professionals = NAV_SECTIONS.find((section) => section.id === "professionals");
  check("the section has rows in it", (professionals?.items.length ?? 0) >= 3);
  check(
    "including finding a person and posting work",
    ["/professionals", "/jobs/new", "/jobs"].every((href) =>
      professionals?.items.some((item) => item.href === href),
    ),
    professionals?.items.map((item) => item.href).join(", "),
  );

  // Moved, not copied.
  for (const [id, gone] of [
    ["marketplace", "/professionals"],
    ["construction", "/jobs/new"],
    ["construction", "/jobs"],
  ] as const) {
    const section = NAV_SECTIONS.find((s) => s.id === id);
    check(
      `${gone} no longer sits under ${id} as well`,
      !section?.items.some((item) => item.href === gone),
      "two menu rows that go to the same page is worse than one in the wrong place",
    );
  }
}

// ---------------------------------------------------------------------------
// Every row goes somewhere
// ---------------------------------------------------------------------------

{
  const broken = NAV_ITEMS.filter(
    (item) => item.href && !routeExists(item.href),
  ).map((item) => `${item.label} -> ${item.href}`);

  check(
    "every menu row goes to a page that exists",
    broken.length === 0,
    broken.join("; "),
  );
}

// ---------------------------------------------------------------------------
// The + button
// ---------------------------------------------------------------------------

{
  check(
    "the + offers a 360 tour",
    QUICK_CREATE.some((action) => action.href.startsWith("/tours/new")),
    "it is the thing this app can do that the others cannot, and it was the one create flow the button did not offer",
  );
  check("and a property", QUICK_CREATE.some((a) => a.href.startsWith("/property/new")));
  check("and a job", QUICK_CREATE.some((a) => a.href.startsWith("/jobs/new")));
  check(
    "and somewhere to sell second-hand materials",
    QUICK_CREATE.some((a) => a.href.includes("condition=used")),
  );
  check("and somewhere to write a post", QUICK_CREATE.some((a) => a.href === "/community"));

  const brokenCreate = QUICK_CREATE.filter((a) => !routeExists(a.href)).map(
    (a) => `${a.label} -> ${a.href}`,
  );
  check(
    "every create action goes to a page that exists",
    brokenCreate.length === 0,
    brokenCreate.join("; "),
  );

  const createIds = QUICK_CREATE.map((a) => a.id);
  check("no create action is listed twice", new Set(createIds).size === createIds.length);

  check(
    "each one says what it makes",
    QUICK_CREATE.every((a) => (a.hint?.length ?? 0) > 8),
    "a list of nine verbs with no explanation is a list nobody reads",
  );

  check(
    "the list scrolls rather than running off the screen",
    /max-h-\[min\(70vh,32rem\)\][\s\S]{0,60}?overflow-y-auto/.test(
      readFileSync("src/components/shell/quick-actions.tsx", "utf8"),
    ),
    "nine rows is taller than the space above the button on a phone",
  );
}

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}x${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}navigation: every row goes somewhere, and only once${RESET}`);
