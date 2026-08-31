"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CornerDownLeft,
  Loader2,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";

import { SearchKindIcon } from "@/components/search/kind-icon";
import { QUICK_CREATE } from "@/components/shell/quick-actions";
import { LINKED_NAV_ITEMS } from "@/lib/workspace/navigation";
import { openPanel, update } from "@/lib/workspace/store";
import { useHotkey } from "@/lib/workspace/use-shell";
import { cn } from "@/lib/utils";
import type { SearchResult } from "@/types/database.types";

/**
 * ⌘K / Ctrl+K.
 *
 * Three sources in one list. Pages come from the navigation manifest and are
 * filtered in memory, so they appear on the first keystroke with no network at
 * all. Create actions come from the same list the floating + uses. Content —
 * products, companies, properties, posts — comes from /api/search, which is
 * debounced and abortable because it runs while someone is still typing.
 *
 * The local results never wait for the remote ones. A palette that blanks for
 * 200ms on every character is slower to use than one that is merely stale.
 */

type Row =
  | { type: "page"; id: string; label: string; hint?: string; href: string; section: string }
  | { type: "create"; id: string; label: string; hint?: string; href: string }
  | { type: "result"; id: string; result: SearchResult }
  | { type: "ai"; id: string; query: string }
  | { type: "search"; id: string; query: string };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Results carry the term they answered. Rendering is then a comparison
  // rather than a cleanup: a stale set simply stops matching and is ignored,
  // so nothing has to be cleared from inside an effect.
  const [results, setResults] = useState<{ term: string; rows: SearchResult[] }>(
    { term: "", rows: [] },
  );
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useHotkey("mod+k", (event) => {
    event.preventDefault();
    setOpen((previous) => !previous);
  });

  // Remote content search. Debounced, and every in-flight request is dropped
  // the moment the query moves on.
  useEffect(() => {
    const term = query.trim();
    if (!open || term.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusyFor(term);
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(term)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(String(response.status));
        const payload = (await response.json()) as { results?: SearchResult[] };
        setResults({ term, rows: payload.results ?? [] });
      } catch (error) {
        // An abort is the normal path, not a failure worth reporting.
        if ((error as Error)?.name !== "AbortError") {
          setResults({ term, rows: [] });
        }
      } finally {
        if (!controller.signal.aborted) setBusyFor(null);
      }
    }, 160);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const rows = useMemo<Row[]>(() => {
    const term = query.trim().toLowerCase();

    const pages = LINKED_NAV_ITEMS.filter((item) => {
      if (!term) return true;
      const haystack = [
        item.label,
        item.section.label,
        item.hint ?? "",
        ...(item.keywords ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    })
      .slice(0, term ? 6 : 8)
      .map<Row>((item) => ({
        type: "page",
        id: `page:${item.id}`,
        label: item.label,
        hint: item.hint,
        href: item.href,
        section: item.section.label,
      }));

    const creates = QUICK_CREATE.filter((action) =>
      term
        ? `${action.label} ${action.keywords ?? ""}`.toLowerCase().includes(term)
        : false,
    )
      .slice(0, 4)
      .map<Row>((action) => ({
        type: "create",
        id: `create:${action.id}`,
        label: action.label,
        hint: action.hint,
        href: action.href,
      }));

    // Only the set that answered the current term. Anything older is stale by
    // definition and would put another query's results under this one.
    const content =
      results.term === query.trim()
        ? results.rows.slice(0, 8).map<Row>((result) => ({
            type: "result",
            id: `result:${result.kind}:${result.id}`,
            result,
          }))
        : [];

    const tail: Row[] = term
      ? [
          { type: "ai", id: "ai", query: term },
          { type: "search", id: "search", query: term },
        ]
      : [];

    return [...pages, ...creates, ...content, ...tail];
  }, [query, results]);

  // Clamp rather than reset: the highlight should survive results arriving.
  const index = Math.min(active, Math.max(0, rows.length - 1));

  function run(row: Row) {
    setOpen(false);
    setQuery("");
    setActive(0);

    switch (row.type) {
      case "page":
      case "create":
        router.push(row.href);
        break;
      case "result":
        router.push(row.result.href);
        break;
      case "ai":
        // Opens the dock rather than navigating, so the workspace is kept.
        openPanel();
        update({ aiOpen: true });
        router.push(`/ai?q=${encodeURIComponent(row.query)}`);
        break;
      case "search":
        router.push(`/search?q=${encodeURIComponent(row.query)}`);
        break;
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((previous) => (previous + 1) % Math.max(1, rows.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(
        (previous) => (previous - 1 + rows.length) % Math.max(1, rows.length),
      );
      return;
    }
    if (event.key === "Enter" && rows[index]) {
      event.preventDefault();
      run(rows[index]);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-start justify-center p-4 pt-[12vh]"
      role="dialog"
      aria-modal
      aria-label="Command palette"
    >
      <button
        type="button"
        aria-label="Close command palette"
        onClick={() => setOpen(false)}
        className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-sm"
      />

      <div className="glass relative w-full max-w-2xl overflow-hidden rounded-2xl border shadow-2xl">
        <div className="flex items-center gap-3 border-b px-4">
          {busyFor !== null ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Search className="size-4 shrink-0 text-muted-foreground" />
          )}
          {/* The palette exists to be typed into; opening it and landing
              nowhere would mean reaching for the mouse. */}
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search pages, products, companies, properties, people…"
            className="h-13 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-96 overflow-y-auto p-2">
          {rows.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nothing matches “{query.trim()}”.
            </p>
          )}

          {rows.map((row, position) => (
            <button
              key={row.id}
              type="button"
              onMouseEnter={() => setActive(position)}
              onClick={() => run(row)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                position === index ? "bg-muted" : "hover:bg-muted/60",
              )}
            >
              <RowIcon row={row} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {rowTitle(row)}
                </span>
                {rowHint(row) && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {rowHint(row)}
                  </span>
                )}
              </span>
              {position === index && (
                <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border px-1">↑</kbd>
            <kbd className="rounded border px-1">↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border px-1">↵</kbd> open
          </span>
          <span className="ml-auto flex items-center gap-1">
            <kbd className="rounded border px-1">⌘</kbd>
            <kbd className="rounded border px-1">K</kbd> toggle
          </span>
        </div>
      </div>
    </div>
  );
}

function RowIcon({ row }: { row: Row }) {
  const box =
    "flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground";
  switch (row.type) {
    case "result":
      return (
        <span className={box}>
          <SearchKindIcon kind={row.result.kind} className="size-3.5" />
        </span>
      );
    case "create":
      return (
        <span className={cn(box, "bg-brand/12 text-brand")}>
          <Plus className="size-3.5" />
        </span>
      );
    case "ai":
      return (
        <span className={cn(box, "bg-brand/12 text-brand")}>
          <Sparkles className="size-3.5" />
        </span>
      );
    default:
      return (
        <span className={box}>
          <ArrowRight className="size-3.5" />
        </span>
      );
  }
}

function rowTitle(row: Row): string {
  switch (row.type) {
    case "result":
      return row.result.title;
    case "ai":
      return `Ask Medosha AI about “${row.query}”`;
    case "search":
      return `Search everything for “${row.query}”`;
    default:
      return row.label;
  }
}

function rowHint(row: Row): string | undefined {
  switch (row.type) {
    case "page":
      return row.hint ? `${row.section} · ${row.hint}` : row.section;
    case "result":
      return row.result.subtitle ?? undefined;
    case "create":
      return row.hint;
    default:
      return undefined;
  }
}
