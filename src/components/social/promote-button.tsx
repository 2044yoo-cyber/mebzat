"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Sparkles, X } from "lucide-react";

import {
  CONTENT_CATEGORIES,
  PLATFORM_SPECS,
  type SocialPlatform,
} from "@/lib/social/platforms";
import { cn } from "@/lib/utils";

/**
 * "Promote with AI", wherever it appears.
 *
 * One component for the property page, the product page, the project page and
 * the company profile — the only difference between them is `sourceType`,
 * `sourceId` and the words on the button. Four near-identical composers is how
 * the property one ends up with a fix the product one never gets.
 *
 * The button is hidden from members who cannot use the feature, but that is
 * courtesy rather than security: `/api/social/generate` checks the plan itself
 * and refuses with a 402, so the control being visible or not changes nothing
 * about who can actually spend credits.
 */

type Props = {
  sourceType: "property" | "product" | "project" | "company" | "service" | "profile";
  sourceId: string;
  /** "Promote with AI", "Create Project Post", "Promote Product"… */
  label?: string;
  /** What the composer starts with, so the common case is one click. */
  suggestedBrief: string;
  suggestedCategory?: string;
  /** Platforms this site actually offers, from the server. */
  available: SocialPlatform[];
  /** False for a plan without AI posting. Hides the button. */
  eligible: boolean;
  className?: string;
};

export function PromoteButton({
  sourceType,
  sourceId,
  label = "Promote with AI",
  suggestedBrief,
  suggestedCategory,
  available,
  eligible,
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  if (!eligible || available.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-brand/40 bg-brand/5 px-3 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/10",
          className,
        )}
      >
        <Sparkles className="size-4" aria-hidden />
        {label}
      </button>

      {open ? (
        <Composer
          sourceType={sourceType}
          sourceId={sourceId}
          suggestedBrief={suggestedBrief}
          suggestedCategory={suggestedCategory}
          available={available}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function Composer({
  sourceType,
  sourceId,
  suggestedBrief,
  suggestedCategory,
  available,
  onClose,
}: {
  sourceType: Props["sourceType"];
  sourceId: string;
  suggestedBrief: string;
  suggestedCategory?: string;
  available: SocialPlatform[];
  onClose: () => void;
}) {
  const router = useRouter();

  const [brief, setBrief] = useState(suggestedBrief);
  const [category, setCategory] = useState(suggestedCategory ?? "");
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(available);
  const [generateImage, setGenerateImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy || brief.trim().length < 3 || platforms.length === 0) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/social/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brief: brief.trim(),
          platforms,
          category: category || undefined,
          sourceType,
          sourceId,
          generateImage,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { id?: string; error?: string }
        | null;

      if (!response.ok || !payload?.id) {
        // The route's message already names the plan or the balance where
        // that is the problem, so it is shown as it arrives rather than
        // replaced with something vaguer.
        setError(payload?.error ?? "Medosha AI could not write the post.");
        return;
      }

      // Straight to the review screen. The post is not published and will not
      // be until it is approved there — going anywhere else would leave
      // somebody wondering whether it had gone out.
      router.push(`/studio/content/${payload.id}`);
    } catch {
      setError("The connection dropped. Try again — you have not been charged.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Create a post with Medosha AI"
    >
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border bg-background p-4 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-2">
          <h2 className="flex items-center gap-1.5 font-semibold">
            <Sparkles className="size-4 text-brand" aria-hidden />
            Create with Medosha AI
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        <label className="mt-4 block">
          <span className="text-sm font-medium">What should the post say?</span>
          <textarea
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            rows={3}
            className="mt-1 w-full resize-y rounded-lg border bg-background p-2 text-sm"
            placeholder="Promote this property on social media."
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            The facts come from the listing itself — price, size, bedrooms.
            Medosha AI will not invent anything the record does not have.
          </span>
        </label>

        <label className="mt-3 block">
          <span className="text-sm font-medium">Kind of post</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Let Medosha decide</option>
            {CONTENT_CATEGORIES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.group} — {entry.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="mt-3">
          <legend className="text-sm font-medium">Where it goes</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {available.map((platform) => {
              const on = platforms.includes(platform);
              return (
                <button
                  key={platform}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setPlatforms((current) =>
                      on
                        ? current.filter((entry) => entry !== platform)
                        : [...current, platform],
                    )
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    on
                      ? "border-brand bg-brand text-brand-foreground"
                      : "hover:border-brand hover:bg-brand/5",
                  )}
                >
                  {PLATFORM_SPECS[platform].label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            One generation, one charge — each platform gets its own wording.
          </p>
        </fieldset>

        <label className="mt-3 flex items-start gap-2">
          <input
            type="checkbox"
            checked={generateImage}
            onChange={(event) => setGenerateImage(event.target.checked)}
            className="mt-0.5 size-4 accent-brand"
          />
          <span className="text-sm">
            Generate an image
            <span className="block text-xs text-muted-foreground">
              Only used when the listing has no photographs of its own. A real
              photo is always preferred, and a generated one is labelled.
            </span>
          </span>
        </label>

        {error ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy || brief.trim().length < 3 || platforms.length === 0}
            onClick={submit}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Writing…
              </>
            ) : (
              <>
                <Sparkles className="size-4" aria-hidden />
                Create post
              </>
            )}
          </button>
        </div>

        <p className="mt-2 text-center text-xs text-muted-foreground">
          You will review everything before anything is published.
        </p>
      </div>
    </div>
  );
}
