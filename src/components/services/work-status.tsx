import { WORK_STATUS } from "@/lib/constants/services";
import { cn } from "@/lib/utils";
import type { WorkStatus } from "@/types/database.types";

/**
 * Live availability.
 *
 * A coloured dot and a word, because the first question a client has is "can
 * you start" and that answer has to survive being read at a glance in a list.
 */
export function WorkStatusDot({
  status,
  className,
  showLabel = true,
}: {
  status: WorkStatus;
  className?: string;
  showLabel?: boolean;
}) {
  const entry = WORK_STATUS[status];

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-sm", entry.text, className)}
      title={entry.blurb}
    >
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", entry.dot)}
      />
      {showLabel && entry.label}
      <span className="sr-only">{entry.blurb}</span>
    </span>
  );
}

/**
 * The fuller availability panel: status, workload, capacity and next free date.
 *
 * Capacity is only shown when the provider set one — an unbounded provider
 * showing "3 of null" would be worse than showing nothing.
 */
export function WorkStatusPanel({
  status,
  activeProjects,
  capacityProjects,
  nextAvailableOn,
  responseMinutes,
  completionDays,
  className,
}: {
  status: WorkStatus;
  activeProjects?: number | null;
  capacityProjects?: number | null;
  nextAvailableOn?: string | null;
  responseMinutes?: number | null;
  completionDays?: number | null;
  className?: string;
}) {
  const entry = WORK_STATUS[status];
  const remaining =
    capacityProjects != null && activeProjects != null
      ? Math.max(0, capacityProjects - activeProjects)
      : null;

  return (
    <div className={cn("rounded-2xl border p-4", className)}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn("size-2.5 shrink-0 rounded-full", entry.dot)}
        />
        <p className={cn("font-medium", entry.text)}>{entry.label}</p>
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">{entry.blurb}</p>

      <dl className="mt-3 space-y-1.5 border-t pt-3 text-sm">
        {activeProjects != null && (
          <Row label="Projects in progress" value={String(activeProjects)} />
        )}
        {remaining !== null && (
          <Row
            label="Capacity remaining"
            value={`${remaining} of ${capacityProjects}`}
          />
        )}
        {nextAvailableOn && (
          <Row
            label="Next available"
            value={new Date(nextAvailableOn).toLocaleDateString()}
          />
        )}
        {completionDays != null && (
          <Row label="Typical completion" value={`${completionDays} days`} />
        )}
        {responseMinutes != null && (
          <Row
            label="Average response"
            value={
              responseMinutes < 60
                ? `${responseMinutes} min`
                : responseMinutes < 60 * 24
                  ? `${Math.round(responseMinutes / 60)} hours`
                  : `${Math.round(responseMinutes / (60 * 24))} days`
            }
          />
        )}
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
