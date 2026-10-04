import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PostReview } from "@/components/social/post-review";
import { PublishHistory } from "@/components/social/publish-history";
import { getContentPost } from "@/lib/data/content";
import { autoPublishAvailable } from "@/lib/social/settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Review AI post",
};

export const dynamic = "force-dynamic";

/**
 * Reviewing one generated post.
 *
 * Server-rendered, and the post is fetched through the member's own client so
 * row-level security decides whether it exists. Somebody following a link to
 * another member's post gets a 404 rather than a permission error — which is
 * the right answer, because "this exists but is not yours" is itself
 * information about somebody else's account.
 */
export default async function ContentPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=/studio/content/${id}`);

  const detail = await getContentPost(id);
  if (!detail) notFound();

  const autoPublish = await autoPublishAvailable();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <Link
        href="/studio/content"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Content calendar
      </Link>

      <h1 className="text-xl font-semibold">
        {detail.post.headline || "AI post"}
      </h1>

      <p className="mt-1 text-sm text-muted-foreground">
        Written from: &ldquo;{detail.post.brief}&rdquo;
      </p>

      <div className="mt-6">
        <PostReview
          post={detail.post}
          versions={detail.versions}
          autoPublishAvailable={autoPublish}
        />
      </div>

      {detail.attempts.length > 0 ? (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold">Publishing history</h2>
          <PublishHistory attempts={detail.attempts} />
        </div>
      ) : null}
    </div>
  );
}
