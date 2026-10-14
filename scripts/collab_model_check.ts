/**
 * The Collaborative Studio's shared rules: what an object may hold, where a
 * pin is, what a revision is called, who is mentioned, who may do what.
 *
 *   npx tsx scripts/collab_model_check.ts
 *
 * The browser and the server actions validate with these same functions, so
 * a check here is a check on both.
 */
import assert from "node:assert/strict";

import { can, denormalise, INVITE_ROLES, inviteInput, inviteToken, inviteUrl, itemChange, mentionedIn, nextRevisionLabel, normalise, parseItemData, safeUrl, STARTER_SECTIONS, TASK_COLUMNS, tokenFromHash } from "../src/lib/collab/model";
import { inviteState } from "../src/lib/collab/queries";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };

// Links: only web addresses.
ok(safeUrl.safeParse("https://example.com/walnut").success, "an https link is a link");
ok(safeUrl.safeParse("http://example.com").success, "so is http");
for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "file:///etc/passwd", "example.com", "  javascript:alert(1)"]) {
  ok(!safeUrl.safeParse(bad).success, `"${bad}" is refused: a click on it would not go to a web page`);
}
ok(!parseItemData("link", { url: "javascript:alert(1)" }).ok, "and a link card cannot carry one");

// Each kind holds what it should, and nothing else.
ok(parseItemData("sticky", { text: "Walnut?", color: "#fef08a" }).ok, "a sticky note");
ok(!parseItemData("sticky", { text: "x", color: "red" }).ok, "colours are hex, not words a renderer might interpret");
ok(!parseItemData("sticky", { text: "x", onclick: "steal()" }).ok, "an object with a field it does not have is refused");
ok(parseItemData("checklist", { items: [{ id: "a", text: "Order tiles", done: false }] }).ok, "a checklist");
ok(!parseItemData("checklist", { items: Array.from({ length: 101 }, (_, i) => ({ id: `${i}`, text: "x", done: false })) }).ok, "of at most 100 lines");
ok(parseItemData("freehand", { points: [0, 0, 10, 10, 20, 5], stroke: "#0f172a", strokeWidth: 3 }).ok, "a freehand stroke");
ok(!parseItemData("freehand", { points: [0, 0, 10] }).ok, "whose points come in pairs");
ok(!parseItemData("freehand", { points: [0, 0, Infinity, 1] }).ok, "and are finite");
ok(!parseItemData("line", { points: [0, 0, 1, 1], strokeWidth: 500 }).ok, "a line no wider than 64");
ok(parseItemData("connector", { from: crypto.randomUUID(), to: crypto.randomUUID(), arrow: true }).ok, "a connector between two objects");
ok(!parseItemData("connector", { from: "not-an-id", to: crypto.randomUUID() }).ok, "named by their ids");
ok(!parseItemData("text", { text: "x".repeat(10001) }).ok, "text has a length limit");
ok(!parseItemData("note", { text: "x", labels: Array.from({ length: 11 }, () => "tag") }).ok, "at most 10 labels");

// A change, as the browser sends it.
ok(itemChange.safeParse({ op: "create", id: crypto.randomUUID(), kind: "sticky", x: 10, y: 20, w: 200, h: 160, data: { text: "" } }).success, "a create");
ok(!itemChange.safeParse({ op: "create", id: crypto.randomUUID(), kind: "script", data: {} }).success, "of a known kind only");
ok(!itemChange.safeParse({ op: "update", id: crypto.randomUUID(), x: 1 }).success, "an update says which revision it was made from");
ok(!itemChange.safeParse({ op: "update", id: crypto.randomUUID(), revision: 1, x: 1e9 }).success, "and stays on the canvas");
ok(!itemChange.safeParse({ op: "update", id: crypto.randomUUID(), revision: 1, w: -5 }).success, "with no negative size");

// Pins on a drawing: 0..1 across and down, at any display size.
const size = { width: 1600, height: 900 };
const pin = normalise({ x: 672, y: 549 }, size);
equal(pin, { x: 0.42, y: 0.61 }, "a pin is stored as a fraction of the drawing");
equal(denormalise(pin, { width: 800, height: 450 }), { x: 336, y: 274.5 }, "and lands on the same spot when the drawing is shown at half the size");
equal(denormalise(pin, size), { x: 672, y: 549 }, "or at full size");
equal(normalise({ x: -20, y: 2000 }, size), { x: 0, y: 1 }, "a pin dropped past the edge stays on the drawing");

// Revisions are lettered.
equal(nextRevisionLabel([]), "A", "the first revision is A");
equal(nextRevisionLabel(["A"]), "B", "then B");
equal(nextRevisionLabel(["A", "B", "Z"]), "AA", "after Z, AA");
equal(nextRevisionLabel(["AZ"]), "BA", "after AZ, BA");
equal(nextRevisionLabel(["Rev 01", "C"]), "D", "labels typed by hand are skipped over");

// Mentions: members only.
const members = [{ id: "u1", handle: "abebe" }, { id: "u2", handle: "sara.k" }, { id: "u3", handle: null }];
equal(mentionedIn("@abebe can you check? cc @sara.k", members), ["u1", "u2"], "@handles name members");
equal(mentionedIn("email me at abebe@example.com", members), [], "an email address is not a mention");
equal(mentionedIn("write to hanna@abebe", members), [], "even when what follows the @ is somebody's handle");
equal(mentionedIn("@nobody here", members), [], "and a handle that is not on the project names nobody");

// Levels.
ok(can.edit("owner") && can.edit("editor") && !can.edit("commenter") && !can.edit("viewer") && !can.edit(null), "owners and editors edit");
ok(can.comment("commenter") && !can.comment("viewer") && !can.comment(null), "commenters comment, viewers do not");
ok(can.manage("owner") && !can.manage("editor"), "only the owner manages");
ok(can.view("viewer") && !can.view(null), "everybody on the project views; nobody else does");

equal(TASK_COLUMNS.map((column) => column.value), ["todo", "in_progress", "review", "done"], "Studio task columns are Agenda's task statuses");
equal([...STARTER_SECTIONS], ["Concept", "Floor Plans", "Interior Design", "Materials", "3D Renders", "Client Feedback", "Approved Designs"], "the architecture starter sections");

// Invitation links.
const token = "Ab0_-".repeat(8) + "xyz";
equal(token.length, 43, "(a well-formed token is 43 characters)");
ok(inviteToken.safeParse(token).success && !inviteToken.safeParse(token.slice(1)).success && !inviteToken.safeParse(`${token.slice(1)}!`).success, "a token is exactly 43 base64url characters");
equal(inviteUrl("https://medosha.example", token), `https://medosha.example/agenda/join#${token}`, "the token travels after #, which browsers never send to a server");
equal(tokenFromHash(`#${token}`), token, "and is read back from the address");
equal([tokenFromHash("#short"), tokenFromHash(""), tokenFromHash(`#${token}x`)], [null, null, null], "a cut-short, missing or padded token is no token");
ok(!(INVITE_ROLES as readonly string[]).includes("client") && !(INVITE_ROLES as readonly string[]).includes("administrator"), "no link role is one Agenda treats as an owner");
equal(inviteInput.parse({}), { level: "commenter", role: "employee", days: 7, maxUses: 1 }, "a link is for commenting, by one person, for a week, unless the owner says otherwise");
ok(!inviteInput.safeParse({ level: "owner" }).success && !inviteInput.safeParse({ role: "client" }).success && !inviteInput.safeParse({ days: 365 }).success && !inviteInput.safeParse({ maxUses: 1000 }).success, "never owner, client, a year, or a thousand people");
const at = Date.parse("2026-10-14T12:00:00Z");
const fresh = { revokedAt: null, expiresAt: "2026-10-21T12:00:00Z", uses: 0, maxUses: 1 };
equal([inviteState(fresh, at), inviteState({ ...fresh, uses: 1 }, at), inviteState({ ...fresh, expiresAt: "2026-10-14T12:00:00Z" }, at), inviteState({ ...fresh, uses: 1, revokedAt: "x" }, at)], ["active", "used", "expired", "revoked"], "a link is active, used up, expired at its moment, or withdrawn — withdrawn first");

console.log(`Studio model: ${checks} checks — safe links, object data by kind, changes with revisions, normalised pins, revision letters, mentions, levels, invitation links`);
