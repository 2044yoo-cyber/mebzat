import Link from "next/link";
import type { Metadata } from "next";
import {
  Building2,
  ChevronRight,
  Coins,
  Landmark,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

import { DemoNotice } from "@/components/invest/demo-badge";
import { InvestProjectCard } from "@/components/invest/project-card";
import { InvestorCard } from "@/components/invest/investor-card";
import {
  INVEST_SORTS,
  compactBirr,
  isInvestSort,
  isInvestStage,
  type InvestSort,
} from "@/lib/constants/invest";
import {
  getInvestOverview,
  getInvestProjects,
  getInvestors,
} from "@/lib/data/invest";
import { cn } from "@/lib/utils";
import type { InvestStage } from "@/types/database.types";

export const metadata: Metadata = {
  title: "Medosha Invest",
  description:
    "Real estate development projects on Medosha. Demonstration data — not investment advice.",
  alternates: { canonical: "/invest" },
};

export default async function InvestPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const get = (key: string) => (Array.isArray(sp[key]) ? sp[key][0] : sp[key]);

  // Narrowed through the guards rather than asserted, so an unknown value in
  // the URL falls back instead of reaching the query.
  const sortParam = get("sort");
  const sort: InvestSort = isInvestSort(sortParam) ? sortParam : "funding";
  const stageParam = get("stage");
  const stage: InvestStage | undefined = isInvestStage(stageParam)
    ? stageParam
    : undefined;

  const [overview, { projects, available }, { investors }] = await Promise.all([
    getInvestOverview(),
    getInvestProjects({ sort, stage }),
    getInvestors(6),
  ]);

  return (
    <div className="container-page space-y-10 py-8">
      {/* ---- Header -------------------------------------------------- */}
      <header className="space-y-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Landmark className="size-4" />
          Medosha Invest
        </div>

        <div className="max-w-3xl">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Invest in real estate development projects
          </h1>
          <p className="mt-3 text-balance text-lg text-muted-foreground">
            Developments across Addis Ababa, with their funding, construction
            progress and reporting in one place — connected to the suppliers,
            professionals and material prices behind them.
          </p>
        </div>

        <DemoNotice demo={overview?.demo_only ?? true} />
      </header>

      {/* ---- Overview ------------------------------------------------ */}
      {overview && (
        <section aria-label="Overview">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <OverviewStat
              icon={<Building2 className="size-4" />}
              label="Active projects"
              value={overview.active_projects.toLocaleString()}
            />
            <OverviewStat
              icon={<Coins className="size-4" />}
              label="Total funding"
              value={compactBirr(Number(overview.total_goal))}
            />
            <OverviewStat
              icon={<TrendingUp className="size-4" />}
              label="Funding progress"
              value={`${Number(overview.funding_pct)}%`}
              accent
            />
            <OverviewStat
              icon={<TrendingUp className="size-4" />}
              label="Average expected ROI"
              value={`${Number(overview.avg_roi)}%`}
            />
            <OverviewStat
              icon={<Users className="size-4" />}
              label="Total investors"
              value={overview.total_investors.toLocaleString()}
            />
          </dl>
        </section>
      )}

      {/* ---- Projects ------------------------------------------------ */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Projects</h2>

          <nav aria-label="Sort" className="flex flex-wrap gap-1.5">
            {INVEST_SORTS.map((option) => (
              <Link
                key={option.value}
                href={
                  option.value === "funding"
                    ? "/invest"
                    : `/invest?sort=${option.value}`
                }
                aria-current={option.value === sort ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  option.value === sort
                    ? "border-brand bg-brand/10 text-brand"
                    : "text-muted-foreground hover:border-brand hover:text-foreground",
                )}
              >
                {option.label}
              </Link>
            ))}
          </nav>
        </div>

        {!available ? (
          <EmptyState
            title="Medosha Invest is not set up yet"
            body="The investment tables have not been created on this database. Apply migrations 0019 and 0020, in that order, and the projects will appear here."
          />
        ) : projects.length === 0 ? (
          <EmptyState
            title="No projects match that filter"
            body="Try a different sort, or view every project."
            action={{ href: "/invest", label: "View all projects" }}
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <InvestProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>

      {/* ---- Investors ----------------------------------------------- */}
      {investors.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight">Investors</h2>
            <Link
              href="/invest/investors"
              className="flex items-center gap-1 text-sm font-medium text-brand hover:underline"
            >
              All investors
              <ChevronRight className="size-3.5" />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {investors.map((investor) => (
              <InvestorCard key={investor.id} investor={investor} />
            ))}
          </div>
        </section>
      )}

      {/* ---- Cross-links --------------------------------------------- */}
      <section className="rounded-2xl border p-5">
        <h2 className="flex items-center gap-2 font-medium">
          <Sparkles className="size-4 text-brand" />
          Everything behind a development
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A project is not just a number. These are the parts of Medosha that
          price it, build it and staff it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { href: "/price-exchange", label: "Material prices" },
            { href: "/companies", label: "Developers & contractors" },
            { href: "/directory/individual", label: "Architects & engineers" },
            { href: "/marketplace", label: "Materials & products" },
            { href: "/city", label: "See it on the 3D city map" },
            { href: "/ai?agent=cost", label: "AI cost estimate" },
            { href: "/services", label: "Trades & services" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function OverviewStat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        accent && "border-brand/40 bg-brand/5",
      )}
    >
      <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-2xl font-semibold tracking-tight tabular-nums",
          accent && "text-brand",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-2xl border border-dashed p-12 text-center">
      <Landmark className="mx-auto size-7 text-muted-foreground" />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {body}
      </p>
      {action && (
        <Link
          href={action.href}
          className="mt-4 inline-block text-sm font-medium text-brand hover:underline"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
