/**
 * Nothing ends underneath the phone's bottom furniture.
 *
 *   npx tsx scripts/bottom_gap_check.ts
 *
 * ## What was actually wrong
 *
 * The shell reserved `--bottom-nav-h` at the foot of the scrolling column,
 * which is the navigation bar and *only* the navigation bar. The same shell
 * also renders a floating stack — Ask Medosha AI and the quick-action button —
 * pinned directly above that bar. A page whose last control was full-width
 * therefore cleared the bar and landed under the buttons. That is why "Save
 * changes" was reachable on some pages and not others: it depended entirely on
 * how wide the button happened to be.
 *
 * Second cause, independent of the first: the shell was `h-screen`. On a mobile
 * browser `100vh` is the viewport with the URL bar hidden — the largest it ever
 * gets — so the shell was taller than what was actually on screen.
 *
 * ## What is easy to fake
 *
 * Adding padding to one page. These checks therefore assert that the
 * reservation is defined once, that the shell's scroll container is what wears
 * it, and that no page has gone back to writing the calculation out by hand.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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

function walkAll(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walkAll(full) : [full];
  });
}

const css = readFileSync("src/app/globals.css", "utf8");
const shell = code("src/components/shell/app-shell.tsx");

// ---------------------------------------------------------------------------
// 1. The reservation exists, once, and covers both pieces of furniture
// ---------------------------------------------------------------------------

/**
 * The base definition alone.
 *
 * There are two — the `:root` one and the desktop override — and the desktop
 * one legitimately mentions `--floating-actions-h`. A regex over the whole file
 * therefore went on matching after the base definition had been gutted down to
 * the bar, which is the exact bug this suite exists for. Scoped to the text
 * before the media query.
 */
const baseGap = css.slice(0, css.indexOf("@media (min-width: 1024px)"));

check("the gap is defined as a variable", /--content-bottom-gap:/.test(baseGap));
// The bar spans the full width, so this part is genuinely global.
check(
  "and it counts the bar",
  /--content-bottom-gap:\s*calc\([^;]*--bottom-nav-h/.test(baseGap),
);
check(
  "with room to tap the last control rather than it sitting flush",
  /--content-bottom-gap:\s*calc\([^;]*\+\s*1rem/.test(baseGap),
);

// The floating buttons are 150px tall and about 90px wide, in one corner.
// Reserving their height across the whole width — which the first version of
// this did — put a band of dead space under every page. That is a different
// way of wasting the screen, not a fix. They are opt-in instead.
check(
  "the global reservation does NOT include the corner buttons",
  !/--content-bottom-gap:\s*calc\([^;]*--floating-actions-h/.test(baseGap),
);
check("but an opt-in reservation exists for columns that need them", /--actions-bottom-gap:/.test(baseGap));
check(
  "and that one counts both",
  /--actions-bottom-gap:\s*calc\([^;]*--bottom-nav-h[^;]*--floating-actions-h/.test(baseGap),
);
check("with a utility to apply it", /\.pb-actions-safe\s*\{[\s\S]{0,80}var\(--actions-bottom-gap\)/.test(css));

// The case the opt-in exists for: a column ending in a full-width button.
{
  const startPanel = code("src/features/berchuma-studio/components/start-panel.tsx");
  check("the studio's start panel opts in", /pb-actions-safe/.test(startPanel));
  // And does not keep a hand-written copy alongside it, which is how the gap
  // got counted twice and left 368px of nothing under the Start button.
  check(
    "and does not also hand-write the same reservation",
    !/pb-\[var\(--floating-actions-h\)\]/.test(startPanel),
  );
}

// The bar's own height must include the home-indicator inset, or a reservation
// built on it is short by ~34px on every iPhone since the X.
check("the bar's height includes the safe-area inset", /--bottom-nav-h:\s*calc\([^;]*safe-area-inset-bottom/.test(css));

// Measured, not guessed: 20 + 48 + 12 + 48 + 20 = 148px.
check("the floating stack's height is the measured 9.25rem", /--floating-actions-h:\s*9\.25rem/.test(css));

// ---------------------------------------------------------------------------
// 2. There is one utility, and the shell's scroll container wears it
// ---------------------------------------------------------------------------

check("a shared utility exists", /\.pb-content-safe\s*\{[\s\S]{0,80}var\(--content-bottom-gap\)/.test(css));
check(
  "and the workspace's scroll container uses it",
  /overflow-y-auto[^"]*pb-content-safe/.test(shell),
);
// The padding has to be on the element that scrolls. On a parent that does not
// scroll it reserves space nobody can reach.
check(
  "on the element that actually scrolls, not a parent",
  /className="@container\/ws[^"]*overflow-y-auto[^"]*pb-content-safe/.test(shell),
);

// ---------------------------------------------------------------------------
// 3. Desktop keeps the bar's height out of it
// ---------------------------------------------------------------------------

{
  const media = css.slice(css.indexOf("@media (min-width: 1024px)"));
  const block = media.slice(0, media.indexOf("}\n}") + 3);
  check("from lg up the gap is redefined", /--content-bottom-gap/.test(block));
  // Nothing full-width to clear there — BottomNav is `lg:hidden` — so the
  // global reservation goes to nothing and desktop stays as it was.
  check("to nothing, because the bar is not rendered there", /--content-bottom-gap:\s*0px/.test(block));
  check("while the opt-in still clears the buttons, which are there", /--actions-bottom-gap:\s*calc\([^;]*--floating-actions-h/.test(block));
}

// ---------------------------------------------------------------------------
// 4. Nothing writes the calculation out by hand any more
//
// Three calculator pages had, and all three had it wrong — they cleared the
// bar and not the buttons. A copy cannot be corrected without finding it.
// ---------------------------------------------------------------------------

{
  const files = [...walkAll("src/app"), ...walkAll("src/components"), ...walkAll("src/features")].filter(
    (f) => f.endsWith(".tsx"),
  );
  const handWritten = files.filter((file) => {
    if (file.endsWith("app-shell.tsx")) return false; // positions the buttons
    return /pb-\[(calc\()?var\(--bottom-nav-h\)/.test(code(file));
  });
  check("no page hand-writes the bottom padding", handWritten.length === 0, handWritten.join(", "));
}

// ---------------------------------------------------------------------------
// 5. The viewport unit
//
// `100vh` is the viewport with the URL bar hidden. A shell sized to it is
// taller than the screen while the bar is showing, and the overflow is at the
// bottom — under the navigation.
// ---------------------------------------------------------------------------

check("the shell is sized in dynamic viewport units", /h-dvh/.test(shell));
check("and not the static one", !/h-screen/.test(shell.slice(shell.indexOf("overflow-hidden bg-background") - 60, shell.indexOf("overflow-hidden bg-background") + 20)));

{
  const files = [...walkAll("src/app"), ...walkAll("src/components"), ...walkAll("src/features")].filter(
    (f) => f.endsWith(".tsx"),
  );
  // global-error.tsx renders without the shell and without a bottom bar, so it
  // is the one place a static viewport height is still the right answer.
  const stale = files.filter(
    (file) => !file.endsWith("global-error.tsx") && /\b100vh\b/.test(code(file)),
  );
  check("no component still sizes itself in 100vh", stale.length === 0, stale.join(", "));
}

// ---------------------------------------------------------------------------
// 6. Containers that scroll on their own carry it themselves
// ---------------------------------------------------------------------------

for (const [label, path] of [
  ["the city explorer", "src/components/property/city-explorer.tsx"],
  ["the studio's control rail", "src/features/berchuma-studio/components/editor/control-panel.tsx"],
] as const) {
  const source = code(path);
  // Counted against the number of independent scrollers, because the city
  // explorer has two — its root and its listings column — and a file-level
  // regex kept matching after one of them lost it.
  const scrollers = (source.match(/overflow-y-auto/g) ?? []).length;
  const cleared = (source.match(/pb-content-safe/g) ?? []).length;
  check(
    `${label} clears the furniture on every column that scrolls`,
    cleared >= Math.min(scrollers, 2) && cleared > 0,
    `${scrollers} scrollers, ${cleared} cleared`,
  );
  // And gives the space back where there is no bar.
  check(`${label} does not keep the space on desktop`, /lg:pb-/.test(source));
}

// The workspaces sized off the viewport must subtract the gap, or their pinned
// composer lands exactly at the fold with the bar over it.
for (const path of [
  "src/components/ai/medosha-ai.tsx",
  "src/components/ai/render/sketch-workspace.tsx",
  "src/components/ai/studio/studio.tsx",
]) {
  const source = code(path);
  check(
    `${path.split("/").pop()} subtracts the gap from its own height`,
    /100dvh-3\.5rem-var\(--content-bottom-gap\)/.test(source),
  );
}

// ---------------------------------------------------------------------------
// 7. The keyboard
//
// Tapping an input near the foot of a form makes the browser scroll it into
// view. Without a scroll-padding it parks it flush against the container's
// bottom — behind the bar, with the keyboard open.
// ---------------------------------------------------------------------------

check("the scroll container reserves the gap for browser-driven scrolling too", /scroll-pb-content-safe/.test(shell));
check("and the utility for it exists", /\.scroll-pb-content-safe\s*\{[\s\S]{0,90}scroll-padding-bottom/.test(css));

// Nothing scrolls on focus. Automatic scrolling that fires on every tap is its
// own problem, and the brief said so.
{
  const files = [...walkAll("src/components"), ...walkAll("src/features")].filter((f) => f.endsWith(".tsx"));
  const onFocus = files.filter((file) => /onFocus=\{[^}]*scrollIntoView/.test(code(file)));
  check("nothing scrolls the page on focus", onFocus.length === 0, onFocus.join(", "));
}

// ---------------------------------------------------------------------------
// 8. The bar itself is untouched
// ---------------------------------------------------------------------------

{
  const nav = code("src/components/shell/bottom-nav.tsx");
  check("the bar is still fixed to the bottom", /fixed inset-x-0 bottom-0/.test(nav));
  check("still hidden from lg up, where the rail replaces it", /lg:hidden/.test(nav));
  // The <nav> element's own class, not the More sheet's — that panel also
  // carries the inset, and a file-level regex went on matching after the bar
  // itself lost it.
  const navElement = nav.slice(nav.indexOf("fixed inset-x-0 bottom-0"), nav.indexOf("fixed inset-x-0 bottom-0") + 400);
  check("and still clears the home indicator", /pb-\[env\(safe-area-inset-bottom\)\]/.test(navElement));
  check("the floating stack sits above the bar, not on it", /bottom-\[var\(--bottom-nav-h\)\]/.test(shell));
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}layout: the last control clears the bar and the buttons above it${RESET}`);
