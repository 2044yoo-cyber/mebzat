/**
 * Lets a check script import a module marked `import "server-only"`.
 *
 * `server-only` is not a package. Next.js resolves it during the build and
 * turns it into an error when a server module is pulled into a client bundle —
 * which is exactly the guard we want on `router.ts`, `context.ts` and the
 * agents, because their instructions are prompt content that must not ship to
 * the browser.
 *
 * Under plain Node there is no bundler to resolve it, so importing any of those
 * modules fails with "Cannot find module 'server-only'". The alternatives were
 * both worse: dropping the guard would take the protection off eleven files to
 * make a test run, and re-implementing the router's scoring inside the test
 * would mean the test passes while the real router does something else.
 *
 * So the stub is confined to the test process. Nothing in `src/` changes, the
 * guard still holds everywhere Next looks at it, and the check exercises the
 * real `routeAgent` against the real trigger lists.
 *
 * Import this FIRST, before anything that reaches a server-only module —
 * imports are evaluated in order, so the patch is installed by the time the
 * next one resolves.
 */

import Module from "node:module";
import { fileURLToPath } from "node:url";

type Resolver = (
  this: unknown,
  request: string,
  ...rest: unknown[]
) => string;

/**
 * A real file on disk, not a builtin.
 *
 * `_resolveFilename` returns a *path* that the loader then reads. Returning
 * "node:util" from it produces `ENOENT: no such file or directory, open
 * 'node:util'` — builtins are short-circuited earlier in the pipeline and
 * never reach this hook.
 */
const STUB = fileURLToPath(new URL("./empty.cjs", import.meta.url));

const internals = Module as unknown as { _resolveFilename: Resolver };
const original = internals._resolveFilename;

internals._resolveFilename = function patched(request, ...rest) {
  // `client-only` is the mirror guard and would fail the same way.
  if (request === "server-only" || request === "client-only") return STUB;
  return original.call(this, request, ...rest);
};
