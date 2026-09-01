"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Globe, Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { DesignSpec } from "../types/spec";

/**
 * Save, then publish.
 *
 * Two steps on purpose. Saving is private and reversible; publishing puts the
 * design on the feed, in the gallery and behind a permanent URL that other
 * people will remix. Collapsing those into one button would mean somebody
 * pressing "save" and finding they had broadcast a half-finished wardrobe to
 * the whole platform.
 *
 * The spec goes up; the price does not. Whatever this browser has computed is
 * recomputed on the server before anything is stored, because a price a client
 * chose is not a price a public page can quote.
 */

type Saved = { id: string; slug: string };

export function PublishBar({
  spec,
  lastBrief,
}: {
  spec: DesignSpec;
  /** The message that produced the current design, kept as the version note. */
  lastBrief: string | null;
}) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cleared whenever the design changes, so the bar never claims a stale save
  // covers the edits made since. Compared by content rather than by reference
  // because every rail edit produces a new object.
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const signature = JSON.stringify(spec);
  const dirty = saved !== null && savedSignature !== signature;

  const post = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/studio/designs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok || typeof payload.error === "string") {
      throw new Error(
        typeof payload.error === "string" ? payload.error : "That did not work.",
      );
    }
    return payload;
  };

  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      const payload = await post({
        action: "save",
        designId: saved?.id,
        spec,
        note: lastBrief,
      });
      setSaved({ id: String(payload.id), slug: String(payload.slug) });
      setSavedSignature(signature);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    if (!saved) return;
    setBusy("publish");
    setError(null);
    try {
      // Publishing an edited design would otherwise put the last saved version
      // on a public page while the screen shows a different one.
      if (dirty) {
        const payload = await post({
          action: "save",
          designId: saved.id,
          spec,
          note: lastBrief,
        });
        setSaved({ id: String(payload.id), slug: String(payload.slug) });
        setSavedSignature(signature);
      }

      const payload = await post({
        action: "publish",
        designId: saved.id,
        visibility: "public",
      });
      setSaved((previous) =>
        previous ? { ...previous, slug: String(payload.slug) } : previous,
      );
      setPublished(true);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={saved && !dirty ? "outline" : "default"}
          className="gap-1.5"
          onClick={save}
          disabled={busy !== null || (saved !== null && !dirty)}
        >
          {busy === "save" ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : saved && !dirty ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Save className="size-3.5" aria-hidden />
          )}
          {saved ? (dirty ? "Save changes" : "Saved") : "Save"}
        </Button>

        {saved ? (
          <Button
            size="sm"
            variant={published && !dirty ? "outline" : "default"}
            className="gap-1.5"
            onClick={publish}
            disabled={busy !== null || (published && !dirty)}
          >
            {busy === "publish" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Globe className="size-3.5" aria-hidden />
            )}
            {published ? (dirty ? "Publish update" : "Published") : "Publish"}
          </Button>
        ) : null}

        {saved ? (
          <Link
            href={`/designs/${saved.slug}`}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground underline"
          >
            Open the page
            <ExternalLink className="size-3" aria-hidden />
          </Link>
        ) : null}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {published && !dirty
          ? "Live on the feed and in the gallery. Anyone can open it and remix it."
          : saved
            ? "Saved privately. Publishing gives it a permanent link and puts it on the feed."
            : "Saving keeps a private copy and starts its version history."}
      </p>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
