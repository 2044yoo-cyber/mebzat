import { ORGANIZATION_ACCOUNT_TYPES } from "@/lib/validations/profile";
import { storedRoleOf } from "@/lib/profile/roles";
import type { AccountType, MedoshaRole, Profile } from "@/types/database.types";

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
 *
 * ## And now the set depends on what you came here to do
 *
 * 0097 added roles, and they cut across this. A homeowner was being asked for
 * a trade, years of experience and languages — the same bar as somebody
 * advertising for work — and could not honestly finish it. An agent was being
 * asked for a trade they do not have.
 *
 * So the role chooses the set first, and the person-or-organisation split
 * still decides it for the two roles where it is the real question. Every set
 * totals 100, which is asserted rather than assumed.
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

/**
 * A homeowner is asked for four things.
 *
 * Name, photograph, where they are, and how to be reached. That is everything
 * somebody hiring a carpenter needs to be, and asking for more would be asking
 * them to advertise a service they are not offering.
 */
const CLIENT: CompletionField[] = [
  { key: "full_name", label: "Your name", weight: 35, filled: (p) => filledText(p.full_name) },
  { key: "location", label: "Where you are", weight: 25, filled: (p) => filledText(p.location_city) || filledText(p.base_area) },
  { key: "phone", label: "Phone number", weight: 25, filled: (p) => filledText(p.phone) },
  { key: "avatar_url", label: "Profile photo", weight: 15, filled: (p) => filledText(p.avatar_url) },
];

/**
 * An agent is asked what somebody looking for a flat would want to know.
 *
 * No trade, no years of experience as a tradesperson, no languages. The agency
 * and the areas they cover are the two things that decide whether to call
 * them, and both live on `agent_profiles` — which is why this set stops at the
 * account itself and the agent screen carries the rest.
 */
const AGENT: CompletionField[] = [
  { key: "full_name", label: "Your name", weight: 25, filled: (p) => filledText(p.full_name) },
  { key: "avatar_url", label: "Profile photo", weight: 15, filled: (p) => filledText(p.avatar_url) },
  { key: "location", label: "Where you are", weight: 20, filled: (p) => filledText(p.location_city) || filledText(p.base_area) },
  { key: "phone", label: "Phone number", weight: 20, filled: (p) => filledText(p.phone) },
  { key: "bio", label: "About you", weight: 20, filled: (p) => filledText(p.bio) },
];

/**
 * A seller is asked what somebody buying cement would want to know.
 *
 * The store name sits on `seller_profiles`; this is the account behind it.
 */
const SELLER: CompletionField[] = [
  { key: "name", label: "Your name or the shop's", weight: 25, filled: (p) => filledText(p.full_name) || filledText(p.company_name) },
  { key: "avatar_url", label: "Logo or photo", weight: 15, filled: (p) => filledText(p.avatar_url) },
  { key: "location", label: "Where you are", weight: 20, filled: (p) => filledText(p.location_city) || filledText(p.base_area) },
  { key: "phone", label: "Phone number", weight: 20, filled: (p) => filledText(p.phone) },
  { key: "bio", label: "About the shop", weight: 20, filled: (p) => filledText(p.bio) },
];

/** Every set, so the check can assert each one totals 100. */
export const COMPLETION_SETS: Record<string, readonly CompletionField[]> = {
  person: PERSON,
  organization: ORGANIZATION,
  client: CLIENT,
  agent: AGENT,
  seller: SELLER,
};

/** Whether this account belongs to an organisation rather than a person. */
export function isOrganizationAccount(
  accountType: AccountType | null | undefined,
): boolean {
  return ORGANIZATION_ACCOUNT_TYPES.has(accountType ?? "individual");
}

/**
 * What this kind of account is asked for.
 *
 * The role decides first. `client`, `agent` and `seller` each have their own
 * short set; `professional` and `company` fall through to the person or
 * organisation split, which is the question that actually distinguishes those
 * two and was already being asked correctly.
 *
 * The `accountType` parameter is kept so existing callers that have only that
 * still work and still get the old answer.
 */
export function requiredFields(
  accountType: AccountType | null | undefined,
  role?: MedoshaRole | null,
): readonly CompletionField[] {
  if (role === "client") return CLIENT;
  if (role === "agent") return AGENT;
  if (role === "seller") return SELLER;
  return isOrganizationAccount(accountType) ? ORGANIZATION : PERSON;
}

export type ProfileCompletion = {
  percent: number;
  /** Labels of what is still empty, in the order the fields are weighted. */
  missing: string[];
  complete: boolean;
  /** Which set was used, so a caller can say "as a company" without guessing. */
  audience: "person" | "organization" | "client" | "agent" | "seller";
};

export function getProfileCompletion(profile: Profile): ProfileCompletion {
  const role = storedRoleOf(profile);
  const fields = requiredFields(profile.account_type, role);

  const audience: ProfileCompletion["audience"] =
    role === "client" || role === "agent" || role === "seller"
      ? role
      : isOrganizationAccount(profile.account_type)
        ? "organization"
        : "person";

  let percent = 0;
  const missing: string[] = [];

  for (const field of fields) {
    if (field.filled(profile)) percent += field.weight;
    else missing.push(field.label);
  }

  // `missing.length === 0` rather than `percent >= 100`. The two agree today,
  // and no test can tell them apart for exactly that reason — both sets total
  // 100, which is itself asserted. The difference only appears on the day a
  // weight is mistyped, and on that day the honest answer is "nothing is
  // missing" rather than "the arithmetic came out right".
  return { percent, missing, complete: missing.length === 0, audience };
}
