"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { CornerDownRight, Send } from "lucide-react";
import { toast } from "sonner";

import { AiField } from "@/components/ai/writing/ai-field";
import { addComment } from "@/app/community/actions";
import { Button } from "@/components/ui/button";
import { AVATAR_PLACEHOLDER } from "@/lib/constants/placeholders";
import { formatRelativeTime } from "@/lib/utils";
import type { CommentRow } from "@/lib/data/community";

/**
 * Comments, one level of nesting.
 *
 * The server returns them flat and they are arranged here: a few hundred rows
 * is nothing to group in memory, and it keeps the read query a plain indexed
 * select rather than a recursive CTE.
 */
export function CommentThread({
  postId,
  comments,
  signedIn,
}: {
  postId: string;
  comments: CommentRow[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const { roots, repliesByParent } = useMemo(() => {
    const roots: CommentRow[] = [];
    const repliesByParent = new Map<string, CommentRow[]>();

    for (const comment of comments) {
      if (comment.parent_id === null) {
        roots.push(comment);
        continue;
      }
      const existing = repliesByParent.get(comment.parent_id);
      if (existing) existing.push(comment);
      else repliesByParent.set(comment.parent_id, [comment]);
    }

    return { roots, repliesByParent };
  }, [comments]);

  return (
    <section>
      <h2 className="text-lg font-semibold">
        Comments <span className="text-muted-foreground">({comments.length})</span>
      </h2>

      <div className="mt-4">
        {signedIn ? (
          <CommentForm postId={postId} onDone={() => router.refresh()} />
        ) : (
          <Link
            href={`/login?redirect=/community/${postId}`}
            className="block rounded-xl border p-4 text-center text-sm font-medium transition-colors hover:border-brand"
          >
            Sign in to comment
          </Link>
        )}
      </div>

      {roots.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No comments yet. Be the first to answer.
        </p>
      ) : (
        <ul className="mt-6 space-y-5">
          {roots.map((comment) => (
            <li key={comment.id}>
              <Comment comment={comment} />

              <div className="mt-2 ml-11">
                {signedIn && (
                  <button
                    type="button"
                    onClick={() =>
                      setReplyTo(replyTo === comment.id ? null : comment.id)
                    }
                    className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {replyTo === comment.id ? "Cancel" : "Reply"}
                  </button>
                )}

                {replyTo === comment.id && (
                  <div className="mt-2">
                    <CommentForm
                      postId={postId}
                      parentId={comment.id}
                      placeholder="Write a reply…"
                      onDone={() => {
                        setReplyTo(null);
                        router.refresh();
                      }}
                    />
                  </div>
                )}

                {(repliesByParent.get(comment.id) ?? []).length > 0 && (
                  <ul className="mt-3 space-y-4 border-l pl-4">
                    {repliesByParent.get(comment.id)!.map((reply) => (
                      <li key={reply.id}>
                        <Comment comment={reply} reply />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Comment({
  comment,
  reply = false,
}: {
  comment: CommentRow;
  reply?: boolean;
}) {
  const author = comment.author;
  const name =
    author?.company_name ?? author?.full_name ?? author?.username ?? "A member";

  return (
    <article className="flex gap-3">
      <Image
        src={author?.avatar_url || AVATAR_PLACEHOLDER}
        alt=""
        width={reply ? 28 : 32}
        height={reply ? 28 : 32}
        className={reply ? "size-7 rounded-full object-cover" : "size-8 rounded-full object-cover"}
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          {reply && (
            <CornerDownRight className="size-3 text-muted-foreground" aria-hidden />
          )}
          {author?.username ? (
            <Link
              href={`/u/${author.username}`}
              className="font-medium hover:underline"
            >
              {name}
            </Link>
          ) : (
            <span className="font-medium">{name}</span>
          )}
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(comment.created_at)}
          </span>
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
          {comment.body}
        </p>
      </div>
    </article>
  );
}

function CommentForm({
  postId,
  parentId,
  placeholder = "Add a comment…",
  onDone,
}: {
  postId: string;
  parentId?: string;
  placeholder?: string;
  onDone: () => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await addComment(postId, body, parentId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setBody("");
      toast.success(parentId ? "Reply posted" : "Comment posted");
      onDone();
    });
  }

  return (
    <form onSubmit={submit}>
      <AiField
        surface="comment"
        // Comments are short and often typed in a hurry — exactly where an
        // unprompted tidy-up earns its place.
        live
        voice={false}
        value={body}
        onValueChange={(next) => {
          setBody(next);
          setError(null);
        }}
        placeholder={placeholder}
        maxLength={5000}
        aria-label={parentId ? "Write a reply" : "Write a comment"}
      />
      {error && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-2 flex justify-end">
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          <Send className="size-3.5" />
          {pending ? "Posting…" : parentId ? "Reply" : "Comment"}
        </Button>
      </div>
    </form>
  );
}
