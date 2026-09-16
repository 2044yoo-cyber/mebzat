import { ORGANIZATION_ACCOUNT_TYPES } from "@/lib/validations/profile";
import type { AccountType, Profile } from "@/types/database.types";

/**
 * How complete a profile is. One answer, for everybody who asks.
 *
 * ## There were two rules
 *
 * `lib/profile-completion.ts` scored nine fields by weight and the Dashboard
 * showed the percentage. `lib/data/jobs.ts` decided `complete` with
 * `Boolean(full_name && bio && location_city)` and the apply form showed
 * "Review it" or "Finish it first" from that. The two could not agree by
 * construction, and they did not: a profile with a name, a bio and a city was
 * "complete" on one screen and 45% on the other.
 *
 * This is the only rule now. `getProfileCompletion` returns the percentage,
 * what is missing, and whether it is done — and every caller takes what it
 * needs from that one call.
 *
 * ## The required set depends on who you are
 *
 * The old list asked everybody for years of experience and a personal
 * website. A construction firm has no years of experience as a person and a
 * day labourer has no website, so both were permanently short of 100% for
 * answering honestly — and a bar that cannot reach the end is a bar people
 * stop reading.
 *
 * So there are two sets. Somebody looking for work is asked what an employer
 * looks at: who they are, what they do, how long they have done it, where, and
 * in what languages. An organisation is asked what a client looks at: what the
 * firm is called, what sector it is in, where it is, and how to reach it — and
 * is never asked for a CV or for years of experience.
 *
 * Both sets total 100, deliberately. A percentage that cannot reach 100 is the
 * bug above in a different form.
 */

export type CompletionField = {
  key: string;
  label: string;
  weight: number;
  filled: (profile: Profile) => boolean;
};

const filledText = (value: string | null | undefined) =>
  typeof value === "string" && value.trim().length > 0;

const PERSON: CompletionField[] = [
  { key: "full_name", label: "Your name", weight: 15, filled: (p) => filledText(p.full_name) },
  { key: "avatar_url", label: "Profile photo", weight: 15, filled: (p) => filledText(p.avatar_url) },
  { key: "location", label: "Where you are", weight: 13, filled: (p) => filledText(p.location_city) || filledText(p.base_area) },
  { key: "bio", label: "About you", weight: 12, filled: (p) => filledText(p.bio) },
  { key: "username", label: "Username", weight: 10, filled: (p) => filledText(p.username) },
  { key: "phone", label: "Phone number", weight: 10, filled: (p) => filledText(p.phone) },
  { key: "profession", label: "Your trade", weight: 10, filled: (p) => filledText(p.profession) },
  { key: "years_experience", label: "Years of experience", weight: 8, filled: (p) => p.years_experience !== null && p.years_experience !== undefined },
  { key: "languages", label: "Languages", weight: 7, filled: (p) => (p.languages ?? []).length > 0 },
];

const ORGANIZATION: CompletionField[] = [
  { key: "company_name", label: "Company name", weight: 15, filled: (p) => filledText(p.company_name) },
  { key: "avatar_url", label: "Logo", weight: 15, filled: (p) => filledText(p.avatar_url) },
  { key: "location", label: "Where you are", weight: 13, filled: (p) => filledText(p.location_city) || filledText(p.base_area) },
  { key: "bio", label: "About the company", weight: 13, filled: (p) => filledText(p.bio) },
  { key: "industry", label: "Industry", weight: 12, filled: (p) => filledText(p.industry) },
  { key: "website", label: "Website", weight: 12, filled: (p) => filledText(p.website) },
  { key: "username", label: "Username", weight: 10, filled: (p) => filledText(p.username) },
  { key: "phone", label: "Phone number", weight: 10, filled: (p) => filledText(p.phone) },
];

/** Whether this account belongs to an organisation rather than a person. */
export function isOrganizationAccount(
  accountType: AccountType | null | undefined,
): boolean {
  return ORGANIZATION_ACCOUNT_TYPES.has(accountType ?? "individual");
}

/** What this kind of account is asked for. */
export function requiredFields(
  accountType: AccountType | null | undefined,
): readonly CompletionField[] {
  return isOrganizationAccount(accountType) ? ORGANIZATION : PERSON;
}

export type ProfileCompletion = {
  percent: number;
  /** Labels of what is still empty, in the order the fields are weighted. */
  missing: string[];
  complete: boolean;
  /** Which set was used, so a caller can say "as a company" without guessing. */
  audience: "person" | "organization";
};

export function getProfileCompletion(profile: Profile): ProfileCompletion {
  const fields = requiredFields(profile.account_type);
  const audience = isOrganizationAccount(profile.account_type)
    ? "organization"
    : "person";

  let percent = 0;
  const missing: string[] = [];

  for (const field of fields) {
    if (field.filled(profile)) percent += field.weight;
    else missing.push(field.label);
  }

  // `missing.length === 0` rather than `percent >= 100`. They agree today
  // because both sets total 100, and if a weight is ever mistyped the honest
  // answer is "nothing is missing", not "the arithmetic came out right".
  return { percent, missing, complete: missing.length === 0, audience };
}
