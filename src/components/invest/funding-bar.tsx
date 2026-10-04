import { compactBirr, fundingPct } from "@/lib/constants/invest";
import { cn } from "@/lib/utils";

/**
 * Funding and construction, as two bars over the same track width.
 *
 * They are shown together because a project that is fully funded and barely
 * built is a different proposition from one that is half funded and nearly
 * finished, and one number alone hides that.
 */
export function FundingBar({
  raised,
  goal,
  currency = "ETB",
  construction,
  className,
  compact,
}: {
  raised: number;
  goal: number;
  currency?: string;
  construction?: number;
  className?: string;
  compact?: boolean;
}) {
  const pct = fundingPct(raised, goal);
  const build = construction ?? null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium tabular-nums">
          {compactBirr(raised, currency)}
          <span className="font-normal text-muted-foreground">
            {" "}
            of {compactBirr(goal, currency)}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 font-semibold tabular-nums",
            pct >= 100 ? "text-emerald-600 dark:text-emerald-400" : "text-brand",
          )}
        >
          {pct}%
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Funding progress"
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            pct >= 100 ? "bg-emerald-500" : "bg-brand",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {build !== null && !compact && (
        <>
          <div className="flex items-baseline justify-between gap-2 pt-1 text-xs text-muted-foreground">
            <span>Construction</span>
            <span className="tabular-nums">{Math.round(build)}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.round(build)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Construction progress"
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-foreground/50 transition-[width] duration-500"
              style={{ width: `${build}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}
