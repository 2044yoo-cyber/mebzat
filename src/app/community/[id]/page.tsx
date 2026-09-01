import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Play } from "lucide-react";

import { CommentThread } from "@/components/community/comment-thread";
import { LikeButton } from "@/components/community/like-button";
import { AVATAR_PLACEHOLDER } from "@/lib/constants/placeholders";
import { POST_KIND } from "@/lib/constants/community";
import {
  getComments,
  getPost,
  likedPostIds,
} from "@/lib/data/community";
import { createClient } from "@/lib/supabase/server";
import { formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const post = await getPost(id);
  if (!post) return { title: "Post not found" };

  const title = post.title ?? post.body.slice(0, 60);
  const description = post.body.slice(0, 160);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      publishedTime: post.created_at,
      images: post.images?.[0]?.url ? [post.images[0].url] : undefined,
    },
  };
}

export default async function PostPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const post = await getPost(id);
  if (!post) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [comments, liked] = await Promise.all([
    getComments(post.id),
    likedPostIds([post.id], user?.id ?? null),
  ]);

  const author = post.author;
  const name =
    post.company?.name ??
    author?.company_name ??
    author?.full_name ??
    author?.username ??
    "Medosha member";
  const avatar = post.company?.logo_url ?? author?.avatar_url;

  // Turns #tags in the body into links without dangerously setting HTML.
  const segments = post.body.split(/(#[A-Za-z0-9_]{2,50})/g);

  return (
    <div className="container-page py-10">
      <Link
        href="/community"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Community
      </Link>

      <article className="mx-auto mt-4 max-w-3xl">
        <div className="flex items-center gap-3">
          <Image
            src={avatar || AVATAR_PLACEHOLDER}
            alt=""
            width={44}
            height={44}
            className="size-11 shrink-0 rounded-full object-cover"
          />
          <div className="min-w-0 flex-1">
            {author?.username ? (
              <Link
                href={`/u/${author.username}`}
                className="block truncate font-medium hover:underline"
              >
                {name}
              </Link>
            ) : (
              <span className="block truncate font-medium">{name}</span>
            )}
            <span className="block text-sm text-muted-foreground">
              {formatRelativeTime(post.created_at)} · {post.view_count} views
            </span>
          </div>
          <span className="shrink-0 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">
            {POST_KIND[post.kind].label}
          </span>
        </div>

        {post.title && (
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">
            {post.title}
          </h1>
        )}

        <div className="mt-4 whitespace-pre-wrap text-lg leading-relaxed">
          {segments.map((segment, index) =>
            segment.startsWith("#") ? (
              <Link
                key={`${segment}-${index}`}
                href={`/community?tag=${segment.slice(1).toLowerCase()}`}
                className="font-medium text-brand hover:underline"
              >
                {segment}
              </Link>
            ) : (
              <span key={index}>{segment}</span>
            ),
          )}
        </div>

        {post.images?.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {post.images.map((image) => (
              <div
                key={image.id}
                className="relative aspect-video overflow-hidden rounded-xl bg-muted"
              >
                <Image
                  src={image.url}
                  alt={image.alt ?? ""}
                  fill
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="object-cover"
                />
                {image.video_url && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-background/80 backdrop-blur">
                      <Play className="size-5" />
                    </span>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center gap-4 border-y py-3">
          <LikeButton
            postId={post.id}
            count={post.like_count}
            liked={liked.has(post.id)}
            signedIn={user !== null}
          />
          <span className="text-sm text-muted-foreground">
            {post.comment_count}{" "}
            {post.comment_count === 1 ? "comment" : "comments"}
          </span>
        </div>

        <div className="mt-8">
          <CommentThread
            postId={post.id}
            comments={comments}
            signedIn={user !== null}
          />
        </div>
      </article>
    </div>
  );
}
