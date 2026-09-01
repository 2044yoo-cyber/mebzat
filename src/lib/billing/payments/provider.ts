import "server-only";

/**
 * What a payment provider has to be able to do, and nothing more.
 *
 * Three things: start a checkout, tell us the truth about a transaction when
 * asked, and hand us a webhook we can identify. Everything else — what a plan
 * costs, what it grants, whether it has already been granted — is Medosha's
 * business and stays in the database.
 *
 * The interface exists because Chapa is the right provider for Ethiopia today
 * and may not be the only one tomorrow. Telebirr, a bank transfer flow, or
 * Stripe for foreign cards would each be a file next to `chapa.ts` and a line
 * in `service.ts`, with no change to the routes.
 *
 * ## The rule the shape enforces
 *
 * There is no method that means "the browser says it worked". `verify` takes a
 * reference and asks the provider, over the provider's own API, with our secret
 * key. That is the only source of truth about money in this system. A return
 * URL is a navigation, and a navigation can be typed into the address bar.
 */

/** What the checkout route asks for. Priced server-side, always. */
export type CheckoutRequest = {
  /** Our reference. Unique per provider — it is what makes replay harmless. */
  reference: string;
  amount: number;
  currency: string;

  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;

  /** Shown on the provider's page. Some providers cap these hard. */
  title: string;
  description: string;

  /** Where the member lands afterwards. Not trusted for anything. */
  returnUrl: string;
  /**
   * Where the provider posts the event, or null when there is nowhere to post.
   *
   * Null on a local origin. A callback pointing at `localhost` is the
   * provider's own loopback, so nothing arrives however well it is handled —
   * and sending one risks the provider rejecting the whole initialize call.
   */
  callbackUrl: string | null;
};

export type CheckoutSession = {
  /** Send the browser here. */
  checkoutUrl: string;
  providerTransactionId?: string | null;
};

/**
 * The provider's answer about one transaction.
 *
 * `status` is narrowed to three values on purpose. Providers have a dozen
 * internal states and mapping them here means the fulfilment code cannot
 * accidentally treat a novel string as success.
 */
export type VerifiedPayment = {
  status: "succeeded" | "pending" | "failed";
  /** What was actually paid, for comparison against what was charged. */
  amount: number | null;
  currency: string | null;
  reference: string;
  providerTransactionId: string | null;
  /** Kept for the audit trail. Never parsed for meaning outside the provider. */
  raw: unknown;
};

/** A webhook, identified but not believed. */
export type WebhookEvent = {
  /** Unique per provider event. The idempotency key. */
  eventReference: string;
  eventType: string;
  /** Our reference, so we can find the payment. */
  reference: string | null;
  /**
   * Whether a signature header arrived at all.
   *
   * Not the same question as whether it verified, and the difference decides
   * what the handler does. Chapa posts to `callback_url` **unsigned** and to
   * the dashboard webhook **signed**; treating both as "must be signed" meant
   * every callback was answered 401 and thrown away.
   */
  signaturePresent: boolean;

  /**
   * Whether that signature checked out.
   *
   * False with `signaturePresent` true means somebody sent a signature that is
   * wrong — either a forgery or a rotated secret — and the delivery is refused.
   * False with `signaturePresent` false is an ordinary Chapa callback.
   */
  signatureValid: boolean;
  payload: unknown;
};

export type WebhookRejection = { error: string };

export interface PaymentProvider {
  /** Stored on the payment row, so a refund knows who to ask. */
  readonly name: string;

  /**
   * Whether this is real money.
   *
   * Derived from the key, not from a separate flag, because a separate flag can
   * disagree with the key and the disagreement is silent. The billing page says
   * which it is; a test key in production should be obvious, not discovered.
   */
  readonly live: boolean;

  /**
   * A sentence naming the missing environment variable, or null.
   *
   * Never a crash and never a generic failure. Somebody standing in front of a
   * deployment that cannot take payments needs to be told which variable to
   * set, and no member should ever see a checkout that cannot complete.
   */
  configurationError(): string | null;

  checkout(request: CheckoutRequest): Promise<CheckoutSession>;
  verify(reference: string): Promise<VerifiedPayment>;
  parseWebhook(
    rawBody: string,
    headers: Headers,
  ): WebhookEvent | WebhookRejection;
}

/**
 * The provider said no, and here is exactly what it said.
 *
 * The structure is the point. The first version of this carried only a
 * `message` string, which the checkout route logged as one line and replaced
 * with "The payment page could not be opened" — so a perfectly explicit
 * complaint from Chapa about, say, a malformed name became no information at
 * all, on the server as well as in the browser.
 *
 * `detail` is the one field safe to show a developer: it is the provider's own
 * description of what was wrong with *our request*, never a key and never a
 * stack. `body` is the raw response and stays server-side.
 */
export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly info: {
      /** HTTP status, or 0 when the request never completed. */
      status?: number;
      /** The provider's complaint, flattened. Safe for a developer to read. */
      detail?: string;
      /** The raw response body, truncated. Server-side only. */
      body?: string;
      /** True when the request never reached the provider at all. */
      unreachable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
