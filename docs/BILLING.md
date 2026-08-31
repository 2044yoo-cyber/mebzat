# Billing — plans, credits and payments

Everything that decides what a member may run, what it costs them, and how
money becomes credits.

## The one rule

**No client can create a credit.** Not through a policy that checks the user
id, not through a trigger, not at all. `credit_wallets`, `credit_ledger`,
`credit_reservations`, `payments` and `payment_events` have row-level security
on with **no write policy**, so a balance changes only through the
security-definer functions in `0038`, and credits are only ever *created* by
`credits_grant()`, which is revoked from `anon` and `authenticated` entirely.

Everything else in this document follows from that.

## Where things live

| Layer | File |
| --- | --- |
| Plans, prices, wallet, ledger, reservations | `supabase/migrations/0037_plans_credits.sql` |
| Reserve / commit / refund / grant / expire | `supabase/migrations/0038_credit_functions.sql` |
| Products, payments, webhook log, subscriptions, fulfilment | `supabase/migrations/0039_payments.sql` |
| The server-side gate | `src/lib/billing/gate.ts` |
| Operation names (no prices) | `src/lib/billing/operations.ts` |
| Provider interface | `src/lib/billing/payments/provider.ts` |
| Chapa, protocol only | `src/lib/billing/payments/chapa-protocol.ts` |
| Chapa, keys and network | `src/lib/billing/payments/chapa.ts` |
| Verify-then-grant | `src/lib/billing/fulfilment.ts` |
| Checkout | `src/app/api/billing/checkout/route.ts` |
| Webhook | `src/app/api/billing/webhook/[provider]/route.ts` |
| Account → Billing | `src/app/(dashboard)/billing/page.tsx` |

Attacked by `supabase/tests/credits.sql` (32 checks, needs a database) and
`npm run check:billing` (109 checks, needs nothing).

## Running something on credit

```ts
const gated = await withCredits<NextResponse>(
  AI_OPERATIONS.designImage,
  { client: supabase, description: "Image to 3D" },
  async () => {
    const result = await doTheExpensiveThing();
    if ("error" in result) {
      return { charge: false as const, reason: "the model failed", value: … };
    }
    return { charge: true as const, value: … };
  },
);

if (!gated.ok) {
  return NextResponse.json({ error: gated.error }, { status: gated.status });
}
return gated.value;
```

The order inside the gate is fixed: **authenticate → plan → permission →
credits → work.** Anything that runs before the credits are held can be had for
free by disconnecting; any check made after the provider call is a check that
has already cost money.

Credits are *reserved* before the work and settled after, because deducting
afterwards means a member with 40 credits can start three 40-credit operations
in the time the first takes to answer. A crash between reserve and settle leaves
a hold, and `credits_expire_stale()` returns anything open for two hours.

Adding an operation is two steps: a name in `AI_OPERATIONS`, and a row in
`ai_operation_costs`. There is no third step, and there is no number anywhere in
the frontend — `npm run check:billing` fails if a name has no row, and fails if
a credit cost appears in the gate or the catalogue.

## Taking money

1. The browser posts **one product id** to `/api/billing/checkout`. Not an
   amount, not a plan, not a credit count.
2. The route reads the price from `billing_products`, writes a `pending`
   payment with the price copied onto it, and asks the provider for a checkout
   URL.
3. The member pays on the provider's page.
4. The provider posts to `/api/billing/webhook/chapa`. The route reads the raw
   body, checks the HMAC signature, inserts into `payment_events` — where a
   unique constraint on `(provider, event_reference)` makes a retry harmless —
   and only then asks the provider, over its API, whether the transaction
   really succeeded.
5. `fulfil_payment()` grants the credits and the plan. It is idempotent on
   `fulfilled_at`, so the webhook and the return page racing each other is fine.

The return page (`/billing/return`) runs step 4–5 as well. It is the backstop
for a webhook that never arrives — blocked by a firewall, wrong secret, local
machine — and it is safe because it takes nothing from the browser but a lookup
key.

### Callback and webhook are the same endpoint

Chapa posts to that URL two different ways, and they are **not** signed the
same:

- the **`callback_url`** given at checkout — posted after a payment,
  **unsigned**;
- the **dashboard webhook** — posted for account events, **signed** with the
  Secret Hash.

So the rule is *a signature that is present must verify*, not *a signature must
exist*. Demanding one on both answered every callback with a 401 and threw the
payment away.

Accepting an unsigned delivery is safe here, and only here, because nothing
downstream believes it. The reference selects a payment row we created, and the
outcome comes from asking Chapa directly. A forged POST can at most make us
re-verify one of our own payments, which returns whatever the truth is.

### Status codes on the webhook

The code answers one question: *would another delivery help?*

| Situation | Code |
| --- | --- |
| Signature present and wrong | 401 — a retry would be identical |
| Signature absent (Chapa callback) | accepted, logged, verified |
| Body unparseable, or no reference | 200 — a retry would be identical |
| Event already recorded (23505) | 200 — already handled |
| Event **could not** be recorded | 503 — please retry |
| Verified and settled | 200 |

That last-but-one row is the one worth remembering. Answering 200 to a failed
insert tells the provider to stop retrying, and a database blip silently loses
somebody their plan.

## When checkout fails

```powershell
npm run check:chapa
```

Initializes a real 1 ETB transaction and prints the whole exchange — HTTP
status, body, and a reading of what it means. It pays nothing and writes nothing
to the database. The key is never printed, only its prefix, length and mode.

If checkout fails in the app, the server console carries a block naming the
user, product, amount, `tx_ref`, both URLs, the HTTP status and Chapa's own
complaint. In development that complaint also goes back to the browser as
`Payment initialization failed: …`; in production the member sees *"We couldn't
start the payment. Please try again."* and the button becomes **Try again**,
which starts a fresh transaction with a fresh reference.

### Things Chapa refuses

| Complaint | Cause |
| --- | --- |
| `first_name`/`last_name` format | A name with digits or `@`. A profile with no name used to fall back to the email address; names are now stripped to letters, spaces, hyphens and apostrophes before being sent. |
| 401 on any call | Public key (`CHAPUBK…`) instead of the secret key, or a rotated key. |
| Not JSON | A proxy or firewall answering instead of `api.chapa.co`. |
| `tx_ref` already used | Never happens here — every attempt mints a new one. |

### Localhost

Chapa cannot post a callback to `localhost`, so on a local origin no
`callback_url` is sent at all and the return page does the verifying. Payments
still activate; they activate when the member comes back rather than when Chapa
calls. For real webhook testing, expose the app through a tunnel and set
`NEXT_PUBLIC_SITE_URL` to that public address.

## Environment

```bash
PAYMENT_PROVIDER=chapa
CHAPA_SECRET_KEY=          # CHASECK_TEST-… is test money, CHASECK-… is real
CHAPA_WEBHOOK_SECRET=      # Chapa dashboard → Webhooks → Secret Hash
```

Point Chapa's webhook at `<NEXT_PUBLIC_SITE_URL>/api/billing/webhook/chapa`.

The secret key is read in exactly one file, and that file is `server-only`;
`check:billing` fails if either stops being true, if a client component so much
as mentions it, or if any Chapa value appears under a `NEXT_PUBLIC_` name.

Without a key, checkout answers 503 with a message telling the operator which
variable to set. Nothing crashes and no member is shown a payment page that
cannot complete.

## Adding a provider

Implement `PaymentProvider` in `src/lib/billing/payments/`, add a case to
`paymentService()`. The routes do not change — `payments.provider` records who
took the money, which is what a refund six months later needs to know.
