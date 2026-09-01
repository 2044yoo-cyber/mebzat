/**
 * Explore freely. Join when you want to participate.
 *
 *   npx tsx scripts/public_access_check.ts
 *
 * The failure this guards against is quiet and structural: a page ends up in a
 * folder whose layout redirects to /login, and content that was meant to be
 * shareable stops being reachable. Nobody decides it. There is no error. The
 * only symptom is that links from TikTok, Facebook and Google land on a login
 * form, and whoever sent them never finds out.
 *
 * So these checks are about *where the decision lives* as much as what it is.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every page and layout under src/app. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/^(page|layout)\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk("src/app");
const route = (f: string) =>
  f.replace(/^src\/app/, "").replace(/\/(page|layout)\.tsx$/, "") || "/";

/* -------------------------------------------------------------------------- */
/* No layout gates a whole section                                            */
/* -------------------------------------------------------------------------- */

// This is the one that caused it. A redirect in a layout applies to every page
// beneath it, including ones added later by somebody who never saw the layout.
const gatingLayouts = files
  .filter((f) => f.endsWith("layout.tsx"))
  .filter((f) => /redirect\(["'`]\/login/.test(code(readFileSync(f, "utf8"))));

check(
  "no layout redirects to login",
  gatingLayouts.length === 0,
  gatingLayouts.map(route).join(", ") ||
    "a page added to that folder later is walled off by accident",
);

/* -------------------------------------------------------------------------- */
/* Public content stays public                                                */
/* -------------------------------------------------------------------------- */

// Routes somebody may arrive on from a shared link. If any of these ever gains
// a redirect, the share is dead and nothing reports it.
const MUST_BE_PUBLIC = [
  "/marketplace",
  "/marketplace/[id]",
  "/companies",
  "/companies/[slug]",
  "/u/[username]",
  "/(dashboard)/projects/[id]",
  "/(dashboard)/directory/[type]",
  "/(dashboard)/help",
  "/(dashboard)/map",
  "/",
];

for (const target of MUST_BE_PUBLIC) {
  const file = files.find((f) => route(f) === target && f.endsWith("page.tsx"));
  if (!file) continue;
  const source = code(readFileSync(file, "utf8"));
  check(
    `${target} is viewable without an account`,
    !/redirect\(["'`]\/login/.test(source),
    "a link shared to this page must not land on a login form",
  );
}

/* -------------------------------------------------------------------------- */
/* Private pages still protect themselves                                     */
/* -------------------------------------------------------------------------- */

// Removing the blanket gate is only safe because these gate individually.
// If one of them stopped, the layout is no longer there to catch it.
const MUST_BE_PRIVATE = [
  "/(dashboard)/dashboard",
  "/(dashboard)/saved",
  "/(dashboard)/products",
  "/(dashboard)/products/new",
  "/(dashboard)/products/[id]/edit",
  "/(dashboard)/projects",
  "/(dashboard)/projects/new",
  "/(dashboard)/projects/[id]/edit",
  "/(dashboard)/profile",
  "/(dashboard)/profile/edit",
  "/(dashboard)/messages",
  "/(dashboard)/messages/[id]",
  "/(dashboard)/settings",
  "/(dashboard)/billing",
  "/(dashboard)/billing/return",
  "/(dashboard)/dashboard/services",
  "/(dashboard)/dashboard/services/new",
  "/(dashboard)/dashboard/services/[id]/edit",
  "/(dashboard)/dashboard/services/[id]/analytics",
  "/(dashboard)/projects/[id]/agenda",
  "/(dashboard)/admin/diagnostics",
];

// Known limit, stated rather than glossed: this reads the gate's text, not
// its reachability. Deleting or commenting one is caught; making it
// unreachable (`if (false) redirect(...)`) is not, because the call is still
// written. Catching that needs the type checker or a running request, not a
// regex — so do not read a pass here as proof the gate fires.
for (const target of MUST_BE_PRIVATE) {
  const file = files.find((f) => route(f) === target && f.endsWith("page.tsx"));
  if (!file) continue;
  const source = code(readFileSync(file, "utf8"));
  check(
    `${target} still requires an account`,
    /redirect\(["'`]\/login/.test(source) ||
      /requireViewer\(/.test(source) ||
      (/isAdmin\(/.test(source) && /notFound\(\)/.test(source)),
    "this page shows one person's own data and lost its only gate",
  );
}

/* -------------------------------------------------------------------------- */
/* Every page in the old walled garden has been given a verdict               */
/* -------------------------------------------------------------------------- */

// The blanket gate used to answer this question for the whole folder, wrongly
// but uniformly. Now each page answers it, which means a page added later
// answers it by accident — whichever way the author happened to write it.
//
// So the lists above have to stay exhaustive. An unclassified page is not a
// failure of the page; it is a decision nobody made.
const classified = new Set([...MUST_BE_PUBLIC, ...MUST_BE_PRIVATE]);
const unclassified = files
  .filter((f) => f.includes("(dashboard)") && f.endsWith("page.tsx"))
  .map(route)
  .filter((r) => !classified.has(r));

check(
  "every page in the member area is declared public or private",
  unclassified.length === 0,
  unclassified.join(", ") ||
    "add it to MUST_BE_PUBLIC or MUST_BE_PRIVATE — leaving it out means the choice was never made",
);

/* -------------------------------------------------------------------------- */
/* The prompt replaces the redirect for actions                               */
/* -------------------------------------------------------------------------- */

const prompt = readFileSync("src/components/auth/join-prompt.tsx", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");

check(
  "the join prompt is mounted at the root",
  /<JoinPromptProvider>/.test(code(layout)),
  "otherwise a Like button deeper in the tree has nothing to ask",
);
check(
  "it returns the visitor to where they were",
  /next=\$\{next\}/.test(code(prompt)) && /usePathname/.test(code(prompt)),
  "sending somebody to a dashboard after they asked to save a listing loses them",
);
check(
  "it offers both create account and log in",
  /Create account/.test(prompt) && /Log in/.test(prompt),
);
// The Dialog *root*, not any component whose name starts with it.
// `/<Dialog/` also matches `<DialogContent`, so replacing the root element
// left the check passing on a component that no longer renders a dialog.
check(
  "it is a dialog rather than a navigation",
  /<Dialog\s*\n/.test(code(prompt)) &&
    /open=\{state\.open\}/.test(code(prompt)) &&
    !/router\.push/.test(code(prompt)),
  "a redirect throws away the page, the scroll position and the intent",
);

/* -------------------------------------------------------------------------- */
/* Signed-out visitors get a way in                                           */
/* -------------------------------------------------------------------------- */

const nav = readFileSync("src/components/layout/dashboard-nav.tsx", "utf8");

check(
  "the header shows Join Medosha when signed out",
  /Join Medosha/.test(nav),
);
check(
  "and Log in",
  />\s*Log in\s*</.test(nav),
);
check(
  "the nav accepts a signed-out state",
  /NavProfile \| null/.test(code(nav)),
  "a nav that requires a profile forces its layout to require a session",
);
check(
  "member-only links are hidden from visitors",
  /MEMBER_LINKS/.test(code(nav)) && /PUBLIC_LINKS/.test(code(nav)),
  "a Dashboard link for somebody with no account is an invitation to a wall",
);

/* -------------------------------------------------------------------------- */
/* The helpers make the decision explicit                                     */
/* -------------------------------------------------------------------------- */

const session = readFileSync("src/lib/auth/session.ts", "utf8");

check("the session helper is server-only", /^import "server-only";/m.test(session));
check(
  "there is a viewer-or-null reader",
  /export async function getViewer/.test(session),
  "the default should be 'who is here, if anyone', not 'demand a session'",
);
check(
  "requireViewer carries the destination",
  /login\?next=\$\{encodeURIComponent\(next\)\}/.test(code(session)),
);
check(
  "ownership is described as a render decision, not a security boundary",
  /row-level security/i.test(session),
  "a page relying on this alone is one policy change from a leak",
);

/* -------------------------------------------------------------------------- */

if (failures.length > 0) {
  console.error(`\n${failures.length} failed:\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n${passed} passed, ${failures.length} failed\n`);
  process.exit(1);
}

console.log(`\n✓ ${passed} public-access checks passed\n`);
