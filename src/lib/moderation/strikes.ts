import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ModerationCategory } from "./types";

/**
 * What happens to somebody who keeps posting prohibited content.
 *
 * Graduated, and deliberately reluctant. A first minor violation is a warning,
 * because most of them are somebody misjudging a line rather than attacking the
 * platform. Repetition escalates.
 *
 * ## Nothing here bans anybody on an AI's say-so
 *
 * The brief is explicit and it matters: an automated decision alone never
 * suspends an account. `strikeFor` is called after a *moderator* upholds a
 * decision, not when a classifier returns a score. The only exception is the
 * category that cannot be anything else, and even that escalates to a person
 * rather than executing a ban — the account is restricted pending review, and a
 * human decides what follows.
 */

export type StrikeLevel = "warning" | "restricted" | "suspended";

/** How long a restriction lasts, by how many the person already has. */
const RESTRICTION_DAYS = [1, 7, 30];

export async function currentStrikes(
  client: SupabaseClient,
  userId: string,
): Promise<{ count: number; level: StrikeLevel | null; until: string | null }> {
  const { data } = await client
    .from("user_strikes")
    .select("level, expires_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const strikes = data ?? [];
  const active = strikes.filter(
    (s) => !s.expires_at || new Date(s.expires_at) > new Date(),
  );

  const worst = active.find((s) => s.level === "suspended")
    ?? active.find((s) => s.level === "restricted")
    ?? active[0];

  return {
    count: strikes.length,
    level: (worst?.level as StrikeLevel) ?? null,
    until: worst?.expires_at ?? null,
  };
}

/** Whether this person may post right now. */
export async function canPost(
  client: SupabaseClient,
  userId: string,
): Promise<{ allowed: boolean; reason?: string; until?: string | null }> {
  const { level, until } = await currentStrikes(client, userId);

  if (level === "suspended") {
    return { allowed: false, reason: "Your account is suspended.", until };
  }
  if (level === "restricted") {
    return {
      allowed: false,
      reason: "Posting is temporarily restricted on your account.",
      until,
    };
  }
  return { allowed: true };
}

/**
 * The next step for this person, given what they have already done.
 *
 * Severity matters as much as count: a first offence in a severe category does
 * not get the warning a first offence in a mild one does.
 */
export function nextLevel(
  priorCount: number,
  category: ModerationCategory | null,
): StrikeLevel {
  const severe =
    category === "sexual_minors" ||
    category === "illegal" ||
    category === "threats";

  if (severe) return priorCount === 0 ? "restricted" : "suspended";
  if (priorCount === 0) return "warning";
  if (priorCount < 3) return "restricted";
  return "suspended";
}

/**
 * Records a strike. Called by a moderator's action, never by a classifier.
 *
 * `issuedBy` is required and not optional: a strike with nobody's name against
 * it is one nobody can be asked to justify.
 */
export async function strikeFor(input: {
  client: SupabaseClient;
  userId: string;
  itemId?: string;
  category: ModerationCategory | null;
  reason: string;
  issuedBy: string;
}): Promise<{ level: StrikeLevel }> {
  const { count } = await currentStrikes(input.client, input.userId);
  const level = nextLevel(count, input.category);

  const days = RESTRICTION_DAYS[Math.min(count, RESTRICTION_DAYS.length - 1)]!;
  const expires =
    level === "restricted"
      ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
      : null;

  await input.client.from("user_strikes").insert({
    user_id: input.userId,
    item_id: input.itemId ?? null,
    level,
    category: input.category,
    reason: input.reason.slice(0, 500),
    expires_at: expires,
    issued_by: input.issuedBy,
  });

  return { level };
}
