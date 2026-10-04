/**
 * What a request actually cost, in credits.
 *
 * The brief was specific: *"Do not hard-code 1 question = 1 credit. Different
 * requests can have different costs."* A one-line answer and a forty-page
 * document analysis are both "one question", and charging them the same means
 * either the short one is extortionate or the long one is free.
 *
 * So the gate holds an estimate before the model is called — it has to, because
 * nobody knows the token count until the answer comes back — and this turns the
 * result into the real figure. The difference goes back to the balance in the
 * same transaction that records the spend.
 *
 * ## Where these numbers come from
 *
 * A credit is worth roughly 1.4 birr at the middle bundle price. The rates
 * below are set so that a typical exchange costs a few tenths of a credit and
 * an image costs one — which is a small multiple of what the providers charge,
 * enough to cover the ones that fail and are refunded.
 *
 * They are constants here rather than rows in `ai_operation_costs` for one
 * reason: that table prices *operations*, which is what an admin changes on a
 * Tuesday, and these are the *shape* of the meter under one operation. If a
 * rate ever needs changing without a deploy it belongs in the table, and moving
 * it there is a migration and a lookup, not a redesign.
 *
 * No `server-only` guard: the billing page shows what things cost, and the
 * check script meters without a database. There are no secrets in a rate card.
 */

/** The ceiling on any single metered charge is the reservation, set in SQL. */
export const METER = {
  /**
   * Charged on every answer, however short.
   *
   * A request costs something even when the reply is one word: the system
   * prompt, the catalogue context and the routing were all paid for.
   */
  chatBase: 0.02,
  /** Per thousand tokens read. Cheaper than writing, as with every provider. */
  chatPerThousandInput: 0.03,
  /** Per thousand tokens written. */
  chatPerThousandOutput: 0.09,
  /** Per image produced. */
  perImage: 1,
  /** A high-quality or large image asks more of the provider. */
  qualityMultiplier: { standard: 1, high: 1.6 } as const,
} as const;

export type ChatMeter = {
  promptTokens: number;
  completionTokens: number;
};

/**
 * What one answer cost.
 *
 * Rounded to three places, the precision the ledger stores. Rounded *up*, so a
 * rounding error is never in Medosha's favour by accident — a fraction of a
 * thousandth is not worth reasoning about twice.
 */
export function meterChat({ promptTokens, completionTokens }: ChatMeter): number {
  const input = safeTokens(promptTokens);
  const output = safeTokens(completionTokens);

  const credits =
    METER.chatBase +
    (input / 1000) * METER.chatPerThousandInput +
    (output / 1000) * METER.chatPerThousandOutput;

  return round(credits);
}

/**
 * What a set of images cost.
 *
 * Counted from the images that came back, not the number asked for. A request
 * for four that produced two is charged for two — the member did not receive
 * four, and billing for a provider's shortfall is billing for our own problem.
 */
export function meterImages(count: number, quality: "standard" | "high" = "standard"): number {
  const produced = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  return round(produced * METER.perImage * METER.qualityMultiplier[quality]);
}

/**
 * What to hold before a set of images is generated.
 *
 * The full asking price, so four images cannot be started on a balance that
 * covers one. Whatever is not produced comes back at the commit.
 */
export function estimateImages(count: number, quality: "standard" | "high" = "standard"): number {
  return meterImages(count, quality);
}

/**
 * A token count that can be trusted.
 *
 * Providers omit usage on streamed responses more often than they admit, and a
 * missing count arrives as undefined, null, NaN or a negative. All of them mean
 * "unknown", and unknown must not become a charge — the base rate covers the
 * request and the member is not billed for a number nobody has.
 */
function safeTokens(value: unknown): number {
  const tokens = Number(value);
  if (!Number.isFinite(tokens) || tokens <= 0) return 0;
  // A million tokens in one turn is not a long question, it is a broken meter.
  return Math.min(tokens, 1_000_000);
}

function round(value: number): number {
  return Math.ceil(value * 1000) / 1000;
}

/**
 * How a charge is written where a person will read it.
 *
 * Trailing zeros are dropped — "0.3 credits", not "0.300" — because the second
 * reads like a system speaking and the first reads like a price.
 */
export function formatCredits(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  return rounded.toFixed(3).replace(/\.?0+$/, "");
}
