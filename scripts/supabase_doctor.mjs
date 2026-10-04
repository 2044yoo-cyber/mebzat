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

let addrs = [];
try {
  addrs = await lookup(url.hostname, { all: true });
  ok(`DNS resolves ${url.hostname}`);
  for (const a of addrs) info(`IPv${a.family}: ${a.address}`);
} catch (e) {
  bad(`DNS cannot resolve ${url.hostname} (${e.code})`);
  info(`the project ref in the URL may be wrong, or this machine has no DNS`);
  process.exit(1);
}

/* 4b --------------------------------- does the key belong to this project? */

// The anon key is a JWT and its payload is public — it ships to every browser.
// Only the ref, role and expiry are read here; the signature is never touched
// and nothing is printed that is not already visible in the page source.
try {
  const claims = JSON.parse(Buffer.from(env[ANON_KEY].split(".")[1], "base64url").toString());
  const urlRef = url.hostname.split(".")[0];
  if (claims.ref && claims.ref !== urlRef) {
    bad(`key belongs to project "${claims.ref}" but the URL points at "${urlRef}"`);
    info(`the app is talking to a different project than the key authorises`);
  } else if (claims.ref) {
    ok(`key and URL agree on project ref "${claims.ref}"`);
  }
  if (claims.role) info(`key role: ${claims.role}`);
  if (claims.exp) {
    const when = new Date(claims.exp * 1000);
    if (when < new Date()) bad(`key EXPIRED on ${when.toISOString().slice(0, 10)}`);
    else ok(`key valid until ${when.toISOString().slice(0, 10)}`);
  }
} catch {
  info(`anon key is not a readable JWT — skipping the project-match check`);
}

/* 5 --------------------------------------------------- the API answers */

let lastCause = null;

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
    lastCause = reason;
    return null;
  }
}

const health = await probe("auth health", "/auth/v1/health");
await probe("rest root", "/rest/v1/", { apikey: env[ANON_KEY] });

// The browser reaching Supabase while Node cannot is a real and common split
// on Windows: Node picks an address family and does not fall back the way a
// browser does, and antivirus and proxies filter node.exe separately.
let v4 = null;
if (health === null && addrs.some((a) => a.family === 6)) {
  const { Agent, fetch: undiciFetch } = await import("undici").catch(() => ({}));
  if (undiciFetch) {
    try {
      const res = await undiciFetch(new URL("/auth/v1/health", url).toString(), {
        dispatcher: new Agent({ connect: { family: 4 } }),
        signal: AbortSignal.timeout(15000),
      });
      v4 = res.status;
      ok(`auth health over forced IPv4 -> HTTP ${res.status}`);
    } catch (e) {
      bad(`auth health over forced IPv4 -> ${e.message} [${e.cause?.code ?? e.name}]`);
    }
  }
}

/* 6 ------------------------------------------------------------- verdict */

console.log("");
const TLS = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO|ERR_TLS/i;
if (health === null && TLS.test(String(lastCause))) {
  console.log(`VERDICT: TLS interception. Node rejected the certificate (${lastCause}).`);
  console.log("  Antivirus or a corporate proxy is re-signing HTTPS with its own");
  console.log("  root CA. Windows trusts it, so your browser works — which is why");
  console.log("  the dashboard shows successful auth requests. Node keeps its own");
  console.log("  CA list and has never heard of it, so the dev server cannot connect.");
  console.log("  Fix, without weakening anything:");
  console.log("    Node 22+:  setx NODE_OPTIONS \"--use-system-ca\"");
  console.log("    or:        setx NODE_EXTRA_CA_CERTS \"C:\\path\\to\\proxy-root.crt\"");
  console.log("  Then open a NEW terminal and restart the dev server.");
  console.log("  Do NOT set NODE_TLS_REJECT_UNAUTHORIZED=0 — that disables");
  console.log("  certificate checking for every request the server makes.");
} else if (health === null && v4 !== null) {
  console.log("VERDICT: IPv6 is broken on this machine; IPv4 works.");
  console.log("  Node picked the IPv6 address and did not fall back, which is why");
  console.log("  the browser reaches Supabase and the dev server does not.");
  console.log("  Fix without touching the database or the app:");
  console.log("    setx NODE_OPTIONS \"--dns-result-order=ipv4first\"");
  console.log("  then open a NEW terminal and restart the dev server.");
} else if (health === null) {
  console.log(`VERDICT: the host resolves but never answers (${lastCause ?? "no cause reported"}).`);
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
