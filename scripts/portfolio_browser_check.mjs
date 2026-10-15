/**
 * The Projects tab as a profile and portfolio, in a browser.
 *
 *   node scripts/portfolio_browser_check.mjs     (after `npm run build`)
 *
 * The real header, feed, cards, server action and source layer against the
 * fake in portfolio_fake_supabase.ts (whose visibility is the real policies',
 * checked on PostgreSQL in supabase/tests/portfolio-visibility.sql), inside a
 * stand-in app shell with the bottom bar and the floating + menu.
 */
import assert from "node:assert/strict";

import { openPortfolio, seed } from "./portfolio_harness.mjs";

const harness = await openPortfolio();
if (!harness) {
  console.log("SKIP: portfolio browser check needs Playwright");
  process.exit(0);
}
const { browser, url } = harness;
const { mine } = seed();
const listings = [...mine.marketplace].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? 1 : -1));

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const shows = (locator, timeout = 8000) => locator.waitFor({ timeout }).then(() => true, () => false);

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await phone.grantPermissions(["clipboard-read", "clipboard-write"], { origin: url });
const errors = [];
const page = await phone.newPage();
page.on("pageerror", (error) => errors.push(error.message));
const requests = () => page.evaluate(() => window.__portfolio.requests.map((entry) => entry.table));
const section = (name) => page.getByRole("region", { name });
const workspace = page.locator("#workspace");
const toBottom = async () => {
  for (let i = 0; i < 40; i += 1) {
    await workspace.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await page.waitForTimeout(150);
  }
};

try {
  await page.goto(`${url}/projects?as=me`);
  const hero = page.getByRole("region", { name: "Profile" });
  await hero.waitFor();

  // -------------------------------------------------------------------------
  // 1. The first screen is the profile.
  // -------------------------------------------------------------------------
  const heroText = await hero.innerText();
  for (const expected of ["Yisehak Tilahun", "@yisehak.design", "Architectural & Interior Designer", "Addis Ababa, Ethiopia", "Designing spaces, furniture and construction solutions."]) {
    ok(heroText.includes(expected), `1: the header shows "${expected}"`);
  }
  equal(await hero.getByRole("list", { name: "Skills" }).getByRole("listitem").allInnerTexts(), ["Interior design", "Furniture", "3D visualisation"], "1: and the skills");
  const stats = Object.fromEntries((await hero.locator("dl > div").allInnerTexts()).map((text) => { const [value, label] = text.split("\n"); return [label, Number(value)]; }));
  equal(stats, { Posts: mine.designs.length, Projects: mine.projects.length, Listings: mine.marketplace.length, Digital: mine.digital.length }, "1: counted from the person's own rows");
  equal(await hero.getByRole("link", { name: "Edit profile" }).getAttribute("href"), "/profile/edit", "1: Edit profile opens the profile editor");
  await hero.getByRole("button", { name: "Share profile" }).click();
  await page.waitForTimeout(300);
  const shared = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  equal(shared, `${url}/u/yisehak.design`, "1: Share profile shares the public profile, not this page");
  const heroBox = await hero.boundingBox();
  ok(heroBox.y < 100 && heroBox.y + heroBox.height < 844, "1: the whole header is on the first screen");

  // -------------------------------------------------------------------------
  // 2. Below it, everything, in order, each section fetched only when near.
  // -------------------------------------------------------------------------
  const order = await page.locator("section[aria-labelledby] h3").evaluateAll((nodes) => nodes.map((node) => node.firstChild?.textContent));
  equal(order, ["My Projects", "My Marketplace", "My Digital Products", "My Designs & Posts", "My Services & Professional Work", "More of My Work"], "2: the sections, in order");
  equal(await section("My Projects").getByRole("link").count(), 3, "2: the projects were read with the page, before any scrolling");
  ok((await section("My Projects").getByText("Draft").count()) === 1, "2: the owner sees their draft, marked as one");
  await page.waitForTimeout(600);
  const early = await requests();
  ok(!early.includes("designs") && !early.includes("tours") && !early.includes("posts"), `2: sections far below are not fetched yet (${early.join(", ") || "nothing"})`);
  const marketTop = (await section("My Marketplace").boundingBox()).y;
  ok(marketTop > 844 && early.includes("products"), `2: the next section starts loading before it is on screen (at ${Math.round(marketTop)}px)`);
  // One jump to the end, as a fling or the End key does, on a short screen:
  // the sections passed over on the way were never near it, and still load.
  {
    const short = await phone.newPage();
    short.on("pageerror", (error) => errors.push(error.message));
    await short.setViewportSize({ width: 390, height: 480 });
    await short.goto(`${url}/projects?as=me`);
    await short.getByRole("region", { name: "Profile" }).waitFor();
    await short.evaluate(() => sessionStorage.removeItem("medosha_portfolio:cb000000-0000-4000-8000-000000000001"));
    await short.locator("#workspace").evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await short.waitForTimeout(1500);
    const jumped = await short.evaluate(() => window.__portfolio.requests.map((entry) => entry.table));
    ok(jumped.filter((table) => table === "products").length >= 2 && ["designs", "jobs"].every((table) => jumped.includes(table)),
      `2: after one jump to the bottom, the digital files passed over load too (${jumped.join(", ")})`);
    await short.close();
  }
  await toBottom();
  await shows(section("My Designs & Posts").getByRole("link", { name: "Walnut wardrobe" }));
  const later = await requests();
  ok(later.includes("designs") && later.includes("tours") && later.includes("posts"), "2: scrolled to, they are");
  equal(await section("My Marketplace").getByRole("link").count(), 6, "2: a section previews six");
  ok(await shows(section("My Services & Professional Work").getByText("Professional profile")), "2: services lead with the professional profile");
  ok((await section("My Services & Professional Work").innerText()).includes("8 years' experience"), "2: with the experience");
  equal(await section("My Services & Professional Work").getByRole("link", { name: "Offer a service" }).getAttribute("href"), "/dashboard/services/new", "2: an empty section says where to start, in a line");
  const emptyBox = await section("My Services & Professional Work").locator(".border-dashed").boundingBox();
  ok(emptyBox.height < 90, `2: and is small — no oversized empty state (${Math.round(emptyBox.height)}px)`);
  equal(await page.getByText("No projects yet").count(), 0, "2: the old 'No projects yet' panel is gone");
  ok((await page.locator("body").innerText()).match(/Other's/) === null, "2: nobody else's work, published or not, appears");

  // Images: lazy, through the optimiser where the host allows it.
  const images = await page.locator("main img").evaluateAll((nodes) => nodes.map((node) => ({ lazy: node.getAttribute("loading") === "lazy", optimised: node.dataset.optimised === "true", src: node.getAttribute("src") })));
  ok(images.length > 0 && images.every((image) => image.lazy), "2: every card image is lazy-loaded");
  ok(images.some((image) => image.optimised) && images.some((image) => !image.optimised && image.src.startsWith("https://elsewhere.example")), "2: optimised thumbnails where the host allows, a plain image where it does not");

  // -------------------------------------------------------------------------
  // 3. A section to its end: every listing once, newest first.
  // -------------------------------------------------------------------------
  await section("My Marketplace").getByRole("button", { name: "View all Marketplace" }).click();
  ok(new URL(page.url()).searchParams.get("view") === "marketplace", "3: View all filters to the section, in the address");
  const before = (await requests()).filter((table) => table === "products").length;
  await toBottom();
  await shows(page.getByText(`That is everything — ${mine.marketplace.length} items.`), 15000);
  const titles = await section("My Marketplace").getByRole("link").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
  equal(titles.length, mine.marketplace.length, "3: every product, property and equipment listing is there");
  equal(new Set(titles).size, titles.length, "3: none twice");
  equal(titles, listings.map((row) => row.title), "3: newest first across the three tables, ties included");
  const pages = (await requests()).filter((table) => table === "products").length - before;
  equal(pages, Math.ceil(mine.marketplace.length / 12) - 1, "3: one request per table per page, the preview's page reused rather than fetched again");
  const listingBox = await page.getByText(`That is everything`).boundingBox();
  const barBox = await page.getByRole("navigation", { name: "Bottom navigation" }).boundingBox();
  ok(listingBox.y + listingBox.height <= barBox.y, "3: the end of the list scrolls clear of the bottom bar");

  // -------------------------------------------------------------------------
  // 4. Open one and come back: the same place, nothing fetched again.
  // -------------------------------------------------------------------------
  const target = section("My Marketplace").getByRole("link", { name: listings[30].title });
  await target.scrollIntoViewIfNeeded();
  const scrolled = await workspace.evaluate((node) => node.scrollTop);
  const href = await target.getAttribute("href");
  await target.click();
  await page.locator("#detail").waitFor();
  equal(new URL(page.url()).pathname, href, "4: a card opens the item's own page");
  await page.goBack();
  await section("My Marketplace").getByRole("link", { name: listings[30].title }).waitFor();
  await page.waitForTimeout(500);
  equal(await section("My Marketplace").getByRole("link").count(), mine.marketplace.length, "4: back, every listing is still there");
  ok(Math.abs((await workspace.evaluate((node) => node.scrollTop)) - scrolled) < 60, "4: at the same place in the list");
  equal((await requests()).filter((table) => table === "products").length, 0, "4: without fetching them again");

  // -------------------------------------------------------------------------
  // 5. Filters, and a failure that says so and recovers.
  // -------------------------------------------------------------------------
  await page.getByRole("button", { name: "Designs & Posts" }).click();
  ok(await shows(section("My Designs & Posts").getByRole("link", { name: "Finishing the stair" })), "5: Designs & Posts shows designs, tours and posts");
  ok((await section("My Designs & Posts").getByRole("link", { name: "Which tile for a wet room?" }).count()) === 1, "5: a post without a title shows its words");
  ok((await section("My Designs & Posts").getByText("Private").count()) >= 1, "5: a private design is marked private, to its owner");
  await page.getByRole("button", { name: "Digital Products" }).click();
  await shows(section("My Digital Products").getByRole("link").first());
  await toBottom();
  await shows(page.getByText(`That is everything — ${mine.digital.length} items.`), 15000);
  const files = await section("My Digital Products").getByRole("link").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
  const expectedFiles = [...mine.digital].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? 1 : -1)).map((row) => row.title);
  equal(files, expectedFiles, "5: Digital shows every digital file, once, in order — two made in the same instant either side of a page's edge included");
  ok((await section("My Digital Products").innerText()).includes("ETB 350"), "5: with their prices");
  equal(await page.locator("section[aria-labelledby]").count(), 1, "5: and nothing else");

  // A failure, then Try again.
  await page.goto(`${url}/projects?as=me`);
  await page.getByRole("region", { name: "Profile" }).waitFor();
  await page.evaluate(() => { sessionStorage.removeItem("medosha_portfolio:cb000000-0000-4000-8000-000000000001"); window.__portfolio.offline = true; });
  await toBottom();
  const alert = page.getByRole("alert").filter({ hasText: "could not be loaded" }).first();
  ok(await shows(alert), "5: offline, a section says it could not be loaded");
  const failed = await page.getByRole("alert").filter({ hasText: "could not be loaded" }).count();
  ok(failed >= 1 && (await section("My Designs & Posts").getByRole("link", { name: "Walnut wardrobe" }).count()) === 0, `5: no cards are invented while it is failing (${failed} sections said so)`);
  await page.evaluate(() => { window.__portfolio.offline = false; });
  for (let i = 0; i < 6 && (await page.getByRole("button", { name: "Try again" }).count()); i += 1) await page.getByRole("button", { name: "Try again" }).first().click();
  ok(await shows(section("My Designs & Posts").getByRole("link", { name: "Walnut wardrobe" })), "5: Try again loads each section");
  ok(await shows(section("My Marketplace").getByRole("link").first()), "5: all of them");

  // -------------------------------------------------------------------------
  // 6. Phone layout, and the + menu.
  // -------------------------------------------------------------------------
  ok(await page.evaluate(() => window.innerWidth === 390 && document.documentElement.scrollWidth <= 390 && document.getElementById("workspace").scrollWidth <= 390), "6: nothing is wider than the phone");
  const chips = page.getByRole("navigation", { name: "Show" });
  ok(await chips.evaluate((node) => node.scrollWidth > node.clientWidth), "6: the filters scroll sideways inside their row instead");
  equal(await chips.getByRole("button").allInnerTexts(), ["All", "Projects", "Marketplace", "Digital Products", "Designs & Posts", "Services"], "6: All and the five filters");
  equal(await page.getByRole("navigation", { name: "Bottom navigation" }).getByRole("link").allInnerTexts(), ["Home", "AI", "Market", "Projects", "More"], "6: the five bottom tabs, as they were");
  await page.getByRole("button", { name: "Quick actions" }).click();
  const menu = await page.locator("a").evaluateAll((nodes) => Object.fromEntries(nodes.map((node) => [node.textContent?.trim().split(/\s{2,}|\n/)[0], node.getAttribute("href")])));
  const wanted = { "Create Project": "/projects/new", "Create Product": "/products/new", "Sell Digital Product": "/products/new?fulfilment=digital", "Create Service": "/dashboard/services/new", "Write a Post": "/community", "Create Property": "/property/new", "Design Furniture": "/studio" };
  for (const [label, path] of Object.entries(wanted)) {
    const found = Object.entries(menu).find(([text]) => text?.startsWith(label));
    equal(found?.[1], path, `6: the + menu offers ${label}`);
  }

  // -------------------------------------------------------------------------
  // 7. Somebody with nothing yet.
  // -------------------------------------------------------------------------
  const fresh = await phone.newPage();
  fresh.on("pageerror", (error) => errors.push(error.message));
  await fresh.goto(`${url}/projects?as=empty`);
  await fresh.getByRole("region", { name: "Profile" }).waitFor();
  equal(await fresh.getByRole("link").filter({ hasText: /^Set a username to share$/ }).getAttribute("href"), "/profile/edit", "7: without a username, Share says how to get one");
  equal(await fresh.locator(".border-dashed").count(), 5, "7: each section is a one-line start, not a page-sized empty panel — and 'More' is left out while empty");
  ok((await fresh.locator("main").innerText()).match(/Other's|Wardrobe|Villa/) === null, "7: and shows nobody else's work");

  ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
} catch (error) {
  for (const [index, tab] of phone.pages().entries()) await tab.screenshot({ path: `${harness.out}/failure_${index}.png`, fullPage: false }).catch(() => {});
  console.error(`screenshots in ${harness.out}; page errors: ${errors.join(" | ") || "none"}`);
  throw error;
} finally {
  await harness.close();
}
console.log(`Portfolio in the browser: ${checks} checks`);
