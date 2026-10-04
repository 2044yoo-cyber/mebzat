import Image from "next/image";
import Link from "next/link";
import { Heart, MessageCircle, Play } from "lucide-react";

import { AVATAR_PLACEHOLDER } from "@/lib/constants/placeholders";
import { POST_KIND } from "@/lib/constants/community";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { PostRow } from "@/lib/data/community";

/**
 * One post in the feed.
 *
 * The whole card is not a link: the body contains links of its own (hashtags,
 * mentions), and nesting an anchor inside an anchor is invalid HTML that
 * breaks keyboard navigation. The title and the image link instead.
 */
export function PostCard({
  post,
  compact = false,
}: {
  post: PostRow;
  compact?: boolean;
}) {
  const author = post.author;
  const name =
    post.company?.name ??
    author?.company_name ??
    author?.full_name ??
    author?.username ??
    "Medosha member";
  const avatar = post.company?.logo_url ?? author?.avatar_url;
  const kind = POST_KIND[post.kind];
  const cover = post.images?.[0];

  return (
    <article
      className={cn(
        "rounded-2xl border bg-card transition-shadow hover:shadow-md",
        compact ? "p-4" : "p-5",
      )}
    >
      <div className="flex items-center gap-2.5">
        <Image
          src={avatar || AVATAR_PLACEHOLDER}
          alt=""
          width={36}
          height={36}
          className="size-9 shrink-0 rounded-full object-cover"
        />
        <div className="min-w-0 flex-1">
          {author?.username ? (
            <Link
              href={`/u/${author.username}`}
              className="block truncate text-sm font-medium hover:underline"
            >
              {name}
            </Link>
          ) : (
            <span className="block truncate text-sm font-medium">{name}</span>
          )}
          <span className="block text-xs text-muted-foreground">
            {formatRelativeTime(post.created_at)}
          </span>
        </div>
        <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
          {kind.label}
        </span>
      </div>

      <div className="mt-3">
        {post.title && (
          <Link href={`/community/${post.id}`}>
            <h3 className="font-medium leading-snug hover:underline">
              {post.title}
            </h3>
          </Link>
        )}
        <p
          className={cn(
            "mt-1 whitespace-pre-wrap text-sm text-muted-foreground",
            compact ? "line-clamp-2" : "line-clamp-4",
          )}
        >
          {post.body}
        </p>
      </div>

      {cover && !compact && (
        <Link
          href={`/community/${post.id}`}
          className="relative mt-3 block aspect-video overflow-hidden rounded-xl bg-muted"
        >
          <Image
            src={cover.url}
            alt={cover.alt ?? ""}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
          {cover.video_url && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-background/80 backdrop-blur">
                <Play className="size-5" />
              </span>
            </span>
          )}
          {post.images.length > 1 && (
            <span className="absolute right-2 bottom-2 rounded-full bg-background/90 px-2 py-0.5 text-xs backdrop-blur">
              +{post.images.length - 1}
            </span>
          )}
        </Link>
      )}

      <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Heart className="size-4" />
          {post.like_count}
        </span>
        <Link
          href={`/community/${post.id}`}
          className="flex items-center gap-1.5 transition-colors hover:text-foreground"
        >
          <MessageCircle className="size-4" />
          {post.comment_count}
        </Link>
        <Link
          href={`/community/${post.id}`}
          className="ml-auto text-sm font-medium text-brand hover:underline"
        >
          Read
        </Link>
      </div>
    </article>
  );
}
