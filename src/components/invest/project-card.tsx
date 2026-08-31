import Image from "next/image";
import Link from "next/link";
import { Clock, MapPin, TrendingUp, Users } from "lucide-react";

import { DemoBadge } from "@/components/invest/demo-badge";
import { FundingBar } from "@/components/invest/funding-bar";
import { PROJECT_PLACEHOLDER } from "@/lib/constants/placeholders";
import { INVEST_RISK, INVEST_STAGE } from "@/lib/constants/invest";
import { cn } from "@/lib/utils";
import type { InvestProject } from "@/types/database.types";

/**
 * One development in the index grid.
 *
 * Built from the same shapes as the marketplace and property cards — same
 * radius, same border, same hover — so the module reads as part of Medosha
 * rather than a bolted-on section.
 */
export function InvestProjectCard({
  project,
  className,
}: {
  project: InvestProject;
  className?: string;
}) {
  const risk = INVEST_RISK[project.risk_level];
  const stage = INVEST_STAGE[project.stage];

  return (
    <Link
      href={`/invest/${project.slug}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border transition-colors hover:border-brand",
        className,
      )}
    >
      <div className="relative aspect-[16/10] bg-muted">
        <Image
          src={project.hero_image_url || PROJECT_PLACEHOLDER}
          alt=""
          fill
          sizes="(min-width: 1280px) 380px, (min-width: 768px) 45vw, 90vw"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />

        <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          <DemoBadge demo={project.is_demo} />
          <span className="rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium backdrop-blur">
            {stage.label}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="leading-snug font-semibold">{project.title}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            {project.location}
          </p>
        </div>

        <FundingBar
          raised={project.funding_raised}
          goal={project.funding_goal}
          currency={project.currency}
          construction={project.construction_pct}
        />

        <dl className="mt-auto grid grid-cols-3 gap-2 border-t pt-3 text-center">
          <Stat
            icon={<TrendingUp className="size-3" />}
            label="Expected"
            value={
              project.expected_roi_pct === null
                ? "—"
                : `${Number(project.expected_roi_pct)}%`
            }
          />
          <Stat
            icon={<Clock className="size-3" />}
            label="Duration"
            value={
              project.duration_months ? `${project.duration_months}mo` : "—"
            }
          />
          <Stat
            icon={<Users className="size-3" />}
            label="Backers"
            value={project.investor_count.toLocaleString()}
          />
        </dl>

        <span
          className={cn(
            "inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
            risk.chip,
          )}
        >
          <span aria-hidden className={cn("size-1.5 rounded-full", risk.dot)} />
          {risk.label}
        </span>
      </div>
    </Link>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
