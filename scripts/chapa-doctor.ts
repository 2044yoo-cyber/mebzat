/**
 * Chapa, end to end, from the command line.
 *
 *   npm run check:chapa
 *
 * When checkout fails, the question is always "what did Chapa actually say",
 * and the answer has historically been buried in a server log nobody was
 * watching. This asks Chapa directly with the configured key and prints the
 * whole exchange: the HTTP status, the body, and a reading of what it means.
 *
 * It initializes a real transaction for 1 ETB and does **not** pay it. Nothing
 * is charged, nothing is written to the Medosha database, and the reference is
 * marked so it is recognisable in the Chapa dashboard. On a test key this is
 * free; on a live key it creates an unpaid transaction, which is harmless but
 * worth knowing, so the script says which mode it is in before it starts.
 *
 * The key is never printed. Only its prefix, its length, and its mode.
 */

import {
  CHAPA_API,
  chapaKeyProblem,
  chapaMode,
  flattenChapaMessage,
  initializeBody,
  isPubliclyReachable,
  splitName,
} from "../src/lib/billing/payments/chapa-protocol.ts";

const GREEN = "[32m";
const RED = "[31m";
const YELLOW = "[33m";
const DIM = "[2m";
const BOLD = "[1m";
const RESET = "[0m";

const ok = (text: string) => console.log(`${GREEN}  ✓${RESET} ${text}`);
const bad = (text: string) => console.log(`${RED}  ✗${RESET} ${text}`);
const warn = (text: string) => console.log(`${YELLOW}  !${RESET} ${text}`);
const note = (text: string) => console.log(`${DIM}    ${text}${RESET}`);

/**
 * Wrapped in a function rather than run at the top level, because top-level
 * await needs an ES module and this runs through tsx's CommonJS transform.
 * `process.exit` inside it does what it says.
 */
async function main(): Promise<void> {
  console.log(`\n${BOLD}Chapa doctor${RESET}\n`);

  // ---------------------------------------------------------------------------
  // The key
  // ---------------------------------------------------------------------------

  const secret = process.env.CHAPA_SECRET_KEY?.trim() ?? "";
  const problem = chapaKeyProblem(secret);

  if (problem) {
    bad(problem);
    if (!secret) {
      console.log(`
  ${RED}${BOLD}CHAPA SECRET KEY IS MISSING${RESET}

  Put it in ${BOLD}.env.local${RESET} at the project root:

      CHAPA_SECRET_KEY=CHASECK_TEST-xxxxxxxxxxxxxxxx
      CHAPA_WEBHOOK_SECRET=<Secret Hash from the Chapa dashboard>

  Get the key from the Chapa dashboard under Settings → API. Use the
  ${BOLD}secret${RESET} key (CHASECK…), not the public key (CHAPUBK…).

  Then run this again. If you ran it with plain \`npx tsx\`, use
  ${BOLD}npm run check:chapa${RESET} instead — that loads .env.local.
  `);
    }
    process.exit(1);
  }

  const mode = chapaMode(secret);
  ok(`Key present — ${secret.slice(0, 12)}…, ${secret.length} characters`);

  if (mode === "live") {
    warn("This is a LIVE key. Real transactions, real money.");
    note("A test key begins CHASECK_TEST-.");
  } else {
    ok("Test mode. Nothing here can charge anybody.");
  }

  const webhookSecret = process.env.CHAPA_WEBHOOK_SECRET?.trim() ?? "";
  if (webhookSecret) {
    ok(`Webhook secret set — ${webhookSecret.length} characters`);
  } else {
    warn("CHAPA_WEBHOOK_SECRET is not set; the API key will be used instead.");
    note("Set it to the Secret Hash from Chapa → Settings → Webhooks.");
  }

  // ---------------------------------------------------------------------------
  // The URLs
  // ---------------------------------------------------------------------------

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const reachable = isPubliclyReachable(base);

  console.log(`\n${BOLD}URLs${RESET}\n`);
  ok(`Site URL — ${base}`);

  if (reachable) {
    ok(`Webhook — ${base}/api/billing/webhook/chapa`);
    note("Set this as the webhook URL in the Chapa dashboard.");
  } else {
    warn(`${base} is not reachable from the internet.`);
    note("No callback_url will be sent, and Chapa's webhook cannot arrive.");
    note("Payments will still activate — the return page verifies them.");
    note("For real webhook testing, expose the app (a tunnel) and set");
    note("NEXT_PUBLIC_SITE_URL to that public address.");
  }

  // ---------------------------------------------------------------------------
  // The call
  // ---------------------------------------------------------------------------

  const reference = `medosha-doctor-${Date.now().toString(36)}`;
  const [firstName, lastName] = splitName(
    process.env.CHAPA_TEST_NAME ?? "Medosha Doctor",
  );

  const body = initializeBody({
    reference,
    amount: 1,
    currency: "ETB",
    email: process.env.CHAPA_TEST_EMAIL ?? "doctor@medosha.net",
    firstName,
    lastName,
    phone: null,
    title: "Medosha",
    description: "Checkout diagnostic",
    returnUrl: `${base}/billing/return?ref=${reference}`,
    callbackUrl: reachable ? `${base}/api/billing/webhook/chapa` : null,
  });

  console.log(`\n${BOLD}Initializing a 1 ETB transaction${RESET}\n`);
  note(`tx_ref  ${reference}`);
  note(`body    ${JSON.stringify(body)}`);

  let response: Response;
  try {
    response = await fetch(`${CHAPA_API}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    bad(`api.chapa.co could not be reached: ${String(error)}`);
    console.log(`
  ${YELLOW}What this means${RESET}

  The request never got to Chapa. Check, in this order:

    1. Internet access from this machine.
    2. A corporate proxy or firewall blocking api.chapa.co.
    3. Antivirus doing TLS interception.

  Try:  curl -sS https://api.chapa.co/v1/transaction/verify/test
  `);
    process.exit(1);
  }

  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    bad(`Chapa answered ${response.status} with something that was not JSON.`);
    note(text.slice(0, 500));
    note("Something in front of Chapa is answering — a proxy or captive portal.");
    process.exit(1);
  }

  console.log("");
  note(`HTTP ${response.status}`);
  note(`body ${JSON.stringify(payload).slice(0, 800)}`);
  console.log("");

  const data = (payload.data ?? {}) as Record<string, unknown>;
  const checkoutUrl = typeof data.checkout_url === "string" ? data.checkout_url : null;

  if (!response.ok || payload.status !== "success" || !checkoutUrl) {
    const detail = flattenChapaMessage(payload) || text.slice(0, 300);
    bad(`Chapa refused the request: ${detail}`);
    console.log(`\n${YELLOW}What this means${RESET}\n`);

    // The refusals worth naming, because each has a different fix and the raw
    // message does not always make the fix obvious.
    if (response.status === 401) {
      console.log(`  The key was rejected. Either it is for a different
    environment than you think, it has been rotated in the dashboard,
    or it is the public key rather than the secret key.`);
    } else if (/first_name|last_name/i.test(detail)) {
      console.log(`  Chapa rejected the customer name. It accepts letters,
    spaces, hyphens and apostrophes — not digits, not "@".
    Medosha now strips these before sending, so if you are seeing
    this the profile name contains something unusual.`);
    } else if (/email/i.test(detail)) {
      console.log(`  Chapa rejected the email address. The signed-in member's
    profile needs a valid one before they can pay.`);
    } else if (/amount/i.test(detail)) {
      console.log(`  Chapa rejected the amount. It must be at least 1 and is
    sent as a string with two decimals.`);
    } else if (/callback|return|url/i.test(detail)) {
      console.log(`  Chapa rejected one of the URLs. Set NEXT_PUBLIC_SITE_URL to
    a real https address; localhost is not acceptable to Chapa as a
    callback, which is why Medosha omits it on a local origin.`);
    } else if (/tx_ref|reference/i.test(detail)) {
      console.log(`  Chapa rejected the reference — most likely it has been used
    before. Every attempt must generate a new one; Medosha does.`);
    } else {
      console.log(`  Read the message above — it names the field Chapa objected to.`);
    }

    console.log("");
    process.exit(1);
  }

  ok("Chapa accepted the transaction.");
  note(`checkout ${checkoutUrl}`);

  // ---------------------------------------------------------------------------
  // Verify the transaction we just created
  // ---------------------------------------------------------------------------

  console.log(`\n${BOLD}Verifying it${RESET}\n`);

  const verifyResponse = await fetch(
    `${CHAPA_API}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  const verifyText = await verifyResponse.text();
  note(`HTTP ${verifyResponse.status}`);
  note(`body ${verifyText.slice(0, 500)}`);

  // An unpaid transaction is *supposed* to verify as not-successful. That it
  // answers at all is what this proves — the verify endpoint and the key work,
  // which is the half of the flow that decides whether anybody gets a plan.
  if (verifyResponse.status === 200 || verifyResponse.status === 404) {
    ok("The verify endpoint answers. Nobody paid this one, so it is not successful — that is correct.");
  } else {
    warn(`Verify answered ${verifyResponse.status}, which is unusual.`);
  }

  console.log(`
  ${GREEN}${BOLD}Chapa is working.${RESET}

  Open the checkout URL above to try a payment by hand:

    ${checkoutUrl}

  ${DIM}On a test key, Chapa's test card and test telebirr numbers are on the
  payment page itself. After paying, open /billing — the return page
  verifies the transaction and the plan activates there.${RESET}
  `);
}

void main();
