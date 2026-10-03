import { MAX_WRITE_INPUT } from "@/lib/ai/writing";
import type { Language } from "./translations";

const cache = new Map<string, string>();
let active = 0;
const waiting: Array<() => void> = [];

/** Bound paid requests across visible cards; never persist post text on disk. */
export async function translationSlot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try { return await work(); }
  finally { const next = waiting.shift(); if (next) next(); else active--; }
}

export function translationChunks(text: string): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > MAX_WRITE_INPUT) {
    let end = rest.lastIndexOf("\n", MAX_WRITE_INPUT);
    if (end < MAX_WRITE_INPUT / 2) end = rest.lastIndexOf(" ", MAX_WRITE_INPUT);
    if (end < MAX_WRITE_INPUT / 2) end = MAX_WRITE_INPUT;
    // Do not split a UTF-16 surrogate pair.
    if (/[\uD800-\uDBFF]/.test(rest[end - 1])) end--;
    parts.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function translatedText(
  text: string, language: Language,
  run: (text: string) => Promise<string | undefined>,
): Promise<string> {
  if (!text.trim()) return text;
  const key = JSON.stringify([language, text]);
  const found = cache.get(key);
  if (found !== undefined) return found;
  const parts: string[] = [];
  for (const part of translationChunks(text)) {
    const result = await run(part);
    if (!result?.trim()) throw new Error("Translation unavailable");
    parts.push(result);
  }
  const result = parts.join("\n\n");
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
