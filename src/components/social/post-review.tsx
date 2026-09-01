"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  Pencil,
  Send,
  Sparkles,
  X,
} from "lucide-react";

import {
  approvePost,
  cancelPost,
  schedulePost,
  toggleVersion,
  unapprovePost,
  updateVersion,
} from "@/lib/actions/content";
import { PLATFORM_SPECS } from "@/lib/social/platforms";
import {
  STATUS_LABEL,
  STATUS_TONE,
  canApprove,
  canCancel,
  canEdit,
  canPublishNow,
  canSchedule,
  nextStep,
} from "@/lib/social/lifecycle";
import { safeImageSrc } from "@/lib/images/safe-src";
import { cn } from "@/lib/utils";
import type { AiContentPost, AiContentVersion } from "@/types/database.types";

/**
 * Reviewing what the AI wrote, before any of it leaves Medosha.
 *
 * Every version is shown in full — not a summary, not the first line with a
 * "view more". Somebody is about to put these words on their business's
 * Facebook Page under their own name, and a preview that hides half the text
 * is a preview that gets approved without being read.
 *
 * The order of the buttons is the order of the decision: read, edit if it is
 * wrong, then approve. Publish Now is last and is not the primary action, even
 * though it is the exciting one.
 */

type Props = {
  post: AiContentPost;
  versions: AiContentVersion[];
  /** Null when the site has automatic publishing switched off. */
  autoPublishAvailable: boolean;
};

export function PostReview({ post, versions, autoPublishAvailable }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Null when closed. When open it carries the default time, computed in the
  // click handler below — the only place a clock may be read.
  const [scheduling, setScheduling] = useState<string | null>(null);

  const edited = versions.some((version) => version.edited);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "That did not work.");
    });
  }

  return (
    <div className="space-y-4">
      {/* ---- Where it is ------------------------------------------------- */}
      <div className="rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn("size-2 rounded-full", STATUS_TONE[post.status])}
            aria-hidden
          />
          <span className="text-sm font-medium">{STATUS_LABEL[post.status]}</span>

          {post.credits_spent > 0 ? (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {post.credits_spent} credits
            </span>
          ) : null}
        </div>

        <p className="mt-2 text-sm text-muted-foreground">{nextStep(post.status)}</p>

        {post.scheduled_for ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" aria-hidden />
            {new Date(post.scheduled_for).toLocaleString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {!autoPublishAvailable ? (
              // Said plainly rather than left to be discovered. A time shown
              // beside a post implies something will happen at it.
              <span className="text-amber-600 dark:text-amber-400">
                — automatic publishing is off, so you will be reminded to
                publish it yourself
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      {/* ---- The picture ------------------------------------------------- */}
      {post.image_url ? (
        <figure className="overflow-hidden rounded-xl border">
          <div className="relative aspect-[4/3] bg-muted">
            <Image
              src={safeImageSrc(post.image_url) ?? ""}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 640px"
              className="object-cover"
              unoptimized
            />
          </div>

          {/* The label is not decoration. A generated picture attached to a
              real listing has to say so, and the database's check constraint
              is what makes `image_origin` reliable enough to draw it from. */}
          {post.image_origin === "ai_generated" ? (
            <figcaption className="flex items-center gap-1.5 border-t bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
              <Sparkles className="size-3.5 shrink-0" aria-hidden />
              AI-generated image. It is not a photograph of this property — do
              not present it as one.
            </figcaption>
          ) : post.image_origin === "listing_photo" ? (
            <figcaption className="border-t px-3 py-2 text-xs text-muted-foreground">
              The listing&rsquo;s own photograph.
            </figcaption>
          ) : null}
        </figure>
      ) : null}

      {/* ---- The versions ------------------------------------------------ */}
      <div className="space-y-3">
        {versions.map((version) => (
          <VersionCard
            key={version.id}
            version={version}
            editable={canEdit(post.status)}
            onSaved={() => setError(null)}
            onError={setError}
          />
        ))}
      </div>

      {error ? (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {/* ---- What happens next ------------------------------------------- */}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        {canApprove(post.status) ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => approvePost(post.id))}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Check className="size-4" aria-hidden />
            )}
            Approve
          </button>
        ) : null}

        {post.status === "approved" || post.status === "scheduled" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => unapprovePost(post.id))}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Pencil className="size-4" aria-hidden />
            Edit again
          </button>
        ) : null}

        {canSchedule(post.status) ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              setScheduling((open) =>
                open === null
                  ? new Date(Date.now() + 24 * 60 * 60 * 1000)
                      .toISOString()
                      .slice(0, 16)
                  : null,
              )
            }
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Clock className="size-4" aria-hidden />
            {post.scheduled_for ? "Reschedule" : "Schedule"}
          </button>
        ) : null}

        {canPublishNow(post.status) ? (
          <PublishNow postId={post.id} disabled={pending} onError={setError} />
        ) : null}

        {canCancel(post.status) ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => cancelPost(post.id))}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
          >
            <X className="size-4" aria-hidden />
            Cancel
          </button>
        ) : null}
      </div>

      {scheduling !== null ? (
        <ScheduleForm
          postId={post.id}
          current={
            post.scheduled_for
              ? new Date(post.scheduled_for).toISOString().slice(0, 16)
              : null
          }
          initial={scheduling}
          onDone={() => setScheduling(null)}
          onError={setError}
        />
      ) : null}

      {edited && post.status !== "published" ? (
        <p className="text-xs text-muted-foreground">
          You have edited this post. Regenerating would replace your words.
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function VersionCard({
  version,
  editable,
  onSaved,
  onError,
}: {
  version: AiContentVersion;
  editable: boolean;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const spec = PLATFORM_SPECS[version.platform];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(version.body);
  const [pending, startTransition] = useTransition();

  const length = draft.length;
  const over = length > spec.maxLength;

  return (
    <div className="rounded-xl border">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <span className="text-sm font-medium">{spec.label}</span>

        {version.edited ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            edited by you
          </span>
        ) : null}

        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={version.enabled}
            disabled={!editable || pending}
            onChange={(event) =>
              startTransition(async () => {
                const result = await toggleVersion(
                  version.id,
                  event.target.checked,
                );
                if (!result.ok) onError(result.error);
              })
            }
            className="size-3.5 accent-brand"
          />
          include
        </label>
      </div>

      <div className="p-3">
        {editing ? (
          <>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={8}
              className="w-full resize-y rounded-lg border bg-background p-2 text-sm"
            />
            <div className="mt-2 flex items-center gap-2">
              <span
                className={cn(
                  "text-xs tabular-nums",
                  over ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {length} / {spec.maxLength}
                {over ? ` — ${spec.label} will reject this` : ""}
              </span>

              <button
                type="button"
                disabled={pending || over || draft.trim().length === 0}
                onClick={() =>
                  startTransition(async () => {
                    const result = await updateVersion(
                      version.id,
                      draft,
                      version.hashtags,
                    );
                    if (result.ok) {
                      setEditing(false);
                      onSaved();
                    } else {
                      onError(result.error);
                    }
                  })
                }
                className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(version.body);
                  setEditing(false);
                }}
                className="rounded-lg border px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {/* The whole thing, wrapped. Not truncated: this is the text that
                is about to be published under somebody's name. */}
            <p className="text-sm whitespace-pre-wrap">{version.body}</p>

            {version.hashtags.length > 0 ? (
              <p className="mt-2 text-sm text-brand">
                {version.hashtags.map((tag) => `#${tag}`).join(" ")}
              </p>
            ) : null}

            {editable ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Pencil className="size-3.5" aria-hidden />
                Edit this version
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ScheduleForm({
  postId,
  current,
  initial,
  onDone,
  onError,
}: {
  postId: string;
  /** The post's existing time as a datetime-local string, or null. */
  current: string | null;
  /** "Tomorrow", computed by the click that opened this. */
  initial: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  // The default arrives as a prop, already computed.
  //
  // It has to be "tomorrow", which means reading the clock — and the clock is
  // impure, so it can be read neither during render nor in an effect. The one
  // place it can be read is the event handler that opened this panel, so that
  // is where the parent reads it.
  const [when, setWhen] = useState(current ?? initial);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border p-3">
      <label className="flex-1">
        <span className="block text-xs text-muted-foreground">
          Publish at
        </span>
        <input
          type="datetime-local"
          value={when}
          onChange={(event) => setWhen(event.target.value)}
          className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
        />
      </label>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await schedulePost(postId, when);
            if (result.ok) onDone();
            else onError(result.error);
          })
        }
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Saving…" : "Schedule"}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Publish Now.
 *
 * Deliberately not a primary button and deliberately behind a confirmation.
 * Everything else on this screen is reversible; this one puts words on
 * somebody else's platform, where Medosha cannot take them back.
 */
function PublishNow({
  postId,
  disabled,
  onError,
}: {
  postId: string;
  disabled: boolean;
  onError: (message: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-50"
      >
        <Send className="size-4" aria-hidden />
        Publish now
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-sm">
      <span className="text-xs">Publish to the included platforms?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const response = await fetch(`/api/social/publish`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ postId }),
            });
            const payload = (await response.json().catch(() => null)) as
              | { error?: string }
              | null;
            if (!response.ok) {
              onError(payload?.error ?? "Publishing failed.");
            }
            setConfirming(false);
          })
        }
        className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Publishing…" : "Yes, publish"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-muted-foreground"
      >
        No
      </button>
    </span>
  );
}
