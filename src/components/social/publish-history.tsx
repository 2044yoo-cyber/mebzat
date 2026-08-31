import { Check, X } from "lucide-react";

import { PLATFORM_SPECS } from "@/lib/social/platforms";
import { cn } from "@/lib/utils";
import type { SocialPublishLogEntry } from "@/types/database.types";

/**
 * What happened, per platform.
 *
 * The failure reason is shown, not hidden behind a "details" link. "Instagram
 * failed" is unactionable; "Instagram failed — the account is not a
 * Professional account" tells somebody what to change. The adapter is what
 * turns the platform's raw response into that sentence, so nothing here is a
 * dump of an API body.
 */
export function PublishHistory({
  attempts,
}: {
  attempts: SocialPublishLogEntry[];
}) {
  if (attempts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing has been published yet.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-xl border">
      {attempts.map((attempt) => (
        <li key={attempt.id} className="flex flex-wrap items-start gap-2 p-3">
          <span
            className={cn(
              "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
              attempt.ok
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-destructive/15 text-destructive",
            )}
            aria-hidden
          >
            {attempt.ok ? (
              <Check className="size-3" />
            ) : (
              <X className="size-3" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {PLATFORM_SPECS[attempt.platform].label}
              <span className="ml-2 font-normal text-muted-foreground">
                {attempt.ok ? "Published" : "Failed"}
              </span>
            </p>

            {attempt.error ? (
              <p className="mt-0.5 text-xs text-destructive">{attempt.error}</p>
            ) : null}

            {attempt.external_url ? (
              <a
                href={attempt.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-block text-xs text-brand hover:underline"
              >
                View the post
              </a>
            ) : null}
          </div>

          <time
            dateTime={attempt.attempted_at}
            className="shrink-0 text-xs text-muted-foreground tabular-nums"
          >
            {new Date(attempt.attempted_at).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </li>
      ))}
    </ul>
  );
}
