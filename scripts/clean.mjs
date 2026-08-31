// Removes every generated cache. Not just .next: Turbopack keeps a persistent
// index under .next/dev/cache, and a half-deleted .next leaves that index
// pointing at data files that are gone — which surfaces as "Cannot find module
// './chunks/ssr/[turbopack]_runtime.js'" or a missing .sst file, neither of
// which is a code error.
//
// Deletion is verified rather than assumed. On Windows a file held open by a
// running node process fails silently with force:true, and a partial clean is
// what causes the corruption in the first place.
import { existsSync, rmSync } from "node:fs";
import { createConnection } from "node:net";

const TARGETS = [".next", ".turbo", "node_modules/.cache", "tsconfig.tsbuildinfo"];

// --- Refuse to clean underneath a running server -------------------------
//
// This script existed to fix the corruption and could cause it. Deleting
// `.next` while a dev server is serving from it leaves that server answering
// every route with "Internal Server Error" — the browser shows nothing else,
// and the real message, `ENOENT ... build-manifest.json`, only appears in a
// terminal. Cleaning is the standard advice for a broken build, so the
// standard advice was breaking installs that were merely stale.
//
// Detected by knocking on the port rather than by listing processes, because
// process names differ across platforms and the dev server retitles itself to
// `next-server`, which is why "kill everything called next" misses it.

/** Whether something is listening on a local port. */
function inUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const done = (answer) => {
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(400);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

const force = process.argv.includes("--force");
const busy = [];
for (const port of [3000, 3001, 3002]) {
  if (await inUse(port)) busy.push(port);
}

if (busy.length > 0 && !force) {
  console.error(
    `\n✗ Something is still serving on port ${busy.join(", ")}.`,
  );
  console.error(
    "  Deleting the build cache underneath a running server is what causes",
  );
  console.error(
    '  "Internal Server Error" on every page. Stop it first:\n',
  );
  console.error("    Windows:  Get-Process node | Stop-Process -Force");
  console.error("    macOS:    pkill -f 'next dev'\n");
  console.error("  Then run npm run clean again.");
  console.error("  (npm run clean -- --force skips this check.)\n");
  process.exit(1);
}

let failed = false;

for (const target of TARGETS) {
  if (!existsSync(target)) continue;
  try {
    rmSync(target, { recursive: true, force: true });
  } catch {
    // Swallowed so the remaining targets are still attempted.
  }
  if (existsSync(target)) {
    console.error(`✗ ${target} could not be removed — something still has it open.`);
    failed = true;
  } else {
    console.log(`✓ removed ${target}`);
  }
}

if (failed) {
  console.error("\nStop every node process (and close your editor) and run this again.");
  process.exit(1);
}

console.log("✓ caches clear.");
