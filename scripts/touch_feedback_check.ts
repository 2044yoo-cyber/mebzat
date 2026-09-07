/**
 * A tap has to look like it landed.
 *
 *   npx tsx scripts/touch_feedback_check.ts
 *
 * ## What went wrong
 *
 * Every interactive surface in the application styled its feedback with
 * `hover:`. On a touchscreen there is no pointer and `hover:` never fires, so
 * pressing a row changed nothing at all — and the only evidence the tap had
 * registered was the next page painting a second or two later. People pressed
 * two and three times. On a link that is merely annoying; on anything that
 * submits, the second press is a second submission.
 *
 * Two states are needed and neither substitutes for the other:
 *
 *   `active:`  — the press. Instant, and gone when the finger lifts.
 *   pending    — the wait. Covers the gap between the finger lifting and the
 *                page arriving, which is precisely the window people were
 *                re-tapping into.
 *
 * The easy way to fake passing this is to add `active:` to a base class and
 * leave the variants alone, so the checks below look at each variant.
 */

import { readFileSync } from "node:fs";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** Comments stripped: an explanation must not satisfy its own assertion. */
/**
 * NOTE ON STRIPPING BLOCK COMMENTS
 *
 * `/\*` is only treated as a comment opener when something that cannot be part
 * of a token precedes it. Without that guard the `/\*` inside a string literal
 * — `accept="image/\*"` is the common one — opens a comment that runs to the
 * next real `*\/`, silently deleting everything between. In this repository
 * that was 109 files and, in one case, 3,497 characters of real markup.
 *
 * Checks read the stripped text, so anything swallowed is code no assertion can
 * see: the check passes because the thing it was looking for is not there to
 * disagree with, which is worse than the check not existing.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// ---------------------------------------------------------------------------
// 1. Every button variant answers a press
//
// Per variant, not per file. `active:` anywhere in button.tsx is satisfied by
// the base class's 1px nudge while every variant still changes nothing a thumb
// can see.
// ---------------------------------------------------------------------------

const button = code("src/components/ui/button.tsx");

/** One variant's class string, by name. */
function variant(name: string): string {
  const pattern = new RegExp(`\\b${name}:\\s*\\n?\\s*"([^"]*)"`);
  return pattern.exec(button)?.[1] ?? "";
}

/**
 * A press state that applies in the ordinary light theme.
 *
 * `/active:/` alone is satisfied by `dark:active:bg-input/60`, so a variant
 * whose only press state is dark-mode-only passed while doing nothing for most
 * readers. The class has to start the utility, not sit inside another one.
 */
function hasPressState(classes: string): boolean {
  return /(?:^|\s)active:/.test(classes);
}

for (const name of ["default", "outline", "secondary", "ghost", "destructive"]) {
  const classes = variant(name);
  check(`the ${name} button has a press state at all`, hasPressState(classes), classes.slice(0, 60));
  // A colour change, not only a 1px shift. The nudge is invisible at arm's
  // length in daylight, which is where a lot of Medosha gets used.
  check(
    `and it changes colour, not just position`,
    /(?:^|\s)active:(bg-|text-|opacity-)/.test(classes),
    classes.slice(0, 60),
  );
}

check("the link variant answers too", hasPressState(variant("link")));

// Every variant that offers a hover state offers a press state, because the
// hover one is the desktop half of the same affordance.
{
  const names = ["default", "outline", "secondary", "ghost", "destructive", "link"];
  const hoverOnly = names.filter((name) => {
    const classes = variant(name);
    return /(?:^|\s)hover:/.test(classes) && !hasPressState(classes);
  });
  check("no variant is hover-only", hoverOnly.length === 0, hoverOnly.join(", "));
}

// ---------------------------------------------------------------------------
// 2. The pending indicator is real, and is what Next provides for this
// ---------------------------------------------------------------------------

const pending = code("src/components/shell/nav-pending.tsx");

check("the pending state comes from the Link itself", /useLinkStatus/.test(pending));
check("imported from next/link, where it lives", /from "next\/link"/.test(pending));
// A timeout would either flash on a cached route or still be spinning after a
// slow one. The hook knows when the navigation actually ends.
check("and not from a guessed timeout", !/setTimeout/.test(pending));
check("nothing renders while idle", /if \(!pending\) return null;/.test(pending));
// Not /role="status"/ — that is a substring of `data-role="status"`, so
// renaming the attribute away left the check passing.
check("the spinner is announced to a screen reader", /(?<![\w-])role="status"/.test(pending));
check("and the icon itself is not, since it duplicates that", /aria-hidden/.test(pending));

// ---------------------------------------------------------------------------
// 3. Navigation surfaces use both halves
// ---------------------------------------------------------------------------

for (const [label, path] of [
  ["the sidebar", "src/components/shell/sidebar.tsx"],
  ["the bottom bar", "src/components/shell/bottom-nav.tsx"],
] as const) {
  const source = code(path);

  check(`${label} answers a press`, /active:bg-/.test(source));
  check(`${label} shows a pending spinner`, /<NavPending[\s/>]/.test(source));
  check(`${label} tints the row while it waits`, /<NavPendingTint[\s/>]/.test(source));
  // The tint is inert unless the row's own class looks for it.
  // Counted, not merely present. bottom-nav has three rows that need the
  // selector — the tab bar and two kinds of row in the More sheet — and a
  // file-level regex went on matching after one of them lost it.
  const tints = (source.match(/<NavPendingTint[\s/>]/g) ?? []).length;
  const selectors = (source.match(/has-\[\[data-nav-pending\]\]/g) ?? []).length;
  check(
    `${label} wires a selector for every tint it renders`,
    selectors >= tints && tints > 0,
    `${tints} tints, ${selectors} selectors`,
  );
  check(`${label} imports both`, /NavPending, NavPendingTint/.test(source));
}

// Every navigation row that offers hover offers a press.
{
  const sidebar = code("src/components/shell/sidebar.tsx");
  const hoverRows = sidebar.match(/hover:bg-muted[^"]*/g) ?? [];
  const withoutPress = hoverRows.filter((row) => !/active:/.test(row));
  check(
    "no sidebar row is hover-only",
    withoutPress.length === 0,
    withoutPress.join(" | "),
  );
}

// ---------------------------------------------------------------------------
// 4. The tint element cannot be seen, only matched
//
// It exists to be found by `:has()`. If it ever rendered visibly it would be a
// stray box in the middle of a row.
// ---------------------------------------------------------------------------

check("the tint marker is hidden", /data-nav-pending=""[\s\S]{0,40}className="hidden"/.test(pending));
check("and is hidden from assistive technology", /aria-hidden data-nav-pending/.test(pending));

// ---------------------------------------------------------------------------
// The phone's navigation drawer
//
// It was a flat 280px panel rendering whatever mode the desktop rail was in.
// With that rail collapsed it showed 36px icons centred in 280px — three
// quarters of a phone screen to display a column of glyphs, most of it empty.
// ---------------------------------------------------------------------------

{
  const shell = code("src/components/shell/app-shell.tsx");
  const rail = code("src/components/shell/sidebar.tsx");

  check("the drawer has a width of its own", /MOBILE_NAV_WIDTH = 60/.test(shell));
  check("and uses it", /style=\{\{ width: MOBILE_NAV_WIDTH \}\}/.test(shell));
  check("rather than the old flat panel", !/w-\[280px\]/.test(shell));

  // The stored collapse state is the desktop rail's, and the control that
  // changes it is desktop-only. Following it onto a phone strands the reader
  // either way: expanded gives a 5cm drawer, collapsed gives no labels and no
  // way to get them.
  check("the drawer forces its own mode", /<Sidebar signedIn=\{signedIn\} counts=\{live\} collapsed \/>/.test(shell));
  check("and the rail accepts the override", /collapsed \?\? storedCollapsed/.test(rail));

  // Icons with no text beside them have to carry their name some other way.
  check("every icon in the rail is named", /aria-label=\{section\.label\}/.test(rail));
  check("and titled, for a pointer", /title=\{section\.label\}/.test(rail));
  // 36px is under what a thumb hits reliably, and this rail is now the whole
  // drawer on a phone rather than a desktop convenience.
  // Every target in the rail, not just the section links: the home badge was
  // still 36px after the sections were raised, and a measurement in the
  // browser is what caught it rather than reading the class list back.
  {
    const collapsedBranch = rail.slice(rail.indexOf("if (navCollapsed)"), rail.indexOf("return (\n    <nav\n      aria-label=\"Workspace\""));
    const sizes = [...collapsedBranch.matchAll(/flex size-(\d+) items-center justify-center rounded-lg/g)].map((m) => Number(m[1]));
    check(
      "every target in the rail is 44px",
      sizes.length > 0 && sizes.every((n) => n >= 11),
      `sizes found: ${sizes.map((n) => n * 4).join(", ")}px`,
    );
  }
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}touch: a press is visible, and so is the wait after it${RESET}`);
