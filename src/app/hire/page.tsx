import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Plus, Sparkles } from "lucide-react";

import { BriefCard } from "@/components/hire/brief-card";
import { Pagination } from "@/components/ui/pagination";
import { buttonVariants } from "@/components/ui/button";
import { PAGE_SIZE, getBriefs, getInvitedBriefs } from "@/lib/data/briefs";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Find work — Projects looking for professionals",
  description:
    "Clients post construction projects and professionals bid. Kitchen renovations, wardrobes, villas, office interiors and more across Ethiopia.",
};

export const dynamic = "force-dynamic";

/** The categories briefs are most often posted under. */
const CATEGORIES = [
  "joinery",
  "interior",
  "general-contracting",
  "architecture",
  "structural",
  "mep",
  "electrical",
  "plumbing",
  "finishing",
  "landscaping",
];

export default async function HirePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const get = (key: string) => (Array.isArray(sp[key]) ? sp[key][0] : sp[key]);

  const q = get("q") ?? "";
  const category = get("category") ?? "";
  const page = Math.max(1, Number(get("page")) || 1);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  const [result, invited] = await Promise.all([
    getBriefs({ q, category: category || undefined, page }),
    auth.user ? getInvitedBriefs(auth.user.id) : Promise.resolve([]),
  ]);

  function buildHref(
    overrides: Record<string, string | null>,
    nextPage?: number,
  ) {
    const params = new URLSearchParams();
    const current: Record<string, string> = {};
    if (q) current.q = q;
    if (category) current.category = category;

    for (const [key, value] of Object.entries({ ...current, ...overrides })) {
      if (value) params.set(key, value);
    }
    if (nextPage && nextPage > 1) params.set("page", String(nextPage));

    const qs = params.toString();
    return qs ? `/hire?${qs}` : "/hire";
  }

  return (
    <div className="container-page py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Briefcase className="size-4" /> Project marketplace
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Projects looking for professionals
          </h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Clients describe the work, professionals bid, and the client
            compares the offers side by side.
          </p>
        </div>
        <Link href="/hire/new" className={buttonVariants({ size: "lg" })}>
          <Plus className="size-4" />
          Post a project
        </Link>
      </header>

      {/* Briefs the matcher picked out for this professional come first —
          they are the ones worth their time. */}
      {invited.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 font-medium">
            <Sparkles className="size-4 text-brand" />
            Matched to your services
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {invited.slice(0, 3).map((brief) => (
              <BriefCard key={brief.id} brief={brief} />
            ))}
          </div>
        </section>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Link
          href={buildHref({ category: null })}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            !category
              ? "border-brand bg-brand text-brand-foreground"
              : "hover:border-brand hover:bg-brand/5",
          )}
        >
          All projects
        </Link>
        {CATEGORIES.map((value) => (
          <Link
            key={value}
            href={buildHref({ category: category === value ? null : value })}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium capitalize transition-colors",
              category === value
                ? "border-brand bg-brand text-brand-foreground"
                : "hover:border-brand hover:bg-brand/5",
            )}
          >
            {value.replace(/-/g, " ")}
          </Link>
        ))}
      </div>

      {!result.available ? (
        <Empty
          title="The project marketplace is not set up yet"
          description="Apply migration 0015_project_marketplace.sql, then projects will appear here."
        />
      ) : result.briefs.length === 0 ? (
        <Empty
          title="No open projects match that"
          description="Try another category, or post the first project yourself."
        />
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            {result.total} open {result.total === 1 ? "project" : "projects"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.briefs.map((brief) => (
              <BriefCard key={brief.id} brief={brief} />
            ))}
          </div>
          <div className="mt-10">
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={result.total}
              makeHref={(nextPage) => buildHref({}, nextPage)}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed p-16 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
