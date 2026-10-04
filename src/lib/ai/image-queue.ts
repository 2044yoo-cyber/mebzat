"use client";

import { useSyncExternalStore } from "react";

import { addImages } from "@/lib/ai/image-history";
import type { AspectRatio, QualityLevel, QualityMode } from "@/lib/ai/image-models";
import {
  PROVIDER_STATUS,
  isUsable,
  type ProgressEvent,
  type ProgressLine,
  type ProviderStatus,
} from "@/lib/ai/provider-status";

/**
 * The image job queue.
 *
 * One job runs at a time. That is deliberate rather than a limitation: free
 * tiers rate-limit on concurrency before anything else, and four parallel
 * requests to the same provider is the fastest way to turn a working setup
 * into a wall of 429s.
 *
 * A job holds everything needed to run it, so retrying and duplicating are
 * the same operation with a different id — and a failure never costs the user
 * their prompt, which is the whole point.
 */

export type JobStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export type JobRequest = {
  prompt: string;
  negativePrompt?: string;
  modelId: string;
  intent?: string;
  aspect: AspectRatio;
  quality: QualityLevel;
  mode: QualityMode;
  freeMode: boolean;
  count: number;
  image?: string;
  tool: string;
  /** What to show in the queue row. Usually the first few words. */
  label: string;
};

export type Job = JobRequest & {
  id: string;
  status: JobStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  /** Which provider is being tried right now, for the progress line. */
  trying?: string;
  /** Providers that failed before one worked. */
  switched: string[];
  error?: string;
  results: { url: string }[];
  model?: string;
  provider?: string;
  costEstimate?: number;
  /** What the chain did, line by line, as it happened. */
  log: ProgressLine[];
  /** Providers the operator has to fix, when that is why this failed. */
  blocked?: {
    provider: string;
    label: string;
    status: ProviderStatus;
    keyVars: string[];
  }[];
  /** True when retrying cannot help until a key is fixed. */
  needsConfiguration?: boolean;
};

type QueueState = {
  jobs: Job[];
  paused: boolean;
};

let state: QueueState = { jobs: [], paused: false };
const listeners = new Set<() => void>();
let running: { id: string; controller: AbortController } | null = null;

const EMPTY: QueueState = { jobs: [], paused: false };

function emit() {
  for (const listener of listeners) listener();
}

function set(next: Partial<QueueState>) {
  state = { ...state, ...next };
  emit();
}

function patch(id: string, changes: Partial<Job>) {
  set({
    jobs: state.jobs.map((job) =>
      job.id === id ? { ...job, ...changes } : job,
    ),
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): QueueState {
  return state;
}

function getServerSnapshot(): QueueState {
  return EMPTY;
}

export function useQueue(): QueueState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export function enqueue(request: JobRequest): Job {
  const job: Job = {
    ...request,
    id: crypto.randomUUID(),
    status: "queued",
    createdAt: Date.now(),
    switched: [],
    results: [],
    log: [],
  };
  set({ jobs: [...state.jobs, job] });
  void pump();
  return job;
}

export function pause() {
  set({ paused: true });
}

export function resume() {
  set({ paused: false });
  void pump();
}

export function cancel(id: string) {
  if (running?.id === id) {
    running.controller.abort();
    running = null;
  }
  patch(id, { status: "cancelled", finishedAt: Date.now() });
  void pump();
}

export function retry(id: string) {
  const job = state.jobs.find((entry) => entry.id === id);
  if (!job) return;
  patch(id, {
    status: "queued",
    error: undefined,
    switched: [],
    results: [],
    // The log starts again, but the prompt and every setting are untouched —
    // a retry after fixing a key must cost the user nothing they typed.
    log: [],
    blocked: undefined,
    needsConfiguration: undefined,
    startedAt: undefined,
    finishedAt: undefined,
  });
  void pump();
}

/** Re-queues every job that failed. Used after fixing a provider. */
export function retryAllFailed(): number {
  const failed = state.jobs.filter((job) => job.status === "failed");
  for (const job of failed) retry(job.id);
  return failed.length;
}

export function duplicateJob(id: string) {
  const job = state.jobs.find((entry) => entry.id === id);
  if (!job) return;
  const { id: _ignored, ...rest } = job;
  void _ignored;
  enqueue(rest as JobRequest);
}

export function clearFinished() {
  set({
    jobs: state.jobs.filter(
      (job) => job.status === "queued" || job.status === "running",
    ),
  });
}

export function removeJob(id: string) {
  if (running?.id === id) cancel(id);
  set({ jobs: state.jobs.filter((job) => job.id !== id) });
}

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

async function pump(): Promise<void> {
  if (running || state.paused) return;

  const next = state.jobs.find((job) => job.status === "queued");
  if (!next) return;

  const controller = new AbortController();
  const id = next.id;
  running = { id, controller };
  patch(id, {
    status: "running",
    startedAt: Date.now(),
    trying: undefined,
    log: [],
  });

  /** Appends a line to this job's log, in order, as the server narrates. */
  const say = (kind: ProgressLine["kind"], text: string) => {
    const job = state.jobs.find((entry) => entry.id === id);
    if (!job) return;
    patch(id, { log: [...job.log, { kind, text, at: Date.now() }] });
  };

  try {
    const response = await fetch("/api/ai/image", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Asking for the stream is what turns a silent wait into a log.
        accept: "text/event-stream",
      },
      body: JSON.stringify({
        prompt: next.prompt,
        negativePrompt: next.negativePrompt,
        modelId: next.modelId,
        intent: next.intent,
        aspect: next.aspect,
        quality: next.quality,
        mode: next.mode,
        freeMode: next.freeMode,
        count: next.count,
        image: next.image,
      }),
      signal: controller.signal,
    });

    if (!response.body) throw new Error("No response body.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let settled = false;
    const switched: string[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      let split = buffer.indexOf("\n\n");
      while (split !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf("\n\n");

        const line = frame
          .split("\n")
          .find((entry) => entry.startsWith("data:"));
        if (!line) continue;

        let event: ProgressEvent;
        try {
          event = JSON.parse(line.slice(5).trim()) as ProgressEvent;
        } catch {
          continue;
        }

        switch (event.type) {
          case "check":
            say("check", `Checking ${event.label}…`);
            patch(id, { trying: event.label });
            break;

          case "checked":
            if (isUsable(event.status)) {
              say("ok", "Connected");
            } else {
              say(
                "fail",
                `${event.label} — ${PROVIDER_STATUS[event.status].label}`,
              );
            }
            break;

          case "attempt":
            say("info", `Generating with ${event.model}…`);
            patch(id, { trying: event.label });
            break;

          case "switch":
            say("info", `Switching to ${event.label}…`);
            break;

          case "failed":
            say("warn", event.reason);
            if (!switched.includes(event.provider)) {
              switched.push(event.provider);
            }
            break;

          case "result": {
            settled = true;
            say("success", "Success");
            patch(id, {
              status: "done",
              results: event.images,
              model: event.model.label,
              provider: event.model.provider,
              costEstimate: event.costEstimate,
              switched,
              trying: undefined,
              finishedAt: Date.now(),
            });
            addImages(event.images, {
              prompt: next.prompt,
              model: event.model.label,
              provider: event.model.provider,
              tool: next.tool,
              aspect: next.aspect,
            });
            break;
          }

          case "error":
            settled = true;
            patch(id, {
              status: "failed",
              error: event.error,
              blocked: event.blocked,
              needsConfiguration: event.needsConfiguration,
              switched,
              trying: undefined,
              finishedAt: Date.now(),
            });
            break;
        }
      }
    }

    // The stream ended without saying how it went — treat as a failure rather
    // than leaving the job spinning forever.
    if (!settled) {
      patch(id, {
        status: "failed",
        error: "The connection ended before an image came back. Retry when ready.",
        switched,
        trying: undefined,
        finishedAt: Date.now(),
      });
    }
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      patch(id, { status: "cancelled", trying: undefined, finishedAt: Date.now() });
    } else {
      patch(id, {
        status: "failed",
        // Nothing raw reaches here; the route has already made it readable.
        error: "That did not work. Your prompt is saved — retry when ready.",
        trying: undefined,
        finishedAt: Date.now(),
      });
    }
  } finally {
    running = null;
    // Straight on to the next one, if the queue was not paused meanwhile.
    void pump();
  }
}

export const QUEUE_STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Generating",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};
