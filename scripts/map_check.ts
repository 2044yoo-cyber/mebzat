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

function walkAll(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walkAll(full) : [full];
  });
}

/**
 * The body of one named function, brace-matched.
 *
 * Per function, not per file. createBuildingElement and
 * createDevelopmentElement both draw an SVG glyph, so a file-wide search finds
 * one whichever of them still has it — and the check then reports on the wrong
 * marker while looking exactly like it is watching the right one.
 */
function bodyOf(source: string, name: string): string {
  const pattern = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`);
  const match = pattern.exec(source);
  if (!match) return "";

  // Paren depth, not "the character before the brace". A TypeScript signature
  // ends `): HTMLElement {`, so the character before the body's brace is the
  // return type — and a rule that looks for `)` walks straight past the body
  // into the first callback inside it, which is what it did here.
  let index = match.index + match[0].length;
  let depth = 0;
  let opened = false;
  while (index < source.length) {
    const char = source[index];
    if (char === "(") {
      depth += 1;
      opened = true;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === "{" && opened && depth === 0) {
      break;
    }
    index += 1;
  }
  if (index >= source.length) return "";

  let braceDepth = 1;

  const start = index + 1;
  index += 1;
  while (index < source.length && braceDepth > 0) {
    if (source[index] === "{") braceDepth += 1;
    else if (source[index] === "}") braceDepth -= 1;
    index += 1;
  }
  return source.slice(start, index);
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

const canvas = code("src/components/property/city-canvas.tsx");

// ---------------------------------------------------------------------------
// The map keys are gone
//
// Both on-map keys were removed at the owner's request. The marker colours
// stay; they simply no longer have a panel explaining them.
// ---------------------------------------------------------------------------

check("no price key is mounted", !/<PriceLegend[\s/>]/.test(canvas));
check("no colour key is mounted", !/MARKER_COLOURS/.test(canvas));

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
// Asserted as a property, not a spelling. The reservation moved from a
// hand-written `pb-[var(--bottom-nav-h)]` to the shared `pb-content-safe`,
// which clears the floating buttons as well as the bar; a check pinned to the
// old literal would have called that a regression.
check(
  "the scrolling workspace reserves room at its foot",
  /overflow-y-auto[^"]*pb-content-safe/.test(shell),
);
check(
  // The corner buttons are no longer in the *global* reservation: they are
  // 150px tall and 90px wide, and reserving their height across the whole
  // width left a band of dead space under every page. A column that ends in a
  // full-width control opts into `--actions-bottom-gap` instead.
  "and there is a reservation that covers the buttons for columns that need it",
  /--actions-bottom-gap:\s*calc\([^;]*--floating-actions-h/.test(css),
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
// No viewport units inside the workspace
//
// The shell is a fixed-height, internally-scrolling application: the workspace
// is the viewport minus the topbar, minus the tab strip, minus the phone's
// bottom bar. A `max-h-[60vh]` inside it is measuring a different thing from
// the box it sits in, and when the two disagree the parent's overflow crops
// what the child meant to scroll. That is how the Studio control sheet ended
// up with its last few controls unreachable by any gesture.
//
// studio-workspace.tsx already carried the reasoning in a comment — "h-full,
// not viewport arithmetic ... guess 36px wrong and the message box sits below
// the fold" — and the sheet two files away did it anyway. Hence a check rather
// than a note.
// ---------------------------------------------------------------------------

const studioFiles = walkAll("src/features/berchuma-studio/components").filter(
  (path) => path.endsWith(".tsx"),
);

check("there are studio components to inspect", studioFiles.length > 5, String(studioFiles.length));

for (const path of studioFiles) {
  const source = code(path);
  const offenders = [...source.matchAll(/(?:max-h|h|min-h)-\[\d+(?:d?vh)\]/g)].map(
    (match) => match[0],
  );
  check(`${path} sizes itself against its box, not the viewport`, offenders.length === 0, offenders.join(" "));
}

const sheet = code("src/features/berchuma-studio/components/editor/design-editor.tsx");
check(
  "the control sheet is a flex column",
  /flex max-h-\[70%\] flex-col overflow-hidden/.test(sheet),
);
check(
  "its header does not shrink",
  /flex shrink-0 items-center justify-between border-b/.test(sheet),
);
check(
  "and the list takes the rest and scrolls",
  /min-h-0 flex-1 overflow-y-auto overscroll-contain/.test(sheet),
);

// ---------------------------------------------------------------------------
// Full screen actually means full screen
//
// The failure worth guarding is the one named in the brief: a mode that makes
// the map card a bit larger and calls it full screen. `fixed inset-0` is the
// difference — the map leaves the page's grid entirely rather than growing
// inside it — and a check on the class is a check on that.
// ---------------------------------------------------------------------------

const explorer = code("src/components/property/city-explorer.tsx");

check(
  "full screen leaves the page layout rather than growing inside it",
  /fixed inset-0 z-\[60\] h-\[100dvh\]/.test(explorer),
);
check(
  "it sits above the bottom navigation, which is fixed at z-50",
  /z-\[60\]/.test(explorer) && !/z-\[4\d\]/.test(explorer),
);
check(
  "and clears the home indicator",
  /pb-\[env\(safe-area-inset-bottom\)\]/.test(explorer),
);
// The control belongs on the map, where map controls are and where it cannot
// wrap out of sight. In the page's control row it was the last item with
// `ml-auto`, so on a phone it landed at the end of a wrapped line below the
// fold — the one control that would have given the reader more map was the one
// they could not see.
check(
  "the full-screen control is on the map, not in the wrapping row",
  /onToggleFullscreen/.test(canvas) && !/Full screen/.test(explorer),
);
check(
  "it sits with the zoom and layer buttons",
  /onToggleFullscreen && \(\s*<MapButton/.test(canvas),
);
check(
  "and names both directions",
  /label=\{fullscreen \? "Exit full screen map" : "Enter full screen map"\}/.test(canvas),
);

// Below lg the page scrolls, so the city selector, search, sale/rent toggle and
// quick chips move out of the way instead of holding a third of a phone screen
// for the whole visit.
check(
  "the top controls scroll away on a phone",
  /overflow-y-auto[^"]*lg:overflow-hidden/.test(explorer),
);
check(
  "and the shell keeps its fixed-height shape from lg up",
  /lg:overflow-hidden/.test(explorer),
);
check(
  "the map keeps a definite height once the column scrolls",
  /"h-\[70svh\] lg:h-auto lg:flex-1"/.test(explorer),
);
check(
  "measured in svh, which already accounts for the browser's chrome",
  !/h-\[\d+vh\]/.test(explorer),
);
check(
  "full screen still fills, rather than taking the phone height",
  /fullscreen \? "flex-1"/.test(explorer),
);

check(
  "the results column steps aside so the map gets the width",
  /panelOpen \|\| fullscreen/.test(explorer) && /!panelOpen && !fullscreen/.test(explorer),
);
check(
  "and the frame around the map goes",
  /fullscreen \? "p-0" : "p-3"/.test(explorer),
);

// The rails are borrowed, not taken. Entering collapses them; exiting puts
// back whatever they were, so a reader who used the mode once does not find
// their navigation folded away tomorrow.
check(
  "the rails' previous state is remembered",
  /restoreRails\.current = \{/.test(explorer) &&
    /nav: shell\.navCollapsed/.test(explorer) &&
    /panel: shell\.panelCollapsed/.test(explorer),
);
check(
  "entering collapses them",
  /update\(\{ navCollapsed: true, panelCollapsed: true, panelMobile: false \}\)/.test(explorer),
);
check(
  "and leaving restores exactly what they were",
  /update\(\{ navCollapsed: previous\.nav, panelCollapsed: previous\.panel \}\)/.test(explorer),
);
check(
  "the mode itself is not persisted",
  !/update\(\{[^}]*fullscreen/.test(explorer),
);

// The map instance is reused. Rebuilding it would drop the markers, the
// clusters, the layers and the reader's position in one go.
const canvasSource = code("src/components/property/city-canvas.tsx");
check(
  "the map resizes rather than remounting",
  /new ResizeObserver\(\(\) => map\.resize\(\)\)/.test(canvasSource),
);
check(
  "and full screen does not key or remount the canvas",
  !/<CityCanvas[^>]*key=/.test(explorer),
);

// Reachable without a mouse, and leavable the way every full-screen surface
// on the web is leavable.
check("escape leaves", /event\.key === "Escape"/.test(explorer) && /exitFullscreen\(\)/.test(explorer));
check(
  "the listener is removed on exit",
  /removeEventListener\("keydown", onKey\)/.test(explorer),
);
// Asserted on MapButton, which is where the control now lives. It labels and
// announces every button in the stack, so the full-screen toggle inherits both
// rather than carrying its own copy — and a check pointed at the old location
// would have gone on passing only because the string was still in a comment.
check(
  "every map control is labelled",
  /aria-label=\{label\}/.test(canvas) && /title=\{label\}/.test(canvas),
);
check("and announces whether it is on", /aria-pressed=\{active\}/.test(canvas));
check(
  "the full-screen control passes its state through",
  /onClick=\{onToggleFullscreen\}\s*\n\s*active=\{fullscreen\}/.test(canvas),
);

// Everything that was on the control row is still on it.
for (const control of ["Search properties", "Layers", "Filters"]) {
  check(`${control} survives full screen`, explorer.includes(control));
}

// ---------------------------------------------------------------------------
// New projects are real developments, not listings wearing a colour
//
// The map already had building pins, derived from listings: two or more units
// sharing a coordinate become one marker. A development with nothing listed
// yet has no units to group, so it never appeared — and that is exactly the
// category "New Projects" names. These come from the buildings table instead.
// ---------------------------------------------------------------------------

const markers = code("src/lib/map/markers.ts");
const buildings = code("src/lib/data/buildings.ts");
const devCard = code("src/components/property/development-card.tsx");
const route = code("src/app/api/buildings/viewport/route.ts");

check("the layer is switched on", /id: "projects"[^}]*ready: true/.test(markers));
check(
  "and is not the listing-derived grouping under a new name",
  /export type MapDevelopment/.test(markers) && /export type BuildingGroup/.test(markers),
);
check(
  "the pins come from the buildings table, not from properties",
  /rpc\("buildings_in_viewport"/.test(buildings),
);
check(
  "counted in the database rather than the browser",
  !/from\("properties"\)[\s\S]{0,200}building_id/.test(buildings),
);

// Icon and colour, so the category survives colour blindness.
check("the pin has its own shape, not only its own colour", /createDevelopmentElement/.test(markers));

// Scoped to this function's own body. createBuildingElement draws an SVG glyph
// too, so a file-wide search for one passes with the development's glyph
// deleted — which is the check reporting on the wrong marker.
const developmentBody = bodyOf(markers, "createDevelopmentElement");
check("createDevelopmentElement is findable", developmentBody.length > 0);
check(
  "with a glyph of its own",
  /createElementNS\("http:\/\/www\.w3\.org\/2000\/svg", "svg"\)/.test(developmentBody),
);
check("and a labelled purpose for a screen reader", /new project`/.test(developmentBody));
check(
  "the colour is the one the Layers menu already shows",
  /DEVELOPMENT_COLOUR = "#ea580c"/.test(markers) &&
    /id: "projects", label: "New projects", colour: "#ea580c"/.test(markers),
);

// A tap opens a card. It does not navigate: comparing four towers should not
// cost four page loads and four presses of back.
check("tapping a pin opens a card", /setOpenDevelopment\(development\)/.test(canvas));
check("rather than navigating", !/router\.push[\s\S]{0,60}development/.test(canvas));
// The link itself, not the words. "View project" also appears in the file's
// own explanation of why the card does not navigate on tap, and a check that
// matches prose is a check that passes with the button deleted.
check(
  "the card offers the way through",
  /<Link\s+href=\{`\/building\/[\s\S]{0,600}?View project/.test(devCard),
);
check(
  "it works on a phone and a desktop from one component",
  /inset-x-2 bottom-2 sm:/.test(devCard),
);
check("and can be dismissed", /aria-label="Close"/.test(devCard));

// Fields the database has no answer for are left out, not filled with a dash.
check(
  "facts are pushed only when present",
  /if \(development\.totalUnits\) \{/.test(devCard) &&
    /development\.priceFrom !== null/.test(devCard),
);

// The layer switch is honoured in both directions.
check("the pins follow the switch off", /if \(developmentsOn\) return;[\s\S]{0,200}marker\.remove\(\)/.test(canvas));
check(
  "and so does the card, by arithmetic rather than an effect",
  /\{developmentsOn && openDevelopment && \(/.test(canvas),
);
check(
  "developments have their own marker map, so a pan does not rebuild the property pins",
  /developmentMarkers = useRef\(new Map</.test(canvas),
);

// The route refuses a half-formed box rather than scanning the table.
check(
  "a bad bounding box returns nothing rather than everything",
  /south === null \|\| north === null \|\| west === null \|\| east === null/.test(route),
);
check("and it never 5xxs at the map", !/status: 5\d\d/.test(route));

// ---------------------------------------------------------------------------
// A column that ends in a button has to clear what floats over it
//
// The workspace's box already stops above the navigation bar. The AI launcher
// and the + button sit *inside* that box, in the bottom-right corner, and the
// Studio's opening panel ends in a full-width "Start with a…" button — so the
// last control was reachable by scrolling and not by tapping. That is a worse
// failure than not reaching it at all: the reader can see it and is told, by
// the absence of any response, that they have misunderstood something.
// ---------------------------------------------------------------------------

check(
  "the floating actions' height is written down once",
  /--floating-actions-h:\s*[\d.]+rem/.test(css),
);
check(
  "the opening panel scrolls clear of them",
  /pb-actions-safe/.test(start),
);
check(
  "as scroll padding, so a panel that already fits does not move",
  /"pb-actions-safe sm:pb-8"/.test(start),
);
check(
  "and the two clearances are separate values",
  /--bottom-nav-h:/.test(css) && /--floating-actions-h:/.test(css),
);

// ---------------------------------------------------------------------------
// The marketplace category rail is two rows, and never more
//
// Twelve chips wrapped to five rows at 360px and pushed the products off the
// screen — a filter taller than the thing it filters. Shrinking the type alone
// does not close the gap: at text-xs with tight padding the chips still come
// to roughly 1150px against about 650px in two rows.
//
// So the row count is capped and the remainder scrolls. The trap this guards
// is the tempting fix: `hidden sm:flex` on the rail, or slicing the list to
// the first six, both of which make the screenshot look right by removing
// categories a phone reader can no longer reach.
// ---------------------------------------------------------------------------

const rail = code("src/components/products/marketplace-filters.tsx");

check("the rail is capped at two rows", /grid-flow-col grid-rows-2/.test(rail));
check("and the rest scrolls rather than wrapping", /overflow-x-auto/.test(rail));
check(
  "it wraps normally from sm up, where there is room",
  /sm:flex sm:grid-flow-row sm:flex-wrap sm:overflow-visible/.test(rail),
);
check(
  "no category is dropped to make it fit",
  /categories\.map\(/.test(rail) && !/categories\.slice\(/.test(rail),
);
check("and the rail is not simply hidden on a phone", !/"hidden sm:(flex|grid)/.test(rail));
check(
  "chips do not break mid-word inside a fixed row height",
  (rail.match(/whitespace-nowrap/g) ?? []).length >= 3,
);
check(
  "the type shrinks on a phone and returns from sm up",
  /text-xs[^"]*sm:text-sm/.test(rail),
);

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
}

console.log(
  `\n${failures.length === 0 ? GREEN : RED}${passed} passed, ${failures.length} failed${RESET}` +
    `\n${DIM}map: mobile map, sidebars and keys${RESET}\n`,
);

process.exit(failures.length === 0 ? 0 : 1);
