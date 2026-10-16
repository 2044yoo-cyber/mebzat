"use client";

import Link from "next/link";
import { Share2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Shares the public profile (/u/<username>) — the page other people see,
 * never this one, which shows the owner their drafts.
 */
export function ShareProfileButton({ username, name, className }: { username: string | null; name: string; className?: string }) {
  if (!username) {
    return (
      // No username, no public address yet: say so rather than share nothing.
      <Link href="/profile/edit" className={className}>
        <Share2 className="size-4" aria-hidden />Set a username to share
      </Link>
    );
  }
  const share = async () => {
    const url = `${window.location.origin}/u/${encodeURIComponent(username)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${name} on Medosha`, url });
        return;
      }
    } catch (error) {
      // Closing the share sheet is a choice, not a failure.
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Profile link copied.");
    } catch {
      toast.info(url, { description: "Copy this link to share your profile." });
    }
  };
  return (
    <button type="button" onClick={() => void share()} className={className}>
      <Share2 className="size-4" aria-hidden />Share profile
    </button>
  );
}
