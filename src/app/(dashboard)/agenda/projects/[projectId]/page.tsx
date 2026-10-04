import { notFound } from "next/navigation";
import { CalendarClock, Coins, Gauge, TrendingUp } from "lucide-react";

import { StatCard } from "@/components/agenda/shell/stat-card";
import {
  AGENDA_PROJECT_TYPES,
  daysRemaining,
  elapsedPercent,
  formatMoney,
} from "@/lib/agenda/projects";
import { getAgendaProject } from "@/lib/data/agenda-projects";

/**
 * What is happening on one project.
 *
 * The most useful thing this screen can say is the comparison between how much
 * of the programme has gone and how much has been built. A job 80% through its
 * time and 40% built is in trouble, and that sentence is invisible on any
 * dashboard that shows one number. So both are here, side by side, and neither
 * is derived from the other: elapsed time comes from the dates, progress comes
 * from what the site reported.
 */
export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const remaining = daysRemaining(project.targetCompletionDate);
  const elapsed = elapsedPercent(
    project.startDate,
    project.targetCompletionDate,
  );
  const type = AGENDA_PROJECT_TYPES.find((t) => t.value === project.type);
  const value = formatMoney(project.contractValue, project.currency);

  // Behind means more of the time has gone than of the work. Said plainly
  // rather than shown as a colour, because a colour is a hint and this is a
  // statement somebody has to act on.
  const behind =
    elapsed !== null && elapsed - project.progressPercent >= 10;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Reported progress"
          value={`${project.progressPercent}%`}
          icon={TrendingUp}
        />
        <StatCard
          label="Programme elapsed"
          value={elapsed === null ? "—" : `${elapsed}%`}
          icon={Gauge}
          hint={elapsed === null ? "Needs a start and target date" : undefined}
          tone={behind ? "attention" : "neutral"}
        />
        <StatCard
          label={remaining !== null && remaining < 0 ? "Days over" : "Days left"}
          value={remaining === null ? "—" : Math.abs(remaining)}
          icon={CalendarClock}
          tone={remaining !== null && remaining < 0 ? "attention" : "neutral"}
        />
        <StatCard
          label="Contract value"
          value={value ?? "—"}
          icon={Coins}
        />
      </div>

      {behind && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          {elapsed}% of the programme has gone and {project.progressPercent}% is
          built. This job is running behind its dates.
        </p>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border p-4">
          <p className="text-sm font-medium">Details</p>
          <dl className="grid gap-2 text-sm">
            {[
              ["Type", type?.label],
              ["Client", project.clientName],
              ["Main contractor", project.mainContractor],
              ["Location", project.location],
              ["Start", project.startDate],
              ["Target completion", project.targetCompletionDate],
            ].map(([label, shown]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right">{shown || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="space-y-2 rounded-xl border p-4">
          <p className="text-sm font-medium">About</p>
          <p className="text-sm text-muted-foreground">
            {project.description || "No description yet."}
          </p>
        </div>
      </section>
    </div>
  );
}
