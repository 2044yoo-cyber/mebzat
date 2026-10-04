import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { SearchKind, SearchResult } from "@/types/database.types";

/**
 * Global search.
 *
 * One RPC does the whole platform (`global_search` in migration 0013) rather
 * than a query per entity fanned out from here: eleven round trips to render
 * one list is eleven chances to be slow, and Postgres can rank across the
 * tables in a way the client cannot.
 */

export type GlobalSearchResult = {
  results: SearchResult[];
  /** False when migration 0013 has not been applied, so the page can explain. */
  available: boolean;
};

/** Longest query we send to the database. Beyond this it is not a search. */
const MAX_QUERY = 120;

export function normalizeQuery(raw: string | undefined | null): string {
  return (raw ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_QUERY);
}

export async function globalSearch(
  query: string,
  options: { perKind?: number; kinds?: SearchKind[] } = {},
): Promise<GlobalSearchResult> {
  const q = normalizeQuery(query);
  if (!q) return { results: [], available: true };

  const supabase = await createClient();
  const perKind = options.perKind ?? 8;

  // Two RPCs rather than one, in parallel, and it is a deliberate exception to
  // the rule above. `global_search` is a 300-line union of eleven branches;
  // adding designs to it means `create or replace` on the whole function and a
  // second full copy in the migration history, leaving the next person to diff
  // 300 lines to find one changed one. `search_designs` returns the same row
  // shape, so the merge below is the whole cost — and the next module to need
  // searching adds its own function instead of editing a monolith.
  const wantsDesigns =
    options.kinds === undefined || options.kinds.includes("design");

  const [platform, designs] = await Promise.all([
    supabase.rpc("global_search", {
      q,
      per_kind: perKind,
      kinds: options.kinds ?? undefined,
    }),
    wantsDesigns
      ? supabase.rpc("search_designs", { q, per_kind: perKind })
      : Promise.resolve({ data: [], error: null }),
  ]);

  // Only `global_search` failing means the search itself is unavailable. A
  // missing Berchuma migration should cost the designs section, not the page.
  if (platform.error) return { results: [], available: false };

  const results = [
    ...((platform.data ?? []) as SearchResult[]),
    ...((designs.data ?? []) as SearchResult[]),
  ].sort((a, b) => b.score - a.score);

  return { results, available: true };
}

/** Groups results by kind, preserving the ranked order inside each group. */
export function groupByKind(
  results: SearchResult[],
): { kind: SearchKind; results: SearchResult[] }[] {
  const groups = new Map<SearchKind, SearchResult[]>();
  for (const result of results) {
    const existing = groups.get(result.kind);
    if (existing) existing.push(result);
    else groups.set(result.kind, [result]);
  }
  return [...groups].map(([kind, rows]) => ({ kind, results: rows }));
}

/** The typeahead. Deliberately small — it renders while someone is typing. */
export async function searchSuggestions(
  query: string,
  limit = 8,
): Promise<SearchResult[]> {
  const q = normalizeQuery(query);
  if (q.length < 2) return [];

  const supabase = await createClient();

  // Same split as above. Designs are capped low here because the typeahead is
  // a short list and a run of wardrobes would push the rest of the platform
  // off the bottom of it.
  const [suggestions, designs] = await Promise.all([
    supabase.rpc("search_suggestions", { q, max_results: limit }),
    supabase.rpc("search_designs", { q, per_kind: 2 }),
  ]);

  if (suggestions.error) return [];

  return [
    ...((suggestions.data ?? []) as SearchResult[]),
    ...((designs.data ?? []) as SearchResult[]),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
