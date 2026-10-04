"use server";

import { revalidatePath } from "next/cache";

import { reportFailure } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import { belongsInTheFeed } from "@/lib/tour/validate";

/**
 * Putting a tour in the feed, and taking it back out.
 *
 * The post is a `feed_posts` row pointing back at the tour through entity_type
 * and entity_id. Everything that hangs off a post — likes, comments, saves,
 * shares, views — then works on a tour without a second table anywhere, and
 * `/api/feed/interact` needs no change at all.
 *
 * Two separate questions decide whether it exists, and they were easy to
 * confuse:
 *
 *   visibility     who may open the tour — published, or link-only
 *   shareToFeed    whether it also turns up in other people's feeds
 *
 * A link-only tour is never posted however the second is set. That is the
 * whole point of link-only.
 */

export type FeedSyncResult = { error?: string; postId?: string | null };

export async function syncTourToFeed(tourId: string): Promise<FeedSyncResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to do that." };

  const { data: tour, error: readError } = await supabase
    .from("tours")
    // One literal, not a concatenation: PostgREST infers the row's type from
    // the string itself, and a joined one infers nothing.
    .select("id, owner_id, company_id, title, description, visibility, share_to_feed, thumbnail_url, property_id, published_at")
    .eq("id", tourId)
    .maybeSingle();

  if (readError) {
    return { error: reportFailure("syncTourToFeed.read", readError, "Could not share that.") };
  }
  if (!tour || tour.owner_id !== user.id) return { error: "That tour could not be found." };

  const { data: existing } = await supabase
    .from("feed_posts")
    .select("id")
    .eq("entity_type", "tour")
    .eq("entity_id", tour.id)
    .maybeSingle();

  const wanted = belongsInTheFeed(tour.visibility, tour.share_to_feed);

  if (!wanted) {
    if (!existing) return { postId: null };

    // Hidden rather than deleted. Somebody's comment on this tour is theirs,
    // and unsharing for an afternoon should not destroy it — re-sharing puts
    // the same post back with its replies intact.
    const { error } = await supabase
      .from("feed_posts")
      .update({ status: "hidden", updated_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (error) {
      return { error: reportFailure("syncTourToFeed.hide", error, "Could not update that.") };
    }
    revalidatePath("/");
    return { postId: existing.id };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, full_name, company_name, avatar_url, verification_status")
    .eq("id", user.id)
    .maybeSingle();

  const body =
    tour.description?.trim() ||
    "Walk through it in 360°, room by room, without leaving the house.";

  const fields = {
    kind: "tour_360" as const,
    // A tour is a property post: it is a place, and somebody filtering the
    // feed for property should see it.
    topic: "property" as const,
    title: tour.title,
    // How the feed groups an author's posts. The user's own id is the stable
    // key for a member; company posts key on the company.
    author_key: tour.company_id ?? user.id,
    body,
    author_id: user.id,
    company_id: tour.company_id,
    author_name:
      profile?.company_name || profile?.full_name || profile?.username || "Medosha member",
    author_avatar_url: profile?.avatar_url ?? null,
    author_verified: profile?.verification_status === "verified",
    link_href: `/tour/${tour.id}`,
    link_label: "Open the 360° tour",
    entity_type: "tour",
    entity_id: tour.id,
    status: "published" as const,
    published_at: tour.published_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let postId: string;

  if (existing) {
    const { error } = await supabase.from("feed_posts").update(fields).eq("id", existing.id);
    if (error) {
      return { error: reportFailure("syncTourToFeed.update", error, "Could not share that.") };
    }
    postId = existing.id;
  } else {
    const { data, error } = await supabase
      .from("feed_posts")
      .insert(fields)
      .select("id")
      .single();

    if (error || !data) {
      return { error: reportFailure("syncTourToFeed.insert", error, "Could not share that.") };
    }
    postId = data.id;
  }

  // The picture people scroll past. Replaced rather than added to, so a tour
  // whose cover changes does not accumulate stale media rows.
  await supabase.from("feed_media").delete().eq("post_id", postId);
  if (tour.thumbnail_url) {
    await supabase.from("feed_media").insert({
      post_id: postId,
      kind: "image",
      url: tour.thumbnail_url,
      alt: tour.title,
      label: "360°",
      position: 0,
    });
  }

  revalidatePath("/");
  revalidatePath(`/tour/${tour.id}`);
  return { postId };
}

/** The feed post for a tour, when it has one and it is live. */
export async function tourFeedPostId(tourId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("feed_posts")
    .select("id")
    .eq("entity_type", "tour")
    .eq("entity_id", tourId)
    .eq("status", "published")
    .maybeSingle();
  return data?.id ?? null;
}
