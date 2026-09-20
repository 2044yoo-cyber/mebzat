import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const paths = {
  css: "src/app/globals.css",
  layout: "src/app/layout.tsx",
  settings: "src/app/(dashboard)/settings/page.tsx",
  appearance: "src/components/settings/appearance-settings.tsx",
  logo: "src/components/layout/logo.tsx",
  sidebar: "src/components/shell/sidebar.tsx",
  icon: "public/medosha_logo_icon.svg",
};
const actual = Object.fromEntries(
  Object.entries(paths).map(([key, path]) => [key, readFileSync(path, "utf8")]),
);

function verify(files) {
  assert.match(files.css, /--primary: oklch\(0\.55 0\.2 257\)/);
  assert.match(files.css, /\.dark \{[\s\S]*--background: oklch\(0\.16 0\.025 255\)/);
  assert.match(files.layout, /defaultTheme="light"/);
  assert.match(files.settings, /<AppearanceSettings \/>/);
  assert.match(files.appearance, /onClick=\{\(\) => setTheme\(value\)\}/);
  assert.match(files.appearance, /"light"[\s\S]*"dark"[\s\S]*"system"/);
  assert.match(files.logo, /<BrandIcon className="size-7" \/>/);
  assert.match(files.sidebar, /<BrandIcon \/>/);
  assert.doesNotMatch(files.logo + files.sidebar, />\s*M\s*</);
  assert.match(files.icon, /<svg[\s\S]*Medosha/);
}

verify(actual);
for (const [key, from, to] of [
  ["css", "--primary: oklch(0.55 0.2 257)", "--primary: black"],
  ["layout", 'defaultTheme="light"', 'defaultTheme="dark"'],
  ["appearance", "setTheme(value)", "setTheme('light')"],
  ["logo", '<BrandIcon className="size-7" />', "<span>M</span>"],
]) {
  assert.throws(() => verify({ ...actual, [key]: actual[key].replace(from, to) }));
}

console.log("PASS: global Medosha palette, settings theme selection and shared logo icon; four mutations rejected.");
