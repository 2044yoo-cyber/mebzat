/**
 * Who Medosha is, for the pages that have to say so.
 *
 * One file rather than a string in the privacy policy, another in the terms,
 * a third on the contact page — the failure that produces three different
 * support addresses for the same company. Whoever registers Medosha formally
 * updates it here, once, and every page that names the company changes with
 * it.
 *
 * ## Placeholders, not inventions
 *
 * `legalName` and `country` are not yet filled in with anything official —
 * writing "Medosha Technologies PLC, Ethiopia" here would be a legal claim
 * nobody has made. `null` renders as "to be confirmed" wherever it is shown,
 * which is honest and is also the signal that this file still has a real
 * value to fill in.
 */

export const BUSINESS = {
  /** The trading name everybody already knows. This one is real. */
  tradingName: "Medosha",

  /**
   * The registered legal entity, once one exists. Null until Medosha is
   * actually incorporated — do not fill this in with a guess.
   */
  legalName: null as string | null,

  /** Where the business is registered. Same rule: null until it is real. */
  country: null as string | null,

  /** General enquiries — already live, already used on the Contact page. */
  contactEmail: "hello@medosha.net",

  /** Product and account support. */
  supportEmail: "support@medosha.net",

  /** Privacy requests and data questions — what the Privacy Policy points to. */
  privacyEmail: "privacy@medosha.net",

  /** The one method Medosha actually offers right now. */
  contactMethod: "Email" as const,
} as const;

/** The legal name if one is registered, otherwise the trading name plainly marked as such. */
export function legalOrTradingName(): string {
  return BUSINESS.legalName ?? `${BUSINESS.tradingName} (legal entity to be confirmed)`;
}
