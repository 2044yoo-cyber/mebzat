import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { CompanyCard } from "@/components/companies/company-card";
import { CompanyFilters } from "@/components/companies/company-filters";
import { Pagination } from "@/components/ui/pagination";
import { getCompanies } from "@/lib/data/companies";

export const metadata: Metadata = {
  title: "Companies — Construction businesses directory",
  description:
    "Discover construction companies, suppliers, and firms on Medosha. Claim your business to manage its profile.",
};

const PAGE_SIZE = 24;

export default async function CompaniesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);

  const q = get("q") ?? "";
  const claimedParam = get("claimed") ?? "";
  const claimed =
    claimedParam === "true" ? true : claimedParam === "false" ? false : undefined;
  const page = Math.max(1, Number(get("page")) || 1);

  const result = await getCompanies({ q, claimed, page, pageSize: PAGE_SIZE });

  function makeHref(nextPage: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (claimedParam) params.set("claimed", claimedParam);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/companies?${qs}` : "/companies";
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="size-4" /> Companies
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Construction businesses
        </h1>
        <p className="mt-1 text-muted-foreground">
          Discover firms and suppliers across the network. Own one? Claim it to
          manage its profile.
        </p>
      </div>

      <CompanyFilters current={{ q, claimed: claimedParam }} />

      <div className="mt-6">
        {!result.available ? (
          <EmptyState
            title="The directory is being set up"
            description="Businesses will appear here soon."
          />
        ) : result.companies.length === 0 ? (
          <EmptyState
            title="No businesses found"
            description={
              q || claimedParam
                ? "Try adjusting your search or filters."
                : "Businesses will appear here as they're added."
            }
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {result.total} {result.total === 1 ? "business" : "businesses"}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.companies.map((company) => (
                <CompanyCard key={company.id} company={company} />
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

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-16 text-center">
      <Building2 className="size-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
