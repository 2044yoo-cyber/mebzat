// Polite HTTP for the image scripts.
//
// Public image APIs rate-limit aggressively, and a burst of twenty searches
// will earn a 429 from Wikimedia Commons within seconds. Everything here
// exists to make a long import survive that: requests to a host are spaced
// out, throttled per host rather than globally, and retried with exponential
// backoff that honours Retry-After when the server sends one.

/** Minimum gap between requests to the same host. */
const DEFAULT_INTERVAL_MS = 1200;

/** Attempts per request, including the first. */
const DEFAULT_RETRIES = 4;

/** Ceiling on a single backoff wait, so one bad response cannot stall a run. */
const MAX_BACKOFF_MS = 30_000;

/** Last request time per host, so hosts do not throttle each other. */
const lastRequestAt = new Map<string, number>();

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits until this host's minimum interval has elapsed. */
async function throttle(host: string, intervalMs: number): Promise<void> {
  const previous = lastRequestAt.get(host) ?? 0;
  const wait = previous + intervalMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(host, Date.now());
}

/** Statuses worth retrying: rate limits and transient server faults. */
function isRetryable(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

/**
 * Reads Retry-After, which may be seconds or an HTTP date. Returns null when
 * absent or unparseable, letting the caller fall back to exponential backoff.
 */
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, MAX_BACKOFF_MS);

  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.min(Math.max(date - Date.now(), 0), MAX_BACKOFF_MS);
  }
  return null;
}

export type PoliteFetchOptions = {
  retries?: number;
  intervalMs?: number;
  headers?: Record<string, string>;
  /** Called before each wait, so callers can explain the pause. */
  onRetry?: (attempt: number, waitMs: number, reason: string) => void;
};

/**
 * Fetches a URL, throttled per host and retried with exponential backoff.
 *
 * Returns the response once it is not retryable — a 404 comes back as-is for
 * the caller to handle. Throws only when every attempt failed, so a caller can
 * treat that as "this source is unavailable" and move on.
 */
export async function politeFetch(
  url: string,
  options: PoliteFetchOptions = {},
): Promise<Response> {
  const {
    retries = DEFAULT_RETRIES,
    intervalMs = DEFAULT_INTERVAL_MS,
    headers = {},
    onRetry,
  } = options;

  const host = new URL(url).host;
  let lastReason = "unknown error";

  for (let attempt = 1; attempt <= retries; attempt++) {
    await throttle(host, intervalMs);

    try {
      const response = await fetch(url, { headers });

      if (!isRetryable(response.status)) return response;

      lastReason = `HTTP ${response.status}`;
      if (attempt === retries) return response;

      // Prefer the server's own guidance; otherwise double each time.
      const wait =
        retryAfterMs(response) ??
        Math.min(intervalMs * 2 ** attempt, MAX_BACKOFF_MS);
      onRetry?.(attempt, wait, lastReason);
      await sleep(wait);
    } catch (error) {
      lastReason = error instanceof Error ? error.message : "network error";
      if (attempt === retries) throw new Error(lastReason);

      const wait = Math.min(intervalMs * 2 ** attempt, MAX_BACKOFF_MS);
      onRetry?.(attempt, wait, lastReason);
      await sleep(wait);
    }
  }

  throw new Error(lastReason);
}
