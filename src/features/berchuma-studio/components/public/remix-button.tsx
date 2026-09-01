"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitFork, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Take somebody's design as a starting point.
 *
 * The button sends an id and nothing else. Lineage, ownership and the counters
 * are set inside `berchuma_remix` — a client that posted its own parentage was
 * the security hole found in phase 1, and the fix was to make the client
 * unable to say anything about it.
 */
export function RemixButton({
  designId,
  title,
}: {
  designId: string;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remix = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/studio/designs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "remix",
          designId,
          title: `${title} (remix)`,
        }),
      });
      const payload = (await response.json()) as
        | { slug: string }
        | { error: string };

      if (!response.ok || "error" in payload) {
        setError("error" in payload ? payload.error : "That did not work.");
        return;
      }
      router.push(`/designs/${payload.slug}`);
    } catch {
      setError("The connection dropped. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Button className="w-full gap-1.5" onClick={remix} disabled={busy}>
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <GitFork className="size-4" aria-hidden />
        )}
        Remix this design
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
