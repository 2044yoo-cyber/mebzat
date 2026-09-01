"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Heart, ImagePlus, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";

import { AiRefine } from "@/components/ai/writing/ai-refine";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  compressImage,
  fetchComments,
  feedApi,
  postComment,
} from "@/lib/feed/client";
import type { FeedComment } from "@/lib/feed/types";
import { cn, formatRelativeTime } from "@/lib/utils";

/**
 * The thread under a card.
 *
 * Comments load when the reader opens them, not with the feed: twelve cards
 * carrying their full threads would be most of the payload and almost none of
 * it read.
 *
 * The server returns the tree already flattened in reading order with a depth
 * on every row, so rendering is a map with an indent rather than a recursive
 * component — which matters on a phone, where a deep thread would otherwise
 * mean deep React trees on the main thread while the reader is still
 * scrolling.
 *
 * Indentation stops at two levels. Beyond that a reply on a 390px screen has
 * no room left for words, so deeper replies stay at the second indent and
 * name who they are answering instead.
 */
export function FeedComments({
  postId,
  signedIn,
  viewer,
  autoFocus = false,
}: {
  postId: string;
  signedIn: boolean;
  viewer: { name: string; avatarUrl: string | null } | null;
  autoFocus?: boolean;
}) {
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);

  useEffect(() => {
    let live = true;

    // The fetch is inline rather than in a helper that sets state, so the
    // effect owns its own cancellation and a fast open/close cannot land a
    // stale thread on a different post.
    void fetchComments(postId).then((rows) => {
      if (live) setComments(rows);
    });

    return () => {
      live = false;
    };
  }, [postId]);

  return (
    <div className="border-t border-border/60 bg-muted/20">
      <div className="max-h-[60vh] overflow-y-auto overscroll-contain px-3 py-3">
        {comments === null ? (
          <CommentSkeleton />
        ) : comments.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No comments yet. Say something useful.
          </p>
        ) : (
          <ul className="space-y-3">
            {comments.map((comment) => (
              <li
                key={comment.id}
                style={{ marginInlineStart: `${Math.min(comment.depth, 2) * 20}px` }}
              >
                <CommentRow
                  comment={comment}
                  signedIn={signedIn}
                  onReply={() => setReplyTo(comment)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <Composer
        postId={postId}
        signedIn={signedIn}
        viewer={viewer}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onPosted={(rows) => {
          setComments(rows);
          setReplyTo(null);
        }}
        autoFocus={autoFocus}
      />
    </div>
  );
}

function CommentRow({
  comment,
  signedIn,
  onReply,
}: {
  comment: FeedComment;
  signedIn: boolean;
  onReply: () => void;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(comment.viewerLiked);
  const [likes, setLikes] = useState(comment.likeCount);

  async function like() {
    if (!signedIn) {
      router.push("/login");
      return;
    }
    const next = !liked;
    setLiked(next);
    setLikes((value) => Math.max(0, value + (next ? 1 : -1)));

    const result = await feedApi.likeComment(comment.id);
    if (!result.ok) {
      setLiked(!next);
      setLikes((value) => Math.max(0, value + (next ? -1 : 1)));
      return;
    }
    if (typeof result.count === "number") setLikes(result.count);
  }

  return (
    <div className="flex gap-2">
      <Avatar size="sm" className="mt-0.5 shrink-0">
        {comment.authorAvatarUrl && (
          <AvatarImage src={comment.authorAvatarUrl} alt="" />
        )}
        <AvatarFallback>{initials(comment.authorName)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-sm bg-background px-3 py-2">
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
            <span className="font-semibold text-foreground">
              {comment.authorName}
            </span>
            <span className="text-muted-foreground">
              {formatRelativeTime(comment.createdAt)}
            </span>
            {comment.isDemo && (
              <span className="text-[10px] tracking-wide text-muted-foreground/70 uppercase">
                Sample
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm break-words whitespace-pre-wrap text-foreground/90">
            {comment.body}
          </p>
          {comment.imageUrl && (
            <div className="relative mt-2 aspect-4/3 w-full max-w-64 overflow-hidden rounded-lg bg-muted">
              {/* An inline data: URI, so `next/image` optimisation has nothing
                  to fetch and would only add a proxy hop. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={comment.imageUrl}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            </div>
          )}
        </div>

        <div className="mt-0.5 flex items-center gap-1 pl-1">
          <button
            type="button"
            onClick={() => void like()}
            aria-pressed={liked}
            aria-label={liked ? "Unlike this comment" : "Like this comment"}
            className={cn(
              "flex h-8 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground transition-colors hover:text-foreground",
              liked && "text-rose-500",
            )}
          >
            <Heart className={cn("size-3.5", liked && "fill-current")} />
            {likes > 0 && <span className="tabular-nums">{likes}</span>}
          </button>
          <button
            type="button"
            onClick={onReply}
            className="h-8 rounded-full px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Reply
          </button>
        </div>
      </div>
    </div>
  );
}

function Composer({
  postId,
  signedIn,
  viewer,
  replyTo,
  onCancelReply,
  onPosted,
  autoFocus,
}: {
  postId: string;
  signedIn: boolean;
  viewer: { name: string; avatarUrl: string | null } | null;
  replyTo: FeedComment | null;
  onCancelReply: () => void;
  onPosted: (comments: FeedComment[]) => void;
  autoFocus: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (replyTo) field.current?.focus();
  }, [replyTo]);

  async function attach(file: File | undefined) {
    if (!file) return;
    const compressed = await compressImage(file, 1280, 0.72);
    if (!compressed) {
      toast.error("That image could not be read.");
      return;
    }
    setImage(compressed);
  }

  async function send() {
    if (!signedIn) {
      router.push(`/login?redirect=${encodeURIComponent(`/p/${postId}`)}`);
      return;
    }
    const body = text.trim();
    if (body.length === 0 || sending) return;

    setSending(true);
    const result = await postComment({
      postId,
      parentId: replyTo?.id ?? null,
      body,
      imageUrl: image,
    });
    setSending(false);

    if (!result.ok) {
      toast.error(result.error);
      if (result.needsAuth) router.push("/login");
      return;
    }

    setText("");
    setImage(null);
    onPosted(result.comments);
  }

  return (
    <div className="border-t border-border/60 bg-background/60 px-3 py-2">
      {replyTo && (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          Replying to{" "}
          <span className="font-medium text-foreground">
            {replyTo.authorName}
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="flex size-6 items-center justify-center rounded-full hover:bg-muted"
          >
            <X className="size-3.5" />
          </button>
        </p>
      )}

      {image && (
        <div className="relative mb-2 aspect-4/3 w-28 overflow-hidden rounded-lg bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="size-full object-cover" />
          <button
            type="button"
            onClick={() => setImage(null)}
            aria-label="Remove image"
            className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <Avatar size="sm" className="mb-1 shrink-0">
          {viewer?.avatarUrl && <AvatarImage src={viewer.avatarUrl} alt="" />}
          <AvatarFallback>{initials(viewer?.name ?? "?")}</AvatarFallback>
        </Avatar>

        <textarea
          ref={field}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends on a keyboard; Shift+Enter is a newline. A phone
            // keyboard's Enter inserts a newline as usual — `metaKey` and the
            // absence of `shiftKey` are what distinguish the two.
            if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              void send();
            }
          }}
          rows={1}
          autoFocus={autoFocus}
          placeholder={replyTo ? "Write a reply…" : "Add a comment…"}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-brand"
        />

        <input
          ref={picker}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void attach(event.target.files?.[0]);
            event.target.value = "";
          }}
        />

        <button
          type="button"
          onClick={() => picker.current?.click()}
          aria-label="Attach a photo"
          className="mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ImagePlus className="size-5" />
        </button>

        {/* The writing assistant, on the comment surface. Nothing is applied
            until the author accepts the suggestion. The wrapper gives it the
            same 40px target as the buttons either side of it. */}
        <div className="mb-0.5 flex size-10 shrink-0 items-center justify-center">
          <AiRefine
            surface="comment"
            value={text}
            onAccept={setText}
            actions={["improve", "professional", "shorten", "translate"]}
          />
        </div>

        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || text.trim().length === 0}
          aria-label="Post comment"
          className="mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground transition-opacity disabled:opacity-40"
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}

function CommentSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-2">
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-10 w-full rounded-2xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
