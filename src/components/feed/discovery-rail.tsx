"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BadgeCheck, Plus, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { feedApi } from "@/lib/feed/client";
import type { FeedAuthorSummary, TrendingTag } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

/**
 * People worth following, and what the platform is talking about.
 *
 * On a phone this is a horizontal scroller injected into the feed after the
 * first few cards, where it reads as part of the stream. On a desktop the
 * same component fills the right column. One implementation, because the
 * content is identical and two would drift.
 */
export function SuggestedAuthors({
  authors,
  signedIn,
  layout = "row",
}: {
  authors: FeedAuthorSummary[];
  signedIn: boolean;
  layout?: "row" | "column";
}) {
  if (authors.length === 0) return null;

  return (
    <section
      className={cn(
        "border-b border-border bg-background py-3 @lg/ws:rounded-2xl @lg/ws:border",
        layout === "column" && "border @lg/ws:border",
      )}
    >
      <h2 className="px-3 pb-2 text-sm font-semibold text-foreground">
        People worth following
      </h2>

      <div
        className={cn(
          layout === "row"
            ? "flex gap-2 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "space-y-1 px-1.5",
        )}
      >
        {authors.map((author) => (
          <AuthorCard
            key={author.authorKey}
            author={author}
            signedIn={signedIn}
            layout={layout}
          />
        ))}
      </div>
    </section>
  );
}

function AuthorCard({
  author,
  signedIn,
  layout,
}: {
  author: FeedAuthorSummary;
  signedIn: boolean;
  layout: "row" | "column";
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(false);

  async function follow() {
    if (!signedIn) {
      router.push("/login?redirect=/");
      return;
    }
    const next = !following;
    setFollowing(next);

    const result = await feedApi.follow(author.authorKey);
    if (!result.ok) {
      setFollowing(!next);
      toast.error(result.error);
    }
  }

  const button = (
    <button
      type="button"
      onClick={() => void follow()}
      className={cn(
        "flex h-8 items-center justify-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors",
        following
          ? "bg-muted text-muted-foreground"
          : "bg-brand/10 text-brand hover:bg-brand/20",
      )}
    >
      {!following && <Plus className="size-3.5" />}
      {following ? "Following" : "Follow"}
    </button>
  );

  if (layout === "column") {
    return (
      <div className="flex items-center gap-2.5 rounded-xl px-1.5 py-2">
        <Avatar className="shrink-0">
          {author.avatarUrl && <AvatarImage src={author.avatarUrl} alt="" />}
          <AvatarFallback>{initials(author.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-sm font-medium text-foreground">
            {author.name}
            {author.verified && (
              <BadgeCheck className="size-3.5 shrink-0 text-brand" />
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {author.role ?? "Medosha member"}
            {author.contributionScore > 0 &&
              ` · ${author.contributionScore.toLocaleString()} pts`}
          </p>
        </div>
        {button}
      </div>
    );
  }

  return (
    <div className="flex w-36 shrink-0 flex-col items-center gap-1.5 rounded-xl border border-border/60 p-3 text-center">
      <Avatar size="lg" className="shrink-0">
        {author.avatarUrl && <AvatarImage src={author.avatarUrl} alt="" />}
        <AvatarFallback>{initials(author.name)}</AvatarFallback>
      </Avatar>
      <p className="flex w-full items-center justify-center gap-1 text-xs font-semibold text-foreground">
        <span className="truncate">{author.name}</span>
        {author.verified && (
          <BadgeCheck className="size-3.5 shrink-0 text-brand" />
        )}
      </p>
      <p className="line-clamp-2 text-[11px] leading-tight text-muted-foreground">
        {author.role ?? "Medosha member"}
      </p>
      {button}
    </div>
  );
}

/**
 * What is being talked about.
 *
 * Tags rather than a curated topic list, because the tags come from what
 * people actually posted this month and a curated list comes from what
 * somebody guessed in advance.
 */
export function TrendingTags({ tags }: { tags: TrendingTag[] }) {
  if (tags.length === 0) return null;

  return (
    <section className="border-b border-border bg-background px-3 py-3 @lg/ws:rounded-2xl @lg/ws:border">
      <h2 className="flex items-center gap-1.5 pb-2 text-sm font-semibold text-foreground">
        <TrendingUp className="size-4 text-brand" />
        Trending on Medosha
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Link
            key={tag.tag}
            href={`/search?q=${encodeURIComponent(tag.tag)}`}
            className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            #{tag.tag}
            <span className="ml-1 text-[10px] opacity-60 tabular-nums">
              {tag.postCount}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
