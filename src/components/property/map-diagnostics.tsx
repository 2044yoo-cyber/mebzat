"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Minus, X } from "lucide-react";

import { subscribeToRequests, type RequestLog } from "@/lib/map/diagnostics";
import { cn } from "@/lib/utils";

/**
 * What the map asked for, and what came back.
 *
 * Collapsed to a single line unless something failed, in which case it opens
 * itself — "the map is broken" should be answerable without opening devtools,
 * and the answer is usually one failed request with a reason next to it.
 */
export function MapDiagnostics({ className }: { className?: string }) {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => subscribeToRequests(setLogs), []);

  const failures = logs.filter((log) => log.status === "failed");
  const hasFailure = failures.length > 0;

  // Nothing to report and nothing broken: stay out of the way entirely.
  if (logs.length === 0 || (dismissed && !hasFailure)) return null;

  return (
    <div
      className={cn(
        "rounded-xl border text-sm",
        hasFailure && "border-amber-500/50 bg-amber-500/5",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {hasFailure ? (
          <AlertTriangle className="size-4 shrink-0 text-amber-500" />
        ) : (
          <Check className="size-4 shrink-0 text-emerald-500" />
        )}

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <span className="truncate font-medium">
            {hasFailure
              ? `${failures.length} request${failures.length === 1 ? "" : "s"} failed`
              : "All map requests succeeded"}
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>

        {!hasFailure && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Hide diagnostics"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {hasFailure && !open && (
        <p className="px-3 pb-2 text-xs text-muted-foreground">
          The map itself is fine — it does not depend on these.
        </p>
      )}

      {open && (
        <ul className="space-y-1.5 border-t px-3 py-2">
          {logs.map((log) => (
            <li key={log.id} className="flex items-start gap-2 text-xs">
              <StatusIcon status={log.status} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {log.label}
                  {log.ms !== undefined && (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      {log.ms}ms
                    </span>
                  )}
                </span>
                {log.detail && (
                  <span className="block break-words text-muted-foreground">
                    {log.detail}
                  </span>
                )}
                <span className="block truncate text-muted-foreground/70">
                  {log.url}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: RequestLog["status"] }) {
  if (status === "ok") {
    return <Check className="mt-0.5 size-3 shrink-0 text-emerald-500" />;
  }
  if (status === "failed") {
    return <X className="mt-0.5 size-3 shrink-0 text-amber-500" />;
  }
  if (status === "skipped") {
    return <Minus className="mt-0.5 size-3 shrink-0 text-muted-foreground" />;
  }
  return (
    <span
      aria-hidden
      className="mt-1 size-2 shrink-0 animate-pulse rounded-full bg-muted-foreground"
    />
  );
}
