import "server-only";

import {
  CHAPA_API,
  chapaKeyProblem,
  chapaMode,
  chapaSignatureHeader,
  chapaSignatureValid,
  flattenChapaMessage,
  initializeBody,
  mapChapaStatus,
  readChapaEvent,
} from "./chapa-protocol";
import {
  PaymentProviderError,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentProvider,
  type VerifiedPayment,
  type WebhookEvent,
  type WebhookRejection,
} from "./provider";

/**
 * Chapa.
 *
 * The payment processor most Ethiopian businesses actually use: telebirr, CBE
 * Birr, Awash, Amole, and cards, behind one hosted checkout. Members pay in ETB
 * with the wallet they already have, which is the whole reason to use it rather
 * than a card processor most of the country cannot pay with.
 *
 * ## Where the secret lives
 *
 * `CHAPA_SECRET_KEY`, read here and nowhere else. It is never sent to the
 * browser, never put in a `NEXT_PUBLIC_` variable, and never written into a
 * response — the browser gets a checkout URL, which is a public URL that
 * happens to be long. This file is `server-only`, so an accidental import from
 * a client component fails the build rather than shipping the key.
 *
 * The protocol details live next door in `chapa-protocol.ts`, which has no
 * secrets and no server guard so that the check script can attack them. What is
 * left here is the part that needs a key and a network.
 */

/** Long enough for a slow bank, short enough that a route does not hang. */
const TIMEOUT_MS = 20_000;

export class ChapaProvider implements PaymentProvider {
  readonly name = "chapa";

  private get secret(): string {
    return process.env.CHAPA_SECRET_KEY?.trim() ?? "";
  }

  /**
   * The webhook secret, which is not the API key.
   *
   * Chapa lets you set a separate "secret hash" for webhooks. Where one is not
   * set, deployments commonly reuse the API key, so that is the fallback — but
   * the two are kept distinct here because rotating a webhook secret should not
   * mean rotating the key that takes money.
   */
  private get webhookSecret(): string {
    return (
      process.env.CHAPA_WEBHOOK_SECRET?.trim() ||
      process.env.CHAPA_SECRET_KEY?.trim() ||
      ""
    );
  }

  get live(): boolean {
    return chapaMode(this.secret) === "live";
  }

  configurationError(): string | null {
    return chapaKeyProblem(this.secret);
  }

  async checkout(request: CheckoutRequest): Promise<CheckoutSession> {
    const payload = await this.call(
      "POST",
      "/transaction/initialize",
      initializeBody(request),
    );
    const data = asRecord(payload.data);
    const url = typeof data.checkout_url === "string" ? data.checkout_url : null;

    if (!url) {
      throw new PaymentProviderError(
        `initialize returned no checkout_url: ${JSON.stringify(payload).slice(0, 400)}`,
        this.name,
        {
          status: 200,
          detail:
            "Chapa accepted the request but returned no checkout URL. This usually means the key is for a different account than the one the transaction was created under.",
          body: JSON.stringify(payload).slice(0, 1000),
        },
      );
    }

    return {
      checkoutUrl: url,
      providerTransactionId:
        typeof data.reference === "string" ? data.reference : null,
    };
  }

  /**
   * Asks Chapa what really happened.
   *
   * This is the only statement about a payment that this system acts on. It is
   * called from the webhook before anything is granted and from the return page
   * before anything is shown, and in both places the answer replaces whatever
   * the caller thought.
   */
  async verify(reference: string): Promise<VerifiedPayment> {
    const payload = await this.call(
      "GET",
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    const data = asRecord(payload.data);

    const amount = Number(data.amount);

    return {
      status: mapChapaStatus(data.status ?? payload.status),
      amount: Number.isFinite(amount) ? amount : null,
      currency: typeof data.currency === "string" ? data.currency : null,
      reference:
        typeof data.tx_ref === "string" && data.tx_ref ? data.tx_ref : reference,
      providerTransactionId:
        typeof data.reference === "string" ? data.reference : null,
      raw: payload,
    };
  }

  parseWebhook(
    rawBody: string,
    headers: Headers,
  ): WebhookEvent | WebhookRejection {
    const event = readChapaEvent(rawBody);
    if ("error" in event) return event;

    return {
      eventReference: event.eventReference,
      eventType: event.eventType,
      reference: event.reference,
      signaturePresent: chapaSignatureHeader(headers) !== null,
      signatureValid: chapaSignatureValid(rawBody, headers, this.webhookSecret),
      payload: event.payload,
    };
  }

  /** One place for the key, the timeout, and the shape of Chapa's envelope. */
  private async call(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const problem = this.configurationError();
    if (problem) throw new PaymentProviderError(problem, this.name);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${CHAPA_API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.secret}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      throw new PaymentProviderError(
        timedOut
          ? `Chapa did not answer within ${TIMEOUT_MS / 1000}s`
          : `Chapa was unreachable: ${String(error)}`,
        this.name,
        {
          status: 0,
          unreachable: true,
          detail: timedOut
            ? `api.chapa.co did not answer within ${TIMEOUT_MS / 1000} seconds.`
            : `api.chapa.co could not be reached from this server. Check the network, a proxy, or a firewall. (${String(error).slice(0, 200)})`,
        },
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let payload: Record<string, unknown>;
    try {
      payload = asRecord(JSON.parse(text));
    } catch {
      // Almost always an HTML error page from something in front of Chapa — a
      // proxy, a captive portal, a DNS hijack. Saying so is more use than
      // "invalid JSON", so the first part of the body goes in the detail.
      throw new PaymentProviderError(
        `Chapa ${method} ${path} → ${response.status}, body was not JSON`,
        this.name,
        {
          status: response.status,
          detail: `Chapa answered ${response.status} with something that was not JSON. A proxy or firewall is probably answering instead of Chapa.`,
          body: text.slice(0, 1000),
        },
      );
    }

    // Chapa answers 200 with `status: "failed"` for business failures, so the
    // HTTP code alone is not the answer. Verify is the exception: a transaction
    // that failed is a legitimate answer to "what happened", not an error, and
    // the caller needs the payload to record why.
    const ok =
      response.ok &&
      (payload.status === "success" || path.startsWith("/transaction/verify"));

    if (!ok) {
      const detail = flattenChapaMessage(payload) || text.slice(0, 300);
      throw new PaymentProviderError(
        `Chapa ${method} ${path} → ${response.status}: ${detail}`,
        this.name,
        { status: response.status, detail, body: text.slice(0, 1000) },
      );
    }

    return payload;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}
