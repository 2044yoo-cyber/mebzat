import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, Sparkles } from "lucide-react";

import { GlobalSearch } from "@/components/search/global-search";
import { SearchKindIcon } from "@/components/search/kind-icon";
import { SEARCH_KINDS, isSearchKind, searchKindLabel } from "@/lib/constants/search";
import { globalSearch, groupByKind, normalizeQuery } from "@/lib/data/search";
import { cn } from "@/lib/utils";
import type { SearchKind } from "@/types/database.types";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await props.searchParams;
  const q = normalizeQuery(Array.isArray(sp.q) ? sp.q[0] : sp.q);
  return {
    title: q ? `${q} — Search` : "Search",
    description: `Search products, companies, professionals, prices, services, equipment, jobs and events across Medosha.`,
    // A results page has nothing durable for an index to point at.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const get = (key: string) => (Array.isArray(sp[key]) ? sp[key][0] : sp[key]);

  const q = normalizeQuery(get("q"));
  const kindParam = get("kind");
  const kind: SearchKind | null = isSearchKind(kindParam) ? kindParam : null;

  const { results, available } = await globalSearch(q, {
    // One kind selected means the user wants depth, not breadth.
    perKind: kind ? 40 : 6,
    kinds: kind ? [kind] : undefined,
  });

  const groups = groupByKind(results);
  const counts = new Map(groups.map((group) => [group.kind, group.results.length]));

  function hrefFor(nextKind: SearchKind | null) {
    const params = new URLSearchParams({ q });
    if (nextKind) params.set("kind", nextKind);
    return `/search?${params}`;
  }

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">
          {q ? <>Results for “{q}”</> : "Search Medosha"}
        </h1>
        <div className="mt-4">
          <GlobalSearch initialQuery={q} size="hero" autoFocus={!q} />
        </div>
      </div>

      {!q ? (
        <Empty
          icon={<SearchX className="size-8" />}
          title="Type something to search"
          description="Products, companies, professionals, projects, prices, services, equipment, jobs, events, posts and hashtags — all from one box."
        />
      ) : !available ? (
        <Empty
          icon={<SearchX className="size-8" />}
          title="Search is not set up yet"
          description="Apply migration 0013_global_search.sql, then search will work across the whole platform."
        />
      ) : (
        <>
          <nav
            aria-label="Filter by type"
            className="mx-auto mt-8 flex max-w-5xl flex-wrap justify-center gap-2"
          >
            <Link
              href={hrefFor(null)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                kind === null
                  ? "border-brand bg-brand text-brand-foreground"
                  : "hover:border-brand hover:bg-brand/5",
              )}
            >
              Everything
            </Link>
            {SEARCH_KINDS.map((entry) => {
              const count = counts.get(entry.value);
              // Hide a filter that would land on nothing, unless it is the one
              // currently applied — removing it under the user is worse.
              if (!count && kind !== entry.value) return null;
              return (
                <Link
                  key={entry.value}
                  href={hrefFor(entry.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    kind === entry.value
                      ? "border-brand bg-brand text-brand-foreground"
                      : "hover:border-brand hover:bg-brand/5",
                  )}
                >
                  <SearchKindIcon kind={entry.value} className="size-3.5" />
                  {entry.label}
                  {count ? (
                    <span className="text-xs opacity-70">{count}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {results.length === 0 ? (
            <div className="mx-auto mt-10 max-w-xl">
              <Empty
                icon={<SearchX className="size-8" />}
                title={`Nothing matches “${q}”`}
                description="Try a shorter or more general word."
              />
              <AskAi query={q} />
            </div>
          ) : (
            <div className="mx-auto mt-8 max-w-5xl space-y-10">
              {groups.map((group) => (
                <section key={group.kind}>
                  <div className="mb-3 flex items-end justify-between gap-4">
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                      <SearchKindIcon
                        kind={group.kind}
                        className="size-4 text-brand"
                      />
                      {searchKindLabel(group.kind)}
                    </h2>
                    {kind === null && group.results.length >= 6 && (
                      <Link
                        href={hrefFor(group.kind)}
                        className="text-sm font-medium text-brand hover:underline"
                      >
                        See all
                      </Link>
                    )}
                  </div>

                  <ul className="divide-y rounded-2xl border">
                    {group.results.map((result) => (
                      <li key={`${result.kind}-${result.id}`}>
                        <Link
                          href={result.href}
                          className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/50"
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                            <SearchKindIcon
                              kind={result.kind}
                              className="size-4"
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {result.title}
                            </span>
                            <span className="block truncate text-sm text-muted-foreground">
                              {[result.subtitle, result.detail]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              <AskAi query={q} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The escape hatch when the catalogue does not have the answer. */
function AskAi({ query }: { query: string }) {
  return (
    <Link
      href={`/ai?q=${encodeURIComponent(query)}`}
      className="flex items-center gap-4 rounded-2xl border border-dashed p-5 transition-colors hover:border-brand hover:bg-brand/5"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
        <Sparkles className="size-4" />
      </span>
      <span>
        <span className="block font-medium">
          Ask Medosha AI about “{query}”
        </span>
        <span className="block text-sm text-muted-foreground">
          Cost estimates, bills of quantities, materials and suppliers.
        </span>
      </span>
    </Link>
  );
}

function Empty({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-dashed p-14 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
