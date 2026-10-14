/**
 * Invitation links, driven in a browser by the people they are for.
 *
 *   node scripts/collab_invites_browser_check.mjs     (after `npm run build`)
 *
 * The real Team tab, join page and server actions against the fake database
 * in collab_fake_supabase.ts, which imitates 0107 (whose rules are tested on
 * PostgreSQL in supabase/tests/collab-invites.sql). The owner makes a link and
 * copies it once; somebody signed out opens it, signs in and joins at exactly
 * the access it names; the next person finds it used up; a withdrawn link and
 * a mangled one open nothing; and the token is never stored, never left in
 * the address bar.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { openStudio, PROJECT } from "./collab_harness.mjs";

const harness = await openStudio();
if (!harness) {
  console.log("SKIP: invitation link browser check needs Playwright");
  process.exit(0);
}
const { browser, url, people } = harness;

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };

const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: url });
const errors = [];
async function open(path) {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`${path}: ${error.message}`));
  await page.goto(`${url}${path}`);
  await page.locator('nav[aria-label="Studio"], #not-found, section[aria-label="Invitation"]').first().waitFor();
  return page;
}
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__collab_fake_db") ?? "{}"));
const signInAs = (page, person) => page.evaluate((id) => sessionStorage.setItem("__collab_user", id), people[person].id);
const invitation = (page) => page.getByRole("region", { name: "Invitation" });
/** Whether it appears: a check, where a bare waitFor would be a crash. */
const shows = (locator) => locator.waitFor({ timeout: 8000 }).then(() => true, () => false);

try {
  // -------------------------------------------------------------------------
  // 1. The owner makes a link: comment access, one person, a week.
  // -------------------------------------------------------------------------
  const owner = await open("?as=owner&tab=team");
  const links = owner.getByRole("region", { name: "Invitation links" });
  await links.getByText("No links yet.").waitFor();
  await links.getByRole("button", { name: "New link" }).click();
  const form = links.getByRole("form", { name: "New invitation link" });
  equal(await form.getByLabel("They can").inputValue(), "commenter", "1: a new link is for commenting unless the owner says otherwise");
  equal(await form.getByLabel("How many people").inputValue(), "1", "1: and for one person");
  ok(!(await form.getByLabel("Role on the project").locator("option").allTextContents()).some((label) => /client|administrator/i.test(label)), "1: no link can make somebody a client or administrator");
  await form.getByLabel("Role on the project").selectOption("engineer");
  await form.getByLabel("Note for yourself (optional)").fill("Client review");
  await form.getByRole("button", { name: "Make link" }).click();
  const shown = links.getByLabel("Link to send");
  await shown.waitFor();
  const link = await shown.inputValue();
  const token = link.split("#")[1] ?? "";
  ok(link.startsWith(`${url}agenda/join#`) && /^[A-Za-z0-9_-]{43}$/.test(token), `1: the link is the join page with a 256-bit token after # (${link})`);
  await links.getByRole("button", { name: "Copy" }).click();
  await links.getByRole("button", { name: "Copied" }).waitFor();
  equal(await owner.evaluate(() => navigator.clipboard.readText()), link, "1: Copy puts exactly the link on the clipboard");

  const stored = (await db(owner)).collab_invites;
  equal(stored.length, 1, "1: one link stored");
  equal(stored[0].token_hash, createHash("sha256").update(token).digest("hex"), "1: as the SHA-256 of its token");
  ok(!JSON.stringify(await db(owner)).includes(token), "1: and the token itself is nowhere in the database");
  equal([stored[0].level, stored[0].role, stored[0].max_uses, stored[0].created_by], ["commenter", "engineer", 1, people.owner.id], "1: commenter, engineer, one person, made by the owner");
  ok(await shows(links.getByRole("list", { name: "Links" }).getByText(/used 0 of 1 · expires/)), "1: listed as unused, with its expiry");

  // A viewer has no say over links.
  const viewer = await open("?as=viewer&tab=team");
  await viewer.getByRole("heading", { name: "Team and access" }).waitFor();
  equal(await viewer.getByRole("region", { name: "Invitation links" }).count(), 0, "1: a viewer is not shown the links");

  // -------------------------------------------------------------------------
  // 2. Somebody signed out opens it, signs in, and joins.
  // -------------------------------------------------------------------------
  const guest = await open(`agenda/join?as=none#${token}`);
  await invitation(guest).getByRole("heading", { name: "You have been invited to a project" }).waitFor();
  equal(await invitation(guest).getByRole("link", { name: "Sign in to join" }).getAttribute("href"), "/login?redirect=/agenda/join", "2: signed out, they are sent to sign in and back here");
  ok(!guest.url().includes("#") && !guest.url().includes(token), "2: the token is taken off the address at once");
  equal(await guest.evaluate(() => sessionStorage.getItem("medosha_join_token")), token, "2: and kept in this tab for the trip through signing in");
  ok(!(await invitation(guest).innerText()).includes("Kitchen renovation"), "2: nothing about the project is shown before signing in");

  await signInAs(guest, "guest");
  await guest.goto(`${url}agenda/join`);
  await invitation(guest).getByRole("heading", { name: "Kitchen renovation" }).waitFor();
  const card = await invitation(guest).innerText();
  ok(card.includes(`${people.owner.name} invites you to`), "2: signed in, they are told who invites them");
  ok(/Access\s*Commenter/.test(card) && /Role\s*Engineer/.test(card), `2: and to what (${card.replace(/\s+/g, " ").slice(0, 160)})`);
  await invitation(guest).getByRole("button", { name: "Join the project" }).click();
  await guest.locator('nav[aria-label="Studio"]').waitFor();
  equal(new URL(guest.url()).pathname, `/agenda/projects/${PROJECT}/collaborate`, "2: joined, they are in the project's Studio");
  const joined = await db(guest);
  const membership = joined.agenda_members.find((row) => row.user_id === people.guest.id);
  equal([membership?.status, membership?.role, membership?.invited_by], ["active", "engineer", people.owner.id], "2: an active engineer, invited by the owner");
  const access = joined.collab_access.find((row) => row.user_id === people.guest.id);
  equal([access?.level, access?.granted_by, access?.invite_id], ["commenter", people.owner.id, stored[0].id], "2: at the link's level, credited to the owner and the link");
  equal(joined.collab_invites[0].uses, 1, "2: the link's one place is used");
  equal(await guest.evaluate(() => sessionStorage.getItem("medosha_join_token")), null, "2: and the token is forgotten");
  await guest.locator('nav[aria-label="Studio"]').getByRole("button", { name: "Board" }).click();
  ok(await shows(guest.getByText("When an editor creates one, it appears here.")) && (await guest.getByRole("button", { name: "New board" }).count()) === 0, "2: in the Studio they cannot make boards");
  await guest.locator('nav[aria-label="Studio"]').getByRole("button", { name: "Discussion" }).click();
  ok(await shows(guest.getByRole("button", { name: "New", exact: true })), "2: but can start a discussion — a commenter");

  // Opening the link again changes nothing.
  await guest.goto(`${url}agenda/join#${token}`);
  await invitation(guest).getByText("You are already on this project.").waitFor();
  await invitation(guest).getByRole("button", { name: "Open the Studio" }).click();
  await guest.locator('nav[aria-label="Studio"]').waitFor();
  equal((await db(guest)).collab_invites[0].uses, 1, "2: somebody already in who opens it again uses no place");

  // -------------------------------------------------------------------------
  // 3. The next person finds it used up.
  // -------------------------------------------------------------------------
  const late = await open(`agenda/join?as=latecomer#${token}`);
  await invitation(late).getByRole("alert").filter({ hasText: "already been used" }).waitFor();
  equal(await invitation(late).getByRole("button", { name: /Join/ }).count(), 0, "3: a used-up link offers no Join");
  ok(!(await db(late)).agenda_members.some((row) => row.user_id === people.latecomer.id), "3: and lets nobody else in");
  await owner.reload();
  ok(await shows(owner.getByRole("region", { name: "Invitation links" }).getByRole("list", { name: "Links" }).getByText("Used up", { exact: true })), "3: the owner sees it used up");

  // -------------------------------------------------------------------------
  // 4. Withdrawn: the owner takes a link back before anybody uses it.
  // -------------------------------------------------------------------------
  const ownerLinks = owner.getByRole("region", { name: "Invitation links" });
  await ownerLinks.getByRole("button", { name: "New link" }).click();
  const second = ownerLinks.getByRole("form", { name: "New invitation link" });
  await second.getByLabel("They can").selectOption("editor");
  ok(await shows(second.getByText("Whoever uses this link can change boards and drawings.")), "4: a link for editing is flagged as such");
  await second.getByLabel("How many people").selectOption("5");
  await second.getByLabel("Note for yourself (optional)").fill("Site team");
  await second.getByRole("button", { name: "Make link" }).click();
  const secondLink = await ownerLinks.getByLabel("Link to send").inputValue();
  await ownerLinks.getByRole("button", { name: "Withdraw Site team" }).click();
  await ownerLinks.getByRole("list", { name: "Links" }).getByText("Withdrawn", { exact: true }).waitFor();
  const withdrawn = (await db(owner)).collab_invites.find((row) => row.label === "Site team");
  ok(withdrawn.revoked_at && withdrawn.revoked_by === people.owner.id, "4: withdrawn, and stamped as the owner's");
  await late.goto(secondLink);
  await invitation(late).getByRole("alert").filter({ hasText: "withdrawn" }).waitFor();
  equal(await invitation(late).getByRole("button", { name: /Join/ }).count(), 0, "4: a withdrawn link offers no Join");

  // -------------------------------------------------------------------------
  // 5. Mangled links.
  // -------------------------------------------------------------------------
  await late.goto(`${url}agenda/join#${token.slice(0, 20)}`);
  ok(await shows(invitation(late).getByRole("heading", { name: "No invitation here" })), "5: a link cut short says so");
  await late.goto(`${url}agenda/join#${"A".repeat(43)}`);
  await invitation(late).getByRole("heading", { name: "This invitation link is not valid" }).waitFor();
  ok(!(await invitation(late).innerText()).includes("Kitchen"), "5: a well-formed token that matches no link reveals nothing");

  ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
} catch (error) {
  for (const [index, page] of context.pages().entries()) {
    const toasts = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
    console.error(`tab ${index} (${page.url()}): ${toasts.join(" | ") || "no messages"}`);
    await page.screenshot({ path: `${harness.out}/failure_${index}.png` }).catch(() => {});
  }
  console.error(`screenshots in ${harness.out}; page errors: ${errors.join(" | ") || "none"}`);
  throw error;
} finally {
  await harness.close();
}
console.log(`Invitation links in the browser: ${checks} checks`);
