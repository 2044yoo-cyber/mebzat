"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";

import { SearchKindIcon } from "@/components/search/kind-icon";
import { Button } from "@/components/ui/button";
import { searchKindLabel } from "@/lib/constants/search";
import { cn } from "@/lib/utils";
import type { SearchResult } from "@/types/database.types";

/**
 * The one search box.
 *
 * Searches everything — products, companies, professionals, projects, prices,
 * services, equipment, jobs, events, posts and hashtags — through a single
 * endpoint, and offers Medosha AI as the last option when nothing in the
 * catalogue answers the question.
 *
 * Requests are debounced and the in-flight one is aborted when the next
 * keystroke lands, so a fast typist cannot leave a slow early response to
 * overwrite a fast later one.
 */

const DEBOUNCE_MS = 180;
const MIN_CHARS = 2;

export function GlobalSearch({
  placeholder = "Search products, companies, professionals, prices…",
  size = "default",
  autoFocus = false,
  initialQuery = "",
}: {
  placeholder?: string;
  size?: "default" | "hero";
  autoFocus?: boolean;
  initialQuery?: string;
}) {
  const router = useRouter();
  const listId = useId();

  const [term, setTerm] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // One suggestion request per settled keystroke, and never two in flight.
  // Nothing is set synchronously here: a query below the threshold is handled
  // by deriving the visible results below, not by clearing state in an effect.
  useEffect(() => {
    const query = term.trim();
    if (query.length < MIN_CHARS) return;

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("search failed");
        const data = (await response.json()) as { results: SearchResult[] };
        setResults(data.results ?? []);
        setActive(-1);
      } catch {
        // An abort is the normal path when typing continues; a real failure
        // leaves the box usable and the form still submits to /search.
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  // Clicking away closes the panel; Escape is handled on the input itself.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const query = term.trim();
  const longEnough = query.length >= MIN_CHARS;

  // Derived rather than stored: shrinking the query back below the threshold
  // hides the previous results without an effect having to clear them.
  const visible = longEnough ? results : [];
  const busy = loading && longEnough;

  // The AI option always sits last, so it has an index past the results.
  const aiIndex = visible.length;
  const optionCount = visible.length + 1;
  const showPanel = open && longEnough;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function askAi() {
    go(`/ai?q=${encodeURIComponent(term.trim())}`);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!query) return;

    if (active >= 0 && active < visible.length) {
      {
              const hit = visible[active];
              if (hit) go(hit.href);
            }
      return;
    }
    if (active === aiIndex) {
      askAi();
      return;
    }
    go(`/search?q=${encodeURIComponent(query)}`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!showPanel || optionCount === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % optionCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index <= 0 ? optionCount - 1 : index - 1));
    }
  }

  const hero = size === "hero";

  return (
    <div ref={containerRef} className="relative w-full">
      <form
        onSubmit={submit}
        role="search"
        className={cn(
          "glass flex items-center gap-2 rounded-2xl border shadow-sm transition-shadow",
          hero ? "p-2" : "p-1.5",
          showPanel && "rounded-b-none",
        )}
      >
        <Search
          className={cn(
            "ml-2 shrink-0 text-muted-foreground",
            hero ? "size-5" : "size-4",
          )}
        />
        <input
          ref={inputRef}
          value={term}
          autoFocus={autoFocus}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Search Medosha"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            active >= 0 ? `${listId}-option-${active}` : undefined
          }
          className={cn(
            "w-full bg-transparent outline-none placeholder:text-muted-foreground",
            hero ? "h-10 text-base" : "h-8 text-sm",
          )}
        />
        {busy && (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        )}
        <Button type="submit" size={hero ? "lg" : "sm"} className="shrink-0">
          Search
        </Button>
      </form>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search suggestions"
          className={cn(
            "absolute inset-x-0 top-full z-50 overflow-hidden rounded-b-2xl border border-t-0",
            "bg-popover shadow-xl",
          )}
        >
          {visible.length === 0 && !busy && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Nothing in the catalogue matches that.
            </p>
          )}

          <ul className="max-h-96 overflow-y-auto">
            {visible.map((result, index) => (
              <li key={`${result.kind}-${result.id}`}>
                <button
                  type="button"
                  id={`${listId}-option-${index}`}
                  role="option"
                  aria-selected={active === index}
                  onPointerEnter={() => setActive(index)}
                  onClick={() => go(result.href)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    active === index ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <SearchKindIcon kind={result.kind} className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {result.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {searchKindLabel(result.kind)}
                      {result.subtitle ? ` · ${result.subtitle}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}

            {/* Always last: when the catalogue has no answer, the assistant
                might, and it should never outrank a real listing. */}
            <li className="border-t">
              <button
                type="button"
                id={`${listId}-option-${aiIndex}`}
                role="option"
                aria-selected={active === aiIndex}
                onPointerEnter={() => setActive(aiIndex)}
                onClick={askAi}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                  active === aiIndex ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Sparkles className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    Ask Medosha AI about “{term.trim()}”
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Costs, materials, suppliers and schedules
                  </span>
                </span>
              </button>
            </li>
          </ul>

          <button
            type="button"
            onClick={() => go(`/search?q=${encodeURIComponent(term.trim())}`)}
            className="block w-full border-t px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            See all results for “{term.trim()}”
          </button>
        </div>
      )}
    </div>
  );
}
