import { BadgeCheck } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * What has actually been verified, said plainly.
 *
 * ## Why the label is not just "Verified"
 *
 * A tick on a profile is read as an assurance, and the strength of that
 * assurance is the difference between "we sent this person a code" and "a
 * government document was checked". Medosha does the first. Showing a bare
 * tick invites the second reading, and the person it misleads is the one
 * deciding whether to send a stranger money.
 *
 * So the level is on the badge. When identity, professional and business
 * verification exist they get their own labels and their own colours, and a
 * phone badge does not quietly become one of them.
 *
 * ## What earns it
 *
 * `phone_verified`, which is set only by `sync_phone_verification()` from
 * `auth.users.phone_confirmed_at`. The column is refused to API sessions by a
 * trigger, so this cannot be worn without having completed a code.
 */

export const VERIFICATION_LEVELS = {
  phone: {
    label: "Phone verified",
    short: "Verified",
    detail: "This member confirmed a one-time code sent to their phone.",
    tone: "text-emerald-600 dark:text-emerald-500",
  },
  identity: {
    label: "Identity verified",
    short: "ID verified",
    detail: "A government identity document was checked.",
    tone: "text-sky-600 dark:text-sky-500",
  },
  professional: {
    label: "Professional verified",
    short: "Pro verified",
    detail: "A professional licence or registration was checked.",
    tone: "text-violet-600 dark:text-violet-500",
  },
  business: {
    label: "Business verified",
    short: "Business verified",
    detail: "Business registration documents were checked.",
    tone: "text-amber-600 dark:text-amber-500",
  },
  // What `companies.verified` actually means. `approve_company_claim()` sets
  // it when an admin approves somebody's claim to a directory listing, which
  // establishes that the person controls the listing — not that the business
  // is registered, and not that anybody checked a document. The page used to
  // draw a bare tick for this, which reads as far more.
  ownership: {
    label: "Ownership confirmed",
    short: "Claimed",
    detail:
      "Someone at this business claimed the listing and Medosha approved the claim. Business registration has not been checked.",
    tone: "text-sky-600 dark:text-sky-500",
  },
} as const;

export type VerificationLevel = keyof typeof VERIFICATION_LEVELS;

export function VerifiedBadge({
  level = "phone",
  showLabel = true,
  className,
}: {
  level?: VerificationLevel;
  /** The tick alone, for a byline where the words will not fit. */
  showLabel?: boolean;
  className?: string;
}) {
  const info = VERIFICATION_LEVELS[level];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-xs font-medium",
        info.tone,
        className,
      )}
      // The full sentence for a pointer, and the level for a screen reader —
      // never a bare "verified", which is the reading being avoided.
      title={info.detail}
    >
      <BadgeCheck className="size-4 shrink-0" aria-hidden />
      {showLabel ? (
        <span>{info.label}</span>
      ) : (
        <span className="sr-only">{info.label}</span>
      )}
    </span>
  );
}

/**
 * The level a profile has actually earned, or nothing.
 *
 * Derived rather than stored as a label, so a profile cannot carry a level it
 * has not met. Today only phone is real; the others return null until the
 * processes behind them exist, because a badge for a check nobody performed is
 * the thing this whole file is arranged to prevent.
 */
/**
 * What a business listing has earned.
 *
 * Only ever `ownership`, because that is the only thing the claim flow
 * establishes. A `business` level exists in the vocabulary above and is not
 * returned here: nothing in Medosha currently checks a registration document,
 * and a badge saying otherwise would be the platform lying on a page somebody
 * is using to decide whether to hand over money.
 */
export function companyVerificationLevelOf(company: {
  verified: boolean;
  is_claimed: boolean;
}): VerificationLevel | null {
  return company.verified && company.is_claimed ? "ownership" : null;
}

export function verificationLevelOf(profile: {
  phone_verified?: boolean | null;
}): VerificationLevel | null {
  return profile.phone_verified ? "phone" : null;
}
