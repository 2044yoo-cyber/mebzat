/**
 * The real Home feed, end to end, for the browser check.
 *
 *   PostgreSQL 16 with every migration (supabase/tests/run.sh builds it)
 *     → PostgREST, the server Supabase runs, with the same roles and JWTs
 *     → a gateway standing in for the rest of Supabase: `/rest/v1` is passed
 *       to PostgREST untouched, `/auth/v1/user` answers for a signed token
 *     → the production build of the app (`next start`), pointed at it
 *     → Chromium.
 *
 * Nothing in the app is replaced. The ranking, the policies and the triggers
 * are the database's; the route handlers, server components and client are
 * the build's. Only Supabase's auth server is a stand-in, because it is a
 * separate service and what it is asked here is "whose token is this".
 *
 * Needs: `bash supabase/tests/run.sh` run once (it leaves the `medosha`
 * database), PostgREST at $POSTGREST (default /tmp/claude-0/pgrst/postgrest),
 * and a build made by `buildApp()` below — the Supabase URL is compiled in.
 */
import { execFileSync, spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const BIN = process.env.PG_BIN ?? "/usr/lib/postgresql/16/bin";
const SOCK = process.env.PG_SOCK ?? "/tmp/pgsock";
const PORT = process.env.PG_PORT ?? "5599";
const POSTGREST = process.env.POSTGREST ?? "/tmp/claude-0/pgrst/postgrest";
export const DB = "feed_live";
const SECRET = "home-feed-check-secret-at-least-32-characters";
export const GATEWAY_PORT = 54329;
export const APP_PORT = 3309;
const REST_PORT = 54330;
export const SUPABASE_URL = `http://localhost:${GATEWAY_PORT}`;
export const APP_URL = `http://localhost:${APP_PORT}`;

export const PEOPLE = {
  reader: "cb000000-0000-4000-8000-000000000001",
  other: "cb000000-0000-4000-8000-000000000002",
  newcomer: "cb000000-0000-4000-8000-000000000003",
  creator: "cb000000-0000-4000-8000-0000000000c0",
};

// ---------------------------------------------------------------- tokens

const b64 = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
export function jwt(claims) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86_400, ...claims });
  const signature = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${signature}`;
}
function verify(token) {
  const [head, body, signature] = String(token).split(".");
  if (!head || !body || !signature) return null;
  const expected = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  if (expected !== signature) return null;
  return JSON.parse(Buffer.from(body, "base64url").toString());
}
export const ANON_KEY = jwt({ role: "anon", iss: "supabase" });
const userToken = (id) => jwt({ sub: id, role: "authenticated", aud: "authenticated", email: `${id.slice(-4)}@example.test` });
const userOf = (id) => ({ id, aud: "authenticated", role: "authenticated", email: `${id.slice(-4)}@example.test`, app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });

/** The cookie @supabase/ssr reads a session from, for `context.addCookies`. */
export function sessionCookie(id) {
  const session = { access_token: userToken(id), refresh_token: `refresh-${id}`, token_type: "bearer", expires_in: 86_400, expires_at: Math.floor(Date.now() / 1000) + 86_400, user: userOf(id) };
  return { name: `sb-localhost-auth-token`, value: `base64-${b64(session)}`, domain: "localhost", path: "/", httpOnly: false, sameSite: "Lax" };
}

// ---------------------------------------------------------------- database

export function sql(text, { as = null } = {}) {
  const prelude = as === null ? "" : as === "anon"
    ? "set role anon; set request.jwt.claims = '{\"role\":\"anon\"}';"
    : `set role authenticated; set request.jwt.claims = '{"sub":"${as}","role":"authenticated"}';`;
  return execFileSync(`${BIN}/psql`, ["-h", SOCK, "-p", PORT, "-U", "postgres", "-d", DB, "-v", "ON_ERROR_STOP=1", "-AtqX", "-F", "\t", "-c", prelude + text], { encoding: "utf8" }).trim();
}

/** Calls PostgREST as a person, the way the app's own server actions do. */
export async function rest(path, { as, method = "GET", body } = {}) {
  // PostgREST wants every row of a bulk insert to name the same columns.
  if (Array.isArray(body)) {
    const rows = [];
    for (const row of body) rows.push(...(await rest(path, { as, method, body: row })));
    return rows;
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: ANON_KEY, authorization: `Bearer ${as ? userToken(as) : ANON_KEY}`, "content-type": "application/json", prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

function prepareDatabase() {
  const run = (database, text) => execFileSync(`${BIN}/psql`, ["-h", SOCK, "-p", PORT, "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-qX", "-c", text], { encoding: "utf8" });
  if (!execFileSync(`${BIN}/psql`, ["-h", SOCK, "-p", PORT, "-U", "postgres", "-d", "postgres", "-AtqX", "-c", "select 1 from pg_database where datname = 'medosha'"], { encoding: "utf8" }).trim()) {
    throw new Error("Run `bash supabase/tests/run.sh` first: it builds the database with every migration.");
  }
  run("postgres", `drop database if exists ${DB} with (force)`);
  run("postgres", `create database ${DB} template medosha`);
  run(DB, `
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'authenticator') then
        create role authenticator login noinherit;
      end if;
    end $$;
    grant anon, authenticated, service_role to authenticator;
    -- PostgREST 12 sets the claims as one JSON setting, as Supabase's own auth.uid() expects.
    create or replace function auth.uid() returns uuid language sql stable as $f$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $f$;
    insert into auth.users (id, email) values
      ('${PEOPLE.reader}', 'reader@example.test'), ('${PEOPLE.other}', 'other@example.test'),
      ('${PEOPLE.newcomer}', 'newcomer@example.test'), ('${PEOPLE.creator}', 'creator@example.test')
    on conflict do nothing;
    update public.profiles set full_name = 'Reader One', username = 'reader_one', profession = 'Architect', location_city = 'Addis Ababa' where id = '${PEOPLE.reader}';
    update public.profiles set full_name = 'Reader Two', username = 'reader_two' where id = '${PEOPLE.other}';
    update public.profiles set full_name = 'New Person', username = 'new_person' where id = '${PEOPLE.newcomer}';
    update public.profiles set full_name = 'Selam Creator', username = 'selam_creator' where id = '${PEOPLE.creator}';
    notify pgrst, 'reload schema';
  `);
}

/** A creator's real work, made through PostgREST as them — the adapters put it in the feed. */
export async function seedCreator() {
  const as = PEOPLE.creator;
  await rest("services", { as, method: "POST", body: [
    { provider_id: as, title: "Live joinery and fitted kitchens", slug: "live-joinery", status: "published", description: "Kitchens, wardrobes and doors made to measure in our Bole workshop." },
    { provider_id: as, title: "Live draft service", slug: "live-draft-service", status: "draft" },
  ] });
  await rest("jobs", { as, method: "POST", body: [
    { poster_id: as, title: "Live site engineer wanted", slug: "live-site-engineer", description: "Six-month residential project in Ayat.", status: "open", visibility: "public" },
    { poster_id: as, title: "Live private job", slug: "live-private-job", description: "Hidden", status: "open", visibility: "private" },
  ] });
  await rest("equipment", { as, method: "POST", body: [{ owner_id: as, title: "Live concrete mixer for hire", slug: "live-mixer", category: "concrete", status: "published", daily_rate: 1800 }] });
  await rest("posts", { as, method: "POST", body: [{ author_id: as, title: "Live: which waterproofing lasts on a flat roof?", body: "We have tried bitumen sheets twice. Has anyone had better results with liquid membranes in Addis?", status: "published" }] });
  await rest("designs", { as, method: "POST", body: [
    { owner_id: as, title: "Live walnut wardrobe", slug: "live-walnut-wardrobe", kind: "wardrobe", spec: {}, visibility: "public", published_at: new Date().toISOString() },
    { owner_id: as, title: "Live private kitchen", slug: "live-private-kitchen", kind: "kitchen", spec: {}, visibility: "private" },
  ] });
  await rest("products", { as, method: "POST", body: [
    { owner_id: as, title: "Live G+2 floor plan set", slug: "live-floor-plan", status: "published", fulfilment: "digital", digital_kind: "floor_plan", delivery_available: false, price: 4500, currency: "ETB" },
    { owner_id: as, title: "Live draft floor plan", slug: "live-draft-plan", status: "draft", fulfilment: "digital", digital_kind: "floor_plan", delivery_available: false },
  ] });
  // A minute in the past, so the first reading below (which starts now) includes them.
  sql("update public.feed_posts set created_at = created_at - interval '1 minute', published_at = published_at - interval '1 minute' where author_id = '" + as + "'");
}

// ---------------------------------------------------------------- gateway

function gateway() {
  return createServer((request, response) => {
    const url = new URL(request.url, SUPABASE_URL);
    const send = (status, body) => { response.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" }); response.end(body === undefined ? "" : JSON.stringify(body)); };
    if (request.method === "OPTIONS") {
      response.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" });
      return response.end();
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      const headers = { ...request.headers, host: `localhost:${REST_PORT}` };
      if (!headers.authorization) headers.authorization = `Bearer ${headers.apikey ?? ANON_KEY}`;
      const upstream = httpRequest({ host: "127.0.0.1", port: REST_PORT, path: url.pathname.slice("/rest/v1".length) + url.search, method: request.method, headers }, (reply) => {
        response.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(response);
      });
      upstream.on("error", (error) => send(502, { message: String(error) }));
      return request.pipe(upstream);
    }
    if (url.pathname === "/auth/v1/user") {
      const claims = verify((request.headers.authorization ?? "").replace(/^Bearer /, ""));
      return claims?.sub ? send(200, userOf(claims.sub)) : send(401, { msg: "invalid JWT" });
    }
    if (url.pathname === "/auth/v1/token") {
      let raw = "";
      request.on("data", (chunk) => { raw += chunk; });
      return request.on("end", () => {
        const id = (JSON.parse(raw || "{}").refresh_token ?? "").replace(/^refresh-/, "");
        if (!/^[0-9a-f-]{36}$/.test(id)) return send(400, { error: "invalid_grant" });
        send(200, { access_token: userToken(id), refresh_token: `refresh-${id}`, token_type: "bearer", expires_in: 86_400, expires_at: Math.floor(Date.now() / 1000) + 86_400, user: userOf(id) });
      });
    }
    if (url.pathname === "/auth/v1/logout") return send(204);
    // Storage, realtime and functions are not part of this check.
    return send(404, { message: "not part of the home feed check" });
  });
}

// ---------------------------------------------------------------- the app

const ENV = () => ({ ...process.env, NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY, NEXT_PUBLIC_SITE_URL: APP_URL, NEXT_TELEMETRY_DISABLED: "1" });

/** A production build that knows where this Supabase is. */
export function buildApp() {
  execFileSync("npx", ["next", "build"], { cwd: root, env: ENV(), stdio: "inherit" });
}

async function waitFor(url, ms = 60_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const response = await fetch(url); if (response.status < 500) return; } catch { /* not yet */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`${url} did not come up`);
}

export async function startStack() {
  if (!existsSync(POSTGREST)) throw new Error(`PostgREST not found at ${POSTGREST}`);
  prepareDatabase();
  const dir = mkdtempSync(join(tmpdir(), "feed_live_"));
  const config = join(dir, "postgrest.conf");
  writeFileSync(config, [
    `db-uri = "postgres://authenticator@/${DB}?host=${SOCK}&port=${PORT}"`,
    `db-schemas = "public"`, `db-anon-role = "anon"`, `jwt-secret = "${SECRET}"`,
    `server-port = ${REST_PORT}`, `server-host = "127.0.0.1"`, `db-pool = 10`, `log-level = "error"`,
  ].join("\n"));
  // Each in its own process group, so stopping takes `next start`'s server child with it.
  const children = [spawn(POSTGREST, [config], { stdio: ["ignore", "inherit", "inherit"], detached: true })];
  await waitFor(`http://127.0.0.1:${REST_PORT}/`);
  const gate = gateway().listen(GATEWAY_PORT);
  const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { cwd: root, env: ENV(), stdio: ["ignore", "inherit", "inherit"], detached: true });
  children.push(app);
  await waitFor(`${APP_URL}/about`, 90_000);
  return {
    async stop() {
      for (const child of children) { try { process.kill(-child.pid, "SIGTERM"); } catch { /* gone */ } }
      gate.close();
    },
  };
}

export const uid = () => randomUUID();
