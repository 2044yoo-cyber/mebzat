import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getOverview, type Metric } from "@/lib/admin/overview";

export const metadata: Metadata = { title: "Control room" };
export const dynamic = "force-dynamic";

/**
 * What is on the platform right now.
 *
 * Every figure is counted from the live tables. Where a source is absent —
 * a migration not yet applied on this deployment — the tile says so rather
 * than showing a zero, because "nothing here" and "cannot tell" lead to
 * different decisions.
 */
export default async function AdminOverviewPage() {
  const overview = await getOverview();
  if (!overview) notFound();

  return (
    <div className="space-y-6">
      <Group title="People" metrics={overview.people} />
      <Group title="Content" metrics={overview.content} />
      <Group title="Moderation" metrics={overview.moderation} />
      <Group title="Attention" metrics={overview.attention} />

      <p className="text-xs leading-relaxed text-muted-foreground">
        These are counts of live records, not estimates. A section reading
        &ldquo;unavailable&rdquo; means that table is not on this deployment —
        usually a migration that has not been run — rather than a count of zero.
      </p>
    </div>
  );
}

function Group({ title, metrics }: { title: string; metrics: Metric[] }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border p-3">
            <p className="text-2xl font-semibold tabular-nums">
              {metric.value === null ? (
                <span className="text-sm font-normal text-muted-foreground">
                  Unavailable
                </span>
              ) : (
                metric.value.toLocaleString()
              )}
            </p>
            <p className="mt-0.5 text-xs font-medium">{metric.label}</p>
            {metric.hint && (
              <p className="text-[11px] text-muted-foreground">{metric.hint}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
