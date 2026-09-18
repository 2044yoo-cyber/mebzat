import Link from "next/link";
import { CalendarClock, MapPin } from "lucide-react";

import { StatusChip } from "@/components/agenda/shell/status-chip";
import {
  AGENDA_PROJECT_STATUSES,
  AGENDA_PROJECT_TYPES,
  daysRemaining,
  formatMoney,
} from "@/lib/agenda/projects";
import type { AgendaProjectSummary } from "@/lib/data/agenda-projects";

/**
 * One project in the list.
 *
 * A card rather than a table row, because the brief is right that a desktop
 * table is unusable on a phone and this list is read on site more often than
 * at a desk. The same card works in one column and in three.
 *
 * Two progress numbers are deliberately not shown here. The card answers "what
 * is this and is it late"; the comparison between time elapsed and work done
 * belongs on the overview, where there is room to explain it.
 */
export function ProjectCard({ project }: { project: AgendaProjectSummary }) {
  const status = AGENDA_PROJECT_STATUSES.find((s) => s.value === project.status);
  const type = AGENDA_PROJECT_TYPES.find((t) => t.value === project.type);
  const remaining = daysRemaining(project.targetCompletionDate);
  const value = formatMoney(project.contractValue, project.currency);

  return (
    <Link
      href={`/agenda/projects/${project.id}`}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-brand"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{project.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[project.projectNumber, type?.label].filter(Boolean).join(" · ")}
          </p>
        </div>
        <StatusChip
          label={status?.label ?? project.status}
          tone={status?.tone ?? "neutral"}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span className="tabular-nums">{project.progressPercent}%</span>
        </div>
        {/* A bar rather than a number alone: the figure is what the site
            reported, and a reader takes in the shape faster than the digits. */}
        <div
          role="progressbar"
          aria-valuenow={project.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Reported progress"
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${project.progressPercent}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {project.location && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{project.location}</span>
          </span>
        )}
        {remaining !== null && (
          <span className="flex items-center gap-1">
            <CalendarClock className="size-3 shrink-0" />
            {remaining < 0
              ? `${Math.abs(remaining)} days over`
              : `${remaining} days left`}
          </span>
        )}
        {value && <span className="ml-auto font-medium">{value}</span>}
      </div>
    </Link>
  );
}
