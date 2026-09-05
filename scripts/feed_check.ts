/**
 * The discovery feed: what the browser half must not do.
 *
 *   npx tsx scripts/feed_check.ts
 *
 * The ranking is asserted in supabase/tests/feed-discovery.sql, against a real
 * PostgreSQL. What is left here is the half that lives in TypeScript, and
 * every rule below is one that fails quietly rather than loudly.
 *
 * A feed that repeats does not throw. It renders twelve perfectly good cards
 * the reader has already read, and looks exactly like a feed that works.
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
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * The body of one named function, brace-matched.
 *
 * Per function, not per file. `loadMore` carrying the session's seen list is
 * not `changeFilter` carrying it, and a file-level regex cannot tell them
 * apart — which is exactly how one of them would keep repeating content while
 * the check stayed green.
 */
function bodyOf(source: string, name: string): string {
  const pattern = new RegExp(`(?:async function|function|const)\\s+${name}\\b`);
  const match = pattern.exec(source);
  if (!match) return "";

  // The body's opening brace is the first `{` after the name whose previous
  // non-space character is `)` or `=>`. That is what separates it from a
  // destructured parameter or an options object, and it holds for all three
  // shapes in this codebase: `function f(a) {`, `const f = async () => {`, and
  // `const f = useCallback(async () => {`.
  let index = match.index + match[0].length;
  while (index < source.length) {
    if (source[index] === "{") {
      const before = source.slice(0, index).trimEnd();
      if (before.endsWith(")") || before.endsWith("=>")) break;
    }
    index += 1;
  }
  if (index >= source.length) return "";

  let depth = 1;
  const start = index + 1;
  index += 1;

  while (index < source.length && depth > 0) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") depth -= 1;
    index += 1;
  }
  return source.slice(start, index);
}

const dataFeed = code("src/lib/data/feed.ts");
const client = code("src/lib/feed/client.ts");
const route = code("src/app/api/feed/route.ts");
const feed = code("src/components/feed/feed.tsx");
const types = code("src/lib/feed/types.ts");

// ---------------------------------------------------------------------------
// 1. The seed survives the scroll
//
// The wobble is worth up to ten points. A fresh seed on page two reranks the
// whole feed underneath a cursor that was issued against the old order, which
// shows up as posts repeating and posts going missing in the same scroll.
// ---------------------------------------------------------------------------

check("the cursor carries a seed", /seed: number;/.test(types));
check("the next page reuses the cursor's seed rather than making one",
  /cursor\?\.seed \?\? seedFor\(/.test(dataFeed));
check("and the seed goes back out on the cursor it returns",
  /id: last\.id,[\s\S]{0,80}seed,/.test(dataFeed));
check("the client sends it back",
  /params\.set\("seed", String\(request\.cursor\.seed\)\)/.test(client));
check("and the route refuses a cursor missing it",
  /Number\.isInteger\(cursorSeed\)/.test(route));

// ---------------------------------------------------------------------------
// 2. A signed-in reader's history is the database's, not the browser's
//
// feed_views is the record. If a request could also assert what its sender had
// seen, anybody could suppress or resurface content for their own account by
// editing a request body — and worse, the two would disagree.
// ---------------------------------------------------------------------------

check("the seen list is dropped for a signed-in reader",
  /p_seen_ids: user \? null :/.test(dataFeed));
check("and capped for everybody else",
  /\.slice\(0, SEEN_LIMIT\)/.test(dataFeed) && /const SEEN_LIMIT = \d+;/.test(dataFeed));
check("ids from a request body are validated as uuids, not trusted",
  /body\.seen[\s\S]{0,200}UUID\.test\(value\)/.test(route));

// ---------------------------------------------------------------------------
// 3. Every request that can repeat content carries the session's memory
//
// Per function. This is the rule that goes wrong one call site at a time.
// ---------------------------------------------------------------------------

for (const name of ["loadMore", "changeFilter"]) {
  const body = bodyOf(feed, name);
  check(`${name} exists`, body.length > 0);
  check(`${name} sends what this session has already been shown`,
    /seenIds: signedIn \? null : recallSeen\(\)/.test(body), name);
}

// ---------------------------------------------------------------------------
// 4. A sighting means the reader looked, not that the browser painted
//
// Half a card crossing the viewport for one frame is a scroll, not a reading.
// Counting it would bury the whole feed on the strength of one flick.
// ---------------------------------------------------------------------------

check("a card must dwell before it counts", /const DWELL_MS = \d+;/.test(feed));
check("the dwell is at least half a second",
  Number(/const DWELL_MS = (\d+);/.exec(feed)?.[1] ?? 0) >= 500);
// The cancel has to be in the branch that runs when a card leaves, not just
// somewhere in the file. Deleting it survived a bare /clearTimeout/ check
// because the cleanup loop at the end of the effect clears the same timers on
// unmount — a second copy that made the assertion true while the behaviour was
// gone, and a card scrolled past would have counted itself a second later from
// off screen.
const leaving = /} else \{([\s\S]{0,300}?)\n {8}\}/.exec(bodyOf(feed, "ImpressionTracker"))?.[1] ?? "";
check("the observer has a branch for a card leaving the viewport", leaving.length > 0);
check("and leaving cancels the pending sighting",
  /clearTimeout\(/.test(leaving) && /dwelling\.delete\(id\)/.test(leaving));
check("the tracker runs signed out too, or a signed-out feed cannot change",
  !/if \(!signedIn(?: \|\|[^)]*)?\) return;/.test(bodyOf(feed, "ImpressionTracker")));
check("signed out, sightings go to the session store instead of the server",
  /if \(signedIn\) void feedApi\.view\(batch\);\s*else rememberSeen\(batch\);/.test(feed));

// ---------------------------------------------------------------------------
// 5. The session store is a session's memory, not a profile
// ---------------------------------------------------------------------------

check("it is sessionStorage, not localStorage",
  /sessionStorage\.setItem\(SEEN_KEY/.test(client) && !/localStorage/.test(client));
check("every read is guarded, because a private window throws here",
  /export function recallSeen\(\): string\[\] \{[\s\S]{0,600}?catch \{/.test(client));
check("and every write",
  /export function rememberSeen\([\s\S]{0,600}?catch \{/.test(client));
check("the list is bounded",
  /\.slice\(-SEEN_LIMIT\)/.test(client));

// ---------------------------------------------------------------------------
// 6. Nothing is fetched in bulk and filtered in the browser
//
// The ranking, the exclusion and the paging are the database's job. A client
// that filters is a client that has already downloaded everything it filtered.
// ---------------------------------------------------------------------------

// Scoped to the feed_page call. The whole file also contains
// `p_limit: 200` for the comment tree, which is a different function asking a
// different question — and matching it here failed the check over code that
// was never in scope.
const feedPageCall = /rpc\("feed_page", \{[\s\S]*?\n  \}\);/.exec(dataFeed)?.[0] ?? "";
check("there is a feed_page call to inspect", feedPageCall.length > 0);
check("the client asks for a page, not for everything",
  !/limit=\d{3,}/.test(client) && !/p_limit: \d{3,}/.test(feedPageCall));
check("posts are appended, not re-sorted in the browser",
  !/posts\.sort\(|\.sort\(\(a, b\) => b\.score/.test(feed));
check("duplicates are dropped on arrival",
  /const seen = new Set\(current\.map\(\(post\) => post\.id\)\)/.test(
    bodyOf(feed, "loadMore")));

// ---------------------------------------------------------------------------
// 7. A long seen list travels in a body, not a URL
// ---------------------------------------------------------------------------

check("the route accepts a POST", /export async function POST\(/.test(route));
check("and still a GET, for the ordinary case", /export async function GET\(/.test(route));
check("the client only POSTs when it has something to send",
  /seen\.length > 0[\s\S]{0,120}method: "POST"/.test(client));
check("both verbs go through one parser, so they cannot drift",
  (route.match(/await page\(/g) ?? []).length === 2);

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
}

console.log(
  `\n${failures.length === 0 ? GREEN : RED}${passed} passed, ${failures.length} failed${RESET}` +
    `\n${DIM}feed: what the reader has already read${RESET}\n`,
);

process.exit(failures.length === 0 ? 0 : 1);
