import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Whether this account is allowed to publish right now.
 *
 * The moderation system has recorded suspensions since 0052 and nothing read
 * them: a moderator could suspend an account and that account carried on
 * posting. This is the read side of migration 0063.
 *
 * Restricted is not banned. The brief that shaped the moderation system said
 * an upheld report restricts an account *pending review* rather than executing
 * a ban, so a restricted person can still sign in, read, and appeal — they
 * cannot publish. Blocking every request would also block the appeal, which
 * makes the restriction unappealable and turns a temporary measure into a
 * permanent one by accident.
 */

export type Restriction = {
  restricted: boolean;
  until: string | null;
  reason: string | null;
};

const CLEAR: Restriction = { restricted: false, until: null, reason: null };

export async function accountRestriction(userId?: string): Promise<Restriction> {
  const supabase = await createClient();

  let id = userId;
  if (!id) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return CLEAR;
    id = user.id;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("restricted_until, restriction_reason")
    .eq("id", id)
    .maybeSingle();

  // A deployment that has not applied 0063 has no such column. That is not a
  // restriction and must not read as one — the same convention every other
  // read here follows for a migration that has not been run.
  if (error || !data?.restricted_until) return CLEAR;

  // A past date is not a restriction. The expiry is the whole point of a
  // temporary one, and an account still restricted after its date has passed
  // is a support ticket nobody can resolve.
  const until = new Date(data.restricted_until);
  if (!(until.getTime() > Date.now())) return CLEAR;

  return {
    restricted: true,
    until: data.restricted_until,
    reason: data.restriction_reason,
  };
}

/**
 * The sentence a restricted person sees when they try to publish.
 *
 * It says when it ends and why, because "you cannot do that" with no date and
 * no reason is what makes somebody give up on the appeal rather than use it.
 */
export function restrictionMessage(restriction: Restriction): string {
  if (!restriction.restricted) return "";

  const until = restriction.until
    ? new Date(restriction.until).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return [
    "Your account cannot publish at the moment",
    until ? ` until ${until}` : "",
    ".",
    restriction.reason ? ` ${restriction.reason}.` : "",
    " You can appeal this from the guidelines page.",
  ].join("");
}
