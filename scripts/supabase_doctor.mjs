/**
 * Why can't this machine reach Supabase?
 *
 *   node scripts/supabase_doctor.mjs
 *
 * `TypeError: fetch failed` from supabase-js means the HTTP request never
 * completed. It is not SQL, not RLS, not a missing migration and not auth —
 * those all come back as a PostgREST error with a code. This walks the stages
 * between the process and the API and says which one breaks.
 *
 * Prints hostnames and status codes only. Never a key, never a secret.
 */
import { readFileSync, existsSync } from "node:fs";
import { lookup } from "node:dns/promises";

const ok = (m) => console.log(`  \x1b[32mok\x1b[0m    ${m}`);
const bad = (m) => console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`);
const info = (m) => console.log(`        ${m}`);

/* 1 ------------------------------------------------------- env file loads */

const ENV = ".env.local";
if (!existsSync(ENV)) {
  bad(`${ENV} does not exist in ${process.cwd()}`);
  process.exit(1);
}
ok(`${ENV} found`);

// Deliberately the same lenient parse Next uses, not the stricter one the
// Supabase CLI uses: a line without "=" is skipped, it does not poison the
// rest of the file.
const env = {};
for (const line of readFileSync(ENV, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  env[m[1]] = v;
}

const URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

/* 2 -------------------------------------------------- the variables exist */

for (const k of [URL_KEY, ANON_KEY]) {
  if (!env[k]) {
    bad(`${k} is missing or empty`);
    info(`supabase-js would throw "supabaseUrl is required", not "fetch failed"`);
    process.exit(1);
  }
}
ok(`${URL_KEY} and ${ANON_KEY} are both set`);
info(`${ANON_KEY}: ${env[ANON_KEY].length} characters (value not shown)`);

/* 3 ------------------------------------------------------- the URL parses */

let url;
try {
  url = new URL(env[URL_KEY]);
} catch {
  bad(`${URL_KEY} is not a valid URL`);
  process.exit(1);
}
ok(`URL parses — host ${url.host}, protocol ${url.protocol}`);
if (url.protocol !== "https:") bad(`expected https:, got ${url.protocol}`);

/* 4 ------------------------------------------------------- DNS resolution */

try {
  const { address } = await lookup(url.hostname);
  ok(`DNS resolves ${url.hostname} -> ${address}`);
} catch (e) {
  bad(`DNS cannot resolve ${url.hostname} (${e.code})`);
  info(`the project ref in the URL may be wrong, or this machine has no DNS`);
  process.exit(1);
}

/* 5 --------------------------------------------------- the API answers */

async function probe(label, path, headers = {}) {
  const target = new URL(path, url).toString();
  const started = Date.now();
  try {
    const res = await fetch(target, { headers, signal: AbortSignal.timeout(15000) });
    ok(`${label} -> HTTP ${res.status} (${Date.now() - started}ms)`);
    return res.status;
  } catch (e) {
    const reason = e.cause?.code ?? e.cause?.message ?? e.name;
    bad(`${label} -> ${e.message} [${reason}] (${Date.now() - started}ms)`);
    return null;
  }
}

const health = await probe("auth health", "/auth/v1/health");
await probe("rest root", "/rest/v1/", { apikey: env[ANON_KEY] });

/* 6 ------------------------------------------------------------- verdict */

console.log("");
if (health === null) {
  console.log("VERDICT: the host resolves but never answers.");
  console.log("  The most common cause is a PAUSED Supabase project — the free tier");
  console.log("  pauses after inactivity and the API stops responding while the");
  console.log("  database and all its data stay intact. Open the project in the");
  console.log("  Supabase dashboard and resume it.");
  console.log("  Other causes: a VPN, corporate proxy or firewall blocking the host.");
} else if (health === 200) {
  console.log("VERDICT: Supabase is up and reachable from this machine.");
  console.log("  The feed failure is NOT transport. Restart the dev server and read");
  console.log("  the new error — it will carry a PostgREST code and a real message.");
} else if (health === 401 || health === 403) {
  // Learned by testing: this sandbox's own proxy answers 403 for the host,
  // which an earlier version of this script happily called "reachable".
  // Supabase's health endpoint needs no key and answers 200, so a 401/403
  // is something else replying on its behalf.
  console.log(`VERDICT: something answered ${health}, but it is not Supabase.`);
  console.log("  /auth/v1/health takes no credentials and answers 200 when the");
  console.log("  project is up. A 401/403 means a proxy, VPN, firewall or captive");
  console.log("  portal is intercepting the request before it reaches Supabase.");
} else if (health >= 500) {
  console.log(`VERDICT: the API answered ${health}. Supabase is reachable but unhealthy.`);
  console.log("  Check status.supabase.com and the project's health in the dashboard.");
} else {
  console.log(`VERDICT: unexpected status ${health} from the health endpoint.`);
  console.log("  Confirm the URL points at your Supabase project and not something else.");
}
