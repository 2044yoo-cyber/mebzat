"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Download, Loader2, Pencil, Share2, SquarePen, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A project card's actions: Open, Duplicate, Rename, Delete, Share, Export.
 *
 * Each is one tap and one POST to the designs route, and the page re-reads
 * the list afterwards rather than this guessing at what changed. Delete and
 * Share ask first — one cannot be undone and the other makes a private design
 * reachable by link.
 */
export function ProjectActions({ id, slug, title, visibility }: { id: string; slug: string; title: string; visibility: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const post = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/studio/designs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || typeof payload.error === "string") throw new Error(typeof payload.error === "string" ? payload.error : "That did not work.");
    return payload;
  };

  const run = async (name: string, action: () => Promise<string | null>) => {
    setBusy(name);
    setMessage(null);
    try {
      const done = await action();
      if (done) setMessage(done);
      router.refresh();
    } catch (problem) {
      setMessage(problem instanceof Error ? problem.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  };

  const link = () => `${window.location.origin}/designs/${slug}`;

  return (
    <div className="mt-2 space-y-1">
      <div className="flex flex-wrap gap-1" role="toolbar" aria-label={`Actions for ${title}`}>
        <Link href={`/studio?design=${encodeURIComponent(slug)}`} className={action()}>
          <SquarePen className="size-3" aria-hidden />Open
        </Link>
        <button type="button" className={action()} disabled={busy !== null} onClick={() => run("duplicate", async () => { await post({ action: "duplicate", designId: id }); return "Copied — the copy is at the top."; })}>
          {busy === "duplicate" ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Copy className="size-3" aria-hidden />}Duplicate
        </button>
        <button
          type="button"
          className={action()}
          disabled={busy !== null}
          onClick={() => {
            const next = window.prompt("Rename this design", title);
            if (next === null || next.trim() === "" || next.trim() === title) return;
            void run("rename", async () => { await post({ action: "rename", designId: id, title: next }); return null; });
          }}
        >
          <Pencil className="size-3" aria-hidden />Rename
        </button>
        <button
          type="button"
          className={action()}
          disabled={busy !== null}
          onClick={() => {
            void run("share", async () => {
              if (visibility === "private") {
                if (!window.confirm("Sharing makes an unlisted link: anyone you send it to can open the design. It is not put on the feed. Continue?")) return null;
                await post({ action: "publish", designId: id, visibility: "unlisted" });
              }
              try {
                await navigator.clipboard.writeText(link());
                return "Link copied.";
              } catch {
                return link();
              }
            });
          }}
        >
          <Share2 className="size-3" aria-hidden />Share
        </button>
        <Link href={`/designs/${encodeURIComponent(slug)}/cut-list`} className={action()}>
          <Download className="size-3" aria-hidden />Export
        </Link>
        <button
          type="button"
          className={action(true)}
          disabled={busy !== null}
          onClick={() => {
            if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
            void run("delete", async () => { await post({ action: "delete", designId: id }); return null; });
          }}
        >
          <Trash2 className="size-3" aria-hidden />Delete
        </button>
      </div>
      {message ? <p className="break-all text-[11px] text-muted-foreground" role="status">{message}</p> : null}
    </div>
  );
}

function action(danger = false) {
  return cn(
    // 32 px: a thumb's target on a phone, still compact on a card.
    "inline-flex h-8 items-center gap-1 rounded-md border bg-background px-2 text-[11px] transition-colors disabled:opacity-50",
    danger ? "text-destructive hover:border-destructive" : "hover:border-primary",
  );
}
