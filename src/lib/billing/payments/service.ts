import "server-only";

import { ChapaProvider } from "./chapa";
import type { PaymentProvider } from "./provider";

/**
 * Which provider takes the money.
 *
 * One provider today. The indirection is here so that adding a second one is a
 * case in a switch rather than a search through the routes for the word
 * "chapa" — and so that `payments.provider` on the row means something, because
 * a refund six months from now has to know who to ask.
 *
 * `PAYMENT_PROVIDER` selects it, the same way `AI_PROVIDER` selects the model
 * provider elsewhere in this codebase. An unknown value falls back to Chapa
 * with a warning rather than throwing: a typo in an environment variable should
 * not take checkout down.
 */

let cached: PaymentProvider | null = null;

export function paymentService(): PaymentProvider {
  if (cached) return cached;

  const requested = (process.env.PAYMENT_PROVIDER ?? "chapa").trim().toLowerCase();

  switch (requested) {
    case "":
    case "chapa":
      cached = new ChapaProvider();
      break;
    default:
      console.warn(
        `[billing] PAYMENT_PROVIDER="${requested}" is not a provider this build knows. Using Chapa.`,
      );
      cached = new ChapaProvider();
  }

  return cached;
}

/** Test seam. The cache is a module-level singleton and tests need it gone. */
export function resetPaymentService(): void {
  cached = null;
}

export type { PaymentProvider } from "./provider";
