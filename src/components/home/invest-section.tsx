import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Coins,
  Landmark,
  TrendingUp,
  Users,
} from "lucide-react";

import { DemoBadge } from "@/components/invest/demo-badge";
import { InvestProjectCard } from "@/components/invest/project-card";
import { DEMO_NOTICE, compactBirr } from "@/lib/constants/invest";
import { getInvestOverview, getInvestProjects } from "@/lib/data/invest";
import { cn } from "@/lib/utils";

/**
 * Medosha Invest on the homepage.
 *
 * Sits below the property band, because someone who has just looked at what
 * they could buy is the person most likely to care about what is being built.
 *
 * A full-width band rather than the sidebar widget reused at a larger size:
 * the widget is designed for a 340px column and its stacked stats look thin
 * across 1200px. Both read from the same data functions, so the numbers cannot
 * disagree — only the layout differs.
 *
 * Renders nothing at all until there is something to show, so the homepage is
 * unchanged on a database where migration 0019 has not been applied.
 */
export async function InvestSection() {
  const [overview, { projects }] = await Promise.all([
    getInvestOverview(),
    getInvestProjects({ sort: "progress", limit: 3 }),
  ]);

  if (!overview || projects.length === 0) return null;

  return (
    <section className="border-b bg-muted/20">
      <div className="container-page py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
              <Landmark className="size-3 text-brand" />
              Medosha Invest
              <DemoBadge demo={overview.demo_only} size="sm" />
            </span>

            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              🏗 Invest in real estate and earn ROI
            </h2>
            <p className="mt-3 text-balance text-lg text-muted-foreground">
              Developments across Addis Ababa, with their funding, construction
              progress and reporting in one place.
            </p>
            {/* The headline names a return, so the qualifier sits with it
                rather than further down the page where it can be scrolled
                past. Expected is not promised, and these are samples. */}
            {overview.demo_only && (
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                Expected returns shown are illustrative figures on sample
                projects, not a forecast and not a guarantee.
              </p>
            )}
          </div>

          <Link
            href="/invest"
            className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
          >
            Invest in real estate
            <ArrowRight className="size-4" />
          </Link>
        </div>

        {/* The five headline numbers. */}
        <dl className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat
            icon={<Building2 className="size-4" />}
            label="Active projects"
            value={overview.active_projects.toLocaleString()}
          />
          <Stat
            icon={<Coins className="size-4" />}
            label="Total funding"
            value={compactBirr(Number(overview.total_goal))}
          />
          <Stat
            icon={<TrendingUp className="size-4" />}
            label="Funding progress"
            value={`${Number(overview.funding_pct)}%`}
            bar={Number(overview.funding_pct)}
            accent
          />
          <Stat
            icon={<TrendingUp className="size-4" />}
            label="Expected ROI"
            value={`${Number(overview.avg_roi)}%`}
          />
          <Stat
            icon={<Users className="size-4" />}
            label="Total investors"
            value={overview.total_investors.toLocaleString()}
          />
        </dl>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <InvestProjectCard
              key={project.id}
              project={project}
              className="bg-background"
            />
          ))}
        </div>

        {overview.demo_only && (
          <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {DEMO_NOTICE}
          </p>
        )}
      </div>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  bar,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bar?: number;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-background p-4",
        accent && "border-brand/40",
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
      {bar !== undefined && (
        <div
          role="progressbar"
          aria-valuenow={bar}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${bar}%` }}
          />
        </div>
      )}
    </div>
  );
}
