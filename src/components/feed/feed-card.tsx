"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Download,
  FileSpreadsheet,
  FileText,
  MapPin,
  Plus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { FeedActions } from "@/components/feed/feed-actions";
import { FeedComments } from "@/components/feed/feed-comments";
import { FeedMedia } from "@/components/feed/feed-media";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { feedApi } from "@/lib/feed/client";
import { FILE_LABEL, KIND_LABEL } from "@/lib/feed/constants";
import type { FeedFile, FeedPost } from "@/lib/feed/types";
import { cn, formatPrice, formatRelativeTime } from "@/lib/utils";

/**
 * One card in the feed.
 *
 * A single component rather than twenty-three: every kind shares the same
 * header, the same media and the same action row, and only the strip between
 * the text and the buttons differs. Twenty-three card components would mean
 * twenty-three copies of the header to keep in step.
 *
 * Long bodies clamp to five lines with a "more" control instead of a modal.
 * On a phone a modal costs a navigation to read one extra paragraph, and the
 * scroll position afterwards is somebody's problem.
 */
export function FeedCard({
  post,
  signedIn,
  viewer,
  priority = false,
  onHidden,
}: {
  post: FeedPost;
  signedIn: boolean;
  viewer: { name: string; avatarUrl: string | null } | null;
  priority?: boolean;
  /**
   * Removes the card from the list it sits in. Omitted on the permalink
   * page, where there is no list and hiding would leave a blank screen —
   * and where a function prop could not cross the server boundary anyway.
   */
  onHidden?: (postId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const long = (post.body?.length ?? 0) > 220;

  return (
    <article
      data-feed-post={post.id}
      className="overflow-hidden border-b border-border bg-background @lg/ws:rounded-2xl @lg/ws:border"
    >
      <Header post={post} signedIn={signedIn} />

      <div className="px-3 pb-2">
        <h2 className="text-[15px] leading-snug font-semibold text-foreground">
          {post.linkHref ? (
            <Link href={post.linkHref} className="hover:underline">
              {post.title}
            </Link>
          ) : (
            post.title
          )}
        </h2>

        {post.body && (
          <p
            className={cn(
              "mt-1 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground",
              !expanded && long && "line-clamp-5",
            )}
          >
            {post.body}
          </p>
        )}

        {long && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-1 h-8 text-sm font-medium text-brand"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {post.media.length > 0 && (
        <FeedMedia media={post.media} priority={priority} />
      )}

      <Detail post={post} />

      {post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2">
          {post.tags.slice(0, 5).map((tag) => (
            <Link
              key={tag}
              href={`/search?q=${encodeURIComponent(tag)}`}
              className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}

      <FeedActions
        post={post}
        signedIn={signedIn}
        commentsOpen={commentsOpen}
        onOpenComments={() => setCommentsOpen((value) => !value)}
        onHidden={onHidden ?? noop}
      />

      {commentsOpen && (
        <FeedComments
          postId={post.id}
          signedIn={signedIn}
          viewer={viewer}
          autoFocus
        />
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({ post, signedIn }: { post: FeedPost; signedIn: boolean }) {
  const router = useRouter();
  const [following, setFollowing] = useState(post.viewerFollows);
  const [busy, setBusy] = useState(false);

  async function toggleFollow() {
    if (!signedIn) {
      router.push("/login?redirect=/");
      return;
    }
    if (busy) return;

    const next = !following;
    setFollowing(next);
    setBusy(true);

    const result = await feedApi.follow(post.authorKey);
    setBusy(false);

    if (!result.ok) {
      setFollowing(!next);
      toast.error(result.error);
      return;
    }
    toast.success(next ? `Following ${post.authorName}` : "Unfollowed");
  }

  // Real members have a profile page, keyed on their username. A seeded
  // author does not, so their name is text rather than a link that would 404.
  const profileHref = post.authorUsername ? `/u/${post.authorUsername}` : null;

  return (
    <header className="flex items-start gap-2.5 px-3 pt-3 pb-2">
      <Avatar size="lg" className="shrink-0">
        {post.authorAvatarUrl && (
          <AvatarImage src={post.authorAvatarUrl} alt="" />
        )}
        <AvatarFallback>{initials(post.authorName)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-sm leading-tight font-semibold text-foreground">
          {profileHref ? (
            <Link href={profileHref} className="truncate hover:underline">
              {post.authorName}
            </Link>
          ) : (
            <span className="truncate">{post.authorName}</span>
          )}
          {post.authorVerified && (
            <BadgeCheck
              className="size-4 shrink-0 text-brand"
              aria-label="Verified"
            />
          )}
        </p>

        {/* Role and time only. The author's home city used to sit between
            them and pushed this onto a second row on a 390px screen — and it
            is not where the post is anyway; the strip below carries that. */}
        <p className="flex items-center gap-x-1.5 overflow-hidden text-xs text-muted-foreground">
          {post.authorRole && <span className="truncate">{post.authorRole}</span>}
          <span aria-hidden>·</span>
          <span className="shrink-0">{formatRelativeTime(post.publishedAt)}</span>
          {post.isDemo && (
            <>
              <span aria-hidden>·</span>
              {/* Seeded content is labelled. Small, but it should never be
                  possible to mistake demonstration data for a real listing
                  or a real person's work. */}
              <span className="tracking-wide uppercase">Sample</span>
            </>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground @lg/ws:inline">
          {KIND_LABEL[post.kind]}
        </span>
        <button
          type="button"
          onClick={() => void toggleFollow()}
          className={cn(
            "flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors",
            following
              ? "bg-muted text-muted-foreground"
              : "bg-brand/10 text-brand hover:bg-brand/20",
          )}
        >
          {!following && <Plus className="size-3.5" />}
          {following ? "Following" : "Follow"}
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// The kind-specific strip
// ---------------------------------------------------------------------------

function Detail({ post }: { post: FeedPost }) {
  switch (post.kind) {
    case "property":
    case "investment":
      return <CommerceStrip post={post} accent />;

    case "material":
    case "furniture":
    case "equipment":
      return <CommerceStrip post={post} />;

    case "price_update":
      return <PriceStrip post={post} />;

    case "document":
    case "boq_template":
    case "floor_plan":
      return <FilesStrip post={post} />;

    default:
      return post.linkHref ? <LinkStrip post={post} /> : null;
  }
}

function CommerceStrip({ post, accent = false }: { post: FeedPost; accent?: boolean }) {
  return (
    <div
      className={cn(
        "mx-3 mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5",
        accent ? "bg-brand/8" : "bg-muted/60",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-base leading-tight font-semibold text-foreground">
          {formatPrice(post.priceAmount, post.priceCurrency)}
          {post.priceUnit && post.priceUnit !== "total" && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {post.priceUnit}
            </span>
          )}
        </p>
        {place(post) && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" />
            <span className="truncate">{place(post)}</span>
          </p>
        )}
      </div>

      {post.linkHref && (
        <Link
          href={post.linkHref}
          className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-brand px-3.5 text-xs font-semibold text-brand-foreground"
        >
          {post.linkLabel ?? "View"}
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

function PriceStrip({ post }: { post: FeedPost }) {
  const change = post.priceChange ?? 0;
  const rising = change > 0;
  const flat = change === 0;

  return (
    <div className="mx-3 mt-2 flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-base leading-tight font-semibold text-foreground">
          {formatPrice(post.priceAmount, post.priceCurrency)}
          {post.priceUnit && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {post.priceUnit}
            </span>
          )}
        </p>
        <p
          className={cn(
            "mt-0.5 flex items-center gap-1 text-xs font-medium",
            flat
              ? "text-muted-foreground"
              : rising
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {!flat &&
            (rising ? (
              <TrendingUp className="size-3.5" />
            ) : (
              <TrendingDown className="size-3.5" />
            ))}
          {flat
            ? "No change this week"
            : `${rising ? "+" : ""}${change.toFixed(1)}% this week`}
        </p>
      </div>

      {post.linkHref && (
        <Link
          href={post.linkHref}
          className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-border px-3.5 text-xs font-semibold text-foreground"
        >
          {post.linkLabel ?? "Prices"}
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

function FilesStrip({ post }: { post: FeedPost }) {
  if (post.files.length === 0) {
    return post.linkHref ? <LinkStrip post={post} /> : null;
  }

  return (
    <div className="mx-3 mt-2 space-y-1.5">
      {post.files.map((file) => (
        <FileRow key={file.id} file={file} />
      ))}
    </div>
  );
}

function FileRow({ file }: { file: FeedFile }) {
  const [downloads, setDownloads] = useState(file.downloadCount);

  const Icon = file.fileKind === "excel" ? FileSpreadsheet : FileText;

  return (
    <a
      href={file.url}
      download={file.name}
      onClick={() => {
        setDownloads((value) => value + 1);
        void feedApi.download(file.id);
      }}
      className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5 transition-colors hover:bg-muted"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-brand">
        <Icon className="size-4.5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {file.name}
        </span>
        <span className="block text-xs text-muted-foreground">
          {FILE_LABEL[file.fileKind]}
          {file.sizeBytes != null && ` · ${fileSize(file.sizeBytes)}`}
          {downloads > 0 && ` · ${downloads.toLocaleString()} downloads`}
        </span>
      </span>

      <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground">
        <Download className="size-4.5" />
      </span>
    </a>
  );
}

function LinkStrip({ post }: { post: FeedPost }) {
  if (!post.linkHref) return null;
  return (
    <div className="px-3 pt-2">
      <Link
        href={post.linkHref}
        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-muted/60 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
      >
        {post.linkLabel ?? "Open"}
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

function noop() {}

/**
 * "Addis Ababa" rather than "Addis Ababa, Addis Ababa".
 *
 * The chartered cities are their own region, so joining the two fields
 * blindly repeats the name on every listing in the capital.
 */
function place(post: FeedPost): string {
  const parts = [post.city, post.region].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return [...new Set(parts)].join(", ");
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
