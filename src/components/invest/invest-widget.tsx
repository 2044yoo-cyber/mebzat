import Link from "next/link";
import { ArrowRight, Landmark, TrendingUp, Users } from "lucide-react";

import { DemoBadge } from "@/components/invest/demo-badge";
import { DEMO_NOTICE_SHORT, compactBirr } from "@/lib/constants/invest";
import { getInvestOverview, getInvestProjects } from "@/lib/data/invest";
import { cn } from "@/lib/utils";

/**
 * Medosha Invest, in the shell's right-hand column on the homepage.
 *
 * The "homepage sidebar" in a workspace shell is the context panel, so this is
 * where the widget lives rather than bolted onto a page the owner asked not to
 * redesign. It is a server component: the numbers come from one RPC and the
 * panel renders them, with no client-side fetch and nothing to hydrate.
 */
export async function InvestWidget() {
  const [overview, { projects }] = await Promise.all([
    getInvestOverview(),
    getInvestProjects({ sort: "progress", limit: 3 }),
  ]);

  // Nothing to show before the migration runs. Silence beats an empty frame.
  if (!overview || Number(overview.total_goal) === 0) return null;

  const fundingPct = Number(overview.funding_pct);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <span aria-hidden>🏗</span>
          Medosha Invest
        </h2>
        <DemoBadge demo={overview.demo_only} size="sm" className="ml-auto" />
      </div>

      <p className="text-sm text-muted-foreground">
        Invest in real estate development projects
      </p>

      <div className="rounded-2xl border p-3">
        <dl className="grid grid-cols-2 gap-3">
          <Stat
            label="Active projects"
            value={overview.active_projects.toLocaleString()}
          />
          <Stat
            label="Total funding"
            value={compactBirr(Number(overview.total_goal))}
          />
          <Stat
            label="Expected ROI"
            value={`${Number(overview.avg_roi)}%`}
            icon={<TrendingUp className="size-3" />}
          />
          <Stat
            label="Investors"
            value={overview.total_investors.toLocaleString()}
            icon={<Users className="size-3" />}
          />
        </dl>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">Funding progress</span>
            <span className="font-semibold text-brand tabular-nums">
              {fundingPct}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={fundingPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Overall funding progress"
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${fundingPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* A miniature of each project's funding, so the widget shows the shape
          of the portfolio rather than one aggregate number. */}
      {projects.length > 0 && (
        <ul className="space-y-2">
          {projects.map((project) => {
            const pct = Math.min(
              100,
              Math.round(
                (Number(project.funding_raised) /
                  Math.max(1, Number(project.funding_goal))) *
                  100,
              ),
            );
            return (
              <li key={project.id}>
                <Link
                  href={`/invest/${project.slug}`}
                  className="block rounded-xl border p-2.5 transition-colors hover:border-brand"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {project.title}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-semibold tabular-nums",
                        pct >= 100
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-brand",
                      )}
                    >
                      {pct}%
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {project.location} ·{" "}
                    {compactBirr(
                      Number(project.funding_goal),
                      project.currency,
                    )}
                  </p>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        pct >= 100 ? "bg-emerald-500" : "bg-brand",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href="/invest"
        className="flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
      >
        <Landmark className="size-3.5" />
        Explore Investments
        <ArrowRight className="size-3.5" />
      </Link>

      {overview.demo_only && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {DEMO_NOTICE_SHORT}
        </p>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
