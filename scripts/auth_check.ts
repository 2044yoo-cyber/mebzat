/**
 * Google sign-in, checked where it can be checked without a browser.
 *
 *   npx tsx scripts/auth_check.ts
 *
 * The reported bug was a button that greyed out on click and then did nothing
 * for the rest of the page's life. The cause was two lines apart: a missing
 * environment variable, and a handler with no `finally` to release the loading
 * state when the resulting throw went past it.
 *
 * That class of failure is invisible to a type-checker and to a build. These
 * are the properties that stop it recurring.
 */

import { readFileSync } from "node:fs";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const button = readFileSync("src/components/auth/google-button.tsx", "utf8");
const client = readFileSync("src/lib/supabase/client.ts", "utf8");
const callback = readFileSync("src/app/auth/callback/route.ts", "utf8");

/** Comments stripped, so no check matches the prose explaining itself. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* -------------------------------------------------------------------------- */
/* The button always recovers                                                 */
/* -------------------------------------------------------------------------- */

check(
  "the click handler has a finally",
  /\} finally \{/.test(code(button)),
  "without it a throw leaves the button disabled for the life of the page",
);
check(
  "the finally releases the loading state",
  /\} finally \{[\s\S]{0,160}setLoading\(false\)/.test(code(button)),
);
check(
  "a config error is caught rather than escaping the handler",
  /catch \(caught\)[\s\S]{0,200}SupabaseConfigError/.test(code(button)),
);
check(
  "a second click while loading is ignored",
  /if \(loading\) return;/.test(code(button)),
);
check(
  "the button is disabled only by its own loading state",
  /disabled=\{loading\}/.test(code(button)) &&
    !/disabled=\{[^}]*(?:!|env|configured|missing)/.test(code(button)),
  "a button greyed out by absent configuration tells nobody why",
);

// The success path is the one case that must NOT clear the state — the page is
// navigating to Google and a flash back to normal looks like a failed click.
check(
  "a successful redirect stays in the loading state",
  /leaving = true;/.test(code(button)) && /if \(!leaving\) setLoading\(false\)/.test(code(button)),
);

/* -------------------------------------------------------------------------- */
/* Missing configuration is named, not guessed at                             */
/* -------------------------------------------------------------------------- */

check(
  "the client no longer asserts the env vars are present",
  !/process\.env\.NEXT_PUBLIC_SUPABASE_URL!/.test(code(client)),
  "the `!` is what turned a missing variable into a throw somewhere else",
);
check(
  "it names which variable is missing",
  /NEXT_PUBLIC_SUPABASE_URL/.test(code(client)) &&
    /missing\.join\(", "\)/.test(code(client)),
);
check(
  "the error is a distinct type",
  /class SupabaseConfigError/.test(code(client)),
  "'nothing is configured' and 'Supabase said no' need different advice",
);
check(
  "it mentions restarting the dev server",
  /Restart the dev server/.test(client),
  "Next reads env files at startup; editing one changes nothing until it restarts",
);

// Only public values are ever named. The service-role key is not a client
// concern and must not appear in a browser bundle at all.
check(
  "no service-role key in the browser client",
  !/SERVICE_ROLE/.test(client),
);
check(
  "the developer-facing detail is development-only",
  /NODE_ENV === "development"/.test(code(button)),
  "a production visitor gets a plain sentence, not a variable name",
);

/* -------------------------------------------------------------------------- */
/* The callback cannot be turned into a redirect to somewhere else            */
/* -------------------------------------------------------------------------- */

check(
  "the next parameter is validated",
  /function safeNext/.test(code(callback)),
  "`next` arrives from whoever wrote the link",
);
check(
  "protocol-relative paths are rejected",
  /startsWith\("\/\/"\)/.test(code(callback)),
  "`//evil.example` after an origin is read as a host, not a path",
);
// A plain string search rather than a regex. The pattern being looked for is
// itself two backslashes, and expressing that in a regex literal inside a
// TypeScript file means four levels of escaping — which is how a check ends up
// testing something other than what its name says.
check(
  "backslash paths are rejected",
  code(callback).includes(String.raw`startsWith("/\\")`),
  "some browsers normalise a backslash into a forward slash",
);
check(
  "absolute URLs are rejected",
  /includes\("::\/\/"\)|includes\("\:\/\/"\)/.test(code(callback)),
);
check(
  "anything unrecognised falls back to a known page",
  (code(callback).match(/return "\/dashboard";/g) ?? []).length >= 4,
  "a validator that returns the input on an unmatched case validates nothing",
);

/* -------------------------------------------------------------------------- */
/* Provider refusals are handled, not swallowed                               */
/* -------------------------------------------------------------------------- */

check(
  "an OAuth error parameter is handled",
  /searchParams\.get\("error"\)/.test(code(callback)),
  "a closed consent screen returns a parameter, not an exception",
);
check(
  "the exchange failure is logged",
  /code exchange failed/.test(callback),
);
check(
  "internals are not shown to the member",
  /error=auth_callback_failed/.test(code(callback)) &&
    !/error\.message\}`\)/.test(code(callback).split("NextResponse.redirect").slice(-1)[0] ?? ""),
);

/* -------------------------------------------------------------------------- */
/* Nothing else was touched                                                   */
/* -------------------------------------------------------------------------- */

check(
  "the button still targets Google",
  /provider: "google"/.test(code(button)),
);
check(
  "the redirect still points at the callback route",
  /\/auth\/callback\?next=/.test(code(button)),
);
check(
  "the origin is taken from the browser, not hard-coded",
  /window\.location\.origin/.test(code(button)),
  "a hard-coded host breaks either localhost or production, never both",
);

/* -------------------------------------------------------------------------- */

if (failures.length > 0) {
  console.error(`\n${failures.length} failed:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passed} passed, ${failures.length} failed\n`);
  process.exit(1);
}

console.log(`\n✓ ${passed} auth checks passed\n`);
