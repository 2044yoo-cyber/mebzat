import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HardHat, Plus } from "lucide-react";

import { ProfessionalCard } from "@/components/professionals/professional-card";
import { ProfessionalSearch } from "@/components/professionals/professional-search";
import { buttonVariants } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import {
  PAGE_SIZE,
  listAreas,
  searchProfessionals,
  type ProfessionalSort,
  type ProviderType,
} from "@/lib/data/professionals";
import { getServiceCategories } from "@/lib/data/services";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Find Professionals — welders, carpenters, electricians and more",
  description:
    "Find a professional who will come to your job. Search by trade and by where the work is, not by where the tradesperson happens to live.",
};

export const dynamic = "force-dynamic";

const SORTS: ProfessionalSort[] = ["relevance", "rating", "nearest", "experience"];

export default async function ProfessionalsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const get = (key: string) => {
    const value = sp[key];
    return (Array.isArray(value) ? value[0] : value) ?? "";
  };

  const q = get("q");
  const profession = get("profession");
  const category = get("category");
  // Where the *job* is. Not where anybody lives.
  const area = get("area");
  const providerParam = get("provider");
  const provider: ProviderType | undefined =
    providerParam === "individual" || providerParam === "company"
      ? providerParam
      : undefined;
  const ratingParam = get("rating");
  const experienceParam = get("experience");
  const sortParam = get("sort");
  const sort = (SORTS as string[]).includes(sortParam)
    ? (sortParam as ProfessionalSort)
    : "relevance";
  const verified = get("verified") === "1";
  const available = get("available") === "1";
  const page = Math.max(1, Number(get("page")) || 1);

  const minRating = Number(ratingParam);
  const minExperience = Number(experienceParam);

  const [result, categories, areas] = await Promise.all([
    searchProfessionals({
      query: q,
      profession,
      category,
      area,
      provider,
      minRating:
        Number.isFinite(minRating) && minRating > 0 ? minRating : undefined,
      minExperience:
        Number.isFinite(minExperience) && minExperience > 0
          ? minExperience
          : undefined,
      verifiedOnly: verified,
      availableOnly: available,
      sort,
      page,
    }),
    getServiceCategories(),
    listAreas(),
  ]);

  const areaName = areas.find((a) => a.slug === area)?.name ?? "";

  function makeHref(nextPage: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({
      q,
      profession,
      category,
      area,
      provider: providerParam,
      rating: ratingParam,
      experience: experienceParam,
      sort: sortParam,
    })) {
      if (value) params.set(key, value);
    }
    if (verified) params.set("verified", "1");
    if (available) params.set("available", "1");
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/professionals?${qs}` : "/professionals";
  }

  const filtered = Boolean(
    q || profession || category || area || providerParam || ratingParam ||
      experienceParam || verified || available,
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HardHat className="size-4" /> Professionals
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Find Professionals
          </h1>
          <p className="mt-1 text-muted-foreground">
            Search by the trade you need and by where the job is. Somebody based
            across town who works in your area still counts.
          </p>
        </div>
        <Link
          href="/hire/new"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "min-h-11 shrink-0",
          )}
        >
          <Plus className="size-4" /> Post a Job
        </Link>
      </div>

      {/* useSearchParams lives inside, so the shell renders without waiting. */}
      <Suspense fallback={<div className="h-32" />}>
        <ProfessionalSearch
          areas={areas}
          categories={categories.map((entry) => ({
            slug: entry.slug,
            name: entry.name,
          }))}
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
            title={
              areaName
                ? `Nobody lists ${areaName} yet`
                : "Nobody matches that yet"
            }
            description={
              filtered
                ? "Try a wider search — a different area, or fewer filters."
                : "Professionals will appear here as they add their trade and the areas they work in."
            }
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {result.total}{" "}
              {result.total === 1 ? "professional" : "professionals"}
              {areaName ? ` who work in ${areaName}` : ""}
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {result.professionals.map((person) => (
                <li key={person.id}>
                  <ProfessionalCard person={person} jobArea={areaName} />
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
