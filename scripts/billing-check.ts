/**
 * Billing — the parts that decide whether money counts.
 *
 *   npm run check:billing
 *
 * `supabase/tests/credits.sql` attacks the database: who can write a balance,
 * what happens when a webhook arrives twice, whether a refund after a commit
 * gives anything back. This attacks the code above it — the four places where
 * being wrong in TypeScript costs real money:
 *
 *   1. **The signature.** Anyone can POST to the webhook URL. The signature is
 *      the only thing separating Chapa from anyone, so it is checked here with
 *      the wrong secret, no secret, a truncated digest, a body altered by one
 *      character, and a signature lifted from a different request.
 *   2. **The status map.** "success" means money arrived. Everything else must
 *      not, including strings this code has never seen.
 *   3. **Idempotency keys.** Two deliveries of one event have to collapse onto
 *      one row, and two genuinely different events must not.
 *   4. **What leaves the server.** No key, ever, in anything a browser reads.
 *
 * Nothing is called over the network and no key is needed, so this runs in CI
 * in under a second.
 */

import { createHmac } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  chapaKeyProblem,
  chapaMode,
  chapaName,
  chapaSignatureHeader,
  chapaSignatureValid,
  constantTimeEquals,
  flattenChapaMessage,
  initializeBody,
  isPubliclyReachable,
  mapChapaStatus,
  readChapaEvent,
  splitName,
  DESCRIPTION_LIMIT,
  TITLE_LIMIT,
} from "../src/lib/billing/payments/chapa-protocol.ts";
import {
  AI_OPERATION_IDS,
  isAccountPlan,
  isAiOperation,
  planLabel,
  planRank,
  PLAN_ORDER,
} from "../src/lib/billing/operations.ts";

const GREEN = "[32m";
const RED = "[31m";
const DIM = "[2m";
const RESET = "[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const ROOT = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/**
 * The same file with its prose taken out.
 *
 * Every source-order check below was wrong before this existed, and wrong in
 * the flattering direction: the comments at the top of these files describe
 * what the code does, so searching the raw text finds `payment_events` and
 * `fulfil_payment` in a paragraph explaining the order, several hundred
 * characters before the statements that actually do it. Two checks passed on
 * their doc comments and one failed on a sentence that wrapped.
 *
 * Block comments go entirely. Line comments go only when the `//` starts the
 * line, so that a `https://` inside a string survives.
 */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

// ---------------------------------------------------------------------------
// 1. The signature
// ---------------------------------------------------------------------------

const SECRET = "CHASECK_TEST-000signing000secret000";
const BODY = JSON.stringify({
  event: "charge.success",
  tx_ref: "medosha-abc-0001",
  status: "success",
  amount: "1200.00",
  currency: "ETB",
});

const overBody = createHmac("sha256", SECRET).update(BODY).digest("hex");
const overSecret = createHmac("sha256", SECRET).update(SECRET).digest("hex");

const headersWith = (value: string, name = "x-chapa-signature") =>
  new Headers({ [name]: value });

check(
  "a signature over the body is accepted",
  chapaSignatureValid(BODY, headersWith(overBody), SECRET),
);

check(
  "so is Chapa's other form, over the secret",
  chapaSignatureValid(BODY, headersWith(overSecret, "chapa-signature"), SECRET),
);

check(
  "a body altered by one character is refused",
  !chapaSignatureValid(
    BODY.replace("1200.00", "1200.01"),
    headersWith(overBody),
    SECRET,
  ),
);

check(
  "a signature made with a different secret is refused",
  !chapaSignatureValid(
    BODY,
    headersWith(createHmac("sha256", "not-the-secret").update(BODY).digest("hex")),
    SECRET,
  ),
);

check(
  "a truncated signature is refused",
  !chapaSignatureValid(BODY, headersWith(overBody.slice(0, 32)), SECRET),
);

check(
  "a signature for a different body is refused",
  !chapaSignatureValid(
    BODY,
    headersWith(
      createHmac("sha256", SECRET)
        .update(JSON.stringify({ tx_ref: "someone-elses", status: "success" }))
        .digest("hex"),
    ),
    SECRET,
  ),
);

check("no header at all is refused", !chapaSignatureValid(BODY, new Headers(), SECRET));

check(
  "an empty signature header is refused",
  !chapaSignatureValid(BODY, headersWith(""), SECRET),
);

// The direction that matters most. A deployment that forgot CHAPA_WEBHOOK_SECRET
// must reject every delivery, not accept every delivery.
check(
  "with no secret configured, nothing verifies",
  !chapaSignatureValid(BODY, headersWith(overBody), "") &&
    !chapaSignatureValid(BODY, headersWith(""), ""),
);

check(
  "and an empty signature does not match an empty secret",
  !chapaSignatureValid(BODY, headersWith(""), ""),
);

check(
  "comparison is length-safe before it is constant-time",
  !constantTimeEquals("abc", "abcdef") && constantTimeEquals("abc", "abc"),
);

// ---------------------------------------------------------------------------
// 2. The status map
// ---------------------------------------------------------------------------

check("\"success\" is money", mapChapaStatus("success") === "succeeded");
check("so is \"successful\"", mapChapaStatus("successful") === "succeeded");
check("case does not matter", mapChapaStatus("SUCCESS") === "succeeded");
check("nor does whitespace", mapChapaStatus(" success ") === "succeeded");

check("\"failed\" is a failure", mapChapaStatus("failed") === "failed");
check(
  "cancelled spelt either way is a failure",
  mapChapaStatus("cancelled") === "failed" && mapChapaStatus("canceled") === "failed",
);

// The whole point of the narrowing: an unfamiliar status must never be read as
// money having arrived.
for (const odd of [
  "pending",
  "processing",
  "requires_action",
  "succeeded",
  "SUCCES",
  "true",
  "1",
  "ok",
  "",
]) {
  check(
    `"${odd}" is not treated as paid`,
    mapChapaStatus(odd) !== "succeeded",
    mapChapaStatus(odd),
  );
}

for (const notAString of [null, undefined, 1, true, {}, ["success"]]) {
  check(
    `${JSON.stringify(notAString) ?? "undefined"} is not treated as paid`,
    mapChapaStatus(notAString) !== "succeeded",
  );
}

// ---------------------------------------------------------------------------
// 3. Idempotency keys
// ---------------------------------------------------------------------------

const first = readChapaEvent(BODY);
const again = readChapaEvent(BODY);

check(
  "the same event read twice produces the same key",
  !("error" in first) &&
    !("error" in again) &&
    first.eventReference === again.eventReference,
);

// Byte-for-byte identical is the easy case. A retry that re-serialises the JSON
// with the keys in a different order is the one that would slip past a hash of
// the body — and it must still collapse.
const reordered = JSON.stringify({
  status: "success",
  amount: "1200.00",
  currency: "ETB",
  tx_ref: "medosha-abc-0001",
  event: "charge.success",
});
const shuffled = readChapaEvent(reordered);

check(
  "a retry with the fields reordered is still the same event",
  !("error" in first) &&
    !("error" in shuffled) &&
    first.eventReference === shuffled.eventReference,
);

const failedEvent = readChapaEvent(
  JSON.stringify({ event: "charge.failed", tx_ref: "medosha-abc-0001" }),
);

check(
  "but a different event on the same transaction is not",
  !("error" in first) &&
    !("error" in failedEvent) &&
    first.eventReference !== failedEvent.eventReference,
);

const otherTransaction = readChapaEvent(
  JSON.stringify({ event: "charge.success", tx_ref: "medosha-abc-0002" }),
);

check(
  "nor is the same event on a different transaction",
  !("error" in first) &&
    !("error" in otherTransaction) &&
    first.eventReference !== otherTransaction.eventReference,
);

check(
  "Chapa's other spelling of the reference is read",
  (() => {
    const parsed = readChapaEvent(JSON.stringify({ trx_ref: "medosha-x", status: "success" }));
    return !("error" in parsed) && parsed.reference === "medosha-x";
  })(),
);

check(
  "a body with no reference is refused rather than given a key",
  "error" in readChapaEvent(JSON.stringify({ event: "charge.success" })),
);

check(
  "an empty reference is refused too",
  "error" in readChapaEvent(JSON.stringify({ tx_ref: "", status: "success" })),
);

check("a body that is not JSON is refused", "error" in readChapaEvent("<html>502</html>"));
check("an empty body is refused", "error" in readChapaEvent(""));

check(
  "a JSON array is refused rather than crashing",
  "error" in readChapaEvent("[1,2,3]"),
);

check(
  "the parsed body is carried out, so it is not parsed twice",
  !("error" in first) &&
    (first.payload as { tx_ref?: string }).tx_ref === "medosha-abc-0001",
);

// ---------------------------------------------------------------------------
// 4. The key, and what leaves the server
// ---------------------------------------------------------------------------

check("an unset key is named, not guessed at", (chapaKeyProblem("") ?? "").includes("CHAPA_SECRET_KEY"));
check(
  "a public key pasted by mistake is caught",
  (chapaKeyProblem("CHAPUBK_TEST-abc") ?? "").includes("CHASECK"),
);
check("a real-shaped secret key passes", chapaKeyProblem("CHASECK-abc123") === null);
check("and so does a test key", chapaKeyProblem("CHASECK_TEST-abc123") === null);

check("a test key is not live money", chapaMode("CHASECK_TEST-abc") === "test");
check("a plain secret key is", chapaMode("CHASECK-abc") === "live");
check("no key is neither", chapaMode("") === "unset");

/** Every file the browser could ever load, walked. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === "node_modules" || entry === ".next") continue;
    const relative = join(dir, entry);
    if (statSync(join(ROOT, relative)).isDirectory()) walk(relative, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(relative);
  }
  return out;
}

const sources = walk("src");
const clientFiles = sources.filter((path) =>
  read(path).slice(0, 200).includes('"use client"'),
);

check("there are client components to check", clientFiles.length > 20, `${clientFiles.length}`);

const leaked = clientFiles.filter((path) => {
  const body = read(path);
  return (
    body.includes("CHAPA_SECRET_KEY") ||
    body.includes("CHAPA_WEBHOOK_SECRET") ||
    body.includes("SUPABASE_SERVICE_ROLE_KEY")
  );
});

check(
  "no client component mentions a payment or service secret",
  leaked.length === 0,
  leaked.join(", "),
);

const publicChapa = sources.filter((path) =>
  /NEXT_PUBLIC_[A-Z_]*CHAPA/.test(read(path)),
);

check(
  "no Chapa value is exposed through a NEXT_PUBLIC_ variable",
  publicChapa.length === 0,
  publicChapa.join(", "),
);

// The provider reads the key in exactly one file, and that file is server-only.
const keyReaders = sources.filter((path) =>
  code(path).includes("process.env.CHAPA_SECRET_KEY"),
);

check(
  "the secret key is read in one file only",
  keyReaders.length === 1,
  keyReaders.join(", "),
);

check(
  "and that file is server-only",
  keyReaders.every((path) => read(path).includes('import "server-only"')),
);

const purchaseButton = code("src/components/billing/purchase-button.tsx");
check(
  "the purchase button sends nothing but a product id",
  purchaseButton.includes("JSON.stringify({ productId })") &&
    !purchaseButton.includes("amount") &&
    !purchaseButton.includes("credits") &&
    !purchaseButton.includes("price"),
);

// ---------------------------------------------------------------------------
// 5. Checkout body
// ---------------------------------------------------------------------------

const body = initializeBody({
  reference: "medosha-abc-0001",
  amount: 1200,
  currency: "ETB",
  email: "buyer@example.com",
  firstName: "Selam",
  lastName: "Tesfaye",
  phone: null,
  title: "Medosha Studio Professional Plan",
  description: "A".repeat(400),
  returnUrl: "https://medosha.net/billing/return?ref=medosha-abc-0001",
  callbackUrl: null,
});

check("the amount is sent with two decimals", body.amount === "1200.00");
check(
  "a fractional amount is not rounded away",
  initializeBody({
    reference: "r",
    amount: 1234.5,
    currency: "ETB",
    email: "a@b.c",
    firstName: "A",
    lastName: "B",
    title: "t",
    description: "d",
    returnUrl: "https://x/y",
    callbackUrl: null,
  }).amount === "1234.50",
);

check("the reference goes through as tx_ref", body.tx_ref === "medosha-abc-0001");

// Chapa's own documentation shows `customization[title]`, and its validator
// reads that. A nested `customization: { title }` object is accepted and then
// ignored, so the payment page showed no title at all.
check(
  "customization is sent in the bracketed form Chapa reads",
  "customization[title]" in body && "customization[description]" in body,
);
check(
  "and not as a nested object",
  !("customization" in body),
);
check(
  "a title longer than Chapa accepts is cut here rather than there",
  String(body["customization[title]"] ?? "").length <= TITLE_LIMIT,
);
check(
  "and so is the description",
  String(body["customization[description]"] ?? "").length <= DESCRIPTION_LIMIT,
);
check(
  "an absent phone number is omitted rather than sent as null",
  !("phone_number" in body),
);
check(
  "an absent callback URL is omitted rather than sent as null",
  !("callback_url" in body),
);
check(
  "a callback URL that exists is sent",
  "callback_url" in
    initializeBody({
      reference: "r",
      amount: 1,
      currency: "ETB",
      email: "a@b.c",
      firstName: "A",
      lastName: "B",
      title: "t",
      description: "d",
      returnUrl: "https://x/y",
      callbackUrl: "https://x/z",
    }),
);
check(
  "a phone number that exists is sent",
  "phone_number" in
    initializeBody({
      reference: "r",
      amount: 1,
      currency: "ETB",
      email: "a@b.c",
      firstName: "A",
      lastName: "B",
      phone: "+251911000000",
      title: "t",
      description: "d",
      returnUrl: "https://x/y",
      callbackUrl: null,
    }),
);

// The body carries no key. Chapa authenticates on the header, and a key in a
// serialised body is a key in a log.
check(
  "the checkout body contains no key material",
  !JSON.stringify(body).includes("CHASECK"),
);

// ---------------------------------------------------------------------------
// 5b. Names Chapa will accept
//
// The bug behind "The payment page could not be opened": a profile with no name
// on it fell back to the email address, and Chapa refuses a `first_name`
// carrying an "@" or digits. The whole initialize call was rejected.
// ---------------------------------------------------------------------------

check(
  "an email address does not become a first name",
  !splitName("2044yoo@gmail.com")[0].includes("@"),
  splitName("2044yoo@gmail.com").join(" "),
);
check(
  "the local part is used rather than the whole address",
  splitName("2044yoo@gmail.com")[0] === "yoo",
  splitName("2044yoo@gmail.com")[0],
);
check("digits are stripped from a name", chapaName("Abel2044", "x") === "Abel");
check(
  "an ordinary Ethiopian name survives intact",
  splitName("Selam Tesfaye")[0] === "Selam" &&
    splitName("Selam Tesfaye")[1] === "Tesfaye",
);
check(
  "a hyphenated or apostrophed name survives",
  chapaName("Al-Amin O'Brien", "x") === "Al-Amin O'Brien",
);
check(
  "an Amharic name survives",
  chapaName("ሰላም", "x") === "ሰላም",
  chapaName("ሰላም", "x"),
);
check(
  "a company name with punctuation is cleaned rather than rejected",
  chapaName("Medosha PLC.", "x") === "Medosha PLC",
);
check(
  "a name of nothing but symbols falls back",
  splitName("@@@ ###")[0] === "Medosha" && splitName("@@@ ###")[1] === "Member",
);
check("an empty name falls back", splitName("")[0] === "Medosha");
check(
  "one name still produces two",
  splitName("Selam")[0] === "Selam" && splitName("Selam")[1] === "Member",
);
check(
  "and the body that goes to Chapa carries the cleaned form",
  !String(
    initializeBody({
      reference: "r",
      amount: 1,
      currency: "ETB",
      email: "2044yoo@gmail.com",
      firstName: "2044yoo@gmail.com",
      lastName: "Member",
      title: "t",
      description: "d",
      returnUrl: "https://x/y",
      callbackUrl: null,
    }).first_name,
  ).includes("@"),
);

// ---------------------------------------------------------------------------
// 5c. Where a callback can actually be delivered
// ---------------------------------------------------------------------------

for (const local of [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://192.168.1.14:3000",
  "http://10.0.0.5",
  "http://172.16.4.1",
  "http://medosha.local",
  "http://desktop-pc:3000",
  "not a url at all",
]) {
  check(`${local} is not somewhere Chapa can post`, !isPubliclyReachable(local));
}

for (const public_ of [
  "https://medosha.net",
  "https://medosha.vercel.app",
  "https://a1b2c3.ngrok-free.app",
]) {
  check(`${public_} is`, isPubliclyReachable(public_));
}

// ---------------------------------------------------------------------------
// 5d. Chapa's complaint, which is not always a string
// ---------------------------------------------------------------------------

check(
  "a string message comes through as itself",
  flattenChapaMessage({ message: "Invalid API key" }) === "Invalid API key",
);
check(
  "a field-error object is flattened rather than stringified",
  flattenChapaMessage({
    message: { first_name: ["The first name format is invalid."] },
  }) === "first_name: The first name format is invalid.",
);
check(
  "several field errors are all kept",
  flattenChapaMessage({
    message: { amount: ["too small"], email: ["invalid"] },
  }).includes("amount") &&
    flattenChapaMessage({
      message: { amount: ["too small"], email: ["invalid"] },
    }).includes("email"),
);
// The failure this replaced: `String({…})` is "[object Object]", so Chapa's
// explicit list of what was wrong reached the log as nothing at all.
check(
  "an object message never degrades to [object Object]",
  !flattenChapaMessage({ message: { amount: ["too small"] } }).includes(
    "[object Object]",
  ),
);
check("no message at all is empty, not undefined", flattenChapaMessage({}) === "");

// ---------------------------------------------------------------------------
// 6. Operations and plans
// ---------------------------------------------------------------------------

check("every operation id is unique", new Set(AI_OPERATION_IDS).size === AI_OPERATION_IDS.length);
check(
  "the operation list is small enough to hold in your head",
  AI_OPERATION_IDS.length <= 12,
  `${AI_OPERATION_IDS.length}`,
);

check("a known operation is recognised", isAiOperation("design.chat"));
check("an unknown one is not", !isAiOperation("design.free"));
check("and neither is a near miss", !isAiOperation("design.chat "));
check("nor a non-string", !isAiOperation(null) && !isAiOperation(2));

check("plans are ordered cheapest first", planRank("free") === 0 && planRank("pro") === 1);
check("professional outranks business", planRank("professional") > planRank("business"));
check("admin outranks everything", PLAN_ORDER.every((p) => planRank("admin") >= planRank(p)));
check("every plan has a label", PLAN_ORDER.every((p) => planLabel(p).length > 0));
check("a made-up plan is not a plan", !isAccountPlan("enterprise") && isAccountPlan("pro"));

/**
 * The names in the code and the rows in the migration have to be the same set.
 *
 * This is the check that catches the expensive typo. An operation named in the
 * code but missing from `ai_operation_costs` does not fail loudly — it reserves
 * nothing, raises "unknown operation", and the feature is simply broken for
 * everybody. A row with no caller is dead weight but harmless; the other
 * direction is an outage.
 */
// Every migration, not just the one that created the table. Operations get
// added later — `ai.chat` and `ai.image` arrived in 0040 — and a check pinned
// to 0037 would have failed for the right reason and been "fixed" by pinning
// it to two files, then three.
// Scoped to the statements that actually insert into `ai_operation_costs`.
// The first version matched `('word.word', '` anywhere in any migration and
// found `current_setting('berchuma.internal', true)` — a setting name, in an
// unrelated function, reported as a priced AI operation.
const seeded = readdirSync(join(ROOT, "supabase/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .flatMap((name) => {
    const sql = read(join("supabase/migrations", name));
    // Terminated on a semicolon at the end of a line, not the first semicolon
    // anywhere. One of the seeded notes reads "Geometry is read directly; the
    // credits cover classification." — and a lazy match to the first `;` cut
    // the statement in half there, losing the last two operations and
    // reporting them as unpriced.
    const inserts = [
      ...sql.matchAll(/insert\s+into\s+public\.ai_operation_costs[\s\S]*?;[ \t]*$/gim),
    ].map((match) => match[0]);

    return inserts.flatMap((statement) =>
      [...statement.matchAll(/\('([a-z]+\.[a-z]+)',\s*'/g)].map((m) => m[1]),
    );
  });

for (const operation of AI_OPERATION_IDS) {
  check(
    `${operation} is priced by a migration`,
    seeded.includes(operation),
    "no row in ai_operation_costs — the gate would refuse it as unknown",
  );
}

check(
  "and no migration prices an operation the code cannot name",
  seeded.every((operation) => isAiOperation(operation)),
  seeded.filter((o) => !isAiOperation(o)).join(", "),
);

// The gate reads costs from the database. A number written next to an operation
// name in TypeScript is the thing the brief specifically asked not to exist.
const gateSource = read("src/lib/billing/gate.ts");
check(
  "the gate hardcodes no credit cost",
  !/credits\s*[:=]\s*\d/.test(gateSource),
);

const operationsSource = read("src/lib/billing/operations.ts");
check(
  "and neither does the operation catalogue",
  !/\d+\s*,?\s*\/\/\s*credits/i.test(operationsSource) &&
    !/credits\s*[:=]\s*\d/.test(operationsSource),
);

// ---------------------------------------------------------------------------
// 7. The order of the gate, read out of the source
// ---------------------------------------------------------------------------

const designRoute = code("src/app/api/studio/design/route.ts");
const imageRoute = code("src/app/api/studio/image/route.ts");

for (const [name, source] of [
  ["design", designRoute],
  ["image", imageRoute],
] as const) {
  check(
    `the ${name} route no longer uses the flat hourly cap`,
    !source.includes("ai_requests_in_window"),
  );
  check(
    `the ${name} route goes through the credit gate`,
    source.includes("await withCredits"),
  );
  check(
    `the ${name} route checks the session before it charges`,
    source.indexOf("auth.getUser") < source.indexOf("await withCredits"),
  );
  check(
    `the ${name} route refunds a provider failure`,
    source.includes("charge: false as const"),
  );
}

const webhookRoute = code("src/app/api/billing/webhook/[provider]/route.ts");

check("the webhook reads the raw body, not the parsed one", webhookRoute.includes("request.text()"));
check(
  "and it reads it before parsing anything",
  webhookRoute.indexOf("request.text()") < webhookRoute.indexOf("parseWebhook"),
);
// Written as one regex rather than two `includes` calls, because the two-call
// version passed with the guard commented out — both strings were still in the
// file, several lines apart, doing nothing. The check has to see the guard, not
// the vocabulary.
// Chapa uses this URL two ways: the dashboard webhook is signed, the
// `callback_url` posted after a payment is not. Requiring a signature on both
// answered every callback with a 401 and threw the payment away — so the rule
// is "a signature that is present must verify", not "a signature must exist".
check(
  "a signature that is present and wrong is rejected with a 401",
  /if \(parsed\.signaturePresent && !parsed\.signatureValid\) \{[\s\S]{0,600}?status: 401/.test(
    webhookRoute,
  ),
);
check(
  "an unsigned callback is not rejected",
  !/if \(!parsed\.signatureValid\) \{[\s\S]{0,400}?status: 401/.test(webhookRoute),
);
check(
  "but it is noted, so a missing secret is visible in the log",
  /if \(!parsed\.signaturePresent\) \{[\s\S]{0,300}?console\.warn/.test(webhookRoute),
);
check(
  "the two signature questions are answered separately",
  chapaSignatureHeader(headersWith("anything")) === "anything" &&
    chapaSignatureHeader(new Headers()) === null &&
    chapaSignatureHeader(headersWith("   ")) === null,
);
check(
  "the signature is checked before the event is recorded",
  webhookRoute.indexOf("parsed.signatureValid") <
    webhookRoute.indexOf('from("payment_events")'),
);
check(
  "the event is recorded before anything is granted",
  webhookRoute.indexOf('from("payment_events")') <
    webhookRoute.indexOf("await settlePayment("),
);
check(
  "a duplicate delivery is detected by the unique constraint, not by a lookup",
  webhookRoute.includes("23505"),
);

// The one a signed request against an unreachable database caught. Answering
// 200 to a *failed* insert tells the provider the event was handled and stops
// the retries — the delivery is lost, and with it the member's plan. Only the
// unique violation may answer 200; every other insert failure has to ask for
// another delivery.
check(
  "an event that could not be recorded asks for a retry, not a 200",
  /if \(alreadySeen\.code === "23505"\) \{[\s\S]{0,200}?duplicate: true[\s\S]{0,400}?status: 503/.test(
    webhookRoute,
  ),
);
check(
  "the webhook never calls credits_grant directly",
  !webhookRoute.includes("credits_grant"),
);

const fulfilment = code("src/lib/billing/fulfilment.ts");
check(
  "fulfilment asks the provider before granting anything",
  fulfilment.indexOf("provider.verify(") < fulfilment.indexOf('rpc("fulfil_payment"'),
);
check(
  "fulfilment compares the amount and the currency before granting",
  fulfilment.includes("paid + 0.1 < owed") &&
    fulfilment.includes("verified.currency.toUpperCase()"),
);
// A verify that threw tells us nothing about the money, so the row must be
// left alone. Proved by the absence of a write on that path rather than by the
// presence of a comment saying so.
const verifyCatch = fulfilment.slice(
  fulfilment.indexOf("} catch (error) {"),
  fulfilment.indexOf('return { state: "pending" };'),
);
check(
  "an unreachable provider does not mark the payment failed",
  verifyCatch.length > 0 && !verifyCatch.includes('status: "failed"'),
);

const checkoutRoute = code("src/app/api/billing/checkout/route.ts");
check(
  "checkout reads the price from billing_products",
  checkoutRoute.includes('from("billing_products")'),
);
check(
  "checkout never reads an amount from the request body",
  !/body\.(amount|price|credits|plan)/.test(checkoutRoute),
);
check(
  "checkout writes the payment row with the service role",
  checkoutRoute.includes("createServiceClient"),
);
check(
  "checkout records the payment before calling the provider",
  checkoutRoute.indexOf('from("payments")') < checkoutRoute.indexOf("provider.checkout"),
);

// ---------------------------------------------------------------------------
// 8. The error is not swallowed
//
// The bug report was "The payment page could not be opened. Try again shortly."
// — my own generic message, standing in for a specific complaint from Chapa
// that was logged as one line and never looked at. These lock in the fix.
// ---------------------------------------------------------------------------

check(
  "the useless generic message is gone",
  !checkoutRoute.includes("The payment page could not be opened"),
);
check(
  "a failed checkout logs everything needed to diagnose it",
  ["tx_ref", "http status", "provider says", "amount", "user", "callback_url"].every(
    (field) => checkoutRoute.includes(field),
  ),
);
check(
  "the log names the mode, so a test key in production is visible",
  checkoutRoute.includes("provider.live ?") && checkoutRoute.includes("LIVE"),
);
check(
  "the log never prints the key itself",
  !checkoutRoute.includes("CHAPA_SECRET_KEY") &&
    !/secret/i.test(checkoutRoute.slice(checkoutRoute.indexOf("CHECKOUT FAILED"))),
);
check(
  "development gets the provider's own complaint",
  /NODE_ENV !== "production"[\s\S]{0,200}?Payment initialization failed/.test(
    checkoutRoute,
  ),
);
check(
  "production does not",
  checkoutRoute.includes("We couldn't start the payment. Please try again."),
);
check(
  "the failure is still recorded on the payment row",
  checkoutRoute.includes("failure_reason"),
);
check(
  "a missing key is named in development",
  /misconfigured[\s\S]{0,400}?NODE_ENV !== "production"/.test(checkoutRoute),
);
check(
  "the retry is signalled to the client",
  checkoutRoute.includes("retryable: true"),
);

const purchase = code("src/components/billing/purchase-button.tsx");
check(
  "the button offers a retry after a failure",
  purchase.includes('"Try again"'),
);
check(
  "and the client does not invent its own error text over the server's",
  purchase.includes("payload.error ??"),
);

const fulfilmentChecks = fulfilment;
check(
  "fulfilment compares the reference Chapa answered about",
  fulfilmentChecks.includes("verified.reference !== reference"),
);
check(
  "a mismatch is flagged for review rather than silently granted",
  fulfilmentChecks.includes("REVIEW") &&
    fulfilmentChecks.indexOf("problems.length > 0") <
      fulfilmentChecks.indexOf('rpc("fulfil_payment"'),
);

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
}

console.log(
  `\n${failures.length === 0 ? GREEN : RED}${passed} passed, ${failures.length} failed${RESET}` +
    `\n${DIM}billing: signatures, status mapping, idempotency, and what never leaves the server${RESET}\n`,
);

process.exit(failures.length === 0 ? 0 : 1);
