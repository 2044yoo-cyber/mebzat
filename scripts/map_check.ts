/**
 * The city map's key, on a phone.
 *
 *   npx tsx scripts/map_check.ts
 *
 * One rule here is easy to satisfy the wrong way, and the brief said so
 * outright: do not simply hide the legend on mobile. `sm:block` on the root
 * would pass any check that only asked whether the layout still fits, while
 * leaving a phone reader with coloured markers and nothing to read them by.
 * So what is asserted is that every row is still reachable — behind a tap, but
 * present — and that the desktop rendering is untouched.
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

const legend = code("src/components/property/price-legend.tsx");

// ---------------------------------------------------------------------------
// 1. Not hidden — folded
// ---------------------------------------------------------------------------

check("the legend still renders below sm", !/^\s*"hidden sm:/m.test(legend));
check(
  "there is a chip to open it, and only on a phone",
  /sm:hidden/.test(legend) && /setOpen\(true\)/.test(legend),
);
check(
  "the chip says what it opens rather than being a bare icon",
  /kind === "rent" \? "Rent" : "Price"/.test(legend),
);
check(
  "every band is rendered, not a shortened list",
  /rows\.map\(/.test(legend) && !/rows\.slice\(/.test(legend),
);
check(
  "the bars are shown once open, so the key works without colour",
  /open \? "flex" : "hidden"/.test(legend),
);

// ---------------------------------------------------------------------------
// 2. Desktop is unchanged
// ---------------------------------------------------------------------------

check(
  "from sm up the panel is open with no tap needed",
  /open \? "block" : "hidden sm:block"/.test(legend),
);
check("the desktop width is the width it was", /w-\[136px\] sm:w-\[168px\]/.test(legend));

// ---------------------------------------------------------------------------
// 3. It cannot overflow the screen
//
// A fixed pixel width on a 320px screen is how a panel ends up wider than the
// device and takes the whole page into a horizontal scroll.
// ---------------------------------------------------------------------------

check(
  "the panel is capped against the viewport, not only in pixels",
  /max-w-\[calc\(100vw-/.test(legend),
);

// ---------------------------------------------------------------------------
// 4. It can actually be tapped
//
// The legend used to carry `pointer-events-none`, which is correct for a label
// and fatal for a button: the chip would render and do nothing.
// ---------------------------------------------------------------------------

check("nothing on the legend swallows its own taps", !/pointer-events-none/.test(legend));

// ---------------------------------------------------------------------------
// 5. Tapping the map closes it again
// ---------------------------------------------------------------------------

check(
  "an outside press folds it away",
  /addEventListener\("pointerdown"/.test(legend) && /!node\.contains\(/.test(legend),
);
check(
  "on pointerdown rather than click, so a pan closes it as it starts",
  !/addEventListener\("click", away/.test(legend),
);
check("escape closes it too", /event\.key === "Escape"/.test(legend));
check(
  "and the listener is removed when it folds",
  /removeEventListener\("pointerdown"/.test(legend) &&
    /removeEventListener\("keydown"/.test(legend),
);
check(
  "the listener only exists while it is open",
  /if \(!open\) return;/.test(legend),
);

// ---------------------------------------------------------------------------
// 6. Reachable without a mouse
// ---------------------------------------------------------------------------

check("the chip is a button", /<button[\s\S]{0,200}setOpen\(true\)/.test(legend));
check("it declares what it controls", /aria-controls=\{panelId\}/.test(legend));
check("and whether it is open", /aria-expanded=/.test(legend));
check("the close control is labelled", /aria-label="Close the price key"/.test(legend));

// ---------------------------------------------------------------------------
// 7. Still mounted on the map
// ---------------------------------------------------------------------------

const canvas = code("src/components/property/city-canvas.tsx");
check("the map still renders the legend", /<PriceLegend[\s/>]/.test(canvas));

// ---------------------------------------------------------------------------
// The shell: hidden has to mean gone, not invisible
//
// `visibility: hidden` or `opacity-0` on a sidebar leaves its width in the
// layout, so the workspace never gets the space back and the reader sees a
// blank column where the menu used to be. Flex with `shrink-0` on the rail and
// `flex-1 min-w-0` on the workspace is what makes the expansion real: change
// the rail's width and the workspace takes the difference, with no media query
// and no second layout to keep in step.
// ---------------------------------------------------------------------------

const shell = code("src/components/shell/app-shell.tsx");

check(
  "the workspace takes whatever the rail gives back",
  /flex min-w-0 flex-1 flex-col/.test(shell),
);
check(
  "the rail is sized by a real width, not a visibility toggle",
  /style=\{\{ width: navWidth \}\}/.test(shell) &&
    !/invisible|opacity-0/.test(shell),
);
check(
  "collapsing narrows it rather than hiding it behind a class",
  /shell\.navCollapsed \? 60 : shell\.navWidth/.test(shell),
);
check(
  "the panel is sized the same way",
  /style=\{\{ width: shell\.panelWidth \}\}/.test(shell),
);
check(
  "both sides are independent state, not one flag",
  /navCollapsed/.test(shell) && /panelCollapsed/.test(shell),
);

// Below lg the rail floats over the page rather than taking a column from it.
check("on a phone the rail is a drawer", /fixed inset-0 z-60 lg:hidden/.test(shell));
check("with a backdrop that closes it", /aria-label="Close navigation"/.test(shell));

// Navigating closes it. This was the bug: only the backdrop closed the drawer,
// so tapping a nav item navigated underneath a sheet that stayed put.
check(
  "and it is shut by navigating away",
  /navOpenedAt !== null && navOpenedAt === pathname/.test(shell),
);
check(
  "derived rather than cleared in an effect",
  !/setNavOpenedAt\(null\);\s*\}, \[pathname\]/.test(shell),
);

const topbar = code("src/components/shell/topbar.tsx");
// Both labels present, asserted separately. `/s` would have been the tidy way
// to span the lines and this project targets ES2017, where the flag does not
// exist — it type-errors rather than misbehaving, which is the good outcome.
check(
  "the toggle says which way it goes",
  /Expand navigation/.test(topbar) && /Collapse navigation/.test(topbar),
);
check("and reports its state to a screen reader", /aria-pressed=\{navCollapsed\}/.test(topbar));

// ---------------------------------------------------------------------------
// The phone's bottom bar, and what has to clear it
//
// The bar is h-14 *plus* env(safe-area-inset-bottom). Clearing only the 56px
// is invisibly correct on a device with no inset and hides the last ~34px of
// the page on every iPhone since the X. Both consumers read one variable now,
// so the two cannot drift apart.
// ---------------------------------------------------------------------------

const css = readFileSync("src/app/globals.css", "utf8");

check(
  "the bar's real height is defined once",
  /--bottom-nav-h:\s*calc\(3\.5rem \+ env\(safe-area-inset-bottom\)\)/.test(css),
);
check(
  "the scrolling workspace clears it",
  /overflow-y-auto[^"]*pb-\[var\(--bottom-nav-h\)\] lg:pb-0/.test(shell),
);
check(
  "and the floating buttons sit above it",
  /fixed right-0 bottom-\[var\(--bottom-nav-h\)\]/.test(shell),
);
check(
  "neither of them hardcodes 56px any more",
  !/pb-14 lg:pb-0/.test(shell) && !/fixed right-0 bottom-14/.test(shell),
);

// ---------------------------------------------------------------------------
// Studio's opening panel can be scrolled to its end
//
// It was `h-full ... justify-center` with no overflow rule. A flex column that
// centres what it cannot contain spills it off both ends, so the last size
// control and the start button were below the fold and the heading above it,
// with no scrollbar either way. Padding would have moved unreachable content a
// little further up and left it unreachable.
// ---------------------------------------------------------------------------

const start = code("src/features/berchuma-studio/components/start-panel.tsx");

check(
  "the opening panel scrolls",
  /overflow-y-auto overscroll-contain/.test(start),
);
check(
  "it centres by min-height rather than by cropping",
  /flex min-h-full w-full flex-col/.test(start),
);
check(
  "the scroll container is the outer element, not the centred column",
  /h-full w-full max-w-2xl overflow-y-auto/.test(start),
);
check(
  "and it no longer centres a column it cannot contain",
  !/"mx-auto flex h-full w-full max-w-2xl flex-col gap-5 p-4"/.test(start),
);

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
}

console.log(
  `\n${failures.length === 0 ? GREEN : RED}${passed} passed, ${failures.length} failed${RESET}` +
    `\n${DIM}map: the key folds, it does not vanish${RESET}\n`,
);

process.exit(failures.length === 0 ? 0 : 1);
