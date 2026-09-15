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

  check("the drawer has a width of its own", /MOBILE_NAV_WIDTH = 72/.test(shell));
  check("and uses it", /style=\{\{ width: MOBILE_NAV_WIDTH \}\}/.test(shell));
  check("rather than the old flat panel", !/w-\[280px\]/.test(shell));

  // The stored collapse state is the desktop rail's, and the control that
  // changes it is desktop-only. Following it onto a phone strands the reader
  // either way: expanded gives a 5cm drawer, collapsed gives no labels and no
  // way to get them.
  // Matched on the prop, not the line. The element gained another prop and
  // wrapped onto several lines; a regex pinned to the one-line spelling
  // called that a regression.
  check(
    "the drawer forces its own mode",
    /<Sidebar[\s\S]{0,160}?\bcollapsed\b[\s\S]{0,120}?\/>/.test(shell),
  );
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

// ---------------------------------------------------------------------------
// A rail of glyphs is only a shortcut once you know the place
//
// The drawer was right-sized and unreadable: ten icons and no words, on a site
// nobody has learned yet. Following one took you to that section's first page
// without ever showing the other thirteen things in it.
// ---------------------------------------------------------------------------

{
  const rail = code("src/components/shell/sidebar.tsx");
  const shell = code("src/components/shell/app-shell.tsx");
  const panel = code("src/components/shell/section-panel.tsx");

  // A word under every glyph, and room for it to wrap — "Berchuma Studio" and
  // "Material Exchange" both need two lines at this width.
  check("every icon in the rail carries its name", /line-clamp-2 text-center text-\[9px\]/.test(rail));
  check("and the rail is wide enough for it to wrap", /MOBILE_NAV_WIDTH = 72/.test(shell));

  // Opening a section lists what is in it rather than jumping to its first
  // page. Sections with nothing in them still navigate — a panel listing
  // nothing is a worse answer than the page.
  check("a section with pages opens instead of navigating", /onPickSection && section\.items\.length > 0/.test(rail));
  check("and one without them still goes straight there", /if \(!target\) return null;/.test(rail));
  check("the rail is told what to do by the drawer", /onPickSection=\{setOpenSection\}/.test(shell));
  check("the panel is mounted when a section is picked", /<SectionPanel[\s/>]/.test(shell));

  // The panel names each page and carries the one line the manifest already
  // holds about it, which is the part that makes a new site choosable.
  check("the panel lists a section's pages", /section\.items\.map/.test(panel));
  check("with the manifest's own one-line hint", /\{item\.hint\}/.test(panel));
  check("an unbuilt module is a disabled row, not a link into nothing", /Soon/.test(panel) && /if \(!item\.href\)/.test(panel));
  check("a private page sends a signed-out reader to sign in", /item\.private && !signedIn/.test(panel));
  check("its rows are 44px", /min-h-11/.test(panel));

  // The wrapper stretched to the full width of the fixed overlay, so a strip
  // of invisible wrapper past the panel swallowed taps meant for the backdrop
  // and the drawer stopped closing when you tapped beside it.
  check("the drawer is only as wide as what is in it", /relative flex h-full w-fit/.test(shell));

  // Reopening the drawer starts at the rail rather than wherever the last
  // visit left off.
  check("closing the drawer forgets the open section", /setOpenSection\(null\)/.test(shell));
}

// ---------------------------------------------------------------------------
// The global press layer
//
// Everything above is per-component: a variant here, a navigation row there.
// This is the system that covers what is left, which is most of what a thumb
// lands on. It lives entirely in `globals.css`, so it is read from there.
// ---------------------------------------------------------------------------

const css = readFileSync("src/app/globals.css", "utf8");

/** The press block alone, so a rule elsewhere in the file cannot satisfy this. */
function pressLayer(): string {
  const at = css.indexOf(" * The press\n");
  if (at === -1) return "";
  return css.slice(at);
}

const press = pressLayer();

/**
 * How much a selector weighs, as [ids, classes, types].
 *
 * Written out rather than matched for, because the load-bearing property of
 * this whole layer is a number: the press rule has to weigh *less* than a
 * call site's own `active:bg-*`, or every blue button in the application
 * presses to white. A regex can tell you `:where(` appears; it cannot tell you
 * the selector that resulted is light enough, and the difference between those
 * two is the bug.
 *
 * `:where()` contributes nothing, including where it is nested inside `:not()`
 * — which is the subtle half. `:not()` otherwise takes the weight of its
 * argument, so three bare exclusions would have made this rule heavier than
 * the two-class utility it must lose to.
 */
function specificity(selector: string): [number, number, number] {
  // CSS escapes first. Tailwind writes `active:bg-primary/70` as the class
  // `.active\:bg-primary\/70`, where the colon and the slash are escaped
  // literals inside one name. Counted raw, that colon reads as a second
  // pseudo-class and the utility comes out heavier than it is — which is the
  // direction that would have hidden the fault rather than reported it.
  let flat = selector.replace(/\\./g, "x");

  // Drop every `:where(...)` with its contents, innermost first.
  for (;;) {
    const at = flat.indexOf(":where(");
    if (at === -1) break;
    let depth = 0;
    let end = -1;
    for (let i = at + ":where".length; i < flat.length; i += 1) {
      if (flat[i] === "(") depth += 1;
      if (flat[i] === ")") {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end === -1) break;
    flat = flat.slice(0, at) + flat.slice(end + 1);
  }

  // `:not(...)` keeps its argument's weight, so unwrap rather than drop.
  flat = flat.replace(/:not\(/g, "(");

  const ids = (flat.match(/#[\w-]+/g) ?? []).length;
  const classes =
    (flat.match(/\.[\w-]+/g) ?? []).length +
    (flat.match(/\[[^\]]+\]/g) ?? []).length +
    (flat.match(/:(?!:)[a-z-]+(?:\([^)]*\))?/g) ?? []).length;
  const types = (flat.match(/(?:^|[\s,>+~(])([a-z][\w-]*)/g) ?? []).length;
  return [ids, classes, types];
}

{
  // The calculator itself, against selectors whose weight is not in doubt.
  // A check built on a broken measure passes on broken code.
  check(
    "the specificity calculator agrees about a plain class",
    specificity(".bg-primary").join() === "0,1,0",
    specificity(".bg-primary").join(),
  );
  check(
    "and about a class with a pseudo-class on it",
    specificity(".active\\:bg-primary\\/70:active").join() === "0,2,0",
    specificity(".active\\:bg-primary\\/70:active").join(),
  );
  check(
    "and that :where weighs nothing",
    specificity(":where(button, a[href]):active").join() === "0,1,0",
    specificity(":where(button, a[href]):active").join(),
  );
  check(
    "and that a bare :not weighs what is inside it",
    specificity("button:not([disabled]):active").join() === "0,2,1",
    specificity("button:not([disabled]):active").join(),
  );
}

{
  /**
   * The selector of the rule enclosing an offset, `up` levels out.
   *
   * Two earlier attempts could not do this. A regex cannot: `:not(:where(…))`
   * nests its parentheses, so `\)` stops at the inner one, the match
   * backtracks, and what came back was several rules run together weighing
   * 0,11,417. Walking back one `{` cannot either, now that the press state is
   * nested — that finds `&:active` and not the list it belongs to.
   *
   * Braces are counted backwards, which is exact, and the selector is whatever
   * sits between the end of the last comment or rule and the `{`.
   */
  function enclosing(index: number, up: number): string {
    let from = index;
    for (let level = 0; level <= up; level += 1) {
      let depth = 0;
      let open = -1;
      for (let j = from - 1; j >= 0; j -= 1) {
        if (press[j] === "}") depth += 1;
        else if (press[j] === "{") {
          if (depth === 0) { open = j; break; }
          depth -= 1;
        }
      }
      if (open === -1) return "";
      if (level === up) {
        const before = press.slice(0, open);
        // Each candidate is the offset *past* its delimiter, so a comment's
        // closing `*/` does not leave its slash on the front of the selector —
        // which it did, and turned `&:active` into `/\n    &:active`.
        const after = (index: number, length: number) =>
          index === -1 ? 0 : index + length;
        const cut = Math.max(
          after(before.lastIndexOf("}"), 1),
          after(before.lastIndexOf("{"), 1),
          after(before.lastIndexOf("*/"), 2),
        );
        return press.slice(cut, open).trim();
      }
      from = open;
    }
    return "";
  }

  const at = press.indexOf("scale: var(--press-scale);");
  check("the press rule is in the stylesheet", at !== -1);

  const nested = enclosing(at, 0);
  const parent = enclosing(at, 1);
  const layer = enclosing(at, 2);

  check(
    "the press state is nested inside the list, so the list is written once",
    nested === "&:active",
    `${nested} — three copies of it is what let tabs stop responding silently`,
  );
  check(
    "and the list is the one that carries the transition",
    parent.includes(":where(") && parent.includes(":not(:where(:disabled"),
    parent.slice(0, 40),
  );

  // `&` carries the weight of the list it is nested in, so the effective
  // selector is that list with `:active` on the end of it.
  const weight = specificity(`${parent}:active`);

  check(
    "the press rule weighs one pseudo-class, no more",
    weight.join() === "0,1,0",
    `${weight.join()} — anything heavier paints the blue Save button white`,
  );
  check(
    "so a call site's own active colour still wins",
    weight[1] < specificity(".active\\:bg-primary\\/70:active")[1],
    "two classes must beat one, or every variant's press colour is overridden",
  );
  check(
    "and it is in the utilities layer, where specificity is allowed to decide",
    layer === "@layer utilities",
    `${layer} — in components it would lose to every bg-* utility and never show at all`,
  );
}

{
  check(
    "the tint is layered over the background, not swapped for it",
    /:active\s*\{[^}]*background-image:\s*linear-gradient\(/.test(press) &&
      !/:active\s*\{[^}]*background-color:/.test(press),
    "background-color would replace a glass button's glass instead of tinting it",
  );
  check(
    "the ink is white in the dark theme and black in the light one",
    /--press-ink:\s*0 0 0;/.test(press) &&
      /\.dark\s*\{[^}]*--press-ink:\s*255 255 255;/.test(press),
    "a white wash over a white button is not feedback, and this application has both themes",
  );

  const tint = Number(/--press-tint:\s*([\d.]+)/.exec(press)?.[1] ?? 0);
  check(
    "the tint is subtle rather than a wash",
    tint >= 0.05 && tint <= 0.14,
    `${tint}`,
  );

  const scale = Number(/--press-scale:\s*([\d.]+)/.exec(press)?.[1] ?? 0);
  check(
    "the press shrinks the element, slightly",
    scale >= 0.94 && scale < 1,
    `${scale} — below this it lurches, at 1 it does nothing`,
  );

  const ms = Number(/--press-ms:\s*(\d+)ms/.exec(press)?.[1] ?? 0);
  check(
    "and answers within the window a tap still feels connected in",
    ms >= 80 && ms <= 150,
    `${ms}ms`,
  );

  check(
    "the transition names scale, not transform",
    /transition-property:[^;]*\bscale\b/.test(press),
    "Tailwind v4 writes scale as its own property, so a transition on transform leaves it snapping",
  );
  check(
    "the browser's own grey flash is turned off",
    /-webkit-tap-highlight-color:\s*transparent/.test(press),
    "otherwise the platform paints its own rectangle over the effect",
  );
  check(
    "and the double-tap delay with it",
    /touch-action:\s*manipulation/.test(press),
    "feedback that is correct and 300ms late reads as the same fault",
  );
}

{
  // Every surface the request named has to be matched by something. Checked as
  // a list because the selector is long and losing one line of it is silent.
  for (const selector of [
    "button",
    "summary",
    "a[href]",
    '[role="button"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="switch"]',
    'label:has(> input[type="checkbox"])',
    'label:has(> input[type="radio"])',
    ".press",
  ]) {
    check(
      `the press reaches ${selector}`,
      new RegExp(`^\\s*${selector.replace(/[[\]"$^*+?.()|{}\\]/g, "\\$&")},?\\s*$`, "m").test(press),
    );
  }

  check(
    "a label wrapping a text field is left alone",
    !/^\s*label,\s*$/m.test(press),
    "pressing a field's name would scale the field",
  );
  check(
    "an anchor with no target is left alone",
    !/^\s*a,\s*$/m.test(press),
    "an anchor without an href is a name, not a control",
  );
  check(
    "a disabled control does not answer a press",
    /:not\(:where\(:disabled, \[aria-disabled="true"\], \[data-no-press\]\)\)/.test(
      press,
    ),
  );
}

{
  /**
   * The balanced `{ … }` that follows a marker.
   *
   * The reduced-motion assertion was a regex with `[\s\S]*?` in it, and that
   * skipped straight past a mutated block to the next `scale: none` in the
   * file — the opt-out rule, thirty lines below. It reported the feature as
   * present while the feature had been replaced by `display: none`.
   */
  function blockAfter(marker: string): string {
    const at = press.indexOf(marker);
    if (at === -1) return "";
    const open = press.indexOf("{", at);
    if (open === -1) return "";
    let depth = 0;
    for (let i = open; i < press.length; i += 1) {
      if (press[i] === "{") depth += 1;
      if (press[i] === "}") {
        depth -= 1;
        if (depth === 0) return press.slice(open, i + 1);
      }
    }
    return "";
  }

  const reduced = blockAfter("@media (prefers-reduced-motion: reduce)");

  check(
    "there is a reduced-motion block to look at",
    reduced.length > 0 && reduced.includes(":active"),
  );
  check(
    "reduced motion keeps the feedback and drops only the movement",
    /scale: none;/.test(reduced) &&
      !/display:/.test(reduced) &&
      !/background-image:\s*none/.test(reduced),
    "turning the whole thing off leaves that reader with the problem this fixes",
  );
  check(
    "nothing here removes the keyboard's focus ring",
    !/focus-visible[^{]*\{[^}]*outline:\s*none/.test(press) &&
      !/:focus-visible[^{]*\{[^}]*box-shadow:\s*none/.test(press),
  );
}

// ---------------------------------------------------------------------------
// Safari only applies :active when the document is listening for touches
// ---------------------------------------------------------------------------

{
  const touch = code("src/components/shell/touch-press.tsx");
  const layout = code("src/app/layout.tsx");

  check(
    "a touch listener is registered on the document",
    /document\.addEventListener\("touchstart", noop, \{ passive: true \}\)/.test(
      touch,
    ),
    "without one, iOS applies :active to anchors and to nothing else",
  );
  check(
    "passively, so it cannot make a scroll feel heavy",
    /\{ passive: true \}/.test(touch),
  );
  check(
    "and taken off again",
    /return \(\) => document\.removeEventListener\("touchstart", noop\)/.test(
      touch,
    ),
  );
  check(
    "it renders nothing",
    /return null;/.test(touch),
  );
  check(
    "and it is actually mounted, once, at the root",
    /<TouchPress \/>/.test(layout) &&
      /from "@\/components\/shell\/touch-press"/.test(layout),
    "a fix that is not in the tree is a fix that runs nowhere",
  );
}

// ---------------------------------------------------------------------------
// Where a press effect would be a fault
// ---------------------------------------------------------------------------

{
  // A dimmed backdrop is a button so it can be dismissed from a keyboard.
  // Scaling the whole screen by three per cent when a finger lands on it is
  // not feedback. Counted, so that losing the attribute on one of the five
  // scrims is not hidden by the other four.
  const scrims = [
    "src/components/ai/studio/studio.tsx",
    "src/components/shell/bottom-nav.tsx",
    "src/components/shell/command-palette.tsx",
    "src/components/shell/app-shell.tsx",
  ];

  let backdrops = 0;
  let optedOut = 0;
  for (const path of scrims) {
    const source = code(path);
    backdrops += (source.match(/className="absolute inset-0 cursor-default bg-black\//g) ?? []).length;
    optedOut += (
      source.match(/data-no-press\s*\n\s*className="absolute inset-0 cursor-default bg-black\//g) ?? []
    ).length;
  }

  check(
    "there are backdrops to find",
    backdrops >= 5,
    `${backdrops} — if this is zero the check below is vacuous`,
  );
  check(
    "every dimmed backdrop opts out of the press",
    optedOut === backdrops,
    `${optedOut} of ${backdrops}`,
  );

  check(
    "and the opt-out actually turns it off",
    /\[data-no-press\]:active \{\s*scale: none;\s*background-image: none;/.test(
      press,
    ),
  );
}

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}touch: a press is visible, and so is the wait after it${RESET}`);
