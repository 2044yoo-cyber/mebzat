"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bookmark,
  Copy,
  EyeOff,
  Flag,
  Heart,
  Link2,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Share2,
} from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { feedApi } from "@/lib/feed/client";
import type { FeedPost } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

/**
 * The row of buttons under every card.
 *
 * Like and save flip immediately and revert if the server disagrees: both are
 * cheap, both are reversible, and a heart that waits 400 ms for a round trip
 * feels broken on a phone.
 *
 * Every target is at least 40px tall. That is the smallest thing a thumb hits
 * reliably, and this row sits where the thumb naturally rests.
 */
export function FeedActions({
  post,
  signedIn,
  onOpenComments,
  onHidden,
  commentsOpen,
}: {
  post: FeedPost;
  signedIn: boolean;
  onOpenComments: () => void;
  onHidden: (postId: string) => void;
  commentsOpen: boolean;
}) {
  const router = useRouter();

  const [liked, setLiked] = useState(post.viewerLiked);
  const [likes, setLikes] = useState(post.likeCount);
  const [saved, setSaved] = useState(post.viewerSaved);
  const [busy, setBusy] = useState(false);

  function requireAccount(): boolean {
    if (signedIn) return true;
    router.push(`/login?redirect=${encodeURIComponent(`/p/${post.id}`)}`);
    return false;
  }

  async function toggleLike() {
    if (!requireAccount() || busy) return;

    const next = !liked;
    setLiked(next);
    setLikes((value) => Math.max(0, value + (next ? 1 : -1)));
    setBusy(true);

    const result = await feedApi.like(post.id);
    setBusy(false);

    if (!result.ok) {
      setLiked(!next);
      setLikes((value) => Math.max(0, value + (next ? -1 : 1)));
      toast.error(result.error);
      return;
    }
    // The server's count is authoritative — it includes everyone else's
    // likes since this card was rendered.
    if (typeof result.count === "number") setLikes(result.count);
  }

  async function toggleSave() {
    if (!requireAccount() || busy) return;

    const next = !saved;
    setSaved(next);
    setBusy(true);

    const result = await feedApi.save(post.id);
    setBusy(false);

    if (!result.ok) {
      setSaved(!next);
      toast.error(result.error);
      return;
    }
    toast.success(next ? "Saved" : "Removed from saved");
  }

  function permalink(): string {
    if (typeof window === "undefined") return `/p/${post.id}`;
    return new URL(`/p/${post.id}`, window.location.origin).toString();
  }

  async function share() {
    const url = permalink();

    // The native sheet on a phone, which is what people expect and which
    // reaches Telegram and WhatsApp without us integrating either.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: post.title, url });
        void feedApi.share(post.id);
        return;
      } catch {
        // Dismissed, or not permitted in this context. Fall through to the
        // clipboard so the button always does something.
      }
    }

    await copyLink();
  }

  async function copyLink() {
    const url = permalink();
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
      void feedApi.share(post.id);
    } catch {
      toast.error("Could not copy the link.");
    }
  }

  async function hide() {
    if (!requireAccount()) return;
    const result = await feedApi.hide(post.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onHidden(post.id);
    toast.success("You will see less like this");
  }

  async function report(reason: string) {
    if (!requireAccount()) return;
    const result = await feedApi.report(post.id, reason);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onHidden(post.id);
    toast.success("Reported. Thank you — we will look at it.");
  }

  function message() {
    if (!requireAccount()) return;
    // Real members have an inbox. Seeded authors do not, and sending someone
    // to a conversation that cannot exist is worse than saying so.
    if (!post.authorId) {
      toast.info("This is demonstration content — there is no inbox behind it.");
      return;
    }
    router.push(`/messages?to=${post.authorId}`);
  }

  return (
    <div className="flex items-center gap-0.5 px-1 py-1">
      <Action
        onClick={toggleLike}
        active={liked}
        label={liked ? "Unlike" : "Like"}
        count={likes}
        activeClassName="text-rose-500"
      >
        <Heart className={cn("size-5", liked && "fill-current")} />
      </Action>

      <Action
        onClick={onOpenComments}
        active={commentsOpen}
        label="Comments"
        count={post.commentCount}
      >
        <MessageCircle className="size-5" />
      </Action>

      <Action onClick={share} label="Share" count={post.shareCount}>
        <Share2 className="size-5" />
      </Action>

      <Action
        onClick={toggleSave}
        active={saved}
        label={saved ? "Remove from saved" : "Save"}
        activeClassName="text-brand"
      >
        <Bookmark className={cn("size-5", saved && "fill-current")} />
      </Action>

      <span className="flex-1" />

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More actions"
          className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MoreHorizontal className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={copyLink}>
            <Link2 className="size-4" />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={share}>
            <Copy className="size-4" />
            Share
          </DropdownMenuItem>
          <DropdownMenuItem onClick={message}>
            <MessageSquare className="size-4" />
            Message {post.authorName.split(" ")[0]}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={hide}>
            <EyeOff className="size-4" />
            Not interested
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => report("spam")}
            className="text-destructive"
          >
            <Flag className="size-4" />
            Report
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Action({
  children,
  onClick,
  label,
  count,
  active = false,
  activeClassName,
}: {
  children: React.ReactNode;
  onClick: () => void | Promise<void>;
  label: string;
  count?: number;
  active?: boolean;
  activeClassName?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95",
        active && (activeClassName ?? "text-foreground"),
      )}
    >
      {children}
      {count != null && count > 0 && (
        <span className="text-xs font-medium tabular-nums">
          {compact(count)}
        </span>
      )}
    </button>
  );
}

/** 1_240 → "1.2k". A five-digit like count is noise on a 390px screen. */
function compact(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) {
    const thousands = value / 1000;
    return `${thousands < 10 ? thousands.toFixed(1) : Math.round(thousands)}k`;
  }
  return `${(value / 1_000_000).toFixed(1)}m`;
}
