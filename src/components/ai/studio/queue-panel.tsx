"use client";

import Link from "next/link";
import {
  Copy,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Trash2,
  X,
} from "lucide-react";

import {
  QUEUE_STATUS_LABEL,
  cancel,
  clearFinished,
  duplicateJob,
  pause,
  removeJob,
  resume,
  retry,
  retryAllFailed,
  useQueue,
  type Job,
} from "@/lib/ai/image-queue";
import { IMAGE_PROVIDERS, type ImageProviderName } from "@/lib/ai/image-models";
import { PROVIDER_STATUS, type ProgressLine } from "@/lib/ai/provider-status";
import { cn } from "@/lib/utils";

/**
 * The job queue, above the results.
 *
 * Hidden entirely when nothing is queued, so a single generation looks the
 * same as it did before this existed. It appears the moment a second job is
 * added, which is when a queue starts being worth showing.
 */
export function QueuePanel() {
  const { jobs, paused } = useQueue();
  if (jobs.length === 0) return null;

  const active = jobs.filter(
    (job) => job.status === "queued" || job.status === "running",
  ).length;
  const finished = jobs.length - active;
  const failedCount = jobs.filter((job) => job.status === "failed").length;

  return (
    <section className="rounded-2xl border">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-medium">
          Queue
          {active > 0 && (
            <span className="ml-1.5 font-normal text-muted-foreground">
              {active} {active === 1 ? "job" : "jobs"}
            </span>
          )}
        </h2>

        <div className="ml-auto flex items-center gap-1">
          {active > 0 && (
            <button
              type="button"
              onClick={() => (paused ? resume() : pause())}
              className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs transition-colors hover:bg-muted"
            >
              {paused ? (
                <>
                  <Play className="size-3" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="size-3" />
                  Pause
                </>
              )}
            </button>
          )}
          {failedCount > 0 && (
            <button
              type="button"
              onClick={() => retryAllFailed()}
              className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-brand transition-colors hover:bg-brand/10"
            >
              <RotateCcw className="size-3" />
              Retry {failedCount} failed
            </button>
          )}
          {finished > 0 && (
            <button
              type="button"
              onClick={clearFinished}
              className="flex h-7 items-center rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Clear finished
            </button>
          )}
        </div>
      </div>

      {paused && active > 0 && (
        <p className="border-b bg-amber-500/5 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          Paused. Nothing is lost — resume to carry on.
        </p>
      )}

      <ul className="divide-y">
        {jobs.map((job) => (
          <li key={job.id}>
            <Row job={job} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ job }: { job: Job }) {
  const done = job.status === "done";
  const failed = job.status === "failed";
  const running = job.status === "running";

  return (
    <div>
      <RowHead job={job} done={done} failed={failed} running={running} />

      {/* ---- The progress log ------------------------------------------ */}
      {/* Open while the job runs, foldable once it is over: watching the
          chain switch providers is useful live and clutter afterwards. */}
      {job.log.length > 0 && running && (
        <ol className="space-y-0.5 border-t bg-muted/30 px-3 py-2 pl-14">
          {job.log.map((line, index) => (
            <LogRow key={`${line.at}-${index}`} line={line} />
          ))}
        </ol>
      )}

      {job.log.length > 0 && !running && (
        <details className="border-t bg-muted/20">
          <summary className="cursor-pointer px-3 py-1.5 pl-14 text-[11px] text-muted-foreground hover:text-foreground">
            {job.log.length} steps
          </summary>
          <ol className="space-y-0.5 px-3 pb-2 pl-14">
            {job.log.map((line, index) => (
              <LogRow key={`${line.at}-${index}`} line={line} />
            ))}
          </ol>
        </details>
      )}

      {/* ---- What to fix ------------------------------------------------ */}
      {/* Only shown when a person has to go and change something. A rate
          limit clears itself and needs no instructions. */}
      {failed && job.blocked && job.blocked.length > 0 && (
        <div className="border-t bg-rose-500/5 px-3 py-2 pl-14">
          <p className="text-[11px] font-medium text-rose-600 uppercase dark:text-rose-400">
            Needs configuration
          </p>
          <ul className="mt-1 space-y-0.5">
            {job.blocked.map((entry) => (
              <li key={entry.provider} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {entry.label}
                </span>{" "}
                — {PROVIDER_STATUS[entry.status].label}
                {entry.keyVars.length > 0 && (
                  <>
                    {" · "}
                    {entry.keyVars.map((keyVar) => (
                      <code
                        key={keyVar}
                        className="mr-1 rounded bg-muted px-1 py-0.5 text-[10px]"
                      >
                        {keyVar}
                      </code>
                    ))}
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Your prompt is saved. Fix a provider and press retry — nothing is
            lost.
          </p>
          <Link
            href="/settings#ai-providers"
            className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
          >
            <Settings2 className="size-3" />
            Open AI Providers
          </Link>
        </div>
      )}
    </div>
  );
}

function LogRow({ line }: { line: ProgressLine }) {
  const mark =
    line.kind === "ok" || line.kind === "success"
      ? "✓"
      : line.kind === "fail"
        ? "✗"
        : line.kind === "warn"
          ? "!"
          : "·";

  return (
    <li
      className={cn(
        "flex gap-1.5 text-xs",
        line.kind === "ok" || line.kind === "success"
          ? "text-emerald-600 dark:text-emerald-400"
          : line.kind === "fail"
            ? "text-rose-600 dark:text-rose-400"
            : line.kind === "warn"
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground",
      )}
    >
      <span aria-hidden className="w-2 shrink-0">
        {mark}
      </span>
      <span className="min-w-0">{line.text}</span>
    </li>
  );
}

function RowHead({
  job,
  done,
  failed,
  running,
}: {
  job: Job;
  done: boolean;
  failed: boolean;
  running: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      {/* The thumbnail is the fastest way to see which job a row is. */}
      {done && job.results[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={job.results[0].url}
          alt=""
          className="size-9 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg border",
            running && "border-brand/40 bg-brand/5",
          )}
        >
          {running ? (
            <Loader2 className="size-3.5 animate-spin text-brand" />
          ) : (
            <span className="text-[10px] text-muted-foreground">
              {job.count}×
            </span>
          )}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{job.label}</p>
        <p className="truncate text-xs text-muted-foreground">
          <span
            className={cn(
              failed && "text-rose-600 dark:text-rose-400",
              done && "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {QUEUE_STATUS_LABEL[job.status]}
          </span>
          {running && job.trying && ` · ${job.trying}`}
          {job.model && ` · ${job.model}`}
          {job.startedAt && job.finishedAt && (
            <> · {((job.finishedAt - job.startedAt) / 1000).toFixed(1)}s</>
          )}
          {job.costEstimate !== undefined && job.costEstimate > 0 && (
            <> · ${job.costEstimate.toFixed(3)}</>
          )}
          {job.error && ` · ${job.error}`}
        </p>

        {/* A provider switch is stated rather than hidden: the user asked for
            one model and got another, and should know which. */}
        {job.switched.length > 0 && job.status === "done" && (
          <p className="truncate text-[11px] text-amber-600 dark:text-amber-400">
            Switched provider after{" "}
            {job.switched
              .map(
                (provider) =>
                  IMAGE_PROVIDERS[provider as ImageProviderName]?.label ??
                  provider,
              )
              .join(", ")}{" "}
            was unavailable
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {(job.status === "queued" || running) && (
          <Action label="Cancel" onClick={() => cancel(job.id)}>
            <X className="size-3.5" />
          </Action>
        )}
        {failed && (
          <Action label="Retry" onClick={() => retry(job.id)}>
            <RotateCcw className="size-3.5" />
          </Action>
        )}
        {(done || failed || job.status === "cancelled") && (
          <>
            <Action label="Duplicate" onClick={() => duplicateJob(job.id)}>
              <Copy className="size-3.5" />
            </Action>
            <Action label="Remove" onClick={() => removeJob(job.id)}>
              <Trash2 className="size-3.5" />
            </Action>
          </>
        )}
      </div>
    </div>
  );
}

function Action({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
