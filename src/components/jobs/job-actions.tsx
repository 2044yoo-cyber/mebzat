"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bookmark, Flag, Share2 } from "lucide-react";
import { toast } from "sonner";

import { toggleSavedJob } from "@/app/jobs/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Save, share, report.
 *
 * Saving is private — nobody is told, and no count is shown, because how many
 * people are interested in a job is exactly the thing an applicant should not
 * be able to see before deciding whether to apply.
 */
export function JobActions({
  jobId,
  title,
  saved,
  signedIn,
}: {
  jobId: string;
  title: string;
  saved: boolean;
  signedIn: boolean;
}) {
  const [isSaved, setIsSaved] = useState(saved);
  const [pending, startTransition] = useTransition();

  function permalink(): string {
    if (typeof window === "undefined") return `/jobs/${jobId}`;
    return new URL(`/jobs/${jobId}`, window.location.origin).toString();
  }

  function save() {
    startTransition(async () => {
      const result = await toggleSavedJob(jobId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setIsSaved(result.saved === true);
      toast.success(result.saved ? "Saved" : "Removed from saved");
    });
  }

  async function share() {
    const url = permalink();

    // The native sheet on a phone reaches Telegram and WhatsApp without us
    // integrating either, which is how jobs actually get passed around here.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Dismissed, or not permitted. Fall through so the button always does
        // something.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy the link.");
    }
  }

  /** Built on click, not during render: the URL only exists in the browser. */
  function report() {
    const body = encodeURIComponent(
      `I would like to report this job posting:\n\n${title}\n${permalink()}\n\nWhat is wrong with it:\n`,
    );
    window.location.href = `mailto:support@medosha.net?subject=${encodeURIComponent(
      "Reported job",
    )}&body=${body}`;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {signedIn ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={save}
          aria-pressed={isSaved}
        >
          <Bookmark
            className={cn("size-4", isSaved && "fill-current text-brand")}
          />
          {isSaved ? "Saved" : "Save"}
        </Button>
      ) : (
        <Link
          href={`/login?redirect=${encodeURIComponent(`/jobs/${jobId}`)}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Bookmark className="size-4" />
          Save
        </Link>
      )}

      {/* One icon in both renders. Branching on `navigator.share` here would
          draw a different button on the server than in the browser. */}
      <Button type="button" variant="outline" size="sm" onClick={share}>
        <Share2 className="size-4" />
        Share
      </Button>

      {/* No moderation queue exists yet, so this goes to the people who can
          actually act on it rather than into a table nobody reads. */}
      <Button type="button" variant="ghost" size="sm" onClick={report}>
        <Flag className="size-4" />
        Report
      </Button>
    </div>
  );
}
