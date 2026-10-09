import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url).pathname;
const mutation = [
  "/services/geometry.ts",
  "? preferredKitchenDoorLeaves(span.width, gap)",
  "? bay.doorLeaves",
];

async function load(changed = false) {
  let matched = false;
  const result = await build({
    absWorkingDir: root,
    entryPoints: ["scripts/kitchen-door-widths-check.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    packages: "external",
    plugins: changed ? [{ name: "kitchen-door-mutation", setup(builder) {
      builder.onLoad({ filter: /\.ts$/ }, ({ path }) => {
        const source = readFileSync(path, "utf8");
        const next = path.endsWith(mutation[0]) ? source.replace(mutation[1], mutation[2]) : source;
        matched ||= next !== source;
        return { contents: next, loader: "ts" };
      });
    } }] : [],
  });
  if (changed) assert.ok(matched, "the kitchen door count mutation matched the geometry call");
  const mod = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, {
    module: mod,
    exports: mod.exports,
    require,
    console,
    structuredClone,
    crypto: globalThis.crypto,
    process,
  });
}

await load();
await assert.rejects(load(true), undefined, "the geometry check must reject reverting kitchen doors to the stored pair count");
console.log("PASS: kitchen door width check rejects a mutation that restores stored pair counts.");
