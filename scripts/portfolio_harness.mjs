/**
 * The creator portfolio (/projects) on its own page, for the browser check.
 *
 * The real ProfileHero, PortfolioFeed, cards, server action and source layer,
 * bundled with esbuild against the fake in portfolio_fake_supabase.ts, inside
 * a stand-in for the app shell: the same scrolling `#workspace` with the same
 * bottom reservation, a fixed bottom bar, and the real floating + menu.
 * `?as=me` (or `other`, `empty`) signs the tab in. Any other path is a
 * stand-in detail page, so opening a card and coming back is a real reload.
 */
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
export const ME = "cb000000-0000-4000-8000-000000000001";
export const OTHER = "cb000000-0000-4000-8000-000000000002";
export const EMPTY = "cb000000-0000-4000-8000-000000000003";
export const SUPABASE = "https://fakeproject.supabase.co";

/** The seeded rows, in one place so the check can count what it expects. */
export function seed() {
  const at = (minutes) => new Date(Date.UTC(2026, 6, 1, 8, 0) + minutes * 60_000).toISOString().replace("Z", "+00:00");
  const id = (prefix, n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const img = (n) => `${SUPABASE}/storage/v1/object/public/demo/${n}.webp`;
  const db = {
    profiles: [
      { id: ME, full_name: "Yisehak Tilahun", company_name: null, username: "yisehak.design", profession: "Architectural & Interior Designer", specialties: ["Interior design", "Furniture", "3D visualisation"], account_type: null, location_city: "Addis Ababa", location_country: "Ethiopia", bio: "Designing spaces, furniture and construction solutions.", avatar_url: null, cover_url: null, years_experience: 8, languages: ["Amharic", "English"], work_status: "available", portfolio_link: "https://example.test/portfolio", cv_path: "cv.pdf" },
      { id: OTHER, full_name: "Someone Else", username: "someone", profession: "Contractor", specialties: [] },
      { id: EMPTY, full_name: "New Person", username: null, profession: null, specialties: [] },
    ],
    projects: [], products: [], properties: [], equipment: [], services: [], designs: [], tours: [], posts: [], jobs: [], invest_projects: [],
  };
  const mine = { projects: [], marketplace: [], digital: [], designs: [] };
  for (let n = 0; n < 3; n += 1) {
    const row = { id: id("a1000000", n), owner_id: ME, title: `Villa ${n + 1}`, category: "architecture", location_city: "Addis Ababa", cover_image_url: img(`villa${n}`), status: n === 2 ? "draft" : "published", views: 10 * n, created_at: at(n) };
    db.projects.push(row); mine.projects.push(row);
  }
  for (let n = 0; n < 30; n += 1) {
    const row = { id: id("b1000000", n), owner_id: ME, title: `Wardrobe ${n + 1}`, price: 20000 + n * 500, currency: "ETB", unit: null, fulfilment: "physical", condition: "new", location_city: "Addis Ababa",
      // Two listings share an instant, so a page boundary can fall between them.
      cover_image_url: n % 5 === 0 ? `https://elsewhere.example/w${n}.jpg` : img(`w${n}`), status: n === 4 ? "draft" : "published", views: n, created_at: n === 13 ? at(100 + 12 * 3) : at(100 + n * 3) };
    db.products.push(row); mine.marketplace.push(row);
  }
  for (let n = 0; n < 6; n += 1) {
    const row = { id: id("c1000000", n), owner_id: ME, title: `Flat ${n + 1}`, property_type: "apartment", listing_kind: "sale", price: 4_000_000, currency: "ETB", location_city: "Addis Ababa", cover_image_url: img(`flat${n}`), status: "available", view_count: n, save_count: 1, created_at: at(101 + n * 7) };
    db.properties.push(row); mine.marketplace.push(row);
  }
  for (let n = 0; n < 5; n += 1) {
    const row = { id: id("d1000000", n), owner_id: ME, title: `Mixer ${n + 1}`, category: "concrete", daily_rate: 1500, currency: "ETB", location_city: "Adama", cover_image_url: img(`mix${n}`), status: "published", views: n, created_at: at(102 + n * 11) };
    db.equipment.push(row); mine.marketplace.push(row);
  }
  for (let n = 0; n < 14; n += 1) {
    // Files 2 and 3 share an instant and fall either side of the first page's
    // edge (12 to a page, newest first): the database's id order decides
    // which is on which page, and the cursor has to agree with it.
    const row = { id: id("e1000000", n), owner_id: ME, title: `Floor plan ${n + 1}`, price: 350 + n * 100, currency: "ETB", fulfilment: "digital", digital_kind: "floor_plan", file_format: "pdf", file_size_mb: 12, cover_image_url: img(`fp${n}`), status: "published", views: n, created_at: at(n === 1 ? 302 : 300 + n) };
    db.products.push(row); mine.digital.push(row);
  }
  db.designs.push({ id: id("f1000000", 0), slug: "walnut-wardrobe", owner_id: ME, title: "Walnut wardrobe", kind: "wardrobe", cover_url: img("design0"), visibility: "public", view_count: 4, created_at: at(400) });
  // Private and never rendered: no cover, only its spec — the card draws it.
  db.designs.push({ id: id("f1000000", 1), slug: "kitchen-a", owner_id: ME, title: "Kitchen A", kind: "kitchen", cover_url: null, spec: "__SPEC__", visibility: "private", view_count: 0, created_at: at(401) });
  db.tours.push({ id: id("f2000000", 0), owner_id: ME, title: "Living room tour", thumbnail_url: img("tour0"), visibility: "published", view_count: 9, created_at: at(402) });
  db.posts.push({ id: id("f3000000", 0), author_id: ME, title: "Finishing the stair", body: "Oak treads and a steel stringer.", kind: "showcase", status: "published", like_count: 12, comment_count: 3, view_count: 40, created_at: at(403) });
  db.posts.push({ id: id("f3000000", 1), author_id: ME, title: null, body: "Which tile for a wet room?", kind: "question", status: "published", like_count: 1, comment_count: 4, view_count: 9, created_at: at(404) });
  mine.designs.push(...db.designs, ...db.tours, ...db.posts);
  mine.other = [];
  for (let n = 0; n < 3; n += 1) {
    const row = { id: id("f4000000", n), poster_id: ME, title: `Site foreman ${n + 1}`, job_type: "full_time", location_city: "Addis Ababa", status: n === 1 ? "draft" : "open", visibility: n === 2 ? "private" : "public", application_count: n, views: 5, created_at: at(500 + n) };
    db.jobs.push(row); mine.other.push(row);
  }
  // Somebody else's work, published and not: none of it may ever appear.
  db.projects.push({ id: id("a9000000", 0), owner_id: OTHER, title: "Other's villa", status: "published", created_at: at(5) });
  db.projects.push({ id: id("a9000000", 1), owner_id: OTHER, title: "Other's draft villa", status: "draft", created_at: at(6) });
  db.products.push({ id: id("b9000000", 0), owner_id: OTHER, title: "Other's wardrobe", fulfilment: "physical", status: "published", created_at: at(150) });
  db.products.push({ id: id("b9000000", 1), owner_id: OTHER, title: "Other's draft file", fulfilment: "digital", status: "draft", created_at: at(301) });
  db.posts.push({ id: id("f3900000", 0), author_id: OTHER, title: "Other's hidden post", body: "x", status: "hidden", created_at: at(405) });
  return { db, mine };
}

export async function openPortfolio() {
  let chromium;
  try { ({ chromium } = await import("playwright")); } catch {
    try { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); } catch { return null; }
  }
  const cssDir = join(root, ".next/static/chunks");
  const css = existsSync(cssDir) ? readdirSync(cssDir).filter((file) => file.endsWith(".css")) : [];
  assert.ok(css.length, "Run `npm run build` first: the check styles the page with the built CSS");

  const out = mkdtempSync(join(tmpdir(), "portfolio_"));
  const { db } = seed();
  writeFileSync(join(out, "entry.tsx"), `
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { ProfileHero } from "@/components/portfolio/profile-hero";
import { PortfolioFeed } from "@/components/portfolio/portfolio-feed";
import { QuickActions } from "@/components/shell/quick-actions";
import { encodeCursor, isSectionId, PAGE_SIZE, SECTIONS } from "@/lib/portfolio/model";
import { countSections, readSectionPage } from "@/lib/portfolio/sources";
import { fakeClient } from "${join(root, "scripts/portfolio_fake_supabase.ts")}";
import { wardrobeExample } from "@/features/berchuma-studio/services/examples";
import { validateSpec } from "@/features/berchuma-studio/types/spec";

const PEOPLE = { me: "${ME}", other: "${OTHER}", empty: "${EMPTY}" };
const query = new URLSearchParams(location.search);
if (query.get("as")) sessionStorage.setItem("__portfolio_user", PEOPLE[query.get("as")] ?? "");
if (!localStorage.getItem("__portfolio_db")) {
  const seeded = JSON.parse(${JSON.stringify(JSON.stringify(db))});
  // A real design spec, as the studio saves one.
  for (const row of seeded.designs) if (row.spec === "__SPEC__") row.spec = validateSpec(wardrobeExample()).spec;
  localStorage.setItem("__portfolio_db", JSON.stringify(seeded));
}
// Never kept in the back-forward cache, so "back" reloads the page as a phone often does.
addEventListener("unload", () => {});

const node = document.getElementById("root")!;
const shell = (content) => (
  <div className="flex h-dvh flex-col">
    <main id="workspace" className="@container/ws min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-content-safe scroll-pb-content-safe">
      <div className="p-4">{content}</div>
    </main>
    <div className="pointer-events-none fixed right-4 bottom-[calc(var(--bottom-nav-h)+1rem)] z-40 flex flex-col items-end gap-3"><QuickActions /></div>
    <nav aria-label="Bottom navigation" className="fixed inset-x-0 bottom-0 z-40 flex h-[var(--bottom-nav-h)] items-center justify-around border-t bg-background text-xs">
      {["Home", "AI", "Market", "Projects", "More"].map((label) => <a key={label} href={label === "Projects" ? "/projects" : "#"}>{label}</a>)}
    </nav>
  </div>
);

if (location.pathname !== "/projects") {
  createRoot(node).render(shell(<p id="detail">Detail page for {location.pathname}</p>));
} else {
  const client = fakeClient() as never;
  const me = sessionStorage.getItem("__portfolio_user") ?? "";
  const requested = query.get("view");
  const view = isSectionId(requested) ? requested : "all";
  const profile = JSON.parse(localStorage.getItem("__portfolio_db")!).profiles.find((row) => row.id === me);
  const counts = await countSections(client, me);
  const first = view === "all" ? SECTIONS.map((s) => s.id).find((id) => counts[id] > 0) : view;
  const initial = first && counts[first] > 0 ? await readSectionPage(client, me, first, null, PAGE_SIZE).then((page) => ({ section: first, cards: page.cards, cursor: encodeCursor(page.next), done: page.done })) : null;
  window.__portfolio.requests = [];
  createRoot(node).render(<>
    {shell(<div className="mx-auto w-full max-w-6xl space-y-6">
      <ProfileHero profile={{ name: profile.full_name, username: profile.username, profession: profile.profession, specialties: profile.specialties ?? [], location: [profile.location_city, profile.location_country].filter(Boolean).join(", ") || null, bio: profile.bio ?? null, avatarUrl: null, coverUrl: null }}
        stats={[{ label: "Posts", value: counts.designs }, { label: "Projects", value: counts.projects }, { label: "Listings", value: counts.marketplace }, { label: "Digital", value: counts.digital }]} />
      <PortfolioFeed owner={me} counts={counts} professional={{ profession: profile.profession, specialties: profile.specialties ?? [], yearsExperience: profile.years_experience ?? null, languages: profile.languages ?? [], workStatus: profile.work_status ?? null, portfolioLink: profile.portfolio_link ?? null, hasCv: Boolean(profile.cv_path) }} initialView={view} initialSlice={initial} />
    </div>)}
    <Toaster />
  </>);
}
`);
  writeFileSync(join(out, "cache.ts"), "export const revalidatePath = () => {};\n");
  writeFileSync(join(out, "navigation.ts"), "export const usePathname = () => location.pathname;\nexport const useRouter = () => ({ push(url: string) { location.href = url; }, refresh() { location.reload(); } });\nexport const useSearchParams = () => new URLSearchParams(location.search);\nexport const redirect = (url: string) => { location.href = url; };\n");
  writeFileSync(join(out, "link.tsx"), "export default function Link({ href, children, prefetch: _p, ...rest }: any) { void _p; return <a href={typeof href === 'string' ? href : String(href)} {...rest}>{children}</a>; }\n");
  writeFileSync(join(out, "image.tsx"), "export default function Image({ src, alt, fill: _f, sizes, priority: _p, ...rest }: any) { void _f; void _p; return <img src={src} alt={alt} sizes={sizes} data-optimised=\"true\" loading=\"lazy\" decoding=\"async\" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} {...rest} />; }\n");
  const { build } = await import(join(root, "node_modules/esbuild/lib/main.js"));
  await build({
    absWorkingDir: root, entryPoints: [join(out, "entry.tsx")], bundle: true, outfile: join(out, "app.js"),
    format: "esm", jsx: "automatic", platform: "browser", logLevel: "error", nodePaths: [join(root, "node_modules")],
    define: { "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(SUPABASE) }, target: "es2022",
    banner: { js: "globalThis.process ??= { env: {}, versions: {}, emit() {} };" },
    plugins: [{ name: "alias", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/supabase\/(server|client)$/ }, () => ({ path: join(root, "scripts/portfolio_fake_supabase.ts") }));
      builder.onResolve({ filter: /^next\/cache$/ }, () => ({ path: join(out, "cache.ts") }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(out, "navigation.ts") }));
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(out, "link.tsx") }));
      builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: join(out, "image.tsx") }));
      builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(`./src/${args.path.slice(2)}`, { resolveDir: root, kind: args.kind }));
    } }],
  });
  for (const file of css) copyFileSync(join(cssDir, file), join(out, file));
  writeFileSync(join(out, "index.html"), `<!doctype html><html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css.map((file) => `<link rel="stylesheet" href="/${file}">`).join("")}</head><body class="bg-background text-foreground"><div id="root"></div><script type="module" src="/app.js"></script></body></html>`);

  const server = createServer((request, response) => {
    const route = request.url.split("?")[0];
    const asset = route.slice(1);
    const file = asset && existsSync(join(out, asset)) && !asset.includes("..") ? asset : "index.html";
    const body = readFileSync(join(out, file));
    response.writeHead(200, { "content-type": file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html" });
    response.end(body);
  }).listen(0);
  const url = `http://localhost:${server.address().port}`;
  const executablePath = existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined;
  const browser = await chromium.launch({ executablePath });
  return { browser, url, out, async close() { await browser.close(); server.close(); } };
}
