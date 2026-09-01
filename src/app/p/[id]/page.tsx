import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FeedCard } from "@/components/feed/feed-card";
import { getFeedPost } from "@/lib/data/feed";
import { KIND_LABEL } from "@/lib/feed/constants";
import { getNavProfile } from "@/lib/nav-profile";

/**
 * A single feed post, on its own URL.
 *
 * Sharing needs somewhere to point. Without this, "copy link" would send
 * people to the homepage and the post they were sent would be wherever the
 * ranking had moved it — which is to say, nowhere.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await getFeedPost(id);

  if (!post) return { title: "Post not found" };

  const image = post.media[0]?.url;

  return {
    title: post.title,
    description: post.body?.slice(0, 160) ?? KIND_LABEL[post.kind],
    openGraph: {
      title: post.title,
      description: post.body?.slice(0, 200) ?? undefined,
      type: "article",
      images: image ? [image] : undefined,
    },
  };
}

export default async function FeedPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [post, profile] = await Promise.all([getFeedPost(id), getNavProfile()]);

  if (!post) notFound();

  return (
    <div className="mx-auto w-full max-w-[620px] px-0 py-3 @lg/ws:px-4">
      <FeedCard
        post={post}
        signedIn={Boolean(profile)}
        viewer={
          profile
            ? {
                name: profile.fullName ?? "You",
                avatarUrl: profile.avatarUrl,
              }
            : null
        }
        priority
      />
    </div>
  );
}
