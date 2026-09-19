import {
  Building2,
  HardHat,
  Home,
  Key,
  Store,
  type LucideIcon,
} from "lucide-react";

import type { MedoshaRole, Profile } from "@/types/database.types";

/**
 * How somebody uses Medosha.
 *
 * Distinct from `account_type`, which has existed since 0001 and says what
 * kind of entity an account is — individual, company, supplier, government.
 * That question is read by four search functions and cannot hold two answers.
 * This one is "what did you come here to do", it is stored as an array, and it
 * decides which profile a person is asked to fill in.
 *
 * ## Not everybody is a professional
 *
 * The failure this exists to end: every account got the professional's
 * completion bar, so a homeowner who signed up to find a carpenter was told
 * their profile was 40% complete and was missing a trade, years of experience
 * and the areas they work in. They do not have any of those. A bar somebody
 * cannot honestly finish is a bar they stop reading — and worse, it implied
 * they belonged in a marketplace of people looking for work.
 */

export type RoleDefinition = {
  value: MedoshaRole;
  label: string;
  /** One line, in the words somebody choosing would use about themselves. */
  blurb: string;
  icon: LucideIcon;
  /** Where this role's own profile is filled in, once chosen. */
  setupHref: string;
};

export const ROLES: readonly RoleDefinition[] = [
  {
    value: "client",
    label: "Client or homeowner",
    blurb: "I am building, renovating or looking to hire.",
    icon: Home,
    setupHref: "/profile/edit",
  },
  {
    value: "professional",
    label: "Professional",
    blurb: "I work in construction, design or a trade.",
    icon: HardHat,
    setupHref: "/profile/edit",
  },
  {
    value: "company",
    label: "Company",
    blurb: "We are a firm, contractor or consultancy.",
    icon: Building2,
    setupHref: "/profile/edit",
  },
  {
    value: "agent",
    label: "Real estate agent",
    blurb: "I list and sell or rent property.",
    icon: Key,
    setupHref: "/profile/agent",
  },
  {
    value: "seller",
    label: "Sales or supplier",
    blurb: "I sell materials, fittings or equipment.",
    icon: Store,
    setupHref: "/profile/seller",
  },
];

const BY_VALUE = new Map(ROLES.map((role) => [role.value, role]));

export function roleLabel(role: MedoshaRole): string {
  return BY_VALUE.get(role)?.label ?? role;
}

export function roleDefinition(role: MedoshaRole): RoleDefinition | undefined {
  return BY_VALUE.get(role);
}

export function isMedoshaRole(value: unknown): value is MedoshaRole {
  return typeof value === "string" && BY_VALUE.has(value as MedoshaRole);
}

/**
 * The roles on a profile, always with at least one.
 *
 * An account with an empty array is one the welcome screen has not finished
 * with. Treating it as a client rather than returning nothing means every
 * caller gets a usable answer and none of them has to handle the empty case —
 * and a client is the smallest claim the platform can make about somebody.
 */
export function rolesOf(profile: Pick<Profile, "roles" | "primary_role">): MedoshaRole[] {
  const roles = (profile.roles ?? []).filter(isMedoshaRole);
  if (roles.length > 0) return roles;
  return [profile.primary_role ?? "client"];
}

export function primaryRoleOf(
  profile: Pick<Profile, "roles" | "primary_role">,
): MedoshaRole {
  return profile.primary_role ?? rolesOf(profile)[0] ?? "client";
}

/**
 * The role this profile actually stored, or null when it stored none.
 *
 * `primaryRoleOf` answers "what shall I call them" and says `client` when
 * nothing was stored, because a screen with room for one word needs one. This
 * answers "what did they say", and says nothing when they said nothing.
 *
 * The difference matters exactly once, and badly: deciding which fields a
 * profile is asked for. A row written before 0097 has no role, and guessing
 * `client` there would hand a carpenter the homeowner's four-field bar and
 * tell them they were finished with half their profile empty. Without a
 * stored role the account type decides, as it did before roles existed.
 */
export function storedRoleOf(
  profile: Pick<Profile, "roles" | "primary_role">,
): MedoshaRole | null {
  if (isMedoshaRole(profile.primary_role)) return profile.primary_role;
  return (profile.roles ?? []).find(isMedoshaRole) ?? null;
}

export function hasRole(
  profile: Pick<Profile, "roles" | "primary_role">,
  role: MedoshaRole,
): boolean {
  return rolesOf(profile).includes(role);
}

/**
 * The roles a search for somebody to hire returns.
 *
 * A homeowner who signed up to find a carpenter is not a carpenter, and was
 * being offered as one — a card with a name and a sub-city, in the results for
 * "carpenter in Bole". An agent and a supplier are found in their own places.
 *
 * Migration 0099 writes the same two names into `search_professionals`, which
 * is the query the Professionals page runs. This copy is for the handful of
 * lists that select from `profiles` directly; both are asserted, by
 * supabase/tests/professional-search.sql and by scripts/roles_check.ts, so
 * neither can be changed alone.
 */
export const MARKETPLACE_ROLES: MedoshaRole[] = ["professional", "company"];
