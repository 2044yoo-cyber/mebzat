"use server";

import { isFeedTopic, type FeedTopic } from "@/lib/feed/constants";
import { createClient } from "@/lib/supabase/server";

export type FeedPreferencesState = { error?: string; savedAt?: number };

/** The most topics a person can pick. The table holds the same limit. */
const MAX_TOPICS = 8;

/**
 * What the Home feed leans towards, and whether it may lean on activity.
 *
 * The topics are a request, never a filter: the feed still mixes everything,
 * with these a little further up. `personalised` off means likes, saves and
 * opens, the person's role and their city stop moving the ranking; what they
 * chose here and who they follow still do, because those they asked for.
 *
 * Written under the person's own session; the row's policy only lets them
 * write their own.
 */
export async function saveFeedPreferences(input: {
  topics: string[];
  personalised: boolean;
}): Promise<FeedPreferencesState> {
  const topics = [...new Set(Array.isArray(input?.topics) ? input.topics : [])].filter(isFeedTopic) as FeedTopic[];
  if (topics.length > MAX_TOPICS) return { error: `Pick at most ${MAX_TOPICS} topics.` };
  if (typeof input?.personalised !== "boolean") return { error: "That setting was not understood." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to tune your feed." };

  // Not in the generated types until they are refreshed after 0109.
  const { error } = await (supabase.from as unknown as (table: string) => {
    upsert: (row: Record<string, unknown>, options: { onConflict: string }) => PromiseLike<{ error: { message: string } | null }>;
  }).call(supabase, "feed_interests").upsert(
    { user_id: user.id, topics, personalised: input.personalised, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error(`[medosha:feed] saving feed preferences failed: ${error.message}`);
    return { error: "Your feed settings could not be saved. Try again in a moment." };
  }

  return { savedAt: Date.now() };
}
