import type { Metadata } from "next";
import { PackageOpen, Truck } from "lucide-react";

import { EquipmentCard } from "@/components/equipment/equipment-card";
import { EquipmentFilters } from "@/components/equipment/equipment-filters";
import { Pagination } from "@/components/ui/pagination";
import {
  PAGE_SIZE,
  getEquipment,
  getEquipmentFacets,
  type EquipmentSort,
} from "@/lib/data/equipment";

export const metadata: Metadata = {
  title: "Equipment Rental — Machinery and tools for hire",
  description:
    "Hire excavators, mixers, scaffolding, generators and site tools from owners across Ethiopia. Daily, weekly and monthly rates.",
};

export const dynamic = "force-dynamic";

const SORTS: EquipmentSort[] = ["cheapest", "priciest", "rating", "newest"];

function isSort(value: unknown): value is EquipmentSort {
  return SORTS.includes(value as EquipmentSort);
}

export default async function EquipmentPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const get = (key: string) => (Array.isArray(sp[key]) ? sp[key][0] : sp[key]);

  const q = get("q") ?? "";
  const category = get("category") ?? "";
  const city = get("city") ?? "";
  const availableOnly = get("available") === "1";
  const withOperator = get("operator") === "1";
  const sortParam = get("sort");
  const sort: EquipmentSort = isSort(sortParam) ? sortParam : "cheapest";
  const page = Math.max(1, Number(get("page")) || 1);

  const [result, facets] = await Promise.all([
    getEquipment({
      q,
      category: category || undefined,
      city: city || undefined,
      availableOnly,
      withOperator,
      sort,
      page,
    }),
    getEquipmentFacets(),
  ]);

  function makeHref(nextPage: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (city) params.set("city", city);
    if (availableOnly) params.set("available", "1");
    if (withOperator) params.set("operator", "1");
    if (sort !== "cheapest") params.set("sort", sort);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/equipment?${qs}` : "/equipment";
  }

  return (
    <div className="container-page py-10">
      <header className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Truck className="size-4" /> Equipment Rental
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Machinery and tools for hire
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Excavators, mixers, scaffolding, generators and site tools — by the
          day, the week or the month, with or without an operator.
        </p>
      </header>

      <EquipmentFilters
        categories={facets.categories}
        cities={facets.cities}
        current={{ q, category, city, availableOnly, withOperator, sort }}
      />

      <div className="mt-6">
        {!result.available ? (
          <Empty
            icon={<Truck className="size-8" />}
            title="Equipment rental is not set up yet"
            description="Apply migration 0011_services_equipment_reviews.sql, then listings will appear here."
          />
        ) : result.items.length === 0 ? (
          <Empty
            icon={<PackageOpen className="size-8" />}
            title="No equipment matches those filters"
            description={
              q || category || city
                ? "Try a broader search or clear the filters."
                : "Be the first to list machinery for hire."
            }
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {result.total} {result.total === 1 ? "listing" : "listings"}
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {result.items.map((item) => (
                <EquipmentCard key={item.id} item={item} />
              ))}
            </div>
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
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-16 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
