"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flag, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { reportContent } from "@/app/moderation/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { REPORT_CATEGORIES } from "@/lib/moderation/types";
import { cn } from "@/lib/utils";

/**
 * Report this.
 *
 * Built for a thumb: the categories are a single column of 44px rows rather
 * than a select, because a dropdown inside a sheet on a phone is two taps and
 * a scroll to do one thing.
 *
 * The severe case is not in the list. Somebody who believes they have found
 * sexual content involving a child should not have to find it between "Spam"
 * and "Something else", so it sits apart, above, and says what it does.
 */

type Props = {
  contentType: string;
  contentId: string;
  ownerId?: string | null;
  /** Compact icon for a card corner; full for a menu row. */
  variant?: "icon" | "row";
  className?: string;
};

export function ReportDialog({
  contentType,
  contentId,
  ownerId,
  variant = "icon",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [needsAuth, setNeedsAuth] = useState(false);
  const [pending, start] = useTransition();
  const pathname = usePathname();

  function submit(chosen: string) {
    setCategory(chosen);
    start(async () => {
      const result = await reportContent({
        contentType,
        contentId,
        ownerId,
        category: chosen,
        note,
        path: pathname,
      });

      if (result.ok) {
        setOpen(false);
        setNote("");
        setCategory(null);
        toast.success(result.message);
        return;
      }
      if (result.needsAuth) {
        setNeedsAuth(true);
        return;
      }
      toast.error(result.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          variant === "icon" ? (
            <button
              type="button"
              aria-label="Report this"
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                className,
              )}
            >
              <Flag className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                className,
              )}
            >
              <Flag className="size-4" /> Report
            </button>
          )
        }
      />

      <DialogContent className="max-w-sm rounded-2xl p-4 sm:max-w-md">
        <DialogTitle className="text-base font-semibold">
          Report this content
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Tell us what is wrong with it. Moderators review every report.
        </DialogDescription>

        {needsAuth ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              You need an account to report content.
            </p>
            <Link
              href={`/login?next=${encodeURIComponent(pathname)}`}
              className={cn(buttonVariants(), "w-full")}
            >
              Sign in
            </Link>
          </div>
        ) : (
          <>
            {/* Apart from the list, deliberately. */}
            <button
              type="button"
              disabled={pending}
              onClick={() => submit("sexual_explicit")}
              className="mt-3 flex w-full items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-left transition-colors hover:bg-destructive/10 disabled:opacity-60"
            >
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  Sexual content involving a child
                </span>
                <span className="block text-xs text-muted-foreground">
                  Escalated immediately and never published.
                </span>
              </span>
            </button>

            <div className="mt-3 space-y-1">
              {REPORT_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={pending}
                  onClick={() => submit(c.id)}
                  className={cn(
                    "flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm transition-colors hover:bg-muted disabled:opacity-60",
                    category === c.id && pending && "bg-muted",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Anything else we should know? (optional)"
              className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-brand/30"
            />

            <Button
              type="button"
              variant="ghost"
              className="mt-1 w-full"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
