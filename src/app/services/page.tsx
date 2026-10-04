import type { Metadata } from "next";
import Link from "next/link";
import { Wrench } from "lucide-react";

import { ServiceCard } from "@/components/services/service-card";
import { Pagination } from "@/components/ui/pagination";
import {
  PAGE_SIZE,
  getServiceCategories,
  getServices,
  type ServiceSort,
} from "@/lib/data/services";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Services — Professional construction services",
  description:
    "Architecture, structural engineering, contracting, fit-out, landscaping and more from professionals across Ethiopia.",
};

export const dynamic = "force-dynamic";

const SORTS: Record<ServiceSort, string> = {
  rating: "Best rated",
  cheapest: "Lowest price",
  newest: "Recently listed",
};

function isSort(value: unknown): value is ServiceSort {
  return typeof value === "string" && value in SORTS;
}

export default async function ServicesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const get = (key: string) => (Array.isArray(sp[key]) ? sp[key][0] : sp[key]);

  const q = get("q") ?? "";
  const category = get("category") ?? "";
  const acceptingOnly = get("accepting") === "1";
  const sortParam = get("sort");
  const sort: ServiceSort = isSort(sortParam) ? sortParam : "rating";
  const page = Math.max(1, Number(get("page")) || 1);

  const [result, categories] = await Promise.all([
    getServices({
      q,
      categorySlug: category || undefined,
      acceptingOnly,
      sort,
      page,
    }),
    getServiceCategories(),
  ]);

  function buildHref(
    overrides: Record<string, string | null>,
    nextPage?: number,
  ) {
    const params = new URLSearchParams();
    const current: Record<string, string> = {};
    if (q) current.q = q;
    if (category) current.category = category;
    if (acceptingOnly) current.accepting = "1";
    if (sort !== "rating") current.sort = sort;

    for (const [key, value] of Object.entries({ ...current, ...overrides })) {
      if (value) params.set(key, value);
    }
    if (nextPage && nextPage > 1) params.set("page", String(nextPage));

    const qs = params.toString();
    return qs ? `/services?${qs}` : "/services";
  }

  return (
    <div className="container-page py-10">
      <header className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wrench className="size-4" /> Services
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Professional construction services
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Design, engineering, contracting and finishing — priced by the hour,
          the square metre or the project.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={buildHref({ category: null })}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            !category
              ? "border-brand bg-brand text-brand-foreground"
              : "hover:border-brand hover:bg-brand/5",
          )}
        >
          All services
        </Link>
        {categories.map((entry) => (
          <Link
            key={entry.id}
            href={buildHref({
              category: category === entry.slug ? null : entry.slug,
            })}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              category === entry.slug
                ? "border-brand bg-brand text-brand-foreground"
                : "hover:border-brand hover:bg-brand/5",
            )}
          >
            {entry.name}
          </Link>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={buildHref({ accepting: acceptingOnly ? null : "1" })}
          className={cn(
            "rounded-full px-2.5 py-1 text-sm transition-colors",
            acceptingOnly
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Taking work now
        </Link>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {(Object.keys(SORTS) as ServiceSort[]).map((value) => (
          <Link
            key={value}
            href={buildHref({ sort: value })}
            className={cn(
              "rounded-full px-2.5 py-1 text-sm transition-colors",
              sort === value
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {SORTS[value]}
          </Link>
        ))}
      </div>

      <div className="mt-8">
        {!result.available ? (
          <Empty
            title="Services are not set up yet"
            description="Apply migration 0011_services_equipment_reviews.sql, then listings will appear here."
          />
        ) : result.services.length === 0 ? (
          <Empty
            title="No services match those filters"
            description="Try another category, or clear the filters."
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {result.total} {result.total === 1 ? "service" : "services"}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {result.services.map((service) => (
                <ServiceCard key={service.id} service={service} />
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
