// On-disk cache for image search results.
//
// A search is expensive in rate-limit terms and its answer barely changes, so
// re-running the finder should not re-ask. The cache is a single JSON file:
// small enough to rewrite wholesale, and readable if you want to inspect or
// hand-edit what was found.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE_FILE = join(ROOT, "scripts", "data", ".image-search-cache.json");

/** Entries older than this are re-fetched. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Entry<T> = { at: number; value: T };
type CacheFile = Record<string, Entry<unknown>>;

let cache: CacheFile | null = null;

function load(): CacheFile {
  if (cache) return cache;
  if (!existsSync(CACHE_FILE)) {
    cache = {};
    return cache;
  }
  try {
    cache = JSON.parse(readFileSync(CACHE_FILE, "utf8")) as CacheFile;
  } catch {
    // A corrupt cache is not worth failing an import over — start fresh.
    cache = {};
  }
  return cache;
}

function persist(): void {
  if (!cache) return;
  mkdirSync(dirname(CACHE_FILE), { recursive: true });
  writeFileSync(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`);
}

/** Cached value for a key, or null when absent or stale. */
export function readCache<T>(key: string): T | null {
  const entry = load()[key] as Entry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) return null;
  return entry.value;
}

export function writeCache<T>(key: string, value: T): void {
  load()[key] = { at: Date.now(), value };
  persist();
}

export function cacheKey(source: string, query: string): string {
  return `${source}:${query.toLowerCase().trim()}`;
}
