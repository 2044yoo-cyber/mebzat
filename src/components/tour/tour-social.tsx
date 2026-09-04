"use client";

import { useState } from "react";

import { FeedActions } from "@/components/feed/feed-actions";
import { FeedComments } from "@/components/feed/feed-comments";
import type { FeedPost } from "@/lib/feed/types";

/**
 * Likes and comments under a tour.
 *
 * The tour's post is an ordinary feed post — same table, same endpoints — so
 * this is the same row of buttons and the same comment thread that appears
 * under everything else. A second like button writing to a second table would
 * mean a heart on the tour page and a different heart in the feed disagreeing
 * about the same tour.
 */
export function TourSocial({
  post,
  signedIn,
  viewer,
}: {
  post: FeedPost;
  signedIn: boolean;
  viewer: { name: string; avatarUrl: string | null } | null;
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  return (
    <section className="mt-6 rounded-2xl border">
      <FeedActions
        post={post}
        signedIn={signedIn}
        commentsOpen={commentsOpen}
        onOpenComments={() => setCommentsOpen((open) => !open)}
        onHidden={() => setHidden(true)}
      />

      {commentsOpen && (
        <div className="border-t px-3 pb-3">
          <FeedComments postId={post.id} signedIn={signedIn} viewer={viewer} autoFocus />
        </div>
      )}
    </section>
  );
}
