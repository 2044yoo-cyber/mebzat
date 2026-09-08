import type { Metadata } from "next";
import { Suspense } from "react";
import { HardHat } from "lucide-react";

import { ProfessionalCard } from "@/components/professionals/professional-card";
import { ProfessionalFilters } from "@/components/professionals/professional-filters";
import { Pagination } from "@/components/ui/pagination";
import { PAGE_SIZE, searchProfessionals } from "@/lib/data/professionals";
import { getServiceCategories } from "@/lib/data/services";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Find a professional — Carpenters, contractors and engineers",
  description:
    "Search construction professionals across Ethiopia by trade, city, rating and availability. See who has been reviewed by clients who actually hired them.",
};

export const dynamic = "force-dynamic";

/**
 * The cities to offer in the filter.
 *
 * Taken from the profiles that exist rather than a hard-coded list, so a town
 * nobody works in is not offered and a town somebody just moved to is.
 */
async function citiesWithProfessionals(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("location_city")
    .not("location_city", "is", null)
    .not("username", "is", null)
    .limit(500);

  const seen = new Set<string>();
  for (const row of data ?? []) {
    const city = (row.location_city ?? "").trim();
    if (city) seen.add(city);
  }
  return [...seen].sort((a, b) => a.localeCompare(b)).slice(0, 60);
}

export default async function ProfessionalsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const get = (key: string) => (Array.isArray(sp[key]) ? sp[key][0] : sp[key]);

  const q = get("q") ?? "";
  const category = get("category") ?? "";
  const city = get("city") ?? "";
  const ratingParam = get("rating") ?? "";
  const verified = get("verified") === "1";
  const available = get("available") === "1";
  const page = Math.max(1, Number(get("page")) || 1);

  const minRating = Number(ratingParam);
  const [result, categories, cities] = await Promise.all([
    searchProfessionals({
      query: q,
      category,
      city,
      minRating: Number.isFinite(minRating) && minRating > 0 ? minRating : undefined,
      verifiedOnly: verified,
      availableOnly: available,
      page,
    }),
    getServiceCategories(),
    citiesWithProfessionals(),
  ]);

  function makeHref(nextPage: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (city) params.set("city", city);
    if (ratingParam) params.set("rating", ratingParam);
    if (verified) params.set("verified", "1");
    if (available) params.set("available", "1");
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/professionals?${qs}` : "/professionals";
  }

  const filtered = Boolean(q || category || city || ratingParam || verified || available);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <HardHat className="size-4" /> Professionals
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Find a professional
        </h1>
        <p className="mt-1 text-muted-foreground">
          Carpenters, contractors, engineers and finishers. Ranked by what
          clients said, not by who has been looked at most.
        </p>
      </div>

      {/* useSearchParams inside the filters, so the shell renders without
          waiting for them. */}
      <Suspense fallback={<div className="h-40" />}>
        <ProfessionalFilters
          current={{ q, category, city, rating: ratingParam, verified, available }}
          categories={categories.map((entry) => ({
            slug: entry.slug,
            name: entry.name,
          }))}
          cities={cities}
        />
      </Suspense>

      <div className="mt-6">
        {!result.available ? (
          <Empty
            title="Professional search is being set up"
            description="People will appear here once the directory is ready."
          />
        ) : result.professionals.length === 0 ? (
          <Empty
            title="Nobody matches that yet"
            description={
              filtered
                ? "Try a wider search — fewer filters, or a different city."
                : "Professionals will appear here as they add their services."
            }
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {result.total} {result.total === 1 ? "professional" : "professionals"}
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {result.professionals.map((person) => (
                <li key={person.id}>
                  <ProfessionalCard person={person} />
                </li>
              ))}
            </ul>
            <div className="mt-10">
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={result.total}
                makeHref={makeHref}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-12 text-center sm:p-16">
      <HardHat className="size-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
