/**
 * Request diagnostics for the map.
 *
 * Every network call the map makes is recorded here with its outcome, so
 * "the page is broken" can be answered with "this request failed, for this
 * reason" without opening a devtools waterfall.
 *
 * Entries are also written to the console under a stable prefix, so they can
 * be filtered with `medosha` in the console's filter box.
 */

export type RequestStatus = "pending" | "ok" | "failed" | "skipped";

export type RequestLog = {
  id: number;
  label: string;
  url: string;
  status: RequestStatus;
  detail?: string;
  ms?: number;
  at: number;
};

type Listener = (logs: RequestLog[]) => void;

const PREFIX = "[medosha:map]";

let nextId = 1;
let logs: RequestLog[] = [];
const listeners = new Set<Listener>();

function emit() {
  // A fresh array each time, so subscribers comparing by reference re-render.
  const snapshot = [...logs];
  for (const listener of listeners) listener(snapshot);
}

export function subscribeToRequests(listener: Listener): () => void {
  listeners.add(listener);
  listener([...logs]);
  return () => listeners.delete(listener);
}

export function clearRequestLog() {
  logs = [];
  emit();
}

export function getRequestLog(): RequestLog[] {
  return [...logs];
}

/**
 * Starts tracking one request. Returns the handles to close it out.
 *
 * Deliberately not a wrapper around `fetch` itself: the map's tile requests
 * are made inside MapLibre where we cannot intercept them, so tracking has to
 * be something a caller can drive by hand as well.
 */
export function trackRequest(label: string, url: string) {
  const entry: RequestLog = {
    id: nextId++,
    label,
    url,
    status: "pending",
    at: Date.now(),
  };
  const started = performance.now();

  // Keep the log short; the map can make many requests over a long session.
  logs = [entry, ...logs].slice(0, 40);
  emit();

  function finish(status: RequestStatus, detail?: string) {
    entry.status = status;
    entry.detail = detail;
    entry.ms = Math.round(performance.now() - started);
    logs = [...logs];
    emit();

    const line = `${PREFIX} ${label} — ${status}${detail ? `: ${detail}` : ""} (${entry.ms}ms) ${url}`;
    if (status === "failed") console.warn(line);
    else console.debug(line);
  }

  return {
    ok: (detail?: string) => finish("ok", detail),
    failed: (detail?: string) => finish("failed", detail),
    skipped: (detail?: string) => finish("skipped", detail),
  };
}

/** Turns anything thrown into a short, readable reason. */
export function describeError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "aborted";
  }
  if (error instanceof TypeError) {
    // This is what a browser reports for DNS failure, a refused connection,
    // a blocked request, or a CORS rejection — the message is identical in
    // every case, so it is worth spelling out.
    return `${error.message} (network unreachable, blocked, or CORS)`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
