/**
 * The Home feed in a real browser, against the real app and a real database.
 *
 *   node scripts/home_feed_browser_check.mjs            # starts the stack itself
 *   FEED_APP_URL=http://localhost:3309 node …          # against one already running
 *
 * See home_feed_stack.mjs for what "real" means here. Each numbered check
 * says what it guards; every assertion reads the page, the API's own answers
 * or the database rows — never the code that produced them.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { APP_URL, PEOPLE, rest, sessionCookie, seedCreator, sql, startStack } from "./home_feed_stack.mjs";

let chromium;
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }

const base = process.env.FEED_APP_URL ?? APP_URL;
const stack = process.env.FEED_APP_URL ? null : await startStack();
// The stack's servers keep the process alive; a crash must not leave it hanging.
for (const event of ["uncaughtException", "unhandledRejection"]) {
  process.on(event, async (error) => { console.error(error); await stack?.stop(); process.exit(1); });
}
const failures = [];
const ok = (message) => console.log(`  ok   ${message}`);
// `CHECKS=4,6` runs only those, for a mutant aimed at them, with the checks
// they build on: later checks read the page earlier ones left. Without them a
// check fails on missing setup, and a mutant looks caught when nothing caught it.
const NEEDS = { 2: [1], 3: [2], 4: [3], 5: [1], 6: [3], 7: [2], 8: [2], 9: [8], 10: [9], 11: [1], 12: [9] };
const only = process.env.CHECKS ? new Set() : null;
for (const wanted of process.env.CHECKS?.split(",") ?? []) {
  const add = (n) => { if (only.has(String(n))) return; only.add(String(n)); for (const need of NEEDS[n] ?? []) add(need); };
  add(Number(wanted));
}
async function check(name, body) {
  if (only && !only.has(name.split(".")[0])) return;
  try { await body(); ok(name); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${String(error?.message ?? error).split("\n").slice(0, 6).join("\n       ")}`); }
}

// ---------------------------------------------------------------- data
/** Everything the people in this check have done, undone; then the creator's work, made again. */
async function resetData() {
  const ids = Object.values(PEOPLE).map((id) => `'${id}'`).join(",");
  sql(`
    delete from public.feed_views where user_id in (${ids});
    delete from public.feed_likes where user_id in (${ids});
    delete from public.feed_saves where user_id in (${ids});
    delete from public.feed_hidden where user_id in (${ids});
    delete from public.feed_interactions where user_id in (${ids});
    delete from public.feed_interests where user_id in (${ids});
    delete from public.feed_posts where author_id = '${PEOPLE.creator}';
    delete from public.services where provider_id = '${PEOPLE.creator}';
    delete from public.jobs where poster_id = '${PEOPLE.creator}';
    delete from public.equipment where owner_id = '${PEOPLE.creator}';
    delete from public.posts where author_id = '${PEOPLE.creator}';
    delete from public.designs where owner_id = '${PEOPLE.creator}';
    delete from public.products where owner_id = '${PEOPLE.creator}';
  `);
  await seedCreator();
}
await resetData();

// ---------------------------------------------------------------- browser
const executablePath = existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined;
const browser = await chromium.launch({ executablePath });
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

async function open(who, { width = 390, height = 844 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  if (who) await context.addCookies([sessionCookie(PEOPLE[who])]);
  // Pictures are not what is under test, and the seed's come from the internet.
  await context.route(/\/_next\/image|pollinations|dicebear|\.(webp|jpg|jpeg|png)(\?|$)/, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));
  const page = await context.newPage();
  page.feed = [];
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (url.pathname !== "/api/feed") return;
    let body = null;
    try { body = await response.json(); } catch { /* aborted */ }
    page.feed.push({ url, status: response.status(), method: response.request().method(), body });
  });
  return { context, page };
}

const cards = (page) => page.$$eval("[data-feed-post]", (nodes) => nodes.map((node) => ({ id: node.getAttribute("data-feed-post"), kind: node.getAttribute("data-feed-kind"), featured: node.hasAttribute("data-feed-featured"), text: node.textContent ?? "" })));
const slots = (page) => page.$$eval("[data-post-id]", (nodes) => nodes.map((node) => node.getAttribute("data-post-id")));
async function home(page) {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-feed-post]", { timeout: 30_000 });
}
async function scrollToEnd(page) {
  await page.evaluate(() => { const ws = document.getElementById("workspace"); ws.scrollTop = ws.scrollHeight; });
}
async function nextPage(page) {
  const before = page.feed.filter((entry) => entry.url.searchParams.get("after")).length;
  for (let tries = 0; tries < 30; tries += 1) {
    await scrollToEnd(page);
    await page.waitForTimeout(250);
    if (page.feed.filter((entry) => entry.url.searchParams.get("after")).length > before) break;
  }
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(300);
}
/** Walks the whole feed through the API, from the page, as that reader. */
const walk = (page) => page.evaluate(async () => {
  const ids = []; const posts = []; let query = "";
  for (let n = 0; n < 60; n += 1) {
    const response = await fetch(`/api/feed?limit=24${query}`);
    const body = await response.json();
    for (const post of body.posts) { ids.push(post.id); posts.push({ id: post.id, title: post.title, kind: post.kind, topic: post.topic, entityType: post.entityType, featured: post.featured }); }
    if (!body.cursor) return { posts, ended: true };
    const c = body.cursor;
    query = `&score=${encodeURIComponent(c.score)}&after=${c.id}&now=${encodeURIComponent(c.now)}&seed=${c.seed}`;
  }
  return { posts, ended: false };
});

// ================================================================ checks

const reader = await open("reader");
const { page } = reader;

await check("1. Home keeps the shell: header, language, five bottom destinations, the create button; nothing overflows a 390px screen", async () => {
  await home(page);
  assert.ok(await page.locator("header [aria-label]").filter({ hasText: /EN|AM|English|አማርኛ/i }).count() + await page.locator("[aria-label*='anguage' i]").count() > 0, "no language selector");
  for (const label of ["Home", "AI", "Market", "Projects"]) {
    assert.ok(await page.getByRole("link", { name: new RegExp(`^${label}$`, "i") }).count() > 0, `no ${label} in the bottom bar`);
  }
  assert.ok(await page.getByRole("button", { name: /^More$/i }).count() > 0, "no More in the bottom bar");
  assert.ok(await page.getByRole("button", { name: "Quick actions" }).count() > 0, "no floating create button");
  const overflow = await page.evaluate(() => {
    const ws = document.getElementById("workspace");
    const wide = [...document.querySelectorAll("[data-feed-post]")].filter((card) => card.getBoundingClientRect().right > innerWidth + 1).length;
    const edge = ws.getBoundingClientRect().right;
    // What sticks out, outermost first, for the failure message.
    const culprits = [...ws.querySelectorAll("*")].filter((node) => node.getBoundingClientRect().right > edge + 1 && !node.closest("[class*='overflow-x-auto']"))
      .slice(0, 3).map((node) => `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 60)}`);
    return { page: document.documentElement.scrollWidth - innerWidth, ws: ws.scrollWidth - ws.clientWidth, wide, culprits };
  });
  assert.ok(overflow.page <= 1 && overflow.ws <= 1 && overflow.wide === 0, `horizontal overflow ${JSON.stringify(overflow)}`);
});

let firstVisit = [];
await check("2. A signed-in first page is one mixed stream: many kinds, never three of a kind in a row, and a way to tune it", async () => {
  const shown = (await cards(page)).slice(0, 12);
  firstVisit = shown.map((card) => card.id);
  const kinds = new Set(shown.map((card) => card.kind));
  assert.ok(shown.length >= 10, `only ${shown.length} cards`);
  assert.ok(kinds.size >= 6, `only ${kinds.size} kinds in the first 12: ${[...kinds]}`);
  let run = 1; let longest = 1;
  for (let index = 1; index < shown.length; index += 1) { run = shown[index].kind === shown[index - 1].kind ? run + 1 : 1; longest = Math.max(longest, run); }
  assert.ok(longest <= 2, `${longest} of one kind in a row`);
  const tune = page.getByRole("link", { name: "Tune your feed" });
  assert.equal(await tune.getAttribute("href"), "/settings#feed");
  // Read the first few, the way a person does: each on screen for a moment.
  for (const card of shown.slice(0, 6)) {
    await page.locator(`[data-feed-post="${card.id}"]`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(1300);
  }
});

await check("3. Infinite scroll asks for the next page after the last, never the first again, and nothing repeats", async () => {
  for (let n = 0; n < 3; n += 1) await nextPage(page);
  const paged = page.feed.filter((entry) => entry.status === 200);
  const cursors = paged.map((entry) => entry.url.searchParams.get("after"));
  assert.ok(cursors.length >= 3, `only ${cursors.length} page requests`);
  assert.ok(cursors.every(Boolean), "a page was asked for without a cursor — the first page again");
  assert.equal(new Set(cursors).size, cursors.length, "the same cursor was asked for twice");
  const ids = paged.flatMap((entry) => entry.body.posts.map((post) => post.id));
  assert.equal(new Set(ids).size, ids.length, "two pages returned the same post");
  assert.ok(!ids.some((id) => firstVisit.includes(id)), "a later page returned a post from the first");
  const dom = await slots(page);
  assert.equal(new Set(dom).size, dom.length, "a card is on the page twice");
  assert.ok(dom.length >= 12 + 3 * 12 - 2, `only ${dom.length} cards after three pages`);
});

await check("4. While a page loads there are skeletons; when one fails the feed says so, waits, and Try again carries on", async () => {
  let release;
  await page.route("**/api/feed?**", async (route) => { await new Promise((resolve) => { release = resolve; }); await route.continue(); }, { times: 1 });
  await scrollToEnd(page);
  await page.waitForSelector("[aria-busy='true'][aria-label='Loading more']", { timeout: 10_000 });
  release?.();
  await page.waitForSelector("[aria-busy='true']", { state: "detached", timeout: 15_000 });
  await page.unroute("**/api/feed?**");

  const before = (await slots(page)).length;
  await page.route("**/api/feed?**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ posts: [], cursor: null, available: true, failed: true }) }));
  const asked = page.feed.length;
  await scrollToEnd(page);
  await page.getByText("More could not be loaded just now.").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  assert.ok(page.feed.length - asked <= 1, `it kept asking after a failure (${page.feed.length - asked} requests)`);
  assert.equal(await page.getByText("That is everything for now.").count(), 0, "a failure was shown as the end of the feed");
  await page.unroute("**/api/feed?**");
  await page.getByRole("button", { name: "Try again" }).click();
  await page.waitForFunction((count) => document.querySelectorAll("[data-post-id]").length > count, before, { timeout: 15_000 });
  assert.equal(await page.getByText("More could not be loaded just now.").count(), 0, "the error stayed after it recovered");
  const dom = await slots(page);
  assert.equal(new Set(dom).size, dom.length, "retrying repeated cards");
});

await check("5. Liking a card updates it and is recorded; Not interested removes it and is recorded", async () => {
  const id = await page.locator("[data-feed-post]").nth(1).getAttribute("data-feed-post");
  const card = page.locator(`[data-feed-post="${id}"]`);
  await card.scrollIntoViewIfNeeded();
  await card.getByRole("button", { name: "Like" }).click();
  await card.getByRole("button", { name: "Unlike" }).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(400);
  assert.equal(sql(`select count(*) from public.feed_likes where user_id = '${PEOPLE.reader}' and post_id = '${id}'`), "1", "no like row");

  const hidden = await page.locator("[data-feed-post]").nth(3).getAttribute("data-feed-post");
  const other = page.locator(`[data-feed-post="${hidden}"]`);
  await other.scrollIntoViewIfNeeded();
  await other.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: /Not interested/ }).click();
  await page.waitForSelector(`[data-feed-post="${hidden}"]`, { state: "detached", timeout: 10_000 });
  await page.waitForTimeout(400);
  assert.equal(sql(`select count(*) from public.feed_hidden where user_id = '${PEOPLE.reader}' and post_id = '${hidden}'`), "1", "no hidden row");
});

await check("6. Opening a card and coming back returns to the same card, with the same cards, without asking for page one again", async () => {
  // A card with a link of its own, part way down.
  const target = await page.evaluate(() => {
    const ws = document.getElementById("workspace");
    const linked = [...document.querySelectorAll("[data-feed-post]")].filter((card) => card.querySelector("h2 a[href^='/'], h3 a[href^='/'], p a[href^='/'], a[href^='/'][class*='underline']"));
    const card = linked[Math.min(14, linked.length - 1)];
    card.scrollIntoView({ block: "start" });
    ws.scrollTop -= 0;
    return card.getAttribute("data-feed-post");
  });
  await page.waitForTimeout(600);
  const count = (await slots(page)).length;
  const asked = page.feed.length;
  const link = page.locator(`[data-feed-post="${target}"] a[href^='/']`).filter({ hasNotText: /^#/ }).first();
  const href = await link.getAttribute("href");
  // Where the card is on the screen as it is left: the click below scrolls
  // nothing further, since the link is already in view.
  await link.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const offset = (id) => page.evaluate((card) => {
    const ws = document.getElementById("workspace");
    return document.querySelector(`[data-feed-post="${card}"]`).getBoundingClientRect().top - ws.getBoundingClientRect().top;
  }, id);
  // As the press lands — Playwright may scroll first, to clear the sticky chip bar.
  await page.evaluate((card) => {
    addEventListener("pointerdown", () => {
      const ws = document.getElementById("workspace");
      sessionStorage.setItem("__left", String(document.querySelector(`[data-feed-post="${card}"]`).getBoundingClientRect().top - ws.getBoundingClientRect().top));
    }, { capture: true, once: true });
  }, target);
  await link.click();
  await page.waitForURL((url) => url.pathname === href.split("?")[0], { timeout: 20_000 });
  await page.goBack();
  await page.waitForSelector(`[data-feed-post="${target}"]`, { timeout: 20_000 });
  await page.waitForTimeout(500);
  const back = await offset(target);
  const left = Number(await page.evaluate(() => sessionStorage.getItem("__left")));
  assert.ok(Math.abs(back - left) < 80, `left the card ${Math.round(left)}px down the screen, came back to it at ${Math.round(back)}px`);
  assert.equal((await slots(page)).length, count, "came back to a different number of cards");
  const firstPages = page.feed.slice(asked).filter((entry) => !entry.url.searchParams.get("after"));
  assert.equal(firstPages.length, 0, "coming back asked for the first page again");
});

await check("7. The next visit opens with different cards, and the sightings are in the database", async () => {
  await page.waitForTimeout(3500); // a dwell, a batch, an idle callback
  const views = Number(sql(`select count(*) from public.feed_views where user_id = '${PEOPLE.reader}'`));
  // Only what stayed on screen for a second counts: the six read, and a few more.
  assert.ok(views >= 6, `only ${views} sightings recorded`);
  const seen = sql(`select post_id from public.feed_views where user_id = '${PEOPLE.reader}'`).split("\n");
  assert.ok(firstVisit.slice(0, 6).every((id) => seen.includes(id)), "the cards read first were not recorded as seen");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-feed-post]");
  const second = (await cards(page)).slice(0, 12).map((card) => card.id);
  const again = second.filter((id) => seen.includes(id));
  assert.ok(again.length <= 1, `${again.length} of the next visit's first 12 were already seen`);
  assert.ok(second.filter((id) => firstVisit.includes(id)).length <= 6, "the next visit opens much as the last did");
  firstVisit = second;
});

const newcomer = await open("newcomer");
await check("8. Somebody else's first page is not this one, and a new member's is mixed too", async () => {
  await home(newcomer.page);
  const shown = (await cards(newcomer.page)).slice(0, 12);
  assert.notDeepEqual(shown.map((card) => card.id), firstVisit, "two readers got the same first page");
  assert.ok(new Set(shown.map((card) => card.kind)).size >= 6, "a new member's first page is not mixed");
});

let everything = [];
await check("9. The whole feed pages to an end: every source reaches it, nothing private does, nothing twice", async () => {
  const { posts, ended } = await walk(newcomer.page);
  everything = posts;
  assert.ok(ended, "the feed never reached its end");
  assert.equal(new Set(posts.map((post) => post.id)).size, posts.length, "a post came twice in the walk");
  const titles = posts.map((post) => post.title);
  for (const [title, entity] of [["Live joinery and fitted kitchens", "service"], ["Live site engineer wanted", "job"], ["Live concrete mixer for hire", "equipment"],
    ["Live: which waterproofing lasts on a flat roof?", "community_post"], ["Live walnut wardrobe", "design"], ["Live G+2 floor plan set", "product"]]) {
    const post = posts.find((one) => one.title === title);
    assert.ok(post, `${title} is not in the feed`);
    assert.equal(post.entityType, entity, `${title} is filed as ${post.entityType}`);
  }
  assert.equal(posts.find((one) => one.title === "Live G+2 floor plan set").kind, "floor_plan");
  for (const title of ["Live draft service", "Live private job", "Live private kitchen", "Live draft floor plan"]) {
    assert.ok(!titles.includes(title), `${title} is in the feed`);
  }
  const published = Number(sql("select count(*) from public.feed_posts where status = 'published'"));
  assert.equal(posts.length, published, `walked ${posts.length} of ${published} published posts`);
  const kinds = new Set(posts.map((post) => post.kind));
  for (const kind of ["property", "professional", "equipment", "floor_plan", "document", "ai_design", "discussion", "material", "furniture"]) assert.ok(kinds.has(kind), `no ${kind} anywhere in the feed`);
});

await check("10. Scrolled to the end, it says so, offers a refresh, and stops asking", async () => {
  const p = newcomer.page;
  for (let n = 0; n < 40 && !(await p.getByText("That is everything for now.").count()); n += 1) await nextPage(p);
  await p.getByText("That is everything for now.").waitFor({ timeout: 5000 });
  const asked = p.feed.length;
  await scrollToEnd(p);
  await p.waitForTimeout(1500);
  assert.equal(p.feed.length, asked, "it asked for more after the end");
  const dom = await slots(p);
  assert.equal(new Set(dom).size, dom.length, "a card is on the page twice");
  assert.equal(dom.length, everything.length, `${dom.length} cards on the page, ${everything.length} in the feed`);
  assert.ok(await p.getByRole("button", { name: "Refresh the feed" }).isVisible());
});

const creator = await open("creator");
await check("11. What somebody publishes is on their Home when they go back to it, without a reload, and in everybody's feed", async () => {
  const p = creator.page;
  await p.goto(`${base}/about`, { waitUntil: "domcontentloaded" });
  // As the services form does it: a row in the feature's own table, through the API, as them.
  await rest("services", { as: PEOPLE.creator, method: "POST", body: [{ provider_id: PEOPLE.creator, title: "Live tiling crew, just published", slug: "live-tiling-crew", status: "published" }] });
  await p.evaluate(() => { window.__sameDocument = true; });
  await p.getByRole("link", { name: /^Home$/i }).first().click();
  await p.waitForURL(`${base}/`);
  await p.waitForSelector("[data-feed-post]");
  assert.equal(await p.evaluate(() => window.__sameDocument === true), true, "Home was a full reload");
  const shown = await cards(p);
  const fresh = shown.findIndex((card) => card.text.includes("Live tiling crew, just published"));
  assert.ok(fresh >= 0 && fresh < 3, `the new service is at ${fresh} of the creator's Home`);
  assert.ok(shown[fresh].text.includes("Service"), "the card does not say it is a service");
  const { posts } = await walk(page);
  assert.equal(posts.filter((post) => post.title === "Live tiling crew, just published").length, 1, "the new service is not once in another reader's feed");
});

const other = await open("other");
await check("12. Topics chosen in Settings are saved only once confirmed, and lean that person's Home feed", async () => {
  const p = other.page;
  const before = everything.slice(0, 24).filter((post) => post.topic === "materials" || post.topic === "equipment").length;
  await p.goto(`${base}/settings#feed`, { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: "Materials" }).click();
  await p.getByRole("button", { name: "Equipment" }).click();
  await p.getByRole("button", { name: "Save feed settings" }).click();
  await p.getByRole("status").filter({ hasText: "Saved" }).waitFor({ timeout: 15_000 });
  assert.equal(sql(`select array_to_string(topics, ',') from public.feed_interests where user_id = '${PEOPLE.other}'`), "materials,equipment");
  await home(p);
  const leaned = (await walk(p)).posts.slice(0, 24).filter((post) => post.topic === "materials" || post.topic === "equipment").length;
  assert.ok(leaned >= before + 3, `materials and equipment: ${leaned} of 24 after choosing them, ${before} for somebody who did not`);
});

await check("13. A featured listing is labelled Featured, and only real listings are", async () => {
  sql(`update public.feed_posts set boost = 5 where title = 'Live concrete mixer for hire'`);
  const p = other.page;
  await home(p);
  const { posts } = await walk(p);
  const featured = posts.filter((post) => post.featured);
  assert.deepEqual(featured.map((post) => post.title), ["Live concrete mixer for hire"]);
  for (let n = 0; n < 25 && !(await p.locator("[data-feed-featured]").count()); n += 1) await nextPage(p);
  const card = p.locator("[data-feed-featured]").first();
  assert.ok(await card.getByText("Featured", { exact: true }).isVisible(), "the featured card does not say so");
});

const visitor = await open(null);
await check("14. A visitor gets the feed too, pages without repeats, and a return visit moves past what they read", async () => {
  const p = visitor.page;
  await home(p);
  const first = (await cards(p)).slice(0, 12).map((card) => card.id);
  for (const id of first.slice(0, 5)) {
    await p.locator(`[data-feed-post="${id}"]`).scrollIntoViewIfNeeded();
    await p.waitForTimeout(1300);
  }
  await p.waitForTimeout(2500);
  // Pages asked for during one reading are ranked against the seen list the
  // reading started with, so none of them brings back what the first showed.
  await nextPage(p);
  await nextPage(p);
  const pages = p.feed.filter((entry) => entry.url.searchParams.get("after"));
  const later = pages.flatMap((entry) => entry.body?.posts.map((post) => post.id) ?? []);
  assert.ok(later.length >= 24, `only ${later.length} cards on later pages`);
  // The order this reading should have had: from the first page's cursor, with
  // the seen list the reading began with (none), in one request. Later pages
  // ranked against a list that grew while the visitor read would differ —
  // cards skipped, cards moved — even where none of them repeats.
  const start = pages[0].url.searchParams;
  const expected = await p.evaluate(async ({ query, limit }) => {
    const response = await fetch(`/api/feed?limit=${limit}&${query}`);
    return (await response.json()).posts.map((post) => post.id);
  }, { query: ["score", "after", "now", "seed"].map((key) => `${key}=${encodeURIComponent(start.get(key))}`).join("&"), limit: Math.min(later.length, 24) });
  // The server reorders within a page for variety, so compare each page's cards as a set.
  const sorted = (ids) => [...ids].sort().join(",");
  assert.equal(sorted(later.slice(0, expected.length)), sorted(expected), "a visitor's later pages are not the reading's own order: cards were skipped or moved");
  assert.equal(new Set(later).size, later.length, "a visitor's later pages repeat each other");
  assert.ok(!later.some((id) => first.includes(id)), "a visitor's later page brought back a card from the first");
  const dom = await slots(p);
  assert.equal(new Set(dom).size, dom.length, "a visitor's feed repeated a card");
  const remembered = await p.evaluate(() => JSON.parse(sessionStorage.getItem("medosha.feed.seen") ?? "[]"));
  assert.ok(first.slice(0, 5).every((id) => remembered.includes(id)), "the tab did not remember what the visitor read");
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForResponse((response) => new URL(response.url()).pathname === "/api/feed" && response.request().method() === "POST", { timeout: 15_000 });
  await p.waitForTimeout(500);
  const again = (await cards(p)).slice(0, 12).map((card) => card.id);
  assert.ok(again.filter((id) => remembered.includes(id)).length <= 1, "a visitor's second visit opened with cards they had read");
});

await check("15. A filter with nothing in it says so", async () => {
  const p = other.page;
  await home(p);
  await p.route("**/api/feed?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ posts: [], cursor: null, available: true }) }));
  await p.getByRole("tab", { name: /Property/ }).click();
  await p.getByText("Nothing here yet").waitFor({ timeout: 10_000 });
  await p.unroute("**/api/feed?**");
});

const early = await open("newcomer");
await check("16. Deployed before 0109 is run: Home still fills from the older ranking, and is not told what was seen", async () => {
  // As a database without the migration: the new ranking is not there.
  sql("alter function public.feed_page_mixed rename to feed_page_mixed_away; notify pgrst, 'reload schema';");
  try {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const p = early.page;
    const before = sql(`select count(*) from public.feed_views where user_id = '${PEOPLE.newcomer}'`);
    await home(p);
    const shown = (await cards(p)).slice(0, 6);
    assert.ok(shown.length >= 6, "Home is empty without 0109");
    for (const card of shown) {
      await p.locator(`[data-feed-post="${card.id}"]`).scrollIntoViewIfNeeded();
      await p.waitForTimeout(1300);
    }
    await p.waitForTimeout(3000);
    assert.equal(sql(`select count(*) from public.feed_views where user_id = '${PEOPLE.newcomer}'`), before, "sightings were recorded for the older ranking, which would narrow the feed to one kind");
  } finally {
    sql("alter function public.feed_page_mixed_away rename to feed_page_mixed; notify pgrst, 'reload schema';");
  }
});

await browser.close();
await stack?.stop();
if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall home feed checks passed");
