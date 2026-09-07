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
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
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

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}touch: a press is visible, and so is the wait after it${RESET}`);
