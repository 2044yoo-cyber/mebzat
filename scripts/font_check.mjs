/**
 * The site renders in a font, and Fidel renders in one that has the syllables.
 *
 *   npx next build && node scripts/font_check.mjs
 *
 * ## What was wrong
 *
 * `globals.css` declared `--font-sans: var(--font-sans)` inside `@theme
 * inline` and nothing defined `--font-sans` itself. A custom property that
 * refers only to itself is invalid at computed-value time, so every
 * `font-family: var(--font-sans)` in the stylesheet resolved to nothing and
 * `html { @apply font-sans }` did nothing at all. Geist was downloaded on
 * every page load and never drawn.
 *
 * ## Why this is a browser and not a regex
 *
 * The failure was *cascade behaviour*, and no amount of reading the source
 * catches it — the declaration was there, spelled correctly, in the right
 * file. What it needed was something that resolves variables, which is what a
 * browser is. The same applies to the settings samples: a custom property set
 * on an element does not change what its text is drawn in, because inheritance
 * carries the *computed* `font-family` down, not the `var()` that produced it.
 * A sample only works because it re-declares `font-family: var(--font-sans)`,
 * and that is the sort of thing that gets deleted as redundant.
 *
 * The built CSS is used rather than the source: `@apply`, `@theme` and
 * `@custom-variant` are Tailwind, not CSS, and a browser handed the source
 * skips exactly the rules under test.
 *
 * ## Two lines this cannot pin, and why that is the honest answer
 *
 * Mutation testing found that `html { @apply font-sans }` and the
 * `--font-sans: var(--font-sans)` line inside `@theme inline` can both be
 * deleted with every assertion below still passing. That is not a gap in the
 * assertions — both are genuinely redundant in Tailwind v4. Preflight already
 * sets `html { font-family: var(--default-font-family) }`, and the `:root`
 * block is emitted after the theme's own `--font-sans`, so it wins either way.
 * They are left in place because they are explicit and harmless, and are not
 * mutated, because a mutant that changes no behaviour is a mutant that teaches
 * nothing about the check.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { chromium } from "playwright";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

function builtCss() {
  const found = execSync(
    "grep -l 'font-stack-default' .next/static/chunks/*.css 2>/dev/null | head -1",
    { encoding: "utf8", shell: "/bin/bash" },
  ).trim();

  if (!found) {
    // Not a skip. A check that passes when it could not look is a check that
    // stops testing the day the build output moves.
    console.log(
      `${RED}No built stylesheet contains the font tokens.${RESET}\n` +
        `Run ${DIM}npx next build${RESET} first, or the CSS no longer defines them.`,
    );
    process.exit(1);
  }
  return readFileSync(found, "utf8");
}

const css = builtCss();

// `next/font` injects these at build time from the page's own <head>, so the
// harness supplies them. Recognisable names, so a stack can be read at a
// glance in a failure message.
const page = `<!doctype html><html class="h-full"><head>
<style>${css}</style>
<style>:root { --font-geist-sans: "GeistProbe"; --font-noto-ethiopic: "EthiopicProbe"; }</style>
</head><body class="min-h-full">
  <p id="sample">Medosha መዶሻ</p>
  <button data-font="serif"><span id="serif" style="font-family: var(--font-sans)">Aa</span></button>
  <button data-font="system"><span id="system" style="font-family: var(--font-sans)">Aa</span></button>
  <button data-font="default"><span id="default" style="font-family: var(--font-sans)">Aa</span></button>
</body></html>`;

writeFileSync("/tmp/medosha-font-check.html", page);

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
});
const tab = await browser.newPage();
await tab.goto("file:///tmp/medosha-font-check.html");

const familyOf = (selector) =>
  tab.$eval(selector, (element) => getComputedStyle(element).fontFamily);

const leads = (stack, family) => stack.trim().startsWith(family);
const includes = (stack, family) => stack.includes(family);

// ---------------------------------------------------------------------------
// 1. There is a font at all
// ---------------------------------------------------------------------------

const root = await familyOf("html");
check(
  "the document has a font family",
  root.length > 0 && root !== "initial",
  `computed: ${root || "(empty)"}`,
);
check(
  "and it is the one the site is designed in",
  leads(root, "GeistProbe"),
  `${root} — a self-referential --font-sans resolves to nothing and this is empty`,
);
check(
  "the body inherits it",
  leads(await familyOf("body"), "GeistProbe"),
);

// ---------------------------------------------------------------------------
// 2. Fidel has somewhere to fall through to
// ---------------------------------------------------------------------------

check(
  "an Ethiopic face follows the Latin one",
  includes(root, "EthiopicProbe"),
  "a browser picks a face per character; without this, Amharic is boxes",
);
check(
  "and it does not lead",
  !leads(root, "EthiopicProbe"),
  `${root} — leading with it draws every Latin letter in its Latin glyphs`,
);
check(
  "a local Ethiopic face is there for a failed webfont",
  includes(root, "Noto Sans Ethiopic") &&
    includes(root, "Nyala") &&
    includes(root, "Kefa"),
  "Windows, Apple and Android each ship a different one",
);

// ---------------------------------------------------------------------------
// 3. The setting changes the page
// ---------------------------------------------------------------------------

await tab.evaluate(() =>
  document.documentElement.setAttribute("data-font", "serif"),
);
const serifPage = await familyOf("html");
check(
  "choosing the serif changes what the page is drawn in",
  leads(serifPage, "ui-serif"),
  serifPage,
);
check("and Fidel still has a face there", includes(serifPage, "EthiopicProbe"));

await tab.evaluate(() =>
  document.documentElement.setAttribute("data-font", "system"),
);
const systemPage = await familyOf("html");
check(
  "so does choosing the device's own",
  leads(systemPage, "ui-sans-serif"),
  systemPage,
);
check("and Fidel still has a face there too", includes(systemPage, "EthiopicProbe"));

await tab.evaluate(() =>
  document.documentElement.removeAttribute("data-font"),
);
check(
  "removing the choice goes back to the default",
  leads(await familyOf("html"), "GeistProbe"),
);

// ---------------------------------------------------------------------------
// 4. Each sample on the settings screen is drawn in its own face
// ---------------------------------------------------------------------------

check(
  "the serif sample is serif",
  leads(await familyOf("#serif"), "ui-serif"),
  await familyOf("#serif"),
);
check(
  "the device sample is the device's",
  leads(await familyOf("#system"), "ui-sans-serif"),
  await familyOf("#system"),
);

await tab.evaluate(() =>
  document.documentElement.setAttribute("data-font", "serif"),
);
check(
  "and the default sample shows the default even on a page set to something else",
  leads(await familyOf("#default"), "GeistProbe"),
  `${await familyOf("#default")} — this is what the [data-font="default"] rule is for`,
);

// ---------------------------------------------------------------------------
// 5. Reading a whole page in Amharic
// ---------------------------------------------------------------------------

await tab.evaluate(() => {
  document.documentElement.removeAttribute("data-font");
  document.documentElement.setAttribute("lang", "am");
});
const amharic = await familyOf("body");
check(
  "an Amharic page leads with the Ethiopic face",
  leads(amharic, "EthiopicProbe"),
  amharic,
);

await tab.evaluate(() =>
  document.documentElement.setAttribute("data-font", "serif"),
);
check(
  "and the reader's font choice still decides the Latin words on it",
  includes(await familyOf("body"), "ui-serif"),
  `${await familyOf("body")} — naming the default face here would make the setting do nothing in Amharic`,
);

await browser.close();

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}fonts: the site renders in one, and Fidel has a face${RESET}`);
