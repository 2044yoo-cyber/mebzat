import { createHmac, timingSafeEqual } from "node:crypto";

import type { CheckoutRequest } from "./provider";

/**
 * Chapa's wire protocol, as pure functions.
 *
 * Split out of `chapa.ts` and deliberately without a `server-only` guard, for
 * the same reason `vision-models.ts` has none: the check script imports this
 * under plain Node to attack it, and a `server-only` import cannot resolve
 * there. Nothing secret lives in this file — every function that needs the
 * secret takes it as an argument, and the only place that reads
 * `process.env.CHAPA_SECRET_KEY` is `chapa.ts`, which *is* server-only.
 *
 * The split is worth having on its own merits. Signature verification and
 * status mapping are the two pieces of this integration where being wrong is
 * expensive — one lets a stranger grant themselves a plan, the other decides
 * whether money arrived — and both are now reachable by a test without a
 * network, a key, or a running Chapa.
 */

export const CHAPA_API = "https://api.chapa.co/v1";

/** Chapa truncates the title on its own page; better to do it deliberately. */
export const TITLE_LIMIT = 16;
export const DESCRIPTION_LIMIT = 100;

/**
 * What kind of key this is.
 *
 * Read off the key rather than from a separate setting, because a separate
 * setting can disagree with the key it describes and the disagreement is
 * silent. A test key in production should be obvious, not discovered.
 */
export function chapaMode(secret: string): "live" | "test" | "unset" {
  const key = secret.trim();
  if (!key) return "unset";
  return key.includes("TEST") ? "test" : "live";
}

/** A sentence naming what is wrong with the key, or null. */
export function chapaKeyProblem(secret: string): string | null {
  const key = secret.trim();
  if (!key) {
    return "Payments are not configured on this deployment. Set CHAPA_SECRET_KEY.";
  }
  if (!key.startsWith("CHASECK")) {
    // Worth naming, because the usual mistake is pasting the public key.
    return "CHAPA_SECRET_KEY does not look like a Chapa secret key — it should begin with CHASECK.";
  }
  return null;
}

/**
 * A name Chapa will accept.
 *
 * Chapa validates `first_name` and `last_name`, and rejects the request when
 * they carry an `@`, digits, or punctuation. That matters because the checkout
 * falls back to the email address when a profile has no name on it — which sent
 * `first_name: "2044yoo@gmail.com"` and got the whole initialize call refused,
 * with the refusal surfacing as "The payment page could not be opened".
 *
 * An email is reduced to its local part before the letters are taken, so
 * `2044yoo@gmail.com` becomes "yoo" rather than "yoogmailcom".
 */
export function chapaName(value: string, fallback: string): string {
  const local = value.includes("@") ? value.slice(0, value.indexOf("@")) : value;
  const letters = local
    .replace(/[^\p{L}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (letters || fallback).slice(0, 50);
}

/** Splits whatever the profile has into the two names Chapa asks for. */
export function splitName(value: string): [string, string] {
  const cleaned = chapaName(value, "");
  const parts = cleaned.split(" ").filter(Boolean);

  return [
    chapaName(parts[0] ?? "", "Medosha"),
    chapaName(parts.slice(1).join(" "), "Member"),
  ];
}

/**
 * Whether a URL is somewhere Chapa's servers could actually post.
 *
 * A `callback_url` of `http://localhost:3000/...` is not a webhook endpoint —
 * it is Chapa's own loopback address, and nothing will ever arrive. Worse, it
 * is the kind of value their validator is entitled to reject outright, taking
 * the whole checkout down on a developer machine.
 *
 * So on a local origin the callback is left off entirely and the return page
 * does the verifying instead. That path was always the backstop; on localhost
 * it is the only path.
 */
export function isPubliclyReachable(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }

  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host === "::1" || host === "[::1]" || host === "0.0.0.0") return false;
  if (/^127\./.test(host)) return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;

  // A bare hostname with no dot is not resolvable from outside this machine.
  return host.includes(".");
}

/**
 * The body Chapa's initialize endpoint expects.
 *
 * `customization` is sent as the two flat bracketed keys Chapa's own
 * documentation shows — `customization[title]`, `customization[description]` —
 * rather than as a nested object. Their validator reads the bracketed form, and
 * a nested object is silently ignored, so the title and description simply
 * never appeared on the payment page.
 */
export function initializeBody(request: CheckoutRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    // Chapa wants the amount as a string, and rejects more than two decimals.
    amount: request.amount.toFixed(2),
    currency: request.currency,
    email: request.email,
    first_name: chapaName(request.firstName, "Medosha"),
    last_name: chapaName(request.lastName, "Member"),
    tx_ref: request.reference,
    return_url: request.returnUrl,
    "customization[title]": request.title.slice(0, TITLE_LIMIT),
    "customization[description]": request.description.slice(0, DESCRIPTION_LIMIT),
  };

  if (request.phone) body.phone_number = request.phone;
  if (request.callbackUrl) body.callback_url = request.callbackUrl;

  return body;
}

/**
 * Chapa's `message`, which is not always a message.
 *
 * On a validation failure it is an object of field names to arrays of
 * complaints — `{"amount": ["The amount must be at least 1."]}` — and reading
 * it as a string produced "[object Object]" in the log, which is how a
 * perfectly explicit error from Chapa became no information at all.
 */
export function flattenChapaMessage(payload: Record<string, unknown>): string {
  const message = payload.message;

  if (typeof message === "string" && message) return message;

  if (message && typeof message === "object") {
    const lines: string[] = [];
    for (const [field, complaint] of Object.entries(
      message as Record<string, unknown>,
    )) {
      const text = Array.isArray(complaint)
        ? complaint.join(" ")
        : String(complaint);
      lines.push(`${field}: ${text}`);
    }
    if (lines.length > 0) return lines.join("; ");
  }

  return "";
}

/**
 * Chapa's vocabulary, narrowed to three outcomes.
 *
 * Anything unrecognised is `pending`, never `succeeded`. An unknown status is
 * not evidence that money arrived, and treating it as failure would strand a
 * payment that is merely in a state this code has not seen — pending is the
 * only reading that is safe in both directions.
 */
export function mapChapaStatus(
  value: unknown,
): "succeeded" | "pending" | "failed" {
  const status = typeof value === "string" ? value.toLowerCase().trim() : "";
  if (status === "success" || status === "successful") return "succeeded";
  if (status === "failed" || status === "cancelled" || status === "canceled") {
    return "failed";
  }
  return "pending";
}

export type ParsedEvent = {
  eventReference: string;
  eventType: string;
  reference: string;
  /** The parsed body, carried out so the caller does not parse it twice. */
  payload: unknown;
};

/**
 * Reads a delivery without believing it.
 *
 * The event reference is the transaction reference plus the event type, not a
 * per-delivery id. Chapa does not send one, and it does not matter: two
 * deliveries of the same transaction at the same stage are exactly what the
 * idempotency is for, and collapsing them onto one row is the desired behaviour
 * rather than a limitation.
 */
export function readChapaEvent(rawBody: string): ParsedEvent | { error: string } {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { error: "The webhook body was not JSON." };
  }

  const record =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : {};

  const reference =
    typeof record.tx_ref === "string" && record.tx_ref
      ? record.tx_ref
      : typeof record.trx_ref === "string" && record.trx_ref
        ? record.trx_ref
        : null;

  if (!reference) {
    return { error: "The webhook carried no transaction reference." };
  }

  const eventType =
    typeof record.event === "string" && record.event
      ? record.event
      : typeof record.status === "string" && record.status
        ? `status.${record.status}`
        : "unknown";

  return {
    eventReference: `${reference}:${eventType}`,
    eventType,
    reference,
    payload,
  };
}

/**
 * Whether this delivery really came from Chapa.
 *
 * Chapa signs with HMAC-SHA256 and sends two headers: `x-chapa-signature` over
 * the request body, and `Chapa-Signature` over the secret itself. Either
 * matching is accepted, because which one arrives has varied between Chapa's
 * own dashboard versions and rejecting a genuine event costs a member their
 * purchase.
 *
 * No secret means no valid signature. That is the important direction to fail
 * in: a deployment that forgot to set the webhook secret should reject
 * everything and say so in the log, rather than accept everything and grant
 * plans to whoever finds the URL.
 */
export function chapaSignatureHeader(headers: Headers): string | null {
  const sent =
    headers.get("x-chapa-signature") ?? headers.get("chapa-signature");
  return sent && sent.trim() ? sent.trim() : null;
}

export function chapaSignatureValid(
  rawBody: string,
  headers: Headers,
  secret: string,
): boolean {
  if (!secret) return false;

  const sent = chapaSignatureHeader(headers);
  if (!sent) return false;

  const overBody = createHmac("sha256", secret).update(rawBody).digest("hex");
  const overSecret = createHmac("sha256", secret).update(secret).digest("hex");

  return constantTimeEquals(sent, overBody) || constantTimeEquals(sent, overSecret);
}

/** Constant time, so a wrong signature cannot be found one character at a time. */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
