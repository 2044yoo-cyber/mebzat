import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, Briefcase, Plus } from "lucide-react";

import { JobCard } from "@/components/jobs/job-card";
import { buttonVariants } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import {
  EXPERIENCE_LEVEL,
  JOB_TYPE,
  WORK_MODE,
  isExperienceLevel,
  isJobType,
  isWorkMode,
} from "@/lib/constants/community";
import {
  JOB_CATEGORIES,
  JOB_CATEGORY_GROUPS,
  isJobCategory,
  jobCategoryLabel,
} from "@/lib/constants/jobs";
import {
  PAGE_SIZE,
  getJobCategoryCounts,
  getJobCities,
  getJobs,
} from "@/lib/data/jobs";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { ExperienceLevel, JobType, WorkMode } from "@/types/database.types";

export const metadata: Metadata = {
  title: "Jobs — Construction roles across Ethiopia",
  description:
    "Site engineers, architects, foremen, electricians and freelancers. Find construction work with companies hiring on Medosha.",
};

export const dynamic = "force-dynamic";

export default async function JobsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const get = (key: string) => (Array.isArray(sp[key]) ? sp[key][0] : sp[key]);

  const q = get("q") ?? "";
  const typeParam = get("type");
  const modeParam = get("mode");
  const levelParam = get("level");
  const categoryParam = get("category");

  const jobType: JobType | undefined = isJobType(typeParam) ? typeParam : undefined;
  const workMode: WorkMode | undefined = isWorkMode(modeParam) ? modeParam : undefined;
  const level: ExperienceLevel | undefined = isExperienceLevel(levelParam)
    ? levelParam
    : undefined;
  // An unknown category would silently return nothing, which reads as "there
  // are no jobs" rather than "that filter is not a thing".
  const category = isJobCategory(categoryParam) ? categoryParam : "";
  const city = get("city") ?? "";
  const skill = get("skill") ?? "";
  const sortParam = get("sort");
  const sort: "recent" | "closing" | "salary" =
    sortParam === "closing" || sortParam === "salary" ? sortParam : "recent";
  const page = Math.max(1, Number(get("page")) || 1);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [result, cities, categoryCounts] = await Promise.all([
    getJobs({
      q,
      category: category || undefined,
      jobType,
      workMode,
      level,
      city: city || undefined,
      skill: skill || undefined,
      sort,
      page,
    }),
    getJobCities(),
    getJobCategoryCounts(),
  ]);

  function buildHref(
    overrides: Record<string, string | null>,
    nextPage?: number,
  ) {
    const params = new URLSearchParams();
    const current: Record<string, string> = {};
    if (q) current.q = q;
    if (category) current.category = category;
    if (jobType) current.type = jobType;
    if (workMode) current.mode = workMode;
    if (level) current.level = level;
    if (city) current.city = city;
    if (skill) current.skill = skill;
    if (sort !== "recent") current.sort = sort;

    for (const [key, value] of Object.entries({ ...current, ...overrides })) {
      if (value) params.set(key, value);
    }
    if (nextPage && nextPage > 1) params.set("page", String(nextPage));

    const qs = params.toString();
    return qs ? `/jobs?${qs}` : "/jobs";
  }

  const activeFilters = [
    category ? { label: jobCategoryLabel(category), href: buildHref({ category: null }) } : null,
    skill ? { label: skill, href: buildHref({ skill: null }) } : null,
    jobType ? { label: JOB_TYPE[jobType], href: buildHref({ type: null }) } : null,
    workMode ? { label: WORK_MODE[workMode], href: buildHref({ mode: null }) } : null,
    level ? { label: EXPERIENCE_LEVEL[level], href: buildHref({ level: null }) } : null,
    city ? { label: city, href: buildHref({ city: null }) } : null,
  ].filter((entry): entry is { label: string; href: string } => entry !== null);

  return (
    <div className="container-page py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Briefcase className="size-4" /> Jobs
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Construction jobs
          </h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Permanent roles, contracts and freelance work from companies and
            professionals hiring across Ethiopia.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {user && (
            <>
              <Link
                href="/jobs/saved"
                className={buttonVariants({ variant: "outline" })}
              >
                <Bookmark className="size-4" />
                Saved
              </Link>
              <Link
                href="/jobs/applications"
                className={buttonVariants({ variant: "outline" })}
              >
                My applications
              </Link>
            </>
          )}
          <Link href="/jobs/new" className={buttonVariants()}>
            <Plus className="size-4" />
            Post a job
          </Link>
        </div>
      </header>

      {/* Search is a plain GET form so the URL is the state: a link to
          "surveying in Hawassa" is a link somebody can send. */}
      <form action="/jobs" className="mb-6 flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search titles, professions, descriptions…"
          className="h-9 min-w-0 flex-1 rounded-lg border bg-transparent px-3 text-sm"
          aria-label="Search jobs"
        />
        {category && <input type="hidden" name="category" value={category} />}
        {jobType && <input type="hidden" name="type" value={jobType} />}
        {workMode && <input type="hidden" name="mode" value={workMode} />}
        {level && <input type="hidden" name="level" value={level} />}
        {city && <input type="hidden" name="city" value={city} />}
        <button type="submit" className={buttonVariants({ size: "lg" })}>
          Search
        </button>
      </form>

      {activeFilters.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-muted-foreground">Filtered by</span>
          {activeFilters.map((entry) => (
            <Link
              key={entry.label}
              href={entry.href}
              className="rounded-full border border-brand bg-brand/10 px-2.5 py-1 text-sm text-brand"
            >
              {entry.label} ✕
            </Link>
          ))}
          <Link
            href="/jobs"
            className="ml-1 text-sm text-muted-foreground underline"
          >
            Clear all
          </Link>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <div>
            <h2 className="mb-2 text-sm font-medium">Trade</h2>
            <ul className="space-y-3">
              {JOB_CATEGORY_GROUPS.map((group) => {
                const entries = JOB_CATEGORIES.filter(
                  (entry) => entry.group === group,
                ).filter(
                  // Only categories somebody is actually hiring for, plus the
                  // one that is selected. Twenty-six dead links is not a filter.
                  (entry) =>
                    (categoryCounts[entry.id] ?? 0) > 0 || entry.id === category,
                );
                if (entries.length === 0) return null;

                return (
                  <li key={group}>
                    <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                      {group}
                    </p>
                    <ul className="space-y-0.5">
                      {entries.map((entry) => (
                        <li key={entry.id}>
                          <Link
                            href={buildHref({
                              category: category === entry.id ? null : entry.id,
                            })}
                            className={cn(
                              "flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm transition-colors",
                              category === entry.id
                                ? "bg-muted font-medium text-foreground"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {entry.label}
                            <span className="tabular-nums text-xs opacity-70">
                              {categoryCounts[entry.id] ?? 0}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </div>

          <FilterGroup
            title="Contract"
            entries={JOB_TYPE}
            active={jobType}
            hrefFor={(value) => buildHref({ type: value })}
          />
          <FilterGroup
            title="Work mode"
            entries={WORK_MODE}
            active={workMode}
            hrefFor={(value) => buildHref({ mode: value })}
          />
          <FilterGroup
            title="Experience"
            entries={EXPERIENCE_LEVEL}
            active={level}
            hrefFor={(value) => buildHref({ level: value })}
          />
          {cities.length > 0 && (
            <FilterGroup
              title="Location"
              entries={Object.fromEntries(cities.map((c) => [c, c]))}
              active={city || undefined}
              hrefFor={(value) => buildHref({ city: value })}
            />
          )}
        </aside>

        <div>
          {!result.available ? (
            <Empty
              title="Jobs are not set up yet"
              description="Apply 0032, 0033, 0034 and 0035, then postings will appear here."
            />
          ) : result.jobs.length === 0 ? (
            <Empty
              title="No jobs match those filters"
              description="Try clearing a filter, or post the role yourself — the professionals are already here."
            />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {result.total} open {result.total === 1 ? "role" : "roles"}
                </p>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-muted-foreground">Sort</span>
                  {(
                    [
                      { id: "recent", label: "Newest" },
                      { id: "closing", label: "Closing soon" },
                      { id: "salary", label: "Pay" },
                    ] as const
                  ).map((entry) => (
                    <Link
                      key={entry.id}
                      href={buildHref({
                        sort: entry.id === "recent" ? null : entry.id,
                      })}
                      className={cn(
                        "rounded-lg px-2 py-0.5 transition-colors",
                        sort === entry.id
                          ? "bg-muted font-medium"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {entry.label}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {result.jobs.map((job) => (
                  <JobCard key={job.id} job={job} />
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
      </div>
    </div>
  );
}

function FilterGroup({
  title,
  entries,
  active,
  hrefFor,
}: {
  title: string;
  entries: Record<string, string>;
  active: string | undefined;
  hrefFor: (value: string | null) => string;
}) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      <ul className="space-y-1">
        <li>
          <Link
            href={hrefFor(null)}
            className={cn(
              "block rounded-lg px-2 py-1 text-sm transition-colors",
              !active
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Any
          </Link>
        </li>
        {Object.entries(entries).map(([value, label]) => (
          <li key={value}>
            <Link
              href={hrefFor(active === value ? null : value)}
              className={cn(
                "block rounded-lg px-2 py-1 text-sm transition-colors",
                active === value
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
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
