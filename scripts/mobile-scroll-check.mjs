import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actual = {
  css: readFileSync("src/app/globals.css", "utf8"),
  shell: readFileSync("src/components/shell/app-shell.tsx", "utf8"),
};

function verify({ css, shell }) {
  assert.match(css, /--content-bottom-gap:\s*calc\(var\(--bottom-nav-h\) \+ var\(--floating-actions-h\) \+ 1\.5rem\)/);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*--content-bottom-gap:\s*0px/);
  assert.match(shell, /h-dvh min-h-dvh/);
  assert.match(shell, /overflow-x-hidden overflow-y-auto[^"\n]*pb-content-safe[^"\n]*scroll-pb-content-safe/);
}

verify(actual);
for (const [key, from, to] of [
  ["css", " + var(--floating-actions-h)", ""],
  ["css", " + 1.5rem", ""],
  ["shell", " min-h-dvh", ""],
  ["shell", "overflow-x-hidden ", ""],
]) {
  assert.throws(() => verify({ ...actual, [key]: actual[key].replace(from, to) }));
}

console.log("PASS: global mobile scroll clearance; four deliberate mutations rejected.");
